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
import {
  accountRow,
  changedColumns,
  PROFILE_COLUMNS,
  SESSION_LOST,
  snapshotTables,
} from './../src/patient/testing/profile-update-helpers.js';

// Task B2 — PUT /profile qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (patient PLAN 7.1, 7.4, 7.6; TRACKING B2-G).
// Mã ca PUE-nn là [đề xuất]. HS-17…HS-22 thuộc F3 (web): không phủ ở đây. Phần GET: patient-profile.e2e-spec.ts (B1).
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
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
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
const put = (accessToken?: string) => {
  const req = server().put(PROFILE_PATH);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const get = (path: string, accessToken: string) =>
  server().get(path).set('Authorization', `Bearer ${accessToken}`);
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const updateAccount = (taiKhoanId: string, change: Partial<TaiKhoan>) =>
  h.db.getRepository(TaiKhoan).update(taiKhoanId, change);
const row = (taiKhoanId: string) => accountRow(h.db, taiKhoanId);
const keysOf = (res: { body: unknown }) =>
  Object.keys(res.body as object).sort();
const pairsOf = (body: { loi?: { truong: string; ma: string }[] }) =>
  (body.loi ?? []).map((item) => `${item.truong}:${item.ma}`);

// Thân PUT hợp lệ, mỗi `n` một bộ riêng (dữ liệu giả) để biết giá trị nào lọt ra log
const LETTERS = 'ABCDEFGHIJ';
const sent = (n: number) => ({
  hoTen: `Người Gửi ${LETTERS[n] ?? 'Z'}`,
  soDienThoai: `09100000${String(n)}${String(n)}`,
  gioiTinh: n % 2 === 0 ? 'Nam' : 'Nu',
  ngaySinh: `198${String(n)}-03-21`,
  diaChi: `${String(100 + n)} Đường Gửi Lên`,
});

describe('PUT /profile', () => {
  it('PUE-01 (HS-04, L4) Bệnh nhân 200: 10 khoá, giá trị mới (đã chuẩn hoá), no-store, JSON, không Set-Cookie; GET /profile và GET /auth/me cùng thấy tên mới; benh_nhan không đổi', async () => {
    const { account } = await fx.patient({
      hoTen: 'Tên Cũ',
      soDienThoai: '0900000000',
      email: 'bn.cu@clinix.invalid',
    });
    const token = await tokenOf(account.taiKhoanId);
    const tables = ['benh_nhan', 'vi_noi_bo'];
    const snapshot = await snapshotTables(h.db, tables);
    const before = await row(account.taiKhoanId);

    const res = await put(token).send({
      hoTen: '  Người Gửi Một  ',
      soDienThoai: ' 0911 000 001 ',
      gioiTinh: 'Nu',
      ngaySinh: '1981-03-21',
      diaChi: '  101 Đường Gửi Lên  ',
    });

    expect(res.status).toBe(200);
    expect(keysOf(res)).toEqual(KEYS);
    expect(res.body).toStrictEqual({
      hoTen: 'Người Gửi Một',
      email: 'bn.cu@clinix.invalid',
      soDienThoai: '0911000001',
      gioiTinh: 'Nu',
      ngaySinh: '1981-03-21',
      diaChi: '101 Đường Gửi Lên',
      anhDaiDien: null,
      vaiTro: 'BenhNhan',
      chiNhanh: null,
      phamViQuanTri: null,
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(String(res.headers['content-type'])).toContain('application/json');
    expectNoSetCookie(res);
    expect(changedColumns(before, await row(account.taiKhoanId))).toEqual([
      ...PROFILE_COLUMNS,
    ]);
    // Dạng đã chuẩn hoá nằm trong DB (do decorator làm lúc chuyển thân thành DTO)
    expect((await row(account.taiKhoanId))['so_dien_thoai']).toBe('0911000001');
    expect(await snapshotTables(h.db, tables)).toEqual(snapshot);

    const viaProfile = await get(PROFILE_PATH, token);
    const viaMe = await get('/auth/me', token);
    expect(viaProfile.body).toMatchObject({ hoTen: 'Người Gửi Một' });
    expect(viaMe.body).toMatchObject({ hoTen: 'Người Gửi Một' });
  });

  it('PUE-01b (HS-14) null ở giới tính, ngày sinh; địa chỉ rỗng ⇒ NULL trong DB và null trong phản hồi', async () => {
    const { account } = await fx.patient({
      gioiTinh: 'Nam',
      ngaySinh: '1980-08-08',
      diaChi: 'Địa chỉ cũ',
    });

    const res = await put(await tokenOf(account.taiKhoanId)).send({
      ...sent(1),
      gioiTinh: null,
      ngaySinh: null,
      diaChi: '   ',
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      gioiTinh: null,
      ngaySinh: null,
      diaChi: null,
    });
    const stored = await row(account.taiKhoanId);
    expect([
      stored['gioi_tinh'],
      stored['ngay_sinh'],
      stored['dia_chi'],
    ]).toEqual([null, null, null]);
  });

  it('PUE-02 (HS-05, QP-02) Lễ tân, Quản trị viên Toàn hệ thống, Quản trị viên Chi nhánh đều 200: chỉ hồ sơ của chính mình đổi, le_tan và quan_tri_vien không đổi, chi nhánh và phạm vi giữ nguyên', async () => {
    const branch = await fx.branch({ ten: 'Chi nhánh Một' });
    const other = await fx.branch({ ten: 'Chi nhánh Hai' });
    const bystander = await fx.patient({ hoTen: 'Người Đứng Ngoài' });
    const receptionist = await fx.receptionist(other);
    const globalAdmin = await fx.admin();
    const branchAdmin = await fx.admin(branch);
    const cases = [
      [
        receptionist.account,
        'LeTan',
        { chiNhanhId: other.chiNhanhId, ten: 'Chi nhánh Hai' },
        null,
      ],
      [globalAdmin.account, 'QuanTriVien', null, 'ToanHeThong'],
      [
        branchAdmin.account,
        'QuanTriVien',
        { chiNhanhId: branch.chiNhanhId, ten: 'Chi nhánh Một' },
        'ChiNhanh',
      ],
    ] as const;
    const tables = ['le_tan', 'quan_tri_vien', 'chi_nhanh'];
    const snapshot = await snapshotTables(h.db, tables);
    const bystanderBefore = await row(bystander.account.taiKhoanId);

    for (const [
      index,
      [account, vaiTro, chiNhanh, phamViQuanTri],
    ] of cases.entries()) {
      const before = await row(account.taiKhoanId);

      const res = await put(await tokenOf(account.taiKhoanId)).send(
        sent(index + 2),
      );

      expect(res.status).toBe(200);
      expect(keysOf(res)).toEqual(KEYS);
      expect(res.body).toMatchObject({
        ...sent(index + 2),
        vaiTro,
        chiNhanh,
        phamViQuanTri,
        email: account.email,
      });
      expect(changedColumns(before, await row(account.taiKhoanId))).toEqual([
        ...PROFILE_COLUMNS,
      ]);
    }
    expect(await snapshotTables(h.db, tables)).toEqual(snapshot);
    expect(await row(bystander.account.taiKhoanId)).toEqual(bystanderBefore);
  });

  it('PUE-03 (HS-16, QP-02) Bác sĩ PUT 200: tai_khoan đổi đúng 5 cột, bac_si không đổi cột nào (H14), chiNhanh giữ nguyên', async () => {
    const branch = await fx.branch({ ten: 'Chi nhánh Bác sĩ' });
    const { account } = await fx.doctor(branch);
    const tables = ['bac_si', 'chi_nhanh', 'chuyen_khoa'];
    const snapshot = await snapshotTables(h.db, tables);
    const before = await row(account.taiKhoanId);

    const res = await put(await tokenOf(account.taiKhoanId)).send(sent(3));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ...sent(3),
      vaiTro: 'BacSi',
      chiNhanh: { chiNhanhId: branch.chiNhanhId, ten: 'Chi nhánh Bác sĩ' },
      phamViQuanTri: null,
    });
    expect(changedColumns(before, await row(account.taiKhoanId))).toEqual([
      ...PROFILE_COLUMNS,
    ]);
    expect(await snapshotTables(h.db, tables)).toEqual(snapshot);
  });

  it('PUE-04 (HS-06) email trong thân ⇒ 400 TRUONG_KHONG_DUOC_PHEP đúng ở trường email; không cột nào đổi (nối dây DTO thật)', async () => {
    const { account } = await fx.patient({
      email: 'giu.nguyen@clinix.invalid',
    });
    const before = await row(account.taiKhoanId);

    const res = await put(await tokenOf(account.taiKhoanId)).send({
      ...sent(1),
      email: 'doi.sang@clinix.invalid',
    });

    const body = expectErrorResponse(res, 400, INVALID_DATA);
    expect(pairsOf(body)).toEqual([`email:${NOT_ALLOWED}`]);
    expect(await row(account.taiKhoanId)).toEqual(before);
    expect((await row(account.taiKhoanId))['email']).toBe(
      'giu.nguyen@clinix.invalid',
    );
  });

  it.each([
    'anhDaiDien',
    'soCccd',
    'taiKhoanId',
    'vaiTro',
    'trangThai',
    'chiNhanhId',
    'loaiTaiKhoan',
    'benhNhanId',
  ])(
    'PUE-05 (HS-07, HS-24, QP-05) trường lạ %s ⇒ 400 TRUONG_KHONG_DUOC_PHEP đúng trường; hồ sơ của chủ token và của người khác không đổi',
    async (field) => {
      const mine = await fx.patient();
      const other = await fx.patient();
      const mineBefore = await row(mine.account.taiKhoanId);
      const otherBefore = await row(other.account.taiKhoanId);

      const res = await put(await tokenOf(mine.account.taiKhoanId)).send({
        ...sent(1),
        [field]: field === 'taiKhoanId' ? other.account.taiKhoanId : 'x',
      });

      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(pairsOf(body)).toEqual([`${field}:${NOT_ALLOWED}`]);
      expect(await row(mine.account.taiKhoanId)).toEqual(mineBefore);
      expect(await row(other.account.taiKhoanId)).toEqual(otherBefore);
    },
  );

  it('PUE-06 (QP-05) ?taiKhoanId=<người khác> trên query bị bỏ qua: PUT đổi chính chủ token, hồ sơ người khác không đổi', async () => {
    const mine = await fx.patient({ hoTen: 'Chủ Token' });
    const other = await fx.patient({ hoTen: 'Người Khác' });
    const otherBefore = await row(other.account.taiKhoanId);

    const res = await put(await tokenOf(mine.account.taiKhoanId))
      .query({ taiKhoanId: other.account.taiKhoanId })
      .send(sent(4));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ...sent(4), email: mine.account.email });
    expect((await row(mine.account.taiKhoanId))['ho_ten']).toBe(sent(4).hoTen);
    expect(await row(other.account.taiKhoanId)).toEqual(otherBefore);
  });

  it('PUE-07 (HS-13) nhiều lỗi cùng lúc ⇒ 400 DU_LIEU_KHONG_HOP_LE + loi[] đủ mọi trường; DB không đổi; thân lỗi không lặp giá trị đã gửi', async () => {
    const { account } = await fx.patient();
    const before = await row(account.taiKhoanId);

    const res = await put(await tokenOf(account.taiKhoanId)).send({
      email: 'LAP-LAI-EMAIL@clinix.invalid',
      hoTen: '',
      soDienThoai: 'LAP-LAI-SDT',
      gioiTinh: 'LAP-LAI-GIOI-TINH',
      ngaySinh: '2999-01-01',
      diaChi: 'xuống\ndòng LAP-LAI-DIA-CHI',
    });

    const body = expectErrorResponse(res, 400, INVALID_DATA);
    expect(pairsOf(body)).toEqual([
      `email:${NOT_ALLOWED}`,
      'hoTen:HO_TEN_KHONG_HOP_LE',
      'soDienThoai:SDT_KHONG_HOP_LE',
      'gioiTinh:GIOI_TINH_KHONG_HOP_LE',
      'ngaySinh:NGAY_SINH_KHONG_HOP_LE',
      'diaChi:DIA_CHI_KHONG_HOP_LE',
    ]);
    expect(JSON.stringify(res.body)).not.toContain('LAP-LAI');
    expect(await row(account.taiKhoanId)).toEqual(before);
  });

  it('PUE-07b PUT thay cả bộ: thiếu một khoá ⇒ 400 đúng mã của trường đó, không "giữ nguyên"; DB không đổi', async () => {
    const { account } = await fx.patient();
    const before = await row(account.taiKhoanId);
    const { diaChi: _omitted, ...withoutAddress } = sent(1);
    void _omitted;

    const res = await put(await tokenOf(account.taiKhoanId)).send(
      withoutAddress,
    );

    const body = expectErrorResponse(res, 400, INVALID_DATA);
    expect(pairsOf(body)).toEqual(['diaChi:DIA_CHI_KHONG_HOP_LE']);
    expect(await row(account.taiKhoanId)).toEqual(before);
  });

  it('PUE-08 (QP-01) không token ⇒ 401 CHUA_DANG_NHAP; token rác ⇒ 401 TOKEN_KHONG_HOP_LE; DB không đổi', async () => {
    const { account } = await fx.patient();
    const before = await row(account.taiKhoanId);

    expectErrorResponse(await put().send(sent(1)), 401, NOT_LOGGED_IN);
    expectErrorResponse(
      await put('khong.phai.token').send(sent(1)),
      401,
      INVALID_TOKEN,
    );

    expect(await row(account.taiKhoanId)).toEqual(before);
  });

  it('PUE-09 (QP-07) phiên đã thu hồi / tài khoản NgungHoatDong / ChoKichHoat ⇒ 401 PHIEN_HET_HIEU_LUC và không cột nào đổi', async () => {
    const revoked = await fx.patient();
    const session = await h.sessions.create(revoked.account.taiKhoanId);
    await h.sessions.revoke(session.sessionId);
    const revokedBefore = await row(revoked.account.taiKhoanId);
    expectErrorResponse(
      await put(session.accessToken).send(sent(1)),
      401,
      SESSION_LOST,
    );
    expect(await row(revoked.account.taiKhoanId)).toEqual(revokedBefore);

    const suspended = await fx.patient();
    const suspendedToken = await tokenOf(suspended.account.taiKhoanId);
    await updateAccount(suspended.account.taiKhoanId, {
      trangThai: 'NgungHoatDong',
    });
    const suspendedBefore = await row(suspended.account.taiKhoanId);
    expectErrorResponse(
      await put(suspendedToken).send(sent(1)),
      401,
      SESSION_LOST,
    );
    expect(await row(suspended.account.taiKhoanId)).toEqual(suspendedBefore);

    const waiting = await fx.receptionist(await fx.branch());
    const waitingToken = await tokenOf(waiting.account.taiKhoanId);
    await updateAccount(waiting.account.taiKhoanId, {
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
    });
    const waitingBefore = await row(waiting.account.taiKhoanId);
    expectErrorResponse(
      await put(waitingToken).send(sent(1)),
      401,
      SESSION_LOST,
    );
    expect(await row(waiting.account.taiKhoanId)).toEqual(waitingBefore);
  });

  it('PUE-10 (H9) tài khoản chuyển NgungHoatDong GIỮA guard và câu UPDATE ⇒ 401 PHIEN_HET_HIEU_LUC, có no-store, năm cột không đổi', async () => {
    const { account } = await fx.patient();
    const token = await tokenOf(account.taiKhoanId);
    const before = await row(account.taiKhoanId);
    const repository = h.app.get(ProfileRepository);
    const original = repository.updateProfile.bind(repository);
    // Guard đã qua; ngay trước khi câu UPDATE chạy thì tài khoản bị khoá (từ kết nối khác)
    vi.spyOn(repository, 'updateProfile').mockImplementationOnce(
      async (em, accountId, changes) => {
        await updateAccount(accountId, { trangThai: 'NgungHoatDong' });
        return original(em, accountId, changes);
      },
    );

    const res = await put(token).send(sent(1));

    expectErrorResponse(res, 401, SESSION_LOST);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(changedColumns(before, await row(account.taiKhoanId))).toEqual([
      'trang_thai',
    ]);
  });

  it('PUE-11 (BM-02) lỗi DB ngoài dự kiến ở bước đọc lại (câu SQL chứa giá trị) ⇒ 500 LOI_HE_THONG + requestId, thân và log không có SQL hay giá trị, và giao dịch HOÀN TÁC: DB không đổi', async () => {
    const { account } = await fx.patient();
    const token = await tokenOf(account.taiKhoanId);
    const before = await row(account.taiKhoanId);
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

    const res = await put(token).send(sent(1));

    const body = expectErrorResponse(res, 500, INTERNAL);
    const text = JSON.stringify(body);
    expect(text).not.toContain('SELECT');
    expect(text).not.toContain(sqlValue);
    expect(output.join('')).not.toContain(sqlValue);
    expect(await row(account.taiKhoanId)).toEqual(before);
  });

  it('PUE-12 (BM-01) log của các luồng 200, 400, 401, 500 không có họ tên, SĐT, ngày sinh, địa chỉ của thân gửi lên (và log không rỗng giả)', async () => {
    const branch = await fx.branch();
    const patient = await fx.patient();
    const doctor = await fx.doctor(branch);
    const lacking = await insertTaiKhoan(h.db, {
      loaiTaiKhoan: 'BacSi',
      daXacMinhEmail: true,
    });
    const suspended = await fx.patient();
    const suspendedToken = await tokenOf(suspended.account.taiKhoanId);
    await updateAccount(suspended.account.taiKhoanId, {
      trangThai: 'NgungHoatDong',
    });
    const bodies = [sent(1), sent(2), sent(3), sent(4), sent(5)];

    expect(
      (await put(await tokenOf(patient.account.taiKhoanId)).send(bodies[0]))
        .status,
    ).toBe(200);
    expect(
      (await put(await tokenOf(doctor.account.taiKhoanId)).send(bodies[1]))
        .status,
    ).toBe(200);
    expectErrorResponse(
      await put(await tokenOf(patient.account.taiKhoanId)).send({
        ...bodies[2],
        soDienThoai: 'không phải số',
      }),
      400,
      INVALID_DATA,
    );
    expectErrorResponse(
      await put(suspendedToken).send(bodies[3]),
      401,
      SESSION_LOST,
    );
    const lackingRes = await put(await tokenOf(lacking.taiKhoanId)).send(
      bodies[4],
    );
    expectErrorResponse(lackingRes, 500, INTERNAL);
    const dbFailure = vi
      .spyOn(h.app.get(ProfileRepository), 'findProfile')
      .mockRejectedValueOnce(new Error('mất kết nối'));
    const dbRes = await put(await tokenOf(patient.account.taiKhoanId)).send(
      bodies[0],
    );
    expectErrorResponse(dbRes, 500, INTERNAL);
    expect(dbFailure).toHaveBeenCalledOnce();

    const log = output.join('');
    // Không rỗng giả: lỗi 500 phải để lại dấu trong log kèm requestId (đang bắt thật)
    for (const res of [lackingRes, dbRes]) {
      const { requestId } = res.body as { requestId: string };
      expect(log).toContain(requestId);
    }
    expect(log).toContain('PUT /profile → 500');
    expectNoSecrets('log', log, {
      literals: bodies.flatMap((b) => [
        b.hoTen,
        b.soDienThoai,
        b.ngaySinh,
        b.diaChi,
      ]),
      codes: [],
    });
  });

  it('PUE-13 (QP-05) 20 PUT song song của hai tài khoản: không lượt nào đổi hồ sơ của tài khoản kia', async () => {
    const first = await fx.patient({ hoTen: 'Người Một' });
    const second = await fx.receptionist(await fx.branch(), {
      hoTen: 'Người Hai',
    });
    const tokens = [
      await tokenOf(first.account.taiKhoanId),
      await tokenOf(second.account.taiKhoanId),
    ];
    const names = ['Người Một', 'Người Hai'];
    const calls = Array.from({ length: 20 }, (_, index) => {
      const who = index % 2;
      return put(tokens[who]).send({
        ...sent(index % 10),
        hoTen: `${names[who] ?? ''} Lần ${LETTERS[index % 10] ?? ''}`,
      });
    });

    const responses = await Promise.all(calls);

    responses.forEach((res, index) => {
      const who = index % 2;
      expect(res.status).toBe(200);
      expect((res.body as { hoTen: string }).hoTen).toMatch(
        new RegExp(`^${names[who] ?? ''} Lần `),
      );
      expect((res.body as { vaiTro: string }).vaiTro).toBe(
        who === 0 ? 'BenhNhan' : 'LeTan',
      );
    });
    expect((await row(first.account.taiKhoanId))['ho_ten']).toMatch(
      /^Người Một Lần /,
    );
    expect((await row(second.account.taiKhoanId))['ho_ten']).toMatch(
      /^Người Hai Lần /,
    );
  });
});
