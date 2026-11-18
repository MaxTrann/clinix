import type { DataSource } from 'typeorm';
import { TaiKhoan } from '../../../auth/entities/tai-khoan.entity.js';
import { insertTaiKhoan } from '../../../auth/entities/testing/auth-fixtures.js';
import { useIntegrationHooks } from '../../../auth/testing/int-hooks.js';
import { T0 } from '../../../auth/testing/otp-int-helpers.js';
import { AppException } from '../../../common/errors/app.exception.js';
import type { FakeMailService } from '../../../mail/testing/fake-mail.service.js';
import { BacSi } from '../../entities/bac-si.entity.js';
import type { ActivationLinkService } from '../../staff-activation/activation-link.service.js';
import { StaffAccountRepository } from '../staff-account.repository.js';
import {
  SYSTEM_SCOPE,
  auditRowsOf,
  buildService,
  createAs,
  createWorld,
  doctorInput,
  newEmail,
  receptionistInput,
  rowCounts,
  type StaffAccountWorld,
} from '../testing/staff-account-world.js';

// Task B15 (admin) — ĐUA và KHOÁ của tạo tài khoản nhân sự trên MySQL 8.4 THẬT (NS-22; PLAN admin 5.2: kiểm trong cùng giao dịch, khoá S sớm).
// Ca đua chạy MỘT MÌNH khi xin lượt máy (đo khoá của DB này bằng performance_schema.data_locks, lọc OBJECT_SCHEMA = DATABASE()). Mã NSB15-nn là [đề xuất].
const HOUR_MS = 3_600_000;

let db: DataSource;

useIntegrationHooks((testDb) => {
  db = testDb;
});

const worldOf = (): Promise<StaffAccountWorld<FakeMailService>> =>
  createWorld(db);

