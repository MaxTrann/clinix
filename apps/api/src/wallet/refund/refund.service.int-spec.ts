import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { PaymentChain } from '../../payment/ports/payment-chain.js';
import { paymentWorld } from '../../payment/testing/payment-world.js';
import { WalletLedger } from '../ledger/wallet-ledger.js';
import { WalletFixtures } from '../testing/wallet-fixtures.js';
import { assertWalletInvariants } from '../testing/wallet-invariants.js';
import { REFUND_MAX_ATTEMPTS } from '../wallet.constants.js';
import { RefundNotifier } from './refund-notifier.js';
import { RefundRetryJob } from './refund-retry.job.js';
import { RefundRepository } from './refund.queries.js';
import { RefundService } from './refund.service.js';

// payment B8 — hoàn cọc tự động trên MySQL 8.4 THẬT (PLAN payment 5.6.1, 7.x HCC): HCC-01…HCC-08, HCC-10, HCC-12, HCC-13, HCC-14, HDT-05, TDT-04 (HCC-11 và DTT-13, DTT-16, M14 ở `refund.concurrency.int-spec.ts`).
// Đồng hồ giả của `useIntegrationHooks` là 08:00 ngày 02/11/2026 (giờ Việt Nam). Mọi tiền, mã và id là dữ liệu giả.
let db: DataSource;
useIntegrationHooks((d) => {
  db = d;
});

const MIN = 60_000;
const T0 = new Date('2026-11-02T01:00:00.000Z');
const at = (minutes: number) => new Date(T0.getTime() + minutes * MIN);

/** Bệnh nhân kèm ví, MỘT lịch đã huỷ có khoản cọc 100.000đ trả bằng ví (ví đang 0đ: tiền cọc đã trừ), và bộ dịch vụ thật. */
async function world() {
  const w = await paymentWorld(db);
  const wallets = new WalletFixtures(db);
  const walletId = w.patient.wallet.viNoiBoId;
  await wallets.setWallet(walletId, '0.00');
  const lich = await w.appointment(0, { trangThai: 'DaHuy', coc: '100000.00' });
  const paymentId = await wallets.insertWalletDeposit({
    viNoiBoId: walletId,
    lichHenId: lich.lichHenId,
    soTien: '100000.00',
  });
  const repository = new RefundRepository();
  const ledger = new WalletLedger();
  const service = new RefundService(
    db,
    repository,
    ledger,
    new PaymentChain(),
    new RefundNotifier(),
  );
  const job = new RefundRetryJob(db, repository, service);
  return {
    w,
    wallets,
    walletId,
    lich,
    paymentId,
    repository,
    ledger,
    service,
    job,
  };
}
type World = Awaited<ReturnType<typeof world>>;

const attempts = (paymentId: string) =>
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
// CHỈ dòng sổ cái `HoanTien`: hai dòng nền của fixture (`Nap` và `ThanhToan` của khoản cọc) không thuộc hoàn cọc
const ledgerRows = (walletId: string) =>
  db.query(
    `SELECT loai, CAST(so_tien AS CHAR) AS soTien, CAST(so_du_sau AS CHAR) AS soDuSau, lich_su_hoan_tien_id AS lichSuHoanTienId
     FROM giao_dich_vi WHERE vi_noi_bo_id = ? AND loai = 'HoanTien' ORDER BY giao_dich_vi_id`,
    [walletId],
  ) as Promise<
    {
      loai: string;
      soTien: string;
      soDuSau: string;
      lichSuHoanTienId: string | null;
    }[]
  >;
const notices = (loai?: string) =>
  db.query(
    `SELECT CAST(tai_khoan_id AS CHAR) AS taiKhoanId, loai_su_kien AS loai, noi_dung AS noiDung, CAST(lich_hen_id AS CHAR) AS lichHenId
     FROM thong_bao ${loai ? 'WHERE loai_su_kien = ?' : ''} ORDER BY thong_bao_id`,
    loai ? [loai] : [],
  ) as Promise<
    {
      taiKhoanId: string;
      loai: string;
      noiDung: string;
      lichHenId: string | null;
    }[]
  >;
/** Lễ tân của chi nhánh trong thế giới: người thu của khoản tiền mặt (CHECK `chk_gd_tien_mat_nguoi_thu`: tiền mặt phải có người thu). */
const receptionistId = async (x: World) =>
  (await x.w.booking.admin.receptionist(x.w.branch)).account.taiKhoanId;
