import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { paymentWorld } from '../../payment/testing/payment-world.js';
import {
  assertWalletInvariants,
  findWalletInvariantViolations,
  ivt03Sql,
  type InvariantCode,
} from './wallet-invariants.js';
import { WalletFixtures } from './wallet-fixtures.js';

// payment P3 — IVT-01…IVT-07 kiểm HAI CHIỀU (PLAN payment 5.2, 7.15) trên MySQL 8.4 THẬT: dữ liệu đúng ⇒ không vi phạm; mỗi lần cố ý làm lệch MỘT chỗ ⇒ đúng bất biến đó (và chỉ nó) báo.
let db: DataSource;
let wf: WalletFixtures;
useIntegrationHooks((d) => {
  db = d;
  wf = new WalletFixtures(d);
});

/** Thế giới chuẩn, mọi bất biến đúng: nạp 300.000, thanh toán cọc 100.000 bằng ví, hoàn 40.000, yêu cầu rút 50.000 đang chờ duyệt. */
async function consistentWorld() {
  const w = await paymentWorld(db);
  const walletId = w.patient.wallet.viNoiBoId;
  await wf.fundWallet(walletId, '300000.00');
  const lich = await w.appointment(0, { trangThai: 'DaXacNhan' });
  const paid = await wf.insertPayment({
    viNoiBoId: walletId,
    lichHenId: lich.lichHenId,
    loai: 'ThanhToanLichHen',
    phuongThuc: 'Vi',
    soTien: '100000.00',
  });
  await wf.insertLedgerRow({
    viNoiBoId: walletId,
    loai: 'ThanhToan',
    soTien: '-100000.00',
    soDuSau: '200000.00',
    giaoDichThanhToanId: paid,
  });
  const refund = await wf.insertRefund({
    giaoDichThanhToanId: paid,
    viNoiBoId: walletId,
    soTien: '40000.00',
  });
  await wf.insertLedgerRow({
    viNoiBoId: walletId,
    loai: 'HoanTien',
    soTien: '40000.00',
    soDuSau: '240000.00',
    lichSuHoanTienId: refund,
  });
  await wf.insertWithdrawal({ viNoiBoId: walletId, soTien: '50000.00' });
  await wf.setWallet(walletId, '240000.00', '50000.00');
  return { w, walletId, lich, paid, refund };
}

const onlyBroken = async (
  options: Parameters<typeof findWalletInvariantViolations>[1] = {},
): Promise<InvariantCode[]> =>
  Object.entries(await findWalletInvariantViolations(db, options))
    .filter(([, found]) => found.length > 0)
    .map(([code]) => code as InvariantCode);

describe('IVT chiều dương: dữ liệu đúng không bị báo', () => {
  it('ví mới, chưa có gì: mọi bất biến đúng (số dư 0, không dòng sổ cái)', async () => {
    await wf.patientWithWallet();
    await assertWalletInvariants(db);
  });

  it('thế giới chuẩn có nạp, thanh toán, hoàn, giữ tiền rút: IVT-01…IVT-07 đều đúng; bật cả phần đủ cọc của IVT-07 vẫn đúng', async () => {
    await consistentWorld();
    await assertWalletInvariants(db);
    await assertWalletInvariants(db, { requireDepositCovered: true });
  });

  it('IVT-04: NapVi ThanhCong nhưng ChoDoiSoat và chưa có dòng Nap là ĐÚNG (cộng ví lỗi chờ đối soát)', async () => {
    const { walletId } = await consistentWorld();
    await wf.insertPayment({
      viNoiBoId: walletId,
      loai: 'NapVi',
      phuongThuc: 'VNPay',
      soTien: '70000.00',
      trangThaiDoiSoat: 'ChoDoiSoat',
    });
    await assertWalletInvariants(db);
  });

  it('IVT-06 biên: hoàn đúng bằng số đã thanh toán là đúng; một lần thử ThatBai không có dòng sổ cái cũng đúng', async () => {
    const { walletId, paid } = await consistentWorld();
    const rest = await wf.insertRefund({
      giaoDichThanhToanId: paid,
      viNoiBoId: walletId,
      soTien: '60000.00',
      soLanThu: 2,
    });
    await wf.insertLedgerRow({
      viNoiBoId: walletId,
      loai: 'HoanTien',
      soTien: '60000.00',
      soDuSau: '300000.00',
      lichSuHoanTienId: rest,
    });
    await wf.setWallet(walletId, '300000.00', '50000.00');
    await wf.insertRefund({
      giaoDichThanhToanId: paid,
      viNoiBoId: walletId,
      soTien: '10000.00',
      trangThai: 'ThatBai',
      soLanThu: 3,
    });
    await assertWalletInvariants(db);
  });
});

