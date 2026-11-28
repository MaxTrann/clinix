import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import {
  interceptStatements,
  recordStatements,
  WRITE_OR_LOCK_SQL,
} from '../../appointments/testing/statement-recorder.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { AdminScopeRepository } from '../../rbac/admin-scope.repository.js';
import { AdminScopeService } from '../../rbac/admin-scope.service.js';
import {
  D0_NOW,
  D0_RANGE,
  DashboardFixtures,
  type D0World,
} from '../testing/dashboard-fixtures.js';
import { AdminDashboardService } from './admin-dashboard.service.js';

// dashboard B1, B2 — tầng service và SQL trên MySQL THẬT với bộ D0 (PLAN dashboard 7.0, 7.1, 7.3 đến 7.5): DVM-01…DVM-03, DKG-01…DKG-04, DHN-01…DHN-03, DQP-06,
// DRG-02 (B1); DCH-01…DCH-05, DXH-01, DXH-02, DXH-04, DCD-01, DCD-04, DRG-03 (B2).
// Phần HTTP (quyền, mã lỗi, header, khoá phản hồi) ở `test/dashboard-admin.e2e-spec.ts`. Đồng hồ giả ở 04/12/2026 10:00 giờ Việt Nam.

let db: DataSource;
let dfx: DashboardFixtures;
let service: AdminDashboardService;

useIntegrationHooks((source) => {
  db = source;
  dfx = new DashboardFixtures(source);
  service = new AdminDashboardService(source);
});

beforeEach(() => {
  vi.setSystemTime(D0_NOW);
});

const ALL: AdminScope = { kind: 'ToanHeThong' };

/** Điểm theo ngày của bộ lọc chuẩn 01/12 đến 07/12, số lịch lần lượt từng ngày. */
const dailyPoints = (counts: readonly number[]) =>
  counts.map((soLuong, index) => {
    const ngay = `2026-12-0${index + 1}`;
    return { tuNgay: ngay, denNgay: ngay, soLuong };
  });
const branchScope = (chiNhanhId: string): AdminScope => ({
  kind: 'ChiNhanh',
  chiNhanhId,
});

/** Thêm lịch ở trạng thái cho trước vào các khung mới của một ca (dùng cho ca âm). Trả id lịch. */
async function addAppointments(
  w: D0World,
  input: {
    doctor: 'd1' | 'd2';
    ngay: string;
    ca?: 'CaSang' | 'CaChieu';
    items: readonly (readonly [string, TrangThaiLichHen])[];
  },
): Promise<string[]> {
  const doctor = w[input.doctor].profile;
  const slotIds = await dfx.shift(
    doctor,
    input.ngay,
    input.ca ?? 'CaSang',
    input.items.map(([time]) => time),
  );
  const ids: string[] = [];
  for (const [index, [, trangThai]] of input.items.entries()) {
    const khungGioId = slotIds[index];
    if (khungGioId === undefined) throw new Error('Thiếu khung');
    const row = await dfx.fx.appointmentIn(trangThai, {
      doctor,
      khungGioId,
      patientId: w.patient.account.taiKhoanId,
    });
    ids.push(row.lichHenId);
  }
  return ids;
}

async function errorOf(promise: Promise<unknown>): Promise<AppException> {
  const outcome = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  if (outcome instanceof AppException) return outcome;
  throw outcome ?? new Error('Lẽ ra phải ném AppException');
}

