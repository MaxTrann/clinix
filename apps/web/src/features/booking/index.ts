// Bề mặt công khai DUY NHẤT của module booking (phần web): `router/` và module khác chỉ import từ đây; `features/` không import chéo nhau (BWZ-08).
// F3 xuất đúng một tên. Task web sau (F1, F2, F8 đến F11) thêm tên của mình vào CHÍNH file này, mỗi task một dòng.
// Đường dẫn của luồng đặt lịch KHÔNG xuất ở đây: nằm ở `shared/routes/booking-paths.ts` để `search` và `router/` dùng được.
export { BOOKING_WIZARD_ROUTES } from './wizard/wizard-routes';
