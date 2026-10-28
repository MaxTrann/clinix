// Kịch bản chạy đua NHIỀU TÀI KHOẢN khác nhau cùng lúc cho từng thao tác của OtpService (task A5 phát hiện lỗi deadlock chéo tài khoản
// của A2: test đồng thời cũ của A2 chỉ thử cùng một tài khoản nên được khoá tài khoản xếp hàng sẵn). Dùng trong
// otp.service.multi-account.int-spec.ts; đo bằng số lỗi MySQL THẬT (1213 deadlock, 1205 hết thời gian chờ khoá).
import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { resetTables } from '../../database/testing/test-database.js';
import { MailSendError } from '../../mail/mail-send.error.js';
import { MailService, type MailMessage } from '../../mail/mail.service.js';
import { insertMaXacThuc } from '../entities/testing/auth-fixtures.js';
import { OtpDeliveryError } from '../otp/otp-errors.js';
import {
  at,
  createOtpFixture,
  forgotInput,
  issueOk,
  newUnverifiedAccount,
  recipientOf,
  registerInput,
  wrongCodeFor,
} from './otp-int-helpers.js';
import { readOtpFromMail } from './otp-test-helpers.js';

/** MailService giả: thư gửi tới địa chỉ trong `failFor` thì lỗi (nhánh gửi lỗi của pha 2), còn lại thành công. */
export class SelectiveMail extends MailService {
  readonly attempts: MailMessage[] = [];
  readonly failFor = new Set<string>();

  send(message: MailMessage): Promise<void> {
    this.attempts.push(message);
    return this.failFor.has(message.to)
      ? Promise.reject(new MailSendError('CONNECTION'))
      : Promise.resolve();
  }

  codeSentTo(email: string): string {
    const mail = [...this.attempts].reverse().find((m) => m.to === email);
    if (!mail) throw new Error('chưa có thư cho địa chỉ này');
    return readOtpFromMail(mail);
  }
}

export type MultiOp =
  | 'issue' // OtpService.issue, giao dịch riêng của OtpService
  | 'issue-in-caller-tx' // OtpService.issue trong giao dịch của người gọi (cách A5 dùng)
  | 'deliver' // pha 2: ghi kết quả gửi (cả nhánh thành công lẫn gửi lỗi)
  | 'verify' // xác minh mã đúng/sai trên hàng MỚI NHẤT, trong lúc tài khoản khác cấp mã
  | 'consume' // đánh dấu đã dùng trong giao dịch của người gọi, trong lúc tài khoản khác cấp mã
  | 'reissue'; // gửi lại trong giao dịch của người gọi, trong lúc tài khoản khác cấp mã

export const MULTI_OPS: readonly MultiOp[] = [
  'issue',
  'issue-in-caller-tx',
  'deliver',
  'verify',
  'consume',
  'reissue',
];

/**
 * Cách người gọi mở giao dịch cho thao tác nhận `manager` (issue/reissue/consume):
 *  - 'otp-transaction' (mặc định, cách dùng chuẩn): `OtpService.transaction` (READ COMMITTED, đọc không khoá);
 *  - 'repeatable-read': giao dịch thô của DataSource (đối chứng khi đo: đúng nhưng dễ deadlock chéo tài khoản).
 */
export type CallerTx = 'otp-transaction' | 'repeatable-read';

export interface Tally {
  requests: number;
  ok: number;
  deadlock1213: number;
  lockTimeout1205: number;
  other: Record<string, number>;
}

export function classify(
  tally: Tally,
  result: PromiseSettledResult<unknown>,
): void {
  tally.requests += 1;
  if (result.status === 'fulfilled') {
    tally.ok += 1;
    return;
  }
  const reason: unknown = result.reason;
  if (reason instanceof OtpDeliveryError) {
    tally.ok += 1; // gửi lỗi theo kịch bản là kết quả ĐÚNG của nhánh "gửi lỗi", không phải lỗi DB
    return;
  }
  const errno = (reason as { driverError?: { errno?: number } }).driverError
    ?.errno;
  if (errno === 1213) tally.deadlock1213 += 1;
  else if (errno === 1205) tally.lockTimeout1205 += 1;
  else {
    const key =
      reason instanceof Error ? `${reason.name}: ${reason.message}` : 'lạ';
    tally.other[key] = (tally.other[key] ?? 0) + 1;
  }
}

export function barrier(parties: number): () => Promise<void> {
  let arrived = 0;
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return () => {
    arrived += 1;
    if (arrived >= parties) open();
    return gate;
  };
}

/**
 * Chạy `rounds` vòng; mỗi vòng dựng lại DB, tạo `parties` tài khoản rồi cho `parties` thao tác `op` chạy ĐỒNG THỜI (cùng qua một rào chắn).
 * Với verify/consume/reissue có thêm 2 yêu cầu `issue` cho tài khoản mới chạy song song (kịch bản thật: người khác đang đăng ký).
 * Người gọi phải bật đồng hồ giả (`vi.useFakeTimers({ toFake: ['Date'] })`) trước. Trả bảng đếm kết quả/lỗi MySQL.
 */
