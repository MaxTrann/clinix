import type {
  ArticleDetail,
  ArticleInput,
  ArticlePatch,
  ArticleStatus,
} from '../api/article-types';
import {
  ARTICLE_ERROR,
  articleErrorText,
  type ArticleField,
} from '../common/article-errors';

// Luật của biểu mẫu bài viết (PLAN article 5.5, 5.8, MH15, T7). Hàm thuần: kiểm tại chỗ trước khi gửi, dựng thân `POST` và `PATCH`.
export const TITLE_MAX = 255;
export const SUMMARY_MAX = 500;
export const CONTENT_MAX_CHARS = 20_000;
export const CONTENT_MAX_BYTES = 60_000;

export type FieldErrors = Partial<Record<ArticleField, string>>;

// Bản nháp trong ô (chuỗi thô như người dùng gõ)
export interface ArticleDraft {
  tieuDe: string;
  moTaNgan: string;
  noiDung: string;
  hashtag: string[];
  trangThai: ArticleStatus;
}

export const EMPTY_DRAFT: ArticleDraft = {
  tieuDe: '',
  moTaNgan: '',
  noiDung: '',
  hashtag: [],
  trangThai: 'BanNhap',
};

export function draftFromArticle(article: ArticleDetail): ArticleDraft {
  return {
    tieuDe: article.tieuDe,
    moTaNgan: article.moTaNgan ?? '',
    noiDung: article.noiDung,
    hashtag: [...article.hashtag],
    trangThai: article.trangThai,
  };
}

// Chuẩn hoá như máy chủ (T7): tiêu đề gộp khoảng trắng; nội dung `\r\n` ⇒ `\n` và NFC
const normalizeTitle = (text: string) => text.trim().replace(/\s+/gu, ' ');
const normalizeContent = (text: string) =>
  text.replace(/\r\n?/gu, '\n').normalize('NFC');

// Đếm ký tự theo ĐIỂM MÃ Unicode (emoji là 1), khớp ABN-03: 16.000 emoji bị chặn vì quá BYTE, không vì quá ký tự
export const charCount = (text: string) => Array.from(text).length;
export const contentLength = (text: string) =>
  charCount(normalizeContent(text));
export const contentBytes = (text: string) =>
  new TextEncoder().encode(normalizeContent(text)).length;

const textOf = (code: string) => articleErrorText(code) ?? code;

export function validateDraft(draft: ArticleDraft): FieldErrors {
  const errors: FieldErrors = {};
  const title = normalizeTitle(draft.tieuDe);
  if (title === '' || charCount(title) > TITLE_MAX) {
    errors.tieuDe = textOf(ARTICLE_ERROR.title);
  }
  if (charCount(draft.moTaNgan.trim()) > SUMMARY_MAX) {
    errors.moTaNgan = textOf(ARTICLE_ERROR.summaryTooLong);
  }
  if (
    contentLength(draft.noiDung) > CONTENT_MAX_CHARS ||
    contentBytes(draft.noiDung) > CONTENT_MAX_BYTES
  ) {
    errors.noiDung = textOf(ARTICLE_ERROR.contentTooLong);
  } else if (draft.trangThai === 'DaXuatBan' && draft.noiDung.trim() === '') {
    errors.noiDung = textOf(ARTICLE_ERROR.contentRequiredToPublish);
  }
  return errors;
}

type DraftKey = keyof ArticleDraft;

const sameTags = (a: string[], b: string[]) =>
  a.length === b.length &&
  [...a].sort().join('\n') === [...b].sort().join('\n');

// Các ô khác nhau giữa hai bản nháp (so theo cách máy chủ chuẩn hoá, thứ tự thẻ không tính)
export function changedKeys(initial: ArticleDraft, draft: ArticleDraft) {
  const keys: DraftKey[] = [];
  if (normalizeTitle(initial.tieuDe) !== normalizeTitle(draft.tieuDe))
    keys.push('tieuDe');
  if (initial.moTaNgan.trim() !== draft.moTaNgan.trim()) keys.push('moTaNgan');
  if (normalizeContent(initial.noiDung) !== normalizeContent(draft.noiDung))
    keys.push('noiDung');
  if (!sameTags(initial.hashtag, draft.hashtag)) keys.push('hashtag');
  if (initial.trangThai !== draft.trangThai) keys.push('trangThai');
  return keys;
}

// Thân tạo: luôn gửi `noiDung` và `hashtag` (rỗng cũng được); mô tả để trống thì bỏ khoá
export function buildCreateBody(draft: ArticleDraft): ArticleInput {
  const summary = draft.moTaNgan.trim();
  return {
    tieuDe: normalizeTitle(draft.tieuDe),
    ...(summary === '' ? {} : { moTaNgan: summary }),
    noiDung: draft.noiDung,
    hashtag: draft.hashtag,
    trangThai: draft.trangThai === 'DaXuatBan' ? 'DaXuatBan' : 'BanNhap',
  };
}

// Thân sửa: CHỈ các ô đã đổi (giảm nguy cơ ghi đè khi hai người cùng sửa); xoá mô tả bằng chuỗi rỗng; `hashtag` có mặt là thay toàn bộ
export function buildPatch(
  initial: ArticleDraft,
  draft: ArticleDraft,
): ArticlePatch {
  const patch: ArticlePatch = {};
  for (const key of changedKeys(initial, draft)) {
    if (key === 'tieuDe') patch.tieuDe = normalizeTitle(draft.tieuDe);
    else if (key === 'moTaNgan') patch.moTaNgan = draft.moTaNgan.trim();
    else if (key === 'noiDung') patch.noiDung = draft.noiDung;
    else if (key === 'hashtag') patch.hashtag = draft.hashtag;
    else patch.trangThai = draft.trangThai;
  }
  return patch;
}
