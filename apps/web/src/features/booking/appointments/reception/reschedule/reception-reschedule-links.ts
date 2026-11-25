import {
  RECEPTION_APPOINTMENTS_PATH,
  receptionAppointmentDetailPath,
  receptionAppointmentReschedulePath,
} from '../../../../../shared/routes/booking-paths';
import type { RescheduleLinks } from '../../common/reschedule-views';
import { DETAIL_TEXT } from '../detail/detail-messages';

// Ba đích mà thẻ lỗi của trang đổi lịch hộ chỉ tới (danh sách lịch hẹn của Lễ tân, trang chọn khung giờ, chi tiết lịch); đường dẫn dựng từ `booking-paths`. `list` là đích của thẻ 404 chung (không lộ lịch có tồn
// tại hay ngoài chi nhánh).
export function receptionRescheduleLinks(maLichHen: string): RescheduleLinks {
  return {
    list: { to: RECEPTION_APPOINTMENTS_PATH, label: DETAIL_TEXT.back },
    grid: receptionAppointmentReschedulePath(maLichHen),
    detail: receptionAppointmentDetailPath(maLichHen),
  };
}
