import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { failAfterStatement } from '../../appointments/testing/statement-recorder.js';
import { T0 } from '../../auth/testing/otp-int-helpers.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { assertWalletInvariants } from '../../wallet/testing/wallet-invariants.js';
import { WalletFixtures } from '../../wallet/testing/wallet-fixtures.js';
import { paymentWorld } from '../testing/payment-world.js';
import { signedVnpayIpn, topupStack } from '../testing/topup-stack.js';
import type { CreateTopupDto } from './topup.dto.js';

// payment B4 — `TopupService` và `IpnService` THẬT trên MySQL 8.4 THẬT (PLAN payment 5.4; NTV-01, NTV-02, NTV-04, NTV-06…NTV-17, NTV-19, NTV-20, NTV-23, TDT-01, TDT-02, BDT-01 phần dịch vụ).
// Phần đồng thời (DTT-07): topup.concurrency.int-spec.ts. Phần HTTP (NTV-03, NTV-05, NTV-18, QTT-13, CGS-13, CGS-15): test/payment-topup.e2e-spec.ts.
// Cổng là `VnpayGateway` THẬT cấu hình bằng KHOÁ GIẢ; tín hiệu IPN ký bằng khoá giả theo bộ tham số đo thật (M12). Dữ liệu giả.
let db: DataSource;
let wf: WalletFixtures;
let logs: string[];
useIntegrationHooks((d, captured) => {
  db = d;
  wf = new WalletFixtures(d);
  logs = captured;
});

const IP = '203.0.113.7';
const dto = (soTien: string, phuongThuc = 'VNPay') =>
  ({ soTien, phuongThuc }) as CreateTopupDto;

async function patient() {
  return wf.patientWithWallet();
}

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

const one = async <T>(sql: string, params: unknown[]) =>
  (await db.query<T[]>(sql, params))[0]!;
const topupRow = (id: string) =>
  one<{
    trangThai: string;
    doiSoat: string;
    maCong: string | null;
    soTien: string;
    loai: string;
    phuongThuc: string;
  }>(
    `SELECT trang_thai AS trangThai, trang_thai_doi_soat AS doiSoat, ma_giao_dich_cong AS maCong, so_tien AS soTien, loai, phuong_thuc AS phuongThuc
       FROM giao_dich_thanh_toan WHERE giao_dich_thanh_toan_id = ?`,
    [id],
  );
const count = async (sql: string, params: unknown[] = []) =>
  Number((await one<{ n: string }>(sql, params)).n);
const napRows = (id: string) =>
  count(
    `SELECT COUNT(*) AS n FROM giao_dich_vi WHERE giao_dich_thanh_toan_id = ? AND loai = 'Nap'`,
    [id],
  );
const topupCount = (walletId: string) =>
  count(
    `SELECT COUNT(*) AS n FROM giao_dich_thanh_toan WHERE vi_noi_bo_id = ? AND loai = 'NapVi'`,
    [walletId],
  );
const notices = (taiKhoanId: string, loai: string) =>
  count(
    'SELECT COUNT(*) AS n FROM thong_bao WHERE tai_khoan_id = ? AND loai_su_kien = ?',
    [taiKhoanId, loai],
  );
const attempts = (id: string) =>
  db.query<{ soLanThu: number; ketQua: string; lyDo: string }[]>(
    'SELECT so_lan_thu AS soLanThu, ket_qua AS ketQua, ly_do AS lyDo FROM lan_doi_soat_nap_vi WHERE giao_dich_thanh_toan_id = ?',
    [id],
  );

/** Tạo một giao dịch nạp `soTien` đồng ("100000") cho Bệnh nhân; trả id. */
async function created(patientId: string, soTien = '100000') {
  const { topups } = topupStack(db);
  return (await topups.create(patientId, dto(soTien), IP)).maGiaoDich;
}

