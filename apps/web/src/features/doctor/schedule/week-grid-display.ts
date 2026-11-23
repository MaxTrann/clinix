import {
  formatShiftHours,
  type ShiftCode,
} from '../../../shared/schedule/shift-labels';
import type { DoctorShift } from '../api/schedule-api';

// Giờ chuẩn ghi ở NHÃN của một hàng (ca) trong lưới tuần (doctor UX8). Chỉ trả giờ khi MỌI ca có giờ hợp lệ của hàng đó trùng nhau; ca có `batDau` hoặc `ketThuc`
// là `null` ("mồ côi") bị bỏ qua và không làm lệch. Lệch giờ, hoặc không ca nào có giờ, thì trả `null`: nhãn chỉ ghi chữ ca và mọi ô ghi giờ riêng.
// Giờ ca lấy từ lịch hoạt động của chi nhánh THEO THỨ nên các ngày trong một hàng có thể khác giờ; không bao giờ được ghi một giờ sai ở nhãn.
// So sánh chuỗi ĐÃ định dạng nên so cả hai đầu của khoảng giờ.
export function sharedRowHours(
  shifts: readonly DoctorShift[],
  ca: ShiftCode,
): string | null {
  let shared: string | null = null;
  for (const shift of shifts) {
    if (shift.ca !== ca) continue;
    const hours = formatShiftHours(shift.batDau, shift.ketThuc);
    if (hours === null) continue;
    if (shared === null) shared = hours;
    else if (shared !== hours) return null;
  }
  return shared;
}

// Ô ghi tên chi nhánh khi bác sĩ làm từ 2 chi nhánh (đầu trang đã ghi "Chi nhánh công tác" nên một chi nhánh thì ô không lặp lại). Cùng ngưỡng `>= 2` với ô
// "Lọc theo chi nhánh" ở thanh công cụ. `branches` là `chiNhanhLoc` của kỳ đang xem (chưa lọc), nên bộ lọc không làm ô đổi chữ.
export function hasManyBranches(branches: readonly unknown[]): boolean {
  return branches.length >= 2;
}
