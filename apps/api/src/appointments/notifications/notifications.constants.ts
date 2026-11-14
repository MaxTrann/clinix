// Hằng của hộp thư đi và worker gửi thư (task B15; PLAN booking 5.12; TRACKING 3.37 B15-H). Để RIÊNG ở đây, không thêm vào `appointments.constants.ts` (file dùng chung của B1 đến B14). Các số là `[đề xuất]`.
// `BOOKING_JOB_BATCH_SIZE` (100) và `BOOKING_JOB_MAX_BATCHES` (10) dùng chung với job B9, B13: import từ `appointments.constants.ts`, không khai lại.

export const EMAIL_OUTBOX_JOB_NAME = 'booking-email-outbox';
/** Mỗi phút, giây thứ 5 (job B9 chạy giây 20, job B13 giây 40: ba job không dồn vào cùng một giây). */
export const EMAIL_OUTBOX_CRON = '5 * * * * *';

/** Số lần thử gửi tối đa cho MỘT thư (cột `so_lan_thu` tăng khi nhận việc). Hết lần mà vẫn lỗi thì giữ `ThatBai`, worker không chọn nữa. Cùng số với ví: tối đa 3 lần (PLAN 5.6). */
export const EMAIL_MAX_ATTEMPTS = 3;
/** Nhịp giữa hai lần thử của cùng một thư, tính từ `lan_thu_cuoi_luc`: cũng là thời gian chờ trước khi chọn lại thư đã nhận việc mà tiến trình chết giữa chừng. */
export const EMAIL_RETRY_GAP_MINUTES = 5;
