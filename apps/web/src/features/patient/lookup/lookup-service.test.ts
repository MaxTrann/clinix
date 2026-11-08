import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  getPatientDetail,
  parsePatientDetail,
  parsePatientSearchPage,
  searchPatients,
} from './lookup-service';

// patient F8 (TRACKING F8-D, F8-I): kiểm hình dạng hai phản hồi và hai lời gọi. Mã ca LV-nn là [đề xuất]; mỗi ca ghi mã Q18 của PLAN
// mục 4.2 (trường trả về), Q16 (phạm vi) và H4 (lộ dữ liệu cá nhân). JSON mẫu lấy từ TRACKING mục 5 (phản hồi thật của API).
const SUMMARY = {
  taiKhoanId: '3',
  hoTen: 'Đặng Văn Hùng',
  soDienThoai: '0901234567',
  email: 'hung@example.invalid',
  trangThai: 'DangHoatDong',
};
const PAGE = { items: [SUMMARY], total: 1, page: 1, pageSize: 20 };

const RELATIVE = {
  hoTen: 'Nguyễn Thị Con',
  moiQuanHe: 'Con',
  gioiTinh: 'Nu',
  ngaySinh: '2018-03-04',
  soDienThoai: '0911222333',
  trangThaiHieuLuc: true,
};
const DETAIL = {
  hoTen: 'Đặng Văn Hùng',
  email: 'hung@example.invalid',
  soDienThoai: '0901234567',
  gioiTinh: 'Nam',
  ngaySinh: '1985-02-20',
  diaChi: '12 Đường Giả, Quận Giả',
  thoiDiemTao: '2026-11-07T17:30:00.000Z',
  trangThai: 'DangHoatDong',
  soLanVangMat: 2,
  nguoiThan: [RELATIVE],
};

const rejects = (parse: (raw: unknown) => unknown, raw: unknown) =>
  expect(() => parse(raw)).toThrow(UnexpectedResponseError);

