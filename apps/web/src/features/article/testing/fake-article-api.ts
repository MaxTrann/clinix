import { ApiError, RequestAbortedError } from '../../../shared/api/errors';
import type { VaiTro } from '../../auth';
import type { ArticleApi } from '../api/article-api';
import {
  ARTICLE_LIST_PAGE_SIZE,
  ARTICLE_SEARCH_MAX_LENGTH,
  PUBLIC_LIST_PAGE_SIZE,
  RATING_CHOICES,
  TAG_SUGGESTION_LIMIT,
  type ArticleDetail,
  type ArticleListPage,
  type ArticlePatch,
  type ArticleRatingResult,
  type ArticleStatus,
  type RatingChoice,
  type RatingTotals,
} from '../api/article-types';
import { ARTICLE_ERROR } from '../common/article-errors';
import { isArticleId } from '../common/article-paths';
import { normalizeHashtag, HASHTAG_MAX_COUNT } from '../common/hashtag-name';
import {
  countByStatus,
  toListItem,
  toPublicDetail,
  toPublicItem,
} from './article-fixtures';

// Máy chủ bài viết GIẢ trong bộ nhớ, làm đúng hợp đồng PLAN article 5.7 và 5.8 (kiểm dữ liệu, mã lỗi, đếm theo trạng thái, sắp theo cập nhật giảm dần).
// Chỉ dùng trong test. Hợp đồng thật do B1 giữ: đối chiếu lại khi B1 vào `main`.
export type ArticleApiMethod = keyof ArticleApi;

export interface FakeCall {
  method: ArticleApiMethod;
  args: unknown[];
}

// Giữ một lời gọi lơ lửng (để dựng ca chạy đua) rồi cho nó chạy tiếp hay hỏng
export interface Gate {
  release(): void;
  fail(error: unknown): void;
}

export interface FakeArticleApi extends ArticleApi {
  calls: FakeCall[];
  callsTo(method: ArticleApiMethod): FakeCall[];
  articles(): ArticleDetail[];
  // Lời gọi KẾ TIẾP của `method` ném `error` (một lần cho mỗi lần gọi hàm này)
  failNext(method: ArticleApiMethod, error: unknown): void;
  // Lời gọi KẾ TIẾP của `method` chờ tới khi `release()` hay `fail()`
  hold(method: ArticleApiMethod): Gate;
  // ----- Đánh giá (article F3) -----
  // Người gọi route `patient/…`: mặc định là KHÁCH. Danh tính được CHỤP lúc gọi (như token đi theo request), không phải lúc máy chủ xử lý.
  signInAs(vaiTro: VaiTro, accountId?: string): void;
  signOut(): void;
  // Thêm phiếu của một tài khoản (không qua kiểm quyền); dùng để dựng "đã có phiếu" và số đếm
  seedRating(articleId: string, accountId: string, loai: RatingChoice): void;
  // Thêm `thich` phiếu Thích và `khongThich` phiếu Không thích của những tài khoản khác
  seedRatings(
    articleId: string,
    counts: { thich?: number; khongThich?: number },
  ): void;
  // Phiếu hiện có của một tài khoản; số dòng phiếu của một bài (khoá chính `(tài khoản, bài)`: tối đa một dòng mỗi tài khoản)
  ratingOf(articleId: string, accountId: string): RatingChoice | null;
  ratingRows(articleId: string): number;
}

const MAX_TITLE = 255;
const MAX_SUMMARY = 500;
const MAX_CONTENT_CHARS = 20_000;
const MAX_CONTENT_BYTES = 60_000;
// Công khai (B2): bộ lọc sai dạng có mã riêng; `q` tối đa 100 đơn vị UTF-16; thẻ phổ biến tối đa 20
const INVALID_FILTER = 'BO_LOC_KHONG_HOP_LE';
const MAX_KEYWORD = ARTICLE_SEARCH_MAX_LENGTH;
const MAX_POPULAR_TAGS = 20;
// Đánh giá (B3): khách 401 `CHUA_DANG_NHAP`; `loai` lạ ⇒ 400 `DU_LIEU_KHONG_HOP_LE` kèm `loi[{ loai, LOAI_DANH_GIA_KHONG_HOP_LE }]`
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_RATING = 'LOAI_DANH_GIA_KHONG_HOP_LE';

