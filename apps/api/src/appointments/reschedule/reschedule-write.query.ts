import type { EntityManager } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import type { RefundTierSnapshot } from '../create/refund-policy.js';
import { parseVnDateTime } from '../slots/slot-lock.js';

// Ba câu ĐỌC THƯỜNG (không `FOR UPDATE`, không ghi) của `AppointmentRescheduleService` (reschedule B4; PLAN reschedule 5.5 bước 0 và 5). Tách ra để `reschedule-locks.ts` (B1) và `RescheduleReader` (B2) giữ nguyên,
// và vì `LockedAppointment` của `state/` (chỉ ĐỌC ở scope này) không mang các cột phải sao chép. Mọi id là chuỗi (BIGINT), tiền là chuỗi decimal (H11), ngày giờ đọc bằng `DATE_FORMAT` rồi đổi sang `Date` (H13).

const DATE_TIME_FORMAT = "'%Y-%m-%d %H:%i:%s'";

/** Dữ kiện đọc thường để chọn nhánh "hết lần tự đổi" TRƯỚC mọi khoá (PLAN 5.5 bước 0). */
export interface QuotaFacts {
  /** Bất biến sau khi chèn lịch: chỉ lịch MỚI nhận giá trị cộng thêm, nên một lần đọc thường đã đủ */
  soLanTuDoiLich: number;
  trangThai: TrangThaiLichHen;
  thoiGian: Date;
}

interface RawQuotaFacts {
  soLan: number | string;
  trangThai: TrangThaiLichHen;
  thoiGian: string;
}

const READ_QUOTA_SQL = `SELECT so_lan_tu_doi_lich AS soLan, trang_thai AS trangThai, DATE_FORMAT(thoi_gian, ${DATE_TIME_FORMAT}) AS thoiGian
FROM lich_hen WHERE lich_hen_id = ?`;

export async function readQuotaFacts(
  em: EntityManager,
  lichHenId: string,
): Promise<QuotaFacts | null> {
  const row = (await em.query<RawQuotaFacts[]>(READ_QUOTA_SQL, [lichHenId]))[0];
  if (row === undefined) return null;
  return {
    soLanTuDoiLich: Number(row.soLan),
    trangThai: row.trangThai,
    thoiGian: parseVnDateTime(row.thoiGian),
  };
}

/** Các cột lịch mới SAO CHÉP NGUYÊN từ lịch cũ (không tính lại giá: bác sĩ đổi phụ phí về sau không ảnh hưởng, quy tắc DB 4). */
export interface CopiedColumns {
  giaSnapshot: string;
  tienCocSnapshot: string;
  /** Mảng JSON do driver đã phân tích (X1 M7) hoặc `null` (cọc 0đ); `insertLichHen` tự `JSON.stringify` */
  chinhSachHoan: readonly RefundTierSnapshot[] | null;
  lyDoKham: string | null;
}

const READ_COPIED_SQL = `SELECT CAST(gia_snapshot AS CHAR) AS giaSnapshot, CAST(tien_coc_snapshot AS CHAR) AS tienCocSnapshot,
  chinh_sach_hoan_snapshot AS chinhSachHoan, ly_do_kham AS lyDoKham
FROM lich_hen WHERE lich_hen_id = ?`;

/** Đọc SAU khi đã khoá `lich_hen` cũ theo khoá chính (không khoá thêm): giá trị không đổi được nữa. `null` chỉ khi hàng biến mất, điều không thể xảy ra dưới khoá. */
export async function readCopiedColumns(
  em: EntityManager,
  lichHenId: string,
): Promise<CopiedColumns | null> {
  const rows = await em.query<CopiedColumns[]>(READ_COPIED_SQL, [lichHenId]);
  return rows[0] ?? null;
}

const READ_SLOT_TIME_SQL = `SELECT DATE_FORMAT(ngay_gio, ${DATE_TIME_FORMAT}) AS ngayGio FROM khung_gio WHERE khung_gio_id = ?`;

/** Giờ bắt đầu của một khung giờ (cột bất biến sau khi tạo, nên đọc thường không khoá là đủ). `null` nếu không có khung giờ. */
export async function readSlotTime(
  em: EntityManager,
  khungGioId: string,
): Promise<Date | null> {
  const row = (
    await em.query<{ ngayGio: string }[]>(READ_SLOT_TIME_SQL, [khungGioId])
  )[0];
  return row === undefined ? null : parseVnDateTime(row.ngayGio);
}
