import { Logger } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import {
  isDeadlockError,
  isLockWaitTimeoutError,
} from '../../database/mysql-errors.js';
import {
  BOOKING_ERROR_CODES,
  bookingException,
} from '../appointments.constants.js';

// Giao dịch ghi của module `booking` (PLAN booking 5.3 quy tắc 3 đến 5, Q42; TRACKING 3.3 P1-E).
//
// Q42 TẠM (duyệt 09/11/2026, TRACKING 3.3 P1-N): hai hằng dưới đây là giá trị Q42 của PLAN, CHỐT SAU khi đo M1 và M3 ở X1 (B6 vẫn chờ Q42). Bằng chứng đã có (không
// thay X1): auth A5-C (43% yêu cầu cấp mã bị 1213 ở REPEATABLE READ, 0 lỗi ở READ COMMITTED), patient B4-D, doctor M1 và M3. P1 KHÔNG cài
// `SET SESSION innodb_lock_wait_timeout` (phần duy nhất M3 có thể đổi): máy chủ mặc định 50 giây (doctor M3).
export const BOOKING_TX_ISOLATION = 'READ COMMITTED' as const;
/** Số lần THỬ LẠI (tổng số lần chạy = số này + 1). */
export const BOOKING_TX_MAX_RETRIES = 2;

const defaultLogger = new Logger('BookingTransaction');

export interface BookingTransactionOptions {
  /** Tên luồng, chỉ để ghi cảnh báo (ví dụ 'create-appointment'); KHÔNG đưa dữ liệu người dùng vào */
  label: string;
  /** Tiêm cho test; mặc định là `Logger` của Nest */
  logger?: Pick<Logger, 'warn'>;
}

/**
 * Chạy `work` trong MỘT giao dịch READ COMMITTED mở TƯỜNG MINH (không dựa mức cô lập mặc định REPEATABLE READ của máy chủ).
 *
 * Hợp đồng với `work`:
 *  - trả KẾT QUẢ CÓ KIỂU (union theo nếp `DeactivateOutcome` của patient, `Outcome` của `LoginService`), KHÔNG ném `AppException` nghiệp vụ trong giao dịch:
 *    ném thì lần ghi đã làm bị hoàn tác theo (bài học A8). Người gọi đổi sang lỗi API SAU khi hàm này trả;
 *  - có thể bị CHẠY LẠI TỪ ĐẦU: không giữ trạng thái giữa các lần (mỗi lần nhận `EntityManager` mới), và KHÔNG làm tác dụng phụ (hoàn tiền, mời danh sách chờ,
 *    gửi thư): chúng chạy SAU khi hàm này trả, đúng một lần.
 *
 * Thử lại: CHỈ khi `work` ném deadlock (1213) hoặc hết giờ chờ khoá (1205), tối đa `BOOKING_TX_MAX_RETRIES` lần thử lại, cách nhau 0 giây (như `OtpService` pha 2 và
 * `RegisterService`: với 1213 MySQL đã chọn nạn nhân và thả khoá; với 1205 giao dịch đã chờ cả `innodb_lock_wait_timeout`). "CHỈ TRƯỚC COMMIT" bằng cấu trúc:
 * cờ `workDone` bật ngay khi `work` trả; lỗi ném ra khi cờ đã bật là lỗi LÚC COMMIT, đi nguyên ra ngoài, không bao giờ thử lại. Lỗi khác (1062, 1451,
 * `AppException`, lỗi bất kỳ) không thử lại: `db.transaction` rollback rồi ném lại nguyên. Hết lượt: `AppException` 503 `HE_THONG_DANG_BAN` (BB-04: không 500),
 * KHÔNG gắn lỗi gốc làm `cause` (có thể mang tham số câu lệnh); errno đã ghi ở cảnh báo của lần cuối. Cảnh báo chỉ có `label`, số lần, errno.
 */
export async function withBookingTransaction<T>(
  db: DataSource,
  work: (manager: EntityManager) => Promise<T>,
  options: BookingTransactionOptions,
): Promise<T> {
  const logger = options.logger ?? defaultLogger;
  const maxRuns = BOOKING_TX_MAX_RETRIES + 1;
  for (let run = 1; ; run++) {
    let workDone = false;
    try {
      return await db.transaction(BOOKING_TX_ISOLATION, async (manager) => {
        const result = await work(manager);
        workDone = true;
        return result;
      });
    } catch (error) {
      if (workDone || !isContentionError(error)) throw error;
      const errno = isDeadlockError(error) ? '1213' : '1205';
      const outOfRuns = run >= maxRuns;
      logger.warn(
        `${options.label}: MySQL ${errno} ở lần chạy ${String(run)}/${String(maxRuns)}, ${outOfRuns ? 'hết lượt thử lại' : 'thử lại'}`,
      );
      if (outOfRuns) throw bookingException(BOOKING_ERROR_CODES.SYSTEM_BUSY);
    }
  }
}

function isContentionError(error: unknown): boolean {
  return isDeadlockError(error) || isLockWaitTimeoutError(error);
}