interface Caller {
  vaiTro: VaiTro;
  accountId: string;
}

// Ký tự điều khiển bị cấm, trừ xuống dòng và tab (PLAN article T7). Duyệt mã ký tự thay vì regex để khỏi vướng luật `no-control-regex`.
function hasControlChars(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if ((code < 32 && code !== 9 && code !== 10) || code === 127) return true;
  }
  return false;
}

// Chữ thường, bỏ dấu thanh, mũ, móc: mô phỏng so khớp của `utf8mb4_unicode_ci`. `đ` và `d` là HAI chữ khác nhau (B1 đã đo thật: "đau" và "dau" tạo được cả hai thẻ)
const foldAccents = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

export function apiError(
  status: number,
  maLoi: string,
  extra: { loi?: { truong: string; ma: string }[]; chiTiet?: unknown } = {},
): ApiError {
  return new ApiError(status, { maLoi, thongBao: maLoi, ...extra });
}

// Lỗi theo ô: 400 DU_LIEU_KHONG_HOP_LE kèm `loi[{ truong, ma }]`
const fieldError = (truong: string, ma: string) =>
  apiError(400, ARTICLE_ERROR.invalidData, { loi: [{ truong, ma }] });

// Thân tạo (`ArticleInput`) gán được vào thân sửa (`ArticlePatch`), nên một kiểu đủ cho cả hai
type Draft = ArticlePatch;

// Kiểm và chuẩn hoá các khoá có mặt; ném lỗi đầu tiên gặp theo thứ tự tiêu đề, mô tả, nội dung, thẻ
function clean(draft: Draft): Draft {
  const out: Draft = { ...draft };
  if (draft.tieuDe !== undefined) {
    out.tieuDe = draft.tieuDe.trim().replace(/\s+/gu, ' ');
    if (out.tieuDe === '' || Array.from(out.tieuDe).length > MAX_TITLE) {
      throw fieldError('tieuDe', ARTICLE_ERROR.title);
    }
  }
  if (draft.moTaNgan !== undefined) {
    out.moTaNgan = draft.moTaNgan.trim();
    // B1 báo `MO_TA_KHONG_HOP_LE` khi mô tả có ký tự điều khiển (xuống dòng và tab chỉ là khoảng trắng)
    if (hasControlChars(out.moTaNgan)) {
      throw fieldError('moTaNgan', ARTICLE_ERROR.summaryInvalid);
    }
    if (Array.from(out.moTaNgan).length > MAX_SUMMARY) {
      throw fieldError('moTaNgan', ARTICLE_ERROR.summaryTooLong);
    }
  }
  if (draft.noiDung !== undefined) {
    out.noiDung = draft.noiDung.replace(/\r\n?/gu, '\n').normalize('NFC');
    if (hasControlChars(out.noiDung)) {
      throw fieldError('noiDung', ARTICLE_ERROR.contentInvalid);
    }
    if (
      Array.from(out.noiDung).length > MAX_CONTENT_CHARS ||
      new TextEncoder().encode(out.noiDung).length > MAX_CONTENT_BYTES
    ) {
      throw fieldError('noiDung', ARTICLE_ERROR.contentTooLong);
    }
  }
  if (draft.hashtag !== undefined) {
    const names = draft.hashtag.map((raw) => {
      const result = normalizeHashtag(raw);
      if (!result.ok) throw fieldError('hashtag', ARTICLE_ERROR.tagInvalid);
      return result.name;
    });
    out.hashtag = [...new Set(names)];
    if (out.hashtag.length > HASHTAG_MAX_COUNT) {
      throw fieldError('hashtag', ARTICLE_ERROR.tooManyTags);
    }
  }
  return out;
}

