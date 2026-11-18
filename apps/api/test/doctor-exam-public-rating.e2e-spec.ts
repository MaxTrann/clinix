import request from 'supertest';
import { vi } from 'vitest';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { statusWorld } from './../src/appointments/testing/status-world.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { moderationWorld } from './../src/doctor/examination/testing/moderation-stack.js';
import {
  keysDeep,
  seedVisits,
} from './../src/doctor/examination/testing/patient-exam-stack.js';
import {
  ratingBody,
  ratingRows,
} from './../src/doctor/examination/testing/rating-stack.js';
import { SearchFixtures } from './../src/search/testing/search-fixtures.js';

// doctor-exam B9 — điểm đánh giá bác sĩ ở API CÔNG KHAI qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN doctor-exam 5.9; 7.6 DTB-06, DTB-07, DTB-08, DTB-10; `[đề xuất]` DTB-03 (E)).
// Phần reader: src/search/ratings/doctor-rating.reader.spec.ts (đơn vị) và .int-spec.ts (MySQL thật). Bộ lọc `diemTu` miền 400 (TBS-07): test/search-doctors.e2e-spec.ts (chạy lại, không đổi). Dữ liệu giả; mọi giá trị mong đợi viết tay.
const NOW = new Date('2026-11-10T09:00:00+07:00');
const REASON = 'Nội dung quảng cáo, không liên quan đến buổi khám';
const NHAN_XET_RIENG = 'NHAN-XET-RIENG-7204 Bác sĩ khám rất kỹ';
const NHAN_XET_AN = 'NHAN-XET-AN-4410 Quảng cáo dịch vụ bên ngoài';
const LY_DO_RIENG = 'LY-DO-RIENG-9068 nội dung không phù hợp';
// Danh sách trắng khoá của một bác sĩ công khai (TBS-09, Q14): danh sách và chi tiết (thêm `moTaChuyenMon`).
const LIST_KEYS = [
  'bacSiId',
  'hoTen',
  'chucDanh',
  'soNamKinhNghiem',
  'chuyenKhoa',
  'chiNhanh',
  'dichVu',
  'gia',
  'danhGia',
].sort();
const DETAIL_KEYS = [...LIST_KEYS, 'moTaChuyenMon'].sort();
// Khoá và chuỗi KHÔNG được có ở bất kỳ đâu trong phản hồi công khai (DTB-10).
const FORBIDDEN_KEYS = [
  'biAn',
  'bi_an',
  'lyDoAn',
  'ly_do_an',
  'nhanXet',
  'nhan_xet',
  'nguoiDanhGia',
  'danhGiaId',
  'lichHenId',
  'benhNhanId',
  'soSao',
  'thoiDiemTao',
];

let h: RefreshHarness;
let fx: BookingFixtures;

beforeAll(async () => {
  h = await openRefreshHarness();
  fx = new BookingFixtures(h.db);
});

beforeEach(async () => {
  await resetTables(h.db);
  h.mail.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await resetTables(h.db);
  await h.close();
});

const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;

interface RatingView {
  diemTrungBinh: string | null;
  soDanhGia: number;
}
interface ListItem {
  bacSiId: string;
  danhGia: RatingView;
}
interface ListBody {
  items: ListItem[];
  total: number;
}

const publicGet = (path: string) =>
  request(h.app.getHttpServer()).get(`/public/doctors${path}`);
const listBody = async (query = ''): Promise<ListBody> =>
  (await publicGet(query).expect(200)).body as ListBody;
const idsOf = (body: ListBody): string[] =>
  body.items.map((item) => item.bacSiId);
const ratingOf = (body: ListBody, bacSiId: string) =>
  body.items.find((item) => item.bacSiId === bacSiId)?.danhGia;
const detailRating = async (bacSiId: string) =>
  ((await publicGet(`/${bacSiId}`).expect(200)).body as ListItem).danhGia;

const rate = (accessToken: string, maLichHen: string, soSao: number) =>
  request(h.app.getHttpServer())
    .post(`/patient/exam-records/${maLichHen}/rating`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send(ratingBody({ soSao, nhanXet: 'Tốt' }))
    .expect(201);
const hide = (accessToken: string, danhGiaId: string) =>
  request(h.app.getHttpServer())
    .post(`/admin/doctor-ratings/${danhGiaId}/hide`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ lyDo: REASON })
    .expect(200);

