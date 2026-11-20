import type { DataSource } from 'typeorm';
import { failAfterStatement } from '../../appointments/testing/statement-recorder.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { assertWalletInvariants } from '../../wallet/testing/wallet-invariants.js';
import { WalletFixtures } from '../../wallet/testing/wallet-fixtures.js';
import { pendingTopup, reconcileStack } from '../testing/reconcile-stack.js';
import { signedVnpayIpn, topupStack } from '../testing/topup-stack.js';
import type { CreateTopupDto } from '../topup/topup.dto.js';

// payment B14 — `TopupReconcileJob` và `ReconcileService` THẬT trên MySQL 8.4 THẬT (PLAN payment 5.4 bước 5; DST-01…DST-05, DST-07…DST-09; M14 biên 5 phút).
// Phần đồng thời (DST-06, DTT-08): reconcile.concurrency.int-spec.ts. Đồng hồ là MỐC GIẢ truyền vào `run(now)`. Dữ liệu giả.
let db: DataSource;
let wf: WalletFixtures;
let logs: string[];
useIntegrationHooks((d, captured) => {
  db = d;
  wf = new WalletFixtures(d);
  logs = captured;
});

/** Giờ Việt Nam ⇒ Date. */
const vn = (time: string) => new Date(`2026-11-02T${time}+07:00`);
const AT = '2026-11-02 08:00:00'; // lần 0 lúc xác minh

const one = async <T>(sql: string, params: unknown[]) =>
  (await db.query<T[]>(sql, params))[0]!;
const count = async (sql: string, params: unknown[]) =>
  Number((await one<{ n: string }>(sql, params)).n);
const doiSoat = async (id: string) =>
  (
    await one<{ s: string }>(
      'SELECT trang_thai_doi_soat AS s FROM giao_dich_thanh_toan WHERE giao_dich_thanh_toan_id = ?',
      [id],
    )
  ).s;
const napRows = (id: string) =>
  count(
    "SELECT COUNT(*) AS n FROM giao_dich_vi WHERE giao_dich_thanh_toan_id = ? AND loai = 'Nap'",
    [id],
  );
const attempts = (id: string) =>
  db.query<{ n: number; ketQua: string; nguoi: string | null }[]>(
    'SELECT so_lan_thu AS n, ket_qua AS ketQua, nguoi_xu_ly_id AS nguoi FROM lan_doi_soat_nap_vi WHERE giao_dich_thanh_toan_id = ? ORDER BY so_lan_thu',
    [id],
  );
const notices = (loai: string) =>
  db.query<{ taiKhoanId: string; noiDung: string }[]>(
    'SELECT CAST(tai_khoan_id AS CHAR) AS taiKhoanId, noi_dung AS noiDung FROM thong_bao WHERE loai_su_kien = ? ORDER BY tai_khoan_id',
    [loai],
  );

async function walletWithPending(
  options: { soDu?: string; attempts?: { n: number; at: string }[] } = {},
) {
  const { patientId, walletId } = await wf.patientWithWallet();
  if (options.soDu) await wf.fundWallet(walletId, options.soDu);
  const id = await pendingTopup(db, wf, {
    walletId,
    attempts: options.attempts,
  });
  return { patientId, walletId, id };
}