describe('dashboard B1 — số liệu lịch hẹn trên bộ D0', () => {
  it('DVM-01, DKG-01, DHN-01, DCH-01, DXH-01, DCD-01: tất cả, chi nhánh A, chi nhánh B đúng bảng 7.0', async () => {
    const w = await dfx.d0();
    const all = await service.overview(ALL, D0_RANGE);
    // So TOÀN BỘ phản hồi (danh sách khoá đúng như hợp đồng 5.7)
    expect(all).toStrictEqual({
      boLoc: { ...D0_RANGE, chiNhanhId: null },
      capNhatLuc: D0_NOW.toISOString(),
      homNay: { ngay: '2026-12-04', lichKham: 3, hoanThanh: 1 },
      trongKhoang: { lichKham: 7, hoanThanh: 3 },
      vangMat: { tuSo: 2, mauSo: 6, phanTram: 33.3 },
      khungGio: { tuSo: 7, mauSo: 12, phanTram: 58.3 },
      tienCoc: { soKhoan: 6, tongTien: '710000.00' },
      hoanTien: { soKhoan: 3, tongTien: '230000.00', soKhoanDangLoi: 1 },
      xuHuong: { donVi: 'Ngay', diem: dailyPoints([3, 2, 1, 2, 0, 0, 1]) },
      choDuyet: { nghiPhep: 2, doiLich: 3, thayDoiChiNhanh: 1, rutTien: 2 },
      coDuLieu: true,
    });
    // Quản trị viên Chi nhánh A (phạm vi ép), và Toàn hệ thống lọc A (rút tiền vẫn là số toàn hệ thống, MH1)
    expect(
      await service.overview(branchScope(w.branchA), D0_RANGE),
    ).toMatchObject({
      tienCoc: { soKhoan: 5, tongTien: '620000.00' },
      hoanTien: { soKhoan: 3, tongTien: '230000.00', soKhoanDangLoi: 0 },
      xuHuong: { diem: dailyPoints([2, 2, 1, 2, 0, 0, 1]) },
      choDuyet: { nghiPhep: 1, doiLich: 2, thayDoiChiNhanh: 1, rutTien: null },
    });
    expect(
      (await service.overview(ALL, { ...D0_RANGE, chiNhanhId: w.branchA }))
        .choDuyet.rutTien,
    ).toBe(2);
    expect(
      await service.overview(branchScope(w.branchB), D0_RANGE),
    ).toMatchObject({
      tienCoc: { soKhoan: 1, tongTien: '90000.00' },
      hoanTien: { soKhoan: 0, tongTien: '0.00', soKhoanDangLoi: 1 },
      xuHuong: { diem: dailyPoints([1, 0, 0, 0, 0, 0, 0]) },
      choDuyet: { nghiPhep: 1, doiLich: 1, thayDoiChiNhanh: 0, rutTien: null },
    });
    const a = await service.overview(branchScope(w.branchA), D0_RANGE);
    expect(a).toMatchObject({
      boLoc: { chiNhanhId: w.branchA },
      homNay: { lichKham: 3, hoanThanh: 1 },
      trongKhoang: { lichKham: 5, hoanThanh: 2 },
      vangMat: { tuSo: 1, mauSo: 4, phanTram: 25 },
      khungGio: { tuSo: 5, mauSo: 8, phanTram: 62.5 },
    });
    // Toàn hệ thống lọc B ra cùng số với Quản trị viên B, TRỪ rút tiền: Toàn hệ thống thấy số toàn hệ thống (MH1), Chi nhánh thấy `null` (Q6)
    const b = await service.overview(ALL, {
      ...D0_RANGE,
      chiNhanhId: w.branchB,
    });
    const adminB = await service.overview(branchScope(w.branchB), D0_RANGE);
    expect(b).toStrictEqual({
      ...adminB,
      choDuyet: { ...adminB.choDuyet, rutTien: 2 },
    });
    expect(b).toMatchObject({
      boLoc: { chiNhanhId: w.branchB },
      homNay: { lichKham: 0, hoanThanh: 0 },
      trongKhoang: { lichKham: 2, hoanThanh: 1 },
      vangMat: { tuSo: 1, mauSo: 2, phanTram: 50 },
      khungGio: { tuSo: 2, mauSo: 4, phanTram: 50 },
    });
  });

  it('DVM-02: thêm lịch ở mọi trạng thái CHƯA có kết quả (chờ thanh toán, đã xác nhận, đã huỷ, đã đổi lịch) ⇒ mẫu số vắng mặt không đổi', async () => {
    const w = await dfx.d0();
    await addAppointments(w, {
      doctor: 'd1',
      ngay: '2026-12-05',
      items: [
        ['08:00', 'ChoThanhToan'],
        ['08:30', 'DaXacNhan'],
        ['09:00', 'DaHuy'],
        ['09:30', 'DaDoiLich'],
      ],
    });
    const after = await service.overview(ALL, D0_RANGE);
    expect(after.vangMat).toStrictEqual({ tuSo: 2, mauSo: 6, phanTram: 33.3 });
    // Đối chứng: chỉ `DaXacNhan` vào "lịch khám" (7 + 1)
    expect(after.trongKhoang.lichKham).toBe(8);
    // Đối chứng: thêm một lịch vắng mặt thì cả tử và mẫu đổi
    await addAppointments(w, {
      doctor: 'd1',
      ngay: '2026-12-06',
      items: [['08:00', 'VangMat']],
    });
    expect((await service.overview(ALL, D0_RANGE)).vangMat).toStrictEqual({
      tuSo: 3,
      mauSo: 7,
      phanTram: 42.9,
    });
  });

  it('DVM-03: khoảng không có lịch đã có kết quả ⇒ mẫu số 0, `phanTram` null', async () => {
    await dfx.d0();
    // 08/12 đến 09/12 chỉ có L10, N1 đều `DaXacNhan`
    const upcoming = await service.overview(ALL, {
      tuNgay: '2026-12-08',
      denNgay: '2026-12-09',
    });
    expect(upcoming.trongKhoang).toStrictEqual({ lichKham: 2, hoanThanh: 0 });
    expect(upcoming.vangMat).toStrictEqual({
      tuSo: 0,
      mauSo: 0,
      phanTram: null,
    });
    const empty = await service.overview(ALL, {
      tuNgay: '2027-03-01',
      denNgay: '2027-03-31',
    });
    expect(empty.vangMat).toStrictEqual({ tuSo: 0, mauSo: 0, phanTram: null });
    expect(empty.trongKhoang).toStrictEqual({ lichKham: 0, hoanThanh: 0 });
  });
});

