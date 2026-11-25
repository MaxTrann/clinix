import {
  PATIENT_APPOINTMENTS_PATH,
  patientAppointmentDetailPath,
  patientAppointmentReschedulePath,
} from '../../../../../shared/routes/booking-paths';
import type { RescheduleLinks } from '../../common/reschedule-views';
import { DETAIL_TEXT } from '../detail/detail-messages';

// Ba đích mà thẻ lỗi của trang đổi lịch Bệnh nhân chỉ tới (danh sách "Lịch hẹn của tôi", trang chọn khung giờ, chi tiết lịch); đường dẫn dựng từ `booking-paths`.
export function patientRescheduleLinks(maLichHen: string): RescheduleLinks {
  return {
    list: { to: PATIENT_APPOINTMENTS_PATH, label: DETAIL_TEXT.backToList },
    grid: patientAppointmentReschedulePath(maLichHen),
    detail: patientAppointmentDetailPath(maLichHen),
  };
}
