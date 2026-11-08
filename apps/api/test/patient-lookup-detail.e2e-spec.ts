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
import type { PatientDetail } from './../src/patient/reception-lookup/patient-lookup.dto.js';
import { PatientLookupRepository } from './../src/patient/reception-lookup/patient-lookup.repository.js';
import { RelativesRepository } from './../src/patient/relatives/relatives.repository.js';
import {
  addDetailPatient,
  addNotFoundBranches,
  addPatientWithId,
  addRelative,
  addTwoRelatives,
  DETAIL_KEYS,
  DETAIL_RELATIVE_KEYS,
  MALFORMED_IDS,
  MISSING_ID,
  NOT_FOUND_TEXT,
} from './../src/patient/testing/patient-detail-helpers.js';
import {
  addManyPatients,
  LOOKUP_UNTOUCHED_TABLES,
  withAccountAutoIncrement,
} from './../src/patient/testing/patient-lookup-helpers.js';
import { snapshotTables } from './../src/patient/testing/profile-update-helpers.js';
import { BIG_ID } from './../src/patient/testing/relatives-helpers.js';
import { captureProcessOutput } from './../src/patient/testing/relatives-update-helpers.js';

// Task B7 — GET /reception/patients/:id qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (patient PLAN 7.3, 7.4, 7.6; TRACKING B7-G).
// Mã ca PDE-nn là [đề xuất]. TC-17, TC-18 thuộc web F8: không phủ ở đây. File MỚI (không sửa patient-lookup.e2e-spec.ts của B6).
const PATH = '/reception/patients';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const SESSION_LOST = 'PHIEN_HET_HIEU_LUC';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const NOT_FOUND = 'KHONG_TIM_THAY';
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
  // Chốt an toàn: không để lại id lớn nào của PDE-09 dù ca đỏ (withAccountAutoIncrement đã dọn trong finally)
  await resetTables(h.db);
  await h.close();
});

