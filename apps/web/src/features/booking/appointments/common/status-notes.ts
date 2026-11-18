import { formatVietnamTimeDayMonth } from './appointment-format';

// Mốc thời gian từng bước của lịch hẹn (booking B19, issue #551; API trả khoá `moc` ở chi tiết Bệnh nhân, Bác sĩ, Quản trị viên). Mỗi giá trị là ISO 8601 UTC hoặc `null` (bước chưa tới, bị xoá khi
// Quản trị viên đưa lịch về `DaXacNhan` hay sang `VangMat`, hoặc lịch tạo trước B19: KHÔNG bao giờ điền giả).
export interface StatusMilestones {
  xacNhan: string | null;
  tiepDon: string | null;
  hoanThanh: string | null;
}

// Chữ của bước đã qua hoặc đang ở mà API chưa có mốc (lịch cũ): dấu gạch dài
export const NO_MILESTONE_TEXT = '—';

// Dòng phụ của từng bước cho `StatusTimeline`: khoá là MÃ BƯỚC (`DaXacNhan`, `DaTiepDon`, `HoanThanh`), giá trị là `HH:mm dd/MM` theo giờ Việt Nam hoặc `—`. Bước chưa tới bị `StatusTimeline` bỏ qua
// (hiện "Chưa đến") và `DaHuy`, `VangMat`, `ChoThanhToan` không có bước đã qua nên không hiện giờ nào: bố cục F13 giữ nguyên.
export function buildStepNotes(
  moc: StatusMilestones,
): Partial<Record<string, string>> {
  const text = (iso: string | null) =>
    iso === null ? NO_MILESTONE_TEXT : formatVietnamTimeDayMonth(iso);
  return {
    DaXacNhan: text(moc.xacNhan),
    DaTiepDon: text(moc.tiepDon),
    HoanThanh: text(moc.hoanThanh),
  };
}
