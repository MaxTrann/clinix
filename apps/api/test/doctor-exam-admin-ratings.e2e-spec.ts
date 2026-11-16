import request from 'supertest';
import { vi } from 'vitest';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { HEALTH_RECORD_KEY } from './../src/appointments/testing/response-keys.js';
import { statusWorld } from './../src/appointments/testing/status-world.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import {
  day,
  FORBIDDEN_ADMIN_RATING_KEYS,
  ids,
  moderationWorld,
  seedThreeBranches,
  untouchedByModerationRead,
} from './../src/doctor/examination/testing/moderation-stack.js';
import { keysDeep } from './../src/doctor/examination/testing/patient-exam-stack.js';
import { captureProcessLogs } from './../src/doctor/examination/testing/rating-stack.js';

// doctor-exam B7 — GET /admin/doctor-ratings và GET /admin/doctor-ratings/:id qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN 5.8, 5.11; 7.5 KDD-01, KDD-02, KDD-03, KDD-11, KDD-12; 7.7 QHK-01, QHK-06, QHK-07, QHK-08, QHK-11, QHK-12; `[đề xuất]` KDD-16, KDD-19, KDD-20, KDD-22).
// Phần dịch vụ và SQL: src/doctor/examination/moderation/admin-ratings.int-spec.ts. QHK-01 và QHK-12 là mã của MỌI route khám bệnh: ở đây chỉ phần B7 (200, 400, 404 có `no-store`; 401 và 403 do guard trả TRƯỚC khi `@Header` áp nên không khẳng định).
// CA KDD-11 khẳng định ĐÚNG 403 KHONG_DU_QUYEN ở trạng thái mà dịch vụ sẽ trả mã KHÁC nếu thiếu `@Roles` hay `@RequireAdminScope` (id sai dạng ⇒ 404 ở pipe; query sai ⇒ 400): bài học ĐA-9b. Dữ liệu giả (email đuôi example.com).
const PATH = '/admin/doctor-ratings';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
// Thân 404 chung (patient Q27): giống từng ký tự ở mọi nhánh "không thấy", kể cả id sai dạng bị pipe từ chối
const NOT_FOUND_TEXT =
  '{"maLoi":"KHONG_TIM_THAY","thongBao":"Không tìm thấy dữ liệu."}';
