// Luật từ khoá tìm bệnh nhân (patient F8; TRACKING F8-E). Hàm thuần, chép từ `apps/api/src/patient/validation/keyword-policy.ts` (B6) để
// web không gọi API khi từ khoá chắc chắn bị 400 (web và api không có gói dùng chung; nếu lệch thì API vẫn chặn và trả TU_KHOA_KHONG_HOP_LE).

export const KEYWORD_MIN_LENGTH = 2;
export const KEYWORD_MAX_LENGTH = 100;

// Tab hay ký tự vô hình ở giữa từ khoá cũng bị chặn (tên thật không chứa các ký tự này)
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u;

// `short`: dưới 2 ký tự (kể cả rỗng); `long`: trên 100; `invalid`: có ký tự cấm
export type KeywordProblem = 'short' | 'long' | 'invalid';

// NFC (họ tên lưu dạng NFC), rồi cắt khoảng trắng ASCII hai đầu. Cố ý KHÔNG dùng `String.trim()`: nó còn cắt cả U+00A0 và các khoảng trắng
// Unicode, còn API chỉ cắt khoảng trắng ASCII, nên hai bên sẽ hiểu cùng một từ khoá khác nhau.
export function normalizeKeyword(text: string): string {
  return text.normalize('NFC').replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, '');
}

// Đếm theo ĐIỂM MÃ như MySQL đếm `varchar`, không theo `.length` của JavaScript (đơn vị UTF-16: một emoji là 2)
export function keywordLength(normalized: string): number {
  return Array.from(normalized).length;
}

// `normalized` phải là kết quả của `normalizeKeyword`. `null` nghĩa là gọi API được.
export function keywordProblem(normalized: string): KeywordProblem | null {
  if (FORBIDDEN.test(normalized)) return 'invalid';
  const length = keywordLength(normalized);
  if (length < KEYWORD_MIN_LENGTH) return 'short';
  if (length > KEYWORD_MAX_LENGTH) return 'long';
  return null;
}
