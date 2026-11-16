import { vi } from 'vitest';
import {
  recordStatements,
  WRITE_OR_LOCK_SQL,
} from '../../../appointments/testing/statement-recorder.js';
import {
  db,
  fx,
  useStatusWorldHooks,
  world,
} from '../../../appointments/testing/status-int-kit.js';
import { AppException } from '../../../common/errors/app.exception.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import {
  adminRatingsService,
  branchScope,
  day,
  FORBIDDEN_ADMIN_RATING_KEYS,
  ids,
  idsOf,
  moderationWorld,
  ratingsQuery,
  seedThreeBranches,
  SYSTEM_SCOPE,
  untouchedByModerationRead,
  type SeededRating,
  type ThreeBranches,
} from '../testing/moderation-stack.js';
import { keysDeep } from '../testing/patient-exam-stack.js';
import type { AdminRatingsQuery } from './admin-ratings.dto.js';

// doctor-exam B7 — AdminRatingsService THẬT trên MySQL 8.4 THẬT (PLAN 5.8, 5.15; 7.5 KDD-01, KDD-02, KDD-03; 7.7 QHK-06, QHK-07, QHK-11; `[đề xuất]` KDD-17 đến KDD-22): `runReadOnly` THẬT, hai câu SELECT THẬT của danh sách và MỘT câu của chi tiết.
// Phần ĐƠN VỊ (không DB): admin-ratings.*.spec.ts. Phần HTTP: test/doctor-exam-admin-ratings.e2e-spec.ts. Số đo M8 ở 20.000 đánh giá: spec đo tạm (TRACKING 23, không nằm trong repo).
// Dữ liệu giả; ba chi nhánh với SỐ ĐẾM KHÁC HẲN NHAU (A: 2 hiển thị + 1 ẩn, B: 3 + 3, C: 1 + 0) để một số liệu rò từ chi nhánh khác lộ ngay. Mọi giá trị mong đợi (id theo thứ tự, số đếm, tên) do test viết tay.
useStatusWorldHooks();

const NOT_FOUND_BODY = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};
const SELECT = /^\s*SELECT\b/i;

async function setup() {
  const m = await moderationWorld(db, fx, await world());
  const service = adminRatingsService(db);
  return {
    m,
    service,
    list: (
      scope: AdminScope,
      overrides: Partial<Omit<AdminRatingsQuery, 'offset'>> = {},
    ) => service.list(scope, ratingsQuery(overrides)),
  };
}

const counts = (HienThi: number, DaAn: number) => ({ HienThi, DaAn });

/** Lỗi ném ra (hoặc `null` nếu không lỗi): để so CẢ thân của 404, không chỉ mã. */
const failureOf = (work: Promise<unknown>): Promise<unknown> =>
  work.then(
    () => null,
    (error: unknown) => error,
  );

