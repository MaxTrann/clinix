import type { DataSource } from 'typeorm';
import { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';
import { dbErrorCode } from '../../auth/entities/testing/auth-fixtures.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import { BacSi } from '../entities/bac-si.entity.js';
import { ChiNhanh } from '../entities/chi-nhanh.entity.js';
import { ChiNhanhLichHoatDong } from '../entities/chi-nhanh-lich-hoat-dong.entity.js';
import { ChuyenKhoa } from '../entities/chuyen-khoa.entity.js';
import { LichHen } from '../entities/lich-hen.entity.js';
import { TRANG_THAI_LICH_HEN } from '../entities/enums.js';
import { AdminFixtures, FIXTURE_APPOINTMENT_TIME } from './admin-fixtures.js';
import { freezeTime, runConcurrently } from './test-helpers.js';

// P4 #48 không có mã riêng; các ca dưới kiểm fixture, không thay thế test nghiệp vụ B*/C*.
let db: DataSource;
let fixtures: AdminFixtures;
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

describe('P4 — fixture trên MySQL thật', () => {
  it('từ chối factory dùng DB ngoài *_test trước khi ghi', () => {
    expect(
      () =>
        new AdminFixtures({ options: { database: 'clinix' } } as DataSource),
    ).toThrow('Từ chối');
  });

  it('tạo chi nhánh, đủ bảy thứ ISO, nghỉ cả tuần và CHECK giờ không hợp lệ', async () => {
    const branch = await fixtures.branch({ ten: 'Chi nhánh kiểm thử' });
    const days = await fixtures.weeklySchedule(branch.chiNhanhId);
    expect(days.map((day) => day.thuTrongTuan)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const other = await fixtures.branch();
    await fixtures.weeklySchedule(other.chiNhanhId, {
      hoatDong: false,
      gioBatDauSang: null,
      gioKetThucSang: null,
      gioBatDauChieu: null,
      gioKetThucChieu: null,
    });
    expect(
      await db.getRepository(ChiNhanhLichHoatDong).countBy({ hoatDong: false }),
    ).toBe(7);
    expect(
      await dbErrorCode(
        db
          .getRepository(ChiNhanhLichHoatDong)
          .update(
            { chiNhanhId: branch.chiNhanhId, thuTrongTuan: 1 },
            { gioKetThucSang: '07:00:00' },
          ),
      ),
    ).toBe('ER_CHECK_CONSTRAINT_VIOLATED');
  });

  it('tạo đủ bốn vai trò, hai phạm vi admin, trạng thái tài khoản ghi đè được', async () => {
    const branch = await fixtures.branch();
    const doctor = await fixtures.doctor(branch, { soNamKinhNghiem: 10 });
    const patient = await fixtures.patient({ trangThai: 'NgungHoatDong' });
    const receptionist = await fixtures.receptionist(branch);
    const globalAdmin = await fixtures.admin();
    const branchAdmin = await fixtures.admin(branch);
    expect(doctor.profile.soNamKinhNghiem).toBe(10);
    expect(patient.wallet.benhNhanId).toBe(patient.account.taiKhoanId);
    expect(receptionist.profile.chiNhanhId).toBe(branch.chiNhanhId);
    expect(globalAdmin.profile).toMatchObject({
      phamViQuanTri: 'ToanHeThong',
      chiNhanhId: null,
    });
    expect(branchAdmin.profile).toMatchObject({
      phamViQuanTri: 'ChiNhanh',
      chiNhanhId: branch.chiNhanhId,
    });
    expect(await db.getRepository(TaiKhoan).count()).toBe(5);
    expect(
      (
        await db
          .getRepository(TaiKhoan)
          .findOneByOrFail({ taiKhoanId: patient.account.taiKhoanId })
      ).trangThai,
    ).toBe('NgungHoatDong');
  });

  it('tạo ca, khung giờ, mọi trạng thái lịch hẹn với snapshot và cột sinh đúng', async () => {
    freezeTime(new Date(FIXTURE_APPOINTMENT_TIME));
    const branch = await fixtures.branch();
    const { profile: doctor } = await fixtures.doctor(branch);
    const patient = await fixtures.patient();
    const shift = await fixtures.shift(doctor);
    for (const [index, status] of TRANG_THAI_LICH_HEN.entries()) {
      const time = new Date(Date.now() + index * 30 * 60_000);
      const slot = await fixtures.slot(shift, { ngayGio: time });
      const appointment = await fixtures.appointment(
        doctor,
        slot,
        patient.account.taiKhoanId,
        {
          trangThai: status,
          giaSnapshot: '123456.78',
        },
      );
      const persisted = await db
        .getRepository(LichHen)
        .findOneByOrFail({ lichHenId: appointment.lichHenId });
      expect(persisted.thoiGian.getTime()).toBe(time.getTime());
      expect(persisted.giaSnapshot).toBe('123456.78');
      expect(persisted.khungGioDangGiu).toBe(
        ['DaHuy', 'DaDoiLich'].includes(status) ? null : slot.khungGioId,
      );
    }
    expect(await db.getRepository(LichHen).count()).toBe(7);
  });

  it('factory dùng EntityManager rollback toàn bộ đồ thị khi test cần giao dịch', async () => {
    const failure = new Error('Rollback fixture');
    await expect(
      db.transaction(async (manager) => {
        const transactional = new AdminFixtures(manager);
        const branch = await transactional.branch();
        await transactional.doctor(branch);
        throw failure;
      }),
    ).rejects.toThrow(failure);
    expect(await db.getRepository(ChiNhanh).count()).toBe(0);
    expect(await db.getRepository(BacSi).count()).toBe(0);
    expect(await db.getRepository(TaiKhoan).count()).toBe(0);
  });

  it('CK-18: hai kết nối ghi tên trùng chỉ một thành công nhờ UNIQUE thật', async () => {
    const results = await runConcurrently(
      [1, 2].map(() => async () => {
        const runner = db.createQueryRunner();
        try {
          await runner.connect();
          const repo = runner.manager.getRepository(ChuyenKhoa);
          return await repo.save(
            repo.create({ ten: 'Tên chuyên khoa chạy đua' }),
          );
        } finally {
          await runner.release();
        }
      }),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(
      rejected?.status === 'rejected'
        ? (rejected.reason as { driverError: { code: string } }).driverError
            .code
        : null,
    ).toBe('ER_DUP_ENTRY');
    expect(await db.getRepository(ChuyenKhoa).count()).toBe(1);
  });
});
