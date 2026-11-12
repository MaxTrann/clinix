import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { toErrorResponse } from '../../common/errors/all-exceptions.filter.js';
import { AppException } from '../../common/errors/app.exception.js';
import {
  AppointmentListFixtures,
  DOCTOR_PHONE,
} from '../testing/appointment-list-fixtures.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import {
  DAUGHTER_FIELDS,
  DOCTOR_CODES,
  DOCTOR_DETAIL_KEYS,
  DOCTOR_EXAMINEE_KEYS,
  DOCTOR_ITEM_KEYS,
  DOCTOR_ROOT_KEYS,
  DoctorListFixtures,
  MOTHER_FIELDS,
  MOTHER_NAME,
  MOTHER_PHONE,
  ONE_ACCOUNT_FIELDS,
  ZERO_STATUS_COUNTS,
  type RelativeFields,
} from '../testing/doctor-list-fixtures.js';
import {
  CODES,
  INACTIVE_RELATIVE_NAME,
  OperationsListFixtures,
  PATIENT_ONE,
  PATIENT_TWO,
  RELATIVE_NAME,
} from '../testing/operations-list-fixtures.js';
import {
  collectKeys,
  collectStrings,
  DOCTOR_FORBIDDEN_KEY,
} from '../testing/response-keys.js';
import type {
  DoctorAppointmentsPage,
  DoctorAppointmentsQuery,
  DoctorStatusCounts,
} from './doctor-appointments.dto.js';
import { DoctorAppointmentsRepository } from './doctor-appointments.repository.js';
import { DoctorAppointmentsService } from './doctor-appointments.service.js';

// Task B5 — danh sách và chi tiết lịch hẹn của BÁC SĨ ở tầng dịch vụ và kho trên MySQL 8.4 THẬT (PLAN booking 7.8; TRACKING 3.20.3): phạm vi `bac_si_id` trong SQL (DSB-01, DSB-07, QB-06), `DaDoiLich` ẩn ở
// CẢ BA nơi (DSB-10), người khám lấy từ tài khoản hoặc hồ sơ người thân (DSB-12), `ca` là ca làm việc (DSB-03), khoảng ngày nửa mở (DSB-02), sắp xếp (DSB-04), số đếm (DSB-11), ô tìm `q` (DSB-13), hình dạng
// (DSB-06, DSB-08). HTTP thật: test/booking-doctor-appointments.e2e-spec.ts; SQL sinh ra (không DB): doctor-appointments.repository.spec.ts. DSB-10 đến DSB-14 là [đề xuất]. Dữ liệu giả (email đuôi example.com,
// SĐT minh hoạ). Đồng hồ ứng dụng giả = T0 (02/11/2026 08:00 giờ VN); danh sách không dùng giờ hiện tại.
let db: DataSource;
let lf: AppointmentListFixtures;
let ofx: OperationsListFixtures;
let dfx: DoctorListFixtures;
let service: DoctorAppointmentsService;

useIntegrationHooks((testDb) => {
  db = testDb;
  const fx = new BookingFixtures(testDb);
  lf = new AppointmentListFixtures(fx, testDb);
  ofx = new OperationsListFixtures(fx, lf, testDb);
  dfx = new DoctorListFixtures(fx, ofx, testDb);
  service = new DoctorAppointmentsService(
    testDb,
    new DoctorAppointmentsRepository(),
  );
});

interface Doctor {
  account: { taiKhoanId: string };
}
const C = { ...CODES, ...DOCTOR_CODES };
const idOf = (doctor: Doctor) => doctor.account.taiKhoanId;
// Đầu vào giống DTO đã kiểm: offset = (page - 1) * pageSize
const ask = (
  query: Partial<DoctorAppointmentsQuery> = {},
): DoctorAppointmentsQuery => {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  return { ...query, page, pageSize, offset: (page - 1) * pageSize };
};
const list = (doctor: Doctor, query: Partial<DoctorAppointmentsQuery> = {}) =>
  service.list(idOf(doctor), ask(query));
const detail = (doctor: Doctor, code: string) =>
  service.detail(idOf(doctor), code);
const codesOf = (page: DoctorAppointmentsPage) =>
  page.items.map((item) => item.maLichHen);
const counts = (partial: Partial<DoctorStatusCounts>): DoctorStatusCounts => ({
  ...ZERO_STATUS_COUNTS,
  ...partial,
});
const sum = (page: DoctorAppointmentsPage) =>
  Object.values(page.demTheoTrangThai).reduce((total, n) => total + n, 0);