describe('KDD-01, QHK-11 phạm vi chi nhánh: danh sách, total và demTheoTrangThai', () => {
  it('Toàn hệ thống thấy cả mười đánh giá, mới nhất trước; total 10 và demTheoTrangThai 6 hiển thị, 4 đã ẩn', async () => {
    const t = await setup();
    const s = await seedThreeBranches(t.m);
    const page = await t.list(SYSTEM_SCOPE);
    expect(idsOf(page)).toEqual(
      ids(s.c1, s.b6, s.b5, s.b4, s.b3, s.b2, s.b1, s.a3, s.a2, s.a1),
    );
    expect(page).toMatchObject({
      total: 10,
      page: 1,
      pageSize: 20,
      demTheoTrangThai: counts(6, 4),
    });
    // Hình dạng ĐỦ của hai dòng danh sách (giá trị viết tay): tên bác sĩ, tên người đặt và tên chi nhánh của LỊCH không bị lộn bí danh (đột biến M22 chỉ e2e bắt khi int chưa khẳng định các tên này)
    expect(page.items[0]).toEqual({
      danhGiaId: s.c1.danhGiaId,
      bacSi: {
        bacSiId: t.m.doctors.c.account.taiKhoanId,
        hoTen: 'Bác sĩ Xê',
      },
      chiNhanh: {
        chiNhanhId: t.m.branches.c.chiNhanhId,
        ten: 'Chi nhánh Ba',
      },
      nguoiDanhGia: { hoTen: 'Lê Hoàng Cường' },
      soSao: 5,
      nhanXet: 'Rất hài lòng',
      thoiDiemTao: '2026-11-10T02:00:00.000Z',
      biAn: false,
    });
    expect(page.items[1]).toEqual({
      danhGiaId: s.b6.danhGiaId,
      bacSi: {
        bacSiId: t.m.doctors.b.account.taiKhoanId,
        hoTen: 'Bác sĩ Bê',
      },
      chiNhanh: {
        chiNhanhId: t.m.branches.b.chiNhanhId,
        ten: 'Chi nhánh Hai',
      },
      nguoiDanhGia: { hoTen: 'Nguyễn Văn An' },
      soSao: 4,
      nhanXet: 'Ổn',
      thoiDiemTao: '2026-11-09T02:00:00.000Z',
      biAn: true,
    });
  });

  it.each([
    ['A', 'a', ['a3', 'a2', 'a1'], 3, counts(2, 1)],
    ['B', 'b', ['b6', 'b5', 'b4', 'b3', 'b2', 'b1'], 6, counts(3, 3)],
    ['C', 'c', ['c1'], 1, counts(1, 0)],
  ] as const)(
    'QHK-11 Admin Chi nhánh %s chỉ thấy đánh giá của lịch ở chi nhánh mình; total và demTheoTrangThai KHÔNG chứa số của chi nhánh khác',
    async (_ten, branch, expected, total, dem) => {
      const t = await setup();
      const s = await seedThreeBranches(t.m);
      const page = await t.list(branchScope(t.m.branches[branch].chiNhanhId));
      expect(idsOf(page)).toEqual(
        expected.map((name) => s[name as keyof ThreeBranches].danhGiaId),
      );
      expect(page.total).toBe(total);
      expect(page.demTheoTrangThai).toEqual(dem);
    },
  );

  it('Admin Chi nhánh A lọc trangThai DaAn: chỉ đánh giá ẩn của A; demTheoTrangThai vẫn đếm cả hai trạng thái CỦA A', async () => {
    const t = await setup();
    const s = await seedThreeBranches(t.m);
    const page = await t.list(branchScope(t.m.branches.a.chiNhanhId), {
      trangThai: 'DaAn',
    });
    expect(idsOf(page)).toEqual(ids(s.a3));
    expect(page.total).toBe(1);
    expect(page.demTheoTrangThai).toEqual(counts(2, 1));
  });

  it('chi nhánh không có đánh giá nào ⇒ items rỗng, total 0, demTheoTrangThai 0 (không lỗi)', async () => {
    const t = await setup();
    await seedThreeBranches(t.m);
    const lonely = await fx.admin.branch();
    const page = await t.list(branchScope(lonely.chiNhanhId));
    expect(page).toMatchObject({
      items: [],
      total: 0,
      demTheoTrangThai: counts(0, 0),
    });
  });

  it('L10 bác sĩ đổi chi nhánh SAU khi khám: đánh giá cũ vẫn thuộc chi nhánh của LỊCH (A), đánh giá mới thuộc chi nhánh mới (B)', async () => {
    const t = await setup();
    const before = await t.m.seed({ at: day(1) });
    await t.m.moveDoctor(t.m.doctors.a, t.m.branches.b.chiNhanhId);
    const after = await t.m.seed({ at: day(2) });
    const adminA = await t.list(branchScope(t.m.branches.a.chiNhanhId));
    const adminB = await t.list(branchScope(t.m.branches.b.chiNhanhId));
    expect(idsOf(adminA)).toEqual(ids(before));
    expect(idsOf(adminB)).toEqual(ids(after));
    expect(adminA.demTheoTrangThai).toEqual(counts(1, 0));
    expect(adminA.items[0]?.chiNhanh.ten).toBe(t.m.names.branchA);
    expect(adminB.items[0]?.chiNhanh.ten).toBe(t.m.names.branchB);
    // bác sĩ là CÙNG một người ở cả hai dòng
    expect(adminA.items[0]?.bacSi.bacSiId).toBe(adminB.items[0]?.bacSi.bacSiId);
  });
});

