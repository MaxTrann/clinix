import type { DataSource } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { AppointmentListFixtures } from '../testing/appointment-list-fixtures.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import {
  CODES,
  INACTIVE_RELATIVE_NAME,
  OperationsListFixtures,
  PATIENT_ONE,
  PATIENT_TWO,
  RELATIVE_NAME,
} from '../testing/operations-list-fixtures.js';
import type {
  OperationsAppointmentsPage,
  OperationsAppointmentsQuery,
} from './operations-appointments.dto.js';
import { OperationsAppointmentsRepository } from './operations-appointments.repository.js';
import { OperationsAppointmentsService } from './operations-appointments.service.js';

// Task B3 — danh sách lịch hẹn cho nhân sự ở tầng dịch vụ và kho trên MySQL 8.4 THẬT (PLAN booking 7.7; TRACKING 3.17.3): bộ lọc, ô tìm `q`, sắp xếp, phân trang, `DaDoiLich` mặc định, chuyên khoa
// HIỆN TẠI, dịch vụ, hình dạng. Phạm vi chi nhánh qua `AdminScope` kiểu `ChiNhanh` (Lễ tân và Quản trị viên Chi nhánh dùng chung); phạm vi `ToanHeThong` trên DB là DSV-02, DSV-03 của B4. Lễ tân
// (phạm vi từ DB, chi tiết, `chuyenDuoc[]`): reception-appointments.int-spec.ts; HTTP thật: test/booking-reception-appointments.e2e-spec.ts. Mã DSV-nn là PLAN 7.7; DSV-13, DSV-15 là [đề xuất].
// Dữ liệu giả (email đuôi example.com, SĐT minh hoạ). Đồng hồ ứng dụng giả = T0 (02/11/2026 08:00 giờ VN); danh sách không dùng giờ hiện tại.
let db: DataSource;
let fx: BookingFixtures;
let lf: AppointmentListFixtures;
let ofx: OperationsListFixtures;
let service: OperationsAppointmentsService;

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = new BookingFixtures(testDb);
  lf = new AppointmentListFixtures(fx, testDb);
  ofx = new OperationsListFixtures(fx, lf, testDb);
  service = new OperationsAppointmentsService(
    testDb,
    new OperationsAppointmentsRepository(),
    new BranchAccessPolicy(),
  );
});

const scopeOf = (branch: { chiNhanhId: string }): AdminScope => ({
  kind: 'ChiNhanh',
  chiNhanhId: branch.chiNhanhId,
});
// Đầu vào giống DTO đã kiểm: offset = (page - 1) * pageSize
const ask = (
  query: Partial<OperationsAppointmentsQuery> = {},
): OperationsAppointmentsQuery => {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  return { ...query, page, pageSize, offset: (page - 1) * pageSize };
};
const list = (
  branch: { chiNhanhId: string },
  query: Partial<OperationsAppointmentsQuery> = {},
  order: 'ASC' | 'DESC' = 'ASC',
) => service.list(scopeOf(branch), ask(query), order);
const codesOf = (page: OperationsAppointmentsPage) =>
  page.items.map((item) => item.maLichHen);

// Thứ tự giờ mặc định của chi nhánh A (bỏ a5 DaDoiLich): a1 (10/11 08:00), a2 (10/11 08:30), a3, a4, a6, a7
const DEFAULT_A = [CODES.a1, CODES.a2, CODES.a3, CODES.a4, CODES.a6, CODES.a7];

