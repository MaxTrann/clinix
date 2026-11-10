import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import {
  NoopAppointmentNotifier,
  type AppointmentNotifier,
} from './appointment-notifier.port.js';
import {
  NoopDoctorLeavePort,
  type DoctorLeavePort,
} from './doctor-leave.port.js';
import type { NoopPort } from './noop-warning.js';
import {
  NoopPaymentPort,
  NoopPaymentSummaryPort,
  type PaymentPort,
  type PaymentSummaryPort,
} from './payment.port.js';
import {
  NoopPendingBranchChangesPort,
  type PendingBranchChangesPort,
} from './pending-branch-changes.port.js';
import {
  NoopRefundPort,
  NoopWalletBalancePort,
  type RefundPort,
  type WalletBalancePort,
} from './wallet.port.js';
import { NoopWaitlistPort, type WaitlistPort } from './waitlist.port.js';

// Task P2 — CG-01 (PLAN booking 7.13; TRACKING 3.6 P2-C): bản `Noop` của TÁM cổng. Bản a: giá trị mặc định đúng bảng 5.10 B và không ghi gì vào DB;
// bản b: cảnh báo log đúng MỘT lần cho mỗi thể hiện và không có nội dung riêng tư. `EntityManager` là bản giả ghi lại mọi câu SQL.
const SENTINEL_ID = 'MA-RIENG-TU-7731';

interface Built {
  port: NoopPort;
  invoke: (em: EntityManager, tag: string) => Promise<unknown>;
}
interface NoopCase {
  name: string;
  build: () => Built;
  expected: unknown;
}

const CASES: NoopCase[] = [
  {
    name: 'PaymentPort.recordZeroPayment',
    expected: undefined,
    build: () => {
      const port = new NoopPaymentPort();
      const asPort: PaymentPort = port;
      return {
        port,
        invoke: (em, tag) =>
          asPort.recordZeroPayment(em, { lichHenId: tag, benhNhanId: tag }),
      };
    },
  },
  {
    name: 'PaymentSummaryPort.amountPaid',
    expected: '0.00',
    build: () => {
      const port = new NoopPaymentSummaryPort();
      const asPort: PaymentSummaryPort = port;
      return { port, invoke: (em, tag) => asPort.amountPaid(em, tag) };
    },
  },
  {
    name: 'PaymentSummaryPort.remainingToCollect',
    expected: '350000.00',
    build: () => {
      const port = new NoopPaymentSummaryPort();
      const asPort: PaymentSummaryPort = port;
      return { port, invoke: (em, tag) => asPort.remainingToCollect(em, tag) };
    },
  },
  {
    name: 'RefundPort.refund',
    expected: { kind: 'NotNeeded' },
    build: () => {
      const port = new NoopRefundPort();
      const asPort: RefundPort = port;
      return {
        port,
        invoke: (_em, tag) =>
          asPort.refund({ lichHenId: tag, soTien: '1.00', lyDo: tag }),
      };
    },
  },
  {
    name: 'WalletBalancePort.available',
    expected: null,
    build: () => {
      const port = new NoopWalletBalancePort();
      const asPort: WalletBalancePort = port;
      return { port, invoke: (_em, tag) => asPort.available(tag) };
    },
  },
  {
    name: 'WaitlistPort.onSlotReleased',
    expected: undefined,
    build: () => {
      const port = new NoopWaitlistPort();
      const asPort: WaitlistPort = port;
      return { port, invoke: (_em, tag) => asPort.onSlotReleased(tag) };
    },
  },
  {
    name: 'DoctorLeavePort.findBlockingLeave',
    expected: null,
    build: () => {
      const port = new NoopDoctorLeavePort();
      const asPort: DoctorLeavePort = port;
      return {
        port,
        invoke: (em, tag) =>
          asPort.findBlockingLeave(em, {
            bacSiId: tag,
            ngay: '2026-12-01',
            ca: 'CaSang',
          }),
      };
    },
  },
  {
    name: 'PendingBranchChangesPort.findBlocking',
    expected: null,
    build: () => {
      const port = new NoopPendingBranchChangesPort();
      const asPort: PendingBranchChangesPort = port;
      return {
        port,
        invoke: (em, tag) =>
          asPort.findBlocking(em, {
            chiNhanhId: tag,
            ngayGio: new Date('2026-12-01T01:00:00.000Z'),
            thoiLuongPhut: 30,
            dichVuKhamId: tag,
          }),
      };
    },
  },
  {
    name: 'AppointmentNotifier.notify',
    expected: undefined,
    build: () => {
      const port = new NoopAppointmentNotifier();
      const asPort: AppointmentNotifier = port;
      return {
        port,
        invoke: (em, tag) =>
          asPort.notify(em, {
            loaiSuKien: 'LichHenDaXacNhan',
            lichHenId: tag,
            taiKhoanId: tag,
          }),
      };
    },
  },
];

