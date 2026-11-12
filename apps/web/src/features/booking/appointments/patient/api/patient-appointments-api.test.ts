import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../../shared/api/auth-hooks';
import {
  ApiError,
  UnexpectedResponseError,
} from '../../../../../shared/api/errors';
import { APPOINTMENT_STATES } from '../../common/appointment-status';
import {
  buildListQuery,
  getPatientAppointments,
  parsePatientAppointmentPage,
} from './patient-appointments-api';

// booking F1: bộ kiểm hình dạng và lời gọi `GET /patient/appointments`. Mã LHL là [đề xuất] (PLAN booking mục 7.31 sau khi duyệt); mỗi ca ghi mã.
// Một dòng mẫu đủ mười hai khoá của B1 (TRACKING 3.13.2) và sáu số đếm; dữ liệu giả.
const ITEM = {
  maLichHen: 'CP20261020001',
  trangThai: 'ChoThanhToan',
  thoiGian: '2026-10-20T01:00:00.000Z',
  bacSi: 'Nguyễn Minh Anh',
  chuyenKhoa: 'Tim mạch',
  chiNhanh: 'CLINIX Quận 1',
  dichVu: 'Khám tim mạch',
  nguoiKham: { hoTen: 'Nguyễn Văn A', laBanThan: true },
  giaSnapshot: '300000.00',
  tienCoc: '100000.00',
  hanThanhToan: '2026-10-20T01:15:00.000Z',
  choPhepHuy: true,
};
const COUNTS = {
  ChoThanhToan: 1,
  DaXacNhan: 2,
  DaTiepDon: 0,
  HoanThanh: 8,
  DaHuy: 0,
  VangMat: 0,
};
const PAGE = {
  items: [ITEM],
  total: 11,
  page: 1,
  pageSize: 20,
  demTheoTrangThai: COUNTS,
};

const unusable = (raw: unknown) =>
  expect(() => parsePatientAppointmentPage(raw)).toThrow(
    UnexpectedResponseError,
  );
const without = <T extends object>(value: T, key: keyof T) => {
  const copy = { ...value };
  delete copy[key];
  return copy;
};

