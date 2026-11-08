import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  SAMPLE_ADMIN,
  SAMPLE_ADMIN_BRANCH,
  SAMPLE_PROFILE,
  SAMPLE_RECEPTIONIST,
  json,
} from '../testing/fake-profile-api';
import { getProfile, parseProfile, updateProfile } from './profile-service';

// patient F5 (TRACKING F5-D, F5-I): khoá chỉ đọc `phamViQuanTri` của GET và PUT /profile. Mã ca AS-nn là [đề xuất]; mỗi ca ghi mã HS của PLAN mục 7.1.
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
  hoTen: 'Admin CLINIX',
  soDienThoai: '0954321098',
  gioiTinh: null,
  ngaySinh: null,
  diaChi: null,
};
const keysOf = (value: object) => Object.keys(value).sort();

describe('parseProfile với phamViQuanTri', () => {
  it('AS-01 HS-21 Quản trị viên Toàn hệ thống (mười khoá) ⇒ sáu khoá cũ cộng phamViQuanTri, KHÔNG có chiNhanh', () => {
    const profile = parseProfile(SAMPLE_ADMIN);
    expect(profile.phamViQuanTri).toBe('ToanHeThong');
    expect(keysOf(profile)).toEqual([...SIX_KEYS, 'phamViQuanTri'].sort());
    expect(profile.hoTen).toBe('Admin CLINIX');
  });

  it('AS-02 HS-21 Quản trị viên Chi nhánh ⇒ sáu khoá cũ cộng chiNhanh và phamViQuanTri', () => {
    const profile = parseProfile(SAMPLE_ADMIN_BRANCH);
    expect(profile.phamViQuanTri).toBe('ChiNhanh');
    expect(profile.chiNhanh).toEqual(BRANCH);
    expect(keysOf(profile)).toEqual(
      [...SIX_KEYS, 'chiNhanh', 'phamViQuanTri'].sort(),
    );
  });

  it('AS-03 HS-17 Bệnh nhân (phamViQuanTri: null) ⇒ đúng sáu khoá như F3, không phạm vi, không chi nhánh', () => {
    const profile = parseProfile(SAMPLE_PROFILE);
    expect(keysOf(profile)).toEqual(SIX_KEYS);
    expect('phamViQuanTri' in profile).toBe(false);
  });

  it('AS-04 HS-21 Lễ tân ⇒ sáu khoá cộng chiNhanh (như F4), KHÔNG có phamViQuanTri', () => {
    const profile = parseProfile(SAMPLE_RECEPTIONIST);
    expect(keysOf(profile)).toEqual([...SIX_KEYS, 'chiNhanh'].sort());
    expect('phamViQuanTri' in profile).toBe(false);
  });

  it('AS-05 HS-21 Quản trị viên thiếu hẳn khoá phamViQuanTri ⇒ vẫn hợp lệ (hợp đồng lệch không làm vỡ trang), không có khoá', () => {
    const withoutScope: Record<string, unknown> = { ...SAMPLE_ADMIN };
    delete withoutScope.phamViQuanTri;
    const profile = parseProfile(withoutScope);
    expect('phamViQuanTri' in profile).toBe(false);
    expect(profile.hoTen).toBe('Admin CLINIX');
  });

  it('AS-06 HS-21 phamViQuanTri: null ở Quản trị viên ⇒ không có khoá', () => {
    const profile = parseProfile({ ...SAMPLE_ADMIN, phamViQuanTri: null });
    expect('phamViQuanTri' in profile).toBe(false);
  });

  it.each([
    ['mã lạ', 'Khac'],
    ['sai hoa thường', 'toanhethong'],
    ['thừa khoảng trắng', 'ChiNhanh '],
    ['số', 1],
    ['mảng chứa mã hợp lệ', ['ChiNhanh']],
  ])(
    'AS-07 HS-21 phamViQuanTri là %s ⇒ KHÔNG ném lỗi (không vỡ trang), không có khoá, các khoá khác nguyên vẹn',
    (_label, value) => {
      const profile = parseProfile({ ...SAMPLE_ADMIN, phamViQuanTri: value });
      expect('phamViQuanTri' in profile).toBe(false);
      expect(profile.hoTen).toBe('Admin CLINIX');
      expect(keysOf(profile)).toEqual(SIX_KEYS);
    },
  );

  it('AS-08 HS-21 mã lạ nhưng chiNhanh hợp lệ ⇒ giữ chiNhanh, bỏ phạm vi (hai khoá độc lập)', () => {
    const profile = parseProfile({
      ...SAMPLE_ADMIN_BRANCH,
      phamViQuanTri: 'Khac',
    });
    expect(profile.chiNhanh).toEqual(BRANCH);
    expect('phamViQuanTri' in profile).toBe(false);
  });

  it('AS-09 HS-21 phạm vi hợp lệ nhưng chiNhanh sai hình dạng ⇒ vẫn là UnexpectedResponseError (như F4, chi nhánh KHÔNG được nới)', () => {
    expect(() => parseProfile({ ...SAMPLE_ADMIN_BRANCH, chiNhanh: 5 })).toThrow(
      UnexpectedResponseError,
    );
  });

  it('AS-10 HS-21 chiNhanhId vượt 2^53 ở Quản trị viên Chi nhánh ⇒ giữ nguyên chữ số', () => {
    const profile = parseProfile({
      ...SAMPLE_ADMIN_BRANCH,
      chiNhanh: { chiNhanhId: '9007199254740993', ten: 'X' },
    });
    expect(profile.chiNhanh?.chiNhanhId).toBe('9007199254740993');
  });

  it('AS-11 HS-21 phạm vi Toàn hệ thống mà API thừa chiNhanh ⇒ parse vẫn giữ cả hai khoá (trang mới quyết định không hiện)', () => {
    const profile = parseProfile({ ...SAMPLE_ADMIN, chiNhanh: BRANCH });
    expect(profile.phamViQuanTri).toBe('ToanHeThong');
    expect(profile.chiNhanh).toEqual(BRANCH);
  });
});

