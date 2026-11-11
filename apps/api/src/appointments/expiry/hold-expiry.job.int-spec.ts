import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  deriveSlotStatus,
  type StoredSlotStatus,
} from '../../scheduling/slots/slot-status.rules.js';
import {
  HOLD_EXPIRED_CANCEL_REASON,
  HOLD_EXPIRY_CRON,
  HOLD_EXPIRY_JOB_NAME,
} from '../appointments.constants.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import { lockSlot, parseVnDateTime } from '../slots/slot-lock.js';
import type { ExpireOutcome } from '../state/appointment-transition.service.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { FLOW_NOW } from '../testing/booking-flow.js';
import {
  createGate,
  runRounds,
  summarize,
  withRowLock,
} from '../testing/concurrency-harness.js';
import {
  bulkSlots,
  createExpiryModule,
  createExpiryStack,
  expectStatus,
  expiryWorld,
  readAppointment,
  type AppointmentRow,
} from '../testing/expiry-fixtures.js';
import { FakeWaitlistPort } from '../testing/fake-ports.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import { HoldExpiryJob, type HoldExpirySummary } from './hold-expiry.job.js';

// Task B9 — HG-01…HG-10, DT-16 và DT-08 (một phần) (PLAN booking 7.2, 7.10, 7.26; TRACKING 3.19.3) trên MySQL 8.4 THẬT: `HoldExpiryJob.run(now)` quét `lich_hen` thật, hết hạn từng lịch bằng
// `AppointmentTransitionService.expire` (chuỗi khoá khung giờ rồi lịch), rồi chạy INV-01…INV-05. Cổng danh sách chờ là bản `Fake` đếm lời gọi. Phần ĐƠN VỊ (lô, con trỏ, trần lô, chống chạy chồng, log,
// metadata `@Cron`): hold-expiry.job.spec.ts (HXJ-01…HXJ-05, HG-09). `FLOW_NOW` là 09:00 ngày 02/11/2026: sau hạn 08:15 của lịch `ChoThanhToan` trong fixture, trước mọi khung giờ của ngày 10/11.
// Mọi ca truyền `now` tường minh vào `run(now)` (không giả đồng hồ).
const NOW_TEXT = '2026-11-02 09:00:00';
const ZERO: HoldExpirySummary = {
  expired: 0,
  notDue: 0,
  failed: 0,
  more: false,
};

let db: DataSource;
let fx: BookingFixtures;
let logs: string[];
useIntegrationHooks((d, l) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = l;
});

/** Lời cảnh báo 1213/1205 của `withBookingTransaction` (nó ghi MỘT cảnh báo mỗi lần thử lại): "0 lỗi 1213/1205" là danh sách này rỗng. */
const contentionWarnings = () => logs.filter((l) => /MySQL 12(13|05)/.test(l));

const count = async (sql: string, params: unknown[] = []): Promise<number> => {
  const rows: { n: string | number }[] = await db.query(sql, params);
  return Number(rows[0]?.n);
};

const resetAll = async () => {
  await db.query('DELETE FROM lich_hen');
  await db.query(
    "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL",
  );
};

describe('HG-01 job: lịch quá hạn bị huỷ, khung giờ trống, cổng một lần SAU commit, không thông báo (Q6)', () => {
  it('lịch ChoThanhToan hết hạn: DaHuy, thoi_diem_huy = now, ly_do_huy là chữ cố định, khung giờ ConTrong, onSlotReleased gọi đúng một lần và LÚC GỌI lịch đã DaHuy (sau commit)', async () => {
    const w = await expiryWorld(fx);
    const target = await w.pending(0);
    const { waitlist, job } = createExpiryStack(db);
    let seenAtCall: AppointmentRow | undefined;
    waitlist.onSlotReleasedCall.onCall(async () => {
      // đọc bằng KẾT NỐI KHÁC của pool: chỉ thấy `DaHuy` nếu giao dịch của job đã commit
      seenAtCall = await readAppointment(db, target.lichHenId);
    });

    await expect(job.run(FLOW_NOW)).resolves.toEqual({ ...ZERO, expired: 1 });

    expect(await readAppointment(db, target.lichHenId)).toEqual({
      trangThai: 'DaHuy',
      huy: NOW_TEXT,
      lyDo: 'Hết thời gian giữ chỗ',
      han: '2026-11-02 08:15:00',
    });
    expect(HOLD_EXPIRED_CANCEL_REASON).toBe('Hết thời gian giữ chỗ');
    await w.expectSlot(0, 'ConTrong');
    expect(waitlist.releasedSlotIds).toEqual([w.slotId(0)]);
    expect(seenAtCall?.trangThai).toBe('DaHuy');
    await assertBookingInvariants(db);
  });

  it('Q6: module Nest có đủ tám cổng Fake: AppointmentNotifier không được gọi lần nào và không có dòng thong_bao nào', async () => {
    const w = await expiryWorld(fx);
    await w.pending(0);
    const { moduleRef, ports, job } = await createExpiryModule(db);
    try {
      await expect(job.run(FLOW_NOW)).resolves.toEqual({ ...ZERO, expired: 1 });
      expect(ports.notifier.notifyCall.count).toBe(0);
      expect(ports.waitlist.releasedSlotIds).toEqual([w.slotId(0)]);
      expect(await count('SELECT COUNT(*) AS n FROM thong_bao')).toBe(0);
    } finally {
      await moduleRef.close();
    }
  });
});

