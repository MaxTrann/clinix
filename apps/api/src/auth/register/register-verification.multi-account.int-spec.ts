import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { resetTables } from '../../database/testing/test-database.js';
import type { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  at,
  issueOk,
  newUnverifiedAccount,
  recipientOf,
  registerInput,
  rowsOf,
  wrongCodeFor,
} from '../testing/otp-int-helpers.js';
import {
  SelectiveMail,
  barrier,
  classify,
  describeTally,
  type Tally,
} from '../testing/otp-multi-account.js';
import { accountByEmail } from '../testing/register-int-helpers.js';
import {
  createVerificationFixture,
  patientRows,
  resendBody,
  serverDeadlocks,
  verifyBody,
  walletRows,
  type VerificationFixture,
} from '../testing/verification-int-helpers.js';

// Task A6 — NHIỀU tài khoản KHÁC NHAU xác minh / gửi lại ĐỒNG THỜI, mỗi tài khoản một giao dịch riêng, trên MySQL 8.4 thật. Cùng lý do với
// A5-C: test đồng thời cùng một tài khoản (register-verification.concurrency) không thấy deadlock chéo tài khoản vì khoá tài khoản đã xếp
// hàng sẵn. Đo bằng số lỗi MySQL THẬT: lỗi trả ra (1213, 1205) VÀ bộ đếm `lock_deadlocks` của máy chủ (bắt cả deadlock bị thử lại âm thầm).
// Mã XM-Mnn / GL-Mnn là [đề xuất].
//  - `verify` luôn tự mở giao dịch READ COMMITTED bên trong OtpService (người gọi không chọn được), nên không có biến thể "giao dịch thô":
//    khẳng định 0 lỗi 1213/1205 và 0 deadlock phía máy chủ ở mọi kịch bản.
//  - `resend` mở giao dịch bằng `otp.transaction` (READ COMMITTED): khẳng định 0. Đối chứng THÔ (REPEATABLE READ, cùng các lệnh) CHỈ khẳng định
//    kết quả nhất quán và in số đo: 0 trong N vòng chưa phải bằng chứng về cơ chế, nhưng số đo cho thấy vì sao bắt buộc dùng `otp.transaction`.
// Số vòng chỉnh bằng biến môi trường VERIFY_MULTI_ROUNDS (mặc định 8; khi đo kỹ dùng 50 và chạy với --reporter=verbose để thấy dòng "[XM-M]").
const ROUNDS = Number(process.env['VERIFY_MULTI_ROUNDS'] ?? 8);
const PARTIES = 6;

let db: DataSource;
let fx: VerificationFixture<SelectiveMail>;

useIntegrationHooks((testDb) => {
  db = testDb;
});

type Scenario = 'verify' | 'resend' | 'verify-and-resend' | 'resend-raw-rr';
const SCENARIOS: readonly Scenario[] = [
  'verify',
  'resend',
  'verify-and-resend',
  'resend-raw-rr',
];

interface Party {
  account: TaiKhoan;
  id: string;
  code: string;
}

interface Measured {
  tally: Tally;
  serverDeadlocks: number;
  inconsistent: string[];
}

/** Từ chối nghiệp vụ DỰ KIẾN của kịch bản (mã sai ⇒ OTP_SAI) tính là kết quả đúng, không phải lỗi. */
const tolerateWrongCode =
  (work: () => Promise<unknown>) => async (): Promise<unknown> => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof AppException && error.maLoi === 'OTP_SAI') return;
      throw error;
    }
  };

async function seedRound(): Promise<{ parties: Party[]; spare: TaiKhoan[] }> {
  await resetTables(db);
  vi.setSystemTime(at(0));
  const mail = new SelectiveMail();
  fx = createVerificationFixture(db, mail);
  const parties: Party[] = [];
  for (let i = 0; i < PARTIES; i++) {
    // thoiDiemTao theo đồng hồ giả (mặc định là NOW() của DB, lệch xa đồng hồ giả nên bị coi là quá 24 giờ)
    const account = await newUnverifiedAccount(db, {
      email: `chay.dua.${String(i)}@example.com`,
      thoiDiemTao: at(0),
    });
    const issued = await issueOk(fx.otp, registerInput(account.taiKhoanId));
    await fx.otp.deliver(issued, recipientOf(account));
    parties.push({
      account,
      id: issued.maXacThucId,
      code: mail.codeSentTo(account.email),
    });
  }
  // hai tài khoản KHÁC đang đăng ký cùng lúc (kịch bản thật: người khác đăng ký trong lúc có người xác minh)
  const spare = [
    await newUnverifiedAccount(db, {
      email: 'ban.dang.dk.1@example.com',
      thoiDiemTao: at(0),
    }),
    await newUnverifiedAccount(db, {
      email: 'ban.dang.dk.2@example.com',
      thoiDiemTao: at(0),
    }),
  ];
  return { parties, spare };
}

// Gửi lại ĐÚNG các lệnh của RegisterVerificationService.resendOtp nhưng trong giao dịch THÔ (REPEATABLE READ): đối chứng, không phải mã sản xuất
const resendInRawTransaction = (party: Party): Promise<unknown> =>
  db.transaction('REPEATABLE READ', async (em) => {
    const result = await fx.otp.reissue(
      { maXacThucId: party.id, expectedTaiKhoanId: party.account.taiKhoanId },
      { manager: em },
    );
    if (!result.ok)
      throw new Error(`gửi lại bị từ chối: ${result.failure.reason}`);
    await fx.accounts.findByIdForUpdate(em, party.account.taiKhoanId);
    return result.issued;
  });

