// Luật từ khoá `q` của tra cứu hồ sơ bệnh nhân (patient B6, quyết định Q19; TRACKING patient B6-B, B6-C, B6-D). Hàm thuần: DTO, service và test dùng chung.
import { trimAsciiWhitespace } from '../../auth/validation/ascii-text.js';
import { escapeLikePattern } from '../../common/paging/like-pattern.js';
import {
  KEYWORD_MAX_LENGTH,
  KEYWORD_MIN_LENGTH,
} from '../patient.constants.js';

// Chép từ `FORBIDDEN` của auth/validation/full-name-policy.ts (không được export) như address-policy.ts: bản chép thứ ba, ghi ở docs/TECH_DEBT.md
// (nối tiếp dòng 66). Tên thật không chứa các ký tự này nên chặn chúng không làm mất kết quả hợp lệ nào.
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u;

// Chữ `đ`/`Đ` của tiếng Việt KHÔNG bằng `d` trong utf8mb4_unicode_ci (đã đo), trong khi mọi dấu khác (mũ, móc, thanh) thì bằng.
const D_WITH_STROKE = /[đĐ]/g;

/** Ba mẫu `LIKE ? ESCAPE '!'` của một từ khoá: mỗi cột một mẫu riêng, vì chỉ họ tên được gấp `đ`, chỉ SĐT được bỏ dấu cách và chấm. */
export interface LookupPatterns {
  /** Cho họ tên: từ khoá đã gấp `đ`/`Đ` thành `d`, so với họ tên cũng đã gấp như vậy trong SQL. */
  name: string;
  /** Cho email: từ khoá nguyên văn. */
  email: string;
  /** Cho SĐT: chỉ chữ số; `null` khi từ khoá không toàn chữ số (nhánh SĐT tắt). */
  phone: string | null;
}

/**
 * Chuẩn hoá trước khi kiểm và tìm: NFC (MySQL `LIKE` không chuẩn hoá giùm, mà họ tên được lưu dạng NFC) rồi cắt khoảng trắng ASCII hai đầu.
 * Cố ý KHÔNG dùng String.trim() (cắt cả U+00A0), cùng nguyên tắc với họ tên, email, SĐT.
 */
export function normalizeKeyword(text: string): string {
  return trimAsciiWhitespace(text.normalize('NFC'));
}

/**
 * `value` phải là kết quả của normalizeKeyword. Hợp lệ khi dài 2 đến 100 ký tự, đếm theo ĐIỂM MÃ (như MySQL đếm `varchar`), và không có ký tự cấm
 * (tab hay xuống dòng ở giữa cũng bị từ chối). Chuỗi chưa chuẩn hoá bị từ chối để mọi đường vào đều tìm cùng một dạng.
 */
export function isValidKeyword(value: string): boolean {
  if (normalizeKeyword(value) !== value) return false;
  if (FORBIDDEN.test(value)) return false;
  const length = Array.from(value).length;
  return length >= KEYWORD_MIN_LENGTH && length <= KEYWORD_MAX_LENGTH;
}

/** Gấp `đ` và `Đ` thành `d`, để gõ không dấu (`dang`) tìm được `Đặng`, và gõ `đặng` tìm được cả `Dang`. */
export function foldDStroke(text: string): string {
  return text.replace(D_WITH_STROKE, 'd');
}

/**
 * Chữ số để tìm trong SĐT, hoặc `null` nếu không tìm SĐT. Bỏ MỌI dấu cách và dấu chấm ASCII (SĐT lưu 10 số liền); chỉ tìm khi phần còn lại toàn chữ số ASCII
 * `[0-9]` (không `\d` hay chữ số Unicode) VÀ dài ≥ 2: ngưỡng tính trên phần còn lại, nếu không thì `0.` (2 ký tự, một chữ số) khớp gần mọi SĐT.
 */
export function phoneDigits(keyword: string): string | null {
  const compact = keyword.replace(/[ .]/g, '');
  return /^[0-9]+$/.test(compact) && compact.length >= KEYWORD_MIN_LENGTH
    ? compact
    : null;
}

/** Dựng ba mẫu LIKE từ từ khoá ĐÃ hợp lệ. `%`, `_`, `!` được escape bằng `!`; dấu gạch ngược là ký tự thường (đã đo với `ESCAPE '!'`). */
export function buildLookupPatterns(keyword: string): LookupPatterns {
  const digits = phoneDigits(keyword);
  return {
    name: `%${escapeLikePattern(foldDStroke(keyword))}%`,
    email: `%${escapeLikePattern(keyword)}%`,
    phone: digits === null ? null : `%${escapeLikePattern(digits)}%`,
  };
}
