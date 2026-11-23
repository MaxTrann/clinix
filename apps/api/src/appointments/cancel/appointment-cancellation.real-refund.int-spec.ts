import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { WalletLedger } from '../../wallet/ledger/wallet-ledger.js';
import { RefundRepository } from '../../wallet/refund/refund.queries.js';
import { RefundService } from '../../wallet/refund/refund.service.js';
import { WalletFixtures } from '../../wallet/testing/wallet-fixtures.js';
import { assertWalletInvariants } from '../../wallet/testing/wallet-invariants.js';
import { AppointmentsModule } from '../appointments.module.js';
import {
  BOOKING_NOTIFICATION_EVENTS,
  LEAVE_CANCEL_REASON,
  PATIENT_CANCEL_REASON,
} from '../appointments.constants.js';
import { WAITLIST_PORT } from '../ports/waitlist.port.js';
import { REFUND_PORT, type RefundPort } from '../ports/wallet.port.js';
import {
  HOUR_MS,
  DEPOSIT,
  REFUND_POLICY,
  atRemaining,
  cancelInput,
  cancelWorld,
  cancelledOutcome,
  type CancelRole,
  type CancelWorld,
} from '../testing/cancel-world.js';
import { readAppointment } from '../testing/expiry-fixtures.js';
import { FakeWaitlistPort } from '../testing/fake-ports.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import { db, fx, useStatusWorldHooks } from '../testing/status-int-kit.js';
import { AppointmentCancellationService } from './appointment-cancellation.service.js';

// payment B9 = booking B17a lần 2 (TRACKING booking 3.48; PLAN payment E4, E9, Q15, Q16; HDT-08, HCC-09) — HUỶ LỊCH với cổng hoàn tiền THẬT trên MySQL 8.4 THẬT. Mẫu: `payment-wallet.real-ports.int-spec.ts` (B7).
// Khác `appointment-cancellation.service.int-spec.ts` (cổng `Fake`, mức dịch vụ): ở đây `AppointmentCancellationService` lấy từ `AppointmentsModule` THẬT (`DataSource` thật qua `useMocker`), nên `REFUND_PORT` là `RefundService` của `WalletModule`,
// `PAYMENT_SUMMARY_PORT` là `PaymentSummaryReader`: bắt được cả lỗi nối dây lẫn lỗi ngữ nghĩa giữa booking (tính số hoàn) và wallet (thực hiện). Chỉ `WAITLIST_PORT` (còn `Noop`) có ca thay bằng `Fake` để đếm.
// Dữ liệu thanh toán là dòng THẬT do `WalletFixtures` chèn (khoản cọc qua ví nhất quán với sổ cái); booking chỉ ĐỌC lớp của `wallet` và `payment`, không sửa. Mã CRF-10…CRF-18 là `[đề xuất]` (đã `Grep` chưa dùng);
// CRF-01…CRF-05 ở các spec đơn vị. Mọi tiền và id là dữ liệu giả; đồng hồ giả của `useIntegrationHooks` (02/11/2026 08:00 giờ Việt Nam), khung giờ số 0 vào 10/11/2026 08:00 nên mặc định còn 192 giờ.
useStatusWorldHooks();

let moduleRef: TestingModule | undefined;
afterEach(async () => {
  await moduleRef?.close();
  moduleRef = undefined;
});

/** `AppointmentsModule` THẬT; `DataSource` của DB test cấp bằng `useMocker`; có thể thay danh sách chờ bằng bản `Fake` để đếm. */
async function openModule(waitlist?: FakeWaitlistPort): Promise<TestingModule> {
  const builder = Test.createTestingModule({ imports: [AppointmentsModule] });
  moduleRef = await (
    waitlist === undefined
      ? builder
      : builder.overrideProvider(WAITLIST_PORT).useValue(waitlist)
  )
    .useMocker((token) => (token === DataSource ? db : undefined))
    .compile();
  return moduleRef;
}

