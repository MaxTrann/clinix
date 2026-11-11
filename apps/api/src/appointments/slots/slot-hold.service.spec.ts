import type { EntityManager } from 'typeorm';
import { holdDeadline, SlotHoldService } from './slot-hold.service.js';
import type { LockedSlot } from './slot-lock.js';

// Task B6b — SLH-07 và SLH-10 (PLAN booking 7.23; TRACKING 3.14.5), phần ĐƠN VỊ của `SlotHoldService`. Phần MySQL thật (SLH-01…06, 08, 09, CG-09): slot-hold.service.int-spec.ts.

describe('SLH-10 holdDeadline: một hàm cho cả giu_cho_den và han_thanh_toan (Q2, H8, INV-2)', () => {
  it.each([
    // [mô tả, now, phút, hạn mong đợi]
    [
      'now có mili giây: cắt xuống giây TRƯỚC khi cộng',
      '2026-11-02T09:00:00.789+07:00',
      15,
      '2026-11-02T09:15:00.000+07:00',
    ],
    [
      'now có .999 giây',
      '2026-11-02T09:00:59.999+07:00',
      15,
      '2026-11-02T09:15:59.000+07:00',
    ],
    [
      'qua nửa đêm',
      '2026-11-02T23:55:30.500+07:00',
      15,
      '2026-11-03T00:10:30.000+07:00',
    ],
    [
      'qua ranh giới tháng',
      '2026-11-30T23:59:59.100+07:00',
      1,
      '2026-12-01T00:00:59.000+07:00',
    ],
    [
      'phút lớn (ba ngày và bảy phút)',
      '2026-11-02T09:00:00.000+07:00',
      3 * 24 * 60 + 7,
      '2026-11-05T09:07:00.000+07:00',
    ],
    [
      'phút = 0: chỉ cắt mili giây',
      '2026-11-02T09:00:00.600+07:00',
      0,
      '2026-11-02T09:00:00.000+07:00',
    ],
  ])('%s', (_name, now, phut, expected) => {
    const result = holdDeadline(new Date(now), phut);
    expect(result.getMilliseconds()).toBe(0);
    expect(result.toISOString()).toBe(new Date(expected).toISOString());
  });

  it('không sửa đầu vào, và hai lần gọi cùng đầu vào cho đúng cùng một giá trị (dùng cho cả hạn khung giờ và hạn lịch)', () => {
    const now = new Date('2026-11-02T09:00:00.789+07:00');
    const before = now.getTime();
    const forSlot = holdDeadline(now, 15);
    const forAppointment = holdDeadline(now, 15);
    expect(now.getTime()).toBe(before);
    expect(forSlot.getTime()).toBe(forAppointment.getTime());
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60])(
    'phút không hợp lệ (%s) ⇒ RangeError, không trả một hạn sai',
    (phut) => {
      expect(() => holdDeadline(new Date(), phut)).toThrow(RangeError);
    },
  );
});

describe('SLH-07 LockedSlot là bằng chứng đã khoá: không gọi được hàm ghi với đối tượng dựng tay', () => {
  const holds = new SlotHoldService();
  const em = {
    query: () => Promise.resolve({ affectedRows: 1 }),
  } as unknown as EntityManager;
  const handBuilt = {
    khungGioId: '1',
    lichLamViecId: '1',
    ngayGio: new Date(),
    trangThai: 'ConTrong' as const,
    giuChoDen: null,
  };

  it('tsc từ chối đối tượng thường ở mọi hàm ghi nhận LockedSlot (kiểm bằng @ts-expect-error: nếu một hàm lại nhận được thì tsc báo lỗi dòng chỉ thị thừa)', async () => {
    // @ts-expect-error — thiếu dấu `lockedSlotBrand` mà chỉ `lockSlot` tạo được
    await holds.hold(em, handBuilt, { den: new Date() });
    // @ts-expect-error — như trên
    await holds.markBooked(em, handBuilt);
    // @ts-expect-error — như trên
    await holds.release(em, handBuilt, { from: 'DaDat', den: null });
    // @ts-expect-error — như trên
    await holds.expireLapsedHold(em, handBuilt, { now: new Date() });
  });

  it('không dựng tay được ngay cả khi cố gán dấu: `lockedSlotBrand` chỉ là kiểu, không có giá trị lúc chạy', async () => {
    const mod: Record<string, unknown> = await import('./slot-lock.js');
    expect(mod['lockedSlotBrand']).toBeUndefined();
  });
});

describe('SlotHoldService: tham số của câu lệnh (đơn vị, em giả)', () => {
  const holds = new SlotHoldService();
  const slot = {
    khungGioId: '42',
    lichLamViecId: '7',
    ngayGio: new Date('2026-11-10T08:00:00+07:00'),
    trangThai: 'DangGiuCho',
    giuChoDen: new Date('2026-11-02T08:15:00+07:00'),
  } as unknown as LockedSlot;

  function recorder(affectedRows: number) {
    const calls: { sql: string; params: unknown[] }[] = [];
    const em = {
      query: (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        return Promise.resolve({ affectedRows });
      },
    } as unknown as EntityManager;
    return { em, calls };
  }

  it('hold: cắt mili giây của den; 0 hàng ⇒ Stale, 1 hàng ⇒ Done', async () => {
    const stale = recorder(0);
    const den = new Date('2026-11-02T09:15:00.789+07:00');
    expect(await holds.hold(stale.em, slot, { den })).toEqual({
      kind: 'Stale',
    });
    expect(stale.calls[0]?.params).toEqual([
      new Date('2026-11-02T09:15:00.000+07:00'),
      '42',
    ]);
    expect(await holds.hold(recorder(1).em, slot, { den })).toEqual({
      kind: 'Done',
    });
  });

  it('release: den null truyền NULL (khớp bằng <=>), den có giá trị bị cắt mili giây', async () => {
    const asNull = recorder(1);
    await holds.release(asNull.em, slot, { from: 'DaDat', den: null });
    expect(asNull.calls[0]?.params).toEqual(['42', 'DaDat', null]);
    const withDen = recorder(1);
    await holds.release(withDen.em, slot, {
      from: 'DangGiuCho',
      den: new Date('2026-11-02T08:15:00.900+07:00'),
    });
    expect(withDen.calls[0]?.params).toEqual([
      '42',
      'DangGiuCho',
      new Date('2026-11-02T08:15:00.000+07:00'),
    ]);
  });

  it('expireLapsedHold: khung giờ chưa hết hạn ⇒ NotLapsed và KHÔNG gửi câu nào', async () => {
    const { em, calls } = recorder(1);
    const result = await holds.expireLapsedHold(em, slot, {
      now: new Date('2026-11-02T08:14:59+07:00'),
    });
    expect(result).toEqual({ kind: 'NotLapsed' });
    expect(calls).toEqual([]);
  });
});