describe('HG-02 biên nửa mở qua run(now)', () => {
  it('han_thanh_toan = now thì hết, now + 1 giây thì chưa; now có mili giây bị cắt xuống giây; đến now + 1 giây lịch còn lại mới hết', async () => {
    const w = await expiryWorld(fx);
    const atNow = await w.pending(0, new Date('2026-11-02T09:00:00+07:00'));
    const justAfter = await w.pending(1, new Date('2026-11-02T09:00:01+07:00'));
    const { job } = createExpiryStack(db);

    // 09:00:00.999 cắt xuống 09:00:00: lịch hạn 09:00:00 hết, lịch hạn 09:00:01 chưa
    await expect(
      job.run(new Date('2026-11-02T09:00:00.999+07:00')),
    ).resolves.toEqual({
      ...ZERO,
      expired: 1,
    });
    await expectStatus(db, atNow.lichHenId, 'DaHuy');
    await expectStatus(db, justAfter.lichHenId, 'ChoThanhToan');
    await w.expectSlot(1, 'DangGiuCho', '2026-11-02 09:00:01');

    await expect(
      job.run(new Date('2026-11-02T09:00:01+07:00')),
    ).resolves.toEqual({
      ...ZERO,
      expired: 1,
    });
    expect(await readAppointment(db, justAfter.lichHenId)).toMatchObject({
      trangThai: 'DaHuy',
      huy: '2026-11-02 09:00:01',
    });
    await assertBookingInvariants(db);
  });
});

describe('HG-03 job đọc ứng viên cũ rồi trạng thái đổi giữa chừng: NotDue, không đụng gì', () => {
  it('một lịch vừa được thanh toán (DaXacNhan), một lịch vừa bị Bệnh nhân huỷ: cả hai notDue, giữ nguyên trạng thái và lý do của bên kia, không gọi cổng', async () => {
    const w = await expiryWorld(fx);
    const paid = await w.pending(0);
    const userCancelled = await w.pending(1);
    const { waitlist, service, job } = createExpiryStack(db);
    const real = service.expire.bind(service);
    // job đã đọc CẢ HAI ứng viên; ngay trước khi `expire` của từng lịch chạy, bên kia đổi trạng thái (và khung giờ, như luồng thật)
    vi.spyOn(service, 'expire').mockImplementation(async (input) => {
      if (input.lichHenId === paid.lichHenId) {
        await db.query(
          "UPDATE lich_hen SET trang_thai = 'DaXacNhan', han_thanh_toan = NULL WHERE lich_hen_id = ?",
          [input.lichHenId],
        );
        await db.query(
          "UPDATE khung_gio SET trang_thai = 'DaDat', giu_cho_den = NULL WHERE khung_gio_id = ?",
          [w.slotId(0)],
        );
      } else {
        await db.query(
          "UPDATE lich_hen SET trang_thai = 'DaHuy', thoi_diem_huy = '2026-11-02 08:30:00', ly_do_huy = 'Bệnh nhân huỷ' WHERE lich_hen_id = ?",
          [input.lichHenId],
        );
        await db.query(
          "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL WHERE khung_gio_id = ?",
          [w.slotId(1)],
        );
      }
      return real(input);
    });

    await expect(job.run(FLOW_NOW)).resolves.toEqual({ ...ZERO, notDue: 2 });

    expect(await readAppointment(db, paid.lichHenId)).toMatchObject({
      trangThai: 'DaXacNhan',
      huy: null,
      lyDo: null,
    });
    await w.expectSlot(0, 'DaDat');
    expect(await readAppointment(db, userCancelled.lichHenId)).toMatchObject({
      trangThai: 'DaHuy',
      huy: '2026-11-02 08:30:00',
      lyDo: 'Bệnh nhân huỷ', // KHÔNG bị ghi đè bằng chữ hết hạn
    });
    await w.expectSlot(1, 'ConTrong');
    expect(waitlist.onSlotReleasedCall.count).toBe(0);
    await assertBookingInvariants(db);
  });
});