// `id` viết thẳng vào đường dẫn (đã mã hoá phần trăm nếu cần), để thử cả dạng supertest không tự dựng; `query` viết thẳng sau dấu ?
const get = (id: string, accessToken?: string, query = '') => {
  const req = request(h.app.getHttpServer()).get(
    `${PATH}/${id}${query === '' ? '' : `?${query}`}`,
  );
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
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

const FULL = {
  hoTen: 'Nguyễn Văn Thử',
  email: 'thu@mail-e.invalid',
  soDienThoai: '0901234567',
  gioiTinh: 'Nam',
  ngaySinh: '1990-05-15',
  diaChi: '12 Đường Giả, Quận Giả',
  thoiDiemTaoVN: '2026-11-08 08:00:00',
  soLanVangMat: 2,
};

describe('GET /reception/patients/:id — nội dung', () => {
  it('PDE-01 (TC-11, Q18) Lễ tân xem được: 200, JSON, thân khớp từng giá trị, đúng mười khoá theo thứ tự PLAN 5.7 và sáu khoá mỗi người thân (đang dùng trước), không khoá nào khác; kiểu từng khoá', async () => {
    const { token } = await receptionist();
    const id = await addDetailPatient(h.db, fx, FULL);
    const relatives = await addTwoRelatives(h.db, id);

    const res = await get(id, token);

    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toContain('application/json');
    expect(res.body).toStrictEqual({
      hoTen: 'Nguyễn Văn Thử',
      email: 'thu@mail-e.invalid',
      soDienThoai: '0901234567',
      gioiTinh: 'Nam',
      ngaySinh: '1990-05-15',
      diaChi: '12 Đường Giả, Quận Giả',
      thoiDiemTao: '2026-11-08T01:00:00.000Z',
      trangThai: 'DangHoatDong',
      soLanVangMat: 2,
      nguoiThan: relatives,
    });
    const body = res.body as PatientDetail;
    expect(Object.keys(body)).toStrictEqual([
      'hoTen',
      'email',
      'soDienThoai',
      'gioiTinh',
      'ngaySinh',
      'diaChi',
      'thoiDiemTao',
      'trangThai',
      'soLanVangMat',
      'nguoiThan',
    ]);
    expect(Object.keys(body).sort()).toStrictEqual(DETAIL_KEYS);
    expect(typeof body.soLanVangMat).toBe('number');
    expect(body.nguoiThan.map((r) => r.trangThaiHieuLuc)).toStrictEqual([
      true,
      false,
    ]);
    for (const relative of body.nguoiThan) {
      expect(Object.keys(relative).sort()).toStrictEqual(DETAIL_RELATIVE_KEYS);
    }
  });

  it('PDE-01b (Q17) Bệnh nhân NgungHoatDong xem được kèm trangThai mã NgungHoatDong; chưa nhập hồ sơ ra null; không người thân ra mảng rỗng', async () => {
    const { token } = await receptionist();
    const stopped = await addDetailPatient(h.db, fx, {
      hoTen: 'Đã Ngừng',
      trangThai: 'NgungHoatDong',
    });

    const res = await get(stopped, token);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      hoTen: 'Đã Ngừng',
      trangThai: 'NgungHoatDong',
      gioiTinh: null,
      ngaySinh: null,
      diaChi: null,
      soLanVangMat: 0,
      nguoiThan: [],
    });
  });

  it('PDE-09 id lớn hơn 2^53 qua HTTP: 200 đúng người và đúng người thân (nếu bị ép Number sẽ trỏ id khác và ra 404)', async () => {
    const { token } = await receptionist();

    await withAccountAutoIncrement(h.db, BIG_ID, async () => {
      const [first] = await addManyPatients(h.db, 2, 'Id Rất Lớn');
      expect(first).toBe(BIG_ID);
      await addRelative(h.db, BIG_ID, {
        hoTen: 'Con Của Số Một',
        moiQuanHe: 'Con',
        gioiTinh: 'Nam',
        ngaySinh: '2018-03-04',
        soDienThoai: null,
      });

      const res = await get(BIG_ID, token);

      expect(res.status).toBe(200);
      expect(
        (res.body as PatientDetail).nguoiThan.map((r) => r.hoTen),
      ).toStrictEqual(['Con Của Số Một']);
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });
});

describe('GET /reception/patients/:id — header', () => {
  // Hiện trạng ĐÃ ĐO (TRACKING B7-E), khoá chính xác: no-store có ở 200 và ở 404 sinh TRONG handler (service); 404 do pipe sinh trước handler nên không có.
  // Thân của hai loại 404 vẫn giống từng ký tự (PDE-05).
  it('PDE-02 (TC-15) no-store ở 200 và ở 404 do service (id đúng dạng mà không có); KHÔNG có ở 404 do pipe (id sai dạng); không Set-Cookie ở cả ba', async () => {
    const { token } = await receptionist();
    const id = await addDetailPatient(h.db, fx, FULL);

    const found = await get(id, token);
    const missing = await get(MISSING_ID, token);
    const malformed = await get('abc', token);

    expect(found.status).toBe(200);
    expectErrorResponse(missing, 404, NOT_FOUND);
    expectErrorResponse(malformed, 404, NOT_FOUND);
    expect(found.headers['cache-control']).toBe('no-store');
    expect(missing.headers['cache-control']).toBe('no-store');
    expect(malformed.headers['cache-control']).toBeUndefined();
    expect(missing.text).toBe(malformed.text);
    for (const res of [found, missing, malformed]) expectNoSetCookie(res);
  });
});

describe('GET /reception/patients/:id — phân quyền', () => {
  it('PDE-03 (QP-04, QP-01, Q27) 403 TRƯỚC 404 cho cả ba nhóm người gọi: Bệnh nhân, Bác sĩ, Quản trị viên (hai phạm vi) nhận 403 KHONG_DU_QUYEN với id thật, id không có VÀ cả 17 dạng id sai; không token 401 CHUA_DANG_NHAP với mọi dạng; token rác 401; Lễ tân 200 với id thật và 404 với id sai dạng', async () => {
    const branch = await fx.branch();
    const real = await addDetailPatient(h.db, fx, FULL);
    const accounts = {
      'Bệnh nhân': (await fx.patient()).account,
      'Bác sĩ': (await fx.doctor(branch)).account,
      'Quản trị viên Toàn hệ thống': (await fx.admin()).account,
      'Quản trị viên Chi nhánh': (await fx.admin(branch)).account,
    };
    const ids = [real, MISSING_ID, ...MALFORMED_IDS.map(([, raw]) => raw)];

    for (const account of Object.values(accounts)) {
      const token = await tokenOf(account.taiKhoanId);
      for (const id of ids) {
        expectErrorResponse(await get(id, token), 403, FORBIDDEN);
      }
    }
    for (const id of ids) {
      expectErrorResponse(await get(id), 401, NOT_LOGGED_IN);
    }
    expectErrorResponse(
      await get(real, 'khong.phai.token'),
      401,
      INVALID_TOKEN,
    );
    const { token } = await receptionist();
    expect((await get(real, token)).status).toBe(200);
    expectErrorResponse(await get('abc', token), 404, NOT_FOUND);
  });

  it('PDE-04 (QP-07) phiên đã thu hồi, Lễ tân bị khoá (NgungHoatDong) hoặc ChoKichHoat ⇒ 401 PHIEN_HET_HIEU_LUC', async () => {
    const real = await addDetailPatient(h.db, fx, FULL);
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
      expectErrorResponse(await get(real, token), 401, SESSION_LOST);
    }
  });
});