describe('TopupService.create (payment B4)', () => {
  it('NTV-01 tạo nạp VNPay hợp lệ ⇒ dòng NapVi DangXuLy, ví không đổi, redirectUrl https đúng host cấu hình', async () => {
    const { patientId, walletId } = await patient();
    const { topups } = topupStack(db);
    const result = await topups.create(patientId, dto('100000'), IP);
    expect(result.maGiaoDich).toMatch(/^[1-9]\d*$/);
    const url = new URL(result.redirectUrl);
    expect(url.protocol).toBe('https:');
    expect(url.host).toBe('sandbox.vnpayment.vn');
    expect(url.searchParams.get('vnp_TxnRef')).toBe(result.maGiaoDich);
    expect(url.searchParams.get('vnp_Amount')).toBe('10000000');
    expect(url.searchParams.get('vnp_IpAddr')).toBe(IP);
    expect(await topupRow(result.maGiaoDich)).toEqual({
      trangThai: 'DangXuLy',
      doiSoat: 'KhongCan',
      maCong: null,
      soTien: '100000.00',
      loai: 'NapVi',
      phuongThuc: 'VNPay',
    });
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '0.00' });
    await assertWalletInvariants(db);
  });

  it('NTV-02 ngoài hạn mức ⇒ 400 SO_TIEN_NGOAI_HAN_MUC kèm chiTiet, không dòng mới; đúng bằng tối thiểu và tối đa được nhận (biên Q20)', async () => {
    const { patientId, walletId } = await patient();
    const { topups } = topupStack(db);
    for (const soTien of ['49999', '2000001', '1']) {
      expect(await failure(topups.create(patientId, dto(soTien), IP))).toEqual({
        status: 400,
        maLoi: 'SO_TIEN_NGOAI_HAN_MUC',
        body: expect.objectContaining({
          chiTiet: { toiThieu: '50000.00', toiDa: '2000000.00' },
        }),
      });
    }
    expect(await topupCount(walletId)).toBe(0);
    await topups.create(patientId, dto('50000'), IP);
    await topups.create(patientId, dto('2000000'), IP);
    expect(await topupCount(walletId)).toBe(2);
  });

  it('NTV-04 cổng thiếu biến môi trường ⇒ 503 CONG_THANH_TOAN_CHUA_CAU_HINH, không tạo dòng; MoMo chưa có bộ điều hợp cũng vậy', async () => {
    const { patientId, walletId } = await patient();
    const unconfigured = topupStack(db, { vnpay: null });
    expect(
      await failure(unconfigured.topups.create(patientId, dto('100000'), IP)),
    ).toMatchObject({ status: 503, maLoi: 'CONG_THANH_TOAN_CHUA_CAU_HINH' });
    const { topups } = topupStack(db);
    expect(
      await failure(topups.create(patientId, dto('100000', 'MoMo'), IP)),
    ).toMatchObject({ status: 503, maLoi: 'CONG_THANH_TOAN_CHUA_CAU_HINH' });
    expect(await topupCount(walletId)).toBe(0);
  });

  it('NTV-20 tạo nạp hai lần (bấm đúp) ⇒ hai dòng DangXuLy độc lập; mỗi dòng cộng đúng một lần khi có IPN', async () => {
    const { patientId, walletId } = await patient();
    const first = await created(patientId);
    const second = await created(patientId);
    expect(first).not.toBe(second);
    const { ipn } = topupStack(db);
    for (const id of [first, second]) {
      await ipn.handle(
        'VNPay',
        signedVnpayIpn({ giaoDichId: id, soTien: '100000.00' }),
      );
      await ipn.handle(
        'VNPay',
        signedVnpayIpn({ giaoDichId: id, soTien: '100000.00' }),
      );
      expect(await napRows(id)).toBe(1);
    }
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '200000.00' });
    await assertWalletInvariants(db);
  });
});