const inModule = <T>(token: unknown): T =>
  (moduleRef as TestingModule).get<T>(token as never, { strict: false });
const cancelService = () =>
  inModule<AppointmentCancellationService>(AppointmentCancellationService);
/** `RefundService.refund` THẬT, theo dõi (gọi qua): để đếm lần gọi và xem tham số. */
const spyRefund = () =>
  vi.spyOn(inModule<RefundService>(RefundService), 'refund');

// Lịch đệm: sau `resetTables` (TRUNCATE) bộ đếm tự tăng của `lich_hen` và `khung_gio` cùng bắt đầu từ 1, nên lịch đầu tiên ở khung giờ số 0 có `lich_hen_id` TRÙNG SỐ với `khung_gio_id` của nó. Trùng số làm đột biến
// "truyền `khungGioId` thay `lichHenId`" (RB-5, RB-9b ở TRACKING booking 3.48.5) SỐNG SÓT ở lớp tích hợp. Tạo một lịch `DaHuy` ở khung giờ cuối TRƯỚC lịch thật để hai id khác nhau; mọi ca dựng lịch thật gọi hàm này.
const withDecoy = async (w: CancelWorld): Promise<void> => {
  await w.booked('DaHuy', 7);
};

const walletIdOf = async (patientId: string): Promise<string> =>
  (
    (await db.query(
      'SELECT CAST(vi_noi_bo_id AS CHAR) AS id FROM vi_noi_bo WHERE benh_nhan_id = ?',
      [patientId],
    )) as { id: string }[]
  )[0]!.id;

/** Lịch ở `state`, khung giờ số `slot`, đã trả `soTien` (mặc định 100.000) bằng VÍ; ví về 0đ sau khi trừ cọc (nhất quán với sổ cái). */
async function walletPaid(
  w: CancelWorld,
  options: {
    state?: 'DaXacNhan' | 'DaTiepDon';
    slot?: number;
    soTien?: string;
    policy?: unknown;
  } = {},
) {
  await withDecoy(w);
  const lich = await w.booked(options.state ?? 'DaXacNhan', options.slot ?? 0, {
    coc: DEPOSIT,
    policy: options.policy ?? REFUND_POLICY,
  });
  expect(lich.lichHenId, 'id lịch phải khác id khung giờ').not.toBe(
    w.slotId(options.slot ?? 0),
  );
  const wallets = new WalletFixtures(db);
  const walletId = await walletIdOf(w.patientId);
  await wallets.setWallet(walletId, '0.00');
  const paymentId = await wallets.insertWalletDeposit({
    viNoiBoId: walletId,
    lichHenId: lich.lichHenId,
    soTien: options.soTien ?? DEPOSIT,
  });
  return { lich, wallets, walletId, paymentId };
}
type Paid = Awaited<ReturnType<typeof walletPaid>>;

const balance = async (x: Paid) =>
  (await x.wallets.readWallet(x.walletId)).soDu;
const refundRows = (paymentId: string) =>
  db.query(
    `SELECT loai, trang_thai AS trangThai, CAST(so_tien AS CHAR) AS soTien, ly_do AS lyDo, so_lan_thu AS soLanThu
     FROM lich_su_hoan_tien WHERE giao_dich_thanh_toan_id = ? ORDER BY so_lan_thu`,
    [paymentId],
  ) as Promise<
    {
      loai: string;
      trangThai: string;
      soTien: string;
      lyDo: string | null;
      soLanThu: number;
    }[]
  >;
const ledgerRefunds = (walletId: string) =>
  db.query(
    `SELECT CAST(so_tien AS CHAR) AS soTien, CAST(so_du_sau AS CHAR) AS soDuSau
     FROM giao_dich_vi WHERE vi_noi_bo_id = ? AND loai = 'HoanTien' ORDER BY giao_dich_vi_id`,
    [walletId],
  ) as Promise<{ soTien: string; soDuSau: string }[]>;
