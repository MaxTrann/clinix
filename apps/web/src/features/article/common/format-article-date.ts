export const ARTICLE_DATE_NONE = '—';

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
// Chỉ nhận chuỗi ISO 8601 (API trả `2026-11-28T03:00:00.000Z`); chuỗi khác (ví dụ "12") không được coi là ngày
const ISO_PREFIX = /^\d{4}-\d{2}-\d{2}T/u;

const pad = (value: number) => String(value).padStart(2, '0');

// Ngày hiển thị `dd/MM/yyyy` theo giờ Việt Nam (MH18) từ chuỗi ISO UTC của API. Cộng 7 giờ rồi đọc theo UTC nên KHÔNG phụ thuộc múi giờ của máy.
// Không có ngày (bài chưa xuất bản) hay sai dạng ⇒ "—" (không in "NaN").
export function formatArticleDate(iso: string | null | undefined): string {
  if (typeof iso !== 'string' || !ISO_PREFIX.test(iso))
    return ARTICLE_DATE_NONE;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return ARTICLE_DATE_NONE;
  const date = new Date(time + VIETNAM_OFFSET_MS);
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}