describe('parsePatientSearchPage', () => {
  it('LV-11 Q18 phản hồi đúng hình dạng ⇒ giữ nguyên năm khoá và ba số', () => {
    expect(parsePatientSearchPage(PAGE)).toEqual(PAGE);
  });

  it('LV-12 Q18 rỗng (`items: []`, `total: 0`) là hợp lệ', () => {
    expect(
      parsePatientSearchPage({ items: [], total: 0, page: 1, pageSize: 20 }),
    ).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('LV-13 Q18 id lớn hơn 2^53 giữ NGUYÊN chuỗi (không qua Number)', () => {
    const big = '9007199254740993';
    const parsed = parsePatientSearchPage({
      ...PAGE,
      items: [{ ...SUMMARY, taiKhoanId: big }],
    });
    expect(parsed.items[0].taiKhoanId).toBe(big);
    expect(String(Number(big))).not.toBe(big);
  });

  it('LV-14 Q18 mã `trangThai` lạ không làm vỡ: vẫn là chuỗi', () => {
    const parsed = parsePatientSearchPage({
      ...PAGE,
      items: [{ ...SUMMARY, trangThai: 'MaLa' }],
    });
    expect(parsed.items[0].trangThai).toBe('MaLa');
  });

  it('LV-15 H4 khoá thừa (ví dụ mã nội bộ hay mật khẩu băm nếu API lỡ trả) bị bỏ', () => {
    const parsed = parsePatientSearchPage({
      ...PAGE,
      items: [{ ...SUMMARY, matKhauBam: 'x', maNoiBo: 'u1' }],
    });
    expect(Object.keys(parsed.items[0]).sort()).toEqual(
      ['email', 'hoTen', 'soDienThoai', 'taiKhoanId', 'trangThai'].sort(),
    );
  });

  it.each([
    ['không phải đối tượng', null],
    ['thiếu items', { total: 1, page: 1, pageSize: 20 }],
    ['items không phải mảng', { ...PAGE, items: {} }],
    ['total là chuỗi', { ...PAGE, total: '1' }],
    ['total âm', { ...PAGE, total: -1 }],
    ['total không nguyên', { ...PAGE, total: 1.5 }],
    ['page bằng 0', { ...PAGE, page: 0 }],
    [
      'pageSize bằng 0 (chia cho 0 khi tính số trang)',
      { ...PAGE, pageSize: 0 },
    ],
    [
      'phần tử thiếu email',
      { ...PAGE, items: [{ ...SUMMARY, email: undefined }] },
    ],
    [
      'phần tử có SĐT là số',
      { ...PAGE, items: [{ ...SUMMARY, soDienThoai: 1 }] },
    ],
    ['phần tử là null', { ...PAGE, items: [null] }],
    ['phần tử là mảng', { ...PAGE, items: [[]] }],
    [
      'id không phải chuỗi số',
      { ...PAGE, items: [{ ...SUMMARY, taiKhoanId: '3a' }] },
    ],
    [
      'id là số (không phải chuỗi)',
      { ...PAGE, items: [{ ...SUMMARY, taiKhoanId: 3 }] },
    ],
  ])('LV-16 Q18 sai hình dạng ⇒ UnexpectedResponseError: %s', (_name, raw) => {
    rejects(parsePatientSearchPage, raw);
  });
});

describe('parsePatientDetail', () => {
  it('LV-17 Q18 đủ mười khoá và sáu khoá người thân ⇒ giữ nguyên', () => {
    expect(parsePatientDetail(DETAIL)).toEqual(DETAIL);
  });

  it('LV-18 Q18 `gioiTinh`, `ngaySinh`, `diaChi` là null; SĐT người thân null; `nguoiThan` rỗng ⇒ hợp lệ', () => {
    const parsed = parsePatientDetail({
      ...DETAIL,
      gioiTinh: null,
      ngaySinh: null,
      diaChi: null,
      nguoiThan: [{ ...RELATIVE, soDienThoai: null, trangThaiHieuLuc: false }],
    });
    expect(parsed.gioiTinh).toBeNull();
    expect(parsed.ngaySinh).toBeNull();
    expect(parsed.diaChi).toBeNull();
    expect(parsed.nguoiThan[0].soDienThoai).toBeNull();
    expect(parsed.nguoiThan[0].trangThaiHieuLuc).toBe(false);
    expect(parsePatientDetail({ ...DETAIL, nguoiThan: [] }).nguoiThan).toEqual(
      [],
    );
  });

  it('LV-19 Q18 mã lạ (`trangThai`, `gioiTinh`, `moiQuanHe`) không làm vỡ: vẫn là chuỗi', () => {
    const parsed = parsePatientDetail({
      ...DETAIL,
      trangThai: 'MaLa',
      gioiTinh: 'MaLa',
      nguoiThan: [{ ...RELATIVE, moiQuanHe: 'MaLa', gioiTinh: 'MaLa' }],
    });
    expect(parsed.trangThai).toBe('MaLa');
    expect(parsed.gioiTinh).toBe('MaLa');
    expect(parsed.nguoiThan[0].moiQuanHe).toBe('MaLa');
  });

  it('LV-20 Q18 khoá thừa ở bản thân và ở người thân (mã nội bộ, `taiKhoanId`) bị bỏ', () => {
    const parsed = parsePatientDetail({
      ...DETAIL,
      taiKhoanId: '3',
      maNoiBo: 'u1',
      lichSuLichHen: { tong: 11 },
      nguoiThan: [{ ...RELATIVE, hoSoNguoiThanId: '7' }],
    });
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(DETAIL).sort());
    expect(Object.keys(parsed.nguoiThan[0]).sort()).toEqual(
      Object.keys(RELATIVE).sort(),
    );
  });

  it.each([
    ['không phải đối tượng', 'x'],
    ['thiếu hoTen', { ...DETAIL, hoTen: undefined }],
    ['email là null', { ...DETAIL, email: null }],
    ['gioiTinh là số', { ...DETAIL, gioiTinh: 1 }],
    ['ngaySinh sai dạng (dd/mm/yyyy)', { ...DETAIL, ngaySinh: '20/02/1985' }],
    ['thoiDiemTao không phải thời điểm', { ...DETAIL, thoiDiemTao: 'hôm qua' }],
    ['thoiDiemTao chỉ có ngày', { ...DETAIL, thoiDiemTao: '2026-11-07' }],
    ['soLanVangMat là chuỗi', { ...DETAIL, soLanVangMat: '2' }],
    ['soLanVangMat âm', { ...DETAIL, soLanVangMat: -1 }],
    ['soLanVangMat không nguyên', { ...DETAIL, soLanVangMat: 0.5 }],
    ['nguoiThan không phải mảng', { ...DETAIL, nguoiThan: null }],
    [
      'người thân thiếu moiQuanHe',
      { ...DETAIL, nguoiThan: [{ ...RELATIVE, moiQuanHe: undefined }] },
    ],
    ['người thân là null', { ...DETAIL, nguoiThan: [null] }],
    [
      'người thân có trangThaiHieuLuc là chuỗi',
      { ...DETAIL, nguoiThan: [{ ...RELATIVE, trangThaiHieuLuc: 'true' }] },
    ],
    [
      'người thân có ngày sinh null (cột NOT NULL)',
      { ...DETAIL, nguoiThan: [{ ...RELATIVE, ngaySinh: null }] },
    ],
  ])('LV-21 Q18 sai hình dạng ⇒ UnexpectedResponseError: %s', (_name, raw) => {
    rejects(parsePatientDetail, raw);
  });
});

describe('searchPatients và getPatientDetail', () => {
  function stubFetch(body: unknown) {
    const spy = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', spy);
    return spy;
  }
  afterEach(() => vi.unstubAllGlobals());

  it('LV-25 Q16 H4 tìm ⇒ GET /api/reception/patients CHỈ với q, page, pageSize', async () => {
    const spy = stubFetch(PAGE);
    const controller = new AbortController();
    await searchPatients(
      { q: 'nguyễn', page: 2, pageSize: 20 },
      controller.signal,
    );

    expect(spy).toHaveBeenCalledTimes(1);
    const url = new URL(String(spy.mock.calls[0][0]), 'http://localhost');
    expect(url.pathname).toBe('/api/reception/patients');
    expect(Array.from(url.searchParams.keys()).sort()).toEqual([
      'page',
      'pageSize',
      'q',
    ]);
    expect(url.searchParams.get('q')).toBe('nguyễn');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('pageSize')).toBe('20');
    expect(spy.mock.calls[0][1]?.method ?? 'GET').toBe('GET');
  });

  it('LV-26 H4 không gửi tham số lạ (chiNhanhId) và không có thân', async () => {
    const spy = stubFetch(PAGE);
    await searchPatients(
      { q: 'ab', page: 1, pageSize: 20 },
      new AbortController().signal,
    );
    const url = String(spy.mock.calls[0][0]);
    expect(url).not.toContain('chiNhanhId');
    expect(spy.mock.calls[0][1]?.body).toBeUndefined();
  });

  it('LV-27 TC-18 truyền `signal` của nơi gọi: huỷ trước khi gửi ⇒ RequestAbortedError, không gọi mạng', async () => {
    const spy = stubFetch(PAGE);
    const controller = new AbortController();
    controller.abort();
    await expect(
      searchPatients({ q: 'ab', page: 1, pageSize: 20 }, controller.signal),
    ).rejects.toMatchObject({ name: 'RequestAbortedError' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('LV-28 Q18 chi tiết ⇒ GET /api/reception/patients/<id> không query, id lớn hơn 2^53 nguyên vẹn', async () => {
    const spy = stubFetch(DETAIL);
    const big = '9007199254740993';
    await getPatientDetail(big, new AbortController().signal);

    const raw = String(spy.mock.calls[0][0]);
    expect(raw).toBe(`/api/reception/patients/${big}`);
    expect(raw).not.toContain('?');
  });

  it('LV-29 H4 id lạ không thể đổi đường dẫn (được mã hoá)', async () => {
    const spy = stubFetch(DETAIL);
    await getPatientDetail('1/../2?x=1', new AbortController().signal);
    const raw = String(spy.mock.calls[0][0]);
    expect(raw).toBe('/api/reception/patients/1%2F..%2F2%3Fx%3D1');
  });

  it('LV-30 Q18 phản hồi 200 sai hình dạng ⇒ UnexpectedResponseError (cả danh sách lẫn chi tiết)', async () => {
    stubFetch({ items: 'x' });
    await expect(
      searchPatients(
        { q: 'ab', page: 1, pageSize: 20 },
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
    stubFetch({ hoTen: 'x' });
    await expect(
      getPatientDetail('3', new AbortController().signal),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});