const notices = () =>
  db.query(
    'SELECT loai_su_kien AS loai, noi_dung AS noiDung FROM thong_bao ORDER BY thong_bao_id',
  ) as Promise<{ loai: string; noiDung: string }[]>;
const stateOf = async (lichHenId: string) =>
  (await readAppointment(db, lichHenId)).trangThai;

const REFUNDED_NOTICE = 'HoanCocThanhCong';

describe('CRF-10 ★ HL-10 với lớp thật: huỷ lịch cọc 100.000 trả bằng ví ⇒ ví tăng đúng, một dòng hoàn, một dòng sổ cái, findRefund đúng (HDT-08, CG-03)', () => {
  it('còn 192 giờ (mốc 24 ⇒ 100%): Cancelled, hoanCoc 100.000, refund đúng MỘT lần sau commit; ví +100.000; đúng một dòng lich_su_hoan_tien TuDong ThanhCong và một dòng giao_dich_vi HoanTien; thông báo huỷ rồi thông báo hoàn', async () => {
    const w = await cancelWorld(db, fx);
    const x = await walletPaid(w);
    await openModule();
    const refund = spyRefund();

    const outcome = await cancelService().cancel(
      cancelInput(w, 'BenhNhan', x.lich.maLichHen),
    );

    expect(outcome).toStrictEqual(
      cancelledOutcome(x.lich.maLichHen, { tyLe: 100, soTien: DEPOSIT }),
    );
    expect(refund.mock.calls).toEqual([
      [
        {
          lichHenId: x.lich.lichHenId,
          soTien: DEPOSIT,
          lyDo: PATIENT_CANCEL_REASON,
        },
      ],
    ]);
    expect(await stateOf(x.lich.lichHenId)).toBe('DaHuy');
    await w.expectSlot(0, 'ConTrong');
    expect(await balance(x)).toBe(DEPOSIT);
    expect(await refundRows(x.paymentId)).toEqual([
      {
        loai: 'TuDong',
        trangThai: 'ThanhCong',
        soTien: DEPOSIT,
        lyDo: PATIENT_CANCEL_REASON,
        soLanThu: 1,
      },
    ]);
    expect(await ledgerRefunds(x.walletId)).toEqual([
      { soTien: DEPOSIT, soDuSau: DEPOSIT },
    ]);
    expect((await notices()).map((n) => n.loai)).toEqual([
      BOOKING_NOTIFICATION_EVENTS.CANCELLED,
      REFUNDED_NOTICE,
    ]);
    // findRefund QUA TOKEN (cùng cổng mà chi tiết lịch của Bệnh nhân gọi): đúng ba khoá, không lộ id ví hay số lần thử
    const view = await inModule<RefundPort>(REFUND_PORT).findRefund(
      db.manager,
      x.lich.lichHenId,
    );
    expect(view).toEqual({
      soTien: DEPOSIT,
      trangThai: 'ThanhCong',
      thoiDiem: expect.any(String),
    });
    expect(Object.keys(view ?? {}).sort()).toEqual([
      'soTien',
      'thoiDiem',
      'trangThai',
    ]);
    await assertBookingInvariants(db);
    await assertWalletInvariants(db);
  });
});