describe('dashboard B1 — tỉ lệ sử dụng khung giờ', () => {
  const UPCOMING = { tuNgay: '2026-12-08', denNgay: '2026-12-09' };

  it('DKG-02: chỉ nghỉ ĐÃ DUYỆT loại đúng ca bị phủ (cả ngày, theo ca, nhiều ngày); chờ duyệt, từ chối, khác ca không loại', async () => {
    const w = await dfx.d0();
    const handled = {
      nguoiXuLyId: w.systemAdmin.account.taiKhoanId,
      thoiDiemXuLy: '2026-11-30 10:00:00',
    };
    const leave = (input: Parameters<typeof dfx.fx.doctor.leaveRequest>[0]) =>
      dfx.fx.doctor.leaveRequest(input);
    const usage = async () => (await service.overview(ALL, UPCOMING)).khungGio;
    // Ca D1 08/12 sáng (s13 đã đặt) và D2 09/12 chiều (u1 đã đặt): 2 trên 8
    expect(await usage()).toStrictEqual({ tuSo: 2, mauSo: 8, phanTram: 25 });
    // Nghỉ ĐÃ DUYỆT nhưng KHÁC ca (chiều 08/12, ca là sáng): không loại
    await leave({
      bacSiId: w.d1.profile.taiKhoanId,
      hinhThuc: 'TheoCa',
      ca: 'CaChieu',
      batDau: '2026-12-08',
      trangThai: 'DaDuyet',
      ...handled,
    });
    // Chờ duyệt và từ chối cả ngày 09/12 của D2: không loại (MH5)
    await leave({ bacSiId: w.d2.profile.taiKhoanId, batDau: '2026-12-09' });
    await leave({
      bacSiId: w.d2.profile.taiKhoanId,
      batDau: '2026-12-09',
      trangThai: 'TuChoi',
      ...handled,
    });
    expect(await usage()).toStrictEqual({ tuSo: 2, mauSo: 8, phanTram: 25 });
    // Nghỉ cả ngày ĐÃ DUYỆT 09/12 của D2: loại u1 đến u4
    await leave({
      bacSiId: w.d2.profile.taiKhoanId,
      batDau: '2026-12-09',
      trangThai: 'DaDuyet',
      ...handled,
    });
    expect(await usage()).toStrictEqual({ tuSo: 1, mauSo: 4, phanTram: 25 });
    // Nghỉ cả ngày NHIỀU NGÀY 07/12 đến 08/12 của D1 đã duyệt: loại s13 đến s16 (ngày 08/12 nằm giữa khoảng nghỉ)
    await leave({
      bacSiId: w.d1.profile.taiKhoanId,
      batDau: '2026-12-07',
      ketThuc: '2026-12-08',
      trangThai: 'DaDuyet',
      ...handled,
    });
    expect(await usage()).toStrictEqual({ tuSo: 0, mauSo: 0, phanTram: null });
  });

  it('DKG-03: khung `DangGiuCho` không tính là đã đặt; khung của lịch vắng mặt có tính; khung trả về sau huỷ, đổi lịch không tính', async () => {
    const w = await dfx.d0();
    // Hôm nay của A: s9, s10, s11 đã đặt, s12 đang giữ chỗ (L9 chờ thanh toán) ⇒ 3 trên 4
    expect(
      (
        await service.overview(branchScope(w.branchA), {
          tuNgay: '2026-12-04',
          denNgay: '2026-12-04',
        })
      ).khungGio,
    ).toStrictEqual({ tuSo: 3, mauSo: 4, phanTram: 75 });
    // 02/12 của A: s1 hoàn thành, s2 VẮNG MẶT (vẫn giữ khung) đã đặt; s3 (huỷ), s4 (đổi lịch) đã trả khung ⇒ 2 trên 4
    expect(
      (
        await service.overview(branchScope(w.branchA), {
          tuNgay: '2026-12-02',
          denNgay: '2026-12-02',
        })
      ).khungGio,
    ).toStrictEqual({ tuSo: 2, mauSo: 4, phanTram: 50 });
  });

  it('DKG-04: khoảng không có ca nào ⇒ 0/0, `phanTram` null', async () => {
    await dfx.d0();
    expect(
      (
        await service.overview(ALL, {
          tuNgay: '2027-03-01',
          denNgay: '2027-03-31',
        })
      ).khungGio,
    ).toStrictEqual({ tuSo: 0, mauSo: 0, phanTram: null });
  });
});

