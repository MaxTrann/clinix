import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import {
  specialRefundStack,
  specialRefundWorld,
} from '../testing/special-refund-stack.js';
import { assertWalletInvariants } from '../testing/wallet-invariants.js';

// payment B13 — `SpecialRefundService` THẬT trên MySQL 8.4 THẬT (PLAN payment 5.6.2; HDB-01, HDB-02, HDB-05…HDB-07, HDB-09, HDB-11, HDB-12). Đua với hoàn cọc (HDB-08, DTT-12):
// special-refund.concurrency.int-spec.ts; HTTP (HDB-03, HDB-04, HDB-10, QTT-06, BDT-08): test/wallet-special-refund.e2e-spec.ts. Dữ liệu giả.
let db: DataSource;
useIntegrationHooks((d) => {
  db = d;
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

const rows = <T>(sql: string, params: unknown[]) => db.query<T[]>(sql, params);
const attempts = (paymentId: string) =>
  rows<{
    loai: string;
    trangThai: string;
    soTien: string;
    lyDo: string | null;
    soLanThu: number;
  }>(
    `SELECT loai, trang_thai AS trangThai, CAST(so_tien AS CHAR) AS soTien, ly_do AS lyDo, so_lan_thu AS soLanThu
       FROM lich_su_hoan_tien WHERE giao_dich_thanh_toan_id = ? ORDER BY so_lan_thu`,
    [paymentId],
  );
const refundLedger = (walletId: string) =>
  rows<{ soTien: string; soDuSau: string }>(
    `SELECT CAST(so_tien AS CHAR) AS soTien, CAST(so_du_sau AS CHAR) AS soDuSau FROM giao_dich_vi WHERE vi_noi_bo_id = ? AND loai = 'HoanTien' ORDER BY giao_dich_vi_id`,
    [walletId],
  );
const audits = (paymentId: string) =>
  rows<{
    nguoi: string;
    chiNhanh: string | null;
    ketQua: string;
    chiTiet: unknown;
  }>(
    `SELECT CAST(tai_khoan_id AS CHAR) AS nguoi, CAST(chi_nhanh_id AS CHAR) AS chiNhanh, ket_qua AS ketQua, chi_tiet_thay_doi AS chiTiet
       FROM nhat_ky_hanh_dong WHERE hanh_dong = 'HoanTienDacBiet' AND loai_doi_tuong = 'giao_dich_thanh_toan' AND ma_doi_tuong = ?`,
    [paymentId],
  );
const notices = (taiKhoanId: string) =>
  rows<{ noiDung: string; lichHenId: string | null }>(
    `SELECT noi_dung AS noiDung, CAST(lich_hen_id AS CHAR) AS lichHenId FROM thong_bao WHERE tai_khoan_id = ? AND loai_su_kien = 'HoanTienDacBiet'`,
    [taiKhoanId],
  );
const parse = (value: unknown): unknown =>
  typeof value === 'string' ? JSON.parse(value) : value;

describe('SpecialRefundService.create (payment B13)', () => {
  it('HDB-02 ★ hoàn hợp lệ ⇒ ví cộng; một dòng lich_su_hoan_tien DacBiet ThanhCong; một dòng giao_dich_vi HoanTien; nhật ký; thông báo gắn lịch; IVT đúng', async () => {
    const t = await specialRefundWorld(db);
    const result = await specialRefundStack(db).refund(
      t.adminId,
      t.paymentId,
      '40000',
    );
    expect(result).toEqual({ maGiaoDich: t.paymentId, soTien: '40000.00' });
    expect(await t.wallets.readWallet(t.walletId)).toEqual({
      soDu: '40000.00',
      soTienDangGiu: '0.00',
    });
    expect(await attempts(t.paymentId)).toEqual([
      {
        loai: 'DacBiet',
        trangThai: 'ThanhCong',
        soTien: '40000.00',
        lyDo: 'Bệnh nhân khiếu nại hợp lệ',
        soLanThu: 1,
      },
    ]);
    expect(await refundLedger(t.walletId)).toEqual([
      { soTien: '40000.00', soDuSau: '40000.00' },
    ]);
    expect(await audits(t.paymentId)).toHaveLength(1);
    const sent = await notices(t.w.patientId);
    expect(sent).toEqual([
      {
        noiDung: expect.stringContaining('40.000đ'),
        lichHenId: t.lich.lichHenId,
      },
    ]);
    expect(sent[0]!.noiDung).toContain(t.lich.maLichHen);
    expect(sent[0]!.noiDung).not.toContain('khiếu nại');
    // payment B17 (TDT-09): thông báo có đúng MỘT dòng thư ChoGui, cùng giao dịch
    expect(
      await rows<{ trangThai: string }>(
        `SELECT e.trang_thai AS trangThai FROM email_thong_bao e JOIN thong_bao t ON t.thong_bao_id = e.thong_bao_id WHERE t.loai_su_kien = 'HoanTienDacBiet'`,
        [],
      ),
    ).toEqual([{ trangThai: 'ChoGui' }]);
    await assertWalletInvariants(db);
  });

  it('HDB-12 nhật ký ghi người hoàn, chi nhánh của lịch GỐC, payload ĐÚNG { so_tien, ly_do } (không tên, không ví)', async () => {
    const t = await specialRefundWorld(db);
    await specialRefundStack(db).refund(
      t.adminId,
      t.paymentId,
      '100000',
      'Hoàn theo quyết định của phòng khám',
    );
    const [entry] = await audits(t.paymentId);
    expect(entry).toMatchObject({
      nguoi: t.adminId,
      chiNhanh: t.lich.chiNhanhId,
      ketQua: 'ThanhCong',
    });
    expect(parse(entry!.chiTiet)).toEqual({
      so_tien: '100000.00',
      ly_do: 'Hoàn theo quyết định của phòng khám',
    });
  });

  it('HDB-05 vượt số còn hoàn được ⇒ 409 kèm conCoTheHoan, không ghi gì; biên: đúng bằng số còn lại thì được', async () => {
    const t = await specialRefundWorld(db);
    const stack = specialRefundStack(db);
    expect(
      await failure(stack.refund(t.adminId, t.paymentId, '100001')),
    ).toEqual({
      status: 409,
      maLoi: 'SO_TIEN_HOAN_VUOT_QUA_DA_THANH_TOAN',
      chiTiet: { conCoTheHoan: '100000.00' },
    });
    expect(await attempts(t.paymentId)).toEqual([]);
    expect(await t.wallets.readWallet(t.walletId)).toMatchObject({
      soDu: '0.00',
    });
    await stack.refund(t.adminId, t.paymentId, '100000');
    expect(await t.wallets.readWallet(t.walletId)).toMatchObject({
      soDu: '100000.00',
    });
    await assertWalletInvariants(db);
  });

  it('HDB-06 ★ hoàn đặc biệt lần hai cùng khoản ⇒ 409 DA_HOAN_DAC_BIET (dù còn chỗ); ví chỉ cộng một lần', async () => {
    const t = await specialRefundWorld(db);
    const stack = specialRefundStack(db);
    await stack.refund(t.adminId, t.paymentId, '30000');
    expect(
      await failure(stack.refund(t.adminId, t.paymentId, '10000')),
    ).toMatchObject({
      status: 409,
      maLoi: 'DA_HOAN_DAC_BIET',
    });
    expect(await t.wallets.readWallet(t.walletId)).toMatchObject({
      soDu: '30000.00',
    });
    expect(await attempts(t.paymentId)).toHaveLength(1);
  });

  it('HDB-07 sau hoàn tự động 50%, hoàn đặc biệt phần còn lại được, vượt bị chặn; hoàn tự động SAU hoàn đặc biệt vẫn bị trần chặn', async () => {
    const t = await specialRefundWorld(db);
    const stack = specialRefundStack(db);
    await stack.autoRefund.refund({
      lichHenId: t.lich.lichHenId,
      soTien: '50000.00',
      lyDo: 'Huỷ trước 2 giờ',
    });
    expect(
      await failure(stack.refund(t.adminId, t.paymentId, '50001')),
    ).toMatchObject({
      maLoi: 'SO_TIEN_HOAN_VUOT_QUA_DA_THANH_TOAN',
      chiTiet: { conCoTheHoan: '50000.00' },
    });
    await stack.refund(t.adminId, t.paymentId, '50000');
    expect(await t.wallets.readWallet(t.walletId)).toMatchObject({
      soDu: '100000.00',
    });
    expect(
      (await attempts(t.paymentId)).map((a) => [a.loai, a.soLanThu]),
    ).toEqual([
      ['TuDong', 1],
      ['DacBiet', 2],
    ]);

    // Khoản khác: hoàn đặc biệt 70% trước, rồi hoàn tự động 100% ⇒ chỉ cộng 30% còn lại
    const u = await specialRefundWorld(db);
    await stack.refund(u.adminId, u.paymentId, '70000');
    await stack.autoRefund.refund({
      lichHenId: u.lich.lichHenId,
      soTien: '100000.00',
      lyDo: 'Huỷ sớm',
    });
    expect(await u.wallets.readWallet(u.walletId)).toMatchObject({
      soDu: '100000.00',
    });
    await assertWalletInvariants(db);
  });

  it('HDB-09 nhật ký lỗi ⇒ hoàn tác trọn: ví, dòng hoàn, sổ cái, thông báo đều không đổi', async () => {
    const t = await specialRefundWorld(db);
    const broken = specialRefundStack(db, {
      record: () => Promise.reject(new Error('audit hỏng')),
    });
    await expect(
      broken.refund(t.adminId, t.paymentId, '40000'),
    ).rejects.toThrow('audit hỏng');
    expect(await t.wallets.readWallet(t.walletId)).toEqual({
      soDu: '0.00',
      soTienDangGiu: '0.00',
    });
    expect(await attempts(t.paymentId)).toEqual([]);
    expect(await refundLedger(t.walletId)).toEqual([]);
    expect(await notices(t.w.patientId)).toEqual([]);
    await assertWalletInvariants(db);
  });

  it('HDB-11 khoản tiền mặt, nạp ví, không tồn tại, sai dạng ⇒ 404 KHONG_TIM_THAY cùng thân; không ghi gì', async () => {
    const t = await specialRefundWorld(db, { trangThai: 'DaXacNhan' });
    const cash = await t.wallets.insertPayment({
      lichHenId: t.lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'TienMatTaiQuay',
      soTien: '200000.00',
      nguoiThuId: t.w.receptionist.account.taiKhoanId,
    });
    const topup = await t.wallets.insertPayment({
      viNoiBoId: t.walletId,
      loai: 'NapVi',
      phuongThuc: 'VNPay',
      soTien: '50000.00',
    });
    const stack = specialRefundStack(db);
    for (const id of [cash, topup, '999999', 'abc', '0'])
      expect(await failure(stack.refund(t.adminId, id, '10000'))).toEqual({
        status: 404,
        maLoi: 'KHONG_TIM_THAY',
        chiTiet: undefined,
      });
    expect(await audits(cash)).toEqual([]);
    expect(await t.wallets.readWallet(t.walletId)).toMatchObject({
      soDu: '0.00',
    });
  });
});

describe('SpecialRefundService.listRefundable (payment B13)', () => {
  it('HDB-01 chỉ khoản QUA VÍ còn hoàn được, đúng daHoan và conCoTheHoan; loại tiền mặt, nạp ví, đã hoàn hết, đã hoàn đặc biệt', async () => {
    const t = await specialRefundWorld(db, { trangThai: 'DaXacNhan' });
    const stack = specialRefundStack(db);
    await t.wallets.insertPayment({
      lichHenId: t.lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'TienMatTaiQuay',
      soTien: '200000.00',
      nguoiThuId: t.w.receptionist.account.taiKhoanId,
    });
    await t.wallets.insertPayment({
      viNoiBoId: t.walletId,
      loai: 'NapVi',
      phuongThuc: 'VNPay',
      soTien: '50000.00',
    });
    await stack.autoRefund.refund({
      lichHenId: t.lich.lichHenId,
      soTien: '30000.00',
      lyDo: 'Huỷ',
    });

    const byPatient = await stack.service.listRefundable({
      benhNhanId: t.w.patientId,
    });
    expect(byPatient).toEqual([
      {
        maGiaoDich: t.paymentId,
        maLichHen: t.lich.maLichHen,
        soTien: '100000.00',
        daHoan: '30000.00',
        conCoTheHoan: '70000.00',
        thoiDiem: expect.any(String),
      },
    ]);
    // Đã hoàn đặc biệt ⇒ biến khỏi danh sách (dù còn chỗ)
    await stack.refund(t.adminId, t.paymentId, '10000');
    expect(
      await stack.service.listRefundable({ benhNhanId: t.w.patientId }),
    ).toEqual([]);

    // Đã hoàn hết (tự động 100%) ⇒ không có
    const u = await specialRefundWorld(db);
    await stack.autoRefund.refund({
      lichHenId: u.lich.lichHenId,
      soTien: '100000.00',
      lyDo: 'Huỷ',
    });
    expect(
      await stack.service.listRefundable({ maLichHen: u.lich.maLichHen }),
    ).toEqual([]);
  });

  it('HDB-01 tra theo mã của BẤT KỲ lịch nào trong chuỗi đổi lịch ⇒ khoản của lịch gốc, maLichHen là lịch cuối; mã lạ ⇒ rỗng; gửi cả hai hay không gửi ⇒ 400', async () => {
    const t = await specialRefundWorld(db, { trangThai: 'DaXacNhan' });
    const chain = await t.w.chain(3);
    const [root, middle, leaf] = chain;
    const paymentId = await t.wallets.insertWalletDeposit({
      viNoiBoId: t.walletId,
      lichHenId: root!.lichHenId,
      soTien: '60000.00',
    });
    const stack = specialRefundStack(db);
    for (const lich of [root!, middle!, leaf!]) {
      const items = await stack.service.listRefundable({
        maLichHen: lich.maLichHen,
      });
      expect(items.map((i) => [i.maGiaoDich, i.maLichHen])).toEqual([
        [paymentId, leaf!.maLichHen],
      ]);
    }
    expect(
      await stack.service.listRefundable({ maLichHen: 'CLX-KHONGCO' }),
    ).toEqual([]);
    for (const query of [
      {},
      { maLichHen: leaf!.maLichHen, benhNhanId: t.w.patientId },
    ])
      expect(await failure(stack.service.listRefundable(query))).toMatchObject({
        status: 400,
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
      });

    // Thông báo của khoản trong chuỗi gắn lịch CUỐI (Trung chốt 19/11/2026)
    await stack.refund(t.adminId, paymentId, '60000');
    expect((await notices(t.w.patientId)).map((n) => n.lichHenId)).toEqual([
      leaf!.lichHenId,
    ]);
    const [entry] = await audits(paymentId);
    expect(entry!.chiNhanh).toBe(root!.chiNhanhId);
  });
});