describe('parsePatientAppointmentPage', () => {
  it('LHL-15 phản hồi đúng hình dạng ⇒ giữ nguyên mười hai khoá, bốn số và sáu số đếm', () => {
    expect(parsePatientAppointmentPage(PAGE)).toEqual(PAGE);
  });

  it('LHL-15 rỗng (`items: []`, `total: 0`) và `hanThanhToan: null` đều hợp lệ', () => {
    const empty = {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      demTheoTrangThai: Object.fromEntries(
        APPOINTMENT_STATES.map((state) => [state, 0]),
      ),
    };
    expect(parsePatientAppointmentPage(empty).items).toEqual([]);
    const withoutDeadline = parsePatientAppointmentPage({
      ...PAGE,
      items: [{ ...ITEM, hanThanhToan: null }],
    });
    expect(withoutDeadline.items[0].hanThanhToan).toBeNull();
  });

  // Trang vượt cuối: B1 trả 200 rỗng nhưng `total` vẫn đúng (LSH-18); bộ đọc không coi đó là lỗi
  it('LHL-15 trang vượt cuối (`items` rỗng mà `total` > 0) là hợp lệ để hook xử lý', () => {
    const page = parsePatientAppointmentPage({
      ...PAGE,
      items: [],
      total: 11,
      page: 5,
    });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(11);
    expect(page.page).toBe(5);
  });

  // LSH-14: khoá thừa (kể cả khoá nhạy cảm nếu backend lỡ trả) KHÔNG được chép ra kết quả
  it('LHL-14 khoá thừa ở thân, dòng, `nguoiKham` và số đếm (kể cả `DaDoiLich`) bị bỏ', () => {
    const noisy = {
      ...PAGE,
      traThua: 'x',
      items: [
        {
          ...ITEM,
          lichHenId: '99',
          benhNhanId: '7',
          emailBacSi: 'bacsi@example.invalid',
          nguoiKham: { ...ITEM.nguoiKham, soDienThoai: '0900000000' },
        },
      ],
      demTheoTrangThai: { ...COUNTS, DaDoiLich: 3 },
    };
    const parsed = parsePatientAppointmentPage(noisy);
    expect(Object.keys(parsed).sort()).toEqual([
      'demTheoTrangThai',
      'items',
      'page',
      'pageSize',
      'total',
    ]);
    expect(Object.keys(parsed.items[0]).sort()).toEqual(
      Object.keys(ITEM).sort(),
    );
    expect(Object.keys(parsed.items[0].nguoiKham).sort()).toEqual([
      'hoTen',
      'laBanThan',
    ]);
    expect(Object.keys(parsed.demTheoTrangThai)).toEqual([
      ...APPOINTMENT_STATES,
    ]);
    expect(JSON.stringify(parsed)).not.toMatch(
      /lichHenId|benhNhanId|bacsi@example|0900000000|DaDoiLich|traThua/,
    );
  });

  // Mã lạ (kể cả `DaDoiLich`) KHÔNG làm hỏng phản hồi: hiện "Chưa xác định" ở giao diện (LHL-02), và dòng vẫn tính vào `total`
  it('LHL-02 `trangThai` lạ (`DaDoiLich`, `X`) đi qua bộ đọc, không bị loại ngầm', () => {
    const parsed = parsePatientAppointmentPage({
      ...PAGE,
      items: [
        { ...ITEM, trangThai: 'DaDoiLich' },
        { ...ITEM, maLichHen: 'CP20261020002', trangThai: 'X' },
      ],
    });
    expect(parsed.items.map((item) => item.trangThai)).toEqual([
      'DaDoiLich',
      'X',
    ]);
  });

  it('LHL-15 thân không phải đối tượng ⇒ phản hồi không dùng được', () => {
    for (const raw of [null, undefined, [], 'x', 1, PAGE.items]) unusable(raw);
  });

  it('LHL-15 thiếu từng khoá của thân, hoặc kiểu sai ⇒ không dùng được', () => {
    for (const key of Object.keys(PAGE) as (keyof typeof PAGE)[]) {
      unusable(without(PAGE, key));
    }
    unusable({ ...PAGE, items: {} });
    unusable({ ...PAGE, total: '11' });
    unusable({ ...PAGE, total: -1 });
    unusable({ ...PAGE, total: 1.5 });
    unusable({ ...PAGE, page: 0 });
    unusable({ ...PAGE, pageSize: 0 });
    unusable({ ...PAGE, demTheoTrangThai: null });
  });

  it('LHL-15 thiếu từng khoá của dòng (mười hai ca) ⇒ không dùng được', () => {
    for (const key of Object.keys(ITEM) as (keyof typeof ITEM)[]) {
      unusable({ ...PAGE, items: [without(ITEM, key)] });
    }
  });

  it('LHL-15 kiểu sai ở dòng: số, thời gian, tiền, cờ, `nguoiKham`, dòng không phải đối tượng', () => {
    const rowWith = (patch: Record<string, unknown>) => ({
      ...PAGE,
      items: [{ ...ITEM, ...patch }],
    });
    unusable(rowWith({ maLichHen: '' }));
    unusable(rowWith({ maLichHen: 7 }));
    unusable(rowWith({ trangThai: 3 }));
    unusable(rowWith({ thoiGian: '20/10/2026 08:00' }));
    unusable(rowWith({ thoiGian: null }));
    unusable(rowWith({ bacSi: null }));
    unusable(rowWith({ giaSnapshot: 300000 }));
    unusable(rowWith({ giaSnapshot: '300.000đ' }));
    unusable(rowWith({ tienCoc: null }));
    unusable(rowWith({ hanThanhToan: 'sớm' }));
    unusable(rowWith({ hanThanhToan: undefined }));
    unusable(rowWith({ choPhepHuy: 'true' }));
    unusable(rowWith({ nguoiKham: null }));
    unusable(rowWith({ nguoiKham: { hoTen: 'A' } }));
    unusable(rowWith({ nguoiKham: { hoTen: 'A', laBanThan: 'yes' } }));
    unusable({ ...PAGE, items: [null] });
    unusable({ ...PAGE, items: ['CP20261020001'] });
  });

  it('LHL-15 thiếu hoặc sai một trong sáu số đếm ⇒ không dùng được', () => {
    for (const state of APPOINTMENT_STATES) {
      unusable({ ...PAGE, demTheoTrangThai: without(COUNTS, state) });
      unusable({ ...PAGE, demTheoTrangThai: { ...COUNTS, [state]: -1 } });
      unusable({ ...PAGE, demTheoTrangThai: { ...COUNTS, [state]: '1' } });
    }
  });
});

