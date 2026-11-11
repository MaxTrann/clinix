import { normalizeFreeText } from '../leave-requests/leave-request.rules.js';
import {
  REJECT_REASON_MAX_LENGTH,
  REJECT_REASON_MIN_LENGTH,
} from './admin-leave.constants.js';

/**
 * Chuẩn hoá lý do từ chối (Q27c): phải là chuỗi; NFC, cắt khoảng trắng ASCII hai đầu, 1–255 điểm mã, không ký tự điều khiển.
 * Trả chuỗi đã chuẩn hoá, hoặc `null` (người gọi đổi thành 400 `LY_DO_TU_CHOI_KHONG_HOP_LE`).
 */
export function normalizeRejectReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return normalizeFreeText(
    raw,
    REJECT_REASON_MIN_LENGTH,
    REJECT_REASON_MAX_LENGTH,
  );
}
