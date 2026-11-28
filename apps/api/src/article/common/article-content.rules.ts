import { ARTICLE_LIMITS } from '../article.constants.js';
import { ARTICLE_FIELD_ERRORS } from './article-errors.js';

// Quy tắc nội dung của bài viết (PLAN article 5.5, T7, MH15). Hàm THUẦN (không đọc DB, không đồng hồ).
// Nội dung bài là CHỮ THUẦN, LƯU NGUYÊN VĂN: không lọc, không thoát HTML ở máy chủ. Mọi nơi dùng nội dung phải tự coi là chữ thuần (R5, nợ kỹ thuật).

const TAB = 0x09;
const NEWLINE = 0x0a;

interface TextScan {
  /** Số điểm mã (một emoji là một điểm mã), khác `text.length` (đơn vị mã UTF-16). */
  codePoints: number;
  /** Có ký tự điều khiển (C0 trừ các mã được phép, DEL, C1). */
  hasControl: boolean;
  /** Có nửa cặp thay thế lẻ: MySQL utf8mb4 từ chối chuỗi này (lỗi 1366) nên phải chặn trước. */
  hasLoneSurrogate: boolean;
}

/** Quét một lượt: đếm điểm mã, tìm ký tự điều khiển và nửa cặp thay thế lẻ. Viết bằng vòng lặp (không dùng regex ký tự điều khiển, tránh lỗi lint và lỗi ghi file). */
function scanText(text: string, allowedControls: readonly number[]): TextScan {
  let codePoints = 0;
  let hasControl = false;
  let hasLoneSurrogate = false;
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) index++;
      else hasLoneSurrogate = true;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      hasLoneSurrogate = true;
    } else if (
      (unit < 0x20 && !allowedControls.includes(unit)) ||
      (unit >= 0x7f && unit <= 0x9f)
    ) {
      hasControl = true;
    }
    codePoints++;
  }
  return { codePoints, hasControl, hasLoneSurrogate };
}

/** Số điểm mã của chuỗi (độ dài theo ký tự mà MySQL `varchar(n)` đếm). */
export function codePointLength(text: string): number {
  return scanText(text, []).codePoints;
}

/** Chuẩn hoá một dòng chữ (tiêu đề, mô tả): NFC, gộp mọi dãy khoảng trắng (kể cả tab, xuống dòng) thành một dấu cách, bỏ khoảng trắng hai đầu. */
function normalizeLine(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function normalizeTitle(raw: string): string {
  return normalizeLine(raw);
}

/** Tiêu đề (đã chuẩn hoá) hợp lệ: 1 đến 255 điểm mã, không ký tự điều khiển, không nửa cặp thay thế lẻ (ABV-02). */
export function isValidTitle(title: string): boolean {
  const scan = scanText(title, []);
  return (
    !scan.hasControl &&
    !scan.hasLoneSurrogate &&
    scan.codePoints >= 1 &&
    scan.codePoints <= ARTICLE_LIMITS.titleMax
  );
}

/** Mô tả ngắn: như tiêu đề; chuỗi rỗng sau chuẩn hoá thành `null` (cột `mo_ta_ngan` cho phép NULL; ABV-11). */
export function normalizeSummary(raw: string): string | null {
  const text = normalizeLine(raw);
  return text === '' ? null : text;
}

/** Mã lỗi của mô tả (đã chuẩn hoá) hay `null` nếu hợp lệ (500 nhận, 501 từ chối). */
export function summaryIssue(summary: string): string | null {
  const scan = scanText(summary, []);
  if (scan.hasControl || scan.hasLoneSurrogate)
    return ARTICLE_FIELD_ERRORS.INVALID_SUMMARY;
  return scan.codePoints > ARTICLE_LIMITS.summaryMax
    ? ARTICLE_FIELD_ERRORS.SUMMARY_TOO_LONG
    : null;
}

/** Nội dung: `\r\n` về `\n`, NFC. KHÔNG trim, KHÔNG lọc HTML (lưu nguyên văn). */
export function normalizeContent(raw: string): string {
  return raw.replace(/\r\n/g, '\n').normalize('NFC');
}

/**
 * Mã lỗi của nội dung (đã chuẩn hoá) hay `null` nếu hợp lệ. Ký tự điều khiển cấm trừ xuống dòng và tab (một `\r` lẻ cũng là ký tự điều khiển);
 * tối đa 20.000 điểm mã VÀ 60.000 byte UTF-8 (16.000 emoji là 64.000 byte nên bị chặn dù chưa tới 20.000 ký tự).
 */
export function contentIssue(content: string): string | null {
  const scan = scanText(content, [TAB, NEWLINE]);
  if (scan.hasControl || scan.hasLoneSurrogate)
    return ARTICLE_FIELD_ERRORS.INVALID_CONTENT;
  if (
    scan.codePoints > ARTICLE_LIMITS.contentMaxChars ||
    Buffer.byteLength(content, 'utf8') > ARTICLE_LIMITS.contentMaxBytes
  )
    return ARTICLE_FIELD_ERRORS.CONTENT_TOO_LONG;
  return null;
}

/** Nội dung rỗng hay toàn khoảng trắng: không được xuất bản (MH2). */
export function isBlankContent(content: string): boolean {
  return content.trim() === '';
}