describe('HG-04 chạy job hai lần liên tiếp: lần hai không ghi gì (idempotent)', () => {
  it('lượt hai trả toàn 0; thoi_diem_huy, ly_do_huy và số lần gọi cổng không đổi', async () => {
    const w = await expiryWorld(fx);
    const a = await w.pending(0);
    const b = await w.pending(1);
    const { waitlist, job } = createExpiryStack(db);

    await expect(job.run(FLOW_NOW)).resolves.toEqual({ ...ZERO, expired: 2 });
    const after = [
      await readAppointment(db, a.lichHenId),
      await readAppointment(db, b.lichHenId),
    ];
    await expect(
      job.run(new Date('2026-11-02T09:30:00+07:00')),
    ).resolves.toEqual(ZERO);

    expect([
      await readAppointment(db, a.lichHenId),
      await readAppointment(db, b.lichHenId),
    ]).toEqual(after); // `thoi_diem_huy` vẫn 09:00:00, không bị lượt hai (09:30) ghi lại
    expect(after[0]?.huy).toBe(NOW_TEXT);
    expect(waitlist.onSlotReleasedCall.count).toBe(2);
    await assertBookingInvariants(db);
  });
});

describe('HG-05 hơn 100 lịch quá hạn: xử lý hết theo lô, con trỏ không bỏ sót hàng cùng hạn', () => {
  it('150 lịch CÙNG han_thanh_toan (biên lô 100 cắt giữa các hàng hoà): đủ 150 lịch DaHuy, 150 khung giờ ConTrong, mỗi khung giờ báo đúng một lần; lượt sau không còn gì', async () => {
    const w = await expiryWorld(fx);
    const slots = await bulkSlots(db, fx, w.doctor.profile, '2026-11-20', 150);
    for (const khungGioId of slots)
      await fx.appointmentIn('ChoThanhToan', {
        doctor: w.doctor.profile,
        khungGioId,
        patientId: w.patientId,
      });
    const { waitlist, job } = createExpiryStack(db);

    await expect(job.run(FLOW_NOW)).resolves.toEqual({ ...ZERO, expired: 150 });

    expect(
      await count(
        "SELECT COUNT(*) AS n FROM lich_hen WHERE trang_thai = 'DaHuy'",
      ),
    ).toBe(150);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM lich_hen WHERE trang_thai = 'ChoThanhToan'",
      ),
    ).toBe(0);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM khung_gio WHERE trang_thai = 'DangGiuCho'",
      ),
    ).toBe(0);
    expect([...waitlist.releasedSlotIds].sort()).toEqual([...slots].sort());
    await expect(job.run(FLOW_NOW)).resolves.toEqual(ZERO);
    await assertBookingInvariants(db);
  });
});

