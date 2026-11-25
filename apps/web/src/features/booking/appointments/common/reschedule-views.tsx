import { Stethoscope } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ErrorState } from '../../../../shared/ui/error-state';
import { BookingNotice } from '../../wizard/booking-notice';
import { COMMON_ACTION_TEXT } from './action-text';
import { DetailCard, DetailRow } from './detail-card';
import { classifyDetailError } from './error-kinds';
import { COMMON_LIST_TEXT } from './list-text';
import { rescheduleMessageForError } from './reschedule-errors';
import type { RescheduleFailure } from './reschedule-failure';
import { RESCHEDULE_TEXT } from './reschedule-text';

// Các mảnh GIAO DIỆN dùng chung của trang đổi lịch (reschedule F3 cắt ra từ `patient/reschedule/reschedule-page.tsx` và `reschedule-confirm-page.tsx` để Lễ tân đổi hộ dùng lại, không chép). Chỉ giao
// diện: không gọi API, không biết vai trò; đường dẫn và nhãn liên kết do nơi dùng truyền qua `RescheduleLinks`. DOM giữ NGUYÊN như khi còn ở trang Bệnh nhân (các ca WDH chạy nguyên văn).

export const RESCHEDULE_LINK_CLASS = 'mt-2 block font-medium underline';
const NOTICE_CLASS =
  'rounded-xl border border-warning-line bg-warning-soft p-3 text-sm text-warning';

// Ba đích mà thẻ lỗi chỉ tới. `list` là trang danh sách lịch hẹn của vai đó (404 và 403 là MỘT thẻ chung, không lộ lịch có tồn tại hay không), `grid` là trang chọn khung giờ, `detail` là chi tiết lịch
export interface RescheduleLinks {
  list: { to: string; label: string };
  grid: string;
  detail: string;
}

// Thẻ lỗi kèm ĐƯỜNG ĐI theo loại (PLAN reschedule 5.13; TRACKING 1.14 mục B6). 404 và 403 là MỘT thẻ chung, cùng DOM.
export function RescheduleFailureCard({
  failure,
  links,
  onRetry,
}: {
  failure: RescheduleFailure;
  links: RescheduleLinks;
  onRetry?: () => void;
}) {
  return (
    <BookingNotice message={failure.message}>
      {failure.kind === 'notFound' && (
        <Link to={links.list.to} className={RESCHEDULE_LINK_CLASS}>
          {links.list.label}
        </Link>
      )}
      {failure.kind === 'pickAnother' && (
        <Link to={links.grid} className={RESCHEDULE_LINK_CLASS}>
          {RESCHEDULE_TEXT.pickAnother}
        </Link>
      )}
      {failure.kind === 'backToDetail' && (
        <Link to={links.detail} className={RESCHEDULE_LINK_CLASS}>
          {RESCHEDULE_TEXT.backToDetailLink}
        </Link>
      )}
      {failure.kind === 'retry' && onRetry !== undefined && (
        <button
          type="button"
          onClick={onRetry}
          className={RESCHEDULE_LINK_CLASS}
        >
          {RESCHEDULE_TEXT.retry}
        </button>
      )}
    </BookingNotice>
  );
}

// Lỗi của lần GỬI mà biểu mẫu còn dùng được: "chưa rõ" (kèm liên kết `uncertainLink` để kiểm tra lịch) hay "Thử lại" (hệ thống bận). Nhận tiêu điểm để trình đọc màn hình đọc ngay; lỗi ở ô lý do thì tiêu điểm
// đã vào ô (xem `focusReasonKey` của form), không giành lại.
export function RescheduleSubmitNotice({
  failure,
  onRetry,
  uncertainLink,
}: {
  failure: RescheduleFailure;
  onRetry: () => void;
  uncertainLink: { to: string; label: string };
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (failure.kind !== 'needsReason') ref.current?.focus();
  }, [failure]);
  return (
    <div ref={ref} tabIndex={-1} role="alert" className={NOTICE_CLASS}>
      <p>{failure.message}</p>
      {failure.kind === 'uncertain' && (
        <Link to={uncertainLink.to} className={RESCHEDULE_LINK_CLASS}>
          {uncertainLink.label}
        </Link>
      )}
      {failure.kind === 'retry' && (
        <button
          type="button"
          onClick={onRetry}
          className={RESCHEDULE_LINK_CLASS}
        >
          {RESCHEDULE_TEXT.retry}
        </button>
      )}
    </div>
  );
}

