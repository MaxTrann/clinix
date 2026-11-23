import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  lockStaff,
  parseDependents,
  resendActivation,
  unlockStaff,
} from './staff-service';

// admin F8, lời gọi khoá, mở khoá, gửi lại và bộ đọc phản hồi (mã NSF8-11 đến 14 là [đề xuất], TRACKING admin 9A.20 mục 3). Phủ TK-10 (khoá Bác sĩ trả danh sách
// phụ thuộc, Q28) và TK-41 (gửi lỗi không bao giờ thành "đã gửi"). `fetch` giả ở mức hợp đồng B18 và B20; không dữ liệu thật.

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function stubFetch(respond: () => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        method: init?.method ?? 'GET',
        path: new URL(String(input), 'http://localhost').pathname.replace(
          /^\/api/,
          '',
        ),
        body: init?.body,
      });
      return respond();
    }),
  );
  return calls;
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const dependents = {
  lichHen: {
    tong: 2,
    muc: [
      {
        lichHenId: '11',
        maLichHen: 'LH-0011',
        thoiGian: '2026-11-25 08:30:00',
        trangThai: 'DaXacNhan',
      },
      {
        lichHenId: '12',
        maLichHen: 'LH-0012',
        thoiGian: '2026-11-25 09:00:00',
        trangThai: 'ChoThanhToan',
      },
    ],
  },
  caLamViec: {
    tong: 1,
    muc: [
      { lichLamViecId: '31', chiNhanhId: '5', ngay: '2026-11-26', ca: 'Sang' },
    ],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NSF8-11 bộ đọc danh sách phụ thuộc của Bác sĩ vừa bị khoá (TK-10, Q28)', () => {
  it('NSF8-11 đúng hình dạng thì giữ đủ mục; khoá lạ của API bị bỏ', () => {
    const withExtra = {
      lichHen: {
        ...dependents.lichHen,
        muc: dependents.lichHen.muc.map((item) => ({
          ...item,
          benhNhanEmail: 'khong-duoc-ve@example.invalid',
        })),
        ghiChu: 'x',
      },
      caLamViec: dependents.caLamViec,
      matKhauBam: 'khong-duoc-ve',
    };
    const result = parseDependents(withExtra);
    expect(result).toEqual({
      lichHen: dependents.lichHen,
      caLamViec: {
        tong: 1,
        muc: [{ lichLamViecId: '31', ngay: '2026-11-26', ca: 'Sang' }],
      },
    });
    expect(JSON.stringify(result)).not.toContain('example.invalid');
    expect(JSON.stringify(result)).not.toContain('khong-duoc-ve');
  });

  it('NSF8-11 danh sách rỗng nhưng đúng hình dạng vẫn là kết quả hợp lệ (khác "không biết")', () => {
    expect(
      parseDependents({
        lichHen: { tong: 0, muc: [] },
        caLamViec: { tong: 0, muc: [] },
      }),
    ).toEqual({
      lichHen: { tong: 0, muc: [] },
      caLamViec: { tong: 0, muc: [] },
    });
  });

  it('NSF8-11 tổng lớn hơn số mục được giữ nguyên (API cắt ở 50)', () => {
    const result = parseDependents({
      lichHen: { tong: 73, muc: dependents.lichHen.muc },
      caLamViec: { tong: 0, muc: [] },
    });
    expect(result?.lichHen.tong).toBe(73);
    expect(result?.lichHen.muc).toHaveLength(2);
  });

  it.each<[string, unknown]>([
    ['không có (nhân sự khác Bác sĩ)', undefined],
    ['null', null],
    ['là chuỗi', 'x'],
    ['là mảng', []],
    ['thiếu lichHen', { caLamViec: dependents.caLamViec }],
    ['thiếu caLamViec', { lichHen: dependents.lichHen }],
    [
      'tong không phải số',
      { ...dependents, lichHen: { tong: '2', muc: dependents.lichHen.muc } },
    ],
    [
      'tong âm',
      { ...dependents, lichHen: { tong: -1, muc: dependents.lichHen.muc } },
    ],
    [
      'tong không nguyên',
      { ...dependents, lichHen: { tong: 1.5, muc: dependents.lichHen.muc } },
    ],
    ['muc không phải mảng', { ...dependents, lichHen: { tong: 2, muc: {} } }],
    [
      'một mục thiếu trường',
      {
        ...dependents,
        lichHen: { tong: 1, muc: [{ lichHenId: '1', maLichHen: 'LH-1' }] },
      },
    ],
    [
      'một mục sai kiểu trường',
      {
        ...dependents,
        caLamViec: {
          tong: 1,
          muc: [{ lichLamViecId: 31, ngay: '2026-11-26', ca: 'Sang' }],
        },
      },
    ],
  ])('NSF8-11 %s: không đọc được thì null, không đoán', (_name, value) => {
    expect(parseDependents(value)).toBeNull();
  });
});