/** Ca không kiểm log thì tắt logger để cảnh báo thật không tràn ra màn hình. */
const silent = (built: Built): Built => {
  built.port.logger = { warn: vi.fn() };
  return built;
};

function fakeEntityManager() {
  const query = vi.fn().mockResolvedValue([{ giaSnapshot: '350000.00' }]);
  return { em: { query } as unknown as EntityManager, query };
}

describe('CG-01a Noop mặc định: không chặn, không ghi', () => {
  it.each(CASES)(
    '$name trả giá trị mặc định của 5.10 B',
    async ({ build, expected }) => {
      const { em } = fakeEntityManager();
      await expect(silent(build()).invoke(em, SENTINEL_ID)).resolves.toEqual(
        expected,
      );
    },
  );

  it('chỉ remainingToCollect đọc DB: một SELECT thường, không khoá; bảy cổng kia không gọi SQL nào', async () => {
    for (const { name, build } of CASES) {
      const { em, query } = fakeEntityManager();
      await silent(build()).invoke(em, SENTINEL_ID);
      if (name === 'PaymentSummaryPort.remainingToCollect') {
        expect(query).toHaveBeenCalledTimes(1);
        const sql = String(query.mock.calls[0]?.[0]);
        expect(sql).toMatch(/^\s*SELECT\b/i);
        expect(sql).not.toMatch(/\bFOR\s+(UPDATE|SHARE)\b/i);
        expect(query.mock.calls[0]?.[1]).toEqual([SENTINEL_ID]);
      } else expect(query).not.toHaveBeenCalled();
    }
  });

  it('remainingToCollect: lịch không tồn tại ⇒ ném lỗi lập trình (người gọi phải khoá lịch trước)', async () => {
    const em = {
      query: vi.fn().mockResolvedValue([]),
    } as unknown as EntityManager;
    const port = new NoopPaymentSummaryPort();
    port.logger = { warn: vi.fn() };
    await expect(port.remainingToCollect(em, '1')).rejects.toThrow(
      /lịch hẹn không tồn tại/,
    );
  });
});

describe('CG-01b Noop cảnh báo đúng một lần, không nội dung riêng tư', () => {
  it.each(CASES)(
    '$name: gọi nhiều lần ⇒ đúng một cảnh báo; thể hiện mới cảnh báo lại',
    async ({ build }) => {
      const { em } = fakeEntityManager();
      const first = build();
      const warn = vi.fn();
      first.port.logger = { warn };
      await first.invoke(em, `${SENTINEL_ID}-1`);
      await first.invoke(em, `${SENTINEL_ID}-2`);
      await first.invoke(em, `${SENTINEL_ID}-3`);
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]?.[0]);
      expect(message).toMatch(/Noop/);
      expect(message).not.toContain('MA-RIENG-TU');

      const second = build();
      const warnAgain = vi.fn();
      second.port.logger = { warn: warnAgain };
      await second.invoke(em, SENTINEL_ID);
      expect(warnAgain).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);
    },
  );

  it('mỗi cổng có câu cảnh báo riêng, cố định (không tham số)', async () => {
    const messages = new Set<string>();
    for (const { build } of CASES) {
      const { em } = fakeEntityManager();
      const built = build();
      const warn = vi.fn();
      built.port.logger = { warn };
      await built.invoke(em, SENTINEL_ID);
      await built.invoke(em, 'KHAC');
      messages.add(String(warn.mock.calls[0]?.[0]));
    }
    // 9 phương thức nhưng chỉ 8 lớp: hai phương thức của PaymentSummaryPort dùng chung một câu
    expect(messages.size).toBe(8);
  });

  it('logger mặc định là Logger của Nest (thuộc tính lớp, không phải tham số constructor)', () => {
    const port = new NoopPaymentPort();
    expect(typeof port.logger.warn).toBe('function');
    expect(NoopPaymentPort.length).toBe(0);
  });
});
