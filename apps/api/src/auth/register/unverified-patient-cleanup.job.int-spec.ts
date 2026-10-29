import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { resetTables } from '../../database/testing/test-database.js';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { UNVERIFIED_ACCOUNT_TTL_MS } from '../auth.constants.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { taiKhoanData } from '../entities/testing/auth-fixtures.js';
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
import { T0, at, rowsOf } from '../testing/otp-int-helpers.js';
import { barrier } from '../testing/otp-multi-account.js';
import { readOtpFromMail } from '../testing/otp-test-helpers.js';
import {
  REGISTER_PASSWORD,
  accountByEmail,
  allAccounts,
} from '../testing/register-int-helpers.js';
import {
  allLines,
  captureLogsByLevel,
  type LogsByLevel,
} from '../testing/log-levels.js';
import { expectNoSecrets } from '../testing/secret-scan.js';
import {
  deferred,
  patientRows,
  registerPatient,
  resendBody,
  serverDeadlocks,
  sleep,
  verifyBody,
  walletRows,
} from '../testing/verification-int-helpers.js';
import { isExpiredUnverifiedPatient } from './unverified-account-rules.js';

// Task A7 — job dọn tài khoản Bệnh nhân chưa xác minh quá 24 giờ trên MySQL 8.4 thật, đồng hồ giả (T0 = 2026-11-02 08:00 giờ VN, xa NOW() thật của DB:
// mã dùng NOW() của DB thay đồng hồ ứng dụng sẽ làm các ca dưới đỏ). Mã test case của plan: DK-33, DK-34, DK-35, DK-36, DK-37, DK-38, SE-04.
// Mã CJ-nn là [đề xuất]. Phần không cần DB nằm ở unverified-patient-cleanup.job.spec.ts; nhiều tài khoản khác nhau chạy đồng thời nằm ở
// unverified-patient-cleanup.job.multi-account.int-spec.ts.
let db: DataSource;
let fx: CleanupFixture<FakeMailService>;
let logs: LogsByLevel;

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = createCleanupFixture(testDb);
  logs = captureLogsByLevel();
});

const lastCode = (): string => {
  const mail = fx.mail.attempts[fx.mail.attempts.length - 1];
  if (!mail) throw new Error('chưa có thư nào');
  return readOtpFromMail(mail);
};

const cutoffAt = (now: Date): Date =>
  new Date(now.getTime() - UNVERIFIED_ACCOUNT_TTL_MS);

/** Chèn hàng loạt `count` Bệnh nhân chưa xác minh đã quá hạn (một câu INSERT, không hàng con) cho test lô. */
async function bulkExpired(count: number): Promise<void> {
  await db.getRepository(TaiKhoan).insert(
    Array.from({ length: count }, (_, i) =>
      taiKhoanData({
        daXacMinhEmail: false,
        thoiDiemTao: at(-(DAY + 60)),
        email: `het.han.hang.loat.${String(i)}@example.com`,
      }),
    ),
  );
}

describe('biên 24 giờ (DK-33)', () => {
  it('(CJ-01 / DK-33) T+23:59 còn, T+24:01 bị xoá cùng ma_xac_thuc và phien_dang_nhap; một lượt chạy', async () => {
    const young = await seedAccountWithChildren(db, DAY - 60);
    const old = await seedAccountWithChildren(db, DAY + 60, {
      email: 'qua.han@example.com',
    });

    const summary = await fx.job.run();

    expect(summary).toEqual({ deleted: 1, skipped: 0, failed: 0, more: false });
    expect(await stateOf(db, young.taiKhoanId)).toBe(INTACT);
    expect(await stateOf(db, old.taiKhoanId)).toBe(GONE);
  });

  it.each([
    [DAY - 60, 0, 'T+23:59'],
    [DAY - 1, 0, 'T+23:59:59'],
    [DAY, 1, 'đúng T+24:00:00 (nửa mở: đã hết)'],
    [DAY + 1, 1, 'T+24:00:01'],
  ])(
    '(CJ-02 / DK-33) tuổi %i giây (%s) → số tài khoản bị xoá = %i',
    async (age, deleted) => {
      const account = await seedAccountWithChildren(db, age);

      const summary = await fx.job.run();

      expect(summary).toEqual({ deleted, skipped: 0, failed: 0, more: false });
      expect(await stateOf(db, account.taiKhoanId)).toBe(
        deleted === 1 ? GONE : INTACT,
      );
    },
  );
});

