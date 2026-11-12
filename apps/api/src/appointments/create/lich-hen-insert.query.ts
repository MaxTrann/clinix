import type { EntityManager } from 'typeorm';
import { duplicateKeyOf } from './duplicate-key.js';
import type { RefundTierSnapshot } from './refund-policy.js';

// NƠI DUY NHẤT chèn `lich_hen` (task B8; PLAN booking 5.4 bước 5, 5.11; TRACKING 3.21 B8-E; luật AR-06: `INSERT INTO lich_hen` chỉ ở `appointments/create/`, đã có trong `INTERNAL_WRITE_RULES`).
// Hàm nhận `em` của NGƯỜI GỌI và KHÔNG mở giao dịch; KHÔNG ném `AppException`. Lỗi 1062 đã lường trước thành KẾT QUẢ CÓ KIỂU, phân biệt theo TÊN KHOÁ (X1 M2): sau 1062 giao dịch vẫn dùng được
// (đã đo), nên người gọi sinh lại mã rồi chèn tiếp trong CÙNG giao dịch. Lỗi khác (kể cả khoá ngoại) đi nguyên ra ngoài để hoàn tác.

/** Một hàng `lich_hen` mới. Mọi trường là GIÁ TRỊ ĐÃ CHỐT của người gọi: bác sĩ, chi nhánh, dịch vụ, giờ lấy từ khung giờ và bác sĩ (DL-25), không từ client. */
export interface LichHenInsertRow {
  maLichHen: string;
  khungGioId: string;
  benhNhanId: string;
  /** `null` là hồ sơ BẢN THÂN */
  hoSoNguoiThanId: string | null;
  bacSiId: string;
  chiNhanhId: string;
  dichVuKhamId: string;
  /** `ngay_gio` của khung giờ (không đổi sau khi tạo) */
  thoiGian: Date;
  /** Chuỗi decimal (H11), không bao giờ số thực */
  giaSnapshot: string;
  tienCocSnapshot: string;
  /** `null` ⇒ SQL `NULL` (cọc 0đ); mảng (kể cả `[]`) ⇒ `JSON.stringify` (X1 M7: mảng truyền thẳng bị lỗi 1136) */
  chinhSachHoanSnapshot: readonly RefundTierSnapshot[] | null;
  /** Chỉ hai trạng thái khởi tạo: `ChoThanhToan` (cọc > 0) hoặc `DaXacNhan` (cọc 0đ, INSERT thẳng: câu (a) phương án A) */
  trangThai: 'ChoThanhToan' | 'DaXacNhan';
  /** Có khi `ChoThanhToan` (bằng `giu_cho_den`, INV-02), `null` khi `DaXacNhan` (DL-01) */
  hanThanhToan: Date | null;
  /** Đã chuẩn hoá (Q9); rỗng đã đổi thành `null` ở DTO */
  lyDoKham: string | null;
  /** Mốc `now` của luồng (`toSecond`): ghi tường minh để đồng hồ giả test được và khớp mốc của `han_thanh_toan` */
  thoiDiemTao: Date;
}

export type InsertLichHenOutcome =
  | { kind: 'Inserted'; lichHenId: string }
  /** 1062 trên `lich_hen.ma_lich_hen`: người gọi sinh mã khác */
  | { kind: 'DuplicateCode' }
  /** 1062 trên `lich_hen.khung_gio_dang_giu`: có lịch đang hoạt động giữ khung giờ này (lưới an toàn cuối của H1) */
  | { kind: 'DuplicateSlot' };

const INSERT_SQL = `INSERT INTO lich_hen
  (ma_lich_hen, khung_gio_id, benh_nhan_id, ho_so_nguoi_than_id, bac_si_id, chi_nhanh_id, dich_vu_kham_id, thoi_gian,
   gia_snapshot, tien_coc_snapshot, chinh_sach_hoan_snapshot, trang_thai, han_thanh_toan, ly_do_kham, thoi_diem_tao)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export async function insertLichHen(
  em: EntityManager,
  row: LichHenInsertRow,
): Promise<InsertLichHenOutcome> {
  try {
    const result: { insertId: number | string } = await em.query(INSERT_SQL, [
      row.maLichHen,
      row.khungGioId,
      row.benhNhanId,
      row.hoSoNguoiThanId,
      row.bacSiId,
      row.chiNhanhId,
      row.dichVuKhamId,
      row.thoiGian,
      row.giaSnapshot,
      row.tienCocSnapshot,
      row.chinhSachHoanSnapshot === null
        ? null
        : JSON.stringify(row.chinhSachHoanSnapshot),
      row.trangThai,
      row.hanThanhToan,
      row.lyDoKham,
      row.thoiDiemTao,
    ]);
    return { kind: 'Inserted', lichHenId: String(result.insertId) };
  } catch (error) {
    switch (duplicateKeyOf(error)) {
      case 'ma_lich_hen':
        return { kind: 'DuplicateCode' };
      case 'khung_gio_dang_giu':
        return { kind: 'DuplicateSlot' };
      default:
        throw error;
    }
  }
}
