// Nhận biết lỗi MySQL mà nơi gọi muốn xử lý riêng (trùng khoá, khoá ngoại, deadlock) thay vì để thành 500. Lỗi có thể do TypeORM bọc
// (QueryFailedError.driverError) hoặc là lỗi thô của mysql2. Chỉ đọc `errno` và `code`; KHÔNG đọc `message`, `query`, `parameters`
// (thông điệp "Duplicate entry '<email>'" và tham số câu lệnh có thể chứa dữ liệu người dùng).
interface MysqlCodes {
  errno: number | undefined;
  code: string | undefined;
}

function codesOf(error: unknown): MysqlCodes | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const wrapped: unknown = Reflect.get(error, 'driverError');
  const source: object =
    typeof wrapped === 'object' && wrapped !== null ? wrapped : error;
  const errno: unknown = Reflect.get(source, 'errno');
  const code: unknown = Reflect.get(source, 'code');
  return {
    errno: typeof errno === 'number' ? errno : undefined,
    code: typeof code === 'string' ? code : undefined,
  };
}

function matches(
  error: unknown,
  errnos: readonly number[],
  codes: readonly string[],
): boolean {
  const found = codesOf(error);
  if (!found) return false;
  return (
    (found.errno !== undefined && errnos.includes(found.errno)) ||
    (found.code !== undefined && codes.includes(found.code))
  );
}

/** 1062 ER_DUP_ENTRY: vi phạm UNIQUE/khoá chính. */
export function isDuplicateKeyError(error: unknown): boolean {
  return matches(error, [1062], ['ER_DUP_ENTRY']);
}

/** 1451/1452: khoá ngoại chặn xoá hàng cha còn hàng con, hoặc chèn hàng con thiếu cha. */
export function isForeignKeyError(error: unknown): boolean {
  return matches(
    error,
    [1451, 1452],
    [
      'ER_ROW_IS_REFERENCED',
      'ER_ROW_IS_REFERENCED_2',
      'ER_NO_REFERENCED_ROW',
      'ER_NO_REFERENCED_ROW_2',
    ],
  );
}

/** 1213 ER_LOCK_DEADLOCK: MySQL đã hoàn tác giao dịch nạn nhân; làm lại cả giao dịch là cách xử lý chuẩn. */
export function isDeadlockError(error: unknown): boolean {
  return matches(error, [1213], ['ER_LOCK_DEADLOCK']);
}

/** 1205 ER_LOCK_WAIT_TIMEOUT: chờ khoá hàng quá `innodb_lock_wait_timeout`; chỉ câu lệnh đó bị huỷ, giao dịch của người gọi vẫn còn (task A7). */
export function isLockWaitTimeoutError(error: unknown): boolean {
  return matches(error, [1205], ['ER_LOCK_WAIT_TIMEOUT']);
}