describe('KHÔNG bao giờ xoá những loại này dù quá hạn rất lâu (DK-34, DK-35, H1, A5-F)', () => {
  it.each([
    ['Bệnh nhân đã xác minh (DK-34)', { daXacMinhEmail: true }],
    [
      'Bác sĩ chờ kích hoạt, cũng chưa xác minh (DK-35)',
      { loaiTaiKhoan: 'BacSi', trangThai: 'ChoKichHoat', matKhauBam: null },
    ],
    [
      'Lễ tân chờ kích hoạt (DK-35)',
      { loaiTaiKhoan: 'LeTan', trangThai: 'ChoKichHoat', matKhauBam: null },
    ],
    [
      'Quản trị viên chờ kích hoạt (DK-35)',
      {
        loaiTaiKhoan: 'QuanTriVien',
        trangThai: 'ChoKichHoat',
        matKhauBam: null,
      },
    ],
    [
      'Quản trị viên đang hoạt động chưa xác minh',
      { loaiTaiKhoan: 'QuanTriVien' },
    ],
    ['Bác sĩ đang hoạt động chưa xác minh', { loaiTaiKhoan: 'BacSi' }],
    [
      'Bệnh nhân chưa xác minh bị ngưng hoạt động (A5-F)',
      { trangThai: 'NgungHoatDong' },
    ],
  ] as const)(
    '(CJ-03) %s: không được chọn làm ứng viên (không phải "bỏ qua" ở bước xoá) và còn nguyên hàng con',
    async (_label, overrides) => {
      const account = await seedAccountWithChildren(db, 400 * DAY, overrides);

      const summary = await fx.job.run();

      // skipped = 0: câu chọn đã loại sẵn, không dựa vào việc purgeIfExpired từ chối ở bước sau
      expect(summary).toEqual({
        deleted: 0,
        skipped: 0,
        failed: 0,
        more: false,
      });
      expect(await stateOf(db, account.taiKhoanId)).toBe(INTACT);
    },
  );
});

describe('câu chọn ứng viên (TaiKhoanRepository.findExpiredUnverifiedPatientIds)', () => {
  it('(CJ-04) khớp từng ca với isExpiredUnverifiedPatient của A5: loại tài khoản × trạng thái × xác minh × tuổi (biên 23:59:59, 24:00:00, 24:00:01)', async () => {
    const rows: TaiKhoan[] = [];
    for (const loaiTaiKhoan of [
      'BenhNhan',
      'BacSi',
      'LeTan',
      'QuanTriVien',
    ] as const) {
      for (const trangThai of [
        'DangHoatDong',
        'NgungHoatDong',
        'ChoKichHoat',
      ] as const) {
        if (loaiTaiKhoan === 'BenhNhan' && trangThai === 'ChoKichHoat')
          continue; // CHECK của DB: Bệnh nhân không bao giờ ChoKichHoat
        for (const daXacMinhEmail of [false, true]) {
          for (const age of [DAY - 1, DAY, DAY + 1]) {
            rows.push(
              await seedAccountWithChildren(db, age, {
                loaiTaiKhoan,
                trangThai,
                daXacMinhEmail,
                ...(trangThai === 'ChoKichHoat' ? { matKhauBam: null } : {}),
              }),
            );
          }
        }
      }
    }
    const now = at(0);

    const selected = await fx.accounts.findExpiredUnverifiedPatientIds(
      db.manager,
      cutoffAt(now),
      '0',
      1000,
    );

    const expected = rows
      .filter((row) => isExpiredUnverifiedPatient(row, now))
      .map((row) => row.taiKhoanId);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(rows.length);
    expect(selected).toEqual(expected); // cùng tập, cùng thứ tự khoá chính tăng dần
  });

  it('(CJ-05) theo lô: ORDER BY khoá chính, LIMIT, và cursor lớn hơn hẳn mã cuối của lô trước', async () => {
    await bulkExpired(7);
    const page = (afterId: string, limit: number): Promise<string[]> =>
      fx.accounts.findExpiredUnverifiedPatientIds(
        db.manager,
        cutoffAt(at(0)),
        afterId,
        limit,
      );
    const all = await page('0', 100);
    expect(all).toHaveLength(7);

    const first = await page('0', 3);
    const second = await page(first[2] ?? 'thiếu', 3);
    const third = await page(second[2] ?? 'thiếu', 3);

    expect(first).toEqual(all.slice(0, 3));
    expect(second).toEqual(all.slice(3, 6));
    expect(third).toEqual(all.slice(6));
    expect(await page(third[0] ?? 'thiếu', 3)).toEqual([]);
  });
});

