import type { DataSource } from 'typeorm';
import { HOLD_EXPIRED_CANCEL_REASON } from '../../appointments/appointments.constants.js';
import {
  failAfterStatement,
  recordStatements,
} from '../../appointments/testing/statement-recorder.js';
import { assertBookingInvariants } from '../../appointments/testing/invariants.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { assertWalletInvariants } from '../../wallet/testing/wallet-invariants.js';
import { WalletFixtures } from '../../wallet/testing/wallet-fixtures.js';
import { depositStack } from '../testing/deposit-stack.js';
import { paymentWorld, type PaymentWorld } from '../testing/payment-world.js';

// payment B5 — DepositPaymentService THẬT trên MySQL 8.4 THẬT (PLAN payment 5.5, E6; TLK-01…TLK-13, TLK-16, HDT-12). Phần đồng thời (DTT-01…DTT-06): deposit-payment.concurrency.int-spec.ts;
// phần HTTP (TLK-14, TLK-15, QTT-03, QTT-12): test/payment-deposit.e2e-spec.ts. Dữ liệu giả; `confirmPaid`, `SlotHoldService`, `BookingNotifier` và `WalletLedger` đều là bản thật.
// Cọc của lịch trong world là `PAYMENT_DEPOSIT` = 100.000đ; mọi ca kết thúc bằng bất biến của booking (INV) và của ví (IVT).
let db: DataSource;
let wf: WalletFixtures;
useIntegrationHooks((d) => {
  db = d;
  wf = new WalletFixtures(d);
});

const COC = '100000.00';

/** Bệnh nhân của world với ví đã có `soDu` (nhất quán với sổ cái) và `giu` đang giữ; lịch `ChoThanhToan` ở khung giờ số 0. */
async function setup(soDu: string, giu = '0.00') {
  const w = await paymentWorld(db);
  const walletId = w.patient.wallet.viNoiBoId;
  if (soDu !== '0.00') await wf.fundWallet(walletId, soDu);
  if (giu !== '0.00') await wf.setWallet(walletId, soDu, giu);
  const lich = await w.appointment(0);
  return { w, walletId, lich };
}

async function settled() {
  await assertBookingInvariants(db);
  await assertWalletInvariants(db);
}

const count = async (sql: string, params: unknown[] = []) =>
  Number((await db.query<{ n: string }[]>(sql, params))[0]!.n);
const paymentRows = (lichHenId: string) =>
  count(
    `SELECT COUNT(*) AS n FROM giao_dich_thanh_toan WHERE lich_hen_id = ? AND loai = 'ThanhToanLichHen'`,
    [lichHenId],
  );
const ledgerRows = (walletId: string) =>
  count(
    `SELECT COUNT(*) AS n FROM giao_dich_vi WHERE vi_noi_bo_id = ? AND loai = 'ThanhToan'`,
    [walletId],
  );
const notices = (lichHenId: string) =>
  count(
    `SELECT COUNT(*) AS n FROM thong_bao WHERE lich_hen_id = ? AND loai_su_kien = 'LichHenDaXacNhan'`,
    [lichHenId],
  );
const lichState = async (lichHenId: string) =>
  (
    await db.query<{ trangThai: string }[]>(
      'SELECT trang_thai AS trangThai FROM lich_hen WHERE lich_hen_id = ?',
      [lichHenId],
    )
  )[0]!.trangThai;

async function failure(work: Promise<unknown>) {
  try {
    await work;
  } catch (error) {
    if (error instanceof AppException)
      return {
        status: error.getStatus(),
        maLoi: error.maLoi,
        body: error.getResponse() as { chiTiet?: unknown },
      };
    throw error;
  }
  throw new Error('mong đợi AppException nhưng không có lỗi');
}

/** Không gì đổi: lịch còn `ChoThanhToan`, khung giờ còn giữ, ví nguyên, không dòng tiền, không thông báo. */
async function expectUntouched(
  w: PaymentWorld,
  walletId: string,
  lichHenId: string,
  soDu: string,
) {
  expect(await lichState(lichHenId)).toBe('ChoThanhToan');
  expect(await wf.readWallet(walletId)).toMatchObject({ soDu });
  expect(await paymentRows(lichHenId)).toBe(0);
  expect(await ledgerRows(walletId)).toBe(0);
  expect(await notices(lichHenId)).toBe(0);
  expect((await w.booking.slotState(w.slotId(0))).trangThai).toBe('DangGiuCho');
}

