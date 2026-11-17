// "Ví của tôi" của Bệnh nhân (payment F1, PLAN 6.7; tên đường dẫn là [đề xuất]). Đặt ở `shared/` để `router/` (menu) và module khác (payment F2: trang kết quả nạp
// quay về ví) dùng chung mà không import chéo `features/`. File này không import gì nên gốc khu Bệnh nhân viết thẳng `/benh-nhan`; ca WP-01 khoá nó khớp
// `ROLE_HOME_PATHS.BenhNhan`. Đoạn đường là nhãn menu không dấu (nếp `lich-hen-cua-toi` của booking).
export const PATIENT_WALLET_SEGMENT = 'vi-cua-toi';
export const PATIENT_WALLET_PATH = `/benh-nhan/${PATIENT_WALLET_SEGMENT}`;
