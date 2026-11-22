import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { BookingFixtures } from '../../../appointments/testing/booking-fixtures.js';
import { AuditRepository } from '../../../audit/audit.repository.js';
import { AuditService } from '../../../audit/audit.service.js';
import type { AppException } from '../../../common/errors/app.exception.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import { BranchChangeNotifier } from '../../../notification/branch-change-notifier.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { UpdateBranchDto } from '../../branches/branch.dto.js';
import { BranchRepository } from '../../branches/branch.repository.js';
import { BranchService } from '../../branches/branch.service.js';
import { BranchImpactService } from '../../branches/impact/branch-impact.service.js';
import type { ChiNhanh } from '../../entities/chi-nhanh.entity.js';
import { SystemConfigRepository } from '../../system-config/system-config.repository.js';
import { SystemConfigService } from '../../system-config/system-config.service.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { BranchChangeApplyRepository } from '../apply/branch-change-apply.repository.js';
import { BranchChangeApplyService } from '../apply/branch-change-apply.service.js';
import { BranchChangeRequestRepository } from '../branch-change-request.repository.js';
import { BranchChangeRequestService } from '../branch-change-request.service.js';
import { BranchChangeRescheduleService } from '../branch-change-reschedule.service.js';
import { BranchChangeStopService } from '../branch-change-stop.service.js';

// Admin B22 — dời hiệu lực yêu cầu quá hạn trên MySQL 8.4 THẬT (PLAN admin 5.4; Q48, H11, H21). Không gửi thư thật (chỉ xếp dòng email_thong_bao).
// Kịch bản: Thứ Hai 02/11/2026 07:00 B8 gửi (Thứ Hai nghỉ), B10 duyệt hiệu lực 05/11 07:00 (báo trước 3 ngày); bệnh nhân A có lịch Thứ Hai 09/11,
// B có lịch Thứ Hai 16/11 ⇒ job B11 chạy lúc 05/11 07:00 đánh dấu quá hạn. Đồng hồ ứng dụng sau đó: 06/11/2026 08:00 (mốc sớm nhất = 09/11 08:00).
const PROPOSED_AT = new Date('2026-11-02T07:00:00+07:00');
const EFFECTIVE = '2026-11-05 07:00:00';
const AT_EFFECTIVE = new Date('2026-11-05T07:00:00+07:00');
const NOW = new Date('2026-11-06T08:00:00+07:00');
/** Sau lịch của A (09/11) và trước lịch của B (16/11): A hết bị ảnh hưởng, B vẫn còn */
const NEW_EFFECTIVE = '2026-11-10 08:00:00';
const AT_NEW_EFFECTIVE = new Date('2026-11-10T08:00:00+07:00');
const system: AdminScope = { kind: 'ToanHeThong' };
const scopeOf = (branch: ChiNhanh): AdminScope => ({
  kind: 'ChiNhanh',
  chiNhanhId: branch.chiNhanhId,
});
const schedule = () =>
  Array.from({ length: 7 }, (_, i) =>
    i === 0
      ? { thuTrongTuan: 1, hoatDong: false }
      : {
          thuTrongTuan: i + 1,
          hoatDong: true,
          sang: { batDau: '08:00', ketThuc: '12:00' },
          chieu: { batDau: '13:00', ketThuc: '17:00' },
        },
  );
const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    const e = error as AppException;
    const body = e.getResponse() as { chiTiet?: unknown };
    return { status: e.getStatus(), maLoi: e.maLoi, chiTiet: body.chiTiet };
  }
  throw new Error('mong đợi lỗi');
};