describe('dashboard B1 — hôm nay', () => {
  it.each(['UTC', 'Asia/Ho_Chi_Minh'])(
    'DHN-02 (TZ=%s): lịch lúc 00:00:00 và 23:59:59 hôm nay vào "hôm nay"; 00:00:00 ngày mai không vào',
    async (zone) => {
      const previous = process.env.TZ;
      process.env.TZ = zone;
      try {
        const w = await dfx.d0();
        await addAppointments(w, {
          doctor: 'd2',
          ngay: '2026-12-04',
          items: [
            ['00:00:00', 'DaXacNhan'],
            ['23:59:59', 'HoanThanh'],
          ],
        });
        await addAppointments(w, {
          doctor: 'd2',
          ngay: '2026-12-05',
          items: [['00:00:00', 'DaXacNhan']],
        });
        const b = await service.overview(branchScope(w.branchB), D0_RANGE);
        expect(b.homNay).toStrictEqual({
          ngay: '2026-12-04',
          lichKham: 2,
          hoanThanh: 1,
        });
        // Lịch 05/12 00:00:00 nằm trong bộ lọc 01/12 đến 07/12 (đối chứng: nó có trong dữ liệu)
        expect(b.trongKhoang.lichKham).toBe(5);
      } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
      }
    },
  );

  it('DHN-03: đổi bộ lọc ngày thì thẻ hôm nay KHÔNG đổi; đổi chi nhánh thì đổi', async () => {
    const w = await dfx.d0();
    const inRange = await service.overview(ALL, D0_RANGE);
    const farAway = await service.overview(ALL, {
      tuNgay: '2027-03-01',
      denNgay: '2027-03-31',
    });
    const byDefault = await service.overview(ALL, {});
    expect(farAway.homNay).toStrictEqual(inRange.homNay);
    expect(byDefault.homNay).toStrictEqual(inRange.homNay);
    expect(farAway.trongKhoang).not.toStrictEqual(inRange.trongKhoang);
    // Không gửi ngày: 30 ngày kết thúc ở hôm nay (DBL-01 phần service)
    expect(byDefault.boLoc).toStrictEqual({
      tuNgay: '2026-11-05',
      denNgay: '2026-12-04',
      chiNhanhId: null,
    });
    const b = await service.overview(branchScope(w.branchB), D0_RANGE);
    expect(b.homNay).toStrictEqual({
      ngay: '2026-12-04',
      lichKham: 0,
      hoanThanh: 0,
    });
  });
});