describe('GET /reception/patients/:id — 404 cùng thân và phạm vi', () => {
  it('PDE-05 (TC-12, Q27, H3) bảy nhánh dữ liệu (không tồn tại, Lễ tân, Bác sĩ, Quản trị viên hai phạm vi, Bệnh nhân chưa xác minh, Bác sĩ có dòng benh_nhan hỏng), 9223372036854775807 và 17 dạng id sai ⇒ 404 KHONG_TIM_THAY với thân GIỐNG TỪNG KÝ TỰ (một giá trị duy nhất); đối chứng id thật vẫn 200', async () => {
    const { token } = await receptionist();
    const branches = await addNotFoundBranches(h.db, fx);
    const real = await addDetailPatient(h.db, fx, FULL);
    const attempts: [string, string][] = [
      ...Object.entries(branches),
      ['BIGINT lớn nhất (không có)', '9223372036854775807'],
      ...MALFORMED_IDS.map(([label, raw]): [string, string] => [
        `sai dạng ${label}`,
        raw,
      ]),
    ];

    const texts = new Set<string>();
    for (const [label, id] of attempts) {
      const res = await get(id, token);
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.text, label).toBe(NOT_FOUND_TEXT);
      texts.add(res.text);
    }

    expect(texts.size).toBe(1);
    expect(attempts).toHaveLength(7 + 1 + 17);
    expect((await get(real, token)).status).toBe(200);
  });

  // Nếu id sai dạng lọt xuống MySQL thì `tai_khoan_id = '0<id>'` (và `+<id>`, `<id>.0`, `<id>e0`, có khoảng trắng) được ÉP SỐ thành chính id thật và trả hồ sơ: chỉ pipe chặn được.
  // Nên phải thử các dạng sai dẫn xuất TỪ id thật (các dạng cố định của PDE-05 trỏ tới id khác, không chứng minh được gì).
  it('PDE-05b (Q27, H3) dạng sai dẫn xuất từ id thật (0<id>, +<id>, <id>.0, <id>e0, khoảng trắng đầu hoặc cuối) ⇒ 404 cùng thân, KHÔNG ra hồ sơ của id thật', async () => {
    const { token } = await receptionist();
    const real = await addDetailPatient(h.db, fx, FULL);

    expect((await get(real, token)).status).toBe(200);
    for (const raw of [
      `0${real}`,
      `+${real}`,
      `${real}.0`,
      `${real}e0`,
      `%20${real}`,
      `${real}%20`,
    ]) {
      const res = await get(raw, token);
      expect(res.status, raw).toBe(404);
      expect(res.text, raw).toBe(NOT_FOUND_TEXT);
    }
  });

  it('PDE-06 (TC-13, Q16, l) phạm vi toàn hệ thống: Lễ tân chi nhánh A xem được Bệnh nhân chỉ có lịch ở chi nhánh B; query lạ (chiNhanhId, benhNhanId, page, q lặp) bị BỎ QUA, thân giống hệt không có query', async () => {
    const a = await receptionist();
    const b = await receptionist();
    const elsewhere = await addDetailPatient(h.db, fx, FULL);
    const doctor = await fx.doctor(b.branch);
    const slot = await fx.slot(await fx.shift(doctor.profile));
    await fx.appointment(doctor.profile, slot, elsewhere, {
      trangThai: 'DaXacNhan',
    });

    const plain = await get(elsewhere, a.token);
    const seenByB = await get(elsewhere, b.token);

    expect(plain.status).toBe(200);
    expect(seenByB.body).toStrictEqual(plain.body);
    for (const query of [
      `chiNhanhId=${b.branch.chiNhanhId}`,
      `chiNhanhId=${a.branch.chiNhanhId}`,
      'benhNhanId=1&q=a',
      'page=0',
      'q=a&q=b',
    ]) {
      const res = await get(elsewhere, a.token, query);
      expect(res.status, query).toBe(200);
      expect(res.text, query).toBe(plain.text);
    }
  });

  it('PDE-07 (TC-14, TC-16) xem qua HTTP (200, 404, 403) không đổi một hàng nào của mười bảng liên quan, kể cả nhat_ky_hanh_dong', async () => {
    const { token } = await receptionist();
    const id = await addDetailPatient(h.db, fx, FULL);
    await addTwoRelatives(h.db, id);
    const patientToken = await tokenOf((await fx.patient()).account.taiKhoanId);
    const before = await snapshotTables(h.db, LOOKUP_UNTOUCHED_TABLES);

    await get(id, token);
    await get(MISSING_ID, token);
    await get('abc', token);
    await get(id, patientToken);
    await get(id);

    expect(await snapshotTables(h.db, LOOKUP_UNTOUCHED_TABLES)).toEqual(before);
  });
});

