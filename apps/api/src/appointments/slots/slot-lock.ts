import type { EntityManager } from 'typeorm';
import type { StoredSlotStatus } from '../../scheduling/slots/slot-status.rules.js';

// Khoá tầng 4 và tầng 5 của luồng đặt lịch (PLAN booking 5.3; TRACKING 3.14 B6-B): `bac_si FOR SHARE` rồi `khung_gio FOR UPDATE`. Đây là nơi DUY NHẤT xin hai khoá này, để thứ tự
// (tầng 4 trước tầng 5) nằm một chỗ thay vì mỗi luồng tự viết. Tầng 2 và 3 (`benh_nhan`, `ho_so_nguoi_than`) do NGƯỜI GỌI xin trước, vì giao dịch là của họ.
// Cả hai hàm nhận `em` của người gọi và KHÔNG mở giao dịch.

/** 'YYYY-MM-DD HH:MM:SS' giờ Việt Nam ⇒ `Date` (cộng độ lệch +07:00 cố định, không qua múi giờ máy; cùng cách `AvailableSlotsReader`, doctor M4). */
export function parseVnDateTime(text: string): Date {
  return new Date(`${text.replace(' ', 'T')}+07:00`);
}

// DATE_FORMAT để lấy đúng chuỗi giờ VN trong DB, không phụ thuộc cách driver đổi DATETIME sang `Date` (H13, doctor M4).
const DATE_TIME_FORMAT = "'%Y-%m-%d %H:%i:%s'";

/** Một khung giờ đọc ra từ DB: ngày giờ đã đổi sang `Date`. */
export interface SlotRow {
  khungGioId: string;
  lichLamViecId: string;
  /** Giờ bắt đầu */
  ngayGio: Date;
  trangThai: StoredSlotStatus;
  giuChoDen: Date | null;
}

/**
 * Chỉ để khai báo kiểu: KHÔNG có giá trị lúc chạy, nên không đoạn mã nào dựng được `LockedSlot` bằng tay (`{ …, [lockedSlotBrand]: true }` hỏng ngay lúc chạy và `tsc` từ chối
 * mọi đối tượng thường). Chỉ `lockSlot` trả ra kiểu này.
 */
export declare const lockedSlotBrand: unique symbol;

/** Bằng chứng "đã khoá `khung_gio` `FOR UPDATE`": hàm ghi khung giờ (B6b) đòi kiểu này nên không gọi được khi chưa khoá. `trangThai` và `giuChoDen` đọc DƯỚI khoá. */
export interface LockedSlot extends SlotRow {
  readonly [lockedSlotBrand]: true;
}

export interface LockedDoctor {
  chiNhanhId: string;
  dichVuKhamId: string;
}

interface RawSlotRow {
  khungGioId: string;
  lichLamViecId: string;
  ngayGio: string;
  trangThai: StoredSlotStatus;
  giuChoDen: string | null;
}

const LOCK_DOCTOR_SQL = `SELECT CAST(chi_nhanh_id AS CHAR) AS chiNhanhId, CAST(dich_vu_kham_id AS CHAR) AS dichVuKhamId
FROM bac_si WHERE tai_khoan_id = ?
FOR SHARE`;

// MỘT bảng, không join: `FOR UPDATE` trên câu nối sẽ khoá cả hàng `lich_lam_viec` (không có trong bảng thứ tự khoá 5.3).
const LOCK_SLOT_SQL = `SELECT CAST(khung_gio_id AS CHAR) AS khungGioId, CAST(lich_lam_viec_id AS CHAR) AS lichLamViecId,
  DATE_FORMAT(ngay_gio, ${DATE_TIME_FORMAT}) AS ngayGio, trang_thai AS trangThai, DATE_FORMAT(giu_cho_den, ${DATE_TIME_FORMAT}) AS giuChoDen
FROM khung_gio WHERE khung_gio_id = ?
FOR UPDATE`;

/** Tầng 4: khoá chia sẻ hàng `bac_si` (booking `FOR SHARE`; doctor và admin xin `FOR UPDATE` nên bị chặn tới khi giao dịch này xong). `null` nếu không có bác sĩ. */
export async function lockDoctorShared(
  em: EntityManager,
  bacSiId: string,
): Promise<LockedDoctor | null> {
  const rows = await em.query<LockedDoctor[]>(LOCK_DOCTOR_SQL, [bacSiId]);
  return rows[0] ?? null;
}

/** Tầng 5: khoá hàng `khung_gio` `FOR UPDATE` và đọc trạng thái MỚI NHẤT dưới khoá. `null` nếu khung giờ không còn (ví dụ gỡ ca xoá trong lúc ta chờ khoá). */
export async function lockSlot(
  em: EntityManager,
  khungGioId: string,
): Promise<LockedSlot | null> {
  const rows = await em.query<RawSlotRow[]>(LOCK_SLOT_SQL, [khungGioId]);
  const row = rows[0];
  if (row === undefined) return null;
  return {
    khungGioId: row.khungGioId,
    lichLamViecId: row.lichLamViecId,
    ngayGio: parseVnDateTime(row.ngayGio),
    trangThai: row.trangThai,
    giuChoDen: row.giuChoDen === null ? null : parseVnDateTime(row.giuChoDen),
  } as LockedSlot;
}
