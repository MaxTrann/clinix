import { Link } from 'react-router';
import { AdminTable, type AdminTableColumn } from '../../admin';
import type {
  ArticleListItem,
  ArticleListPage,
  ArticleStatus,
} from '../api/article-types';
import { articleAdminEditPath } from '../common/article-paths';
import { formatArticleDate } from '../common/format-article-date';
import { ArticleStatusPill } from './article-status-pill';
import { BUTTON_SECONDARY_CLASS } from './article-styles';
import { authorLine, LIST_TEXT, rowActionName } from './article-text';

// Mỗi trạng thái có đúng MỘT thao tác đổi trạng thái ở dòng (PLAN 5.11): Bản nháp ⇒ Xuất bản; Đã xuất bản ⇒ Lưu trữ (ẩn bài); Lưu trữ ⇒ Khôi phục về Bản nháp
const ROW_ACTION: Record<
  ArticleStatus,
  { label: string; next: ArticleStatus }
> = {
  BanNhap: { label: LIST_TEXT.publish, next: 'DaXuatBan' },
  DaXuatBan: { label: LIST_TEXT.archive, next: 'LuuTruAn' },
  LuuTruAn: { label: LIST_TEXT.restore, next: 'BanNhap' },
};

const ROW_BUTTON_CLASS = `${BUTTON_SECONDARY_CLASS} px-3 whitespace-nowrap`;
const MAX_TAGS_SHOWN = 3;

interface ArticleListTableProps {
  data: ArticleListPage;
  page: number;
  // Đang có bộ lọc (đổi câu "rỗng")
  filtered: boolean;
  // Bài đang đổi trạng thái: khoá mọi nút đổi trạng thái
  pendingId: string | null;
  onPageChange: (page: number) => void;
  onChangeStatus: (article: ArticleListItem, next: ArticleStatus) => void;
}

// KHÔNG đặt `width` cho cột: có độ rộng thì `AdminTable` chia cột cố định và nén chữ ở 375 px; để tự do thì bảng cuộn ngang TRONG khung của nó (PLAN 5.11)
export function ArticleListTable({
  data,
  page,
  filtered,
  pendingId,
  onPageChange,
  onChangeStatus,
}: ArticleListTableProps) {
  const columns: AdminTableColumn<ArticleListItem>[] = [
    {
      id: 'title',
      header: LIST_TEXT.columnTitle,
      cell: (article) => (
        <div className="min-w-[12rem]">
          <span className="block font-medium break-words text-gray-900">
            {article.tieuDe}
          </span>
          {article.tacGia !== null && (
            <span className="block text-xs text-gray-500">
              {authorLine(article.tacGia.hoTen)}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'status',
      header: LIST_TEXT.columnStatus,
      cell: (article) => <ArticleStatusPill status={article.trangThai} />,
    },
    {
      id: 'tags',
      header: LIST_TEXT.columnTags,
      cell: (article) =>
        article.hashtag.length === 0 ? (
          <span className="text-gray-400">—</span>
        ) : (
          <span className="flex min-w-[8rem] flex-wrap gap-1">
            {article.hashtag.slice(0, MAX_TAGS_SHOWN).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
              >
                #{tag}
              </span>
            ))}
            {article.hashtag.length > MAX_TAGS_SHOWN && (
              <span className="text-xs text-gray-500">
                +{article.hashtag.length - MAX_TAGS_SHOWN}
              </span>
            )}
          </span>
        ),
    },
    {
      id: 'published',
      header: LIST_TEXT.columnPublished,
      cell: (article) => formatArticleDate(article.thoiDiemXuatBan),
    },
    {
      id: 'updated',
      header: LIST_TEXT.columnUpdated,
      cell: (article) => formatArticleDate(article.capNhatLanCuoi),
    },
    {
      id: 'actions',
      header: LIST_TEXT.columnActions,
      cell: (article) => {
        const action = ROW_ACTION[article.trangThai];
        return (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={articleAdminEditPath(article.baiVietId)}
              aria-label={rowActionName(LIST_TEXT.edit, article.tieuDe)}
              className={ROW_BUTTON_CLASS}
            >
              {LIST_TEXT.edit}
            </Link>
            <button
              type="button"
              disabled={pendingId !== null}
              aria-label={rowActionName(action.label, article.tieuDe)}
              className={ROW_BUTTON_CLASS}
              onClick={() => onChangeStatus(article, action.next)}
            >
              {action.label}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <AdminTable
      label={LIST_TEXT.tableLabel}
      columns={columns}
      rows={data.items}
      getRowKey={(article) => article.baiVietId}
      page={page}
      pageSize={data.pageSize}
      total={data.total}
      onPageChange={onPageChange}
      emptyMessage={filtered ? LIST_TEXT.emptyFiltered : LIST_TEXT.emptyPlain}
    />
  );
}