/** Chờ tới khi `check` đúng (thăm dò ngắn); hết `timeoutMs` thì ném, để ca đỏ thay vì treo. performance.now() chứ không Date.now(): đồng hồ `Date` bị giả. */
async function eventually(
  check: () => Promise<boolean>,
  what: string,
  timeoutMs = 8000,
): Promise<void> {
  const started = performance.now();
  while (!(await check())) {
    if (performance.now() - started > timeoutMs) {
      throw new Error(`hết ${String(timeoutMs)} ms chờ: ${what}`);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
  }
}

interface LockRow {
  table: string;
  mode: string;
  status: string;
  n: number;
}

/** Khoá hàng của DB test này (lọc theo OBJECT_SCHEMA để không lẫn việc của cửa sổ khác dùng chung MySQL). */
async function recordLocks(): Promise<LockRow[]> {
  const rows: {
    OBJECT_NAME: string;
    LOCK_MODE: string;
    LOCK_STATUS: string;
    n: string;
  }[] = await db.query(
    `SELECT OBJECT_NAME, LOCK_MODE, LOCK_STATUS, COUNT(*) AS n
       FROM performance_schema.data_locks
      WHERE OBJECT_SCHEMA = DATABASE() AND LOCK_TYPE = 'RECORD'
      GROUP BY OBJECT_NAME, LOCK_MODE, LOCK_STATUS`,
  );
  return rows.map((row) => ({
    table: row.OBJECT_NAME,
    mode: row.LOCK_MODE,
    status: row.LOCK_STATUS,
    n: Number(row.n),
  }));
}

const held = (locks: LockRow[], table: string, prefix: 'S' | 'X'): number =>
  locks
    .filter(
      (lock) =>
        lock.table === table &&
        lock.status === 'GRANTED' &&
        lock.mode.startsWith(prefix),
    )
    .reduce((sum, lock) => sum + lock.n, 0);

const waiting = (locks: LockRow[], table: string): number =>
  locks
    .filter((lock) => lock.table === table && lock.status === 'WAITING')
    .reduce((sum, lock) => sum + lock.n, 0);

interface Gate {
  reached: Promise<void>;
  open: () => void;
  wait: () => Promise<void>;
}

function gate(): Gate {
  let open!: () => void;
  let reached!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  const arrived = new Promise<void>((resolve) => {
    reached = resolve;
  });
  return {
    reached: arrived,
    open,
    wait: () => {
      reached();
      return opened;
    },
  };
}

describe('khoá S sớm trên chuyên khoa và liên kết chi nhánh–dịch vụ (NSB15-46)', () => {
  it('NSB15-46 giữa giao dịch (SAU kiểm tham chiếu, TRƯỚC mọi INSERT) đã giữ khoá S trên chuyen_khoa và chi_nhanh_dich_vu_kham, CHƯA có khoá X nào ở tai_khoan hay bac_si; ngừng hoạt động chuyên khoa phải CHỜ tới khi tạo commit', async () => {
    const w = await worldOf();
    const beforeInsert = gate();
    class GatedRepository extends StaffAccountRepository {
      override async insertAccount(
        ...args: Parameters<StaffAccountRepository['insertAccount']>
      ): ReturnType<StaffAccountRepository['insertAccount']> {
        await beforeInsert.wait();
        return super.insertAccount(...args);
      }
    }
    const service = buildService(w, { repo: new GatedRepository() });
    const creating = service.create(
      SYSTEM_SCOPE,
      w.actor.taiKhoanId,
      doctorInput(w),
    );
    let disabling: Promise<unknown> = Promise.resolve();
    try {
      await Promise.race([beforeInsert.reached, creating]);

      const locks = await recordLocks();
      expect(held(locks, 'chuyen_khoa', 'S')).toBeGreaterThan(0);
      expect(held(locks, 'chi_nhanh_dich_vu_kham', 'S')).toBeGreaterThan(0);
      // Chưa chèn gì nên chưa có khoá ghi trên bảng của tài khoản và hồ sơ
      expect(held(locks, 'tai_khoan', 'X')).toBe(0);
      expect(held(locks, 'bac_si', 'X')).toBe(0);

      disabling = db.query(
        "UPDATE chuyen_khoa SET trang_thai_hoat_dong = 'NgungHoatDong' WHERE chuyen_khoa_id = ?",
        [w.specialty.chuyenKhoaId],
      );
      await eventually(
        async () => waiting(await recordLocks(), 'chuyen_khoa') > 0,
        'UPDATE ngừng hoạt động chuyên khoa chờ khoá S của giao dịch tạo',
      );
    } finally {
      // LUÔN mở cổng: ca đỏ mà để giao dịch mở sẽ làm treo cả các ca sau (hook TRUNCATE chờ khoá tới timeout)
      beforeInsert.open();
    }
    const result = await creating;
    expect(result.loaiTaiKhoan).toBe('BacSi');
    await disabling;
    // Tạo thắng cuộc chạy đua (đã commit trước); sau đó chuyên khoa mới bị ngừng, hồ sơ bác sĩ cũ giữ nguyên (Q19: giữ khi không sửa)
    expect(
      await db.getRepository(BacSi).findOneByOrFail({
        taiKhoanId: result.taiKhoanId,
      }),
    ).toMatchObject({ chuyenKhoaId: w.specialty.chuyenKhoaId });
  });

  it('NSB15-46 ngay TRƯỚC `issue` (đã chèn tài khoản và hồ sơ): khoá X ở tai_khoan; khoá S ở chi_nhanh, chuyen_khoa, dich_vu_kham, chi_nhanh_dich_vu_kham; không khoá nào chờ; KHÔNG khoá hàng bac_si của người khác', async () => {
    const w = await worldOf();
    const other = await w.fx.doctor(w.branch);
    const beforeIssue = gate();
    const real = w.links.service;
    const links = {
      transaction: real.transaction.bind(real),
      issue: async (...args: Parameters<ActivationLinkService['issue']>) => {
        await beforeIssue.wait();
        return real.issue(...args);
      },
      deliver: real.deliver.bind(real),
    } as unknown as ActivationLinkService;
    const service = buildService(w, { links });
    const creating = service.create(
      SYSTEM_SCOPE,
      w.actor.taiKhoanId,
      doctorInput(w),
    );
    try {
      await Promise.race([beforeIssue.reached, creating]);

      const locks = await recordLocks();
      // Hàng tài khoản vừa chèn: khoá X tường minh (lần kiểm khoá ngoại của hồ sơ đòi khoá hàng cha). Hàng `bac_si` và `ma_xac_thuc` vừa chèn chỉ có khoá
      // NGẦM của InnoDB (không có dòng nào ở data_locks), nên không đo được bằng bảng này: đã đo thật ở TRACKING 9A.6 mục 10.
      expect(held(locks, 'tai_khoan', 'X')).toBeGreaterThan(0);
      // Khoá S sớm (FOR SHARE) ở chuyên khoa và liên kết chi nhánh–dịch vụ; khoá S của khoá ngoại ở chi nhánh, dịch vụ
      for (const parent of [
        'chi_nhanh',
        'chuyen_khoa',
        'dich_vu_kham',
        'chi_nhanh_dich_vu_kham',
      ]) {
        expect(held(locks, parent, 'S')).toBeGreaterThan(0);
      }
      expect(held(locks, 'ma_xac_thuc', 'X')).toBe(0);
      expect(
        locks.filter((lock) => lock.status === 'WAITING'),
        'không có khoá nào đang chờ',
      ).toEqual([]);
      // Hồ sơ của bác sĩ KHÁC vẫn khoá được ngay (NOWAIT): B15 không khoá hàng bac_si của người khác
      const runner = db.createQueryRunner();
      try {
        await runner.startTransaction();
        await expect(
          runner.query(
            'SELECT tai_khoan_id FROM bac_si WHERE tai_khoan_id = ? FOR UPDATE NOWAIT',
            [other.profile.taiKhoanId],
          ),
        ).resolves.toHaveLength(1);
        await runner.rollbackTransaction();
      } finally {
        await runner.release();
      }
    } finally {
      // LUÔN mở cổng (xem ca trên)
      beforeIssue.open();
    }
    await expect(creating).resolves.toMatchObject({ loaiTaiKhoan: 'BacSi' });
  });
});

describe('chạy đua (NS-22)', () => {
  it('NSB15-50 (NS-22) 6 luồng tạo CÙNG một email (hoa thường lẫn lộn): ĐÚNG 1 thành công, 5 EMAIL_DA_DUNG, không 500 hay 1213 lọt ra; đúng 1 tài khoản, 1 hồ sơ, 1 liên kết, 1 dòng audit, 1 thư', async () => {
    const w = await worldOf();
    const before = await rowCounts(db);
    const variants = [
      'dua.nhan.su@example.com',
      'DUA.NHAN.SU@example.com',
      'Dua.Nhan.Su@Example.com',
      'dua.NHAN.su@example.com',
      'DUA.nhan.SU@example.com',
      'dUa.nHaN.sU@example.com',
    ];
    const outcomes = await Promise.allSettled(
      variants.map((email) =>
        createAs(w, SYSTEM_SCOPE, receptionistInput(w, { email })),
      ),
    );
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter(
      (o): o is PromiseRejectedResult => o.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(5);
    for (const failure of rejected) {
      expect(failure.reason).toBeInstanceOf(AppException);
      expect((failure.reason as AppException).getStatus()).toBe(409);
      expect((failure.reason as AppException).maLoi).toBe('EMAIL_DA_DUNG');
    }
    const after = await rowCounts(db);
    expect(after).toEqual({
      taiKhoan: before.taiKhoan + 1,
      bacSi: before.bacSi,
      leTan: before.leTan + 1,
      quanTriVien: before.quanTriVien,
      maXacThuc: before.maXacThuc + 1,
      nhatKy: before.nhatKy + 1,
    });
    expect(w.mail.attempts).toHaveLength(1);
  });

  it('NSB15-51 (NS-22, Q32) hai Admin cùng email của MỘT Bệnh nhân đã hết 24 giờ: đúng 1 thành công (tài khoản cũ bị xoá đúng một lần), 1 EMAIL_DA_DUNG; không deadlock lọt ra', async () => {
    const w = await worldOf();
    const email = 'dua.q32@example.com';
    const old = await insertTaiKhoan(db, {
      email,
      loaiTaiKhoan: 'BenhNhan',
      daXacMinhEmail: false,
      trangThai: 'DangHoatDong',
      thoiDiemTao: new Date(T0.getTime() - 25 * HOUR_MS),
    });
    const before = await rowCounts(db);
    const outcomes = await Promise.allSettled([
      createAs(w, SYSTEM_SCOPE, receptionistInput(w, { email })),
      createAs(w, SYSTEM_SCOPE, receptionistInput(w, { email })),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.filter(
      (o): o is PromiseRejectedResult => o.status === 'rejected',
    );
    expect(rejected).toHaveLength(1);
    const reason: unknown = rejected[0]?.reason;
    expect(reason).toBeInstanceOf(AppException);
    expect((reason as AppException).maLoi).toBe('EMAIL_DA_DUNG');

    expect(
      await db
        .getRepository(TaiKhoan)
        .findOneBy({ taiKhoanId: old.taiKhoanId }),
    ).toBeNull();
    // Tài khoản cũ bị xoá (−1), nhân sự mới được tạo (+1): số tài khoản không đổi; đúng 1 hồ sơ, 1 liên kết, 1 audit, 1 thư
    expect(await rowCounts(db)).toEqual({
      ...before,
      leTan: before.leTan + 1,
      maXacThuc: before.maXacThuc + 1,
      nhatKy: before.nhatKy + 1,
    });
    expect(w.mail.attempts).toHaveLength(1);
    const created = await db.getRepository(TaiKhoan).findOneByOrFail({ email });
    expect(await auditRowsOf(db, created.taiKhoanId)).toHaveLength(1);
  });

  it('NSB15-52 (NS-22) 6 Admin tạo 6 Bác sĩ khác email cùng lúc ở cùng chi nhánh, chuyên khoa, dịch vụ: cả 6 thành công, không ai chặn nhau, không deadlock lọt ra', async () => {
    const w = await worldOf();
    const before = await rowCounts(db);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        createAs(w, SYSTEM_SCOPE, doctorInput(w, { email: newEmail('song') })),
      ),
    );
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(6);
    expect(outcomes.filter((o) => o.status === 'rejected')).toEqual([]);
    expect(await rowCounts(db)).toEqual({
      ...before,
      taiKhoan: before.taiKhoan + 6,
      bacSi: before.bacSi + 6,
      maXacThuc: before.maXacThuc + 6,
      nhatKy: before.nhatKy + 6,
    });
    expect(w.mail.attempts).toHaveLength(6);
  });
});
