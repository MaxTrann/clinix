import { appointmentStateLabel } from '../../common/appointment-status';

// Dựng mốc "Trạng thái lịch hẹn" CHỈ từ `trangThai` (booking F2; Figma `420:2`, `426:2`, `691:2`). API không có mốc thời gian từng bước, nên bỏ dòng
// "Chưa ghi nhận" của Figma (dễ hiểu nhầm là "chưa xác nhận") và bước chưa tới ghi "Chưa đến" (Đại duyệt 12/11/2026). `VangMat` (chưa có frame, PLAN 4.5)
// thêm bước cuối cùng kiểu `DaHuy` [đề xuất]. Tách khỏi `detail-timeline.tsx` vì quy tắc `react-refresh/only-export-components` (file component chỉ xuất component).
export type StepState = 'passed' | 'current' | 'upcoming' | 'terminal';
export interface TimelineStep {
  label: string;
  state: StepState;
}

const FLOW: readonly string[] = ['DaXacNhan', 'DaTiepDon', 'HoanThanh'];

// `ChoThanhToan`, mã lạ ⇒ cả ba bước "chưa đến". `DaHuy` và `VangMat` ⇒ cả ba "chưa đến" cộng bước cuối (như Figma `691:2`: không biết lịch đã tới bước nào
// trước khi dừng). Hàm thuần.
export function timelineSteps(status: string): TimelineStep[] {
  const index = FLOW.indexOf(status);
  const steps: TimelineStep[] = FLOW.map((code, position) => ({
    label: appointmentStateLabel(code),
    state:
      index === -1 || position > index
        ? 'upcoming'
        : position < index
          ? 'passed'
          : 'current',
  }));
  if (status === 'DaHuy' || status === 'VangMat') {
    steps.push({ label: appointmentStateLabel(status), state: 'terminal' });
  }
  return steps;
}