describe('QHK-07 chiNhanhId ở query', () => {
  it('Admin Chi nhánh A gửi chiNhanhId của B hay của A: luôn ra đúng tập của A (bị ÉP, giá trị gửi lên bị bỏ qua)', async () => {
    const t = await setup();
    const s = await seedThreeBranches(t.m);
    const scope = branchScope(t.m.branches.a.chiNhanhId);
    for (const asked of [
      t.m.branches.b.chiNhanhId,
      t.m.branches.a.chiNhanhId,
      '999999999',
    ]) {
      const page = await t.list(scope, { chiNhanhId: asked });
      expect(idsOf(page)).toEqual(ids(s.a3, s.a2, s.a1));
      expect(page.demTheoTrangThai).toEqual(counts(2, 1));
    }
  });

  it('Toàn hệ thống: chiNhanhId lọc đúng chi nhánh đó; id đúng dạng mà không có chi nhánh ⇒ 200 rỗng, không lỗi', async () => {
    const t = await setup();
    const s = await seedThreeBranches(t.m);
    const b = await t.list(SYSTEM_SCOPE, {
      chiNhanhId: t.m.branches.b.chiNhanhId,
    });
    expect(idsOf(b)).toEqual(ids(s.b6, s.b5, s.b4, s.b3, s.b2, s.b1));
    expect(b.demTheoTrangThai).toEqual(counts(3, 3));
    const none = await t.list(SYSTEM_SCOPE, { chiNhanhId: '999999999' });
    expect(none).toMatchObject({
      items: [],
      total: 0,
      demTheoTrangThai: counts(0, 0),
    });
  });
});

describe('KDD-02 bộ lọc và thứ tự', () => {
  it('trangThai: HienThi ra sáu đánh giá hiển thị, DaAn ra bốn đã ẩn; demTheoTrangThai KHÔNG đổi theo trangThai', async () => {
    const t = await setup();
    const s = await seedThreeBranches(t.m);
    const shown = await t.list(SYSTEM_SCOPE, { trangThai: 'HienThi' });
    const hidden = await t.list(SYSTEM_SCOPE, { trangThai: 'DaAn' });
    expect(idsOf(shown)).toEqual(ids(s.c1, s.b4, s.b2, s.b1, s.a2, s.a1));
    expect(shown.total).toBe(6);
    expect(idsOf(hidden)).toEqual(ids(s.b6, s.b5, s.b3, s.a3));
    expect(hidden.total).toBe(4);
    expect(shown.demTheoTrangThai).toEqual(counts(6, 4));
    expect(hidden.demTheoTrangThai).toEqual(counts(6, 4));
  });

  it('soSao: demTheoTrangThai áp soSao (đếm lại theo bộ lọc), total theo trangThai', async () => {
    const t = await setup();
    const s = await seedThreeBranches(t.m);
    const five = await t.list(SYSTEM_SCOPE, { soSao: 5 });
    expect(idsOf(five)).toEqual(ids(s.c1, s.b4, s.a1));
    expect(five.demTheoTrangThai).toEqual(counts(3, 0));
    const one = await t.list(SYSTEM_SCOPE, { soSao: 1 });
    expect(idsOf(one)).toEqual(ids(s.b5, s.b3, s.a3));
    expect(one.demTheoTrangThai).toEqual(counts(0, 3));
    const oneShown = await t.list(SYSTEM_SCOPE, {
      soSao: 1,
      trangThai: 'HienThi',
    });
    expect(oneShown).toMatchObject({
      items: [],
      total: 0,
      demTheoTrangThai: counts(0, 3),
    });
  });

  it('bacSiId: chỉ đánh giá của bác sĩ đó; bác sĩ B với chiNhanhId A ⇒ rỗng (lịch của B nằm ở chi nhánh B); id vượt BIGINT (đúng dạng, không có dòng) ⇒ rỗng, không 500', async () => {
    const t = await setup();
    const s = await seedThreeBranches(t.m);
    const doctorB = t.m.doctors.b.account.taiKhoanId;
    const page = await t.list(SYSTEM_SCOPE, { bacSiId: doctorB });
    expect(idsOf(page)).toEqual(ids(s.b6, s.b5, s.b4, s.b3, s.b2, s.b1));
    expect(page.demTheoTrangThai).toEqual(counts(3, 3));
    const crossed = await t.list(SYSTEM_SCOPE, {
      bacSiId: doctorB,
      chiNhanhId: t.m.branches.a.chiNhanhId,
    });
    expect(crossed).toMatchObject({ items: [], total: 0 });
    for (const huge of ['9223372036854775808', '9999999999999999999'])
      expect(await t.list(SYSTEM_SCOPE, { bacSiId: huge })).toMatchObject({
        items: [],
        total: 0,
        demTheoTrangThai: counts(0, 0),
      });
  });

  it('Admin Chi nhánh A lọc bacSiId của bác sĩ B ⇒ rỗng (phạm vi và bộ lọc cùng áp, không "nới" nhau)', async () => {
    const t = await setup();
    await seedThreeBranches(t.m);
    const page = await t.list(branchScope(t.m.branches.a.chiNhanhId), {
      bacSiId: t.m.doctors.b.account.taiKhoanId,
    });
    expect(page).toMatchObject({
      items: [],
      total: 0,
      demTheoTrangThai: counts(0, 0),
    });
  });

  it('kết hợp nhiều bộ lọc: bác sĩ B, người đặt "Cường", 5 sao, hiển thị ⇒ đúng b4', async () => {
    const t = await setup();
    const s = await seedThreeBranches(t.m);
    const page = await t.list(SYSTEM_SCOPE, {
      bacSiId: t.m.doctors.b.account.taiKhoanId,
      q: 'Cường',
      soSao: 5,
      trangThai: 'HienThi',
    });
    expect(idsOf(page)).toEqual(ids(s.b4));
    expect(page.demTheoTrangThai).toEqual(counts(1, 0));
  });

  it('thứ tự: thoi_diem_tao giảm dần; CÙNG giờ thì id giảm dần (đánh giá dựng sau đứng trước)', async () => {
    const t = await setup();
    const early = await t.m.seed({ at: day(1) });
    const same1 = await t.m.seed({ at: day(2) });
    const same2 = await t.m.seed({ at: day(2) });
    const same3 = await t.m.seed({ at: day(2) });
    const late = await t.m.seed({ at: day(3) });
    expect(idsOf(await t.list(SYSTEM_SCOPE))).toEqual(
      ids(late, same3, same2, same1, early),
    );
  });
});