describe('TLK-01 ★ thanh toán cọc đủ số dư', () => {
  it('ví trừ đúng cọc; giao dịch Vi ThanhCong gắn lịch gốc; sổ cái ThanhToan số âm; lịch DaXacNhan; khung giờ DaDat; đúng một thông báo', async () => {
    const { w, walletId, lich } = await setup('350000.00');
    const { service } = depositStack(db);
    const result = await service.pay(w.patientId, lich.maLichHen);
    expect(result).toEqual({
      maLichHen: lich.maLichHen,
      trangThai: 'DaXacNhan',
      soTien: COC,
      soDuKhaDung: '250000.00',
      daXuLyTruocDo: false,
    });
    expect(await wf.readWallet(walletId)).toEqual({
      soDu: '250000.00',
      soTienDangGiu: '0.00',
    });
    const payments = await db.query<
      {
        phuongThuc: string;
        soTien: string;
        trangThai: string;
        viNoiBoId: string;
        lichHenId: string;
      }[]
    >(
      `SELECT phuong_thuc AS phuongThuc, so_tien AS soTien, trang_thai AS trangThai, vi_noi_bo_id AS viNoiBoId, lich_hen_id AS lichHenId
       FROM giao_dich_thanh_toan WHERE loai = 'ThanhToanLichHen'`,
    );
    expect(payments).toEqual([
      {
        phuongThuc: 'Vi',
        soTien: COC,
        trangThai: 'ThanhCong',
        viNoiBoId: walletId,
        lichHenId: lich.lichHenId,
      },
    ]);
    const ledger = await db.query<{ soTien: string; soDuSau: string }[]>(
      `SELECT so_tien AS soTien, so_du_sau AS soDuSau FROM giao_dich_vi WHERE vi_noi_bo_id = ? AND loai = 'ThanhToan'`,
      [walletId],
    );
    expect(ledger).toEqual([{ soTien: '-100000.00', soDuSau: '250000.00' }]);
    expect(await lichState(lich.lichHenId)).toBe('DaXacNhan');
    expect((await w.booking.slotState(w.slotId(0))).trangThai).toBe('DaDat');
    expect(await notices(lich.lichHenId)).toBe(1);
    await settled();
  });

  it('chuỗi hai lịch: tiền ghi vào LỊCH GỐC dù thanh toán cho lịch mới (E13)', async () => {
    const w = await paymentWorld(db);
    const walletId = w.patient.wallet.viNoiBoId;
    await wf.fundWallet(walletId, '350000.00');
    const [goc, moi] = await w.chain(2);
    // Lịch mới đang chờ thanh toán (cọc 100.000đ); lịch gốc đã `DaDoiLich`
    await db.query(
      `UPDATE lich_hen SET trang_thai = 'ChoThanhToan', tien_coc_snapshot = ?, han_thanh_toan = ? WHERE lich_hen_id = ?`,
      [COC, new Date('2026-11-02T09:00:00+07:00'), moi!.lichHenId],
    );
    await db.query(
      `UPDATE khung_gio SET trang_thai = 'DangGiuCho', giu_cho_den = ? WHERE khung_gio_id = ?`,
      [new Date('2026-11-02T09:00:00+07:00'), w.slotId(1)],
    );
    await depositStack(db).service.pay(w.patientId, moi!.maLichHen);
    const rows = await db.query<{ lichHenId: string }[]>(
      `SELECT lich_hen_id AS lichHenId FROM giao_dich_thanh_toan WHERE loai = 'ThanhToanLichHen'`,
    );
    expect(rows).toEqual([{ lichHenId: goc!.lichHenId }]);
  });
});

