import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSocketIo } from '../../../test/fake-socket-io';
import { useChatConnection } from '../realtime/chat-connection';
import {
  cleanUpFakeChatApi,
  installFakeChatApi,
  message,
} from '../testing/fake-chat-api';
import { ChatWorkspace } from './chat-workspace';

// chat F2 — khung nhắn tin khi có socket (PLAN chat 5.7): WCH-05 (dự phòng: socket nối thì ngừng làm tươi 15 giây, mất kết nối thì bật lại và gửi qua REST,
// nối lại thì ngừng) và WCH-06 (tin đẩy không tăng mốc bù — đột biến 28; nối lại tải bù, gộp, bỏ trùng, đúng thứ tự; ack quá hạn gửi lại bằng REST cùng mã).
// Router thật giữ kết nối ở khung vai trò; ở đây một component bọc gọi `useChatConnection` thay cho khung. Socket giả, API giả, đồng hồ giả. Mã ca CWR-nn là [đề xuất].
const PATH = '/benh-nhan/tin-nhan';
const NOW = new Date('2026-11-27T03:00:00.000Z');

let api: ReturnType<typeof installFakeChatApi>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => true,
  });
  fakeSocketIo.reset();
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

function Shell() {
  useChatConnection();
  return <ChatWorkspace role="BenhNhan" />;
}

async function renderChat(path = `${PATH}?hoiThoai=1`) {
  const router = createMemoryRouter(
    [{ path: '/benh-nhan/tin-nhan', element: <Shell /> }],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  await flush();
}

const socket = () => fakeSocketIo.last();
const goOnline = async () => {
  act(() => socket().serverAccept());
  await flush();
};
const goOffline = async () => {
  act(() => socket().drop('transport close'));
  await flush();
};
const messageCalls = () => api.callsTo('GET', '/chat/conversations/1/messages');
const listCalls = () => api.callsTo('GET', '/chat/conversations');
const restSends = () => api.callsTo('POST', '/chat/conversations/1/messages');
const bubbles = () =>
  within(screen.getByRole('list', { name: 'Tin nhắn' })).getAllByRole(
    'listitem',
  );
const bubbleTexts = () =>
  bubbles().map(
    (item) => item.querySelector('p.whitespace-pre-wrap')?.textContent,
  );

function seed(count = 3) {
  api.seed('1', {
    messages: Array.from({ length: count }, (_, i) =>
      message({ id: String(100 + i), noiDung: `Tin ${i + 1}` }),
    ),
  });
}

function send(text: string) {
  const box = screen.getByLabelText('Nội dung tin nhắn');
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: 'Enter' });
}

describe('chat F2 — dự phòng khi có và mất socket (WCH-05)', () => {
  it('WCH-05 CWR-01 socket nối ⇒ ngừng làm tươi 15 giây (chỉ tải bù mỗi 60 giây); mất kết nối ⇒ tải bù ngay rồi 15 giây; nối lại ⇒ ngừng', async () => {
    seed();
    await renderChat();
    await goOnline();
    const afterConnect = messageCalls().length;
    await flush(45_000);
    expect(messageCalls()).toHaveLength(afterConnect);
    await flush(15_000);
    expect(messageCalls()).toHaveLength(afterConnect + 1);

    await goOffline();
    const afterDrop = messageCalls().length;
    expect(afterDrop).toBe(afterConnect + 2);
    await flush(15_000);
    expect(messageCalls()).toHaveLength(afterDrop + 1);

    await goOnline();
    const afterReconnect = messageCalls().length;
    await flush(30_000);
    expect(messageCalls()).toHaveLength(afterReconnect);
  });

  it('WCH-05 CWR-02 socket nối ⇒ gửi bằng `chat:gui` (không POST REST); mất kết nối ⇒ gửi bằng REST', async () => {
    seed(1);
    await renderChat();
    await goOnline();
    send('Qua socket');
    await flush();
    expect(restSends()).toHaveLength(0);
    const emit = socket().emitted.at(-1)!;
    expect(emit.event).toBe('chat:gui');
    const payload = emit.payload as {
      hoiThoaiId: string;
      noiDung: string;
      maGui: string;
    };
    expect(payload).toMatchObject({ hoiThoaiId: '1', noiDung: 'Qua socket' });
    act(() =>
      emit.reply({
        ok: true,
        hoiThoaiId: '1',
        tinNhan: message({
          id: '500',
          laCuaToi: true,
          noiDung: 'Qua socket',
          maGui: payload.maGui,
        }),
      }),
    );
    await flush();
    expect(bubbleTexts()).toEqual(['Tin 1', 'Qua socket']);

    await goOffline();
    const emitted = socket().emitted.length;
    send('Qua REST');
    await flush();
    expect(restSends()).toHaveLength(1);
    expect(socket().emitted).toHaveLength(emitted);
    expect(bubbleTexts().at(-1)).toBe('Qua REST');
  });

  it('WCH-05 CWR-03 mất kết nối sau khi đã nối ⇒ dòng "Đang nối lại, tin mới có thể đến chậm."; nối lại thì ẩn; chưa từng nối thì không hiện', async () => {
    seed(1);
    await renderChat();
    expect(
      screen.queryByText('Đang nối lại, tin mới có thể đến chậm.'),
    ).toBeNull();
    await goOnline();
    await goOffline();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đang nối lại, tin mới có thể đến chậm.',
    );
    await goOnline();
    expect(
      screen.queryByText('Đang nối lại, tin mới có thể đến chậm.'),
    ).toBeNull();
  });
});

