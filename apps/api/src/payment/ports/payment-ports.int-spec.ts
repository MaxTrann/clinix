import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { PatientAppointmentsRepository } from '../../appointments/lists/patient-appointments.repository.js';
import { PatientAppointmentDetailService } from '../../appointments/lists/patient-appointment-detail.service.js';
import { createAppointmentWorld } from '../../appointments/testing/create-appointment-world.js';
import { realRescheduleDetailReader } from '../../appointments/testing/reschedule-detail-world.js';
import { BookingFixtures } from '../../appointments/testing/booking-fixtures.js';
import { withRowLock } from '../../appointments/testing/concurrency-harness.js';
import { failAfterStatement } from '../../appointments/testing/statement-recorder.js';
import { NoopRefundPort } from '../../appointments/ports/wallet.port.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { WalletFixtures } from '../../wallet/testing/wallet-fixtures.js';
import { paymentWorld } from '../testing/payment-world.js';
import { PaymentChain, PaymentChainError } from './payment-chain.js';
import { PaymentRecorder } from './payment-recorder.js';
import { PaymentSummaryReader } from './payment-summary.reader.js';

// payment B2 — PaymentRecorder và PaymentSummaryReader THẬT trên MySQL 8.4 THẬT (PLAN payment E2, E3, Q15, Q21; HDT-01, HDT-02, HDT-03, HDT-15; M1 đã đo ở X1). Dữ liệu giả; dòng dựng THẲNG bằng SQL qua `WalletFixtures`.
// Cả hai lớp chỉ ĐỌC hoặc INSERT trên `em` của người gọi, nên mỗi ca dùng `db.manager`; ca "cùng giao dịch" dùng `CreateAppointmentService` thật với `PaymentRecorder` thật.
let db: DataSource;
let wf: WalletFixtures;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  wf = new WalletFixtures(d);
  fx = new BookingFixtures(d);
});

const recorder = new PaymentRecorder();
const reader = new PaymentSummaryReader(new PaymentChain());
const BOOM = new Error('lỗi giả giữa giao dịch');

/** Giá `gia_snapshot` của lịch (chuỗi decimal) để tính số kỳ vọng theo dữ liệu thật của fixture, không đoán số. */
async function priceOf(lichHenId: string): Promise<string> {
  const rows = await db.query<{ gia: string }[]>(
    'SELECT gia_snapshot AS gia FROM lich_hen WHERE lich_hen_id = ?',
    [lichHenId],
  );
  return rows[0]!.gia;
}

const paymentRows = (lichHenId: string) =>
  db.query<
    {
      phuongThuc: string;
      soTien: string;
      trangThai: string;
      viNoiBoId: string;
    }[]
  >(
    `SELECT phuong_thuc AS phuongThuc, so_tien AS soTien, trang_thai AS trangThai, vi_noi_bo_id AS viNoiBoId
     FROM giao_dich_thanh_toan WHERE lich_hen_id = ? ORDER BY giao_dich_thanh_toan_id`,
    [lichHenId],
  );

