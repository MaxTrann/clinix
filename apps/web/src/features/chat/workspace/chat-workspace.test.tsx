import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeMatchMedia } from '../../../test/fake-match-media';
import type { ChatRole } from '../api/chat-types';
import {
  apiError,
  cleanUpFakeChatApi,
  installFakeChatApi,
  message,
} from '../testing/fake-chat-api';
import { ChatWorkspace } from './chat-workspace';

// chat F3 — khung nhắn tin dùng chung (PLAN chat 5.13, 7.13): WCH-07…WCH-11, WCH-15, WCH-16, BCH-04; đột biến 29 (gửi lại sinh mã mới) và phần hành vi của 30
// (nội dung vào kho trình duyệt hay chạy như HTML; phần quét mã nằm ở `architecture.test.ts`). API giả theo hợp đồng 5.6, đồng hồ giả (cả hẹn giờ, để đếm nhịp
// làm tươi 15 giây). Mặc định màn rộng (happy-dom 1024 px); màn hẹp giả `matchMedia`. Mã ca CWS-nn là [đề xuất].
const PATH = '/benh-nhan/tin-nhan';
// 10:00 ngày 27/11/2026 giờ Việt Nam
const NOW = new Date('2026-11-27T03:00:00.000Z');

let api: ReturnType<typeof installFakeChatApi>;
let visibility: DocumentVisibilityState = 'visible';
let online = true;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  visibility = 'visible';
  online = true;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => online,
  });
  api = installFakeChatApi();
});

afterEach(() => {
  vi.useRealTimers();
  cleanUpFakeChatApi();
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(navigator, 'onLine');
});

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function renderChat({
  role = 'BenhNhan',
  path = PATH,
  strict = false,
}: { role?: ChatRole; path?: string; strict?: boolean } = {}) {
  const router = createMemoryRouter(
    [{ path: '/benh-nhan/tin-nhan', element: <ChatWorkspace role={role} /> }],
    { initialEntries: [path] },
  );
  const app = <RouterProvider router={router} />;
  render(strict ? <StrictMode>{app}</StrictMode> : app);
  await flush();
  return router;
}

const list = () => screen.getByRole('list', { name: 'Danh sách hội thoại' });
const rows = () => within(list()).getAllByRole('button');
const composer = () => screen.getByLabelText('Nội dung tin nhắn');
const sendButton = () => screen.getByRole('button', { name: 'Gửi' });
const listCalls = () => api.callsTo('GET', '/chat/conversations');
const messageCalls = (id = '1') =>
  api.callsTo('GET', `/chat/conversations/${id}/messages`);
const sendCalls = (id = '1') =>
  api.callsTo('POST', `/chat/conversations/${id}/messages`);
const readCalls = (id = '1') =>
  api.callsTo('POST', `/chat/conversations/${id}/read`);
const bubbles = () =>
  within(screen.getByRole('list', { name: 'Tin nhắn' })).getAllByRole(
    'listitem',
  );

function type(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
}

function pressEnter(shiftKey = false) {
  fireEvent.keyDown(composer(), { key: 'Enter', shiftKey });
}

/** Hội thoại 1 có `count` tin (tin cuối là của bác sĩ). */
function seedThread(count = 3, id = '1', extra = {}) {
  const messages = Array.from({ length: count }, (_, i) =>
    message({
      id: String(100 + i),
      noiDung: `Tin ${i + 1}`,
      thoiDiemGui: new Date(NOW.getTime() - (count - i) * 60_000).toISOString(),
    }),
  );
  api.seed(id, { messages, ...extra });
  return messages;
}

