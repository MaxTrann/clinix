import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  cashRows,
  cashWorld,
  stateOf,
} from '../../payment/testing/cash-stack.js';
import { WalletFixtures } from '../../wallet/testing/wallet-fixtures.js';
import { assertWalletInvariants } from '../../wallet/testing/wallet-invariants.js';
import { AppointmentsModule } from '../appointments.module.js';
import { AppointmentCancellationService } from '../cancel/appointment-cancellation.service.js';
import {
  PAYMENT_SUMMARY_PORT,
  type PaymentSummaryPort,
} from '../ports/payment.port.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import {
  cancelInput,
  DEPOSIT,
  REFUND_POLICY,
  setRefundPolicy,
} from '../testing/cancel-world.js';
import {
  assertBookingInvariants,
  assertRescheduleInvariants,
  captureMoneyTotals,
} from '../testing/invariants.js';
import { IN_WINDOW } from '../testing/status-world.js';
import { AppointmentRescheduleService } from './appointment-reschedule.service.js';
import type { RescheduleInput, RescheduleOutcome } from './reschedule.types.js';

// reschedule B4 — đổi lịch với ví, thanh toán, thu tiền mặt và hoàn tiền THẬT trên MySQL 8.4 THẬT (PLAN reschedule 5.9, 7.2, 7.9; TRACKING reschedule 1.7): DLH-02, DLH-16, HDL-03, HDL-04. `AppointmentRescheduleService` và
// `AppointmentCancellationService` lấy từ `AppointmentsModule` THẬT (`DataSource` cấp bằng `useMocker`), nên `PAYMENT_SUMMARY_PORT` là `PaymentSummaryReader`, `REFUND_PORT` là `RefundService`, thông báo là `BookingNotifier`: bắt được cả
// lỗi nối dây module (B4 đăng ký hai provider) lẫn lỗi ngữ nghĩa giữa booking, payment và wallet. Đổi lịch KHÔNG tạo giao dịch, KHÔNG chuyển tiền: mọi khoản tiền vẫn trỏ LỊCH GỐC. Thế giới là `cashWorld` của payment B6 (Lễ tân,
// ví, thu tiền mặt thật); khung giờ số i bắt đầu 08:00 + 30 phút × i ngày 10/11/2026; đồng hồ giả mặc định 08:00 ngày 02/11/2026. Mọi dữ liệu là giả.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

let moduleRef: TestingModule | undefined;
afterEach(async () => {
  await moduleRef?.close();
  moduleRef = undefined;
});

/** `AppointmentsModule` THẬT; `DataSource` của DB test cấp bằng `useMocker`. Danh sách chờ vẫn là bản `Noop` thật của module. */
async function openModule(): Promise<void> {
  moduleRef = await Test.createTestingModule({ imports: [AppointmentsModule] })
    .useMocker((token) => (token === DataSource ? db : undefined))
    .compile();
}
const inModule = <T>(token: unknown): T =>
  (moduleRef as TestingModule).get<T>(token as never, { strict: false });
const rescheduleService = () =>
  inModule<AppointmentRescheduleService>(AppointmentRescheduleService);

const world = async () => {
  const w = await cashWorld(db, fx);
  // `fx.world()` ghi cấu hình mặc định (tối đa 0 lần tự đổi): đặt 2 để Bệnh nhân tự đổi được (cửa sổ tiếp đón 30 và 15 phút giữ nguyên)
  await fx.systemConfig({ soLanTuDoiLichToiDa: 2 });
  await openModule();
  return w;
};
type World = Awaited<ReturnType<typeof world>>;

const slotRef = (w: World, index: number) => w.slotId(index);

const doiHo = (w: World, maLichHen: string, to: number): RescheduleInput => ({
  maLichHen,
  khungGioMoiId: slotRef(w, to),
  actor: { via: 'DoiHo', chiNhanhId: w.branch.chiNhanhId },
  lyDo: 'Bệnh nhân gọi điện xin dời lịch',
  afterWrite: () => Promise.resolve(),
});

const tuDoi = (w: World, maLichHen: string, to: number): RescheduleInput => ({
  maLichHen,
  khungGioMoiId: slotRef(w, to),
  actor: { via: 'TuDoi', accountId: w.patientId },
});

