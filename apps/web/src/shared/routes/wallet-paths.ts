// "Ví của tôi" của Bệnh nhân (payment F1, PLAN 6.7; tên đường dẫn là [đề xuất]). Đặt ở `shared/` để `router/` (menu) và module khác (payment F2: trang kết quả nạp
// quay về ví) dùng chung mà không import chéo `features/`. File này không import gì nên gốc khu Bệnh nhân viết thẳng `/benh-nhan`; ca WP-01 khoá nó khớp
// `ROLE_HOME_PATHS.BenhNhan`. Đoạn đường là nhãn menu không dấu (nếp `lich-hen-cua-toi` của booking).
export const PATIENT_WALLET_SEGMENT = 'vi-cua-toi';
export const PATIENT_WALLET_PATH = `/benh-nhan/${PATIENT_WALLET_SEGMENT}`;

// Trang kết quả nạp (payment F2): nơi cổng thanh toán đưa Bệnh nhân quay về. `VNPAY_RETURN_URL` của API phải trỏ đúng đường này (`.env.example`). Trang chỉ đọc mã giao dịch
// (`vnp_TxnRef`) để hỏi API, KHÔNG suy kết quả từ chuỗi truy vấn của cổng (WNT-05).
export const PATIENT_TOPUP_RESULT_SEGMENT = `${PATIENT_WALLET_SEGMENT}/ket-qua-nap`;
export const PATIENT_TOPUP_RESULT_PATH = `/benh-nhan/${PATIENT_TOPUP_RESULT_SEGMENT}`;

// Màn "Đặt cọc & Hoàn tiền" của Quản trị viên (payment F5; Figma `553:2`; tên đường dẫn là [đề xuất]). `*_SEGMENT` tương đối với `/admin` cho route con của khung Admin, `*_PATH` đầy đủ cho mục menu
// ở `features/admin/components/admin-sidebar.tsx`. Đoạn đường là nhãn menu không dấu. Ca WP-02 khoá nó nằm dưới `ROLE_HOME_PATHS.QuanTriVien`.
export const ADMIN_DEPOSIT_POLICY_SEGMENT = 'dat-coc-hoan-tien';
export const ADMIN_DEPOSIT_POLICY_PATH = `/admin/${ADMIN_DEPOSIT_POLICY_SEGMENT}`;