describe('HG-06 một lịch lỗi giữa lượt: hoàn tác riêng lịch đó, các lịch khác vẫn xử lý, job không ném', () => {
  it('ném (khung giờ lệch: lịch ChoThanhToan mà khung giờ đã ConTrong): Failed, lịch đó còn nguyên; hai lịch kia hết hạn; lượt sau lịch lỗi vẫn Failed và không chặn gì', async () => {
    const w = await expiryWorld(fx);
    const first = await w.pending(0);
    const broken = await w.pending(1);
    const third = await w.pending(2);
    // dữ liệu lệch có chủ đích (INV-02 vỡ): `release` không khớp ⇒ `releaseLapsed` ném ⇒ giao dịch hoàn tác cả `UPDATE lich_hen`
    await db.query(
      "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL WHERE khung_gio_id = ?",
      [w.slotId(1)],
    );
    const { waitlist, job } = createExpiryStack(db);

    await expect(job.run(FLOW_NOW)).resolves.toEqual({
      ...ZERO,
      expired: 2,
      failed: 1,
    });

    await expectStatus(db, first.lichHenId, 'DaHuy');
    await expectStatus(db, third.lichHenId, 'DaHuy');
    expect(await readAppointment(db, broken.lichHenId)).toMatchObject({
      trangThai: 'ChoThanhToan',
      huy: null,
      lyDo: null,
    });
    expect(waitlist.releasedSlotIds).toEqual([w.slotId(0), w.slotId(2)]);
    expect(
      logs.some(
        (line) =>
          line.includes(`lịch ${broken.lichHenId}`) && line.includes('(Error)'),
      ),
    ).toBe(true);

    // lượt sau: lịch lỗi vẫn là ứng viên và vẫn Failed, nhưng không còn gì khác bị chặn hay lặp
    await expect(job.run(FLOW_NOW)).resolves.toEqual({ ...ZERO, failed: 1 });
  });

  it('tranh chấp khoá thật (một giao dịch khác giữ khoá hàng lịch): 1205 sau 3 lần chạy ⇒ Failed Busy; lịch khác vẫn hết hạn; thả khoá thì lượt sau xử lý được lịch đó', async () => {
    const w = await expiryWorld(fx);
    const first = await w.pending(0);
    const locked = await w.pending(1);
    const third = await w.pending(2);
    const { waitlist, job } = createExpiryStack(db);

    const summary = await withRowLock(
      db,
      {
        sql: 'SELECT lich_hen_id FROM lich_hen WHERE lich_hen_id = ? FOR UPDATE',
        params: [locked.lichHenId],
      },
      () => job.run(FLOW_NOW),
    );

    expect(summary).toEqual({ ...ZERO, expired: 2, failed: 1 });
    await expectStatus(db, first.lichHenId, 'DaHuy');
    await expectStatus(db, third.lichHenId, 'DaHuy');
    await expectStatus(db, locked.lichHenId, 'ChoThanhToan');
    expect(waitlist.releasedSlotIds).toEqual([w.slotId(0), w.slotId(2)]);
    expect(
      logs.some(
        (line) =>
          line.includes(`lịch ${locked.lichHenId}`) && line.includes('Busy'),
      ),
    ).toBe(true);
    expect(contentionWarnings()).toHaveLength(3); // ba lần chạy: hai lần thử lại rồi hết lượt

    await expect(job.run(FLOW_NOW)).resolves.toEqual({ ...ZERO, expired: 1 });
    await assertBookingInvariants(db);
  });
});

describe('HG-07 và DT-16 hai bản job hết hạn cùng lúc (≥ 30 vòng): mỗi lịch hết hạn đúng một lần', () => {
  it('hai bản API (hai job, cờ running riêng, chung DB và bộ đếm cổng) cùng quét 6 lịch: tổng expired = 6, 0 failed, mỗi khung giờ báo đúng một lần, 0 lỗi 1213/1205, INV sau mỗi vòng', async () => {
    const w = await expiryWorld(fx);
    const lichPerRound = 6;
    const waitlist = new FakeWaitlistPort();
    const stacks = [
      createExpiryStack(db, waitlist),
      createExpiryStack(db, waitlist),
    ];
    const slotIds = Array.from({ length: lichPerRound }, (_, i) =>
      w.slotId(i),
    ).sort();

    const rounds = await runRounds({
      rounds: 30,
      setup: async () => {
        await resetAll();
        waitlist.onSlotReleasedCall.reset();
        for (let i = 0; i < lichPerRound; i += 1) await w.pending(i);
      },
      race: () => {
        const gate = createGate(stacks.length);
        return stacks.map(({ job }) => async () => {
          await gate.arrive();
          return job.run(FLOW_NOW);
        });
      },
      check: async (_context, results) => {
        const { values, reasons } = summarize(results);
        expect(reasons).toEqual([]);
        const summaries = values.filter(
          (v): v is HoldExpirySummary => v !== undefined,
        );
        expect(summaries).toHaveLength(2);
        expect(summaries.reduce((sum, s) => sum + s.expired, 0)).toBe(
          lichPerRound,
        );
        expect(summaries.reduce((sum, s) => sum + s.failed, 0)).toBe(0);
        expect(
          await count(
            "SELECT COUNT(*) AS n FROM lich_hen WHERE trang_thai = 'DaHuy'",
          ),
        ).toBe(lichPerRound);
        expect([...waitlist.releasedSlotIds].sort()).toEqual(slotIds);
        await assertBookingInvariants(db);
      },
    });

    expect(rounds).toHaveLength(30);
    expect(contentionWarnings()).toEqual([]);
  });
});

