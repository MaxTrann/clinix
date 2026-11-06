import { UnexpectedResponseError } from '../../../shared/api/errors';
import { SAMPLE_PROFILE, json } from '../testing/fake-profile-api';
import { getProfile, parseProfile, updateProfile } from './profile-service';

// patient F3 (TRACKING F3-C, F3-G). Mã ca PW-nn là [đề xuất]; mỗi ca ghi mã HS của PLAN mục 7.1 mà nó phủ.
const SIX = {
  hoTen: 'Nguyễn Văn A',
  email: 'nguyenvana@example.invalid',
  soDienThoai: '0901234567',
  gioiTinh: 'Nam',
  ngaySinh: '1990-05-15',
  diaChi: '12 Đường Mẫu, Quận Một',
};

describe('parseProfile', () => {
  it('PW-12 HS-17 nhận mười khoá của GET, chỉ giữ sáu khoá trang dùng', () => {
    expect(parseProfile(SAMPLE_PROFILE)).toEqual(SIX);
  });

  it('PW-12 HS-17 ba ô tuỳ chọn là null vẫn hợp lệ', () => {
    expect(
      parseProfile({ ...SIX, gioiTinh: null, ngaySinh: null, diaChi: null }),
    ).toEqual({ ...SIX, gioiTinh: null, ngaySinh: null, diaChi: null });
  });

  it('PW-13 HS-17 gioiTinh lạ KHÔNG làm vỡ: giữ nguyên chuỗi', () => {
    expect(parseProfile({ ...SIX, gioiTinh: 'Male' }).gioiTinh).toBe('Male');
  });

  it.each([
    ['null', null],
    ['chuỗi', 'hồ sơ'],
    ['mảng', []],
    ['{ ok: true } của fake auth', { ok: true }],
    ['thiếu hoTen', { ...SIX, hoTen: undefined }],
    ['hoTen là số', { ...SIX, hoTen: 5 }],
    ['thiếu email', { ...SIX, email: undefined }],
    ['soDienThoai là null', { ...SIX, soDienThoai: null }],
    ['gioiTinh là số', { ...SIX, gioiTinh: 1 }],
    ['thiếu gioiTinh', { ...SIX, gioiTinh: undefined }],
    ['diaChi là số', { ...SIX, diaChi: 7 }],
    ['ngaySinh dd/mm/yyyy', { ...SIX, ngaySinh: '15/05/1990' }],
    ['ngaySinh là số', { ...SIX, ngaySinh: 19900515 }],
    ['ngaySinh một chữ số tháng', { ...SIX, ngaySinh: '1990-5-15' }],
  ])(
    'PW-13 HS-17 sai hình dạng (%s) ⇒ UnexpectedResponseError',
    (_label, raw) => {
      expect(() => parseProfile(raw)).toThrow(UnexpectedResponseError);
    },
  );
});

describe('gọi API qua lớp client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('PW-12 HS-17 getProfile: GET /api/profile, trả sáu khoá', async () => {
    const fetchMock = vi.fn(async () => json(200, SAMPLE_PROFILE));
    vi.stubGlobal('fetch', fetchMock);

    expect(await getProfile(new AbortController().signal)).toEqual(SIX);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/profile');
    expect(init.method).toBe('GET');
  });

  it('PW-14 HS-18 updateProfile: PUT JSON đúng năm khoá và trả hồ sơ đọc lại', async () => {
    const fetchMock = vi.fn(async () => json(200, SAMPLE_PROFILE));
    vi.stubGlobal('fetch', fetchMock);
    const body = {
      hoTen: 'Trần Thị B',
      soDienThoai: '0912345678',
      gioiTinh: null,
      ngaySinh: '2000-01-31',
      diaChi: null,
    };

    expect(await updateProfile(body)).toEqual(SIX);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/profile');
    expect(init.method).toBe('PUT');
    expect(new Headers(init.headers).get('Content-Type')).toBe(
      'application/json',
    );
    expect(JSON.parse(init.body as string)).toEqual(body);
    // PUT không truyền signal của nơi gọi: rời trang không huỷ được yêu cầu đang ghi
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('PW-13 HS-18 PUT 200 nhưng thân sai hình dạng ⇒ UnexpectedResponseError (kết quả không rõ)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { ok: true })),
    );
    await expect(
      updateProfile({
        hoTen: 'A',
        soDienThoai: '0901234567',
        gioiTinh: null,
        ngaySinh: null,
        diaChi: null,
      }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });
});
