// Đường dẫn luồng đặt lịch dưới `/dat-lich` (TCBS b1–b3); một chỗ định nghĩa để `search` và `booking` dùng chung, link không lệch nhau.
// File này chỉ có hằng và hàm thuần, không import gì: `shared/` không được phụ thuộc `features/` (tránh vòng phụ thuộc).
export const BOOKING_PATH = '/dat-lich';
export const serviceListPath = (groupId: string) =>
  `${BOOKING_PATH}/nhom/${encodeURIComponent(groupId)}`;
export const doctorListPath = (groupId: string, serviceId: string) =>
  `${serviceListPath(groupId)}/dich-vu/${encodeURIComponent(serviceId)}`;