describe('HG-08 khung giờ đã qua khi hết hạn: khung giờ về ConTrong, KHÔNG gọi WaitlistPort', () => {
  it('giờ hẹn trước now và đúng bằng now (đã qua, Q5): không báo; giờ hẹn sau now: báo', async () => {
    const w = await expiryWorld(fx);
    // ô i bắt đầu 08:00 + 30 phút × i ngày 10/11: ô 0 (08:00), 1 (08:30), 2 (09:00 = now) đã qua, ô 3 (09:30) còn ở tương lai
    const now = new Date('2026-11-10T09:00:00+07:00');
    for (const slot of [0, 1, 2, 3]) await w.pending(slot);
    const { waitlist, job } = createExpiryStack(db);

    await expect(job.run(now)).resolves.toEqual({ ...ZERO, expired: 4 });

    for (const slot of [0, 1, 2, 3])
      expect(await w.slotState(slot)).toEqual({
        trangThai: 'ConTrong',
        giuChoDen: null,
      });
    expect(waitlist.releasedSlotIds).toEqual([w.slotId(3)]);
    await assertBookingInvariants(db);
  });
});

describe('HG-09 NODE_ENV=test: job không tự chạy; test gọi run(now) (phần tích hợp; phần nạp lại module theo NODE_ENV ở hold-expiry.job.spec.ts)', () => {
  it('module đang nạp có @Cron tắt đúng tên và biểu thức; run(now) chạy tay trên DB thật', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    const run: unknown = Reflect.get(HoldExpiryJob.prototype, 'run');
    const options = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      run as object,
    ) as {
      name: string;
      cronTime: string;
      disabled: boolean;
    };
    expect(options).toMatchObject({
      name: HOLD_EXPIRY_JOB_NAME,
      cronTime: HOLD_EXPIRY_CRON,
      disabled: true,
    });
    const w = await expiryWorld(fx);
    await w.pending(0);
    const { job } = createExpiryStack(db);
    await expect(job.run(FLOW_NOW)).resolves.toEqual({ ...ZERO, expired: 1 });
  });
});

describe('HG-10 khung giờ DangGiuCho quá giu_cho_den đọc ra ConTrong (Q3), trước và sau khi job chạy', () => {
  it('ô hết hạn: hàm thuần của doctor đọc ra ConTrong khi còn lưu DangGiuCho, và vẫn ConTrong sau khi job lưu ConTrong; ô còn hạn không đổi', async () => {
    const w = await expiryWorld(fx);
    await w.pending(3); // hạn 08:15: đã quá hạn so với FLOW_NOW
    await w.pending(4, new Date('2026-11-02T09:15:00+07:00')); // còn hạn
    const { job } = createExpiryStack(db);

    const view = async (slot: number) => {
      const rows: {
        ngayGio: string;
        trangThai: StoredSlotStatus;
        giuChoDen: string | null;
      }[] = await db.query(
        `SELECT DATE_FORMAT(ngay_gio, '%Y-%m-%d %H:%i:%s') AS ngayGio, trang_thai AS trangThai,
                DATE_FORMAT(giu_cho_den, '%Y-%m-%d %H:%i:%s') AS giuChoDen
           FROM khung_gio WHERE khung_gio_id = ?`,
        [w.slotId(slot)],
      );
      const row = rows[0];
      if (!row) throw new Error(`Không có khung giờ số ${slot}`);
      return {
        stored: row.trangThai,
        shown: deriveSlotStatus({
          ngayGio: parseVnDateTime(row.ngayGio),
          trangThai: row.trangThai,
          giuChoDen:
            row.giuChoDen === null ? null : parseVnDateTime(row.giuChoDen),
          now: FLOW_NOW,
        }),
      };
    };

    expect(await view(3)).toEqual({ stored: 'DangGiuCho', shown: 'ConTrong' });
    expect(await view(4)).toEqual({
      stored: 'DangGiuCho',
      shown: 'DangGiuCho',
    });
    await job.run(FLOW_NOW);
    expect(await view(3)).toEqual({ stored: 'ConTrong', shown: 'ConTrong' });
    expect(await view(4)).toEqual({
      stored: 'DangGiuCho',
      shown: 'DangGiuCho',
    });
    await assertBookingInvariants(db);
  });
});

