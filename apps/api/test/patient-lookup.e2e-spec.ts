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
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import type { PatientLookupPage } from './../src/patient/reception-lookup/patient-lookup.dto.js';
import { PatientLookupRepository } from './../src/patient/reception-lookup/patient-lookup.repository.js';
import {
  addManyPatients,
  addPatient,
  idsOf,
  ITEM_KEYS,
  LOOKUP_UNTOUCHED_TABLES,
  namesOf,
  PAGE_KEYS,
  sortedCopy,
  withAccountAutoIncrement,
} from './../src/patient/testing/patient-lookup-helpers.js';
import { snapshotTables } from './../src/patient/testing/profile-update-helpers.js';
import { BIG_ID } from './../src/patient/testing/relatives-helpers.js';
import { captureProcessOutput } from './../src/patient/testing/relatives-update-helpers.js';

// Task B6 — GET /reception/patients qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (patient PLAN 7.3, 7.4, 7.6; TRACKING B6-G).
// Mã ca PLE-nn là [đề xuất]. TC-11, TC-12 thuộc B7 (chi tiết), TC-17, TC-18 thuộc web F8: không phủ ở đây.
const PATH = '/reception/patients';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const SESSION_LOST = 'PHIEN_HET_HIEU_LUC';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const KEYWORD = 'TU_KHOA_KHONG_HOP_LE';
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
  output = captureProcessOutput();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  // Chốt an toàn: không để lại id lớn nào của PLE-11 dù ca đỏ (withAccountAutoIncrement đã dọn trong finally)
  await resetTables(h.db);
  await h.close();
});

