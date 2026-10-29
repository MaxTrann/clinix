import { QueryFailedError } from 'typeorm';
import {
  isDeadlockError,
  isDuplicateKeyError,
  isForeignKeyError,
  isLockWaitTimeoutError,
} from './mysql-errors.js';

// Task A7: nhận biết MySQL 1205 (hết thời gian chờ khoá hàng), xử lý như deadlock 1213 ở job dọn. Giữ riêng một file để không sửa test của A5
// (mysql-errors.spec.ts). Mã LW-nn là [đề xuất].
const wrapped = (driverError: Record<string, unknown>) =>
  new QueryFailedError(
    'DELETE FROM tai_khoan',
    [],
    Object.assign(new Error('bị DB từ chối'), driverError),
  );

describe('nhận biết hết thời gian chờ khoá (1205)', () => {
  it.each([
    ['errno 1205', { errno: 1205 }],
    ['code ER_LOCK_WAIT_TIMEOUT', { code: 'ER_LOCK_WAIT_TIMEOUT' }],
  ])('(LW-01) %s do TypeORM bọc', (_label, driverError) => {
    expect(isLockWaitTimeoutError(wrapped(driverError))).toBe(true);
  });

  it('(LW-02) lỗi thô của mysql2 (chưa được TypeORM bọc) cũng nhận ra', () => {
    expect(
      isLockWaitTimeoutError(
        Object.assign(new Error('Lock wait timeout exceeded'), {
          errno: 1205,
          code: 'ER_LOCK_WAIT_TIMEOUT',
        }),
      ),
    ).toBe(true);
  });

  it('(LW-03) không nhận nhầm với deadlock, trùng khoá, khoá ngoại; và các hàm kia không nhận 1205', () => {
    const lockWait = wrapped({ errno: 1205 });
    expect(isDeadlockError(lockWait)).toBe(false);
    expect(isDuplicateKeyError(lockWait)).toBe(false);
    expect(isForeignKeyError(lockWait)).toBe(false);
    for (const other of [{ errno: 1213 }, { errno: 1062 }, { errno: 1451 }]) {
      expect(isLockWaitTimeoutError(wrapped(other))).toBe(false);
    }
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['chuỗi', 'ER_LOCK_WAIT_TIMEOUT'],
    ['Error thường', new Error('Lock wait timeout exceeded; 1205')], // chỉ đọc errno/code, không đọc thông điệp
  ])('(LW-04) %s không phải lỗi 1205', (_label, value) => {
    expect(isLockWaitTimeoutError(value)).toBe(false);
  });
});