describe('lô và trần mỗi lượt', () => {
  it('(CJ-06) 209 tài khoản quá hạn: một lượt quét ba lô (100, 100, 9) rồi xoá hết, mỗi tài khoản đúng một lần', async () => {
    await bulkExpired(209);
    const sizes: number[] = [];
    const real = fx.accounts.findExpiredUnverifiedPatientIds.bind(fx.accounts);
    vi.spyOn(fx.accounts, 'findExpiredUnverifiedPatientIds').mockImplementation(
      async (...args) => {
        const ids = await real(...args);
        sizes.push(ids.length);
        return ids;
      },
    );

    const summary = await fx.job.run();

    expect(sizes).toEqual([100, 100, 9]);
    expect(summary).toEqual({
      deleted: 209,
      skipped: 0,
      failed: 0,
      more: false,
    });
    expect(await allAccounts(db)).toHaveLength(0);
  }, 120_000);

  it('(CJ-07) 1005 tài khoản quá hạn: lượt đầu dừng ở trần 10 lô (xoá 1000, báo còn), lượt sau xoá nốt 5', async () => {
    await bulkExpired(1005);

    const first = await fx.job.run();
    expect(first).toEqual({ deleted: 1000, skipped: 0, failed: 0, more: true });
    expect(await allAccounts(db)).toHaveLength(5);

    const second = await fx.job.run();
    expect(second).toEqual({ deleted: 5, skipped: 0, failed: 0, more: false });
    expect(await allAccounts(db)).toHaveLength(0);
  }, 180_000);
});

