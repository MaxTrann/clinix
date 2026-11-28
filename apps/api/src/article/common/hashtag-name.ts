import { ARTICLE_LIMITS } from '../article.constants.js';
import { ARTICLE_FIELD_ERRORS } from './article-errors.js';
import { codePointLength } from './article-content.rules.js';

// Chuẩn hoá và giới hạn thẻ (hashtag) (PLAN article 5.6, MH7, T5, T6). Hàm THUẦN; API và web dùng cùng ý nghĩa (web có bản riêng ở features/article).
// Ví dụ: "  #Trẻ Em " thành "trẻ-em".

// Chữ cái Unicode, chữ số và dấu gạch ngang. Sau NFC chữ tiếng Việt là ký tự dựng sẵn nên thuộc \p{L}.
const ALLOWED_NAME = /^[\p{L}\p{N}-]+$/u;

/**
 * Chuẩn hoá MỘT thẻ: bỏ khoảng trắng hai đầu và mọi dấu `#` đứng đầu, NFC, chữ thường (`toLocaleLowerCase('vi')`), khoảng trắng liên tiếp thành một `-`,
 * gộp `-` liền nhau, bỏ `-` hai đầu. Trả `null` nếu rỗng, quá 50 điểm mã hay có ký tự ngoài chữ cái, chữ số và `-`.
 */
export function normalizeHashtag(raw: string): string | null {
  const name = raw
    .normalize('NFC')
    .trim()
    .replace(/^#+/, '')
    .trim()
    .toLocaleLowerCase('vi')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .normalize('NFC');
  if (name === '' || codePointLength(name) > ARTICLE_LIMITS.hashtagMax)
    return null;
  return ALLOWED_NAME.test(name) ? name : null;
}

export type HashtagListResult =
  { ok: true; names: string[] } | { ok: false; error: string };

/**
 * Chuẩn hoá cả mảng thẻ của một yêu cầu: chuẩn hoá từng thẻ (một thẻ sai thì `THE_KHONG_HOP_LE`), BỎ TRÙNG (giữ thứ tự xuất hiện đầu tiên),
 * rồi mới đếm: tối đa 10 thẻ KHÁC NHAU (11 thì `QUA_NHIEU_THE`). `Ho` và `ho` gộp thành một.
 */
export function normalizeHashtagList(
  raw: readonly string[],
): HashtagListResult {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const name = typeof item === 'string' ? normalizeHashtag(item) : null;
    if (name === null)
      return { ok: false, error: ARTICLE_FIELD_ERRORS.INVALID_TAG };
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  if (names.length > ARTICLE_LIMITS.hashtagsPerArticle)
    return { ok: false, error: ARTICLE_FIELD_ERRORS.TOO_MANY_TAGS };
  return { ok: true, names };
}

/** Chuẩn hoá tiền tố gõ dở để gợi ý thẻ: như `normalizeHashtag` nhưng giữ `-` ở cuối ("trẻ-" vẫn là tiền tố); `''` nghĩa là không có tiền tố; `null` nếu sai ký tự hay quá dài. */
export function normalizeHashtagPrefix(raw: string): string | null {
  const prefix = raw
    .normalize('NFC')
    .trim()
    .replace(/^#+/, '')
    .trim()
    .toLocaleLowerCase('vi')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .normalize('NFC');
  if (prefix === '') return '';
  if (codePointLength(prefix) > ARTICLE_LIMITS.hashtagMax) return null;
  return ALLOWED_NAME.test(prefix) ? prefix : null;
}

/**
 * Khoá sắp xếp thẻ để chèn theo MỘT thứ tự cố định (T5, chống deadlock chéo thứ tự): gập dấu (NFD, bỏ dấu kết hợp, `đ` thành `d`).
 * Lý do gập dấu thay vì sắp theo chuỗi thô: UNIQUE của `hashtag.ten` theo `utf8mb4_unicode_ci` coi các tên khác dấu là CÙNG một bản ghi khoá, nên hai yêu cầu
 * có thể sắp thô ra hai thứ tự khoá ngược nhau. Khoá này phải THÔ HƠN HOẶC BẰNG lớp tương đương của collation thì mới an toàn (hai tên cùng lớp collation
 * phải cùng khoá gập dấu). Đối chiếu kết quả ABD-04 (MySQL 8.4, 28/11/2026): mắt, mặt, mat, MẮT đều CÙNG khoá UNIQUE và cùng khoá gập dấu; `đ` và `d` là hai chữ KHÁC nhau ở collation nhưng
 * khoá này gộp chúng: thô hơn collation ở cặp đó, vẫn an toàn (hai tên khác lớp collation mà cùng khoá chỉ bị xếp liền nhau, thứ tự vẫn nhất quán giữa mọi yêu cầu).
 */
export function hashtagSortKey(name: string): string {
  return name
    .normalize('NFD')
    .toLowerCase()
    .replace(/\p{M}+/gu, '')
    .replace(/đ/g, 'd');
}

/** Sắp tăng dần theo khoá gập dấu, hoà thì theo tên (so theo đơn vị mã, không phụ thuộc ICU hay locale). */
export function sortHashtags(names: readonly string[]): string[] {
  return [...names].sort((a, b) => {
    const keyA = hashtagSortKey(a);
    const keyB = hashtagSortKey(b);
    if (keyA !== keyB) return keyA < keyB ? -1 : 1;
    if (a === b) return 0;
    return a < b ? -1 : 1;
  });
}
