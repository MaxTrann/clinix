// Bề mặt công khai DUY NHẤT của module payment (phần web): `router/` và module khác chỉ import từ đây. Mỗi task web sau (F2, F3, F4) thêm một dòng.
// F5: route "Đặt cọc & Hoàn tiền" của Quản trị viên (đã bọc `AdminScopeGuard`), ghép vào khối `QuanTriVien` ở `router/role-routes.tsx`.
export { ADMIN_DEPOSIT_POLICY_ROUTES } from './policy/policy-routes';