describe('gọi API với phamViQuanTri', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('AS-12 HS-21 getProfile trả phamViQuanTri và chiNhanh của Quản trị viên Chi nhánh', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, SAMPLE_ADMIN_BRANCH)),
    );
    const profile = await getProfile(new AbortController().signal);
    expect(profile.phamViQuanTri).toBe('ChiNhanh');
    expect(profile.chiNhanh).toEqual(BRANCH);
  });

  it('AS-13 HS-21 updateProfile: thân PUT đúng năm khoá (không email, không phamViQuanTri, không chiNhanh), phản hồi đọc lại có phạm vi và chi nhánh', async () => {
    const fetchMock = vi.fn(async () => json(200, SAMPLE_ADMIN_BRANCH));
    vi.stubGlobal('fetch', fetchMock);

    const saved = await updateProfile(UPDATE_BODY);

    expect(saved.phamViQuanTri).toBe('ChiNhanh');
    expect(saved.chiNhanh).toEqual(BRANCH);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(keysOf(sent)).toEqual([
      'diaChi',
      'gioiTinh',
      'hoTen',
      'ngaySinh',
      'soDienThoai',
    ]);
    expect(sent).not.toHaveProperty('email');
    expect(sent).not.toHaveProperty('phamViQuanTri');
    expect(sent).not.toHaveProperty('chiNhanh');
  });

  it('AS-14 HS-21 PUT 200 với phạm vi lạ ⇒ KHÔNG ném lỗi (lưu đã thành công, không báo thất bại giả), không có khoá', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { ...SAMPLE_ADMIN, phamViQuanTri: 'Khac' })),
    );
    const saved = await updateProfile(UPDATE_BODY);
    expect('phamViQuanTri' in saved).toBe(false);
    expect(saved.hoTen).toBe('Admin CLINIX');
  });
});
