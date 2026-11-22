import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { createOutbox } from '../../../appointments/testing/notification-world.js';
import { emptyEmailOutboxSummary } from '../../../appointments/notifications/email-outbox.service.js';
import { AuditRepository } from '../../../audit/audit.repository.js';
import { AuditService } from '../../../audit/audit.service.js';
import type { AppException } from '../../../common/errors/app.exception.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import { FakeMailService } from '../../../mail/testing/fake-mail.service.js';
import { BranchChangeNotifier } from '../../../notification/branch-change-notifier.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { UpdateBranchDto } from '../../branches/branch.dto.js';
import { BranchRepository } from '../../branches/branch.repository.js';
import { BranchService } from '../../branches/branch.service.js';
import { BranchImpactService } from '../../branches/impact/branch-impact.service.js';
import type { ChiNhanh } from '../../entities/chi-nhanh.entity.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { BranchChangeRequestListDto } from '../branch-change-request.dto.js';
import { BranchChangeRequestRepository } from '../branch-change-request.repository.js';
import { BranchChangeRequestService } from '../branch-change-request.service.js';

// Admin B9 — xem và từ chối yêu cầu thay đổi chi nhánh trên MySQL 8.4 THẬT (PLAN admin 5.4, 7.8; Q4, Q9, Q40, Q46). Thư qua FakeMailService, không thư thật.
// Đồng hồ ứng dụng giả: NOW = Thứ Hai 02/11/2026 07:00 giờ VN. "Thứ Hai tới" = 09/11/2026. Yêu cầu thật được tạo bằng B8 (chuyển Thứ Hai sang nghỉ).
const NOW = new Date('2026-11-02T07:00:00+07:00');
const NEXT_MONDAY = '2026-11-09';
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
const listDto = (over: Partial<BranchChangeRequestListDto> = {}) =>
  Object.assign(new BranchChangeRequestListDto(), over);
const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    const e = error as AppException;
    return { status: e.getStatus(), maLoi: e.maLoi };
  }
  throw new Error('mong đợi lỗi');
};