describe('chat F3 — danh sách hội thoại (WCH-07)', () => {
  it('WCH-07 CWS-01 tải ⇒ dòng có tên, xem trước, giờ VN, số chưa đọc (99+) và tên truy cập kèm số; Bệnh nhân thấy nhãn loại', async () => {
    api.seed('1', {
      row: {
        soTinChuaDoc: 100,
        tinCuoi: {
          id: '10',
          trichDan: 'Kết quả xét nghiệm',
          nguoiGuiHienThi: 'BS. Trần Bình',
          thoiDiemGui: '2026-11-27T01:05:00.000Z',
        },
      },
    });
    api.seed('2', {
      row: {
        loai: 'BenhNhan_LeTan',
        doiTac: { vaiTro: 'LeTan', tenHienThi: 'Lễ tân · Chi nhánh Q1' },
        quanHe: null,
        tinCuoi: {
          id: '9',
          trichDan: '[Ảnh]',
          nguoiGuiHienThi: 'Bạn',
          thoiDiemGui: '2026-11-25T01:00:00.000Z',
        },
      },
    });
    await renderChat();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Tin nhắn' }),
    ).toBeInTheDocument();
    const [first, second] = rows();
    expect(first).toHaveAccessibleName('BS. Trần Bình, hơn 99 tin chưa đọc');
    expect(first).toHaveTextContent('08:05');
    expect(first).toHaveTextContent('99+');
    expect(first).toHaveTextContent('BS. Trần Bình: Kết quả xét nghiệm');
    expect(first).toHaveTextContent('Bác sĩ');
    expect(first).toHaveTextContent('Đã từng khám');
    expect(second).toHaveAccessibleName('Lễ tân · Chi nhánh Q1');
    expect(second).toHaveTextContent('25/11');
    expect(second).toHaveTextContent('Bạn: [Ảnh]');
    expect(second).toHaveTextContent('Lễ tân');
  });

  it('WCH-07 CWS-02 rỗng ⇒ "Chưa có hội thoại nào."; lỗi mạng ⇒ khối lỗi có Thử lại, thử lại thì tải được', async () => {
    api.replyNext('GET /chat/conversations', { network: true });
    await renderChat();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không kết nối được tới hệ thống',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await flush();
    expect(screen.getByText('Chưa có hội thoại nào.')).toBeInTheDocument();
    expect(listCalls()).toHaveLength(2);
  });

  it('WCH-07 CWS-03 tab gửi `loc` lên máy chủ (Bệnh nhân bốn tab, không có ô tìm); web không tự lọc', async () => {
    api.seed('1', { row: { soTinChuaDoc: 0 } });
    await renderChat();
    const tabs = within(
      screen.getByRole('group', { name: 'Lọc hội thoại' }),
    ).getAllByRole('button');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Tất cả',
      'Chưa đọc',
      'Bác sĩ',
      'Lễ tân',
    ]);
    expect(screen.queryByRole('search')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Chưa đọc' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đang tải danh sách hội thoại',
    );
    await flush();
    expect(listCalls().at(-1)?.query.get('loc')).toBe('chua-doc');
    expect(screen.getByRole('button', { name: 'Chưa đọc' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Chưa có hội thoại nào.')).toBeInTheDocument();
  });

  it('WCH-07 CWS-04 Lễ tân: ô tìm gửi `q` lên máy chủ; từ khoá sai ⇒ câu theo `TU_KHOA_KHONG_HOP_LE`; tên, SĐT và nhãn trả lời', async () => {
    api.seed('1', {
      row: {
        loai: 'BenhNhan_LeTan',
        doiTac: {
          vaiTro: 'BenhNhan',
          tenHienThi: 'Nguyễn An',
          soDienThoai: '0901234567',
        },
        trangThaiTraLoi: 'ChoTraLoi',
        quanHe: null,
      },
    });
    api.seed('2', {
      row: {
        loai: 'BenhNhan_LeTan',
        doiTac: {
          vaiTro: 'BenhNhan',
          tenHienThi: 'Lê Chi',
          soDienThoai: '0907654321',
        },
        trangThaiTraLoi: 'DaTraLoi',
        traLoiBoi: 'Bạn',
        quanHe: null,
      },
    });
    await renderChat({ role: 'LeTan' });
    expect(rows()[0]).toHaveTextContent('Nguyễn An · 0901234567');
    expect(rows()[0]).toHaveTextContent('Chờ trả lời');
    expect(rows()[1]).toHaveTextContent('Đã trả lời · Bạn');
    expect(
      within(screen.getByRole('group', { name: 'Lọc hội thoại' })).getAllByRole(
        'button',
      ),
    ).toHaveLength(2);
    const search = screen.getByLabelText(
      'Tìm theo họ tên, số điện thoại hoặc email',
    );
    fireEvent.change(search, { target: { value: ' An ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
    await flush();
    expect(listCalls().at(-1)?.query.get('q')).toBe('An');
    expect(rows()).toHaveLength(1);
    fireEvent.change(search, { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Từ khoá cần từ 2 đến 100 ký tự.',
    );
  });

  it('WCH-07 CWS-05 "Xem thêm" theo con trỏ `truoc`: nối trang sau, không trùng, hết thì ẩn nút', async () => {
    for (let i = 0; i < 25; i += 1)
      api.seed(String(i + 1), {
        row: {
          doiTac: { vaiTro: 'BacSi', tenHienThi: `BS. Số ${i + 1}` },
          tinCuoi: {
            id: String(500 - i),
            trichDan: 'x',
            nguoiGuiHienThi: 'Bạn',
            thoiDiemGui: '2026-11-27T01:00:00.000Z',
          },
        },
      });
    await renderChat();
    expect(rows()).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: 'Xem thêm' }));
    await flush();
    expect(listCalls().at(-1)?.query.get('truoc')).toBe('481');
    expect(rows()).toHaveLength(25);
    expect(screen.queryByRole('button', { name: 'Xem thêm' })).toBeNull();
  });
});

describe('chat F3 — khung tin (WCH-08, BCH-04)', () => {
  it('WCH-08 CWS-06 mở dòng ⇒ `?hoiThoai=`; tin tăng dần, ngăn "Hôm qua", "Hôm nay", dd/MM, giờ VN; banner và chip quan hệ', async () => {
    api.seed('1', {
      messages: [
        message({
          id: '101',
          noiDung: 'Tin cũ',
          thoiDiemGui: '2026-11-20T02:00:00.000Z',
        }),
        message({
          id: '102',
          noiDung: 'Hôm qua nhắn',
          thoiDiemGui: '2026-11-26T16:30:00.000Z',
        }),
        message({
          id: '103',
          noiDung: 'Sáng nay',
          laCuaToi: true,
          thoiDiemGui: '2026-11-26T17:10:00.000Z',
        }),
      ],
    });
    const router = await renderChat();
    fireEvent.click(rows()[0]!);
    await flush();
    expect(router.state.location.search).toBe('?hoiThoai=1');
    const items = bubbles();
    expect(items[0]).toHaveTextContent('20/11');
    expect(items[0]).toHaveTextContent('Tin cũ');
    expect(items[0]).toHaveTextContent('09:00');
    expect(items[1]).toHaveTextContent('Hôm qua');
    expect(items[1]).toHaveTextContent('23:30');
    expect(items[2]).toHaveTextContent('Hôm nay');
    expect(items[2]).toHaveTextContent('00:10');
    expect(
      screen.getByText(
        'Chỉ tư vấn sơ bộ, không thay khám trực tiếp, không kê đơn.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'BS. Trần Bình',
    );
    expect(screen.getAllByText('Đã từng khám').length).toBeGreaterThan(0);
  });

  it('WCH-08 CWS-07 "Xem tin cũ hơn" gọi `truoc=<id đầu>` rồi nối lên trên', async () => {
    seedThread(35);
    await renderChat({ path: `${PATH}?hoiThoai=1` });
    expect(bubbles()).toHaveLength(30);
    fireEvent.click(screen.getByRole('button', { name: 'Xem tin cũ hơn' }));
    await flush();
    expect(messageCalls().at(-1)?.query.get('truoc')).toBe('105');
    expect(bubbles()).toHaveLength(35);
    expect(bubbles()[0]).toHaveTextContent('Tin 1');
    expect(screen.queryByRole('button', { name: 'Xem tin cũ hơn' })).toBeNull();
  });

  it('WCH-08 WCH-15 CWS-08 làm tươi 15 giây bằng `sau=<mốc>`: tin mới đến nối xuống cuối và CHỈ tin đó vào vùng log; tab ẩn hay mất mạng thì không gọi', async () => {
    seedThread(3);
    await renderChat({ path: `${PATH}?hoiThoai=1` });
    const log = screen.getByRole('log', { name: 'Tin nhắn mới đến' });
    expect(log).toBeEmptyDOMElement();
    const before = messageCalls().length;
    api.threads
      .get('1')!
      .push(message({ id: '200', noiDung: 'Tin mới của bác sĩ' }));
    await flush(15_000);
    expect(messageCalls()).toHaveLength(before + 1);
    expect(messageCalls().at(-1)?.query.get('sau')).toBe('102');
    expect(bubbles().at(-1)).toHaveTextContent('Tin mới của bác sĩ');
    expect(log).toHaveTextContent('BS. Trần Bình: Tin mới của bác sĩ');
    expect(log).not.toHaveTextContent('Tin 1');

    visibility = 'hidden';
    const hiddenStart = messageCalls().length;
    await flush(45_000);
    expect(messageCalls()).toHaveLength(hiddenStart);

    visibility = 'visible';
    online = false;
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    await flush(45_000);
    expect(messageCalls()).toHaveLength(hiddenStart);
  });

  it('WCH-08 CWS-09 mốc bù KHÔNG nhảy theo tin mình vừa gửi: tin người kia có id nhỏ hơn vẫn được tải ở lượt sau', async () => {
    seedThread(2);
    await renderChat({ path: `${PATH}?hoiThoai=1` });
    // Bác sĩ gửi tin 150 nhưng web chưa thấy; mình gửi tin (id lớn hơn) ngay sau đó
    api.threads
      .get('1')!
      .push(message({ id: '150', noiDung: 'Tin chen giữa' }));
    type('Tin của tôi');
    pressEnter();
    await flush();
    await flush(15_000);
    expect(messageCalls().at(-1)?.query.get('sau')).toBe('101');
    expect(bubbles().map((item) => item.textContent)).toEqual([
      expect.stringContaining('Tin 1'),
      expect.stringContaining('Tin 2'),
      expect.stringContaining('Tin chen giữa'),
      expect.stringContaining('Tin của tôi'),
    ]);
  });

  it('WCH-08 CWS-10 tự cuộn khi đang ở cuối; đang đọc tin cũ thì không kéo đi mà hiện "Tin mới ↓"', async () => {
    seedThread(3);
    await renderChat({ path: `${PATH}?hoiThoai=1` });
    const box = screen.getByTestId('chat-scroller');
    let top = 600;
    let height = 1000;
    Object.defineProperty(box, 'scrollHeight', {
      configurable: true,
      get: () => height,
    });
    Object.defineProperty(box, 'clientHeight', {
      configurable: true,
      get: () => 400,
    });
    Object.defineProperty(box, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        top = value;
      },
    });
    fireEvent.scroll(box);
    height = 1100;
    api.threads.get('1')!.push(message({ id: '201', noiDung: 'A' }));
    await flush(15_000);
    expect(top).toBe(1100);
    expect(screen.queryByRole('button', { name: 'Tin mới ↓' })).toBeNull();

    top = 100;
    fireEvent.scroll(box);
    height = 1200;
    api.threads.get('1')!.push(message({ id: '202', noiDung: 'B' }));
    await flush(15_000);
    expect(top).toBe(100);
    fireEvent.click(screen.getByRole('button', { name: 'Tin mới ↓' }));
    expect(top).toBe(1200);
    expect(screen.queryByRole('button', { name: 'Tin mới ↓' })).toBeNull();
  });

  it('BCH-04 CWS-11 nội dung `<img src=x onerror=…>` hiện nguyên chữ, không tạo phần tử, không chạy', async () => {
    const payload = '<img src=x onerror="window.__xss=1">';
    api.seed('1', { messages: [message({ id: '101', noiDung: payload })] });
    await renderChat({ path: `${PATH}?hoiThoai=1` });
    expect(bubbles()[0]).toHaveTextContent(payload);
    expect(
      screen.getByRole('list', { name: 'Tin nhắn' }).querySelector('img'),
    ).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });
});

