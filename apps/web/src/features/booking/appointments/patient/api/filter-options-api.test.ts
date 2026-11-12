import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../../shared/api/auth-hooks';
import { UnexpectedResponseError } from '../../../../../shared/api/errors';
import {
  getDoctorOptions,
  getRelativeOptions,
  getSpecialtyOptions,
} from './filter-options-api';

// booking F1: danh sách cho các ô lọc (người khám, chuyên khoa, bác sĩ). Mã LHL là [đề xuất] (PLAN booking mục 7.31 sau khi duyệt).
// Đại duyệt 12/11/2026 (câu (c)): chuyên khoa và bác sĩ lấy một trang `pageSize=100` từ hai route công khai; còn mục chưa lấy được thì
// báo "rút gọn" (`truncated`) thay vì cắt âm thầm.
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
const urlOf = (spy: ReturnType<typeof stubFetch>) =>
  new URL(String(spy.mock.calls[0][0]), 'http://localhost');
const headersOf = (spy: ReturnType<typeof stubFetch>) =>
  new Headers(spy.mock.calls[0][1]?.headers);

afterEach(() => {
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

describe('getRelativeOptions', () => {
  const RELATIVES = {
    items: [
      {
        hoSoNguoiThanId: '9007199254740993',
        hoTen: 'Bùi Minh Khoa',
        moiQuanHe: 'Con',
        gioiTinh: 'Nam',
        ngaySinh: '2018-03-04',
        soDienThoai: null,
        trangThaiHieuLuc: false,
      },
      {
        hoSoNguoiThanId: '12',
        hoTen: 'Lê Minh D',
        moiQuanHe: 'Con',
        gioiTinh: 'Nam',
        ngaySinh: '2019-01-02',
        soDienThoai: '0911222333',
        trangThaiHieuLuc: true,
      },
    ],
  };

  it('LHL-16 GET /api/patient/relatives không query, GẮN token; chỉ giữ ba khoá cần; hồ sơ đang dùng đứng trước', async () => {
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
    const spy = stubFetch(RELATIVES);
    const options = await getRelativeOptions();

    expect(urlOf(spy).pathname).toBe('/api/patient/relatives');
    expect(urlOf(spy).search).toBe('');
    expect(headersOf(spy).get('Authorization')).toBe('Bearer token-gia');
    expect(options).toEqual([
      { hoSoNguoiThanId: '12', hoTen: 'Lê Minh D', trangThaiHieuLuc: true },
      {
        hoSoNguoiThanId: '9007199254740993',
        hoTen: 'Bùi Minh Khoa',
        trangThaiHieuLuc: false,
      },
    ]);
  });

  it('LHL-16 id lớn hơn 2^53 giữ nguyên chữ số; hồ sơ ngừng sử dụng vẫn là một lựa chọn (lịch sử còn lịch của họ)', async () => {
    stubFetch(RELATIVES);
    const options = await getRelativeOptions();
    expect(options.map((option) => option.hoSoNguoiThanId)).toContain(
      '9007199254740993',
    );
    expect(options.some((option) => !option.trangThaiHieuLuc)).toBe(true);
  });

  it('LHL-16 chưa có người thân nào ⇒ danh sách rỗng (ô vẫn có `Tất cả` và `Bản thân`)', async () => {
    stubFetch({ items: [] });
    expect(await getRelativeOptions()).toEqual([]);
  });

  it('LHL-15 thân sai hình dạng (thiếu `items`, id sai dạng, cờ không phải boolean) ⇒ không dùng được', async () => {
    const bad: unknown[] = [
      {},
      null,
      { items: 'x' },
      { items: [{ hoSoNguoiThanId: 3, hoTen: 'A', trangThaiHieuLuc: true }] },
      { items: [{ hoSoNguoiThanId: '0', hoTen: 'A', trangThaiHieuLuc: true }] },
      { items: [{ hoSoNguoiThanId: '3', hoTen: 5, trangThaiHieuLuc: true }] },
      { items: [{ hoSoNguoiThanId: '3', hoTen: 'A', trangThaiHieuLuc: 'co' }] },
    ];
    for (const body of bad) {
      stubFetch(body);
      await expect(getRelativeOptions()).rejects.toBeInstanceOf(
        UnexpectedResponseError,
      );
    }
  });
});

describe('getSpecialtyOptions', () => {
  const PAGE = (items: unknown[], total = items.length) => ({
    items,
    total,
    page: 1,
    pageSize: 100,
    soCoBacSi: 1,
  });
  const SPECIALTY = (id: string, ten: string) => ({
    chuyenKhoaId: id,
    ten,
    moTa: null,
    anhDaiDien: null,
    soBacSi: 2,
  });

  it('LHL-17 GET /api/public/specialties chỉ với pageSize=100, KHÔNG gắn Authorization (route công khai)', async () => {
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
    const spy = stubFetch(PAGE([SPECIALTY('1', 'Tim mạch')]));
    await getSpecialtyOptions();

    expect(urlOf(spy).pathname).toBe('/api/public/specialties');
    expect(Object.fromEntries(urlOf(spy).searchParams)).toEqual({
      pageSize: '100',
    });
    expect(headersOf(spy).has('Authorization')).toBe(false);
  });

  it('LHL-17 chỉ giữ `chuyenKhoaId` và `ten`, sắp theo tên tiếng Việt', async () => {
    stubFetch(
      PAGE([
        SPECIALTY('3', 'Tim mạch'),
        SPECIALTY('1', 'Da liễu'),
        SPECIALTY('2', 'Nhi khoa'),
      ]),
    );
    const { options, truncated } = await getSpecialtyOptions();
    expect(options).toEqual([
      { chuyenKhoaId: '1', ten: 'Da liễu' },
      { chuyenKhoaId: '2', ten: 'Nhi khoa' },
      { chuyenKhoaId: '3', ten: 'Tim mạch' },
    ]);
    expect(truncated).toBe(false);
  });

  // Ca biên của "danh sách rút gọn": `total` bằng, lớn hơn và (bất thường) nhỏ hơn số mục nhận được
  it('LHL-17 `truncated` chỉ khi `total` lớn hơn số mục nhận được', async () => {
    stubFetch(PAGE([SPECIALTY('1', 'A'), SPECIALTY('2', 'B')], 2));
    expect((await getSpecialtyOptions()).truncated).toBe(false);

    stubFetch(PAGE([SPECIALTY('1', 'A'), SPECIALTY('2', 'B')], 101));
    expect((await getSpecialtyOptions()).truncated).toBe(true);

    stubFetch(PAGE([SPECIALTY('1', 'A'), SPECIALTY('2', 'B')], 1));
    expect((await getSpecialtyOptions()).truncated).toBe(false);

    stubFetch(PAGE([], 0));
    expect(await getSpecialtyOptions()).toEqual({
      options: [],
      truncated: false,
    });
  });

  it('LHL-15 id sai dạng, thiếu `total`, mục không phải đối tượng ⇒ không dùng được', async () => {
    const bad: unknown[] = [
      PAGE([{ chuyenKhoaId: 'x', ten: 'A' }]),
      PAGE([{ chuyenKhoaId: '1' }]),
      PAGE([null]),
      { items: [SPECIALTY('1', 'A')] },
      { items: [SPECIALTY('1', 'A')], total: '1' },
    ];
    for (const body of bad) {
      stubFetch(body);
      await expect(getSpecialtyOptions()).rejects.toBeInstanceOf(
        UnexpectedResponseError,
      );
    }
  });
});

describe('getDoctorOptions', () => {
  const DOCTOR = (id: string, hoTen: string) => ({
    bacSiId: id,
    hoTen,
    chucDanh: 'ThS',
    soNamKinhNghiem: 10,
    chuyenKhoa: { chuyenKhoaId: '1', ten: 'Tim mạch' },
    chiNhanh: { chiNhanhId: '1', ten: 'CLINIX', diaChi: 'Địa chỉ giả' },
    dichVu: { dichVuKhamId: '1', ten: 'Khám', thoiLuong: 30 },
    gia: {
      giaMacDinh: '300000.00',
      phuPhi: '0.00',
      giaKham: '300000.00',
      mucDatCoc: '0.00',
    },
    danhGia: { diemTrungBinh: null, soDanhGia: 0 },
  });
  const PAGE = (items: unknown[], total = items.length) => ({
    items,
    total,
    page: 1,
    pageSize: 100,
  });

  it('LHL-17 GET /api/public/doctors chỉ với pageSize=100, KHÔNG gắn Authorization', async () => {
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });
    const spy = stubFetch(PAGE([DOCTOR('5', 'Nguyễn Minh Anh')]));
    await getDoctorOptions();

    expect(urlOf(spy).pathname).toBe('/api/public/doctors');
    expect(Object.fromEntries(urlOf(spy).searchParams)).toEqual({
      pageSize: '100',
    });
    expect(headersOf(spy).has('Authorization')).toBe(false);
  });

  // `bacSiId` công khai là `bac_si.tai_khoan_id` = `lich_hen.bac_si_id`: đúng giá trị gửi lên B1 làm `bacSiId`, giữ chuỗi
  it('LHL-17 chỉ giữ `bacSiId` và `hoTen` (không giá, chi nhánh, đánh giá), sắp theo tên, id lớn giữ nguyên chữ số', async () => {
    stubFetch(
      PAGE([
        DOCTOR('9007199254740993', 'Trần Quốc Huy'),
        DOCTOR('5', 'Nguyễn Minh Anh'),
        DOCTOR('8', 'Lê Thảo Vy'),
      ]),
    );
    const { options } = await getDoctorOptions();
    expect(options).toEqual([
      { bacSiId: '8', hoTen: 'Lê Thảo Vy' },
      { bacSiId: '5', hoTen: 'Nguyễn Minh Anh' },
      { bacSiId: '9007199254740993', hoTen: 'Trần Quốc Huy' },
    ]);
  });

  it('LHL-17 `truncated` khi `total` > số mục nhận được (100 mục đầu, còn nữa)', async () => {
    const many = Array.from({ length: 100 }, (_, index) =>
      DOCTOR(String(index + 1), `Bác sĩ ${String(index + 1).padStart(3, '0')}`),
    );
    stubFetch(PAGE(many, 130));
    const { options, truncated } = await getDoctorOptions();
    expect(options).toHaveLength(100);
    expect(truncated).toBe(true);

    stubFetch(PAGE(many, 100));
    expect((await getDoctorOptions()).truncated).toBe(false);
  });

  it('LHL-15 id sai dạng hoặc thiếu tên ⇒ không dùng được', async () => {
    for (const body of [
      PAGE([{ bacSiId: 5, hoTen: 'A' }]),
      PAGE([{ bacSiId: '5' }]),
      PAGE([null]),
    ]) {
      stubFetch(body);
      await expect(getDoctorOptions()).rejects.toBeInstanceOf(
        UnexpectedResponseError,
      );
    }
  });
});
