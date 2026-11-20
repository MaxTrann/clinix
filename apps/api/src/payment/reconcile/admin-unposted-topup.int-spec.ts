import type { DataSource } from 'typeorm';
import { failureOf } from '../../appointments/testing/create-appointment-world.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { WalletFixtures } from '../../wallet/testing/wallet-fixtures.js';
import { assertWalletInvariants } from '../../wallet/testing/wallet-invariants.js';
import {
  EXHAUSTED_ATTEMPTS,
  pendingTopup,
  unpostedStack,
} from '../testing/reconcile-stack.js';

// payment B15 — Quản trị viên xử lý nạp ví chưa cộng, `AdminUnpostedTopupService` THẬT trên MySQL 8.4 THẬT (PLAN payment 5.4 bước 6; NVC-01…NVC-04, NVC-06…NVC-08, NVC-10).
// Đồng thời (NVC-05, DTT-15): admin-unposted-topup.concurrency.int-spec.ts. HTTP (NVC-09): test/payment-unposted-topup.e2e-spec.ts. TDT-03: DST-03 của reconcile.int-spec.ts. Dữ liệu giả.
let db: DataSource;
let wf: WalletFixtures;
let logs: string[];
useIntegrationHooks((d, captured) => {
  db = d;
  wf = new WalletFixtures(d);
  logs = captured;
});

const REASON = 'Cổng báo thành công nhưng ngân hàng đang tra soát lại';

const one = async <T>(sql: string, params: unknown[]) =>
  (await db.query<T[]>(sql, params))[0]!;
const count = async (sql: string, params: unknown[] = []) =>
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
  db.query<
    { n: number; ketQua: string; nguoi: string | null; lyDo: string | null }[]
  >(
    'SELECT so_lan_thu AS n, ket_qua AS ketQua, CAST(nguoi_xu_ly_id AS CHAR) AS nguoi, ly_do AS lyDo FROM lan_doi_soat_nap_vi WHERE giao_dich_thanh_toan_id = ? ORDER BY so_lan_thu',
    [id],
  );
const auditRows = (id: string) =>
  db.query<{ actor: string; branch: string | null; changes: unknown }[]>(
    `SELECT CAST(tai_khoan_id AS CHAR) AS actor, chi_nhanh_id AS branch, chi_tiet_thay_doi AS changes
       FROM nhat_ky_hanh_dong WHERE hanh_dong = 'XuLyNapViChuaCong' AND loai_doi_tuong = 'giao_dich_thanh_toan' AND ma_doi_tuong = ?`,
    [id],
  );
const notices = (loai: string) =>
  db.query<{ taiKhoanId: string; noiDung: string }[]>(
    'SELECT CAST(tai_khoan_id AS CHAR) AS taiKhoanId, noi_dung AS noiDung FROM thong_bao WHERE loai_su_kien = ?',
    [loai],
  );
const nameOf = async (accountId: string) =>
  (
    await one<{ hoTen: string }>(
      'SELECT ho_ten AS hoTen FROM tai_khoan WHERE tai_khoan_id = ?',
      [accountId],
    )
  ).hoTen;

/** Bệnh nhân có ví 50.000đ (sổ cái nhất quán) và MỘT giao dịch nạp 100.000đ đã hết lượt đối soát tự động; một Quản trị viên toàn hệ thống. */
async function world() {
  const { patientId, walletId } = await wf.patientWithWallet();
  await wf.fundWallet(walletId, '50000.00');
  const id = await pendingTopup(db, wf, {
    walletId,
    attempts: EXHAUSTED_ATTEMPTS,
  });
  const admin = await wf.admin.admin();
  return {
    patientId,
    walletId,
    id,
    adminId: admin.account.taiKhoanId,
    service: unpostedStack(db),
  };
}

