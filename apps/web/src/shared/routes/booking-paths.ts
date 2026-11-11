// Đường dẫn luồng đặt lịch dưới `/dat-lich` (TCBS b1–b3); một chỗ định nghĩa để `search` và `booking` dùng chung, link không lệch nhau.
// File này chỉ có hằng và hàm thuần, không import gì: `shared/` không được phụ thuộc `features/` (tránh vòng phụ thuộc).
export const BOOKING_PATH = '/dat-lich';
export const serviceListPath = (groupId: string) =>
  `${BOOKING_PATH}/nhom/${encodeURIComponent(groupId)}`;
export const doctorListPath = (groupId: string, serviceId: string) =>
  `${serviceListPath(groupId)}/dich-vu/${encodeURIComponent(serviceId)}`;

// Bước 4–6 (booking F3, PLAN booking 5.13; tên đường dẫn là [đề xuất]). Bước 4 và 5 nhận khung giờ qua query `khungGioId`; Thanh toán và
// Hoàn tất nhận mã lịch hẹn trên đường dẫn. Hằng `*_ROUTE` là mẫu cho route, hàm `booking*Path` dựng liên kết: cùng một file để không lệch nhau.
export const BOOKING_SLOT_PARAM = 'khungGioId';
export const BOOKING_INFO_PATH = `${BOOKING_PATH}/thong-tin`;
export const BOOKING_CONFIRM_PATH = `${BOOKING_PATH}/xac-nhan`;
export const BOOKING_PAYMENT_ROUTE = `${BOOKING_PATH}/thanh-toan/:maLichHen`;
export const BOOKING_DONE_ROUTE = `${BOOKING_PATH}/hoan-tat/:maLichHen`;

const slotQuery = (khungGioId: string) =>
  `?${BOOKING_SLOT_PARAM}=${encodeURIComponent(khungGioId)}`;
export const bookingInfoPath = (khungGioId: string) =>
  `${BOOKING_INFO_PATH}${slotQuery(khungGioId)}`;
export const bookingConfirmPath = (khungGioId: string) =>
  `${BOOKING_CONFIRM_PATH}${slotQuery(khungGioId)}`;
export const bookingPaymentPath = (maLichHen: string) =>
  BOOKING_PAYMENT_ROUTE.replace(':maLichHen', encodeURIComponent(maLichHen));
export const bookingDonePath = (maLichHen: string) =>
  BOOKING_DONE_ROUTE.replace(':maLichHen', encodeURIComponent(maLichHen));