/** Thế giới: bác sĩ A của `statusWorld` (công khai), ba chi nhánh và người đặt của `moderationWorld`, Bệnh nhân thứ nhất và thứ hai, Admin Toàn hệ thống (kèm token). Đồng hồ ở NOW. */
async function world() {
  vi.setSystemTime(NOW);
  const w = await statusWorld(h.db, fx);
  const m = await moderationWorld(h.db, fx, w);
  return {
    w,
    m,
    search: new SearchFixtures(h.db),
    patient: await tokenOf(w.patientId),
    second: await tokenOf(w.secondPatientId),
    system: await tokenOf(w.systemAdmin.account.taiKhoanId),
  };
}
type World = Awaited<ReturnType<typeof world>>;

/** Bác sĩ công khai MỚI (chi nhánh A) với các đánh giá hiển thị theo thứ tự `stars`; trả id bác sĩ. */
async function publicDoctorRated(t: World, stars: readonly number[]) {
  const doctor = await t.search.publicDoctor(t.m.branches.a);
  for (const soSao of stars) await t.m.seed({ doctor, soSao });
  return doctor.account.taiKhoanId;
}

describe('DTB-06 gửi đánh giá rồi đọc công khai', () => {
  it('Bệnh nhân gửi bằng HTTP: điểm và số lượt đổi NGAY ở danh sách và chi tiết ({ null, 0 } ⇒ "4.0"/1 ⇒ "4.5"/2), không cache', async () => {
    const t = await world();
    const id = t.w.doctor.account.taiKhoanId;
    const visits = await seedVisits(h.db, fx, t.w, {
      first: {},
      second: { patientId: t.w.secondPatientId },
    });
    const expectBoth = async (expected: RatingView) => {
      expect(ratingOf(await listBody(), id)).toEqual(expected);
      expect(await detailRating(id)).toEqual(expected);
    };
    await expectBoth({ diemTrungBinh: null, soDanhGia: 0 });
    await rate(t.patient, visits.first.maLichHen, 4);
    await expectBoth({ diemTrungBinh: '4.0', soDanhGia: 1 });
    await rate(t.second, visits.second.maLichHen, 5);
    await expectBoth({ diemTrungBinh: '4.5', soDanhGia: 2 });
  });
});

describe('DTB-03 (E) `[đề xuất]` ẩn đánh giá rồi đọc công khai', () => {
  it('Quản trị viên ẩn bằng HTTP (route B8): điểm và số lượt đổi NGAY ("4.0"/2 ⇒ "5.0"/1 ⇒ { null, 0 })', async () => {
    const t = await world();
    const id = t.w.doctor.account.taiKhoanId;
    const five = await t.m.seed({ soSao: 5 });
    const three = await t.m.seed({ soSao: 3 });
    const expectBoth = async (expected: RatingView) => {
      expect(ratingOf(await listBody(), id)).toEqual(expected);
      expect(await detailRating(id)).toEqual(expected);
    };
    await expectBoth({ diemTrungBinh: '4.0', soDanhGia: 2 });
    await hide(t.system, three.danhGiaId);
    await expectBoth({ diemTrungBinh: '5.0', soDanhGia: 1 });
    await hide(t.system, five.danhGiaId);
    await expectBoth({ diemTrungBinh: null, soDanhGia: 0 });
    expect((await ratingRows(h.db)).map((row) => row.biAn)).toEqual([1, 1]);
  });
});

describe('DTB-08 chi tiết cùng số với danh sách', () => {
  it('mọi bác sĩ trong danh sách: danhGia của GET /public/doctors/:id bằng danhGia của mục ở danh sách', async () => {
    const t = await world();
    await t.m.seed({ soSao: 5 });
    await t.m.seed({ soSao: 4 });
    await publicDoctorRated(t, [3, 4, 4]);
    await publicDoctorRated(t, []);
    const body = await listBody();
    // bác sĩ A, B, C của thế giới (B và C chưa có đánh giá) cộng hai bác sĩ thêm
    expect(body.items).toHaveLength(5);
    expect(body.items.filter((i) => i.danhGia.soDanhGia > 0)).toHaveLength(2);
    for (const item of body.items)
      expect(await detailRating(item.bacSiId), item.bacSiId).toEqual(
        item.danhGia,
      );
  });
});

