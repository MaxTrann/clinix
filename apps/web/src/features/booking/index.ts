// Bề mặt công khai DUY NHẤT của module booking (phần web): `router/` và module khác chỉ import từ đây; `features/` không import chéo nhau (BWZ-08).
// F3 xuất đúng một tên. Task web sau (F1, F2, F8 đến F11) thêm tên của mình vào CHÍNH file này, mỗi task một dòng.
// Đường dẫn của luồng đặt lịch KHÔNG xuất ở đây: nằm ở `shared/routes/booking-paths.ts` để `search` và `router/` dùng được.
export { BOOKING_WIZARD_ROUTES } from './wizard/wizard-routes';
// F1: route "Lịch hẹn của tôi" của Bệnh nhân, ghép vào khối `BenhNhan` ở `router/role-routes.tsx` cạnh `PATIENT_ROUTES`.
export { PATIENT_APPOINTMENT_ROUTES } from './appointments/patient/patient-appointment-routes';
// F8: route "Quản lý lịch hẹn" của Lễ tân, ghép vào khối `LeTan` ở `router/role-routes.tsx` cạnh `RECEPTION_ROUTES`.
export { RECEPTION_APPOINTMENT_ROUTES } from './appointments/reception/reception-appointment-routes';
// F10: route "Lịch hẹn" của Quản trị viên (danh sách và trang chi tiết, đã bọc `AdminScopeGuard`), ghép vào khối `QuanTriVien` ở `router/role-routes.tsx` cạnh `ADMIN_APPROVALS_ROUTES`.
export { ADMIN_APPOINTMENT_ROUTES } from './appointments/admin/admin-appointment-routes';