function rescheduled(outcome: RescheduleOutcome) {
  if (outcome.kind !== 'Rescheduled')
    throw new Error(`phải Rescheduled, nhận ${JSON.stringify(outcome)}`);
  return outcome;
}

const idOf = async (maLichHen: string): Promise<string> =>
  (
    (await db.query(
      'SELECT CAST(lich_hen_id AS CHAR) AS id FROM lich_hen WHERE ma_lich_hen = ?',
      [maLichHen],
    )) as { id: string }[]
  )[0]!.id;

/** Tiền của lịch qua ba hàm của `PaymentSummaryPort` thật (đọc bằng `em` thường). */
const moneyOf = async (lichHenId: string) => {
  const port = inModule<PaymentSummaryPort>(PAYMENT_SUMMARY_PORT);
  return {
    amountPaid: await port.amountPaid(db.manager, lichHenId),
    remainingToCollect: await port.remainingToCollect(db.manager, lichHenId),
    amountRefundable: await port.amountRefundable(db.manager, lichHenId),
  };
};

/** Mọi lỗi sổ ví và bất biến booking và đổi lịch. */
const settled = async (
  moneyBefore?: Awaited<ReturnType<typeof captureMoneyTotals>>,
) => {
  await assertBookingInvariants(db);
  await assertRescheduleInvariants(
    db,
    moneyBefore === undefined ? {} : { moneyBefore },
  );
  await assertWalletInvariants(db);
};

describe('DLH-02 đổi lịch cọc > 0 đã trả bằng ví (lớp thật)', () => {
  it('KHÔNG hàng mới ở giao_dich_thanh_toan, giao_dich_vi, lich_su_hoan_tien; số tiền của lịch MỚI truy về lịch gốc: đã trả = cọc gốc, còn phải thu = giá − cọc, còn hoàn được = cọc', async () => {
    const w = await world();
    const root = await w.appointment(1, { coc: '100000.00' });
    const money = await captureMoneyTotals(db);

    const outcome = rescheduled(
      await rescheduleService().reschedule(tuDoi(w, root.maLichHen, 0)),
    );

    const newId = await idOf(outcome.maLichHenMoi);
    expect(await moneyOf(newId)).toEqual({
      amountPaid: '100000.00',
      remainingToCollect: '200000.00',
      amountRefundable: '100000.00',
    });
    expect(await moneyOf(root.lichHenId)).toEqual(await moneyOf(newId));
    await settled(money);
  });
});

describe('HDL-03 thu tiền mặt và tổng tiền trên chuỗi 2 và 3 lịch do DỊCH VỤ tạo', () => {
  it.each([
    ['chuỗi 2 lịch', [1, 0]],
    ['chuỗi 3 lịch', [2, 1, 0]],
  ])(
    '%s: cọc trả ở lịch gốc; thu tiền mặt ở lịch CUỐI ghi lich_hen_id = lịch GỐC, còn phải thu tính theo cả chuỗi; đổi lịch không đổi tiền (INV-10)',
    async (_name, slots) => {
      const w = await world();
      const root = await w.appointment(slots[0]!, { coc: '100000.00' });
      const money = await captureMoneyTotals(db);
      let code = root.maLichHen;
      for (const to of slots.slice(1))
        code = rescheduled(
          await rescheduleService().reschedule(doiHo(w, code, to)),
        ).maLichHenMoi;
      const tailId = await idOf(code);
      await settled(money);
      expect(await moneyOf(tailId)).toEqual({
        amountPaid: '100000.00',
        remainingToCollect: '200000.00',
        amountRefundable: '100000.00',
      });

      // Thu tiền mặt tại quầy ở lịch CUỐI, trong cửa sổ tiếp đón của nó (08:00 ngày 10/11)
      vi.setSystemTime(IN_WINDOW);
      const result = await w.service.collect(w.receptionId, code, '200000');

      expect(result.phieuThu).toMatchObject({
        daThanhToanTruoc: '100000.00',
        thuTaiQuay: '200000.00',
      });
      const rows = await cashRows(db);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.lichHenId).toBe(root.lichHenId);
      expect(await stateOf(db, tailId)).toBe('DaTiepDon');
      expect(await moneyOf(tailId)).toEqual({
        amountPaid: '300000.00',
        remainingToCollect: '0.00',
        amountRefundable: '100000.00',
      });
      await settled();
    },
  );
});

