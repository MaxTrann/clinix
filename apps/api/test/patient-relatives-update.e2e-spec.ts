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
import {
  insertRelativeRow,
  RELATIVE_KEYS,
  relativeInput,
  storedRows,
  withAutoIncrement,
} from './../src/patient/testing/relatives-helpers.js';
import {
  bodyOf,
  captureProcessOutput,
  storedRow,
  UPDATE_A,
  UPDATE_B,
} from './../src/patient/testing/relatives-update-helpers.js';

// Task B4 — PUT /patient/relatives/:id qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (patient PLAN 7.2, 7.4, 7.6; TRACKING B4-G).
// Mã ca RUE-nn là [đề xuất]. NT-10…NT-18, NT-24 thuộc B5, NT-20…NT-23 thuộc web (F6, F7), QP-04 thuộc B6, B7: không phủ ở đây.
const PATH = '/patient/relatives';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const SESSION_LOST = 'PHIEN_HET_HIEU_LUC';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const NOT_FOUND = 'KHONG_TIM_THAY';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const BAD_REQUEST = 'YEU_CAU_KHONG_HOP_LE';
const INTERNAL = 'LOI_HE_THONG';
const DEACTIVATED = PATIENT_ERROR_CODES.RELATIVE_DEACTIVATED;
// Thân 404 mặc định: GIỐNG HỆT cho id sai dạng, không có, của người khác và đã ngừng của người khác (H3, Q27)
const NOT_FOUND_BODY = {
  maLoi: NOT_FOUND,
  thongBao: 'Không tìm thấy dữ liệu.',
};

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
  // Chốt an toàn: không để lại id lớn nào của RUE-13 dù ca đỏ (withAutoIncrement đã dọn trong finally)
  await resetTables(h.db);
  await h.close();
});

