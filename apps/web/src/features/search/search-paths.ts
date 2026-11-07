// Đường dẫn luồng chọn dịch vụ → bác sĩ (TCBS b1–b3); một chỗ định nghĩa để link và route không lệch nhau.
export const BOOKING_PATH = '/dat-lich';
export const DOCTOR_TEAM_PATH = '/bac-si';
export const doctorDetailPath = (doctorId: string) =>
  `${DOCTOR_TEAM_PATH}/${encodeURIComponent(doctorId)}`;
export const serviceListPath = (groupId: string) =>
  `${BOOKING_PATH}/nhom/${encodeURIComponent(groupId)}`;
export const doctorListPath = (groupId: string, serviceId: string) =>
  `${serviceListPath(groupId)}/dich-vu/${encodeURIComponent(serviceId)}`;