const balance = async (x: World) =>
  (await x.wallets.readWallet(x.walletId)).soDu;

/** Ép `WalletLedger.credit` ném lỗi (giả lỗi giữa giao dịch, SAU khi đã ghi dòng hoàn) cho `times` lần gọi đầu. */
function failCredit(x: World, times = 1) {
  const real = x.ledger.credit.bind(x.ledger);
  let left = times;
  vi.spyOn(x.ledger, 'credit').mockImplementation((...args) => {
    if (left > 0) {
      left -= 1;
      return Promise.reject(new Error('lỗi giả khi cộng ví số dư 777777'));
    }
    return real(...args);
  });
}

describe('đường thành công', () => {
  it('HCC-01 ★ hoàn đúng số booking truyền: ví cộng, lich_su_hoan_tien TuDong ThanhCong, giao_dich_vi HoanTien, thông báo gắn lịch, findRefund đúng', async () => {
    const x = await world();

    const result = await x.service.refund({
      lichHenId: x.lich.lichHenId,
      soTien: '50000.00',
      lyDo: 'Bệnh nhân huỷ trước 24 giờ',
    });

    expect(result).toEqual({ kind: 'Refunded' });
    expect(await balance(x)).toBe('50000.00');
    expect(await attempts(x.paymentId)).toEqual([
      {
        loai: 'TuDong',
        trangThai: 'ThanhCong',
        soTien: '50000.00',
        lyDo: 'Bệnh nhân huỷ trước 24 giờ',
        soLanThu: 1,
      },
    ]);
    const [entry] = await ledgerRows(x.walletId);
    expect(entry).toMatchObject({
      loai: 'HoanTien',
      soTien: '50000.00',
      soDuSau: '50000.00',
    });
    expect(entry!.lichSuHoanTienId).not.toBeNull();
    const [notice] = await notices('HoanCocThanhCong');
    expect(notice).toMatchObject({
      taiKhoanId: x.w.patientId,
      lichHenId: x.lich.lichHenId,
    });
    expect(notice!.noiDung).toContain('50.000đ');
    expect(notice!.noiDung).toContain(x.lich.maLichHen);
    await expect(
      x.service.findRefund(db.manager, x.lich.lichHenId),
    ).resolves.toEqual({
      soTien: '50000.00',
      trangThai: 'ThanhCong',
      thoiDiem: expect.stringMatching(/^2026-11-02T01:00:00\.000Z$/),
    });
  });

  it('HCC-02 huỷ hoàn đủ (nghỉ phép hay Quản trị viên override: booking truyền toàn bộ phần đã trả qua ví) ⇒ ví cộng đủ 100.000', async () => {
    const x = await world();
    await expect(
      x.service.refund({
        lichHenId: x.lich.lichHenId,
        soTien: '100000.00',
        lyDo: 'Bác sĩ nghỉ phép',
      }),
    ).resolves.toEqual({ kind: 'Refunded' });
    expect(await balance(x)).toBe('100000.00');
  });

  it('HCC-03 ★ refund gọi LẶP sau ThanhCong ⇒ Refunded, KHÔNG cộng lần hai: một dòng hoàn, một dòng sổ cái, một thông báo', async () => {
    const x = await world();
    const input = {
      lichHenId: x.lich.lichHenId,
      soTien: '50000.00',
      lyDo: 'Huỷ',
    };
    await expect(x.service.refund(input)).resolves.toEqual({
      kind: 'Refunded',
    });
    await expect(x.service.refund(input)).resolves.toEqual({
      kind: 'Refunded',
    });
    await expect(x.service.refund(input)).resolves.toEqual({
      kind: 'Refunded',
    });

    expect(await balance(x)).toBe('50000.00');
    expect(await attempts(x.paymentId)).toHaveLength(1);
    expect(await ledgerRows(x.walletId)).toHaveLength(1);
    expect(await notices('HoanCocThanhCong')).toHaveLength(1);
  });
});

