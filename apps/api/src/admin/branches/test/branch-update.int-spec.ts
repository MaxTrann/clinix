import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import type { BacSi } from '../../entities/bac-si.entity.js';
import type { LichLamViec } from '../../entities/lich-lam-viec.entity.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { UpdateBranchDto, type BranchScheduleDto } from '../branch.dto.js';
import { BranchRepository, type BranchView } from '../branch.repository.js';
import { BranchService } from '../branch.service.js';
import { BranchImpactService } from '../impact/branch-impact.service.js';

// Admin B8 — sửa chi nhánh và phát hiện ảnh hưởng trên MySQL 8.4 THẬT (PLAN admin 5.4, 7.8; quy tắc 29, 30, 43).
// Đồng hồ ứng dụng giả: NOW = Thứ Hai 02/11/2026 07:00 giờ Việt Nam. "Thứ Hai tới" = 09/11/2026 (thu_trong_tuan = 1).
// Chi nhánh mẫu: 7 thứ đều 08:00–12:00 và 13:00–17:00; bác sĩ có dịch vụ khám chính 30 phút.
const NOW = new Date('2026-11-02T07:00:00+07:00');
const NEXT_MONDAY = '2026-11-09';
const system = { kind: 'ToanHeThong' } as const;

describe('B8 sửa chi nhánh — MySQL thật', () => {
  let db: DataSource;
  let repository: BranchRepository;
  let service: BranchService;
  let fx: AdminFixtures;

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    repository = new BranchRepository(db);
    service = new BranchService(
      repository,
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

  async function world() {
    const branch = await fx.branch({ ten: 'Chi nhánh A', diaChi: 'Địa chỉ A' });
    await fx.weeklySchedule(branch.chiNhanhId);
    const doctor = await fx.doctor(branch);
    const patient = await fx.patient();
    const proposer = await fx.admin(branch);
    const shifts = new Map<string, LichLamViec>();
    /** Một lịch hẹn lúc `at` ('YYYY-MM-DD HH:mm'), ca theo giờ, khung giờ DaDat. */
    const book = async (
      at: string,
      over: {
        trangThai?: 'ChoThanhToan' | 'DaXacNhan' | 'HoanThanh';
        ca?: 'CaSang' | 'CaChieu';
        doctor?: BacSi;
        dichVuKhamId?: string;
      } = {},
    ) => {
      const [ngay, gio] = at.split(' ') as [string, string];
      const ca = over.ca ?? (gio < '12:30' ? 'CaSang' : 'CaChieu');
      const who = over.doctor ?? doctor.profile;
      const key = `${who.taiKhoanId}|${ngay}|${ca}`;
      const shift = shifts.get(key) ?? (await fx.shift(who, { ngay, ca }));
      shifts.set(key, shift);
      const slot = await fx.slot(shift, {
        ngayGio: new Date(`${ngay}T${gio}:00+07:00`),
        trangThai: 'DaDat',
      });
      return fx.appointment(who, slot, patient.account.taiKhoanId, {
        trangThai: over.trangThai ?? 'DaXacNhan',
        ...(over.dichVuKhamId && { dichVuKhamId: over.dichVuKhamId }),
      });
    };
    const view = async () =>
      (await service.get(system, branch.chiNhanhId)) as BranchView;
    return { branch, doctor, patient, proposer, book, view, shifts };
  }

  /** Form đầy đủ dựng từ dữ liệu hiện tại (như giao diện gửi lên), rồi sửa theo `edit`. */
  function formOf(
    current: BranchView,
    edit: (form: UpdateBranchDto) => void = () => {},
  ): UpdateBranchDto {
    const hm = (t: string) => t.slice(0, 5);
    const form = Object.assign(new UpdateBranchDto(), {
      ten: current.ten,
      diaChi: current.diaChi,
      ...(current.toaDoLat !== null && {
        toaDoLat: current.toaDoLat,
        toaDoLng: current.toaDoLng,
      }),
      lichHoatDong: current.lichHoatDong.map((row) => ({
        thuTrongTuan: row.thuTrongTuan,
        hoatDong: row.hoatDong === true,
        ...(row.sang && {
          sang: { batDau: hm(row.sang.batDau), ketThuc: hm(row.sang.ketThuc) },
        }),
        ...(row.chieu && {
          chieu: {
            batDau: hm(row.chieu.batDau),
            ketThuc: hm(row.chieu.ketThuc),
          },
        }),
      })),
      dichVuKhamIds: current.dichVuKham.map((s) => s.dichVuKhamId),
    });
    edit(form);
    return form;
  }
  const setDay = (form: UpdateBranchDto, day: BranchScheduleDto) => {
    form.lichHoatDong = form.lichHoatDong.map((row) =>
      row.thuTrongTuan === day.thuTrongTuan ? day : row,
    );
  };
  const monday = (
    sang?: [string, string],
    chieu?: [string, string],
  ): BranchScheduleDto => ({
    thuTrongTuan: 1,
    hoatDong: sang !== undefined || chieu !== undefined,
    ...(sang && { sang: { batDau: sang[0], ketThuc: sang[1] } }),
    ...(chieu && { chieu: { batDau: chieu[0], ketThuc: chieu[1] } }),
  });

  const requests = (): Promise<
    {
      id: string;
      trangThai: string;
      nguoiDeXuatId: string;
      truoc: unknown;
      sau: unknown;
    }[]
  > =>
    db.query(
      `SELECT CAST(yeu_cau_thay_doi_chi_nhanh_id AS CHAR) AS id, trang_thai AS trangThai, CAST(nguoi_de_xuat_id AS CHAR) AS nguoiDeXuatId,
              noi_dung_truoc AS truoc, noi_dung_sau AS sau FROM yeu_cau_thay_doi_chi_nhanh ORDER BY yeu_cau_thay_doi_chi_nhanh_id`,
    );
  const mondayRow = async (branchId: string) =>
    (
      (await db.query(
        `SELECT hoat_dong AS hoatDong, TIME_FORMAT(gio_bat_dau_sang,'%H:%i') AS bdSang, TIME_FORMAT(gio_ket_thuc_sang,'%H:%i') AS ktSang,
                TIME_FORMAT(gio_bat_dau_chieu,'%H:%i') AS bdChieu, TIME_FORMAT(gio_ket_thuc_chieu,'%H:%i') AS ktChieu
           FROM chi_nhanh_lich_hoat_dong WHERE chi_nhanh_id = ? AND thu_trong_tuan = 1`,
        [branchId],
      )) as Record<string, unknown>[]
    )[0];

  describe('áp dụng ngay (không ảnh hưởng)', () => {
    it('CN-20 đổi tên, địa chỉ, toạ độ ⇒ lưu ngay, không tạo yêu cầu', async () => {
      const w = await world();
      const result = await service.update(
        system,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        formOf(await w.view(), (f) =>
          Object.assign(f, {
            ten: ' Chi nhánh  Mới ',
            diaChi: 'Địa chỉ mới',
            toaDoLat: '10.5',
            toaDoLng: '106.7',
          }),
        ),
      );
      expect(result).toMatchObject({
        daLuu: ['ten', 'diaChi', 'toaDo'],
        yeuCau: null,
      });
      expect(result.chiNhanh).toMatchObject({
        ten: 'Chi nhánh Mới',
        diaChi: 'Địa chỉ mới',
        toaDoLat: '10.5000000',
      });
      expect(await requests()).toEqual([]);
    });

    it('CN-21 mở rộng giờ, chuyển nghỉ → hoạt động, thêm dịch vụ ⇒ lưu ngay', async () => {
      const w = await world();
      await db.query(
        'UPDATE chi_nhanh_lich_hoat_dong SET hoat_dong = 0, gio_bat_dau_sang = NULL, gio_ket_thuc_sang = NULL, gio_bat_dau_chieu = NULL, gio_ket_thuc_chieu = NULL WHERE chi_nhanh_id = ? AND thu_trong_tuan = 7',
        [w.branch.chiNhanhId],
      );
      const { service: extra } = await fx.catalog();
      const result = await service.update(
        system,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        formOf(await w.view(), (f) => {
          setDay(f, monday(['07:00', '12:00'], ['13:00', '18:00']));
          setDay(f, {
            thuTrongTuan: 7,
            hoatDong: true,
            sang: { batDau: '08:00', ketThuc: '11:00' },
          });
          f.dichVuKhamIds = [...f.dichVuKhamIds, extra.dichVuKhamId];
        }),
      );
      expect(result).toMatchObject({
        daLuu: ['lichHoatDong', 'dichVuKham'],
        yeuCau: null,
      });
      expect(await mondayRow(w.branch.chiNhanhId)).toMatchObject({
        bdSang: '07:00',
        ktChieu: '18:00',
      });
      expect(result.chiNhanh.dichVuKham.map((s) => s.dichVuKhamId)).toContain(
        extra.dichVuKhamId,
      );
    });

    it('CN-22, CN-23 thu hẹp giờ khi chỉ có lịch quá khứ hoặc lịch đã hoàn thành ⇒ lưu ngay', async () => {
      const w = await world();
      await w.book('2026-10-26 08:00'); // Thứ Hai tuần trước (quá khứ)
      await w.book(`${NEXT_MONDAY} 08:00`, { trangThai: 'HoanThanh' });
      const result = await service.update(
        system,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        formOf(await w.view(), (f) =>
          setDay(f, monday(['09:00', '12:00'], ['13:00', '17:00'])),
        ),
      );
      expect(result.yeuCau).toBeNull();
      expect(result.daLuu).toEqual(['lichHoatDong']);
      expect(await mondayRow(w.branch.chiNhanhId)).toMatchObject({
        bdSang: '09:00',
      });
    });

    it('CN-25 chỉ có khung giờ ConTrong ngoài lịch mới ⇒ lưu ngay + cảnh báo liệt kê, không xoá khung giờ', async () => {
      const w = await world();
      const shift = await fx.shift(w.doctor.profile, {
        ngay: NEXT_MONDAY,
        ca: 'CaSang',
      });
      const free = await fx.slot(shift, {
        ngayGio: new Date(`${NEXT_MONDAY}T08:00:00+07:00`),
      });
      await fx.slot(shift, {
        ngayGio: new Date(`${NEXT_MONDAY}T10:00:00+07:00`),
      });
      const result = await service.update(
        system,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        formOf(await w.view(), (f) =>
          setDay(f, monday(['09:00', '12:00'], ['13:00', '17:00'])),
        ),
      );
      expect(result.yeuCau).toBeNull();
      expect(result.canhBao.khungGioTrongNgoaiLich).toEqual({
        items: [
          expect.objectContaining({
            khungGioId: free.khungGioId,
            ngayGio: `${NEXT_MONDAY} 08:00:00`,
          }),
        ],
        tong: 1,
      });
      const slots: unknown[] = await db.query('SELECT 1 FROM khung_gio');
      expect(slots).toHaveLength(2);
    });

    it('CN-26 gửi form không đổi gì ⇒ 400 KHONG_CO_THAY_DOI', async () => {
      const w = await world();
      await expect(
        service.update(
          system,
          w.proposer.account.taiKhoanId,
          w.branch.chiNhanhId,
          formOf(await w.view()),
        ),
      ).rejects.toMatchObject({ maLoi: 'KHONG_CO_THAY_DOI' });
    });
  });

  describe('có ảnh hưởng ⇒ yêu cầu ChoDuyet', () => {
    it('CN-30, CN-31 chuyển nghỉ Thứ Hai có lịch ChoThanhToan và DaXacNhan ⇒ yêu cầu; bảng lịch giữ nguyên; JSON chỉ thứ đổi, đủ 6 khóa', async () => {
      const w = await world();
      const a = await w.book(`${NEXT_MONDAY} 08:00`, {
        trangThai: 'ChoThanhToan',
      });
      const b = await w.book(`${NEXT_MONDAY} 14:00`, {
        trangThai: 'DaXacNhan',
      });
      const result = await service.update(
        system,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        formOf(await w.view(), (f) => setDay(f, monday())),
      );
      expect(result.daLuu).toEqual([]);
      expect(result.yeuCau).toMatchObject({
        trangThai: 'ChoDuyet',
        thuThayDoi: [1],
        dichVuThem: [],
        dichVuBo: [],
      });
      expect(
        result.anhHuong.lichHen.items.map((x) => [x.lichHenId, x.lyDoAnhHuong]),
      ).toEqual([
        [a.lichHenId, 'NgayNghi'],
        [b.lichHenId, 'NgayNghi'],
      ]);
      expect(await mondayRow(w.branch.chiNhanhId)).toMatchObject({
        hoatDong: 1,
        bdSang: '08:00',
      });
      const [request] = await requests();
      expect(request).toMatchObject({
        trangThai: 'ChoDuyet',
        nguoiDeXuatId: w.proposer.account.taiKhoanId,
      });
      expect(request?.truoc).toEqual({
        lich_hoat_dong: [
          {
            thu_trong_tuan: 1,
            hoat_dong: true,
            gio_bat_dau_sang: '08:00:00',
            gio_ket_thuc_sang: '12:00:00',
            gio_bat_dau_chieu: '13:00:00',
            gio_ket_thuc_chieu: '17:00:00',
          },
        ],
      });
      expect(request?.sau).toEqual({
        lich_hoat_dong: [
          {
            thu_trong_tuan: 1,
            hoat_dong: false,
            gio_bat_dau_sang: null,
            gio_ket_thuc_sang: null,
            gio_bat_dau_chieu: null,
            gio_ket_thuc_chieu: null,
          },
        ],
      });
      expect((await w.view()).coYeuCauDangMo).toBe(true);
    });

    it('CN-24 biên mốc: lịch hẹn đúng bằng thời điểm hiện tại vẫn tính (>=)', async () => {
      const w = await world();
      const at = await w.book('2026-11-02 07:00');
      const result = await service.update(
        system,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        formOf(await w.view(), (f) => setDay(f, monday())),
      );
      expect(result.anhHuong.lichHen.items.map((x) => x.lichHenId)).toEqual([
        at.lichHenId,
      ]);
    });

    it('CN-32, CN-33 thu hẹp cuối buổi và giờ nghỉ trưa mới cắt ngang lịch ⇒ NgoaiGioHoatDong', async () => {
      const w = await world();
      const late = await w.book(`${NEXT_MONDAY} 11:00`); // 11:00–11:30
      const split = await w.book(`${NEXT_MONDAY} 09:45`); // 09:45–10:15
      const result = await service.update(
        system,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        formOf(await w.view(), (f) =>
          setDay(f, monday(['08:00', '10:00'], ['13:00', '17:00'])),
        ),
      );
      // Service sắp theo thời gian: 09:45 trước 11:00
      expect(
        result.anhHuong.lichHen.items.map((x) => [x.lichHenId, x.lyDoAnhHuong]),
      ).toEqual([
        [split.lichHenId, 'NgoaiGioHoatDong'],
        [late.lichHenId, 'NgoaiGioHoatDong'],
      ]);
    });

    it('CN-34, CN-35 biên: kết thúc đúng giờ đóng, bắt đầu đúng giờ mở, lịch ca chiều khi chỉ đổi buổi sáng ⇒ không ảnh hưởng', async () => {
      const w = await world();
      await w.book(`${NEXT_MONDAY} 11:00`); // kết thúc 11:30 = giờ đóng mới
      await w.book(`${NEXT_MONDAY} 09:00`); // bắt đầu = giờ mở mới
      await w.book(`${NEXT_MONDAY} 14:00`, { ca: 'CaChieu' });
      const result = await service.update(
        system,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        formOf(await w.view(), (f) =>
          setDay(f, monday(['09:00', '11:30'], ['13:00', '17:00'])),
        ),
      );
      expect(result.yeuCau).toBeNull();
      expect(result.anhHuong.lichHen.tong).toBe(0);
    });

    it('CN-25b ca tương lai mất khoảng (bỏ buổi chiều) mà không có lịch hẹn ⇒ vẫn tạo yêu cầu', async () => {
      const w = await world();
      const shift = await fx.shift(w.doctor.profile, {
        ngay: NEXT_MONDAY,
        ca: 'CaChieu',
      });
      const result = await service.update(
        system,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        formOf(await w.view(), (f) => setDay(f, monday(['08:00', '12:00']))),
      );
      expect(result.yeuCau).not.toBeNull();
      expect(result.anhHuong.ca.items).toEqual([
        {
          lichLamViecId: shift.lichLamViecId,
          bacSiId: w.doctor.profile.taiKhoanId,
          ngay: NEXT_MONDAY,
          ca: 'CaChieu',
        },
      ]);
    });

    it('CN-27 đổi tên + thu hẹp có ảnh hưởng ⇒ tên lưu ngay, lịch vào yêu cầu; phản hồi nêu rõ hai phần', async () => {
      const w = await world();
      await w.book(`${NEXT_MONDAY} 08:00`);
      const result = await service.update(
        system,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        formOf(await w.view(), (f) => {
          f.ten = 'Tên mới';
          setDay(f, monday(['09:00', '12:00'], ['13:00', '17:00']));
        }),
      );
      expect(result.daLuu).toEqual(['ten']);
      expect(result.yeuCau).not.toBeNull();
      expect(result.chiNhanh.ten).toBe('Tên mới');
      expect(await mondayRow(w.branch.chiNhanhId)).toMatchObject({
        bdSang: '08:00',
      });
    });

    it('CN-36, CN-37 bỏ dịch vụ: có lịch ⇒ BoDichVu; lịch vừa nghỉ vừa bỏ dịch vụ ⇒ MỘT dòng NgayNghi; dịch vụ không lịch thì bỏ được', async () => {
      const w = await world();
      const oldService = w.doctor.profile.dichVuKhamId;
      // Bác sĩ đã chuyển sang dịch vụ khác (Q8 không chặn), lịch hẹn cũ vẫn mang dịch vụ cũ
      const { service: newService } = await fx.catalog();
      await db.query(
        'INSERT INTO chi_nhanh_dich_vu_kham (chi_nhanh_id, dich_vu_kham_id) VALUES (?, ?)',
        [w.branch.chiNhanhId, newService.dichVuKhamId],
      );
      const onTuesday = await w.book('2026-11-10 08:00', {
        dichVuKhamId: oldService,
      });
      const onMonday = await w.book(`${NEXT_MONDAY} 08:00`, {
        dichVuKhamId: oldService,
      });
      await db.query(
        'UPDATE bac_si SET dich_vu_kham_id = ? WHERE tai_khoan_id = ?',
        [newService.dichVuKhamId, w.doctor.profile.taiKhoanId],
      );
      const result = await service.update(
        system,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        formOf(await w.view(), (f) => {
          setDay(f, monday());
          f.dichVuKhamIds = [newService.dichVuKhamId];
        }),
      );
      expect(
        result.anhHuong.lichHen.items.map((x) => [x.lichHenId, x.lyDoAnhHuong]),
      ).toEqual([
        [onMonday.lichHenId, 'NgayNghi'],
        [onTuesday.lichHenId, 'BoDichVu'],
      ]);
      expect(result.yeuCau).toMatchObject({ dichVuBo: [oldService] });
      const [request] = await requests();
      expect(request?.sau).toMatchObject({
        dich_vu_kham_ids: [newService.dichVuKhamId],
      });
    });

    it('CN-38, CN-40 lịch của chi nhánh khác không tính; thứ ảnh hưởng và thứ không ảnh hưởng cùng vào MỘT yêu cầu', async () => {
      const w = await world();
      const other = await fx.branch();
      await fx.weeklySchedule(other.chiNhanhId);
      const otherDoctor = await fx.doctor(other);
      await w.book(`${NEXT_MONDAY} 08:00`, { doctor: otherDoctor.profile });
      const result1 = await service.update(
        system,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        formOf(await w.view(), (f) => setDay(f, monday())),
      );
      expect(result1.yeuCau).toBeNull();

      await w.book('2026-11-10 08:00'); // Thứ Ba
      const result2 = await service.update(
        system,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        formOf(await w.view(), (f) => {
          setDay(f, { thuTrongTuan: 2, hoatDong: false });
          setDay(f, {
            thuTrongTuan: 3,
            hoatDong: true,
            sang: { batDau: '07:00', ketThuc: '12:00' },
          });
        }),
      );
      expect(result2.yeuCau?.thuThayDoi).toEqual([2, 3]);
      expect(await requests()).toHaveLength(1);
    });
  });

  describe('phạm vi, Q3, Q8, đồng thời', () => {
    it('CN-41 Chi nhánh sửa chi nhánh mình ⇒ được; chi nhánh khác ⇒ 404 KHONG_TIM_THAY', async () => {
      const w = await world();
      const other = await fx.branch();
      const scope = {
        kind: 'ChiNhanh',
        chiNhanhId: w.branch.chiNhanhId,
      } as const;
      const own = await service.update(
        scope,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        formOf(await w.view(), (f) => {
          f.ten = 'Đổi';
        }),
      );
      expect(own.daLuu).toEqual(['ten']);
      const otherView = await service.get(system, other.chiNhanhId);
      await expect(
        service.update(
          scope,
          w.proposer.account.taiKhoanId,
          other.chiNhanhId,
          formOf(otherView, (f) => {
            f.ten = 'X';
          }),
        ),
      ).rejects.toMatchObject({ status: 404, maLoi: 'KHONG_TIM_THAY' });
    });

    it('CN-42, CN-43 đã có yêu cầu đang mở: đổi lịch/dịch vụ ⇒ 409 YEU_CAU_DANG_CHO (form hỗn hợp không lưu gì); chỉ đổi tên ⇒ được', async () => {
      const w = await world();
      await w.book(`${NEXT_MONDAY} 08:00`);
      await service.update(
        system,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        formOf(await w.view(), (f) => setDay(f, monday())),
      );
      const view = await w.view();
      await expect(
        service.update(
          system,
          w.proposer.account.taiKhoanId,
          w.branch.chiNhanhId,
          formOf(view, (f) =>
            setDay(f, {
              thuTrongTuan: 3,
              hoatDong: true,
              sang: { batDau: '07:00', ketThuc: '12:00' },
            }),
          ),
        ),
      ).rejects.toMatchObject({ status: 409, maLoi: 'YEU_CAU_DANG_CHO' });
      await expect(
        service.update(
          system,
          w.proposer.account.taiKhoanId,
          w.branch.chiNhanhId,
          formOf(view, (f) => {
            f.ten = 'Hỗn hợp';
            setDay(f, { thuTrongTuan: 3, hoatDong: false });
          }),
        ),
      ).rejects.toMatchObject({ maLoi: 'YEU_CAU_DANG_CHO' });
      expect((await w.view()).ten).toBe('Chi nhánh A');
      const ok = await service.update(
        system,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        formOf(view, (f) => {
          f.diaChi = 'Chỉ đổi địa chỉ';
        }),
      );
      expect(ok.daLuu).toEqual(['diaChi']);
    });

    it('CN-44 bỏ dịch vụ còn bác sĩ dùng làm dịch vụ chính ⇒ 409 DICH_VU_CON_BAC_SI kèm danh sách, không lưu gì', async () => {
      const w = await world();
      await expect(
        service.update(
          system,
          w.proposer.account.taiKhoanId,
          w.branch.chiNhanhId,
          formOf(await w.view(), (f) => {
            f.ten = 'Không lưu';
            f.dichVuKhamIds = [];
          }),
        ),
      ).rejects.toMatchObject({
        status: 409,
        maLoi: 'DICH_VU_CON_BAC_SI',
      });
      const view = await w.view();
      expect(view.ten).toBe('Chi nhánh A');
      expect(view.dichVuKham).toHaveLength(1);
    });

    it('CN-45 hai người gửi yêu cầu cùng lúc ⇒ đúng một yêu cầu, bên kia 409 YEU_CAU_DANG_CHO (không 500)', async () => {
      const w = await world();
      await w.book(`${NEXT_MONDAY} 08:00`);
      const form = formOf(await w.view(), (f) => setDay(f, monday()));
      const results = await Promise.allSettled([
        service.update(
          system,
          w.proposer.account.taiKhoanId,
          w.branch.chiNhanhId,
          form,
        ),
        service.update(
          system,
          w.proposer.account.taiKhoanId,
          w.branch.chiNhanhId,
          form,
        ),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected');
      expect((rejected as PromiseRejectedResult).reason).toMatchObject({
        status: 409,
        maLoi: 'YEU_CAU_DANG_CHO',
      });
      expect(await requests()).toHaveLength(1);
    });

    it('CNB-01 booking giữ khung giờ trước rồi chèn lịch hẹn: B8 chờ khoá, thấy lịch hẹn mới nên tạo yêu cầu thay vì áp dụng', async () => {
      const w = await world();
      const shift = await fx.shift(w.doctor.profile, {
        ngay: NEXT_MONDAY,
        ca: 'CaSang',
      });
      const slot = await fx.slot(shift, {
        ngayGio: new Date(`${NEXT_MONDAY}T08:00:00+07:00`),
      });
      const form = formOf(await w.view(), (f) =>
        setDay(f, monday(['09:00', '12:00'], ['13:00', '17:00'])),
      );

      // "Booking": khoá khung giờ (như tầng 5 của booking), giữ khoá trong lúc B8 bắt đầu
      const booking = db.createQueryRunner();
      await booking.connect();
      await booking.startTransaction('READ COMMITTED');
      await booking.query(
        'SELECT khung_gio_id FROM khung_gio WHERE khung_gio_id = ? FOR UPDATE',
        [slot.khungGioId],
      );
      const update = service.update(
        system,
        w.proposer.account.taiKhoanId,
        w.branch.chiNhanhId,
        form,
      );
      await new Promise((resolve) => setTimeout(resolve, 500)); // B8 đang chờ khoá khung giờ
      await booking.query(
        "UPDATE khung_gio SET trang_thai = 'DaDat' WHERE khung_gio_id = ?",
        [slot.khungGioId],
      );
      const appointment = await new AdminFixtures(booking.manager).appointment(
        w.doctor.profile,
        slot,
        w.patient.account.taiKhoanId,
      );
      await booking.commitTransaction();
      await booking.release();

      const result = await update;
      expect(result.yeuCau).not.toBeNull();
      expect(result.anhHuong.lichHen.items.map((x) => x.lichHenId)).toEqual([
        appointment.lichHenId,
      ]);
      expect(await mondayRow(w.branch.chiNhanhId)).toMatchObject({
        bdSang: '08:00',
      });
    });
  });
});
