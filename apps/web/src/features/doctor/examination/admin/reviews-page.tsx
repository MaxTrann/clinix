import { useMemo, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useAdminScope } from '../../../admin';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { useReceptionDoctors } from '../../reception/use-reception-data';
import { ReviewDetailDialog } from './review-detail-dialog';
import { ReviewsFilters } from './reviews-filters';
import { ReviewsHeader } from './reviews-header';
import { ReviewsTable } from './reviews-table';
import { branchScopeText, REVIEWS_TEXT } from './reviews-text';
import { useReviews } from './use-reviews';

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
// Chỉ ĐỌC: nút `Ẩn` và hộp "Ẩn đánh giá" là của F8 (Đại duyệt 17/11/2026). Phạm vi dữ liệu do máy chủ ép (Admin Chi nhánh); web không hiện cột và ô lọc Chi nhánh cho Admin Chi nhánh và không gửi `chiNhanhId`.
export function ReviewsPage() {
  const scope = useAdminScope();
  const isBranchAdmin = scope.phamVi === 'ChiNhanh';
  const doctors = useReceptionDoctors('admin');
  const reviews = useReviews(isBranchAdmin);
  const [openId, setOpenId] = useState<string | null>(null);
  // Nút `Xem` đã mở hộp: nhận lại tiêu điểm khi đóng
  const opener = useRef<HTMLElement | null>(null);

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
            onOpen={(danhGiaId, button) => {
              opener.current = button;
              setOpenId(danhGiaId);
            }}
          />
        ))}
      {openId !== null && (
        <ReviewDetailDialog
          danhGiaId={openId}
          returnFocusRef={opener}
          onClose={() => setOpenId(null)}
          onGone={reviews.reload}
          showBranch={!isBranchAdmin}
        />
      )}
    </section>
  );
}
