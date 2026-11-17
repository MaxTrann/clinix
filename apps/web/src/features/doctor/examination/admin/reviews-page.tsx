import { useMemo, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useAdminScope } from '../../../admin';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { useReceptionDoctors } from '../../reception/use-reception-data';
import type { AdminReviewItem } from '../api/admin-review-types';
import { HideDialog } from './hide-dialog';
import { ReviewDetailDialog } from './review-detail-dialog';
import { ReviewsFilters } from './reviews-filters';
import { ReviewsHeader } from './reviews-header';
import { ReviewsNotice, type ReviewsNoticeValue } from './reviews-notice';
import { ReviewsTable } from './reviews-table';
import { branchScopeText, REVIEWS_TEXT } from './reviews-text';
import { useReviews } from './use-reviews';
import type { HideSettled } from './use-hide';

// Trạng thái rỗng: không đánh giá nào (khác nhau theo có đang lọc hay không; chip đếm vẫn hiện số của máy chủ)
function EmptyReviews({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 bg-white px-4 py-12 text-gray-500 shadow-sm">
      <MessageSquare aria-hidden="true" className="size-7 text-gray-400" />
      <p role="status" className="text-sm">
        {filtered ? REVIEWS_TEXT.emptyFiltered : REVIEWS_TEXT.emptyPlain}
      </p>
    </div>
  );
}

// Trang "Kiểm duyệt đánh giá" của Quản trị viên (doctor-exam F7; Figma `514:2` Toàn hệ thống, `633:2` Chi nhánh, `570:2` hộp chi tiết; PLAN 5.8, 5.13): chip đếm, ô tìm 300 ms, lọc Chi nhánh (CHỈ Toàn hệ thống), Bác sĩ, Số sao, Trạng thái, bảng 20 dòng mỗi trang và hộp chi tiết.
// Doctor-exam F8 thêm nút `Ẩn` ở hàng `Hiển thị`, nút `Ẩn đánh giá` ở hộp chi tiết và hộp "Ẩn đánh giá" (Figma `571:2`): từ hộp chi tiết bấm `Ẩn đánh giá` thì hộp chi tiết ĐÓNG rồi hộp ẩn mở thay (không xếp chồng); `Hủy`, `Esc`, × đóng hộp ẩn và trả tiêu điểm về
// nút đã bấm ở danh sách (`Xem` hay `Ẩn`). Sau khi ẩn (200), hay khi máy chủ báo đã ẩn (409) hoặc không thấy (404): đóng hộp, TẢI LẠI danh sách (chip đếm lấy `demTheoTrangThai` của máy chủ, không vá cục bộ) và hiện thông báo có tiêu điểm.
// Phạm vi dữ liệu do máy chủ ép (Admin Chi nhánh); web không hiện cột và ô lọc Chi nhánh cho Admin Chi nhánh và không gửi `chiNhanhId`.
export function ReviewsPage() {
  const scope = useAdminScope();
  const isBranchAdmin = scope.phamVi === 'ChiNhanh';
  const doctors = useReceptionDoctors('admin');
  const reviews = useReviews(isBranchAdmin);
  const [openId, setOpenId] = useState<string | null>(null);
  // Đánh giá đang ở hộp "Ẩn đánh giá" (hàng của bảng hay chi tiết vừa tải)
  const [hiding, setHiding] = useState<AdminReviewItem | null>(null);
  const [notice, setNotice] = useState<ReviewsNoticeValue | null>(null);
  // Nút `Xem` hay `Ẩn` đã mở hộp: nhận lại tiêu điểm khi đóng
  const opener = useRef<HTMLElement | null>(null);
  const { reload } = reviews;

  // Mở hộp chi tiết hay hộp ẩn thì bỏ thông báo cũ
  function openDetail(danhGiaId: string, button: HTMLElement) {
    opener.current = button;
    setNotice(null);
    setOpenId(danhGiaId);
  }
  // `button` vắng khi mở từ hộp chi tiết: nút `Xem` đã mở hộp chi tiết vẫn là nơi trả tiêu điểm
  function openHide(item: AdminReviewItem, button?: HTMLElement) {
    if (button !== undefined) opener.current = button;
    setNotice(null);
    setOpenId(null);
    setHiding(item);
  }
  function finishHide(kind: 'hidden' | HideSettled | 'reloaded') {
    setHiding(null);
    reload();
    setNotice({ kind });
  }

  const doctorList = useMemo(
    () => (doctors.state.status === 'success' ? doctors.state.data : []),
    [doctors.state],
  );
  // Chi nhánh suy từ danh sách bác sĩ (như trang Duyệt yêu cầu); chi nhánh hiện tại của bác sĩ, không phải chi nhánh của lịch lúc đặt (TECH_DEBT 175)
  const branches = useMemo(
    () => [
      ...new Map(
        doctorList.map((doctor) => [
          doctor.chiNhanh.chiNhanhId,
          doctor.chiNhanh,
        ]),
      ).values(),
    ],
    [doctorList],
  );
  const { state } = reviews.list;

  return (
    <section className="flex flex-col gap-[18.75px]">
      <ReviewsHeader
        subtitle={
          scope.phamVi === 'ChiNhanh'
            ? branchScopeText(scope.chiNhanh.ten)
            : REVIEWS_TEXT.systemScope
        }
        counts={reviews.counts}
      />
      <ReviewsFilters
        filters={reviews.filters}
        onChange={reviews.change}
        branches={isBranchAdmin ? undefined : branches}
        doctors={doctorList}
        doctorsFailed={doctors.state.status === 'error'}
      />
      {notice !== null && <ReviewsNotice notice={notice} />}
      {state.status === 'loading' && (
        <LoadingState message={REVIEWS_TEXT.loading} />
      )}
      {state.status === 'error' && (
        <ErrorState error={state.error} onRetry={reviews.list.retry} />
      )}
      {state.status === 'ready' &&
        (state.data.total === 0 ? (
          <EmptyReviews filtered={reviews.hasFilters} />
        ) : (
          <ReviewsTable
            data={state.data}
            page={reviews.page}
            onPageChange={reviews.setPage}
            showBranch={!isBranchAdmin}
            onOpen={openDetail}
            onHide={openHide}
          />
        ))}
      {openId !== null && (
        <ReviewDetailDialog
          danhGiaId={openId}
          returnFocusRef={opener}
          onClose={() => setOpenId(null)}
          onGone={reload}
          showBranch={!isBranchAdmin}
          onHide={(detail) => openHide(detail)}
        />
      )}
      {hiding !== null && (
        <HideDialog
          item={hiding}
          returnFocusRef={opener}
          onClose={() => setHiding(null)}
          onHidden={() => finishHide('hidden')}
          onSettled={finishHide}
          onReload={() => finishHide('reloaded')}
        />
      )}
    </section>
  );
}
