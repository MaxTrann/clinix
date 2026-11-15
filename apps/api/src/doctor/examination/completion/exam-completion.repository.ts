import type { DataSource, EntityManager } from 'typeorm';

// Đọc THƯỜNG (không khoá) lịch của đúng bác sĩ theo MÃ lịch hẹn (doctor-exam B1; PLAN 5.3, 5.4 bước 1). Chỉ đọc nên AR-05 và AR-06 không bắt.
// `bac_si_id` nằm trong điều kiện: lịch của bác sĩ khác và lịch không tồn tại cho cùng kết quả `null` (404 cùng thân, Q23). Cả ba cột lấy ra đều BẤT BIẾN sau khi chèn
// (`ma_lich_hen`, `bac_si_id`, `benh_nhan_id`), nên đọc ngoài giao dịch không có đua với giao dịch sau đó. `benhNhanId` là tài khoản ĐẶT: người nhận thông báo.
// `CAST … AS CHAR`: id là `bigint`, driver có thể trả số; luôn lấy chuỗi.

export interface OwnedAppointment {
  lichHenId: string;
  maLichHen: string;
  benhNhanId: string;
}

// `ma_lich_hen` UNIQUE ⇒ truy cập `const` (đo ở HTK-13)
export const READ_OWNED_APPOINTMENT_SQL = `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, ma_lich_hen AS maLichHen, CAST(benh_nhan_id AS CHAR) AS benhNhanId
FROM lich_hen WHERE ma_lich_hen = ? AND bac_si_id = ?`;

/** Lịch mã `maLichHen` (đã chuẩn hoá chữ hoa) của bác sĩ `bacSiId` (từ access token), hoặc `null`. */
export async function readOwnedAppointment(
  db: Pick<DataSource | EntityManager, 'query'>,
  maLichHen: string,
  bacSiId: string,
): Promise<OwnedAppointment | null> {
  const rows = await db.query<OwnedAppointment[]>(READ_OWNED_APPOINTMENT_SQL, [
    maLichHen,
    bacSiId,
  ]);
  return rows[0] ?? null;
}
