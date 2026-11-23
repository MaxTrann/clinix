import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { PaymentRecorder } from '../../payment/ports/payment-recorder.js';
import { PaymentSummaryReader } from '../../payment/ports/payment-summary.reader.js';
import { WalletBalanceReader } from '../../wallet/balance/wallet-balance.reader.js';
import { RefundService } from '../../wallet/refund/refund.service.js';
import { WalletFixtures } from '../../wallet/testing/wallet-fixtures.js';
import { AppointmentsModule } from '../appointments.module.js';
import { BookingChecksService } from '../create/booking-checks.service.js';
import { CreateAppointmentService } from '../create/create-appointment.service.js';
import { ReceptionAppointmentsService } from '../lists/reception-appointments.service.js';
import { ReceptionStatusService } from '../status/reception-status.service.js';
import {
  createAppointmentWorld,
  dataState,
  failureOf,
  lichHenRows,
} from '../testing/create-appointment-world.js';
import { readAppointment } from '../testing/expiry-fixtures.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import {
  db,
  fx,
  useStatusWorldHooks,
  world,
} from '../testing/status-int-kit.js';
import { IN_WINDOW } from '../testing/status-world.js';
import {
  PAYMENT_PORT,
  PAYMENT_SUMMARY_PORT,
  type PaymentPort,
  type PaymentSummaryPort,
} from './payment.port.js';
import {
  REFUND_PORT,
  WALLET_BALANCE_PORT,
  type RefundPort,
  type WalletBalancePort,
} from './wallet.port.js';

// payment B7 = booking B17a lần 1 (TRACKING booking 3.47; PLAN payment 7 HDT-06, HDT-07, HDT-09, HDT-10) — ba cổng thanh toán và ví THẬT trong `AppointmentsModule`, trên MySQL 8.4 THẬT. Mẫu: `doctor-leave.real-port.int-spec.ts` (B16a).
// Khác các test cũ ở chỗ NÀY dịch vụ KHÔNG dựng tay với cổng giả: lấy từ MODULE THẬT (`Test.createTestingModule({ imports: [AppointmentsModule] })`, `DataSource` thật qua `useMocker`), nên bắt được cả lỗi nối dây
// (sai token, thiếu `useExisting`, thiếu module). Dữ liệu thanh toán là dòng `giao_dich_thanh_toan` THẬT do `WalletFixtures.insertPayment` chèn (booking chỉ ĐỌC lớp của `payment`, `wallet`; không sửa mã của họ).
// payment B9 (TRACKING 3.48): PWR-07 thêm `REFUND_PORT` (`RefundService`) và `amountRefundable` qua token. Mã PWR-nn là `[đề xuất]` (đã `Grep` chưa dùng). PWR-06 (DT-04 với lớp thật, đồng thời): payment-wallet.real-ports.concurrency.int-spec.ts. Phần HTTP: test/booking-checks.e2e-spec.ts (BCK-06) và
// test/booking-patient-appointment-detail.e2e-spec.ts (LSH-10, LSH-14).
const PRICE = '100000.00';

useStatusWorldHooks();

let moduleRef: TestingModule | undefined;
afterEach(async () => {
  await moduleRef?.close();
  moduleRef = undefined;
});

/** `AppointmentsModule` THẬT; `DataSource` của DB test cấp bằng `useMocker` (app thật có sẵn toàn cục từ `DatabaseModule`). */
async function openModule(): Promise<TestingModule> {
  moduleRef = await Test.createTestingModule({ imports: [AppointmentsModule] })
    .useMocker((token) => (token === DataSource ? db : undefined))
    .compile();
  return moduleRef;
}

const inModule = <T>(token: unknown): T =>
  (moduleRef as TestingModule).get<T>(token as never, { strict: false });

const walletIdOf = async (patientId: string): Promise<string> => {
  const rows = (await db.query(
    'SELECT CAST(vi_noi_bo_id AS CHAR) AS id FROM vi_noi_bo WHERE benh_nhan_id = ?',
    [patientId],
  )) as { id: string }[];
  return rows[0]!.id;
};

const setPrice = (lichHenId: string, gia: string = PRICE) =>
  db.query('UPDATE lich_hen SET gia_snapshot = ? WHERE lich_hen_id = ?', [
    gia,
    lichHenId,
  ]);

