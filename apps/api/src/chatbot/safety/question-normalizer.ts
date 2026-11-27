import { trimAsciiWhitespace } from '../../auth/validation/ascii-text.js';

// chatbot B1 — chuẩn hoá và giới hạn độ dài câu hỏi, lịch sử (PLAN chatbot 5.4 bước 2, 5.12, MH3, ATY-08). Hàm thuần: không DB, không mạng.

export const QUESTION_MAX_CODE_POINTS = 500;
export const HISTORY_MAX_TURNS = 6;
export const HISTORY_TURN_MAX_CODE_POINTS = 800;

// Ký tự điều khiển (Cc) KHÔNG xoá hẳn mà đổi thành dấu cách: xoá hẳn thì "đau\u0000ngực" thành "đaungực" và lọt luật khẩn cấp
// (luật so từng từ). Đổi thành dấu cách vẫn là "bỏ" ký tự điều khiển khỏi câu gửi đi. `\r\n` là MỘT dấu cách.
const CONTROL_CHARS = /\r\n|\p{Cc}/gu;

/** NFC, bỏ ký tự điều khiển, cắt khoảng trắng ASCII hai đầu (cố ý không dùng `String.trim()`: nó cắt cả U+00A0, như nếp của repo). */
export function cleanText(raw: string): string {
  return trimAsciiWhitespace(raw.normalize('NFC').replace(CONTROL_CHARS, ' '));
}

/** Số điểm mã Unicode (một emoji là một). */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

// Mỗi điểm mã chiếm tối đa 2 đơn vị UTF-16: chuỗi dài hơn 2 × trần chắc chắn quá dài, khỏi dựng mảng cho chuỗi khổng lồ
function exceeds(text: string, maxCodePoints: number): boolean {
  return (
    text.length > maxCodePoints * 2 || codePointLength(text) > maxCodePoints
  );
}

export type QuestionCheck =
  | { ok: true; text: string }
  | { ok: false; code: 'CAU_HOI_TRONG' | 'CAU_HOI_QUA_DAI' };

/** Câu hỏi: 1 đến 500 điểm mã SAU khi chuẩn hoá. Mã lỗi khớp PLAN 5.16 (`DU_LIEU_KHONG_HOP_LE`, `loi[].ma`). */
export function normalizeQuestion(raw: string): QuestionCheck {
  if (typeof raw !== 'string') return { ok: false, code: 'CAU_HOI_TRONG' };
  const text = cleanText(raw);
  if (text === '') return { ok: false, code: 'CAU_HOI_TRONG' };
  if (exceeds(text, QUESTION_MAX_CODE_POINTS)) {
    return { ok: false, code: 'CAU_HOI_QUA_DAI' };
  }
  return { ok: true, text };
}

export type HistoryRole = 'NguoiDung' | 'TroLy';
export interface HistoryTurn {
  readonly vai: HistoryRole;
  readonly noiDung: string;
}

export type HistoryCheck =
  | { ok: true; turns: HistoryTurn[] }
  | { ok: false; code: 'LICH_SU_KHONG_HOP_LE' };

const INVALID_HISTORY: HistoryCheck = {
  ok: false,
  code: 'LICH_SU_KHONG_HOP_LE',
};

/**
 * Lịch sử gửi kèm: tối đa 6 lượt, mỗi lượt 1 đến 800 điểm mã sau chuẩn hoá. Trả BẢN MỚI (không sửa đầu vào).
 * Lượt `TroLy` do client gửi lên (giả được) nên chỉ là dữ liệu trích dẫn, không đóng vai trợ lý thật (PLAN 5.8): việc đó của chatbot B3.
 */
export function normalizeHistory(turns: readonly HistoryTurn[]): HistoryCheck {
  if (!Array.isArray(turns) || turns.length > HISTORY_MAX_TURNS) {
    return INVALID_HISTORY;
  }
  const cleaned: HistoryTurn[] = [];
  for (const turn of turns) {
    if (typeof turn !== 'object' || turn === null) return INVALID_HISTORY;
    if (turn.vai !== 'NguoiDung' && turn.vai !== 'TroLy') {
      return INVALID_HISTORY;
    }
    if (typeof turn.noiDung !== 'string') return INVALID_HISTORY;
    const noiDung = cleanText(turn.noiDung);
    if (noiDung === '' || exceeds(noiDung, HISTORY_TURN_MAX_CODE_POINTS)) {
      return INVALID_HISTORY;
    }
    cleaned.push({ vai: turn.vai, noiDung });
  }
  return { ok: true, turns: cleaned };
}