async function measure(scenario: Scenario): Promise<Measured> {
  const tally: Tally = {
    requests: 0,
    ok: 0,
    deadlock1213: 0,
    lockTimeout1205: 0,
    other: {},
  };
  const measured: Measured = { tally, serverDeadlocks: 0, inconsistent: [] };
  const before = await serverDeadlocks(db);

  for (let round = 0; round < ROUNDS; round++) {
    const { parties, spare } = await seedRound();
    const where = `vòng ${String(round)}`;
    const verifying = (i: number): boolean =>
      scenario === 'verify' ||
      (scenario === 'verify-and-resend' && i % 2 === 0);
    if (scenario !== 'verify') vi.setSystemTime(at(61)); // qua mốc 60 giây để gửi lại được

    const actions: (() => Promise<unknown>)[] = parties.map((party, i) => {
      if (verifying(i)) {
        // một nửa nhập đúng (tạo hồ sơ + ví), một nửa nhập sai (chỉ đếm lần sai)
        const correct = i % 2 === 0;
        const work = (): Promise<unknown> =>
          fx.verification.verifyOtp(
            verifyBody(
              { email: party.account.email, id: party.id, code: party.code },
              correct ? {} : { otp: wrongCodeFor(party.code) },
            ),
          );
        return correct ? work : tolerateWrongCode(work);
      }
      return scenario === 'resend-raw-rr'
        ? () => resendInRawTransaction(party)
        : () =>
            fx.verification.resendOtp(
              resendBody({ email: party.account.email, id: party.id }),
            );
    });
    actions.push(
      ...spare.map((a) => () => fx.otp.issue(registerInput(a.taiKhoanId))),
    );

    const wait = barrier(actions.length);
    const results = await Promise.allSettled(
      actions.map(async (action) => {
        await wait();
        return action();
      }),
    );
    for (const result of results) classify(tally, result);

    // Nhất quán: việc thành công ⇒ kết quả đủ; việc lỗi ⇒ hoàn tác trọn; không tài khoản nào bị ảnh hưởng bởi tài khoản khác
    const patients = await patientRows(db);
    const wallets = await walletRows(db);
    const expectedVerified = parties
      .filter((_, i) => verifying(i) && i % 2 === 0)
      .map((p) => p.account.taiKhoanId);
    for (const [i, party] of parties.entries()) {
      const account = await accountByEmail(db, party.account.email);
      const rows = await rowsOf(db, party.account.taiKhoanId);
      const id = party.account.taiKhoanId;
      const shouldVerify = expectedVerified.includes(id);
      if (account?.daXacMinhEmail !== shouldVerify) {
        measured.inconsistent.push(
          `${where}: tài khoản ${String(i)} đã xác minh = ${String(account?.daXacMinhEmail)}, mong đợi ${String(shouldVerify)}`,
        );
      }
      if (patients.some((p) => p.taiKhoanId === id) !== shouldVerify) {
        measured.inconsistent.push(
          `${where}: sai hồ sơ bệnh nhân của ${String(i)}`,
        );
      }
      if (wallets.some((w) => w.benhNhanId === id) !== shouldVerify) {
        measured.inconsistent.push(`${where}: sai ví của ${String(i)}`);
      }
      if (shouldVerify) {
        if (
          rows.some(
            (r) =>
              r.matKhauBamDangKy !== null ||
              (r.daDungLuc === null && r.thuHoiLuc === null),
          )
        ) {
          measured.inconsistent.push(
            `${where}: ${String(i)} đã xác minh nhưng còn dữ liệu đăng ký hoặc mã sống`,
          );
        }
      } else if (verifying(i)) {
        if (rows.length !== 1 || rows[0]?.soLanNhapSai !== 1) {
          measured.inconsistent.push(
            `${where}: ${String(i)} nhập sai mà không đếm đúng 1 lần`,
          );
        }
      } else if (scenario !== 'resend-raw-rr') {
        // gửi lại thành công: đúng một hàng mới sao chép dữ liệu đăng ký; hàng cũ bị thay thế
        if (
          rows.length !== 2 ||
          rows[1]?.matKhauBamDangKy === null ||
          rows[1]?.daGuiLuc === null
        ) {
          measured.inconsistent.push(
            `${where}: ${String(i)} gửi lại không ra đúng một hàng mới đã gửi`,
          );
        }
      }
    }
    if (
      patients.length !== expectedVerified.length ||
      wallets.length !== expectedVerified.length
    ) {
      measured.inconsistent.push(
        `${where}: số hồ sơ/ví ${String(patients.length)}/${String(wallets.length)}, mong đợi ${String(expectedVerified.length)}`,
      );
    }
  }
  measured.serverDeadlocks = (await serverDeadlocks(db)) - before;
  return measured;
}

describe.each(SCENARIOS)(
  'nhiều tài khoản khác nhau chạy đồng thời — %s',
  (scenario) => {
    it(`XM-M / GL-M ${scenario}: ${String(ROUNDS)} vòng × ${String(PARTIES)} tài khoản, kết quả nhất quán${scenario === 'resend-raw-rr' ? ' (giao dịch thô: chỉ in số đo)' : '; 0 lỗi 1213 và 1205, 0 deadlock phía máy chủ'}`, async () => {
      const result = await measure(scenario);
      const summary = `${describeTally(scenario, result.tally)}; deadlock phía máy chủ = ${String(result.serverDeadlocks)}`;
      console.info(`[XM-M] ${summary}`); // số đo cho báo cáo

      expect(result.inconsistent, summary).toEqual([]);
      if (scenario !== 'resend-raw-rr') {
        expect(result.tally, summary).toMatchObject({
          deadlock1213: 0,
          lockTimeout1205: 0,
          other: {},
        });
        expect(result.tally.ok, summary).toBe(result.tally.requests);
        expect(result.serverDeadlocks, summary).toBe(0);
      }
    }, 600_000);
  },
);