describe('dashboard B1 — phạm vi và chỉ đọc', () => {
  it('DQP-06: phạm vi hỏng (kind lạ, `ChiNhanh` thiếu id hay id không phải chuỗi) ⇒ 403, không bao giờ ra số toàn hệ thống', async () => {
    await dfx.d0();
    const broken = [
      { kind: 'Khac' },
      { kind: 'ChiNhanh' },
      { kind: 'ChiNhanh', chiNhanhId: 5 },
      {},
    ] as unknown as AdminScope[];
    for (const scope of broken) {
      const error = await errorOf(service.overview(scope, D0_RANGE));
      expect(error.getStatus()).toBe(403);
      expect(error.maLoi).toBe('KHONG_DU_QUYEN');
    }
  });

  it('DQP-06: đổi chi nhánh được gán giữa hai request ⇒ request sau theo phạm vi MỚI (phạm vi đọc DB mỗi lần)', async () => {
    const w = await dfx.d0();
    const scopes = new AdminScopeService(new AdminScopeRepository(db));
    const adminId = w.adminA.account.taiKhoanId;
    const before = await service.overview(
      await scopes.resolve(adminId),
      D0_RANGE,
    );
    expect(before.boLoc.chiNhanhId).toBe(w.branchA);
    expect(before.homNay.lichKham).toBe(3);
    await db.query(
      'UPDATE quan_tri_vien SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [w.branchB, adminId],
    );
    const after = await service.overview(
      await scopes.resolve(adminId),
      D0_RANGE,
    );
    expect(after.boLoc.chiNhanhId).toBe(w.branchB);
    expect(after.homNay.lichKham).toBe(0);
  });

  it('DQP-03, DQP-04 (phần service): chi nhánh khác của Quản trị viên Chi nhánh và chi nhánh không tồn tại ra cùng một 404', async () => {
    const w = await dfx.d0();
    const other = await errorOf(
      service.overview(branchScope(w.branchA), { chiNhanhId: w.branchB }),
    );
    const missing = await errorOf(
      service.overview(branchScope(w.branchA), { chiNhanhId: '999999999' }),
    );
    const missingForAll = await errorOf(
      service.overview(ALL, { chiNhanhId: '999999999' }),
    );
    for (const error of [other, missing, missingForAll]) {
      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toStrictEqual(other.getResponse());
    }
  });

  it('DRG-02: MỘT giao dịch READ ONLY cho mọi câu; chỉ SELECT, không câu ghi hay mệnh đề khoá', async () => {
    const w = await dfx.d0();
    const seen = recordStatements(db);
    await service.overview(ALL, { ...D0_RANGE, chiNhanhId: w.branchA });
    const control = /^\s*(SET TRANSACTION|START TRANSACTION|COMMIT)\b/i;
    expect(seen.filter((sql) => /READ ONLY/i.test(sql))).toHaveLength(1);
    expect(
      seen.filter((sql) => /^\s*START TRANSACTION/i.test(sql)),
    ).toHaveLength(1);
    expect(seen.filter((sql) => /^\s*COMMIT/i.test(sql))).toHaveLength(1);
    const statements = seen.filter((sql) => !control.test(sql));
    // Kiểm chi nhánh tồn tại, hôm nay, trong khoảng, khung giờ (B1); cọc, đã hoàn, khoản đang lỗi, xu hướng, chờ duyệt (B2)
    expect(statements).toHaveLength(9);
    for (const sql of statements) {
      expect(sql.trim()).toMatch(/^SELECT\b/i);
      expect(sql).not.toMatch(WRITE_OR_LOCK_SQL);
    }
  });
});

/** Thêm một khoản cọc qua ví (mặc định thành công) cho lịch `appointment` của bộ D0. */
const addDeposit = (
  w: D0World,
  input: {
    appointment: string;
    soTien: string;
    thoiDiemTao: string;
    trangThai?: 'KhoiTao' | 'DangXuLy' | 'ThanhCong' | 'ThatBai' | 'HetHan';
  },
) =>
  dfx.wallet.insertPayment({
    viNoiBoId: w.walletId,
    lichHenId: w.appointments[input.appointment] ?? '',
    loai: 'ThanhToanLichHen',
    phuongThuc: 'Vi',
    soTien: input.soTien,
    thoiDiemTao: input.thoiDiemTao,
    ...(input.trangThai ? { trangThai: input.trangThai } : {}),
  });

