import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';

// payment B10 — HTTP qua AppModule thật + MySQL thật (PLAN payment 7.1): CSD-14 (vai trò và phạm vi), CSD-15 (404 cùng thân, khoá lạ, no-store) và hình dạng thân vào của PUT.
// Dịch vụ mẫu có `gia_mac_dinh` = 100000.00. Dữ liệu giả.
describe('payment B10 — /admin/payment-policy qua HTTP', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let sessions: SessionService;
  let serviceId: string;
  const tokens = {} as Record<
    'system' | 'branch' | 'patient' | 'reception' | 'doctor',
    string
  >;
  const base = '/admin/payment-policy/services';
  const valid = {
    mucDatCoc: '100000',
    moc: [
      { soGioTruocToiThieu: 24, tyLeHoan: 100 },
      { soGioTruocToiThieu: 2, tyLeHoan: 50 },
      { soGioTruocToiThieu: 0, tyLeHoan: 0 },
    ],
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    sessions = app.get(SessionService);
  });
  beforeEach(async () => {
    await resetTables(db);
    const fixtures = new AdminFixtures(db);
    serviceId = (await fixtures.catalog()).service.dichVuKhamId;
    const branch = await fixtures.branch();
    const token = async (accountId: string) =>
      (await sessions.create(accountId)).accessToken;
    tokens.system = await token((await fixtures.admin()).account.taiKhoanId);
    tokens.branch = await token(
      (await fixtures.admin(branch)).account.taiKhoanId,
    );
    tokens.patient = await token((await fixtures.patient()).account.taiKhoanId);
    tokens.reception = await token(
      (await fixtures.receptionist(branch)).account.taiKhoanId,
    );
    tokens.doctor = await token(
      (await fixtures.doctor(branch)).account.taiKhoanId,
    );
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => app?.close());

  const call = (
    method: 'get' | 'put',
    path: string,
    token: string | null,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())[method](path);
    if (token !== null) req.auth(token, { type: 'bearer' });
    return body === undefined ? req : req.send(body);
  };
  const put = (
    id: string,
    body: object,
    token: string | null = tokens.system,
  ) => call('put', `${base}/${id}`, token, body);

  it('CSD-14 đúng vai trò: Quản trị viên ToanHeThong được GET danh sách, GET chi tiết và PUT (200)', async () => {
    const saved = await put(serviceId, valid);
    expect(saved.status).toBe(200);
    expect(saved.body).toStrictEqual({
      dichVuKhamId: serviceId,
      mucDatCoc: '100000.00',
      moc: valid.moc,
    });

    const one = await call('get', `${base}/${serviceId}`, tokens.system);
    expect(one.status).toBe(200);
    expect(one.body).toStrictEqual(saved.body);

    const list = await call('get', base, tokens.system);
    expect(list.status).toBe(200);
    const item = (
      list.body as {
        nhom: {
          dichVu: { dichVuKhamId: string; coChinhSachRieng: boolean }[];
        }[];
      }
    ).nhom
      .flatMap((group) => group.dichVu)
      .find((service) => service.dichVuKhamId === serviceId);
    expect(item).toMatchObject({
      mucDatCoc: '100000.00',
      giaMacDinh: '100000.00',
      coChinhSachRieng: true,
    });
  });

  it.each([
    ['Quản trị viên chi nhánh', 'branch'],
    ['Bệnh nhân', 'patient'],
    ['Lễ tân', 'reception'],
    ['Bác sĩ', 'doctor'],
  ] as const)(
    'CSD-14 sai vai trò: %s nhận 403 ở cả ba route và DB không đổi',
    async (_name, who) => {
      const token = tokens[who];
      for (const res of [
        await call('get', base, token),
        await call('get', `${base}/${serviceId}`, token),
        await put(serviceId, valid, token),
      ]) {
        expectErrorResponse(res, 403, 'KHONG_DU_QUYEN');
      }
      const [row]: { coc: string }[] = await db.query(
        'SELECT CAST(muc_dat_coc AS CHAR) AS coc FROM dich_vu_kham WHERE dich_vu_kham_id = ?',
        [serviceId],
      );
      expect(row!.coc).toBe('0.00');
    },
  );

  it('CSD-14 chưa đăng nhập hay token hỏng ⇒ 401 ở cả ba route', async () => {
    for (const token of [null, 'khong-phai-token']) {
      for (const res of [
        await call('get', base, token),
        await call('get', `${base}/${serviceId}`, token),
        await put(serviceId, valid, token),
      ]) {
        expect(res.status).toBe(401);
      }
    }
  });

  it('CSD-15 dịch vụ không tồn tại ⇒ 404 KHONG_TIM_THAY, cùng một thân cho GET và PUT; id sai dạng ⇒ 400', async () => {
    const getMissing = await call('get', `${base}/999999`, tokens.system);
    const putMissing = await put('999999', valid);
    const a = expectErrorResponse(getMissing, 404, 'KHONG_TIM_THAY');
    const b = expectErrorResponse(putMissing, 404, 'KHONG_TIM_THAY');
    expect(b).toStrictEqual(a);

    for (const badId of ['abc', '0', '-1', '1.5', '99999999999999999999']) {
      expectErrorResponse(
        await call('get', `${base}/${badId}`, tokens.system),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
    }
  });

  it('CSD-15 khoá lạ ở thân (kể cả dichVuKhamId, giaMacDinh, benhNhanId) ⇒ 400 TRUONG_KHONG_DUOC_PHEP; không đổi gì', async () => {
    for (const extra of [
      { giaMacDinh: '1' },
      { dichVuKhamId: '1' },
      { benhNhanId: '1' },
    ]) {
      const res = await put(serviceId, { ...valid, ...extra });
      const body = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(body.loi).toContainEqual({
        truong: Object.keys(extra)[0],
        ma: 'TRUONG_KHONG_DUOC_PHEP',
      });
    }
    // Khoá lạ trong MỘT mốc cũng bị chặn
    const nested = await put(serviceId, {
      ...valid,
      moc: [{ soGioTruocToiThieu: 1, tyLeHoan: 1, ghiChu: 'x' }],
    });
    expectErrorResponse(nested, 400, 'DU_LIEU_KHONG_HOP_LE');
    const [row]: { coc: string }[] = await db.query(
      'SELECT CAST(muc_dat_coc AS CHAR) AS coc FROM dich_vu_kham WHERE dich_vu_kham_id = ?',
      [serviceId],
    );
    expect(row!.coc).toBe('0.00');
  });

  it('CSD-15 Cache-Control: no-store ở mọi route, kể cả khi lỗi do guard-sau-pipe (400) và lỗi nghiệp vụ (400, 404)', async () => {
    const responses = [
      await call('get', base, tokens.system),
      await call('get', `${base}/${serviceId}`, tokens.system),
      await put(serviceId, valid),
      await call('get', `${base}/abc`, tokens.system),
      await call('get', `${base}/999999`, tokens.system),
      await put(serviceId, { ...valid, mucDatCoc: '100001' }),
    ];
    expect(responses.map((res) => res.status)).toEqual([
      200, 200, 200, 400, 404, 400,
    ]);
    for (const res of responses)
      expect(res.headers['cache-control']).toBe('no-store');
  });

  it.each([
    ['mucDatCoc là số, không phải chuỗi', { mucDatCoc: 100000 }, 'mucDatCoc'],
    ['mucDatCoc có phần lẻ', { mucDatCoc: '1.5' }, 'mucDatCoc'],
    ['mucDatCoc rỗng', { mucDatCoc: '' }, 'mucDatCoc'],
    ['mucDatCoc null', { mucDatCoc: null }, 'mucDatCoc'],
    ['mucDatCoc có khoảng trắng', { mucDatCoc: ' 100' }, 'mucDatCoc'],
    ['mucDatCoc số 0 đứng đầu', { mucDatCoc: '0100' }, 'mucDatCoc'],
    ['mucDatCoc quá dài', { mucDatCoc: '12345678901' }, 'mucDatCoc'],
    ['moc không phải mảng', { moc: 'x' }, 'moc'],
    ['moc thiếu', { moc: undefined }, 'moc'],
    [
      'tyLeHoan là chuỗi',
      { moc: [{ soGioTruocToiThieu: 1, tyLeHoan: '50' }] },
      'moc.0.tyLeHoan',
    ],
    [
      'soGioTruocToiThieu null',
      { moc: [{ soGioTruocToiThieu: null, tyLeHoan: 5 }] },
      'moc.0.soGioTruocToiThieu',
    ],
    ['mốc là chuỗi', { moc: ['x'] }, 'moc.0'],
  ])(
    'hình dạng sai: %s ⇒ 400 DU_LIEU_KHONG_HOP_LE, không đổi gì, không mang giá trị gửi',
    async (_name, patch, field) => {
      const res = await put(serviceId, { ...valid, ...patch });
      const body = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(body.loi?.map((error) => error.truong)).toContain(field);
      expect(JSON.stringify(body)).not.toMatch(/12345678901|0100/);
      const [row]: { coc: string }[] = await db.query(
        'SELECT CAST(muc_dat_coc AS CHAR) AS coc FROM dich_vu_kham WHERE dich_vu_kham_id = ?',
        [serviceId],
      );
      expect(row!.coc).toBe('0.00');
    },
  );

  it('luật nghiệp vụ qua HTTP: số âm và ngoài khoảng tới được luật (không bị DTO chặn) và trả 400 CHINH_SACH_COC_KHONG_HOP_LE kèm loi[] đủ lỗi', async () => {
    const res = await put(serviceId, {
      mucDatCoc: '-1',
      moc: [
        { soGioTruocToiThieu: -1, tyLeHoan: 101 },
        { soGioTruocToiThieu: 5, tyLeHoan: -1 },
      ],
    });
    const body = expectErrorResponse(res, 400, 'CHINH_SACH_COC_KHONG_HOP_LE');
    expect(body.loi).toEqual([
      { truong: 'mucDatCoc', ma: 'MUC_COC_AM' },
      { truong: 'moc[0].soGioTruocToiThieu', ma: 'SO_GIO_MOC_KHONG_HOP_LE' },
      { truong: 'moc[0].tyLeHoan', ma: 'TY_LE_HOAN_NGOAI_KHOANG' },
      { truong: 'moc[1].tyLeHoan', ma: 'TY_LE_HOAN_NGOAI_KHOANG' },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/101/);

    // Bảy mốc ⇒ QUA_NHIEU_MOC (CSD-08 qua HTTP)
    const seven = await put(serviceId, {
      mucDatCoc: '0',
      moc: Array.from({ length: 7 }, (_, i) => ({
        soGioTruocToiThieu: 100 - i,
        tyLeHoan: 100 - i,
      })),
    });
    expect(
      expectErrorResponse(seven, 400, 'CHINH_SACH_COC_KHONG_HOP_LE').loi,
    ).toContainEqual({ truong: 'moc', ma: 'QUA_NHIEU_MOC' });
  });

  it('CSD-18 qua HTTP: PATCH /admin/services hạ giá dưới cọc ⇒ 409 GIA_DUOI_MUC_COC (thân chuẩn, không khoá lạ)', async () => {
    expect((await put(serviceId, valid)).status).toBe(200);
    const res = await call('get', '/health', null);
    expect(res.status).toBe(200);
    const patched = await request(app.getHttpServer())
      .patch(`/admin/services/${serviceId}`)
      .auth(tokens.system, { type: 'bearer' })
      .send({ giaMacDinh: '99999' });
    expectErrorResponse(patched, 409, 'GIA_DUOI_MUC_COC');
  });
});
