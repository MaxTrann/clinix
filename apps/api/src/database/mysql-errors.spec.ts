import { QueryFailedError } from 'typeorm';
import {
  isDeadlockError,
  isDuplicateKeyError,
  isForeignKeyError,
} from './mysql-errors.js';

// Task A5: nhận biết lỗi MySQL do thư viện bọc (TypeORM QueryFailedError.driverError) hoặc lỗi thô của mysql2.
// Mã nội bộ (ME-nn) là [đề xuất]; plan chưa có mã test case riêng.
const wrapped = (driverError: Record<string, unknown>) =>
  new QueryFailedError(
    'INSERT INTO x',
    [],
    Object.assign(new Error('bị DB từ chối'), driverError),
  );

describe('nhận biết lỗi MySQL', () => {
  it.each([
    ['errno 1062', { errno: 1062 }],
    ['code ER_DUP_ENTRY', { code: 'ER_DUP_ENTRY' }],
  ])('(ME-01) trùng khoá duy nhất: %s', (_label, driverError) => {
    expect(isDuplicateKeyError(wrapped(driverError))).toBe(true);
  });

  it.each([
    ['1451 xoá hàng cha còn hàng con', { errno: 1451 }],
    ['1452 chèn hàng con thiếu cha', { errno: 1452 }],
    ['ER_ROW_IS_REFERENCED_2', { code: 'ER_ROW_IS_REFERENCED_2' }],
    ['ER_NO_REFERENCED_ROW_2', { code: 'ER_NO_REFERENCED_ROW_2' }],
  ])('(ME-02) khoá ngoại: %s', (_label, driverError) => {
    expect(isForeignKeyError(wrapped(driverError))).toBe(true);
  });

  it.each([
    ['errno 1213', { errno: 1213 }],
    ['code ER_LOCK_DEADLOCK', { code: 'ER_LOCK_DEADLOCK' }],
  ])('(ME-03) deadlock: %s', (_label, driverError) => {
    expect(isDeadlockError(wrapped(driverError))).toBe(true);
  });

  it('(ME-04) lỗi thô của mysql2 (chưa được TypeORM bọc) cũng nhận ra', () => {
    const raw = Object.assign(new Error('Duplicate entry'), {
      errno: 1062,
      code: 'ER_DUP_ENTRY',
    });
    expect(isDuplicateKeyError(raw)).toBe(true);
    expect(isForeignKeyError(raw)).toBe(false);
    expect(isDeadlockError(raw)).toBe(false);
  });

  it('(ME-05) ba loại lỗi không nhận nhầm nhau; hết thời gian chờ khoá (1205) không phải deadlock', () => {
    const dup = wrapped({ errno: 1062 });
    const fk = wrapped({ errno: 1451 });
    const dead = wrapped({ errno: 1213 });
    const wait = wrapped({ errno: 1205, code: 'ER_LOCK_WAIT_TIMEOUT' });
    expect([
      isDuplicateKeyError(dup),
      isDuplicateKeyError(fk),
      isDuplicateKeyError(dead),
    ]).toEqual([true, false, false]);
    expect([isForeignKeyError(dup), isForeignKeyError(fk)]).toEqual([
      false,
      true,
    ]);
    expect([isDeadlockError(dead), isDeadlockError(wait)]).toEqual([
      true,
      false,
    ]);
  });

  it.each([
    ['Error thường', new Error('x')],
    ['chuỗi', 'ER_DUP_ENTRY'],
    ['null', null],
    ['undefined', undefined],
    ['số', 1062],
    ['đối tượng rỗng', {}],
  ])('(ME-06) %s không phải lỗi MySQL nào', (_label, value) => {
    expect(isDuplicateKeyError(value)).toBe(false);
    expect(isForeignKeyError(value)).toBe(false);
    expect(isDeadlockError(value)).toBe(false);
  });
});