// Mỗi dòng: còn bao lâu tới giờ hẹn, chính sách của snapshot, số hoàn mong đợi (null ⇒ `{ 0, '0.00' }`, không gọi `refund`)
const TIER_CASES: [string, number, unknown, string | null][] = [
  [
    'còn 60 giờ, snapshot mốc 48 giờ 100%',
    60 * HOUR_MS,
    [
      { so_gio_truoc_toi_thieu: 48, ty_le_hoan: 100 },
      { so_gio_truoc_toi_thieu: 0, ty_le_hoan: 0 },
    ],
    '100000.00',
  ],
  [
    'còn 30 giờ, snapshot mốc 48 giờ 100% (30 < 48 ⇒ 0%, không phải chính sách mặc định 100%)',
    30 * HOUR_MS,
    [
      { so_gio_truoc_toi_thieu: 48, ty_le_hoan: 100 },
      { so_gio_truoc_toi_thieu: 0, ty_le_hoan: 0 },
    ],
    null,
  ],
  ['còn 5 giờ, mốc 2 giờ 50%', 5 * HOUR_MS, REFUND_POLICY, '50000.00'],
  ['còn 1 giờ, ngoài mọi bậc có hoàn', HOUR_MS, REFUND_POLICY, null],
  ['đã quá giờ hẹn 1 giờ', -HOUR_MS, REFUND_POLICY, null],
];

describe('CRF-11 ba bậc theo snapshot của lịch, với lớp thật (CNL-07, CNL-11): số hoàn 0 KHÔNG gọi refund, ví và sổ không đổi', () => {
  it.each(TIER_CASES)(
    '%s',
    async (_name, remainingMs, policy, expectedRefund) => {
      const w = await cancelWorld(db, fx);
      const x = await walletPaid(w, { policy });
      atRemaining(remainingMs);
      await openModule();
      const refund = spyRefund();

      const outcome = await cancelService().cancel(
        cancelInput(w, 'BenhNhan', x.lich.maLichHen),
      );

      expect(await stateOf(x.lich.lichHenId)).toBe('DaHuy');
      if (expectedRefund === null) {
        expect(outcome).toMatchObject({
          kind: 'Cancelled',
          hoanCoc: { tyLe: 0, soTien: '0.00' },
        });
        expect(refund).not.toHaveBeenCalled();
        expect(await refundRows(x.paymentId)).toEqual([]);
        expect(await ledgerRefunds(x.walletId)).toEqual([]);
        expect(await balance(x)).toBe('0.00');
      } else {
        expect(outcome).toMatchObject({
          kind: 'Cancelled',
          hoanCoc: { soTien: expectedRefund },
        });
        expect(refund).toHaveBeenCalledTimes(1);
        expect(refund.mock.calls[0]?.[0].soTien).toBe(expectedRefund);
        expect(await balance(x)).toBe(expectedRefund);
        expect(await refundRows(x.paymentId)).toHaveLength(1);
      }
      await assertWalletInvariants(db);
    },
  );
});

describe('CRF-12 ★ HL-11 và HCC-09 qua cancel THẬT: lỗi hoàn KHÔNG hoàn tác việc huỷ; ghi dòng ThatBai để thử lại; HL-12 vẫn mời danh sách chờ', () => {
  it('ép WalletLedger.credit ném lỗi giả: Cancelled, lịch DaHuy, khung giờ ConTrong, ví KHÔNG đổi, đúng MỘT dòng ThatBai mang so_tien và ly_do, KHÔNG dòng sổ cái, thông báo huỷ còn, không thông báo hoàn; danh sách chờ vẫn được báo đúng một lần', async () => {
    const w = await cancelWorld(db, fx);
    const x = await walletPaid(w);
    const waitlist = new FakeWaitlistPort();
    await openModule(waitlist);
    vi.spyOn(inModule<WalletLedger>(WalletLedger), 'credit').mockRejectedValue(
      new Error('lỗi giả khi cộng ví'),
    );

    const outcome = await cancelService().cancel(
      cancelInput(w, 'BenhNhan', x.lich.maLichHen),
    );

    expect(outcome).toStrictEqual(
      cancelledOutcome(x.lich.maLichHen, { tyLe: 100, soTien: DEPOSIT }),
    );
    expect(await stateOf(x.lich.lichHenId)).toBe('DaHuy');
    await w.expectSlot(0, 'ConTrong');
    expect(await balance(x)).toBe('0.00');
    expect(await refundRows(x.paymentId)).toEqual([
      {
        loai: 'TuDong',
        trangThai: 'ThatBai',
        soTien: DEPOSIT,
        lyDo: PATIENT_CANCEL_REASON,
        soLanThu: 1,
      },
    ]);
    expect(await ledgerRefunds(x.walletId)).toEqual([]);
    expect((await notices()).map((n) => n.loai)).toEqual([
      BOOKING_NOTIFICATION_EVENTS.CANCELLED,
    ]);
    const view = await inModule<RefundPort>(REFUND_PORT).findRefund(
      db.manager,
      x.lich.lichHenId,
    );
    expect(view).toMatchObject({ soTien: DEPOSIT, trangThai: 'ThatBai' });
    expect(waitlist.releasedSlotIds).toEqual([w.slotId(0)]);
    await assertBookingInvariants(db);
    await assertWalletInvariants(db);
  });
});

