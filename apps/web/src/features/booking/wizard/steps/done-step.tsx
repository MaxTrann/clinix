import { DonePanel } from '../done/done-panel';

interface DoneStepProps {
  // Mã lịch hẹn trên URL (đã giải mã); sai dạng hay của người khác thì API trả 404 và thân hiện câu không tìm thấy
  maLichHen: string;
}

// Bước 6 "Hoàn tất" (booking F7, Figma `453:2`): `done/done-panel.tsx` tải và vẽ phiếu; file này CHỈ nối nó vào wizard.
//  - `key={maLichHen}`: đổi mã ngay trên cùng route (React Router giữ nguyên component) thì mọi state đặt lại. BẮT BUỘC: hook tải giữ dữ liệu cũ khi mã đổi, thiếu `key` thì
//    phiếu của lịch trước hiện trong lúc tải lịch sau (đột biến M18).
//  - Phần tử bọc GIỮ `data-testid="booking-step-6-body"` và `data-reference` của thân tạm F3, ở MỌI trạng thái (đang tải, lỗi, phiếu), để các test của F3, router và F5 không phải sửa.
export function DoneStep({ maLichHen }: DoneStepProps) {
  return (
    <div data-testid="booking-step-6-body" data-reference={maLichHen}>
      <DonePanel key={maLichHen} maLichHen={maLichHen} />
    </div>
  );
}