describe('DSV-01, DSV-05, DSV-12 phạm vi chi nhánh và tập trạng thái mặc định', () => {
  it('DSV-01 chi nhánh A chỉ thấy lịch của A (kể cả của Bệnh nhân cũng có lịch ở B); chi nhánh B chỉ thấy lịch của B; `chiNhanhId` của query không đổi phạm vi ChiNhanh', async () => {
    const w = await ofx.world();
    const a = await list(w.branchA);
    expect(codesOf(a)).toStrictEqual(DEFAULT_A);
    expect(a.total).toBe(6);
    const b = await list(w.branchB);
    expect(codesOf(b)).toStrictEqual([CODES.b1]);
    // Gửi chi nhánh B hay id không tồn tại với phạm vi A: kết quả y hệt không gửi
    for (const chiNhanhId of [w.branchB.chiNhanhId, '999999999'])
      expect(await list(w.branchA, { chiNhanhId })).toStrictEqual(a);
  });

  it('DSV-05 (A1) chi nhánh chưa có lịch nào: 200, `items` rỗng, `total` 0, đúng bốn khoá', async () => {
    await ofx.world();
    const empty = await ofx.branchWith('Bác Sĩ Trống');
    const page = await list(empty.branch);
    expect(page).toStrictEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('DSV-12 không `trangThai`: KHÔNG có DaDoiLich (a5); `trangThai=DaDoiLich` ⇒ hiện đúng dòng đó; kết hợp với trạng thái khác giữ thứ tự giờ', async () => {
    const w = await ofx.world();
    expect(codesOf(await list(w.branchA))).not.toContain(CODES.a5);
    expect(
      codesOf(await list(w.branchA, { trangThai: ['DaDoiLich'] })),
    ).toStrictEqual([CODES.a5]);
    expect(
      codesOf(await list(w.branchA, { trangThai: ['DaDoiLich', 'DaHuy'] })),
    ).toStrictEqual([CODES.a4, CODES.a5]);
    const replaced = await list(w.branchA, { trangThai: ['DaDoiLich'] });
    expect(replaced.items[0]?.trangThai).toBe('DaDoiLich');
  });
});

describe('DSV-04, DSV-11, DSV-15 bộ lọc', () => {
  it('DSV-04 `bacSiId`, `chuyenKhoaId`, `trangThai[]` đứng một mình và kết hợp (AND)', async () => {
    const w = await ofx.world();
    expect(
      codesOf(
        await list(w.branchA, { bacSiId: w.doctorA2.account.taiKhoanId }),
      ),
    ).toStrictEqual([CODES.a3, CODES.a4, CODES.a7]);
    expect(
      codesOf(
        await list(w.branchA, {
          chuyenKhoaId: w.doctorA1.profile.chuyenKhoaId,
        }),
      ),
    ).toStrictEqual([CODES.a1, CODES.a2, CODES.a6]);
    const states: TrangThaiLichHen[] = ['DaHuy', 'VangMat'];
    expect(codesOf(await list(w.branchA, { trangThai: states }))).toStrictEqual(
      [CODES.a4, CODES.a6],
    );
    expect(
      codesOf(
        await list(w.branchA, {
          chuyenKhoaId: w.doctorA1.profile.chuyenKhoaId,
          trangThai: ['DaXacNhan', 'VangMat'],
          tuNgay: '2026-11-11',
        }),
      ),
    ).toStrictEqual([CODES.a6]);
    // Id đúng dạng nhưng không tồn tại: 200 rỗng, không lỗi
    expect(
      (await list(w.branchA, { bacSiId: '999999999' })).items,
    ).toStrictEqual([]);
  });

  it('DSV-04 ngày giờ VN, khoảng đóng ở mức NGÀY: 00:00:00 của `tuNgay` và 23:59:59 của `denNgay` ở TRONG, 00:00:00 của ngày kế và 23:59:59 của ngày trước ở NGOÀI', async () => {
    const w = await ofx.world();
    const { a1, a2, a3, a6 } = w.apps;
    await lf.setTime(a1.lichHenId, '2026-11-10 00:00:00');
    await lf.setTime(a2.lichHenId, '2026-11-10 23:59:59');
    await lf.setTime(a3.lichHenId, '2026-11-11 00:00:00');
    await lf.setTime(a6.lichHenId, '2026-11-09 23:59:59');
    const within = await list(w.branchA, {
      tuNgay: '2026-11-10',
      denNgay: '2026-11-10',
    });
    expect(codesOf(within)).toStrictEqual([CODES.a1, CODES.a2]);
    // Chỉ một đầu: mở ở đầu kia
    expect(
      codesOf(await list(w.branchA, { denNgay: '2026-11-09' })),
    ).toStrictEqual([CODES.a6]);
    expect(
      codesOf(await list(w.branchA, { tuNgay: '2026-11-11' })).slice(0, 1),
    ).toStrictEqual([CODES.a3]);
  });

  it('DSV-11 đổi chuyên khoa của bác sĩ rồi lọc lịch CŨ: lịch cũ chuyển theo chuyên khoa HIỆN TẠI (L14), tên trên dòng là tên mới', async () => {
    const w = await ofx.world();
    const oldId = w.doctorA1.profile.chuyenKhoaId;
    const created = await fx.admin.catalog();
    await db.query(
      'UPDATE bac_si SET chuyen_khoa_id = ? WHERE tai_khoan_id = ?',
      [created.specialty.chuyenKhoaId, w.doctorA1.account.taiKhoanId],
    );
    expect(
      codesOf(await list(w.branchA, { chuyenKhoaId: oldId })),
    ).toStrictEqual([]);
    const moved = await list(w.branchA, {
      chuyenKhoaId: created.specialty.chuyenKhoaId,
    });
    expect(codesOf(moved)).toStrictEqual([CODES.a1, CODES.a2, CODES.a6]);
    for (const item of moved.items)
      expect(item.chuyenKhoa).toBe(created.specialty.ten);
  });

  it('DSV-15 `dichVuKhamId` lọc đúng dịch vụ của lịch (snapshot), và kết hợp với bác sĩ', async () => {
    const w = await ofx.world();
    const service2 = w.doctorA2.profile.dichVuKhamId;
    expect(
      codesOf(await list(w.branchA, { dichVuKhamId: service2 })),
    ).toStrictEqual([CODES.a3, CODES.a4, CODES.a7]);
    expect(
      codesOf(
        await list(w.branchA, {
          dichVuKhamId: service2,
          bacSiId: w.doctorA1.account.taiKhoanId,
        }),
      ),
    ).toStrictEqual([]);
    // Dịch vụ của chi nhánh khác không cho dòng nào của chi nhánh này
    expect(
      (await list(w.branchA, { dichVuKhamId: w.doctorB.profile.dichVuKhamId }))
        .items,
    ).toStrictEqual([]);
  });
});

describe('DSV-07 ô tìm q', () => {
  it('DSV-07 mã lịch: chữ thường, chữ hoa và khớp chứa đều ra cùng lịch', async () => {
    const w = await ofx.world();
    for (const q of [CODES.a3, CODES.a3.toLowerCase(), 'AAA03', 'aaa03'])
      expect(codesOf(await list(w.branchA, { q })), q).toStrictEqual([
        CODES.a3,
      ]);
    // Mã của chi nhánh khác không tìm thấy từ chi nhánh này
    expect((await list(w.branchA, { q: CODES.b1 })).items).toStrictEqual([]);
  });

  it('DSV-07 tên bác sĩ (không phân biệt hoa thường và dấu); tên người khám là người thân; tên người ĐẶT khớp cả lịch bản thân lẫn lịch người thân', async () => {
    const w = await ofx.world();
    expect(codesOf(await list(w.branchA, { q: 'bac si hai' }))).toStrictEqual([
      CODES.a3,
      CODES.a4,
      CODES.a7,
    ]);
    // Người thân (người khám) của a2: chỉ a2
    expect(codesOf(await list(w.branchA, { q: 'thị bình' }))).toStrictEqual([
      CODES.a2,
    ]);
    // Người đặt Nguyễn Văn An: a1 (bản thân), a2 (đặt cho người thân), a7 (đặt cho người thân đã ngừng)
    expect(codesOf(await list(w.branchA, { q: 'văn an' }))).toStrictEqual([
      CODES.a1,
      CODES.a2,
      CODES.a7,
    ]);
    // Người thân đã ngừng vẫn tìm được (lịch sử vẫn hiện tên)
    expect(codesOf(await list(w.branchA, { q: 'Lê Thị Cũ' }))).toStrictEqual([
      CODES.a7,
    ]);
  });

  it('DSV-07 `đ` gấp thành `d` ở tên: gõ "dang" tìm được "Đặng", gõ "ĐẶNG" tìm được cả hai cách viết', async () => {
    const w = await ofx.world();
    const expected = [CODES.a3, CODES.a4, CODES.a6];
    expect(codesOf(await list(w.branchA, { q: 'dang van' }))).toStrictEqual(
      expected,
    );
    expect(codesOf(await list(w.branchA, { q: 'ĐẶNG VĂN' }))).toStrictEqual(
      expected,
    );
  });

  it('DSV-07 SĐT người đặt: chữ số liền, có dấu cách hoặc dấu chấm, khớp một phần; từ khoá có chữ thì không tìm SĐT', async () => {
    const w = await ofx.world();
    const one = [CODES.a1, CODES.a2, CODES.a7];
    for (const q of ['0911111111', '0911 111.111', '911111'])
      expect(codesOf(await list(w.branchA, { q })), q).toStrictEqual(one);
    expect(
      codesOf(await list(w.branchA, { q: PATIENT_TWO.soDienThoai })),
    ).toStrictEqual([CODES.a3, CODES.a4, CODES.a6]);
    // Không phải SĐT của ai: rỗng; SĐT của bác sĩ (không hiện trên dòng) KHÔNG tìm được
    expect((await list(w.branchA, { q: '0999999999' })).items).toStrictEqual(
      [],
    );
    expect((await list(w.branchA, { q: '0987000111' })).items).toStrictEqual(
      [],
    );
  });

  it('DSV-07 `%`, `_`, `!` là ký tự thường: không khớp tất cả, không lỗi SQL', async () => {
    const w = await ofx.world();
    for (const q of ['%%', '_%', '!!', 'a%b', '%_!'])
      expect((await list(w.branchA, { q })).items, q).toStrictEqual([]);
    expect((await list(w.branchA, { q: 'Bác Sĩ Một' })).total).toBe(3);
  });
});

describe('DSV-06 sắp xếp và phân trang', () => {
  it('DSV-06 `thoi_gian` tăng rồi `lich_hen_id` tăng (hai lịch CÙNG giờ theo thứ tự dựng); chiều giảm đảo cả hai', async () => {
    const w = await ofx.world();
    await lf.setTime(w.apps.a2.lichHenId, '2026-11-10 08:00:00');
    await lf.setTime(w.apps.a1.lichHenId, '2026-11-10 08:00:00');
    const ascending = codesOf(await list(w.branchA));
    expect(ascending.slice(0, 2)).toStrictEqual([CODES.a1, CODES.a2]);
    const descending = codesOf(await list(w.branchA, {}, 'DESC'));
    expect(descending).toStrictEqual([...ascending].reverse());
  });

  it('DSV-06 trang 2 cỡ 2 lấy hai dòng kế; `total` không đổi; trang vượt cuối và `page` cực lớn: 200 rỗng, `total` đúng, không 500', async () => {
    const w = await ofx.world();
    const second = await list(w.branchA, { page: 2, pageSize: 2 });
    expect(codesOf(second)).toStrictEqual([CODES.a3, CODES.a4]);
    expect(second).toMatchObject({ total: 6, page: 2, pageSize: 2 });
    const beyond = await list(w.branchA, { page: 4, pageSize: 2 });
    expect(beyond).toStrictEqual({ items: [], total: 6, page: 4, pageSize: 2 });
    const huge = await list(w.branchA, {
      page: Number.MAX_SAFE_INTEGER,
      pageSize: 100,
    });
    expect(huge.items).toStrictEqual([]);
    expect(huge.total).toBe(6);
  });
});

describe('DSV-13 hình dạng và người đặt / người khám', () => {
  it('DSV-13 mỗi dòng đúng MƯỜI MỘT khoá, kiểu từng khoá; không `hanThanhToan`, `choPhepHuy`, id nào', async () => {
    const w = await ofx.world();
    const page = await list(w.branchA);
    for (const item of page.items)
      expect(Object.keys(item).sort()).toStrictEqual([
        'bacSi',
        'chiNhanh',
        'chuyenKhoa',
        'dichVu',
        'giaSnapshot',
        'maLichHen',
        'nguoiDat',
        'nguoiKham',
        'thoiGian',
        'tienCoc',
        'trangThai',
      ]);
    const first = page.items[0];
    expect(first).toMatchObject({
      maLichHen: CODES.a1,
      trangThai: 'DaXacNhan',
      bacSi: 'Bác Sĩ Một',
      chiNhanh: w.branchA.ten,
      giaSnapshot: '100000.00',
      tienCoc: '0.00',
    });
    expect(first?.thoiGian).toBe(w.apps.a1.thoiGian.toISOString());
    expect(JSON.stringify(page)).not.toMatch(/lichHenId|benhNhanId|email|@/);
  });

  it('DSV-13 người đặt và người khám KHÔNG lẫn: lịch bản thân (người khám là người đặt), lịch người thân (người khám là người thân, người đặt là tài khoản), người thân đã ngừng vẫn hiện', async () => {
    const w = await ofx.world();
    const items = new Map(
      (await list(w.branchA)).items.map((item) => [item.maLichHen, item]),
    );
    const order = {
      hoTen: PATIENT_ONE.hoTen,
      soDienThoai: PATIENT_ONE.soDienThoai,
    };
    expect(items.get(CODES.a1)).toMatchObject({
      nguoiDat: order,
      nguoiKham: { hoTen: PATIENT_ONE.hoTen, laBanThan: true },
    });
    expect(items.get(CODES.a2)).toMatchObject({
      nguoiDat: order,
      nguoiKham: { hoTen: RELATIVE_NAME, laBanThan: false },
    });
    expect(items.get(CODES.a7)).toMatchObject({
      nguoiDat: order,
      nguoiKham: { hoTen: INACTIVE_RELATIVE_NAME, laBanThan: false },
    });
    expect(items.get(CODES.a3)?.nguoiDat).toStrictEqual({
      hoTen: PATIENT_TWO.hoTen,
      soDienThoai: PATIENT_TWO.soDienThoai,
    });
  });
});
