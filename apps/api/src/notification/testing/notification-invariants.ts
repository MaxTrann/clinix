import type { DataSource } from 'typeorm';
import { expect } from 'vitest';

// notification X2 — bất biến sau scope thông báo (PLAN notification 5.12 "Bất biến sau scope"), chạy SAU mỗi vòng của ca đồng thời CTB. Mỗi bất biến là MỘT câu đếm "số dòng vi phạm" (phải bằng 0),
// đọc thẳng bảng chứ không qua mã của module, để lỗi của mã không che được lỗi của dữ liệu. Riêng IVN-05 so `soChuaDoc` của câu đếm Trung tâm thông báo dùng (`UNREAD_COUNT_SQL`) với số đếm độc lập.

const VIOLATIONS: Readonly<Record<string, string>> = {
  // IVN-01: mọi dòng thư có thông báo; mỗi thông báo tối đa một dòng thư
  'IVN-01 email_thong_bao mồ côi': `SELECT COUNT(*) AS n FROM email_thong_bao e
      LEFT JOIN thong_bao t ON t.thong_bao_id = e.thong_bao_id WHERE t.thong_bao_id IS NULL`,
  'IVN-01 thông báo có hơn một dòng thư': `SELECT COUNT(*) AS n FROM (
      SELECT thong_bao_id FROM email_thong_bao GROUP BY thong_bao_id HAVING COUNT(*) > 1) d`,
  // IVN-02: không trùng (lịch, tài khoản, loại); so không phân biệt hoa thường như collation của cột
  'IVN-02 thông báo trùng theo lịch': `SELECT COUNT(*) AS n FROM (
      SELECT lich_hen_id FROM thong_bao WHERE lich_hen_id IS NOT NULL
       GROUP BY lich_hen_id, tai_khoan_id, loai_su_kien HAVING COUNT(*) > 1) d`,
  // IVN-03: số lần thử trong [0, 3]; DaGui có `da_gui_luc`; ThatBai có `loi_cuoi`
  'IVN-03 nhac_lich_hen sai lần thử hay thiếu kết quả': `SELECT COUNT(*) AS n FROM nhac_lich_hen
      WHERE so_lan_thu NOT BETWEEN 0 AND 3
         OR (trang_thai = 'DaGui' AND da_gui_luc IS NULL)
         OR (trang_thai = 'ThatBai' AND loi_cuoi IS NULL)`,
  // IVN-04: nhắc lịch KHÔNG có thông báo hay dòng thư (2.4.75 b4). Nhắc lịch không có mã sự kiện nào; mẫu `NhacLich%` là `[đề xuất]` để bắt mã như vậy nếu có ai thêm
  'IVN-04 thông báo mang mã nhắc lịch': `SELECT COUNT(*) AS n FROM thong_bao WHERE loai_su_kien LIKE 'NhacLich%'`,
};

const countOf = async (db: DataSource, sql: string): Promise<number> =>
  Number(((await db.query(sql)) as { n: string | number }[])[0]?.n ?? 0);

/** IVN-01…IVN-05 trên toàn bảng. `unreadCountOf` là cách Trung tâm thông báo đếm số chưa đọc (truyền vào để test đi qua mã thật). */
export async function assertNotificationInvariants(
  db: DataSource,
  unreadCountOf: (taiKhoanId: string) => Promise<number>,
): Promise<void> {
  for (const [name, sql] of Object.entries(VIOLATIONS))
    expect(await countOf(db, sql), name).toBe(0);
  // IVN-05: số chưa đọc của Trung tâm = số dòng `trang_thai_doc = 0` của tài khoản, với MỌI tài khoản có thông báo
  const rows: { taiKhoanId: string; unread: string | number }[] =
    await db.query(
      `SELECT CAST(tai_khoan_id AS CHAR) AS taiKhoanId, SUM(trang_thai_doc = 0) AS unread
         FROM thong_bao GROUP BY tai_khoan_id`,
    );
  for (const row of rows)
    expect(
      await unreadCountOf(row.taiKhoanId),
      `IVN-05 soChuaDoc của tài khoản ${row.taiKhoanId}`,
    ).toBe(Number(row.unread));
}