describe('buildListQuery', () => {
  it('LHL-03 không bộ lọc ⇒ chỉ có `page`; không bao giờ có `pageSize`, `nhom` hay khoá chủ sở hữu', () => {
    expect(buildListQuery({ page: 1 })).toEqual({ page: 1 });
    const everything = buildListQuery({
      page: 3,
      trangThai: 'DaXacNhan',
      hoSoNguoiThanId: '5',
      bacSiId: '6',
      chuyenKhoaId: '7',
      tuNgay: '2026-10-01',
      denNgay: '2026-10-31',
      q: 'nguyen',
    });
    expect(Object.keys(everything).sort()).toEqual([
      'bacSiId',
      'chuyenKhoaId',
      'denNgay',
      'hoSoNguoiThanId',
      'page',
      'q',
      'trangThai',
      'tuNgay',
    ]);
  });

  it('LHL-03 `trangThai` là MỘT giá trị (một thẻ lọc), không phải mảng hay chuỗi ngăn bằng phẩy', () => {
    expect(buildListQuery({ page: 1, trangThai: 'HoanThanh' }).trangThai).toBe(
      'HoanThanh',
    );
  });

  // `q=` rỗng bị B1 trả 400 `TU_KHOA_KHONG_HOP_LE`: bộ lọc rỗng hay chưa chọn thì không gửi
  it('LHL-06 bộ lọc rỗng hoặc chưa chọn KHÔNG được gửi (`q` rỗng sẽ bị B1 từ chối)', () => {
    expect(
      buildListQuery({
        page: 2,
        q: '',
        hoSoNguoiThanId: '',
        bacSiId: '',
        chuyenKhoaId: '',
        tuNgay: '',
        denNgay: '',
      }),
    ).toEqual({ page: 2 });
  });

  it('LHL-16 `hoSoNguoiThanId`: "BanThan" và id lớn hơn 2^53 giữ nguyên chuỗi (không qua Number)', () => {
    expect(
      buildListQuery({ page: 1, hoSoNguoiThanId: 'BanThan' }).hoSoNguoiThanId,
    ).toBe('BanThan');
    expect(
      buildListQuery({ page: 1, hoSoNguoiThanId: '9007199254740993' })
        .hoSoNguoiThanId,
    ).toBe('9007199254740993');
  });

  it('LHL-18 ngày giữ nguyên chuỗi YYYY-MM-DD (không qua Date, không đổi theo múi giờ)', () => {
    const query = buildListQuery({
      page: 1,
      tuNgay: '2026-10-01',
      denNgay: '2026-10-31',
    });
    expect(query.tuNgay).toBe('2026-10-01');
    expect(query.denNgay).toBe('2026-10-31');
  });
});

describe('getPatientAppointments', () => {
  function stubFetch(body: unknown, status = 200) {
    const spy = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', spy);
    return spy;
  }
  afterEach(() => {
    vi.unstubAllGlobals();
    setApiAuthHooks(null);
  });

  it('LHL-20 GET /api/patient/appointments, không thân, chỉ các khoá đã khai, GẮN access token', async () => {
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
    const spy = stubFetch(PAGE);
    const page = await getPatientAppointments({
      page: 2,
      trangThai: 'HoanThanh',
      q: 'minh anh',
    });

    expect(page).toEqual(PAGE);
    expect(spy).toHaveBeenCalledTimes(1);
    const [input, init] = spy.mock.calls[0];
    const url = new URL(String(input), 'http://localhost');
    expect(url.pathname).toBe('/api/patient/appointments');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '2',
      trangThai: 'HoanThanh',
      q: 'minh anh',
    });
    expect(init?.method ?? 'GET').toBe('GET');
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer token-gia',
    );
  });

  it('LHL-15 thân 200 sai hình dạng (HTML, thiếu số đếm) ⇒ UnexpectedResponseError, không trả dữ liệu', async () => {
    stubFetch({ ...PAGE, demTheoTrangThai: undefined });
    await expect(getPatientAppointments({ page: 1 })).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>502</html>', { status: 200 })),
    );
    await expect(getPatientAppointments({ page: 1 })).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });

  // Chọn câu theo `maLoi` là việc của hook (giai đoạn trang); ở đây chỉ khẳng định `maLoi` và `loi[].ma` đi nguyên xuống nơi gọi
  it('LHL-07 LHL-08 lỗi JSON chuẩn đi nguyên xuống nơi gọi: `maLoi` và `loi[].ma`, không bị nuốt hay đổi', async () => {
    stubFetch(
      {
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        thongBao: 'x',
        loi: [{ truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' }],
      },
      400,
    );
    const error = await getPatientAppointments({ page: 1, q: 'a' }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    expect((error as ApiError).loi).toEqual([
      { truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' },
    ]);
  });
});
