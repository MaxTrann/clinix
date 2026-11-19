// Bề mặt công khai DUY NHẤT của module wallet (phần web): `router/` và module khác chỉ import từ đây. Mỗi task web sau (F6 đến F9) thêm một dòng.
// Đường dẫn "Ví của tôi" KHÔNG xuất ở đây: nằm ở `shared/routes/wallet-paths.ts` để `router/` và payment F2 dùng chung.
// F1: route "Ví của tôi" của Bệnh nhân, ghép vào khối `BenhNhan` ở `router/role-routes.tsx` cạnh `PATIENT_ROUTES`.
export { PATIENT_WALLET_ROUTES } from './patient/wallet-routes';
// F7: route "Quản lý tài chính ví" của Quản trị viên (đã bọc `AdminScopeGuard` ToanHeThong), ghép vào khối `QuanTriVien` ở `router/role-routes.tsx`.
export { ADMIN_FINANCE_ROUTES } from './admin/finance-routes';