export async function runMultiAccountScenario(
  db: DataSource,
  op: MultiOp,
  options: { rounds: number; parties?: number; callerTx?: CallerTx },
): Promise<Tally> {
  const parties = options.parties ?? 6;
  const callerTx = options.callerTx ?? 'otp-transaction';
  const tally: Tally = {
    requests: 0,
    ok: 0,
    deadlock1213: 0,
    lockTimeout1205: 0,
    other: {},
  };

  for (let round = 0; round < options.rounds; round++) {
    await resetTables(db);
    vi.setSystemTime(at(0));
    const mail = new SelectiveMail();
    const fx = createOtpFixture(db, mail);
    const accounts = [];
    for (let i = 0; i < parties; i++) {
      accounts.push(
        await newUnverifiedAccount(db, {
          email: `chay.dua.${String(i)}@example.com`,
        }),
      );
    }
    const spare = [
      await newUnverifiedAccount(db, { email: 'ban.dang.dk.1@example.com' }),
      await newUnverifiedAccount(db, { email: 'ban.dang.dk.2@example.com' }),
    ];
    const openTx = <T>(work: (em: EntityManager) => Promise<T>): Promise<T> =>
      callerTx === 'otp-transaction'
        ? fx.otp.transaction(work)
        : db.transaction(work);
    const background = (): (() => Promise<unknown>)[] =>
      spare.map((a) => () => fx.otp.issue(registerInput(a.taiKhoanId)));

    let actions: (() => Promise<unknown>)[] = [];

    if (op === 'issue' || op === 'issue-in-caller-tx') {
      // một nửa tài khoản mới tinh (chưa có hàng nào), một nửa đã có hàng cũ quá 60 giây
      for (const [i, account] of accounts.entries()) {
        if (i % 2 === 1) {
          await insertMaXacThuc(db, account.taiKhoanId, {
            taoLuc: at(-120),
            daGuiLuc: at(-120),
          });
        }
      }
      actions = accounts.map((account) =>
        op === 'issue'
          ? () => fx.otp.issue(registerInput(account.taiKhoanId))
          : () =>
              openTx((em) =>
                fx.otp.issue(registerInput(account.taiKhoanId), {
                  manager: em,
                }),
              ),
      );
    } else if (op === 'deliver') {
      // mỗi tài khoản có một mã cũ đã gửi; mã mới đã qua pha 1; một nửa sẽ gửi lỗi
      const issuedNew = [];
      for (const account of accounts) {
        const first = await issueOk(fx.otp, registerInput(account.taiKhoanId));
        await fx.otp.deliver(first, recipientOf(account));
      }
      vi.setSystemTime(at(61));
      for (const [i, account] of accounts.entries()) {
        if (i % 2 === 1) mail.failFor.add(account.email);
        issuedNew.push({
          account,
          issued: await issueOk(fx.otp, registerInput(account.taiKhoanId)),
        });
      }
      actions = issuedNew.map(
        ({ account, issued }) =>
          () =>
            fx.otp.deliver(issued, recipientOf(account)),
      );
    } else {
      // verify / consume / reissue: mỗi tài khoản có đúng MỘT mã đã gửi (cũng là hàng mới nhất của bảng)
      const kind = op === 'consume' ? 'QuenMatKhau' : 'DangKy';
      const sent = [];
      for (const account of accounts) {
        const issued = await issueOk(
          fx.otp,
          kind === 'DangKy'
            ? registerInput(account.taiKhoanId)
            : forgotInput(account.taiKhoanId),
        );
        await fx.otp.deliver(issued, recipientOf(account));
        sent.push({
          account,
          id: issued.maXacThucId,
          code: mail.codeSentTo(account.email),
        });
      }
      if (op === 'reissue') vi.setSystemTime(at(61));
      if (op === 'verify') {
        actions = sent.map(
          ({ account, id, code }, i) =>
            () =>
              fx.otp.verify(
                {
                  maXacThucId: id,
                  loai: 'DangKy',
                  otp: i % 2 === 0 ? code : wrongCodeFor(code),
                  expectedTaiKhoanId: account.taiKhoanId,
                },
                { consume: i % 2 === 0 },
              ),
        );
      } else if (op === 'consume') {
        actions = sent.map(
          ({ account, id }) =>
            () =>
              openTx((em) =>
                fx.otp.consume(
                  {
                    maXacThucId: id,
                    taiKhoanId: account.taiKhoanId,
                    loai: 'QuenMatKhau',
                  },
                  { manager: em },
                ),
              ),
        );
      } else {
        actions = sent.map(
          ({ id }) =>
            () =>
              openTx((em) =>
                fx.otp.reissue({ maXacThucId: id }, { manager: em }),
              ),
        );
      }
      actions.push(...background());
    }

    const wait = barrier(actions.length);
    const results = await Promise.allSettled(
      actions.map(async (action) => {
        await wait();
        return action();
      }),
    );
    for (const result of results) classify(tally, result);
  }
  return tally;
}

/** Dòng tóm tắt dễ đọc cho thông điệp lỗi và báo cáo. */
export function describeTally(op: string, tally: Tally): string {
  const others = Object.entries(tally.other)
    .map(([key, count]) => `${key} ×${String(count)}`)
    .join('; ');
  return `${op}: ${String(tally.requests)} yêu cầu, ${String(tally.ok)} đúng, deadlock 1213 = ${String(tally.deadlock1213)}, hết thời gian chờ khoá 1205 = ${String(tally.lockTimeout1205)}${others ? `, lỗi khác: ${others}` : ''}`;
}