describe('tài khoản lỗi không dừng lượt (H2)', () => {
  it('(CJ-08) khoá ngoại thật (còn thong_bao tham chiếu): tài khoản đó còn nguyên (hoàn tác trọn), các tài khoản khác vẫn bị xoá, ERROR chỉ có mã tài khoản; lượt sau thử lại', async () => {
    const a = await seedAccountWithChildren(db, DAY + 10, {
      email: 'a.hong@example.com',
    });
    const b = await seedAccountWithChildren(db, DAY + 10, {
      email: 'b.vuong.khoa.ngoai@example.com',
    });
    const c = await seedAccountWithChildren(db, DAY + 10, {
      email: 'c.sau.loi@example.com',
    });
    await db.query(
      'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, thoi_diem_tao) VALUES (?, ?, ?, ?)',
      [b.taiKhoanId, 'Thông báo thử', 'KiemThu', at(-DAY)],
    );

    const summary = await fx.job.run();

    expect(summary).toEqual({ deleted: 2, skipped: 0, failed: 1, more: false });
    expect(await stateOf(db, a.taiKhoanId)).toBe(GONE);
    expect(await stateOf(db, b.taiKhoanId)).toBe(INTACT); // việc xoá ma_xac_thuc và phien_dang_nhap đã hoàn tác theo
    expect(await stateOf(db, c.taiKhoanId)).toBe(GONE); // đứng SAU tài khoản lỗi mà vẫn được dọn
    expect(logs.error.some((line) => line.includes(b.taiKhoanId))).toBe(true);
    expect(logs.error.join('\n')).toContain('khoá ngoại');
    expect(logs.warn).toEqual([]);
    for (const email of [a.email, b.email, c.email]) {
      expect(allLines(logs).join('\n')).not.toContain(email);
    }

    const again = await fx.job.run(); // vẫn là ứng viên: lượt sau thử lại (và vẫn lỗi vì còn thong_bao)
    expect(again).toEqual({ deleted: 0, skipped: 0, failed: 1, more: false });
  });

  it('(CJ-09) lỗi giữa chừng khi xoá phiên: giao dịch của tài khoản đó hoàn tác trọn (ma_xac_thuc đã xoá được khôi phục), tài khoản khác không bị ảnh hưởng', async () => {
    const a = await seedAccountWithChildren(db, DAY + 10, {
      email: 'a.loi.phien@example.com',
    });
    const b = await seedAccountWithChildren(db, DAY + 10, {
      email: 'b.binh.thuong@example.com',
    });
    vi.spyOn(fx.sessions, 'deleteByAccount').mockRejectedValueOnce(
      new Error('lỗi giả lập khi xoá phiên'),
    );

    const summary = await fx.job.run();

    expect(summary).toEqual({ deleted: 1, skipped: 0, failed: 1, more: false });
    expect(await stateOf(db, a.taiKhoanId)).toBe(INTACT);
    expect(await stateOf(db, b.taiKhoanId)).toBe(GONE);
  });

  it('(CJ-10) hết thời gian chờ khoá THẬT (1205): một phiên khác giữ khoá hàng; chỉ cảnh báo kèm mã tài khoản và mã lỗi, tài khoản khác vẫn xoá, lượt sau (hết giữ khoá) xoá được', async () => {
    const a = await seedAccountWithChildren(db, DAY + 10, {
      email: 'a.bi.giu.khoa@example.com',
    });
    const b = await seedAccountWithChildren(db, DAY + 10, {
      email: 'b.khong.bi.giu@example.com',
    });
    const holder = db.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    await holder.query(
      'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE',
      [a.taiKhoanId],
    );
    // Rút thời gian chờ khoá của chính giao dịch của job xuống 1 giây (mặc định 50 giây) để test không phải chờ lâu
    const shortWait = Object.create(db, {
      transaction: {
        value: (
          level: 'READ COMMITTED',
          work: Parameters<DataSource['transaction']>[1],
        ) =>
          db.transaction(level, async (em) => {
            await em.query('SET SESSION innodb_lock_wait_timeout = 1');
            try {
              return await work(em);
            } finally {
              await em.query('SET SESSION innodb_lock_wait_timeout = DEFAULT');
            }
          }),
      },
    }) as DataSource;
    const job = newJob(shortWait, fx);

    try {
      const summary = await job.run();

      expect(summary).toEqual({
        deleted: 1,
        skipped: 0,
        failed: 1,
        more: false,
      });
      expect(logs.error).toEqual([]);
      expect(logs.warn).toEqual([
        expect.stringContaining(`Không dọn được tài khoản ${a.taiKhoanId}`),
      ]);
      expect(logs.warn[0]).toContain('MySQL 1205');
      expect(allLines(logs).join('\n')).not.toContain(a.email);
      expect(await stateOf(db, a.taiKhoanId)).toBe(INTACT);
      expect(await stateOf(db, b.taiKhoanId)).toBe(GONE);
    } finally {
      await holder.rollbackTransaction();
      await holder.release();
    }

    expect(await fx.job.run()).toEqual({
      deleted: 1,
      skipped: 0,
      failed: 0,
      more: false,
    });
    expect(await stateOf(db, a.taiKhoanId)).toBe(GONE);
  }, 60_000);
});