describe('chat F3 — ô soạn và gửi (WCH-09)', () => {
  it('WCH-09 CWS-12 Enter gửi, Shift+Enter không gửi; rỗng hay chỉ khoảng trắng không gửi; gửi xong hiện tin của máy chủ một lần', async () => {
    seedThread(1);
    await renderChat({ path: `${PATH}?hoiThoai=1` });
    type('   \n ');
    pressEnter();
    expect(sendButton()).toBeDisabled();
    type('Dòng một');
    pressEnter(true);
    await flush();
    expect(sendCalls()).toHaveLength(0);
    pressEnter();
    expect(composer()).toHaveValue('');
    expect(screen.getByText('Đang gửi…')).toBeInTheDocument();
    await flush();
    expect(sendCalls()).toHaveLength(1);
    const body = sendCalls()[0]!.body as { noiDung: string; maGui: string };
    expect(body.noiDung).toBe('Dòng một');
    expect(body.maGui).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.queryByText('Đang gửi…')).toBeNull();
    expect(screen.getAllByText('Dòng một')).toHaveLength(1);
  });

  it('WCH-09 CWS-13 đếm ký tự từ 1800; quá 2000 thì khoá nút Gửi; Enter không gửi', async () => {
    seedThread(1);
    await renderChat({ path: `${PATH}?hoiThoai=1` });
    type('a'.repeat(1799));
    expect(screen.queryByText(/\/2000/)).toBeNull();
    type('😀'.repeat(1800));
    expect(screen.getByText('1800/2000')).toBeInTheDocument();
    type('a'.repeat(2001));
    expect(screen.getByText(/2001\/2000/)).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
    pressEnter();
    await flush();
    expect(sendCalls()).toHaveLength(0);
  });

  it('WCH-09 CWS-14 (đột biến 29) lỗi mạng ⇒ giữ nội dung, câu lỗi mạng; "Gửi lại" dùng CÙNG `maGui`; máy chủ đã nhận thì vẫn một tin', async () => {
    seedThread(1);
    await renderChat({ path: `${PATH}?hoiThoai=1` });
    api.replyNext('POST /chat/conversations/1/messages', { network: true });
    type('Cho tôi hỏi');
    pressEnter();
    await flush();
    expect(screen.getByText('Cho tôi hỏi')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Chưa gửi được do mạng. Nội dung vẫn còn, hãy thử lại.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }));
    await flush();
    const [first, second] = sendCalls().map(
      (call) => (call.body as { maGui: string }).maGui,
    );
    expect(second).toBe(first);
    expect(screen.queryByRole('button', { name: 'Gửi lại' })).toBeNull();
    expect(screen.getAllByText('Cho tôi hỏi')).toHaveLength(1);
  });

  it('WCH-09 CWS-15 bấm đúp "Gửi lại" hay Enter hai lần khi đang gửi ⇒ MỘT yêu cầu', async () => {
    seedThread(1);
    await renderChat({ path: `${PATH}?hoiThoai=1` });
    api.replyNext(
      'POST /chat/conversations/1/messages',
      apiError(503, 'HE_THONG_DANG_BAN'),
    );
    type('Xin chào');
    pressEnter();
    pressEnter();
    await flush();
    expect(sendCalls()).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Hệ thống đang bận. Thử lại sau.',
    );
    api.replyNext('POST /chat/conversations/1/messages', { hold: true });
    const resend = screen.getByRole('button', { name: 'Gửi lại' });
    fireEvent.click(resend);
    fireEvent.click(resend);
    await flush();
    expect(sendCalls()).toHaveLength(2);
  });

  it('WCH-09 CWS-16 `CHAT_MA_GUI_DA_DUNG` ⇒ lần gửi lại dùng mã MỚI; câu theo `maLoi`, không lặp `thongBao` của máy chủ', async () => {
    seedThread(1);
    await renderChat({ path: `${PATH}?hoiThoai=1` });
    api.replyNext(
      'POST /chat/conversations/1/messages',
      apiError(409, 'CHAT_MA_GUI_DA_DUNG'),
    );
    type('Nội dung A');
    pressEnter();
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Chưa gửi được. Vui lòng gửi lại.',
    );
    expect(screen.queryByText('câu của máy chủ')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }));
    await flush();
    const [first, second] = sendCalls().map(
      (call) => (call.body as { maGui: string }).maGui,
    );
    expect(second).not.toBe(first);
  });

  it('WCH-09 CWS-17 (đột biến 30) nháp giữ theo hội thoại trong bộ nhớ khi đổi hội thoại; không ghi kho trình duyệt', async () => {
    localStorage.clear();
    sessionStorage.clear();
    seedThread(1, '1');
    seedThread(1, '2');
    await renderChat();
    fireEvent.click(rows()[0]!);
    await flush();
    type('Nháp cho hội thoại 1');
    fireEvent.click(rows()[1]!);
    await flush();
    expect(composer()).toHaveValue('');
    fireEvent.click(rows()[0]!);
    await flush();
    expect(composer()).toHaveValue('Nháp cho hội thoại 1');
    // Kho trình duyệt vẫn trống sau khi gõ, đổi hội thoại (spy `Storage.prototype` không bắt được kho của happy-dom)
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

describe('chat F3 — không gửi được, 404 (WCH-10)', () => {
  it('WCH-10 CWS-18 `coTheGui` sai ⇒ ô soạn khoá kèm lý do (Bệnh nhân có gợi ý nhắn lễ tân)', async () => {
    seedThread(1, '1', {
      head: {
        coTheGui: false,
        lyDoKhongGui: 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG',
      },
    });
    await renderChat({ path: `${PATH}?hoiThoai=1` });
    expect(composer()).toBeDisabled();
    expect(composer()).toHaveAccessibleDescription(
      'Tài khoản người nhận đang ngưng hoạt động nên chưa gửi được. Bạn có thể nhắn lễ tân.',
    );
    expect(sendButton()).toBeDisabled();
  });

  it('WCH-10 CWS-19 gửi gặp 409 người nhận ngưng hoạt động ⇒ khoá ô soạn ngay; Bác sĩ không thấy gợi ý nhắn lễ tân', async () => {
    seedThread(1);
    await renderChat({ role: 'BacSi', path: `${PATH}?hoiThoai=1` });
    api.replyNext(
      'POST /chat/conversations/1/messages',
      apiError(409, 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG'),
    );
    type('Chào bạn');
    pressEnter();
    await flush();
    expect(composer()).toBeDisabled();
    expect(composer()).toHaveAccessibleDescription(
      'Tài khoản người nhận đang ngưng hoạt động nên chưa gửi được.',
    );
  });

  it('WCH-10 CWS-20 hội thoại không thấy hay không phải thành viên (404) ⇒ "Bạn không có quyền xem hội thoại này.", không ô soạn', async () => {
    await renderChat({ path: `${PATH}?hoiThoai=99` });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bạn không có quyền xem hội thoại này.',
    );
    expect(screen.queryByLabelText('Nội dung tin nhắn')).toBeNull();
    expect(readCalls('99')).toHaveLength(0);
  });
});

describe('chat F3 — đánh dấu đọc (WCH-11)', () => {
  it('WCH-11 CWS-21 mở hội thoại (StrictMode) ⇒ MỘT lần `read` với id lớn nhất; số ở dòng về 0', async () => {
    seedThread(3, '1', { row: { soTinChuaDoc: 2 } });
    await renderChat({ strict: true });
    expect(rows()[0]).toHaveAccessibleName('BS. Trần Bình, 2 tin chưa đọc');
    fireEvent.click(rows()[0]!);
    await flush();
    expect(readCalls()).toHaveLength(1);
    expect(readCalls()[0]!.body).toEqual({ tinNhanId: '102' });
    expect(rows()[0]).toHaveAccessibleName('BS. Trần Bình');
  });

  it('WCH-11 CWS-22 tab ẩn ⇒ chưa đánh dấu; hiện lại ⇒ đánh dấu; tin mới đến ⇒ đánh dấu id mới, không lặp giá trị cũ', async () => {
    seedThread(2);
    visibility = 'hidden';
    await renderChat({ path: `${PATH}?hoiThoai=1` });
    expect(readCalls()).toHaveLength(0);
    visibility = 'visible';
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    expect(readCalls().map((call) => call.body)).toEqual([
      { tinNhanId: '101' },
    ]);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    expect(readCalls()).toHaveLength(1);
    api.threads.get('1')!.push(message({ id: '300', noiDung: 'Mới' }));
    await flush(15_000);
    expect(readCalls().map((call) => call.body)).toEqual([
      { tinNhanId: '101' },
      { tinNhanId: '300' },
    ]);
  });
});

describe('chat F3 — bố cục và bàn phím (WCH-15, WCH-16)', () => {
  it('WCH-16 CWS-23 từ 1024 px: hai cột (danh sách và khung cùng lúc, không có "Quay lại")', async () => {
    seedThread(1);
    await renderChat({ path: `${PATH}?hoiThoai=1` });
    expect(list()).toBeInTheDocument();
    expect(composer()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quay lại' })).toBeNull();
    expect(screen.getByText('Tin 1')).toBeInTheDocument();
  });

  it('WCH-16 WCH-15 CWS-24 375 px: một màn; mở dòng ⇒ chỉ khung, tiêu điểm ở tiêu đề; "Quay lại" và Esc về danh sách, tiêu điểm về dòng vừa mở', async () => {
    fakeMatchMedia(375);
    seedThread(1, '1');
    seedThread(1, '2');
    const router = await renderChat();
    expect(screen.queryByLabelText('Nội dung tin nhắn')).toBeNull();
    fireEvent.click(rows()[1]!);
    await flush();
    expect(
      screen.queryByRole('list', { name: 'Danh sách hội thoại' }),
    ).toBeNull();
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));
    await flush();
    expect(router.state.location.search).toBe('');
    expect(rows()[1]).toHaveFocus();
    fireEvent.click(rows()[0]!);
    await flush();
    fireEvent.keyDown(document, { key: 'Escape' });
    await flush();
    expect(screen.queryByLabelText('Nội dung tin nhắn')).toBeNull();
    expect(rows()[0]).toHaveFocus();
  });
});
