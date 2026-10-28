// Chính sách họ tên (task A5). Quy tắc là [đề xuất] của AI, người dùng đã duyệt kèm hai chỉnh (TRACKING mục 3, A5-D); 2.4 chưa có quy tắc.
// Không phụ thuộc gì ngoài ascii-text để frontend sao chép được (cùng hợp đồng với email/SĐT).
import { trimAsciiWhitespace } from './ascii-text.js';

export const FULL_NAME_MAX_LENGTH = 100; // cột tai_khoan.ho_ten varchar(100); MySQL đếm theo ký tự (điểm mã), không theo byte

// Không được có trong họ tên: điều khiển (Cc: tab, xuống dòng, NUL, DEL, C1), định dạng (Cf: U+202E đảo chiều chữ, U+200B rộng 0,
// U+FEFF…), dấu ngắt dòng/đoạn (Zl, Zp), surrogate lẻ (Cs: một chuỗi JSON mang được nó, MySQL không lưu được) và ký tự dùng riêng (Co).
// Cf, Zl, Zp là yêu cầu của người dùng; Cs và Co do AI thêm vì không thể là một phần của tên thật.
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u;
const HAS_LETTER = /\p{L}/u;

/**
 * Chuẩn hoá họ tên trước khi kiểm và lưu: NFC (tiếng Việt gõ dạng tổ hợp ra cùng giá trị với dạng dựng sẵn) rồi cắt khoảng trắng
 * ASCII hai đầu. Cố ý KHÔNG dùng String.trim() (cắt cả khoảng trắng Unicode), cùng nguyên tắc với email và SĐT.
 */
export function normalizeFullName(text: string): string {
  return trimAsciiWhitespace(text.normalize('NFC'));
}

/**
 * `value` phải là kết quả của normalizeFullName (đã NFC, đã cắt). Hợp lệ khi: có ít nhất một chữ cái, không có ký tự bị cấm,
 * và dài tối đa 100 ký tự (đếm theo điểm mã SAU khi chuẩn hoá). Chuỗi chưa chuẩn hoá bị từ chối để mọi đường vào đều lưu cùng một dạng.
 */
export function isValidFullName(value: string): boolean {
  if (normalizeFullName(value) !== value) return false;
  if (!HAS_LETTER.test(value)) return false;
  if (FORBIDDEN.test(value)) return false;
  // Array.from đếm theo ĐIỂM MÃ (MySQL varchar(100) cũng đếm theo ký tự/điểm mã), không phải đơn vị UTF-16 và không phải cụm ký tự hiển thị
  return Array.from(value).length <= FULL_NAME_MAX_LENGTH;
}
