import type { ArticleStatus } from '../api/article-types';
import { STATUS_LABEL } from './article-text';

// Bản nháp xám, Đã xuất bản xanh, Lưu trữ hổ phách (bố cục và màu 5.C do Đại duyệt 28/11/2026)
const PILL_CLASS: Record<ArticleStatus, string> = {
  BanNhap: 'bg-gray-100 text-gray-700',
  DaXuatBan: 'bg-success-soft text-success',
  LuuTruAn: 'bg-warning-soft text-warning',
};

export function ArticleStatusPill({ status }: { status: ArticleStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${PILL_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
