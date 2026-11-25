// Hằng của job nhắc lịch hẹn (notification B3; PLAN notification 5.6; 2.4.69; Q2, Q3). Đây là MỘT chỗ duy nhất của các con số (NLH-19): không đọc từ cấu hình hay `.env`.
// Cỡ lô và số lô dùng chung `BOOKING_JOB_BATCH_SIZE` (100) và `BOOKING_JOB_MAX_BATCHES` (10) của booking, không đặt số riêng.

/**
 * Mỗi phút ở giây 10 `[đề xuất]`. PLAN đề xuất giây 30 nhưng giây đó đã có job áp dụng thay đổi chi nhánh (admin C4); bảng giây đã dùng lúc làm B3:
 * 5 gửi thư, 20 hết hạn giữ chỗ, 30 áp dụng thay đổi chi nhánh, 40 hoàn cọc, Vắng mặt và nghỉ phép, 50 đối soát nạp ví, phút 15 dọn tài khoản chưa xác minh.
 */
export const REMINDER_CRON = '10 * * * * *';
export const REMINDER_JOB_NAME = 'notification-appointment-reminder';

/** Q2: mốc đã qua quá 10 phút thì bỏ lặng lẽ, không gửi bù (2.4.69 A3). Cửa sổ đóng hai đầu. */
export const REMINDER_LATE_WINDOW_MINUTES = 10;
/** Q3: tổng 3 lần gửi, GỒM lần đầu (2.4.69 A1). */
export const REMINDER_MAX_ATTEMPTS = 3;
/** Khoảng cách giữa hai lần thử (2.4.69 A1); cũng là thời gian chờ trước khi nhặt lại một dòng đã nhận việc mà tiến trình chết. */
export const REMINDER_RETRY_GAP_MINUTES = 5;

/** `loi_cuoi` khi lịch không còn `DaXacNhan` hay đã tới giờ hẹn lúc kiểm lại sau khi nhận việc (2.4.69 A1 3b, 3c). */
export const REMINDER_STALE_APPOINTMENT = 'LICH_KHONG_CON_HIEU_LUC';
