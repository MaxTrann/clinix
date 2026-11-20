import 'reflect-metadata';
import { inspect } from 'node:util';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { DoctorFixtures } from '../src/doctor/testing/doctor-fixtures.js';

// Doctor B13 — GET /admin/leave-requests và GET /admin/leave-requests/:id qua HTTP thật + MySQL thật:
// PD-01, PD-02, PD-14, PD-15 (phần xem), PD-16, PD-21, QH-02 (danh sách và chi tiết). Duyệt/từ chối thuộc B14, B15.
// Doctor UX2 (G15): dòng danh sách có thêm `lyDo` (DUX2-12 đến DUX2-16); mọi lý do trong test là chữ GIẢ.
describe('B13 — Quản trị viên: danh sách và chi tiết yêu cầu nghỉ phép', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fx: DoctorFixtures;
  let sessions: SessionService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    fx = new DoctorFixtures(db);
    sessions = app.get(SessionService);
  });
  beforeEach(async () => {
    await resetTables(db);
  });
  afterAll(async () => app?.close());

  const tokenOf = async (accountId: string) =>
    (await sessions.create(accountId)).accessToken;
  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).auth(token, { type: 'bearer' });
  const setCreatedAt = (id: string, at: string) =>
    db.query(
      `UPDATE yeu_cau_nghi_phep SET thoi_diem_tao = ? WHERE yeu_cau_nghi_phep_id = ?`,
      [at, id],
    );
  const idsOf = (res: { body: { items: { yeuCauNghiPhepId: string }[] } }) =>
    res.body.items.map((item) => item.yeuCauNghiPhepId);

  /** Chi nhánh A (bác sĩ A, Admin Toàn hệ thống, Admin Chi nhánh A) và chi nhánh B (bác sĩ B, Admin Chi nhánh B). */
  async function setup() {
    const world = await fx.world();
    const branchB = await fx.admin.branch();
    await fx.admin.weeklySchedule(branchB.chiNhanhId);
    const doctorB = await fx.admin.doctor(
      branchB,
      {},
      { hoTen: 'Trần Thị Bê' },
    );
    const branchAdminB = await fx.admin.admin(branchB);
    const doctorAId = world.doctor.account.taiKhoanId;
    const doctorBId = doctorB.account.taiKhoanId;
    return {
      ...world,
      branchB,
      branchAdminB,
      doctorAId,
      doctorBId,
      systemToken: await tokenOf(world.systemAdmin.account.taiKhoanId),
      branchToken: await tokenOf(world.branchAdmin.account.taiKhoanId),
      branchBToken: await tokenOf(branchAdminB.account.taiKhoanId),
    };
  }

  it('PD-01, DUX2-12 danh sách: có yêu cầu trong phạm vi và có `lyDo` (13 khoá); chưa có yêu cầu nào ⇒ 200 items rỗng và thongKe 0', async () => {
    const w = await setup();
    const empty = await get('/admin/leave-requests', w.systemToken).expect(200);
    expect(empty.body).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      thongKe: { choDuyet: 0, daDuyet: 0, tuChoi: 0, tong: 0 },
    });

    const mine = await fx.leaveRequest({
      bacSiId: w.doctorAId,
      batDau: '2026-12-01',
      ketThuc: '2026-12-02',
    });
    const res = await get(
      '/admin/leave-requests?trangThai=ChoDuyet',
      w.branchToken,
    ).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    const [item] = res.body.items;
    expect(Object.keys(item).sort()).toEqual(
      [
        'bacSi',
        'ca',
        'chiNhanh',
        'chuyenKhoa',
        'denNgay',
        'hinhThuc',
        // doctor UX2 (G15): lý do của Bác sĩ, trả ĐỦ ở dòng danh sách (web cắt khi hiển thị)
        'lyDo',
        // B17 (D13): số lịch hẹn bị ảnh hưởng của yêu cầu còn hiệu lực
        'soLichHenBiAnhHuong',
        'thoiDiemTao',
        'thoiDiemXuLy',
        'trangThai',
        'tuNgay',
        'yeuCauNghiPhepId',
      ].sort(),
    );
    expect(item).toMatchObject({
      yeuCauNghiPhepId: mine,
      trangThai: 'ChoDuyet',
      hinhThuc: 'CaNgay',
      tuNgay: '2026-12-01',
      denNgay: '2026-12-02',
      ca: null,
      lyDo: 'Việc gia đình',
      thoiDiemXuLy: null,
      bacSi: {
        bacSiId: w.doctorAId,
        hoTen: w.doctor.account.hoTen,
      },
      chiNhanh: { chiNhanhId: w.branch.chiNhanhId },
    });
    expect(typeof item.chuyenKhoa.ten).toBe('string');
    // DUX2-12: danh sách có `lyDo` nhưng vẫn không lộ người xử lý hay email (danh sách trắng)
    expect(item).not.toHaveProperty('nguoiXuLyId');
    expect(item).not.toHaveProperty('email');
  });

  it('PD-02 chi tiết: có lý do và người gửi; id không có, sai dạng, ngoài phạm vi cùng 404 cùng thân', async () => {
    const w = await setup();
    const mine = await fx.leaveRequest({
      bacSiId: w.doctorAId,
      hinhThuc: 'TheoCa',
      batDau: '2026-12-03',
      ca: 'CaSang',
    });
    const theirs = await fx.leaveRequest({ bacSiId: w.doctorBId });

    const ok = await get(`/admin/leave-requests/${mine}`, w.branchToken).expect(
      200,
    );
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(ok.body).toMatchObject({
      yeuCauNghiPhepId: mine,
      hinhThuc: 'TheoCa',
      ca: 'CaSang',
      lyDo: 'Việc gia đình',
      bacSi: { bacSiId: w.doctorAId },
    });
    expect(ok.body).not.toHaveProperty('nguoiXuLyId');
    expect(ok.body).not.toHaveProperty('email');

    const bodies = [];
    for (const id of [theirs, '999999', '0', 'abc'])
      bodies.push(
        expectErrorResponse(
          await get(`/admin/leave-requests/${id}`, w.branchToken),
          404,
          'KHONG_TIM_THAY',
        ),
      );
    for (const body of bodies) expect(body).toEqual(bodies[0]);
  });

  it('QH-02, PD-15 Toàn hệ thống thấy mọi chi nhánh; Chi nhánh chỉ phạm vi, chiNhanhId gửi lên bị bỏ qua', async () => {
    const w = await setup();
    const a = await fx.leaveRequest({ bacSiId: w.doctorAId });
    const b = await fx.leaveRequest({ bacSiId: w.doctorBId });
    await setCreatedAt(a, '2026-11-01 08:00:00');
    await setCreatedAt(b, '2026-11-02 08:00:00');

    const all = await get('/admin/leave-requests', w.systemToken).expect(200);
    expect(idsOf(all)).toEqual([b, a]);
    expect(all.body.thongKe.tong).toBe(2);

    const onlyB = await get(
      `/admin/leave-requests?chiNhanhId=${w.branchB.chiNhanhId}`,
      w.systemToken,
    ).expect(200);
    expect(idsOf(onlyB)).toEqual([b]);

    // Admin Chi nhánh A: thấy A; cố lọc sang chi nhánh B vẫn chỉ thấy A (ép phạm vi, không lộ B).
    const scoped = await get('/admin/leave-requests', w.branchToken).expect(
      200,
    );
    expect(idsOf(scoped)).toEqual([a]);
    expect(scoped.body.thongKe.tong).toBe(1);
    const forced = await get(
      `/admin/leave-requests?chiNhanhId=${w.branchB.chiNhanhId}`,
      w.branchToken,
    ).expect(200);
    expect(idsOf(forced)).toEqual([a]);
    // Cố lọc bác sĩ chi nhánh khác: rỗng, không phải lỗi.
    const other = await get(
      `/admin/leave-requests?bacSiId=${w.doctorBId}`,
      w.branchToken,
    ).expect(200);
    expect(other.body.items).toEqual([]);
    expect(other.body.thongKe.tong).toBe(0);

    // Chi tiết: Toàn hệ thống mở được cả hai; Chi nhánh B mở được B, không mở được A.
    await get(`/admin/leave-requests/${a}`, w.systemToken).expect(200);
    await get(`/admin/leave-requests/${b}`, w.systemToken).expect(200);
    await get(`/admin/leave-requests/${b}`, w.branchBToken).expect(200);
    expectErrorResponse(
      await get(`/admin/leave-requests/${a}`, w.branchBToken),
      404,
      'KHONG_TIM_THAY',
    );
  });

  it('PD-16 bác sĩ đã đổi chi nhánh: yêu cầu thuộc chi nhánh HIỆN TẠI', async () => {
    const w = await setup();
    const id = await fx.leaveRequest({ bacSiId: w.doctorAId });
    await db.query(
      `UPDATE bac_si SET chi_nhanh_id = ? WHERE tai_khoan_id = ?`,
      [w.branchB.chiNhanhId, w.doctorAId],
    );

    expect(
      idsOf(await get('/admin/leave-requests', w.branchBToken).expect(200)),
    ).toEqual([id]);
    expect(
      (await get('/admin/leave-requests', w.branchToken).expect(200)).body
        .items,
    ).toEqual([]);
    const detail = await get(`/admin/leave-requests/${id}`, w.branchBToken);
    expect(detail.status).toBe(200);
    expect(detail.body.chiNhanh.chiNhanhId).toBe(w.branchB.chiNhanhId);
    expectErrorResponse(
      await get(`/admin/leave-requests/${id}`, w.branchToken),
      404,
      'KHONG_TIM_THAY',
    );
  });

  it('PD-21 thongKe tính với cùng bộ lọc trừ trạng thái', async () => {
    const w = await setup();
    const admin = w.systemAdmin.account.taiKhoanId;
    const processed = {
      nguoiXuLyId: admin,
      thoiDiemXuLy: '2026-11-05 09:00:00',
    };
    await fx.leaveRequest({ bacSiId: w.doctorAId });
    await fx.leaveRequest({ bacSiId: w.doctorAId });
    await fx.leaveRequest({
      bacSiId: w.doctorAId,
      trangThai: 'DaDuyet',
      ...processed,
    });
    await fx.leaveRequest({
      bacSiId: w.doctorBId,
      trangThai: 'TuChoi',
      ...processed,
    });
    await fx.leaveRequest({ bacSiId: w.doctorBId });

    // Lọc DaDuyet: danh sách chỉ có 1, nhưng thẻ vẫn đếm đủ ba trạng thái của cùng bộ lọc.
    const tab = await get(
      '/admin/leave-requests?trangThai=DaDuyet',
      w.systemToken,
    ).expect(200);
    expect(tab.body.total).toBe(1);
    expect(tab.body.thongKe).toEqual({
      choDuyet: 3,
      daDuyet: 1,
      tuChoi: 1,
      tong: 5,
    });

    // Thêm bộ lọc bác sĩ: thẻ co lại theo bộ lọc đó.
    const doctor = await get(
      `/admin/leave-requests?bacSiId=${w.doctorAId}&trangThai=TuChoi`,
      w.systemToken,
    ).expect(200);
    expect(doctor.body.total).toBe(0);
    expect(doctor.body.thongKe).toEqual({
      choDuyet: 2,
      daDuyet: 1,
      tuChoi: 0,
      tong: 3,
    });

    // Admin Chi nhánh B: thẻ chỉ tính phạm vi của mình.
    const branchB = await get('/admin/leave-requests', w.branchBToken).expect(
      200,
    );
    expect(branchB.body.thongKe).toEqual({
      choDuyet: 1,
      daDuyet: 0,
      tuChoi: 1,
      tong: 2,
    });
  });

  it('Q38 lọc q theo tên bác sĩ hoặc chuyên khoa; ký tự % và _ là chữ thường, không phải ký tự đại diện', async () => {
    const w = await setup();
    const a = await fx.leaveRequest({ bacSiId: w.doctorAId });
    const b = await fx.leaveRequest({ bacSiId: w.doctorBId });
    const [{ ten }] = await db.query(
      `SELECT ck.ten FROM chuyen_khoa ck JOIN bac_si bs ON bs.chuyen_khoa_id = ck.chuyen_khoa_id WHERE bs.tai_khoan_id = ?`,
      [w.doctorAId],
    );

    expect(
      idsOf(
        await get(
          `/admin/leave-requests?q=${encodeURIComponent('Trần Thị Bê')}`,
          w.systemToken,
        ).expect(200),
      ),
    ).toEqual([b]);
    // Mỗi bác sĩ của fixture có chuyên khoa riêng: tìm theo tên chuyên khoa của A chỉ ra A.
    expect(
      idsOf(
        await get(
          `/admin/leave-requests?q=${encodeURIComponent(ten)}`,
          w.systemToken,
        ).expect(200),
      ),
    ).toEqual([a]);
    for (const wildcard of ['%%', '__'])
      expect(
        (
          await get(
            `/admin/leave-requests?q=${encodeURIComponent(wildcard)}`,
            w.systemToken,
          ).expect(200)
        ).body.items,
      ).toEqual([]);
  });

  it('Q38 lọc ngày gửi: gồm cả hai đầu theo giờ Việt Nam, khoảng nửa mở không bỏ sót giây cuối ngày', async () => {
    const w = await setup();
    const before = await fx.leaveRequest({ bacSiId: w.doctorAId });
    const first = await fx.leaveRequest({ bacSiId: w.doctorAId });
    const last = await fx.leaveRequest({ bacSiId: w.doctorAId });
    const after = await fx.leaveRequest({ bacSiId: w.doctorAId });
    await setCreatedAt(before, '2026-11-02 23:59:59');
    await setCreatedAt(first, '2026-11-03 00:00:00');
    await setCreatedAt(last, '2026-11-05 23:59:59');
    await setCreatedAt(after, '2026-11-06 00:00:00');

    const range = await get(
      '/admin/leave-requests?tuNgayGui=2026-11-03&denNgayGui=2026-11-05',
      w.systemToken,
    ).expect(200);
    expect(idsOf(range)).toEqual([last, first]);
    expect(range.body.thongKe.tong).toBe(2);
    expect(
      idsOf(
        await get(
          '/admin/leave-requests?denNgayGui=2026-11-03',
          w.systemToken,
        ).expect(200),
      ),
    ).toEqual([first, before]);
    expect(
      idsOf(
        await get(
          '/admin/leave-requests?tuNgayGui=2026-11-06',
          w.systemToken,
        ).expect(200),
      ),
    ).toEqual([after]);
  });

  it('Q38 phân trang: trang 2, total không đổi, trang vượt quá rỗng', async () => {
    const w = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1)
      ids.push(await fx.leaveRequest({ bacSiId: w.doctorAId }));
    const expected = [...ids].reverse();

    const page2 = await get(
      '/admin/leave-requests?page=2&pageSize=2',
      w.systemToken,
    ).expect(200);
    expect(idsOf(page2)).toEqual(expected.slice(2, 4));
    expect(page2.body).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    expect(page2.body.thongKe.tong).toBe(5);
    const beyond = await get(
      '/admin/leave-requests?page=9&pageSize=2',
      w.systemToken,
    ).expect(200);
    expect(beyond.body.items).toEqual([]);
    expect(beyond.body.total).toBe(5);
  });

  it('tham số sai ⇒ 400 DU_LIEU_KHONG_HOP_LE; khoá lạ ⇒ TRUONG_KHONG_DUOC_PHEP', async () => {
    const w = await setup();
    for (const bad of [
      'trangThai=DaHuy',
      'bacSiId=abc',
      'chiNhanhId=0',
      'page=0',
      'pageSize=101',
      'q=a',
      `q=${'x'.repeat(101)}`,
      'tuNgayGui=2026-02-30',
      'denNgayGui=2026-13-01',
      'tuNgayGui=2026-11-05&denNgayGui=2026-11-04',
    ])
      expectErrorResponse(
        await get(`/admin/leave-requests?${bad}`, w.systemToken),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
    const unknown = expectErrorResponse(
      await get('/admin/leave-requests?nguoiXuLyId=1', w.systemToken),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(unknown.loi).toContainEqual({
      truong: 'nguoiXuLyId',
      ma: 'TRUONG_KHONG_DUOC_PHEP',
    });
  });

  it('DUX2-13 PD-14 danh sách có lý do: 200 luôn `no-store`; Bác sĩ, Lễ tân, Bệnh nhân ⇒ 403 và chưa đăng nhập ⇒ 401 với thân lỗi KHÔNG chứa lý do', async () => {
    const w = await setup();
    const marker = 'BI_MAT_THAN_LOI_9K1';
    await fx.leaveRequest({ bacSiId: w.doctorAId, lyDo: marker });
    const patient = await fx.admin.patient();

    for (const token of [w.systemToken, w.branchToken]) {
      const ok = await get('/admin/leave-requests', token).expect(200);
      expect(ok.headers['cache-control']).toBe('no-store');
      expect(ok.body.items[0].lyDo).toBe(marker);
    }
    for (const accountId of [
      w.doctorAId,
      w.receptionist.account.taiKhoanId,
      patient.account.taiKhoanId,
    ]) {
      const res = expectErrorResponse(
        await get('/admin/leave-requests', await tokenOf(accountId)),
        403,
        'KHONG_DU_QUYEN',
      );
      expect(JSON.stringify(res)).not.toContain(marker);
    }
    const anonymous = await request(app.getHttpServer()).get(
      '/admin/leave-requests',
    );
    expectErrorResponse(anonymous, 401, 'CHUA_DANG_NHAP');
    expect(JSON.stringify(anonymous.body)).not.toContain(marker);
  });

  it('DUX2-14 PD-02 danh sách và chi tiết trả CÙNG một lyDo cho cùng id (Toàn hệ thống và Chi nhánh)', async () => {
    const w = await setup();
    const first = await fx.leaveRequest({
      bacSiId: w.doctorAId,
      lyDo: 'Lý do thứ nhất <b>& "nháy"</b>',
    });
    const second = await fx.leaveRequest({
      bacSiId: w.doctorAId,
      lyDo: 'Lý do thứ hai',
    });

    for (const token of [w.systemToken, w.branchToken]) {
      const list = await get('/admin/leave-requests', token).expect(200);
      for (const [id, lyDo] of [
        [first, 'Lý do thứ nhất <b>& "nháy"</b>'],
        [second, 'Lý do thứ hai'],
      ]) {
        const item = list.body.items.find(
          (i: { yeuCauNghiPhepId: string }) => i.yeuCauNghiPhepId === id,
        );
        expect(item.lyDo).toBe(lyDo);
        const detail = await get(`/admin/leave-requests/${id}`, token).expect(
          200,
        );
        expect(detail.body.lyDo).toBe(item.lyDo);
      }
    }
  });

  it('DUX2-15 QH-02 PD-15 lý do của chi nhánh khác KHÔNG xuất hiện ở bất cứ đâu trong thân phản hồi của Admin Chi nhánh (kể cả khi cố lọc sang chi nhánh đó)', async () => {
    const w = await setup();
    const a = 'BI_MAT_CHI_NHANH_A_4Z8';
    const b = 'BI_MAT_CHI_NHANH_B_7Q2';
    await fx.leaveRequest({ bacSiId: w.doctorAId, lyDo: a });
    await fx.leaveRequest({ bacSiId: w.doctorBId, lyDo: b });

    const all = await get('/admin/leave-requests', w.systemToken).expect(200);
    expect(JSON.stringify(all.body)).toContain(a);
    expect(JSON.stringify(all.body)).toContain(b);

    for (const path of [
      '/admin/leave-requests',
      `/admin/leave-requests?chiNhanhId=${w.branchB.chiNhanhId}`,
      `/admin/leave-requests?bacSiId=${w.doctorBId}`,
      `/admin/leave-requests?q=${encodeURIComponent('Trần Thị Bê')}`,
    ]) {
      const res = await get(path, w.branchToken).expect(200);
      expect(JSON.stringify(res.body)).not.toContain(b);
    }
    const seenByB = await get('/admin/leave-requests', w.branchBToken).expect(
      200,
    );
    expect(JSON.stringify(seenByB.body)).toContain(b);
    expect(JSON.stringify(seenByB.body)).not.toContain(a);
  });

  it('DUX2-16 log: lý do của Bác sĩ không bao giờ vào stdout, stderr hay console.* (danh sách, chi tiết, 404, 400, 403)', async () => {
    const w = await setup();
    const marker = 'BI_MAT_TRONG_LOG_3W6';
    const own = await fx.leaveRequest({ bacSiId: w.doctorAId, lyDo: marker });
    const theirs = await fx.leaveRequest({
      bacSiId: w.doctorBId,
      lyDo: `${marker} chi nhánh khác`,
    });
    const doctorToken = await tokenOf(w.doctorAId);
    const output: string[] = [];
    const capture = (chunk: unknown): boolean => {
      output.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stderr, 'write').mockImplementation(capture);
    vi.spyOn(process.stdout, 'write').mockImplementation(capture);
    // Trong vitest `console.*` đi qua bộ chặn console riêng, KHÔNG qua process.stdout.write: chặn riêng để một dòng `console.log(lyDo)` cũng bị bắt
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const)
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        output.push(
          args.map((a) => (typeof a === 'string' ? a : inspect(a))).join(' '),
        );
      });

    const responses = [
      await get('/admin/leave-requests', w.systemToken), // 200
      await get('/admin/leave-requests', w.branchToken), // 200
      await get(`/admin/leave-requests/${own}`, w.systemToken), // 200
      await get(`/admin/leave-requests/${theirs}`, w.branchToken), // 404 ngoài phạm vi
      await get('/admin/leave-requests?trangThai=DaHuy', w.systemToken), // 400
      await get('/admin/leave-requests', doctorToken), // 403
    ];
    vi.restoreAllMocks();

    expect(responses.map((res) => res.status)).toEqual([
      200, 200, 200, 404, 400, 403,
    ]);
    // Chỉ hai phản hồi 200 đầu và chi tiết mới được chứa lý do; các phản hồi lỗi thì không
    for (const res of responses.slice(3))
      expect(JSON.stringify(res.body)).not.toContain(marker);
    expect(output.join('')).not.toContain(marker);
  });

  it('PD-14 Bác sĩ, Lễ tân, Bệnh nhân ⇒ 403; chưa đăng nhập ⇒ 401 (cả hai route)', async () => {
    const w = await setup();
    const id = await fx.leaveRequest({ bacSiId: w.doctorAId });
    const patient = await fx.admin.patient();
    const paths = ['/admin/leave-requests', `/admin/leave-requests/${id}`];
    for (const accountId of [
      w.doctorAId,
      w.receptionist.account.taiKhoanId,
      patient.account.taiKhoanId,
    ])
      for (const path of paths)
        expectErrorResponse(
          await get(path, await tokenOf(accountId)),
          403,
          'KHONG_DU_QUYEN',
        );
    for (const path of paths)
      expectErrorResponse(
        await request(app.getHttpServer()).get(path),
        401,
        'CHUA_DANG_NHAP',
      );
  });
});
