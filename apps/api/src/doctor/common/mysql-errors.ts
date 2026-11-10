// Mã lỗi MySQL mà giao dịch ghi của module doctor phải xử lý riêng (không bao giờ để lọt thành 500). Dùng chung cho phân công (B3) và gỡ ca (B4).

/** Số lần chạy lại tối đa khi MySQL huỷ giao dịch vì deadlock/chờ khoá quá lâu (Q40): chỉ trước commit nên chạy lại an toàn. */
export const MAX_RETRIES = 2;
export const RETRYABLE_ERRNO: ReadonlySet<number> = new Set([1213, 1205]);
/** UNIQUE bị vi phạm (hai Admin cùng ghi một ca). */
export const DUPLICATE_ENTRY_ERRNO = 1062;
/** Khoá ngoại chặn xoá hàng đang được bảng khác tham chiếu (ô khung giờ đã có lịch hẹn...). */
export const FOREIGN_KEY_RESTRICT_ERRNO = 1451;

/** errno của lỗi MySQL do TypeORM bọc (`driverError`); không phải lỗi MySQL ⇒ undefined. */
export function mysqlErrno(error: unknown): number | undefined {
  const driverError = (error as { driverError?: { errno?: unknown } } | null)
    ?.driverError;
  return typeof driverError?.errno === 'number' ? driverError.errno : undefined;
}

/** Lỗi này có đáng chạy lại cả giao dịch không (deadlock hoặc hết thời gian chờ khoá) và còn lượt thử. */
export function shouldRetry(error: unknown, attempt: number): boolean {
  const errno = mysqlErrno(error);
  return (
    errno !== undefined && RETRYABLE_ERRNO.has(errno) && attempt < MAX_RETRIES
  );
}