/** Thân lỗi (JSON) của một chi tiết PHẢI là 404; trả chuỗi để so "giống từng ký tự" giữa các nhánh. */
async function notFoundBody(doctorId: string, code: string): Promise<string> {
  const error = await service
    .detail(doctorId, code)
    .catch((reason: unknown) => reason);
  expect(error, code).toBeInstanceOf(AppException);
  expect((error as AppException).getStatus(), code).toBe(404);
  return JSON.stringify(toErrorResponse(error as AppException).body);
}

// Thứ tự giờ của bác sĩ A1 (`DoctorListFixtures.world`): a1 10/11 08:00, a2 10/11 08:30, a6 14/11, c1 16/11 13:00, c2 16/11 13:30 (a5 DaDoiLich 13/11 bị ẩn)
const NEWEST_A1 = [C.c2, C.c1, C.a6, C.a2, C.a1];
const OLDEST_A1 = [...NEWEST_A1].reverse();
const COUNTS_A1 = counts({
  ChoThanhToan: 1,
  DaXacNhan: 2,
  DaTiepDon: 1,
  VangMat: 1,
});

describe('DSB-01, QB-06 phạm vi: mỗi bác sĩ chỉ thấy lịch của mình', () => {
  it('DSB-01 A1, A2 (cùng chi nhánh), B (chi nhánh khác): đúng lịch của từng người, mới nhất trước, `total` đúng; `bacSiId` lạ hoặc không tồn tại không đổi kết quả', async () => {
    const w = await dfx.world();
    const a1 = await list(w.doctorA1);
    expect(codesOf(a1)).toStrictEqual(NEWEST_A1);
    expect(a1.total).toBe(5);
    expect(codesOf(await list(w.doctorA2))).toStrictEqual([C.a7, C.a4, C.a3]);
    expect(codesOf(await list(w.doctorB))).toStrictEqual([C.b1]);
    // Service không nhận `bacSiId` (DTO đã bỏ): có lọt vào cũng không tới được SQL
    for (const bacSiId of [idOf(w.doctorA2), '999999999'])
      expect(
        await service.list(idOf(w.doctorA1), {
          ...ask(),
          ...({ bacSiId } as object),
        }),
      ).toStrictEqual(a1);
  });

  it('DSB-07, QB-06 chi tiết: lịch của bác sĩ KHÁC (cùng và khác chi nhánh, cả hai chiều) và mã không tồn tại ra cùng MỘT 404 KHONG_TIM_THAY, thân giống từng ký tự; lịch của chính mình vẫn đọc được', async () => {
    const w = await dfx.world();
    const missing = await notFoundBody(idOf(w.doctorA1), C.missing);
    expect(missing).toContain('KHONG_TIM_THAY');
    for (const [doctor, code] of [
      [w.doctorA1, C.a3],
      [w.doctorA1, C.b1],
      [w.doctorA2, C.a1],
      [w.doctorB, C.a1],
    ] as const)
      expect(await notFoundBody(idOf(doctor), code), code).toBe(missing);
    expect((await detail(w.doctorA1, C.a1)).maLichHen).toBe(C.a1);
    expect((await detail(w.doctorA2, C.a3)).maLichHen).toBe(C.a3);
    expect((await detail(w.doctorB, C.b1)).maLichHen).toBe(C.b1);
  });
});

describe('DSB-10 DaDoiLich ẩn ở CẢ BA nơi', () => {
  it('DSB-10 danh sách (kể cả không lọc), số đếm và chi tiết: lịch DaDoiLich có trong DB nhưng không ra ở đâu; chi tiết 404 y hệt mã không tồn tại', async () => {
    const w = await dfx.world();
    const stored = await db.query<{ total: string }[]>(
      'SELECT COUNT(*) AS total FROM lich_hen WHERE bac_si_id = ?',
      [idOf(w.doctorA1)],
    );
    // Chứng minh a5 CÓ trong DB (6 hàng, hiện 5): không phải "đạt" vì thiếu dữ liệu
    expect(Number(stored[0]?.total)).toBe(6);
    const page = await list(w.doctorA1);
    expect(codesOf(page)).not.toContain(C.a5);
    expect(page.total).toBe(5);
    expect(page.demTheoTrangThai).toStrictEqual(COUNTS_A1);
    expect(Object.keys(page.demTheoTrangThai)).not.toContain('DaDoiLich');
    expect(sum(page)).toBe(5);
    expect(await notFoundBody(idOf(w.doctorA1), C.a5)).toBe(
      await notFoundBody(idOf(w.doctorA1), C.missing),
    );
    // Phòng thủ nhiều lớp: dù DTO bị bỏ qua, `trangThai` = DaDoiLich cũng không ra dòng nào
    const forced = await service.list(idOf(w.doctorA1), {
      ...ask(),
      ...({ trangThai: ['DaDoiLich'] } as object),
    });
    expect(forced).toMatchObject({ items: [], total: 0 });
    expect(forced.demTheoTrangThai).toStrictEqual(COUNTS_A1);
  });
});

