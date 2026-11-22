import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { emptyEmailOutboxSummary } from '../../../appointments/notifications/email-outbox.service.js';
import { BookingFixtures } from '../../../appointments/testing/booking-fixtures.js';
import { createOutbox } from '../../../appointments/testing/notification-world.js';
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
import { BranchChangeRequestRepository } from '../branch-change-request.repository.js';
import { BranchChangeRequestService } from '../branch-change-request.service.js';
import { BranchChangeStopService } from '../branch-change-stop.service.js';

// Admin B21 — rút và hủy yêu cầu thay đổi chi nhánh trên MySQL 8.4 THẬT (PLAN admin 5.4; Q3, Q40, Q47; H21). Thư qua FakeMailService, không thư thật.
// Đồng hồ ứng dụng giả: NOW = Thứ Hai 02/11/2026 07:00. Yêu cầu thật: B8 gửi (Thứ Hai nghỉ) → B10 duyệt với hiệu lực 05/11/2026 07:00 (báo trước 3 ngày).
const NOW = new Date('2026-11-02T07:00:00+07:00');
const EFFECTIVE = '2026-11-05 07:00:00';
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
    return { status: e.getStatus(), maLoi: e.maLoi };
  }
  throw new Error('mong đợi lỗi');
};

describe('B21 rút và hủy yêu cầu thay đổi chi nhánh — MySQL thật', () => {
  let db: DataSource;
  let audit: AuditService;
  let requests: BranchChangeRequestService;
  let stops: BranchChangeStopService;
  let branches: BranchService;
  let fx: AdminFixtures;
  let booking: BookingFixtures;

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    const impact = new BranchImpactService();
    const notifier = new BranchChangeNotifier();
    const repo = new BranchChangeRequestRepository(db);
    audit = new AuditService(new AuditRepository());
    requests = new BranchChangeRequestService(
      repo,
      new BranchAccessPolicy(),
      impact,
      notifier,
      audit,
      new SystemConfigService(new SystemConfigRepository(db)),
    );
    stops = new BranchChangeStopService(
      repo,
      requests,
      new BranchAccessPolicy(),
      notifier,
      audit,
    );
    branches = new BranchService(
      new BranchRepository(db),
      new BranchAccessPolicy(),
      impact,
    );
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

  /** Chi nhánh A: bệnh nhân A có lịch Thứ Hai 09/11, bệnh nhân B có lịch Thứ Hai 16/11 (cả hai bị ảnh hưởng khi Thứ Hai nghỉ). */
  async function world() {
    await booking.systemConfig({ soNgayBaoTruocDoiGioLam: 3 });
    const branch = await fx.branch({ ten: 'Chi nhánh A' });
    await fx.weeklySchedule(branch.chiNhanhId);
    const otherBranch = await fx.branch({ ten: 'Chi nhánh B' });
    const doctor = await fx.doctor(branch);
    const patientA = await fx.patient();
    const patientB = await fx.patient();
    const proposer = await fx.admin(branch);
    const sameBranchAdmin = await fx.admin(branch);
    const otherBranchAdmin = await fx.admin(otherBranch);
    const sysAdmin = await fx.admin();
    for (const [ngay, patientId] of [
      ['2026-11-09', patientA.account.taiKhoanId],
      ['2026-11-16', patientB.account.taiKhoanId],
    ] as const) {
      const shift = await fx.shift(doctor.profile, { ngay, ca: 'CaSang' });
      const slot = await fx.slot(shift, {
        ngayGio: new Date(`${ngay}T09:00:00+07:00`),
        trangThai: 'DaDat',
      });
      await fx.appointment(doctor.profile, slot, patientId);
    }
    const propose = async (
      who: { scope: AdminScope; actorId: string } = {
        scope: scopeOf(branch),
        actorId: proposer.account.taiKhoanId,
      },
    ) => {
      const result = await branches.update(
        who.scope,
        who.actorId,
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
    const sysId = sysAdmin.account.taiKhoanId;
    const approved = async () => {
      const id = await propose();
      await requests.approve(system, sysId, id, EFFECTIVE);
      return id;
    };
    return {
      branch,
      patientA,
      patientB,
      proposer,
      sameBranchAdmin,
      otherBranchAdmin,
      sysAdmin,
      sysId,
      propose,
      approved,
    };
  }

  const requestRow = async (id: string) =>
    (
      (await db.query(
        `SELECT trang_thai AS trangThai, CAST(nguoi_huy_id AS CHAR) AS nguoiHuyId, ly_do_huy AS lyDoHuy,
                DATE_FORMAT(thoi_diem_huy, '%Y-%m-%d %H:%i:%s') AS thoiDiemHuy, dang_mo_chi_nhanh AS dangMo
           FROM yeu_cau_thay_doi_chi_nhanh WHERE yeu_cau_thay_doi_chi_nhanh_id = ?`,
        [id],
      )) as Record<string, unknown>[]
    )[0];
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
  const auditRows = async () =>
    (
      (await db.query(
        `SELECT CAST(tai_khoan_id AS CHAR) AS actor, CAST(chi_nhanh_id AS CHAR) AS branch, hanh_dong AS action,
                CAST(ma_doi_tuong AS CHAR) AS target, chi_tiet_thay_doi AS changes
           FROM nhat_ky_hanh_dong ORDER BY nhat_ky_hanh_dong_id`,
      )) as (Record<string, unknown> & { action: string })[]
    ).map((row) => ({
      ...row,
      changes:
        typeof row.changes === 'string'
          ? (JSON.parse(row.changes) as unknown)
          : row.changes,
    }));
  const mondayActive = async () =>
    (
      (await db.query(
        'SELECT COUNT(*) AS n FROM chi_nhanh_lich_hoat_dong WHERE thu_trong_tuan = 1 AND hoat_dong = 1',
      )) as { n: string }[]
    )[0]?.n;

  describe('rút (Q3; chỉ người gửi)', () => {
    it('CN-90, CN-97, CN-99 người gửi rút ChoDuyet ⇒ DaRut, chi nhánh giữ nguyên, Admin Toàn hệ thống đang hoạt động được báo trong ứng dụng, audit; gửi được yêu cầu mới', async () => {
      const w = await world();
      const lockedSys = await fx.admin(undefined, {
        trangThai: 'NgungHoatDong',
      });
      const id = await w.propose();
      const detail = await stops.withdraw(
        scopeOf(w.branch),
        w.proposer.account.taiKhoanId,
        id,
      );
      expect(detail.trangThai).toBe('DaRut');
      expect(await requestRow(id)).toMatchObject({
        trangThai: 'DaRut',
        dangMo: null,
      });
      expect(await mondayActive()).toBe('1');
      const sent = await notifications();
      expect(sent).toEqual([
        {
          taiKhoanId: w.sysId,
          loai: 'RutThayDoiChiNhanh',
          noiDung: expect.stringContaining('đã được người gửi rút lại.'),
          email: null,
        },
      ]);
      expect(sent.map((n) => n.taiKhoanId)).not.toContain(
        lockedSys.account.taiKhoanId,
      );
      expect(await auditRows()).toEqual([
        {
          actor: w.proposer.account.taiKhoanId,
          branch: w.branch.chiNhanhId,
          action: 'RutThayDoiChiNhanh',
          target: id,
          changes: { nguoi_de_xuat_id: w.proposer.account.taiKhoanId },
        },
      ]);
      await expect(w.propose()).resolves.toBeDefined();
    });

    it('CN-91 không phải người gửi: Admin Chi nhánh cùng chi nhánh ⇒ 403, chi nhánh khác ⇒ 404, Toàn hệ thống ⇒ 403; vẫn ChoDuyet', async () => {
      const w = await world();
      const id = await w.propose();
      expect(
        await codeOf(
          stops.withdraw(
            scopeOf(w.branch),
            w.sameBranchAdmin.account.taiKhoanId,
            id,
          ),
        ),
      ).toEqual({ status: 403, maLoi: 'KHONG_DU_QUYEN' });
      expect(
        await codeOf(
          stops.withdraw(
            {
              kind: 'ChiNhanh',
              chiNhanhId: w.otherBranchAdmin.profile.chiNhanhId ?? '',
            },
            w.otherBranchAdmin.account.taiKhoanId,
            id,
          ),
        ),
      ).toEqual({ status: 404, maLoi: 'KHONG_TIM_THAY' });
      expect(await codeOf(stops.withdraw(system, w.sysId, id))).toEqual({
        status: 403,
        maLoi: 'KHONG_DU_QUYEN',
      });
      expect(await codeOf(stops.withdraw(system, w.sysId, '999999'))).toEqual({
        status: 404,
        maLoi: 'KHONG_TIM_THAY',
      });
      expect((await requestRow(id))?.trangThai).toBe('ChoDuyet');
    });

    it('CN-90 Toàn hệ thống tự rút yêu cầu của chính mình ⇒ được, không tự báo cho mình', async () => {
      const w = await world();
      const id = await w.propose({ scope: system, actorId: w.sysId });
      await stops.withdraw(system, w.sysId, id);
      expect((await requestRow(id))?.trangThai).toBe('DaRut');
      expect(await notifications()).toEqual([]);
    });

    it('CN-92 rút yêu cầu DaDuyet, TuChoi, DaRut, DaHuy ⇒ 409 YEU_CAU_KHONG_THE_RUT_HUY', async () => {
      const w = await world();
      const actor = w.proposer.account.taiKhoanId;
      const mine = scopeOf(w.branch);
      const expectStuck = async (id: string) =>
        expect(await codeOf(stops.withdraw(mine, actor, id))).toEqual({
          status: 409,
          maLoi: 'YEU_CAU_KHONG_THE_RUT_HUY',
        });
      const approved = await w.approved();
      await expectStuck(approved);
      await stops.cancel(system, w.sysId, approved, 'Hủy');
      await expectStuck(approved); // DaHuy
      const rejected = await w.propose();
      await requests.reject(system, w.sysId, rejected, 'Không');
      await expectStuck(rejected); // TuChoi
      const withdrawn = await w.propose();
      await stops.withdraw(mine, actor, withdrawn);
      await expectStuck(withdrawn); // DaRut
    });
  });

  describe('hủy (Q47)', () => {
    it('CN-93, CN-105, CN-106, CN-99, CN-97 hủy DaDuyet: DaHuy + người, thời điểm, lý do; thư báo thay đổi còn chờ ⇒ BoQua, DaGui giữ nguyên; bệnh nhân đã được báo nhận "đã hủy" (không lý do); người đề xuất nhận câu có lý do; audit', async () => {
      const w = await world();
      const id = await w.approved();
      // Thư báo thay đổi của bệnh nhân A đã gửi xong, của B còn chờ
      await db.query(
        `UPDATE email_thong_bao e JOIN thong_bao t ON t.thong_bao_id = e.thong_bao_id
            SET e.trang_thai = 'DaGui', e.da_gui_luc = '2026-11-02 07:00:00', e.so_lan_thu = 1
          WHERE t.tai_khoan_id = ? AND t.loai_su_kien LIKE 'ThayDoiChiNhanhAnhHuongLichHen:v%'`,
        [w.patientA.account.taiKhoanId],
      );
      const detail = await stops.cancel(
        system,
        w.sysId,
        id,
        'Bác sĩ Nguyễn đã đổi ý',
      );
      expect(detail).toMatchObject({
        trangThai: 'DaHuy',
        lyDoHuy: 'Bác sĩ Nguyễn đã đổi ý',
        nguoiHuy: { taiKhoanId: w.sysId },
        thoiDiemHuy: '2026-11-02 07:00:00',
        anhHuong: { nguon: 'BanChup', lichHen: { tong: 2 } },
      });
      expect(await requestRow(id)).toMatchObject({ dangMo: null });
      expect(await mondayActive()).toBe('1');

      const byKey = (taiKhoanId: string, prefix: string) =>
        notifications().then((all) =>
          all.filter(
            (n) => n.taiKhoanId === taiKhoanId && n.loai.startsWith(prefix),
          ),
        );
      const A = w.patientA.account.taiKhoanId;
      const B = w.patientB.account.taiKhoanId;
      expect((await byKey(A, 'ThayDoiChiNhanhAnhHuongLichHen'))[0]?.email).toBe(
        'DaGui',
      );
      expect((await byKey(B, 'ThayDoiChiNhanhAnhHuongLichHen'))[0]?.email).toBe(
        'BoQua',
      );
      // Thư kết quả duyệt của người đề xuất không phải thư báo thay đổi: giữ ChoGui
      expect(
        (await byKey(w.proposer.account.taiKhoanId, 'KetQua'))[0]?.email,
      ).toBe('ChoGui');
      for (const patient of [A, B]) {
        const [cancelled] = await byKey(patient, 'HuyThayDoiChiNhanh');
        expect(cancelled?.email).toBe('ChoGui');
        expect(cancelled?.noiDung).toBe(
          'Thay đổi lịch hoạt động của chi nhánh Chi nhánh A dự kiến có hiệu lực từ 07:00 05/11/2026 đã được hủy. Lịch hẹn của bạn giữ nguyên theo lịch hoạt động hiện tại.',
        );
        expect(cancelled?.noiDung).not.toContain('Nguyễn');
      }
      const [toProposer] = await byKey(
        w.proposer.account.taiKhoanId,
        'HuyThayDoiChiNhanh',
      );
      expect(toProposer?.noiDung).toContain(
        'đã bị hủy. Lý do: Bác sĩ Nguyễn đã đổi ý.',
      );
      expect((await auditRows()).at(-1)).toEqual({
        actor: w.sysId,
        branch: w.branch.chiNhanhId,
        action: 'HuyThayDoiChiNhanh',
        target: id,
        changes: {
          ly_do_huy: 'Bác sĩ Nguyễn đã đổi ý',
          hieu_luc_tu: '2026-11-05T07:00:00+07:00',
          qua_han: false,
          so_benh_nhan_da_bao: 2,
        },
      });

      // CN-105: worker của booking không gửi thư đã BoQua; gửi đủ các thư còn lại
      const outbox = createOutbox(db);
      await outbox.service.sweep(NOW, emptyEmailOutboxSummary());
      expect(outbox.mail.sent).toHaveLength(4); // 2 thư "đã hủy" cho bệnh nhân, 1 cho người đề xuất, 1 kết quả duyệt
      expect((await byKey(B, 'ThayDoiChiNhanhAnhHuongLichHen'))[0]?.email).toBe(
        'BoQua',
      );
      // CN-97: hết yêu cầu đang mở
      await expect(w.propose()).resolves.toBeDefined();
    });

    it('CN-104 hủy yêu cầu quá hạn (đã qua hiệu lực, có qua_han_luc) ⇒ được, audit qua_han: true', async () => {
      const w = await world();
      const id = await w.approved();
      await db.query(
        "UPDATE yeu_cau_thay_doi_chi_nhanh SET qua_han_luc = '2026-11-05 07:00:00' WHERE yeu_cau_thay_doi_chi_nhanh_id = ?",
        [id],
      );
      vi.setSystemTime(new Date('2026-11-06T08:00:00+07:00'));
      await stops.cancel(system, w.sysId, id, 'Quá hạn lâu');
      expect((await requestRow(id))?.trangThai).toBe('DaHuy');
      expect((await auditRows()).at(-1)?.changes).toMatchObject({
        qua_han: true,
      });
    });

    it('CN-94 hủy yêu cầu đã áp dụng hay ChoDuyet ⇒ 409; không tồn tại ⇒ 404; thay đổi đã áp dụng giữ nguyên', async () => {
      const w = await world();
      const id = await w.approved();
      await db.query(
        "UPDATE yeu_cau_thay_doi_chi_nhanh SET ap_dung_luc = '2026-11-05 07:00:00' WHERE yeu_cau_thay_doi_chi_nhanh_id = ?",
        [id],
      );
      expect(await codeOf(stops.cancel(system, w.sysId, id, 'x'))).toEqual({
        status: 409,
        maLoi: 'YEU_CAU_KHONG_THE_RUT_HUY',
      });
      expect((await requestRow(id))?.trangThai).toBe('DaDuyet');
      const pending = await w.propose();
      expect(await codeOf(stops.cancel(system, w.sysId, pending, 'x'))).toEqual(
        { status: 409, maLoi: 'YEU_CAU_KHONG_THE_RUT_HUY' },
      );
      expect(
        await codeOf(stops.cancel(system, w.sysId, '999999', 'x')),
      ).toEqual({ status: 404, maLoi: 'KHONG_TIM_THAY' });
    });

    it('CN-98 Admin Chi nhánh gọi cancel ⇒ 403, vẫn DaDuyet', async () => {
      const w = await world();
      const id = await w.approved();
      expect(
        await codeOf(
          stops.cancel(
            scopeOf(w.branch),
            w.proposer.account.taiKhoanId,
            id,
            'x',
          ),
        ),
      ).toEqual({ status: 403, maLoi: 'KHONG_DU_QUYEN' });
      expect((await requestRow(id))?.trangThai).toBe('DaDuyet');
    });

    it('YCB-31 ghi audit lỗi ⇒ hoàn tác trọn: vẫn DaDuyet, thư không BoQua, không có thông báo hủy', async () => {
      const w = await world();
      const id = await w.approved();
      const before = await notifications();
      vi.spyOn(audit, 'record').mockRejectedValueOnce(
        new Error('AUDIT_WRITE_FAILED'),
      );
      await expect(stops.cancel(system, w.sysId, id, 'x')).rejects.toThrow();
      expect((await requestRow(id))?.trangThai).toBe('DaDuyet');
      expect(await notifications()).toEqual(before);
    });
  });

  describe('chạy đua (H11)', () => {
    it('YCB-30 rút đồng thời với duyệt ⇒ đúng một bên thắng, không trạng thái lai', async () => {
      const w = await world();
      const id = await w.propose();
      const results = await Promise.allSettled([
        stops.withdraw(scopeOf(w.branch), w.proposer.account.taiKhoanId, id),
        requests.approve(system, w.sysId, id, EFFECTIVE),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const state = (await requestRow(id))?.trangThai;
      const actions = (await auditRows()).map((r) => r.action);
      if (state === 'DaRut') expect(actions).toEqual(['RutThayDoiChiNhanh']);
      else {
        expect(state).toBe('DaDuyet');
        expect(actions).toEqual(['DuyetThayDoiChiNhanh']);
      }
    });

    it('YCB-30 hai lần hủy đồng thời ⇒ một thành công, một 409; thông báo hủy và audit chỉ một lần', async () => {
      const w = await world();
      const id = await w.approved();
      const results = await Promise.allSettled([
        stops.cancel(system, w.sysId, id, 'A'),
        stops.cancel(system, w.sysId, id, 'B'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failed = results.find(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      if (!failed) throw new Error('mong đợi một lần hủy thất bại');
      expect((failed.reason as AppException).maLoi).toBe(
        'YEU_CAU_KHONG_THE_RUT_HUY',
      );
      expect(
        (await notifications()).filter((n) => n.loai === 'HuyThayDoiChiNhanh'),
      ).toHaveLength(3);
      expect(
        (await auditRows()).filter((r) => r.action === 'HuyThayDoiChiNhanh'),
      ).toHaveLength(1);
    });
  });
});
