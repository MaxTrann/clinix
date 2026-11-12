import { Logger } from '@nestjs/common';
import { vi } from 'vitest';
import type { CancelOutcome } from '../../appointments/cancel/cancel.types.js';
import type { AffectedByLeaveFilter } from '../../appointments/queries/affected-by-leave.query.js';
import type { AppointmentCancellationPort } from './appointment-cancellation.port.js';
import {
  type ApprovedLeave,
  LeaveCancellationRunner,
} from './leave-cancellation.runner.js';

// Doctor B15 — bước 2 của Duyệt với cổng GIẢ (chỉ trong test, Q26): PD-07, PD-08, PD-10, HD-07.
// Bản chạy với `booking` thật ở admin-leave-approve.service.int-spec.ts.

const NOW = new Date('2026-11-02T01:00:00.000Z');
const LEAVE: ApprovedLeave = {
  bacSiId: '7',
  tuNgay: '2026-11-10',
  denNgay: '2026-11-12',
  ca: null,
};

/** Cổng giả: trả danh sách mã đã cho, và kết quả huỷ theo từng mã (hàm ném ⇒ lỗi hệ thống). */
function fakePort(
  codes: string[],
  outcomes: Record<string, CancelOutcome | (() => never)> = {},
) {
  const findCalls: AffectedByLeaveFilter[] = [];
  const cancelCalls: string[] = [];
  const port: AppointmentCancellationPort = {
    findAffected: async (filter) => {
      findCalls.push(filter);
      return codes.map((maLichHen, i) => ({
        lichHenId: String(i + 1),
        maLichHen,
      }));
    },
    cancelForLeave: async (maLichHen) => {
      cancelCalls.push(maLichHen);
      const outcome = outcomes[maLichHen];
      if (typeof outcome === 'function') outcome();
      return (
        (outcome as CancelOutcome | undefined) ?? {
          kind: 'Cancelled',
          maLichHen,
          hoanCoc: null,
        }
      );
    },
  };
  return { port, findCalls, cancelCalls };
}

const boom = (): never => {
  throw new Error('HE_THONG_DANG_BAN CLX-20261110-SECRET Nguyễn Văn A');
};

describe('LeaveCancellationRunner (cổng giả)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('PD-07 gọi findAffected đúng { bacSiId, tuNgay, denNgay, now } (cả ngày: không có ca) rồi huỷ TUẦN TỰ từng lịch theo thứ tự trả về', async () => {
    const { port, findCalls, cancelCalls } = fakePort(['A', 'B', 'C']);
    const summary = await new LeaveCancellationRunner(port).run(LEAVE, NOW);
    expect(findCalls).toEqual([
      { bacSiId: '7', tuNgay: '2026-11-10', denNgay: '2026-11-12', now: NOW },
    ]);
    expect(findCalls[0]).not.toHaveProperty('ca');
    expect(cancelCalls).toEqual(['A', 'B', 'C']);
    expect(summary).toEqual({
      hoanTat: true,
      daHuy: 3,
      daHuyTruocDo: 0,
      khongHuyDuoc: [],
    });
  });

  it('PD-07 nghỉ theo ca: truyền đúng ca', async () => {
    const { port, findCalls } = fakePort([]);
    await new LeaveCancellationRunner(port).run(
      { ...LEAVE, ca: 'CaChieu' },
      NOW,
    );
    expect(findCalls[0]?.ca).toBe('CaChieu');
  });

  it('PD-08, HD-07 tổng hợp bốn kết quả: Cancelled ⇒ daHuy, AlreadyCancelled ⇒ daHuyTruocDo (vẫn hoàn tất), NotCancellable ⇒ khongHuyDuoc, NotFound ⇒ bỏ qua', async () => {
    const { port } = fakePort(['A', 'B', 'C', 'D', 'E'], {
      B: { kind: 'AlreadyCancelled' },
      C: { kind: 'NotCancellable', trangThai: 'DaTiepDon' },
      D: { kind: 'NotFound' },
    });
    const summary = await new LeaveCancellationRunner(port).run(LEAVE, NOW);
    expect(summary).toEqual({
      hoanTat: true,
      daHuy: 2,
      daHuyTruocDo: 1,
      khongHuyDuoc: [{ maLichHen: 'C', trangThai: 'DaTiepDon' }],
    });
  });

  it('PD-08 biên: không có lịch bị ảnh hưởng ⇒ hoàn tất, mọi số đếm 0, không gọi cancel', async () => {
    const { port, cancelCalls } = fakePort([]);
    expect(await new LeaveCancellationRunner(port).run(LEAVE, NOW)).toEqual({
      hoanTat: true,
      daHuy: 0,
      daHuyTruocDo: 0,
      khongHuyDuoc: [],
    });
    expect(cancelCalls).toEqual([]);
  });

  it('PD-10 một lịch ném lỗi: các lịch còn lại VẪN được huỷ, hoanTat = false; log chỉ có số đếm, không mã lịch hay chữ của lỗi', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const { port, cancelCalls } = fakePort(['A', 'B', 'C'], { B: boom });
    const summary = await new LeaveCancellationRunner(port).run(LEAVE, NOW);
    expect(cancelCalls).toEqual(['A', 'B', 'C']);
    expect(summary).toEqual({
      hoanTat: false,
      daHuy: 2,
      daHuyTruocDo: 0,
      khongHuyDuoc: [],
    });
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('1/3');
    expect(message).not.toContain('CLX');
    expect(message).not.toContain('Nguyễn');
    expect(message).not.toMatch(/\bB\b/);
  });

  it('PD-10 tìm lịch bị ảnh hưởng ném lỗi ⇒ không ném ra ngoài, hoanTat = false, không huỷ gì', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const { port, cancelCalls } = fakePort(['A']);
    port.findAffected = async () => boom();
    expect(await new LeaveCancellationRunner(port).run(LEAVE, NOW)).toEqual({
      hoanTat: false,
      daHuy: 0,
      daHuyTruocDo: 0,
      khongHuyDuoc: [],
    });
    expect(cancelCalls).toEqual([]);
  });
});