describe('DSB-12 người khám', () => {
  const relativeView = (
    hoTen: string,
    { moiQuanHe, ...fields }: RelativeFields,
  ) => ({ hoTen, quanHe: moiQuanHe, ...fields });

  it('DSB-12 năm lịch ở cả danh sách lẫn chi tiết: khám cho chính mình ⇒ trường của TÀI KHOẢN (kể cả ngày sinh, giới tính để trống ⇒ null), khám cho người thân ⇒ trường của HỒ SƠ (người thân không SĐT ⇒ null, KHÔNG SĐT người đặt); không có tên và SĐT người đặt', async () => {
    const w = await dfx.world();
    const oneSelf = {
      hoTen: PATIENT_ONE.hoTen,
      quanHe: 'BanThan',
      ...ONE_ACCOUNT_FIELDS,
      soDienThoai: PATIENT_ONE.soDienThoai,
    };
    const expected: [string, unknown][] = [
      [C.a1, oneSelf],
      [C.a2, relativeView(RELATIVE_NAME, DAUGHTER_FIELDS)],
      [
        C.a6,
        {
          hoTen: PATIENT_TWO.hoTen,
          quanHe: 'BanThan',
          gioiTinh: null,
          ngaySinh: null,
          soDienThoai: PATIENT_TWO.soDienThoai,
        },
      ],
      [C.c1, relativeView(MOTHER_NAME, MOTHER_FIELDS)],
      [C.c2, oneSelf],
    ];
    const page = await list(w.doctorA1, { pageSize: 100 });
    for (const [code, nguoiKham] of expected) {
      const item = page.items.find((row) => row.maLichHen === code);
      expect(item?.nguoiKham, code).toStrictEqual(nguoiKham);
      expect((await detail(w.doctorA1, code)).nguoiKham, code).toStrictEqual(
        nguoiKham,
      );
    }
    // a2: Bệnh nhân một đặt cho con gái (không SĐT); c1: Bệnh nhân hai đặt cho mẹ (có SĐT riêng)
    for (const [code, booker] of [
      [C.a2, PATIENT_ONE],
      [C.c1, PATIENT_TWO],
    ] as const) {
      const text = JSON.stringify(await detail(w.doctorA1, code));
      expect(text, code).not.toContain(booker.soDienThoai);
      expect(text, code).not.toContain(booker.hoTen);
    }
  });

  it('DSB-12 người thân đã ngừng hiệu lực: lịch cũ vẫn hiện tên và quan hệ của họ (lịch sử không mất)', async () => {
    const w = await dfx.world();
    const old = (await list(w.doctorA2)).items.find(
      (item) => item.maLichHen === C.a7,
    );
    expect(old?.nguoiKham.hoTen).toBe(INACTIVE_RELATIVE_NAME);
    expect(old?.nguoiKham.quanHe).not.toBe('BanThan');
  });
});