describe('HDT-01 recordZeroPayment', () => {
  it('ghi đúng MỘT dòng 0đ (Vi, ThanhCong, ví của Bệnh nhân, lịch vừa tạo), không giao_dich_vi, không đổi ví; kèm giờ tạo theo đồng hồ giả', async () => {
    const w = await createAppointmentWorld(db, fx, {
      payment: recorder,
    });
    const created = await w.create(0);
    expect(created.maLichHen).toMatch(/^CLX-/);
    const walletBefore = await wf.readWallet(w.patient.wallet.viNoiBoId);
    const rows = await db.query<
      {
        lichHenId: string;
        viNoiBoId: string;
        loai: string;
        phuongThuc: string;
        soTien: string;
        trangThai: string;
        doiSoat: string;
        nguoiThu: string | null;
        maCong: string | null;
        thoiDiem: string;
      }[]
    >(
      `SELECT lich_hen_id AS lichHenId, vi_noi_bo_id AS viNoiBoId, loai, phuong_thuc AS phuongThuc, so_tien AS soTien, trang_thai AS trangThai,
              trang_thai_doi_soat AS doiSoat, nguoi_thu_id AS nguoiThu, ma_giao_dich_cong AS maCong,
              DATE_FORMAT(thoi_diem_tao, '%Y-%m-%d %H:%i:%s') AS thoiDiem
       FROM giao_dich_thanh_toan`,
    );
    expect(rows).toEqual([
      {
        lichHenId: expect.any(String) as string,
        viNoiBoId: w.patient.wallet.viNoiBoId,
        loai: 'ThanhToanLichHen',
        phuongThuc: 'Vi',
        soTien: '0.00',
        trangThai: 'ThanhCong',
        doiSoat: 'KhongCan',
        nguoiThu: null,
        maCong: null,
        thoiDiem: '2026-11-02 08:00:00', // đồng hồ giả của hook (giờ VN)
      },
    ]);
    const ledger = await db.query<{ n: string }[]>(
      'SELECT COUNT(*) AS n FROM giao_dich_vi',
    );
    expect(Number(ledger[0]!.n)).toBe(0);
    expect(walletBefore).toEqual({ soDu: '0.00', soTienDangGiu: '0.00' });
    await w.expectSettled(0);
  });

  it('lỗi SAU câu INSERT giao dịch đã chạy thật ⇒ hoàn tác TRỌN: không lịch, không dòng thanh toán, khung giờ trở lại ConTrong', async () => {
    const w = await createAppointmentWorld(db, fx, { payment: recorder });
    const matched = failAfterStatement(
      db,
      /^\s*INSERT INTO giao_dich_thanh_toan\b/,
      BOOM,
    );
    await expect(w.create(0)).rejects.toBe(BOOM);
    expect(matched.length).toBeGreaterThanOrEqual(1);
    for (const table of ['lich_hen', 'giao_dich_thanh_toan', 'thong_bao'])
      expect(
        Number(
          (
            await db.query<{ n: string }[]>(
              `SELECT COUNT(*) AS n FROM ${table}`,
            )
          )[0]!.n,
        ),
      ).toBe(0);
    expect(await fx.slotState(w.slot(0))).toStrictEqual({
      trangThai: 'ConTrong',
      giuChoDen: null,
    });
    await w.expectSettled(0);
  });

  it('Bệnh nhân không có hàng ví ⇒ ném lỗi rõ ràng và KHÔNG ghi gì (dữ liệu hỏng, không phải lỗi người dùng)', async () => {
    const w = await paymentWorld(db);
    const lich = await w.appointment(0, { trangThai: 'DaXacNhan' });
    await db.query('DELETE FROM vi_noi_bo WHERE benh_nhan_id = ?', [
      w.patientId,
    ]);
    await expect(
      recorder.recordZeroPayment(db.manager, {
        lichHenId: lich.lichHenId,
        benhNhanId: w.patientId,
      }),
    ).rejects.toThrow(/không có hàng ví/);
    expect(await paymentRows(lich.lichHenId)).toEqual([]);
  });
});

describe('M1 (chạy lại với lớp thật) tạo lịch cọc 0đ khi ví đang bị giữ khoá X bởi luồng thanh toán của lịch KHÁC', () => {
  it('create CHỜ khoá (không deadlock, không lỗi), rồi thành công ngay khi luồng kia nhả; đúng một dòng 0đ được ghi', async () => {
    const w = await createAppointmentWorld(db, fx, { payment: recorder });
    const outcome = await withRowLock(
      db,
      {
        sql: 'SELECT vi_noi_bo_id FROM vi_noi_bo WHERE benh_nhan_id = ? FOR UPDATE',
        params: [w.patientId],
      },
      async (held) => {
        const creating = w.create(0).then(
          (created) => ({ created }),
          (error: unknown) => ({ error }),
        );
        // `INSERT giao_dich_thanh_toan` xin khoá S trên hàng ví nên phải đang chờ khoá X của luồng kia
        const early = await Promise.race([
          creating,
          new Promise<'pending'>((resolve) =>
            setTimeout(() => resolve('pending'), 400),
          ),
        ]);
        expect(early).toBe('pending');
        await held.release('commit');
        return creating;
      },
    );
    expect('error' in outcome ? outcome.error : null).toBeNull();
    expect(
      Number(
        (
          await db.query<{ n: string }[]>(
            'SELECT COUNT(*) AS n FROM giao_dich_thanh_toan',
          )
        )[0]!.n,
      ),
    ).toBe(1);
    await w.expectSettled(0);
  });
});