describe('chat F2 — tin đẩy, mốc bù, gộp (WCH-06)', () => {
  it('WCH-06 CWR-04 (đột biến 28) tin đẩy hiện ngay và vào vùng log nhưng KHÔNG tăng mốc bù: lượt tải bù vẫn hỏi `sau=<id REST cuối>` và lấy được tin chen giữa', async () => {
    seed(3);
    await renderChat();
    await goOnline();
    // Máy chủ có tin 150 (đẩy bị rớt) và 200 (đẩy tới nơi)
    const lost = message({ id: '150', noiDung: 'Tin bị rớt khi đẩy' });
    const pushed = message({ id: '200', noiDung: 'Tin được đẩy' });
    api.threads.get('1')!.push(lost, pushed);
    act(() =>
      socket().push('chat:tin-moi', { hoiThoaiId: '1', tinNhan: pushed }),
    );
    await flush();
    expect(bubbleTexts()).toEqual(['Tin 1', 'Tin 2', 'Tin 3', 'Tin được đẩy']);
    expect(
      screen.getByRole('log', { name: 'Tin nhắn mới đến' }),
    ).toHaveTextContent('Tin được đẩy');

    await flush(60_000);
    expect(messageCalls().at(-1)?.query.get('sau')).toBe('102');
    expect(bubbleTexts()).toEqual([
      'Tin 1',
      'Tin 2',
      'Tin 3',
      'Tin bị rớt khi đẩy',
      'Tin được đẩy',
    ]);
  });

  it('WCH-06 CWR-05 nối lại ⇒ tải bù ngay: gộp, bỏ trùng tin đã đẩy, đúng thứ tự tăng dần; tin đẩy của hội thoại khác chỉ làm tươi danh sách', async () => {
    seed(2);
    api.seed('2', { messages: [message({ id: '90' })] });
    await renderChat();
    await goOnline();
    const pushed = message({ id: '300', noiDung: 'C' });
    act(() =>
      socket().push('chat:tin-moi', { hoiThoaiId: '1', tinNhan: pushed }),
    );
    await flush();
    await goOffline();
    api.threads
      .get('1')!
      .push(
        message({ id: '250', noiDung: 'B' }),
        pushed,
        message({ id: '310', noiDung: 'D' }),
      );
    const before = messageCalls().length;
    await goOnline();
    expect(messageCalls().length).toBeGreaterThan(before);
    expect(bubbleTexts()).toEqual(['Tin 1', 'Tin 2', 'B', 'C', 'D']);

    const lists = listCalls().length;
    const thread = bubbleTexts();
    act(() =>
      socket().push('chat:tin-moi', {
        hoiThoaiId: '2',
        tinNhan: message({ id: '91' }),
      }),
    );
    await flush();
    expect(listCalls()).toHaveLength(lists + 1);
    expect(bubbleTexts()).toEqual(thread);
  });

  it('WCH-06 CWR-06 không có ack sau 10 giây ⇒ gửi lại bằng REST với CÙNG `maGui`; tin hiện một lần', async () => {
    seed(1);
    await renderChat();
    await goOnline();
    send('Chưa rõ đã tới chưa');
    await flush();
    const emitted = socket().emitted.at(-1)!.payload as { maGui: string };
    expect(restSends()).toHaveLength(0);
    await flush(10_000);
    expect(restSends()).toHaveLength(1);
    expect((restSends()[0]!.body as { maGui: string }).maGui).toBe(
      emitted.maGui,
    );
    expect(screen.getAllByText('Chưa rõ đã tới chưa')).toHaveLength(1);
    expect(screen.queryByText('Đang gửi…')).toBeNull();
  });

  it('WCH-06 CWR-07 tin của mình được đẩy về trước ack ⇒ không hiện hai lần (bong bóng "Đang gửi…" cùng mã được gỡ)', async () => {
    seed(1);
    await renderChat();
    await goOnline();
    send('Một lần thôi');
    await flush();
    const emit = socket().emitted.at(-1)!;
    const maGui = (emit.payload as { maGui: string }).maGui;
    const mine = message({
      id: '600',
      laCuaToi: true,
      noiDung: 'Một lần thôi',
      maGui,
    });
    act(() =>
      socket().push('chat:tin-moi', { hoiThoaiId: '1', tinNhan: mine }),
    );
    await flush();
    expect(screen.getAllByText('Một lần thôi')).toHaveLength(1);
    act(() => emit.reply({ ok: true, hoiThoaiId: '1', tinNhan: mine }));
    await flush();
    expect(screen.getAllByText('Một lần thôi')).toHaveLength(1);
    expect(
      screen.getByRole('log', { name: 'Tin nhắn mới đến' }),
    ).not.toHaveTextContent('Một lần thôi');
  });
});
