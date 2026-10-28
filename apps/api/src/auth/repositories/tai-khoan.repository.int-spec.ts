import type { DataSource } from 'typeorm';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { insertTaiKhoan } from '../entities/testing/auth-fixtures.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import { TaiKhoanRepository } from './tai-khoan.repository.js';

// Task A5 — câu DELETE của `deleteUnverifiedPatient` ở tầng SQL, gọi TRỰC TIẾP (không qua luật `isExpiredUnverifiedPatient`). Điều kiện bảo vệ nằm trong
// chính câu lệnh để dù tầng trên kiểm sai thì nhân sự, tài khoản đã xác minh và tài khoản bị ngưng vẫn không thể bị xoá (H1, DK-34, DK-35, A5-F).
// Bịt lỗ hổng do đột biến K11a phát hiện: mọi test khác đi qua `purgeIfExpired`, đã bị luật chặn trước nên không chạm tới lớp SQL này.
// Mã RP-nn là [đề xuất].
let db: DataSource;
const repo = new TaiKhoanRepository();

useIntegrationHooks((testDb) => {
  db = testDb;
});

const deleteOf = (id: string) =>
  db.transaction((em) => repo.deleteUnverifiedPatient(em, id));
const stillThere = async (id: string) =>
  (await db.getRepository(TaiKhoan).countBy({ taiKhoanId: id })) === 1;
const unverified = (overrides: Partial<TaiKhoan> = {}) =>
  insertTaiKhoan(db, { daXacMinhEmail: false, ...overrides });

describe('deleteUnverifiedPatient — chỉ xoá Bệnh nhân chưa xác minh đang hoạt động (H1)', () => {
  it('RP-01 xoá đúng tài khoản được gọi và trả true; tài khoản khác còn nguyên', async () => {
    const target = await unverified();
    const other = await unverified({ email: 'khac@example.com' });

    expect(await deleteOf(target.taiKhoanId)).toBe(true);

    expect(await stillThere(target.taiKhoanId)).toBe(false);
    expect(await stillThere(other.taiKhoanId)).toBe(true);
  });

  it.each([
    ['Bệnh nhân ĐÃ xác minh email', { daXacMinhEmail: true }],
    [
      'Bệnh nhân chưa xác minh bị NGƯNG hoạt động',
      { trangThai: 'NgungHoatDong' },
    ],
    ['Bác sĩ chưa xác minh đang hoạt động', { loaiTaiKhoan: 'BacSi' }],
    ['Quản trị viên chưa xác minh', { loaiTaiKhoan: 'QuanTriVien' }],
    [
      'Lễ tân chờ kích hoạt',
      { loaiTaiKhoan: 'LeTan', trangThai: 'ChoKichHoat', matKhauBam: null },
    ],
  ] as [string, Partial<TaiKhoan>][])(
    'RP-02 không xoá và trả false: %s',
    async (_label, overrides) => {
      const account = await unverified(overrides);

      expect(await deleteOf(account.taiKhoanId)).toBe(false);

      expect(await stillThere(account.taiKhoanId)).toBe(true);
    },
  );

  it('RP-03 id không tồn tại → false, không lỗi', async () => {
    expect(await deleteOf('987654321')).toBe(false);
  });
});