describe('DSB-06, DSB-08 hình dạng', () => {
  it('DSB-06 dòng: đúng tám khoá và năm khoá `nguoiKham`; `ca`, `thoiGian`, `lyDoKham`, `dichVu`, `chuyenKhoa` đúng giá trị (tên lấy từ DB)', async () => {
    const w = await dfx.world();
    const page = await list(w.doctorA1);
    expect(Object.keys(page).sort()).toStrictEqual(DOCTOR_ROOT_KEYS);
    for (const item of page.items) {
      expect(Object.keys(item).sort()).toStrictEqual(DOCTOR_ITEM_KEYS);
      expect(Object.keys(item.nguoiKham).sort()).toStrictEqual(
        DOCTOR_EXAMINEE_KEYS,
      );
    }
    const names = await db.query<{ dichVu: string; chuyenKhoa: string }[]>(
      `SELECT dv.ten AS dichVu, ck.ten AS chuyenKhoa FROM bac_si bs
         INNER JOIN dich_vu_kham dv ON dv.dich_vu_kham_id = bs.dich_vu_kham_id
         INNER JOIN chuyen_khoa ck ON ck.chuyen_khoa_id = bs.chuyen_khoa_id
        WHERE bs.tai_khoan_id = ?`,
      [idOf(w.doctorA1)],
    );
    const byCode = new Map(page.items.map((item) => [item.maLichHen, item]));
    expect(byCode.get(C.a1)).toMatchObject({
      ...names[0],
      ca: 'CaSang',
      trangThai: 'DaXacNhan',
      thoiGian: w.apps.a1.thoiGian.toISOString(),
      lyDoKham: 'Đau đầu ba ngày',
    });
    expect(byCode.get(C.a2)?.lyDoKham).toBeNull();
    expect(byCode.get(C.c1)).toMatchObject({
      ca: 'CaChieu',
      trangThai: 'DaXacNhan',
      lyDoKham: 'Ho kéo dài hai tuần',
    });
  });

  it('DSB-06, DSB-08 chi tiết: đúng mười một khoá; `chiNhanh` là tên chi nhánh; `ngayDat` là ISO UTC của `thoi_diem_tao` (09:15:30 giờ VN ⇒ 02:15:30Z); `ghiChuKham` null ở MỌI trạng thái kể cả HoanThanh', async () => {
    const w = await dfx.world();
    await dfx.setCreatedAt(w.apps.a1.lichHenId, '2026-11-02 09:15:30');
    const own = await detail(w.doctorA1, C.a1);
    expect(Object.keys(own).sort()).toStrictEqual(DOCTOR_DETAIL_KEYS);
    expect(own).toMatchObject({
      maLichHen: C.a1,
      chiNhanh: w.branchA.ten,
      ngayDat: '2026-11-02T02:15:30.000Z',
      ghiChuKham: null,
    });
    expect(own.thoiGian).toBe(w.apps.a1.thoiGian.toISOString());
    // A2: a3 HoanThanh, a4 DaHuy
    for (const code of [C.a3, C.a4]) {
      const other = await detail(w.doctorA2, code);
      expect(Object.keys(other).sort(), code).toStrictEqual(DOCTOR_DETAIL_KEYS);
      expect(other.ghiChuKham, code).toBeNull();
    }
  });

  it('DSB-06 lịch DaHuy có `ly_do_huy` ở DB: chi tiết KHÔNG có khoá `lyDoHuy` và không chữ nào của lý do (Figma 692:2 không hiện lý do huỷ)', async () => {
    const w = await dfx.world();
    const stored = await db.query<{ lyDo: string | null }[]>(
      'SELECT ly_do_huy AS lyDo FROM lich_hen WHERE ma_lich_hen = ?',
      [C.a4],
    );
    const reason = stored[0]?.lyDo ?? '';
    expect(reason).not.toBe('');
    const cancelled = await detail(w.doctorA2, C.a4);
    expect(cancelled.trangThai).toBe('DaHuy');
    expect(cancelled).not.toHaveProperty('lyDoHuy');
    expect(JSON.stringify(cancelled)).not.toContain(reason);
  });

  it('DSB-06 quét JSON danh sách và chi tiết của hai bác sĩ: không khoá khớp regex cấm riêng cho Bác sĩ; không giá trị nào là email, giá, SĐT hay tên chính bác sĩ, hoặc băm mật khẩu', async () => {
    const w = await dfx.world();
    const doctors = [w.doctorA1, w.doctorA2];
    const emails = await db.query<{ email: string }[]>(
      'SELECT email FROM tai_khoan WHERE tai_khoan_id IN (?, ?)',
      doctors.map(idOf),
    );
    for (const doctor of doctors) {
      const page = await list(doctor);
      const details = await Promise.all(
        codesOf(page).map((code) => detail(doctor, code)),
      );
      for (const json of [page, ...details]) {
        expect(
          collectKeys(json).filter((key) => DOCTOR_FORBIDDEN_KEY.test(key)),
        ).toStrictEqual([]);
        const strings = collectStrings(json);
        for (const banned of [
          DOCTOR_PHONE,
          '100000.00',
          'Bác Sĩ',
          'argon2',
          ...emails.map((row) => row.email),
        ])
          expect(
            strings.filter((value) => value.includes(banned)),
            banned,
          ).toStrictEqual([]);
      }
    }
  });
});

