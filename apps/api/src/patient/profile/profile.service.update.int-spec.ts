import { HttpException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import type { TaiKhoan } from '../../auth/entities/tai-khoan.entity.js';
import { insertTaiKhoan } from '../../auth/entities/testing/auth-fixtures.js';
import { todayVN } from '../../common/time/time.js';
import {
  accountRow,
  birthDateText,
  CHANGES_A,
  CHANGES_B,
  changedColumns,
  expectSessionLost,
  failureOf,
  PROFILE_COLUMNS,
  snapshotTables,
  useProfileIntegration,
} from '../testing/profile-update-helpers.js';
import { ProfileRepository } from './profile.repository.js';
import type { ProfileChanges } from './profile.repository.js';
import type { ProfileService } from './profile.service.js';

// Task B2 — PUT /profile ở tầng dịch vụ trên MySQL 8.4 THẬT: đúng 5 cột đổi, mọi cột/bảng khác giữ nguyên, 0 hàng ⇒ 401, PUT giống hệt, ngày biên,
// rollback. HTTP thật: test/patient-profile-update.e2e-spec.ts; đua nhau: profile.service.update.concurrency.int-spec.ts.
// Mã ca PUI-nn là [đề xuất] (TRACKING patient B2-G). Dữ liệu cá nhân giả (đuôi .invalid), không CCCD thật.
const profiles = new ProfileRepository();
let db: DataSource;
let fx: AdminFixtures;
let service: ProfileService;

useProfileIntegration(profiles, (testDb, fixtures, profileService) => {
  db = testDb;
  fx = fixtures;
  service = profileService;
});

// Hồ sơ "trước khi sửa": KHÁC CHANGES_A ở cả năm trường, và có ảnh đại diện (cột không được đụng)
const BEFORE: Partial<TaiKhoan> = {
  hoTen: 'Tên Cũ Giả',
  soDienThoai: '0900000000',
  gioiTinh: null,
  ngaySinh: null,
  diaChi: null,
  anhDaiDien: 'https://anh.clinix.invalid/a.png',
};
const PROFILE_COLUMN_LIST = [...PROFILE_COLUMNS];

// Gọi updateProfile rồi trả kết quả + tên các cột của hàng `tai_khoan` đã đổi
async function putAndDiff(
  accountId: string,
  changes: ProfileChanges = CHANGES_A,
) {
  const before = await accountRow(db, accountId);
  const result = await service.updateProfile(accountId, changes);
  return {
    result,
    changed: changedColumns(before, await accountRow(db, accountId)),
  };
}

describe('ProfileService.updateProfile trên MySQL thật', () => {
  it('PUI-01 (HS-04) Bệnh nhân: đúng 5 cột đổi, mọi cột khác của tai_khoan (email, băm, ảnh, trạng thái, loại) và benh_nhan, vi_noi_bo giữ nguyên; phản hồi bằng GET', async () => {
    const { account } = await fx.patient(BEFORE);
    const others = ['benh_nhan', 'vi_noi_bo'];
    const snapshot = await snapshotTables(db, others);

    const { result, changed } = await putAndDiff(account.taiKhoanId);

    expect(changed).toEqual(PROFILE_COLUMN_LIST);
    expect(await snapshotTables(db, others)).toEqual(snapshot);
    expect(result).toStrictEqual(await service.getProfile(account.taiKhoanId));
    expect(result).toMatchObject(CHANGES_A);
    expect(result).toMatchObject({
      email: account.email,
      anhDaiDien: null,
      vaiTro: 'BenhNhan',
    });
  });

  it.each(['LeTan', 'QuanTriVien ToanHeThong', 'QuanTriVien ChiNhanh'])(
    'PUI-02 (HS-05) %s: đúng 5 cột của tai_khoan đổi; le_tan, quan_tri_vien, chi_nhanh không đổi; chi nhánh và phạm vi trong phản hồi giữ nguyên',
    async (kind) => {
      const branch = await fx.branch({ ten: 'Chi nhánh của tôi' });
      await fx.branch({ ten: 'Chi nhánh khác' });
      const made =
        kind === 'LeTan'
          ? await fx.receptionist(branch, BEFORE)
          : kind === 'QuanTriVien ToanHeThong'
            ? await fx.admin(undefined, BEFORE)
            : await fx.admin(branch, BEFORE);
      const id = made.account.taiKhoanId;
      const tables = ['le_tan', 'quan_tri_vien', 'chi_nhanh'];
      const snapshot = await snapshotTables(db, tables);
      const read = await service.getProfile(id);

      const { result, changed } = await putAndDiff(id);

      expect(changed).toEqual(PROFILE_COLUMN_LIST);
      expect(await snapshotTables(db, tables)).toEqual(snapshot);
      expect(result.chiNhanh).toEqual(read.chiNhanh);
      expect(result.phamViQuanTri).toBe(read.phamViQuanTri);
      expect(result).toMatchObject(CHANGES_A);
    },
  );

  it('PUI-03 (HS-16) Bác sĩ: đúng 5 cột của tai_khoan đổi; bac_si không đổi cột nào (H14); chiNhanh giữ nguyên', async () => {
    const branch = await fx.branch({ ten: 'Chi nhánh Bác sĩ' });
    const { account } = await fx.doctor(branch, {}, BEFORE);
    const tables = ['bac_si', 'chi_nhanh', 'chuyen_khoa'];
    const snapshot = await snapshotTables(db, tables);

    const { result, changed } = await putAndDiff(account.taiKhoanId);

    expect(changed).toEqual(PROFILE_COLUMN_LIST);
    expect(await snapshotTables(db, tables)).toEqual(snapshot);
    expect(result.vaiTro).toBe('BacSi');
    expect(result.chiNhanh).toEqual({
      chiNhanhId: branch.chiNhanhId,
      ten: 'Chi nhánh Bác sĩ',
    });
  });

  it('PUI-04 (HS-14) gửi null ⇒ giới tính, ngày sinh, địa chỉ về NULL thật (không chuỗi "null"); họ tên, SĐT vẫn đổi', async () => {
    const { account } = await fx.patient({
      ...BEFORE,
      gioiTinh: 'Nam',
      ngaySinh: '1980-08-08',
      diaChi: 'Địa chỉ cũ',
    });

    const result = await service.updateProfile(account.taiKhoanId, {
      ...CHANGES_A,
      gioiTinh: null,
      ngaySinh: null,
      diaChi: null,
    });

    const [stored] = await db.query<Record<string, unknown>[]>(
      'SELECT gioi_tinh IS NULL AS g, ngay_sinh IS NULL AS n, dia_chi IS NULL AS d, ho_ten, so_dien_thoai FROM tai_khoan WHERE tai_khoan_id = ?',
      [account.taiKhoanId],
    );
    // Biểu thức `IS NULL` (BIGINT) ra chuỗi '1' ở kết nối này
    expect([stored?.['g'], stored?.['n'], stored?.['d']].map(String)).toEqual([
      '1',
      '1',
      '1',
    ]);
    expect(stored?.['ho_ten']).toBe(CHANGES_A.hoTen);
    expect(stored?.['so_dien_thoai']).toBe(CHANGES_A.soDienThoai);
    expect([result.gioiTinh, result.ngaySinh, result.diaChi]).toEqual([
      null,
      null,
      null,
    ]);
  });

  describe('PUI-05 (H9, HS-15) tài khoản không còn DangHoatDong sau khi guard cho qua', () => {
    it.each([
      [
        'NgungHoatDong',
        () => fx.patient({ ...BEFORE, trangThai: 'NgungHoatDong' }),
      ],
      [
        'ChoKichHoat',
        async () => ({
          account: await insertTaiKhoan(db, {
            ...BEFORE,
            trangThai: 'ChoKichHoat',
            matKhauBam: null,
            loaiTaiKhoan: 'LeTan', // CHECK cấm Bệnh nhân ở ChoKichHoat
          }),
        }),
      ],
    ] as const)(
      '%s ⇒ 401 PHIEN_HET_HIEU_LUC và không cột nào đổi',
      async (_label, make) => {
        const { account } = await make();
        const before = await accountRow(db, account.taiKhoanId);

        await expectSessionLost(() =>
          service.updateProfile(account.taiKhoanId, CHANGES_A),
        );

        expect(await accountRow(db, account.taiKhoanId)).toEqual(before);
      },
    );

    it('hàng không tồn tại ⇒ 401 PHIEN_HET_HIEU_LUC', async () => {
      await fx.patient(BEFORE);
      const snapshot = await snapshotTables(db, ['tai_khoan']);

      await expectSessionLost(() => service.updateProfile('999999', CHANGES_A));

      expect(await snapshotTables(db, ['tai_khoan'])).toEqual(snapshot);
    });
  });

  it('PUI-06 PUT GIỐNG HỆT dữ liệu hiện có ⇒ thành công (không 401), dữ liệu giữ nguyên; làm lại lần nữa vẫn thành công [canh cờ FOUND_ROWS của mysql2]', async () => {
    const { account } = await fx.patient({
      hoTen: CHANGES_A.hoTen,
      soDienThoai: CHANGES_A.soDienThoai,
      gioiTinh: CHANGES_A.gioiTinh,
      ngaySinh: CHANGES_A.ngaySinh,
      diaChi: CHANGES_A.diaChi,
    });
    const before = await accountRow(db, account.taiKhoanId);

    for (let round = 0; round < 2; round += 1) {
      await expect(
        service.updateProfile(account.taiKhoanId, CHANGES_A),
      ).resolves.toMatchObject(CHANGES_A);
    }

    expect(await accountRow(db, account.taiKhoanId)).toEqual(before);
    // Bằng chứng nền: UPDATE giống hệt thật sự báo 0 hàng ĐỔI (nếu không, ca này không canh được gì)
    const raw = await db.manager.query<{
      affectedRows: number;
      changedRows: number;
    }>(
      "UPDATE tai_khoan SET ho_ten = ? WHERE tai_khoan_id = ? AND trang_thai = 'DangHoatDong'",
      [CHANGES_A.hoTen, account.taiKhoanId],
    );
    expect([raw.affectedRows, raw.changedRows]).toEqual([1, 0]);
  });

  it('PUI-13 (H9) ProfileRepository.updateProfile gọi TRỰC TIẾP: trả số hàng KHỚP (PUT giống hệt ⇒ 1); NgungHoatDong và mã không tồn tại ⇒ 0 và không ghi — điều kiện trang_thai nằm trong chính câu UPDATE, không nhờ service hoàn tác', async () => {
    const active = await fx.patient(BEFORE);
    const suspended = await fx.patient({
      ...BEFORE,
      trangThai: 'NgungHoatDong',
    });
    const suspendedBefore = await accountRow(db, suspended.account.taiKhoanId);

    await expect(
      profiles.updateProfile(
        db.manager,
        suspended.account.taiKhoanId,
        CHANGES_A,
      ),
    ).resolves.toBe(0);
    await expect(
      profiles.updateProfile(db.manager, '999999', CHANGES_A),
    ).resolves.toBe(0);
    expect(await accountRow(db, suspended.account.taiKhoanId)).toEqual(
      suspendedBefore,
    );

    for (const round of [1, 2]) {
      // Lần 2 giống hệt lần 1: vẫn khớp 1 hàng dù không có cột nào đổi
      await expect(
        profiles.updateProfile(
          db.manager,
          active.account.taiKhoanId,
          CHANGES_A,
        ),
        `lần ${String(round)}`,
      ).resolves.toBe(1);
    }
  });

  it.each(['1900-01-01', '1999-12-31', '2000-01-01', '2024-02-29', 'HOM_NAY'])(
    'PUI-07 ngày sinh biên %s ghi rồi đọc lại ra ĐÚNG chuỗi (phản hồi, GET, và DATE_FORMAT thẳng từ DB), không lệch múi giờ +07:00',
    async (value) => {
      const day = value === 'HOM_NAY' ? todayVN() : value;
      const { account } = await fx.patient(BEFORE);

      const result = await service.updateProfile(account.taiKhoanId, {
        ...CHANGES_A,
        ngaySinh: day,
      });

      expect(result.ngaySinh).toBe(day);
      expect((await service.getProfile(account.taiKhoanId)).ngaySinh).toBe(day);
      expect(await birthDateText(db, account.taiKhoanId)).toBe(day);
    },
  );

  it('PUI-08 giới hạn lưu: họ tên 100 ký tự có dấu, địa chỉ 255 điểm mã (ký tự ngoài BMP), SĐT 10 số lưu nguyên vẹn (không "Data too long")', async () => {
    const { account } = await fx.patient(BEFORE);
    const changes: ProfileChanges = {
      hoTen: 'Đ'.repeat(100),
      soDienThoai: '0987654321',
      gioiTinh: 'Khac',
      ngaySinh: '1990-05-15',
      diaChi: '🏥'.repeat(255),
    };

    const result = await service.updateProfile(account.taiKhoanId, changes);

    expect(result.hoTen).toBe(changes.hoTen);
    expect(Array.from(result.diaChi ?? '')).toHaveLength(255);
    expect(result.diaChi).toBe(changes.diaChi);
    expect(result.soDienThoai).toBe('0987654321');
  });

  it('PUI-09 (QP-05) PUT cho tài khoản A: không hàng nào khác của tai_khoan đổi (cùng vai trò hay khác vai trò)', async () => {
    const branch = await fx.branch();
    const a = await fx.patient(BEFORE);
    await fx.patient({ ...BEFORE, hoTen: 'Bệnh Nhân Khác' });
    await fx.receptionist(branch, { hoTen: 'Lễ Tân Khác' });
    await fx.admin(undefined, { hoTen: 'Quản Trị Khác' });
    const before = await snapshotTables(db, ['tai_khoan']);

    await service.updateProfile(a.account.taiKhoanId, CHANGES_B);

    const after = await snapshotTables(db, ['tai_khoan']);
    const rowsBefore = before[0] as Record<string, unknown>[];
    const rowsAfter = after[0] as Record<string, unknown>[];
    expect(rowsAfter).toHaveLength(rowsBefore.length);
    const changedIds = rowsAfter
      .filter(
        (row, index) =>
          JSON.stringify(row) !== JSON.stringify(rowsBefore[index]),
      )
      .map((row) => String(row['tai_khoan_id']));
    expect(changedIds).toEqual([a.account.taiKhoanId]);
  });

  it('PUI-10 (BM-02) Bác sĩ thiếu hàng bac_si ⇒ lỗi nội bộ (không phải HttpException, không dữ liệu cá nhân) và ROLLBACK: hàng tai_khoan không đổi', async () => {
    const account = await insertTaiKhoan(db, {
      ...BEFORE,
      loaiTaiKhoan: 'BacSi',
      daXacMinhEmail: true,
    });
    const before = await accountRow(db, account.taiKhoanId);

    const error = await failureOf(() =>
      service.updateProfile(account.taiKhoanId, CHANGES_A),
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(HttpException);
    expect((error as Error).message).toContain(account.taiKhoanId);
    expect((error as Error).message).not.toContain(CHANGES_A.hoTen);
    expect((error as Error).message).not.toContain(String(BEFORE.hoTen));
    expect(await accountRow(db, account.taiKhoanId)).toEqual(before);
  });

  it('PUI-11 (BM-02) lỗi DB ở bước đọc lại sau UPDATE ⇒ lỗi đi nguyên và ROLLBACK (giao dịch bao cả hai câu): hàng không đổi', async () => {
    const { account } = await fx.patient(BEFORE);
    const before = await accountRow(db, account.taiKhoanId);
    const failure = new Error('mất kết nối khi đọc lại');
    vi.spyOn(profiles, 'findProfile').mockRejectedValueOnce(failure);

    const error = await failureOf(() =>
      service.updateProfile(account.taiKhoanId, CHANGES_A),
    );

    expect(error).toBe(failure);
    expect(await accountRow(db, account.taiKhoanId)).toEqual(before);
  });
});