describe('KDD-19 q: tên người đặt và nhận xét, LIKE đã thoát', () => {
  it('tên người đặt khớp có dấu, không dấu và không phân biệt hoa thường (collation); khớp tên người đặt KHÔNG khớp tên bác sĩ', async () => {
    const t = await setup();
    const s = await seedThreeBranches(t.m);
    // "Nguyễn Văn An" đặt a1, a3, b1, b6
    for (const q of ['Nguyễn', 'nguyen', 'NGUYỄN VĂN', 'văn an']) {
      const page = await t.list(SYSTEM_SCOPE, { q });
      expect(idsOf(page), q).toEqual(ids(s.b6, s.b1, s.a3, s.a1));
      expect(page.demTheoTrangThai, q).toEqual(counts(2, 2));
    }
    // tên bác sĩ KHÔNG được tìm bằng q (lọc bác sĩ có bacSiId)
    for (const q of ['Bác sĩ Bê', 'Bê', 'Ây'])
      expect((await t.list(SYSTEM_SCOPE, { q })).total, q).toBe(0);
  });

  it('nhận xét khớp theo chữ; q khớp tên ở dòng này và nhận xét ở dòng khác ⇒ cả hai dòng; demTheoTrangThai và total dùng CÙNG q', async () => {
    const t = await setup();
    const s = await seedThreeBranches(t.m);
    const comment = await t.list(SYSTEM_SCOPE, { q: 'chờ lâu' });
    expect(idsOf(comment)).toEqual(ids(s.b2));
    // "Khám" có ở nhận xét a2 ("Khám kỹ lưỡng"); không ở tên ai
    expect(idsOf(await t.list(SYSTEM_SCOPE, { q: 'khám kỹ' }))).toEqual(
      ids(s.a2),
    );
    // "Bình" là tên người đặt a2, b2, b5; "Spam" ở nhận xét a3 và b5 (b5 khớp cả hai nên MỘT dòng)
    const both = await t.list(SYSTEM_SCOPE, { q: 'Bình' });
    expect(idsOf(both)).toEqual(ids(s.b5, s.b2, s.a2));
    const mixed = await t.list(SYSTEM_SCOPE, { q: 'spam' });
    expect(idsOf(mixed)).toEqual(ids(s.b5, s.a3));
    expect(mixed.total).toBe(2);
    expect(mixed.demTheoTrangThai).toEqual(counts(0, 2));
    const withStatus = await t.list(SYSTEM_SCOPE, {
      q: 'Cường',
      trangThai: 'DaAn',
    });
    expect(idsOf(withStatus)).toEqual(ids(s.b3));
    expect(withStatus.demTheoTrangThai).toEqual(counts(2, 1));
  });

  it('q chứa %, _, !, \\: chỉ khớp ký tự đó theo NGHĨA ĐEN; "khớp tất cả" của ký tự đại diện KHÔNG xảy ra; chuỗi toàn ký tự đặc biệt không lỗi', async () => {
    const t = await setup();
    const { one, two, three } = t.m.buyers;
    await t.m.renameAccount(one, 'Phan 50% Nam');
    await t.m.renameAccount(two, 'Đỗ_Lan');
    await t.m.renameAccount(three, 'Vũ!Hùng');
    const r1 = await t.m.seed({ buyer: one, at: day(1), nhanXet: 'Tốt' });
    const r2 = await t.m.seed({
      buyer: two,
      at: day(2),
      nhanXet: 'Giảm 50% phí',
    });
    const r3 = await t.m.seed({
      buyer: three,
      at: day(3),
      nhanXet: 'đường dẫn C:\\Lưu',
    });
    const r4 = await t.m.seed({ buyer: two, at: day(4), nhanXet: 'a_b' });
    const r5 = await t.m.seed({ buyer: one, at: day(5), nhanXet: 'axb' });
    const found = async (q: string) => idsOf(await t.list(SYSTEM_SCOPE, { q }));
    expect(await found('%')).toEqual(ids(r5, r2, r1)); // tên "50%" (r1, r5) và nhận xét "50%" (r2)
    expect(await found('50%')).toEqual(ids(r5, r2, r1));
    expect(await found('_')).toEqual(ids(r4, r2)); // tên "Đỗ_Lan" của hai dòng của người đặt hai
    expect(await found('a_b')).toEqual(ids(r4)); // "axb" KHÔNG khớp (`_` không phải ký tự đại diện)
    expect(await found('!')).toEqual(ids(r3));
    expect(await found('\\')).toEqual(ids(r3));
    expect(await found('%_!\\')).toEqual([]);
    expect(await found('%%')).toEqual([]);
  });

  it('GHI NHẬN hành vi collation: "duc" KHÔNG khớp "Đức" (`d` khác `đ` ở utf8mb4_unicode_ci); không gấp `đ` ở B7 (TECH_DEBT 167)', async () => {
    const t = await setup();
    await t.m.renameAccount(t.m.buyers.three, 'Đức Anh');
    await t.m.seed({ buyer: t.m.buyers.three, at: day(1) });
    expect((await t.list(SYSTEM_SCOPE, { q: 'Đức' })).total).toBe(1);
    expect((await t.list(SYSTEM_SCOPE, { q: 'duc' })).total).toBe(0);
  });
});