// Chuỗi dấu vết riêng: nếu chúng xuất hiện trong đầu ra tiến trình thì dữ liệu cá nhân đã lọt vào log (H5)
const MARK = 'zq9xdauvet';
const NAME_MARK = 'Dấu Vết Họ Tên Riêng';
const PHONE_MARK = '0907654321';
const ADDRESS_MARK = '99 Phố Dấu Vết Địa Chỉ';
const BIRTH_MARK = '1987-06-05';
const RELATIVE_NAME_MARK = 'Dấu Vết Người Thân';
const RELATIVE_PHONE_MARK = '0908765432';
// Mã đủ dài và riêng (mã nhỏ trùng với giờ, số tiến trình… trong dòng log)
const PATIENT_ID = '4000123456789';

async function seedMarkedPatient() {
  await addPatientWithId(h.db, PATIENT_ID, {
    hoTen: NAME_MARK,
    email: `${MARK}@mail-m.invalid`,
    soDienThoai: PHONE_MARK,
    diaChi: ADDRESS_MARK,
    ngaySinh: BIRTH_MARK,
  });
  await addRelative(h.db, PATIENT_ID, {
    hoTen: RELATIVE_NAME_MARK,
    moiQuanHe: 'Con',
    gioiTinh: 'Nam',
    ngaySinh: '2015-02-03',
    soDienThoai: RELATIVE_PHONE_MARK,
  });
}

const failure = () =>
  Object.assign(new Error("Table 'x.tai_khoan' doesn't exist"), {
    code: 'ER_NO_SUCH_TABLE',
    errno: 1146,
    sqlState: '42S02',
    query: `SELECT * FROM tai_khoan WHERE email LIKE '%${MARK}%' AND ho_ten = '${NAME_MARK}'`,
    parameters: [PATIENT_ID, `%${MARK}%`, PHONE_MARK, NAME_MARK, ADDRESS_MARK],
  });