/** Thêm một dòng hoàn cho khoản `payment` (tên P1…P13 hoặc id) của bộ D0. */
const addRefund = (
  w: D0World,
  payment: string,
  input: {
    loai: 'TuDong' | 'DacBiet';
    trangThai: 'ThanhCong' | 'ThatBai';
    soTien: string;
    soLanThu: number;
    thoiDiem: string;
  },
) =>
  dfx.refund({
    giaoDichThanhToanId: w.payments[payment] ?? payment,
    viNoiBoId: w.walletId,
    ...input,
  });

describe('dashboard B2 — cọc và hoàn tiền', () => {
  it('DCH-02: loại dòng 0đ, tiền mặt, nạp ví, giao dịch chưa thành công; biên 00:00:00 đầu khoảng vào, 00:00:00 sau ngày cuối không vào', async () => {
    const w = await dfx.d0();
    // Bộ D0 đã có: 0đ (P6), tiền mặt (P7), nạp ví (P8) trong khoảng và bị loại; P11 lúc 07/12 23:59:59 vào, P12 lúc 08/12 00:00:00 không vào
    for (const trangThai of [
      'KhoiTao',
      'DangXuLy',
      'ThatBai',
      'HetHan',
    ] as const)
      await addDeposit(w, {
        appointment: 'L2',
        soTien: '1000.00',
        thoiDiemTao: '2026-12-03 10:00:00',
        trangThai,
      });
    await addDeposit(w, {
      appointment: 'L2',
      soTien: '7000.00',
      thoiDiemTao: '2026-12-01 00:00:00',
    });
    await addDeposit(w, {
      appointment: 'L2',
      soTien: '9000.00',
      thoiDiemTao: '2026-11-30 23:59:59',
    });
    expect((await service.overview(ALL, D0_RANGE)).tienCoc).toStrictEqual({
      soKhoan: 7,
      tongTien: '717000.00',
    });
    // Khoảng đúng một ngày 08/12: chỉ P12 (đối chứng biên phía sau)
    const day8 = { tuNgay: '2026-12-08', denNgay: '2026-12-08' };
    expect((await service.overview(ALL, day8)).tienCoc).toStrictEqual({
      soKhoan: 1,
      tongTien: '70000.00',
    });
  });

  it('DCH-03: dòng hoàn thất bại không cộng; hoàn đặc biệt cộng; biên ngày đúng', async () => {
    const w = await dfx.d0();
    // P10 của chi nhánh B chưa có dòng hoàn nào; dòng mới nhất (lần 4) thành công nên khoản không "đang lỗi"
    const rows = [
      ['DacBiet', 'ThatBai', '1000.00', '2026-12-03 10:00:00'],
      ['DacBiet', 'ThanhCong', '2000.00', '2026-12-07 23:59:59'],
      ['TuDong', 'ThanhCong', '4000.00', '2026-12-01 00:00:00'],
      ['TuDong', 'ThanhCong', '8000.00', '2026-11-30 23:59:59'],
    ] as const;
    for (const [index, [loai, trangThai, soTien, thoiDiem]] of rows.entries())
      await addRefund(w, 'P10', {
        loai,
        trangThai,
        soTien,
        soLanThu: index + 1,
        thoiDiem,
      });
    expect(
      (await service.overview(branchScope(w.branchB), D0_RANGE)).hoanTien,
    ).toStrictEqual({ soKhoan: 2, tongTien: '6000.00', soKhoanDangLoi: 1 });
    // Toàn bộ: 3 dòng của D0 cộng 2 dòng trên; R6 (08/12 00:00:00) vẫn ngoài khoảng
    expect((await service.overview(ALL, D0_RANGE)).hoanTien).toStrictEqual({
      soKhoan: 5,
      tongTien: '236000.00',
      soKhoanDangLoi: 1,
    });
  });

  it('DCH-04: khoản đang lỗi xét dòng hoàn MỚI NHẤT mọi loại: tự động thất bại rồi đặc biệt thành công thì hết lỗi; không theo bộ lọc ngày', async () => {
    const w = await dfx.d0();
    const refundsOfB = async (range = D0_RANGE) =>
      (await service.overview(branchScope(w.branchB), range)).hoanTien;
    // (a) P13 chỉ có dòng tự động thất bại
    expect((await refundsOfB()).soKhoanDangLoi).toBe(1);
    // (d) đổi bộ lọc ngày trên (a): vẫn 1 (không theo ngày)
    const farAway = { tuNgay: '2027-03-01', denNgay: '2027-03-31' };
    expect((await refundsOfB(farAway)).soKhoanDangLoi).toBe(1);
    // (b) thêm dòng ĐẶC BIỆT thành công lần 2: hết lỗi (câu lấy MAX riêng `TuDong` sẽ ra 1: ca này bắt lỗi đó)
    const second = {
      trangThai: 'ThanhCong',
      soTien: '40000.00',
      soLanThu: 2,
      thoiDiem: '2026-12-04 09:00:00',
    } as const;
    const special = await addRefund(w, 'P13', { loai: 'DacBiet', ...second });
    expect(await refundsOfB()).toStrictEqual({
      soKhoan: 1,
      tongTien: '40000.00',
      soKhoanDangLoi: 0,
    });
    // (c) như (b) nhưng dòng thêm là TỰ ĐỘNG thành công
    await db.query(
      'DELETE FROM lich_su_hoan_tien WHERE lich_su_hoan_tien_id = ?',
      [special],
    );
    await addRefund(w, 'P13', { loai: 'TuDong', ...second });
    expect(await refundsOfB()).toStrictEqual({
      soKhoan: 1,
      tongTien: '40000.00',
      soKhoanDangLoi: 0,
    });
  });

  it('DCH-05: tổng rất lớn đúng từng chữ số (chuỗi, không qua number); không dòng nào ⇒ "0.00"', async () => {
    const w = await dfx.d0();
    const big = '9999999999.99';
    const payments: string[] = [];
    for (let i = 0; i < 3; i += 1)
      payments.push(
        await addDeposit(w, {
          appointment: 'L2',
          soTien: big,
          thoiDiemTao: '2026-12-05 10:00:00',
        }),
      );
    for (const payment of payments.slice(0, 2))
      await addRefund(w, payment, {
        loai: 'DacBiet',
        trangThai: 'ThanhCong',
        soTien: big,
        soLanThu: 1,
        thoiDiem: '2026-12-05 11:00:00',
      });
    const all = await service.overview(ALL, D0_RANGE);
    // 710.000,00 + 3 × 9.999.999.999,99 và 230.000,00 + 2 × 9.999.999.999,99 (số xu vượt 2^53 nếu cộng bằng number)
    expect(all.tienCoc).toStrictEqual({
      soKhoan: 9,
      tongTien: '30000709999.97',
    });
    expect(all.hoanTien).toMatchObject({
      soKhoan: 5,
      tongTien: '20000229999.98',
    });
    const empty = await service.overview(ALL, {
      tuNgay: '2027-03-01',
      denNgay: '2027-03-31',
    });
    expect(empty.tienCoc).toStrictEqual({ soKhoan: 0, tongTien: '0.00' });
    expect(empty.hoanTien).toMatchObject({ soKhoan: 0, tongTien: '0.00' });
  });
});