const paymentRows = (lichHenId: string) =>
  db.query(
    `SELECT loai, phuong_thuc AS phuongThuc, CAST(so_tien AS CHAR) AS soTien, trang_thai AS trangThai, trang_thai_doi_soat AS doiSoat, CAST(vi_noi_bo_id AS CHAR) AS viNoiBoId
     FROM giao_dich_thanh_toan WHERE lich_hen_id = ? ORDER BY giao_dich_thanh_toan_id`,
    [lichHenId],
  ) as Promise<Record<string, string | null>[]>;

const countPayments = async (): Promise<number> =>
  Number(
    (
      (await db.query('SELECT COUNT(*) AS n FROM giao_dich_thanh_toan')) as {
        n: string;
      }[]
    )[0]!.n,
  );

describe('PWR-01 ba token là lớp thật của hai module lá và đọc DB thật qua token (HDT-06)', () => {
  it('PAYMENT_PORT, PAYMENT_SUMMARY_PORT, WALLET_BALANCE_PORT trả đúng lớp thật; amountPaid, remainingToCollect, findPayment, available đúng trên dữ liệu thật (có tiền đang giữ)', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    await setPrice(lich.lichHenId);
    await new WalletFixtures(db).setWallet(
      await walletIdOf(w.patientId),
      '150000.00',
      '100000.00',
    );
    await openModule();

    const payment = inModule<PaymentPort>(PAYMENT_PORT);
    const summary = inModule<PaymentSummaryPort>(PAYMENT_SUMMARY_PORT);
    const wallet = inModule<WalletBalancePort>(WALLET_BALANCE_PORT);
    expect(payment).toBeInstanceOf(PaymentRecorder);
    expect(summary).toBeInstanceOf(PaymentSummaryReader);
    expect(wallet).toBeInstanceOf(WalletBalanceReader);
    await db.transaction(async (em) => {
      expect(await summary.amountPaid(em, lich.lichHenId)).toBe('0.00');
      expect(await summary.remainingToCollect(em, lich.lichHenId)).toBe(PRICE);
      expect(await summary.findPayment(em, lich.lichHenId)).toEqual({
        daThu: '0.00',
        conPhaiThu: PRICE,
        giaoDich: [],
      });
    });
    expect(await wallet.available(w.patientId)).toBe('50000.00');
  });
});

describe('PWR-02 tạo lịch qua CreateAppointmentService của module với PaymentRecorder thật (DL-01, DL-02, DL-27; HDT-07)', () => {
  const input = (khungGioId: string) => ({
    khungGioId,
    hoSoNguoiThanId: null,
    lyDoKham: null,
  });

  it('DL-01 cọc 0đ: đúng MỘT dòng giao_dich_thanh_toan 0đ (ThanhToanLichHen, Vi, ThanhCong, KhongCan) trên ví của Bệnh nhân, cùng giao dịch tạo lịch; INV giữ', async () => {
    const w = await createAppointmentWorld(db, fx);
    const walletId = await walletIdOf(w.patientId);
    await openModule();

    const created = await inModule<CreateAppointmentService>(
      CreateAppointmentService,
    ).create(w.patientId, input(w.slot(0)));

    expect(created).toMatchObject({
      trangThai: 'DaXacNhan',
      tienCoc: '0.00',
      canThanhToan: false,
    });
    const [row, ...rest] = await lichHenRows(db);
    expect(rest).toHaveLength(0);
    expect(await paymentRows(row!.id)).toEqual([
      {
        loai: 'ThanhToanLichHen',
        phuongThuc: 'Vi',
        soTien: '0.00',
        trangThai: 'ThanhCong',
        doiSoat: 'KhongCan',
        viNoiBoId: walletId,
      },
    ]);
    await assertBookingInvariants(db);
  });

  it('DL-02 cọc > 0: ChoThanhToan, recordZeroPayment KHÔNG được gọi và KHÔNG có dòng giao_dich_thanh_toan nào', async () => {
    const w = await createAppointmentWorld(db, fx);
    await w.deposit('50000.00', [
      [2, 50],
      [24, 100],
    ]);
    await openModule();
    const recordZeroPayment = vi.spyOn(
      inModule<PaymentPort>(PAYMENT_PORT),
      'recordZeroPayment',
    );

    const created = await inModule<CreateAppointmentService>(
      CreateAppointmentService,
    ).create(w.patientId, input(w.slot(0)));

    expect(created).toMatchObject({
      trangThai: 'ChoThanhToan',
      tienCoc: '50000.00',
      canThanhToan: true,
    });
    expect(recordZeroPayment).not.toHaveBeenCalled();
    expect(await countPayments()).toBe(0);
    await assertBookingInvariants(db);
  });

  it('DL-27 Bệnh nhân KHÔNG có hàng ví (dữ liệu hỏng): PaymentRecorder ném lỗi, hoàn tác TRỌN lịch, khung giờ, thông báo; không dòng thanh toán nào', async () => {
    const w = await createAppointmentWorld(db, fx);
    await db.query('DELETE FROM vi_noi_bo WHERE benh_nhan_id = ?', [
      w.patientId,
    ]);
    const before = await dataState(db);
    await openModule();

    await expect(
      inModule<CreateAppointmentService>(CreateAppointmentService).create(
        w.patientId,
        input(w.slot(0)),
      ),
    ).rejects.toThrow(/không có hàng ví/);

    expect(await dataState(db)).toEqual(before);
    expect(await countPayments()).toBe(0);
    await assertBookingInvariants(db);
  });
});

