import request from 'supertest';
import { vi } from 'vitest';
import { AdminFixtures } from './../src/admin/testing/admin-fixtures.js';
import { TaiKhoan } from './../src/auth/entities/tai-khoan.entity.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  expectNoSetCookie,
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectNoSecrets } from './../src/auth/testing/secret-scan.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import {
  PATIENT_ERROR_CODES,
  PATIENT_ERROR_MESSAGES,
} from './../src/patient/patient.constants.js';
import { RelativesRepository } from './../src/patient/relatives/relatives.repository.js';
import { snapshotTables } from './../src/patient/testing/profile-update-helpers.js';
import { appointmentAt } from './../src/patient/testing/relatives-deactivate-helpers.js';
import {
  insertRelativeRow,
  removePatientRows,
  storedRows,
  UNTOUCHED_TABLES,
  withAutoIncrement,
} from './../src/patient/testing/relatives-helpers.js';
import {
  bodyOf,
  captureProcessOutput,
  storedRow,
  UPDATE_A,
} from './../src/patient/testing/relatives-update-helpers.js';

// Task B5 — POST /patient/relatives/:id/deactivate qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (patient PLAN 7.2, 7.4, 7.6; TRACKING B5-G).
// Mã ca RDE-nn là [đề xuất]. NT-17 và NT-24 (tương tranh) ở relatives.service.deactivate.concurrency.int-spec.ts; NT-20…NT-23 thuộc web (F6, F7); QP-04 thuộc B6, B7.
const PATH = '/patient/relatives';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const SESSION_LOST = 'PHIEN_HET_HIEU_LUC';
const NOT_FOUND = 'KHONG_TIM_THAY';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const BAD_REQUEST = 'YEU_CAU_KHONG_HOP_LE';
const INTERNAL = 'LOI_HE_THONG';
const CONFLICT = PATIENT_ERROR_CODES.RELATIVE_HAS_ACTIVE_APPOINTMENTS;
const DONE = { trangThaiHieuLuc: false };
const DETAIL_KEYS = ['bacSi', 'chiNhanh', 'maLichHen', 'thoiGian', 'trangThai'];
// Thân 404 mặc định: GIỐNG HỆT cho id sai dạng, không có, của người khác và đã ngừng của người khác (H3, Q27)
const NOT_FOUND_BODY = {
  maLoi: NOT_FOUND,
  thongBao: 'Không tìm thấy dữ liệu.',
};
const at = (hhmm: string) => `2026-11-02T${hhmm}:00+07:00`;

let h: RefreshHarness;
let fx: AdminFixtures;
let output: string[];

beforeEach(async () => {
  await resetTables(h.db);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  h.mail.reset();
  output = captureProcessOutput();
});

beforeAll(async () => {
  h = await openRefreshHarness();
  fx = new AdminFixtures(h.db);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  // Chốt an toàn: không để lại id lớn nào của RDE-13 dù ca đỏ (withAutoIncrement đã dọn trong finally)
  await resetTables(h.db);
  await h.close();
});