describe('TLK-02, TLK-16 không đủ số dư', () => {
  it('TLK-02 thiếu tiền ⇒ 409 SO_DU_KHONG_DU kèm chiTiet; ví, lịch, khung giờ không đổi', async () => {
    const { w, walletId, lich } = await setup('50000.00');
    const error = await failure(
      depositStack(db).service.pay(w.patientId, lich.maLichHen),
    );
    expect(error).toMatchObject({ status: 409, maLoi: 'SO_DU_KHONG_DU' });
    expect(error.body.chiTiet).toEqual({
      soDuKhaDung: '50000.00',
      soTienCan: COC,
    });
    await expectUntouched(w, walletId, lich.lichHenId, '50000.00');
    await settled();
  });

  it('TLK-16 có yêu cầu rút đang giữ ⇒ dùng số KHẢ DỤNG (số dư − giữ): 150.000 với 100.000 đang giữ không đủ cọc 100.000', async () => {
    const { w, walletId, lich } = await setup('150000.00', '100000.00');
    const error = await failure(
      depositStack(db).service.pay(w.patientId, lich.maLichHen),
    );
    expect(error.maLoi).toBe('SO_DU_KHONG_DU');
    expect(error.body.chiTiet).toEqual({
      soDuKhaDung: '50000.00',
      soTienCan: COC,
    });
    expect(await wf.readWallet(walletId)).toEqual({
      soDu: '150000.00',
      soTienDangGiu: '100000.00',
    });
  });

  it('đúng bằng số khả dụng (biên) ⇒ thanh toán được, số khả dụng còn "0.00"', async () => {
    const { w, lich } = await setup('100000.00');
    const result = await depositStack(db).service.pay(
      w.patientId,
      lich.maLichHen,
    );
    expect(result.soDuKhaDung).toBe('0.00');
    await settled();
  });
});

describe('TLK-03 ★ số dư giảm giữa lúc kiểm sơ bộ và lúc khoá', () => {
  it('bản đọc sơ bộ nói đủ tiền, dưới khoá ví thì thiếu ⇒ SO_DU_KHONG_DU VÀ confirmPaid bị hoàn tác (lịch ChoThanhToan, khung giờ DangGiuCho, không thong_bao)', async () => {
    const { w, walletId, lich } = await setup('50000.00');
    const { service } = depositStack(db, {
      balance: { available: () => Promise.resolve('350000.00') },
    });
    const error = await failure(service.pay(w.patientId, lich.maLichHen));
    expect(error).toMatchObject({ status: 409, maLoi: 'SO_DU_KHONG_DU' });
    expect(error.body.chiTiet).toEqual({
      soDuKhaDung: '50000.00',
      soTienCan: COC,
    });
    await expectUntouched(w, walletId, lich.lichHenId, '50000.00');
    await settled();
  });
});

describe('TLK-04 ★, TLK-13 bấm đúp hay gửi lặp', () => {
  it('lần hai 200 daXuLyTruocDo; ví chỉ trừ MỘT lần; một dòng tiền; đúng một thông báo (kể cả khi số dư giờ đã thấp)', async () => {
    const { w, walletId, lich } = await setup('150000.00');
    const { service } = depositStack(db);
    const first = await service.pay(w.patientId, lich.maLichHen);
    expect(first.daXuLyTruocDo).toBe(false);
    // Số dư giờ 50.000 < cọc: lần hai vẫn phải ra `daXuLyTruocDo`, không `SO_DU_KHONG_DU`
    const second = await service.pay(w.patientId, lich.maLichHen);
    expect(second).toEqual({
      maLichHen: lich.maLichHen,
      trangThai: 'DaXacNhan',
      soTien: COC,
      soDuKhaDung: '50000.00',
      daXuLyTruocDo: true,
    });
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '50000.00' });
    expect(await paymentRows(lich.lichHenId)).toBe(1);
    expect(await ledgerRows(walletId)).toBe(1);
    expect(await notices(lich.lichHenId)).toBe(1);
    await settled();
  });
});