describe('IVT chiều âm: cố ý làm lệch một chỗ thì đúng bất biến đó báo', () => {
  it('IVT-01: so_du lệch khỏi tổng sổ cái', async () => {
    const { walletId } = await consistentWorld();
    await wf.setWallet(walletId, '250000.00', '50000.00');
    expect(await onlyBroken()).toEqual(['IVT-01']);
  });

  it('IVT-01: dòng sổ cái mồ côi (không đổi so_du) cũng bị bắt', async () => {
    const { walletId, paid } = await consistentWorld();
    await wf.insertLedgerRow({
      viNoiBoId: walletId,
      loai: 'ThanhToan',
      soTien: '-1000.00',
      soDuSau: '239000.00',
      giaoDichThanhToanId: paid,
    });
    expect(await onlyBroken()).toContain('IVT-01');
  });

  it('IVT-02: so_tien_dang_giu lệch khỏi tổng yêu cầu rút ChoDuyet', async () => {
    const { walletId } = await consistentWorld();
    await wf.setWallet(walletId, '240000.00', '60000.00');
    expect(await onlyBroken()).toEqual(['IVT-02']);
  });

  it('IVT-02: yêu cầu rút ChoDuyet nhưng ví không giữ tiền', async () => {
    const { walletId } = await consistentWorld();
    await wf.setWallet(walletId, '240000.00', '0.00');
    expect(await onlyBroken()).toEqual(['IVT-02']);
  });

  it('IVT-03: bảng tạm có ví giữ quá số dư hay âm bị bắt, ví hợp lệ (kể cả biên giữ = số dư) không bị bắt', async () => {
    // `chk_vi_so_du` của DB không cho chèn dòng lệch vào vi_noi_bo, nên chạy đúng truy vấn của IVT-03 trên bảng tạm không có CHECK
    await db.query(
      'CREATE TEMPORARY TABLE vi_tam (vi_noi_bo_id BIGINT, so_du DECIMAL(12,2), so_tien_dang_giu DECIMAL(12,2))',
    );
    await db.query(
      `INSERT INTO vi_tam VALUES (1, 100, 0), (2, 100, 100), (3, 100, 100.01), (4, -1, 0), (5, 100, -1)`,
    );
    const rows: { id: string }[] = await db.query(ivt03Sql('vi_tam'));
    expect(rows.map((row) => row.id).sort()).toEqual(['3', '4', '5']);
  });

  it('IVT-04: NapVi ThanhCong KhongCan mà thiếu dòng Nap bị bắt; ChoDoiSoat mà đã có dòng Nap cũng bị bắt', async () => {
    const { walletId } = await consistentWorld();
    await wf.insertPayment({
      viNoiBoId: walletId,
      loai: 'NapVi',
      phuongThuc: 'VNPay',
      soTien: '70000.00',
    });
    expect(await onlyBroken()).toEqual(['IVT-04']);

    await resetNapPayments();
    const both = await wf.insertPayment({
      viNoiBoId: walletId,
      loai: 'NapVi',
      phuongThuc: 'MoMo',
      soTien: '10000.00',
      trangThaiDoiSoat: 'ChoDoiSoat',
    });
    await wf.insertLedgerRow({
      viNoiBoId: walletId,
      loai: 'Nap',
      soTien: '10000.00',
      soDuSau: '250000.00',
      giaoDichThanhToanId: both,
    });
    await wf.setWallet(walletId, '250000.00', '50000.00');
    expect(await onlyBroken()).toEqual(['IVT-04']);
  });

  it('IVT-04: hai dòng Nap cho một giao dịch bị bắt (cộng ví hai lần)', async () => {
    const { walletId } = await consistentWorld();
    const nap = await wf.insertPayment({
      viNoiBoId: walletId,
      loai: 'NapVi',
      phuongThuc: 'VNPay',
      soTien: '10000.00',
    });
    for (const after of ['250000.00', '260000.00'])
      await wf.insertLedgerRow({
        viNoiBoId: walletId,
        loai: 'Nap',
        soTien: '10000.00',
        soDuSau: after,
        giaoDichThanhToanId: nap,
      });
    await wf.setWallet(walletId, '260000.00', '50000.00');
    expect(await onlyBroken()).toEqual(['IVT-04']);
  });

  it('IVT-05: thanh toán bằng ví không có dòng ThanhToan bị bắt; dòng ThanhToan sai số tiền cũng bị bắt', async () => {
    const { w, walletId } = await consistentWorld();
    const lich2 = await w.appointment(1, { trangThai: 'DaXacNhan' });
    const noLedger = await wf.insertPayment({
      viNoiBoId: walletId,
      lichHenId: lich2.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'Vi',
      soTien: '30000.00',
    });
    expect(await onlyBroken()).toContain('IVT-05');

    await wf.insertLedgerRow({
      viNoiBoId: walletId,
      loai: 'ThanhToan',
      soTien: '-20000.00',
      soDuSau: '220000.00',
      giaoDichThanhToanId: noLedger,
    });
    await wf.setWallet(walletId, '220000.00', '50000.00');
    expect(await onlyBroken()).toEqual(['IVT-05']);
  });

  it('IVT-06: tổng hoàn vượt số đã thanh toán bị bắt; dòng hoàn ThanhCong thiếu dòng HoanTien cũng bị bắt', async () => {
    const { walletId, paid } = await consistentWorld();
    await wf.insertRefund({
      giaoDichThanhToanId: paid,
      viNoiBoId: walletId,
      soTien: '60000.01',
      soLanThu: 2,
    });
    // vượt (40.000 + 60.000,01 > 100.000) và thiếu dòng sổ cái của lần hoàn vừa thêm
    expect(await onlyBroken()).toEqual(['IVT-06']);
  });

  it('IVT-07: hai thanh toán Vi > 0 cho một lịch bị bắt', async () => {
    const { walletId, lich } = await consistentWorld();
    const second = await wf.insertPayment({
      viNoiBoId: walletId,
      lichHenId: lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'Vi',
      soTien: '5000.00',
    });
    await wf.insertLedgerRow({
      viNoiBoId: walletId,
      loai: 'ThanhToan',
      soTien: '-5000.00',
      soDuSau: '235000.00',
      giaoDichThanhToanId: second,
    });
    await wf.setWallet(walletId, '235000.00', '50000.00');
    expect(await onlyBroken()).toEqual(['IVT-07']);
  });

  it('IVT-07: một tiền mặt cho một lịch là đúng; hai tiền mặt cho một lịch bị bắt', async () => {
    const { w, lich } = await consistentWorld();
    const cash = () =>
      wf.insertPayment({
        lichHenId: lich.lichHenId,
        loai: 'ThanhToanLichHen',
        phuongThuc: 'TienMatTaiQuay',
        soTien: '10000.00',
        nguoiThuId: w.receptionist.account.taiKhoanId,
      });
    await cash();
    expect(await onlyBroken()).toEqual([]);
    await cash();
    expect(await onlyBroken()).toEqual(['IVT-07']);
  });

  it('IVT-07: giao dịch trỏ HAI lịch khác nhau của CÙNG chuỗi đổi lịch bị bắt (phải trỏ lịch gốc)', async () => {
    const w = await paymentWorld(db);
    const walletId = w.patient.wallet.viNoiBoId;
    const [goc, moi] = await w.chain(2);
    await wf.fundWallet(walletId, '300000.00');
    let balance = 300000;
    for (const lich of [goc!, moi!]) {
      const payment = await wf.insertPayment({
        viNoiBoId: walletId,
        lichHenId: lich.lichHenId,
        loai: 'ThanhToanLichHen',
        phuongThuc: 'Vi',
        soTien: '50000.00',
      });
      balance -= 50000;
      await wf.insertLedgerRow({
        viNoiBoId: walletId,
        loai: 'ThanhToan',
        soTien: '-50000.00',
        soDuSau: `${balance}.00`,
        giaoDichThanhToanId: payment,
      });
    }
    await wf.setWallet(walletId, `${balance}.00`);
    expect(await onlyBroken()).toEqual(['IVT-07']);
  });

  it('IVT-07 phần đủ cọc (bật bằng tuỳ chọn): lịch DaXacNhan có cọc mà chưa thu đủ bị bắt; mặc định tắt thì không báo', async () => {
    const w = await paymentWorld(db);
    await w.appointment(0, { trangThai: 'DaXacNhan', coc: '100000.00' });
    expect(await onlyBroken()).toEqual([]);
    expect(await onlyBroken({ requireDepositCovered: true })).toEqual([
      'IVT-07',
    ]);
  });

  it('assertWalletInvariants ném lỗi nêu mã và id khi có vi phạm', async () => {
    const { walletId } = await consistentWorld();
    await wf.setWallet(walletId, '250000.00', '50000.00');
    await expect(assertWalletInvariants(db)).rejects.toThrow(
      new RegExp(`IVT-01 \\(id ${walletId}\\)`),
    );
  });
});

// Xoá các giao dịch nạp thêm của ca đang chạy để dựng lại tình huống khác trong cùng một test
async function resetNapPayments() {
  await db.query(
    "DELETE FROM giao_dich_thanh_toan WHERE loai = 'NapVi' AND so_tien = 70000.00",
  );
}