describe('NSF8-12 khoá và mở khoá: lời gọi và phản hồi (TK-10, TK-11)', () => {
  it('NSF8-12 khoá: MỘT POST tới /lock, không thân; đọc danh sách phụ thuộc trong phản hồi', async () => {
    const calls = stubFetch(() =>
      ok({
        taiKhoanId: '7',
        loaiTaiKhoan: 'BacSi',
        trangThai: 'NgungHoatDong',
        soPhienThuHoi: 2,
        phuThuoc: dependents,
      }),
    );
    const result = await lockStaff('7');
    expect(calls).toEqual([
      { method: 'POST', path: '/admin/accounts/7/lock', body: undefined },
    ]);
    expect(result).toEqual({
      lichHen: dependents.lichHen,
      caLamViec: {
        tong: 1,
        muc: [{ lichLamViecId: '31', ngay: '2026-11-26', ca: 'Sang' }],
      },
    });
  });

  it('NSF8-12 khoá Lễ tân: phản hồi không có phuThuoc thì kết quả là null', async () => {
    stubFetch(() =>
      ok({
        taiKhoanId: '8',
        loaiTaiKhoan: 'LeTan',
        trangThai: 'NgungHoatDong',
        soPhienThuHoi: 0,
      }),
    );
    expect(await lockStaff('8')).toBeNull();
  });

  it('NSF8-12 khoá mà phản hồi không phải đối tượng: vẫn không ném (việc khoá đã xong), kết quả null', async () => {
    stubFetch(() => ok('ổn'));
    expect(await lockStaff('7')).toBeNull();
  });

  it('NSF8-12 mở khoá: MỘT POST tới /unlock, không thân', async () => {
    const calls = stubFetch(() =>
      ok({
        taiKhoanId: '7',
        loaiTaiKhoan: 'BacSi',
        trangThai: 'DangHoatDong',
      }),
    );
    await unlockStaff('7');
    expect(calls).toEqual([
      { method: 'POST', path: '/admin/accounts/7/unlock', body: undefined },
    ]);
  });

  it('NSF8-12 mã tài khoản được mã hoá trong đường dẫn', async () => {
    const calls = stubFetch(() => ok({}));
    await lockStaff('a/b?c');
    expect(calls[0].path).toBe('/admin/accounts/a%2Fb%3Fc/lock');
  });
});

describe('NSF8-13 gửi lại email kích hoạt: lời gọi và phản hồi (TK-40, TK-41)', () => {
  it('NSF8-13 MỘT POST tới /resend-activation, không thân; đã gửi kèm hạn liên kết mới', async () => {
    const calls = stubFetch(() =>
      ok({
        taiKhoanId: '9',
        guiEmail: { ketQua: 'DaGui' },
        hanLienKet: '2026-11-25T03:00:00.000Z',
      }),
    );
    expect(await resendActivation('9')).toEqual({
      kind: 'sent',
      hanLienKet: '2026-11-25T03:00:00.000Z',
    });
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/admin/accounts/9/resend-activation',
        body: undefined,
      },
    ]);
  });

  it('NSF8-13 HTTP 200 nhưng gửi thư lỗi: mailFailed, hạn là null', async () => {
    stubFetch(() =>
      ok({
        taiKhoanId: '9',
        guiEmail: { ketQua: 'ThatBai', maLoi: 'GUI_MAIL_LOI' },
        hanLienKet: null,
      }),
    );
    expect(await resendActivation('9')).toEqual({ kind: 'mailFailed' });
  });

  it('NSF8-13 đã gửi mà hanLienKet không phải chuỗi: vẫn là đã gửi, hạn null', async () => {
    stubFetch(() =>
      ok({ taiKhoanId: '9', guiEmail: { ketQua: 'DaGui' }, hanLienKet: 123 }),
    );
    expect(await resendActivation('9')).toEqual({
      kind: 'sent',
      hanLienKet: null,
    });
  });

  it.each<[string, unknown]>([
    ['thiếu guiEmail', { taiKhoanId: '9', hanLienKet: null }],
    ['guiEmail là chuỗi', { guiEmail: 'DaGui' }],
    ['guiEmail null', { guiEmail: null }],
    ['ketQua lạ', { guiEmail: { ketQua: 'ChoGui' } }],
    ['ketQua sai kiểu', { guiEmail: { ketQua: true } }],
    ['thân là chuỗi', 'DaGui'],
    ['thân null', null],
    ['thân là mảng', ['DaGui']],
  ])('NSF8-13 %s: unknown, KHÔNG BAO GIỜ thành đã gửi', async (_name, body) => {
    stubFetch(() => ok(body));
    expect(await resendActivation('9')).toEqual({ kind: 'unknown' });
  });

  it('NSF8-13 lỗi HTTP được ném nguyên cho nơi gọi chọn chữ theo mã', async () => {
    stubFetch(
      () =>
        new Response(
          JSON.stringify({
            maLoi: 'GUI_LAI_QUA_SOM',
            thongBao: 'x',
            chiTiet: { soGiayCho: 30 },
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    await expect(resendActivation('9')).rejects.toMatchObject({
      status: 429,
      maLoi: 'GUI_LAI_QUA_SOM',
      chiTiet: { soGiayCho: 30 },
    });
  });

  it('NSF8-13 thân không phải JSON của lời gọi thành công: ném UnexpectedResponseError, không coi là đã gửi', async () => {
    stubFetch(
      () =>
        new Response('<html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    );
    await expect(resendActivation('9')).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });
});
