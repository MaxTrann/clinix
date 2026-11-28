import { Inject, Injectable } from '@nestjs/common';
import { ARTICLE_PUBLIC } from '../article.constants.js';
import { isArticleId } from '../common/article-id.js';
import {
  ARTICLE_FIELD_ERRORS,
  articleNotFound,
  invalidField,
  invalidFilter,
} from '../common/article-errors.js';
import { normalizeHashtag } from '../common/hashtag-name.js';
import type {
  PublicArticleDetail,
  PublicArticleItem,
  PublicArticleListQueryDto,
  PublicArticlePage,
  PublicTagItem,
} from './public-article.dto.js';
import {
  PublicArticleRepository,
  type PublicArticleDetailRow,
  type PublicArticleRow,
} from './public-article.repository.js';

// Nghiệp vụ API công khai bài viết (article B2; PLAN article 5.7, 5.9). Không đọc token, không biết người gọi là ai; chỉ bài `DaXuatBan`.
// Thân trả về chọn LẠI từng khoá (danh sách trắng) nên không bao giờ lọt `tacGia`, `tacGiaId`, email hay `trangThai` dù repository đọc thêm cột (MH11).

/** Một bài ở danh sách. Chọn từng khoá; `thoiDiemXuatBan` thành chuỗi ISO UTC (null chỉ khi dữ liệu lệch: bài `DaXuatBan` mà thiếu thời điểm, ABP-12). */
function toItem(row: PublicArticleRow, tags: string[]): PublicArticleItem {
  return {
    baiVietId: row.baiVietId,
    tieuDe: row.tieuDe,
    moTaNgan: row.moTaNgan,
    anhDaiDien: row.anhDaiDien,
    thoiDiemXuatBan: row.thoiDiemXuatBan?.toISOString() ?? null,
    hashtag: tags,
  };
}

/** Chi tiết dựng ở MỘT chỗ để B3 cộng `luotThich`, `luotKhongThich` mà không đụng danh sách. */
function toDetail(
  row: PublicArticleDetailRow,
  tags: string[],
): PublicArticleDetail {
  return { ...toItem(row, tags), noiDung: row.noiDung };
}

/** `the` vắng ⇒ không lọc; sai dạng (kể cả rỗng) ⇒ 400 `BO_LOC_KHONG_HOP_LE`; đúng dạng thì chuẩn hoá như khi lưu (thẻ không có thì danh sách rỗng, không lỗi). */
function parseTagFilter(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const name = normalizeHashtag(raw);
  if (name === null)
    throw invalidFilter('the', ARTICLE_FIELD_ERRORS.INVALID_TAG);
  return name;
}

@Injectable()
export class PublicArticleService {
  constructor(
    @Inject(PublicArticleRepository)
    private readonly repository: PublicArticleRepository,
  ) {}

  async list(query: PublicArticleListQueryDto): Promise<PublicArticlePage> {
    const the = parseTagFilter(query.the);
    // `page` quá lớn làm `offset` vượt số nguyên an toàn của JS: báo lỗi thay vì gửi con số sai xuống MySQL (như API quản trị)
    if (!Number.isSafeInteger(query.offset) || query.offset < 0)
      throw invalidField('page', ARTICLE_FIELD_ERRORS.INVALID_PAGE);
    const result = await this.repository.list({
      q: query.q || undefined,
      the,
      limit: query.pageSize,
      offset: query.offset,
    });
    return {
      items: result.rows.map((row) =>
        toItem(row, result.tags.get(row.baiVietId) ?? []),
      ),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Id sai dạng, không có, `BanNhap` hay `LuuTruAn` ⇒ CÙNG một 404 `KHONG_TIM_THAY` (không phân biệt được lý do). */
  async detail(rawId: string): Promise<PublicArticleDetail> {
    if (!isArticleId(rawId)) throw articleNotFound();
    const found = await this.repository.detail(rawId);
    if (!found) throw articleNotFound();
    return toDetail(found.row, found.tags);
  }

  async popularTags(): Promise<{ items: PublicTagItem[] }> {
    const rows = await this.repository.popularTags(
      ARTICLE_PUBLIC.popularTagsMax,
    );
    return { items: rows.map((row) => ({ ten: row.ten, soBai: row.soBai })) };
  }
}