const MALFORMED = [
  '-1',
  '0',
  'abc',
  '1.5',
  '01',
  '9223372036854775808',
  '99999999999999999999',
];
const LIST_KEYS = ['demTheoTrangThai', 'items', 'page', 'pageSize', 'total'];
const ITEM_KEYS = [
  'bacSi',
  'biAn',
  'chiNhanh',
  'danhGiaId',
  'nguoiDanhGia',
  'nhanXet',
  'soSao',
  'thoiDiemTao',
];
const DETAIL_KEYS = [...ITEM_KEYS, 'maLichHen', 'thoiGianKham'].sort();

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
// `path` viết thẳng (kể cả `?` đầu) để thử id sai dạng, query sai, lặp khoá, khoá lạ
const send = (
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  accessToken?: string,
) => {
  const req = request(h.app.getHttpServer())[method](`${PATH}${path}`);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const get = (path = '', accessToken?: string) => send('get', path, accessToken);

interface ListBody {
  items: { danhGiaId: string; nhanXet: string | null }[];
  total: number;
  page: number;
  pageSize: number;
  demTheoTrangThai: { HienThi: number; DaAn: number };
}
const bodyIds = (res: { body: unknown }) =>
  (res.body as ListBody).items.map((item) => item.danhGiaId);

/** Thế giới kiểm duyệt (ba chi nhánh, mười đánh giá) kèm token của mọi vai trò. */
async function world() {
  const w = await statusWorld(h.db, fx);
  const m = await moderationWorld(h.db, fx, w);
  return {
    m,
    s: await seedThreeBranches(m),
    system: await tokenOf(w.systemAdmin.account.taiKhoanId),
    adminA: await tokenOf(w.branchAdmin.account.taiKhoanId),
    adminB: await tokenOf(m.admins.b.account.taiKhoanId),
    patient: await tokenOf(w.patientId),
    doctor: await tokenOf(w.doctor.account.taiKhoanId),
    reception: await tokenOf(w.receptionId),
  };
}

describe('KDD-01, KDD-02, QHK-12 Toàn hệ thống xem danh sách', () => {
  it('200: đúng năm khoá ở gốc, đúng tám khoá mỗi dòng, id là chuỗi; Cache-Control no-store; mới nhất trước; total 10 và demTheoTrangThai 6 hiển thị 4 đã ẩn', async () => {
    const t = await world();
    const res = await get('', t.system).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body).sort()).toEqual(LIST_KEYS);
    const body = res.body as ListBody;
    expect(body).toMatchObject({
      total: 10,
      page: 1,
      pageSize: 20,
      demTheoTrangThai: { HienThi: 6, DaAn: 4 },
    });
    expect(bodyIds(res)).toEqual(
      ids(
        t.s.c1,
        t.s.b6,
        t.s.b5,
        t.s.b4,
        t.s.b3,
        t.s.b2,
        t.s.b1,
        t.s.a3,
        t.s.a2,
        t.s.a1,
      ),
    );
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(ITEM_KEYS);
      expect(typeof item.danhGiaId).toBe('string');
    }
    expect(body.items[0]).toMatchObject({
      bacSi: { hoTen: 'Bác sĩ Xê' },
      chiNhanh: { ten: 'Chi nhánh Ba' },
      nguoiDanhGia: { hoTen: 'Lê Hoàng Cường' },
      soSao: 5,
      nhanXet: 'Rất hài lòng',
      thoiDiemTao: '2026-11-10T02:00:00.000Z',
      biAn: false,
    });
  });

  it('KDD-02 bộ lọc qua query: trangThai, soSao, bacSiId, chiNhanhId, q (có dấu và không dấu), trang; demTheoTrangThai áp mọi lọc trừ trangThai', async () => {
    const t = await world();
    const a = async (query: string) => get(query, t.system).expect(200);
    const hidden = await a('?trangThai=DaAn');
    expect(bodyIds(hidden)).toEqual(ids(t.s.b6, t.s.b5, t.s.b3, t.s.a3));
    expect(hidden.body).toMatchObject({
      total: 4,
      demTheoTrangThai: { HienThi: 6, DaAn: 4 },
    });
    expect(bodyIds(await a('?soSao=5'))).toEqual(ids(t.s.c1, t.s.b4, t.s.a1));
    expect(
      bodyIds(await a(`?bacSiId=${t.m.doctors.a.account.taiKhoanId}`)),
    ).toEqual(ids(t.s.a3, t.s.a2, t.s.a1));
    expect(
      bodyIds(await a(`?chiNhanhId=${t.m.branches.c.chiNhanhId}`)),
    ).toEqual(ids(t.s.c1));
    for (const q of ['Nguyễn', 'nguyen'])
      expect(bodyIds(await a(`?q=${encodeURIComponent(q)}`))).toEqual(
        ids(t.s.b6, t.s.b1, t.s.a3, t.s.a1),
      );
    const page2 = await a('?page=2&pageSize=4');
    expect(bodyIds(page2)).toEqual(ids(t.s.b3, t.s.b2, t.s.b1, t.s.a3));
    expect(page2.body).toMatchObject({ page: 2, pageSize: 4, total: 10 });
    const beyond = await a('?page=99');
    expect(beyond.body).toMatchObject({ items: [], total: 10, page: 99 });
  });

  it('KDD-19 q là ký tự đại diện của LIKE (%, _) hay chỉ khoảng trắng: `%` và `_` KHÔNG khớp tất cả; q rỗng hay khoảng trắng ⇒ như không có q', async () => {
    const t = await world();
    for (const q of ['%25', '_', '%25_', '!'])
      expect(
        (await get(`?q=${q}`, t.system).expect(200)).body,
        q,
      ).toMatchObject({ items: [], total: 0 });
    for (const q of ['', '%20%20', '%09'])
      expect(
        (await get(`?q=${q}`, t.system).expect(200)).body,
        q,
      ).toMatchObject({ total: 10 });
  });
});

