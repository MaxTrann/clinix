import request from 'supertest';
import { vi } from 'vitest';
import { AdminFixtures } from './../src/admin/testing/admin-fixtures.js';
import { TaiKhoan } from './../src/auth/entities/tai-khoan.entity.js';
import { insertTaiKhoan } from './../src/auth/entities/testing/auth-fixtures.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  expectNoSetCookie,
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectNoSecrets } from './../src/auth/testing/secret-scan.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { ProfileRepository } from './../src/patient/profile/profile.repository.js';

// Task B1 — GET /profile qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (patient PLAN 7.1, 7.4, 7.6; TRACKING B1-G).
// Mã ca PFE-nn là [đề xuất]. Phần PUT của HS-04…HS-16, HS-23, HS-24 và QP-02, QP-05 thuộc B2: chưa phủ ở đây.
const PROFILE_PATH = '/profile';
const KEYS = [
  'anhDaiDien',
  'chiNhanh',
  'diaChi',
  'email',
  'gioiTinh',
  'hoTen',
  'ngaySinh',
  'phamViQuanTri',
  'soDienThoai',
  'vaiTro',
];
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID = 'TOKEN_KHONG_HOP_LE';
const SESSION_LOST = 'PHIEN_HET_HIEU_LUC';
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
  await h.close();
});

const server = () => request(h.app.getHttpServer());
const profile = (accessToken: string) =>
  server().get(PROFILE_PATH).set('Authorization', `Bearer ${accessToken}`);
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const updateAccount = (taiKhoanId: string, change: Partial<TaiKhoan>) =>
  h.db.getRepository(TaiKhoan).update(taiKhoanId, change);
const accountRow = (taiKhoanId: string) =>
  h.db.getRepository(TaiKhoan).findOneByOrFail({ taiKhoanId });
const keysOf = (res: { body: unknown }) =>
  Object.keys(res.body as object).sort();

// Dữ liệu cá nhân giả (đuôi .invalid); mỗi tài khoản một bộ riêng để biết giá trị nào lọt ra log
const personal = (n: number) => ({
  hoTen: `Họ Tên Mẫu Số ${n}`,
  email: `bm.mau.${n}@clinix.invalid`,
  soDienThoai: `091100000${n}`,
  ngaySinh: `198${n}-03-21`,
  diaChi: `${100 + n} Đường Thử Nghiệm Số ${n}`,
});

