import { appointmentStateLabel } from '../../common/appointment-status';

// Các bước của "Trạng thái ca khám" (Figma `458:2`, `459:2`, `462:2`, `465:2`, `692:2`; booking F11). Hàm thuần: CHỈ dựng theo `trangThai` THẬT của lịch, không bịa mốc thời gian (B5 không trả).
//  - `done`: bước đã qua; `current`: bước đang ở; `upcoming`: bước chưa tới (xám); `ended`: bước cuối của lịch bị huỷ hay vắng mặt.
//  - `ChoThanhToan`: dải cam "Chờ xác nhận thanh toán cọc" và cả ba bước chưa tới (Figma `465:2`).
//  - `DaHuy`: ba bước chưa tới (xám) rồi bước thứ tư "Đã hủy" (Figma `692:2`); không biết lịch bị huỷ ở bước nào nên không tô bước nào là đã qua.
//  - `VangMat`: Figma KHÔNG có frame; dựng như `DaHuy` với bước thứ tư "Vắng mặt" [đề xuất] [cần điền].
//  - Mã lạ: không dựng (`null`), nơi gọi không vẽ timeline.
export type StepTone = 'done' | 'current' | 'upcoming' | 'ended';

export interface TimelineStep {
  // Mã trạng thái của bước
  state: string;
  label: string;
  tone: StepTone;
}

export interface Timeline {
  pendingPayment: boolean;
  steps: TimelineStep[];
}

// Ba bước của luồng khám bình thường theo thứ tự
const FLOW = ['DaXacNhan', 'DaTiepDon', 'HoanThanh'] as const;

function step(state: string, tone: StepTone): TimelineStep {
  return { state, label: appointmentStateLabel(state), tone };
}

export function buildTimeline(trangThai: string): Timeline | null {
  switch (trangThai) {
    case 'ChoThanhToan':
      return {
        pendingPayment: true,
        steps: FLOW.map((state) => step(state, 'upcoming')),
      };
    case 'DaXacNhan':
    case 'DaTiepDon':
    case 'HoanThanh': {
      const index = FLOW.indexOf(trangThai);
      return {
        pendingPayment: false,
        steps: FLOW.map((state, position) =>
          step(
            state,
            position < index
              ? 'done'
              : position === index
                ? 'current'
                : 'upcoming',
          ),
        ),
      };
    }
    case 'DaHuy':
    case 'VangMat':
      return {
        pendingPayment: false,
        steps: [
          ...FLOW.map((state) => step(state, 'upcoming')),
          step(trangThai, 'ended'),
        ],
      };
    default:
      return null;
  }
}
