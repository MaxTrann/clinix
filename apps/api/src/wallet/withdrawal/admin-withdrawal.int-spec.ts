import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { adminWithdrawalStack } from '../testing/admin-withdrawal-stack.js';
import { WalletFixtures } from '../testing/wallet-fixtures.js';
import { assertWalletInvariants } from '../testing/wallet-invariants.js';
import { withdrawalStack } from '../testing/withdrawal-stack.js';

// payment B12 — `AdminWithdrawalService` THẬT trên MySQL 8.4 THẬT (PLAN payment 5.8, 5.3; XRT-01…XRT-07, XRT-09…XRT-11, TDT-05, TDT-08). Phần đồng thời (XRT-05, DTT-09): admin-withdrawal.concurrency.int-spec.ts;
// phần HTTP (XRT-08, QTT-06, XRT-12): test/wallet-admin-withdrawal.e2e-spec.ts. Dữ liệu giả.
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

/** Bệnh nhân có ví `soDu`, đã gửi yêu cầu rút `soTien` (đang giữ tiền), cùng một Quản trị viên toàn hệ thống. */
async function pendingRequest(soDu = '350000.00', soTien = '100000') {
  const patient = await wf.patientWithWallet();
  await wf.fundWallet(patient.walletId, soDu);
  const created = await withdrawalStack(db).request(patient.patientId, soTien);
  const admin = await wf.admin.admin();
  return {
    ...patient,
    maYeuCau: created.maYeuCau,
    adminId: admin.account.taiKhoanId,
  };
}

const rows = <T>(sql: string, params: unknown[]) => db.query<T[]>(sql, params);
const ledger = (walletId: string) =>
  rows<{ loai: string; soTien: string; soDuSau: string; yc: string | null }>(
    `SELECT loai, so_tien AS soTien, so_du_sau AS soDuSau, CAST(yeu_cau_rut_tien_id AS CHAR) AS yc
       FROM giao_dich_vi WHERE vi_noi_bo_id = ? AND loai = 'Rut'`,
    [walletId],
  );
const requestRow = (maYeuCau: string) =>
  rows<{ trangThai: string; nguoi: string | null; xuLy: Date | null }>(
    'SELECT trang_thai AS trangThai, CAST(nguoi_xu_ly_id AS CHAR) AS nguoi, thoi_diem_xu_ly AS xuLy FROM yeu_cau_rut_tien WHERE yeu_cau_rut_tien_id = ?',
    [maYeuCau],
  ).then((r) => r[0]!);
const notices = (taiKhoanId: string, loai: string) =>
  rows<{ noiDung: string; lichHenId: string | null }>(
    'SELECT noi_dung AS noiDung, lich_hen_id AS lichHenId FROM thong_bao WHERE tai_khoan_id = ? AND loai_su_kien = ?',
    [taiKhoanId, loai],
  );
const audits = (maYeuCau: string) =>
  rows<{
    hanhDong: string;
    nguoi: string;
    chiNhanh: string | null;
    ketQua: string;
    chiTiet: unknown;
  }>(
    `SELECT hanh_dong AS hanhDong, CAST(tai_khoan_id AS CHAR) AS nguoi, chi_nhanh_id AS chiNhanh, ket_qua AS ketQua, chi_tiet_thay_doi AS chiTiet
       FROM nhat_ky_hanh_dong WHERE loai_doi_tuong = 'yeu_cau_rut_tien' AND ma_doi_tuong = ?`,
    [maYeuCau],
  );
const parse = (value: unknown): unknown =>
  typeof value === 'string' ? JSON.parse(value) : value;