describe('B9 yêu cầu thay đổi chi nhánh — MySQL thật', () => {
  let db: DataSource;
  let audit: AuditService;
  let service: BranchChangeRequestService;
  let branches: BranchService;
  let fx: AdminFixtures;

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    const impact = new BranchImpactService();
    audit = new AuditService(new AuditRepository());
    service = new BranchChangeRequestService(
      new BranchChangeRequestRepository(db),
      new BranchAccessPolicy(),
      impact,
      new BranchChangeNotifier(),
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
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  afterAll(async () => db?.destroy());

  /** Chi nhánh có lịch hẹn DaXacNhan Thứ Hai tới 09:00 (ca sáng) và một khung giờ ConTrong 10:00. */
  async function world() {
    const branch = await fx.branch({ ten: 'Chi nhánh A', diaChi: 'Địa chỉ A' });
    await fx.weeklySchedule(branch.chiNhanhId);
    const doctor = await fx.doctor(branch);
    const patient = await fx.patient();
    const proposer = await fx.admin(branch);
    const sysAdmin = await fx.admin();
    const shift = await fx.shift(doctor.profile, {
      ngay: NEXT_MONDAY,
      ca: 'CaSang',
    });
    const slot = await fx.slot(shift, {
      ngayGio: new Date(`${NEXT_MONDAY}T09:00:00+07:00`),
      trangThai: 'DaDat',
    });
    const freeSlot = await fx.slot(shift, {
      ngayGio: new Date(`${NEXT_MONDAY}T10:00:00+07:00`),
      trangThai: 'ConTrong',
    });
    const appointment = await fx.appointment(
      doctor.profile,
      slot,
      patient.account.taiKhoanId,
    );
    /** Gửi form qua B8: đổi tên (lưu ngay) + Thứ Hai nghỉ (vào yêu cầu). */
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
          ten: 'Chi nhánh A mới',
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
      patient,
      proposer,
      sysAdmin,
      shift,
      freeSlot,
      appointment,
      propose,
    };
  }

  const requestRow = async (id: string) =>
    (
      (await db.query(
        `SELECT trang_thai AS trangThai, CAST(nguoi_duyet_id AS CHAR) AS nguoiDuyetId, ly_do_tu_choi AS lyDo,
                DATE_FORMAT(thoi_diem_duyet, '%Y-%m-%d %H:%i:%s') AS thoiDiemDuyet, dang_mo_chi_nhanh AS dangMo
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
                loai_doi_tuong AS targetType, CAST(ma_doi_tuong AS CHAR) AS target, ket_qua AS result, chi_tiet_thay_doi AS changes
           FROM nhat_ky_hanh_dong ORDER BY nhat_ky_hanh_dong_id`,
      )) as Record<string, unknown>[]
    ).map((row) => ({
      ...row,
      changes:
        typeof row.changes === 'string'
          ? (JSON.parse(row.changes) as unknown)
          : row.changes,
    }));
  const counts = async () =>
    (
      (await db.query(
        `SELECT (SELECT COUNT(*) FROM lich_hen WHERE trang_thai = 'DaXacNhan') AS lichHen,
                (SELECT COUNT(*) FROM khung_gio) AS khungGio, (SELECT COUNT(*) FROM lich_lam_viec) AS ca,
                (SELECT COUNT(*) FROM chi_nhanh_lich_hoat_dong WHERE thu_trong_tuan = 1 AND hoat_dong = 1) AS thuHaiHoatDong`,
      )) as Record<string, unknown>[]
    )[0];
  /** Đặt yêu cầu sang DaDuyet hợp lệ theo CHECK (B10 chưa có): duyệt lúc NOW, báo trước 3 ngày, hiệu lực `hieuLucTu`. */
  const markApproved = (
    id: string,
    approverId: string,
    hieuLucTu: string,
    apDungLuc: string | null = null,
  ) =>
    db.query(
      `UPDATE yeu_cau_thay_doi_chi_nhanh SET trang_thai = 'DaDuyet', nguoi_duyet_id = ?, thoi_diem_duyet = '2026-11-02 07:00:00',
              so_ngay_bao_truoc = 3, hieu_luc_tu = ?, ap_dung_luc = ? WHERE yeu_cau_thay_doi_chi_nhanh_id = ?`,
      [approverId, hieuLucTu, apDungLuc, id],
    );

  describe('chi tiết: ảnh hưởng theo trạng thái (Q46)', () => {
    it('CN-39 ChoDuyet ⇒ tính lại tại bây giờ: lịch hẹn, ca, khung giờ trống; không xoá/hủy gì', async () => {
      const w = await world();
      const id = await w.propose();
      const before = await counts();
      const detail = await service.get(system, id);
      expect(detail).toMatchObject({
        trangThai: 'ChoDuyet',
        chiNhanh: { chiNhanhId: w.branch.chiNhanhId, ten: 'Chi nhánh A mới' },
        nguoiDeXuat: { taiKhoanId: w.proposer.account.taiKhoanId },
        thuThayDoi: [1],
        coDoiDichVu: false,
        nguoiDuyet: null,
        anhHuong: {
          nguon: 'TinhLai',
          moc: '2026-11-02 07:00:00',
          lichHen: {
            tong: 1,
            items: [
              {
                lichHenId: String(w.appointment.lichHenId),
                thoiGian: `${NEXT_MONDAY} 09:00:00`,
                lyDoAnhHuong: 'NgayNghi',
              },
            ],
          },
          ca: {
            tong: 1,
            items: [{ lichLamViecId: String(w.shift.lichLamViecId) }],
          },
          khungGioTrong: {
            tong: 1,
            items: [{ khungGioId: String(w.freeSlot.khungGioId) }],
          },
        },
        thongBao: {
          tongHop: { ChoGui: 0, DaGui: 0, ThatBai: 0, BoQua: 0 },
          items: [],
        },
      });
      expect(detail.noiDung).toEqual({
        lichHoatDong: [
          {
            thuTrongTuan: 1,
            truoc: {
              hoatDong: true,
              sang: { batDau: '08:00:00', ketThuc: '12:00:00' },
              chieu: { batDau: '13:00:00', ketThuc: '17:00:00' },
            },
            sau: { hoatDong: false, sang: null, chieu: null },
          },
        ],
        dichVu: null,
      });
      expect(await counts()).toEqual(before);
    });

    it('YCB-04 ChoDuyet tính lại mỗi lần xem: lịch hẹn bị hủy sau lúc đề xuất không còn trong danh sách', async () => {
      const w = await world();
      const id = await w.propose();
      await db.query(
        "UPDATE lich_hen SET trang_thai = 'DaHuy' WHERE lich_hen_id = ?",
        [w.appointment.lichHenId],
      );
      expect((await service.get(system, id)).anhHuong.lichHen).toEqual({
        items: [],
        tong: 0,
      });
    });

    it('YCB-05 DaDuyet chưa áp dụng ⇒ tính lại tại hieu_luc_tu; đã áp dụng ⇒ bản chụp; TuChoi ⇒ không có', async () => {
      const w = await world();
      const id = await w.propose();
      // Hiệu lực 16/11: lịch hẹn và ca ngày 09/11 nằm trước mốc nên không tính
      await markApproved(
        id,
        w.sysAdmin.account.taiKhoanId,
        '2026-11-16 00:00:00',
      );
      expect((await service.get(system, id)).anhHuong).toMatchObject({
        nguon: 'TinhLai',
        moc: '2026-11-16 00:00:00',
        lichHen: { tong: 0 },
        ca: { tong: 0 },
      });
      // Đã áp dụng: đọc bảng chụp lúc duyệt, không tính lại
      await markApproved(
        id,
        w.sysAdmin.account.taiKhoanId,
        '2026-11-16 00:00:00',
        '2026-11-16 00:01:00',
      );
      await db.query(
        "INSERT INTO yeu_cau_thay_doi_chi_nhanh_lich_hen (yeu_cau_thay_doi_chi_nhanh_id, lich_hen_id, ly_do_anh_huong) VALUES (?, ?, 'NgayNghi')",
        [id, w.appointment.lichHenId],
      );
      expect((await service.get(system, id)).anhHuong).toEqual({
        nguon: 'BanChup',
        moc: null,
        lichHen: {
          tong: 1,
          items: [
            {
              lichHenId: String(w.appointment.lichHenId),
              maLichHen: w.appointment.maLichHen,
              thoiGian: `${NEXT_MONDAY} 09:00:00`,
              lyDoAnhHuong: 'NgayNghi',
            },
          ],
        },
        ca: null,
        khungGioTrong: null,
      });
    });

    it('CN-87 yêu cầu lịch sử dạng cũ gio_mo_cua/gio_dong_cua hiển thị được; ChoDuyet dạng cũ ⇒ KhongTinhDuoc', async () => {
      const w = await world();
      const other = await fx.branch();
      const old = (status: 'TuChoi' | 'ChoDuyet', branchId: string) =>
        db.query(
          `INSERT INTO yeu_cau_thay_doi_chi_nhanh (chi_nhanh_id, nguoi_de_xuat_id, noi_dung_truoc, noi_dung_sau, trang_thai, nguoi_duyet_id, thoi_diem_duyet, ly_do_tu_choi)
           VALUES (?, ?, JSON_OBJECT('lich_hoat_dong', JSON_ARRAY(JSON_OBJECT('thu_trong_tuan', 1, 'hoat_dong', true, 'gio_mo_cua', '08:00:00', 'gio_dong_cua', '17:00:00'))),
                   JSON_OBJECT('lich_hoat_dong', JSON_ARRAY(JSON_OBJECT('thu_trong_tuan', 1, 'hoat_dong', false, 'gio_mo_cua', NULL, 'gio_dong_cua', NULL))), ?, ?, ?, ?)`,
          status === 'TuChoi'
            ? [
                branchId,
                w.proposer.account.taiKhoanId,
                status,
                w.sysAdmin.account.taiKhoanId,
                '2026-10-01 08:00:00',
                'Cũ',
              ]
            : [
                branchId,
                w.proposer.account.taiKhoanId,
                status,
                null,
                null,
                null,
              ],
        ) as Promise<{ insertId: number }>;
      const history = await service.get(
        system,
        String((await old('TuChoi', w.branch.chiNhanhId)).insertId),
      );
      expect(history.anhHuong.nguon).toBe('KhongCo');
      expect(history.noiDung.lichHoatDong[0]?.truoc?.dangCu).toEqual({
        gioMoCua: '08:00:00',
        gioDongCua: '17:00:00',
      });
      const pending = await service.get(
        system,
        String((await old('ChoDuyet', other.chiNhanhId)).insertId),
      );
      expect(pending.anhHuong).toMatchObject({
        nguon: 'KhongTinhDuoc',
        lichHen: null,
      });
    });
  });

  describe('danh sách và phạm vi (Q40)', () => {
    it('YCB-01 Chi nhánh chỉ thấy yêu cầu chi nhánh mình (kể cả gửi chiNhanhId khác); Toàn hệ thống lọc chi nhánh, trạng thái; mới nhất trước; phân trang', async () => {
      const w = await world();
      const other = await fx.branch({ ten: 'Chi nhánh B' });
      const insert = (branchId: string, at: string, status = 'ChoDuyet') =>
        db.query(
          `INSERT INTO yeu_cau_thay_doi_chi_nhanh (chi_nhanh_id, nguoi_de_xuat_id, noi_dung_truoc, noi_dung_sau, trang_thai, thoi_diem_tao, nguoi_duyet_id, thoi_diem_duyet, ly_do_tu_choi)
           VALUES (?, ?, JSON_OBJECT('lich_hoat_dong', JSON_ARRAY()), JSON_OBJECT('lich_hoat_dong', JSON_ARRAY(), 'dich_vu_kham_ids', JSON_ARRAY('1')), ?, ?, ?, ?, ?)`,
          status === 'TuChoi'
            ? [
                branchId,
                w.proposer.account.taiKhoanId,
                status,
                at,
                w.sysAdmin.account.taiKhoanId,
                at,
                'Lý do',
              ]
            : [
                branchId,
                w.proposer.account.taiKhoanId,
                status,
                at,
                null,
                null,
                null,
              ],
        ) as Promise<{ insertId: number }>;
      const a1 = (
        await insert(w.branch.chiNhanhId, '2026-10-01 08:00:00', 'TuChoi')
      ).insertId;
      const a2 = (await insert(w.branch.chiNhanhId, '2026-10-05 08:00:00'))
        .insertId;
      const b1 = (await insert(other.chiNhanhId, '2026-10-03 08:00:00'))
        .insertId;

      const mine = await service.list(
        scopeOf(w.branch),
        listDto({ chiNhanhId: other.chiNhanhId }),
      );
      expect(mine.items.map((i) => i.yeuCauThayDoiChiNhanhId)).toEqual([
        String(a2),
        String(a1),
      ]);
      expect(mine.total).toBe(2);
      expect(mine.items[0]).toMatchObject({
        coDoiDichVu: true,
        thuThayDoi: [],
      });

      const all = await service.list(system, listDto());
      expect(all.items.map((i) => i.yeuCauThayDoiChiNhanhId)).toEqual([
        String(a2),
        String(b1),
        String(a1),
      ]);
      expect(
        (await service.list(system, listDto({ chiNhanhId: other.chiNhanhId })))
          .total,
      ).toBe(1);
      const rejected = await service.list(
        system,
        listDto({ trangThai: 'TuChoi' }),
      );
      expect(rejected.items.map((i) => i.yeuCauThayDoiChiNhanhId)).toEqual([
        String(a1),
      ]);
      const page2 = await service.list(
        system,
        listDto({ page: 2, pageSize: 1 }),
      );
      expect(page2).toMatchObject({ total: 3, page: 2, pageSize: 1 });
      expect(page2.items.map((i) => i.yeuCauThayDoiChiNhanhId)).toEqual([
        String(b1),
      ]);

      // Chi tiết ngoài phạm vi và không tồn tại: cùng 404
      expect(await codeOf(service.get(scopeOf(w.branch), String(b1)))).toEqual({
        status: 404,
        maLoi: 'KHONG_TIM_THAY',
      });
      expect(await codeOf(service.get(system, '999999'))).toEqual({
        status: 404,
        maLoi: 'KHONG_TIM_THAY',
      });
      await expect(
        service.get(scopeOf(w.branch), String(a2)),
      ).resolves.toBeDefined();
    });
  });

  describe('từ chối (CN A2)', () => {
    it('CN-60, CN-27b, CN-99 từ chối có lý do: TuChoi; người gửi nhận thông báo + thư; bệnh nhân không; chi nhánh giữ nguyên, tên đã lưu giữ nguyên; audit cùng giao dịch', async () => {
      const w = await world();
      const id = await w.propose();
      const sysId = w.sysAdmin.account.taiKhoanId;
      const detail = await service.reject(
        system,
        sysId,
        id,
        'Thiếu bác sĩ thay thế',
      );
      expect(detail).toMatchObject({
        trangThai: 'TuChoi',
        lyDoTuChoi: 'Thiếu bác sĩ thay thế',
        nguoiDuyet: { taiKhoanId: sysId },
        thoiDiemDuyet: '2026-11-02 07:00:00',
        anhHuong: { nguon: 'KhongCo' },
        thongBao: { tongHop: { ChoGui: 1 } },
      });
      expect(await requestRow(id)).toEqual({
        trangThai: 'TuChoi',
        nguoiDuyetId: sysId,
        lyDo: 'Thiếu bác sĩ thay thế',
        thoiDiemDuyet: '2026-11-02 07:00:00',
        dangMo: null,
      });
      const sent = await notifications();
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        taiKhoanId: w.proposer.account.taiKhoanId,
        loai: 'KetQuaYeuCauThayDoiChiNhanh',
        email: 'ChoGui',
      });
      expect(sent[0]?.noiDung).toContain(
        'đã bị từ chối. Lý do: Thiếu bác sĩ thay thế.',
      );
      expect(sent[0]?.noiDung).toContain('Chi nhánh A mới');
      // CN-27b: tên lưu ngay ở B8 không bị hoàn lại; lịch Thứ Hai vẫn như cũ
      expect((await branches.get(system, w.branch.chiNhanhId)).ten).toBe(
        'Chi nhánh A mới',
      );
      expect((await counts())?.thuHaiHoatDong).toBe('1');
      expect(await auditRows()).toEqual([
        {
          actor: sysId,
          branch: w.branch.chiNhanhId,
          action: 'TuChoiThayDoiChiNhanh',
          targetType: 'yeu_cau_thay_doi_chi_nhanh',
          target: id,
          result: 'ThanhCong',
          changes: {
            ly_do_tu_choi: 'Thiếu bác sĩ thay thế',
            nguoi_de_xuat_id: w.proposer.account.taiKhoanId,
          },
        },
      ]);
      // Q3: hết yêu cầu đang mở ⇒ chi nhánh gửi được yêu cầu mới
      await expect(w.propose()).resolves.toBeDefined();
    });

    it('CN-56 Quản trị viên Chi nhánh từ chối ⇒ 403, yêu cầu vẫn ChoDuyet', async () => {
      const w = await world();
      const id = await w.propose();
      expect(
        await codeOf(
          service.reject(
            scopeOf(w.branch),
            w.proposer.account.taiKhoanId,
            id,
            'x',
          ),
        ),
      ).toEqual({ status: 403, maLoi: 'KHONG_DU_QUYEN' });
      expect((await requestRow(id))?.trangThai).toBe('ChoDuyet');
    });

    it('CN-58 từ chối yêu cầu đã từ chối hay đã duyệt ⇒ 409 YEU_CAU_KHONG_CON_CHO_DUYET; không tồn tại ⇒ 404; không thông báo trùng', async () => {
      const w = await world();
      const sysId = w.sysAdmin.account.taiKhoanId;
      const id = await w.propose();
      await service.reject(system, sysId, id, 'Lần 1');
      expect(await codeOf(service.reject(system, sysId, id, 'Lần 2'))).toEqual({
        status: 409,
        maLoi: 'YEU_CAU_KHONG_CON_CHO_DUYET',
      });
      const approved = await w.propose();
      await markApproved(approved, sysId, '2026-11-16 00:00:00');
      expect(
        await codeOf(service.reject(system, sysId, approved, 'x')),
      ).toEqual({
        status: 409,
        maLoi: 'YEU_CAU_KHONG_CON_CHO_DUYET',
      });
      expect(
        await codeOf(service.reject(system, sysId, '999999', 'x')),
      ).toEqual({
        status: 404,
        maLoi: 'KHONG_TIM_THAY',
      });
      expect(await notifications()).toHaveLength(1);
      expect(await auditRows()).toHaveLength(1);
    });

    it('YCB-06 hai lần từ chối đồng thời ⇒ một thành công, một 409; một thông báo, một audit', async () => {
      const w = await world();
      const id = await w.propose();
      const sysId = w.sysAdmin.account.taiKhoanId;
      const results = await Promise.allSettled([
        service.reject(system, sysId, id, 'A'),
        service.reject(system, sysId, id, 'B'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failed = results.find(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      if (!failed) throw new Error('mong đợi một lần từ chối thất bại');
      expect((failed.reason as AppException).maLoi).toBe(
        'YEU_CAU_KHONG_CON_CHO_DUYET',
      );
      expect(await notifications()).toHaveLength(1);
      expect(await auditRows()).toHaveLength(1);
    });

    it('YCB-07 Q4: Toàn hệ thống tự từ chối yêu cầu của chính mình ⇒ được, người đề xuất = người duyệt', async () => {
      const w = await world();
      const sysId = w.sysAdmin.account.taiKhoanId;
      const id = await w.propose({ scope: system, actorId: sysId });
      const detail = await service.reject(
        system,
        sysId,
        id,
        'Tự rút lại đề xuất',
      );
      expect(detail.nguoiDeXuat.taiKhoanId).toBe(sysId);
      expect(detail.nguoiDuyet?.taiKhoanId).toBe(sysId);
    });

    it('YCB-08 ghi audit lỗi ⇒ hoàn tác cả quyết định và thông báo', async () => {
      const w = await world();
      const id = await w.propose();
      vi.spyOn(audit, 'record').mockRejectedValueOnce(
        new Error('AUDIT_WRITE_FAILED'),
      );
      await expect(
        service.reject(system, w.sysAdmin.account.taiKhoanId, id, 'x'),
      ).rejects.toThrow();
      expect((await requestRow(id))?.trangThai).toBe('ChoDuyet');
      expect(await notifications()).toEqual([]);
    });

    it('CN-62, CN-70b thư cho người gửi lỗi ⇒ quyết định không hoàn tác; chi tiết hiện ThatBai rồi DaGui sau khi gửi lại, không có chữ lỗi kỹ thuật', async () => {
      const w = await world();
      const id = await w.propose();
      await service.reject(system, w.sysAdmin.account.taiKhoanId, id, 'Lý do');
      const failing = createOutbox(
        db,
        new FakeMailService().failNextWith('CONNECTION'),
      );
      await failing.service.sweep(NOW, emptyEmailOutboxSummary());
      const afterFail = await service.get(scopeOf(w.branch), id);
      expect(afterFail.trangThai).toBe('TuChoi');
      expect(afterFail.thongBao.tongHop).toEqual({
        ChoGui: 0,
        DaGui: 0,
        ThatBai: 1,
        BoQua: 0,
      });
      expect(afterFail.thongBao.items[0]).toEqual({
        thongBaoId: expect.any(String),
        taiKhoanId: w.proposer.account.taiKhoanId,
        loaiSuKien: 'KetQuaYeuCauThayDoiChiNhanh',
        trangThaiEmail: 'ThatBai',
        soLanThu: 1,
        daGuiLuc: null,
      });
      // Thử lại sau 5 phút (Q9) thành công
      const later = new Date(NOW.getTime() + 6 * 60_000);
      const ok = createOutbox(db);
      await ok.service.sweep(later, emptyEmailOutboxSummary());
      expect(ok.mail.sent).toHaveLength(1);
      expect((await service.get(system, id)).thongBao.tongHop).toEqual({
        ChoGui: 0,
        DaGui: 1,
        ThatBai: 0,
        BoQua: 0,
      });
    });
  });
});
