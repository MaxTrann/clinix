import type { DataSource } from 'typeorm';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { CauHinhHeThong } from '../../admin/entities/cau-hinh-he-thong.entity.js';
import { ChiNhanh } from '../../admin/entities/chi-nhanh.entity.js';
import { NhatKyHanhDong } from '../../admin/entities/nhat-ky-hanh-dong.entity.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import { CONFIG_DEMO } from '../../database/seeds/catalog-data.js';
import { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';
import { AuditRepository } from '../audit.repository.js';
import { AuditService } from '../audit.service.js';
import { auditEntries } from '../testing/audit-fixtures.js';

describe('C2-01…08 — MySQL thật (chỉ cơ chế, chưa acceptance B-task)', () => {
  let db: DataSource;
  let fixtures: AdminFixtures;
  const service = new AuditService(new AuditRepository());
  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    fixtures = new AdminFixtures(db);
  });
  beforeEach(async () => {
    await resetTables(db);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    await db?.destroy();
  });

  it('C2-01 manager global/released/nontransaction bị chặn', async () => {
    const entry = auditEntries()[0]!;
    await expect(service.record(db.manager, entry)).rejects.toThrow(
      'AUDIT_TRANSACTION_REQUIRED',
    );
    const runner = db.createQueryRunner();
    try {
      await runner.connect();
      await expect(service.record(runner.manager, entry)).rejects.toThrow(
        'AUDIT_TRANSACTION_REQUIRED',
      );
      await runner.startTransaction();
      await runner.rollbackTransaction();
      await runner.release();
      await expect(service.record(runner.manager, entry)).rejects.toThrow(
        'AUDIT_TRANSACTION_REQUIRED',
      );
    } finally {
      if (!runner.isReleased) await runner.release();
    }
    expect(await db.getRepository(NhatKyHanhDong).count()).toBe(0);
  });
  it('C2-02/03 đủ 11 action lưu đúng entry, không đòi FK target lịch sử', async () => {
    const { account } = await fixtures.admin();
    const branch = await fixtures.branch();
    const entries = auditEntries(account.taiKhoanId, branch.chiNhanhId);
    await db.transaction(async (manager) => {
      for (const entry of entries) await service.record(manager, entry);
    });
    const rows = await db
      .getRepository(NhatKyHanhDong)
      .find({ order: { nhatKyHanhDongId: 'ASC' } });
    expect(rows).toHaveLength(11);
    rows.forEach((row, index) => {
      const entry = entries[index]!;
      expect(row).toMatchObject({
        taiKhoanId: entry.actorId,
        chiNhanhId: entry.branchId,
        hanhDong: entry.action,
        loaiDoiTuong: entry.targetType,
        maDoiTuong: entry.targetId,
        ketQua: entry.result,
        chiTietThayDoi: entry.changes,
      });
    });
  });
  it('C2-02 giữ nguyên bigint >2^53 qua driver và JSON', async () => {
    const actorId = '9007199254740993';
    const branchId = '9007199254740995';
    // Không dùng ID trả lại của save/insertId cho fixture bigint; lookup/mã audit dùng đúng chuỗi đã chỉ định.
    await db.getRepository(TaiKhoan).insert({
      taiKhoanId: actorId,
      hoTen: 'Actor mẫu',
      soDienThoai: '0900000000',
      email: 'audit@example.invalid',
      loaiTaiKhoan: 'QuanTriVien',
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
    });
    await db.getRepository(ChiNhanh).insert({
      chiNhanhId: branchId,
      ten: 'Chi nhánh bigint mẫu',
      diaChi: 'Minh họa',
    });
    const entry = {
      ...auditEntries(actorId, branchId)[0]!,
      targetId: '9223372036854775807',
    };
    await db.transaction((manager) => service.record(manager, entry));
    const row = (await db.getRepository(NhatKyHanhDong).find())[0]!;
    expect([row.taiKhoanId, row.chiNhanhId, row.maDoiTuong]).toEqual([
      actorId,
      branchId,
      entry.targetId,
    ]);
    expect(row.chiTietThayDoi?.chi_nhanh_id).toBe(branchId);
  });
  it('C2-04 nghiệp vụ và audit commit chung; lần tạo config ghi null từng tham số', async () => {
    const { account } = await fixtures.admin();
    const entry = auditEntries(account.taiKhoanId).find(
      (row) => row.action === 'CapNhatCauHinh',
    )!;
    entry.changes = {
      truoc: { check_in_truoc_phut: null },
      sau: { check_in_truoc_phut: 30 },
      ly_do: 'Khởi tạo thử',
    };
    await db.transaction(async (manager) => {
      await manager.insert(CauHinhHeThong, CONFIG_DEMO);
      await service.record(manager, entry);
    });
    expect(await db.getRepository(CauHinhHeThong).count()).toBe(1);
    expect(
      (await db.getRepository(NhatKyHanhDong).find())[0]!.chiTietThayDoi,
    ).toEqual(entry.changes);
  });
  it('C2-04 audit insert xong nhưng outer rollback thì cả nghiệp vụ/audit biến mất', async () => {
    const { account } = await fixtures.admin();
    const entry = auditEntries(account.taiKhoanId).find(
      (row) => row.action === 'CapNhatCauHinh',
    )!;
    await expect(
      db.transaction(async (manager) => {
        await manager.insert(CauHinhHeThong, CONFIG_DEMO);
        await service.record(manager, entry);
        expect(await manager.getRepository(NhatKyHanhDong).count()).toBe(1);
        throw new Error('rollback test');
      }),
    ).rejects.toThrow('rollback test');
    expect(await db.getRepository(CauHinhHeThong).count()).toBe(0);
    expect(await db.getRepository(NhatKyHanhDong).count()).toBe(0);
  });
  it.each(['actor', 'branch'] as const)(
    'C2-04 FK %s audit lỗi thì rollback thay đổi nghiệp vụ',
    async (missing) => {
      const { account } = await fixtures.admin();
      const branch = await fixtures.branch();
      const entry = auditEntries(account.taiKhoanId, branch.chiNhanhId)[0]!;
      if (missing === 'actor') entry.actorId = '9223372036854775807';
      else {
        entry.branchId = '9223372036854775807';
        entry.changes = {
          loai_tai_khoan: 'LeTan',
          chi_nhanh_id: entry.branchId,
        };
      }
      await expect(
        db.transaction(async (manager) => {
          await manager.update(ChiNhanh, branch.chiNhanhId, {
            ten: 'Không được commit',
          });
          await service.record(manager, entry);
        }),
      ).rejects.toThrow('AUDIT_WRITE_FAILED');
      expect(
        (
          await db
            .getRepository(ChiNhanh)
            .findOneByOrFail({ chiNhanhId: branch.chiNhanhId })
        ).ten,
      ).toBe(branch.ten);
      expect(await db.getRepository(NhatKyHanhDong).count()).toBe(0);
    },
  );
  it('C2-04 CHECK MySQL từ chối audit tầng thấp thì rollback cấu hình (cơ chế CH-15)', async () => {
    const { account } = await fixtures.admin();
    await expect(
      db.transaction(async (manager) => {
        await manager.insert(CauHinhHeThong, CONFIG_DEMO);
        await manager.insert(NhatKyHanhDong, {
          taiKhoanId: account.taiKhoanId,
          chiNhanhId: null,
          hanhDong: 'CapNhatCauHinh',
          loaiDoiTuong: 'cau_hinh_he_thong',
          maDoiTuong: '1',
          ketQua: 'ThanhCong',
          thoiDiem: new Date(),
          chiTietThayDoi: {
            truoc: { check_in_truoc_phut: 30 },
            sau: { check_in_truoc_phut: 45 },
            ly_do: '',
          },
        });
      }),
    ).rejects.toMatchObject({
      driverError: { code: 'ER_CHECK_CONSTRAINT_VIOLATED' },
    });
    expect(await db.getRepository(CauHinhHeThong).count()).toBe(0);
    expect(await db.getRepository(NhatKyHanhDong).count()).toBe(0);
  });
  it('C2-04/05 validation audit lỗi cũng rollback nghiệp vụ, không ghi payload sai', async () => {
    const { account } = await fixtures.admin();
    const entry = auditEntries(account.taiKhoanId).find(
      (row) => row.action === 'CapNhatCauHinh',
    )!;
    await expect(
      db.transaction(async (manager) => {
        await manager.insert(CauHinhHeThong, CONFIG_DEMO);
        await service.record(manager, {
          ...entry,
          changes: { ...entry.changes, ly_do: ' ' },
        });
      }),
    ).rejects.toThrow('AUDIT_ENTRY_INVALID');
    expect(await db.getRepository(CauHinhHeThong).count()).toBe(0);
    expect(await db.getRepository(NhatKyHanhDong).count()).toBe(0);
  });
  it('C2-06 cắt milliseconds, qua nửa đêm VN, session DB +07:00', async () => {
    const { account } = await fixtures.admin();
    const entry = auditEntries(account.taiKhoanId).find(
      (row) => row.action === 'CapNhatCauHinh',
    )!;
    vi.useFakeTimers({ toFake: ['Date'] });
    for (const date of [
      '2026-10-30T16:59:59.999Z',
      '2026-10-30T17:00:00.001Z',
    ]) {
      vi.setSystemTime(new Date(date));
      await db.transaction((manager) => service.record(manager, entry));
    }
    const rows: { at: string; timezone: string }[] = await db.query(
      "SELECT DATE_FORMAT(thoi_diem,'%Y-%m-%d %H:%i:%s') AS at, @@session.time_zone AS timezone FROM nhat_ky_hanh_dong ORDER BY nhat_ky_hanh_dong_id",
    );
    expect(rows).toEqual([
      { at: '2026-10-30 23:59:59', timezone: '+07:00' },
      { at: '2026-10-31 00:00:00', timezone: '+07:00' },
    ]);
  });
  it('C2-08 hai transaction đồng thời không trộn actor/branch/manager và không tự dedupe', async () => {
    const actors = await Promise.all([fixtures.admin(), fixtures.admin()]);
    const branches = await Promise.all([fixtures.branch(), fixtures.branch()]);
    const entries = actors.map(
      ({ account }, index) =>
        auditEntries(account.taiKhoanId, branches[index]!.chiNhanhId)[0]!,
    );
    await Promise.all(
      entries.map((entry) =>
        db.transaction(async (manager) => {
          await service.record(manager, entry);
          await service.record(manager, entry);
        }),
      ),
    );
    const rows = await db.getRepository(NhatKyHanhDong).find();
    expect(rows).toHaveLength(4);
    for (const entry of entries) {
      expect(
        rows.filter(
          (row) =>
            row.taiKhoanId === entry.actorId &&
            row.chiNhanhId === entry.branchId &&
            row.chiTietThayDoi?.chi_nhanh_id === entry.branchId,
        ),
      ).toHaveLength(2);
    }
  });
});