// Lỗi tải xem trước ở trang chọn khung giờ, chọn theo `maLoi` (PLAN reschedule 5.13), KHÔNG theo mã HTTP hay `thongBao`. 404 và 403 là MỘT thẻ chung; 401 là câu phiên hết hạn. Mã nghiệp vụ của 5.13 có câu
// riêng: chỉ `HE_THONG_CHUA_CAU_HINH`, `HE_THONG_DANG_BAN` được "Thử lại" (cùng yêu cầu thì cùng kết quả với các mã còn lại). Còn lại (mạng, quá giờ, phản hồi lạ, 5xx, `maLoi` lạ) dùng `ErrorState` kèm "Thử lại"
// và KHÔNG lộ thông điệp máy chủ, mã nội bộ hay `requestId`.
export function RescheduleLoadFailure({
  error,
  links,
  onRetry,
}: {
  error: unknown;
  links: RescheduleLinks;
  onRetry: () => void;
}) {
  const kind = classifyDetailError(error);
  if (kind === 'notFound' || kind === 'forbidden') {
    return (
      <BookingNotice message={COMMON_ACTION_TEXT.notFound}>
        <Link to={links.list.to} className={RESCHEDULE_LINK_CLASS}>
          {links.list.label}
        </Link>
      </BookingNotice>
    );
  }
  if (kind === 'session') {
    return <BookingNotice message={COMMON_LIST_TEXT.sessionExpired} />;
  }
  const known = rescheduleMessageForError(error);
  if (known === undefined) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }
  return (
    <BookingNotice message={known.message}>
      {known.retryable ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 block font-medium underline"
        >
          {RESCHEDULE_TEXT.retry}
        </button>
      ) : (
        <Link to={links.detail} className={RESCHEDULE_LINK_CLASS}>
          {RESCHEDULE_TEXT.backToDetailLink}
        </Link>
      )}
    </BookingNotice>
  );
}

// Thẻ "Lịch hẹn" (bác sĩ, chuyên khoa, chi nhánh, người khám): preview không có các tên này (PLAN 5.8) nên nơi dùng lấy từ CHI TIẾT lịch của vai mình (lời gọi phụ, không chặn) rồi truyền vào đây.
export function AppointmentSummaryCard({
  doctor,
  specialty,
  branch,
  person,
}: {
  doctor: string;
  specialty: string;
  branch: string;
  person: string;
}) {
  return (
    <DetailCard icon={Stethoscope} title={RESCHEDULE_TEXT.appointmentTitle}>
      <dl className="px-5 py-1">
        <DetailRow label={RESCHEDULE_TEXT.doctor}>{doctor}</DetailRow>
        <DetailRow label={RESCHEDULE_TEXT.specialty}>{specialty}</DetailRow>
        <DetailRow label={RESCHEDULE_TEXT.branch}>{branch}</DetailRow>
        <DetailRow label={RESCHEDULE_TEXT.person}>{person}</DetailRow>
      </dl>
    </DetailCard>
  );
}

// Khung thẻ "Chọn khung giờ mới" của trang chọn khung giờ; bộ chọn (`SlotPicker` của search) là `children` để mỗi trang tự nhập nó qua cổng `index.ts` của search (WDH-10).
export function ReschedulePickSection({ children }: { children: ReactNode }) {
  return (
    <section
      aria-labelledby="reschedule-pick-title"
      className="rounded-2xl border border-gray-200 bg-white p-5"
    >
      <h2
        id="reschedule-pick-title"
        className="text-sm font-semibold text-gray-900"
      >
        {RESCHEDULE_TEXT.pickTitle}
      </h2>
      <p className="mt-1 mb-4 text-xs text-gray-600">
        {RESCHEDULE_TEXT.pickHint}
      </p>
      {children}
    </section>
  );
}