describe('hai bản API cùng chạy job (không cần khoá riêng)', () => {
  it('(CJ-12) hai job chạy song song trên cùng 24 tài khoản quá hạn, 5 vòng: mỗi tài khoản bị xoá đúng một lần, không lỗi, không deadlock phía máy chủ', async () => {
    const deadlocksBefore = await serverDeadlocks(db);
    for (let round = 0; round < 5; round++) {
      await resetTables(db);
      vi.setSystemTime(T0);
      const ids: string[] = [];
      for (let i = 0; i < 24; i++) {
        ids.push(
          (
            await seedAccountWithChildren(db, DAY + 10 + i, {
              email: `song.song.${String(i)}@example.com`,
            })
          ).taiKhoanId,
        );
      }
      const wait = barrier(2);
      const results = await Promise.all(
        [fx.job, newJob(db, fx)].map(async (job) => {
          await wait();
          return job.run();
        }),
      );

      const summaries = results.map((r) => r ?? { deleted: -1, failed: -1 });
      expect(summaries.map((s) => s.failed)).toEqual([0, 0]);
      expect(summaries.reduce((sum, s) => sum + s.deleted, 0)).toBe(24);
      for (const id of ids) expect(await stateOf(db, id)).toBe(GONE);
    }
    expect(await serverDeadlocks(db)).toBe(deadlocksBefore);
  }, 120_000);
});

