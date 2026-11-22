import { dayLabel } from './branch-schedule-format';
import type { BranchUpdateResult, SavedPart } from './branch-types';

// Tóm tắt phản hồi của Sửa lịch / dịch vụ (admin F6b; PLAN admin 5.4, Q2): người dùng phải biết rõ phần nào ĐÃ LƯU NGAY
// và phần nào ĐANG CHỜ DUYỆT. Tên, địa chỉ, tọa độ luôn lưu ngay và KHÔNG tự hoàn lại nếu yêu cầu sau đó bị từ chối, rút hay hủy.
// Câu chữ [đề xuất], đối chiếu Figma ở X1.

const PART_LABELS: Record<SavedPart, string> = {
  ten: 'tên',
  diaChi: 'địa chỉ',
  toaDo: 'tọa độ',
  lichHoatDong: 'lịch hoạt động',
  dichVuKham: 'dịch vụ khả dụng',
};

export interface BranchUpdateSummary {
  /** Câu "Đã lưu: …"; `null` khi không có phần nào lưu ngay */
  saved: string | null;
  /** Câu "Đã gửi yêu cầu chờ duyệt …"; `null` khi không tạo yêu cầu */
  pending: string | null;
  /** Cảnh báo khung giờ trống nằm ngoài lịch mới (chỉ liệt kê, không phải ảnh hưởng); `null` khi không có */
  warning: string | null;
}

export function summarizeBranchUpdate(
  result: BranchUpdateResult,
): BranchUpdateSummary {
  const saved =
    result.daLuu.length > 0
      ? `Đã lưu ngay: ${result.daLuu.map((part) => PART_LABELS[part]).join(', ')}.`
      : null;

  let pending: string | null = null;
  if (result.yeuCau) {
    const changes: string[] = [];
    if (result.yeuCau.thuThayDoi.length > 0)
      changes.push(
        `lịch ${result.yeuCau.thuThayDoi.map((day) => dayLabel(day)).join(', ')}`,
      );
    if (result.yeuCau.dichVuThem.length > 0)
      changes.push(`thêm ${result.yeuCau.dichVuThem.length} dịch vụ`);
    if (result.yeuCau.dichVuBo.length > 0)
      changes.push(`bỏ ${result.yeuCau.dichVuBo.length} dịch vụ`);
    const { lichHen, ca } = result.anhHuong;
    pending =
      `Đã gửi yêu cầu thay đổi chờ Quản trị viên Toàn hệ thống duyệt (${changes.join('; ')}), ` +
      `vì có ${lichHen.tong} lịch hẹn và ${ca.tong} ca làm việc bị ảnh hưởng. Phần này chưa áp dụng.`;
  }

  const freeSlots = result.canhBao.khungGioTrongNgoaiLich.tong;
  const warning =
    freeSlots > 0
      ? `Có ${freeSlots} khung giờ còn trống nằm ngoài lịch mới; bệnh nhân không đặt được các khung giờ này.`
      : null;

  return { saved, pending, warning };
}