describe('CRF-13 giới hạn Q16 phương án (d), TECH_DEBT 163, HCC-14: câu đọc ĐẦU của refund (ngoài try) lỗi ⇒ huỷ vẫn thành công nhưng KHÔNG để lại dấu vết hoàn', () => {
  it('RefundRepository.findWalletPaymentOfRoot ném: cancel vẫn Cancelled (không ném ra ngoài), lịch DaHuy, không dòng lich_su_hoan_tien nào, ví không đổi', async () => {
    const w = await cancelWorld(db, fx);
    const x = await walletPaid(w);
    await openModule();
    vi.spyOn(
      inModule<RefundRepository>(RefundRepository),
      'findWalletPaymentOfRoot',
    ).mockRejectedValue(new Error('đọc khoản thanh toán lỗi'));

    await expect(
      cancelService().cancel(cancelInput(w, 'BenhNhan', x.lich.maLichHen)),
    ).resolves.toMatchObject({ kind: 'Cancelled' });

    expect(await stateOf(x.lich.lichHenId)).toBe('DaHuy');
    expect(await refundRows(x.paymentId)).toEqual([]);
    expect(await ledgerRefunds(x.walletId)).toEqual([]);
    expect(await balance(x)).toBe('0.00');
    await assertBookingInvariants(db);
  });
});

describe('CRF-14 HL-06 với lớp thật: huỷ hai lần không hoàn hai lần (DT-07, HCC-03)', () => {
  it('tuần tự: lần hai AlreadyCancelled, refund vẫn MỘT lần, ví +100.000 một lần', async () => {
    const w = await cancelWorld(db, fx);
    const x = await walletPaid(w);
    await openModule();
    const refund = spyRefund();
    const input = cancelInput(w, 'BenhNhan', x.lich.maLichHen);

    await expect(cancelService().cancel(input)).resolves.toMatchObject({
      kind: 'Cancelled',
    });
    await expect(cancelService().cancel(input)).resolves.toMatchObject({
      kind: 'AlreadyCancelled',
    });

    expect(refund).toHaveBeenCalledTimes(1);
    expect(await balance(x)).toBe(DEPOSIT);
    expect(await refundRows(x.paymentId)).toHaveLength(1);
    expect(await ledgerRefunds(x.walletId)).toHaveLength(1);
  });

  it('đồng thời: hai cancel cùng lúc ⇒ đúng một Cancelled và một AlreadyCancelled; refund một lần; ví cộng đúng một lần; bất biến giữ', async () => {
    const w = await cancelWorld(db, fx);
    const x = await walletPaid(w);
    await openModule();
    const refund = spyRefund();
    const input = cancelInput(w, 'BenhNhan', x.lich.maLichHen);

    const results = await Promise.all([
      cancelService().cancel(input),
      cancelService().cancel(input),
    ]);

    expect(results.map((r) => r.kind).sort()).toEqual([
      'AlreadyCancelled',
      'Cancelled',
    ]);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(await balance(x)).toBe(DEPOSIT);
    expect(await refundRows(x.paymentId)).toHaveLength(1);
    await assertBookingInvariants(db);
    await assertWalletInvariants(db);
  });
});