describe('lỗi và thử lại', () => {
  it('HCC-04 lỗi cộng ⇒ hoàn tác trọn, Failed, dòng ThatBai mang so_tien và ly_do; log chỉ có id nội bộ và tên lớp lỗi (không số tiền, không thông điệp lỗi)', async () => {
    const x = await world();
    const logs: string[] = [];
    vi.spyOn(Logger.prototype, 'error').mockImplementation(
      (message: unknown) => {
        logs.push(String(message));
      },
    );
    failCredit(x);

    const result = await x.service.refund({
      lichHenId: x.lich.lichHenId,
      soTien: '50000.00',
      lyDo: 'Huỷ trước 24 giờ',
    });

    expect(result).toEqual({ kind: 'Failed' });
    // Hoàn tác trọn: ví không đổi, không dòng ThanhCong, không sổ cái, không thông báo
    expect(await balance(x)).toBe('0.00');
    expect(await ledgerRows(x.walletId)).toEqual([]);
    expect(await notices()).toEqual([]);
    expect(await attempts(x.paymentId)).toEqual([
      {
        loai: 'TuDong',
        trangThai: 'ThatBai',
        soTien: '50000.00',
        lyDo: 'Huỷ trước 24 giờ',
        soLanThu: 1,
      },
    ]);
    const text = logs.join('\n');
    expect(text).toContain(x.paymentId);
    expect(text).toContain('Error');
    expect(text).not.toMatch(/777777|50000|100000|lỗi giả/);
    // findRefund hiện dòng ThatBai mới nhất, không lộ số lần thử hay ví
    const view = await x.service.findRefund(db.manager, x.lich.lichHenId);
    expect(view).toMatchObject({ soTien: '50000.00', trangThai: 'ThatBai' });
    expect(Object.keys(view!).sort()).toEqual([
      'soTien',
      'thoiDiem',
      'trangThai',
    ]);
  });

  it('HCC-05 ★ job thử lại SAU 5 phút (đúng mốc 5 phút thì được thử, thiếu 1 giây thì chưa), chạy lại ĐÚNG số và lý do đã ghi; thành công ⇒ dòng ThanhCong so_lan_thu kế tiếp', async () => {
    const x = await world();
    failCredit(x);
    await x.service.refund({
      lichHenId: x.lich.lichHenId,
      soTien: '50000.00',
      lyDo: 'Lý do đã ghi',
    });

    // Thiếu 1 giây: chưa tới hạn
    const early = await x.job.run(new Date(T0.getTime() + 5 * MIN - 1000));
    expect(early).toMatchObject({ refunded: 0, failed: 0, notNeeded: 0 });
    expect(await attempts(x.paymentId)).toHaveLength(1);

    // Đúng 5 phút: được thử
    const summary = await x.job.run(at(5));
    expect(summary).toMatchObject({ refunded: 1, failed: 0, more: false });
    expect(await attempts(x.paymentId)).toEqual([
      expect.objectContaining({ trangThai: 'ThatBai', soLanThu: 1 }),
      {
        loai: 'TuDong',
        trangThai: 'ThanhCong',
        soTien: '50000.00',
        lyDo: 'Lý do đã ghi',
        soLanThu: 2,
      },
    ]);
    expect(await balance(x)).toBe('50000.00');
    expect(await notices('HoanCocThanhCong')).toHaveLength(1);

    // Đã hoàn xong thì không còn ứng viên
    expect(await x.job.run(at(60))).toMatchObject({ refunded: 0, failed: 0 });
  });

  it('HCC-06 hết lượt thử ⇒ dừng; lần thất bại cuối báo MỖI Quản trị viên ToanHeThong đang hoạt động (gắn lịch); không còn thử, không báo hai lần', async () => {
    const x = await world();
    await x.w.booking.admin.admin();
    // Người nhận: MỌI Quản trị viên ToanHeThong đang hoạt động (thế giới của booking đã có sẵn một người, cộng người vừa tạo)
    const adminIds = (
      (await db.query(
        `SELECT CAST(q.tai_khoan_id AS CHAR) AS id FROM quan_tri_vien q INNER JOIN tai_khoan t ON t.tai_khoan_id = q.tai_khoan_id
         WHERE t.trang_thai = 'DangHoatDong' AND q.pham_vi_quan_tri = 'ToanHeThong' ORDER BY q.tai_khoan_id`,
      )) as { id: string }[]
    ).map((row) => row.id);
    expect(adminIds.length).toBeGreaterThanOrEqual(2);
    failCredit(x, 99);
    await x.service.refund({
      lichHenId: x.lich.lichHenId,
      soTien: '50000.00',
      lyDo: 'Huỷ',
    });
    // Lần đầu (1) + ba lần job (2, 3, 4) = REFUND_MAX_ATTEMPTS lần thất bại
    for (let step = 1; step < REFUND_MAX_ATTEMPTS; step += 1) {
      vi.setSystemTime(at(step * 6));
      expect(await notices('HoanCocCanXuLy')).toHaveLength(0);
      await expect(x.job.run()).resolves.toMatchObject({ failed: 1 });
    }

    const rows = await attempts(x.paymentId);
    expect(rows.map((r) => [r.soLanThu, r.trangThai])).toEqual([
      [1, 'ThatBai'],
      [2, 'ThatBai'],
      [3, 'ThatBai'],
      [4, 'ThatBai'],
    ]);
    const warning = await notices('HoanCocCanXuLy');
    expect(warning.map((n) => n.taiKhoanId).sort()).toEqual(
      [...adminIds].sort(),
    );
    for (const notice of warning) {
      expect(notice.lichHenId).toBe(x.lich.lichHenId);
      expect(notice.noiDung).toContain('hoàn tiền đặc biệt');
    }

    // Hết lượt: job không còn chọn khoản này, và gọi refund lại cũng không ghi thêm dòng nào
    vi.setSystemTime(at(60));
    await expect(x.job.run()).resolves.toMatchObject({
      refunded: 0,
      failed: 0,
    });
    await expect(
      x.service.refund({
        lichHenId: x.lich.lichHenId,
        soTien: '50000.00',
        lyDo: 'Huỷ',
      }),
    ).resolves.toEqual({ kind: 'Failed' });
    expect(await attempts(x.paymentId)).toHaveLength(REFUND_MAX_ATTEMPTS);
    expect(await notices('HoanCocCanXuLy')).toHaveLength(adminIds.length);
    expect(await balance(x)).toBe('0.00');
  });

  it('HCC-14 tiến trình chết TRƯỚC khi ghi dòng ThatBai đầu (mô phỏng: lần ghi ThatBai cũng lỗi) ⇒ KHÔNG dấu vết: ghi lại giới hạn của Q16 phương án (d), TECH_DEBT 163', async () => {
    const x = await world();
    const logs: string[] = [];
    vi.spyOn(Logger.prototype, 'error').mockImplementation(
      (message: unknown) => {
        logs.push(String(message));
      },
    );
    failCredit(x);
    const insert = x.repository.insertAttempt.bind(x.repository);
    vi.spyOn(x.repository, 'insertAttempt').mockImplementation((em, input) => {
      if (input.trangThai === 'ThatBai')
        return Promise.reject(new Error('chết giữa chừng'));
      return insert(em, input);
    });

    await expect(
      x.service.refund({
        lichHenId: x.lich.lichHenId,
        soTien: '50000.00',
        lyDo: 'Huỷ',
      }),
    ).resolves.toEqual({ kind: 'Failed' });

    // Không dòng hoàn nào, nên job KHÔNG có gì để thử lại: không truy vấn nào phát hiện được
    expect(await attempts(x.paymentId)).toEqual([]);
    await expect(x.job.run(at(60))).resolves.toMatchObject({
      refunded: 0,
      failed: 0,
      notNeeded: 0,
    });
    expect(await balance(x)).toBe('0.00');
    expect(
      logs.some((line) => line.includes('Không ghi được dòng ThatBai')),
    ).toBe(true);
  });
});