describe('DTB-07 lọc diemTu và sắp danhGiaCao trên dữ liệu thật (chạy lại TBS-07)', () => {
  /** P "4.5"/2, Q "4.3"/4 (trung bình thật 4,25), R "4.0"/1, S "4.0"/3; `unrated`: T cùng bác sĩ A, B, C của thế giới, đều chưa có đánh giá (cả tám bác sĩ đều công khai). */
  async function ratedWorld() {
    const t = await world();
    const p = await publicDoctorRated(t, [5, 4]);
    const q = await publicDoctorRated(t, [4, 4, 4, 5]);
    const r = await publicDoctorRated(t, [4]);
    const s = await publicDoctorRated(t, [4, 4, 4]);
    const none = await publicDoctorRated(t, []);
    const unrated = [
      none,
      t.m.doctors.a.account.taiKhoanId,
      t.m.doctors.b.account.taiKhoanId,
      t.m.doctors.c.account.taiKhoanId,
    ];
    return { p, q, r, s, unrated };
  }

  it('(a) diemTu so với ĐIỂM ĐÃ LÀM TRÒN: 4 ⇒ P, Q, R, S; 4,3 giữ Q ("4.3" dù trung bình thật 4,25); 4,4 chỉ P; 5 không ai; chưa có đánh giá luôn bị loại khi có diemTu', async () => {
    const x = await ratedWorld();
    const sorted = (ids: string[]) => [...ids].sort();
    const withMin = async (diemTu: string) => listBody(`?diemTu=${diemTu}`);
    expect(sorted(idsOf(await withMin('4')))).toEqual(
      sorted([x.p, x.q, x.r, x.s]),
    );
    expect(sorted(idsOf(await withMin('4.3')))).toEqual(sorted([x.p, x.q]));
    expect(idsOf(await withMin('4.4'))).toEqual([x.p]);
    expect(await withMin('5')).toMatchObject({ items: [], total: 0 });
    // không có diemTu: bác sĩ chưa đánh giá vẫn có mặt
    const all = await listBody();
    expect(all.total).toBe(8);
    for (const id of x.unrated) expect(idsOf(all)).toContain(id);
  });

  it('(b) sapXep=danhGiaCao: điểm giảm, rồi số lượt giảm ("4.0"/3 trước "4.0"/1), chưa có đánh giá CUỐI; phân trang giữ thứ tự và total', async () => {
    const x = await ratedWorld();
    const all = await listBody('?sapXep=danhGiaCao');
    expect(idsOf(all).slice(0, 4)).toEqual([x.p, x.q, x.s, x.r]);
    expect(new Set(idsOf(all).slice(4))).toEqual(new Set(x.unrated));
    const page1 = await listBody('?sapXep=danhGiaCao&diemTu=4&pageSize=2');
    const page2 = await listBody(
      '?sapXep=danhGiaCao&diemTu=4&pageSize=2&page=2',
    );
    expect(idsOf(page1)).toEqual([x.p, x.q]);
    expect(idsOf(page2)).toEqual([x.s, x.r]);
    expect([page1.total, page2.total]).toEqual([4, 4]);
  });
});

describe('DTB-10 phản hồi công khai không lộ dữ liệu của đánh giá', () => {
  it('có đánh giá ẩn (kèm lý do ẩn riêng), nhận xét riêng, hai người đánh giá: danh sách trắng khoá, không bi_an, ly_do_an, nhận xét, tên và email người đánh giá', async () => {
    const t = await world();
    const doctor = t.m.doctors.a;
    const id = doctor.account.taiKhoanId;
    await t.m.seed({ soSao: 5, nhanXet: NHAN_XET_RIENG });
    await t.m.seed({
      soSao: 1,
      buyer: t.m.buyers.two,
      nhanXet: NHAN_XET_AN,
      hiddenReason: LY_DO_RIENG,
    });
    expect((await ratingRows(h.db)).map((row) => row.biAn)).toEqual([0, 1]);
    const raters = await h.db.query<{ email: string }[]>(
      'SELECT email FROM tai_khoan WHERE tai_khoan_id IN (?)',
      [[t.m.buyers.one, t.m.buyers.two]],
    );
    expect(raters).toHaveLength(2);
    const secrets = [
      NHAN_XET_RIENG,
      NHAN_XET_AN,
      LY_DO_RIENG,
      t.m.names.buyerOne,
      t.m.names.buyerTwo,
      ...raters.map((row) => row.email),
      ...FORBIDDEN_KEYS,
    ];

    const list = await publicGet('').expect(200);
    const detail = await publicGet(`/${id}`).expect(200);
    const item = (list.body as { items: Record<string, unknown>[] }).items.find(
      (i) => i['bacSiId'] === id,
    );
    expect(Object.keys(item ?? {}).sort()).toEqual(LIST_KEYS);
    expect(Object.keys((item?.['danhGia'] ?? {}) as object).sort()).toEqual([
      'diemTrungBinh',
      'soDanhGia',
    ]);
    expect(Object.keys(detail.body as object).sort()).toEqual(DETAIL_KEYS);
    expect((detail.body as { danhGia: RatingView }).danhGia).toEqual({
      diemTrungBinh: '5.0',
      soDanhGia: 1,
    });
    for (const body of [list.body, detail.body]) {
      expect(
        keysDeep(body).filter((key) => FORBIDDEN_KEYS.includes(key)),
      ).toEqual([]);
      const text = JSON.stringify(body);
      for (const secret of secrets) expect(text).not.toContain(secret);
    }
  });
});
