import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import {
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

// dashboard B1 — tầng service và SQL trên MySQL THẬT với bộ D0 (PLAN dashboard 7.0, 7.1, 7.3, 7.5): DVM-01…DVM-03, DKG-01…DKG-04, DHN-01…DHN-03, DQP-06, DRG-02.
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
  it('DVM-01, DKG-01, DHN-01: tất cả, chi nhánh A, chi nhánh B đúng bảng 7.0', async () => {
    const w = await dfx.d0();
    const all = await service.overview(ALL, D0_RANGE);
    expect(all).toStrictEqual({
      boLoc: { ...D0_RANGE, chiNhanhId: null },
      capNhatLuc: D0_NOW.toISOString(),
      homNay: { ngay: '2026-12-04', lichKham: 3, hoanThanh: 1 },
      trongKhoang: { lichKham: 7, hoanThanh: 3 },
      vangMat: { tuSo: 2, mauSo: 6, phanTram: 33.3 },
      khungGio: { tuSo: 7, mauSo: 12, phanTram: 58.3 },
    });
    const a = await service.overview(branchScope(w.branchA), D0_RANGE);
    expect(a).toMatchObject({
      boLoc: { chiNhanhId: w.branchA },
      homNay: { lichKham: 3, hoanThanh: 1 },
      trongKhoang: { lichKham: 5, hoanThanh: 2 },
      vangMat: { tuSo: 1, mauSo: 4, phanTram: 25 },
      khungGio: { tuSo: 5, mauSo: 8, phanTram: 62.5 },
    });
    // Toàn hệ thống lọc B ra cùng số với Quản trị viên B
    const b = await service.overview(ALL, {
      ...D0_RANGE,
      chiNhanhId: w.branchB,
    });
    expect(b).toStrictEqual(
      await service.overview(branchScope(w.branchB), D0_RANGE),
    );
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
    // Kiểm chi nhánh tồn tại, hôm nay, trong khoảng, khung giờ
    expect(statements).toHaveLength(4);
    for (const sql of statements) {
      expect(sql.trim()).toMatch(/^SELECT\b/i);
      expect(sql).not.toMatch(WRITE_OR_LOCK_SQL);
    }
  });
});