describe('KDD-18 nhận xét ở danh sách cắt 200 đơn vị UTF-16, ở chi tiết đầy đủ', () => {
  it('199, 200, 201 và 1.000 đơn vị; emoji vắt qua điểm cắt không bị cắt đôi; NULL giữ null; chi tiết trả đủ', async () => {
    const t = await setup();
    const texts: Record<string, string | null> = {
      c199: 'a'.repeat(199),
      c200: 'a'.repeat(200),
      c201: 'a'.repeat(201),
      full: 'x'.repeat(1000),
      emoji199: `${'a'.repeat(199)}😀`,
      emoji198: `${'a'.repeat(198)}😀b`,
      none: null,
    };
    const seeded: Record<string, SeededRating> = {};
    let at = 1;
    for (const [name, nhanXet] of Object.entries(texts)) {
      seeded[name] = await t.m.seed({ at: day(at), nhanXet });
      at += 1;
    }
    const page = await t.list(SYSTEM_SCOPE);
    const listed = (name: string) =>
      page.items.find((item) => item.danhGiaId === seeded[name]?.danhGiaId)
        ?.nhanXet;
    expect(listed('c199')).toBe('a'.repeat(199));
    expect(listed('c200')).toBe('a'.repeat(200));
    expect(listed('c201')).toBe('a'.repeat(200));
    expect(listed('full')).toBe('x'.repeat(200));
    expect(listed('emoji199')).toBe('a'.repeat(199)); // cặp thay thế vắt qua chỉ số 199 và 200: bỏ cả emoji
    expect(listed('emoji198')).toBe(`${'a'.repeat(198)}😀`); // emoji nằm trọn trong 200 đơn vị
    expect(listed('none')).toBeNull();
    for (const name of ['full', 'emoji199', 'emoji198', 'c201']) {
      const detail = await t.service.get(
        SYSTEM_SCOPE,
        seeded[name]?.danhGiaId ?? '',
      );
      expect(detail.nhanXet, name).toBe(texts[name]);
    }
  });
});

