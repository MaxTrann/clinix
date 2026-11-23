import { useNavigate } from 'react-router';
import { bookingDonePath } from '../../../../shared/routes/booking-paths';
import { usePageActive } from '../../../auth';
import { PaymentPanel } from '../payment/payment-panel';

interface PaymentStepProps {
  // Mã lịch hẹn trên URL (đã giải mã); sai dạng hay của người khác thì API trả 404 và thân hiện câu không tìm thấy
  maLichHen: string;
}

// Bước Thanh toán (booking F6, Figma `452:2`; vẫn là bước 5 "Xác nhận" trên thanh bước): `payment/payment-panel.tsx` tải lịch, đếm ngược theo giờ máy chủ và gắn `DepositPaymentPanel`;
// file này CHỈ nối nó vào wizard.
//  - `usePageActive()`: người dùng rời trang trong lúc `POST` thanh toán còn chờ thì phản hồi về sau không được kéo họ quay lại (WZ-13).
//  - Thanh toán xong thì `navigate(Bước 6, { replace: true })`: Back không quay lại trang thanh toán của lịch đã xác nhận. Không có gì đi qua context hay `location.state`: Bước 6 tự GET lại (WZ-09).
//  - `key={maLichHen}`: đổi mã ngay trên cùng route (React Router giữ nguyên component) thì mọi state đặt lại. BẮT BUỘC: hook tải giữ dữ liệu cũ khi mã đổi, thiếu `key` thì lịch của mã trước hiện
//    trong lúc tải mã sau (như `done-step.tsx`).
//  - Phần tử bọc GIỮ `data-testid="booking-step-5-body"` và `data-reference` của thân tạm F3, ở MỌI trạng thái, để các test của F3 và router không phải sửa.
export function PaymentStep({ maLichHen }: PaymentStepProps) {
  const navigate = useNavigate();
  const active = usePageActive();

  function handlePaid(result: { maLichHen: string }) {
    if (active.current) {
      navigate(bookingDonePath(result.maLichHen), { replace: true });
    }
  }

  return (
    <div data-testid="booking-step-5-body" data-reference={maLichHen}>
      <PaymentPanel key={maLichHen} maLichHen={maLichHen} onPaid={handlePaid} />
    </div>
  );
}
