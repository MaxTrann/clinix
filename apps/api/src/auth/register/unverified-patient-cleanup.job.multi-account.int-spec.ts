import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { resetTables } from '../../database/testing/test-database.js';
import type { TaiKhoan } from '../entities/tai-khoan.entity.js';
import {
  DAY,
  GONE,
  INTACT,
  createCleanupFixture,
  newJob,
  seedAccountWithChildren,
  stateOf,
  type CleanupFixture,
} from '../testing/cleanup-int-helpers.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import { allLines, captureLogsByLevel } from '../testing/log-levels.js';
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
import {
  accountByEmail,
  allAccounts,
  registerBody,
} from '../testing/register-int-helpers.js';
import {
  patientRows,
  resendBody,
  serverDeadlocks,
  verifyBody,
  walletRows,
} from '../testing/verification-int-helpers.js';
import type { UnverifiedPatientCleanupJob } from './unverified-patient-cleanup.job.js';

// Task A7 — NHIỀU tài khoản KHÁC NHAU bị xoá bởi job ĐỒNG THỜI với đăng ký, xác minh OTP và gửi lại mã của các tài khoản khác, trên MySQL 8.4 thật
// (bài học A5-C: test đồng thời cùng một tài khoản không thấy deadlock chéo tài khoản). Mỗi vòng dựng lại DB rồi cho cùng lúc (cùng qua một rào chắn):
//   - 2 job (hai "bản API" chạy job trên cùng DB) cùng xoá 6 Bệnh nhân chưa xác minh đã quá 24 giờ (mỗi người đủ hàng con: 2 mã OTP + 1 phiên);
//   - 6 yêu cầu verify-otp của 6 tài khoản khác (một nửa mã đúng: tạo hồ sơ + ví; một nửa mã sai: đếm lần sai);
//   - 3 yêu cầu resend-otp, 3 yêu cầu register (email mới) của các tài khoản khác.
// Đo bằng số lỗi MySQL THẬT: lỗi trả ra (1213, 1205), việc của job bị lỗi (`failed`, vì job nuốt lỗi để không dừng lượt) VÀ bộ đếm `lock_deadlocks` của
// máy chủ (bắt cả deadlock bị thử lại âm thầm ở đăng ký/pha 2). Job mở giao dịch READ COMMITTED: khẳng định 0. Đối chứng THÔ (cùng các lệnh nhưng
// giao dịch REPEATABLE READ) chỉ khẳng định kết quả nhất quán (tài khoản hoặc xoá trọn hoặc còn trọn) và IN số đo: 0 trong N vòng chưa phải bằng chứng
// về cơ chế. Mã CJ-Mnn là [đề xuất]. Số vòng chỉnh bằng CLEANUP_MULTI_ROUNDS (mặc định 8; khi đo kỹ dùng 50 và chạy với --reporter=verbose).
const ROUNDS = Number(process.env['CLEANUP_MULTI_ROUNDS'] ?? 8);
const EXPIRED = 6;
const VERIFYING = 6;
const RESENDING = 3;
const REGISTERING = 3;

let db: DataSource;
let fx: CleanupFixture<SelectiveMail>;
let logs: ReturnType<typeof captureLogsByLevel>;

useIntegrationHooks((testDb) => {
  db = testDb;
  logs = captureLogsByLevel();
});

type Mode = 'read-committed' | 'raw-repeatable-read';

interface Measured {
  tally: Tally;
  jobFailed: number;
  jobDeleted: number;
  deadlockLines: number;
  serverDeadlocks: number;
  inconsistent: string[];
}

interface Verifier {
  account: TaiKhoan;
  id: string;
  code: string;
}

const tolerateWrongCode =
  (work: () => Promise<unknown>) => async (): Promise<unknown> => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof AppException && error.maLoi === 'OTP_SAI') return;
      throw error;
    }
  };

// Đối chứng: cùng việc của job nhưng giao dịch THÔ REPEATABLE READ (mức mặc định của DataSource)
const rawRepeatableRead = (): DataSource =>
  Object.create(db, {
    transaction: {
      value: (_level: string, work: Parameters<DataSource['transaction']>[1]) =>
        db.transaction('REPEATABLE READ', work),
    },
  }) as DataSource;

/** Tài khoản chưa quá hạn, đã cấp và gửi một mã đăng ký (cũng là hàng mới nhất), trả mã đọc từ thư giả. */
async function seedPendingAccount(email: string): Promise<Verifier> {
  const account = await newUnverifiedAccount(db, {
    email,
    thoiDiemTao: at(0),
  });
  const issued = await issueOk(fx.otp, registerInput(account.taiKhoanId));
  await fx.otp.deliver(issued, recipientOf(account));
  return { account, id: issued.maXacThucId, code: fx.mail.codeSentTo(email) };
}

