// Bề mặt công khai DUY NHẤT của module payment (phần web): `router/` và module khác chỉ import từ đây. Mỗi task web sau (F2, F3, F4) thêm một dòng.
// F5: route "Đặt cọc & Hoàn tiền" của Quản trị viên (đã bọc `AdminScopeGuard`), ghép vào khối `QuanTriVien` ở `router/role-routes.tsx`.
export { ADMIN_DEPOSIT_POLICY_ROUTES } from './policy/policy-routes';
// F2: nội dung tab "Nạp tiền" (trang ví của `features/wallet` gắn vào) và trang kết quả nạp (route nằm trong `PATIENT_WALLET_ROUTES`). Ngoại lệ có kiểm soát của luật
// "features không import chéo": `wallet` chỉ được import `payment` QUA file này (khoá bằng `features/wallet/architecture.test.ts`; Trung chọn 18/11/2026).
export { TopupPanel, type TopupPanelProps } from './topup/topup-panel';
export { TopupResultPage } from './topup/topup-result-page';
// F3: thành phần thanh toán cọc bằng ví; trang Bước Thanh toán của booking F6 (Đại) gắn vào và nhận `onPaid` qua props. Booking chỉ import qua file này (BWZ-08, Q19).
export {
  DepositPaymentPanel,
  type DepositPaymentPanelProps,
} from './deposit/deposit-payment-panel';
export type { DepositPaymentResult } from './deposit/deposit-api';
// F4: hộp "Thu tiền & tiếp đón" của Lễ tân; trang chi tiết Lễ tân của booking mở hộp và tải lại chi tiết qua `onChanged`. Booking chỉ import qua file này (BWZ-08, Q19).
export {
  CashCollectDialog,
  type CashCollectDialogProps,
} from './cash/cash-collect-dialog';