describe('DSB-03, DSB-02, DSB-11 bộ lọc và số đếm theo trạng thái', () => {
  it('DSB-11 số đếm: đủ SÁU khoá (0 cho trạng thái không có), tổng bằng `total`; `trangThai[]` thu hẹp danh sách và `total` nhưng KHÔNG đổi số đếm', async () => {
    const w = await dfx.world();
    const all = await list(w.doctorA1);
    expect(all.demTheoTrangThai).toStrictEqual(COUNTS_A1);
    expect(sum(all)).toBe(all.total);
    const narrowed = await list(w.doctorA1, {
      trangThai: ['DaXacNhan', 'VangMat'],
    });
    expect(codesOf(narrowed)).toStrictEqual([C.c1, C.a6, C.a1]);
    expect(narrowed.total).toBe(3);
    expect(narrowed.demTheoTrangThai).toStrictEqual(COUNTS_A1);
    const none = await list(w.doctorA1, { trangThai: ['HoanThanh'] });
    expect(none).toMatchObject({ items: [], total: 0 });
    expect(none.demTheoTrangThai).toStrictEqual(COUNTS_A1);
  });

  it('DSB-03 `ca` là CA LÀM VIỆC của khung giờ: CaSang, CaChieu lọc đúng và số đếm theo `ca`; CaToi hợp lệ nhưng rỗng; `ca` KHÔNG suy từ giờ (a1 sửa thành 15:00 vẫn là CaSang)', async () => {
    const w = await dfx.world();
    expect(codesOf(await list(w.doctorA1, { ca: 'CaSang' }))).toStrictEqual([
      C.a6,
      C.a2,
      C.a1,
    ]);
    const afternoon = await list(w.doctorA1, { ca: 'CaChieu' });
    expect(codesOf(afternoon)).toStrictEqual([C.c2, C.c1]);
    expect(afternoon.items.map((item) => item.ca)).toStrictEqual([
      'CaChieu',
      'CaChieu',
    ]);
    expect(afternoon.demTheoTrangThai).toStrictEqual(
      counts({ DaXacNhan: 1, DaTiepDon: 1 }),
    );
    expect(await list(w.doctorA1, { ca: 'CaToi' })).toMatchObject({
      items: [],
      total: 0,
      demTheoTrangThai: ZERO_STATUS_COUNTS,
    });
    await lf.setTime(w.apps.a1.lichHenId, '2026-11-10 15:00:00');
    const morning = await list(w.doctorA1, { ca: 'CaSang' });
    expect(codesOf(morning)).toStrictEqual([C.a6, C.a1, C.a2]);
    expect(morning.items.find((item) => item.maLichHen === C.a1)?.ca).toBe(
      'CaSang',
    );
    expect(codesOf(await list(w.doctorA1, { ca: 'CaChieu' }))).toStrictEqual([
      C.c2,
      C.c1,
    ]);
  });

  it('DSB-02 khoảng ngày giờ VN nửa mở: 00:00:00 của `tuNgay` và 23:59:59 của `denNgay` ở TRONG, 00:00:00 của ngày kế và 23:59:59 của ngày trước ở NGOÀI; `9999-12-31` bỏ cận trên; số đếm theo khoảng ngày', async () => {
    const w = await dfx.world();
    const { a1, a2, a6, c2 } = w.apps;
    await lf.setTime(a1.lichHenId, '2026-11-10 00:00:00');
    await lf.setTime(a2.lichHenId, '2026-11-10 23:59:59');
    await lf.setTime(c2.lichHenId, '2026-11-09 23:59:59');
    await lf.setTime(a6.lichHenId, '2026-11-11 00:00:00');
    const codes = async (query: Partial<DoctorAppointmentsQuery>) =>
      codesOf(await list(w.doctorA1, query));
    expect(
      await codes({ tuNgay: '2026-11-10', denNgay: '2026-11-10' }),
    ).toStrictEqual([C.a2, C.a1]);
    expect(
      await codes({ tuNgay: '2026-11-11', denNgay: '2026-11-11' }),
    ).toStrictEqual([C.a6]);
    expect(await codes({ denNgay: '2026-11-09' })).toStrictEqual([C.c2]);
    for (const denNgay of ['2026-11-16', '9999-12-31'])
      expect(await codes({ tuNgay: '2026-11-10', denNgay })).toStrictEqual([
        C.c1,
        C.a6,
        C.a2,
        C.a1,
      ]);
    expect((await list(w.doctorA1, { denNgay: '9999-12-31' })).total).toBe(5);
    const oneDay = await list(w.doctorA1, {
      tuNgay: '2026-11-10',
      denNgay: '2026-11-10',
    });
    expect(oneDay.demTheoTrangThai).toStrictEqual(
      counts({ ChoThanhToan: 1, DaXacNhan: 1 }),
    );
  });

  it('DSB-03, DSB-11 tổ hợp `trangThai[]`, `ca`, `q`, ngày (AND): danh sách theo cả bốn, số đếm theo mọi bộ lọc TRỪ `trangThai[]`', async () => {
    const w = await dfx.world();
    const base = {
      ca: 'CaChieu',
      q: 'nguyen',
      tuNgay: '2026-11-16',
      denNgay: '2026-11-16',
    } as const;
    const hit = await list(w.doctorA1, {
      ...base,
      trangThai: ['DaXacNhan', 'DaTiepDon'],
    });
    expect(codesOf(hit)).toStrictEqual([C.c2]);
    expect(hit.total).toBe(1);
    expect(hit.demTheoTrangThai).toStrictEqual(counts({ DaTiepDon: 1 }));
    const miss = await list(w.doctorA1, { ...base, trangThai: ['DaXacNhan'] });
    expect(miss).toMatchObject({ items: [], total: 0 });
    expect(miss.demTheoTrangThai).toStrictEqual(counts({ DaTiepDon: 1 }));
  });
});

