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

// "Lịch hẹn của tôi" của Bệnh nhân (booking F1, PLAN booking 5.13; tên đường dẫn là [đề xuất]). Đặt cùng file để `router/` (menu, route) và
// `features/patient` (F2 nối liên kết "Lịch hẹn của tôi" ở relative-errors.ts) dùng chung mà không import chéo `features/`. File này không
// import gì nên gốc khu Bệnh nhân viết thẳng `/benh-nhan`; ca BP-09 khoá nó khớp `ROLE_HOME_PATHS.BenhNhan`. Đoạn đường là nhãn menu
// không dấu, như `ho-so-nguoi-kham` của patient.
export const PATIENT_APPOINTMENTS_SEGMENT = 'lich-hen-cua-toi';
export const PATIENT_APPOINTMENTS_PATH = `/benh-nhan/${PATIENT_APPOINTMENTS_SEGMENT}`;

// Chi tiết một lịch hẹn của Bệnh nhân (booking F2, BP-10; tên đường dẫn là [đề xuất]). `*_SEGMENT` là mẫu TƯƠNG ĐỐI với `/benh-nhan` cho route con
// của khung Bệnh nhân (`PATIENT_APPOINTMENT_ROUTES`), `*_ROUTE` là mẫu đầy đủ, hàm `patientAppointmentDetailPath` dựng liên kết: cùng một file để không lệch
// nhau. Mã lịch hẹn nằm trên đường dẫn là chấp nhận được (đã nằm ở đường dẫn API); `encodeURIComponent` để mã có ký tự đặc biệt không làm vỡ URL.
export const PATIENT_APPOINTMENT_DETAIL_SEGMENT = `${PATIENT_APPOINTMENTS_SEGMENT}/:maLichHen`;
export const PATIENT_APPOINTMENT_DETAIL_ROUTE = `/benh-nhan/${PATIENT_APPOINTMENT_DETAIL_SEGMENT}`;
export const patientAppointmentDetailPath = (maLichHen: string) =>
  PATIENT_APPOINTMENT_DETAIL_ROUTE.replace(
    ':maLichHen',
    encodeURIComponent(maLichHen),
  );

// "Quản lý lịch hẹn" của Lễ tân (booking F8, BP-11; tên đường dẫn là [đề xuất], Đại duyệt 12/11/2026). `*_SEGMENT` là mẫu TƯƠNG ĐỐI với `/le-tan` cho route con của
// khung Lễ tân (`RECEPTION_APPOINTMENT_ROUTES`), `*_PATH` là đường dẫn đầy đủ cho mục menu. File này không import gì nên gốc khu Lễ tân viết thẳng `/le-tan`; ca BP-11 khoá
// nó khớp `ROLE_HOME_PATHS.LeTan`. Đoạn đường là nhãn menu không dấu (như `tra-cuu-benh-nhan` của patient). Chi tiết một lịch là ngăn kéo trên cùng trang, không có đường dẫn riêng.
export const RECEPTION_APPOINTMENTS_SEGMENT = 'quan-ly-lich-hen';
export const RECEPTION_APPOINTMENTS_PATH = `/le-tan/${RECEPTION_APPOINTMENTS_SEGMENT}`;

// Trang hồ sơ và người thân của Bệnh nhân (booking F4, BP-12; Đại duyệt 13/11/2026): đích của hàng "Thêm hồ sơ người thân mới" trong hộp chọn hồ sơ ở Bước 4, mở ở TAB MỚI.
// `features/booking` không import `features/patient` nên đường dẫn của patient (`PATIENT_PATHS.profile`) viết chữ ở đây; file này không import gì nên gốc khu Bệnh nhân viết
// thẳng `/benh-nhan`; ca BP-12 khoá nó khớp `PATIENT_PATHS.profile` (đổi một nơi mà quên nơi kia thì ca đỏ).
export const PATIENT_PROFILE_PATH = '/benh-nhan/ho-so-nguoi-kham';

// "Lịch hẹn" của Quản trị viên (booking F10, BP-13; tên đường dẫn là [đề xuất], Đại duyệt 13/11/2026). `*_SEGMENT` là mẫu TƯƠNG ĐỐI với `/admin` cho route con của khung Admin
// (`ADMIN_APPOINTMENT_ROUTES`), `*_PATH` và `*_ROUTE` là đường dẫn đầy đủ (mục menu, liên kết). File này không import gì nên gốc khu Quản trị viên viết thẳng `/admin`; ca BP-13 khoá nó khớp
// `ROLE_HOME_PATHS.QuanTriVien`. Mục menu `Lịch hẹn` ở `features/admin/components/admin-sidebar.tsx` ghi đường dẫn này bằng chữ (không import chéo). Chi tiết một lịch là TRANG
// (Figma `512:2`), mã lịch nằm trên đường dẫn như ở đường dẫn API; `encodeURIComponent` để mã có ký tự đặc biệt không làm vỡ URL.
export const ADMIN_APPOINTMENTS_SEGMENT = 'lich-hen';
export const ADMIN_APPOINTMENTS_PATH = `/admin/${ADMIN_APPOINTMENTS_SEGMENT}`;
export const ADMIN_APPOINTMENT_DETAIL_SEGMENT = `${ADMIN_APPOINTMENTS_SEGMENT}/:maLichHen`;
export const ADMIN_APPOINTMENT_DETAIL_ROUTE = `/admin/${ADMIN_APPOINTMENT_DETAIL_SEGMENT}`;
export const adminAppointmentDetailPath = (maLichHen: string) =>
  ADMIN_APPOINTMENT_DETAIL_ROUTE.replace(
    ':maLichHen',
    encodeURIComponent(maLichHen),
  );

// "Lịch hẹn" của Bác sĩ (booking F11, BP-14; tên đường dẫn là [đề xuất], Đại duyệt 14/11/2026). `*_SEGMENT` là mẫu TƯƠNG ĐỐI với `/bac-si-portal` cho route con của khung Bác sĩ
// (`DOCTOR_APPOINTMENT_ROUTES`), `*_PATH` và `*_ROUTE` là đường dẫn đầy đủ (mục menu, liên kết). File này không import gì nên gốc khu Bác sĩ viết thẳng `/bac-si-portal`; ca BP-14 khoá nó khớp
// `ROLE_HOME_PATHS.BacSi`. Chi tiết một lịch là TRANG (Figma `458:2`), mã lịch nằm trên đường dẫn như ở đường dẫn API; `encodeURIComponent` để mã có ký tự đặc biệt không làm vỡ URL.
export const DOCTOR_APPOINTMENTS_SEGMENT = 'lich-hen';
export const DOCTOR_APPOINTMENTS_PATH = `/bac-si-portal/${DOCTOR_APPOINTMENTS_SEGMENT}`;
export const DOCTOR_APPOINTMENT_DETAIL_SEGMENT = `${DOCTOR_APPOINTMENTS_SEGMENT}/:maLichHen`;
export const DOCTOR_APPOINTMENT_DETAIL_ROUTE = `/bac-si-portal/${DOCTOR_APPOINTMENT_DETAIL_SEGMENT}`;
export const doctorAppointmentDetailPath = (maLichHen: string) =>
  DOCTOR_APPOINTMENT_DETAIL_ROUTE.replace(
    ':maLichHen',
    encodeURIComponent(maLichHen),
  );
