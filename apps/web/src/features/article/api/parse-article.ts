import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  isArticleStatus,
  isRatingChoice,
  type ArticleDetail,
  type ArticleListItem,
  type ArticleListPage,
  type ArticleRatingResult,
  type ArticleStatusCounts,
  type PublicArticleDetail,
  type PublicArticleItem,
  type PublicArticlePage,
  type PublicArticleTag,
  type RatingChoice,
  type RatingTotals,
} from './article-types';

// Kiểm hình dạng thân phản hồi (PLAN article ABW-12): thiếu khoá mà giao diện CẦN, hay sai kiểu, thì ném `UnexpectedResponseError`
// để trang hiện `ErrorState` thay vì trắng trang. Khoá chỉ để hiển thị phụ (ngày, tác giả, ảnh, mô tả) thì chịu thiếu và coi là `null`.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bad(): never {
  throw new UnexpectedResponseError(200);
}

function requireString(value: unknown): string {
  return typeof value === 'string' ? value : bad();
}

function requireCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : bad();
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function requireStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return bad();
  return value.map(requireString);
}

function parseAuthor(value: unknown): ArticleListItem['tacGia'] {
  if (
    !isRecord(value) ||
    typeof value.taiKhoanId !== 'string' ||
    typeof value.hoTen !== 'string'
  ) {
    return null;
  }
  return { taiKhoanId: value.taiKhoanId, hoTen: value.hoTen };
}

function parseItem(value: unknown): ArticleListItem {
  if (!isRecord(value)) return bad();
  const { trangThai } = value;
  if (!isArticleStatus(trangThai)) return bad();
  return {
    baiVietId: requireString(value.baiVietId),
    tieuDe: requireString(value.tieuDe),
    moTaNgan: stringOrNull(value.moTaNgan),
    trangThai,
    thoiDiemXuatBan: stringOrNull(value.thoiDiemXuatBan),
    thoiDiemTao: stringOrNull(value.thoiDiemTao),
    capNhatLanCuoi: stringOrNull(value.capNhatLanCuoi),
    tacGia: parseAuthor(value.tacGia),
    hashtag: requireStrings(value.hashtag),
    anhDaiDien: stringOrNull(value.anhDaiDien),
  };
}

function parseCounts(value: unknown): ArticleStatusCounts {
  if (!isRecord(value)) return bad();
  return {
    BanNhap: requireCount(value.BanNhap),
    DaXuatBan: requireCount(value.DaXuatBan),
    LuuTruAn: requireCount(value.LuuTruAn),
  };
}

export function parseArticleListPage(raw: unknown): ArticleListPage {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return bad();
  return {
    items: raw.items.map(parseItem),
    total: requireCount(raw.total),
    page: requireCount(raw.page),
    pageSize: requireCount(raw.pageSize),
    demTheoTrangThai: parseCounts(raw.demTheoTrangThai),
  };
}

export function parseArticleDetail(raw: unknown): ArticleDetail {
  if (!isRecord(raw)) return bad();
  return { ...parseItem(raw), noiDung: requireString(raw.noiDung) };
}

// `GET admin/hashtags` trả `{ items: [{ ten }] }`; web chỉ cần danh sách tên
export function parseTagSuggestions(raw: unknown): string[] {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return bad();
  return raw.items.map((item) =>
    isRecord(item) ? requireString(item.ten) : bad(),
  );
}

// ----- Công khai (article F2, ABG-14) -----
// Cùng nguyên tắc: khoá giao diện CẦN (mã, tiêu đề, thẻ, nội dung) thiếu hay sai kiểu ⇒ `UnexpectedResponseError`; khoá chỉ để hiển thị phụ
// (mô tả, ảnh, thời điểm xuất bản) thì chịu thiếu và coi là `null`. Khoá thừa không có trong kiểu thì bị bỏ qua, không làm vỡ.
// Từ article F3, hai số đếm của chi tiết (`luotThich`, `luotKhongThich`) là khoá CẦN: thiếu hay sai kiểu ⇒ lỗi (xem `parsePublicArticleDetail`).
function parsePublicItem(value: unknown): PublicArticleItem {
  if (!isRecord(value)) return bad();
  return {
    baiVietId: requireString(value.baiVietId),
    tieuDe: requireString(value.tieuDe),
    moTaNgan: stringOrNull(value.moTaNgan),
    anhDaiDien: stringOrNull(value.anhDaiDien),
    thoiDiemXuatBan: stringOrNull(value.thoiDiemXuatBan),
    hashtag: requireStrings(value.hashtag),
  };
}

export function parsePublicArticlePage(raw: unknown): PublicArticlePage {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return bad();
  return {
    items: raw.items.map(parsePublicItem),
    total: requireCount(raw.total),
    page: requireCount(raw.page),
    pageSize: requireCount(raw.pageSize),
  };
}

// Số đếm đánh giá (article F3): số nguyên KHÔNG ÂM. Chặt hơn `requireCount`: -1 hay 1,5 là sai kiểu, không được hiện ra màn hình
function requireTotal(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : bad();
}

function parseRatingTotals(value: Record<string, unknown>): RatingTotals {
  return {
    luotThich: requireTotal(value.luotThich),
    luotKhongThich: requireTotal(value.luotKhongThich),
  };
}

// Chi tiết công khai có 9 khoá: 7 khoá của B2 cộng `luotThich`, `luotKhongThich` của B3
export function parsePublicArticleDetail(raw: unknown): PublicArticleDetail {
  if (!isRecord(raw)) return bad();
  return {
    ...parsePublicItem(raw),
    noiDung: requireString(raw.noiDung),
    ...parseRatingTotals(raw),
  };
}

// `loai` là `null` (chưa đánh giá) hoặc đúng một trong hai chuỗi; mọi thứ khác (kể cả vắng khoá) là sai hình dạng
function parseLoai(value: unknown): RatingChoice | null {
  if (value === null) return null;
  return isRatingChoice(value) ? value : bad();
}

// `GET patient/articles/:id/rating` trả `{ loai }`: phiếu của CHÍNH người gọi
export function parseRatingChoice(raw: unknown): RatingChoice | null {
  if (!isRecord(raw)) return bad();
  return parseLoai(raw.loai);
}

// `PUT` và `DELETE` trả `{ loai, luotThich, luotKhongThich }`
export function parseRatingResult(raw: unknown): ArticleRatingResult {
  if (!isRecord(raw)) return bad();
  return { loai: parseLoai(raw.loai), ...parseRatingTotals(raw) };
}

// `GET public/article-tags` trả `{ items: [{ ten, soBai }] }`
export function parsePublicTags(raw: unknown): PublicArticleTag[] {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return bad();
  return raw.items.map((item) =>
    isRecord(item)
      ? { ten: requireString(item.ten), soBai: requireCount(item.soBai) }
      : bad(),
  );
}