async function measure(mode: Mode): Promise<Measured> {
  const tally: Tally = {
    requests: 0,
    ok: 0,
    deadlock1213: 0,
    lockTimeout1205: 0,
    other: {},
  };
  const measured: Measured = {
    tally,
    jobFailed: 0,
    jobDeleted: 0,
    deadlockLines: 0,
    serverDeadlocks: 0,
    inconsistent: [],
  };
  const before = await serverDeadlocks(db);

  for (let round = 0; round < ROUNDS; round++) {
    await resetTables(db);
    vi.setSystemTime(at(0));
    fx = createCleanupFixture(db, new SelectiveMail());
    const where = `vòng ${String(round)}`;
    const jobDb = mode === 'read-committed' ? db : rawRepeatableRead();
    const jobs: UnverifiedPatientCleanupJob[] = [
      newJob(jobDb, fx),
      newJob(jobDb, fx),
    ];

    const expired: string[] = [];
    for (let i = 0; i < EXPIRED; i++) {
      expired.push(
        (
          await seedAccountWithChildren(db, DAY + 60, {
            email: `het.han.${String(i)}@example.com`,
          })
        ).taiKhoanId,
      );
    }
    const verifiers: Verifier[] = [];
    for (let i = 0; i < VERIFYING; i++) {
      verifiers.push(
        await seedPendingAccount(`xac.minh.${String(i)}@example.com`),
      );
    }
    const resenders: Verifier[] = [];
    for (let i = 0; i < RESENDING; i++) {
      resenders.push(
        await seedPendingAccount(`gui.lai.${String(i)}@example.com`),
      );
    }
    const newEmails = Array.from(
      { length: REGISTERING },
      (_, i) => `dang.ky.moi.${String(i)}@example.com`,
    );
    vi.setSystemTime(at(61)); // qua mốc 60 giây để gửi lại được; tài khoản chờ mới 61 giây tuổi, tài khoản quá hạn vẫn quá hạn

    const logStart = allLines(logs).length;
    const jobResults: Awaited<
      ReturnType<UnverifiedPatientCleanupJob['run']>
    >[] = [];
    const actions: (() => Promise<unknown>)[] = [
      ...jobs.map((job) => async () => {
        jobResults.push(await job.run());
      }),
      ...verifiers.map((v, i) => {
        const correct = i % 2 === 0;
        const work = (): Promise<unknown> =>
          fx.verification.verifyOtp(
            verifyBody(
              { email: v.account.email, id: v.id, code: v.code },
              correct ? {} : { otp: wrongCodeFor(v.code) },
            ),
          );
        return correct ? work : tolerateWrongCode(work);
      }),
      ...resenders.map(
        (v) => () =>
          fx.verification.resendOtp(
            resendBody({ email: v.account.email, id: v.id }),
          ),
      ),
      ...newEmails.map(
        (email) => () => fx.service.register(registerBody({ email })),
      ),
    ];
    const wait = barrier(actions.length);
    const results = await Promise.allSettled(
      actions.map(async (action) => {
        await wait();
        return action();
      }),
    );
    for (const result of results) classify(tally, result);

    for (const summary of jobResults) {
      measured.jobFailed += summary?.failed ?? 0;
      measured.jobDeleted += summary?.deleted ?? 0;
    }
    measured.deadlockLines += allLines(logs)
      .slice(logStart)
      .filter(
        (line) =>
          line.includes('deadlock (1213)') ||
          line.includes('MySQL 1213') ||
          line.includes('MySQL 1205'),
      ).length;

    // Nhất quán. Tài khoản quá hạn: xoá trọn hoặc còn trọn (không bao giờ xoá dở); ở mức đo chính còn phải xoá hết và đúng MỘT lần.
    for (const [i, id] of expired.entries()) {
      const state = await stateOf(db, id);
      if (
        mode === 'read-committed'
          ? state !== GONE
          : state !== GONE && state !== INTACT
      ) {
        measured.inconsistent.push(
          `${where}: tài khoản quá hạn ${String(i)} ở trạng thái "${state}"`,
        );
      }
    }
    if (
      mode === 'read-committed' &&
      measured.jobDeleted !== (round + 1) * EXPIRED
    ) {
      measured.inconsistent.push(
        `${where}: hai job xoá tổng cộng ${String(measured.jobDeleted)} tài khoản, mong đợi ${String((round + 1) * EXPIRED)} (mỗi tài khoản đúng một lần)`,
      );
    }
    const patients = await patientRows(db);
    const wallets = await walletRows(db);
    const correctIds = verifiers
      .filter((_, i) => i % 2 === 0)
      .map((v) => v.account.taiKhoanId);
    for (const [i, v] of verifiers.entries()) {
      const id = v.account.taiKhoanId;
      const shouldVerify = i % 2 === 0;
      const account = await accountByEmail(db, v.account.email);
      const rows = await rowsOf(db, id);
      if (account?.daXacMinhEmail !== shouldVerify) {
        measured.inconsistent.push(
          `${where}: verify ${String(i)} đã xác minh = ${String(account?.daXacMinhEmail)}, mong đợi ${String(shouldVerify)}`,
        );
      }
      if (
        patients.some((p) => p.taiKhoanId === id) !== shouldVerify ||
        wallets.some((w) => w.benhNhanId === id) !== shouldVerify
      ) {
        measured.inconsistent.push(
          `${where}: verify ${String(i)} sai hồ sơ hoặc ví`,
        );
      }
      if (!shouldVerify && (rows.length !== 1 || rows[0]?.soLanNhapSai !== 1)) {
        measured.inconsistent.push(
          `${where}: verify ${String(i)} nhập sai mà không đếm đúng 1 lần`,
        );
      }
    }
    if (
      patients.length !== correctIds.length ||
      wallets.length !== correctIds.length
    ) {
      measured.inconsistent.push(
        `${where}: số hồ sơ/ví ${String(patients.length)}/${String(wallets.length)}, mong đợi ${String(correctIds.length)}`,
      );
    }
    for (const [i, v] of resenders.entries()) {
      const rows = await rowsOf(db, v.account.taiKhoanId);
      if (rows.length !== 2 || rows[1]?.daGuiLuc === null) {
        measured.inconsistent.push(
          `${where}: gửi lại ${String(i)} không ra đúng một hàng mới đã gửi`,
        );
      }
    }
    for (const email of newEmails) {
      const account = await accountByEmail(db, email);
      if (!account || (await rowsOf(db, account.taiKhoanId)).length !== 1) {
        measured.inconsistent.push(
          `${where}: đăng ký mới ${email} không ra đúng một tài khoản có một hàng OTP`,
        );
      }
    }
    const expectedAccounts =
      VERIFYING +
      RESENDING +
      REGISTERING +
      (mode === 'read-committed'
        ? 0
        : (await Promise.all(expired.map((id) => stateOf(db, id)))).filter(
            (s) => s === INTACT,
          ).length);
    if ((await allAccounts(db)).length !== expectedAccounts) {
      measured.inconsistent.push(
        `${where}: còn ${String((await allAccounts(db)).length)} tài khoản, mong đợi ${String(expectedAccounts)} (xoá nhầm hoặc sót)`,
      );
    }
  }
  measured.serverDeadlocks = (await serverDeadlocks(db)) - before;
  return measured;
}