describe('HDT-02 amountPaid, remainingToCollect, findPayment ở 5 tình huống', () => {
  it('1. chưa thu: "0.00", còn phải thu = giá, findPayment là đối tượng rỗng', async () => {
    const w = await paymentWorld(db);
    const lich = await w.appointment(0);
    const gia = await priceOf(lich.lichHenId);
    expect(await reader.amountPaid(db.manager, lich.lichHenId)).toBe('0.00');
    expect(await reader.remainingToCollect(db.manager, lich.lichHenId)).toBe(
      gia,
    );
    expect(await reader.findPayment(db.manager, lich.lichHenId)).toEqual({
      daThu: '0.00',
      conPhaiThu: gia,
      giaoDich: [],
    });
  });

  it('2. cọc bằng ví: đã thu đúng số, còn phải thu = giá − cọc; findPayment đúng ba khoá mỗi dòng và KHÔNG lộ mã cổng, id ví, người thu', async () => {
    const w = await paymentWorld(db);
    const lich = await w.appointment(0, { trangThai: 'DaXacNhan' });
    const gia = await priceOf(lich.lichHenId);
    await wf.insertPayment({
      viNoiBoId: w.patient.wallet.viNoiBoId,
      lichHenId: lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'Vi',
      soTien: '100000.00',
    });
    expect(await reader.amountPaid(db.manager, lich.lichHenId)).toBe(
      '100000.00',
    );
    const view = await reader.findPayment(db.manager, lich.lichHenId);
    expect(view).toEqual({
      daThu: '100000.00',
      conPhaiThu: await remainingFor(gia, '100000.00'),
      giaoDich: [
        {
          phuongThuc: 'Vi',
          soTien: '100000.00',
          thoiDiem: '2026-11-02T01:00:00.000Z', // FIXTURE_TIME 08:00 giờ VN
        },
      ],
    });
    const json = JSON.stringify(view);
    for (const leaked of [
      'maGiaoDichCong',
      'viNoiBoId',
      'nguoiThuId',
      'giaoDichThanhToanId',
    ])
      expect(json).not.toContain(leaked);
    expect(Object.keys(view!.giaoDich[0]!).toSorted()).toEqual([
      'phuongThuc',
      'soTien',
      'thoiDiem',
    ]);
  });

  it('3. cọc ví + tiền mặt: cộng đủ hai khoản, sắp theo thời điểm; giao dịch ThatBai, DangXuLy và nạp ví KHÔNG tính', async () => {
    const w = await paymentWorld(db);
    const lich = await w.appointment(0, { trangThai: 'DaTiepDon' });
    const receptionist = await wf.admin.receptionist(w.branch);
    const wallet = w.patient.wallet.viNoiBoId;
    const base = {
      lichHenId: lich.lichHenId,
      loai: 'ThanhToanLichHen' as const,
    };
    const viPaymentId = await wf.insertPayment({
      ...base,
      viNoiBoId: wallet,
      phuongThuc: 'Vi',
      soTien: '30000.00',
    });
    const cashPaymentId = await wf.insertPayment({
      ...base,
      phuongThuc: 'TienMatTaiQuay',
      soTien: '20000.00',
      nguoiThuId: receptionist.account.taiKhoanId,
    });
    // Khoản tiền mặt sớm hơn khoản ví (đặt giờ sau khi chèn: fixture chỉ có một giờ cố định)
    await db.query(
      `UPDATE giao_dich_thanh_toan SET thoi_diem_tao = CASE giao_dich_thanh_toan_id WHEN ? THEN '2026-11-03 09:00:00' ELSE '2026-11-03 08:00:00' END
       WHERE giao_dich_thanh_toan_id IN (?, ?)`,
      [viPaymentId, viPaymentId, cashPaymentId],
    );
    for (const trangThai of ['ThatBai', 'DangXuLy'] as const)
      await wf.insertPayment({
        ...base,
        viNoiBoId: wallet,
        phuongThuc: 'Vi',
        soTien: '99000.00',
        trangThai,
      });
    await wf.insertPayment({
      viNoiBoId: wallet,
      loai: 'NapVi',
      phuongThuc: 'VNPay',
      soTien: '500000.00',
    });
    const view = await reader.findPayment(db.manager, lich.lichHenId);
    expect(view?.daThu).toBe('50000.00');
    expect(view?.giaoDich.map((g) => [g.phuongThuc, g.soTien])).toEqual([
      ['TienMatTaiQuay', '20000.00'],
      ['Vi', '30000.00'],
    ]);
    expect(await reader.amountPaid(db.manager, lich.lichHenId)).toBe(
      '50000.00',
    );
  });

  it('4. thu thừa (đã thu ≥ giá): còn phải thu "0.00", không âm', async () => {
    const w = await paymentWorld(db);
    const lich = await w.appointment(0, { trangThai: 'DaXacNhan' });
    const gia = await priceOf(lich.lichHenId);
    await wf.insertPayment({
      viNoiBoId: w.patient.wallet.viNoiBoId,
      lichHenId: lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'Vi',
      soTien: '9999999.00',
    });
    expect(await reader.remainingToCollect(db.manager, lich.lichHenId)).toBe(
      '0.00',
    );
    expect(
      (await reader.findPayment(db.manager, lich.lichHenId))?.conPhaiThu,
    ).toBe('0.00');
    // đúng bằng giá: cũng "0.00"
    await db.query('DELETE FROM giao_dich_thanh_toan');
    await wf.insertPayment({
      viNoiBoId: w.patient.wallet.viNoiBoId,
      lichHenId: lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'Vi',
      soTien: gia,
    });
    expect(await reader.remainingToCollect(db.manager, lich.lichHenId)).toBe(
      '0.00',
    );
  });

  it('5. chuỗi hai lịch: tiền ghi ở lịch GỐC được tính khi hỏi lịch MỚI; còn phải thu theo giá của lịch hỏi', async () => {
    const w = await paymentWorld(db);
    const [goc, moi] = await w.chain(2);
    await wf.insertPayment({
      viNoiBoId: w.patient.wallet.viNoiBoId,
      lichHenId: goc!.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'Vi',
      soTien: '40000.00',
    });
    for (const id of [goc!.lichHenId, moi!.lichHenId]) {
      expect(await reader.amountPaid(db.manager, id)).toBe('40000.00');
      expect((await reader.findPayment(db.manager, id))?.daThu).toBe(
        '40000.00',
      );
    }
    expect(await reader.remainingToCollect(db.manager, moi!.lichHenId)).toBe(
      await remainingFor(await priceOf(moi!.lichHenId), '40000.00'),
    );
  });

  it('chuỗi dữ liệu hỏng (vòng) ⇒ PaymentChainError đi nguyên ra, không nuốt thành số sai', async () => {
    const w = await paymentWorld(db);
    const [goc, moi] = await w.chain(2);
    await w.fixtures.linkPrevious(goc!.lichHenId, moi!.lichHenId);
    await expect(
      reader.amountPaid(db.manager, moi!.lichHenId),
    ).rejects.toBeInstanceOf(PaymentChainError);
  });
});

