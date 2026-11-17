import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { paymentWorld } from '../../payment/testing/payment-world.js';
import { WalletFixtures } from '../testing/wallet-fixtures.js';
import { PatientWalletService } from './patient-wallet.service.js';
import { WalletBalanceReader } from './wallet-balance.reader.js';
import { WalletBalanceRepository } from './wallet-balance.repository.js';
import type { WalletTransactionsQuery } from './wallet-balance.dto.js';
import type { TopupGateway } from '../wallet.constants.js';

// payment B1 — PatientWalletService và WalletBalanceReader THẬT trên MySQL 8.4 THẬT (PLAN payment 5.11 #1, #2; SDV-01…SDV-07, SDV-09, HDT-04; EXPLAIN của M11). Phần HTTP (QTT-02, 03, 05, 07, 12): test/wallet-balance.e2e-spec.ts.
// Đồng hồ là tham số `now` của service (không cần đồng hồ giả). Dữ liệu giả; dòng dựng THẲNG bằng SQL qua `WalletFixtures` để có cả ca biên giờ.
let db: DataSource;
let wf: WalletFixtures;
useIntegrationHooks((d) => {
  db = d;
  wf = new WalletFixtures(d);
});

const NOW = new Date('2026-11-17T10:00:00+07:00');
const repository = new WalletBalanceRepository();
const serviceWith = (gateways: TopupGateway[] = ['VNPay', 'MoMo']) =>
  new PatientWalletService(db, repository, gateways);
const query = (over: Partial<WalletTransactionsQuery> = {}) => ({
  trang: 1,
  kichThuoc: 20,
  offset: 0,
  ...over,
});

/** Bệnh nhân có ví đã nạp `soDu` nhất quán với sổ cái. */
async function funded(soDu: string) {
  const patient = await wf.patientWithWallet();
  if (soDu !== '0.00') await wf.fundWallet(patient.walletId, soDu);
  return patient;
}

describe('SDV-01 ví mới và ví có số dư', () => {
  it('ví mới ⇒ khả dụng, đang giữ, nạp chờ "0.00"; yeuCauRutGanNhat null; hạn mức Q20 và cổng đã cấu hình', async () => {
    const { patientId } = await wf.patientWithWallet();
    const result = await serviceWith().overview(patientId, NOW);
    expect(result).toEqual({
      soDuKhaDung: '0.00',
      soTienDangGiu: '0.00',
      soDu: '0.00',
      napChoXacNhan: '0.00',
      yeuCauRutGanNhat: null,
      hanMucNap: { toiThieu: '50000.00', toiDa: '2000000.00' },
      congThanhToan: ['VNPay', 'MoMo'],
    });
  });

  it('không có hàng ví ⇒ 404 KHONG_TIM_THAY (overview và transactions)', async () => {
    const service = serviceWith();
    for (const call of [
      () => service.overview('999999999', NOW),
      () => service.transactions('999999999', query(), NOW),
    ])
      await expect(call()).rejects.toMatchObject({
        status: 404,
        message: 'KHONG_TIM_THAY',
      });
  });
});

describe('SDV-02 số đang giữ và yêu cầu rút gần nhất', () => {
  it('có yêu cầu ChoDuyet ⇒ khả dụng = số dư − giữ; yeuCauRutGanNhat là yêu cầu MỚI NHẤT theo thời điểm', async () => {
    const { patientId, walletId } = await funded('300000.00');
    await wf.setWallet(walletId, '300000.00', '50000.00');
    const admin = await wf.admin.admin();
    await wf.insertWithdrawal({
      viNoiBoId: walletId,
      soTien: '20000.00',
      trangThai: 'TuChoi',
      nguoiXuLyId: admin.account.taiKhoanId,
      thoiDiemYeuCau: '2026-11-10 09:00:00',
    });
    const latest = await wf.insertWithdrawal({
      viNoiBoId: walletId,
      soTien: '50000.00',
      thoiDiemYeuCau: '2026-11-12 09:30:00',
    });
    const result = await serviceWith().overview(patientId, NOW);
    expect(result.soDu).toBe('300000.00');
    expect(result.soTienDangGiu).toBe('50000.00');
    expect(result.soDuKhaDung).toBe('250000.00');
    expect(result.yeuCauRutGanNhat).toEqual({
      maYeuCau: latest,
      soTien: '50000.00',
      trangThai: 'ChoDuyet',
      thoiDiemYeuCau: '2026-11-12T02:30:00.000Z',
    });
  });
});