describe('AdminWithdrawalService.list và detail (payment B12)', () => {
  it('XRT-01 danh sách theo trạng thái kèm demTheoTrangThai, mới nhất trước, phân trang, trang vượt cuối rỗng', async () => {
    const a = await pendingRequest();
    const b = await pendingRequest();
    const c = await pendingRequest();
    const service = adminWithdrawalStack(db);
    await service.approve(a.adminId, a.maYeuCau);
    await service.reject(a.adminId, b.maYeuCau);

    const all = await service.list({ trang: 1, kichThuoc: 2, offset: 0 });
    expect(all.total).toBe(3);
    expect(all.items.map((i) => i.maYeuCau)).toEqual([c.maYeuCau, b.maYeuCau]);
    expect(all.demTheoTrangThai).toEqual({
      tatCa: 3,
      choDuyet: 1,
      daDuyet: 1,
      tuChoi: 1,
    });
    const second = await service.list({ trang: 2, kichThuoc: 2, offset: 2 });
    expect(second.items.map((i) => i.maYeuCau)).toEqual([a.maYeuCau]);
    const pending = await service.list({
      trangThai: 'ChoDuyet',
      trang: 1,
      kichThuoc: 20,
      offset: 0,
    });
    expect(pending.items.map((i) => i.maYeuCau)).toEqual([c.maYeuCau]);
    // Đếm theo trạng thái KHÔNG đổi theo bộ lọc (các tab luôn đủ số)
    expect(pending.demTheoTrangThai.tatCa).toBe(3);
    const beyond = await service.list({ trang: 9, kichThuoc: 20, offset: 160 });
    expect(beyond.items).toEqual([]);
    expect(beyond.total).toBe(3);
  });

  it('XRT-01 chưa có yêu cầu nào ⇒ danh sách rỗng, bốn số đếm bằng 0 (biên)', async () => {
    const page = await adminWithdrawalStack(db).list({
      trang: 1,
      kichThuoc: 20,
      offset: 0,
    });
    expect(page).toMatchObject({
      items: [],
      total: 0,
      demTheoTrangThai: { tatCa: 0, choDuyet: 0, daDuyet: 0, tuChoi: 0 },
    });
  });

  it('XRT-02 chi tiết: số tiền, số dư hiện tại, số đang giữ, giao dịch gần đây; họ tên Bệnh nhân', async () => {
    const r = await pendingRequest('350000.00', '100000');
    const detail = await adminWithdrawalStack(db).detail(r.maYeuCau);
    expect(detail).toMatchObject({
      maYeuCau: r.maYeuCau,
      soTien: '100000.00',
      trangThai: 'ChoDuyet',
      soDuHienTai: '350000.00',
      soTienDangGiu: '100000.00',
      thoiDiemXuLy: null,
      benhNhan: { hoTen: expect.any(String) },
    });
    expect(detail.giaoDichGanDay).toEqual([
      {
        thoiDiem: expect.any(String),
        loai: 'Nap',
        soTien: '350000.00',
      },
    ]);
  });

  it('XRT-09 yêu cầu không tồn tại ⇒ 404 KHONG_TIM_THAY (chi tiết, duyệt, từ chối)', async () => {
    const service = adminWithdrawalStack(db);
    const admin = await wf.admin.admin();
    const adminId = admin.account.taiKhoanId;
    for (const work of [
      service.detail('999999'),
      service.approve(adminId, '999999'),
      service.reject(adminId, '999999'),
    ])
      expect(await failure(work)).toMatchObject({
        status: 404,
        maLoi: 'KHONG_TIM_THAY',
      });
  });
});