// `target` là phần đường dẫn sau /patient/relatives/, viết thẳng (đã mã hoá phần trăm nếu cần)
const put = (target: string, accessToken?: string) => {
  const req = request(h.app.getHttpServer()).put(`${PATH}/${target}`);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const list = (accessToken: string) =>
  request(h.app.getHttpServer())
    .get(PATH)
    .set('Authorization', `Bearer ${accessToken}`);
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const rows = (ownerId?: string) => storedRows(h.db, ownerId);
const pairsOf = (body: { loi?: { truong: string; ma: string }[] }) =>
  (body.loi ?? []).map((item) => `${item.truong}:${item.ma}`);

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

// Thân PUT hợp lệ thứ n (dữ liệu giả): mỗi n một bộ riêng để biết giá trị nào lọt ra log
const sent = (n: number) => bodyOf(relativeInput(n));

describe('PUT /patient/relatives/:id', () => {
  it('RUE-01 (NT-07) Bệnh nhân PUT 200: đúng bảy khoá, giá trị đã chuẩn hoá, no-store, JSON, không Set-Cookie, không benhNhanId và diaChi; GET sau đó thấy bản mới; DB đúng; hồ sơ khác không đổi', async () => {
    const { ownerId, id, token } = await patientWithRelative();
    const sibling = await insertRelativeRow(h.db, ownerId, {
      hoTen: 'Anh chị em',
      active: true,
    });
    const siblingBefore = await storedRow(h.db, sibling);

    const res = await put(id, token).send({
      hoTen: '  Người Thân Đã Sửa  ',
      moiQuanHe: 'Cha',
      gioiTinh: 'Nu',
      ngaySinh: '2001-02-03',
      soDienThoai: ' 0911 000 001 ',
    });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object).sort()).toEqual(RELATIVE_KEYS);
    const expected = {
      hoSoNguoiThanId: id,
      hoTen: 'Người Thân Đã Sửa',
      moiQuanHe: 'Cha',
      gioiTinh: 'Nu',
      ngaySinh: '2001-02-03',
      soDienThoai: '0911000001',
      trangThaiHieuLuc: true,
    };
    expect(res.body).toStrictEqual(expected);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(String(res.headers['content-type'])).toContain('application/json');
    expectNoSetCookie(res);
    const got = await list(token);
    expect((got.body as { items: unknown[] }).items).toContainEqual(expected);
    expect(await storedRow(h.db, id)).toStrictEqual({
      ho_so_nguoi_than_id: id,
      benh_nhan_id: ownerId,
      ho_ten: 'Người Thân Đã Sửa',
      ngay_sinh: '2001-02-03',
      gioi_tinh: 'Nu',
      dia_chi: null,
      moi_quan_he: 'Cha',
      so_dien_thoai: '0911000001',
      trang_thai_hieu_luc: 1,
    });
    expect(await storedRow(h.db, sibling)).toStrictEqual(siblingBefore);
  });

  it('RUE-01b (NT-04, bẫy 1) PUT giống hệt dữ liệu cũ ⇒ 200; soDienThoai thiếu khoá, null, chuỗi rỗng, chỉ khoảng trắng ⇒ 200 và soDienThoai null, DB NULL (PUT thay cả bộ: xoá SĐT)', async () => {
    const { id, token } = await patientWithRelative();
    const same = {
      hoTen: 'Tên Gốc Giả',
      moiQuanHe: 'Con',
      gioiTinh: 'Nam',
      ngaySinh: '2000-01-01',
    };
    const before = await rows();

    expect((await put(id, token).send(same)).status).toBe(200);
    expect((await put(id, token).send(same)).status).toBe(200);
    expect(await rows()).toStrictEqual(before);

    for (const phone of [undefined, null, '', '   ']) {
      expect(
        (await put(id, token).send({ ...same, soDienThoai: '0911000001' }))
          .status,
      ).toBe(200);
      const res = await put(id, token).send({ ...same, soDienThoai: phone });

      expect(res.status).toBe(200);
      expect((res.body as { soDienThoai: unknown }).soDienThoai).toBeNull();
      expect((await storedRow(h.db, id)).so_dien_thoai).toBeNull();
    }
  });

  it.each([
    ['benhNhanId', '999'],
    ['trangThaiHieuLuc', false],
    ['hoSoNguoiThanId', '1'],
    ['diaChi', '12 Đường Gửi Lên'],
    ['email', 'x@clinix.invalid'],
    ['taiKhoanId', '5'],
    ['vaiTro', 'QuanTriVien'],
  ])(
    'RUE-02 (NT-05, H2) thân có %s ⇒ 400 TRUONG_KHONG_DUOC_PHEP đúng trường đó, hồ sơ không đổi',
    async (field, value) => {
      const { id, token } = await patientWithRelative();
      const before = await rows();

      const res = await put(id, token).send({
        ...bodyOf(UPDATE_A),
        [field]: value,
      });

      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(pairsOf(body)).toEqual([`${field}:${NOT_ALLOWED}`]);
      expect(await rows()).toStrictEqual(before);
    },
  );

  it('RUE-03 (NT-02, NT-03, NT-04) nhiều lỗi cùng lúc ⇒ 400 DU_LIEU_KHONG_HOP_LE + loi[] đủ theo thứ tự trường, DB không đổi, thân không lặp lại giá trị đã gửi', async () => {
    const { id, token } = await patientWithRelative();
    const before = await rows();

    const res = await put(id, token).send({
      hoTen: 'Người Thân Hợp Lệ',
      moiQuanHe: 'GIA_TRI_QUAN_HE_LA',
      ngaySinh: '15/05/1990',
      soDienThoai: 'GIA_TRI_SDT_SAI',
    });

    const body = expectErrorResponse(res, 400, INVALID_DATA);
    expect(pairsOf(body)).toEqual([
      'moiQuanHe:MOI_QUAN_HE_KHONG_HOP_LE',
      'gioiTinh:GIOI_TINH_KHONG_HOP_LE',
      'ngaySinh:NGAY_SINH_KHONG_HOP_LE',
      'soDienThoai:SDT_KHONG_HOP_LE',
    ]);
    for (const value of [
      'GIA_TRI_QUAN_HE_LA',
      '15/05/1990',
      'GIA_TRI_SDT_SAI',
      'Người Thân Hợp Lệ',
    ]) {
      expect(JSON.stringify(res.body)).not.toContain(value);
    }
    expect(await rows()).toStrictEqual(before);
  });

  it('RUE-04 (NT-08, QP-06, H3) hồ sơ hiệu lực của Bệnh nhân khác, id không tồn tại, hồ sơ ĐÃ NGỪNG của Bệnh nhân khác ⇒ cả ba 404 KHONG_TIM_THAY với thân BẰNG NHAU từng chữ (ca thứ ba không ra 409), có no-store; DB không đổi', async () => {
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
    const before = await rows();

    const responses = [];
    for (const id of [activeOfStranger, '424242', inactiveOfStranger]) {
      const res = await put(id, token).send(bodyOf(UPDATE_A));
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.headers['cache-control']).toBe('no-store');
      responses.push(res.body);
    }

    expect(responses).toStrictEqual([
      NOT_FOUND_BODY,
      NOT_FOUND_BODY,
      NOT_FOUND_BODY,
    ]);
    expect(await rows()).toStrictEqual(before);
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
    'RUE-04b (NT-08, Q27) id sai dạng (%s) ⇒ 404 KHONG_TIM_THAY với đúng thân 404 mặc định; DB không đổi',
    async (_label, id) => {
      const { token } = await patientWithRelative();
      const before = await rows();

      const res = await put(id, token).send(bodyOf(UPDATE_A));

      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.body).toStrictEqual(NOT_FOUND_BODY);
      expect(await rows()).toStrictEqual(before);
    },
  );

  it.each(['%', '%E0%A4%A'])(
    'RUE-05 (TRACKING B4-B mục 3) chuỗi phần trăm hỏng %s trên đường dẫn ⇒ 400 YEU_CAU_KHONG_HOP_LE JSON chuẩn do Express (không 404, không 500); DB không đổi',
    async (id) => {
      const { token } = await patientWithRelative();
      const before = await rows();

      const res = await put(id, token).send(bodyOf(UPDATE_A));

      expectErrorResponse(res, 400, BAD_REQUEST);
      expect(await rows()).toStrictEqual(before);
    },
  );

  it('RUE-06 (NT-09) PUT hồ sơ ĐÃ NGỪNG của chính mình ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG kèm thongBao và no-store; DB không đổi', async () => {
    const { account } = await fx.patient();
    const id = await insertRelativeRow(h.db, account.taiKhoanId, {
      hoTen: 'Đã ngừng',
      active: false,
    });
    const before = await rows();

    const res = await put(id, await tokenOf(account.taiKhoanId)).send(
      bodyOf(UPDATE_A),
    );

    const body = expectErrorResponse(res, 409, DEACTIVATED);
    expect(body.thongBao).toBe(PATIENT_ERROR_MESSAGES[DEACTIVATED]);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await rows()).toStrictEqual(before);
  });

  it('RUE-07 (bẫy 3) id sai dạng kèm thân sai ⇒ 404 (không 400); id đúng kèm thân sai ⇒ 400 DU_LIEU_KHONG_HOP_LE', async () => {
    const { id, token } = await patientWithRelative();

    expectErrorResponse(await put('0', token).send({}), 404, NOT_FOUND);
    expectErrorResponse(await put('abc', token).send([]), 404, NOT_FOUND);
    expectErrorResponse(await put(id, token).send({}), 400, INVALID_DATA);
    expectErrorResponse(await put('424242', token).send({}), 400, INVALID_DATA);
  });

  it('RUE-08 (QP-01) không token ⇒ 401 CHUA_DANG_NHAP; token rác ⇒ 401 TOKEN_KHONG_HOP_LE; cả khi id sai dạng (guard chạy trước Pipe); DB không đổi', async () => {
    const { id } = await patientWithRelative();
    const before = await rows();

    expectErrorResponse(
      await put(id).send(bodyOf(UPDATE_A)),
      401,
      NOT_LOGGED_IN,
    );
    expectErrorResponse(
      await put('0').send(bodyOf(UPDATE_A)),
      401,
      NOT_LOGGED_IN,
    );
    expectErrorResponse(
      await put(id, 'khong.phai.token').send(bodyOf(UPDATE_A)),
      401,
      INVALID_TOKEN,
    );
    expectErrorResponse(
      await put('0', 'khong.phai.token').send(bodyOf(UPDATE_A)),
      401,
      INVALID_TOKEN,
    );
    expect(await rows()).toStrictEqual(before);
  });

  it('RUE-09 (QP-03) Lễ tân, Quản trị viên Toàn hệ thống, Quản trị viên Chi nhánh và Bác sĩ ⇒ 403 KHONG_DU_QUYEN (thân hợp lệ, và cả với id sai dạng); DB không đổi', async () => {
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
      expectErrorResponse(
        await put(id, token).send(bodyOf(UPDATE_A)),
        403,
        FORBIDDEN,
      );
      expectErrorResponse(
        await put('0', token).send(bodyOf(UPDATE_A)),
        403,
        FORBIDDEN,
      );
    }
    expect(await rows()).toStrictEqual(before);
  });

  it('RUE-10 (QP-06 phần sửa) Bệnh nhân A PUT hồ sơ của B ⇒ 404, hồ sơ của B không đổi; PUT hồ sơ của chính A kèm ?benhNhanId=<B> và ?taiKhoanId=<B> trên query ⇒ 200, query bị bỏ qua, chỉ hồ sơ của A đổi', async () => {
    const a = await patientWithRelative('Của A');
    const b = await patientWithRelative('Của B');
    const bBefore = await rows(b.ownerId);

    expectErrorResponse(
      await put(b.id, a.token).send(bodyOf(UPDATE_A)),
      404,
      NOT_FOUND,
    );
    expect(await rows(b.ownerId)).toStrictEqual(bBefore);

    const res = await put(a.id, a.token)
      .query({ benhNhanId: b.ownerId, taiKhoanId: b.ownerId })
      .send(bodyOf(UPDATE_B));

    expect(res.status).toBe(200);
    expect((await storedRow(h.db, a.id)).ho_ten).toBe(UPDATE_B.hoTen);
    expect(await rows(b.ownerId)).toStrictEqual(bBefore);
  });

  it('RUE-11 (QP-07) phiên đã thu hồi / tài khoản NgungHoatDong / ChoKichHoat ⇒ 401 PHIEN_HET_HIEU_LUC, hồ sơ không đổi', async () => {
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
      expectErrorResponse(
        await put(id, token).send(bodyOf(UPDATE_A)),
        401,
        SESSION_LOST,
      );
    }
    expect(await rows()).toStrictEqual(before);
  });

  it('RUE-12 (BM-02) lỗi DB ngoài dự kiến mang câu SQL chứa giá trị, ở câu UPDATE và ở bước đọc lại ⇒ 500 LOI_HE_THONG + requestId, thân và log không có SQL hay giá trị; hồ sơ không đổi (hoàn tác)', async () => {
    const { id, token } = await patientWithRelative();
    const before = await rows();
    const sqlValue = 'Giá Trị Mẫu Nằm Trong SQL';
    const failure = () =>
      Object.assign(new Error("Table 'x.ho_so_nguoi_than' doesn't exist"), {
        code: 'ER_NO_SUCH_TABLE',
        errno: 1146,
        sqlState: '42S02',
        sql: `UPDATE ho_so_nguoi_than SET ho_ten = '${sqlValue}'`,
      });
    const repository = h.app.get(RelativesRepository);
    vi.spyOn(repository, 'updateRelative').mockRejectedValueOnce(failure());
    const atUpdate = await put(id, token).send(bodyOf(UPDATE_A));
    vi.spyOn(repository, 'findRelativeById').mockRejectedValueOnce(failure());
    const atReread = await put(id, token).send(bodyOf(UPDATE_A));

    for (const res of [atUpdate, atReread]) {
      const body = expectErrorResponse(res, 500, INTERNAL);
      const text = JSON.stringify(body);
      expect(text).not.toContain('UPDATE');
      expect(text).not.toContain(sqlValue);
    }
    expect(output.join('')).not.toContain(sqlValue);
    expect(await rows()).toStrictEqual(before);
  });

  it('RUE-13 (bẫy 2 qua HTTP) AUTO_INCREMENT = 2^53: PUT …993 ⇒ JSON hoSoNguoiThanId là CHUỖI 9007199254740993; …992 và …994 không đổi', async () => {
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

      const res = await put('9007199254740993', await tokenOf(owner)).send(
        bodyOf(UPDATE_A),
      );

      expect(res.status).toBe(200);
      expect(res.text).toContain('"hoSoNguoiThanId":"9007199254740993"');
      expect(await storedRow(h.db, '9007199254740992')).toStrictEqual(first);
      expect(await storedRow(h.db, '9007199254740994')).toStrictEqual(third);
      expect((await storedRow(h.db, '9007199254740993')).ho_ten).toBe(
        UPDATE_A.hoTen,
      );
    });
  });

  it('RUE-14 (BM-01) log của các luồng 200, 400, 401, 403, 404, 409, 500 không có họ tên, SĐT, ngày sinh của thân gửi lên (và log không rỗng giả)', async () => {
    const owner = await patientWithRelative();
    const stopped = await fx.patient();
    const stoppedId = await insertRelativeRow(
      h.db,
      stopped.account.taiKhoanId,
      { hoTen: 'Đã ngừng', active: false },
    );
    const suspended = await fx.patient();
    const suspendedToken = await tokenOf(suspended.account.taiKhoanId);
    await h.db
      .getRepository(TaiKhoan)
      .update(suspended.account.taiKhoanId, { trangThai: 'NgungHoatDong' });
    const doctor = await fx.doctor(await fx.branch());
    const stoppedToken = await tokenOf(stopped.account.taiKhoanId);
    const bodies = [3, 6, 9, 12, 15, 18, 21].map(sent);

    expect((await put(owner.id, owner.token).send(bodies[0])).status).toBe(200);
    expectErrorResponse(
      await put(owner.id, owner.token).send({
        ...bodies[1],
        soDienThoai: 'không phải số',
      }),
      400,
      INVALID_DATA,
    );
    expectErrorResponse(
      await put(owner.id, suspendedToken).send(bodies[2]),
      401,
      SESSION_LOST,
    );
    expectErrorResponse(
      await put(owner.id, await tokenOf(doctor.account.taiKhoanId)).send(
        bodies[3],
      ),
      403,
      FORBIDDEN,
    );
    expectErrorResponse(
      await put('424242', owner.token).send(bodies[4]),
      404,
      NOT_FOUND,
    );
    expectErrorResponse(
      await put(stoppedId, stoppedToken).send(bodies[5]),
      409,
      DEACTIVATED,
    );
    vi.spyOn(
      h.app.get(RelativesRepository),
      'findRelativeById',
    ).mockRejectedValueOnce(new Error('mất kết nối'));
    const dbRes = await put(owner.id, owner.token).send(bodies[6]);
    expectErrorResponse(dbRes, 500, INTERNAL);

    const log = output.join('');
    // Không rỗng giả: lỗi 500 phải để lại dấu trong log kèm requestId và dòng ghi PUT (đang bắt thật)
    const { requestId } = dbRes.body as { requestId: string };
    expect(log).toContain(requestId);
    expect(log).toContain(`PUT ${PATH}/${owner.id} → 500`);
    expectNoSecrets('log', log, {
      literals: bodies
        .flatMap((b) => [b.hoTen, b.ngaySinh, b.soDienThoai ?? ''])
        .filter(Boolean),
      codes: [],
    });
  });
});
