import { makePublished } from './article-fixtures';
import { createFakeArticleApi } from './fake-article-api';

// article F3, ABU-10: bản giả phần đánh giá phải TỪ CHỐI đúng như máy chủ B3 (guard 401, 403 ⇒ pipe 400 ⇒ service 404), idempotent, số đếm tính ở bản giả.
// Nhờ vậy test của khối đánh giá bắt được lỗi "web gửi sai": một bản giả dễ dãi sẽ che lỗi đó.
const signal = () => new AbortController().signal;
const ACCOUNT = 'bn-1';

function build() {
  const api = createFakeArticleApi([
    makePublished({ baiVietId: '12' }),
    makePublished({ baiVietId: '13', trangThai: 'BanNhap' }),
    makePublished({ baiVietId: '14', trangThai: 'LuuTruAn' }),
  ]);
  api.signInAs('BenhNhan', ACCOUNT);
  return api;
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('phải bị từ chối nhưng đã thành công');
}

describe('createFakeArticleApi: quyền (ABU-10)', () => {
  it('ABU-10 KHÁCH (mặc định) ⇒ 401 CHUA_DANG_NHAP ở cả ba hàm, kể cả id và loai sai (guard chạy trước pipe và service)', async () => {
    const api = createFakeArticleApi([makePublished({ baiVietId: '12' })]);
    for (const call of [
      () => api.getMyRating('12', signal()),
      () => api.getMyRating('abc', signal()),
      () => api.setRating('12', 'Thich'),
      () => api.setRating('99', 'sai' as never),
      () => api.clearRating('12'),
      () => api.clearRating('abc'),
    ]) {
      expect(await rejection(call())).toMatchObject({
        status: 401,
        maLoi: 'CHUA_DANG_NHAP',
      });
    }
    expect(api.ratingRows('12')).toBe(0);
  });

  it.each(['BacSi', 'LeTan', 'QuanTriVien'] as const)(
    'ABU-10 vai %s ⇒ 403 KHONG_DU_QUYEN ở cả ba hàm, kể cả id và loai sai',
    async (vaiTro) => {
      const api = createFakeArticleApi([makePublished({ baiVietId: '12' })]);
      api.signInAs(vaiTro, 'nv-1');
      for (const call of [
        () => api.getMyRating('12', signal()),
        () => api.getMyRating('abc', signal()),
        () => api.setRating('12', 'Thich'),
        () => api.setRating('99', 'sai' as never),
        () => api.clearRating('12'),
        () => api.clearRating('abc'),
      ]) {
        expect(await rejection(call())).toMatchObject({
          status: 403,
          maLoi: 'KHONG_DU_QUYEN',
        });
      }
      expect(api.ratingRows('12')).toBe(0);
    },
  );

  it('ABU-10 đăng xuất rồi gọi lại ⇒ lại là khách (401)', async () => {
    const api = build();
    await api.setRating('12', 'Thich');
    api.signOut();
    expect(await rejection(api.clearRating('12'))).toMatchObject({
      status: 401,
    });
    expect(api.ratingOf('12', ACCOUNT)).toBe('Thich');
  });

  it('ABU-10 danh tính được CHỤP lúc gọi (như token đi theo request): đăng xuất khi lời gọi còn treo thì lời gọi vẫn mang danh tính cũ', async () => {
    const api = build();
    const gate = api.hold('setRating');
    const pending = api.setRating('12', 'Thich');
    api.signOut();
    gate.release();
    await expect(pending).resolves.toMatchObject({ loai: 'Thich' });
    expect(api.ratingOf('12', ACCOUNT)).toBe('Thich');
  });
});

describe('createFakeArticleApi: 404 và 400 (ABU-10)', () => {
  it.each([
    ['bản nháp', '13'],
    ['bản lưu trữ', '14'],
    ['không có', '99'],
    ['sai dạng (chữ)', 'abc'],
    ['sai dạng (0)', '0'],
    ['sai dạng (âm)', '-1'],
    ['sai dạng (kèm slug)', '12-sot'],
    ['rỗng', ''],
  ])(
    'ABU-10 bài %s ⇒ CÙNG MỘT 404 KHONG_TIM_THAY ở GET, PUT, DELETE; không ghi gì',
    async (_name, id) => {
      const api = build();
      for (const call of [
        () => api.getMyRating(id, signal()),
        () => api.setRating(id, 'Thich'),
        () => api.clearRating(id),
      ]) {
        expect(await rejection(call())).toMatchObject({
          status: 404,
          maLoi: 'KHONG_TIM_THAY',
        });
      }
      expect(api.ratingRows(id)).toBe(0);
    },
  );

  it.each([['thich'], ['THICH'], ['Like'], [''], [null], [5], [undefined]])(
    'ABU-10 loai lạ %j ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm loi[loai, LOAI_DANH_GIA_KHONG_HOP_LE]; không ghi; trên bài không có vẫn 400 (pipe chạy trước service)',
    async (loai) => {
      const api = build();
      for (const id of ['12', '99']) {
        expect(await rejection(api.setRating(id, loai as never))).toMatchObject(
          {
            status: 400,
            maLoi: 'DU_LIEU_KHONG_HOP_LE',
            loi: [{ truong: 'loai', ma: 'LOAI_DANH_GIA_KHONG_HOP_LE' }],
          },
        );
      }
      expect(api.ratingRows('12')).toBe(0);
    },
  );

  it('ABU-10 bài đang bị ẩn: phiếu GIỮ NGUYÊN nhưng không thu hồi được (404); xuất bản lại thì phiếu và số đếm hiện lại', async () => {
    const api = build();
    await api.setRating('12', 'Thich');
    await api.update('12', { trangThai: 'LuuTruAn' });
    expect(await rejection(api.clearRating('12'))).toMatchObject({
      status: 404,
    });
    expect(await rejection(api.getMyRating('12', signal()))).toMatchObject({
      status: 404,
    });
    expect(api.ratingOf('12', ACCOUNT)).toBe('Thich');

    await api.update('12', { trangThai: 'DaXuatBan' });
    await expect(api.getMyRating('12', signal())).resolves.toBe('Thich');
    await expect(api.getPublic('12', signal())).resolves.toMatchObject({
      luotThich: 1,
      luotKhongThich: 0,
    });
  });
});

