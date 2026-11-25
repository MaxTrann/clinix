import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { claimSlot, freeLapsedHold } from './claim-slot.js';
import type { ExpireLapsedHoldOutcome } from './slot-hold.service.js';
import type { LockedSlot } from './slot-lock.js';

// reschedule B1 — HDL-12 (phần đơn vị; PLAN reschedule 3.5 R8, 5.5 bước 5 và 6): hai hàm dùng chung của `create` và đổi lịch. `SlotHoldService` giả: kiểm đối số từng lệnh gọi, thứ tự, và các thông điệp lỗi mà
// `create-appointment.service.spec.ts` (DL-27) đang khẳng định (không đổi). Hành vi thật trên MySQL: claim-slot.int-spec.ts.
const EM = { tag: 'em' } as unknown as EntityManager;
const SLOT = {
  khungGioId: '7',
  trangThai: 'ConTrong',
} as unknown as LockedSlot;
const NOW = new Date('2026-11-02T01:00:00.000Z');
const HAN = new Date('2026-11-02T01:15:00.000Z');

function build(
  holdKind: 'Done' | 'Stale' = 'Done',
  bookedKind: 'Done' | 'Stale' = 'Done',
) {
  const events: string[] = [];
  const hold = vi.fn(() => {
    events.push('hold');
    return Promise.resolve({ kind: holdKind });
  });
  const markBooked = vi.fn(() => {
    events.push('markBooked');
    return Promise.resolve({ kind: bookedKind });
  });
  const expireLapsedHold = vi.fn((): Promise<ExpireLapsedHoldOutcome> =>
    Promise.resolve({ kind: 'Expired', lichHenId: '5' }),
  );
  return { events, hold, markBooked, expireLapsedHold };
}

describe('HDL-12 freeLapsedHold', () => {
  it.each([
    [{ kind: 'Expired', lichHenId: '5' }, 'Free'],
    [{ kind: 'NoHolder' }, 'Free'],
    [{ kind: 'NotLapsed' }, 'StillHeld'],
    [{ kind: 'HolderChanged' }, 'StillHeld'],
  ] as const)('expireLapsedHold trả %j ⇒ %s', async (outcome, expected) => {
    const { expireLapsedHold } = build();
    expireLapsedHold.mockResolvedValue(outcome);

    expect(await freeLapsedHold({ expireLapsedHold }, EM, SLOT, NOW)).toBe(
      expected,
    );
  });

  it('gọi expireLapsedHold ĐÚNG MỘT lần với (em, khung giờ đã khoá, { now }): đúng như create gọi trực tiếp trước khi tách', async () => {
    const { expireLapsedHold } = build();

    await freeLapsedHold({ expireLapsedHold }, EM, SLOT, NOW);

    expect(expireLapsedHold).toHaveBeenCalledExactlyOnceWith(EM, SLOT, {
      now: NOW,
    });
  });

  it('lỗi của SlotHoldService (dữ liệu lệch) đi nguyên ra ngoài để người gọi hoàn tác', async () => {
    const { expireLapsedHold } = build();
    const boom = new Error('khung giờ lệch');
    expireLapsedHold.mockRejectedValue(boom);

    await expect(
      freeLapsedHold({ expireLapsedHold }, EM, SLOT, NOW),
    ).rejects.toBe(boom);
  });
});

describe('HDL-12 claimSlot', () => {
  it('book = true: hold với { den } RỒI markBooked, cùng em và cùng khung giờ đã khoá (đúng thứ tự cọc 0đ của create)', async () => {
    const { events, hold, markBooked } = build();

    await claimSlot({ hold, markBooked }, EM, SLOT, { den: HAN, book: true });

    expect(events).toEqual(['hold', 'markBooked']);
    expect(hold).toHaveBeenCalledExactlyOnceWith(EM, SLOT, { den: HAN });
    expect(markBooked).toHaveBeenCalledExactlyOnceWith(EM, SLOT);
  });

  it('book = false: CHỈ hold (cọc > 0 của create dừng ở DangGiuCho), không markBooked', async () => {
    const { events, hold, markBooked } = build();

    await claimSlot({ hold, markBooked }, EM, SLOT, { den: HAN, book: false });

    expect(events).toEqual(['hold']);
    expect(markBooked).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'hold không Done (Stale) ⇒ NÉM Error "hold…" để hoàn tác cả INSERT, markBooked không chạy (book = %s)',
    async (book) => {
      const { hold, markBooked } = build('Stale');

      await expect(
        claimSlot({ hold, markBooked }, EM, SLOT, { den: HAN, book }),
      ).rejects.toThrow(
        'hold không ghi được dưới khoá sau khi INSERT lich_hen',
      );
      expect(markBooked).not.toHaveBeenCalled();
    },
  );

  it('markBooked không Done ⇒ NÉM Error "markBooked…" (create DL-27 khẳng định đúng chữ này)', async () => {
    const { hold, markBooked } = build('Done', 'Stale');

    await expect(
      claimSlot({ hold, markBooked }, EM, SLOT, { den: HAN, book: true }),
    ).rejects.toThrow('markBooked không ghi được dưới khoá');
    expect(hold).toHaveBeenCalledTimes(1);
  });

  it('lỗi của SlotHoldService đi nguyên ra ngoài (không nuốt)', async () => {
    const { hold, markBooked } = build();
    const boom = new Error('mất kết nối');
    hold.mockRejectedValue(boom);

    await expect(
      claimSlot({ hold, markBooked }, EM, SLOT, { den: HAN, book: true }),
    ).rejects.toBe(boom);
  });
});