describe('HDT-03 findPayment khi chưa có giao dịch (Q21)', () => {
  it('chưa có giao dịch ⇒ ĐỐI TƯỢNG (không null); dòng 0đ không hiện nhưng không làm sai tổng; lịch không tồn tại ⇒ null', async () => {
    const w = await paymentWorld(db);
    const lich = await w.appointment(0, { trangThai: 'DaXacNhan' });
    const gia = await priceOf(lich.lichHenId);
    await recorder.recordZeroPayment(db.manager, {
      lichHenId: lich.lichHenId,
      benhNhanId: w.patientId,
    });
    expect(await reader.findPayment(db.manager, lich.lichHenId)).toEqual({
      daThu: '0.00',
      conPhaiThu: gia,
      giaoDich: [],
    });
    expect(await reader.findPayment(db.manager, '987654321')).toBeNull();
    expect(await reader.amountPaid(db.manager, '987654321')).toBe('0.00');
    await expect(
      reader.remainingToCollect(db.manager, '987654321'),
    ).rejects.toThrow(/không tồn tại/);
  });
});

describe('Q15 amountRefundable', () => {
  async function paidWorld() {
    const w = await paymentWorld(db);
    const lich = await w.appointment(0, { trangThai: 'DaXacNhan' });
    const receptionist = await wf.admin.receptionist(w.branch);
    const wallet = w.patient.wallet.viNoiBoId;
    const viId = await wf.insertPayment({
      viNoiBoId: wallet,
      lichHenId: lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'Vi',
      soTien: '100000.00',
    });
    await wf.insertPayment({
      lichHenId: lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'TienMatTaiQuay',
      soTien: '50000.00',
      nguoiThuId: receptionist.account.taiKhoanId,
    });
    return { w, lich, wallet, viId };
  }

  it('chỉ phần trả bằng ví: tiền mặt không tính; chưa hoàn lần nào ⇒ 100.000', async () => {
    const { lich } = await paidWorld();
    expect(await reader.amountRefundable(db.manager, lich.lichHenId)).toBe(
      '100000.00',
    );
  });

  it('trừ các lần hoàn ThanhCong (tự động và đặc biệt); lần ThatBai không trừ; hoàn hết ⇒ "0.00"', async () => {
    const { lich, wallet, viId } = await paidWorld();
    const refund = (
      soTien: string,
      trangThai: 'ThanhCong' | 'ThatBai',
      soLanThu: number,
    ) =>
      wf.insertRefund({
        giaoDichThanhToanId: viId,
        viNoiBoId: wallet,
        soTien,
        trangThai,
        soLanThu,
      });
    await refund('40000.00', 'ThanhCong', 1);
    await refund('25000.00', 'ThatBai', 2);
    expect(await reader.amountRefundable(db.manager, lich.lichHenId)).toBe(
      '60000.00',
    );
    await db.query(
      `INSERT INTO lich_su_hoan_tien (giao_dich_thanh_toan_id, vi_noi_bo_id, loai, so_tien, trang_thai, so_lan_thu, ly_do, thoi_diem)
       VALUES (?, ?, 'DacBiet', 60000.00, 'ThanhCong', 3, 'Hoàn đặc biệt', '2026-11-03 09:00:00')`,
      [viId, wallet],
    );
    expect(await reader.amountRefundable(db.manager, lich.lichHenId)).toBe(
      '0.00',
    );
  });

  it('chuỗi hai lịch: hỏi lịch mới vẫn ra số của lịch gốc; lịch không tồn tại ⇒ "0.00"', async () => {
    const w = await paymentWorld(db);
    const [goc, moi] = await w.chain(2);
    await wf.insertPayment({
      viNoiBoId: w.patient.wallet.viNoiBoId,
      lichHenId: goc!.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'Vi',
      soTien: '70000.00',
    });
    expect(await reader.amountRefundable(db.manager, moi!.lichHenId)).toBe(
      '70000.00',
    );
    expect(await reader.amountRefundable(db.manager, '987654321')).toBe('0.00');
  });
});

