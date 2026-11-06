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
import { RelativesRepository } from './../src/patient/relatives/relatives.repository.js';
import {
  BIG_ID,
  insertRelativeRow,
  RELATIVE_KEYS,
  relativeInput,
  removePatientRows,
  storedRows,
  withAutoIncrement,
} from './../src/patient/testing/relatives-helpers.js';

// Task B3 — GET và POST /patient/relatives qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (patient PLAN 7.2, 7.4, 7.6; TRACKING B3-G).
// Mã ca RLE-nn là [đề xuất]. NT-20…NT-23 thuộc web (F6, F7), NT-07…NT-18 và NT-24 thuộc B4, B5: không phủ ở đây.
const PATH = '/patient/relatives';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const SESSION_LOST = 'PHIEN_HET_HIEU_LUC';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const INTERNAL = 'LOI_HE_THONG';

let h: RefreshHarness;
let fx: AdminFixtures;
let output: string[];

beforeAll(async () => {
  h = await openRefreshHarness();
  fx = new AdminFixtures(h.db);
});

beforeEach(async () => {
  await resetTables(h.db);
  h.mail.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  output = [];
  const capture = (chunk: unknown): boolean => {
    output.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  vi.spyOn(process.stdout, 'write').mockImplementation(capture);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  // Chốt an toàn: không để lại id lớn nào của RLE-14 dù ca đỏ (withAutoIncrement đã dọn trong finally)
  await resetTables(h.db);
  await h.close();
});

const server = () => request(h.app.getHttpServer());
const list = (accessToken?: string) => {
  const req = server().get(PATH);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const create = (accessToken?: string) => {
  const req = server().post(PATH);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const updateAccount = (taiKhoanId: string, change: Partial<TaiKhoan>) =>
  h.db.getRepository(TaiKhoan).update(taiKhoanId, change);
const rows = (ownerId?: string) => storedRows(h.db, ownerId);
const keysOf = (res: { body: unknown }) =>
  Object.keys(res.body as object).sort();
const pairsOf = (body: { loi?: { truong: string; ma: string }[] }) =>
  (body.loi ?? []).map((item) => `${item.truong}:${item.ma}`);
const itemsOf = (res: { body: unknown }) =>
  (res.body as { items: Record<string, unknown>[] }).items;

// Thân POST hợp lệ thứ n (dữ liệu giả): mỗi n một bộ riêng để biết giá trị nào lọt ra log
const sent = (n: number) => {
  const input = relativeInput(n);
  return { ...input, soDienThoai: input.soDienThoai ?? undefined };
};

describe('POST /patient/relatives và GET /patient/relatives', () => {
  it('RLE-01 (NT-01, NT-06) Bệnh nhân POST 201: đúng bảy khoá, giá trị đã chuẩn hoá, no-store, JSON, không Set-Cookie, không benhNhanId và diaChi; rồi GET thấy đúng hồ sơ đó; DB đúng', async () => {
    const { account } = await fx.patient();
    const token = await tokenOf(account.taiKhoanId);

    const res = await create(token).send({
      hoTen: '  Người Thân Một  ',
      moiQuanHe: 'Con',
      gioiTinh: 'Nu',
      ngaySinh: '2018-03-04',
      soDienThoai: ' 0911 000 001 ',
    });

    expect(res.status).toBe(201);
    expect(keysOf(res)).toEqual(RELATIVE_KEYS);
    expect(res.body).toStrictEqual({
      hoSoNguoiThanId: expect.stringMatching(/^[1-9][0-9]*$/) as string,
      hoTen: 'Người Thân Một',
      moiQuanHe: 'Con',
      gioiTinh: 'Nu',
      ngaySinh: '2018-03-04',
      soDienThoai: '0911000001',
      trangThaiHieuLuc: true,
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(String(res.headers['content-type'])).toContain('application/json');
    expectNoSetCookie(res);
    const got = await list(token);
    expect(got.status).toBe(200);
    expect(got.headers['cache-control']).toBe('no-store');
    expect(got.body).toStrictEqual({ items: [res.body] });
    expect(await rows(account.taiKhoanId)).toStrictEqual([
      {
        ho_so_nguoi_than_id: (res.body as { hoSoNguoiThanId: string })
          .hoSoNguoiThanId,
        benh_nhan_id: account.taiKhoanId,
        ho_ten: 'Người Thân Một',
        ngay_sinh: '2018-03-04',
        gioi_tinh: 'Nu',
        dia_chi: null,
        moi_quan_he: 'Con',
        so_dien_thoai: '0911000001',
        trang_thai_hieu_luc: 1,
      },
    ]);
  });

  it('RLE-01b (NT-01, NT-04) POST không có khoá soDienThoai, hoặc null, hoặc rỗng ⇒ 201 và soDienThoai null, DB NULL', async () => {
    const { account } = await fx.patient();
    const token = await tokenOf(account.taiKhoanId);
    const base = {
      hoTen: 'Người Thân Hai',
      moiQuanHe: 'Cha',
      gioiTinh: 'Nam',
      ngaySinh: '1960-01-01',
    };

    for (const phone of [undefined, null, '', '   ']) {
      const res = await create(token).send({ ...base, soDienThoai: phone });
      expect(res.status).toBe(201);
      expect((res.body as { soDienThoai: unknown }).soDienThoai).toBeNull();
    }
    expect(
      (await rows(account.taiKhoanId)).map((r) => r.so_dien_thoai),
    ).toEqual([null, null, null, null]);
  });

  it('RLE-02 (NT-06) GET khi chưa có người thân ⇒ 200 { items: [] } và no-store', async () => {
    const { account } = await fx.patient();

    const res = await list(await tokenOf(account.taiKhoanId));

    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({ items: [] });
    expect(res.headers['cache-control']).toBe('no-store');
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
    'RLE-03 (NT-05, H2) thân có %s ⇒ 400 TRUONG_KHONG_DUOC_PHEP đúng trường đó, không hàng nào được tạo',
    async (field, value) => {
      const { account } = await fx.patient();
      const token = await tokenOf(account.taiKhoanId);

      const res = await create(token).send({ ...sent(1), [field]: value });

      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(pairsOf(body)).toEqual([`${field}:${NOT_ALLOWED}`]);
      expect(await rows()).toHaveLength(0);
    },
  );

  it('RLE-04 (NT-02, NT-03, NT-04) nhiều lỗi cùng lúc ⇒ 400 DU_LIEU_KHONG_HOP_LE + loi[] đủ theo thứ tự trường, DB không đổi, thân không lặp lại giá trị đã gửi', async () => {
    const { account } = await fx.patient();
    const token = await tokenOf(account.taiKhoanId);

    const res = await create(token).send({
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
    const text = JSON.stringify(res.body);
    for (const value of [
      'GIA_TRI_QUAN_HE_LA',
      '15/05/1990',
      'GIA_TRI_SDT_SAI',
      'Người Thân Hợp Lệ',
    ]) {
      expect(text).not.toContain(value);
    }
    expect(await rows()).toHaveLength(0);
  });

  it('RLE-05 (QP-01) không token ⇒ 401 CHUA_DANG_NHAP cho GET và POST; token rác ⇒ 401 TOKEN_KHONG_HOP_LE; không hàng nào được tạo', async () => {
    expectErrorResponse(await list(), 401, NOT_LOGGED_IN);
    expectErrorResponse(await create().send(sent(1)), 401, NOT_LOGGED_IN);
    expectErrorResponse(await list('khong.phai.token'), 401, INVALID_TOKEN);
    expectErrorResponse(
      await create('khong.phai.token').send(sent(1)),
      401,
      INVALID_TOKEN,
    );
    expect(await rows()).toHaveLength(0);
  });

  it('RLE-06 (QP-03) Lễ tân, Quản trị viên Toàn hệ thống, Quản trị viên Chi nhánh và Bác sĩ ⇒ 403 KHONG_DU_QUYEN cho cả GET và POST (thân hợp lệ), không hàng nào được tạo', async () => {
    const branch = await fx.branch();
    const accounts = {
      'Lễ tân': (await fx.receptionist(branch)).account,
      'Quản trị viên Toàn hệ thống': (await fx.admin()).account,
      'Quản trị viên Chi nhánh': (await fx.admin(branch)).account,
      'Bác sĩ': (await fx.doctor(branch)).account,
    };

    for (const account of Object.values(accounts)) {
      const token = await tokenOf(account.taiKhoanId);
      expectErrorResponse(await list(token), 403, FORBIDDEN);
      expectErrorResponse(await create(token).send(sent(1)), 403, FORBIDDEN);
    }
    expect(await rows()).toHaveLength(0);
  });

  it('RLE-07 (QP-06 phần GET, NT-06) Bệnh nhân A không thấy hồ sơ của B; ?benhNhanId=<B> và ?taiKhoanId=<B> trên query bị bỏ qua; hồ sơ của B không đổi', async () => {
    const a = await fx.patient();
    const b = await fx.patient();
    await insertRelativeRow(h.db, b.account.taiKhoanId, {
      hoTen: 'B đang dùng',
      active: true,
    });
    await insertRelativeRow(h.db, b.account.taiKhoanId, {
      hoTen: 'B đã ngừng',
      active: false,
    });
    const mine = await insertRelativeRow(h.db, a.account.taiKhoanId, {
      hoTen: 'A đang dùng',
      active: true,
    });
    const bBefore = await rows(b.account.taiKhoanId);
    const token = await tokenOf(a.account.taiKhoanId);

    for (const query of [
      {},
      { benhNhanId: b.account.taiKhoanId },
      { taiKhoanId: b.account.taiKhoanId },
    ]) {
      const res = await list(token).query(query);

      expect(res.status).toBe(200);
      expect(itemsOf(res).map((r) => r['hoSoNguoiThanId'])).toEqual([mine]);
    }
    expect(await rows(b.account.taiKhoanId)).toStrictEqual(bBefore);
  });

  it('RLE-08 (QP-06) POST ?benhNhanId=<B>: hàng mới thuộc A (chủ token), B không có hàng mới', async () => {
    const a = await fx.patient();
    const b = await fx.patient();

    const res = await create(await tokenOf(a.account.taiKhoanId))
      .query({ benhNhanId: b.account.taiKhoanId })
      .send(sent(1));

    expect(res.status).toBe(201);
    expect(await rows(b.account.taiKhoanId)).toHaveLength(0);
    expect(await rows(a.account.taiKhoanId)).toHaveLength(1);
  });

  it('RLE-09 (QP-07) phiên đã thu hồi / tài khoản NgungHoatDong / ChoKichHoat ⇒ 401 PHIEN_HET_HIEU_LUC cho cả GET và POST, không hàng nào được tạo', async () => {
    const revoked = await fx.patient();
    const session = await h.sessions.create(revoked.account.taiKhoanId);
    await h.sessions.revoke(session.sessionId);

    const suspended = await fx.patient();
    const suspendedToken = await tokenOf(suspended.account.taiKhoanId);
    await updateAccount(suspended.account.taiKhoanId, {
      trangThai: 'NgungHoatDong',
    });

    const waiting = await fx.receptionist(await fx.branch());
    const waitingToken = await tokenOf(waiting.account.taiKhoanId);
    await updateAccount(waiting.account.taiKhoanId, {
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
    });

    for (const token of [session.accessToken, suspendedToken, waitingToken]) {
      expectErrorResponse(await list(token), 401, SESSION_LOST);
      expectErrorResponse(await create(token).send(sent(1)), 401, SESSION_LOST);
    }
    expect(await rows()).toHaveLength(0);
  });

  it('RLE-10 (H13, BM-03) cấp token rồi xoá vi_noi_bo và benh_nhan ⇒ POST 403 KHONG_DU_QUYEN (không 500) có no-store, không hàng mới', async () => {
    const { account } = await fx.patient();
    const token = await tokenOf(account.taiKhoanId);
    await removePatientRows(h.db, account.taiKhoanId);

    const res = await create(token).send(sent(1));

    expectErrorResponse(res, 403, FORBIDDEN);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await rows()).toHaveLength(0);
  });

  it('RLE-11 (BM-02) lỗi DB ngoài dự kiến mang câu SQL chứa giá trị ở GET và ở bước đọc lại của POST ⇒ 500 LOI_HE_THONG + requestId, thân và log không có SQL hay giá trị, POST không để lại hàng (hoàn tác)', async () => {
    const { account } = await fx.patient();
    const token = await tokenOf(account.taiKhoanId);
    const sqlValue = 'Giá Trị Mẫu Nằm Trong SQL';
    const failure = () =>
      Object.assign(new Error("Table 'x.ho_so_nguoi_than' doesn't exist"), {
        code: 'ER_NO_SUCH_TABLE',
        errno: 1146,
        sqlState: '42S02',
        sql: `SELECT * FROM ho_so_nguoi_than WHERE ho_ten = '${sqlValue}'`,
      });
    const repository = h.app.get(RelativesRepository);
    vi.spyOn(repository, 'findRelatives').mockRejectedValueOnce(failure());
    vi.spyOn(repository, 'findRelativeById').mockRejectedValueOnce(failure());

    const getRes = await list(token);
    const postRes = await create(token).send(sent(1));

    for (const res of [getRes, postRes]) {
      const body = expectErrorResponse(res, 500, INTERNAL);
      const text = JSON.stringify(body);
      expect(text).not.toContain('SELECT');
      expect(text).not.toContain(sqlValue);
    }
    expect(output.join('')).not.toContain(sqlValue);
    expect(await rows()).toHaveLength(0);
  });

  it('RLE-12 (BM-01) log của các luồng 201, 200, 400, 401, 403, 500 không có họ tên, SĐT, ngày sinh của thân gửi lên (và log không rỗng giả)', async () => {
    const branch = await fx.branch();
    const patient = await fx.patient();
    const token = await tokenOf(patient.account.taiKhoanId);
    const doctor = await fx.doctor(branch);
    const suspended = await fx.patient();
    const suspendedToken = await tokenOf(suspended.account.taiKhoanId);
    await updateAccount(suspended.account.taiKhoanId, {
      trangThai: 'NgungHoatDong',
    });
    const bodies = [sent(3), sent(6), sent(9), sent(12), sent(15), sent(18)];

    expect((await create(token).send(bodies[0])).status).toBe(201);
    expect((await list(token)).status).toBe(200);
    expectErrorResponse(
      await create(token).send({ ...bodies[1], soDienThoai: 'không phải số' }),
      400,
      INVALID_DATA,
    );
    expectErrorResponse(
      await create(suspendedToken).send(bodies[2]),
      401,
      SESSION_LOST,
    );
    expectErrorResponse(
      await create(await tokenOf(doctor.account.taiKhoanId)).send(bodies[3]),
      403,
      FORBIDDEN,
    );
    vi.spyOn(
      h.app.get(RelativesRepository),
      'findRelativeById',
    ).mockRejectedValueOnce(new Error('mất kết nối'));
    const dbRes = await create(token).send(bodies[4]);
    expectErrorResponse(dbRes, 500, INTERNAL);

    const log = output.join('');
    // Không rỗng giả: lỗi 500 phải để lại dấu trong log kèm requestId (đang bắt thật)
    const { requestId } = dbRes.body as { requestId: string };
    expect(log).toContain(requestId);
    expect(log).toContain('POST /patient/relatives → 500');
    expectNoSecrets('log', log, {
      literals: bodies
        .flatMap((b) => [b.hoTen, b.ngaySinh, b.soDienThoai ?? ''])
        .filter(Boolean),
      codes: [],
    });
  });

  it('RLE-13 (QP-06, bẫy 1) 20 POST song song của hai Bệnh nhân: mỗi phản hồi là hồ sơ ĐÚNG của lần gửi đó (khác id, đúng chủ); GET sau đó mỗi người thấy đủ 10 hồ sơ của mình và không hồ sơ nào của người kia', async () => {
    const owners = [await fx.patient(), await fx.patient()];
    const ids = owners.map((o) => o.account.taiKhoanId);
    const tokens = await Promise.all(ids.map((id) => tokenOf(id)));

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        create(tokens[index % 2]).send(sent(index + 1)),
      ),
    );

    responses.forEach((res, index) => {
      expect(res.status).toBe(201);
      expect((res.body as { hoTen: string }).hoTen).toBe(
        relativeInput(index + 1).hoTen,
      );
    });
    const returnedIds = responses.map(
      (res) => (res.body as { hoSoNguoiThanId: string }).hoSoNguoiThanId,
    );
    expect(new Set(returnedIds).size).toBe(20);
    for (const [who, token] of tokens.entries()) {
      const mine = itemsOf(await list(token));
      expect(mine).toHaveLength(10);
      expect(mine.map((r) => String(r['hoTen'])).sort()).toEqual(
        Array.from(
          { length: 10 },
          (_, k) => relativeInput(k * 2 + who + 1).hoTen,
        ).sort(),
      );
      expect(
        (await rows(ids[who])).map((r) => r.ho_so_nguoi_than_id).sort(),
      ).toEqual(returnedIds.filter((_, index) => index % 2 === who).sort());
    }
  });

  it('RLE-14 (bẫy 1 qua HTTP) AUTO_INCREMENT = 2^53 + 1: POST trả hoSoNguoiThanId là CHUỖI 9007199254740993 trong JSON, GET cũng vậy', async () => {
    const { account } = await fx.patient();
    const token = await tokenOf(account.taiKhoanId);

    await withAutoIncrement(h.db, BIG_ID, async () => {
      const res = await create(token).send(sent(1));

      expect(res.status).toBe(201);
      expect(res.text).toContain('"hoSoNguoiThanId":"9007199254740993"');
      const got = await list(token);
      expect(got.text).toContain('"hoSoNguoiThanId":"9007199254740993"');
    });
  });

  it('RLE-15 (NT-19, Q14) hai POST trùng họ tên và ngày sinh ⇒ cả hai 201 với id khác nhau, GET thấy hai hồ sơ', async () => {
    const { account } = await fx.patient();
    const token = await tokenOf(account.taiKhoanId);

    const first = await create(token).send(sent(1));
    const second = await create(token).send(sent(1));

    expect([first.status, second.status]).toEqual([201, 201]);
    expect(
      (first.body as { hoSoNguoiThanId: string }).hoSoNguoiThanId,
    ).not.toBe((second.body as { hoSoNguoiThanId: string }).hoSoNguoiThanId);
    expect(itemsOf(await list(token))).toHaveLength(2);
  });
});