export function createFakeArticleApi(
  seed: ArticleDetail[] = [],
): FakeArticleApi {
  const store = new Map(seed.map((article) => [article.baiVietId, article]));
  const calls: FakeCall[] = [];
  const failures = new Map<ArticleApiMethod, unknown[]>();
  const gates = new Map<ArticleApiMethod, Promise<void>[]>();
  let lastId = Math.max(0, ...seed.map((article) => Number(article.baiVietId)));
  let clock = 0;
  // Mỗi lần ghi cách nhau một phút để thứ tự "cập nhật gần nhất" xác định
  const stamp = () =>
    new Date(Date.UTC(2026, 10, 28, 3, 0) + ++clock * 60_000).toISOString();

  async function enter(
    method: ArticleApiMethod,
    args: unknown[],
    signal?: AbortSignal,
  ) {
    calls.push({ method, args });
    const gate = gates.get(method)?.shift();
    if (gate) await gate;
    if (signal?.aborted) throw new RequestAbortedError();
    const queue = failures.get(method);
    if (queue && queue.length > 0) throw queue.shift();
  }

  function find(id: string): ArticleDetail {
    const article = store.get(id);
    if (!article) throw apiError(404, ARTICLE_ERROR.notFound);
    return article;
  }

  const copy = (article: ArticleDetail): ArticleDetail => ({
    ...article,
    hashtag: [...article.hashtag],
  });

  // ----- Đánh giá (article F3; làm đúng hợp đồng B3 đã merge `1c6e901`, kể cả những chỗ máy chủ TỪ CHỐI) -----
  // Phiếu theo bài: bài ⇒ (tài khoản ⇒ loại). Khoá chính kép của bảng thật: mỗi tài khoản tối đa MỘT phiếu cho mỗi bài
  const ratings = new Map<string, Map<string, RatingChoice>>();
  let caller: Caller | null = null;
  let seededVoters = 0;

  function votesOf(articleId: string): Map<string, RatingChoice> {
    let votes = ratings.get(articleId);
    if (votes === undefined) {
      votes = new Map();
      ratings.set(articleId, votes);
    }
    return votes;
  }

  // Số đếm TÍNH Ở BẢN GIẢ từ chính kho phiếu (như `GROUP BY loai` của máy chủ), không ai nhập sẵn
  function totalsOf(articleId: string): RatingTotals {
    let luotThich = 0;
    let luotKhongThich = 0;
    for (const loai of votesOf(articleId).values()) {
      if (loai === 'Thich') luotThich += 1;
      else luotKhongThich += 1;
    }
    return { luotThich, luotKhongThich };
  }

  const ratingResult = (
    articleId: string,
    loai: RatingChoice | null,
  ): ArticleRatingResult => ({ loai, ...totalsOf(articleId) });

  // Guard của máy chủ (chạy TRƯỚC pipe và service): khách 401, vai khác Bệnh nhân 403
  function requirePatient(who: Caller | null): string {
    if (who === null) throw apiError(401, NOT_LOGGED_IN);
    if (who.vaiTro !== 'BenhNhan') throw apiError(403, ARTICLE_ERROR.forbidden);
    return who.accountId;
  }

  // Service: chỉ bài ĐÃ XUẤT BẢN; sai dạng, không có, nháp, lưu trữ cùng một 404 `KHONG_TIM_THAY` (phiếu của bài đang bị ẩn cũng không đụng được)
  function requirePublished(id: string): void {
    const article = isArticleId(id) ? store.get(id) : undefined;
    if (article === undefined || article.trangThai !== 'DaXuatBan') {
      throw apiError(404, ARTICLE_ERROR.notFound);
    }
  }

  // Ghi thêm: bài đã sửa rồi kiểm luật nghiệp vụ (xuất bản cần nội dung); `thoiDiemXuatBan` đặt MỘT lần ở lần đầu xuất bản
  function save(article: ArticleDetail): ArticleDetail {
    if (article.trangThai === 'DaXuatBan' && article.noiDung.trim() === '') {
      throw apiError(400, ARTICLE_ERROR.contentRequiredToPublish);
    }
    const next = { ...article, capNhatLanCuoi: stamp() };
    if (next.trangThai === 'DaXuatBan' && next.thoiDiemXuatBan === null) {
      next.thoiDiemXuatBan = next.capNhatLanCuoi;
    }
    store.set(next.baiVietId, next);
    return copy(next);
  }

  return {
    calls,
    callsTo: (method) => calls.filter((call) => call.method === method),
    articles: () => [...store.values()].map(copy),
    failNext(method, error) {
      failures.set(method, [...(failures.get(method) ?? []), error]);
    },
    hold(method) {
      let release!: () => void;
      let fail!: (error: unknown) => void;
      const promise = new Promise<void>((resolve, reject) => {
        release = resolve;
        fail = reject;
      });
      gates.set(method, [...(gates.get(method) ?? []), promise]);
      return { release, fail };
    },

    signInAs(vaiTro, accountId = 'bn-1') {
      caller = { vaiTro, accountId };
    },
    signOut() {
      caller = null;
    },
    seedRating(articleId, accountId, loai) {
      votesOf(articleId).set(accountId, loai);
    },
    seedRatings(articleId, counts) {
      for (let i = 0; i < (counts.thich ?? 0); i += 1) {
        votesOf(articleId).set(`seed-${(seededVoters += 1)}`, 'Thich');
      }
      for (let i = 0; i < (counts.khongThich ?? 0); i += 1) {
        votesOf(articleId).set(`seed-${(seededVoters += 1)}`, 'KhongThich');
      }
    },
    ratingOf: (articleId, accountId) =>
      votesOf(articleId).get(accountId) ?? null,
    ratingRows: (articleId) => votesOf(articleId).size,

    async list(query, signal) {
      await enter('list', [query], signal);
      const keyword = query.q?.toLocaleLowerCase('vi');
      // Đếm theo trạng thái tính trên mọi bộ lọc TRỪ `trangThai` (PLAN T20)
      const matching = [...store.values()].filter(
        (article) =>
          (keyword === undefined ||
            article.tieuDe.toLocaleLowerCase('vi').includes(keyword)) &&
          (query.the === undefined || article.hashtag.includes(query.the)),
      );
      const filtered = matching
        .filter(
          (article) =>
            query.trangThai === undefined ||
            article.trangThai === query.trangThai,
        )
        .sort((a, b) =>
          (b.capNhatLanCuoi ?? '').localeCompare(a.capNhatLanCuoi ?? ''),
        );
      const start = (query.page - 1) * ARTICLE_LIST_PAGE_SIZE;
      const page: ArticleListPage = {
        items: filtered
          .slice(start, start + ARTICLE_LIST_PAGE_SIZE)
          .map(toListItem),
        total: filtered.length,
        page: query.page,
        pageSize: ARTICLE_LIST_PAGE_SIZE,
        demTheoTrangThai: countByStatus(matching),
      };
      return page;
    },

    async get(id, signal) {
      await enter('get', [id], signal);
      return copy(find(id));
    },

    async create(input) {
      await enter('create', [input]);
      if ((input.trangThai as ArticleStatus) === 'LuuTruAn') {
        throw apiError(400, ARTICLE_ERROR.statusInvalid);
      }
      const data = clean(input);
      lastId += 1;
      return save({
        baiVietId: String(lastId),
        tieuDe: data.tieuDe ?? '',
        moTaNgan: data.moTaNgan ? data.moTaNgan : null,
        trangThai: input.trangThai,
        thoiDiemXuatBan: null,
        thoiDiemTao: stamp(),
        capNhatLanCuoi: null,
        tacGia: { taiKhoanId: '1', hoTen: 'Quản trị viên mẫu' },
        hashtag: data.hashtag ?? [],
        anhDaiDien: null,
        noiDung: data.noiDung ?? '',
      });
    },

    async update(id, patch) {
      await enter('update', [id, patch]);
      const current = find(id);
      const data = clean(patch);
      return save({
        ...current,
        tieuDe: data.tieuDe ?? current.tieuDe,
        moTaNgan:
          data.moTaNgan === undefined
            ? current.moTaNgan
            : data.moTaNgan || null,
        noiDung: data.noiDung ?? current.noiDung,
        hashtag: data.hashtag ?? current.hashtag,
        trangThai: patch.trangThai ?? current.trangThai,
      });
    },

    async suggestTags(prefix, signal) {
      await enter('suggestTags', [prefix], signal);
      const all = new Set([...store.values()].flatMap((a) => a.hashtag));
      // Khớp tiền tố KHÔNG phân biệt dấu như collation `utf8mb4_unicode_ci` của máy chủ (gõ "tre" ra "trẻ-em")
      return [...all]
        .filter((name) => foldAccents(name).startsWith(foldAccents(prefix)))
        .sort()
        .slice(0, TAG_SUGGESTION_LIMIT);
    },

    // ----- Công khai (article F2): làm đúng hợp đồng B2 đã merge (`83bd275`), kể cả những chỗ máy chủ TỪ CHỐI -----
    async listPublic(query, signal) {
      await enter('listPublic', [query], signal);
      // `the` RỖNG hay sai dạng ⇒ 400 `BO_LOC_KHONG_HOP_LE`: bản giả từ chối để test bắt được web lỡ gửi `the=`
      const tag = query.the === undefined ? null : normalizeHashtag(query.the);
      if (tag !== null && !tag.ok) {
        throw apiError(400, INVALID_FILTER, {
          loi: [{ truong: 'the', ma: ARTICLE_ERROR.tagInvalid }],
        });
      }
      const keyword = query.q?.trim().normalize('NFC');
      if (keyword !== undefined && keyword.length > MAX_KEYWORD) {
        throw fieldError('q', ARTICLE_ERROR.invalidKeyword);
      }
      // Khớp tiêu đề và thẻ KHÔNG phân biệt hoa thường, dấu thanh, mũ, móc (collation `utf8mb4_unicode_ci`); `đ` khác `d`
      const matching = [...store.values()]
        .filter((article) => article.trangThai === 'DaXuatBan')
        .filter(
          (article) =>
            !keyword ||
            foldAccents(article.tieuDe).includes(foldAccents(keyword)),
        )
        .filter(
          (article) =>
            tag === null ||
            article.hashtag.some(
              (name) => foldAccents(name) === foldAccents(tag.name),
            ),
        )
        // Mới nhất trước; bài thiếu thời điểm xuất bản (dữ liệu lệch) xếp CUỐI; hoà thì mã giảm dần
        .sort(
          (a, b) =>
            (b.thoiDiemXuatBan ?? '').localeCompare(a.thoiDiemXuatBan ?? '') ||
            Number(b.baiVietId) - Number(a.baiVietId),
        );
      const pageSize = query.pageSize ?? PUBLIC_LIST_PAGE_SIZE;
      const start = (query.page - 1) * pageSize;
      return {
        items: matching.slice(start, start + pageSize).map(toPublicItem),
        total: matching.length,
        page: query.page,
        pageSize,
      };
    },

    // Sai dạng, không có, nháp, lưu trữ: CÙNG một 404 `KHONG_TIM_THAY`
    async getPublic(id, signal) {
      await enter('getPublic', [id], signal);
      const article = isArticleId(id) ? store.get(id) : undefined;
      if (article === undefined || article.trangThai !== 'DaXuatBan') {
        throw apiError(404, ARTICLE_ERROR.notFound);
      }
      return toPublicDetail(article, totalsOf(id));
    },

    async listPublicTags(signal) {
      await enter('listPublicTags', [], signal);
      const counts = new Map<string, number>();
      for (const article of store.values()) {
        if (article.trangThai !== 'DaXuatBan') continue;
        for (const name of article.hashtag) {
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
      }
      return [...counts]
        .map(([ten, soBai]) => ({ ten, soBai }))
        .sort((a, b) => b.soBai - a.soBai || a.ten.localeCompare(b.ten, 'vi'))
        .slice(0, MAX_POPULAR_TAGS);
    },

    // Thứ tự của máy chủ thật: guard (401, 403) ⇒ pipe (400 `loai` lạ) ⇒ service (404). Danh tính chụp LÚC GỌI, như token đi theo request
    async getMyRating(id, signal) {
      const who = caller;
      await enter('getMyRating', [id], signal);
      const accountId = requirePatient(who);
      requirePublished(id);
      return votesOf(id).get(accountId) ?? null;
    },

    async setRating(id, loai) {
      const who = caller;
      await enter('setRating', [id, loai]);
      const accountId = requirePatient(who);
      if (!RATING_CHOICES.some((choice) => choice === loai)) {
        throw fieldError('loai', INVALID_RATING);
      }
      requirePublished(id);
      votesOf(id).set(accountId, loai);
      return ratingResult(id, loai);
    },

    // Idempotent: thu hồi khi chưa có phiếu vẫn 200 (số đếm giữ nguyên)
    async clearRating(id) {
      const who = caller;
      await enter('clearRating', [id]);
      const accountId = requirePatient(who);
      requirePublished(id);
      votesOf(id).delete(accountId);
      return ratingResult(id, null);
    },
  };
}
