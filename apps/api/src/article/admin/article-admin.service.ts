import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import {
  isBlankContent,
  normalizeContent,
  normalizeSummary,
  normalizeTitle,
} from '../common/article-content.rules.js';
import {
  ARTICLE_FIELD_ERRORS,
  articleNotFound,
  contentRequiredToPublish,
  emptyPatch,
  invalidField,
  invalidInitialStatus,
  tagAccentConflict,
  tagDisabled,
} from '../common/article-errors.js';
import {
  canCreateWithStatus,
  needsContent,
  planStatusChange,
} from '../common/article-status.rules.js';
import {
  normalizeHashtag,
  normalizeHashtagList,
  sortHashtags,
} from '../common/hashtag-name.js';
import {
  TRANG_THAI_BAI_VIET,
  type TrangThaiBaiViet,
} from '../entities/enums.js';
import type { Paged } from '../../common/paging/paged.js';
import {
  ArticleAdminRepository,
  type ArticleDetailRow,
  type ArticlePatch,
  type ArticleRow,
} from './article-admin.repository.js';
import type {
  ArticleListQueryDto,
  CreateArticleDto,
  UpdateArticleDto,
} from './article-admin.dto.js';
import { HashtagRepository } from './hashtag.repository.js';

// Nghiệp vụ quản trị bài viết (article B1; PLAN article 5.3 đến 5.7). CHỈ Quản trị viên Toàn hệ thống (Q4, T2): mọi hàm gọi lại `assertToanHeThong` (guard ở controller là lớp thứ nhất).
// Mọi ghi bài và thẻ nằm trong MỘT giao dịch (T5): hoàn tác trọn khi có lỗi (409 thẻ, lỗi giữa chừng), không để lại bài hay thẻ mới nửa vời.

/** Một dòng danh sách hay chi tiết gửi ra (thời điểm là chuỗi ISO UTC; `noiDung` chỉ có ở chi tiết). */
export interface ArticleView {
  baiVietId: string;
  tieuDe: string;
  moTaNgan: string | null;
  trangThai: TrangThaiBaiViet;
  thoiDiemXuatBan: string | null;
  thoiDiemTao: string;
  capNhatLanCuoi: string;
  tacGia: { taiKhoanId: string; hoTen: string };
  hashtag: string[];
  anhDaiDien: string | null;
}

export interface ArticleDetailView extends ArticleView {
  noiDung: string;
}

export interface ArticleListView extends Paged<ArticleView> {
  demTheoTrangThai: Record<TrangThaiBaiViet, number>;
}

function toView(row: ArticleRow, tags: string[]): ArticleView {
  return {
    baiVietId: row.baiVietId,
    tieuDe: row.tieuDe,
    moTaNgan: row.moTaNgan,
    trangThai: row.trangThai,
    thoiDiemXuatBan: row.thoiDiemXuatBan?.toISOString() ?? null,
    thoiDiemTao: row.thoiDiemTao.toISOString(),
    capNhatLanCuoi: row.capNhatLanCuoi.toISOString(),
    tacGia: { taiKhoanId: row.tacGiaId, hoTen: row.tacGiaHoTen },
    hashtag: tags,
    anhDaiDien: row.anhDaiDien,
  };
}

@Injectable()
export class ArticleAdminService {
  constructor(
    @Inject(ArticleAdminRepository)
    private readonly articles: ArticleAdminRepository,
    @Inject(HashtagRepository) private readonly hashtags: HashtagRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
  ) {}

  async list(
    scope: AdminScope,
    input: ArticleListQueryDto,
  ): Promise<ArticleListView> {
    this.policy.assertToanHeThong(scope);
    if (!Number.isSafeInteger(input.offset) || input.offset < 0)
      throw invalidField('page', ARTICLE_FIELD_ERRORS.INVALID_PAGE);
    const result = await this.articles.list({
      q: input.q || undefined,
      trangThai: input.trangThai,
      the:
        input.the === undefined
          ? undefined
          : (normalizeHashtag(input.the) ?? undefined),
      limit: input.pageSize,
      offset: input.offset,
    });
    const demTheoTrangThai = Object.fromEntries(
      TRANG_THAI_BAI_VIET.map((status) => [status, result.counts[status] ?? 0]),
    ) as Record<TrangThaiBaiViet, number>;
    return {
      items: result.rows.map((row) =>
        toView(row, result.tags.get(row.baiVietId) ?? []),
      ),
      total: result.total,
      page: input.page,
      pageSize: input.pageSize,
      demTheoTrangThai,
    };
  }

  async get(scope: AdminScope, id: string): Promise<ArticleDetailView> {
    this.policy.assertToanHeThong(scope);
    return this.readOrThrow(id);
  }

  /** Tạo bài (`BanNhap` hay `DaXuatBan`); `tacGiaId` là tài khoản trong token, không nhận từ thân yêu cầu. */
  async create(
    scope: AdminScope,
    accountId: string,
    input: CreateArticleDto,
  ): Promise<ArticleDetailView> {
    this.policy.assertToanHeThong(scope);
    if (!canCreateWithStatus(input.trangThai)) throw invalidInitialStatus();
    const noiDung = normalizeContent(input.noiDung);
    if (needsContent(input.trangThai) && isBlankContent(noiDung))
      throw contentRequiredToPublish();
    const names = this.tagNames(input.hashtag);
    const stamp = toSecond(nowVN());
    const plan = planStatusChange('BanNhap', input.trangThai, null, stamp);
    return this.write(async (manager) => {
      const id = await this.articles.insert(manager, {
        tacGiaId: accountId,
        tieuDe: normalizeTitle(input.tieuDe),
        moTaNgan: this.summaryOf(input.moTaNgan),
        noiDung,
        trangThai: input.trangThai,
        thoiDiemXuatBan: plan.thoiDiemXuatBan,
        stamp,
      });
      await this.syncTags(manager, id, names);
      return this.readOrThrow(id, manager);
    });
  }