describe('KDD-01, QHK-07, QHK-11 Admin Chi nhánh bị giới hạn theo chi nhánh của mình', () => {
  it('Admin A chỉ thấy đánh giá của chi nhánh A, total 3 và demTheoTrangThai 2 và 1 (không có số của chi nhánh khác); Admin B thấy sáu đánh giá, 3 và 3', async () => {
    const t = await world();
    const a = await get('', t.adminA).expect(200);
    expect(bodyIds(a)).toEqual(ids(t.s.a3, t.s.a2, t.s.a1));
    expect(a.body).toMatchObject({
      total: 3,
      demTheoTrangThai: { HienThi: 2, DaAn: 1 },
    });
    const b = await get('', t.adminB).expect(200);
    expect(bodyIds(b)).toEqual(
      ids(t.s.b6, t.s.b5, t.s.b4, t.s.b3, t.s.b2, t.s.b1),
    );
    expect(b.body).toMatchObject({
      total: 6,
      demTheoTrangThai: { HienThi: 3, DaAn: 3 },
    });
  });

  it('QHK-07 Admin A gửi chiNhanhId của B (hay của mình, hay id không có) ⇒ vẫn đúng tập của A; bacSiId của bác sĩ B ⇒ rỗng', async () => {
    const t = await world();
    for (const asked of [
      t.m.branches.b.chiNhanhId,
      t.m.branches.a.chiNhanhId,
      '999999999',
    ]) {
      const res = await get(`?chiNhanhId=${asked}`, t.adminA).expect(200);
      expect(bodyIds(res)).toEqual(ids(t.s.a3, t.s.a2, t.s.a1));
      expect(res.body).toMatchObject({
        total: 3,
        demTheoTrangThai: { HienThi: 2, DaAn: 1 },
      });
    }
    const crossed = await get(
      `?bacSiId=${t.m.doctors.b.account.taiKhoanId}`,
      t.adminA,
    ).expect(200);
    expect(crossed.body).toMatchObject({
      items: [],
      total: 0,
      demTheoTrangThai: { HienThi: 0, DaAn: 0 },
    });
  });
});

describe('KDD-03, KDD-12, QHK-06, QHK-12 chi tiết', () => {
  it('200 chi tiết chưa ẩn: đúng mười khoá, KHÔNG có lyDoAn; Cache-Control no-store; đúng cho Toàn hệ thống và cho Admin của chi nhánh đó', async () => {
    const t = await world();
    for (const token of [t.system, t.adminB]) {
      const res = await get(`/${t.s.b2.danhGiaId}`, token).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(Object.keys(res.body).sort()).toEqual(DETAIL_KEYS);
      expect(res.body).toMatchObject({
        danhGiaId: t.s.b2.danhGiaId,
        bacSi: { hoTen: 'Bác sĩ Bê' },
        chiNhanh: { ten: 'Chi nhánh Hai' },
        nguoiDanhGia: { hoTen: 'Trần Thị Bình' },
        soSao: 2,
        nhanXet: 'Chờ lâu',
        biAn: false,
        maLichHen: t.s.b2.maLichHen,
      });
    }
  });

  it('200 chi tiết đã ẩn: có thêm lyDoAn đúng chữ lý do, biAn true', async () => {
    const t = await world();
    const res = await get(`/${t.s.a3.danhGiaId}`, t.adminA).expect(200);
    expect(Object.keys(res.body).sort()).toEqual(
      [...DETAIL_KEYS, 'lyDoAn'].sort(),
    );
    expect(res.body).toMatchObject({
      biAn: true,
      lyDoAn: 'Nội dung quảng cáo',
    });
  });

  it('QHK-06, KDD-12 id không có, ngoài phạm vi (Admin A xem đánh giá của B) và id sai dạng ⇒ CÙNG một thân 404 từng ký tự, có no-store', async () => {
    const t = await world();
    const cases: [string, string][] = [
      ['không có', '999999999'],
      ['ngoài phạm vi', t.s.b1.danhGiaId],
      ...MALFORMED.map((id): [string, string] => [`sai dạng ${id}`, id]),
    ];
    for (const [label, id] of cases) {
      const res = await get(`/${id}`, t.adminA);
      expectErrorResponse(res, 404, 'KHONG_TIM_THAY');
      expect(res.text, label).toBe(NOT_FOUND_TEXT);
      expect(res.headers['cache-control'], label).toBe('no-store');
    }
    // Toàn hệ thống vẫn thấy đánh giá mà Admin A không thấy
    await get(`/${t.s.b1.danhGiaId}`, t.system).expect(200);
  });
});