describe('CRF-15 cọc 0đ và lịch chưa thu: amountRefundable "0.00" ⇒ hoanCoc null, KHÔNG gọi refund, không dòng hoàn, ví không đổi (HL-01, HL-02, E9)', () => {
  it('lịch DaXacNhan cọc 0đ (một dòng 0đ qua ví) và lịch ChoThanhToan chưa thu: huỷ thành công, hoanCoc null', async () => {
    const w = await cancelWorld(db, fx);
    const wallets = new WalletFixtures(db);
    const walletId = await walletIdOf(w.patientId);
    await withDecoy(w);
    const free = await w.booked('DaXacNhan', 0, { coc: '0.00' });
    await wallets.insertPayment({
      viNoiBoId: walletId,
      lichHenId: free.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'Vi',
      soTien: '0.00',
    });
    const unpaid = await w.booked('ChoThanhToan', 1, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    await openModule();
    const refund = spyRefund();

    for (const lich of [free, unpaid]) {
      await expect(
        cancelService().cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
      ).resolves.toStrictEqual(cancelledOutcome(lich.maLichHen, null));
      expect(await stateOf(lich.lichHenId)).toBe('DaHuy');
    }

    expect(refund).not.toHaveBeenCalled();
    const rows = (await db.query(
      'SELECT COUNT(*) AS n FROM lich_su_hoan_tien',
    )) as { n: string | number }[];
    expect(Number(rows[0]?.n)).toBe(0);
    expect((await wallets.readWallet(walletId)).soDu).toBe('0.00');
  });
});

describe('CRF-16 ★ Q15 qua cancel THẬT (HCC-08 từ phía booking): lịch trả cả ví lẫn tiền mặt, hoàn CHỈ phần qua ví; con số ở kết quả, ở lời gọi refund và ở thông báo đều là số qua ví', () => {
  it('DaTiepDon trả 100.000 qua ví + 150.000 tiền mặt, Quản trị viên override (100%): hoanCoc 100.000 (KHÔNG 250.000), ví +100.000, đúng một dòng hoàn 100.000, khoản tiền mặt không có dòng hoàn, thông báo ghi 100.000', async () => {
    const w = await cancelWorld(db, fx);
    const x = await walletPaid(w, { state: 'DaTiepDon' });
    await x.wallets.insertPayment({
      viNoiBoId: null,
      lichHenId: x.lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'TienMatTaiQuay',
      soTien: '150000.00',
      nguoiThuId: w.receptionist.account.taiKhoanId,
    });
    await openModule();
    const refund = spyRefund();

    const outcome = await cancelService().cancel(
      cancelInput(w, 'QuanTriVien', x.lich.maLichHen),
    );

    expect(outcome).toStrictEqual(
      cancelledOutcome(x.lich.maLichHen, { tyLe: 100, soTien: DEPOSIT }),
    );
    expect(refund.mock.calls[0]?.[0].soTien).toBe(DEPOSIT);
    expect(await balance(x)).toBe(DEPOSIT);
    expect(await refundRows(x.paymentId)).toHaveLength(1);
    const cashRefunds = (await db.query(
      `SELECT COUNT(*) AS n FROM lich_su_hoan_tien h INNER JOIN giao_dich_thanh_toan g ON g.giao_dich_thanh_toan_id = h.giao_dich_thanh_toan_id WHERE g.phuong_thuc = 'TienMatTaiQuay'`,
    )) as { n: string | number }[];
    expect(Number(cashRefunds[0]?.n)).toBe(0);
    const cancelNotice = (await notices()).find(
      (n) => n.loai === BOOKING_NOTIFICATION_EVENTS.CANCELLED,
    );
    expect(cancelNotice?.noiDung).toContain('Hoàn dự kiến 100.000');
    expect(cancelNotice?.noiDung).not.toContain('250.000');
    await assertWalletInvariants(db);
  });
});

describe('CRF-17 Q15 khi đã hoàn đặc biệt MỘT PHẦN trước: số còn hoàn được là phần dư, không phải cả khoản cọc', () => {
  it('ví đã có dòng DacBiet ThanhCong 30.000 (kèm sổ cái); Quản trị viên override (100%): hoanCoc 70.000, ví từ 30.000 lên 100.000, dòng TuDong so_lan_thu 2', async () => {
    const w = await cancelWorld(db, fx);
    const x = await walletPaid(w);
    const special = (await db.query(
      `INSERT INTO lich_su_hoan_tien (giao_dich_thanh_toan_id, vi_noi_bo_id, loai, so_tien, ly_do, trang_thai, so_lan_thu, thoi_diem)
       VALUES (?, ?, 'DacBiet', '30000.00', 'Hoàn đặc biệt trước đó', 'ThanhCong', 1, '2026-11-02 08:00:00')`,
      [x.paymentId, x.walletId],
    )) as { insertId: string };
    await x.wallets.insertLedgerRow({
      viNoiBoId: x.walletId,
      loai: 'HoanTien',
      soTien: '30000.00',
      soDuSau: '30000.00',
      lichSuHoanTienId: String(special.insertId),
    });
    await x.wallets.setWallet(x.walletId, '30000.00');
    await openModule();

    const outcome = await cancelService().cancel(
      cancelInput(w, 'QuanTriVien', x.lich.maLichHen),
    );

    expect(outcome).toStrictEqual(
      cancelledOutcome(x.lich.maLichHen, { tyLe: 100, soTien: '70000.00' }),
    );
    expect(await balance(x)).toBe(DEPOSIT);
    expect(await refundRows(x.paymentId)).toEqual([
      expect.objectContaining({ loai: 'DacBiet', soTien: '30000.00' }),
      expect.objectContaining({
        loai: 'TuDong',
        trangThai: 'ThanhCong',
        soTien: '70000.00',
        soLanThu: 2,
      }),
    ]);
    await assertWalletInvariants(db);
  });
});

// Mỗi dòng: vai trò, còn bao lâu, số hoàn, lý do ghi ở dòng hoàn, có mời danh sách chờ không (BacSiNghiPhep thì không: Q17)
const ROLE_CASES: [CancelRole, number, string, string, number][] = [
  ['HeThong', HOUR_MS, DEPOSIT, LEAVE_CANCEL_REASON, 0],
  ['LeTan', 5 * HOUR_MS, '50000.00', 'Lý do thử nghiệm', 1],
  ['QuanTriVien', 5 * HOUR_MS, DEPOSIT, 'Lý do thử nghiệm', 1],
];

describe('CRF-18 HL-14, HL-15 và HL-12 với lớp thật: bậc hoàn theo Q17 theo từng vai trò; ly_do của dòng hoàn là lý do của lần huỷ; mời danh sách chờ đúng điều kiện', () => {
  it.each(ROLE_CASES)(
    '%s còn %i ms: hoàn %s, ly_do %s, mời danh sách chờ %i lần',
    async (role, remainingMs, refunded, lyDo, invited) => {
      const w = await cancelWorld(db, fx);
      const x = await walletPaid(w);
      atRemaining(remainingMs);
      const waitlist = new FakeWaitlistPort();
      await openModule(waitlist);

      await expect(
        cancelService().cancel(cancelInput(w, role, x.lich.maLichHen)),
      ).resolves.toMatchObject({
        kind: 'Cancelled',
        hoanCoc: { soTien: refunded },
      });

      expect(await balance(x)).toBe(refunded);
      expect(await refundRows(x.paymentId)).toEqual([
        expect.objectContaining({
          trangThai: 'ThanhCong',
          soTien: refunded,
          lyDo,
        }),
      ]);
      expect(waitlist.releasedSlotIds).toHaveLength(invited);
      await assertWalletInvariants(db);
    },
  );
});
