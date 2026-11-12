import { expect } from 'vitest';
import { findLockOrderViolation } from '../locking/lock-order.js';
import { firstTableOf, isLockingStatement } from './query-spy.js';

// Khẳng định chung về CHUỖI CÂU SQL THẬT của thao tác chuyển trạng thái (TRX-08 của B9, CFP-06 và CMP-03 của B11): dùng chung để ba nơi không chép lại cùng một đoạn kiểm (jscpd).
// Đối số là các câu thân giao dịch do `recordTransaction` hay `statement-recorder` ghi lại, theo thứ tự chạy.

/** Tên các bảng bị khoá hàng (`FOR UPDATE`, `FOR SHARE`) theo thứ tự câu chạy. */
export function lockedTablesOf(body: readonly string[]): string[] {
  return body
    .filter(isLockingStatement)
    .map(firstTableOf)
    .filter((table): table is string => table !== undefined);
}

/**
 * Ba câu ĐẦU của thao tác xin khung giờ rồi lịch (5.3, tầng 5 rồi tầng 6): đọc thường `lich_hen` để lấy khoá, `khung_gio FOR UPDATE`, `lich_hen FOR UPDATE` CHỈ theo khoá chính (quy tắc 7).
 * Trả các câu SAU ba câu đầu để người gọi kiểm tiếp phần ghi.
 */
export function expectSlotThenLichLock(body: readonly string[]): string[] {
  const [readKeys, lockSlot, lockLich] = body as [string, string, string];
  // (câu, bảng đầu tiên, có mệnh đề khoá hàng hay không)
  const head = [
    [readKeys, 'lich_hen', false],
    [lockSlot, 'khung_gio', true],
  ] as const;
  for (const [sql, table, locking] of head) {
    expect({
      table: firstTableOf(sql),
      locking: isLockingStatement(sql),
    }).toEqual({ table, locking });
  }
  expectLichLockByPrimaryKey(lockLich);
  return body.slice(3);
}

/** Câu khoá `lich_hen` CHỈ theo khoá chính: điều kiện là `lich_hen_id`, không `khung_gio_id` hay `khung_gio_dang_giu` (5.3 quy tắc 7). */
export function expectLichLockByPrimaryKey(sql: string): void {
  expect(firstTableOf(sql)).toBe('lich_hen');
  expect(isLockingStatement(sql)).toBe(true);
  expect(sql).toMatch(/WHERE lich_hen_id = \?/);
  expect(sql).not.toMatch(/khung_gio_id|khung_gio_dang_giu/);
}

/** Không câu nào xin bảng tầng 2 đến 4 (`benh_nhan`, `ho_so_nguoi_than`, `bac_si`): thao tác không phụ thuộc điều kiện của chúng. */
export function expectNoHigherTierTables(body: readonly string[]): void {
  expect(
    body.some((sql) => /\b(bac_si|benh_nhan|ho_so_nguoi_than)\b/i.test(sql)),
  ).toBe(false);
}

/** Bảng bị khoá đúng `khung_gio` rồi `lich_hen`, và (cùng các bảng ghi thêm ở tầng sau, nếu có) không vi phạm thứ tự khoá 5.3. */
export function expectSlotThenLichOrder(
  body: readonly string[],
  laterTables: readonly string[] = [],
): void {
  const locked = lockedTablesOf(body);
  expect(locked).toEqual(['khung_gio', 'lich_hen']);
  expect(findLockOrderViolation([...locked, ...laterTables])).toBeNull();
}