describe('HDT-15 chi tiết lịch của Bệnh nhân dùng lớp THẬT', () => {
  it('thanhToan hiển thị đúng số đã thu, còn phải thu và danh sách giao dịch; không khoá thừa', async () => {
    const w = await paymentWorld(db);
    const lich = await w.appointment(0, { trangThai: 'DaXacNhan' });
    const gia = await priceOf(lich.lichHenId);
    await wf.insertPayment({
      viNoiBoId: w.patient.wallet.viNoiBoId,
      lichHenId: lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'Vi',
      soTien: '100000.00',
    });
    const refunds = new NoopRefundPort();
    refunds.logger = { warn: vi.fn() };
    const service = new PatientAppointmentDetailService(
      db,
      new PatientAppointmentsRepository(),
      reader,
      refunds,
      realRescheduleDetailReader(db),
    );
    const detail = await service.detail(w.patientId, lich.maLichHen);
    expect(detail.thanhToan).toEqual({
      daThu: '100000.00',
      conPhaiThu: await remainingFor(gia, '100000.00'),
      giaoDich: [
        {
          phuongThuc: 'Vi',
          soTien: '100000.00',
          thoiDiem: '2026-11-02T01:00:00.000Z',
        },
      ],
    });
    expect(detail.hoanTien).toBeNull(); // RefundPort vẫn là bản Noop: B8 mới làm
  });
});

/** Số còn phải thu mong đợi, tính độc lập bằng số nguyên đồng (không dùng lại hàm của reader). */
async function remainingFor(gia: string, paid: string): Promise<string> {
  const left = Number(gia) - Number(paid);
  return left > 0 ? left.toFixed(2) : '0.00';
}
