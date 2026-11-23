import { useEffect, useRef } from 'react';
import { Link, Navigate } from 'react-router';
import {
  bookingDonePath,
  patientAppointmentDetailPath,
} from '../../../../shared/routes/booking-paths';
import { LoadingState } from '../../../../shared/ui/loading-state';
import {
  DepositPaymentPanel,
  type DepositPaymentResult,
} from '../../../payment';
import { DoneFailure } from '../done/done-failure';
import { holdLevel } from './hold-countdown';
import { HoldTimer } from './hold-timer';
import { PaymentEndedNotice } from './payment-notices';
import { HOLD_ANNOUNCEMENTS, PAYMENT_TEXT } from './payment-messages';
import { PaymentSummary } from './payment-summary';
import { paymentViewOf } from './payment-view';
import { usePaymentDetail, type PaymentDetailData } from './use-payment-detail';
import { useHoldClock } from './use-hold-clock';

// Câu cho trình đọc màn hình CHỈ ở ba mốc (WZ-14): vùng live đổi chữ đúng khi số giây còn lại đi qua mốc 5 phút, 1 phút, hết giờ; trên 5 phút thì rỗng. Không đọc từng giây.
const ANNOUNCEMENT = {
  plenty: '',
  within5: HOLD_ANNOUNCEMENTS.within5,
  within1: HOLD_ANNOUNCEMENTS.within1,
  ended: HOLD_ANNOUNCEMENTS.ended,
} as const;

const TITLES = {
  pay: PAYMENT_TEXT.title,
  expired: PAYMENT_TEXT.expiredTitle,
  cancelled: PAYMENT_TEXT.cancelledTitle,
} as const;

interface PaymentReadyProps {
  data: PaymentDetailData;
  refreshing: boolean;
  reload: () => void;
  onPaid: (result: DepositPaymentResult) => void;
}

// Thân khi đã có dữ liệu. Có `key` theo từng lần tải (xem `payment-panel` bên dưới), nên MỖI lần tải lại là một đồng hồ mới.
//  - Hiển thị theo `paymentViewOf` (một chỗ quyết định): `pay` = đồng hồ + `DepositPaymentPanel` + khung tóm tắt; `expired`, `cancelled` = thông báo, KHÔNG nút trả tiền; `done` = chuyển Bước 6.
//  - Đồng hồ về 0 BẰNG NHỊP ⇒ `expired` NGAY (panel gỡ, không để bấm trả lúc đang kiểm), đồng thời `reload` đúng một lần: máy chủ quyết (`DaXacNhan` sang Bước 6, `DaHuy`, hay vẫn
//    `ChoThanhToan` quá hạn thì thông báo hết hạn). Không tự coi lịch đã hủy (PLAN 5.13: hết hạn phía máy chủ là quyết định cuối).
//  - Tiêu điểm vào h1 khi nội dung hiện và khi đổi sang thông báo (nút trả tiền biến mất thì tiêu điểm không rơi về body). KHÔNG `outline-none` (FG-05): lớp base đã có `:focus-visible`.
//    Tải lại khi đang giữ nội dung cũ (`refreshing`) không đổi `view` nên không kéo tiêu điểm lần nữa.
function PaymentReady({ data, refreshing, reload, onPaid }: PaymentReadyProps) {
  const { detail, offsetMs } = data;
  // Hạn giữ chỗ chỉ có nghĩa với lịch còn chờ thanh toán: lịch `DaHuy` (hay trạng thái khác) có thể vẫn mang `hanThanhToan` ở tương lai, mà không được đếm, báo "sắp hết giờ" hay tải lại khi tới hạn
  const remaining = useHoldClock({
    hanThanhToan:
      detail.trangThai === 'ChoThanhToan' ? detail.hanThanhToan : null,
    thoiGianMayChu: detail.thoiGianMayChu,
    offsetMs,
    onEnded: reload,
  });
  const view = paymentViewOf(detail.trangThai, remaining === 0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (view !== 'done') headingRef.current?.focus();
  }, [view]);

  if (view === 'done') {
    return <Navigate to={bookingDonePath(detail.maLichHen)} replace />;
  }
  return (
    <>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-bold text-gray-900"
      >
        {TITLES[view]}
      </h1>
      <p
        data-testid="hold-announcement"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {remaining === null ? '' : ANNOUNCEMENT[holdLevel(remaining)]}
      </p>
      {view === 'pay' ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <div className="min-w-0 space-y-4 lg:col-span-3">
            {remaining !== null && <HoldTimer remaining={remaining} />}
            <DepositPaymentPanel maLichHen={detail.maLichHen} onPaid={onPaid} />
            <nav aria-label={PAYMENT_TEXT.laterLabel}>
              <Link
                to={patientAppointmentDetailPath(detail.maLichHen)}
                className="inline-flex min-h-12 items-center font-medium text-brand-strong underline"
              >
                {PAYMENT_TEXT.later}
              </Link>
            </nav>
          </div>
          <div className="min-w-0 lg:col-span-2">
            <PaymentSummary detail={detail} />
          </div>
        </div>
      ) : (
        <PaymentEndedNotice
          kind={view}
          maLichHen={detail.maLichHen}
          checking={refreshing}
        />
      )}
    </>
  );
}

// Thân Bước Thanh toán (booking F6; Figma `452:2`, chỉ là bản phác thảo: mã và PLAN là nguồn đúng). TẢI lịch hẹn từ `GET /patient/appointments/:maLichHen` theo mã trên URL (bản nháp của Bước 5 đã bị xoá,
// không có gì đi qua context; tải lại trang là GET lại, không lưu gì ở trình duyệt, WZ-09). Đồng hồ giữ chỗ đếm theo GIỜ MÁY CHỦ (`thoiGianMayChu` của chính phản hồi đó, WZ-10).
// `DepositPaymentPanel` (module `payment`, import CHỈ qua `features/payment/index.ts`, BWZ-08) lo xem trước và trả tiền; trang này lo đồng hồ, trạng thái, khung tóm tắt và đường đi.
// Lỗi tải dùng lại `DoneFailure` của Bước 6 (cùng một nhóm lỗi chi tiết: 404 một câu kèm "Lịch hẹn của tôi", 401 và 403 không `Thử lại`, mạng, quá giờ, 5xx có `Thử lại`).
// `useKeepPrevious` giữ dữ liệu CŨ khi mã đổi, nên nơi gắn (`steps/payment-step.tsx`) PHẢI bọc `key={maLichHen}`.
export function PaymentPanel({
  maLichHen,
  onPaid,
}: {
  maLichHen: string;
  onPaid: (result: DepositPaymentResult) => void;
}) {
  const { view, reload } = usePaymentDetail(maLichHen);

  if (view.kind === 'loading') {
    return <LoadingState message={PAYMENT_TEXT.loading} />;
  }
  if (view.kind === 'error') {
    return <DoneFailure error={view.error} onRetry={reload} />;
  }
  return (
    <div aria-busy={view.refreshing}>
      <PaymentReady
        key={view.data.serial}
        data={view.data}
        refreshing={view.refreshing}
        reload={reload}
        onPaid={onPaid}
      />
    </div>
  );
}