describe('IpnService (payment B4)', () => {
  it('NTV-06 IPN thành công lần đầu ⇒ ThanhCong, ví cộng đúng số tiền, đúng một dòng Nap, lưu mã cổng, phản hồi 00, thông báo NapViThanhCong', async () => {
    const { patientId, walletId } = await patient();
    const id = await created(patientId);
    const { ipn } = topupStack(db);
    const ack = await ipn.handle(
      'VNPay',
      signedVnpayIpn({
        giaoDichId: id,
        soTien: '100000.00',
        transactionNo: '15741333',
      }),
    );
    expect(ack).toEqual({ RspCode: '00', Message: 'Confirm Success' });
    expect(await topupRow(id)).toMatchObject({
      trangThai: 'ThanhCong',
      doiSoat: 'KhongCan',
      maCong: '15741333',
    });
    expect(await napRows(id)).toBe(1);
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '100000.00' });
    expect(await notices(patientId, 'NapViThanhCong')).toBe(1);
    await assertWalletInvariants(db);
  });

  it('NTV-07 IPN thất bại lần đầu (khách huỷ: 24/02, TransactionNo "0") ⇒ ThatBai, mã cổng null, ví không đổi, 00; TDT-02 thông báo NapViThatBai đúng người, ≤ 500 ký tự', async () => {
    const { patientId, walletId } = await patient();
    const { patientId: other } = await patient();
    const id = await created(patientId);
    const { ipn } = topupStack(db);
    const ack = await ipn.handle(
      'VNPay',
      signedVnpayIpn({ giaoDichId: id, soTien: '100000.00', ok: false }),
    );
    expect(ack?.RspCode).toBe('00');
    expect(await topupRow(id)).toMatchObject({
      trangThai: 'ThatBai',
      maCong: null,
    });
    expect(await napRows(id)).toBe(0);
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '0.00' });
    expect(await notices(patientId, 'NapViThatBai')).toBe(1);
    expect(await notices(other, 'NapViThatBai')).toBe(0);
    const text = await one<{ noiDung: string }>(
      "SELECT noi_dung AS noiDung FROM thong_bao WHERE tai_khoan_id = ? AND loai_su_kien = 'NapViThatBai'",
      [patientId],
    );
    expect(text.noiDung.length).toBeLessThanOrEqual(500);
    expect(text.noiDung).toContain('100.000đ');
    await assertWalletInvariants(db);
  });

  it('NTV-08 IPN lặp cùng kết quả ⇒ cộng đúng một lần, lần hai phản hồi 02, không mục đối soát', async () => {
    const { patientId, walletId } = await patient();
    const id = await created(patientId);
    const { ipn } = topupStack(db);
    const signal = signedVnpayIpn({ giaoDichId: id, soTien: '100000.00' });
    expect((await ipn.handle('VNPay', signal))?.RspCode).toBe('00');
    expect((await ipn.handle('VNPay', signal))?.RspCode).toBe('02');
    expect(await napRows(id)).toBe(1);
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '100000.00' });
    expect(await topupRow(id)).toMatchObject({ doiSoat: 'KhongCan' });
    expect(await attempts(id)).toEqual([]);
    expect(await notices(patientId, 'NapViThanhCong')).toBe(1);
  });

  it('NTV-09 IPN trái kết quả đã lưu (ThanhCong rồi ThatBai, ThatBai rồi ThanhCong) ⇒ bỏ qua, 02, không đổi gì', async () => {
    const { patientId, walletId } = await patient();
    const { ipn } = topupStack(db);
    const paid = await created(patientId);
    await ipn.handle(
      'VNPay',
      signedVnpayIpn({ giaoDichId: paid, soTien: '100000.00' }),
    );
    const late = await ipn.handle(
      'VNPay',
      signedVnpayIpn({ giaoDichId: paid, soTien: '100000.00', ok: false }),
    );
    expect(late?.RspCode).toBe('02');
    expect(await topupRow(paid)).toMatchObject({ trangThai: 'ThanhCong' });

    const failed = await created(patientId);
    await ipn.handle(
      'VNPay',
      signedVnpayIpn({ giaoDichId: failed, soTien: '100000.00', ok: false }),
    );
    const flip = await ipn.handle(
      'VNPay',
      signedVnpayIpn({ giaoDichId: failed, soTien: '100000.00' }),
    );
    expect(flip?.RspCode).toBe('02');
    expect(await topupRow(failed)).toMatchObject({ trangThai: 'ThatBai' });
    expect(await napRows(failed)).toBe(0);
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '100000.00' });
    await assertWalletInvariants(db);
  });

  it('NTV-10 IPN số tiền sai (chữ ký đúng) ⇒ 04, không đổi gì', async () => {
    const { patientId, walletId } = await patient();
    const id = await created(patientId);
    const { ipn } = topupStack(db);
    const ack = await ipn.handle(
      'VNPay',
      signedVnpayIpn({ giaoDichId: id, soTien: '1000000.00' }),
    );
    expect(ack?.RspCode).toBe('04');
    expect(await topupRow(id)).toMatchObject({ trangThai: 'DangXuLy' });
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '0.00' });
  });

  it('NTV-11 IPN txnRef lạ, không phải số, của loại khác hay của cổng khác ⇒ 01', async () => {
    const w = await paymentWorld(db);
    const walletId = w.patient.wallet.viNoiBoId;
    const { ipn } = topupStack(db);
    // Nạp của cổng KHÁC (MoMo) và giao dịch LOẠI KHÁC (thanh toán lịch bằng ví) cùng số tiền
    const momo = await wf.insertPayment({
      viNoiBoId: walletId,
      loai: 'NapVi',
      phuongThuc: 'MoMo',
      soTien: '100000.00',
      trangThai: 'DangXuLy',
    });
    const lich = await w.appointment(0, { trangThai: 'DaXacNhan' });
    const lichPayment = await wf.insertPayment({
      viNoiBoId: walletId,
      lichHenId: lich.lichHenId,
      loai: 'ThanhToanLichHen',
      // CÙNG cổng VNPay (DB không chặn tổ hợp này): chỉ bộ lọc `loai = NapVi` mới loại được nó
      phuongThuc: 'VNPay',
      soTien: '100000.00',
    });
    for (const txnRef of ['999999999', 'abc', '0', '-1', momo, lichPayment]) {
      const ack = await ipn.handle(
        'VNPay',
        signedVnpayIpn({ giaoDichId: txnRef, soTien: '100000.00' }),
      );
      expect(ack?.RspCode).toBe('01');
    }
    expect(await topupRow(momo)).toMatchObject({ trangThai: 'DangXuLy' });
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '0.00' });
    // Đối chứng: dòng nạp VNPay thật của Bệnh nhân vẫn xử lý được
    const { topups } = topupStack(db);
    const { maGiaoDich } = await topups.create(w.patientId, dto('100000'), IP);
    const ok = await ipn.handle(
      'VNPay',
      signedVnpayIpn({ giaoDichId: maGiaoDich, soTien: '100000.00' }),
    );
    expect(ok?.RspCode).toBe('00');
  });

  it('NTV-12 IPN chữ ký sai hay thiếu ⇒ 97, không đổi gì', async () => {
    const { patientId, walletId } = await patient();
    const id = await created(patientId);
    const { ipn } = topupStack(db);
    const good = signedVnpayIpn({ giaoDichId: id, soTien: '100000.00' });
    const { vnp_SecureHash: _drop, ...unsigned } = good;
    for (const bad of [
      { ...good, vnp_Amount: '1' },
      { ...good, vnp_SecureHash: 'a'.repeat(128) },
      unsigned,
    ]) {
      expect((await ipn.handle('VNPay', bad))?.RspCode).toBe('97');
    }
    expect(await topupRow(id)).toMatchObject({ trangThai: 'DangXuLy' });
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '0.00' });
  });

  it('NTV-13 không có IPN nào ⇒ DangXuLy, ví không đổi, không mục đối soát', async () => {
    const { patientId, walletId } = await patient();
    const id = await created(patientId);
    expect(await topupRow(id)).toMatchObject({
      trangThai: 'DangXuLy',
      doiSoat: 'KhongCan',
    });
    expect(await attempts(id)).toEqual([]);
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '0.00' });
  });

  it('NTV-14 IPN thành công + cộng ví lỗi THẬT (số dư vượt decimal(12,2)) ⇒ ThanhCong + ChoDoiSoat, lần thử số 0, không dòng Nap, phản hồi 00', async () => {
    const { patientId, walletId } = await patient();
    await wf.fundWallet(walletId, '9999999999.99');
    const id = await created(patientId);
    const { ipn } = topupStack(db);
    const ack = await ipn.handle(
      'VNPay',
      signedVnpayIpn({ giaoDichId: id, soTien: '100000.00' }),
    );
    expect(ack?.RspCode).toBe('00');
    expect(await topupRow(id)).toMatchObject({
      trangThai: 'ThanhCong',
      doiSoat: 'ChoDoiSoat',
    });
    expect(await napRows(id)).toBe(0);
    expect(await attempts(id)).toEqual([
      { soLanThu: 0, ketQua: 'ThatBai', lyDo: 'CONG_VI_LOI_KHI_XAC_MINH' },
    ]);
    expect(await wf.readWallet(walletId)).toMatchObject({
      soDu: '9999999999.99',
    });
    expect(await notices(patientId, 'NapViThanhCong')).toBe(0);
    // IPN gửi lại sau đó ⇒ 02, không cộng (job B14 lo việc cộng lại)
    expect(
      (
        await ipn.handle(
          'VNPay',
          signedVnpayIpn({ giaoDichId: id, soTien: '100000.00' }),
        )
      )?.RspCode,
    ).toBe('02');
    expect(await napRows(id)).toBe(0);
  });

  it('TDT-01 ghi thông báo lỗi ⇒ hoàn tác CẢ lần cộng (không dòng Nap, ví nguyên), dòng chuyển ChoDoiSoat', async () => {
    const { patientId, walletId } = await patient();
    const id = await created(patientId);
    const { ipn } = topupStack(db);
    failAfterStatement(
      db,
      /^INSERT INTO thong_bao/,
      new Error('ghi thông báo lỗi (giả)'),
    );
    const ack = await ipn.handle(
      'VNPay',
      signedVnpayIpn({ giaoDichId: id, soTien: '100000.00' }),
    );
    expect(ack?.RspCode).toBe('00');
    expect(await napRows(id)).toBe(0);
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '0.00' });
    expect(await topupRow(id)).toMatchObject({
      trangThai: 'ThanhCong',
      doiSoat: 'ChoDoiSoat',
    });
    expect(await notices(patientId, 'NapViThanhCong')).toBe(0);
    await assertWalletInvariants(db);
  });

  it('NTV-15 cả hai giao dịch lỗi ⇒ phản hồi 99 (không báo đã nhận), không ghi gì, dòng còn DangXuLy', async () => {
    const { patientId, walletId } = await patient();
    const id = await created(patientId);
    const { ipn } = topupStack(db);
    failAfterStatement(
      db,
      /^UPDATE giao_dich_thanh_toan/,
      new Error('ghi lỗi (giả)'),
      2,
    );
    const ack = await ipn.handle(
      'VNPay',
      signedVnpayIpn({ giaoDichId: id, soTien: '100000.00' }),
    );
    expect(ack?.RspCode).toBe('99');
    expect(await topupRow(id)).toMatchObject({
      trangThai: 'DangXuLy',
      doiSoat: 'KhongCan',
    });
    expect(await napRows(id)).toBe(0);
    expect(await attempts(id)).toEqual([]);
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '0.00' });
    await assertWalletInvariants(db);
  });

  it('NTV-16 mã cổng đã dùng cho giao dịch khác (UNIQUE 1062) ⇒ từ chối (99), không cộng; log không chứa mã cổng', async () => {
    const { patientId, walletId } = await patient();
    const used = await created(patientId);
    const id = await created(patientId);
    const { ipn } = topupStack(db);
    await ipn.handle(
      'VNPay',
      signedVnpayIpn({
        giaoDichId: used,
        soTien: '100000.00',
        transactionNo: '77777777',
      }),
    );
    const ack = await ipn.handle(
      'VNPay',
      signedVnpayIpn({
        giaoDichId: id,
        soTien: '100000.00',
        transactionNo: '77777777',
      }),
    );
    expect(ack?.RspCode).toBe('99');
    expect(await napRows(id)).toBe(0);
    expect(await topupRow(id)).toMatchObject({ trangThai: 'DangXuLy' });
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '100000.00' });
    expect(logs.join('\n')).not.toContain('77777777');
    await assertWalletInvariants(db);
  });

  it('NTV-17 nạp thành công sau khi lịch ChoThanhToan đã bị huỷ ⇒ vẫn cộng ví, lịch không đổi trạng thái', async () => {
    const w = await paymentWorld(db);
    const lich = await w.appointment(0, { trangThai: 'DaHuy' });
    const { topups, ipn } = topupStack(db);
    const { maGiaoDich } = await topups.create(w.patientId, dto('100000'), IP);
    const ack = await ipn.handle(
      'VNPay',
      signedVnpayIpn({ giaoDichId: maGiaoDich, soTien: '100000.00' }),
    );
    expect(ack?.RspCode).toBe('00');
    expect(await wf.readWallet(w.patient.wallet.viNoiBoId)).toMatchObject({
      soDu: '100000.00',
    });
    const state = await one<{ trangThai: string }>(
      'SELECT trang_thai AS trangThai FROM lich_hen WHERE lich_hen_id = ?',
      [lich.lichHenId],
    );
    expect(state.trangThai).toBe('DaHuy');
    await assertWalletInvariants(db);
  });

  it('NTV-19 IPN của giao dịch Bệnh nhân A không đổi ví Bệnh nhân B', async () => {
    const a = await patient();
    const b = await patient();
    const id = await created(a.patientId);
    const { ipn } = topupStack(db);
    await ipn.handle(
      'VNPay',
      signedVnpayIpn({ giaoDichId: id, soTien: '100000.00' }),
    );
    expect(await wf.readWallet(a.walletId)).toMatchObject({
      soDu: '100000.00',
    });
    expect(await wf.readWallet(b.walletId)).toMatchObject({ soDu: '0.00' });
    expect(await notices(b.patientId, 'NapViThanhCong')).toBe(0);
  });

  it('NTV-23 IPN thành công đến muộn (quá cửa sổ nạp chờ xác nhận 90 phút) ⇒ vẫn xử lý như tín hiệu đầu: ThanhCong, cộng một lần, 00', async () => {
    const { patientId, walletId } = await patient();
    const id = await created(patientId);
    vi.setSystemTime(new Date(T0.getTime() + 3 * 60 * 60_000)); // 3 giờ sau
    const { ipn } = topupStack(db);
    const ack = await ipn.handle(
      'VNPay',
      signedVnpayIpn({ giaoDichId: id, soTien: '100000.00' }),
    );
    expect(ack?.RspCode).toBe('00');
    expect(await topupRow(id)).toMatchObject({ trangThai: 'ThanhCong' });
    expect(await napRows(id)).toBe(1);
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '100000.00' });
  });

  it('BDT-01 (dịch vụ) log của tạo nạp và IPN không chứa chữ ký, mã cổng, mã merchant, khoá hay số tiền', async () => {
    const { patientId } = await patient();
    const id = await created(patientId);
    const { ipn } = topupStack(db);
    const good = signedVnpayIpn({
      giaoDichId: id,
      soTien: '123456.00',
      transactionNo: '55554444',
    });
    await ipn.handle('VNPay', { ...good, vnp_Amount: '1' }); // chữ ký sai ⇒ có log cảnh báo
    await ipn.handle('VNPay', good);
    const text = logs.join('\n');
    for (const secret of [
      good.vnp_SecureHash!,
      '55554444',
      'TESTTMN1',
      'KHOA_GIA_CHI_DE_TEST',
      '123456',
      '12345600',
    ])
      expect(text).not.toContain(secret);
  });
});