describe('hàng đợi và chi tiết', () => {
  it('NVC-01 ★ danh sách CHỈ có nạp ThanhCong + ChoDoiSoat đã đủ ba lần job thất bại; không có chưa hết lượt, DaDoiSoat, KhongCan', async () => {
    const w = await world();
    const notYet = await pendingTopup(db, wf, {
      walletId: w.walletId,
      attempts: EXHAUSTED_ATTEMPTS.slice(0, 2),
    });
    const done = await pendingTopup(db, wf, {
      walletId: w.walletId,
      trangThaiDoiSoat: 'DaDoiSoat',
      attempts: EXHAUSTED_ATTEMPTS,
    });
    const normal = await pendingTopup(db, wf, {
      walletId: w.walletId,
      trangThaiDoiSoat: 'KhongCan',
      attempts: [],
    });

    const { items } = await w.service.list();

    expect(items).toStrictEqual([
      {
        maGiaoDich: w.id,
        phuongThuc: 'VNPay',
        maGiaoDichCong: expect.any(String),
        benhNhan: { hoTen: await nameOf(w.patientId) },
        soTien: '100000.00',
        thoiDiemXacMinh: new Date('2026-11-02T08:00:00+07:00').toISOString(),
        soLanThuTuDong: 3,
        toiDaThuTuDong: 3,
        trangThaiXuLy: 'ChoXuLy',
        lyDoKhongTheXuLy: null,
      },
    ]);
    for (const other of [notYet, done, normal])
      expect(items.map((item) => item.maGiaoDich)).not.toContain(other);
  });

  it('NVC-02 chi tiết kèm MỌI lần thử (số lần, kết quả, lý do, người xử lý), thời điểm xác minh = dòng 0; không ở hàng đợi hay id sai dạng ⇒ CÙNG một 404', async () => {
    const w = await world();
    const notYet = await pendingTopup(db, wf, {
      walletId: w.walletId,
      attempts: EXHAUSTED_ATTEMPTS.slice(0, 3),
    });

    const detail = await w.service.detail(w.id);

    expect(detail.thoiDiemXacMinh).toBe(
      new Date('2026-11-02T08:00:00+07:00').toISOString(),
    );
    expect(detail.lanThu).toStrictEqual(
      EXHAUSTED_ATTEMPTS.map((a) => ({
        soLanThu: a.n,
        ketQua: 'ThatBai',
        lyDo: 'MA_GIA',
        nguoiXuLy: null,
        thoiDiem: new Date(`${a.at.replace(' ', 'T')}+07:00`).toISOString(),
      })),
    );
    const bodies = [];
    for (const code of [notYet, '999999999', 'abc', '0'])
      bodies.push(await failureOf(w.service.detail(code)));
    for (const body of bodies) {
      expect(body.status).toBe(404);
      expect(body).toStrictEqual(bodies[0]);
    }
  });
});

describe('Cộng ví', () => {
  it('NVC-03 ★ cộng ĐÚNG số tiền của giao dịch, DaDoiSoat, lần thử ThanhCong số 4 kèm người xử lý, nhật ký XuLyNapViChuaCong, thông báo Bệnh nhân; rời hàng đợi', async () => {
    const w = await world();

    const result = await w.service.credit(w.adminId, w.id);

    expect(result).toStrictEqual({
      maGiaoDich: w.id,
      trangThaiDoiSoat: 'DaDoiSoat',
    });
    expect(await wf.readWallet(w.walletId)).toMatchObject({
      soDu: '150000.00',
    });
    expect(await napRows(w.id)).toBe(1);
    expect(await doiSoat(w.id)).toBe('DaDoiSoat');
    expect((await attempts(w.id)).at(-1)).toStrictEqual({
      n: 4,
      ketQua: 'ThanhCong',
      nguoi: w.adminId,
      lyDo: null,
    });
    const audits = await auditRows(w.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actor: w.adminId, branch: null });
    expect(audits[0]!.changes).toStrictEqual({
      ket_qua: 'ThanhCong',
      so_tien: '100000.00',
    });
    const notice = await notices('NapViDaDoiSoat');
    expect(notice.map((n) => n.taiKhoanId)).toEqual([w.patientId]);
    expect((await w.service.list()).items).toEqual([]);
    await assertWalletInvariants(db);
  });

  it('NVC-04 đã có dòng Nap (tiền đã vào ví theo đường khác) ⇒ 409 GIAO_DICH_NAP_DA_DOI_SOAT kèm trạng thái, KHÔNG cộng thêm; giao dịch rời hàng đợi', async () => {
    const w = await world();
    await wf.insertLedgerRow({
      viNoiBoId: w.walletId,
      loai: 'Nap',
      soTien: '100000.00',
      soDuSau: '150000.00',
      giaoDichThanhToanId: w.id,
    });
    await wf.setWallet(w.walletId, '150000.00');

    const failure = await failureOf(w.service.credit(w.adminId, w.id));

    expect(failure.status).toBe(409);
    expect(failure.body).toMatchObject({
      maLoi: 'GIAO_DICH_NAP_DA_DOI_SOAT',
      chiTiet: { trangThaiDoiSoat: 'DaDoiSoat' },
    });
    expect(await napRows(w.id)).toBe(1);
    expect(await wf.readWallet(w.walletId)).toMatchObject({
      soDu: '150000.00',
    });
    expect(await doiSoat(w.id)).toBe('DaDoiSoat');
    expect(await auditRows(w.id)).toEqual([]);
    expect((await attempts(w.id)).map((a) => a.n)).toEqual([0, 1, 2, 3]);
  });

  it('NVC-04 cộng lần hai sau khi đã cộng ⇒ 409, ví chỉ được cộng một lần; "Không thể xử lý" sau khi đã cộng ⇒ cũng 409', async () => {
    const w = await world();
    await w.service.credit(w.adminId, w.id);
    for (const again of [
      w.service.credit(w.adminId, w.id),
      w.service.markUnprocessable(w.adminId, w.id, REASON),
    ]) {
      const failure = await failureOf(again);
      expect(failure.status).toBe(409);
      expect(failure.body.maLoi).toBe('GIAO_DICH_NAP_DA_DOI_SOAT');
    }
    expect(await napRows(w.id)).toBe(1);
    expect(await auditRows(w.id)).toHaveLength(1);
    await assertWalletInvariants(db);
  });

  it('chưa hết lượt tự động (job còn đang xử lý) ⇒ 404, không cộng, không ghi lần thử', async () => {
    const w = await world();
    const notYet = await pendingTopup(db, wf, {
      walletId: w.walletId,
      attempts: EXHAUSTED_ATTEMPTS.slice(0, 3),
    });
    const failure = await failureOf(w.service.credit(w.adminId, notYet));
    expect(failure.status).toBe(404);
    expect(await napRows(notYet)).toBe(0);
    expect((await attempts(notYet)).map((a) => a.n)).toEqual([0, 1, 2]);
  });

  it('NVC-08 nhật ký lỗi ⇒ hoàn tác TRỌN: ví, dòng Nap, trạng thái đối soát, lần thử, thông báo đều như cũ', async () => {
    const w = await world();
    const broken = unpostedStack(db, {
      record: () => Promise.reject(new Error('nhật ký hỏng')),
    });

    await expect(broken.credit(w.adminId, w.id)).rejects.toThrow(
      'nhật ký hỏng',
    );

    expect(await wf.readWallet(w.walletId)).toMatchObject({
      soDu: '50000.00',
    });
    expect(await napRows(w.id)).toBe(0);
    expect(await doiSoat(w.id)).toBe('ChoDoiSoat');
    expect((await attempts(w.id)).map((a) => a.n)).toEqual([0, 1, 2, 3]);
    expect(await notices('NapViDaDoiSoat')).toEqual([]);
    await assertWalletInvariants(db);
  });

  it('NVC-10 cộng ví KHÔNG tạo dòng hoàn tiền và không đổi yêu cầu rút nào', async () => {
    const w = await world();
    const before = {
      refunds: await count('SELECT COUNT(*) AS n FROM lich_su_hoan_tien'),
      withdrawals: await count('SELECT COUNT(*) AS n FROM yeu_cau_rut_tien'),
    };
    await w.service.credit(w.adminId, w.id);
    expect(await count('SELECT COUNT(*) AS n FROM lich_su_hoan_tien')).toBe(
      before.refunds,
    );
    expect(await count('SELECT COUNT(*) AS n FROM yeu_cau_rut_tien')).toBe(
      before.withdrawals,
    );
    expect(await wf.readWallet(w.walletId)).toMatchObject({
      soTienDangGiu: '0.00',
    });
  });
});