// `query` viết thẳng sau dấu ? (đã mã hoá phần trăm nếu cần), để thử cả dạng supertest không dựng được (mảng, khoá `q[x]`)
const get = (query: string, accessToken?: string) => {
  const req = request(h.app.getHttpServer()).get(
    query === '' ? PATH : `${PATH}?${query}`,
  );
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const find = (q: string, accessToken: string, extra = '') =>
  get(`q=${encodeURIComponent(q)}${extra}`, accessToken);
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const updateAccount = (accountId: string, patch: Partial<TaiKhoan>) =>
  h.db.getRepository(TaiKhoan).update({ taiKhoanId: accountId }, patch);

// Lễ tân đăng nhập (chi nhánh riêng) và token của họ
async function receptionist() {
  const branch = await fx.branch();
  const { account } = await fx.receptionist(branch);
  return { branch, token: await tokenOf(account.taiKhoanId) };
}

const pageOf = (res: { body: unknown }) => res.body as PatientLookupPage;

describe('GET /reception/patients', () => {
  it('PLE-01 (TC-10, TC-01) Lễ tân tìm được: 200, JSON, đúng bốn khoá ở gốc, mỗi phần tử đúng năm khoá giá trị chuỗi, taiKhoanId là chuỗi; không khoá nào khác (mật khẩu băm, ngày sinh, địa chỉ, số lần vắng khám)', async () => {
    const { token } = await receptionist();
    const id = await addPatient(fx, {
      hoTen: 'Nguyễn Văn Thử',
      email: 'thu@mail-e.invalid',
      soDienThoai: '0901234567',
    });
    await addPatient(fx, { hoTen: 'Trần Thị Khác' });

    const res = await find('nguyen', token);

    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toContain('application/json');
    expect(Object.keys(res.body as object).sort()).toStrictEqual(PAGE_KEYS);
    expect(res.body).toStrictEqual({
      items: [
        {
          taiKhoanId: id,
          hoTen: 'Nguyễn Văn Thử',
          soDienThoai: '0901234567',
          email: 'thu@mail-e.invalid',
          trangThai: 'DangHoatDong',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    for (const item of pageOf(res).items) {
      expect(Object.keys(item).sort()).toStrictEqual(ITEM_KEYS);
      for (const value of Object.values(item))
        expect(typeof value).toBe('string');
    }
  });

  // 400 do ValidationPipe sinh ra TRƯỚC khi vào handler (nơi đặt no-store) nên không có header đó; thân lỗi chỉ có tên trường và mã, không mang giá trị q.
  // no-store có ở 200 (có kết quả và rỗng) và ở lỗi sinh TRONG handler (500, PLE-13).
  it('PLE-02 (TC-15, TC-04) Cache-Control: no-store ở 200 có kết quả và 200 rỗng (không 404); 400 của pipe không mang giá trị q; không Set-Cookie', async () => {
    const { token } = await receptionist();
    await addPatient(fx, { hoTen: 'Nguyễn Văn A' });

    const found = await find('nguyen', token);
    const empty = await find('khong-ai-ten-nhu-vay', token);
    const invalid = await find('a', token);

    expect(found.status).toBe(200);
    expect(empty.status).toBe(200);
    expect(empty.body).toStrictEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    expectErrorResponse(invalid, 400, INVALID_DATA);
    for (const res of [found, empty]) {
      expect(res.headers['cache-control']).toBe('no-store');
    }
    for (const res of [found, empty, invalid]) expectNoSetCookie(res);
  });

  it('PLE-03 (QP-04, QP-01) Bệnh nhân, Bác sĩ, Quản trị viên Toàn hệ thống và Chi nhánh ⇒ 403 KHONG_DU_QUYEN (cả khi q hợp lệ lẫn sai: guard chạy trước pipe); không token ⇒ 401 CHUA_DANG_NHAP; token rác ⇒ 401; Lễ tân ⇒ 200', async () => {
    const branch = await fx.branch();
    const patient = await fx.patient();
    await addPatient(fx, { hoTen: 'Nguyễn Văn A' });
    const accounts = {
      'Bệnh nhân': patient.account,
      'Bác sĩ': (await fx.doctor(branch)).account,
      'Quản trị viên Toàn hệ thống': (await fx.admin()).account,
      'Quản trị viên Chi nhánh': (await fx.admin(branch)).account,
    };

    for (const account of Object.values(accounts)) {
      const token = await tokenOf(account.taiKhoanId);
      expectErrorResponse(await find('nguyen', token), 403, FORBIDDEN);
      expectErrorResponse(await find('a', token), 403, FORBIDDEN);
      expectErrorResponse(await get('', token), 403, FORBIDDEN);
    }
    expectErrorResponse(await get('q=nguyen'), 401, NOT_LOGGED_IN);
    expectErrorResponse(
      await get('q=nguyen', 'khong.phai.token'),
      401,
      INVALID_TOKEN,
    );
    const { token } = await receptionist();
    expect((await find('nguyen', token)).status).toBe(200);
  });

  it('PLE-04 (QP-07) phiên đã thu hồi, Lễ tân bị khoá (NgungHoatDong) hoặc ChoKichHoat ⇒ 401 PHIEN_HET_HIEU_LUC', async () => {
    const revoked = await fx.receptionist(await fx.branch());
    const session = await h.sessions.create(revoked.account.taiKhoanId);
    await h.sessions.revoke(session.sessionId);

    const suspended = await fx.receptionist(await fx.branch());
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
      expectErrorResponse(await find('nguyen', token), 401, SESSION_LOST);
    }
  });

  it.each([
    ['thiếu hẳn q', ''],
    ['q rỗng', 'q='],
    ['q chỉ khoảng trắng', 'q=%20%20'],
    ['q một ký tự', 'q=a'],
    ['q 101 ký tự', `q=${'x'.repeat(101)}`],
    ['q là mảng', 'q=aa&q=bb'],
    ['q hai NUL', 'q=%00%00'],
    ['q có tab ở giữa', 'q=a%09b'],
  ])(
    'PLE-05 (TC-06) %s ⇒ 400 DU_LIEU_KHONG_HOP_LE đúng MỘT lỗi { q, TU_KHOA_KHONG_HOP_LE }, thân không mang giá trị đã gửi',
    async (_label, query) => {
      const { token } = await receptionist();

      const res = await get(query, token);

      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi).toStrictEqual([{ truong: 'q', ma: KEYWORD }]);
      expect(JSON.stringify(res.body)).not.toContain('xxxxxxxx');
    },
  );

  it('PLE-05b (TC-06) biên: q 2 ký tự và q 100 ký tự ⇒ 200; q có khoảng trắng hai đầu được cắt; q dạng NFD tìm được tên NFC', async () => {
    const { token } = await receptionist();
    await addPatient(fx, { hoTen: 'Nguyễn Văn A' });

    expect((await find('ab', token)).status).toBe(200);
    expect((await find('x'.repeat(100), token)).status).toBe(200);
    expect(
      namesOf(pageOf(await get('q=%20%20nguyen%20%20', token))),
    ).toStrictEqual(['Nguyễn Văn A']);
    expect(
      namesOf(pageOf(await find('Nguyễn'.normalize('NFD'), token))),
    ).toStrictEqual(['Nguyễn Văn A']);
  });

  it('PLE-06 (TC-06, QP-05, H3) tham số lạ benhNhanId, chiNhanhId, taiKhoanId, q[x] ⇒ 400 TRUONG_KHONG_DUOC_PHEP (không bị bỏ qua); phân trang sai ⇒ 400 đúng mã của trường', async () => {
    const { token } = await receptionist();

    for (const name of ['benhNhanId', 'chiNhanhId', 'taiKhoanId']) {
      const body = expectErrorResponse(
        await get(`q=nguyen&${name}=1`, token),
        400,
        INVALID_DATA,
      );
      expect(body.loi).toStrictEqual([{ truong: name, ma: NOT_ALLOWED }]);
    }
    expect(
      expectErrorResponse(await get('q[x]=1', token), 400, INVALID_DATA).loi,
    ).toStrictEqual([
      { truong: 'q[x]', ma: NOT_ALLOWED },
      { truong: 'q', ma: KEYWORD },
    ]);
    const cases: [string, string, string][] = [
      ['page=0', 'page', 'MIN'],
      ['pageSize=101', 'pageSize', 'MAX'],
      ['pageSize=0', 'pageSize', 'MIN'],
      ['page=1.5', 'page', 'IS_INT'],
    ];
    for (const [extra, truong, ma] of cases) {
      const body = expectErrorResponse(
        await get(`q=nguyen&${extra}`, token),
        400,
        INVALID_DATA,
      );
      expect(body.loi).toStrictEqual([{ truong, ma }]);
    }
  });

  it('PLE-07 (TC-09) phân trang qua HTTP: mặc định 20, pageSize 100 hợp lệ, page vượt cuối ⇒ 200 rỗng; page = 9223372036854775807 ⇒ 200 rỗng (không 500)', async () => {
    const { token } = await receptionist();
    const all = await addManyPatients(h.db, 25, 'Cùng Họ Tên');

    const first = pageOf(await find('cùng họ tên', token));
    const second = pageOf(await find('cùng họ tên', token, '&page=2'));
    const big = pageOf(await find('cùng họ tên', token, '&pageSize=100'));
    const beyond = pageOf(await find('cùng họ tên', token, '&page=3'));
    const huge = await find('cùng họ tên', token, '&page=9223372036854775807');

    expect(first.items).toHaveLength(20);
    expect(first).toMatchObject({ total: 25, page: 1, pageSize: 20 });
    expect(second.items).toHaveLength(5);
    expect([...idsOf(first), ...idsOf(second)]).toStrictEqual(all);
    expect(big.items).toHaveLength(25);
    expect(big.pageSize).toBe(100);
    expect(beyond).toStrictEqual({
      items: [],
      total: 25,
      page: 3,
      pageSize: 20,
    });
    expect(huge.status).toBe(200);
    expect(pageOf(huge).items).toStrictEqual([]);
    expect(pageOf(huge).total).toBe(25);
  });

  it('PLE-08 (TC-13, Q16) phạm vi toàn hệ thống qua HTTP: hai Lễ tân ở hai chi nhánh khác nhau thấy CÙNG kết quả, gồm Bệnh nhân không có lịch hẹn và Bệnh nhân chỉ có lịch ở chi nhánh khác', async () => {
    const a = await receptionist();
    const b = await receptionist();
    const noAppointment = await addPatient(fx, { hoTen: 'Không Có Lịch Hẹn' });
    const elsewhere = await addPatient(fx, {
      hoTen: 'Chỉ Có Lịch Chi Nhánh B',
    });
    const doctor = await fx.doctor(b.branch);
    const slot = await fx.slot(await fx.shift(doctor.profile));
    await fx.appointment(doctor.profile, slot, elsewhere, {
      trangThai: 'DaXacNhan',
    });

    const seenByA = pageOf(await find('lịch', a.token));
    const seenByB = pageOf(await find('lịch', b.token));

    expect(sortedCopy(idsOf(seenByA))).toStrictEqual(
      sortedCopy([noAppointment, elsewhere]),
    );
    expect(seenByB).toStrictEqual(seenByA);
  });

  it('PLE-09 (TC-01, bẫy 1) gõ không dấu qua HTTP: dang tìm được Đặng và ĐẶNG; đặng tìm được cả Dang; chỉ Bệnh nhân đã xác minh', async () => {
    const { token } = await receptionist();
    await addPatient(fx, { hoTen: 'Đặng Văn Hùng' });
    await addPatient(fx, { hoTen: 'ĐẶNG MINH' });
    await addPatient(fx, { hoTen: 'Dang Van Binh' });
    await addPatient(fx, { hoTen: 'Lê Văn Tám' });
    const expected = ['Dang Van Binh', 'ĐẶNG MINH', 'Đặng Văn Hùng'];

    for (const q of ['dang', 'đặng', 'ĐẶNG']) {
      expect(
        sortedCopy(namesOf(pageOf(await find(q, token)))),
        q,
      ).toStrictEqual(expected);
    }
  });

  it('PLE-10 (TC-14, TC-16) tìm qua HTTP (200, rỗng, 400) không đổi một hàng nào của mười bảng liên quan, kể cả nhat_ky_hanh_dong', async () => {
    const { token } = await receptionist();
    await addPatient(fx, { hoTen: 'Nguyễn Văn A' });
    const before = await snapshotTables(h.db, LOOKUP_UNTOUCHED_TABLES);

    await find('nguyen', token);
    await find('khong-ai', token);
    await find('a', token);
    await get('q=ab&benhNhanId=1', token);

    expect(await snapshotTables(h.db, LOOKUP_UNTOUCHED_TABLES)).toEqual(before);
  });

  it('PLE-11 id lớn hơn 2^53 ra đúng CHUỖI trong JSON; họ tên 100 ký tự tìm được', async () => {
    const { token } = await receptionist();
    const hundred = 'Đặng'.repeat(25);

    const ids = await withAccountAutoIncrement(h.db, BIG_ID, async () => {
      const created = await addManyPatients(h.db, 2, hundred);
      const res = await find(hundred, token);
      expect(res.status).toBe(200);
      expect(idsOf(pageOf(res))).toStrictEqual(created);
      expect(namesOf(pageOf(res))).toStrictEqual([hundred, hundred]);
      return created;
    });

    expect(ids).toStrictEqual([BIG_ID, '9007199254740994']);
  });
});

// Chuỗi dấu vết riêng: nếu nó (hay họ tên, email, SĐT của Bệnh nhân) xuất hiện trong đầu ra tiến trình thì dữ liệu cá nhân đã lọt vào log (H5)
const MARK = 'zq9xdauvet';
const NAME_MARK = 'Dấu Vết Họ Tên Riêng';
const PHONE_MARK = '0907654321';

describe('GET /reception/patients — log và lỗi hạ tầng', () => {
  it('PLE-12 (BM-01, H5) log của các luồng 200, 400, 401, 403, 500 không có từ khoá, họ tên, email, SĐT của Bệnh nhân (và log không rỗng giả)', async () => {
    const { token } = await receptionist();
    // Vitest không đưa console.* qua process.stdout.write nên bắt riêng: một lời gọi console.log(q) lỡ tay cũng phải làm ca này đỏ
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        output.push(args.map(String).join(' '));
      });
    }
    await addPatient(fx, {
      hoTen: NAME_MARK,
      email: `${MARK}@mail-m.invalid`,
      soDienThoai: PHONE_MARK,
    });
    const patientToken = await tokenOf((await fx.patient()).account.taiKhoanId);
    const repository = h.app.get(PatientLookupRepository);
    const failure = () =>
      Object.assign(new Error("Table 'x.tai_khoan' doesn't exist"), {
        code: 'ER_NO_SUCH_TABLE',
        errno: 1146,
        sqlState: '42S02',
        query: `SELECT * FROM tai_khoan WHERE email LIKE '%${MARK}%'`,
        parameters: [`%${MARK}%`, PHONE_MARK, NAME_MARK],
      });

    const ok = await find(MARK, token);
    const byPhone = await find(PHONE_MARK, token);
    const byName = await find(NAME_MARK, token);
    await find(MARK, token, '&page=0'); // 400
    await get(`q=${MARK}`); // 401
    await find(MARK, patientToken); // 403
    await get(`q=${MARK}&${MARK}=1`, token); // 400 do khoá lạ mang dấu vết
    vi.spyOn(repository, 'count').mockRejectedValueOnce(failure());
    const broken = await find(MARK, token); // 500

    expect(pageOf(ok).total).toBe(1);
    expect(pageOf(byPhone).total).toBe(1);
    expect(pageOf(byName).total).toBe(1);
    expectErrorResponse(broken, 500, INTERNAL);
    const logged = output.join('');
    expect(logged).toContain('→ 500'); // log không rỗng giả: dòng lỗi 500 có mặt
    for (const secret of [MARK, NAME_MARK, PHONE_MARK]) {
      expect(logged.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });

  it('PLE-13 (BM-02) lỗi DB ngoài dự kiến ở câu đếm và ở câu trang ⇒ 500 LOI_HE_THONG + requestId, thân không có SQL hay giá trị, log không có giá trị, có no-store', async () => {
    const { token } = await receptionist();
    await addPatient(fx, { hoTen: NAME_MARK, email: `${MARK}@mail-m.invalid` });
    const repository = h.app.get(PatientLookupRepository);
    const failure = () =>
      Object.assign(new Error("Table 'x.benh_nhan' doesn't exist"), {
        code: 'ER_NO_SUCH_TABLE',
        errno: 1146,
        sqlState: '42S02',
        sql: `SELECT * FROM benh_nhan WHERE ho_ten = '${NAME_MARK}'`,
      });
    vi.spyOn(repository, 'count').mockRejectedValueOnce(failure());
    vi.spyOn(repository, 'findPage').mockRejectedValueOnce(failure());

    const countFails = await find(MARK, token);
    const pageFails = await find(MARK, token);

    for (const res of [countFails, pageFails]) {
      const body = expectErrorResponse(res, 500, INTERNAL);
      const text = JSON.stringify(body);
      expect(text).not.toContain('SELECT');
      expect(text).not.toContain(NAME_MARK);
      expect(text).not.toContain(MARK);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(output.join('')).not.toContain(NAME_MARK);
  });
});
