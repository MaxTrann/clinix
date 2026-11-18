import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { PatientWalletService } from '../balance/patient-wallet.service.js';
import { WalletBalanceRepository } from '../balance/wallet-balance.repository.js';
import { WalletFixtures } from '../testing/wallet-fixtures.js';
import { assertWalletInvariants } from '../testing/wallet-invariants.js';
import { withdrawalStack } from '../testing/withdrawal-stack.js';

// payment B11 — `WithdrawalService` THẬT trên MySQL 8.4 THẬT (PLAN payment 5.8; RTV-01…RTV-06, RTV-08, TDT-02 vế `RutTienDaGui`). Phần đồng thời (DTT-10): withdrawal.concurrency.int-spec.ts;
// DTT-04 (đua thanh toán cọc) ở payment/deposit/deposit-payment.concurrency.int-spec.ts. Phần HTTP (RTV-07): test/wallet-withdrawal.e2e-spec.ts. Dữ liệu giả.
let db: DataSource;
let wf: WalletFixtures;
useIntegrationHooks((d) => {
  db = d;
  wf = new WalletFixtures(d);
});

async function failure(work: Promise<unknown>) {
  try {
    await work;
  } catch (error) {
    if (error instanceof AppException)
      return {
        status: error.getStatus(),
        maLoi: error.maLoi,
        chiTiet: (error.getResponse() as { chiTiet?: unknown }).chiTiet,
      };
    throw error;
  }
  throw new Error('mong đợi AppException nhưng không có lỗi');
}

const count = async (sql: string, params: unknown[]) =>
  Number((await db.query<{ n: string }[]>(sql, params))[0]!.n);
const requests = (walletId: string) =>
  db.query<
    {
      soTien: string;
      trangThai: string;
      nguoi: string | null;
      xuLy: Date | null;
    }[]
  >(
    `SELECT so_tien AS soTien, trang_thai AS trangThai, nguoi_xu_ly_id AS nguoi, thoi_diem_xu_ly AS xuLy
       FROM yeu_cau_rut_tien WHERE vi_noi_bo_id = ? ORDER BY yeu_cau_rut_tien_id`,
    [walletId],
  );
const ledgerRows = (walletId: string) =>
  count('SELECT COUNT(*) AS n FROM giao_dich_vi WHERE vi_noi_bo_id = ?', [
    walletId,
  ]);
const notices = (taiKhoanId: string) =>
  db.query<{ noiDung: string }[]>(
    "SELECT noi_dung AS noiDung FROM thong_bao WHERE tai_khoan_id = ? AND loai_su_kien = 'RutTienDaGui'",
    [taiKhoanId],
  );

/** Bệnh nhân có ví nạp `soDu` (nhất quán với sổ cái). */
async function funded(soDu: string) {
  const patient = await wf.patientWithWallet();
  if (soDu !== '0.00') await wf.fundWallet(patient.walletId, soDu);
  return patient;
}

