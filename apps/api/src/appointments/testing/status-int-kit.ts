import type { DataSource } from 'typeorm';
import { expect } from 'vitest';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BookingFixtures } from './booking-fixtures.js';
import { createGate } from './concurrency-harness.js';
import { sleep } from './concurrency-report.js';
import {
  readNoShow,
  statusWorld,
  type NoShowState,
  type StatusWorld,
} from './status-world.js';

// Bộ dùng chung của các int-spec của B12 (task B12; TRACKING 3.26 B12-V): khối móc kiểm thử, khung "hai bên đua" và khẳng định "không đổi một byte" nằm MỘT chỗ để jscpd (vốn quét cả `*.int-spec.ts`)
// không thấy cùng một đoạn ở nhiều file. KHÔNG đổi kỳ vọng nào của ca nào: chỉ tách hàm.

// `db`, `fx`, `logs` là LIÊN KẾT SỐNG (live binding) của module ESM: `useStatusWorldHooks()` gán lại ở `beforeAll` rồi mọi file đã `import` thấy giá trị mới, nên mã ca giữ nguyên tên `db`, `fx`, `logs` như trước. Mỗi file test có
// bản module riêng (vitest cô lập theo file) và các file int chạy tuần tự, nên không có chuyện hai file ghi đè nhau.
export let db: DataSource;
export let fx: BookingFixtures;
export let logs: string[] = [];

/** Gọi MỘT lần ở đầu file int-spec (ngoài `describe`): dựng DB test, `BookingFixtures` và gom dòng log Nest của từng ca. */
export function useStatusWorldHooks(): void {
  useIntegrationHooks((d, captured) => {
    db = d;
    fx = new BookingFixtures(d);
    logs = captured;
  });
}

/** Thế giới Lễ tân (`statusWorld`) trên DB test của file đang chạy. */
export const world = (): Promise<StatusWorld> => statusWorld(db, fx);

/**
 * Hai bên chạy đua CÙNG xuất phát (`createGate`), vòng lẻ bên thứ nhất chậm 4 ms, vòng chẵn bên thứ hai: xen kẽ ai đi trước để CẢ HAI nhánh thắng đều chạy. Kết quả theo đúng thứ tự `[first, second]`.
 * Bên nào cần đi sau ở vòng chẵn thay vì vòng lẻ thì gọi với `round + 1`.
 */
export const racePair = <A, B>(
  round: number,
  first: () => Promise<A>,
  second: () => Promise<B>,
) => {
  const gate = createGate(2);
  return [
    async (): Promise<A | B> => {
      await gate.arrive();
      if (round % 2 === 1) await sleep(4);
      return first();
    },
    async (): Promise<A | B> => {
      await gate.arrive();
      if (round % 2 === 0) await sleep(4);
      return second();
    },
  ] as const;
};

/** Lời gọi bị từ chối không đổi một byte: ảnh chụp lịch và khung giờ như TRƯỚC (`before`) và, khi truyền `counter`, bộ đếm no-show của tài khoản đặt đúng như vậy. */
export async function expectNoChange(
  w: StatusWorld,
  lich: Parameters<StatusWorld['snapshot']>[0],
  before: Awaited<ReturnType<StatusWorld['snapshot']>>,
  counter?: NoShowState,
): Promise<void> {
  expect(await w.snapshot(lich, 0)).toEqual(before);
  if (counter !== undefined)
    expect(await readNoShow(db, w.patientId)).toEqual(counter);
}