describe('AdminWithdrawalService.approve và reject (payment B12)', () => {
  it('XRT-03 ★ duyệt ⇒ DaDuyet; so_du và so_tien_dang_giu cùng giảm; một dòng Rut số âm; người và thời điểm xử lý; audit DuyetRutTien; thông báo (TDT-05)', async () => {
    const r = await pendingRequest('350000.00', '100000');
    const result = await adminWithdrawalStack(db).approve(
      r.adminId,
      r.maYeuCau,
    );
    expect(result).toEqual({ maYeuCau: r.maYeuCau, trangThai: 'DaDuyet' });
    expect(await wf.readWallet(r.walletId)).toEqual({
      soDu: '250000.00',
      soTienDangGiu: '0.00',
    });
    expect(await ledger(r.walletId)).toEqual([
      {
        loai: 'Rut',
        soTien: '-100000.00',
        soDuSau: '250000.00',
        yc: r.maYeuCau,
      },
    ]);
    const row = await requestRow(r.maYeuCau);
    expect(row).toMatchObject({ trangThai: 'DaDuyet', nguoi: r.adminId });
    expect(row.xuLy).toBeInstanceOf(Date);
    const log = await audits(r.maYeuCau);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      hanhDong: 'DuyetRutTien',
      nguoi: r.adminId,
      chiNhanh: null,
      ketQua: 'ThanhCong',
    });
    const sent = await notices(r.patientId, 'RutTienDuocDuyet');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.noiDung).toContain('100.000đ');
    expect(sent[0]!.lichHenId).toBeNull();
    await assertWalletInvariants(db);
  });

  it('XRT-04 từ chối ⇒ TuChoi; chỉ so_tien_dang_giu giảm; KHÔNG giao_dich_vi mới; audit TuChoiRutTien; thông báo (TDT-05)', async () => {
    const r = await pendingRequest('350000.00', '100000');
    const result = await adminWithdrawalStack(db).reject(r.adminId, r.maYeuCau);
    expect(result).toEqual({ maYeuCau: r.maYeuCau, trangThai: 'TuChoi' });
    expect(await wf.readWallet(r.walletId)).toEqual({
      soDu: '350000.00',
      soTienDangGiu: '0.00',
    });
    expect(await ledger(r.walletId)).toEqual([]);
    expect(await requestRow(r.maYeuCau)).toMatchObject({
      trangThai: 'TuChoi',
      nguoi: r.adminId,
    });
    expect((await audits(r.maYeuCau))[0]).toMatchObject({
      hanhDong: 'TuChoiRutTien',
      nguoi: r.adminId,
    });
    const sent = await notices(r.patientId, 'RutTienBiTuChoi');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.noiDung).toContain('từ chối');
    // Tiền được trả lại khả dụng: Bệnh nhân gửi được yêu cầu mới
    await withdrawalStack(db).request(r.patientId, '350000');
    await assertWalletInvariants(db);
  });

  it('XRT-05 xử lý lại yêu cầu đã duyệt hay đã từ chối ⇒ 409 YEU_CAU_DA_XU_LY kèm trạng thái; ví và sổ cái không đổi thêm', async () => {
    const r = await pendingRequest();
    const service = adminWithdrawalStack(db);
    await service.approve(r.adminId, r.maYeuCau);
    expect(await failure(service.approve(r.adminId, r.maYeuCau))).toEqual({
      status: 409,
      maLoi: 'YEU_CAU_DA_XU_LY',
      chiTiet: { trangThai: 'DaDuyet' },
    });
    expect(await failure(service.reject(r.adminId, r.maYeuCau))).toMatchObject({
      status: 409,
      chiTiet: { trangThai: 'DaDuyet' },
    });
    expect(await wf.readWallet(r.walletId)).toEqual({
      soDu: '250000.00',
      soTienDangGiu: '0.00',
    });
    expect(await ledger(r.walletId)).toHaveLength(1);
    expect(await audits(r.maYeuCau)).toHaveLength(1);

    const s = await pendingRequest();
    await service.reject(s.adminId, s.maYeuCau);
    expect(await failure(service.approve(s.adminId, s.maYeuCau))).toMatchObject(
      { status: 409, chiTiet: { trangThai: 'TuChoi' } },
    );
  });

  it('XRT-06 ghiChu đi vào thông báo và chi_tiet_thay_doi.ly_do; không có ghiChu thì không có khoá ly_do (cả duyệt và từ chối)', async () => {
    const service = adminWithdrawalStack(db);
    const a = await pendingRequest();
    await service.reject(a.adminId, a.maYeuCau, 'Sai thông tin tài khoản');
    expect(
      (await notices(a.patientId, 'RutTienBiTuChoi'))[0]!.noiDung,
    ).toContain('Sai thông tin tài khoản');
    expect(parse((await audits(a.maYeuCau))[0]!.chiTiet)).toMatchObject({
      ly_do: 'Sai thông tin tài khoản',
    });

    const b = await pendingRequest();
    await service.approve(b.adminId, b.maYeuCau);
    const changes = parse((await audits(b.maYeuCau))[0]!.chiTiet) as Record<
      string,
      unknown
    >;
    expect(Object.keys(changes).toSorted()).toEqual([
      'sau',
      'so_tien',
      'truoc',
    ]);

    // Biên: ghi chú dài đúng 200 ký tự vẫn vừa thông báo (≤ 500) và nhật ký
    const c = await pendingRequest();
    await service.approve(c.adminId, c.maYeuCau, 'x'.repeat(200));
    const long = (await notices(c.patientId, 'RutTienDuocDuyet'))[0]!;
    expect(long.noiDung.length).toBeLessThanOrEqual(500);
    expect(long.noiDung).toContain('x'.repeat(200));
  });

  it('XRT-07, TDT-08 ★ nhật ký lỗi ⇒ hoàn tác tất cả: yêu cầu vẫn ChoDuyet, ví không đổi, không dòng Rut, không thông báo (duyệt và từ chối)', async () => {
    const r = await pendingRequest('350000.00', '100000');
    const broken = adminWithdrawalStack(db, {
      record: () => Promise.reject(new Error('audit hỏng')),
    });
    await expect(broken.approve(r.adminId, r.maYeuCau)).rejects.toThrow(
      'audit hỏng',
    );
    await expect(broken.reject(r.adminId, r.maYeuCau)).rejects.toThrow(
      'audit hỏng',
    );
    expect(await requestRow(r.maYeuCau)).toMatchObject({
      trangThai: 'ChoDuyet',
      nguoi: null,
      xuLy: null,
    });
    expect(await wf.readWallet(r.walletId)).toEqual({
      soDu: '350000.00',
      soTienDangGiu: '100000.00',
    });
    expect(await ledger(r.walletId)).toEqual([]);
    expect(await notices(r.patientId, 'RutTienDuocDuyet')).toEqual([]);
    expect(await notices(r.patientId, 'RutTienBiTuChoi')).toEqual([]);
    expect(await audits(r.maYeuCau)).toEqual([]);
    await assertWalletInvariants(db);
  });

  it('XRT-10 payload nhật ký đúng danh sách trắng: chỉ trạng thái, so_tien, ly_do; không họ tên, email, SĐT, id ví', async () => {
    const r = await pendingRequest();
    await adminWithdrawalStack(db).approve(r.adminId, r.maYeuCau, 'Đã chuyển');
    const raw = JSON.stringify((await audits(r.maYeuCau))[0]!.chiTiet);
    expect(parse((await audits(r.maYeuCau))[0]!.chiTiet)).toEqual({
      truoc: { trang_thai: 'ChoDuyet' },
      sau: { trang_thai: 'DaDuyet' },
      so_tien: '100000.00',
      ly_do: 'Đã chuyển',
    });
    expect(raw).not.toContain('@');
    expect(raw).not.toContain('benh_nhan');
  });

  it('XRT-11 sau duyệt và sau từ chối, bất biến IVT-01…IVT-03 giữ (nhiều Bệnh nhân, ví khác không bị chạm)', async () => {
    const service = adminWithdrawalStack(db);
    const a = await pendingRequest('500000.00', '200000');
    const b = await pendingRequest('300000.00', '300000');
    const bystander = await wf.patientWithWallet();
    await wf.fundWallet(bystander.walletId, '70000.00');
    await service.approve(a.adminId, a.maYeuCau);
    await service.reject(b.adminId, b.maYeuCau);
    expect(await wf.readWallet(a.walletId)).toEqual({
      soDu: '300000.00',
      soTienDangGiu: '0.00',
    });
    expect(await wf.readWallet(b.walletId)).toEqual({
      soDu: '300000.00',
      soTienDangGiu: '0.00',
    });
    expect(await wf.readWallet(bystander.walletId)).toEqual({
      soDu: '70000.00',
      soTienDangGiu: '0.00',
    });
    await assertWalletInvariants(db);
  });

  it('XRT-03 biên: yêu cầu đúng bằng toàn bộ số dư ⇒ duyệt xong ví về 0, không vi phạm chk_vi_so_du', async () => {
    const r = await pendingRequest('120000.00', '120000');
    await adminWithdrawalStack(db).approve(r.adminId, r.maYeuCau);
    expect(await wf.readWallet(r.walletId)).toEqual({
      soDu: '0.00',
      soTienDangGiu: '0.00',
    });
    await assertWalletInvariants(db);
  });
});
