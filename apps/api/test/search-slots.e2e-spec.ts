import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, type EntityManager } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { SlotHoldService } from '../src/appointments/slots/slot-hold.service.js';
import { lockSlot } from '../src/appointments/slots/slot-lock.js';
import { BacSi } from '../src/admin/entities/bac-si.entity.js';
import { KhungGio } from '../src/admin/entities/khung-gio.entity.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { SlotFixtures } from '../src/search/testing/slot-fixtures.js';

// Search Slots PR-C1 — KGC-40 đến KGC-46: GET /public/doctor-slots qua HTTP, AppModule thật, MySQL thật.
// Đồng hồ giả CHỈ `Date` (bộ hẹn giờ thật vẫn chạy nên HTTP và MySQL không bị ảnh hưởng): hôm nay là thứ Tư 2026-11-18 07:00 giờ VN.
const NOW = new Date('2026-11-18T07:00:00+07:00');
const NGAY = '2026-11-19';
const URL = '/public/doctor-slots';
const MISSING = '999999999';

describe('Search Slots PR-C1 — GET /public/doctor-slots (HTTP, AppModule, MySQL thật)', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: SlotFixtures;
  let patientToken: string;
  let doctorId: string;
  let slotIds: string[];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    fx = new SlotFixtures(db);
  });

  beforeEach(async () => {
    await resetTables(db);
    ({ id: doctorId, slotIds } = await fx.publicDoctorWithShifts(
      await fx.branch(),
      NGAY,
      ['CaSang'],
    ));
    const patient = await fx.search.admin.patient();
    // Fixture dựng bằng đồng hồ thật; từ đây `Date` bị ghim để "hôm nay" và hết hạn giữ chỗ xác định.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    patientToken = (
      await app.get(SessionService).create(patient.account.taiKhoanId)
    ).accessToken;
  });

  afterEach(() => vi.useRealTimers());
  afterAll(async () => app?.close());

  const get = (path: string, token?: string) => {
    const call = request(app.getHttpServer()).get(path);
    return token ? call.auth(token, { type: 'bearer' }) : call;
  };
  const slotsOf = (ids: string, ngay = NGAY) =>
    get(`${URL}?bacSiIds=${ids}&ngay=${ngay}`);
  const snapshot = async () =>
    JSON.stringify(
      await Promise.all(
        ['khung_gio', 'lich_lam_viec', 'lich_hen', 'yeu_cau_nghi_phep'].map(
          (table) => db.query(`SELECT * FROM ${table} ORDER BY 1`),
        ),
      ),
    );

  it('KGC-40 (CC-01 đến CC-03): không token ⇒ 200; token bệnh nhân hợp lệ hay sai chữ ký cho CÙNG thân', async () => {
    const anonymous = await slotsOf(doctorId).expect(200);
    expect(anonymous.body).toMatchObject({
      ngay: NGAY,
      items: [{ bacSiId: doctorId, trangThaiNgay: 'CoLich' }],
    });
    expect(anonymous.body.items[0].khungGio).toHaveLength(8);
    const withToken = await get(
      `${URL}?bacSiIds=${doctorId}&ngay=${NGAY}`,
      patientToken,
    ).expect(200);
    const badToken = await get(
      `${URL}?bacSiIds=${doctorId}&ngay=${NGAY}`,
      'khong.phai.token',
    ).expect(200);
    expect(withToken.body).toEqual(anonymous.body);
    expect(badToken.body).toEqual(anonymous.body);
  });

  it('KGC-41: Cache-Control no-store ở 200 và ở 400', async () => {
    const ok = await slotsOf(doctorId).expect(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    const bad = await get(`${URL}?bacSiIds=${doctorId}`).expect(400);
    expect(bad.headers['cache-control']).toBe('no-store');
  });

  it('KGC-42: 400 từng mã, báo đủ trường, mã ổn định', async () => {
    const ids101 = Array.from({ length: 101 }, (_, i) => i + 1).join(',');
    const cases: [string, string, { truong: string; ma: string }[]][] = [
      [
        'thiếu bacSiIds',
        `ngay=${NGAY}`,
        [e('bacSiIds', 'DANH_SACH_BAC_SI_KHONG_HOP_LE')],
      ],
      [
        'bacSiIds rỗng',
        `bacSiIds=&ngay=${NGAY}`,
        [e('bacSiIds', 'DANH_SACH_BAC_SI_KHONG_HOP_LE')],
      ],
      [
        'bacSiIds sai',
        `bacSiIds=abc&ngay=${NGAY}`,
        [e('bacSiIds', 'DANH_SACH_BAC_SI_KHONG_HOP_LE')],
      ],
      [
        'bacSiIds số 0 đứng đầu',
        `bacSiIds=01&ngay=${NGAY}`,
        [e('bacSiIds', 'DANH_SACH_BAC_SI_KHONG_HOP_LE')],
      ],
      [
        'quá 100 bác sĩ',
        `bacSiIds=${ids101}&ngay=${NGAY}`,
        [e('bacSiIds', 'QUA_NHIEU_BAC_SI')],
      ],
      ['thiếu ngay', `bacSiIds=${doctorId}`, [e('ngay', 'NGAY_KHONG_HOP_LE')]],
      [
        'ngay sai dạng',
        `bacSiIds=${doctorId}&ngay=19-11-2026`,
        [e('ngay', 'NGAY_KHONG_HOP_LE')],
      ],
      [
        'ngay không có thật',
        `bacSiIds=${doctorId}&ngay=2026-02-30`,
        [e('ngay', 'NGAY_KHONG_HOP_LE')],
      ],
      [
        'ngay là hôm nay + 7',
        `bacSiIds=${doctorId}&ngay=2026-11-25`,
        [e('ngay', 'NGAY_NGOAI_KHOANG')],
      ],
      [
        'ngay là hôm qua',
        `bacSiIds=${doctorId}&ngay=2026-11-17`,
        [e('ngay', 'NGAY_NGOAI_KHOANG')],
      ],
      [
        'cả hai sai',
        `bacSiIds=x&ngay=2026-11-25`,
        [
          e('bacSiIds', 'DANH_SACH_BAC_SI_KHONG_HOP_LE'),
          e('ngay', 'NGAY_NGOAI_KHOANG'),
        ],
      ],
    ];
    for (const [name, query, loi] of cases) {
      const body = expectErrorResponse(
        await get(`${URL}?${query}`),
        400,
        'BO_LOC_KHONG_HOP_LE',
      );
      expect(body.loi, name).toEqual(loi);
    }
  });

  it('KGC-42: tham số lạ và tham số lặp ⇒ 400 DU_LIEU_KHONG_HOP_LE; chuỗi tiêm SQL không đổi dữ liệu', async () => {
    const before = await snapshot();
    const unknown = expectErrorResponse(
      await get(`${URL}?bacSiIds=${doctorId}&ngay=${NGAY}&khac=1`),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(unknown.loi?.[0]).toMatchObject({ truong: 'khac' });
    const repeated = expectErrorResponse(
      await get(`${URL}?bacSiIds=1&bacSiIds=2&ngay=${NGAY}`),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(repeated.loi?.[0]).toMatchObject({ truong: 'bacSiIds' });
    const injection = encodeURIComponent("1'; DROP TABLE khung_gio;--");
    expectErrorResponse(
      await get(`${URL}?bacSiIds=${injection}&ngay=${NGAY}`),
      400,
      'BO_LOC_KHONG_HOP_LE',
    );
    expect(await snapshot()).toBe(before);
  });

  it('KGC-43 (AN): không lộ dữ liệu nội bộ; tập khoá chính xác', async () => {
    // Ô đã đặt thật (có lịch hẹn, bệnh nhân), ô đang giữ chỗ, và bác sĩ khác đang xin nghỉ phép.
    const patient = await fx.search.admin.patient();
    const bookedSlot = await db
      .getRepository(KhungGio)
      .findOneByOrFail({ khungGioId: slotIds[0] as string });
    await fx.search.admin.appointment(
      await db.getRepository(BacSi).findOneByOrFail({ taiKhoanId: doctorId }),
      bookedSlot,
      patient.profile.taiKhoanId,
    );
    await db.query(
      "UPDATE khung_gio SET trang_thai = 'DaDat', giu_cho_den = NULL WHERE khung_gio_id = ?",
      [bookedSlot.khungGioId],
    );
    await db.query(
      "UPDATE khung_gio SET trang_thai = 'DangGiuCho', giu_cho_den = '2026-11-18 07:15:00' WHERE khung_gio_id = ?",
      [slotIds[1]],
    );
    const onLeave = await fx.search.publicDoctor(
      await fx.search.admin.branch(),
    );
    await fx.doctors.leaveRequest({
      bacSiId: onLeave.account.taiKhoanId,
      batDau: NGAY,
    });
    await fx.addShifts(onLeave, NGAY, ['CaSang']);

    const { body } = await slotsOf(
      `${doctorId},${onLeave.account.taiKhoanId}`,
    ).expect(200);
    expect(Object.keys(body).sort()).toEqual(['items', 'ngay']);
    const [first, second] = body.items;
    expect(Object.keys(first).sort()).toEqual([
      'bacSiId',
      'khungGio',
      'trangThaiNgay',
    ]);
    for (const slot of first.khungGio)
      expect(Object.keys(slot).sort()).toEqual([
        'batDau',
        'ca',
        'ketThuc',
        'khungGioId',
        'trangThai',
      ]);
    expect(
      first.khungGio.slice(0, 3).map((s: { trangThai: string }) => s.trangThai),
    ).toEqual(['DaDat', 'DangGiuCho', 'ConTrong']);
    expect(second).toEqual({
      bacSiId: onLeave.account.taiKhoanId,
      trangThaiNgay: 'KhongCoLich',
      khungGio: [],
    });
    const text = JSON.stringify(body);
    for (const leaked of [
      'giuChoDen',
      'lichHen',
      'lyDo',
      'Việc gia đình',
      'NghiPhep',
      'yeuCau',
      'email',
      'soDienThoai',
      'benhNhan',
      'matKhau',
      patient.account.email,
    ])
      expect(text).not.toContain(leaked);
  });

  it('KGC-44: bác sĩ không công khai, không tồn tại, id rất lớn ⇒ cùng thân (chống dò id)', async () => {
    const pending = await fx.search.pendingDoctor(
      await fx.search.admin.branch(),
    );
    await fx.addShifts(pending, NGAY, ['CaSang']);
    const ids = [pending.account.taiKhoanId, MISSING, '9223372036854775807'];
    const { body } = await slotsOf(ids.join(',')).expect(200);
    expect(body.items).toHaveLength(3);
    const same = (item: object) => JSON.stringify({ ...item, bacSiId: 'X' });
    expect(same(body.items[0])).toBe(same(body.items[1]));
    expect(same(body.items[2])).toBe(same(body.items[1]));
    expect(body.items.map((i: { bacSiId: string }) => i.bacSiId)).toEqual(ids);
  });

  it('KGC-45: đọc sau ghi: giữ chỗ ⇒ DangGiuCho; quá hạn ⇒ ConTrong; đặt ⇒ DaDat; thả ⇒ ConTrong', async () => {
    const holds = new SlotHoldService();
    const target = slotIds[3] as string;
    const den = new Date(NOW.getTime() + 15 * 60_000);
    const status = async () =>
      (await slotsOf(doctorId).expect(200)).body.items[0].khungGio[3]
        .trangThai as string;
    const write = (
      work: (
        em: EntityManager,
        slot: NonNullable<Awaited<ReturnType<typeof lockSlot>>>,
      ) => Promise<{ kind: string }>,
    ) =>
      db.transaction(async (em) => {
        const slot = await lockSlot(em, target);
        expect((await work(em, slot as NonNullable<typeof slot>)).kind).toBe(
          'Done',
        );
      });

    expect(await status()).toBe('ConTrong');
    await write((em, slot) => holds.hold(em, slot, { den }));
    expect(await status()).toBe('DangGiuCho');
    vi.setSystemTime(new Date(NOW.getTime() + 16 * 60_000)); // quá hạn giữ chỗ nhưng chưa ai quét
    expect(await status()).toBe('ConTrong');
    vi.setSystemTime(NOW);
    await write((em, slot) => holds.markBooked(em, slot));
    expect(await status()).toBe('DaDat');
    await write((em, slot) =>
      holds.release(em, slot, { from: 'DaDat', den: null }),
    );
    expect(await status()).toBe('ConTrong');
  });

  it('KGC-46 (CC-07): POST, PUT, PATCH, DELETE ⇒ 404 KHONG_TIM_THAY, không đổi dữ liệu; route con của doctors không bị đổi', async () => {
    const before = await snapshot();
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const response = await request(app.getHttpServer())[method](
        `${URL}?bacSiIds=${doctorId}&ngay=${NGAY}`,
      );
      expectErrorResponse(response, 404, 'KHONG_TIM_THAY');
    }
    expect(await snapshot()).toBe(before);
    // `slots` KHÔNG nằm dưới `public/doctors/`, nên `:id` của chi tiết bác sĩ vẫn chỉ nhận id (KGI-08).
    expectErrorResponse(
      await get('/public/doctors/slots'),
      404,
      'KHONG_TIM_THAY',
    );
    await get(`/public/doctors/${doctorId}`).expect(200);
  });
});

function e(truong: string, ma: string) {
  return { truong, ma };
}