  /**
   * Sửa một phần (`PATCH`) và/hoặc đổi trạng thái. Khoá hàng bài trước, rồi so với giá trị đang lưu: không có gì khác thì KHÔNG chạy câu UPDATE nào
   * (cùng trạng thái ⇒ 200 không đổi, `cap_nhat_lan_cuoi` giữ nguyên; ABV-06).
   */
  async update(
    scope: AdminScope,
    id: string,
    input: UpdateArticleDto,
  ): Promise<ArticleDetailView> {
    this.policy.assertToanHeThong(scope);
    if (
      input.tieuDe === undefined &&
      input.moTaNgan === undefined &&
      input.noiDung === undefined &&
      input.hashtag === undefined &&
      input.trangThai === undefined
    )
      throw emptyPatch();
    const names =
      input.hashtag === undefined ? undefined : this.tagNames(input.hashtag);
    const stamp = toSecond(nowVN());
    return this.write(async (manager) => {
      const current = await this.articles.lock(manager, id);
      if (!current) throw articleNotFound();
      const nextStatus = input.trangThai ?? current.trangThai;
      const nextContent =
        input.noiDung === undefined
          ? current.noiDung
          : normalizeContent(input.noiDung);
      if (needsContent(nextStatus) && isBlankContent(nextContent))
        throw contentRequiredToPublish();
      const plan = planStatusChange(
        current.trangThai,
        nextStatus,
        current.thoiDiemXuatBan,
        stamp,
      );

      const patch: ArticlePatch = {};
      if (input.tieuDe !== undefined) {
        const tieuDe = normalizeTitle(input.tieuDe);
        if (tieuDe !== current.tieuDe) patch.tieuDe = tieuDe;
      }
      if (input.moTaNgan !== undefined) {
        const moTaNgan = this.summaryOf(input.moTaNgan);
        if (moTaNgan !== current.moTaNgan) patch.moTaNgan = moTaNgan;
      }
      if (nextContent !== current.noiDung) patch.noiDung = nextContent;
      if (plan.statusChanged) patch.trangThai = nextStatus;
      if (
        plan.thoiDiemXuatBan?.getTime() !== current.thoiDiemXuatBan?.getTime()
      )
        patch.thoiDiemXuatBan = plan.thoiDiemXuatBan;

      const tagsChanged =
        names === undefined ? false : await this.syncTags(manager, id, names);
      if (Object.keys(patch).length > 0 || tagsChanged)
        await this.articles.update(manager, id, patch, stamp);
      return this.readOrThrow(id, manager);
    });
  }

  /** Chuẩn hoá và bỏ trùng thẻ của yêu cầu; sai ⇒ 400 (DTO đã chặn ở đường HTTP, đây là lớp phòng thủ cho nơi gọi trực tiếp service). */
  private tagNames(raw: readonly string[]): string[] {
    const result = normalizeHashtagList(raw);
    if (!result.ok) throw invalidField('hashtag', result.error);
    return result.names;
  }

  private summaryOf(raw: string | null | undefined): string | null {
    return raw === null || raw === undefined ? null : normalizeSummary(raw);
  }

  /**
   * Đưa tập thẻ của bài về đúng `names` (thay toàn bộ). Chèn thẻ theo thứ tự cố định (T5), so tên đọc về với tên đã chuẩn hoá (T6):
   *  - khác ⇒ trùng theo collation nhưng khác dấu ⇒ 409 `THE_TRUNG_KHONG_DAU` kèm tên đang lưu;
   *  - thẻ đã có nhưng đang tắt và bài CHƯA gắn thẻ đó ⇒ 409 `THE_DA_TAT`, không bật lại. Bài đã gắn sẵn thẻ rồi bị tắt mà vẫn giữ nguyên thì được (tinh chỉnh so với chữ của T6,
   *    đã duyệt ngày 28/11/2026: gắn MỚI mới bị chặn, nếu không người biên tập kẹt không sửa được bài).
   * Trả `true` nếu tập thẻ đổi. Mọi lỗi làm hoàn tác cả giao dịch (kể cả thẻ mới tạo trước đó).
   */
  private async syncTags(
    manager: EntityManager,
    articleId: string,
    names: readonly string[],
  ): Promise<boolean> {
    const resolved = await this.hashtags.resolve(manager, sortHashtags(names));
    for (const tag of resolved)
      if (tag.ten.normalize('NFC') !== tag.requested)
        throw tagAccentConflict(tag.ten);
    const attached = new Set(
      await this.hashtags.attachedIds(manager, articleId),
    );
    for (const tag of resolved)
      if (!tag.active && !attached.has(tag.hashtagId))
        throw tagDisabled(tag.ten);
    const wanted = new Set(resolved.map((tag) => tag.hashtagId));
    const toAdd = resolved
      .map((tag) => tag.hashtagId)
      .filter((hashtagId) => !attached.has(hashtagId));
    const toRemove = [...attached].filter(
      (hashtagId) => !wanted.has(hashtagId),
    );
    await this.hashtags.detach(manager, articleId, toRemove);
    await this.hashtags.attach(manager, articleId, toAdd);
    return toAdd.length > 0 || toRemove.length > 0;
  }

  private async readOrThrow(
    id: string,
    manager?: EntityManager,
  ): Promise<ArticleDetailView> {
    const found = await this.articles.get(id, manager);
    if (!found) throw articleNotFound();
    const row: ArticleDetailRow = found.row;
    return { ...toView(row, found.tags), noiDung: row.noiDung };
  }

  private write<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.articles.transaction(work);
  }
}
