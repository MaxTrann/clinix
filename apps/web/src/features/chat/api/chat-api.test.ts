import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, UnexpectedResponseError } from '../../../shared/api/errors';
import {
  downloadAttachment,
  getChatUnreadCount,
  getConversation,
  getConversations,
  getMessages,
  markConversationRead,
  getBranchOptions,
  getBranchStart,
  getDefaultBranch,
  getDoctorStart,
  sendFirstMessage,
  sendMessage,
} from './chat-api';

// chat F1 — WCH-03 (PLAN chat 7.13): API client đọc đúng hình dạng của chat B2, B4; hình dạng sai ⇒ UnexpectedResponseError; lỗi API giữ `maLoi`.
// 401, quá giờ, mất mạng do lớp client xử lý chung (khoá ở `shared/api/client.test.ts`, kể cả `requestBinary`). `fetch` giả.
const fetchMock = vi.fn<typeof fetch>();

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), init: init! };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const ITEM = {
  id: '12',
  loai: 'BenhNhan_LeTan',
  doiTac: {
    vaiTro: 'BenhNhan',
    tenHienThi: 'Nguyễn An',
    soDienThoai: '0901234567',
  },
  tinCuoi: {
    id: '99',
    trichDan: '[Ảnh]',
    nguoiGuiHienThi: 'Nguyễn An',
    thoiDiemGui: '2026-11-27T01:00:00.000Z',
  },
  soTinChuaDoc: 100,
  trangThaiTraLoi: 'ChoTraLoi',
  traLoiBoi: null,
  quanHe: null,
};

const MESSAGE = {
  id: '99',
  laCuaToi: false,
  nguoiGui: { vaiTro: 'LeTan', tenHienThi: 'Lễ tân · Quận 1' },
  noiDung: '',
  tep: { ten: 'kq.pdf', loai: 'application/pdf', dungLuong: 2048 },
  thoiDiemGui: '2026-11-27T01:00:00.000Z',
  maGui: null,
};

