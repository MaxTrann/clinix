import type { EntityManager } from 'typeorm';
import { parseVnDateTime } from '../slots/slot-lock.js';
import {
  PATIENT_VISIBLE_STATES,
  type PatientVisibleState,
} from '../lists/patient-appointments.dto.js';

// Câu ĐỌC của `GET /patient/appointments/:maLichHen/cancel-preview` (B10; TRACKING 3.23 B10-G). Chỉ ĐỌC, không khoá, trong MỘT lần `runReadOnly` của người gọi. Sở hữu nằm NGAY TRONG SQL như chi tiết của B2:
// `benh_nhan_id = ?` (chủ sở hữu, từ access token) và tập trạng thái Bệnh nhân được thấy, nên lịch của người khác, lịch không tồn tại và `DaDoiLich` cùng ra "không có hàng", cùng MỘT chỗ ném 404 (H10, HL-05).

export interface CancelPreviewRow {
  lichHenId: string;
  trangThai: PatientVisibleState;
  /** `lich_hen.thoi_gian` (giờ Việt Nam, `DATE_FORMAT` nên không lệch múi giờ, H13) */
  thoiGian: Date;
  /** Snapshot chính sách hoàn đã parse (mảng hoặc `null`); `calculateRefund` kiểm cấu trúc */
  chinhSachHoan: unknown;
}

interface RawCancelPreviewRow extends Omit<CancelPreviewRow, 'thoiGian'> {
  thoiGian: string;
}

/** Lịch của Bệnh nhân `patientId` theo mã đã chuẩn hoá, hoặc `null` (không có, của người khác, hay `DaDoiLich`). */
export async function readCancelPreviewRow(
  em: EntityManager,
  patientId: string,
  maLichHen: string,
): Promise<CancelPreviewRow | null> {
  const rows = await em.query<RawCancelPreviewRow[]>(
    `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, trang_thai AS trangThai,
  DATE_FORMAT(thoi_gian, '%Y-%m-%d %H:%i:%s') AS thoiGian, chinh_sach_hoan_snapshot AS chinhSachHoan
FROM lich_hen
WHERE ma_lich_hen = ? AND benh_nhan_id = ? AND trang_thai IN (${PATIENT_VISIBLE_STATES.map(() => '?').join(', ')})`,
    [maLichHen, patientId, ...PATIENT_VISIBLE_STATES],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return { ...row, thoiGian: parseVnDateTime(row.thoiGian) };
}
