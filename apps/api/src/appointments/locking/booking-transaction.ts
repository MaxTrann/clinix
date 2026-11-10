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

// Giao dịch ghi của module `booking` (PLAN booking 5.3 quy tắc 3 đến 5, Q42; TRACKING 3.3 P1-E, 3.12 X1b).
//
// Q42 ĐÃ CHỐT ở X1 (10/11/2026, TRACKING 3.9.4): `READ COMMITTED`, thử lại ≤ 2 cho 1213 và 1205 trước commit, và `innodb_lock_wait_timeout` = 3 giây cho giao dịch đặt lịch
// (đã đo: mặc định 50 giây làm tổng chờ (1 + 2) × 50 = 150 giây, ở 3 giây là 9,03 giây). Timeout đặt bằng `SET SESSION` làm câu đầu của `work` (X1b) và khôi phục ở `finally`:
// `SET_VAR` không có hiệu lực (cảnh báo 3637) và `SET SESSION` không khôi phục thì kết nối trả về pool giữ timeout = 3 (M3 (4), 1 trong 8 kết nối).
export const BOOKING_TX_ISOLATION = 'READ COMMITTED' as const;
/** Số lần THỬ LẠI (tổng số lần chạy = số này + 1). */
export const BOOKING_TX_MAX_RETRIES = 2;
/**
 * Số giây chờ khoá hàng tối đa MỖI LẦN CHẠY. Ngân sách: (1 + `BOOKING_TX_MAX_RETRIES`) × giá trị này ≤ 10 giây (TRACKING 3.9.1 T0: web bỏ cuộc sau 15 giây, chừa 5 giây
 * cho mạng và xử lý); BTX-12 kiểm bằng phép tính.
 */
export const BOOKING_LOCK_WAIT_TIMEOUT_SECONDS = 3;

// Tham số `?` phải là SỐ: MySQL từ chối chuỗi (1232) và driver trả giá trị đọc về dưới dạng CHUỖI (đã đo ở X1b), nên phải đổi trước khi đặt lại.
const SET_LOCK_WAIT_TIMEOUT_SQL = 'SET SESSION innodb_lock_wait_timeout = ?';

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
 *
 * Timeout chờ khoá (Q42, X1b): MỖI lần chạy, `work` được bọc để hai câu ĐẦU là đọc giá trị cũ và `SET SESSION innodb_lock_wait_timeout = 3`; khôi phục giá trị cũ ở `finally`
 * (kể cả khi `work` ném lỗi) TRƯỚC commit/rollback, vì sau đó TypeORM trả kết nối về pool. Mọi `work` chạy qua hàm này chờ khoá tối đa 3 giây, không phải 50 giây mặc định.
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
        const result = await withLockWaitTimeout(
          manager,
          work,
          logger,
          options.label,
        );
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

/**
 * Đặt timeout chờ khoá của PHIÊN (kết nối của giao dịch này) rồi chạy `work`, và LUÔN khôi phục giá trị cũ ở `finally`. Khôi phục nằm TRONG callback của `db.transaction`:
 *  - 1205: giao dịch còn mở và còn giữ khoá, nhưng `SET SESSION` không xin khoá nên chạy được; rollback sau đó mới thả khoá;
 *  - 1213: MySQL đã hoàn tác cả giao dịch, kết nối còn sống nên `SET SESSION` vẫn chạy được;
 *  - lỗi lúc commit: khôi phục đã xong từ trước, trạng thái kết nối đúng dù commit ra sao.
 * Bước khôi phục tự lỗi (kết nối đã chết) KHÔNG được che lỗi gốc của `work`: bắt, ghi cảnh báo chỉ có `label` (không thông điệp lỗi, không dữ liệu) rồi để lỗi gốc đi ra.
 */
async function withLockWaitTimeout<T>(
  manager: EntityManager,
  work: (manager: EntityManager) => Promise<T>,
  logger: Pick<Logger, 'warn'>,
  label: string,
): Promise<T> {
  // Đọc và kiểm giá trị cũ TRƯỚC khi đổi gì: hỏng thì ném ra khi chưa gửi câu SET nào
  const previous = await readLockWaitTimeout(manager);
  await manager.query(SET_LOCK_WAIT_TIMEOUT_SQL, [
    BOOKING_LOCK_WAIT_TIMEOUT_SECONDS,
  ]);
  try {
    return await work(manager);
  } finally {
    try {
      await manager.query(SET_LOCK_WAIT_TIMEOUT_SQL, [previous]);
    } catch {
      logger.warn(
        `${label}: không khôi phục được innodb_lock_wait_timeout về giá trị cũ`,
      );
    }
  }
}

// Đọc timeout hiện tại của phiên. Chỉ đọc biến hệ thống nên không chạm bảng InnoDB: không lập ảnh chụp, không xin khoá.
async function readLockWaitTimeout(manager: EntityManager): Promise<number> {
  const rows = await manager.query<{ value?: unknown }[]>(
    'SELECT @@session.innodb_lock_wait_timeout AS value',
  );
  const raw = rows[0]?.value;
  // Driver trả CHUỖI ("50"); MySQL lại âm thầm nâng 0 và số âm lên 1 nên không thể tin câu SET để phát hiện giá trị hỏng
  const value =
    typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error('innodb_lock_wait_timeout đọc về không hợp lệ');
  }
  return value;
}
