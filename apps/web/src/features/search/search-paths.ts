// Đường dẫn luồng đặt lịch (`/dat-lich/**`, TCBS b1–b3) nay nằm ở shared/routes để `booking` dùng chung; re-export để mọi import cũ trong `search` vẫn chạy.
export {
  BOOKING_PATH,
  doctorListPath,
  serviceListPath,
} from '../../shared/routes/booking-paths';

// Đường dẫn tra cứu bác sĩ công khai (`/bac-si/**`) ở lại `search`.
export const DOCTOR_TEAM_PATH = '/bac-si';
export const doctorDetailPath = (doctorId: string) =>
  `${DOCTOR_TEAM_PATH}/${encodeURIComponent(doctorId)}`;