describe('TLK-05, TLK-06, TLK-07 trạng thái và cọc 0đ', () => {
  it('TLK-05 lịch DaHuy do hết hạn giữ chỗ ⇒ 409 HET_HAN_GIU_CHO, không trừ', async () => {
    const { w, walletId, lich } = await setup('350000.00');
    await db.query(
      `UPDATE lich_hen SET trang_thai = 'DaHuy', ly_do_huy = ?, thoi_diem_huy = ?, han_thanh_toan = NULL WHERE lich_hen_id = ?`,
      [
        HOLD_EXPIRED_CANCEL_REASON,
        new Date('2026-11-02T09:00:00+07:00'),
        lich.lichHenId,
      ],
    );
    const error = await failure(
      depositStack(db).service.pay(w.patientId, lich.maLichHen),
    );
    expect(error).toMatchObject({ status: 409, maLoi: 'HET_HAN_GIU_CHO' });
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '350000.00' });
    expect(await paymentRows(lich.lichHenId)).toBe(0);
  });

  it.each(['DaTiepDon', 'HoanThanh', 'VangMat', 'DaDoiLich', 'DaHuy'] as const)(
    'TLK-06 lịch %s ⇒ 409 LICH_HEN_KHONG_CHO_THANH_TOAN kèm trạng thái, ví không đổi',
    async (trangThai) => {
      const w = await paymentWorld(db);
      const walletId = w.patient.wallet.viNoiBoId;
      await wf.fundWallet(walletId, '350000.00');
      const lich = await w.appointment(0, { trangThai });
      const error = await failure(
        depositStack(db).service.pay(w.patientId, lich.maLichHen),
      );
      expect(error).toMatchObject({
        status: 409,
        maLoi: 'LICH_HEN_KHONG_CHO_THANH_TOAN',
      });
      expect(error.body.chiTiet).toEqual({ trangThai });
      expect(await wf.readWallet(walletId)).toMatchObject({
        soDu: '350000.00',
      });
      expect(await paymentRows(lich.lichHenId)).toBe(0);
    },
  );

  it('TLK-07 lịch cọc 0đ ⇒ 409 LICH_HEN_KHONG_CAN_COC (kể cả khi lịch đã DaXacNhan)', async () => {
    const w = await paymentWorld(db);
    await wf.fundWallet(w.patient.wallet.viNoiBoId, '350000.00');
    const lich = await w.appointment(0, {
      trangThai: 'DaXacNhan',
      coc: '0.00',
    });
    const error = await failure(
      depositStack(db).service.pay(w.patientId, lich.maLichHen),
    );
    expect(error).toMatchObject({
      status: 409,
      maLoi: 'LICH_HEN_KHONG_CAN_COC',
    });
  });
});

describe('TLK-08 ★ quá hạn nhưng job chưa quét', () => {
  it('lịch còn ChoThanhToan dù han_thanh_toan đã qua ⇒ VẪN xác nhận (Q4 booking)', async () => {
    const w = await paymentWorld(db);
    const walletId = w.patient.wallet.viNoiBoId;
    await wf.fundWallet(walletId, '350000.00');
    const lich = await w.booking.appointmentIn('ChoThanhToan', {
      doctor: w.doctor.profile,
      khungGioId: w.slotId(0),
      patientId: w.patientId,
      tienCocSnapshot: COC,
      hanThanhToan: new Date('2026-11-01T00:00:00+07:00'), // trước đồng hồ giả 02/11 08:00
    });
    const result = await depositStack(db).service.pay(
      w.patientId,
      lich.maLichHen,
    );
    expect(result.daXuLyTruocDo).toBe(false);
    expect(await lichState(lich.lichHenId)).toBe('DaXacNhan');
    await settled();
  });
});

describe('TLK-09 sở hữu', () => {
  it('lịch của người khác và lịch không tồn tại ⇒ cùng một 404 KHONG_TIM_THAY, không lộ trạng thái; ví của người khác không đổi', async () => {
    const { w, walletId, lich } = await setup('350000.00');
    const other = await wf.patientWithWallet();
    const { service } = depositStack(db);
    const stranger = await failure(
      service.pay(other.patientId, lich.maLichHen),
    );
    const missing = await failure(
      service.pay(w.patientId, 'CLX-20261110-ZZZZZ'),
    );
    const previewStranger = await failure(
      service.preview(other.patientId, lich.maLichHen),
    );
    for (const error of [stranger, missing, previewStranger])
      expect(error).toMatchObject({ status: 404, maLoi: 'KHONG_TIM_THAY' });
    expect(stranger.body).toEqual(missing.body);
    await expectUntouched(w, walletId, lich.lichHenId, '350000.00');
  });
});