describe('Không thể xử lý', () => {
  it('NVC-06 ghi KhongTheXuLy kèm lý do và người xử lý; GIỮ hàng đợi (hiện trạng thái và lý do); nhật ký; thông báo NapViChuaXuLyDuoc KHÔNG chép lý do nội bộ', async () => {
    const w = await world();

    const result = await w.service.markUnprocessable(w.adminId, w.id, REASON);

    expect(result).toStrictEqual({
      maGiaoDich: w.id,
      trangThaiDoiSoat: 'ChoDoiSoat',
    });
    expect((await attempts(w.id)).at(-1)).toStrictEqual({
      n: 4,
      ketQua: 'KhongTheXuLy',
      nguoi: w.adminId,
      lyDo: REASON,
    });
    expect(await napRows(w.id)).toBe(0);
    expect(await wf.readWallet(w.walletId)).toMatchObject({
      soDu: '50000.00',
    });
    const [item] = (await w.service.list()).items;
    expect(item).toMatchObject({
      maGiaoDich: w.id,
      trangThaiXuLy: 'KhongTheXuLy',
      lyDoKhongTheXuLy: REASON,
    });
    expect((await auditRows(w.id))[0]!.changes).toStrictEqual({
      ket_qua: 'KhongTheXuLy',
      so_tien: '100000.00',
      ly_do: REASON,
    });
    const notice = await notices('NapViChuaXuLyDuoc');
    expect(notice.map((n) => n.taiKhoanId)).toEqual([w.patientId]);
    expect(notice[0]!.noiDung).not.toContain(REASON);
    expect(logs.join('\n')).not.toContain(REASON);
  });

  it('NVC-07 sau KhongTheXuLy vẫn Cộng ví được: lần thử 5 ThanhCong, cộng đúng một lần', async () => {
    const w = await world();
    await w.service.markUnprocessable(w.adminId, w.id, REASON);

    await w.service.credit(w.adminId, w.id);

    expect((await attempts(w.id)).map((a) => [a.n, a.ketQua])).toEqual([
      [0, 'ThatBai'],
      [1, 'ThatBai'],
      [2, 'ThatBai'],
      [3, 'ThatBai'],
      [4, 'KhongTheXuLy'],
      [5, 'ThanhCong'],
    ]);
    expect(await napRows(w.id)).toBe(1);
    expect(await auditRows(w.id)).toHaveLength(2);
    await assertWalletInvariants(db);
  });
});