describe('DSB-04, DSB-05 sắp xếp, phân trang, không có lịch', () => {
  it('DSB-04 mặc định = MoiNhat (giờ giảm dần); CuNhat đảo hẳn; cùng giờ thì `lich_hen_id` CÙNG chiều (a1 và a2 cùng 08:00)', async () => {
    const w = await dfx.world();
    await lf.setTime(w.apps.a2.lichHenId, '2026-11-10 08:00:00');
    expect(codesOf(await list(w.doctorA1))).toStrictEqual(NEWEST_A1);
    expect(
      codesOf(await list(w.doctorA1, { sapXep: 'MoiNhat' })),
    ).toStrictEqual(NEWEST_A1);
    expect(codesOf(await list(w.doctorA1, { sapXep: 'CuNhat' }))).toStrictEqual(
      OLDEST_A1,
    );
  });

  it('DSB-04, DSB-05 phân trang: hai trang liền nhau không trùng không sót; trang vượt cuối và `page` cực lớn ⇒ rỗng, `total` đúng, số đếm vẫn đủ', async () => {
    const w = await dfx.world();
    const results: DoctorAppointmentsPage[] = [];
    for (const page of [1, 2, 3, 4])
      results.push(await list(w.doctorA1, { page, pageSize: 2 }));
    expect(results.map(codesOf)).toStrictEqual([
      [C.c2, C.c1],
      [C.a6, C.a2],
      [C.a1],
      [],
    ]);
    for (const page of results) {
      expect(page.total).toBe(5);
      expect(page.demTheoTrangThai).toStrictEqual(COUNTS_A1);
    }
    // `page` 10^18 × `pageSize` 100 > 2^64 (OFFSET tối đa của MySQL): service mà gửi OFFSET này thì MySQL báo 1064. `Number.MAX_SAFE_INTEGER` (9×10^15) × 100 vẫn < 2^64 nên MySQL nhận và KHÔNG bắt được lỗi.
    const huge = await list(w.doctorA1, {
      page: 1_000_000_000_000_000_000,
      pageSize: 100,
    });
    expect(huge).toMatchObject({ items: [], total: 5 });
    expect(huge.demTheoTrangThai).toStrictEqual(COUNTS_A1);
  });

  it('DSB-05 bác sĩ chưa có lịch nào, và tài khoản BacSi KHÔNG có hàng `bac_si`: 200 rỗng, `total` 0, đủ sáu khoá số đếm bằng 0; chi tiết của người khác ⇒ 404', async () => {
    const w = await dfx.world();
    const empty = await ofx.branchWith('Bác Sĩ Trống');
    const orphan = await dfx.doctorAccountOnly();
    const expected = {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      demTheoTrangThai: ZERO_STATUS_COUNTS,
    };
    expect(await list(empty.doctor)).toStrictEqual(expected);
    expect(await service.list(orphan.taiKhoanId, ask())).toStrictEqual(
      expected,
    );
    expect(await notFoundBody(orphan.taiKhoanId, C.a1)).toContain(
      'KHONG_TIM_THAY',
    );
    expect(await notFoundBody(idOf(empty.doctor), C.a1)).toBe(
      await notFoundBody(idOf(w.doctorB), C.a1),
    );
  });
});

