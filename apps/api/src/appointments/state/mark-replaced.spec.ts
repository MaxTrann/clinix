import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import {
  FakeAppointmentNotifier,
  FakeWaitlistPort,
} from '../testing/fake-ports.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import { canTransition } from './appointment-state.matrix.js';
import { AppointmentTransitionService } from './appointment-transition.service.js';
import { markReplacedWithin } from './mark-replaced.js';

// reschedule B1 — HDL-01 (phần đơn vị; PLAN reschedule 5.3, 7.9): `markReplaced` là MỘT câu `UPDATE` có điều kiện trạng thái nguồn, CHỈ đổi `trang_thai`, trả `Replaced` khi đúng 1 hàng, `InvalidState` còn lại.
// `EntityManager` giả (không DB). Hành vi thật trên MySQL (mọi cột khác y nguyên, bảy trạng thái): mark-replaced.int-spec.ts.
const LICH_HEN_ID = '41';

function build(result: unknown) {
  const query = vi.fn((_sql: string, _params?: unknown[]) => {
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve(result);
  });
  return { query, em: { query } as unknown as EntityManager };
}

describe('HDL-01 markReplaced: câu UPDATE', () => {
  it('đúng MỘT câu, chỉ SET trang_thai = DaDoiLich, điều kiện lich_hen_id VÀ trạng thái nguồn DaXacNhan; tham số chỉ là id (chuỗi nguyên văn)', async () => {
    const { query, em } = build({ affectedRows: 1 });

    await markReplacedWithin(em, { lichHenId: '9223372036854775807' });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] ?? [];
    expect(sql).toMatch(
      /^UPDATE lich_hen SET trang_thai = 'DaDoiLich'\s+WHERE/,
    );
    // không SET thêm cột nào: giữa SET và WHERE không có dấu phẩy (các mốc B19 giữ nguyên)
    expect(sql?.slice(0, sql.indexOf('WHERE'))).not.toContain(',');
    expect(sql).toMatch(
      /WHERE lich_hen_id = \? AND trang_thai = 'DaXacNhan'\s*$/,
    );
    expect(params).toStrictEqual(['9223372036854775807']);
  });

  it('câu SQL đúng là ô DoiLich: DaXacNhan → DaDoiLich có trong ma trận (nguồn và đích là hằng, như expire: không gọi canTransition lúc chạy)', () => {
    expect(
      canTransition({
        actor: 'DoiLich',
        from: 'DaXacNhan',
        to: 'DaDoiLich',
      }),
    ).toEqual({ ok: true });
  });

  it.each([
    [{ affectedRows: 1 }, { kind: 'Replaced' }],
    [{ affectedRows: 0 }, { kind: 'InvalidState' }],
    [{}, { kind: 'InvalidState' }],
  ])('kết quả %j ⇒ %j', async (result, expected) => {
    const { em } = build(result);

    expect(await markReplacedWithin(em, { lichHenId: LICH_HEN_ID })).toEqual(
      expected,
    );
  });

  it('lỗi của DB (khoá ngoại, deadlock) đi nguyên ra ngoài để người gọi hoàn tác: không nuốt, không đổi thành InvalidState', async () => {
    const error = new Error('deadlock giả');
    const { em } = build(error);

    await expect(
      markReplacedWithin(em, { lichHenId: LICH_HEN_ID }),
    ).rejects.toBe(error);
  });
});

describe('HDL-01 AppointmentTransitionService.markReplaced', () => {
  it('chạy bằng ĐÚNG `em` của người gọi, một câu UPDATE, không mở giao dịch, không đụng khung giờ, danh sách chờ hay thông báo', async () => {
    const { query, em } = build({ affectedRows: 1 });
    const db = { transaction: vi.fn() };
    const waitlist = new FakeWaitlistPort();
    const notifier = new FakeAppointmentNotifier();
    const service = new AppointmentTransitionService(
      db as unknown as DataSource,
      new SlotHoldService(),
      waitlist,
      notifier,
    );

    const outcome = await service.markReplaced(em, { lichHenId: LICH_HEN_ID });

    expect(outcome).toEqual({ kind: 'Replaced' });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toMatch(/^UPDATE lich_hen SET trang_thai/);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(waitlist.onSlotReleasedCall.count).toBe(0);
    expect(notifier.notifyCall.count).toBe(0);
  });

  it('lịch không còn DaXacNhan ⇒ InvalidState (không ném AppException)', async () => {
    const { em } = build({ affectedRows: 0 });
    const service = new AppointmentTransitionService(
      { transaction: vi.fn() } as unknown as DataSource,
      new SlotHoldService(),
      new FakeWaitlistPort(),
      new FakeAppointmentNotifier(),
    );

    await expect(
      service.markReplaced(em, { lichHenId: LICH_HEN_ID }),
    ).resolves.toEqual({ kind: 'InvalidState' });
  });
});