describe.each<Mode>(['read-committed', 'raw-repeatable-read'])(
  'job dọn chạy đồng thời với đăng ký, xác minh, gửi lại của tài khoản khác — %s',
  (mode) => {
    it(`(CJ-M) ${String(ROUNDS)} vòng × (2 job xoá ${String(EXPIRED)} tài khoản + ${String(VERIFYING)} verify + ${String(RESENDING)} gửi lại + ${String(REGISTERING)} đăng ký): kết quả nhất quán${mode === 'read-committed' ? '; 0 lỗi 1213 và 1205, 0 việc của job lỗi, 0 deadlock phía máy chủ' : ' (giao dịch thô: chỉ in số đo)'}`, async () => {
      const result = await measure(mode);
      const summary = `${mode} / ${describeTally('job + đăng ký + xác minh + gửi lại', result.tally)}; việc của job lỗi = ${String(result.jobFailed)}, dòng log 1213/1205 = ${String(result.deadlockLines)}, deadlock phía máy chủ = ${String(result.serverDeadlocks)}`;
      console.info(`[CJ-M] ${summary}`); // số đo cho báo cáo (cả hai mức)

      expect(result.inconsistent, summary).toEqual([]);
      if (mode === 'read-committed') {
        expect(result.tally, summary).toMatchObject({
          deadlock1213: 0,
          lockTimeout1205: 0,
          other: {},
        });
        expect(result.tally.ok, summary).toBe(result.tally.requests);
        expect(result.jobFailed, summary).toBe(0);
        expect(result.deadlockLines, summary).toBe(0);
        expect(result.serverDeadlocks, summary).toBe(0);
      }
    }, 600_000);
  },
);
