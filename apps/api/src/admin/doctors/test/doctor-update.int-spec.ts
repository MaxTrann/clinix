import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AuditRepository } from '../../../audit/audit.repository.js';
import { AuditService } from '../../../audit/audit.service.js';
import type { AppException } from '../../../common/errors/app.exception.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import { ExamPriceReader } from '../../../pricing/exam-price.reader.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { UpdateBranchDto } from '../../branches/branch.dto.js';
import { BranchRepository } from '../../branches/branch.repository.js';
import { BranchService } from '../../branches/branch.service.js';
import { BranchImpactService } from '../../branches/impact/branch-impact.service.js';
import type { BacSi } from '../../entities/bac-si.entity.js';
import type { ChiNhanh } from '../../entities/chi-nhanh.entity.js';
import type { LichHen } from '../../entities/lich-hen.entity.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { UpdateDoctorProfileDto } from '../doctor.dto.js';
import { DoctorRepository } from '../doctor.repository.js';
import { DoctorUpdateRepository } from '../doctor-update.repository.js';
import { DoctorUpdateService } from '../doctor-update.service.js';

// Admin B13 — sửa hồ sơ bác sĩ trên MySQL 8.4 THẬT (PLAN admin 5.7, 7.3; Q17, Q18, Q19, Q39, Q40).
// Đồng hồ ứng dụng giả: NOW = Thứ Hai 02/11/2026 07:00 giờ VN ⇒ "hôm nay" = 2026-11-02.
const NOW = new Date('2026-11-02T07:00:00+07:00');
const TODAY = '2026-11-02';
const system: AdminScope = { kind: 'ToanHeThong' };
const scopeOf = (branch: ChiNhanh): AdminScope => ({
  kind: 'ChiNhanh',
  chiNhanhId: branch.chiNhanhId,
});
const errorOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    const e = error as AppException;
    if (typeof e.getStatus !== 'function') throw error;
    return {
      status: e.getStatus(),
      maLoi: e.maLoi,
      body: e.getResponse() as Record<string, unknown>,
    };
  }
  throw new Error('mong đợi lỗi');
};
const weekly = () =>
  Array.from({ length: 7 }, (_, i) => ({
    thuTrongTuan: i + 1,
    hoatDong: true,
    sang: { batDau: '08:00', ketThuc: '12:00' },
    chieu: { batDau: '13:00', ketThuc: '17:00' },
  }));

