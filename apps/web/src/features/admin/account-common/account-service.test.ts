import { buildAccountsPath } from './account-service';
import type { AccountListQuery } from './account-types';

// admin F9, dựng đường dẫn và lời gọi API tài khoản (mã TKF9-09, 10 là [đề xuất], TRACKING admin 9A.12 mục 3). Phủ phía giao diện của TK-05, TK-06.
// Phần gọi `fetch` thật của ba lệnh ghi được kiểm ở `patient-detail-panel.test.tsx` và `no-show-unlock.test.tsx` qua `fetch` giả.

const base: AccountListQuery = {
  page: 1,
  pageSize: 20,
  vaiTro: ['BenhNhan'],
};

function parse(path: string) {
  const url = new URL(path, 'http://localhost');
  return { pathname: url.pathname, params: url.searchParams };
}

describe('TKF9-09 chuỗi truy vấn của GET /admin/accounts', () => {
  it('TKF9-09 mặc định: chỉ page, pageSize và vaiTro=BenhNhan', () => {
    const { pathname, params } = parse(buildAccountsPath(base, 'ToanHeThong'));
    expect(pathname).toBe('/admin/accounts');
    expect([...params.keys()]).toEqual(['page', 'pageSize', 'vaiTro']);
    expect(params.get('page')).toBe('1');
    expect(params.get('pageSize')).toBe('20');
    expect(params.getAll('vaiTro')).toEqual(['BenhNhan']);
  });

  it('TKF9-09 vaiTro LẶP tham số cho nhiều vai trò (F8 dùng lại), giữ thứ tự', () => {
    const { params } = parse(
      buildAccountsPath(
        { ...base, vaiTro: ['BacSi', 'LeTan', 'QuanTriVien'] },
        'ToanHeThong',
      ),
    );
    expect(params.getAll('vaiTro')).toEqual(['BacSi', 'LeTan', 'QuanTriVien']);
  });

  it('TKF9-09 Toàn hệ thống gửi đủ bộ lọc: trạng thái, khoá no-show (cả true và false), chi nhánh, từ khoá', () => {
    const full = parse(
      buildAccountsPath(
        {
          ...base,
          page: 3,
          trangThai: 'NgungHoatDong',
          khoaNoShow: true,
          chiNhanhId: '12',
          q: 'an',
        },
        'ToanHeThong',
      ),
    ).params;
    expect(Object.fromEntries(full)).toEqual({
      page: '3',
      pageSize: '20',
      vaiTro: 'BenhNhan',
      trangThai: 'NgungHoatDong',
      khoaNoShow: 'true',
      chiNhanhId: '12',
      q: 'an',
    });
    expect(
      parse(
        buildAccountsPath({ ...base, khoaNoShow: false }, 'ToanHeThong'),
      ).params.get('khoaNoShow'),
    ).toBe('false');
  });

  it('TKF9-09 Chi nhánh KHÔNG gửi khoaNoShow (API trả 403) và chiNhanhId (API bỏ qua), nhưng vẫn gửi trạng thái và từ khoá', () => {
    const { params } = parse(
      buildAccountsPath(
        {
          ...base,
          trangThai: 'DangHoatDong',
          khoaNoShow: true,
          chiNhanhId: '12',
          q: 'an',
        },
        'ChiNhanh',
      ),
    );
    expect(params.has('khoaNoShow')).toBe(false);
    expect(params.has('chiNhanhId')).toBe(false);
    expect(params.get('trangThai')).toBe('DangHoatDong');
    expect(params.get('q')).toBe('an');
  });

  it('TKF9-09 bỏ tham số rỗng: từ khoá trống hay chỉ khoảng trắng, chi nhánh rỗng', () => {
    for (const q of ['', '   ', undefined]) {
      expect(
        parse(
          buildAccountsPath({ ...base, q, chiNhanhId: '' }, 'ToanHeThong'),
        ).params.has('q'),
      ).toBe(false);
    }
    expect(
      parse(
        buildAccountsPath({ ...base, chiNhanhId: '' }, 'ToanHeThong'),
      ).params.has('chiNhanhId'),
    ).toBe(false);
  });

  it.each([
    ["50%_'--"],
    ["'; DROP TABLE tai_khoan; --"],
    ['100%'],
    ['a_b'],
    ['Nguyễn Văn An'],
    ['a&b=c#d'],
    ['dấu + và = và ?'],
  ])(
    'TKF9-10 từ khoá %s được gửi NGUYÊN VĂN (API tự escape), không bị đổi hay cắt',
    (text) => {
      const { params } = parse(
        buildAccountsPath({ ...base, q: text }, 'ToanHeThong'),
      );
      expect(params.get('q')).toBe(text);
      // Chuỗi đặc biệt không được làm đổi các tham số khác
      expect(params.getAll('vaiTro')).toEqual(['BenhNhan']);
      expect(params.get('page')).toBe('1');
    },
  );

  it('TKF9-10 từ khoá được trim hai đầu, khoảng trắng giữa chữ giữ nguyên', () => {
    expect(
      parse(
        buildAccountsPath({ ...base, q: '  Văn  An ' }, 'ToanHeThong'),
      ).params.get('q'),
    ).toBe('Văn  An');
  });
});
