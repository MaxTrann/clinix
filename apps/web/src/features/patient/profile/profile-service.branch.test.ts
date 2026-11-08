import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  SAMPLE_PROFILE,
  SAMPLE_RECEPTIONIST,
  json,
} from '../testing/fake-profile-api';
import { getProfile, parseProfile, updateProfile } from './profile-service';

// patient F4 (TRACKING F4-D, F4-H): khoá chỉ đọc `chiNhanh` của GET và PUT /profile. Mã ca CB-nn là [đề xuất]; mỗi ca ghi mã HS của PLAN mục 7.1.
const SIX_KEYS = [
  'diaChi',
  'email',
  'gioiTinh',
  'hoTen',
  'ngaySinh',
  'soDienThoai',
];
const BRANCH = { chiNhanhId: '3', ten: 'CLINIX Chi nhánh Quận 3' };
const UPDATE_BODY = {
  hoTen: 'Lê Thị Lệ Ngân',
  soDienThoai: '0965432109',
  gioiTinh: null,
  ngaySinh: null,
  diaChi: null,
};

describe('parseProfile với chiNhanh', () => {
  it('CB-01 HS-21 hồ sơ Lễ tân (mười khoá) ⇒ sáu khoá cũ cộng chiNhanh { chiNhanhId, ten }', () => {
    const profile = parseProfile(SAMPLE_RECEPTIONIST);
    expect(profile.chiNhanh).toEqual(BRANCH);
    expect(Object.keys(profile).sort()).toEqual(
      [...SIX_KEYS, 'chiNhanh'].sort(),
    );
    expect(profile.hoTen).toBe('Lê Thị Lệ Ngân');
  });

  it('CB-02 HS-17 Bệnh nhân (chiNhanh: null) ⇒ đúng sáu khoá như F3, KHÔNG có khoá chiNhanh', () => {
    const profile = parseProfile(SAMPLE_PROFILE);
    expect(Object.keys(profile).sort()).toEqual(SIX_KEYS);
    expect('chiNhanh' in profile).toBe(false);
  });

  it('CB-03 HS-21 Lễ tân thiếu khoá chiNhanh ⇒ vẫn hợp lệ (hợp đồng lệch không làm vỡ trang), không có khoá', () => {
    const withoutBranch: Record<string, unknown> = { ...SAMPLE_RECEPTIONIST };
    delete withoutBranch.chiNhanh;
    const profile = parseProfile(withoutBranch);
    expect('chiNhanh' in profile).toBe(false);
    expect(profile.hoTen).toBe('Lê Thị Lệ Ngân');
  });

  it.each([
    ['9007199254740993', 'vượt 2^53 (Number ra …992)'],
    ['18446744073709551615', 'lớn nhất của BIGINT UNSIGNED'],
    ['0', 'số không'],
    ['007', 'có số không đứng đầu'],
  ])(
    'CB-04 HS-21 chiNhanhId %s (%s) ⇒ giữ nguyên chữ số, vẫn là chuỗi',
    (chiNhanhId) => {
      const profile = parseProfile({
        ...SAMPLE_RECEPTIONIST,
        chiNhanh: { chiNhanhId, ten: 'X' },
      });
      expect(profile.chiNhanh?.chiNhanhId).toBe(chiNhanhId);
      expect(typeof profile.chiNhanh?.chiNhanhId).toBe('string');
    },
  );

  it('CB-05 HS-21 chỉ giữ hai khoá đã kiểm của chiNhanh (khoá thừa của API bị bỏ)', () => {
    const profile = parseProfile({
      ...SAMPLE_RECEPTIONIST,
      chiNhanh: { ...BRANCH, diaChi: 'bí mật', soDienThoai: '0900000000' },
    });
    expect(profile.chiNhanh).toEqual(BRANCH);
    expect(Object.keys(profile.chiNhanh ?? {}).sort()).toEqual([
      'chiNhanhId',
      'ten',
    ]);
  });

  it.each([
    ['số', 5],
    ['chuỗi', 'CLINIX Chi nhánh Quận 3'],
    ['true', true],
    ['mảng rỗng', []],
    ['mảng chứa chi nhánh', [BRANCH]],
    ['đối tượng rỗng', {}],
    ['thiếu ten', { chiNhanhId: '3' }],
    ['thiếu chiNhanhId', { ten: 'CLINIX' }],
    ['ten là số', { chiNhanhId: '3', ten: 5 }],
    ['ten là null', { chiNhanhId: '3', ten: null }],
    ['ten rỗng', { chiNhanhId: '3', ten: '' }],
    ['chiNhanhId là số', { chiNhanhId: 3, ten: 'CLINIX' }],
    ['chiNhanhId là null', { chiNhanhId: null, ten: 'CLINIX' }],
    ['chiNhanhId rỗng', { chiNhanhId: '', ten: 'CLINIX' }],
    ['chiNhanhId có chữ', { chiNhanhId: '3a', ten: 'CLINIX' }],
    ['chiNhanhId âm', { chiNhanhId: '-3', ten: 'CLINIX' }],
    ['chiNhanhId thập phân', { chiNhanhId: '3.5', ten: 'CLINIX' }],
  ])(
    'CB-06 HS-21 chiNhanh sai hình dạng (%s) ⇒ UnexpectedResponseError',
    (_label, chiNhanh) => {
      expect(() => parseProfile({ ...SAMPLE_RECEPTIONIST, chiNhanh })).toThrow(
        UnexpectedResponseError,
      );
    },
  );
});

describe('gọi API với chiNhanh', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('CB-07 HS-21 getProfile trả chiNhanh của Lễ tân', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, SAMPLE_RECEPTIONIST)),
    );
    const profile = await getProfile(new AbortController().signal);
    expect(profile.chiNhanh).toEqual(BRANCH);
  });

  it('CB-08 HS-21 updateProfile: thân PUT đúng năm khoá (không email, không chiNhanh), phản hồi đọc lại có chiNhanh', async () => {
    const fetchMock = vi.fn(async () => json(200, SAMPLE_RECEPTIONIST));
    vi.stubGlobal('fetch', fetchMock);

    const saved = await updateProfile(UPDATE_BODY);

    expect(saved.chiNhanh).toEqual(BRANCH);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual([
      'diaChi',
      'gioiTinh',
      'hoTen',
      'ngaySinh',
      'soDienThoai',
    ]);
    expect(sent).not.toHaveProperty('email');
    expect(sent).not.toHaveProperty('chiNhanh');
  });

  it('CB-09 HS-21 PUT 200 với chiNhanh sai hình dạng ⇒ UnexpectedResponseError (kết quả không rõ)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { ...SAMPLE_RECEPTIONIST, chiNhanh: 5 })),
    );
    await expect(updateProfile(UPDATE_BODY)).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });
});