describe('KDD-03, QHK-06 chi tiết', () => {
  it('đủ trường theo giá trị viết tay: bác sĩ, chi nhánh LỊCH, người đặt, mã lịch, giờ khám và giờ gửi ISO UTC; chưa ẩn thì KHÔNG có khoá lyDoAn', async () => {
    const t = await setup();
    const r = await t.m.seed({
      doctor: t.m.doctors.b,
      buyer: t.m.buyers.two,
      at: '2026-11-05 09:00:00',
      visitAt: '2026-11-03 08:30:00',
      soSao: 2,
      nhanXet: 'Chờ lâu',
    });
    const detail = await t.service.get(SYSTEM_SCOPE, r.danhGiaId);
    expect(detail).toEqual({
      danhGiaId: r.danhGiaId,
      bacSi: {
        bacSiId: t.m.doctors.b.account.taiKhoanId,
        hoTen: 'Bác sĩ Bê',
      },
      chiNhanh: {
        chiNhanhId: t.m.branches.b.chiNhanhId,
        ten: 'Chi nhánh Hai',
      },
      nguoiDanhGia: { hoTen: 'Trần Thị Bình' },
      soSao: 2,
      nhanXet: 'Chờ lâu',
      thoiDiemTao: '2026-11-05T02:00:00.000Z',
      biAn: false,
      maLichHen: r.maLichHen,
      thoiGianKham: '2026-11-03T01:30:00.000Z',
    });
    expect('lyDoAn' in detail).toBe(false);
  });

  it('đánh giá đã ẩn: biAn true và lyDoAn đúng chữ lý do; nhận xét NULL ⇒ null', async () => {
    const t = await setup();
    const r = await t.m.seed({
      at: day(1),
      nhanXet: null,
      hiddenReason: 'Nội dung quảng cáo',
    });
    const detail = await t.service.get(SYSTEM_SCOPE, r.danhGiaId);
    expect(detail).toMatchObject({
      biAn: true,
      lyDoAn: 'Nội dung quảng cáo',
      nhanXet: null,
    });
  });

  it('KDD-20 không khoá nào của hồ sơ khám, liên hệ hay id nội bộ ở danh sách lẫn chi tiết (kể cả lồng nhau)', async () => {
    const t = await setup();
    const s = await seedThreeBranches(t.m);
    await t.m.exam.record(s.a1.lichHenId);
    const list = await t.list(SYSTEM_SCOPE);
    const detail = await t.service.get(SYSTEM_SCOPE, s.a1.danhGiaId);
    for (const value of [list, detail])
      for (const key of keysDeep(value))
        expect(FORBIDDEN_ADMIN_RATING_KEYS as readonly string[]).not.toContain(
          key,
        );
    // dữ liệu nhạy cảm đã gài vào DB không lọt vào phản hồi dạng chuỗi
    const text = JSON.stringify([list, detail]);
    expect(text).not.toMatch(/example\.com|Ho khan|Viêm họng/);
  });

  it('không có đánh giá ⇒ 404 KHONG_TIM_THAY', async () => {
    const t = await setup();
    const error = await failureOf(t.service.get(SYSTEM_SCOPE, '999999999'));
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(404);
    expect((error as AppException).getResponse()).toEqual(NOT_FOUND_BODY);
  });

  it('QHK-06 Admin Chi nhánh A xem đánh giá của chi nhánh B ⇒ 404 CÙNG thân với "không có"; đánh giá của chi nhánh mình thì xem được; Toàn hệ thống xem cả hai', async () => {
    const t = await setup();
    const s = await seedThreeBranches(t.m);
    const scopeA = branchScope(t.m.branches.a.chiNhanhId);
    const outside = await failureOf(t.service.get(scopeA, s.b1.danhGiaId));
    const missing = await failureOf(t.service.get(scopeA, '999999999'));
    expect(outside).toBeInstanceOf(AppException);
    expect((outside as AppException).getStatus()).toBe(404);
    expect((outside as AppException).getResponse()).toEqual(
      (missing as AppException).getResponse(),
    );
    expect((outside as AppException).getResponse()).toEqual(NOT_FOUND_BODY);
    expect((await t.service.get(scopeA, s.a1.danhGiaId)).danhGiaId).toBe(
      s.a1.danhGiaId,
    );
    for (const r of [s.a1, s.b1, s.c1])
      expect((await t.service.get(SYSTEM_SCOPE, r.danhGiaId)).danhGiaId).toBe(
        r.danhGiaId,
      );
  });

  it('L10 bác sĩ đổi chi nhánh sau khi khám: Admin của chi nhánh CŨ (nơi đặt lịch) xem được, Admin của chi nhánh mới thì 404', async () => {
    const t = await setup();
    const r = await t.m.seed({ at: day(1) });
    await t.m.moveDoctor(t.m.doctors.a, t.m.branches.b.chiNhanhId);
    const scopeA = branchScope(t.m.branches.a.chiNhanhId);
    const scopeB = branchScope(t.m.branches.b.chiNhanhId);
    expect((await t.service.get(scopeA, r.danhGiaId)).chiNhanh.ten).toBe(
      t.m.names.branchA,
    );
    const error = await failureOf(t.service.get(scopeB, r.danhGiaId));
    expect((error as AppException).getStatus()).toBe(404);
  });
});

