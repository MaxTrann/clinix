import { SHIFT_ERROR_CODES } from './shift-assignment.constants.js';

// Luật thuần của gỡ ca (PLAN doctor 5.3, Q8). Không đụng DB: dễ test và dễ giải thích.

export type SlotState = 'ConTrong' | 'DaDat' | 'DangGiuCho' | 'HetHan';

export interface RemovalFacts {
  /** Ngày của ca 'YYYY-MM-DD'. */
  ngay: string;
  /** Hôm nay theo giờ VN, chốt MỘT lần cho cả yêu cầu (H18). */
  today: string;
  /** Trạng thái các khung giờ của ca, đọc dưới khoá. */
  slots: readonly SlotState[];
  /** Số lịch hẹn (kể cả `DaHuy`) đang tham chiếu khung giờ của ca. */
  soLichHenThamChieu: number;
}

export type RemovalVerdict = { ok: true } | { ok: false; maLoi: string };

/**
 * Ca gỡ được khi: chưa qua (ca HÔM NAY vẫn gỡ được), mọi khung giờ `ConTrong` (kể cả `DangGiuCho` đã hết hạn chưa quét thì CHẶN,
 * đúng D7), và không lịch hẹn nào từng tham chiếu (khoá ngoại) — kể cả lịch đã huỷ.
 */
export function checkRemovable(facts: RemovalFacts): RemovalVerdict {
  if (facts.ngay < facts.today)
    return { ok: false, maLoi: SHIFT_ERROR_CODES.SHIFT_PAST };
  const hasBlocker =
    facts.slots.some((state) => state !== 'ConTrong') ||
    facts.soLichHenThamChieu > 0;
  return hasBlocker
    ? { ok: false, maLoi: SHIFT_ERROR_CODES.HAS_APPOINTMENTS }
    : { ok: true };
}
