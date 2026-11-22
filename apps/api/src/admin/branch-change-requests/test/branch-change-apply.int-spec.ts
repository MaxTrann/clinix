import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { BookingFixtures } from '../../../appointments/testing/booking-fixtures.js';
import { AuditRepository } from '../../../audit/audit.repository.js';
import { AuditService } from '../../../audit/audit.service.js';
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
import { ChiNhanhDichVuKham } from '../../entities/chi-nhanh-dich-vu-kham.entity.js';
import type { ChiNhanh } from '../../entities/chi-nhanh.entity.js';
import { SystemConfigRepository } from '../../system-config/system-config.repository.js';
import { SystemConfigService } from '../../system-config/system-config.service.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { BranchChangeApplyJob } from '../apply/apply.job.js';
import { BranchChangeApplyRepository } from '../apply/branch-change-apply.repository.js';
import { BranchChangeApplyService } from '../apply/branch-change-apply.service.js';
import { BranchChangeRequestRepository } from '../branch-change-request.repository.js';
import { BranchChangeRequestService } from '../branch-change-request.service.js';

// Admin B11 — job áp dụng thay đổi chi nhánh trên MySQL 8.4 THẬT (PLAN admin 5.4 "Áp dụng"; Q7, Q8, Q46, Q48; CN b10).
// Đồng hồ ứng dụng giả: NOW = Thứ Hai 02/11/2026 07:00 (lúc gửi và duyệt); báo trước 3 ngày ⇒ hiệu lực 05/11/2026 07:00. Job nhận mốc qua `run(now)`.
// Yêu cầu thật: B8 gửi (Thứ Hai chỉ còn 09:00–11:00, Thứ Ba nghỉ, bỏ dịch vụ phụ) → B10 duyệt. Lịch hẹn 09/11 08:00 làm yêu cầu có ảnh hưởng.
const NOW = new Date('2026-11-02T07:00:00+07:00');
const EFFECTIVE = '2026-11-05 07:00:00';
const AT_EFFECTIVE = new Date('2026-11-05T07:00:00+07:00');
const system: AdminScope = { kind: 'ToanHeThong' };
const scopeOf = (branch: ChiNhanh): AdminScope => ({
  kind: 'ChiNhanh',
  chiNhanhId: branch.chiNhanhId,
});
const fullDay = (thuTrongTuan: number) => ({
  thuTrongTuan,
  hoatDong: true,
  sang: { batDau: '08:00', ketThuc: '12:00' },
  chieu: { batDau: '13:00', ketThuc: '17:00' },
});
/** Lịch đề xuất: Thứ Hai chỉ sáng 09:00–11:00, Thứ Ba nghỉ, các thứ khác như cũ. */
const proposedSchedule = () => [
  {
    thuTrongTuan: 1,
    hoatDong: true,
    sang: { batDau: '09:00', ketThuc: '11:00' },
  },
  { thuTrongTuan: 2, hoatDong: false },
  ...[3, 4, 5, 6, 7].map(fullDay),
];