describe('TopupReconcileJob (payment B14)', () => {
  it('DST-01 chọn đúng ứng viên: ChoDoiSoat đến lượt; bỏ qua chưa đến lượt, DaDoiSoat, KhongCan, đã đủ ba lần, đã có Quản trị viên xử lý', async () => {
    const { walletId } = await wf.patientWithWallet();
    const due = await pendingTopup(db, wf, { walletId });
    const notYet = await pendingTopup(db, wf, {
      walletId,
      attempts: [{ n: 0, at: '2026-11-02 08:06:00' }],
    });
    const done = await pendingTopup(db, wf, {
      walletId,
      trangThaiDoiSoat: 'DaDoiSoat',
    });
    const normal = await pendingTopup(db, wf, {
      walletId,
      trangThaiDoiSoat: 'KhongCan',
      attempts: [],
    });
    const exhausted = await pendingTopup(db, wf, {
      walletId,
      attempts: [0, 1, 2, 3].map((n) => ({ n, at: AT })),
    });
    const byAdmin = await pendingTopup(db, wf, {
      walletId,
      attempts: [
        { n: 0, at: AT },
        { n: 4, at: AT },
      ],
    });
    const { repository, job } = reconcileStack(db);
    const ids = await repository.findCandidates(db.manager, {
      before: vn('08:05:00'),
      maxRetries: 3,
      afterId: '0',
      limit: 100,
    });
    expect(ids).toEqual([due]);
    expect(await job.run(vn('08:10:00'))).toEqual({
      credited: 1,
      alreadyCredited: 0,
      failed: 0,
      skipped: 0,
      more: false,
    });
    for (const id of [notYet, done, normal, exhausted, byAdmin])
      expect(await napRows(id)).toBe(0);
    expect(await doiSoat(exhausted)).toBe('ChoDoiSoat');
    // Không kiểm IVT ở ca này: `done`, `normal` CỐ Ý dựng không có dòng `Nap` (chỉ để job bỏ qua), nên IVT-04 báo lệch đúng như thiết kế
  });

  it('DST-02 ★ thử lại thành công ⇒ cộng ví ĐÚNG một lần, DaDoiSoat, lần thử 1 ThanhCong (nguoi_xu_ly_id NULL), thông báo NapViDaDoiSoat; chạy lại không cộng nữa', async () => {
    const { patientId, walletId, id } = await walletWithPending();
    const { job } = reconcileStack(db);
    await job.run(vn('08:10:00'));
    expect(await napRows(id)).toBe(1);
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '100000.00' });
    expect(await doiSoat(id)).toBe('DaDoiSoat');
    expect(await attempts(id)).toEqual([
      { n: 0, ketQua: 'ThatBai', nguoi: null },
      { n: 1, ketQua: 'ThanhCong', nguoi: null },
    ]);
    const reconciled = await notices('NapViDaDoiSoat');
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]).toMatchObject({ taiKhoanId: patientId });
    expect(reconciled[0]!.noiDung).toContain('100.000đ');
    expect(await job.run(vn('08:20:00'))).toMatchObject({ credited: 0 });
    expect(await napRows(id)).toBe(1);
    await assertWalletInvariants(db);
  });

  it('DST-03 ★ (và TDT-03) ba lần thất bại THẬT (số dư vượt decimal(12,2)) ⇒ dừng, giữ ChoDoiSoat, NapViCanXuLy cho MỌI Quản trị viên ToanHeThong đang hoạt động (không ChiNhanh, không tài khoản bị khoá), đúng một lần', async () => {
    const system1 = await wf.admin.admin();
    const system2 = await wf.admin.admin();
    await wf.admin.admin(undefined, { trangThai: 'NgungHoatDong' });
    const branch = await wf.admin.branch();
    await wf.admin.admin(branch);
    const { walletId, id } = await walletWithPending({ soDu: '9999999999.99' });
    const { job } = reconcileStack(db);
    expect(await job.run(vn('08:05:00'))).toMatchObject({ failed: 1 });
    expect(await notices('NapViCanXuLy')).toEqual([]);
    // Chưa đủ 5 phút từ lần 1 ⇒ không thử
    expect(await job.run(vn('08:09:59'))).toMatchObject({
      failed: 0,
      credited: 0,
    });
    expect(await job.run(vn('08:10:00'))).toMatchObject({ failed: 1 });
    expect(await job.run(vn('08:15:00'))).toMatchObject({ failed: 1 });
    expect((await attempts(id)).map((a) => [a.n, a.ketQua])).toEqual([
      [0, 'ThatBai'],
      [1, 'ThatBai'],
      [2, 'ThatBai'],
      [3, 'ThatBai'],
    ]);
    const warned = await notices('NapViCanXuLy');
    expect(warned.map((w) => w.taiKhoanId)).toEqual(
      [system1.account.taiKhoanId, system2.account.taiKhoanId].sort(),
    );
    expect(warned[0]!.noiDung).toContain(`#${id}`);
    expect(warned[0]!.noiDung).not.toContain('100.000');
    // Hết lượt: không thử nữa, vẫn ChoDoiSoat để Quản trị viên xử lý (B15)
    expect(await job.run(vn('09:00:00'))).toMatchObject({
      failed: 0,
      credited: 0,
    });
    expect(await doiSoat(id)).toBe('ChoDoiSoat');
    expect(await notices('NapViCanXuLy')).toHaveLength(2);
    expect(await wf.readWallet(walletId)).toMatchObject({
      soDu: '9999999999.99',
    });
    expect(logs.join('\n')).not.toContain('9999999999');
  });

  it('DST-04 biên 5 phút bằng mốc giả: 4 phút 59 giây chưa thử, 5 phút 00 giây thử', async () => {
    const { id } = await walletWithPending();
    const { job } = reconcileStack(db);
    expect(await job.run(vn('08:04:59'))).toMatchObject({ credited: 0 });
    expect(await napRows(id)).toBe(0);
    expect(await job.run(vn('08:05:00'))).toMatchObject({ credited: 1 });
    expect(await napRows(id)).toBe(1);
  });

  it('DST-05 ★ đã có dòng Nap (Quản trị viên hay lần trước đã cộng) ⇒ KHÔNG cộng, chỉ đánh dấu DaDoiSoat, không lần thử mới, không thông báo', async () => {
    const { walletId, id } = await walletWithPending();
    await wf.insertLedgerRow({
      viNoiBoId: walletId,
      loai: 'Nap',
      soTien: '100000.00',
      soDuSau: '100000.00',
      giaoDichThanhToanId: id,
    });
    await wf.setWallet(walletId, '100000.00');
    const { job } = reconcileStack(db);
    expect(await job.run(vn('08:10:00'))).toMatchObject({
      alreadyCredited: 1,
      credited: 0,
    });
    expect(await napRows(id)).toBe(1);
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '100000.00' });
    expect(await doiSoat(id)).toBe('DaDoiSoat');
    expect(await attempts(id)).toHaveLength(1);
    expect(await notices('NapViDaDoiSoat')).toEqual([]);
    await assertWalletInvariants(db);
  });

  it('DST-07 lỗi một giao dịch không dừng lượt; con trỏ không kẹt (giao dịch sau vẫn được cộng, giao dịch lỗi không bị thử hai lần trong một lượt)', async () => {
    const bad = await walletWithPending({ soDu: '9999999999.99' });
    const good = await walletWithPending();
    const { job } = reconcileStack(db);
    expect(await job.run(vn('08:10:00'))).toMatchObject({
      failed: 1,
      credited: 1,
    });
    expect(await attempts(bad.id)).toHaveLength(2);
    expect(await napRows(good.id)).toBe(1);
  });

  it('DST-08 IPN gửi lại trong lúc ChoDoiSoat ⇒ 02, không cộng, không lần thử mới', async () => {
    const { patientId, walletId } = await wf.patientWithWallet();
    await wf.fundWallet(walletId, '9999999999.99');
    const { topups, ipn } = topupStack(db);
    const { maGiaoDich } = await topups.create(
      patientId,
      { soTien: '100000', phuongThuc: 'VNPay' } as CreateTopupDto,
      '127.0.0.1',
    );
    const signal = signedVnpayIpn({
      giaoDichId: maGiaoDich,
      soTien: '100000.00',
    });
    expect((await ipn.handle('VNPay', signal))?.RspCode).toBe('00');
    expect(await doiSoat(maGiaoDich)).toBe('ChoDoiSoat');
    expect((await ipn.handle('VNPay', signal))?.RspCode).toBe('02');
    expect(await napRows(maGiaoDich)).toBe(0);
    expect(await attempts(maGiaoDich)).toHaveLength(1);
  });

  it('DST-09 so_lan_thu: 0 do B4 ghi lúc xác minh, 1 đến 3 do job theo thứ tự (job lỗi lần 1, thành công lần 2)', async () => {
    const { patientId, walletId } = await wf.patientWithWallet();
    const { topups, ipn } = topupStack(db);
    const { maGiaoDich: id } = await topups.create(
      patientId,
      { soTien: '100000', phuongThuc: 'VNPay' } as CreateTopupDto,
      '127.0.0.1',
    );
    // Ép lỗi ghi sổ cái HAI lần bằng MỘT lần gọi (gọi hai lần sẽ lồng hai lớp chặn): lần cộng đầu của B4 ⇒ lần 0, rồi lần 1 của job
    failAfterStatement(
      db,
      /^INSERT INTO giao_dich_vi/,
      new Error('ghi sổ lỗi (giả)'),
      2,
    );
    expect(
      (
        await ipn.handle(
          'VNPay',
          signedVnpayIpn({ giaoDichId: id, soTien: '100000.00' }),
        )
      )?.RspCode,
    ).toBe('00');
    const { job } = reconcileStack(db);
    const zero = (await attempts(id))[0]!;
    expect(zero).toMatchObject({ n: 0, ketQua: 'ThatBai', nguoi: null });
    // Job lần 1 lỗi, lần 2 thành công 5 phút sau
    const later = new Date(Date.now() + 10 * 60_000);
    expect(await job.run(later)).toMatchObject({ failed: 1 });
    expect(await job.run(new Date(later.getTime() + 5 * 60_000))).toMatchObject(
      { credited: 1 },
    );
    expect((await attempts(id)).map((a) => [a.n, a.ketQua])).toEqual([
      [0, 'ThatBai'],
      [1, 'ThatBai'],
      [2, 'ThanhCong'],
    ]);
    expect(await wf.readWallet(walletId)).toMatchObject({ soDu: '100000.00' });
    await assertWalletInvariants(db);
  });
});
