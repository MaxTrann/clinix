import { appointmentStateLabel } from './appointment-status';

// Các bước của thanh trạng thái ở trang chi tiết lịch hẹn của Bác sĩ, Bệnh nhân và Quản trị viên (booking F13, issue #550). MỘT hàm thuần dùng chung, thay hai hàm cũ của F11 và F2.
// CHỈ dựng theo `trangThai` THẬT của lịch, không bịa mốc thời gian (API chưa trả: issue #551, booking B19, sẽ cắm vào `notes` của `StatusTimeline`).
//  - `passed`: bước đã qua; `current`: bước đang ở; `upcoming`: bước chưa tới; `terminal`: bước cuối của lịch bị huỷ hay vắng mặt.
//  - `ChoThanhToan`: dải "Chờ xác nhận thanh toán cọc" và cả ba bước chưa tới (Figma `465:2`).
//  - `DaHuy`, `VangMat`: ba bước chưa tới rồi bước thứ tư là trạng thái thật (Figma `692:2`, `691:2`); không biết lịch dừng ở bước nào nên không tô bước nào là đã qua.
//    `VangMat` không có frame Figma: dựng như `DaHuy` [đề xuất].
//  - Mã lạ (kể cả `DaDoiLich`): hai trang xử lý KHÁC NHAU có chủ ý nên là tham số bắt buộc `unknown`:
//      `'hide'` (Bác sĩ) trả `null`, nơi gọi không vẽ bước nào; `'upcoming'` (Bệnh nhân, Quản trị viên) trả cả ba bước chưa tới để thẻ không rỗng.
//    Một chỗ biết hình dạng "ba bước chưa tới": trang tự dựng thì hai trang lại tự lệch nhau như trước F13.
export type StepState = 'passed' | 'current' | 'upcoming' | 'terminal';

export type UnknownStatusMode = 'hide' | 'upcoming';

export interface StatusStep {
  // Mã trạng thái của bước: làm `key` và là khoá của `notes` ở `StatusTimeline`
  code: string;
  label: string;
  state: StepState;
}

export interface StatusSteps {
  pendingPayment: boolean;
  steps: StatusStep[];
}

// Chữ chung của thanh trạng thái. Bước đã qua và bước hiện tại KHÔNG có chữ "Chưa ghi nhận" của Figma (F2 đã bỏ ở Bệnh nhân, F13 bỏ ở Bác sĩ): `passed` và `current` chỉ là chữ ẩn cho trình đọc màn hình.
export const STATUS_STEP_TEXT = {
  upcoming: 'Chưa đến',
  passed: 'Đã qua',
  current: 'Hiện tại',
  pendingPayment: 'Chờ xác nhận thanh toán cọc',
} as const;

// Ba bước của luồng khám bình thường theo thứ tự
const FLOW = ['DaXacNhan', 'DaTiepDon', 'HoanThanh'] as const;

function step(code: string, state: StepState): StatusStep {
  return { code, label: appointmentStateLabel(code), state };
}

const allUpcoming = (): StatusStep[] =>
  FLOW.map((code) => step(code, 'upcoming'));

export function buildStatusSteps(
  trangThai: string,
  unknown: UnknownStatusMode,
): StatusSteps | null {
  switch (trangThai) {
    case 'ChoThanhToan':
      return { pendingPayment: true, steps: allUpcoming() };
    case 'DaXacNhan':
    case 'DaTiepDon':
    case 'HoanThanh': {
      const index = FLOW.indexOf(trangThai);
      return {
        pendingPayment: false,
        steps: FLOW.map((code, position) =>
          step(
            code,
            position < index
              ? 'passed'
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
        steps: [...allUpcoming(), step(trangThai, 'terminal')],
      };
    default:
      return unknown === 'upcoming'
        ? { pendingPayment: false, steps: allUpcoming() }
        : null;
  }
}