describe('B22 dời hiệu lực yêu cầu thay đổi chi nhánh quá hạn — MySQL thật', () => {
  let db: DataSource;
  let audit: AuditService;
  let requests: BranchChangeRequestService;
  let stops: BranchChangeStopService;
  let reschedules: BranchChangeRescheduleService;
  let applier: BranchChangeApplyService;
  let branches: BranchService;
  let fx: AdminFixtures;
  let booking: BookingFixtures;

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    const impact = new BranchImpactService();
    const notifier = new BranchChangeNotifier();
    const repo = new BranchChangeRequestRepository(db);
    const branchRepo = new BranchRepository(db);
    const config = new SystemConfigService(new SystemConfigRepository(db));
    audit = new AuditService(new AuditRepository());
    requests = new BranchChangeRequestService(
      repo,
      new BranchAccessPolicy(),
      impact,
      notifier,
      audit,
      config,
    );
    stops = new BranchChangeStopService(
      repo,
      requests,
      new BranchAccessPolicy(),
      notifier,
      audit,
    );
    reschedules = new BranchChangeRescheduleService(
      repo,
      requests,
      new BranchAccessPolicy(),
      impact,
      notifier,
      audit,
      config,
    );
    applier = new BranchChangeApplyService(
      new BranchChangeApplyRepository(db),
      branchRepo,
      impact,
      notifier,
    );
    branches = new BranchService(branchRepo, new BranchAccessPolicy(), impact);
  });
  beforeEach(async () => {
    await resetTables(db);
    fx = new AdminFixtures(db);
    booking = new BookingFixtures(db);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(PROPOSED_AT);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  afterAll(async () => db?.destroy());

  async function world() {
    await booking.systemConfig({ soNgayBaoTruocDoiGioLam: 3 });
    const branch = await fx.branch({ ten: 'Chi nhánh A' });
    await fx.weeklySchedule(branch.chiNhanhId);
    const doctor = await fx.doctor(branch);
    const patientA = await fx.patient();
    const patientB = await fx.patient();
    const proposer = await fx.admin(branch);
    const sysAdmin = await fx.admin();
    const appointments: Record<'A' | 'B', string> = { A: '', B: '' };
    for (const [key, ngay, patientId] of [
      ['A', '2026-11-09', patientA.account.taiKhoanId],
      ['B', '2026-11-16', patientB.account.taiKhoanId],
    ] as const) {
      const shift = await fx.shift(doctor.profile, { ngay, ca: 'CaSang' });
      const slot = await fx.slot(shift, {
        ngayGio: new Date(`${ngay}T09:00:00+07:00`),
        trangThai: 'DaDat',
      });
      const appointment = await fx.appointment(doctor.profile, slot, patientId);
      appointments[key] = String(appointment.lichHenId);
    }
    const sysId = sysAdmin.account.taiKhoanId;
    const propose = async () => {
      const result = await branches.update(
        scopeOf(branch),
        proposer.account.taiKhoanId,
        branch.chiNhanhId,
        Object.assign(new UpdateBranchDto(), {
          ten: 'Chi nhánh A',
          diaChi: branch.diaChi,
          lichHoatDong: schedule(),
          dichVuKhamIds: [doctor.profile.dichVuKhamId],
        }),
      );
      if (!result.yeuCau) throw new Error('B8 phải tạo yêu cầu');
      return result.yeuCau.yeuCauThayDoiChiNhanhId;
    };
    const approved = async () => {
      const id = await propose();
      await requests.approve(system, sysId, id, EFFECTIVE);
      return id;
    };
    /** Duyệt rồi để job B11 đánh dấu quá hạn; đồng hồ chuyển sang NOW. */
    const overdue = async () => {
      const id = await approved();
      expect((await applier.applyOne(id, AT_EFFECTIVE)).kind).toBe('QuaHan');
      vi.setSystemTime(NOW);
      return id;
    };
    return {
      branch,
      patientA,
      patientB,
      proposer,
      sysId,
      appointments,
      propose,
      approved,
      overdue,
    };
  }

  const requestRow = async (id: string) =>
    (
      (await db.query(
        `SELECT trang_thai AS trangThai, DATE_FORMAT(hieu_luc_tu, '%Y-%m-%d %H:%i:%s') AS hieuLucTu,
                qua_han_luc AS quaHanLuc, so_lan_doi_hieu_luc AS soLan, so_ngay_bao_truoc AS soNgay, ap_dung_luc AS apDungLuc
           FROM yeu_cau_thay_doi_chi_nhanh WHERE yeu_cau_thay_doi_chi_nhanh_id = ?`,
        [id],
      )) as Record<string, unknown>[]
    )[0];
  const snapshotIds = async (id: string) =>
    (
      (await db.query(
        'SELECT CAST(lich_hen_id AS CHAR) AS id FROM yeu_cau_thay_doi_chi_nhanh_lich_hen WHERE yeu_cau_thay_doi_chi_nhanh_id = ? ORDER BY lich_hen_id',
        [id],
      )) as { id: string }[]
    ).map((row) => row.id);
  const notifications = (): Promise<
    {
      taiKhoanId: string;
      loai: string;
      noiDung: string;
      email: string | null;
    }[]
  > =>
    db.query(
      `SELECT CAST(t.tai_khoan_id AS CHAR) AS taiKhoanId, t.loai_su_kien AS loai, t.noi_dung AS noiDung, e.trang_thai AS email
         FROM thong_bao t LEFT JOIN email_thong_bao e ON e.thong_bao_id = t.thong_bao_id ORDER BY t.thong_bao_id`,
    );
  const of = async (taiKhoanId: string, loai: string) =>
    (await notifications()).filter(
      (n) => n.taiKhoanId === taiKhoanId && n.loai === loai,
    );
  const auditRows = async (action: string) =>
    (
      (await db.query(
        `SELECT CAST(tai_khoan_id AS CHAR) AS actor, CAST(chi_nhanh_id AS CHAR) AS branch, CAST(ma_doi_tuong AS CHAR) AS target,
                chi_tiet_thay_doi AS changes
           FROM nhat_ky_hanh_dong WHERE hanh_dong = ? ORDER BY nhat_ky_hanh_dong_id`,
        [action],
      )) as Record<string, unknown>[]
    ).map((row) => ({
      ...row,
      changes:
        typeof row.changes === 'string'
          ? (JSON.parse(row.changes) as unknown)
          : row.changes,
    }));
  it('CN-100, CN-105, CN-106 dời yêu cầu quá hạn: hiệu lực mới, hết quá hạn, đếm lần dời; bản chụp tính lại; thư cũ còn chờ ⇒ BoQua; bệnh nhân còn bị ảnh hưởng và người đã được báo đều nhận "dời"; người đề xuất được báo trong ứng dụng; audit', async () => {
    const w = await world();
    const id = await w.overdue();
    const A = w.patientA.account.taiKhoanId;
    const B = w.patientB.account.taiKhoanId;
    const proposerId = w.proposer.account.taiKhoanId;

    const detail = await reschedules.reschedule(
      system,
      w.sysId,
      id,
      NEW_EFFECTIVE,
    );
    expect(detail).toMatchObject({
      trangThai: 'DaDuyet',
      hieuLucTu: NEW_EFFECTIVE,
      apDungLuc: null,
      quaHanLuc: null,
      soLanDoiHieuLuc: 1,
      soNgayBaoTruoc: 3,
      anhHuong: { nguon: 'TinhLai', moc: NEW_EFFECTIVE, lichHen: { tong: 1 } },
    });
    expect(await requestRow(id)).toMatchObject({
      hieuLucTu: NEW_EFFECTIVE,
      quaHanLuc: null,
      soLan: 1,
      soNgay: 3, // giữ giá trị chụp lúc duyệt (Trung chốt 22/11/2026)
    });
    // Bản chụp thay bằng danh sách ở mốc mới: chỉ còn lịch của B
    expect(await snapshotIds(id)).toEqual([w.appointments.B]);

    // CN-105: thư báo thay đổi lúc duyệt còn ChoGui ⇒ BoQua; thư kết quả duyệt của người đề xuất giữ ChoGui
    for (const patient of [A, B])
      expect(
        (await of(patient, 'ThayDoiChiNhanhAnhHuongLichHen:v1'))[0]?.email,
      ).toBe('BoQua');
    expect(
      (await of(proposerId, 'KetQuaYeuCauThayDoiChiNhanh'))[0]?.email,
    ).toBe('ChoGui');
    // CN-106: B (còn bị ảnh hưởng) nhận mã lịch hẹn; A (đã được báo, nay hết bị ảnh hưởng) nhận câu "không còn bị ảnh hưởng"
    const [toB] = await of(B, 'DoiHieuLucThayDoiChiNhanh:v1');
    expect(toB?.email).toBe('ChoGui');
    expect(toB?.noiDung).toContain(
      'dời thời điểm dự kiến thay đổi lịch hoạt động sang 08:00 10/11/2026. Lịch hẹn bị ảnh hưởng:',
    );
    const [toA] = await of(A, 'DoiHieuLucThayDoiChiNhanh:v1');
    expect(toA?.email).toBe('ChoGui');
    expect(toA?.noiDung).toContain('Lịch hẹn của bạn không còn bị ảnh hưởng.');
    // Người đề xuất: sự kiện riêng, chỉ trong ứng dụng (không có thư)
    const [toProposer] = await of(
      proposerId,
      'KetQuaDoiHieuLucThayDoiChiNhanh:v1',
    );
    expect(toProposer?.email).toBeNull();
    expect(toProposer?.noiDung).toContain(
      'đã được dời, dự kiến có hiệu lực từ 08:00 10/11/2026.',
    );
    expect(await of(proposerId, 'DoiHieuLucThayDoiChiNhanh:v1')).toEqual([]);

    expect(await auditRows('DoiHieuLucThayDoiChiNhanh')).toEqual([
      {
        actor: w.sysId,
        branch: w.branch.chiNhanhId,
        target: id,
        changes: {
          truoc: { hieu_luc_tu: '2026-11-05T07:00:00+07:00' },
          sau: { hieu_luc_tu: '2026-11-10T08:00:00+07:00' },
          so_lan_doi_hieu_luc: 1,
          so_benh_nhan_thong_bao_lai: 2,
        },
      },
    ]);
  });

  it('CN-101 biên mốc mới: bằng bây giờ + N ⇒ được, sớm hơn 1 giây ⇒ HIEU_LUC_QUA_SOM kèm mốc sớm nhất', async () => {
    const w = await world();
    const id = await w.overdue();
    expect(
      await codeOf(
        reschedules.reschedule(system, w.sysId, id, '2026-11-09 07:59:59'),
      ),
    ).toMatchObject({
      status: 400,
      maLoi: 'HIEU_LUC_QUA_SOM',
      chiTiet: { mocSomNhat: '2026-11-09 08:00:00' },
    });
    expect((await requestRow(id))?.soLan).toBe(0);
    await reschedules.reschedule(system, w.sysId, id, '2026-11-09 08:00:00');
    expect((await requestRow(id))?.hieuLucTu).toBe('2026-11-09 08:00:00');
  });

  it('CN-101 N = lớn hơn giữa giá trị đã chụp và cấu hình hiện hành; thiếu cấu hình ⇒ HE_THONG_CHUA_CAU_HINH', async () => {
    const w = await world();
    const id = await w.overdue();
    // Cấu hình giảm còn 1 ngày: vẫn phải báo trước 3 ngày như đã chụp
    await db.query(
      'UPDATE cau_hinh_he_thong SET so_ngay_bao_truoc_doi_gio_lam = 1',
    );
    expect(
      await codeOf(
        reschedules.reschedule(system, w.sysId, id, '2026-11-08 08:00:00'),
      ),
    ).toMatchObject({ maLoi: 'HIEU_LUC_QUA_SOM' });
    // Cấu hình tăng lên 5 ngày: mốc sớm nhất 11/11 08:00
    await db.query(
      'UPDATE cau_hinh_he_thong SET so_ngay_bao_truoc_doi_gio_lam = 5',
    );
    expect(
      await codeOf(reschedules.reschedule(system, w.sysId, id, NEW_EFFECTIVE)),
    ).toMatchObject({
      maLoi: 'HIEU_LUC_QUA_SOM',
      chiTiet: { mocSomNhat: '2026-11-11 08:00:00' },
    });
    await db.query('DELETE FROM cau_hinh_he_thong');
    expect(
      await codeOf(
        reschedules.reschedule(system, w.sysId, id, '2026-12-01 08:00:00'),
      ),
    ).toMatchObject({ maLoi: 'HE_THONG_CHUA_CAU_HINH' });
    expect((await requestRow(id))?.soLan).toBe(0);
  });

  it('CN-102 dời yêu cầu chưa quá hạn, ChoDuyet, DaRut, DaHuy, đã áp dụng ⇒ 409 YEU_CAU_KHONG_QUA_HAN; không tồn tại ⇒ 404', async () => {
    const w = await world();
    const later = '2026-12-01 08:00:00';
    const expectNotOverdue = async (id: string) =>
      expect(
        await codeOf(reschedules.reschedule(system, w.sysId, id, later)),
      ).toMatchObject({ status: 409, maLoi: 'YEU_CAU_KHONG_QUA_HAN' });

    const notYet = await w.approved(); // DaDuyet, chưa quá hạn
    await expectNotOverdue(notYet);
    await stops.cancel(system, w.sysId, notYet, 'Hủy');
    await expectNotOverdue(notYet); // DaHuy
    const pending = await w.propose();
    await expectNotOverdue(pending); // ChoDuyet
    await stops.withdraw(
      scopeOf(w.branch),
      w.proposer.account.taiKhoanId,
      pending,
    );
    await expectNotOverdue(pending); // DaRut
    const applied = await w.approved();
    await db.query(
      "UPDATE yeu_cau_thay_doi_chi_nhanh SET ap_dung_luc = '2026-11-05 07:00:00' WHERE yeu_cau_thay_doi_chi_nhanh_id = ?",
      [applied],
    );
    await expectNotOverdue(applied);
    expect(
      await codeOf(reschedules.reschedule(system, w.sysId, '999999', later)),
    ).toMatchObject({ status: 404, maLoi: 'KHONG_TIM_THAY' });
    expect(await auditRows('DoiHieuLucThayDoiChiNhanh')).toEqual([]);
  });

  it('CN-103 Admin Chi nhánh gọi reschedule ⇒ 403; hai Toàn hệ thống dời đồng thời ⇒ một thành công, một 409; audit và thông báo một lần', async () => {
    const w = await world();
    const id = await w.overdue();
    expect(
      await codeOf(
        reschedules.reschedule(
          scopeOf(w.branch),
          w.proposer.account.taiKhoanId,
          id,
          NEW_EFFECTIVE,
        ),
      ),
    ).toMatchObject({ status: 403, maLoi: 'KHONG_DU_QUYEN' });

    const otherSys = (await fx.admin()).account.taiKhoanId;
    const results = await Promise.allSettled([
      reschedules.reschedule(system, w.sysId, id, NEW_EFFECTIVE),
      reschedules.reschedule(system, otherSys, id, '2026-11-11 08:00:00'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    if (!failed) throw new Error('mong đợi một lần dời thất bại');
    expect((failed.reason as AppException).maLoi).toBe('YEU_CAU_KHONG_QUA_HAN');
    expect((await requestRow(id))?.soLan).toBe(1);
    expect(await auditRows('DoiHieuLucThayDoiChiNhanh')).toHaveLength(1);
    expect(
      (await notifications()).filter((n) =>
        n.loai.startsWith('KetQuaDoiHieuLucThayDoiChiNhanh'),
      ),
    ).toHaveLength(1);
  });

  it('CN-107 sau khi dời, job tính lại ở mốc mới: chưa đến ⇒ không làm gì; lịch còn lại đã xử lý ⇒ áp dụng', async () => {
    const w = await world();
    const id = await w.overdue();
    await reschedules.reschedule(system, w.sysId, id, NEW_EFFECTIVE);
    expect(
      (await applier.applyOne(id, new Date(AT_NEW_EFFECTIVE.getTime() - 1000)))
        .kind,
    ).toBe('KhongDenHan');
    // Xử lý hết ở mốc mới: gỡ lịch của B (như B11, xoá thẳng), khung giờ và ca Thứ Hai 16/11 (ca tương lai cũng là ảnh hưởng, Q7)
    await db.query(
      'DELETE FROM yeu_cau_thay_doi_chi_nhanh_lich_hen WHERE lich_hen_id = ?',
      [w.appointments.B],
    );
    await db.query('DELETE FROM lich_hen WHERE lich_hen_id = ?', [
      w.appointments.B,
    ]);
    await db.query(
      "DELETE k FROM khung_gio k JOIN lich_lam_viec l ON l.lich_lam_viec_id = k.lich_lam_viec_id WHERE l.ngay = '2026-11-16'",
    );
    await db.query("DELETE FROM lich_lam_viec WHERE ngay = '2026-11-16'");
    expect((await applier.applyOne(id, AT_NEW_EFFECTIVE)).kind).toBe(
      'DaApDung',
    );
    expect((await requestRow(id))?.apDungLuc).not.toBeNull();
  });

  it('CN-109 dời rồi quá hạn lần nữa ⇒ cảnh báo MỚI (v2) cho Admin Toàn hệ thống và người đề xuất; lần dời thứ hai báo bệnh nhân bằng v2', async () => {
    const w = await world();
    const id = await w.overdue();
    await reschedules.reschedule(system, w.sysId, id, NEW_EFFECTIVE);
    // Lịch của B vẫn còn ⇒ quá hạn lần hai
    expect((await applier.applyOne(id, AT_NEW_EFFECTIVE)).kind).toBe('QuaHan');
    for (const who of [w.sysId, w.proposer.account.taiKhoanId]) {
      expect(await of(who, 'YeuCauThayDoiChiNhanhQuaHan:v1')).toHaveLength(1);
      expect(await of(who, 'YeuCauThayDoiChiNhanhQuaHan:v2')).toHaveLength(1);
    }
    vi.setSystemTime(new Date('2026-11-11T08:00:00+07:00'));
    await reschedules.reschedule(system, w.sysId, id, '2026-11-20 08:00:00');
    expect((await requestRow(id))?.soLan).toBe(2);
    // B đã nhận "dời" v1 (thư đó nay BoQua) và nhận thêm v2
    const B = w.patientB.account.taiKhoanId;
    expect((await of(B, 'DoiHieuLucThayDoiChiNhanh:v1'))[0]?.email).toBe(
      'BoQua',
    );
    expect((await of(B, 'DoiHieuLucThayDoiChiNhanh:v2'))[0]?.email).toBe(
      'ChoGui',
    );
    // A đã được báo (lúc duyệt, lần dời 1) và vẫn không bị ảnh hưởng ⇒ vẫn được báo lần dời 2
    expect(
      await of(w.patientA.account.taiKhoanId, 'DoiHieuLucThayDoiChiNhanh:v2'),
    ).toHaveLength(1);
  });

  it('YCB-33 [đề xuất mã] ghi audit lỗi ⇒ hoàn tác trọn: vẫn quá hạn, hiệu lực cũ, bản chụp cũ, thư không BoQua, không có thông báo dời', async () => {
    const w = await world();
    const id = await w.overdue();
    const before = await notifications();
    const snapshotBefore = await snapshotIds(id);
    vi.spyOn(audit, 'record').mockRejectedValueOnce(
      new Error('AUDIT_WRITE_FAILED'),
    );
    await expect(
      reschedules.reschedule(system, w.sysId, id, NEW_EFFECTIVE),
    ).rejects.toThrow();
    expect(await requestRow(id)).toMatchObject({
      hieuLucTu: EFFECTIVE,
      soLan: 0,
    });
    expect((await requestRow(id))?.quaHanLuc).not.toBeNull();
    expect(await snapshotIds(id)).toEqual(snapshotBefore);
    expect(await notifications()).toEqual(before);
  });
});