describe('đua với xác minh OTP (A6) và đăng ký lại (A5)', () => {
  /** Bệnh nhân đăng ký lúc T0, gửi lại mã ở T+23:58 (còn hạn 10 phút), trả bản ghi để xác minh bằng mã MỚI. */
  async function registeredWithFreshCode() {
    const r = await registerPatient(db, fx);
    vi.setSystemTime(at(DAY - 120));
    const resent = await fx.verification.resendOtp(resendBody(r));
    return { ...r, id: resent.maXacThucId, code: lastCode() };
  }

  it('(CJ-13) ứng viên cũ nhưng tài khoản đã được xác minh trước đó: purgeIfExpired kiểm lại dưới khoá, trả false ⇒ bỏ qua, KHÔNG xoá; hồ sơ và ví còn nguyên', async () => {
    const r = await registeredWithFreshCode();
    vi.setSystemTime(at(DAY - 100));
    await fx.verification.verifyOtp(verifyBody(r));
    vi.setSystemTime(at(DAY + 30)); // quá 24 giờ kể từ lúc tạo
    // danh sách ứng viên "lập trước khi xác minh": mã tài khoản vẫn nằm trong đó
    vi.spyOn(
      fx.accounts,
      'findExpiredUnverifiedPatientIds',
    ).mockResolvedValueOnce([r.taiKhoanId]);

    const summary = await fx.job.run();

    expect(summary).toEqual({ deleted: 0, skipped: 1, failed: 0, more: false });
    expect((await accountByEmail(db, r.email))?.daXacMinhEmail).toBe(true);
    expect(await patientRows(db)).toHaveLength(1);
    expect(await walletRows(db)).toHaveLength(1);
  });

  it('(CJ-14) đua THẬT: verify-otp (còn hạn lúc bắt đầu) đang giữ khoá tài khoản khi đã quá 24:00:00, job chờ khoá rồi thấy đã xác minh ⇒ không xoá, verify thành công đủ hồ sơ và ví', async () => {
    const r = await registeredWithFreshCode();
    vi.setSystemTime(at(DAY - 1)); // 23:59:59: còn hạn
    const entered = deferred();
    const release = deferred();
    const realInsert = fx.wallets.insertEmpty.bind(fx.wallets);
    vi.spyOn(fx.wallets, 'insertEmpty').mockImplementation(async (em, id) => {
      entered.resolve();
      await release.promise;
      return realInsert(em, id);
    });
    const verifyPromise = fx.verification.verifyOtp(verifyBody(r));
    await Promise.race([entered.promise, verifyPromise]); // verify đã giữ khoá hàng tài khoản
    vi.setSystemTime(at(DAY + 1)); // 24:00:01: tài khoản (chưa commit xác minh) đã là ứng viên
    let jobDone = false;
    const jobPromise = fx.job.run().then((summary) => {
      jobDone = true;
      return summary;
    });

    await sleep(400); // chờ thật: nếu job không bị chặn bởi khoá thì nó đã xoá xong tài khoản đang được xác minh
    expect(jobDone).toBe(false);
    release.resolve();
    await verifyPromise;
    const summary = await jobPromise;

    expect(summary).toEqual({ deleted: 0, skipped: 1, failed: 0, more: false });
    expect((await accountByEmail(db, r.email))?.daXacMinhEmail).toBe(true);
    expect(await patientRows(db)).toHaveLength(1);
    expect(await walletRows(db)).toHaveLength(1);
    expect(logs.error).toEqual([]);
  });

  it('(CJ-15 / DK-38) gửi lại mã ở T+23:00 KHÔNG kéo dài hạn 24 giờ: còn ở 23:59:59, bị xoá đúng ở 24:00:00 tính từ lúc TẠO', async () => {
    const r = await registerPatient(db, fx);
    vi.setSystemTime(at(23 * 3600));
    await fx.verification.resendOtp(resendBody(r));
    expect((await accountByEmail(db, r.email))?.thoiDiemTao).toEqual(at(0));

    vi.setSystemTime(at(DAY - 1));
    expect(await fx.job.run()).toEqual({
      deleted: 0,
      skipped: 0,
      failed: 0,
      more: false,
    });
    expect(await stateOf(db, r.taiKhoanId)).not.toBe(
      '0 tài khoản, 0 OTP, 0 phiên',
    );

    vi.setSystemTime(at(DAY));
    expect(await fx.job.run()).toEqual({
      deleted: 1,
      skipped: 0,
      failed: 0,
      more: false,
    });
    expect(await stateOf(db, r.taiKhoanId)).toBe(GONE);
  });

  it('(CJ-16 / DK-36) đăng ký lại cùng email sau khi job đã xoá: tạo tài khoản MỚI bình thường với bộ đếm OTP mới (đúng một hàng, 0 lần sai)', async () => {
    const old = await registerPatient(db, fx);
    vi.setSystemTime(at(DAY + 10));
    await fx.job.run();
    expect(await stateOf(db, old.taiKhoanId)).toBe(GONE);

    const fresh = await registerPatient(db, fx, { email: old.email });

    expect(fresh.taiKhoanId).not.toBe(old.taiKhoanId);
    const rows = await rowsOf(db, fresh.taiKhoanId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.soLanNhapSai).toBe(0);
    expect(rows[0]?.daGuiLuc).not.toBeNull();
  });

  it('(CJ-17 / DK-37) job chưa chạy mà đăng ký lại cùng email: xoá lười rồi tạo mới; sau đó job không đụng tài khoản mới', async () => {
    const old = await registerPatient(db, fx);
    vi.setSystemTime(at(DAY + 10));

    const fresh = await registerPatient(db, fx, { email: old.email });

    expect(fresh.taiKhoanId).not.toBe(old.taiKhoanId);
    expect(await stateOf(db, old.taiKhoanId)).toBe(GONE);
    expect(await fx.job.run()).toEqual({
      deleted: 0,
      skipped: 0,
      failed: 0,
      more: false,
    });
    expect(await rowsOf(db, fresh.taiKhoanId)).toHaveLength(1);
    expect(await allAccounts(db)).toHaveLength(1);
  });

  it('(CJ-18) đăng ký lại ngay giữa lúc job quét xong và lúc xoá: mã cũ đã bị xoá lười ⇒ bỏ qua; tài khoản mới (mã mới, chưa đủ 24 giờ) còn nguyên', async () => {
    const old = await registerPatient(db, fx);
    vi.setSystemTime(at(DAY + 10));
    let fresh = '';
    const real = fx.accounts.findExpiredUnverifiedPatientIds.bind(fx.accounts);
    vi.spyOn(fx.accounts, 'findExpiredUnverifiedPatientIds').mockImplementation(
      async (...args) => {
        const ids = await real(...args); // job đã lập xong danh sách ứng viên có mã cũ…
        fresh = (await registerPatient(db, fx, { email: old.email }))
          .taiKhoanId; // …thì có người đăng ký lại cùng email
        return ids;
      },
    );

    const summary = await fx.job.run();

    expect(summary).toEqual({ deleted: 0, skipped: 1, failed: 0, more: false });
    expect(fresh).not.toBe('');
    expect(fresh).not.toBe(old.taiKhoanId);
    expect(await stateOf(db, old.taiKhoanId)).toBe(GONE);
    expect(await rowsOf(db, fresh)).toHaveLength(1);
    expect((await accountByEmail(db, old.email))?.taiKhoanId).toBe(fresh);
  });
});