describe('createFakeArticleApi: ghi phiếu, idempotent, số đếm (ABU-10)', () => {
  it('ABU-10 GET lúc chưa đánh giá ⇒ null; phiếu của người khác KHÔNG lộ', async () => {
    const api = build();
    await expect(api.getMyRating('12', signal())).resolves.toBeNull();
    api.seedRating('12', 'bn-2', 'KhongThich');
    await expect(api.getMyRating('12', signal())).resolves.toBeNull();
    api.signInAs('BenhNhan', 'bn-2');
    await expect(api.getMyRating('12', signal())).resolves.toBe('KhongThich');
  });

  it('ABU-10 PUT mới: loại đặt, số đếm +1 ở loại đó, đúng một dòng', async () => {
    const api = build();
    api.seedRatings('12', { thich: 3, khongThich: 1 });
    await expect(api.setRating('12', 'Thich')).resolves.toEqual({
      loai: 'Thich',
      luotThich: 4,
      luotKhongThich: 1,
    });
    expect(api.ratingRows('12')).toBe(5);
    expect(api.ratingOf('12', ACCOUNT)).toBe('Thich');
  });

  it('ABU-10 PUT cùng loại lần nữa: 200, không đổi gì, vẫn một dòng của tài khoản (idempotent)', async () => {
    const api = build();
    const first = await api.setRating('12', 'Thich');
    const second = await api.setRating('12', 'Thich');
    expect(second).toEqual(first);
    expect(api.ratingRows('12')).toBe(1);
  });

  it('ABU-10 PUT loại kia: đổi (Thích −1, Không thích +1), vẫn một dòng', async () => {
    const api = build();
    api.seedRatings('12', { thich: 2, khongThich: 2 });
    await api.setRating('12', 'Thich');
    await expect(api.setRating('12', 'KhongThich')).resolves.toEqual({
      loai: 'KhongThich',
      luotThich: 2,
      luotKhongThich: 3,
    });
    expect(api.ratingRows('12')).toBe(5);
  });

  it('ABU-10 DELETE: xoá phiếu, số đếm −1; DELETE lần hai vẫn 200 và không đổi (idempotent, kể cả khi chưa từng có phiếu)', async () => {
    const api = build();
    await expect(api.clearRating('12')).resolves.toEqual({
      loai: null,
      luotThich: 0,
      luotKhongThich: 0,
    });
    await api.setRating('12', 'KhongThich');
    const first = await api.clearRating('12');
    expect(first).toEqual({ loai: null, luotThich: 0, luotKhongThich: 0 });
    await expect(api.clearRating('12')).resolves.toEqual(first);
    expect(api.ratingRows('12')).toBe(0);
  });

  it('ABU-10 số đếm TÍNH Ở BẢN GIẢ từ kho phiếu và hiện ở chi tiết công khai (không ai nhập sẵn); số cũ không bị đè', async () => {
    const api = build();
    api.seedRatings('12', { thich: 5, khongThich: 2 });
    await expect(api.getPublic('12', signal())).resolves.toMatchObject({
      luotThich: 5,
      luotKhongThich: 2,
    });
    await api.setRating('12', 'KhongThich');
    await expect(api.getPublic('12', signal())).resolves.toMatchObject({
      luotThich: 5,
      luotKhongThich: 3,
    });
  });

  it('ABU-10 `failNext` và `hold` hoạt động với ba hàm mới; lời gọi được ghi vào `calls`', async () => {
    const api = build();
    api.failNext('setRating', new Error('mạng'));
    await expect(api.setRating('12', 'Thich')).rejects.toThrow('mạng');
    expect(api.ratingRows('12')).toBe(0);
    await api.setRating('12', 'Thich');
    await api.clearRating('12');
    await api.getMyRating('12', signal());
    expect(api.callsTo('setRating').map((call) => call.args)).toEqual([
      ['12', 'Thich'],
      ['12', 'Thich'],
    ]);
    expect(api.callsTo('clearRating')).toHaveLength(1);
    expect(api.callsTo('getMyRating')).toHaveLength(1);
  });
});