describe('KDD-02, QHK-12 query sai ⇒ 400 DU_LIEU_KHONG_HOP_LE, có no-store', () => {
  it.each([
    ['pageSize quá lớn', '?pageSize=51'],
    ['page bằng 0', '?page=0'],
    ['soSao ngoài 1 đến 5', '?soSao=0'],
    ['soSao là chữ', '?soSao=abc'],
    ['soSao lặp khoá', '?soSao=1&soSao=2'],
    ['soSao dạng mảng', '?soSao[]=1'],
    ['trangThai chữ thường', '?trangThai=hienthi'],
    ['bacSiId bằng 0', '?bacSiId=0'],
    ['chiNhanhId sai dạng', '?chiNhanhId=abc'],
    ['q quá 100 ký tự', `?q=${'a'.repeat(101)}`],
  ])('%s', async (_ten, query) => {
    const t = await world();
    const res = await get(query, t.system);
    expectErrorResponse(res, 400, INVALID_DATA);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it.each(['benhNhanId', 'biAn', 'lyDoAn', 'lichHenId', 'tuyY'])(
    'khoá lạ `%s` ⇒ 400 kèm loi[{ truong, ma: TRUONG_KHONG_DUOC_PHEP }], không lặp lại giá trị',
    async (key) => {
      const t = await world();
      const res = await get(`?${key}=GIA-TRI-NHAY-CAM-12345`, t.system);
      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi).toEqual([{ truong: key, ma: NOT_ALLOWED }]);
      expect(res.text).not.toContain('GIA-TRI-NHAY-CAM-12345');
      expect(res.headers['cache-control']).toBe('no-store');
    },
  );
});

describe('KDD-11, QHK-01 quyền: guard chạy TRƯỚC pipe', () => {
  it('khách ⇒ 401; Bệnh nhân, Bác sĩ, Lễ tân ⇒ ĐÚNG 403 KHONG_DU_QUYEN ở danh sách, chi tiết, id sai dạng và query sai', async () => {
    const t = await world();
    const paths = [
      '',
      `/${t.s.a1.danhGiaId}`,
      '/abc',
      '/-1',
      '?pageSize=51',
      '?benhNhanId=1',
      '?soSao=0',
    ];
    for (const path of paths)
      expectErrorResponse(await get(path), 401, NOT_LOGGED_IN);
    for (const token of [t.patient, t.doctor, t.reception])
      for (const path of paths)
        expectErrorResponse(await get(path, token), 403, FORBIDDEN);
  });

  it('cả hai loại Quản trị viên (Toàn hệ thống và Chi nhánh) gọi được cả hai route', async () => {
    const t = await world();
    for (const token of [t.system, t.adminA, t.adminB])
      await get('', token).expect(200);
    // a1 là đánh giá của chi nhánh A: Toàn hệ thống và Admin A xem được (Admin B ⇒ 404, đã khẳng định ở nhóm chi tiết)
    await get(`/${t.s.a1.danhGiaId}`, t.system).expect(200);
    await get(`/${t.s.a1.danhGiaId}`, t.adminA).expect(200);
  });
});

describe('KDD-16 B7 chỉ ĐỌC: không có route ghi', () => {
  it('POST, PUT, PATCH, DELETE vào danh sách và vào một đánh giá ⇒ 404; không dòng nào của sáu bảng đổi', async () => {
    const t = await world();
    const before = await untouchedByModerationRead(h.db);
    const id = t.s.a1.danhGiaId;
    for (const method of ['post', 'put', 'patch', 'delete'] as const)
      for (const path of ['', `/${id}`]) {
        const res = await send(method, path, t.system).send({
          lyDo: 'Nội dung quảng cáo',
        });
        expect(res.status, `${method} ${path}`).toBe(404);
      }
    expect(await untouchedByModerationRead(h.db)).toEqual(before);
  });
});

describe('KDD-18 nhận xét ở danh sách cắt 200 đơn vị UTF-16, ở chi tiết đầy đủ (qua HTTP)', () => {
  it('300 ký tự ⇒ 200 ở danh sách và đủ 300 ở chi tiết; emoji vắt qua điểm cắt (199 chữ rồi emoji) ⇒ 199 ở danh sách, không cắt đôi, và đủ 201 đơn vị ở chi tiết (đột biến M19 và M20 chưa bị e2e bắt khi e2e chưa có nhận xét dài)', async () => {
    const t = await world();
    const long = await t.m.seed({ at: day(11), nhanXet: 'x'.repeat(300) });
    const emoji = await t.m.seed({
      at: day(12),
      nhanXet: `${'a'.repeat(199)}😀`,
    });
    const list = await get('', t.system).expect(200);
    const listed = (id: string) =>
      (list.body as ListBody).items.find((item) => item.danhGiaId === id)
        ?.nhanXet;
    expect(listed(long.danhGiaId)).toBe('x'.repeat(200));
    expect(listed(emoji.danhGiaId)).toBe('a'.repeat(199));
    const detailLong = await get(`/${long.danhGiaId}`, t.system).expect(200);
    expect(detailLong.body).toMatchObject({ nhanXet: 'x'.repeat(300) });
    const detailEmoji = await get(`/${emoji.danhGiaId}`, t.system).expect(200);
    expect(detailEmoji.body).toMatchObject({
      nhanXet: `${'a'.repeat(199)}😀`,
    });
  });
});

describe('KDD-20, QHK-08, BDK-01 không lộ dữ liệu sức khoẻ và liên hệ; không ghi log dữ liệu cá nhân', () => {
  it('phản hồi của hai route không có khoá của hồ sơ khám, liên hệ hay id nội bộ ở độ sâu nào, dù lịch có hồ sơ khám', async () => {
    const t = await world();
    await t.m.exam.record(t.s.a1.lichHenId);
    const bodies = [
      (await get('', t.system).expect(200)).body,
      (await get(`/${t.s.a1.danhGiaId}`, t.system).expect(200)).body,
      (await get(`/${t.s.a3.danhGiaId}`, t.adminA).expect(200)).body,
    ];
    for (const body of bodies) {
      const keys = keysDeep(body);
      for (const key of keys) {
        expect(FORBIDDEN_ADMIN_RATING_KEYS as readonly string[]).not.toContain(
          key,
        );
        expect(key).not.toMatch(HEALTH_RECORD_KEY);
      }
      expect(JSON.stringify(body)).not.toMatch(
        /example\.com|Ho khan|Viêm họng/,
      );
    }
  });

  it('BDK-01 nhận xét và tên người đặt không bao giờ vào log (kể cả ở lời gọi 404 và 400)', async () => {
    const t = await world();
    const logs = captureProcessLogs();
    await get('', t.system).expect(200);
    await get(`/${t.s.a1.danhGiaId}`, t.system).expect(200);
    await get('/999999999', t.system);
    await get('?soSao=0', t.system);
    const text = logs.join('\n');
    for (const secret of ['Rất tận tình', 'Nguyễn Văn An', 'Trần Thị Bình'])
      expect(text).not.toContain(secret);
  });
});