describe('dashboard B2 — xu hướng đăng ký và yêu cầu chờ duyệt', () => {
  /** Đặt `thoi_diem_tao` (và nếu có, `lich_hen_truoc_id`) cho một lịch vừa thêm. */
  const setCreated = (id: string, thoiDiemTao: string, truocId?: string) =>
    db.query(
      'UPDATE lich_hen SET thoi_diem_tao = ?, lich_hen_truoc_id = ? WHERE lich_hen_id = ?',
      [thoiDiemTao, truocId ?? null, id],
    );
  const counts = (trend: { diem: { soLuong: number }[] }) =>
    trend.diem.map((point) => point.soLuong);

  it('DXH-02: không đếm dòng sinh do đổi lịch; đếm lịch đã huỷ (gồm lịch huỷ do quá hạn thanh toán)', async () => {
    const w = await dfx.d0();
    const [moved, rebooked, cancelled] = await addAppointments(w, {
      doctor: 'd1',
      ngay: '2026-12-06',
      items: [
        ['08:00', 'DaDoiLich'],
        ['08:30', 'DaXacNhan'],
        ['09:00', 'DaHuy'],
      ],
    });
    await setCreated(moved ?? '', '2026-12-05 08:00:00');
    // Lịch mới do đổi lịch, tạo cùng ngày: KHÔNG đếm
    await setCreated(rebooked ?? '', '2026-12-05 09:00:00', moved);
    await setCreated(cancelled ?? '', '2026-12-05 10:00:00');
    // 05/12: lịch gốc (đã đổi) và lịch huỷ được đếm, lịch mới thì không ⇒ 2
    expect(
      counts((await service.overview(ALL, D0_RANGE)).xuHuong),
    ).toStrictEqual([3, 2, 1, 2, 2, 0, 1]);
  });

  it.each(['UTC', 'Asia/Ho_Chi_Minh'])(
    'DXH-04 (TZ=%s): gom theo ngày Việt Nam; 00:00:00 và 23:59:59 vào cùng ngày; 00:00:00 ngày sau ngày cuối không vào',
    async (zone) => {
      const previous = process.env.TZ;
      process.env.TZ = zone;
      try {
        const w = await dfx.d0();
        const [first, last] = await addAppointments(w, {
          doctor: 'd2',
          ngay: '2026-12-10',
          ca: 'CaChieu',
          items: [
            ['13:30', 'DaXacNhan'],
            ['14:00', 'DaXacNhan'],
          ],
        });
        await setCreated(first ?? '', '2026-12-03 00:00:00');
        await setCreated(last ?? '', '2026-12-03 23:59:59');
        // 03/12: L7 cộng hai lịch trên; N1 tạo lúc 08/12 00:00:00 không vào điểm 07/12
        expect(
          counts((await service.overview(ALL, D0_RANGE)).xuHuong),
        ).toStrictEqual([3, 2, 3, 2, 0, 0, 1]);
      } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
      }
    },
  );

  it('DCD-04: đổi bộ lọc ngày thì số chờ duyệt KHÔNG đổi', async () => {
    await dfx.d0();
    const inRange = await service.overview(ALL, D0_RANGE);
    const farAway = await service.overview(ALL, {
      tuNgay: '2027-03-01',
      denNgay: '2027-03-31',
    });
    expect(farAway.choDuyet).toStrictEqual(inRange.choDuyet);
    expect(inRange.choDuyet).toStrictEqual({
      nghiPhep: 2,
      doiLich: 3,
      thayDoiChiNhanh: 1,
      rutTien: 2,
    });
  });

  it('DRG-03: kết nối khác thêm và commit cọc, hoàn, rút tiền GIỮA hai câu của cùng lần gọi ⇒ kết quả vẫn theo MỘT ảnh chụp', async () => {
    const w = await dfx.d0();
    let injected = false;
    interceptStatements(db, async (call, run) => {
      const result = await run();
      // Ngay sau câu SELECT ĐẦU TIÊN (ảnh chụp REPEATABLE READ đã chốt), kết nối khác của pool chèn và tự commit
      if (!injected && /^\s*SELECT\b/i.test(call.sql)) {
        injected = true;
        const payment = await addDeposit(w, {
          appointment: 'L2',
          soTien: '5000.00',
          thoiDiemTao: '2026-12-02 10:00:00',
        });
        await addRefund(w, payment, {
          loai: 'DacBiet',
          trangThai: 'ThanhCong',
          soTien: '5000.00',
          soLanThu: 1,
          thoiDiem: '2026-12-02 11:00:00',
        });
        await dfx.wallet.insertWithdrawal({
          viNoiBoId: w.walletId,
          soTien: '1000.00',
        });
      }
      return result;
    });
    const during = await service.overview(ALL, D0_RANGE);
    expect(injected).toBe(true);
    expect(during.tienCoc).toStrictEqual({ soKhoan: 6, tongTien: '710000.00' });
    expect(during.hoanTien).toMatchObject({
      soKhoan: 3,
      tongTien: '230000.00',
    });
    expect(during.choDuyet.rutTien).toBe(2);
    // Đối chứng: lần gọi sau thấy dữ liệu đã commit
    const after = await service.overview(ALL, D0_RANGE);
    expect(after.tienCoc).toStrictEqual({ soKhoan: 7, tongTien: '715000.00' });
    expect(after.hoanTien).toMatchObject({ soKhoan: 4, tongTien: '235000.00' });
    expect(after.choDuyet.rutTien).toBe(3);
  });
});