describe('chat F1 — API client (WCH-03)', () => {
  it('WCH-03 danh sách: đúng đường dẫn và tham số, đọc đủ khoá (kể cả SĐT của Lễ tân, con trỏ)', async () => {
    fetchMock.mockResolvedValue(
      json(200, { items: [ITEM], truocTiepTheo: '99' }),
    );
    await expect(
      getConversations({ loc: 'chua-doc', q: 'An', truoc: '120', limit: 20 }),
    ).resolves.toEqual({ items: [ITEM], truocTiepTheo: '99' });
    expect(lastCall().url).toBe(
      '/api/chat/conversations?loc=chua-doc&q=An&truoc=120&limit=20',
    );
  });

  it('WCH-03 chi tiết, tin theo con trỏ, đánh dấu đọc, số chưa đọc: đúng route, id được mã hoá', async () => {
    const detail = {
      id: '12',
      loai: 'BenhNhan_BacSi',
      doiTac: { vaiTro: 'BacSi', tenHienThi: 'TS.BS. Trần Bình' },
      quanHe: 'DaTungKham',
      banner: true,
      coTheGui: false,
      lyDoKhongGui: 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG',
    };
    fetchMock.mockResolvedValueOnce(json(200, detail));
    await expect(getConversation('12')).resolves.toEqual(detail);
    expect(lastCall().url).toBe('/api/chat/conversations/12');

    fetchMock.mockResolvedValueOnce(
      json(200, { items: [MESSAGE], coThem: true }),
    );
    await expect(
      getMessages('a/b', { cursor: { truoc: '50' }, limit: 30 }),
    ).resolves.toEqual({ items: [MESSAGE], coThem: true });
    expect(lastCall().url).toBe(
      '/api/chat/conversations/a%2Fb/messages?truoc=50&limit=30',
    );

    fetchMock.mockResolvedValueOnce(json(200, { items: [], coThem: false }));
    await getMessages('12');
    expect(lastCall().url).toBe('/api/chat/conversations/12/messages');

    fetchMock.mockResolvedValueOnce(json(200, { tinNhanCuoiDaDocId: '99' }));
    await expect(markConversationRead('12', '99')).resolves.toBe('99');
    expect(lastCall().init.method).toBe('POST');
    expect(lastCall().init.body).toBe(JSON.stringify({ tinNhanId: '99' }));

    fetchMock.mockResolvedValueOnce(json(200, { soHoiThoaiChuaDoc: 3 }));
    await expect(getChatUnreadCount()).resolves.toBe(3);
    expect(lastCall().url).toBe('/api/chat/unread-count');
  });

  it('WCH-03 tải tệp: đường dẫn nhị phân của tin, trả byte và kiểu', async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'image/webp' },
      }),
    );
    const file = await downloadAttachment('99');
    expect(lastCall().url).toBe('/api/chat/messages/99/attachment');
    expect(file.contentType).toBe('image/webp');
    expect(file.blob.size).toBe(3);
  });

  it('WCH-03 (âm): hình dạng sai ⇒ UnexpectedResponseError (vai trò lạ, số âm, thiếu khoá, thời điểm hỏng, mảng thay đối tượng)', async () => {
    const broken: [() => Promise<unknown>, unknown][] = [
      [
        () => getConversations({}),
        { items: [{ ...ITEM, loai: 'Khac' }], truocTiepTheo: null },
      ],
      [
        () => getConversations({}),
        { items: [{ ...ITEM, soTinChuaDoc: -1 }], truocTiepTheo: null },
      ],
      [() => getConversations({}), { items: [ITEM] }],
      [
        () => getMessages('1'),
        { items: [{ ...MESSAGE, thoiDiemGui: 'hôm qua' }], coThem: false },
      ],
      [
        () => getMessages('1'),
        {
          items: [
            {
              ...MESSAGE,
              nguoiGui: { vaiTro: 'QuanTriVien', tenHienThi: 'x' },
            },
          ],
          coThem: false,
        },
      ],
      [() => getChatUnreadCount(), { soHoiThoaiChuaDoc: '3' }],
      [() => getChatUnreadCount(), []],
    ];
    for (const [call, body] of broken) {
      fetchMock.mockResolvedValueOnce(json(200, body));
      await expect(call(), JSON.stringify(body)).rejects.toBeInstanceOf(
        UnexpectedResponseError,
      );
    }
  });

  it('WCH-03 lỗi API (404 hội thoại không thấy) ⇒ ApiError giữ `maLoi` cho giao diện chọn câu', async () => {
    fetchMock.mockResolvedValue(
      json(404, {
        maLoi: 'KHONG_TIM_THAY',
        thongBao: 'Không tìm thấy dữ liệu.',
      }),
    );
    const error = await getConversation('7').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, maLoi: 'KHONG_TIM_THAY' });
  });
});

describe('chat F3 — gửi tin (WCH-09)', () => {
  it('WCH-09 CAP-01 gửi: POST JSON `{ noiDung, maGui }` tới hội thoại (id mã hoá), đọc `{ hoiThoaiId, tinNhan }`; thân sai ⇒ UnexpectedResponseError', async () => {
    const mine = {
      ...MESSAGE,
      laCuaToi: true,
      noiDung: 'Chào',
      tep: null,
      maGui: 'm-1',
    };
    fetchMock.mockResolvedValueOnce(
      json(201, { hoiThoaiId: '5', tinNhan: mine }),
    );
    const sent = await sendMessage('5/x', { noiDung: 'Chào', maGui: 'm-1' });
    const { url, init } = lastCall();
    expect(url).toBe('/api/chat/conversations/5%2Fx/messages');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      noiDung: 'Chào',
      maGui: 'm-1',
    });
    expect(sent).toEqual({ hoiThoaiId: '5', tinNhan: mine });

    fetchMock.mockResolvedValueOnce(
      json(201, { hoiThoaiId: 5, tinNhan: mine }),
    );
    await expect(
      sendMessage('5', { noiDung: 'Chào', maGui: 'm-1' }),
    ).rejects.toBeInstanceOf(UnexpectedResponseError);
  });

  it('WCH-09 CAP-02 lỗi gửi giữ `maLoi` và `loi[]` (giao diện chọn câu theo mã, không theo `thongBao`)', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, {
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        thongBao: 'x',
        loi: [{ truong: 'noiDung', ma: 'NOI_DUNG_QUA_DAI' }],
      }),
    );
    const error = await sendMessage('5', { noiDung: 'a', maGui: 'm' }).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({
      status: 400,
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi: [{ truong: 'noiDung', ma: 'NOI_DUNG_QUA_DAI' }],
    });
  });
});