describe('PWR-03 chi tiết Lễ tân với PaymentSummaryReader thật (HDT-09, HDT-07)', () => {
  it('conPhaiThu = giá trừ tổng đã thu (ví và tiền mặt), không âm; chuyenDuoc[] chỉ có DaTiepDon khi đủ tiền', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    await setPrice(lich.lichHenId);
    const wallets = new WalletFixtures(db);
    const walletId = await walletIdOf(w.patientId);
    await openModule();
    vi.setSystemTime(IN_WINDOW);
    const detail = () =>
      inModule<ReceptionAppointmentsService>(
        ReceptionAppointmentsService,
      ).detail(w.receptionId, lich.maLichHen);

    // chưa thu đồng nào: còn nguyên giá, chỉ huỷ được
    expect(await detail()).toMatchObject({
      conPhaiThu: PRICE,
      chuyenDuoc: ['DaHuy'],
    });
    // thu một phần bằng ví: còn lại 60.000, vẫn chưa tiếp đón được
    await wallets.insertPayment({
      viNoiBoId: walletId,
      lichHenId: lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'Vi',
      soTien: '40000.00',
    });
    expect(await detail()).toMatchObject({
      conPhaiThu: '60000.00',
      chuyenDuoc: ['DaHuy'],
    });
    // thu nốt bằng tiền mặt tại quầy: đủ tiền, DaTiepDon mở
    await wallets.insertPayment({
      lichHenId: lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'TienMatTaiQuay',
      soTien: '60000.00',
      nguoiThuId: w.receptionId,
    });
    expect(await detail()).toMatchObject({
      conPhaiThu: '0.00',
      chuyenDuoc: ['DaTiepDon', 'DaHuy'],
    });
    // thu thừa: không âm
    await wallets.insertPayment({
      viNoiBoId: walletId,
      lichHenId: lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'Vi',
      soTien: '10000.00',
    });
    expect(await detail()).toMatchObject({
      conPhaiThu: '0.00',
      chuyenDuoc: ['DaTiepDon', 'DaHuy'],
    });
  });
});

describe('PWR-04 Lễ tân tiếp đón qua ReceptionStatusService của module với thanh toán thật (CT-05, CT-06; HDT-07)', () => {
  it('CT-06 còn phải thu (kể cả đã thu một phần): 409 CON_PHAN_CHUA_THANH_TOAN kèm conPhaiThu đúng, không đổi một byte; CT-05 đủ tiền: DaTiepDon, khung giờ giữ DaDat; INV giữ', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    await setPrice(lich.lichHenId);
    const wallets = new WalletFixtures(db);
    await openModule();
    vi.setSystemTime(IN_WINDOW);
    const checkIn = () =>
      inModule<ReceptionStatusService>(ReceptionStatusService).change(
        w.receptionId,
        lich.maLichHen,
        { trangThai: 'DaTiepDon' },
      );
    const before = await w.snapshot(lich, 0);

    const owing = await failureOf(checkIn());
    expect(owing.status).toBe(409);
    expect(owing.body).toMatchObject({
      maLoi: 'CON_PHAN_CHUA_THANH_TOAN',
      chiTiet: { conPhaiThu: PRICE },
    });
    expect(await w.snapshot(lich, 0)).toEqual(before);

    await wallets.insertPayment({
      viNoiBoId: await walletIdOf(w.patientId),
      lichHenId: lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'Vi',
      soTien: '40000.00',
    });
    const partial = await failureOf(checkIn());
    expect(partial.status).toBe(409);
    expect(partial.body).toMatchObject({
      maLoi: 'CON_PHAN_CHUA_THANH_TOAN',
      chiTiet: { conPhaiThu: '60000.00' },
    });
    expect(await w.snapshot(lich, 0)).toEqual(before);

    await wallets.insertPayment({
      lichHenId: lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'TienMatTaiQuay',
      soTien: '60000.00',
      nguoiThuId: w.receptionId,
    });
    expect(await checkIn()).toStrictEqual({
      maLichHen: lich.maLichHen,
      trangThai: 'DaTiepDon',
    });
    expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
      'DaTiepDon',
    );
    expect(await fx.slotState(w.slotId(0))).toEqual(before.slot);
    await assertBookingInvariants(db);
  });
});