describe('không có gì để hoàn, trần và chuỗi đổi lịch', () => {
  it('HCC-07 không có khoản thanh toán qua ví (cọc 0đ, chỉ tiền mặt, hay chưa trả) ⇒ NotNeeded, không ghi gì', async () => {
    const x = await world();
    // Lịch khác: chỉ có tiền mặt tại quầy, hoặc không có giao dịch nào
    const cashOnly = await x.w.appointment(1, {
      trangThai: 'DaHuy',
      coc: '0.00',
    });
    await x.wallets.insertPayment({
      viNoiBoId: null,
      lichHenId: cashOnly.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'TienMatTaiQuay',
      soTien: '300000.00',
      nguoiThuId: await receptionistId(x),
    });
    const unpaid = await x.w.appointment(2, {
      trangThai: 'DaHuy',
      coc: '0.00',
    });

    for (const lich of [cashOnly, unpaid]) {
      await expect(
        x.service.refund({
          lichHenId: lich.lichHenId,
          soTien: '50000.00',
          lyDo: 'Huỷ',
        }),
      ).resolves.toEqual({ kind: 'NotNeeded' });
    }
    // Số không dương: gọi sai ⇒ không ghi dòng 0đ
    await expect(
      x.service.refund({
        lichHenId: x.lich.lichHenId,
        soTien: '0.00',
        lyDo: 'Huỷ',
      }),
    ).resolves.toEqual({ kind: 'NotNeeded' });
    expect(await attempts(x.paymentId)).toEqual([]);
    expect(await ledgerRows(x.walletId)).toEqual([]);
    expect(await notices()).toEqual([]);
    expect(await balance(x)).toBe('0.00');
    await expect(
      x.service.findRefund(db.manager, cashOnly.lichHenId),
    ).resolves.toBeNull();
  });

  it('HCC-08 ★ lịch DaTiepDon có tiền mặt bị override: hoàn CHỈ phần qua ví (booking tính theo amountRefundable); dù số truyền lẫn cả tiền mặt vẫn bị cắt theo phần qua ví, tiền mặt không về ví', async () => {
    const x = await world();
    // Cọc 100.000 qua ví + 150.000 thu tiền mặt tại quầy: tổng đã trả 250.000, phần qua ví 100.000
    await x.wallets.insertPayment({
      viNoiBoId: null,
      lichHenId: x.lich.lichHenId,
      loai: 'ThanhToanLichHen',
      phuongThuc: 'TienMatTaiQuay',
      soTien: '150000.00',
      nguoiThuId: await receptionistId(x),
    });

    await expect(
      x.service.refund({
        lichHenId: x.lich.lichHenId,
        soTien: '250000.00',
        lyDo: 'Quản trị viên khôi phục rồi huỷ',
      }),
    ).resolves.toEqual({ kind: 'Refunded' });

    expect(await balance(x)).toBe('100000.00');
    expect(await attempts(x.paymentId)).toEqual([
      expect.objectContaining({ soTien: '100000.00', trangThai: 'ThanhCong' }),
    ]);
    // Khoản tiền mặt không có dòng hoàn nào
    const cashRefunds = await db.query(
      `SELECT COUNT(*) AS n FROM lich_su_hoan_tien h INNER JOIN giao_dich_thanh_toan g ON g.giao_dich_thanh_toan_id = h.giao_dich_thanh_toan_id WHERE g.phuong_thuc = 'TienMatTaiQuay'`,
    );
    expect(Number(cashRefunds[0].n)).toBe(0);
  });

  it('HCC-10 chuỗi đổi lịch: huỷ lịch MỚI hoàn trên khoản thanh toán của lịch GỐC; thông báo gắn lịch bị huỷ (lịch cuối chuỗi); findRefund hỏi từ lịch nào của chuỗi cũng thấy', async () => {
    const x = await world();
    const [root, leaf] = await x.w.chain(2);
    const rootPayment = await x.wallets.insertWalletDeposit({
      viNoiBoId: x.walletId,
      lichHenId: root!.lichHenId,
      soTien: '80000.00',
    });

    await expect(
      x.service.refund({
        lichHenId: leaf!.lichHenId,
        soTien: '80000.00',
        lyDo: 'Huỷ lịch đã đổi',
      }),
    ).resolves.toEqual({ kind: 'Refunded' });

    expect(await attempts(rootPayment)).toEqual([
      expect.objectContaining({ soTien: '80000.00', trangThai: 'ThanhCong' }),
    ]);
    expect(await balance(x)).toBe('80000.00');
    const [notice] = await notices('HoanCocThanhCong');
    expect(notice!.lichHenId).toBe(leaf!.lichHenId);
    for (const id of [root!.lichHenId, leaf!.lichHenId])
      await expect(x.service.findRefund(db.manager, id)).resolves.toMatchObject(
        {
          soTien: '80000.00',
          trangThai: 'ThanhCong',
        },
      );

    // Đường thử lại của job (không có lichHenId trong tay) gắn thông báo vào lịch CUỐI của chuỗi, đúng như đường đầu
    expect(await x.repository.leafOf(db.manager, root!.lichHenId)).toBe(
      leaf!.lichHenId,
    );
  });

  it('HCC-12 đã có hoàn đặc biệt trước ⇒ số hoàn bị cắt theo trần (lưới an toàn): hoàn đặc biệt 70.000 rồi hoàn tự động đòi 50.000 chỉ cộng 30.000; hết chỗ ⇒ NotNeeded', async () => {
    const x = await world();
    await db.query(
      `INSERT INTO lich_su_hoan_tien (giao_dich_thanh_toan_id, vi_noi_bo_id, loai, so_tien, ly_do, trang_thai, so_lan_thu, thoi_diem)
       VALUES (?, ?, 'DacBiet', 70000.00, 'Hoàn đặc biệt', 'ThanhCong', 1, ?)`,
      [x.paymentId, x.walletId, T0],
    );
    await x.wallets.setWallet(x.walletId, '70000.00');

    await expect(
      x.service.refund({
        lichHenId: x.lich.lichHenId,
        soTien: '50000.00',
        lyDo: 'Huỷ',
      }),
    ).resolves.toEqual({ kind: 'Refunded' });
    expect(await balance(x)).toBe('100000.00');
    expect(await attempts(x.paymentId)).toEqual([
      expect.objectContaining({ loai: 'DacBiet', soLanThu: 1 }),
      expect.objectContaining({
        loai: 'TuDong',
        soTien: '30000.00',
        soLanThu: 2,
      }),
    ]);

    // Đã hoàn hết tới trần của khoản: gọi nữa là Refunded (đã có dòng TuDong ThanhCong), không cộng thêm
    await expect(
      x.service.refund({
        lichHenId: x.lich.lichHenId,
        soTien: '50000.00',
        lyDo: 'Huỷ',
      }),
    ).resolves.toEqual({ kind: 'Refunded' });
    expect(await balance(x)).toBe('100000.00');
  });

  it('HCC-12 (biên) hoàn đặc biệt đã hoàn HẾT khoản ⇒ hoàn tự động NotNeeded, không ghi', async () => {
    const x = await world();
    await db.query(
      `INSERT INTO lich_su_hoan_tien (giao_dich_thanh_toan_id, vi_noi_bo_id, loai, so_tien, ly_do, trang_thai, so_lan_thu, thoi_diem)
       VALUES (?, ?, 'DacBiet', 100000.00, 'Hoàn đặc biệt', 'ThanhCong', 1, ?)`,
      [x.paymentId, x.walletId, T0],
    );
    await expect(
      x.service.refund({
        lichHenId: x.lich.lichHenId,
        soTien: '50000.00',
        lyDo: 'Huỷ',
      }),
    ).resolves.toEqual({ kind: 'NotNeeded' });
    expect(await attempts(x.paymentId)).toHaveLength(1);
  });
});

