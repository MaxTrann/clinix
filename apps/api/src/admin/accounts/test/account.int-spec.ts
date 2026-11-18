import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { AppException } from '../../../common/errors/app.exception.js';
import type { Paged } from '../../../common/paging/paged.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import type { TaiKhoan } from '../../../auth/entities/tai-khoan.entity.js';
import { insertMaXacThuc } from '../../../auth/entities/testing/auth-fixtures.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { freezeTime } from '../../testing/test-helpers.js';
import { AccountListDto } from '../account.dto.js';
import { AccountRepository } from '../account.repository.js';
import { AccountService } from '../account.service.js';
import { accountVisibility } from '../account-visibility.js';
import { ACCOUNT_ROW_KEYS, type AccountView } from '../account-view.js';
import {
  LINK_DIGEST,
  PASSWORD_HASH_MARK,
  REFRESH_MARK,
  SENTINELS,
  bookAppointment,
  buildAccountWorld,
  type AccountWorld,
} from '../testing/account-world.js';
import { findSecretLeaks } from '../testing/secret-leak.js';
import { TRANG_THAI_LICH_HEN } from '../../entities/enums.js';

type Page = Paged<AccountView>;
const system: AdminScope = { kind: 'ToanHeThong' };
const branchScope = (chiNhanhId: string): AdminScope => ({
  kind: 'ChiNhanh',
  chiNhanhId,
});
const query = (values: Partial<AccountListDto> = {}) =>
  Object.assign(new AccountListDto(), values);

const idOf = (value: { account: TaiKhoan } | TaiKhoan): string =>
  'account' in value ? value.account.taiKhoanId : value.taiKhoanId;
const idsOf = (...values: ({ account: TaiKhoan } | TaiKhoan)[]) =>
  values.map(idOf).sort();
const seen = (page: Page) => page.items.map((item) => item.taiKhoanId).sort();
const keysOf = (value: object) => Object.keys(value).sort();

async function snapshot(db: DataSource): Promise<string> {
  const tables = [
    'tai_khoan',
    'benh_nhan',
    'bac_si',
    'le_tan',
    'quan_tri_vien',
    'lich_hen',
    'ma_xac_thuc',
    'phien_dang_nhap',
    'vi_noi_bo',
  ];
  const result: Record<string, unknown> = {};
  for (const table of tables)
    result[table] = await db.query(`SELECT * FROM \`${table}\` ORDER BY 1`);
  return JSON.stringify(result);
}