describe('PWR-05 POST /booking/checks: soDuVi từ WalletBalanceReader thật (HDT-10, E5)', () => {
  it('cọc 0đ ⇒ null (không hỏi ví); cọc > 0 và có ví ⇒ chuỗi so_du trừ so_tien_dang_giu; không có hàng ví ⇒ null', async () => {
    const w = await createAppointmentWorld(db, fx);
    const walletId = await walletIdOf(w.patientId);
    await openModule();
    const check = () =>
      inModule<BookingChecksService>(BookingChecksService).check(w.patientId, {
        khungGioId: w.slot(0),
        hoSoNguoiThanId: null,
      });
    await new WalletFixtures(db).setWallet(walletId, '150000.00', '100000.00');

    expect((await check()).tomTat.soDuVi).toBeNull();

    await w.deposit('50000.00', [
      [2, 50],
      [24, 100],
    ]);
    expect((await check()).tomTat.soDuVi).toBe('50000.00');

    await db.query('DELETE FROM vi_noi_bo WHERE benh_nhan_id = ?', [
      w.patientId,
    ]);
    expect((await check()).tomTat.soDuVi).toBeNull();
  });
});

describe('PWR-07 REFUND_PORT là RefundService THẬT và amountRefundable THẬT qua token (payment B9; HDT-06, HDT-08, HDT-15, Q15)', () => {
  it('REFUND_PORT toBe đúng thể hiện RefundService; findRefund: null khi chưa hoàn, rồi đúng ba khoá của dòng mới nhất (không lộ id ví hay số lần thử); amountRefundable: ví 100.000 + tiền mặt 40.000 ⇒ amountPaid 140.000 nhưng chỉ 100.000 hoàn được; trừ dòng hoàn ThanhCong, KHÔNG trừ dòng ThatBai', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const wallets = new WalletFixtures(db);
    const walletId = await walletIdOf(w.patientId);
    const paymentId = await wallets.insertWalletDeposit({
      viNoiBoId: walletId,
      lichHenId: lich.lichHenId,
      soTien: '100000.00',
    });
    await wallets.insertPayment({
      viNoiBoId: null,
      lichHenId: lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'TienMatTaiQuay',
      soTien: '40000.00',
      nguoiThuId: w.receptionist.account.taiKhoanId,
    });
    await openModule();
    const refunds = inModule<RefundPort>(REFUND_PORT);
    const summary = inModule<PaymentSummaryPort>(PAYMENT_SUMMARY_PORT);
    expect(refunds).toBeInstanceOf(RefundService);
    expect(refunds).toBe(inModule<RefundService>(RefundService));

    await db.transaction(async (em) => {
      expect(await refunds.findRefund(em, lich.lichHenId)).toBeNull();
      expect(await summary.amountPaid(em, lich.lichHenId)).toBe('140000.00');
      expect(await summary.amountRefundable(em, lich.lichHenId)).toBe(
        '100000.00',
      );
    });

    await wallets.insertRefund({
      giaoDichThanhToanId: paymentId,
      viNoiBoId: walletId,
      soTien: '30000.00',
      soLanThu: 1,
    });
    await db.transaction(async (em) => {
      const view = await refunds.findRefund(em, lich.lichHenId);
      expect(view).toEqual({
        soTien: '30000.00',
        trangThai: 'ThanhCong',
        thoiDiem: expect.any(String),
      });
      expect(Object.keys(view ?? {}).sort()).toEqual([
        'soTien',
        'thoiDiem',
        'trangThai',
      ]);
      expect(await summary.amountRefundable(em, lich.lichHenId)).toBe(
        '70000.00',
      );
    });

    await wallets.insertRefund({
      giaoDichThanhToanId: paymentId,
      viNoiBoId: walletId,
      soTien: '70000.00',
      trangThai: 'ThatBai',
      soLanThu: 2,
    });
    await db.transaction(async (em) => {
      expect(await refunds.findRefund(em, lich.lichHenId)).toMatchObject({
        soTien: '70000.00',
        trangThai: 'ThatBai',
      });
      expect(await summary.amountRefundable(em, lich.lichHenId)).toBe(
        '70000.00',
      );
    });
  });
});