describe('GET /profile', () => {
  it('PFE-01 (HS-01) Bệnh nhân 200: đúng tập khoá, giá trị đúng, chiNhanh và phamViQuanTri null, no-store, JSON, không Set-Cookie', async () => {
    const { account } = await fx.patient({
      ...personal(1),
      gioiTinh: 'Nam',
    });

    const res = await profile(await tokenOf(account.taiKhoanId));

    expect(res.status).toBe(200);
    expect(keysOf(res)).toEqual(KEYS);
    expect(res.body).toStrictEqual({
      hoTen: 'Họ Tên Mẫu Số 1',
      email: 'bm.mau.1@clinix.invalid',
      soDienThoai: '0911000001',
      gioiTinh: 'Nam',
      ngaySinh: '1981-03-21',
      diaChi: '101 Đường Thử Nghiệm Số 1',
      anhDaiDien: null,
      vaiTro: 'BenhNhan',
      chiNhanh: null,
      phamViQuanTri: null,
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(String(res.headers['content-type'])).toContain('application/json');
    expectNoSetCookie(res);
  });

  it('PFE-02 (QP-02, HS-02, HS-03, HS-16 GET) cả bốn vai trò và hai phạm vi Quản trị viên đều 200, mỗi tài khoản nhận hồ sơ của chính mình', async () => {
    const branch = await fx.branch({ ten: 'Chi nhánh Một' });
    const other = await fx.branch({ ten: 'Chi nhánh Hai' });
    const named = (n: number) => ({ hoTen: `Người Dùng ${n}` });
    const patient = await fx.patient(named(1));
    const doctor = await fx.doctor(branch, {}, named(2));
    const receptionist = await fx.receptionist(other, named(3));
    const globalAdmin = await fx.admin(undefined, named(4));
    const branchAdmin = await fx.admin(branch, named(5));
    const ref = (name: string, id: string) => ({ chiNhanhId: id, ten: name });
    const cases = [
      [patient.account, 'BenhNhan', null, null],
      [doctor.account, 'BacSi', ref('Chi nhánh Một', branch.chiNhanhId), null],
      [
        receptionist.account,
        'LeTan',
        ref('Chi nhánh Hai', other.chiNhanhId),
        null,
      ],
      [globalAdmin.account, 'QuanTriVien', null, 'ToanHeThong'],
      [
        branchAdmin.account,
        'QuanTriVien',
        ref('Chi nhánh Một', branch.chiNhanhId),
        'ChiNhanh',
      ],
    ] as const;

    for (const [account, vaiTro, chiNhanh, phamViQuanTri] of cases) {
      const res = await profile(await tokenOf(account.taiKhoanId));

      expect(res.status).toBe(200);
      expect(keysOf(res)).toEqual(KEYS);
      expect(res.body).toMatchObject({
        hoTen: account.hoTen,
        email: account.email,
        vaiTro,
        chiNhanh,
        phamViQuanTri,
      });
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('PFE-03 (HS-24 GET) cột anh_dai_dien có giá trị mà anhDaiDien vẫn null', async () => {
    const { account } = await fx.patient({
      anhDaiDien: 'https://anh.clinix.invalid/a.png',
    });
    expect((await accountRow(account.taiKhoanId)).anhDaiDien).not.toBeNull();

    const res = await profile(await tokenOf(account.taiKhoanId));

    expect(res.status).toBe(200);
    expect((res.body as { anhDaiDien: unknown }).anhDaiDien).toBeNull();
  });

  it('PFE-04 (QP-01) không token ⇒ 401 CHUA_DANG_NHAP; token rác ⇒ 401 TOKEN_KHONG_HOP_LE', async () => {
    expectErrorResponse(await server().get(PROFILE_PATH), 401, NOT_LOGGED_IN);
    expectErrorResponse(await profile('khong.phai.token'), 401, INVALID);
  });

  it('PFE-05 (QP-05) ?taiKhoanId=<người khác> và thân có taiKhoanId bị bỏ qua: vẫn hồ sơ của chủ token, không 400, DB không đổi', async () => {
    const mine = await fx.patient({ hoTen: 'Chủ Token' });
    const other = await fx.patient({ hoTen: 'Người Khác' });
    const otherBefore = await accountRow(other.account.taiKhoanId);
    const mineBefore = await accountRow(mine.account.taiKhoanId);
    const token = await tokenOf(mine.account.taiKhoanId);
    const forOther = { taiKhoanId: other.account.taiKhoanId };

    const viaQuery = await profile(token).query(forOther);
    const viaBody = await profile(token).send(forOther);

    for (const res of [viaQuery, viaBody]) {
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ hoTen: 'Chủ Token' });
    }
    expect(await accountRow(other.account.taiKhoanId)).toEqual(otherBefore);
    expect(await accountRow(mine.account.taiKhoanId)).toEqual(mineBefore);
  });

  it('PFE-06 (QP-07) phiên đã thu hồi / tài khoản NgungHoatDong / ChoKichHoat ⇒ 401 PHIEN_HET_HIEU_LUC', async () => {
    const revoked = await fx.patient();
    const session = await h.sessions.create(revoked.account.taiKhoanId);
    expect((await profile(session.accessToken)).status).toBe(200);
    await h.sessions.revoke(session.sessionId);
    expectErrorResponse(await profile(session.accessToken), 401, SESSION_LOST);

    const suspended = await fx.patient();
    const suspendedToken = await tokenOf(suspended.account.taiKhoanId);
    await updateAccount(suspended.account.taiKhoanId, {
      trangThai: 'NgungHoatDong',
    });
    expectErrorResponse(await profile(suspendedToken), 401, SESSION_LOST);

    const waiting = await fx.receptionist(await fx.branch());
    const waitingToken = await tokenOf(waiting.account.taiKhoanId);
    await updateAccount(waiting.account.taiKhoanId, {
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
    });
    expectErrorResponse(await profile(waitingToken), 401, SESSION_LOST);
  });

  it('PFE-07 (H9) tài khoản chuyển NgungHoatDong GIỮA guard và service ⇒ 401 PHIEN_HET_HIEU_LUC, và có no-store', async () => {
    const { account } = await fx.patient();
    const token = await tokenOf(account.taiKhoanId);
    const repository = h.app.get(ProfileRepository);
    const original = repository.findProfile.bind(repository);
    // Guard đã qua; ngay trước khi service đọc hồ sơ thì tài khoản bị khoá
    vi.spyOn(repository, 'findProfile').mockImplementationOnce(
      async (em, accountId) => {
        await updateAccount(accountId, { trangThai: 'NgungHoatDong' });
        return original(em, accountId);
      },
    );

    const res = await profile(token);

    expectErrorResponse(res, 401, SESSION_LOST);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('PFE-08 (HS-04 phần đọc, L4) đổi tên trong DB: GET /profile và GET /auth/me cùng trả tên mới', async () => {
    const { account } = await fx.patient({ hoTen: 'Tên Cũ' });
    const token = await tokenOf(account.taiKhoanId);
    expect((await profile(token)).body).toMatchObject({ hoTen: 'Tên Cũ' });

    await updateAccount(account.taiKhoanId, { hoTen: 'Tên Mới' });

    const viaProfile = await profile(token);
    const viaMe = await server()
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(viaProfile.body).toMatchObject({ hoTen: 'Tên Mới' });
    expect(viaMe.body).toMatchObject({ hoTen: 'Tên Mới' });
  });

  it('PFE-09 (BM-02) Lễ tân thiếu hàng le_tan ⇒ 500 LOI_HE_THONG + requestId, thân không chứa dữ liệu cá nhân', async () => {
    const account = await insertTaiKhoan(h.db, {
      ...personal(2),
      loaiTaiKhoan: 'LeTan',
      daXacMinhEmail: true,
    });

    const res = await profile(await tokenOf(account.taiKhoanId));

    expectErrorResponse(res, 500, INTERNAL);
    expect(Object.keys(res.body as object).sort()).toEqual([
      'maLoi',
      'requestId',
      'thongBao',
    ]);
    expectNoSecrets('thân lỗi lệch dữ liệu', JSON.stringify(res.body), {
      literals: [personal(2).hoTen, personal(2).email, personal(2).soDienThoai],
      codes: [],
    });
  });

  it('PFE-10 (BM-02) kho ném lỗi DB mang câu SQL chứa giá trị ⇒ 500 LOI_HE_THONG + requestId, thân và log không chứa SQL hay giá trị', async () => {
    const { account } = await fx.patient(personal(3));
    const token = await tokenOf(account.taiKhoanId);
    const sqlValue = 'Giá Trị Mẫu Nằm Trong SQL';
    const failure = Object.assign(
      new Error("Table 'x.tai_khoan' doesn't exist"),
      {
        code: 'ER_NO_SUCH_TABLE',
        errno: 1146,
        sqlState: '42S02',
        sql: `SELECT * FROM tai_khoan WHERE ho_ten = '${sqlValue}'`,
      },
    );
    vi.spyOn(h.app.get(ProfileRepository), 'findProfile').mockRejectedValueOnce(
      failure,
    );

    const res = await profile(token);

    const body = expectErrorResponse(res, 500, INTERNAL);
    const text = JSON.stringify(body);
    expect(text).not.toContain('SELECT');
    expect(text).not.toContain(sqlValue);
    expect(output.join('')).not.toContain(sqlValue);
  });

  it('PFE-11 (BM-01) log của các luồng 200, 401, 500 không có họ tên, SĐT, email, ngày sinh, địa chỉ (và log không rỗng giả)', async () => {
    const branch = await fx.branch();
    const people = [personal(1), personal(2), personal(3), personal(4)];
    const patient = await fx.patient(people[0]);
    const doctor = await fx.doctor(branch, {}, people[1]);
    const receptionist = await fx.receptionist(branch, people[2]);
    const manager = await fx.admin(undefined, people[3]);
    const lacking = await insertTaiKhoan(h.db, {
      ...personal(5),
      loaiTaiKhoan: 'BacSi',
      daXacMinhEmail: true,
    });
    const suspended = await fx.patient(personal(6));
    const suspendedToken = await tokenOf(suspended.account.taiKhoanId);
    await updateAccount(suspended.account.taiKhoanId, {
      trangThai: 'NgungHoatDong',
    });

    for (const account of [
      patient.account,
      doctor.account,
      receptionist.account,
      manager.account,
    ]) {
      expect((await profile(await tokenOf(account.taiKhoanId))).status).toBe(
        200,
      );
    }
    expectErrorResponse(await profile(suspendedToken), 401, SESSION_LOST);
    const lackingRes = await profile(await tokenOf(lacking.taiKhoanId));
    expectErrorResponse(lackingRes, 500, INTERNAL);
    const dbFailure = vi
      .spyOn(h.app.get(ProfileRepository), 'findProfile')
      .mockRejectedValueOnce(new Error('mất kết nối'));
    const dbRes = await profile(await tokenOf(patient.account.taiKhoanId));
    expectErrorResponse(dbRes, 500, INTERNAL);
    expect(dbFailure).toHaveBeenCalledOnce();

    const log = output.join('');
    // Không rỗng giả: lỗi 500 phải để lại dấu trong log kèm requestId (đang bắt thật)
    for (const res of [lackingRes, dbRes]) {
      const { requestId } = res.body as { requestId: string };
      expect(log).toContain(requestId);
    }
    expect(log).toContain('GET /profile → 500');
    const everyone = [...people, personal(5), personal(6)];
    expectNoSecrets('log', log, {
      literals: everyone.flatMap((p) => Object.values(p)),
      codes: [],
    });
  });

  it('PFE-12 (QP-05) 40 lượt song song của hai tài khoản: không lượt nào lẫn hồ sơ của tài khoản kia', async () => {
    const first = await fx.patient({ hoTen: 'Người Một' });
    const second = await fx.receptionist(await fx.branch(), {
      hoTen: 'Người Hai',
    });
    const tokens = [
      await tokenOf(first.account.taiKhoanId),
      await tokenOf(second.account.taiKhoanId),
    ];
    const expected = [
      { vaiTro: 'BenhNhan', hoTen: 'Người Một' },
      { vaiTro: 'LeTan', hoTen: 'Người Hai' },
    ];
    const calls = Array.from({ length: 40 }, (_, index) =>
      profile(tokens[index % 2] ?? '').then((res) => ({
        res,
        want: expected[index % 2],
      })),
    );

    for (const { res, want } of await Promise.all(calls)) {
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(want ?? {});
    }
  });
});