describe('B13 sửa hồ sơ bác sĩ — MySQL thật', () => {
  let db: DataSource;
  let audit: AuditService;
  let service: DoctorUpdateService;
  let branches: BranchService;
  let fx: AdminFixtures;

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    audit = new AuditService(new AuditRepository());
    service = new DoctorUpdateService(
      new DoctorUpdateRepository(db),
      new DoctorRepository(db, new ExamPriceReader(db)),
      new BranchAccessPolicy(),
      audit,
    );
    branches = new BranchService(
      new BranchRepository(db),
      new BranchAccessPolicy(),
      new BranchImpactService(),
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

  const link = (branchId: string, serviceId: string) =>
    db.query(
      'INSERT INTO chi_nhanh_dich_vu_kham (chi_nhanh_id, dich_vu_kham_id) VALUES (?, ?)',
      [branchId, serviceId],
    );

  /** Chi nhánh A có bác sĩ (dịch vụ S); chi nhánh B cũng có S; chi nhánh C không có S. */
  async function world() {
    const a = await fx.branch({ ten: 'Chi nhánh A' });
    const b = await fx.branch({ ten: 'Chi nhánh B' });
    const c = await fx.branch({ ten: 'Chi nhánh C' });
    const doctor = await fx.doctor(a, { moTaChuyenMon: 'Mô tả cũ' });
    await link(b.chiNhanhId, doctor.profile.dichVuKhamId);
    const patient = await fx.patient();
    const sysAdmin = await fx.admin();
    const branchAdmin = await fx.admin(a);
    /** Form đầy đủ dựng từ hồ sơ hiện tại (như giao diện gửi lên), sửa theo `over`. */
    const form = (over: Partial<UpdateDoctorProfileDto> = {}) =>
      Object.assign(new UpdateDoctorProfileDto(), {
        chuyenKhoaId: doctor.profile.chuyenKhoaId,
        chiNhanhId: doctor.profile.chiNhanhId,
        dichVuKhamId: doctor.profile.dichVuKhamId,
        chucDanh: doctor.profile.chucDanh,
        hocVi: doctor.profile.hocVi,
        soNamKinhNghiem: doctor.profile.soNamKinhNghiem,
        ...over,
      });
    let minute = 0;
    const shifts = new Map<string, Awaited<ReturnType<typeof fx.shift>>>();
    /** Lịch hẹn của `who` ngày `ngay` ở chi nhánh `branchId` (mặc định chi nhánh hiện tại của bác sĩ). */
    const book = async (
      trangThai: LichHen['trangThai'],
      over: { ngay?: string; who?: BacSi; branchId?: string } = {},
    ) => {
      const who = over.who ?? doctor.profile;
      const chiNhanhId = over.branchId ?? who.chiNhanhId;
      const ngay = over.ngay ?? '2026-11-10';
      // Một ca cho mỗi (bác sĩ, ngày): UNIQUE (bac_si_id, ngay, ca)
      const key = `${who.taiKhoanId}|${ngay}|${chiNhanhId}`;
      const shift =
        shifts.get(key) ??
        (await fx.shift(who, { ngay, ca: 'CaSang', chiNhanhId }));
      shifts.set(key, shift);
      minute += 1;
      const slot = await fx.slot(shift, {
        ngayGio: new Date(
          `${ngay}T08:${String(minute).padStart(2, '0')}:00+07:00`,
        ),
        trangThai: 'DaDat',
      });
      return fx.appointment(who, slot, patient.account.taiKhoanId, {
        trangThai,
        chiNhanhId,
      });
    };
    const profile = async () =>
      (
        (await db.query(
          `SELECT CAST(chi_nhanh_id AS CHAR) AS chiNhanhId, CAST(chuyen_khoa_id AS CHAR) AS chuyenKhoaId, CAST(dich_vu_kham_id AS CHAR) AS dichVuKhamId,
                  chuc_danh AS chucDanh, hoc_vi AS hocVi, so_nam_kinh_nghiem AS soNamKinhNghiem, mo_ta_chuyen_mon AS moTaChuyenMon
             FROM bac_si WHERE tai_khoan_id = ?`,
          [doctor.account.taiKhoanId],
        )) as Record<string, unknown>[]
      )[0];
    const update = (
      scope: AdminScope,
      body: UpdateDoctorProfileDto,
      actor = sysAdmin,
    ) =>
      service.update(
        scope,
        actor.account.taiKhoanId,
        doctor.account.taiKhoanId,
        body,
      );
    return {
      a,
      b,
      c,
      doctor,
      patient,
      sysAdmin,
      branchAdmin,
      form,
      book,
      profile,
      update,
    };
  }

  const auditRows = async () =>
    (
      (await db.query(
        `SELECT CAST(tai_khoan_id AS CHAR) AS actor, CAST(chi_nhanh_id AS CHAR) AS branch, hanh_dong AS action,
                loai_doi_tuong AS targetType, CAST(ma_doi_tuong AS CHAR) AS target, chi_tiet_thay_doi AS changes
           FROM nhat_ky_hanh_dong ORDER BY nhat_ky_hanh_dong_id`,
      )) as Record<string, unknown>[]
    ).map((row) => ({
      ...row,
      changes:
        typeof row.changes === 'string'
          ? (JSON.parse(row.changes) as unknown)
          : row.changes,
    }));

  describe('sửa hợp lệ', () => {
    it('BS-02, BS-45 sửa chuyên khoa, dịch vụ, chức danh, học vị, kinh nghiệm, mô tả ⇒ lưu hết; giá khám theo phụ phí mới; gia_snapshot lịch đã đặt giữ nguyên', async () => {
      const w = await world();
      const { specialty, service: other } = await fx.catalog();
      await link(w.a.chiNhanhId, other.dichVuKhamId);
      await db.query(
        "INSERT INTO phu_phi_bac_si (chuc_danh, so_nam_kinh_nghiem_tu, phu_phi, ap_dung) VALUES ('TS_BS', 5, '50000.00', 1)",
      );
      // Ca hôm qua: không chặn đổi dịch vụ (Q18 chỉ chặn ca từ hôm nay)
      const done = await w.book('HoanThanh', { ngay: '2026-11-01' });
      const saved = await w.update(
        system,
        w.form({
          chuyenKhoaId: specialty.chuyenKhoaId,
          dichVuKhamId: other.dichVuKhamId,
          chucDanh: 'TS_BS',
          hocVi: 'TS',
          soNamKinhNghiem: 10,
          moTaChuyenMon: 'Mô tả mới',
        }),
      );
      expect(saved).toMatchObject({
        chucDanh: 'TS_BS',
        hocVi: 'TS',
        soNamKinhNghiem: 10,
        moTaChuyenMon: 'Mô tả mới',
        chuyenKhoa: { chuyenKhoaId: specialty.chuyenKhoaId },
        dichVuKham: { dichVuKhamId: other.dichVuKhamId },
        giaMacDinh: '100000.00',
        phuPhi: '50000.00',
        giaKham: '150000.00',
      });
      expect(
        (
          (await db.query(
            'SELECT gia_snapshot AS g FROM lich_hen WHERE lich_hen_id = ?',
            [done.lichHenId],
          )) as { g: string }[]
        )[0]?.g,
      ).toBe('100000.00');
      expect(await auditRows()).toEqual([]);
    });

    it('BS-03 mô tả: bỏ trường giữ nguyên, null xoá', async () => {
      const w = await world();
      await w.update(system, w.form({ soNamKinhNghiem: 3 }));
      expect((await w.profile())?.moTaChuyenMon).toBe('Mô tả cũ');
      await w.update(system, w.form({ moTaChuyenMon: null }));
      expect((await w.profile())?.moTaChuyenMon).toBeNull();
    });

    it('HSS-03 form không đổi gì ⇒ 400 KHONG_CO_THAY_DOI, không audit', async () => {
      const w = await world();
      expect(
        await errorOf(w.update(system, w.form({ moTaChuyenMon: 'Mô tả cũ' }))),
      ).toMatchObject({
        status: 400,
        maLoi: 'KHONG_CO_THAY_DOI',
      });
    });

    it('BS-39 bác sĩ ChoKichHoat hay NgungHoatDong vẫn sửa được', async () => {
      const w = await world();
      // NgungHoatDong trước; ChoKichHoat phải không có mật khẩu băm (CHECK chk_tai_khoan_mat_khau)
      for (const trangThai of ['NgungHoatDong', 'ChoKichHoat']) {
        await db.query(
          "UPDATE tai_khoan SET trang_thai = ?, mat_khau_bam = IF(? = 'ChoKichHoat', NULL, mat_khau_bam) WHERE tai_khoan_id = ?",
          [trangThai, trangThai, w.doctor.account.taiKhoanId],
        );
        await expect(
          w.update(system, w.form({ moTaChuyenMon: `Mô tả ${trangThai}` })),
        ).resolves.toMatchObject({ trangThaiTaiKhoan: trangThai });
      }
    });
  });

  describe('dữ liệu tham chiếu (không lưu gì khi sai)', () => {
    it('BS-07 dịch vụ chính không có ở chi nhánh hiện tại ⇒ DICH_VU_KHONG_O_CHI_NHANH', async () => {
      const w = await world();
      const { service: other } = await fx.catalog();
      const before = await w.profile();
      expect(
        await errorOf(
          w.update(
            system,
            w.form({ dichVuKhamId: other.dichVuKhamId, soNamKinhNghiem: 9 }),
          ),
        ),
      ).toMatchObject({ status: 400, maLoi: 'DICH_VU_KHONG_O_CHI_NHANH' });
      expect(await w.profile()).toEqual(before);
    });

    it('BS-08, BS-20, BS-31 Toàn hệ thống đổi sang chi nhánh có dịch vụ ⇒ lưu + audit; ca cũ giữ chi nhánh cũ; sang chi nhánh không có dịch vụ ⇒ từ chối', async () => {
      const w = await world();
      const oldShift = await fx.shift(w.doctor.profile, { ngay: '2026-11-01' });
      expect(
        await errorOf(w.update(system, w.form({ chiNhanhId: w.c.chiNhanhId }))),
      ).toMatchObject({
        maLoi: 'DICH_VU_KHONG_O_CHI_NHANH',
      });
      const saved = await w.update(
        system,
        w.form({ chiNhanhId: w.b.chiNhanhId }),
      );
      expect(saved.chiNhanh.chiNhanhId).toBe(w.b.chiNhanhId);
      expect(
        (
          (await db.query(
            'SELECT CAST(chi_nhanh_id AS CHAR) AS c FROM lich_lam_viec WHERE lich_lam_viec_id = ?',
            [oldShift.lichLamViecId],
          )) as { c: string }[]
        )[0]?.c,
      ).toBe(w.a.chiNhanhId);
      expect(await auditRows()).toEqual([
        {
          actor: w.sysAdmin.account.taiKhoanId,
          branch: w.b.chiNhanhId,
          action: 'DoiChiNhanhBacSi',
          targetType: 'tai_khoan',
          target: w.doctor.account.taiKhoanId,
          changes: {
            truoc: { chi_nhanh_id: w.a.chiNhanhId },
            sau: { chi_nhanh_id: w.b.chiNhanhId },
          },
        },
      ]);
    });

    it('BS-09 chuyên khoa, chi nhánh, dịch vụ không tồn tại ⇒ 400, không lưu', async () => {
      const w = await world();
      const before = await w.profile();
      expect(
        await errorOf(w.update(system, w.form({ chuyenKhoaId: '999999' }))),
      ).toMatchObject({
        status: 400,
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        body: {
          loi: [{ truong: 'chuyenKhoaId', ma: 'CHUYEN_KHOA_KHONG_HOP_LE' }],
        },
      });
      expect(
        await errorOf(w.update(system, w.form({ chiNhanhId: '999999' }))),
      ).toMatchObject({
        status: 400,
        body: { loi: [{ truong: 'chiNhanhId', ma: 'CHI_NHANH_KHONG_HOP_LE' }] },
      });
      expect(
        await errorOf(w.update(system, w.form({ dichVuKhamId: '999999' }))),
      ).toMatchObject({
        status: 400,
        maLoi: 'DICH_VU_KHONG_O_CHI_NHANH',
      });
      expect(await w.profile()).toEqual(before);
    });

    it('BS-10 đổi sang chuyên khoa NgungHoatDong ⇒ từ chối; giữ chuyên khoa đã ngừng khi sửa trường khác ⇒ được', async () => {
      const w = await world();
      const { specialty } = await fx.catalog();
      await db.query(
        "UPDATE chuyen_khoa SET trang_thai_hoat_dong = 'NgungHoatDong' WHERE chuyen_khoa_id = ?",
        [specialty.chuyenKhoaId],
      );
      expect(
        await errorOf(
          w.update(system, w.form({ chuyenKhoaId: specialty.chuyenKhoaId })),
        ),
      ).toMatchObject({
        body: {
          loi: [{ truong: 'chuyenKhoaId', ma: 'CHUYEN_KHOA_KHONG_HOP_LE' }],
        },
      });
      await db.query(
        "UPDATE chuyen_khoa SET trang_thai_hoat_dong = 'NgungHoatDong' WHERE chuyen_khoa_id = ?",
        [w.doctor.profile.chuyenKhoaId],
      );
      await expect(
        w.update(system, w.form({ soNamKinhNghiem: 7 })),
      ).resolves.toMatchObject({
        soNamKinhNghiem: 7,
      });
    });
  });

  describe('chặn đổi chi nhánh và dịch vụ chính (BS A2, Q17, Q18)', () => {
    it.each(['ChoThanhToan', 'DaXacNhan', 'DaTiepDon'] as const)(
      'BS-21, BS-22, BS-23 còn lịch %s ⇒ DOI_CHI_NHANH_BI_CHAN kèm danh sách; mô tả gửi kèm cũng không lưu',
      async (trangThai) => {
        const w = await world();
        const appointment = await w.book(trangThai);
        const before = await w.profile();
        const result = await errorOf(
          w.update(
            system,
            w.form({ chiNhanhId: w.b.chiNhanhId, moTaChuyenMon: 'Mới' }),
          ),
        );
        expect(result).toMatchObject({
          status: 409,
          maLoi: 'DOI_CHI_NHANH_BI_CHAN',
          body: {
            chiTiet: {
              lichHen: {
                tong: 1,
                items: [
                  { lichHenId: String(appointment.lichHenId), trangThai },
                ],
              },
              ca: { tong: 1 },
            },
          },
        });
        expect(await w.profile()).toEqual(before);
        expect(await auditRows()).toEqual([]);
      },
    );

    it('BS-24, BS-28 chỉ còn lịch HoanThanh/DaHuy/VangMat/DaDoiLich ở ca hôm qua ⇒ không chặn', async () => {
      const w = await world();
      for (const trangThai of [
        'HoanThanh',
        'DaHuy',
        'VangMat',
        'DaDoiLich',
      ] as const)
        await w.book(trangThai, { ngay: '2026-11-01' });
      await expect(
        w.update(system, w.form({ chiNhanhId: w.b.chiNhanhId })),
      ).resolves.toBeDefined();
    });

    it('BS-25, BS-29 lịch của bác sĩ khác cùng chi nhánh; lịch và ca tương lai của bác sĩ này ở chi nhánh khác ⇒ không chặn', async () => {
      const w = await world();
      const other = await fx.doctor(w.a);
      await w.book('DaXacNhan', { who: other.profile });
      // Lịch hẹn và ca ở chi nhánh cũ hơn (B), không phải chi nhánh hiện tại (A)
      await w.book('DaXacNhan', { branchId: w.b.chiNhanhId });
      await expect(
        w.update(system, w.form({ chiNhanhId: w.b.chiNhanhId })),
      ).resolves.toBeDefined();
    });

    it('BS-26, BS-27 có ca hôm nay (kể cả đã qua giờ) hay ngày mai ⇒ chặn; BS-30 vừa lịch vừa ca ⇒ liệt kê cả hai', async () => {
      const w = await world();
      vi.setSystemTime(new Date('2026-11-02T20:00:00+07:00'));
      await fx.shift(w.doctor.profile, { ngay: TODAY, ca: 'CaSang' });
      const today = await errorOf(
        w.update(system, w.form({ chiNhanhId: w.b.chiNhanhId })),
      );
      expect(today).toMatchObject({
        maLoi: 'DOI_CHI_NHANH_BI_CHAN',
        body: {
          chiTiet: {
            lichHen: { tong: 0 },
            ca: { tong: 1, items: [{ ngay: TODAY }] },
          },
        },
      });
      await fx.shift(w.doctor.profile, { ngay: '2026-11-03', ca: 'CaSang' });
      await w.book('ChoThanhToan');
      expect(
        await errorOf(w.update(system, w.form({ chiNhanhId: w.b.chiNhanhId }))),
      ).toMatchObject({
        body: { chiTiet: { lichHen: { tong: 1 }, ca: { tong: 3 } } },
      });
    });

    it('BS-37 biên nửa đêm theo giờ VN: 23:59 ngày 01/11 thì ca 01/11 còn chặn; 00:01 ngày 02/11 thì không', async () => {
      const w = await world();
      await fx.shift(w.doctor.profile, { ngay: '2026-11-01', ca: 'CaChieu' });
      vi.setSystemTime(new Date('2026-11-01T23:59:00+07:00'));
      expect(
        await errorOf(w.update(system, w.form({ chiNhanhId: w.b.chiNhanhId }))),
      ).toMatchObject({
        maLoi: 'DOI_CHI_NHANH_BI_CHAN',
      });
      // 00:01 giờ VN = 17:01 UTC hôm trước: nếu so theo ngày UTC thì ca vẫn bị coi là "hôm nay"
      vi.setSystemTime(new Date('2026-11-02T00:01:00+07:00'));
      await expect(
        w.update(system, w.form({ chiNhanhId: w.b.chiNhanhId })),
      ).resolves.toBeDefined();
    });

    it('BS-44 đổi dịch vụ chính khi còn lịch hay ca, kể cả hai dịch vụ cùng thời lượng ⇒ DOI_DICH_VU_CHINH_BI_CHAN', async () => {
      const w = await world();
      const { service: same } = await fx.catalog(); // cùng 30 phút như dịch vụ cũ
      await link(w.a.chiNhanhId, same.dichVuKhamId);
      await w.book('DaXacNhan');
      expect(
        await errorOf(
          w.update(system, w.form({ dichVuKhamId: same.dichVuKhamId })),
        ),
      ).toMatchObject({
        status: 409,
        maLoi: 'DOI_DICH_VU_CHINH_BI_CHAN',
        body: { chiTiet: { lichHen: { tong: 1 }, ca: { tong: 1 } } },
      });
      // Đổi cả hai cùng lúc ⇒ mã của đổi chi nhánh
      await link(w.b.chiNhanhId, same.dichVuKhamId);
      expect(
        await errorOf(
          w.update(
            system,
            w.form({
              chiNhanhId: w.b.chiNhanhId,
              dichVuKhamId: same.dichVuKhamId,
            }),
          ),
        ),
      ).toMatchObject({ maLoi: 'DOI_CHI_NHANH_BI_CHAN' });
    });
  });

  describe('phạm vi và quyền (A3, Q40)', () => {
    it('BS-32 Chi nhánh đổi chiNhanhId ⇒ 403, mô tả gửi kèm cũng không lưu', async () => {
      const w = await world();
      const before = await w.profile();
      expect(
        await errorOf(
          w.update(
            scopeOf(w.a),
            w.form({ chiNhanhId: w.b.chiNhanhId, moTaChuyenMon: 'Mới' }),
            w.branchAdmin,
          ),
        ),
      ).toMatchObject({ status: 403, maLoi: 'KHONG_DU_QUYEN' });
      expect(await w.profile()).toEqual(before);
    });

    it('BS-33, BS-40 Chi nhánh sửa bác sĩ chi nhánh khác; id của Lễ tân, Quản trị viên, Bệnh nhân, không tồn tại ⇒ 404', async () => {
      const w = await world();
      const other = await fx.doctor(w.b);
      const body = w.form({ moTaChuyenMon: 'X' });
      expect(
        await errorOf(
          service.update(
            scopeOf(w.a),
            w.branchAdmin.account.taiKhoanId,
            other.account.taiKhoanId,
            body,
          ),
        ),
      ).toMatchObject({ status: 404, maLoi: 'KHONG_TIM_THAY' });
      const receptionist = await fx.receptionist(w.a);
      for (const id of [
        receptionist.account.taiKhoanId,
        w.sysAdmin.account.taiKhoanId,
        w.patient.account.taiKhoanId,
        '999999',
      ])
        expect(
          await errorOf(
            service.update(system, w.sysAdmin.account.taiKhoanId, id, body),
          ),
        ).toMatchObject({
          status: 404,
        });
    });

    it('BS-34, BS-35 Chi nhánh sửa bác sĩ của mình, gửi chiNhanhId bằng chi nhánh hiện tại ⇒ được, không audit', async () => {
      const w = await world();
      await expect(
        w.update(scopeOf(w.a), w.form({ soNamKinhNghiem: 12 }), w.branchAdmin),
      ).resolves.toMatchObject({
        soNamKinhNghiem: 12,
        chiNhanh: { chiNhanhId: w.a.chiNhanhId },
      });
      expect(await auditRows()).toEqual([]);
    });
  });

  describe('giao dịch và chạy đua', () => {
    it('BS-38 ghi audit lỗi khi đổi chi nhánh ⇒ hoàn tác cả hồ sơ', async () => {
      const w = await world();
      const before = await w.profile();
      vi.spyOn(audit, 'record').mockRejectedValueOnce(
        new Error('AUDIT_WRITE_FAILED'),
      );
      await expect(
        w.update(
          system,
          w.form({ chiNhanhId: w.b.chiNhanhId, moTaChuyenMon: 'Mới' }),
        ),
      ).rejects.toThrow('AUDIT_WRITE_FAILED');
      expect(await w.profile()).toEqual(before);
    });

    it('BS-36 đổi chi nhánh trong lúc booking đang giữ bac_si FOR SHARE và chèn lịch hẹn ⇒ chờ, rồi thấy lịch mới và bị chặn', async () => {
      const w = await world();
      const runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction('READ COMMITTED');
      try {
        await runner.query(
          'SELECT tai_khoan_id FROM bac_si WHERE tai_khoan_id = ? FOR SHARE',
          [w.doctor.account.taiKhoanId],
        );
        const inTx = new AdminFixtures(runner.manager);
        const shift = await inTx.shift(w.doctor.profile, {
          ngay: '2026-11-10',
        });
        const slot = await inTx.slot(shift, { trangThai: 'DaDat' });
        await inTx.appointment(
          w.doctor.profile,
          slot,
          w.patient.account.taiKhoanId,
        );

        let settled = false;
        const pending = errorOf(
          w.update(system, w.form({ chiNhanhId: w.b.chiNhanhId })),
        ).finally(() => {
          settled = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 800));
        expect(settled).toBe(false); // đang chờ khoá bac_si
        await runner.commitTransaction();
        expect(await pending).toMatchObject({
          maLoi: 'DOI_CHI_NHANH_BI_CHAN',
          body: { chiTiet: { lichHen: { tong: 1 } } },
        });
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
      expect((await w.profile())?.chiNhanhId).toBe(w.a.chiNhanhId);
    });

    it('HSS-02 đổi bác sĩ sang chi nhánh B đồng thời với B8 bỏ dịch vụ đó khỏi B ⇒ không deadlock lọt ra, không bao giờ bác sĩ ở B mà B không có dịch vụ', async () => {
      for (let round = 0; round < 5; round++) {
        await resetTables(db);
        const w = await world();
        await fx.weeklySchedule(w.b.chiNhanhId);
        const removeService = Object.assign(new UpdateBranchDto(), {
          ten: 'Chi nhánh B',
          diaChi: w.b.diaChi,
          lichHoatDong: weekly(),
          dichVuKhamIds: [],
        });
        const [moved, removed] = await Promise.allSettled([
          w.update(system, w.form({ chiNhanhId: w.b.chiNhanhId })),
          branches.update(
            system,
            w.sysAdmin.account.taiKhoanId,
            w.b.chiNhanhId,
            removeService,
          ),
        ]);
        const codeOf = (r: PromiseSettledResult<unknown>) =>
          r.status === 'rejected' ? (r.reason as AppException).maLoi : 'OK';
        const outcome = `${codeOf(moved)}|${codeOf(removed)}`;
        expect([
          'OK|DICH_VU_CON_BAC_SI',
          'DICH_VU_KHONG_O_CHI_NHANH|OK',
        ]).toContain(outcome);
        const consistent = (await db.query(
          `SELECT COUNT(*) AS n FROM bac_si b JOIN chi_nhanh_dich_vu_kham l
              ON l.chi_nhanh_id = b.chi_nhanh_id AND l.dich_vu_kham_id = b.dich_vu_kham_id WHERE b.tai_khoan_id = ?`,
          [w.doctor.account.taiKhoanId],
        )) as { n: string | number }[];
        expect(Number(consistent[0]?.n)).toBe(1);
      }
    });
  });
});