describe('DLH-16, HDL-04 huỷ lịch MỚI sau đổi (cọc > 0 trả bằng ví, lớp thật): hoàn theo giờ hẹn MỚI, dưới khoản của lịch gốc, không hoàn hai lần', () => {
  it('lịch cũ còn 1 giờ (bậc hoàn 0%) đổi sang tuần sau rồi huỷ lịch mới: hoàn 100% theo giờ MỚI (kẽ hở R3 có chủ ý, Q3), đúng MỘT dòng hoàn dưới khoản của lịch GỐC, ví +cọc, thông báo hoàn trỏ lịch CUỐI; lần huỷ thứ hai và mã cũ đều không hoàn thêm', async () => {
    const w = await world();
    const nextWeek = await fx.doctor.shiftWithSlots(w.doctor.profile, {
      ngay: '2026-11-17',
      ca: 'CaSang',
    });
    // Lịch đệm: lich_hen_id và khung_gio_id cùng bắt đầu từ 1 sau TRUNCATE nên che đột biến "nhầm id" (TRACKING booking 3.48.5)
    await w.booked('DaHuy', 7);
    const root = await w.appointment(0, { coc: DEPOSIT });
    await setRefundPolicy(db, root.lichHenId, REFUND_POLICY);
    const wallets = new WalletFixtures(db);
    const walletId = w.walletId;
    const payment = (
      (await db.query(
        "SELECT CAST(giao_dich_thanh_toan_id AS CHAR) AS id FROM giao_dich_thanh_toan WHERE lich_hen_id = ? AND loai = 'ThanhToanLichHen'",
        [root.lichHenId],
      )) as { id: string }[]
    )[0]!.id;
    vi.setSystemTime(new Date('2026-11-10T07:00:00+07:00'));

    const outcome = rescheduled(
      await rescheduleService().reschedule({
        maLichHen: root.maLichHen,
        khungGioMoiId: nextWeek.slotIds[0]!,
        actor: { via: 'TuDoi', accountId: w.patientId },
      }),
    );
    const cancelled = await inModule<AppointmentCancellationService>(
      AppointmentCancellationService,
    ).cancel(cancelInput(w, 'BenhNhan', outcome.maLichHenMoi));

    expect(cancelled).toStrictEqual({
      kind: 'Cancelled',
      maLichHen: outcome.maLichHenMoi,
      hoanCoc: { tyLe: 100, soTien: DEPOSIT },
    });
    const refunds = (await db.query(
      `SELECT CAST(giao_dich_thanh_toan_id AS CHAR) AS paymentId, CAST(so_tien AS CHAR) AS soTien, trang_thai AS trangThai
       FROM lich_su_hoan_tien ORDER BY lich_su_hoan_tien_id`,
    )) as { paymentId: string; soTien: string; trangThai: string }[];
    expect(refunds).toEqual([
      { paymentId: payment, soTien: DEPOSIT, trangThai: 'ThanhCong' },
    ]);
    expect((await wallets.readWallet(walletId)).soDu).toBe(DEPOSIT);
    const notices = (await db.query(
      `SELECT loai_su_kien AS loai, CAST(lich_hen_id AS CHAR) AS lichHenId FROM thong_bao WHERE loai_su_kien = 'HoanCocThanhCong'`,
    )) as { loai: string; lichHenId: string }[];
    expect(notices).toEqual([
      { loai: 'HoanCocThanhCong', lichHenId: await idOf(outcome.maLichHenMoi) },
    ]);

    const again = await inModule<AppointmentCancellationService>(
      AppointmentCancellationService,
    ).cancel(cancelInput(w, 'BenhNhan', outcome.maLichHenMoi));
    const oldCode = await inModule<AppointmentCancellationService>(
      AppointmentCancellationService,
    ).cancel(cancelInput(w, 'BenhNhan', root.maLichHen));

    expect(again.kind).toBe('AlreadyCancelled');
    expect(oldCode.kind).not.toBe('Cancelled');
    expect((await wallets.readWallet(walletId)).soDu).toBe(DEPOSIT);
    expect(await db.query('SELECT 1 FROM lich_su_hoan_tien')).toHaveLength(1);
    await settled();
  });
});
