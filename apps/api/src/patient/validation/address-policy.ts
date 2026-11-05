// Luật địa chỉ của hồ sơ bản thân (patient P1, quyết định Q8; TRACKING patient P1-C). Người thân không có địa chỉ.
// Không phụ thuộc gì ngoài ascii-text để frontend sao chép được (cùng hợp đồng với họ tên).
import { trimAsciiWhitespace } from '../../auth/validation/ascii-text.js';

export const ADDRESS_MAX_LENGTH = 255; // cột `tai_khoan.dia_chi` varchar(255); MySQL đếm theo ký tự (điểm mã), không theo byte

// Chép từ `FORBIDDEN` của auth/validation/full-name-policy.ts (không được export): điều khiển (Cc: xuống dòng, tab…), định dạng (Cf),
// surrogate lẻ (Cs), dùng riêng (Co), ngắt dòng/đoạn (Zl, Zp). Sửa một bên thì sửa cả bên kia (docs/TECH_DEBT.md dòng 66).
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u;

/**
 * Chuẩn hoá trước khi kiểm và lưu: NFC [đề xuất] rồi cắt khoảng trắng ASCII hai đầu (không dùng String.trim(), cùng nguyên tắc với họ tên).
 * Rỗng sau khi cắt (kể cả chuỗi chỉ có khoảng trắng ASCII) ⇒ `null`, tức lưu NULL.
 */
export function normalizeAddress(text: string): string | null {
  const normalized = trimAsciiWhitespace(text.normalize('NFC'));
  return normalized === '' ? null : normalized;
}

/**
 * `value` phải là kết quả khác null của normalizeAddress. Hợp lệ khi không có ký tự bị cấm (địa chỉ nhiều dòng bị từ chối)
 * và dài tối đa 255 ký tự, đếm theo điểm mã SAU khi chuẩn hoá. Chuỗi chưa chuẩn hoá hoặc rỗng bị từ chối.
 */
export function isValidAddress(value: string): boolean {
  if (normalizeAddress(value) !== value) return false;
  if (FORBIDDEN.test(value)) return false;
  // Array.from đếm theo ĐIỂM MÃ (như MySQL), không theo đơn vị UTF-16 của .length
  return Array.from(value).length <= ADDRESS_MAX_LENGTH;
}