describe('KDD-22 phân trang', () => {
  it('45 đánh giá, pageSize 20 ⇒ 20, 20, 5; hợp ba trang đúng 45 dòng không trùng không sót; trang vượt cuối ⇒ rỗng kèm total đúng; offset lấy từ getter THẬT của DTO', async () => {
    const t = await setup();
    const all: string[] = [];
    for (let n = 0; n < 45; n += 1)
      all.push(
        (
          await t.m.seed({
            at: `2026-11-10 10:${String(n).padStart(2, '0')}:00`,
          })
        ).danhGiaId,
      );
    const expected = all.toReversed(); // mới nhất trước
    const pages = [
      await t.list(SYSTEM_SCOPE, { page: 1 }),
      await t.list(SYSTEM_SCOPE, { page: 2 }),
      await t.list(SYSTEM_SCOPE, { page: 3 }),
    ];
    expect(pages.map((p) => p.items.length)).toEqual([20, 20, 5]);
    expect(pages.flatMap(idsOf)).toEqual(expected);
    for (const p of pages) expect(p.total).toBe(45);
    const beyond = await t.list(SYSTEM_SCOPE, { page: 4 });
    expect(beyond).toMatchObject({
      items: [],
      total: 45,
      page: 4,
      demTheoTrangThai: counts(45, 0),
    });
    const huge = await t.list(SYSTEM_SCOPE, { page: 1_000_000_000 });
    expect(huge).toMatchObject({ items: [], total: 45 });
    const single = await t.list(SYSTEM_SCOPE, { page: 45, pageSize: 1 });
    expect(idsOf(single)).toEqual([expected[44]]);
    const wide = await t.list(SYSTEM_SCOPE, { pageSize: 50 });
    expect(idsOf(wide)).toEqual(expected);
  });

  it('cùng thoi_diem_tao vắt qua ranh giới trang: 5 đánh giá cùng giờ, pageSize 2 ⇒ ba trang đúng 5·4, 3·2, 1 (tiêu chí phụ id giảm dần của truy vấn con quyết dòng nào lọt vào trang; đột biến M13 chỉ sql.spec bắt khi int chưa có ca này)', async () => {
    const t = await setup();
    const same: SeededRating[] = [];
    for (let n = 0; n < 5; n += 1) same.push(await t.m.seed({ at: day(2) }));
    const [r1, r2, r3, r4, r5] = same;
    const pages = [
      await t.list(SYSTEM_SCOPE, { page: 1, pageSize: 2 }),
      await t.list(SYSTEM_SCOPE, { page: 2, pageSize: 2 }),
      await t.list(SYSTEM_SCOPE, { page: 3, pageSize: 2 }),
    ];
    expect(pages.map(idsOf)).toEqual([ids(r5!, r4!), ids(r3!, r2!), ids(r1!)]);
    for (const page of pages) expect(page.total).toBe(5);
  });
});

