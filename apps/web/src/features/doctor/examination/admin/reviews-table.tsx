import { AdminTable, type AdminTableColumn } from '../../../admin';
import type {
  AdminReviewItem,
  AdminReviewPage,
} from '../api/admin-review-types';
import { ReviewRowActions } from './review-row-actions';
import { ReviewStars } from './review-stars';
import { ReviewStatusPill } from './review-status-pill';
import { formatSentDate } from './reviews-format';
import { COLUMN_TEXT, orNone, REVIEWS_TEXT } from './reviews-text';

// Độ rộng cột THEO PIXEL lấy từ Figma (`514:2`, tổng 1168,4 px; `633:2` cho Admin Chi nhánh, không cột Chi nhánh). `AdminTable` chia cột cố định khi có `width`: pixel (không phần trăm) để bảng KHÔNG bị bóp khi khung hẹp
// (đo Chromium ở 375 px: phần trăm làm hàng cao 397 px) mà rộng ra tới 1168 px rồi cuộn NGANG TRONG khung bảng; khung rộng hơn thì các cột nở theo tỉ lệ.
const SYSTEM_WIDTHS = [
  '143.71px',
  '175.93px',
  '120.31px',
  '103.56px',
  '262.7px',
  '99.35px',
  '102.78px',
  '160.06px',
];
const BRANCH_WIDTHS = [
  '169.19px',
  '141.64px',
  '121.93px',
  '309.28px',
  '116.95px',
  '121px',
  '188.43px',
];

interface TableProps {
  data: AdminReviewPage;
  page: number;
  onPageChange: (page: number) => void;
  // Chỉ Admin Toàn hệ thống thấy cột Chi nhánh (WKD-02)
  showBranch: boolean;
  onOpen: (danhGiaId: string, opener: HTMLElement) => void;
  // Nút `Ẩn` chỉ ở hàng `Hiển thị` (doctor-exam F8)
  onHide: (item: AdminReviewItem, opener: HTMLElement) => void;
}

// Nội dung đã bị máy chủ cắt (≤ 200 đơn vị UTF-16); ở đây chỉ hiện tối đa hai dòng (Figma `514:419`). Chữ thuần do React vẽ: `whitespace-pre-wrap` giữ xuống dòng, `wrap-anywhere` cho chuỗi dài không dấu cách bẻ dòng; không biến thành liên kết (WKD-10).
function columnsFor(
  showBranch: boolean,
  onOpen: TableProps['onOpen'],
  onHide: TableProps['onHide'],
): AdminTableColumn<AdminReviewItem>[] {
  const widths = showBranch ? SYSTEM_WIDTHS : BRANCH_WIDTHS;
  const columns: Omit<AdminTableColumn<AdminReviewItem>, 'width'>[] = [
    {
      id: 'bacSi',
      header: COLUMN_TEXT.doctor,
      cell: (item) => (
        <span className="text-[13.125px] font-medium wrap-anywhere text-gray-800">
          {item.bacSi.hoTen}
        </span>
      ),
    },
    ...(showBranch
      ? [
          {
            id: 'chiNhanh',
            header: COLUMN_TEXT.branch,
            cell: (item: AdminReviewItem) => (
              <span className="text-[12px] leading-[17.143px] wrap-anywhere text-gray-500">
                {item.chiNhanh.ten}
              </span>
            ),
          },
        ]
      : []),
    {
      id: 'benhNhan',
      header: COLUMN_TEXT.patient,
      cell: (item) => (
        <span className="text-[13.125px] wrap-anywhere text-gray-700">
          {orNone(item.nguoiDanhGia.hoTen)}
        </span>
      ),
    },
    {
      id: 'sao',
      header: COLUMN_TEXT.stars,
      cell: (item) => <ReviewStars value={item.soSao} />,
    },
    {
      id: 'noiDung',
      header: COLUMN_TEXT.comment,
      cell: (item) => (
        <p className="line-clamp-2 min-h-[36px] text-[13.125px] leading-[18px] wrap-anywhere whitespace-pre-wrap text-gray-600">
          {orNone(item.nhanXet)}
        </p>
      ),
    },
    {
      id: 'ngayGui',
      header: COLUMN_TEXT.sentDate,
      cell: (item) => (
        <span className="text-[12px] leading-[17.143px] text-gray-500">
          {formatSentDate(item.thoiDiemTao)}
        </span>
      ),
    },
    {
      id: 'trangThai',
      header: COLUMN_TEXT.status,
      cell: (item) => <ReviewStatusPill hidden={item.biAn} />,
    },
    {
      id: 'thaoTac',
      header: REVIEWS_TEXT.action,
      cell: (item) => (
        <ReviewRowActions item={item} onOpen={onOpen} onHide={onHide} />
      ),
    },
  ];
  return columns.map((column, index) => ({ ...column, width: widths[index] }));
}

export function ReviewsTable({
  data,
  page,
  onPageChange,
  showBranch,
  onOpen,
  onHide,
}: TableProps) {
  return (
    <AdminTable
      label={REVIEWS_TEXT.tableLabel}
      columns={columnsFor(showBranch, onOpen, onHide)}
      rows={data.items}
      getRowKey={(item) => item.danhGiaId}
      page={page}
      pageSize={data.pageSize}
      total={data.total}
      onPageChange={onPageChange}
      emptyMessage={REVIEWS_TEXT.emptyPlain}
    />
  );
}