describe('DSB-13 ô tìm `q`', () => {
  it('DSB-13 tên NGƯỜI KHÁM: không phân biệt hoa thường và dấu, `đ` khớp `d` ở cả hai chiều; khám hộ người thân khớp tên NGƯỜI THÂN và KHÔNG khớp tên người đặt', async () => {
    const w = await dfx.world();
    const find = async (q: string) => codesOf(await list(w.doctorA1, { q }));
    // c1 do Đặng Văn Cường đặt cho mẹ; a2 do Nguyễn Văn An đặt cho con gái: tên người đặt không khớp
    expect(await find('dang')).toStrictEqual([C.a6]);
    expect(await find('ĐẶNG VĂN')).toStrictEqual([C.a6]);
    expect(await find('đào')).toStrictEqual([C.c1]);
    expect(await find('DAO')).toStrictEqual([C.c1]);
    expect(await find('tran thi')).toStrictEqual([C.a2]);
    expect(await find('nguyen van')).toStrictEqual([C.c2, C.a1]);
  });

  it('DSB-13 SĐT của NGƯỜI KHÁM (bỏ dấu cách và dấu chấm): bản thân ⇒ SĐT tài khoản, người thân ⇒ SĐT hồ sơ; người thân KHÔNG SĐT không khớp bằng SĐT người đặt; SĐT bác sĩ không khớp', async () => {
    const w = await dfx.world();
    const find = async (q: string) => codesOf(await list(w.doctorA1, { q }));
    // a2: người thân không có SĐT, người đặt có 0911111111 ⇒ KHÔNG nằm trong kết quả
    for (const q of ['0911111111', '0911 111 111', '0911.111.111'])
      expect(await find(q), q).toStrictEqual([C.c2, C.a1]);
    // c1: người đặt có 0922222222, mẹ có SĐT riêng 0933333333
    expect(await find(PATIENT_TWO.soDienThoai)).toStrictEqual([C.a6]);
    expect(await find(MOTHER_PHONE)).toStrictEqual([C.c1]);
    expect(await find(DOCTOR_PHONE)).toStrictEqual([]);
  });

  it('DSB-13 gõ họ tên của CHÍNH bác sĩ không khớp mọi dòng (mọi lịch đều mang tên đó); mã lịch (chữ thường, một phần) khớp, mã của bác sĩ khác không khớp; `%` và `_` là ký tự thường', async () => {
    const w = await dfx.world();
    // Mẫu số: cả sáu hàng của A1 (kể cả DaDoiLich) đều có tên bác sĩ chứa "Bác Sĩ": nếu `q` khớp tên bác sĩ thì mọi dòng đều ra
    const named = await db.query<{ total: string }[]>(
      `SELECT COUNT(*) AS total FROM lich_hen lh INNER JOIN tai_khoan t ON t.tai_khoan_id = lh.bac_si_id
        WHERE lh.bac_si_id = ? AND t.ho_ten LIKE '%Bác Sĩ%'`,
      [idOf(w.doctorA1)],
    );
    expect(Number(named[0]?.total)).toBe(6);
    for (const q of ['Bác Sĩ Một', 'bac si', 'MỘT']) {
      const page = await list(w.doctorA1, { q });
      expect(page, q).toMatchObject({ items: [], total: 0 });
      expect(page.demTheoTrangThai, q).toStrictEqual(ZERO_STATUS_COUNTS);
    }
    const find = async (q: string) => codesOf(await list(w.doctorA1, { q }));
    expect(await find(C.c1.toLowerCase())).toStrictEqual([C.c1]);
    expect(await find('ccc')).toStrictEqual([C.c2, C.c1]);
    expect(await find(C.a3)).toStrictEqual([]);
    expect(await find('%%')).toStrictEqual([]);
    expect(await find('__')).toStrictEqual([]);
  });
});