// `target` là phần đường dẫn giữa /patient/relatives/ và /deactivate, viết thẳng (đã mã hoá phần trăm nếu cần)
const post = (target: string, accessToken?: string) => {
  const req = request(h.app.getHttpServer()).post(
    `${PATH}/${target}/deactivate`,
  );
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const list = (accessToken: string) =>
  request(h.app.getHttpServer())
    .get(PATH)
    .set('Authorization', `Bearer ${accessToken}`);
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const rows = (ownerId?: string) => storedRows(h.db, ownerId);

// Bệnh nhân có token và MỘT hồ sơ người thân đang hiệu lực
async function patientWithRelative(hoTen = 'Tên Gốc Giả') {
  const { account } = await fx.patient();
  const id = await insertRelativeRow(h.db, account.taiKhoanId, {
    hoTen,
    active: true,
  });
  return {
    ownerId: account.taiKhoanId,
    id,
    token: await tokenOf(account.taiKhoanId),
  };
}

describe('POST /patient/relatives/:id/deactivate', () => {
  it('RDE-01 (NT-10, QP-01) Bệnh nhân ngừng hồ sơ không có lịch ⇒ 200 đúng một khoá, no-store, JSON, không Set-Cookie; GET sau đó thấy hồ sơ đã ngừng và xuống cuối danh sách; DB đúng một cột đổi; hồ sơ khác và bảng khác không đổi', async () => {
    const { ownerId, id, token } = await patientWithRelative('Người thân A');
    const sibling = await insertRelativeRow(h.db, ownerId, {
      hoTen: 'Anh chị em',
      active: true,
    });
    const siblingBefore = await storedRow(h.db, sibling);
    const idBefore = await storedRow(h.db, id);
    const tables = await snapshotTables(h.db, UNTOUCHED_TABLES);

    const res = await post(id, token);

    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual(DONE);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(String(res.headers['content-type'])).toContain('application/json');
    expectNoSetCookie(res);
    const got = await list(token);
    const items = (
      got.body as {
        items: { hoSoNguoiThanId: string; trangThaiHieuLuc: boolean }[];
      }
    ).items;
    expect(items.map((i) => [i.hoSoNguoiThanId, i.trangThaiHieuLuc])).toEqual([
      [sibling, true],
      [id, false],
    ]);
    expect(await storedRow(h.db, id)).toStrictEqual({
      ...idBefore,
      trang_thai_hieu_luc: 0,
    });
    expect(await storedRow(h.db, sibling)).toStrictEqual(siblingBefore);
    expect(await snapshotTables(h.db, UNTOUCHED_TABLES)).toEqual(tables);
  });

  it('RDE-02 (NT-12, NT-13, Q11) còn lịch chặn ⇒ 409 HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN, thongBao nguyên văn, chiTiet CHỈ lịch chặn, đúng năm khoá, sắp theo thời gian tăng dần, có no-store; hồ sơ và lịch hẹn không đổi', async () => {
    const { ownerId, id, token } = await patientWithRelative();
    const late = await appointmentAt(fx, ownerId, id, 'ChoThanhToan', {
      thoiGian: at('10:00'),
      doctorName: 'Bác Sĩ Muộn',
      branchName: 'Chi nhánh Muộn',
    });
    const early = await appointmentAt(fx, ownerId, id, 'DaTiepDon', {
      thoiGian: at('08:00'),
      doctorName: 'Bác Sĩ Sớm',
      branchName: 'Chi nhánh Sớm',
    });
    await appointmentAt(fx, ownerId, id, 'HoanThanh', {
      thoiGian: at('07:00'),
    });
    const before = await rows();
    const lichHen = await snapshotTables(h.db, ['lich_hen']);

    const res = await post(id, token);

    const body = expectErrorResponse(res, 409, CONFLICT);
    expect(body.thongBao).toBe(PATIENT_ERROR_MESSAGES[CONFLICT]);
    expect(res.headers['cache-control']).toBe('no-store');
    expect((res.body as { chiTiet: unknown }).chiTiet).toStrictEqual([
      {
        maLichHen: early.appointment.maLichHen,
        thoiGian: '2026-11-02T01:00:00.000Z',
        trangThai: 'DaTiepDon',
        bacSi: 'Bác Sĩ Sớm',
        chiNhanh: 'Chi nhánh Sớm',
      },
      {
        maLichHen: late.appointment.maLichHen,
        thoiGian: '2026-11-02T03:00:00.000Z',
        trangThai: 'ChoThanhToan',
        bacSi: 'Bác Sĩ Muộn',
        chiNhanh: 'Chi nhánh Muộn',
      },
    ]);
    for (const item of (res.body as { chiTiet: object[] }).chiTiet) {
      expect(Object.keys(item).sort()).toEqual(DETAIL_KEYS);
    }
    expect(await rows()).toStrictEqual(before);
    expect(await snapshotTables(h.db, ['lich_hen'])).toEqual(lichHen);
  });

  it('RDE-03 (NT-15, Q10) ngừng hồ sơ đã ngừng, và ngừng hai lần liên tiếp ⇒ 200 cả ba lần với cùng thân; DB sau lần đầu giống hệt sau lần cuối', async () => {
    const { id, token } = await patientWithRelative();

    const first = await post(id, token);
    const afterFirst = await rows();
    const second = await post(id, token);
    const third = await post(id, token);

    for (const res of [first, second, third]) {
      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual(DONE);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(await rows()).toStrictEqual(afterFirst);
  });

  it('RDE-04 (QP-01) không token ⇒ 401 CHUA_DANG_NHAP; token rác ⇒ 401 TOKEN_KHONG_HOP_LE; cả khi id sai dạng (guard chạy trước Pipe); DB không đổi', async () => {
    const { id } = await patientWithRelative();
    const before = await rows();

    expectErrorResponse(await post(id), 401, NOT_LOGGED_IN);
    expectErrorResponse(await post('0'), 401, NOT_LOGGED_IN);
    expectErrorResponse(await post(id, 'khong.phai.token'), 401, INVALID_TOKEN);
    expectErrorResponse(
      await post('0', 'khong.phai.token'),
      401,
      INVALID_TOKEN,
    );
    expect(await rows()).toStrictEqual(before);
  });

  it('RDE-04b (QP-07) phiên đã thu hồi / tài khoản NgungHoatDong / ChoKichHoat ⇒ 401 PHIEN_HET_HIEU_LUC, hồ sơ không đổi', async () => {
    const revoked = await patientWithRelative('Phiên thu hồi');
    const session = await h.sessions.create(revoked.ownerId);
    await h.sessions.revoke(session.sessionId);
    const suspended = await patientWithRelative('Bị khoá');
    await h.db
      .getRepository(TaiKhoan)
      .update(suspended.ownerId, { trangThai: 'NgungHoatDong' });
    const waiting = await fx.receptionist(await fx.branch());
    const waitingToken = await tokenOf(waiting.account.taiKhoanId);
    await h.db.getRepository(TaiKhoan).update(waiting.account.taiKhoanId, {
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
    });
    const before = await rows();

    for (const [token, id] of [
      [session.accessToken, revoked.id],
      [suspended.token, suspended.id],
      [waitingToken, revoked.id],
    ] as const) {
      expectErrorResponse(await post(id, token), 401, SESSION_LOST);
    }
    expect(await rows()).toStrictEqual(before);
  });

  it('RDE-05 (QP-03) Lễ tân, Quản trị viên Toàn hệ thống, Quản trị viên Chi nhánh và Bác sĩ ⇒ 403 KHONG_DU_QUYEN (cả với id sai dạng); DB không đổi', async () => {
    const { id } = await patientWithRelative();
    const branch = await fx.branch();
    const accounts = [
      (await fx.receptionist(branch)).account,
      (await fx.admin()).account,
      (await fx.admin(branch)).account,
      (await fx.doctor(branch)).account,
    ];
    const before = await rows();

    for (const account of accounts) {
      const token = await tokenOf(account.taiKhoanId);
      expectErrorResponse(await post(id, token), 403, FORBIDDEN);
      expectErrorResponse(await post('0', token), 403, FORBIDDEN);
    }
    expect(await rows()).toStrictEqual(before);
  });

  it('RDE-06 (NT-08, QP-06, H3) hồ sơ đang dùng của Bệnh nhân khác, id không tồn tại, hồ sơ ĐÃ NGỪNG của Bệnh nhân khác, và tài khoản không có dòng benh_nhan ⇒ cả bốn 404 KHONG_TIM_THAY với thân BẰNG NHAU từng chữ, có no-store; DB không đổi', async () => {
    const caller = await fx.patient();
    const stranger = await fx.patient();
    const activeOfStranger = await insertRelativeRow(
      h.db,
      stranger.account.taiKhoanId,
      { hoTen: 'Người lạ đang dùng', active: true },
    );
    const inactiveOfStranger = await insertRelativeRow(
      h.db,
      stranger.account.taiKhoanId,
      { hoTen: 'Người lạ đã ngừng', active: false },
    );
    const token = await tokenOf(caller.account.taiKhoanId);
    const orphan = await fx.patient();
    const orphanToken = await tokenOf(orphan.account.taiKhoanId);
    await removePatientRows(h.db, orphan.account.taiKhoanId);
    const before = await rows();
    const tables = await snapshotTables(h.db, UNTOUCHED_TABLES);

    const responses = [];
    for (const [id, accessToken] of [
      [activeOfStranger, token],
      ['424242', token],
      [inactiveOfStranger, token],
      ['1', orphanToken],
    ] as const) {
      const res = await post(id, accessToken);
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.headers['cache-control']).toBe('no-store');
      responses.push(res.body);
    }

    expect(responses).toStrictEqual(Array(4).fill(NOT_FOUND_BODY));
    expect(await rows()).toStrictEqual(before);
    expect(await snapshotTables(h.db, UNTOUCHED_TABLES)).toEqual(tables);
  });

  it.each([
    ['0', '0'],
    ['-1', '-1'],
    ['1.5', '1.5'],
    ['1e3', '1e3'],
    ['abc', 'abc'],
    ['số 0 đứng đầu', '01'],
    ['dấu cách đầu', '%201'],
    ['chữ số Ả Rập', '%D9%A3'],
    ['20 chữ số', '12345678901234567890'],
    ['tràn BIGINT', '9223372036854775808'],
    ['5000 ký tự', 'x'.repeat(5000)],
  ])(
    'RDE-06b (NT-08, Q27) id sai dạng (%s) ⇒ 404 KHONG_TIM_THAY với đúng thân 404 mặc định; DB không đổi',
    async (_label, id) => {
      const { token } = await patientWithRelative();
      const before = await rows();

      const res = await post(id, token);

      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.body).toStrictEqual(NOT_FOUND_BODY);
      expect(await rows()).toStrictEqual(before);
    },
  );

  it.each(['%', '%E0%A4%A'])(
    'RDE-06c chuỗi phần trăm hỏng %s trên đường dẫn ⇒ 400 YEU_CAU_KHONG_HOP_LE JSON chuẩn do Express (không 404, không 500); DB không đổi',
    async (id) => {
      const { token } = await patientWithRelative();
      const before = await rows();

      const res = await post(id, token);

      expectErrorResponse(res, 400, BAD_REQUEST);
      expect(await rows()).toStrictEqual(before);
    },
  );

  it('RDE-07 (QP-06) Bệnh nhân A ngừng hồ sơ của B ⇒ 404, hồ sơ của B không đổi; ngừng hồ sơ của chính A kèm ?benhNhanId=<B> và ?taiKhoanId=<B> ⇒ 200, query bị bỏ qua, chỉ hồ sơ của A đổi', async () => {
    const a = await patientWithRelative('Của A');
    const b = await patientWithRelative('Của B');
    const bBefore = await rows(b.ownerId);

    expectErrorResponse(await post(b.id, a.token), 404, NOT_FOUND);
    expect(await rows(b.ownerId)).toStrictEqual(bBefore);

    const res = await post(a.id, a.token).query({
      benhNhanId: b.ownerId,
      taiKhoanId: b.ownerId,
    });

    expect(res.status).toBe(200);
    expect((await storedRow(h.db, a.id)).trang_thai_hieu_luc).toBe(0);
    expect(await rows(b.ownerId)).toStrictEqual(bBefore);
  });

  it('RDE-08 (Q26) thân bất kỳ bị BỎ QUA: {}, thân có trangThaiHieuLuc/benhNhanId, mảng, text/plain ⇒ vẫn 200 như không thân; JSON hỏng ⇒ 400 YEU_CAU_KHONG_HOP_LE; id sai dạng kèm thân lạ ⇒ 404', async () => {
    const bodies: [string, (req: request.Test) => request.Test][] = [
      ['{}', (req) => req.send({})],
      [
        'thân có trường lạ',
        (req) => req.send({ trangThaiHieuLuc: true, benhNhanId: '999' }),
      ],
      ['mảng', (req) => req.send([])],
      [
        'text/plain',
        (req) => req.set('Content-Type', 'text/plain').send('xin chào'),
      ],
    ];
    for (const [label, build] of bodies) {
      const { ownerId, id, token } = await patientWithRelative(label);

      const res = await build(post(id, token));

      expect(res.status, label).toBe(200);
      expect(res.body, label).toStrictEqual(DONE);
      expect((await storedRow(h.db, id)).trang_thai_hieu_luc, label).toBe(0);
      expect((await storedRow(h.db, id)).benh_nhan_id, label).toBe(ownerId);
    }
    const { id, token } = await patientWithRelative('JSON hỏng');
    const broken = await post(id, token)
      .set('Content-Type', 'application/json')
      .send('{"a":');
    expectErrorResponse(broken, 400, BAD_REQUEST);
    expect((await storedRow(h.db, id)).trang_thai_hieu_luc).toBe(1);
    expectErrorResponse(
      await post('abc', token).send({ x: 1 }),
      404,
      NOT_FOUND,
    );
  });

  it('RDE-09 (NT-15, F7 bấm đúp) hai POST ngừng ĐỒNG THỜI cùng một hồ sơ ⇒ cả hai 200 cùng thân (không 409, không 500, không deadlock); DB cuối cùng đúng một lần ngừng', async () => {
    const { id, token } = await patientWithRelative();

    const [first, second] = await Promise.all([
      post(id, token),
      post(id, token),
    ]);

    for (const res of [first, second]) {
      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual(DONE);
    }
    expect((await storedRow(h.db, id)).trang_thai_hieu_luc).toBe(0);
  });

  it('RDE-10 (BM-01) log của các luồng 200, 401, 403, 404, 409, 500 không có họ tên người thân, tên bác sĩ, tên chi nhánh (và log không rỗng giả)', async () => {
    const owner = await patientWithRelative('Người Thân Nhạy Cảm Một');
    const blocked = await insertRelativeRow(h.db, owner.ownerId, {
      hoTen: 'Người Thân Nhạy Cảm Hai',
      active: true,
    });
    const third = await insertRelativeRow(h.db, owner.ownerId, {
      hoTen: 'Người Thân Nhạy Cảm Ba',
      active: true,
    });
    await appointmentAt(fx, owner.ownerId, blocked, 'DaXacNhan', {
      thoiGian: at('08:00'),
      doctorName: 'Bác Sĩ Nhạy Cảm',
      branchName: 'Chi Nhánh Nhạy Cảm',
    });
    const suspended = await fx.patient();
    const suspendedToken = await tokenOf(suspended.account.taiKhoanId);
    await h.db
      .getRepository(TaiKhoan)
      .update(suspended.account.taiKhoanId, { trangThai: 'NgungHoatDong' });
    const doctor = await fx.doctor(await fx.branch());

    expect((await post(owner.id, owner.token)).status).toBe(200);
    expectErrorResponse(
      await post(owner.id, suspendedToken),
      401,
      SESSION_LOST,
    );
    expectErrorResponse(
      await post(owner.id, await tokenOf(doctor.account.taiKhoanId)),
      403,
      FORBIDDEN,
    );
    expectErrorResponse(await post('424242', owner.token), 404, NOT_FOUND);
    expectErrorResponse(await post(blocked, owner.token), 409, CONFLICT);
    vi.spyOn(
      h.app.get(RelativesRepository),
      'deactivateRelative',
    ).mockRejectedValueOnce(new Error('mất kết nối'));
    const dbRes = await post(third, owner.token);
    expectErrorResponse(dbRes, 500, INTERNAL);

    const log = output.join('');
    // Không rỗng giả: lỗi 500 phải để lại dấu trong log kèm requestId và dòng ghi POST (đang bắt thật)
    const { requestId } = dbRes.body as { requestId: string };
    expect(log).toContain(requestId);
    expect(log).toContain(`POST ${PATH}/${third}/deactivate → 500`);
    expectNoSecrets('log', log, {
      literals: [
        'Người Thân Nhạy Cảm Một',
        'Người Thân Nhạy Cảm Hai',
        'Người Thân Nhạy Cảm Ba',
        'Bác Sĩ Nhạy Cảm',
        'Chi Nhánh Nhạy Cảm',
      ],
      codes: [],
    });
  });

  it('RDE-11 (BM-02, NT-16) lỗi DB ngoài dự kiến mang câu SQL chứa giá trị và errno 1213, ở bước khoá đầu tiên và ở câu UPDATE cuối ⇒ 500 LOI_HE_THONG + requestId, thân và log không có SQL hay giá trị; hồ sơ không đổi (hoàn tác), không bị đổi thành 409/503', async () => {
    const { id, token } = await patientWithRelative();
    const before = await rows();
    const sqlValue = 'Giá Trị Mẫu Nằm Trong SQL';
    const failure = () =>
      Object.assign(new Error('Deadlock found when trying to get lock'), {
        code: 'ER_LOCK_DEADLOCK',
        errno: 1213,
        sqlState: '40001',
        sql: `UPDATE ho_so_nguoi_than SET trang_thai_hieu_luc = FALSE /* ${sqlValue} */`,
      });
    const repository = h.app.get(RelativesRepository);
    vi.spyOn(repository, 'lockPatient').mockRejectedValueOnce(failure());
    const atFirstLock = await post(id, token);
    vi.spyOn(repository, 'deactivateRelative').mockRejectedValueOnce(failure());
    const atUpdate = await post(id, token);

    for (const res of [atFirstLock, atUpdate]) {
      const body = expectErrorResponse(res, 500, INTERNAL);
      const text = JSON.stringify(body);
      expect(text).not.toContain('UPDATE');
      expect(text).not.toContain(sqlValue);
    }
    expect(output.join('')).not.toContain(sqlValue);
    expect(await rows()).toStrictEqual(before);
    // Sau lỗi, lần gọi thật kế tiếp vẫn thành công (giao dịch không kẹt)
    expect((await post(id, token)).status).toBe(200);
  });

  it('RDE-12 (NT-09, nối với B4) sau khi ngừng, PUT cùng hồ sơ ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG và dữ liệu không đổi', async () => {
    const { id, token } = await patientWithRelative();
    expect((await post(id, token)).status).toBe(200);
    const before = await rows();

    const res = await request(h.app.getHttpServer())
      .put(`${PATH}/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(bodyOf(UPDATE_A));

    expectErrorResponse(res, 409, PATIENT_ERROR_CODES.RELATIVE_DEACTIVATED);
    expect(await rows()).toStrictEqual(before);
  });

  it('RDE-13 (id lớn qua HTTP) AUTO_INCREMENT = 2^53: ngừng …993 ⇒ 200; …992 và …994 không đổi', async () => {
    await withAutoIncrement(h.db, '9007199254740992', async () => {
      const { account } = await fx.patient();
      const owner = account.taiKhoanId;
      const ids = [
        await insertRelativeRow(h.db, owner, { hoTen: 'H992', active: true }),
        await insertRelativeRow(h.db, owner, { hoTen: 'H993', active: true }),
        await insertRelativeRow(h.db, owner, { hoTen: 'H994', active: true }),
      ];
      expect(ids).toEqual([
        '9007199254740992',
        '9007199254740993',
        '9007199254740994',
      ]);
      const first = await storedRow(h.db, '9007199254740992');
      const third = await storedRow(h.db, '9007199254740994');

      const res = await post('9007199254740993', await tokenOf(owner));

      expect(res.status).toBe(200);
      expect(await storedRow(h.db, '9007199254740992')).toStrictEqual(first);
      expect(await storedRow(h.db, '9007199254740994')).toStrictEqual(third);
      expect(
        (await storedRow(h.db, '9007199254740993')).trang_thai_hieu_luc,
      ).toBe(0);
    });
  });
});