describe('log không lộ dữ liệu cá nhân (SE-04, DK-39)', () => {
  it('(CJ-19) mọi nhánh của job (xoá được, khoá ngoại thật, lỗi giả lập có message chứa email/họ tên/băm, lỗi đọc danh sách) không để lọt email, họ tên, SĐT, mật khẩu, băm hay OTP ra log', async () => {
    const email = 'bi.mat.a7@example.com';
    const hoTen = 'Trần Thị Bí Mật';
    const soDienThoai = '0987000111';
    const r = await registerPatient(db, fx, { email, hoTen, soDienThoai });
    const hash = (await accountByEmail(db, email))?.matKhauBam ?? '';
    vi.setSystemTime(at(DAY + 10));
    const leaky = `lỗi ${email} ${hoTen} ${soDienThoai} ${hash}`;

    // (1) lỗi đọc danh sách ứng viên, message chứa bí mật
    vi.spyOn(
      fx.accounts,
      'findExpiredUnverifiedPatientIds',
    ).mockRejectedValueOnce(new Error(leaky));
    await expect(fx.job.run()).resolves.toBeDefined();
    // (2) lỗi giả lập khi xoá, message chứa bí mật (cả dạng lỗi MySQL có errno)
    vi.spyOn(fx.cleaner, 'purgeIfExpired')
      .mockRejectedValueOnce(Object.assign(new Error(leaky), { errno: 1451 }))
      .mockRejectedValueOnce(Object.assign(new Error(leaky), { errno: 1213 }));
    await fx.job.run();
    await fx.job.run();
    // (3) khoá ngoại THẬT
    await db.query(
      'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, thoi_diem_tao) VALUES (?, ?, ?, ?)',
      [r.taiKhoanId, 'Thông báo thử', 'KiemThu', at(-DAY)],
    );
    await fx.job.run();
    await db.query('DELETE FROM thong_bao WHERE tai_khoan_id = ?', [
      r.taiKhoanId,
    ]);
    // (4) xoá được
    expect(await fx.job.run()).toEqual({
      deleted: 1,
      skipped: 0,
      failed: 0,
      more: false,
    });

    const text = allLines(logs).join('\n');
    expect(text).toContain(r.taiKhoanId); // kiểm không vô nghĩa: log CÓ mã tài khoản
    expectNoSecrets('log của job', text, {
      literals: [email, hoTen, soDienThoai, hash, REGISTER_PASSWORD],
      codes: [r.code],
    });
  });
});
