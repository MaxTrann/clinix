// Đường dẫn trang "Hồ sơ khám bệnh" của Bệnh nhân (doctor-exam F5; PLAN 5.13, Q22). Chỉ có hằng, không import gì (nếp `shared/routes/booking-paths`) để `router/` dùng cho menu và route mà không kéo cả trang.
// `SEGMENT` là mẫu TƯƠNG ĐỐI với `/benh-nhan` cho route con của khung Bệnh nhân; `PATH` là đường dẫn đầy đủ cho mục menu. Gốc khu Bệnh nhân viết thẳng `/benh-nhan`; ca WXH-01 ở `router/role-routes.test.tsx` khoá nó khớp `ROLE_HOME_PATHS.BenhNhan`.
export const PATIENT_EXAM_RECORDS_SEGMENT = 'ho-so-kham-benh';
export const PATIENT_EXAM_RECORDS_PATH = `/benh-nhan/${PATIENT_EXAM_RECORDS_SEGMENT}`;

// Query duy nhất của trang: mã lịch hẹn của ca đang xem (mã lịch hẹn không phải dữ liệu sức khoẻ, đã nằm trên đường dẫn API). Người khám, năm, tháng KHÔNG lên URL (BDK-02).
export const EXAM_CASE_PARAM = 'ca';