describe('GET /reception/patients/:id — log và lỗi hạ tầng', () => {
  it('PDE-08 (BM-01, H5) đầu ra tiến trình của các luồng 200, 404, 403, 401 không có họ tên, email, SĐT, địa chỉ, ngày sinh của Bệnh nhân và người thân, cũng không có mã tài khoản; ở luồng 500 các dữ liệu đó vẫn KHÔNG có và mã chỉ có đúng MỘT chỗ: đường dẫn trong dòng log của bộ lọc lỗi (log không rỗng giả)', async () => {
    const { token } = await receptionist();
    // Vitest không đưa console.* qua process.stdout.write nên bắt riêng: một lời gọi console.log lỡ tay cũng phải làm ca này đỏ
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        output.push(args.map(String).join(' '));
      });
    }
    await seedMarkedPatient();
    const patientToken = await tokenOf((await fx.patient()).account.taiKhoanId);
    const secrets = [
      MARK,
      NAME_MARK,
      PHONE_MARK,
      ADDRESS_MARK,
      BIRTH_MARK,
      RELATIVE_NAME_MARK,
      RELATIVE_PHONE_MARK,
    ];

    const ok = await get(PATIENT_ID, token);
    await get('4000123456780', token); // 404 do service (id không có)
    await get(`${PATIENT_ID}x`, token); // 404 do pipe
    await get(PATIENT_ID, patientToken); // 403
    await get(PATIENT_ID); // 401
    const quiet = output.join('');

    expect(ok.status).toBe(200);
    expect((ok.body as PatientDetail).hoTen).toBe(NAME_MARK);
    // Các luồng không phải 5xx KHÔNG ghi log nào, nên không thể chứa mã hay dữ liệu cá nhân
    for (const secret of [...secrets, PATIENT_ID, '4000123456780']) {
      expect(quiet.toLowerCase()).not.toContain(secret.toLowerCase());
    }

    vi.spyOn(
      h.app.get(PatientLookupRepository),
      'findDetail',
    ).mockRejectedValueOnce(failure());
    const broken = await get(PATIENT_ID, token); // 500
    vi.spyOn(
      h.app.get(RelativesRepository),
      'findRelatives',
    ).mockRejectedValueOnce(failure());
    const brokenRelatives = await get(PATIENT_ID, token); // 500 ở câu người thân

    expectErrorResponse(broken, 500, INTERNAL);
    expectErrorResponse(brokenRelatives, 500, INTERNAL);
    const logged = output.join('');
    expect(logged).toContain('→ 500'); // log không rỗng giả: dòng lỗi 500 có mặt
    for (const secret of secrets) {
      expect(logged.toLowerCase()).not.toContain(secret.toLowerCase());
    }
    // ĐÃ ĐO: bộ lọc lỗi toàn cục (common/errors/all-exceptions.filter.ts) ghi `METHOD path → 500` với path CHỨA mã trên đường dẫn. Đó là chỗ DUY NHẤT mã lọt vào log
    // (không có trong stack, tham số hay thông điệp của lỗi); bỏ hai dòng đó đi thì không còn mã nào. common/** không thuộc B7 nên chỉ khoá hiện trạng này (TRACKING B7-L).
    const withoutFilterLines = logged.replaceAll(
      `GET ${PATH}/${PATIENT_ID} → 500`,
      '',
    );
    expect(logged.split(`GET ${PATH}/${PATIENT_ID} → 500`)).toHaveLength(3);
    expect(withoutFilterLines).not.toContain(PATIENT_ID);
  });

  it('PDE-10 (BM-02) lỗi hạ tầng giả lập ở câu hồ sơ rồi ở câu người thân ⇒ 500 LOI_HE_THONG có requestId, thân không có SQL, giá trị hay tên bảng, có no-store; id đúng dạng không bị đổi thành 404', async () => {
    const { token } = await receptionist();
    await seedMarkedPatient();
    vi.spyOn(
      h.app.get(PatientLookupRepository),
      'findDetail',
    ).mockRejectedValueOnce(failure());
    vi.spyOn(
      h.app.get(RelativesRepository),
      'findRelatives',
    ).mockRejectedValueOnce(failure());

    const detailFails = await get(PATIENT_ID, token);
    const relativesFail = await get(PATIENT_ID, token);

    for (const res of [detailFails, relativesFail]) {
      const body = expectErrorResponse(res, 500, INTERNAL);
      const text = JSON.stringify(body);
      for (const forbidden of [
        'SELECT',
        'tai_khoan',
        MARK,
        NAME_MARK,
        PHONE_MARK,
        ADDRESS_MARK,
        PATIENT_ID,
      ]) {
        expect(text).not.toContain(forbidden);
      }
      expect(res.headers['cache-control']).toBe('no-store');
    }
    // Sau lỗi giả lập (chỉ một lần), cùng id vẫn xem được: không có trạng thái nào bị hỏng
    expect((await get(PATIENT_ID, token)).status).toBe(200);
  });
});