describe('thông báo và đọc', () => {
  it('HCC-13, TDT-04 thông báo hoàn cọc GẮN lich_hen_id của lịch bị huỷ; thông báo hoàn đặc biệt cùng lịch (khác loai_su_kien) không đụng UNIQUE thong_bao_index_lich_hen', async () => {
    const x = await world();
    // Một thông báo loại khác của CÙNG lịch và CÙNG Bệnh nhân (như HoanTienDacBiet của B13)
    await db.query(
      `INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, lich_hen_id, thoi_diem_tao) VALUES (?, 'Hoàn tiền đặc biệt', 'HoanTienDacBiet', ?, ?)`,
      [x.w.patientId, x.lich.lichHenId, T0],
    );

    await expect(
      x.service.refund({
        lichHenId: x.lich.lichHenId,
        soTien: '50000.00',
        lyDo: 'Huỷ',
      }),
    ).resolves.toEqual({ kind: 'Refunded' });

    const all = await notices();
    expect(all.map((n) => n.loai).sort()).toEqual([
      'HoanCocThanhCong',
      'HoanTienDacBiet',
    ]);
    for (const notice of all) expect(notice.lichHenId).toBe(x.lich.lichHenId);
    // payment B17 (TDT-09): đúng MỘT dòng email_thong_bao ChoGui, của thông báo HoanCocThanhCong (dòng HoanTienDacBiet chèn tay ở trên không có thư)
    const mail: { loai: string; trangThai: string }[] = await db.query(
      `SELECT t.loai_su_kien AS loai, e.trang_thai AS trangThai FROM email_thong_bao e JOIN thong_bao t ON t.thong_bao_id = e.thong_bao_id`,
    );
    expect(mail).toEqual([{ loai: 'HoanCocThanhCong', trangThai: 'ChoGui' }]);
  });

  it('HDT-05 findRefund: dòng MỚI NHẤT (so_lan_thu lớn nhất), không lộ số lần thử hay ví; lịch chưa hoàn lần nào hay lịch không có khoản qua ví ⇒ null', async () => {
    const x = await world();
    await expect(
      x.service.findRefund(db.manager, x.lich.lichHenId),
    ).resolves.toBeNull();
    failCredit(x);
    await x.service.refund({
      lichHenId: x.lich.lichHenId,
      soTien: '50000.00',
      lyDo: 'Huỷ',
    });
    await expect(
      x.service.findRefund(db.manager, x.lich.lichHenId),
    ).resolves.toMatchObject({ trangThai: 'ThatBai' });
    await x.job.run(at(6));
    const view = await x.service.findRefund(db.manager, x.lich.lichHenId);
    expect(view).toMatchObject({ trangThai: 'ThanhCong', soTien: '50000.00' });
    expect(Object.keys(view!).sort()).toEqual([
      'soTien',
      'thoiDiem',
      'trangThai',
    ]);
    // Không lộ ví hay số lần thử: chỉ ba khoá ở trên (kiểm tên khoá, không so id vì id '1' khớp nhầm chữ số của ngày giờ)
    expect(JSON.stringify(view)).not.toMatch(/soLanThu|viNoiBo|giaoDich/);
    const none = await x.w.appointment(3, { trangThai: 'DaHuy', coc: '0.00' });
    await expect(
      x.service.findRefund(db.manager, none.lichHenId),
    ).resolves.toBeNull();
  });

  it('HCC-04, M14 job: một khoản lỗi mãi không chặn khoản sau (con trỏ), và run() không bao giờ ném', async () => {
    const x = await world();
    // Khoản thứ hai: lịch khác của cùng Bệnh nhân, cũng có dòng ThatBai quá 5 phút
    const second = await x.w.appointment(1, {
      trangThai: 'DaHuy',
      coc: '40000.00',
    });
    const secondPayment = await x.wallets.insertWalletDeposit({
      viNoiBoId: x.walletId,
      lichHenId: second.lichHenId,
      soTien: '40000.00',
    });
    for (const [paymentId, soTien] of [
      [x.paymentId, '50000.00'],
      [secondPayment, '40000.00'],
    ] as const)
      await db.query(
        `INSERT INTO lich_su_hoan_tien (giao_dich_thanh_toan_id, vi_noi_bo_id, loai, so_tien, ly_do, trang_thai, so_lan_thu, thoi_diem)
         VALUES (?, ?, 'TuDong', ?, 'Huỷ', 'ThatBai', 1, ?)`,
        [paymentId, x.walletId, soTien, T0],
      );
    // Khoản đầu lỗi mãi, khoản sau thành công
    const real = x.ledger.credit.bind(x.ledger);
    vi.spyOn(x.ledger, 'credit').mockImplementation((em, wallet, input) =>
      input.soTien === '50000.00'
        ? Promise.reject(new Error('lỗi giả'))
        : real(em, wallet, input),
    );

    const summary = await x.job.run(at(6));

    expect(summary).toMatchObject({ refunded: 1, failed: 1, notNeeded: 0 });
    expect(await balance(x)).toBe('40000.00');
    expect((await attempts(x.paymentId)).map((r) => r.soLanThu)).toEqual([
      1, 2,
    ]);
    expect((await attempts(secondPayment)).at(-1)).toMatchObject({
      trangThai: 'ThanhCong',
      soLanThu: 2,
    });
  });
});

describe('bất biến ví sau hoàn cọc', () => {
  it('IVT-01…IVT-07 đúng ở MỌI bước: trước, sau lần thất bại (ví không đổi), sau job thử lại thành công, sau khi gọi lặp', async () => {
    const x = await world();
    await assertWalletInvariants(db);

    failCredit(x);
    const input = {
      lichHenId: x.lich.lichHenId,
      soTien: '50000.00',
      lyDo: 'Huỷ',
    };
    await expect(x.service.refund(input)).resolves.toEqual({ kind: 'Failed' });
    await assertWalletInvariants(db);

    await x.job.run(at(6));
    expect(await balance(x)).toBe('50000.00');
    await assertWalletInvariants(db);

    await expect(x.service.refund(input)).resolves.toEqual({
      kind: 'Refunded',
    });
    await assertWalletInvariants(db);
    expect(await balance(x)).toBe('50000.00');
  });
});
