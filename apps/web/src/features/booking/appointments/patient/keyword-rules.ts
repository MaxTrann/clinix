// Luật từ khoá của ô tìm "Lịch hẹn của tôi" (booking F1; PLAN Q35): 2 đến 100 ĐIỂM MÃ sau khi chuẩn hoá NFC và cắt khoảng trắng ASCII, đúng như API.
// Client chỉ kiểm độ dài để khỏi gọi API khi chắc chắn bị 400; ký tự điều khiển hay ký tự vô hình để API chặn (400 `TU_KHOA_KHONG_HOP_LE`, trang hiện
// "Từ khoá không hợp lệ"). Bản nhỏ riêng của booking: `features/` không import chéo và không chép `lookup-keyword.ts` của patient (ghi TECH_DEBT).
export const KEYWORD_MIN_LENGTH = 2;
export const KEYWORD_MAX_LENGTH = 100;

// Cố ý KHÔNG dùng `String.trim()`: nó cắt cả U+00A0 và khoảng trắng Unicode, còn API chỉ cắt khoảng trắng ASCII
const EDGE_ASCII_SPACES = /^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g;

// `short`: dưới 2 điểm mã (kể cả rỗng); `long`: trên 100
export type KeywordProblem = 'short' | 'long';

export interface KeywordCheck {
  // Từ khoá đã chuẩn hoá: đúng chữ sẽ gửi lên API
  keyword: string;
  // Số điểm mã (không phải `.length` của JavaScript, vốn đếm đơn vị UTF-16: một emoji là 2)
  length: number;
  problem: KeywordProblem | null;
}

export function checkKeyword(input: string): KeywordCheck {
  const keyword = input.normalize('NFC').replace(EDGE_ASCII_SPACES, '');
  const length = Array.from(keyword).length;
  if (length < KEYWORD_MIN_LENGTH) return { keyword, length, problem: 'short' };
  if (length > KEYWORD_MAX_LENGTH) return { keyword, length, problem: 'long' };
  return { keyword, length, problem: null };
}
