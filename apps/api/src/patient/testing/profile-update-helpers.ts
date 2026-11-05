import { UnauthorizedException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { expect } from 'vitest';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import type {
  ProfileChanges,
  ProfileRepository,
} from '../profile/profile.repository.js';
import { ProfileService } from '../profile/profile.service.js';

// Hàm trợ giúp DÙNG CHUNG của test tích hợp `PUT /profile` (task B2; TRACKING patient B2-A, B2-G). Gom một chỗ để hai file int
// (profile.service.update.int-spec.ts, ...concurrency.int-spec.ts) không chép nhau: CI chỉ bỏ `**/*.spec.ts` khỏi jscpd nên `*.int-spec.ts` vẫn bị quét.
export const SESSION_LOST = 'PHIEN_HET_HIEU_LUC';

/** Đúng năm cột mà `PUT /profile` được ghi (tên cột DB). */
export const PROFILE_COLUMNS = [
  'dia_chi',
  'gioi_tinh',
  'ho_ten',
  'ngay_sinh',
  'so_dien_thoai',
] as const;

// Hai bộ hồ sơ KHÁC NHAU ở cả năm trường (dữ liệu giả, không phải người thật)
export const CHANGES_A: ProfileChanges = {
  hoTen: 'Nguyễn Thị Bộ Một',
  soDienThoai: '0911111111',
  gioiTinh: 'Nu',
  ngaySinh: '1991-01-11',
  diaChi: '11 Đường Bộ Một, Phường Giả',
};
export const CHANGES_B: ProfileChanges = {
  hoTen: 'Trần Văn Bộ Hai',
  soDienThoai: '0922222222',
  gioiTinh: 'Nam',
  ngaySinh: '1992-02-22',
  diaChi: '22 Đường Bộ Hai, Phường Giả',
};

type Row = Record<string, unknown>;

/**
 * Dựng hạ tầng chung của test tích hợp PUT: mở kết nối, xoá bảng, giả đồng hồ trước mỗi test (`useIntegrationHooks` của auth), rồi đưa cho file test
 * kết nối, fixture và dịch vụ hồ sơ dùng đúng `profiles` truyền vào (để file test có thể `vi.spyOn` nó).
 */
export function useProfileIntegration(
  profiles: ProfileRepository,
  assign: (db: DataSource, fx: AdminFixtures, service: ProfileService) => void,
): void {
  useIntegrationHooks((db) => {
    assign(db, new AdminFixtures(db), new ProfileService(db, profiles));
  });
}

/** Hàng `tai_khoan` nguyên văn, MỌI cột (cột DATE ra Date: chỉ dùng để so sánh trước/sau, giá trị ngày đọc bằng `birthDateText`). */
export async function accountRow(
  db: DataSource,
  taiKhoanId: string,
): Promise<Row> {
  const rows = await db.query<Row[]>(
    'SELECT * FROM tai_khoan WHERE tai_khoan_id = ?',
    [taiKhoanId],
  );
  return rows[0] ?? {};
}

/** Tên các cột có giá trị khác nhau giữa hai hàng (đã sắp xếp). */
export function changedColumns(before: Row, after: Row): string[] {
  return Object.keys({ ...before, ...after })
    .filter(
      (column) =>
        JSON.stringify(before[column]) !== JSON.stringify(after[column]),
    )
    .sort();
}

/** `ngay_sinh` đọc thẳng từ DB bằng DATE_FORMAT (không qua Date, không lệch múi giờ). */
export async function birthDateText(
  db: DataSource,
  taiKhoanId: string,
): Promise<string | null> {
  const rows = await db.query<{ ngay: string | null }[]>(
    "SELECT DATE_FORMAT(ngay_sinh, '%Y-%m-%d') AS ngay FROM tai_khoan WHERE tai_khoan_id = ?",
    [taiKhoanId],
  );
  return rows[0]?.ngay ?? null;
}

/** Ảnh chụp mọi hàng của các bảng, để so trước/sau (mẫu PFI-14 của B1). */
export const snapshotTables = (db: DataSource, tables: readonly string[]) =>
  Promise.all(
    tables.map((table) => db.query(`SELECT * FROM ${table} ORDER BY 1`)),
  );

/** Lỗi mà việc đó ném ra (`null` nếu thành công). */
export const failureOf = (work: () => Promise<unknown>) =>
  work().then(
    () => null,
    (reason: unknown) => reason,
  );

/** Việc đó phải ném 401 `PHIEN_HET_HIEU_LUC` (H9). */
export async function expectSessionLost(
  work: () => Promise<unknown>,
): Promise<void> {
  const error = await failureOf(work);
  expect(error).toBeInstanceOf(UnauthorizedException);
  expect((error as UnauthorizedException).message).toBe(SESSION_LOST);
  expect((error as UnauthorizedException).getStatus()).toBe(401);
}