describe('TLK-10 ★ lỗi hệ thống sau khi trừ ví', () => {
  it('ép lỗi SAU câu ghi sổ cái đã chạy thật ⇒ hoàn tác TRỌN: ví không trừ, không dòng thanh toán, lịch ChoThanhToan, không thông báo', async () => {
    const { w, walletId, lich } = await setup('350000.00');
    const boom = new Error('lỗi giả sau khi trừ ví');
    const matched = failAfterStatement(
      db,
      /^\s*INSERT INTO giao_dich_vi\b/,
      boom,
    );
    await expect(
      depositStack(db).service.pay(w.patientId, lich.maLichHen),
    ).rejects.toBe(boom);
    expect(matched.length).toBeGreaterThanOrEqual(1);
    await expectUntouched(w, walletId, lich.lichHenId, '350000.00');
    // Không có dòng chờ đối soát nào (không có nhánh "đã thu mà chưa ghi")
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM giao_dich_thanh_toan WHERE trang_thai_doi_soat <> 'KhongCan'`,
      ),
    ).toBe(0);
    await settled();
  });
});

describe('TLK-11, TLK-12 payment-preview và cọc chụp', () => {
  it('TLK-11 số do máy chủ tính trên số KHẢ DỤNG kể cả khi ví có tiền đang giữ; đủ tiền: soDuSauThanhToan; hanThanhToan và thoiGianMayChu là ISO', async () => {
    const { w, lich } = await setup('350000.00', '50000.00');
    const now = new Date('2026-11-02T01:00:00Z');
    const preview = await depositStack(db).service.preview(
      w.patientId,
      lich.maLichHen,
      now,
    );
    expect(preview).toEqual({
      soTienCan: COC,
      soDuKhaDung: '300000.00',
      soDuSauThanhToan: '200000.00',
      duSoDu: true,
      hanThanhToan: expect.stringMatching(/Z$/) as string,
      thoiGianMayChu: '2026-11-02T01:00:00.000Z',
    });
  });

  it('TLK-11 thiếu tiền: duSoDu false, soDuSauThanhToan null; biên đúng bằng: duSoDu true, sau thanh toán "0.00"', async () => {
    const poor = await setup('50000.00');
    expect(
      await depositStack(db).service.preview(
        poor.w.patientId,
        poor.lich.maLichHen,
      ),
    ).toMatchObject({
      soDuKhaDung: '50000.00',
      soDuSauThanhToan: null,
      duSoDu: false,
    });
  });

  it('TLK-11 preview không ghi gì và từ chối lịch không còn chờ (409) hay cọc 0đ', async () => {
    const { w, walletId, lich } = await setup('350000.00');
    const { service } = depositStack(db);
    const before = recordStatements(db);
    await service.preview(w.patientId, lich.maLichHen);
    expect(
      before.filter((sql) => /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)),
    ).toEqual([]);
    await expectUntouched(w, walletId, lich.lichHenId, '350000.00');
    await service.pay(w.patientId, lich.maLichHen);
    const error = await failure(service.preview(w.patientId, lich.maLichHen));
    expect(error).toMatchObject({
      status: 409,
      maLoi: 'LICH_HEN_KHONG_CHO_THANH_TOAN',
    });
  });

  it('TLK-12 trừ đúng tien_coc_snapshot dù muc_dat_coc hiện hành của dịch vụ đã đổi', async () => {
    const { w, walletId, lich } = await setup('350000.00');
    await db.query('UPDATE dich_vu_kham SET muc_dat_coc = 20000.00');
    const result = await depositStack(db).service.pay(
      w.patientId,
      lich.maLichHen,
    );
    expect(result.soTien).toBe(COC);
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '250000.00' });
  });
});

describe('HDT-12 ★ trình tự câu SQL của thanh toán cọc', () => {
  it('confirmPaid (UPDATE lich_hen) TRƯỚC, rồi khoá ví FOR UPDATE, rồi INSERT giao dịch, rồi sổ cái', async () => {
    const { w, lich } = await setup('350000.00');
    const sqls = recordStatements(db);
    await depositStack(db).service.pay(w.patientId, lich.maLichHen);
    const at = (pattern: RegExp) => sqls.findIndex((sql) => pattern.test(sql));
    const confirm = at(/^\s*UPDATE lich_hen SET trang_thai = 'DaXacNhan'/);
    const lockWallet = at(/FROM vi_noi_bo[\s\S]*FOR UPDATE/);
    const insertPayment = at(/^\s*INSERT INTO giao_dich_thanh_toan\b/);
    const insertLedger = at(/^\s*INSERT INTO giao_dich_vi\b/);
    const insertNotice = at(/^\s*INSERT INTO thong_bao\b/);
    for (const index of [
      confirm,
      lockWallet,
      insertPayment,
      insertLedger,
      insertNotice,
    ])
      expect(index).toBeGreaterThanOrEqual(0);
    // `thong_bao` do `confirmPaid` ghi: cũng phải TRƯỚC khoá ví (mọi ghi bảng con của lịch đi trước tầng 7)
    expect(confirm).toBeLessThan(lockWallet);
    expect(insertNotice).toBeLessThan(lockWallet);
    expect(lockWallet).toBeLessThan(insertPayment);
    expect(insertPayment).toBeLessThan(insertLedger);
  });
});