describe('SDV-03 nạp chờ xác nhận chỉ tính DangXuLy còn trong cửa sổ (biên 90 phút)', () => {
  it('đúng biên cửa sổ còn tính, sớm hơn một giây thì không; ThanhCong, ThatBai không tính; cộng theo cổng', async () => {
    const { patientId, walletId } = await wf.patientWithWallet();
    const nap = (soTien: string, thoiDiemTao: string, extra = {}) =>
      wf.insertPayment({
        viNoiBoId: walletId,
        loai: 'NapVi',
        phuongThuc: 'VNPay',
        soTien,
        trangThai: 'DangXuLy',
        thoiDiemTao,
        ...extra,
      });
    // NOW = 10:00, cửa sổ 90 phút ⇒ mốc 08:30:00
    await nap('100000.00', '2026-11-17 08:30:00'); // đúng biên: còn tính
    await nap('50000.00', '2026-11-17 08:29:59'); // quá một giây: không tính
    await nap('70000.00', '2026-11-17 09:59:00'); // mới tạo: tính
    await nap('60000.00', '2026-11-17 09:00:00', { trangThai: 'ThatBai' });
    await nap('80000.00', '2026-11-17 09:00:00', { trangThai: 'ThanhCong' });
    await nap('90000.00', '2026-11-17 09:00:00', { trangThai: 'KhoiTao' });
    await nap('55000.00', '2026-11-17 09:00:00', { phuongThuc: 'MoMo' });
    const result = await serviceWith().overview(patientId, NOW);
    expect(result.napChoXacNhan).toBe('225000.00'); // 100.000 + 70.000 + 55.000
  });
});

describe('SDV-04 cổng đã cấu hình', () => {
  it('chỉ liệt kê cổng được cấp; không cổng nào ⇒ mảng rỗng', async () => {
    const { patientId } = await wf.patientWithWallet();
    expect(
      (await serviceWith(['VNPay']).overview(patientId, NOW)).congThanhToan,
    ).toEqual(['VNPay']);
    expect(
      (await serviceWith([]).overview(patientId, NOW)).congThanhToan,
    ).toEqual([]);
  });
});

describe('SDV-05 lịch sử hợp ba nguồn', () => {
  it('sổ cái, nạp chưa ra sổ và yêu cầu rút; mới nhất trước; soTien có dấu; yêu cầu DaDuyet không hiện hai lần', async () => {
    const w = await paymentWorld(db);
    const walletId = w.patient.wallet.viNoiBoId;
    const admin = await wf.admin.admin();
    await wf.fundWallet(walletId, '300000.00'); // Nap 300.000 lúc FIXTURE_TIME (02/11)
    const lich = await w.appointment(0, { trangThai: 'DaXacNhan' });
    const paid = await wf.insertPayment({
      viNoiBoId: walletId,
      lichHenId: lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'Vi',
      soTien: '100000.00',
      thoiDiemTao: '2026-11-05 09:00:00',
    });
    await wf.insertLedgerRow({
      viNoiBoId: walletId,
      loai: 'ThanhToan',
      soTien: '-100000.00',
      soDuSau: '200000.00',
      giaoDichThanhToanId: paid,
      thoiDiem: '2026-11-05 09:00:00',
    });
    await wf.insertPayment({
      viNoiBoId: walletId,
      loai: 'NapVi',
      phuongThuc: 'VNPay',
      soTien: '60000.00',
      trangThai: 'ThatBai',
      thoiDiemTao: '2026-11-10 09:00:00',
    });
    const approved = await wf.insertWithdrawal({
      viNoiBoId: walletId,
      soTien: '40000.00',
      trangThai: 'DaDuyet',
      nguoiXuLyId: admin.account.taiKhoanId,
      thoiDiemYeuCau: '2026-11-11 09:00:00',
    });
    await wf.insertLedgerRow({
      viNoiBoId: walletId,
      loai: 'Rut',
      soTien: '-40000.00',
      soDuSau: '160000.00',
      yeuCauRutTienId: approved,
      thoiDiem: '2026-11-12 09:00:00',
    });
    const pending = await wf.insertWithdrawal({
      viNoiBoId: walletId,
      soTien: '30000.00',
      thoiDiemYeuCau: '2026-11-15 09:00:00',
    });

    const page = await serviceWith().transactions(w.patientId, query(), NOW);
    expect(page.total).toBe(5);
    expect(page.items.map((i) => [i.loai, i.soTien, i.trangThai])).toEqual([
      ['Rut', '-30000.00', 'ChoDuyet'],
      ['Rut', '-40000.00', 'ThanhCong'], // dòng sổ cái của yêu cầu DaDuyet; chính yêu cầu không hiện lại
      ['Nap', '60000.00', 'ThatBai'],
      ['ThanhToan', '-100000.00', 'ThanhCong'],
      ['Nap', '300000.00', 'ThanhCong'],
    ]);
    expect(page.items[0]?.id).toBe(`rut-${pending}`);
    expect(page.items[3]?.noiDung).toBe(
      `Thanh toán đặt cọc lịch hẹn ${lich.maLichHen}`,
    );
    expect(page.items[4]?.noiDung).toBe('Nạp tiền vào ví qua VNPay');
    expect(page.items.every((i) => i.quaCuaSo === false)).toBe(true);
  });
});

