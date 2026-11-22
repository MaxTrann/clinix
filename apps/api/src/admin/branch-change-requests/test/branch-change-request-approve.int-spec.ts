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
import { BRANCH_CHANGE_EVENTS } from '../../../notification/branch-change-events.js';
import { BranchChangeNotifier } from '../../../notification/branch-change-notifier.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { UpdateBranchDto } from '../../branches/branch.dto.js';
import { BranchRepository } from '../../branches/branch.repository.js';
import { BranchService } from '../../branches/branch.service.js';
import { BranchImpactService } from '../../branches/impact/branch-impact.service.js';
import type { ChiNhanh } from '../../entities/chi-nhanh.entity.js';
import type { LichLamViec } from '../../entities/lich-lam-viec.entity.js';
import { SystemConfigRepository } from '../../system-config/system-config.repository.js';
import { SystemConfigService } from '../../system-config/system-config.service.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { BranchChangeRequestRepository } from '../branch-change-request.repository.js';
import { BranchChangeRequestService } from '../branch-change-request.service.js';
import { PendingBranchChangesReader } from '../pending-branch-changes.reader.js';

// Admin B10 — duyệt yêu cầu thay đổi chi nhánh trên MySQL 8.4 THẬT (PLAN admin 5.4, 7.8; Q4, Q5, Q6, Q9, Q46, Q48). Không gửi thư thật (chỉ xếp hàng ChoGui).
// Đồng hồ ứng dụng giả: NOW = Thứ Hai 02/11/2026 07:00 giờ VN; cấu hình báo trước 3 ngày ⇒ mốc sớm nhất 05/11/2026 07:00:00.
// Yêu cầu thật tạo bằng B8: chuyển Thứ Hai sang nghỉ. Lịch hẹn ca sáng Thứ Hai 09/11 và 16/11.
const NOW = new Date('2026-11-02T07:00:00+07:00');
const EARLIEST = '2026-11-05 07:00:00';
const system: AdminScope = { kind: 'ToanHeThong' };
const scopeOf = (branch: ChiNhanh): AdminScope => ({
  kind: 'ChiNhanh',
  chiNhanhId: branch.chiNhanhId,
});
const schedule = (mondayOff: boolean) =>
  Array.from({ length: 7 }, (_, i) =>
    i === 0 && mondayOff
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

describe('B10 duyệt yêu cầu thay đổi chi nhánh — MySQL thật', () => {
  let db: DataSource;
  let audit: AuditService;
  let notifier: BranchChangeNotifier;
  let service: BranchChangeRequestService;
  let branches: BranchService;
  let fx: AdminFixtures;
  let booking: BookingFixtures;

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    const impact = new BranchImpactService();
    audit = new AuditService(new AuditRepository());
    notifier = new BranchChangeNotifier();
    service = new BranchChangeRequestService(
      new BranchChangeRequestRepository(db),
      new BranchAccessPolicy(),
      impact,
      notifier,
      audit,
      new SystemConfigService(new SystemConfigRepository(db)),
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

  /**
   * Chi nhánh 7 thứ; bác sĩ có ca sáng Thứ Hai 09/11 và 16/11. Bệnh nhân A: lịch 09/11 09:00 (bản thân) và 16/11 09:00 (hồ sơ người thân).
   * Bệnh nhân B: lịch 16/11 10:00. Cấu hình báo trước 3 ngày (trừ khi `config = false`).
   */
  async function world(input: { config?: boolean } = {}) {
    if (input.config !== false)
      await booking.systemConfig({ soNgayBaoTruocDoiGioLam: 3 });
    const branch = await fx.branch({ ten: 'Chi nhánh A', diaChi: 'Địa chỉ A' });
    await fx.weeklySchedule(branch.chiNhanhId);
    const doctor = await fx.doctor(branch);
    const patientA = await fx.patient();
    const patientB = await fx.patient();
    const relativeId = await booking.relative(patientA.account.taiKhoanId);
    const proposer = await fx.admin(branch);
    const sysAdmin = await fx.admin();
    const shifts: Record<string, LichLamViec> = {};
    const shiftOf = async (ngay: string) =>
      (shifts[ngay] ??= await fx.shift(doctor.profile, { ngay, ca: 'CaSang' }));
    const book = async (
      at: string,
      patientId: string,
      maLichHen: string,
      hoSoNguoiThanId: string | null = null,
    ) => {
      const ngay = at.slice(0, 10);
      const slot = await fx.slot(await shiftOf(ngay), {
        ngayGio: new Date(`${at.replace(' ', 'T')}+07:00`),
        trangThai: 'DaDat',
      });
      return fx.appointment(doctor.profile, slot, patientId, {
        maLichHen,
        hoSoNguoiThanId,
      });
    };
    const a1 = await book(
      '2026-11-09 09:00:00',
      patientA.account.taiKhoanId,
      'LH-A1',
    );
    const a2 = await book(
      '2026-11-16 09:00:00',
      patientA.account.taiKhoanId,
      'LH-A2',
      relativeId,
    );
    const b1 = await book(
      '2026-11-16 10:00:00',
      patientB.account.taiKhoanId,
      'LH-B1',
    );
    /** Gửi form qua B8: Thứ Hai nghỉ (có ảnh hưởng ⇒ yêu cầu ChoDuyet). */
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
          diaChi: 'Địa chỉ A',
          lichHoatDong: schedule(true),
          dichVuKhamIds: [doctor.profile.dichVuKhamId],
        }),
      );
      if (!result.yeuCau) throw new Error('B8 phải tạo yêu cầu');
      return result.yeuCau.yeuCauThayDoiChiNhanhId;
    };
    return {
      branch,
      doctor,
      patientA,
      patientB,
      proposer,
      sysAdmin,
      a1,
      a2,
      b1,
      book,
      propose,
      sysId: sysAdmin.account.taiKhoanId,
    };
  }

  const requestRow = async (id: string) =>
    (
      (await db.query(
        `SELECT trang_thai AS trangThai, CAST(nguoi_duyet_id AS CHAR) AS nguoiDuyetId, so_ngay_bao_truoc AS soNgay,
                DATE_FORMAT(thoi_diem_duyet, '%Y-%m-%d %H:%i:%s') AS thoiDiemDuyet,
                DATE_FORMAT(hieu_luc_tu, '%Y-%m-%d %H:%i:%s') AS hieuLucTu, ap_dung_luc AS apDungLuc,
                CAST(dang_mo_chi_nhanh AS CHAR) AS dangMo
           FROM yeu_cau_thay_doi_chi_nhanh WHERE yeu_cau_thay_doi_chi_nhanh_id = ?`,
        [id],
      )) as Record<string, unknown>[]
    )[0];
  const snapshotRows = (id: string): Promise<Record<string, unknown>[]> =>
    db.query(
      `SELECT CAST(lich_hen_id AS CHAR) AS lichHenId, ly_do_anh_huong AS lyDo
         FROM yeu_cau_thay_doi_chi_nhanh_lich_hen WHERE yeu_cau_thay_doi_chi_nhanh_id = ? ORDER BY lich_hen_id`,
      [id],
    );
  const notifications = (): Promise<
    {
      taiKhoanId: string;
      loai: string;
      noiDung: string;
      thoiDiemTao: string;
      email: string | null;
    }[]
  > =>
    db.query(
      `SELECT CAST(t.tai_khoan_id AS CHAR) AS taiKhoanId, t.loai_su_kien AS loai, t.noi_dung AS noiDung,
              DATE_FORMAT(t.thoi_diem_tao, '%Y-%m-%d %H:%i:%s') AS thoiDiemTao, e.trang_thai AS email
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
  /** Số dòng các bảng duyệt KHÔNG được đụng (Q7, CN-69). */
  const untouched = async () =>
    (
      (await db.query(
        `SELECT (SELECT COUNT(*) FROM lich_hen WHERE trang_thai = 'DaXacNhan') AS lichHen,
                (SELECT COUNT(*) FROM khung_gio) AS khungGio, (SELECT COUNT(*) FROM lich_lam_viec) AS ca,
                (SELECT COUNT(*) FROM chi_nhanh_lich_hoat_dong WHERE thu_trong_tuan = 1 AND hoat_dong = 1) AS thuHaiHoatDong`,
      )) as Record<string, unknown>[]
    )[0];

  describe('duyệt thành công (CN b7–b9)', () => {
    it('CN-50, CN-52, CN-53, CN-64, CN-69, CN-99 duyệt khi còn lịch và ca ảnh hưởng: DaDuyet, chụp số ngày, bản chụp tại hieu_luc_tu, mỗi bệnh nhân một thông báo + thư, người đề xuất được báo, audit; chi nhánh chưa đổi', async () => {
      const w = await world();
      const id = await w.propose();
      const before = await untouched();
      const detail = await service.approve(system, w.sysId, id, EARLIEST);

      expect(await requestRow(id)).toEqual({
        trangThai: 'DaDuyet',
        nguoiDuyetId: w.sysId,
        soNgay: 3,
        thoiDiemDuyet: '2026-11-02 07:00:00',
        hieuLucTu: EARLIEST,
        apDungLuc: null,
        // DaDuyet chưa áp dụng vẫn là "yêu cầu đang mở" (Q3)
        dangMo: w.branch.chiNhanhId,
      });
      expect(detail).toMatchObject({
        trangThai: 'DaDuyet',
        hieuLucTu: EARLIEST,
        apDungLuc: null,
        soNgayBaoTruoc: 3,
        nguoiDuyet: { taiKhoanId: w.sysId },
        anhHuong: { nguon: 'TinhLai', moc: EARLIEST, lichHen: { tong: 3 } },
        thongBao: { tongHop: { ChoGui: 3 } },
      });
      expect(await snapshotRows(id)).toEqual(
        [w.a1, w.a2, w.b1].map((a) => ({
          lichHenId: String(a.lichHenId),
          lyDo: 'NgayNghi',
        })),
      );

      const sent = await notifications();
      expect(sent.map((n) => [n.taiKhoanId, n.loai, n.email])).toEqual([
        [
          w.patientA.account.taiKhoanId,
          'ThayDoiChiNhanhAnhHuongLichHen:v1',
          'ChoGui',
        ],
        [
          w.patientB.account.taiKhoanId,
          'ThayDoiChiNhanhAnhHuongLichHen:v1',
          'ChoGui',
        ],
        [
          w.proposer.account.taiKhoanId,
          'KetQuaYeuCauThayDoiChiNhanh',
          'ChoGui',
        ],
      ]);
      // CN-52: lịch của hồ sơ người thân gom vào chủ tài khoản, theo thời gian
      expect(sent[0]?.noiDung).toBe(
        'Chi nhánh Chi nhánh A thay đổi lịch hoạt động từ 07:00 05/11/2026. Lịch hẹn bị ảnh hưởng: LH-A1, LH-A2.',
      );
      expect(sent[1]?.noiDung).toContain('Lịch hẹn bị ảnh hưởng: LH-B1.');
      expect(sent[2]?.noiDung).toContain(
        'đã được duyệt, dự kiến có hiệu lực từ 07:00 05/11/2026.',
      );
      // CN-50: thông báo luôn tạo trước hiệu lực
      for (const n of sent) expect(n.thoiDiemTao < EARLIEST).toBe(true);

      expect(await auditRows()).toEqual([
        {
          actor: w.sysId,
          branch: w.branch.chiNhanhId,
          action: 'DuyetThayDoiChiNhanh',
          target: id,
          changes: {
            hieu_luc_tu: '2026-11-05T07:00:00+07:00',
            so_ngay_bao_truoc: 3,
            nguoi_de_xuat_id: w.proposer.account.taiKhoanId,
            so_lich_hen_anh_huong: 3,
            so_ca_anh_huong: 2,
          },
        },
      ]);
      // CN-69: không hủy, đổi, xoá gì; lịch Thứ Hai vẫn hoạt động (B11 mới áp dụng)
      expect(await untouched()).toEqual(before);
    });

    it('CN-59 tại hieu_luc_tu không còn lịch hẹn ảnh hưởng ⇒ vẫn duyệt, chỉ người đề xuất được báo, bản chụp rỗng', async () => {
      const w = await world();
      const id = await w.propose();
      // Hiệu lực Thứ Ba 17/11: mọi lịch hẹn và ca Thứ Hai đều trước mốc
      await service.approve(system, w.sysId, id, '2026-11-17 00:00:00');
      expect((await requestRow(id))?.trangThai).toBe('DaDuyet');
      expect(await snapshotRows(id)).toEqual([]);
      const sent = await notifications();
      expect(sent.map((n) => n.taiKhoanId)).toEqual([
        w.proposer.account.taiKhoanId,
      ]);
      expect((await auditRows())[0]?.changes).toMatchObject({
        so_lich_hen_anh_huong: 0,
        so_ca_anh_huong: 0,
      });
    });

    it('CN-54 lịch hẹn bị hủy giữa lúc đề xuất và lúc duyệt ⇒ không có trong bản chụp, chủ lịch không được báo', async () => {
      const w = await world();
      const id = await w.propose();
      await db.query(
        "UPDATE lich_hen SET trang_thai = 'DaHuy' WHERE lich_hen_id = ?",
        [w.b1.lichHenId],
      );
      await service.approve(system, w.sysId, id, EARLIEST);
      expect((await snapshotRows(id)).map((r) => r.lichHenId)).toEqual([
        String(w.a1.lichHenId),
        String(w.a2.lichHenId),
      ]);
      expect((await notifications()).map((n) => n.taiKhoanId)).not.toContain(
        w.patientB.account.taiKhoanId,
      );
    });

    it('CN-52 một bệnh nhân rất nhiều lịch ⇒ một thông báo ≤ 500 ký tự, cắt bằng "và N lịch khác"', async () => {
      const w = await world();
      // 30 lịch nữa ca sáng Thứ Hai 23/11 của bệnh nhân A, cách nhau 5 phút
      for (let i = 0; i < 30; i += 1) {
        const minute = String(i * 5).padStart(2, '0');
        const hour = 8 + Math.floor((i * 5) / 60);
        await w.book(
          `2026-11-23 ${String(hour).padStart(2, '0')}:${String((i * 5) % 60).padStart(2, '0')}:00`,
          w.patientA.account.taiKhoanId,
          `LH-MANY-${String(i).padStart(2, '0')}-${minute}`,
        );
      }
      const id = await w.propose();
      await service.approve(system, w.sysId, id, EARLIEST);
      const mine = (await notifications()).filter(
        (n) => n.taiKhoanId === w.patientA.account.taiKhoanId,
      );
      expect(mine).toHaveLength(1);
      expect(mine[0]?.noiDung.length).toBeLessThanOrEqual(500);
      expect(mine[0]?.noiDung).toMatch(/và \d+ lịch khác\.$/);
    });

    it('CN-57 Q4: Toàn hệ thống tự duyệt yêu cầu của chính mình ⇒ được', async () => {
      const w = await world();
      const id = await w.propose({ scope: system, actorId: w.sysId });
      const detail = await service.approve(system, w.sysId, id, EARLIEST);
      expect(detail.nguoiDeXuat.taiKhoanId).toBe(w.sysId);
      expect(detail.nguoiDuyet?.taiKhoanId).toBe(w.sysId);
    });

    it('CN-63 người đề xuất đã bị khoá ⇒ vẫn duyệt được, vẫn có thông báo cho người đó', async () => {
      const w = await world();
      const id = await w.propose();
      await db.query(
        "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
        [w.proposer.account.taiKhoanId],
      );
      await service.approve(system, w.sysId, id, EARLIEST);
      expect((await requestRow(id))?.trangThai).toBe('DaDuyet');
      expect((await notifications()).map((n) => n.taiKhoanId)).toContain(
        w.proposer.account.taiKhoanId,
      );
    });

    it('YCB-12 chi tiết sau duyệt tính lại tại hieu_luc_tu; sau khi áp dụng đọc bản chụp THẬT do B10 ghi', async () => {
      const w = await world();
      const id = await w.propose();
      await service.approve(system, w.sysId, id, EARLIEST);
      await db.query(
        "UPDATE yeu_cau_thay_doi_chi_nhanh SET ap_dung_luc = '2026-11-05 07:01:00' WHERE yeu_cau_thay_doi_chi_nhanh_id = ?",
        [id],
      );
      // Lịch hẹn bị hủy sau khi duyệt vẫn nằm trong bản chụp (không tính lại)
      await db.query(
        "UPDATE lich_hen SET trang_thai = 'DaHuy' WHERE lich_hen_id = ?",
        [w.a1.lichHenId],
      );
      expect((await service.get(system, id)).anhHuong).toMatchObject({
        nguon: 'BanChup',
        lichHen: { tong: 3 },
      });
    });
  });

  describe('từ chối duyệt', () => {
    it('CN-51 biên hieu_luc_tu: sớm hơn mốc 1 giây, ở quá khứ ⇒ HIEU_LUC_QUA_SOM kèm mốc sớm nhất; vẫn ChoDuyet', async () => {
      const w = await world();
      const id = await w.propose();
      for (const at of ['2026-11-05 06:59:59', '2026-11-01 07:00:00']) {
        expect(await codeOf(service.approve(system, w.sysId, id, at))).toEqual({
          status: 400,
          maLoi: 'HIEU_LUC_QUA_SOM',
        });
      }
      const error = await service
        .approve(system, w.sysId, id, '2026-11-05 06:59:59')
        .catch((e: unknown) => e as AppException);
      expect((error as AppException).getResponse()).toMatchObject({
        chiTiet: { mocSomNhat: EARLIEST },
        thongBao: 'Thời điểm có hiệu lực phải từ 07:00 05/11/2026 trở đi.',
      });
      expect((await requestRow(id))?.trangThai).toBe('ChoDuyet');
      expect(await notifications()).toEqual([]);
    });

    it('CN-51 quyết định 1: báo trước 0 ngày ⇒ đúng lúc duyệt bị từ chối, sau 1 giây thì nhận', async () => {
      const w = await world();
      await booking.systemConfig({ soNgayBaoTruocDoiGioLam: 0 });
      const id = await w.propose();
      expect(
        await codeOf(
          service.approve(system, w.sysId, id, '2026-11-02 07:00:00'),
        ),
      ).toEqual({ status: 400, maLoi: 'HIEU_LUC_QUA_SOM' });
      await service.approve(system, w.sysId, id, '2026-11-02 07:00:01');
      expect(await requestRow(id)).toMatchObject({
        trangThai: 'DaDuyet',
        soNgay: 0,
        hieuLucTu: '2026-11-02 07:00:01',
      });
    });

    it('CN-55 chưa có cấu hình ⇒ 409 HE_THONG_CHUA_CAU_HINH, không duyệt', async () => {
      const w = await world({ config: false });
      const id = await w.propose();
      expect(
        await codeOf(service.approve(system, w.sysId, id, EARLIEST)),
      ).toEqual({ status: 409, maLoi: 'HE_THONG_CHUA_CAU_HINH' });
      expect((await requestRow(id))?.trangThai).toBe('ChoDuyet');
    });

    it('CN-56 Quản trị viên Chi nhánh duyệt ⇒ 403, vẫn ChoDuyet', async () => {
      const w = await world();
      const id = await w.propose();
      expect(
        await codeOf(
          service.approve(
            scopeOf(w.branch),
            w.proposer.account.taiKhoanId,
            id,
            EARLIEST,
          ),
        ),
      ).toEqual({ status: 403, maLoi: 'KHONG_DU_QUYEN' });
      expect((await requestRow(id))?.trangThai).toBe('ChoDuyet');
    });

    it('CN-58 duyệt yêu cầu đã duyệt hay đã từ chối ⇒ 409; không tồn tại ⇒ 404; không thông báo trùng', async () => {
      const w = await world();
      const id = await w.propose();
      await service.approve(system, w.sysId, id, EARLIEST);
      const count = (await notifications()).length;
      expect(
        await codeOf(service.approve(system, w.sysId, id, EARLIEST)),
      ).toEqual({ status: 409, maLoi: 'YEU_CAU_KHONG_CON_CHO_DUYET' });
      expect(await codeOf(service.reject(system, w.sysId, id, 'x'))).toEqual({
        status: 409,
        maLoi: 'YEU_CAU_KHONG_CON_CHO_DUYET',
      });
      expect(
        await codeOf(service.approve(system, w.sysId, '999999', EARLIEST)),
      ).toEqual({ status: 404, maLoi: 'KHONG_TIM_THAY' });
      expect(await notifications()).toHaveLength(count);
      expect(await auditRows()).toHaveLength(1);
    });

    it('CN-58 hai lần duyệt đồng thời ⇒ một thành công, một 409; bản chụp, thông báo, audit chỉ một lần', async () => {
      const w = await world();
      const id = await w.propose();
      const results = await Promise.allSettled([
        service.approve(system, w.sysId, id, EARLIEST),
        service.approve(system, w.sysId, id, '2026-11-06 07:00:00'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failed = results.find(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      if (!failed) throw new Error('mong đợi một lần duyệt thất bại');
      expect((failed.reason as AppException).maLoi).toBe(
        'YEU_CAU_KHONG_CON_CHO_DUYET',
      );
      expect(await snapshotRows(id)).toHaveLength(3);
      expect(await notifications()).toHaveLength(3);
      expect(await auditRows()).toHaveLength(1);
    });

    it('CN-58 duyệt đồng thời với từ chối ⇒ đúng một bên thắng, không trạng thái lai', async () => {
      const w = await world();
      const id = await w.propose();
      const results = await Promise.allSettled([
        service.approve(system, w.sysId, id, EARLIEST),
        service.reject(system, w.sysId, id, 'Không hợp lý'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const row = await requestRow(id);
      const actions = (await auditRows()).map((r) => r.action);
      if (row?.trangThai === 'DaDuyet') {
        expect(actions).toEqual(['DuyetThayDoiChiNhanh']);
        expect(await snapshotRows(id)).toHaveLength(3);
      } else {
        expect(row?.trangThai).toBe('TuChoi');
        expect(actions).toEqual(['TuChoiThayDoiChiNhanh']);
        expect(await snapshotRows(id)).toEqual([]);
        expect(await notifications()).toHaveLength(1);
      }
    });

    it('YCB-11 ghi audit lỗi ⇒ hoàn tác quyết định, bản chụp và thông báo', async () => {
      const w = await world();
      const id = await w.propose();
      vi.spyOn(audit, 'record').mockRejectedValueOnce(
        new Error('AUDIT_WRITE_FAILED'),
      );
      await expect(
        service.approve(system, w.sysId, id, EARLIEST),
      ).rejects.toThrow();
      expect((await requestRow(id))?.trangThai).toBe('ChoDuyet');
      expect(await snapshotRows(id)).toEqual([]);
      expect(await notifications()).toEqual([]);
    });

    it('YCB-13 nội dung dạng cũ gio_mo_cua/gio_dong_cua ⇒ 409 NOI_DUNG_YEU_CAU_KHONG_HOP_LE, vẫn ChoDuyet', async () => {
      const w = await world();
      const inserted = (await db.query(
        `INSERT INTO yeu_cau_thay_doi_chi_nhanh (chi_nhanh_id, nguoi_de_xuat_id, noi_dung_truoc, noi_dung_sau)
         VALUES (?, ?, JSON_OBJECT('lich_hoat_dong', JSON_ARRAY(JSON_OBJECT('thu_trong_tuan', 1, 'hoat_dong', true, 'gio_mo_cua', '08:00:00', 'gio_dong_cua', '17:00:00'))),
                 JSON_OBJECT('lich_hoat_dong', JSON_ARRAY(JSON_OBJECT('thu_trong_tuan', 1, 'hoat_dong', false, 'gio_mo_cua', NULL, 'gio_dong_cua', NULL))))`,
        [w.branch.chiNhanhId, w.proposer.account.taiKhoanId],
      )) as { insertId: number };
      const id = String(inserted.insertId);
      expect(
        await codeOf(service.approve(system, w.sysId, id, EARLIEST)),
      ).toEqual({ status: 409, maLoi: 'NOI_DUNG_YEU_CAU_KHONG_HOP_LE' });
      expect((await requestRow(id))?.trangThai).toBe('ChoDuyet');
    });
  });

  it('CN-74 gọi lại notifier cho cùng yêu cầu, cùng người, cùng loại ⇒ không tạo thông báo trùng', async () => {
    const w = await world();
    const id = await w.propose();
    await service.approve(system, w.sysId, id, EARLIEST);
    const before = await notifications();
    const again = await db.transaction((em) =>
      notifier.notify(em, {
        yeuCauId: id,
        taiKhoanId: w.patientA.account.taiKhoanId,
        event: { type: BRANCH_CHANGE_EVENTS.AFFECTED, version: 1 },
        noiDung: 'Lần hai',
        now: NOW,
      }),
    );
    expect(again).toEqual({ kind: 'AlreadyExists' });
    expect(await notifications()).toEqual(before);
  });

  describe('getPendingEffectiveChanges cho booking (Q6)', () => {
    it('CN-65, CN-88 trả DaDuyet chưa áp dụng (cả quá hạn), không trả ChoDuyet, TuChoi, đã áp dụng, chi nhánh khác', async () => {
      const w = await world();
      const reader = new PendingBranchChangesReader();
      const pending = () =>
        reader.getPendingEffectiveChanges(db.manager, w.branch.chiNhanhId);

      const id = await w.propose();
      expect(await pending()).toEqual([]); // ChoDuyet: chưa chặn
      await service.approve(system, w.sysId, id, EARLIEST);
      const approved = await pending();
      expect(approved).toEqual([
        {
          yeuCauThayDoiChiNhanhId: id,
          hieuLucTu: new Date('2026-11-05T07:00:00+07:00'),
          quaHan: false,
          lichHoatDong: [
            {
              thuTrongTuan: 1,
              hoatDong: false,
              gioBatDauSang: null,
              gioKetThucSang: null,
              gioBatDauChieu: null,
              gioKetThucChieu: null,
            },
          ],
          dichVuBoIds: [],
        },
      ]);
      // CN-108: quá hạn vẫn chặn
      await db.query(
        "UPDATE yeu_cau_thay_doi_chi_nhanh SET qua_han_luc = '2026-11-05 07:00:00' WHERE yeu_cau_thay_doi_chi_nhanh_id = ?",
        [id],
      );
      expect((await pending())[0]?.quaHan).toBe(true);
      // Chi nhánh khác không thấy
      const other = await fx.branch();
      expect(
        await reader.getPendingEffectiveChanges(db.manager, other.chiNhanhId),
      ).toEqual([]);
      // Đã áp dụng: hết chặn
      await db.query(
        "UPDATE yeu_cau_thay_doi_chi_nhanh SET qua_han_luc = NULL, ap_dung_luc = '2026-11-05 07:01:00' WHERE yeu_cau_thay_doi_chi_nhanh_id = ?",
        [id],
      );
      expect(await pending()).toEqual([]);
      // TuChoi không chặn
      const rejected = await w.propose();
      await service.reject(system, w.sysId, rejected, 'Không');
      expect(await pending()).toEqual([]);
    });
  });
});