describe('B11 áp dụng thay đổi chi nhánh — MySQL thật', () => {
  let db: DataSource;
  let requests: BranchChangeRequestService;
  let branches: BranchService;
  let branchRepo: BranchRepository;
  let applier: BranchChangeApplyService;
  let job: BranchChangeApplyJob;
  let fx: AdminFixtures;
  let booking: BookingFixtures;

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    const impact = new BranchImpactService();
    const notifier = new BranchChangeNotifier();
    branchRepo = new BranchRepository(db);
    requests = new BranchChangeRequestService(
      new BranchChangeRequestRepository(db),
      new BranchAccessPolicy(),
      impact,
      notifier,
      new AuditService(new AuditRepository()),
      new SystemConfigService(new SystemConfigRepository(db)),
    );
    branches = new BranchService(branchRepo, new BranchAccessPolicy(), impact);
    const applyRepo = new BranchChangeApplyRepository(db);
    applier = new BranchChangeApplyService(
      applyRepo,
      branchRepo,
      impact,
      notifier,
    );
    job = new BranchChangeApplyJob(applyRepo, applier);
  });
  beforeEach(async () => {
    await resetTables(db);
    fx = new AdminFixtures(db);
    booking = new BookingFixtures(db);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
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
    // Dịch vụ phụ của chi nhánh, chưa bác sĩ nào dùng: yêu cầu sẽ bỏ nó
    const { service: extra } = await fx.catalog();
    await db.getRepository(ChiNhanhDichVuKham).save({
      chiNhanhId: branch.chiNhanhId,
      dichVuKhamId: extra.dichVuKhamId,
    });
    const patient = await fx.patient();
    const proposer = await fx.admin(branch);
    const sysAdmin = await fx.admin();
    const shift = await fx.shift(doctor.profile, {
      ngay: '2026-11-09',
      ca: 'CaSang',
    });
    const book = async (shiftOf = shift, at = '2026-11-09T08:00:00+07:00') =>
      fx.appointment(
        doctor.profile,
        await fx.slot(shiftOf, { ngayGio: new Date(at), trangThai: 'DaDat' }),
        patient.account.taiKhoanId,
      );
    await book();
    /** B8 gửi + B10 duyệt (đồng hồ ở NOW); trả id yêu cầu DaDuyet. */
    const approved = async () => {
      const result = await branches.update(
        scopeOf(branch),
        proposer.account.taiKhoanId,
        branch.chiNhanhId,
        Object.assign(new UpdateBranchDto(), {
          ten: 'Chi nhánh A',
          diaChi: branch.diaChi,
          lichHoatDong: proposedSchedule(),
          dichVuKhamIds: [doctor.profile.dichVuKhamId],
        }),
      );
      if (!result.yeuCau) throw new Error('B8 phải tạo yêu cầu');
      const id = result.yeuCau.yeuCauThayDoiChiNhanhId;
      await requests.approve(
        system,
        sysAdmin.account.taiKhoanId,
        id,
        EFFECTIVE,
      );
      return id;
    };
    /** Giả lập lễ tân/bác sĩ đã xử lý hết: không còn lịch hẹn, khung giờ, ca nào của chi nhánh. */
    const resolveAll = async () => {
      await db.query('DELETE FROM yeu_cau_thay_doi_chi_nhanh_lich_hen');
      await db.query('DELETE FROM lich_hen');
      await db.query('DELETE FROM khung_gio');
      await db.query('DELETE FROM lich_lam_viec');
    };
    return {
      branch,
      doctor,
      extra,
      patient,
      proposer,
      sysAdmin,
      shift,
      book,
      approved,
      resolveAll,
    };
  }

  const requestRow = async (id: string) =>
    (
      (await db.query(
        `SELECT trang_thai AS trangThai, DATE_FORMAT(ap_dung_luc, '%Y-%m-%d %H:%i:%s') AS apDungLuc,
                DATE_FORMAT(qua_han_luc, '%Y-%m-%d %H:%i:%s') AS quaHanLuc, dang_mo_chi_nhanh AS dangMo
           FROM yeu_cau_thay_doi_chi_nhanh WHERE yeu_cau_thay_doi_chi_nhanh_id = ?`,
        [id],
      )) as Record<string, unknown>[]
    )[0];
  const scheduleOf = (branchId: string, days = [1, 2, 3]) =>
    db.query(
      `SELECT thu_trong_tuan AS thu, hoat_dong AS hoatDong, gio_bat_dau_sang AS bdSang, gio_ket_thuc_sang AS ktSang,
              gio_bat_dau_chieu AS bdChieu, gio_ket_thuc_chieu AS ktChieu
         FROM chi_nhanh_lich_hoat_dong WHERE chi_nhanh_id = ? AND thu_trong_tuan IN (${days.join(',')}) ORDER BY thu_trong_tuan`,
      [branchId],
    ) as Promise<Record<string, unknown>[]>;
  const servicesOf = async (branchId: string) =>
    (
      (await db.query(
        'SELECT CAST(dich_vu_kham_id AS CHAR) AS id FROM chi_nhanh_dich_vu_kham WHERE chi_nhanh_id = ? ORDER BY dich_vu_kham_id',
        [branchId],
      )) as { id: string }[]
    ).map((r) => r.id);
  const overdueAlerts = (): Promise<
    {
      taiKhoanId: string;
      loai: string;
      noiDung: string;
      email: string | null;
    }[]
  > =>
    db.query(
      `SELECT CAST(t.tai_khoan_id AS CHAR) AS taiKhoanId, t.loai_su_kien AS loai, t.noi_dung AS noiDung, e.trang_thai AS email
         FROM thong_bao t LEFT JOIN email_thong_bao e ON e.thong_bao_id = t.thong_bao_id
        WHERE t.loai_su_kien LIKE 'YeuCauThayDoiChiNhanhQuaHan%' ORDER BY t.tai_khoan_id`,
    );
  const ORIGINAL_DAY = (thu: number) => ({
    thu,
    hoatDong: 1,
    bdSang: '08:00:00',
    ktSang: '12:00:00',
    bdChieu: '13:00:00',
    ktChieu: '17:00:00',
  });

  describe('áp dụng (CN b10)', () => {
    it('CN-80 đến hiệu lực, sạch ⇒ thay cả dòng từng thứ (không trộn giờ cũ), thay danh sách dịch vụ, ap_dung_luc đặt; chi nhánh hết yêu cầu đang mở', async () => {
      const w = await world();
      const id = await w.approved();
      await w.resolveAll();
      expect(await job.run(AT_EFFECTIVE)).toMatchObject({
        applied: 1,
        overdue: 0,
        failed: 0,
        invalid: 0,
      });
      expect(await requestRow(id)).toEqual({
        trangThai: 'DaDuyet',
        apDungLuc: EFFECTIVE,
        quaHanLuc: null,
        dangMo: null,
      });
      expect(await scheduleOf(w.branch.chiNhanhId)).toEqual([
        // Thứ Hai: chiều cũ 13:00–17:00 bị xoá, không còn sót
        {
          thu: 1,
          hoatDong: 1,
          bdSang: '09:00:00',
          ktSang: '11:00:00',
          bdChieu: null,
          ktChieu: null,
        },
        {
          thu: 2,
          hoatDong: 0,
          bdSang: null,
          ktSang: null,
          bdChieu: null,
          ktChieu: null,
        },
        ORIGINAL_DAY(3),
      ]);
      expect(await servicesOf(w.branch.chiNhanhId)).toEqual([
        String(w.doctor.profile.dichVuKhamId),
      ]);
    });

    it('CN-81 một giây trước hiệu lực ⇒ không áp dụng', async () => {
      const w = await world();
      const id = await w.approved();
      await w.resolveAll();
      expect(
        await job.run(new Date('2026-11-05T06:59:59+07:00')),
      ).toMatchObject({ applied: 0 });
      expect((await requestRow(id))?.apDungLuc).toBeNull();
      expect(await scheduleOf(w.branch.chiNhanhId, [1])).toEqual([
        ORIGINAL_DAY(1),
      ]);
    });

    it('CN-82 job chạy hai lần và hai lần applyOne đồng thời ⇒ áp dụng đúng một lần', async () => {
      const w = await world();
      const id = await w.approved();
      await w.resolveAll();
      const results = await Promise.all([
        applier.applyOne(id, AT_EFFECTIVE),
        applier.applyOne(id, AT_EFFECTIVE),
      ]);
      expect(results.map((r) => r.kind).sort()).toEqual([
        'DaApDung',
        'KhongDenHan',
      ]);
      expect(await job.run(AT_EFFECTIVE)).toMatchObject({
        applied: 0,
        notDue: 0,
      });
      expect((await requestRow(id))?.apDungLuc).toBe(EFFECTIVE);
    });

    it('CN-83 job tắt rồi bật lại sau hiệu lực ⇒ áp dụng bù, ap_dung_luc >= hieu_luc_tu', async () => {
      const w = await world();
      const id = await w.approved();
      await w.resolveAll();
      await job.run(new Date('2026-11-07T10:15:30+07:00'));
      expect((await requestRow(id))?.apDungLuc).toBe('2026-11-07 10:15:30');
    });

    it('CN-84 lỗi khi ghi thứ thứ hai ⇒ hoàn tác trọn, ap_dung_luc NULL; lượt sau áp dụng được', async () => {
      const w = await world();
      const id = await w.approved();
      await w.resolveAll();
      const original = branchRepo.replaceScheduleRow.bind(branchRepo);
      let calls = 0;
      vi.spyOn(branchRepo, 'replaceScheduleRow').mockImplementation(
        async (em, branchId, row) => {
          calls += 1;
          if (calls === 2) throw new Error('giả lập lỗi ghi');
          return original(em, branchId, row);
        },
      );
      expect(await job.run(AT_EFFECTIVE)).toMatchObject({
        applied: 0,
        failed: 1,
      });
      expect((await requestRow(id))?.apDungLuc).toBeNull();
      expect(await scheduleOf(w.branch.chiNhanhId, [1])).toEqual([
        ORIGINAL_DAY(1),
      ]);
      vi.restoreAllMocks();
      expect(
        await job.run(new Date('2026-11-05T07:01:00+07:00')),
      ).toMatchObject({ applied: 1 });
    });

    it('CN-85 yêu cầu ChoDuyet và TuChoi không bị áp dụng', async () => {
      const w = await world();
      const result = await branches.update(
        scopeOf(w.branch),
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        Object.assign(new UpdateBranchDto(), {
          ten: 'Chi nhánh A',
          diaChi: w.branch.diaChi,
          lichHoatDong: proposedSchedule(),
          dichVuKhamIds: [w.doctor.profile.dichVuKhamId],
        }),
      );
      const id = result.yeuCau?.yeuCauThayDoiChiNhanhId ?? '';
      await w.resolveAll();
      expect(await job.run(AT_EFFECTIVE)).toMatchObject({
        applied: 0,
        notDue: 0,
      });
      await requests.reject(system, w.sysAdmin.account.taiKhoanId, id, 'Không');
      expect(await job.run(AT_EFFECTIVE)).toMatchObject({ applied: 0 });
      expect(await scheduleOf(w.branch.chiNhanhId, [1])).toEqual([
        ORIGINAL_DAY(1),
      ]);
    });

    it('CN-86 noi_dung_sau hỏng ⇒ không áp dụng, lịch đang có giữ nguyên, không đánh dấu quá hạn', async () => {
      const w = await world();
      const id = await w.approved();
      await w.resolveAll();
      // Ngày nghỉ mà vẫn có giờ: bộ kiểm lịch phải bắt
      await db.query(
        `UPDATE yeu_cau_thay_doi_chi_nhanh
            SET noi_dung_sau = JSON_SET(noi_dung_sau, '$.lich_hoat_dong[0].hoat_dong', false)
          WHERE yeu_cau_thay_doi_chi_nhanh_id = ?`,
        [id],
      );
      expect(await job.run(AT_EFFECTIVE)).toMatchObject({
        applied: 0,
        invalid: 1,
        overdue: 0,
      });
      expect(await applier.applyOne(id, AT_EFFECTIVE)).toEqual({
        kind: 'NoiDungHong',
        maLoi: ['NGAY_NGHI_CO_GIO@1'],
      });
      expect(await requestRow(id)).toMatchObject({
        apDungLuc: null,
        quaHanLuc: null,
      });
      expect(await scheduleOf(w.branch.chiNhanhId, [1])).toEqual([
        ORIGINAL_DAY(1),
      ]);
    });
  });

  describe('quá hạn (Q7, Q46, Q48)', () => {
    it('CN-66, CN-109 còn lịch hẹn và ca tại hiệu lực ⇒ không áp dụng gì, qua_han_luc đặt, vẫn DaDuyet; cảnh báo mỗi Admin Toàn hệ thống đang hoạt động và người đề xuất; không hủy, đổi gì', async () => {
      const w = await world();
      const lockedAdmin = await fx.admin(undefined, {
        trangThai: 'NgungHoatDong',
      });
      const otherSys = await fx.admin();
      const id = await w.approved();
      expect(await job.run(AT_EFFECTIVE)).toMatchObject({
        applied: 0,
        overdue: 1,
      });
      expect(await requestRow(id)).toEqual({
        trangThai: 'DaDuyet',
        apDungLuc: null,
        quaHanLuc: EFFECTIVE,
        dangMo: w.branch.chiNhanhId,
      });
      expect(await scheduleOf(w.branch.chiNhanhId, [1, 2])).toEqual([
        ORIGINAL_DAY(1),
        ORIGINAL_DAY(2),
      ]);
      expect(await servicesOf(w.branch.chiNhanhId)).toHaveLength(2);
      expect(
        (
          (await db.query(
            "SELECT COUNT(*) AS n FROM lich_hen WHERE trang_thai = 'DaXacNhan'",
          )) as { n: string }[]
        )[0]?.n,
      ).toBe('1');
      const alerts = await overdueAlerts();
      expect(alerts.map((a) => a.taiKhoanId).sort()).toEqual(
        [
          w.sysAdmin.account.taiKhoanId,
          otherSys.account.taiKhoanId,
          w.proposer.account.taiKhoanId,
        ].sort(),
      );
      expect(alerts.map((a) => a.taiKhoanId)).not.toContain(
        lockedAdmin.account.taiKhoanId,
      );
      for (const a of alerts) {
        expect(a.loai).toBe('YeuCauThayDoiChiNhanhQuaHan:v1');
        // Chỉ trong ứng dụng, không có thư (C4)
        expect(a.email).toBeNull();
      }
      // Ca sáng Thứ Hai vẫn còn khoảng sáng mới (09:00–11:00) nên không phải ca bị ảnh hưởng; lịch 08:00 thì ra ngoài giờ
      expect(alerts[0]?.noiDung).toContain(
        'còn 1 lịch hẹn, 0 ca làm việc và 0 bác sĩ cần xử lý',
      );
      // Chạy lại: không chọn nữa, không cảnh báo trùng
      await job.run(new Date('2026-11-05T07:01:00+07:00'));
      expect(await overdueAlerts()).toHaveLength(3);
    });

    it('CN-67, CN-107 sau quá hạn, lịch/ca được xử lý hết, job chạy nhiều lần ⇒ vẫn không tự áp dụng muộn', async () => {
      const w = await world();
      const id = await w.approved();
      await job.run(AT_EFFECTIVE);
      await w.resolveAll();
      for (const minute of ['01', '02', '30'])
        expect(
          await job.run(new Date(`2026-11-05T07:${minute}:00+07:00`)),
        ).toMatchObject({ applied: 0, overdue: 0 });
      expect((await requestRow(id))?.apDungLuc).toBeNull();
      expect(await applier.applyOne(id, AT_EFFECTIVE)).toEqual({
        kind: 'KhongDenHan',
      });
    });

    it('CN-68 lịch hẹn mới xuất hiện sau lúc duyệt (booking chưa chặn) ⇒ job tính lại, thấy, quá hạn', async () => {
      const w = await world();
      const id = await w.approved();
      await w.resolveAll();
      // Đặt chen một lịch Thứ Ba 10/11 (Thứ Ba sẽ nghỉ) sau khi duyệt
      const shift = await fx.shift(w.doctor.profile, {
        ngay: '2026-11-10',
        ca: 'CaSang',
      });
      await w.book(shift, '2026-11-10T09:00:00+07:00');
      expect(await applier.applyOne(id, AT_EFFECTIVE)).toEqual({
        kind: 'QuaHan',
        lichHen: 1,
        ca: 1,
        bacSi: 0,
      });
      expect((await requestRow(id))?.quaHanLuc).toBe(EFFECTIVE);
    });

    it('YCB-20 quyết định 1: lúc áp dụng có bác sĩ dùng dịch vụ sắp bỏ (Q8) ⇒ quá hạn, dịch vụ giữ nguyên', async () => {
      const w = await world();
      const id = await w.approved();
      await w.resolveAll();
      const other = await fx.doctor(w.branch);
      await db.query(
        'UPDATE bac_si SET dich_vu_kham_id = ? WHERE tai_khoan_id = ?',
        [w.extra.dichVuKhamId, other.account.taiKhoanId],
      );
      expect(await applier.applyOne(id, AT_EFFECTIVE)).toEqual({
        kind: 'QuaHan',
        lichHen: 0,
        ca: 0,
        bacSi: 1,
      });
      expect(await servicesOf(w.branch.chiNhanhId)).toContain(
        String(w.extra.dichVuKhamId),
      );
    });

    it('CN-109 sau một lần dời hiệu lực rồi lại quá hạn ⇒ cảnh báo MỚI (phiên bản v2), cảnh báo cũ giữ nguyên', async () => {
      const w = await world();
      const id = await w.approved();
      await job.run(AT_EFFECTIVE);
      // Giả lập B22 (chưa có): dời sang 12/11, xoá cờ quá hạn, tăng số lần dời
      await db.query(
        `UPDATE yeu_cau_thay_doi_chi_nhanh SET hieu_luc_tu = '2026-11-12 07:00:00', qua_han_luc = NULL, so_lan_doi_hieu_luc = 1
          WHERE yeu_cau_thay_doi_chi_nhanh_id = ?`,
        [id],
      );
      // Lịch hẹn mới vào Thứ Hai 16/11 (sau mốc mới) để vẫn còn ảnh hưởng
      const shift = await fx.shift(w.doctor.profile, {
        ngay: '2026-11-16',
        ca: 'CaSang',
      });
      await w.book(shift, '2026-11-16T08:00:00+07:00');
      await job.run(new Date('2026-11-12T07:00:00+07:00'));
      const versions = (await overdueAlerts()).map((a) => a.loai);
      expect(versions.filter((v) => v.endsWith(':v1'))).toHaveLength(2);
      expect(versions.filter((v) => v.endsWith(':v2'))).toHaveLength(2);
    });
  });

  describe('job', () => {
    it('YCB-21 một yêu cầu lỗi không chặn yêu cầu sau; tóm tắt đúng; lượt chồng bị bỏ qua', async () => {
      const first = await world();
      const firstId = await first.approved();
      await first.resolveAll();
      // Chi nhánh thứ hai, cùng hiệu lực, sạch
      const second = await world();
      const secondId = await second.approved();
      await second.resolveAll();
      const original = applier.applyOne.bind(applier);
      vi.spyOn(applier, 'applyOne').mockImplementation(async (id, now) => {
        if (id === firstId) throw new Error('giả lập');
        return original(id, now);
      });
      const [summary, skipped] = await Promise.all([
        job.run(AT_EFFECTIVE),
        job.run(AT_EFFECTIVE),
      ]);
      expect(skipped).toBeUndefined();
      expect(summary).toEqual({
        applied: 1,
        overdue: 0,
        notDue: 0,
        invalid: 0,
        failed: 1,
        more: false,
      });
      expect((await requestRow(firstId))?.apDungLuc).toBeNull();
      expect((await requestRow(secondId))?.apDungLuc).toBe(EFFECTIVE);
    });
  });
});