describe('WithdrawalService.request (payment B11)', () => {
  it('RTV-01 ★ yêu cầu hợp lệ ⇒ ChoDuyet, so_tien_dang_giu tăng, khả dụng giảm, KHÔNG ghi giao_dich_vi, thông báo RutTienDaGui (TDT-02, ≤ 500 ký tự)', async () => {
    const { patientId, walletId } = await funded('350000.00');
    const before = await ledgerRows(walletId);
    const result = await withdrawalStack(db).request(patientId, '100000');
    expect(result).toEqual({
      maYeuCau: expect.stringMatching(/^[1-9]\d*$/),
      soTien: '100000.00',
      soDuKhaDung: '250000.00',
      soTienDangGiu: '100000.00',
    });
    expect(await wf.readWallet(walletId)).toEqual({
      soDu: '350000.00',
      soTienDangGiu: '100000.00',
    });
    expect(await ledgerRows(walletId)).toBe(before);
    expect(await requests(walletId)).toEqual([
      { soTien: '100000.00', trangThai: 'ChoDuyet', nguoi: null, xuLy: null },
    ]);
    const sent = await notices(patientId);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.noiDung).toContain('100.000đ');
    expect(sent[0]!.noiDung.length).toBeLessThanOrEqual(500);
    await assertWalletInvariants(db);
  });

  it('RTV-02 số tiền > khả dụng ⇒ 409 SO_DU_KHONG_DU kèm chiTiet; khả dụng là số dư TRỪ phần đang giữ; không ghi gì', async () => {
    const { patientId, walletId } = await funded('200000.00');
    await wf.setWallet(walletId, '200000.00', '150000.00');
    expect(
      await failure(withdrawalStack(db).request(patientId, '60000')),
    ).toEqual({
      status: 409,
      maLoi: 'SO_DU_KHONG_DU',
      chiTiet: { soDuKhaDung: '50000.00', soTienCan: '60000.00' },
    });
    expect(await wf.readWallet(walletId)).toEqual({
      soDu: '200000.00',
      soTienDangGiu: '150000.00',
    });
    expect(await requests(walletId)).toEqual([]);
    expect(await notices(patientId)).toEqual([]);
  });

  it('RTV-03 dưới tối thiểu ⇒ 400 SO_TIEN_NGOAI_HAN_MUC (chiTiet.toiThieu); đúng bằng tối thiểu và đúng bằng khả dụng được nhận (biên)', async () => {
    const a = await funded('350000.00');
    expect(
      await failure(withdrawalStack(db).request(a.patientId, '9999')),
    ).toEqual({
      status: 400,
      maLoi: 'SO_TIEN_NGOAI_HAN_MUC',
      chiTiet: { toiThieu: '10000.00' },
    });
    expect(await requests(a.walletId)).toEqual([]);
    expect(
      (await withdrawalStack(db).request(a.patientId, '10000')).soTien,
    ).toBe('10000.00');
    const b = await funded('350000.00');
    const all = await withdrawalStack(db).request(b.patientId, '350000');
    expect(all).toMatchObject({
      soDuKhaDung: '0.00',
      soTienDangGiu: '350000.00',
    });
    await assertWalletInvariants(db);
  });

  it('RTV-04 đã có yêu cầu ChoDuyet ⇒ 409 DA_CO_YEU_CAU_CHO_DUYET (bấm đúp không giữ tiền hai lần); yêu cầu cũ đã xử lý thì gửi được', async () => {
    const { patientId, walletId } = await funded('350000.00');
    await withdrawalStack(db).request(patientId, '100000');
    expect(
      await failure(withdrawalStack(db).request(patientId, '50000')),
    ).toMatchObject({
      status: 409,
      maLoi: 'DA_CO_YEU_CAU_CHO_DUYET',
    });
    expect(await wf.readWallet(walletId)).toMatchObject({
      soTienDangGiu: '100000.00',
    });
    // Giả lập B12 từ chối (nhả tiền, có người và thời điểm xử lý): yêu cầu mới được phép
    const admin = await wf.admin.admin();
    await db.query(
      "UPDATE yeu_cau_rut_tien SET trang_thai = 'TuChoi', nguoi_xu_ly_id = ?, thoi_diem_xu_ly = '2026-11-02 09:00:00' WHERE vi_noi_bo_id = ?",
      [admin.account.taiKhoanId, walletId],
    );
    await wf.setWallet(walletId, '350000.00', '0.00');
    expect(
      (await withdrawalStack(db).request(patientId, '50000')).soTienDangGiu,
    ).toBe('50000.00');
  });

  it('RTV-05 khả dụng 0 (ví rỗng, hay toàn bộ đang giữ) ⇒ từ chối SO_DU_KHONG_DU', async () => {
    const empty = await wf.patientWithWallet();
    expect(
      await failure(withdrawalStack(db).request(empty.patientId, '10000')),
    ).toMatchObject({
      maLoi: 'SO_DU_KHONG_DU',
      chiTiet: { soDuKhaDung: '0.00' },
    });
    expect(await requests(empty.walletId)).toEqual([]);
  });

  it('RTV-06 vượt khả dụng KHÔNG đi qua chk_vi_so_du (3819): bị chặn bằng kết quả có kiểu dưới khoá ví, không thành lỗi 500', async () => {
    const { patientId, walletId } = await funded('100000.00');
    // Số rất lớn (vẫn ≤ 10 chữ số): nếu bỏ kiểm dưới khoá, UPDATE ví sẽ vi phạm chk_vi_so_du và ném QueryFailedError
    const result = await failure(
      withdrawalStack(db).request(patientId, '9999999999'),
    );
    expect(result).toMatchObject({ status: 409, maLoi: 'SO_DU_KHONG_DU' });
    expect(await wf.readWallet(walletId)).toEqual({
      soDu: '100000.00',
      soTienDangGiu: '0.00',
    });
    await assertWalletInvariants(db);
  });

  it('RTV-08 GET /patient/wallet: yeuCauRutGanNhat đúng ở ChoDuyet, DaDuyet, TuChoi (khoá, số tiền, trạng thái của yêu cầu MỚI NHẤT)', async () => {
    const { patientId } = await funded('350000.00');
    const created = await withdrawalStack(db).request(patientId, '100000');
    const overview = () =>
      new PatientWalletService(db, new WalletBalanceRepository(), []).overview(
        patientId,
      );
    expect((await overview()).yeuCauRutGanNhat).toMatchObject({
      maYeuCau: created.maYeuCau,
      soTien: '100000.00',
      trangThai: 'ChoDuyet',
    });
    const admin = await wf.admin.admin();
    for (const trangThai of ['DaDuyet', 'TuChoi'] as const) {
      await db.query(
        'UPDATE yeu_cau_rut_tien SET trang_thai = ?, nguoi_xu_ly_id = ?, thoi_diem_xu_ly = ? WHERE yeu_cau_rut_tien_id = ?',
        [
          trangThai,
          admin.account.taiKhoanId,
          '2026-11-02 09:00:00',
          created.maYeuCau,
        ],
      );
      expect((await overview()).yeuCauRutGanNhat).toMatchObject({
        maYeuCau: created.maYeuCau,
        trangThai,
      });
    }
  });
});