describe('SDV-06 phân trang và lọc loại', () => {
  async function mixedWallet() {
    const { patientId, walletId } = await funded('300000.00');
    for (let day = 3; day <= 5; day += 1)
      await wf.insertPayment({
        viNoiBoId: walletId,
        loai: 'NapVi',
        phuongThuc: 'MoMo',
        soTien: '50000.00',
        trangThai: 'ThatBai',
        thoiDiemTao: `2026-11-0${day} 09:00:00`,
      });
    for (let day = 6; day <= 8; day += 1)
      await wf.insertWithdrawal({
        viNoiBoId: walletId,
        soTien: '10000.00',
        thoiDiemYeuCau: `2026-11-0${day} 09:00:00`,
      });
    return patientId;
  }

  it('ghép các trang bằng đúng toàn bộ danh sách, không trùng, không sót, kể cả cùng thời điểm; trang vượt cuối rỗng; total không đổi', async () => {
    const patientId = await mixedWallet();
    const service = serviceWith();
    const all = await service.transactions(
      patientId,
      query({ kichThuoc: 50 }),
      NOW,
    );
    expect(all.total).toBe(7);
    const paged = [];
    for (let trang = 1; trang <= 4; trang += 1) {
      const result = await service.transactions(
        patientId,
        query({ trang, kichThuoc: 2, offset: (trang - 1) * 2 }),
        NOW,
      );
      expect(result.total).toBe(7);
      paged.push(...result.items);
    }
    expect(paged.map((i) => i.id)).toEqual(all.items.map((i) => i.id));
    const beyond = await service.transactions(
      patientId,
      query({ trang: 99999999, kichThuoc: 50, offset: 99999998 * 50 }),
      NOW,
    );
    expect(beyond).toEqual({
      items: [],
      total: 7,
      trang: 99999999,
      kichThuoc: 50,
    });
  });

  it('lọc loai: Nap chỉ nạp (sổ cái và chưa ra sổ), Rut chỉ rút, ThanhToan không có ⇒ rỗng', async () => {
    const patientId = await mixedWallet();
    const service = serviceWith();
    const nap = await service.transactions(
      patientId,
      query({ loai: 'Nap' }),
      NOW,
    );
    expect(nap.total).toBe(4);
    expect(nap.items.every((i) => i.loai === 'Nap')).toBe(true);
    const rut = await service.transactions(
      patientId,
      query({ loai: 'Rut' }),
      NOW,
    );
    expect(rut.total).toBe(3);
    expect(rut.items.every((i) => i.loai === 'Rut')).toBe(true);
    const none = await service.transactions(
      patientId,
      query({ loai: 'ThanhToan' }),
      NOW,
    );
    expect(none).toMatchObject({ items: [], total: 0 });
  });
});

describe('SDV-07 chỉ dữ liệu của chủ', () => {
  it('ví và giao dịch của Bệnh nhân khác không lẫn vào số dư, nạp chờ, yêu cầu rút và lịch sử', async () => {
    const mine = await funded('100000.00');
    const other = await funded('900000.00');
    await wf.setWallet(other.walletId, '900000.00', '200000.00');
    await wf.insertWithdrawal({
      viNoiBoId: other.walletId,
      soTien: '200000.00',
    });
    await wf.insertPayment({
      viNoiBoId: other.walletId,
      loai: 'NapVi',
      phuongThuc: 'VNPay',
      soTien: '500000.00',
      trangThai: 'DangXuLy',
      thoiDiemTao: '2026-11-17 09:50:00',
    });
    const service = serviceWith();
    const overview = await service.overview(mine.patientId, NOW);
    expect(overview).toMatchObject({
      soDu: '100000.00',
      soTienDangGiu: '0.00',
      napChoXacNhan: '0.00',
      yeuCauRutGanNhat: null,
    });
    const page = await service.transactions(mine.patientId, query(), NOW);
    expect(page.total).toBe(1);
    expect(page.items.map((i) => i.soTien)).toEqual(['100000.00']);
  });
});

