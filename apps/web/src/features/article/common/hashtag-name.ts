// Chuẩn hoá thẻ (hashtag) ở web, CÙNG Ý NGHĨA với máy chủ (PLAN article 5.6, MH7): để chip hiện đúng thứ sẽ được lưu.
// Hàm thuần, không phụ thuộc React.
export const HASHTAG_MAX_LENGTH = 50;
export const HASHTAG_MAX_COUNT = 10;

// Chỉ chữ cái Unicode, chữ số và dấu gạch ngang (sau khi đã đổi khoảng trắng thành `-`)
const ALLOWED = /^[\p{L}\p{N}-]+$/u;

export type HashtagResult =
  { ok: true; name: string } | { ok: false; reason: 'EMPTY' | 'INVALID' };

// Thứ tự bước theo 5.6: bỏ khoảng trắng hai đầu và MỘT dấu `#` đầu, NFC, chữ thường (tiếng Việt), khoảng trắng liên tiếp thành một `-`,
// gộp `-` liền nhau, bỏ `-` hai đầu; rồi kiểm ký tự và độ dài (1 đến 50 điểm mã). Ví dụ: "  #Trẻ Em " ⇒ "trẻ-em".
export function normalizeHashtag(raw: string): HashtagResult {
  let text = raw.trim();
  if (text.startsWith('#')) text = text.slice(1);
  text = text
    .normalize('NFC')
    .toLocaleLowerCase('vi')
    .replace(/\s+/gu, '-')
    .replace(/-{2,}/gu, '-')
    .replace(/^-+|-+$/gu, '');
  if (text === '') return { ok: false, reason: 'EMPTY' };
  if (!ALLOWED.test(text) || Array.from(text).length > HASHTAG_MAX_LENGTH) {
    return { ok: false, reason: 'INVALID' };
  }
  return { ok: true, name: text };
}

export type AddHashtagResult =
  | { ok: true; tags: string[]; added: boolean }
  | { ok: false; reason: 'EMPTY' | 'INVALID' | 'TOO_MANY' };

// Thêm một thẻ vào danh sách đang chọn. Trùng thì bỏ qua (không lỗi, `added: false`); thẻ MỚI khi đã đủ 10 thì bị chặn.
export function addHashtag(tags: string[], raw: string): AddHashtagResult {
  const normalized = normalizeHashtag(raw);
  if (!normalized.ok) return normalized;
  if (tags.includes(normalized.name)) return { ok: true, tags, added: false };
  if (tags.length >= HASHTAG_MAX_COUNT)
    return { ok: false, reason: 'TOO_MANY' };
  return { ok: true, tags: [...tags, normalized.name], added: true };
}