describe('B17 TK — danh sách và chi tiết tài khoản trên MySQL thật', () => {
  let db: DataSource;
  let service: AccountService;
  let repository: AccountRepository;
  let fixtures: AdminFixtures;
  let w: AccountWorld;
  let scopeA: AdminScope;
  let scopeB: AdminScope;

  const list = (scope: AdminScope, values: Partial<AccountListDto> = {}) =>
    service.list(scope, query({ pageSize: 100, ...values }));
  const everyPage = async (
    scope: AdminScope,
    values: Partial<AccountListDto>,
    pageSize: number,
  ) => {
    const first = await service.list(
      scope,
      query({ ...values, page: 1, pageSize }),
    );
    const items = [...first.items];
    for (let page = 2; items.length < first.total && page < 50; page += 1)
      items.push(
        ...(await service.list(scope, query({ ...values, page, pageSize })))
          .items,
      );
    return { total: first.total, items };
  };
  const failure = async (work: Promise<unknown>): Promise<AppException> => {
    const error = await work.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(AppException);
    return error as AppException;
  };

  async function reseed() {
    await resetTables(db);
    w = await buildAccountWorld(db);
    scopeA = branchScope(w.branchA.chiNhanhId);
    scopeB = branchScope(w.branchB.chiNhanhId);
  }

  // Ca TỰ THÊM dữ liệu: dựng lại thế giới trước (để đếm đúng) và SAU (để không làm nhiễm các ca đọc phía dưới).
  const freshIt = (name: string, work: () => Promise<void>) =>
    it(name, async () => {
      await reseed();
      try {
        await work();
      } finally {
        await reseed();
      }
    });

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    repository = new AccountRepository(db);
    service = new AccountService(repository, new BranchAccessPolicy());
    fixtures = new AdminFixtures(db);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => db?.destroy());

  describe('đọc (thế giới dựng một lần)', () => {
    beforeAll(reseed);

    it('TKB17-10 (TK-01) Toàn hệ thống thấy MỌI loại, mọi chi nhánh; total đúng', async () => {
      const page = await list(system);
      expect(page.total).toBe(w.all.length);
      expect(page.items).toHaveLength(w.all.length);
      expect(seen(page)).toEqual(idsOf(...w.all));
      expect(page).toMatchObject({ page: 1, pageSize: 100 });
    });

    it('TKB17-10 (TK-01) lọc vaiTro: một giá trị và nhiều giá trị', async () => {
      expect(seen(await list(system, { vaiTro: ['BacSi'] }))).toEqual(
        idsOf(w.doctorA, w.pendingDoctorA, w.doctorB, w.brokenDoctor),
      );
      expect(seen(await list(system, { vaiTro: ['LeTan'] }))).toEqual(
        idsOf(w.receptionistA, w.receptionistB),
      );
      expect(seen(await list(system, { vaiTro: ['QuanTriVien'] }))).toEqual(
        idsOf(w.sysAdmin, w.adminA, w.adminB),
      );
      expect(seen(await list(system, { vaiTro: ['BacSi', 'LeTan'] }))).toEqual(
        idsOf(
          w.doctorA,
          w.pendingDoctorA,
          w.doctorB,
          w.brokenDoctor,
          w.receptionistA,
          w.receptionistB,
        ),
      );
      const patients = await list(system, { vaiTro: ['BenhNhan'] });
      expect(patients.total).toBe(8);
      expect(patients.items.every((i) => i.loaiTaiKhoan === 'BenhNhan')).toBe(
        true,
      );
    });

    it('TKB17-10 (TK-01) lọc trangThai', async () => {
      expect(seen(await list(system, { trangThai: 'ChoKichHoat' }))).toEqual(
        idsOf(w.pendingDoctorA),
      );
      expect((await list(system, { trangThai: 'NgungHoatDong' })).total).toBe(
        0,
      );
      expect((await list(system, { trangThai: 'DangHoatDong' })).total).toBe(
        w.all.length - 1,
      );
    });

    it('TKB17-10 (TK-01) lọc cờ no-show: nhân sự và Bệnh nhân chưa xác minh KHÔNG khớp cả hai giá trị', async () => {
      expect(seen(await list(system, { khoaNoShow: 'true' }))).toEqual(
        idsOf(w.lockedA),
      );
      expect(seen(await list(system, { khoaNoShow: 'false' }))).toEqual(
        idsOf(w.onlyA, w.onlyB, w.both, w.none, w.manyA, w.relativeA),
      );
    });

    it('TKB17-10 (TK-01) lọc chiNhanhId của Toàn hệ thống: nhân sự của chi nhánh + Quản trị viên của chi nhánh + Bệnh nhân có lịch ở đó', async () => {
      expect(
        seen(await list(system, { chiNhanhId: w.branchA.chiNhanhId })),
      ).toEqual(
        idsOf(
          w.adminA,
          w.doctorA,
          w.pendingDoctorA,
          w.receptionistA,
          w.onlyA,
          w.both,
          w.manyA,
          w.relativeA,
          w.lockedA,
        ),
      );
      expect(
        seen(await list(system, { chiNhanhId: w.branchB.chiNhanhId })),
      ).toEqual(idsOf(w.adminB, w.doctorB, w.receptionistB, w.onlyB, w.both));
      expect(
        (await list(system, { chiNhanhId: '9223372036854775807' })).total,
      ).toBe(0);
    });

    it('TKB17-10 (TK-01) tìm kiếm theo tên, email, SĐT; không phân biệt hoa thường', async () => {
      expect(seen(await list(system, { q: 'Bác sĩ A' }))).toEqual(
        idsOf(w.doctorA, w.pendingDoctorA),
      );
      expect(seen(await list(system, { q: 'BÁC SĨ A' }))).toEqual(
        idsOf(w.doctorA, w.pendingDoctorA),
      );
      expect(seen(await list(system, { q: w.onlyB.account.email }))).toEqual(
        idsOf(w.onlyB),
      );
      expect(
        seen(await list(system, { q: w.receptionistA.account.soDienThoai })),
      ).toEqual(idsOf(w.receptionistA));
      expect((await list(system, { q: 'tk.thu.' })).total).toBe(w.all.length);
    });

    it('TKB17-10 (TK-01) phối hợp nhiều bộ lọc cùng lúc (AND)', async () => {
      expect(
        seen(
          await list(system, {
            vaiTro: ['BenhNhan'],
            trangThai: 'DangHoatDong',
            chiNhanhId: w.branchA.chiNhanhId,
            khoaNoShow: 'false',
            q: 'ba lịch',
          }),
        ),
      ).toEqual(idsOf(w.manyA));
      expect(
        (
          await list(system, {
            vaiTro: ['BacSi'],
            trangThai: 'ChoKichHoat',
            chiNhanhId: w.branchB.chiNhanhId,
          })
        ).total,
      ).toBe(0);
    });

    it('TKB17-10 (TK-01) phân trang: trang 2, trang cuối, trang vượt; total KHÔNG đổi theo trang', async () => {
      const total = w.all.length;
      const sizes: number[] = [];
      const ids: string[] = [];
      for (let page = 1; page <= 4; page += 1) {
        const result = await service.list(system, query({ page, pageSize: 5 }));
        expect(result.total).toBe(total);
        sizes.push(result.items.length);
        ids.push(...result.items.map((item) => item.taiKhoanId));
      }
      expect(sizes).toEqual([5, 5, 5, 2]);
      expect(new Set(ids).size).toBe(total);
      const beyond = await service.list(
        system,
        query({ page: 5, pageSize: 5 }),
      );
      expect(beyond).toMatchObject({ items: [], total, page: 5, pageSize: 5 });
    });

    it('TKB17-11 (TK-02, Q27) Chi nhánh A: CHỈ Bác sĩ, Lễ tân của A và Bệnh nhân có lịch ở A; KHÔNG Quản trị viên nào', async () => {
      const page = await list(scopeA);
      expect(seen(page)).toEqual(
        idsOf(
          w.doctorA,
          w.pendingDoctorA,
          w.receptionistA,
          w.onlyA,
          w.both,
          w.manyA,
          w.relativeA,
          w.lockedA,
        ),
      );
      expect(page.total).toBe(8);
      expect(page.items.some((i) => i.loaiTaiKhoan === 'QuanTriVien')).toBe(
        false,
      );
      for (const excluded of [
        w.sysAdmin,
        w.adminA,
        w.adminB,
        w.doctorB,
        w.receptionistB,
        w.onlyB,
        w.none,
        w.unverified,
        w.brokenDoctor,
      ])
        expect(seen(page)).not.toContain(idOf(excluded));
    });

    it('TKB17-11 (TK-02) Chi nhánh B: đối xứng, không thấy dữ liệu của A', async () => {
      expect(seen(await list(scopeB))).toEqual(
        idsOf(w.doctorB, w.receptionistB, w.onlyB, w.both),
      );
    });

    it('TKB17-11 (Q27) Chi nhánh lọc vaiTro=QuanTriVien ⇒ rỗng, total 0; lọc đủ bốn vai = không lọc', async () => {
      expect(await list(scopeA, { vaiTro: ['QuanTriVien'] })).toMatchObject({
        items: [],
        total: 0,
      });
      expect(
        seen(
          await list(scopeA, {
            vaiTro: ['BenhNhan', 'BacSi', 'LeTan', 'QuanTriVien'],
          }),
        ),
      ).toEqual(seen(await list(scopeA)));
    });

    freshIt(
      'TKB17-11 (TK-02) Bệnh nhân có lịch ở MỌI trạng thái lịch hẹn đều được thấy',
      async () => {
        const seeded: TaiKhoan[] = [];
        let day = 0;
        for (const status of TRANG_THAI_LICH_HEN) {
          day += 1;
          const { account } = await fixtures.patient({
            hoTen: `Bệnh nhân trạng thái ${status}`,
            email: `trang.thai.${status.toLowerCase()}@example.com`,
          });
          await bookAppointment(
            db,
            w.doctorA.profile,
            account.taiKhoanId,
            status,
            `2026-12-${String(day).padStart(2, '0')}`,
          );
          seeded.push(account);
        }
        const page = await list(scopeA, { q: 'Bệnh nhân trạng thái' });
        expect(seen(page)).toEqual(idsOf(...seeded));
        expect(page.total).toBe(TRANG_THAI_LICH_HEN.length);
      },
    );

    it('TKB17-12 (TK-03) Bệnh nhân chỉ có lịch ở chi nhánh khác, hoặc chưa từng đặt lịch: không có trong danh sách, chi tiết ⇒ 404', async () => {
      const page = await list(scopeA);
      expect(seen(page)).not.toContain(idOf(w.onlyB));
      expect(seen(page)).not.toContain(idOf(w.none));
      for (const hidden of [w.onlyB, w.none, w.adminA, w.sysAdmin, w.doctorB]) {
        const error = await failure(service.get(scopeA, idOf(hidden)));
        expect(error.getStatus()).toBe(404);
        expect(error.maLoi).toBe('KHONG_TIM_THAY');
      }
    });

    it('TKB17-12 (TK-03) Bệnh nhân có ba lịch ở A ra MỘT dòng và total không phình; có lịch ở cả hai chi nhánh thì thấy ở cả hai', async () => {
      const page = await list(scopeA);
      expect(
        page.items.filter((i) => i.taiKhoanId === idOf(w.manyA)),
      ).toHaveLength(1);
      expect(page.total).toBe(page.items.length);
      expect(seen(page)).toContain(idOf(w.both));
      expect(seen(await list(scopeB))).toContain(idOf(w.both));
    });

    it('TKB17-12 (TK-03) Bệnh nhân chỉ đặt lịch cho NGƯỜI THÂN vẫn được thấy ở chi nhánh đó', async () => {
      expect(seen(await list(scopeA))).toContain(idOf(w.relativeA));
      expect(seen(await list(scopeB))).not.toContain(idOf(w.relativeA));
    });

    it('TKB17-13 (TK-04) Chi nhánh xem chi tiết Bệnh nhân: đúng 8 khoá; Toàn hệ thống: đúng 13 khoá; DB không bị đổi', async () => {
      const before = await snapshot(db);
      const asBranch = await service.get(scopeA, idOf(w.onlyA));
      expect(keysOf(asBranch)).toEqual(
        [
          'email',
          'gioiTinh',
          'hoTen',
          'loaiTaiKhoan',
          'ngaySinh',
          'soDienThoai',
          'taiKhoanId',
          'trangThai',
        ].sort(),
      );
      expect(asBranch).toEqual({
        taiKhoanId: idOf(w.onlyA),
        loaiTaiKhoan: 'BenhNhan',
        hoTen: 'Bệnh nhân chỉ A',
        email: w.onlyA.account.email,
        soDienThoai: w.onlyA.account.soDienThoai,
        ngaySinh: '1990-05-17',
        gioiTinh: 'Nam',
        trangThai: 'DangHoatDong',
      });
      const asSystem = await service.get(system, idOf(w.onlyA));
      expect(Object.keys(asSystem)).toHaveLength(13);
      expect(asSystem).toMatchObject({
        diaChi: 'Địa chỉ của Bệnh nhân chỉ A',
        daXacMinhEmail: true,
        khoaDatLichDoNoShow: false,
        soLanNoShow: 0,
      });
      expect((asSystem as { thoiDiemTao: unknown }).thoiDiemTao).toBeInstanceOf(
        Date,
      );
      expect(await snapshot(db)).toBe(before);
    });

    it('TKB17-13 (TK-04) Bệnh nhân bị khoá no-show: Toàn hệ thống thấy cờ và số lần; Chi nhánh KHÔNG', async () => {
      expect(await service.get(system, idOf(w.lockedA))).toMatchObject({
        khoaDatLichDoNoShow: true,
        soLanNoShow: 3,
      });
      const asBranch = await service.get(scopeA, idOf(w.lockedA));
      expect(asBranch).not.toHaveProperty('khoaDatLichDoNoShow');
      expect(asBranch).not.toHaveProperty('soLanNoShow');
    });

    it('TKB17-13 chi tiết nhân sự: Bác sĩ có chi nhánh {chiNhanhId, ten}; Quản trị viên Toàn hệ thống có chiNhanh null; Admin Chi nhánh có chi nhánh', async () => {
      expect(await service.get(scopeA, idOf(w.doctorA))).toMatchObject({
        loaiTaiKhoan: 'BacSi',
        chiNhanh: { chiNhanhId: w.branchA.chiNhanhId, ten: 'Chi nhánh A' },
        lienKetKichHoat: null,
      });
      expect(await service.get(system, idOf(w.sysAdmin))).toMatchObject({
        loaiTaiKhoan: 'QuanTriVien',
        phamViQuanTri: 'ToanHeThong',
        chiNhanh: null,
      });
      expect(await service.get(system, idOf(w.adminA))).toMatchObject({
        phamViQuanTri: 'ChiNhanh',
        chiNhanh: { chiNhanhId: w.branchA.chiNhanhId },
      });
    });

    freshIt(
      "TKB17-14 (TK-06, SE-A8) q chứa %, _, !, \\, ', --, SQL độc: không lỗi, không lọt hàng, bảng còn nguyên",
      async () => {
        const extras = await Promise.all(
          ['Giảm 50% hôm nay', 'Mã_số đặc biệt', 'Xin chào!'].map(
            async (hoTen, index) =>
              (
                await fixtures.patient({
                  hoTen,
                  email: `ky.tu.${String(index)}@example.com`,
                })
              ).account,
          ),
        );
        const total = await db.query('SELECT COUNT(*) AS n FROM tai_khoan');

        // Đối chứng dương: ký tự đặc biệt khớp ĐÚNG NGHĨA ĐEN, chỉ hàng chứa nó.
        expect(seen(await list(system, { q: '%' }))).toEqual(idsOf(extras[0]!));
        expect(seen(await list(system, { q: '_' }))).toEqual(idsOf(extras[1]!));
        expect(seen(await list(system, { q: '!' }))).toEqual(idsOf(extras[2]!));
        expect(seen(await list(system, { q: '50%' }))).toEqual(
          idsOf(extras[0]!),
        );

        // Đối chứng âm: không hàng nào chứa các chuỗi này; Toàn hệ thống và Chi nhánh đều trả rỗng.
        for (const q of [
          '\\',
          "'",
          '--',
          "' OR '1'='1",
          '"; DROP TABLE tai_khoan; --',
          "x' UNION SELECT mat_khau_bam FROM tai_khoan -- ",
          '%%',
          '__',
        ])
          for (const scope of [system, scopeA]) {
            const page = await list(scope, { q });
            expect(page.items).toEqual([]);
            expect(page.total).toBe(0);
          }
        // Chi nhánh: `%` và `_` cũng không lọt hàng ngoài phạm vi (các hàng phụ không có lịch ở A).
        for (const q of ['%', '_', '!'])
          expect((await list(scopeA, { q })).total).toBe(0);
        expect(await db.query('SELECT COUNT(*) AS n FROM tai_khoan')).toEqual(
          total,
        );
      },
    );

    it('TKB17-15 (PQ-08) Chi nhánh tìm đúng tên, email, SĐT của người NGOÀI phạm vi ⇒ rỗng (nhóm OR của q không lấn át điều kiện phạm vi)', async () => {
      for (const outside of [
        w.onlyB,
        w.doctorB,
        w.receptionistB,
        w.adminA,
        w.none,
      ]) {
        for (const q of [
          outside.account.hoTen,
          outside.account.email,
          outside.account.soDienThoai,
        ])
          expect((await list(scopeA, { q })).total).toBe(0);
      }
      expect(seen(await list(scopeA, { q: w.onlyA.account.email }))).toEqual(
        idsOf(w.onlyA),
      );
    });

    it('TKB17-17 (PQ-07, PQ-08) total = số item khi gom mọi trang, với mọi phạm vi và tổ hợp bộ lọc', async () => {
      const combos: Partial<AccountListDto>[] = [
        {},
        { vaiTro: ['BenhNhan'] },
        { vaiTro: ['BacSi', 'LeTan'], trangThai: 'DangHoatDong' },
        { khoaNoShow: 'false' },
        { q: 'Bệnh nhân' },
        { chiNhanhId: w.branchA.chiNhanhId, q: 'A' },
        { trangThai: 'ChoKichHoat' },
      ];
      for (const scope of [system, scopeA, scopeB])
        for (const combo of combos) {
          if (scope.kind === 'ChiNhanh' && combo.khoaNoShow !== undefined)
            continue; // Chi nhánh không được lọc theo cờ này (403)
          const gathered = await everyPage(scope, combo, 3);
          const oneBigPage = await list(scope, combo);
          expect(gathered.items).toHaveLength(gathered.total);
          expect(gathered.total).toBe(oneBigPage.total);
          expect(gathered.items.map((i) => i.taiKhoanId)).toEqual(
            oneBigPage.items.map((i) => i.taiKhoanId),
          );
        }
    });

    it('TKB17-17 (PQ-07) Chi nhánh A gửi chiNhanhId của chi nhánh B ⇒ kết quả BẰNG danh sách của chính A, không lộ B', async () => {
      const forged = await list(scopeA, { chiNhanhId: w.branchB.chiNhanhId });
      expect(seen(forged)).toEqual(seen(await list(scopeA)));
      expect(forged.total).toBe((await list(scopeA)).total);
    });

    it('TKB17-18 dữ liệu biên: Bệnh nhân chưa xác minh và Bác sĩ thiếu hồ sơ con', async () => {
      const page = await list(system);
      const unverified = page.items.find(
        (i) => i.taiKhoanId === idOf(w.unverified),
      );
      expect(unverified).toMatchObject({
        loaiTaiKhoan: 'BenhNhan',
        daXacMinhEmail: false,
        khoaDatLichDoNoShow: null,
        soLanNoShow: null,
      });
      const broken = page.items.find(
        (i) => i.taiKhoanId === idOf(w.brokenDoctor),
      );
      expect(broken).toMatchObject({ loaiTaiKhoan: 'BacSi', chiNhanh: null });
      for (const scope of [scopeA, scopeB]) {
        const hidden = await list(scope);
        expect(seen(hidden)).not.toContain(idOf(w.unverified));
        expect(seen(hidden)).not.toContain(idOf(w.brokenDoctor));
        for (const account of [w.unverified, w.brokenDoctor])
          expect(
            (await failure(service.get(scope, idOf(account)))).getStatus(),
          ).toBe(404);
      }
      expect(await service.get(system, idOf(w.brokenDoctor))).toMatchObject({
        chiNhanh: null,
      });
    });

    freshIt(
      'TKB17-16 (TK-05, Q42) sắp xếp cố định: nhiều tài khoản TRÙNG họ tên ra theo id tăng dần, duyệt từng trang không sót không lặp',
      async () => {
        const made: TaiKhoan[] = [];
        for (let index = 0; index < 5; index += 1)
          made.push(
            (
              await fixtures.patient({
                hoTen: 'Trùng họ tên',
                email: `trung.ten.${String(index)}@example.com`,
              })
            ).account,
          );
        const expected = made
          .map((a) => a.taiKhoanId)
          .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
        const gathered: string[] = [];
        for (let page = 1; page <= 3; page += 1)
          gathered.push(
            ...(
              await service.list(
                system,
                query({ q: 'Trùng họ tên', page, pageSize: 2 }),
              )
            ).items.map((i) => i.taiKhoanId),
          );
        expect(gathered).toEqual(expected);
        const bigPage = await list(system, { q: 'Trùng họ tên' });
        expect(bigPage.items.map((i) => i.taiKhoanId)).toEqual(expected);
      },
    );

    it('TKB17-20 (SE-A12, TK-04) không phản hồi nào (mọi phạm vi, mọi loại, danh sách và chi tiết) chứa băm, mã, token hay phiên', async () => {
      // Chứng minh các chuỗi mồi THẬT SỰ có trong DB: nếu không thì quét sạch chẳng nói lên điều gì.
      const hashes = await db.query(
        'SELECT COUNT(*) AS n FROM tai_khoan WHERE mat_khau_bam LIKE ?',
        [`%${PASSWORD_HASH_MARK}%`],
      );
      expect(Number(hashes[0].n)).toBeGreaterThan(10);
      const links = await db.query(
        'SELECT COUNT(*) AS n FROM ma_xac_thuc WHERE ma_bam = ?',
        [LINK_DIGEST],
      );
      expect(Number(links[0].n)).toBe(1);
      const sessions = await db.query(
        'SELECT COUNT(*) AS n FROM phien_dang_nhap WHERE refresh_token_bam LIKE ?',
        [`${REFRESH_MARK}%`],
      );
      expect(Number(sessions[0].n)).toBeGreaterThan(10);

      for (const scope of [system, scopeA, scopeB]) {
        const page = await list(scope);
        expect(page.total).toBeGreaterThan(0);
        expect(
          findSecretLeaks(JSON.parse(JSON.stringify(page)), SENTINELS),
        ).toEqual([]);
        for (const item of page.items) {
          const detail = await service.get(scope, item.taiKhoanId);
          expect(
            findSecretLeaks(JSON.parse(JSON.stringify(detail)), SENTINELS),
          ).toEqual([]);
        }
      }
    });

    it('TKB17-20 (SE-A12) hàng THÔ của repository có đúng tập khoá cố định, không cột nào khác', async () => {
      const { rows } = await repository.list(
        accountVisibility(new BranchAccessPolicy(), system),
        {},
        100,
        0,
      );
      expect(rows).toHaveLength(w.all.length);
      for (const row of rows)
        expect(Object.keys(row)).toEqual([...ACCOUNT_ROW_KEYS]);
      const detail = await repository.get(
        accountVisibility(new BranchAccessPolicy(), system),
        idOf(w.pendingDoctorA),
      );
      expect(Object.keys(detail!.row)).toEqual([...ACCOUNT_ROW_KEYS]);
      // Liên kết kích hoạt: chỉ bốn cột thời điểm, không id, không băm.
      expect(Object.keys(detail!.activationLink!).sort()).toEqual([
        'daDungLuc',
        'daGuiLuc',
        'hetHanLuc',
        'thuHoiLuc',
      ]);
    });
  });

  describe('thay đổi dữ liệu giữa hai lần gọi (thế giới dựng lại mỗi ca)', () => {
    beforeEach(reseed);

    it('TKB17-19 (PQ-09) lịch hẹn mới ở chi nhánh B ⇒ Admin B thấy Bệnh nhân ngay lần gọi sau, không bộ nhớ đệm', async () => {
      expect(seen(await list(scopeB))).not.toContain(idOf(w.onlyA));
      await bookAppointment(db, w.doctorB.profile, idOf(w.onlyA));
      expect(seen(await list(scopeB))).toContain(idOf(w.onlyA));
      expect((await service.get(scopeB, idOf(w.onlyA))).taiKhoanId).toBe(
        idOf(w.onlyA),
      );
    });

    it('TKB17-19 (PQ-09) Lễ tân đổi chi nhánh (UPDATE trực tiếp) ⇒ chuyển phạm vi ngay: A không còn thấy, B thấy', async () => {
      expect(seen(await list(scopeA))).toContain(idOf(w.receptionistA));
      await db.query(
        'UPDATE le_tan SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
        [w.branchB.chiNhanhId, idOf(w.receptionistA)],
      );
      expect(seen(await list(scopeA))).not.toContain(idOf(w.receptionistA));
      expect(
        (await failure(service.get(scopeA, idOf(w.receptionistA)))).getStatus(),
      ).toBe(404);
      expect(seen(await list(scopeB))).toContain(idOf(w.receptionistA));
      expect(await service.get(scopeB, idOf(w.receptionistA))).toMatchObject({
        chiNhanh: { chiNhanhId: w.branchB.chiNhanhId },
      });
    });
  });

  describe('lienKetKichHoat của nhân sự ChoKichHoat (thế giới dựng lại mỗi ca)', () => {
    beforeEach(reseed);

    const pendingStaff = async (label: string) =>
      (
        await fixtures.receptionist(w.branchA, {
          hoTen: label,
          email: `${label.replaceAll(' ', '.')}@example.com`,
          soDienThoai: '0911111111',
          trangThai: 'ChoKichHoat',
          matKhauBam: null,
        })
      ).account;
    const link = (accountId: string, overrides: object) =>
      insertMaXacThuc(db, accountId, {
        loai: 'KichHoatNhanSu',
        hoTenDangKy: null,
        soDienThoaiDangKy: null,
        matKhauBamDangKy: null,
        maBam: LINK_DIGEST.replace(/^c0ffee/, 'deadbe'),
        hetHanLuc: new Date('2026-12-01T00:00:00.000Z'),
        ...overrides,
      });

    it('TKB17-21 (TK A2) còn hạn ⇒ HOP_LE kèm hạn; đúng mốc hết hạn ⇒ HET_HAN; không có băm, không có id', async () => {
      const expiry = new Date('2026-12-01T00:00:00.000Z');
      await db.query(
        'UPDATE ma_xac_thuc SET het_han_luc = ? WHERE tai_khoan_id = ?',
        [expiry, idOf(w.pendingDoctorA)],
      );
      const clock = freezeTime(new Date(expiry.getTime() - 1000));
      const valid = await service.get(system, idOf(w.pendingDoctorA));
      expect(valid).toMatchObject({
        lienKetKichHoat: { trangThai: 'HOP_LE', hetHanLuc: expiry },
      });
      expect(Object.keys(valid).length).toBe(12);
      expect(
        Object.keys(
          (valid as { lienKetKichHoat: object }).lienKetKichHoat,
        ).sort(),
      ).toEqual(['hetHanLuc', 'trangThai']);
      clock.set(expiry);
      expect(await service.get(system, idOf(w.pendingDoctorA))).toMatchObject({
        lienKetKichHoat: { trangThai: 'HET_HAN', hetHanLuc: expiry },
      });
      expect(
        findSecretLeaks(
          JSON.parse(
            JSON.stringify(await service.get(system, idOf(w.pendingDoctorA))),
          ),
          SENTINELS,
        ),
      ).toEqual([]);
    });

    it('TKB17-21 nhiều hàng cũ + MỘT hàng đang hiệu lực ⇒ đúng hàng đang hiệu lực (không lấy hàng cũ đã thu hồi)', async () => {
      const staff = await pendingStaff('Le tan nhieu lien ket');
      const sent = new Date('2026-11-18T01:00:00.000Z');
      await link(staff.taiKhoanId, {
        daGuiLuc: sent,
        thuHoiLuc: sent,
        hetHanLuc: new Date('2026-11-25T00:00:00.000Z'),
      });
      await link(staff.taiKhoanId, {
        daGuiLuc: sent,
        thuHoiLuc: sent,
        hetHanLuc: new Date('2026-11-26T00:00:00.000Z'),
      });
      const current = new Date('2026-12-10T00:00:00.000Z');
      await link(staff.taiKhoanId, { daGuiLuc: sent, hetHanLuc: current });
      freezeTime(new Date('2026-11-19T00:00:00.000Z'));
      expect(await service.get(system, staff.taiKhoanId)).toMatchObject({
        lienKetKichHoat: { trangThai: 'HOP_LE', hetHanLuc: current },
      });
    });

    it('TKB17-21 chỉ có liên kết bị thu hồi, hoặc chưa gửi, hoặc không có hàng nào ⇒ lienKetKichHoat là null', async () => {
      const revoked = await pendingStaff('Le tan bi thu hoi');
      const sent = new Date('2026-11-18T01:00:00.000Z');
      await link(revoked.taiKhoanId, { daGuiLuc: sent, thuHoiLuc: sent });
      const unsent = await pendingStaff('Le tan chua gui');
      await link(unsent.taiKhoanId, { daGuiLuc: null });
      const nothing = await pendingStaff('Le tan khong co lien ket');
      for (const account of [revoked, unsent, nothing])
        expect(await service.get(system, account.taiKhoanId)).toMatchObject({
          lienKetKichHoat: null,
        });
    });

    it('TKB17-21 tài khoản KHÔNG ở trạng thái ChoKichHoat ⇒ lienKetKichHoat null (kể cả khi còn hàng cũ); Bệnh nhân không có khoá này', async () => {
      const active = idOf(w.doctorA);
      await link(active, { daGuiLuc: new Date('2026-11-18T01:00:00.000Z') });
      expect(await service.get(system, active)).toMatchObject({
        lienKetKichHoat: null,
      });
      expect(await service.get(system, idOf(w.onlyA))).not.toHaveProperty(
        'lienKetKichHoat',
      );
      expect(await service.get(scopeA, idOf(w.onlyA))).not.toHaveProperty(
        'lienKetKichHoat',
      );
    });

    it('TKB17-21 Chi nhánh thấy liên kết của nhân sự chi nhánh MÌNH; nhân sự chi nhánh khác ⇒ 404', async () => {
      expect(await service.get(scopeA, idOf(w.pendingDoctorA))).toMatchObject({
        lienKetKichHoat: {
          trangThai: expect.stringMatching(/HOP_LE|HET_HAN/) as string,
        },
      });
      const other = await fixtures.receptionist(w.branchB, {
        hoTen: 'Le tan B cho kich hoat',
        email: 'le.tan.b.cho@example.com',
        trangThai: 'ChoKichHoat',
        matKhauBam: null,
      });
      expect(
        (
          await failure(service.get(scopeA, other.account.taiKhoanId))
        ).getStatus(),
      ).toBe(404);
    });
  });
});