describe('SDV-09 nạp DangXuLy quá cửa sổ', () => {
  it('không vào napChoXacNhan, vẫn có ở lịch sử với quaCuaSo true; trạng thái trong DB vẫn DangXuLy', async () => {
    const { patientId, walletId } = await wf.patientWithWallet();
    const stale = await wf.insertPayment({
      viNoiBoId: walletId,
      loai: 'NapVi',
      phuongThuc: 'VNPay',
      soTien: '100000.00',
      trangThai: 'DangXuLy',
      thoiDiemTao: '2026-11-17 07:00:00',
    });
    const fresh = await wf.insertPayment({
      viNoiBoId: walletId,
      loai: 'NapVi',
      phuongThuc: 'VNPay',
      soTien: '50000.00',
      trangThai: 'DangXuLy',
      thoiDiemTao: '2026-11-17 09:30:00',
    });
    const service = serviceWith();
    expect((await service.overview(patientId, NOW)).napChoXacNhan).toBe(
      '50000.00',
    );
    const page = await service.transactions(patientId, query(), NOW);
    expect(page.items.map((i) => [i.id, i.trangThai, i.quaCuaSo])).toEqual([
      [`nap-${fresh}`, 'DangXuLy', false],
      [`nap-${stale}`, 'DangXuLy', true],
    ]);
    const rows = await db.query<{ trang_thai: string }[]>(
      'SELECT trang_thai FROM giao_dich_thanh_toan WHERE giao_dich_thanh_toan_id = ?',
      [stale],
    );
    expect(rows[0]?.trang_thai).toBe('DangXuLy');
  });
});

describe('HDT-04 WalletBalancePort.available', () => {
  it('số khả dụng đúng khi có giữ; null khi không có ví', async () => {
    const { patientId, walletId } = await funded('300000.00');
    await wf.setWallet(walletId, '300000.00', '120000.50');
    const reader = new WalletBalanceReader(db, repository);
    expect(await reader.available(patientId)).toBe('179999.50');
    expect(await reader.available('999999999')).toBeNull();
  });
});

describe('M11 EXPLAIN lịch sử giao dịch ở ví nhiều dòng', () => {
  it('10.000 dòng sổ cái: trang đầu đúng và nhánh sổ cái đi theo chỉ mục (vi_noi_bo_id, thoi_diem), không quét cả bảng', async () => {
    const { patientId, walletId } = await funded('100000.00');
    const [payment] = await db.query<{ id: string }[]>(
      'SELECT giao_dich_thanh_toan_id AS id FROM giao_dich_thanh_toan WHERE vi_noi_bo_id = ? LIMIT 1',
      [walletId],
    );
    await db.query(
      `INSERT INTO giao_dich_vi (vi_noi_bo_id, loai, so_tien, so_du_sau, giao_dich_thanh_toan_id, thoi_diem)
       SELECT ?, 'Nap', 1000.00, 100000.00, ?, TIMESTAMP('2026-01-01 00:00:00') + INTERVAL n MINUTE
       FROM (SELECT (a.n + 10 * b.n + 100 * c.n + 1000 * d.n) AS n
             FROM (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
                  (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b,
                  (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) c,
                  (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) d) t`,
      [walletId, payment?.id],
    );
    const started = performance.now(); // `Date` bị đồng hồ giả của hook nên đo bằng performance
    const page = await serviceWith().transactions(
      patientId,
      query({ kichThuoc: 20 }),
      NOW,
    );
    const elapsed = Math.round(performance.now() - started);
    expect(page.total).toBe(10_001);
    expect(page.items).toHaveLength(20);
    // Mới nhất trước: dòng nạp ban đầu (02/11) rồi tới phút thứ 9.999 của chuỗi vừa chèn (07/01, 22:39 giờ VN)
    expect(page.items[0]?.thoiDiem).toBe('2026-11-02T01:00:00.000Z');
    expect(page.items[1]?.thoiDiem).toBe('2026-01-07T15:39:00.000Z');
    // EXPLAIN của CHÍNH câu hợp ba nguồn (bắt câu thật qua `em` giả), không phải câu viết lại
    const plan = await repository.findHistoryPage(
      {
        query: async (sql: string, params: unknown[]) =>
          db.query(`EXPLAIN ${sql}`, params),
      } as never,
      walletId,
      null,
      20,
      0,
    );
    const rows = plan as unknown as {
      table: string | null;
      key: string | null;
      Extra: string | null;
    }[];
    const ledger = rows.find((row) => row.table === 'giao_dich_vi');
    expect(ledger?.key).toBe('giao_dich_vi_index_22');
    expect(ledger?.Extra ?? '').not.toContain('filesort'); // cắt LIMIT ngay trên chỉ mục, không sắp lại 10.000 dòng
    // Tiêu chí M11 ≤ 50 ms (PLAN 5.15): đo trên máy dev, ghi số ở TRACKING; không khẳng định ở CI vì máy chậm khác nhau
    console.info(`[M11] trang đầu lịch sử ví 10.001 dòng: ${elapsed} ms`);
  });
});