describe('DT-08 (một phần, B9) job hết hạn đua với một thao tác huỷ cùng chuỗi khoá (≥ 30 vòng): đúng một bên thắng', () => {
  it('mỗi vòng: hoặc expire thắng (Expired, cổng một lần) hoặc huỷ giả thắng (expire NotDue NotPending, cổng 0 lần); không Failed, 0 lỗi 1213/1205, INV; phần `cancel` thật và "WaitlistPort một lần cho cả hai" thuộc B10', async () => {
    const w = await expiryWorld(fx);
    const { waitlist, service } = createExpiryStack(db);
    const holds = new SlotHoldService();
    type Raced =
      | { who: 'expire'; outcome: ExpireOutcome }
      | { who: 'cancel'; cancelled: boolean };

    // Huỷ giả của B10: đúng chuỗi khoá của bảng 5.3 (khung giờ FOR UPDATE rồi lịch FOR UPDATE theo khoá chính), `UPDATE` có điều kiện, rồi thả khung giờ
    const fakeCancel = (lichHenId: string): Promise<boolean> =>
      withBookingTransaction(
        db,
        async (em) => {
          const slot = await lockSlot(em, w.slotId(0));
          if (slot === null) throw new Error('khung giờ phải tồn tại');
          const rows: { trangThai: string }[] = await em.query(
            'SELECT trang_thai AS trangThai FROM lich_hen WHERE lich_hen_id = ? FOR UPDATE',
            [lichHenId],
          );
          if (rows[0]?.trangThai !== 'ChoThanhToan') return false;
          await em.query(
            "UPDATE lich_hen SET trang_thai = 'DaHuy', thoi_diem_huy = ?, ly_do_huy = 'Bệnh nhân huỷ' WHERE lich_hen_id = ? AND trang_thai = 'ChoThanhToan'",
            [FLOW_NOW, lichHenId],
          );
          const released = await holds.release(em, slot, {
            from: 'DangGiuCho',
            den: slot.giuChoDen,
          });
          if (released.kind !== 'Done')
            throw new Error('release phải Done dưới khoá');
          return true;
        },
        { label: 'fake-cancel' },
      );

    let expireWins = 0;
    let cancelWins = 0;
    await runRounds<{ lichHenId: string }, Raced>({
      rounds: 30,
      setup: async () => {
        await resetAll();
        waitlist.onSlotReleasedCall.reset();
        return { lichHenId: (await w.pending(0)).lichHenId };
      },
      race: ({ lichHenId }) => {
        const gate = createGate(2);
        return [
          async (): Promise<Raced> => {
            await gate.arrive();
            return {
              who: 'expire',
              outcome: await service.expire({ lichHenId, now: FLOW_NOW }),
            };
          },
          async (): Promise<Raced> => {
            await gate.arrive();
            return { who: 'cancel', cancelled: await fakeCancel(lichHenId) };
          },
        ];
      },
      check: async ({ lichHenId }, results) => {
        const { values, reasons } = summarize(results);
        expect(reasons).toEqual([]);
        const expired = values.find((v) => v.who === 'expire');
        const cancel = values.find((v) => v.who === 'cancel');
        if (expired?.who !== 'expire' || cancel?.who !== 'cancel')
          throw new Error('thiếu kết quả của một bên');
        const row = await readAppointment(db, lichHenId);
        if (expired.outcome.kind === 'Expired') {
          expireWins += 1;
          expect(cancel.cancelled).toBe(false);
          expect(row.lyDo).toBe('Hết thời gian giữ chỗ');
          expect(waitlist.onSlotReleasedCall.count).toBe(1);
        } else {
          cancelWins += 1;
          expect(expired.outcome).toEqual({
            kind: 'NotDue',
            reason: 'NotPending',
          });
          expect(cancel.cancelled).toBe(true);
          expect(row.lyDo).toBe('Bệnh nhân huỷ');
          expect(waitlist.onSlotReleasedCall.count).toBe(0);
        }
        expect(row.trangThai).toBe('DaHuy');
        expect(await w.slotState(0)).toEqual({
          trangThai: 'ConTrong',
          giuChoDen: null,
        });
        await assertBookingInvariants(db);
      },
    });

    expect(expireWins + cancelWins).toBe(30);
    expect(contentionWarnings()).toEqual([]);
  });
});