describe('chat F4 — bắt đầu trò chuyện (WCH-12)', () => {
  const HEAD = {
    hoiThoaiId: null,
    loai: 'BenhNhan_BacSi',
    doiTac: { vaiTro: 'BacSi', tenHienThi: 'BS. Lê Minh' },
    quanHe: 'ChuaTungKham',
    banner: true,
    coTheGui: true,
    lyDoKhongGui: null,
  };

  it('WCH-12 CAP-03 đầu khung bác sĩ, chi nhánh: đúng route (id mã hoá), đọc đủ khoá; `hoiThoaiId` sai kiểu ⇒ UnexpectedResponseError', async () => {
    fetchMock.mockResolvedValueOnce(json(200, HEAD));
    await expect(getDoctorStart('7/x')).resolves.toEqual(HEAD);
    expect(lastCall().url).toBe('/api/chat/doctors/7%2Fx');
    fetchMock.mockResolvedValueOnce(json(200, { ...HEAD, hoiThoaiId: '55' }));
    await expect(getBranchStart('3')).resolves.toMatchObject({
      hoiThoaiId: '55',
    });
    expect(lastCall().url).toBe('/api/chat/branches/3');
    fetchMock.mockResolvedValueOnce(json(200, { ...HEAD, hoiThoaiId: 55 }));
    await expect(getDoctorStart('7')).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
  });

  it('WCH-12 CAP-04 chi nhánh mặc định và danh sách chi nhánh (công khai, `pageSize=100`, không gắn token); nguồn lạ ⇒ UnexpectedResponseError', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { chiNhanhId: '2', nguon: 'LichHenSapToi' }),
    );
    await expect(getDefaultBranch()).resolves.toEqual({
      chiNhanhId: '2',
      nguon: 'LichHenSapToi',
    });
    expect(lastCall().url).toBe('/api/chat/default-branch');
    fetchMock.mockResolvedValueOnce(
      json(200, { chiNhanhId: null, nguon: 'Khac' }),
    );
    await expect(getDefaultBranch()).rejects.toBeInstanceOf(
      UnexpectedResponseError,
    );
    fetchMock.mockResolvedValueOnce(
      json(200, {
        items: [
          {
            chiNhanhId: '1',
            ten: 'Quận 1',
            diaChi: 'a',
            toaDoLat: null,
            toaDoLng: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      }),
    );
    await expect(getBranchOptions()).resolves.toEqual([
      { chiNhanhId: '1', ten: 'Quận 1', diaChi: 'a' },
    ]);
    expect(lastCall().url).toBe('/api/public/branches?pageSize=100');
    expect(
      new Headers(lastCall().init.headers).get('Authorization'),
    ).toBeNull();
  });

  it('WCH-12 CAP-05 tin đầu: POST JSON tới `/chat/doctors/:id/messages` hay `/chat/branches/:id/messages`', async () => {
    const tinNhan = {
      ...MESSAGE,
      laCuaToi: true,
      noiDung: 'Chào',
      tep: null,
      maGui: 'm',
    };
    // Mỗi lần một `Response` mới: thân chỉ đọc được một lần
    fetchMock.mockImplementation(async () =>
      json(201, { hoiThoaiId: '9', tinNhan }),
    );
    await sendFirstMessage(
      { kind: 'doctor', bacSiId: '7' },
      { noiDung: 'Chào', maGui: 'm' },
    );
    expect(lastCall().url).toBe('/api/chat/doctors/7/messages');
    expect(lastCall().init.method).toBe('POST');
    await sendFirstMessage(
      { kind: 'branch', chiNhanhId: '3' },
      { noiDung: 'Chào', maGui: 'm' },
    );
    expect(lastCall().url).toBe('/api/chat/branches/3/messages');
    expect(JSON.parse(String(lastCall().init.body))).toEqual({
      noiDung: 'Chào',
      maGui: 'm',
    });
  });
});