describe('KDD-17 chuỗi câu SQL thật: chỉ đọc, một giao dịch, số câu ghim', () => {
  // `recordStatements` thay `db.createQueryRunner` bằng một spy và CHỈ gọi được MỘT lần mỗi spy (gọi lần hai bọc chính spy cũ, đệ quy): gỡ spy sau mỗi lần ghi để một ca ghi được nhiều lời gọi.
  // Chỉ bỏ qua `AppException` (404 là kết quả hợp lệ của chi tiết); lỗi khác phải làm ca đỏ, không bị nuốt.
  async function statementsOf(work: () => Promise<unknown>) {
    const seen = recordStatements(db);
    try {
      await work().catch((error: unknown) => {
        if (!(error instanceof AppException)) throw error;
      });
      return [...seen];
    } finally {
      vi.restoreAllMocks();
    }
  }
  const selectsOf = (during: string[]) =>
    during.filter((sql) => SELECT.test(sql));

  function expectReadOnlyTransaction(during: string[]) {
    const at = (pattern: RegExp) =>
      during.findIndex((sql) => pattern.test(sql));
    const first = during.findIndex((sql) => SELECT.test(sql));
    const last = during.findLastIndex((sql) => SELECT.test(sql));
    expect(during.filter((sql) => WRITE_OR_LOCK_SQL.test(sql))).toEqual([]);
    expect(at(/SET TRANSACTION READ ONLY/i)).toBeGreaterThanOrEqual(0);
    expect(at(/SET TRANSACTION READ ONLY/i)).toBeLessThan(first);
    expect(at(/REPEATABLE READ/i)).toBeLessThan(first);
    expect(at(/^\s*START TRANSACTION/i)).toBeLessThan(first);
    expect(at(/^\s*COMMIT/i)).toBeGreaterThan(last);
  }

  it('danh sách có dòng: đúng HAI SELECT (đếm theo trạng thái rồi trang), chỉ đọc, giao dịch READ ONLY và REPEATABLE READ; không dòng nào của sáu bảng bị đổi', async () => {
    const t = await setup();
    await seedThreeBranches(t.m);
    const before = await untouchedByModerationRead(db);
    const during = await statementsOf(() => t.list(SYSTEM_SCOPE));
    const selects = selectsOf(during);
    expect(selects).toHaveLength(2);
    expect(selects[0]).toMatch(/GROUP BY dg\.bi_an/);
    expect(selects[1]).toMatch(/LIMIT \? OFFSET \?|LIMIT \d+ OFFSET \d+/);
    expectReadOnlyTransaction(during);
    expect(await untouchedByModerationRead(db)).toEqual(before);
  });

  it('không có dòng, hoặc trang vượt cuối: đúng MỘT SELECT (không gửi câu trang)', async () => {
    const t = await setup();
    expect(
      selectsOf(await statementsOf(() => t.list(SYSTEM_SCOPE))),
    ).toHaveLength(1);
    await seedThreeBranches(t.m);
    expect(
      selectsOf(await statementsOf(() => t.list(SYSTEM_SCOPE, { page: 9 }))),
    ).toHaveLength(1);
    expect(
      selectsOf(
        await statementsOf(() =>
          t.list(SYSTEM_SCOPE, { soSao: 2, bacSiId: '1' }),
        ),
      ),
    ).toHaveLength(1);
  });

  it('chi tiết: đúng MỘT SELECT, kể cả khi không có hay ngoài phạm vi (không dò thêm); chỉ đọc', async () => {
    const t = await setup();
    const s = await seedThreeBranches(t.m);
    for (const [scope, id] of [
      [SYSTEM_SCOPE, s.a1.danhGiaId],
      [SYSTEM_SCOPE, '999999999'],
      [branchScope(t.m.branches.a.chiNhanhId), s.b1.danhGiaId],
    ] as const) {
      const during = await statementsOf(() => t.service.get(scope, id));
      expect(selectsOf(during)).toHaveLength(1);
      expectReadOnlyTransaction(during);
    }
  });

  it('người đặt (tai_khoan) chỉ được nối khi có q: câu đếm không có `tbn` khi không q, có khi có q', async () => {
    const t = await setup();
    await seedThreeBranches(t.m);
    const plain = selectsOf(await statementsOf(() => t.list(SYSTEM_SCOPE)));
    expect(plain[0]).not.toContain('tbn');
    const searched = selectsOf(
      await statementsOf(() => t.list(SYSTEM_SCOPE, { q: 'Bình' })),
    );
    expect(searched[0]).toContain('INNER JOIN tai_khoan tbn');
  });
});
