import { act, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../shared/api/auth-hooks';
import { ApiError } from '../../../shared/api/errors';
import { fakeSocketIo } from '../../../test/fake-socket-io';
import { message } from '../testing/fake-chat-api';
import {
  SocketAckTimeoutError,
  SocketUnavailableError,
  getChatConnectionSnapshot,
  sendOverSocket,
  useChatConnection,
} from './chat-connection';

// chat F2 — kết nối WebSocket ở web (PLAN chat 5.7): WCH-04 (token trong gói xác thực, token mới khi nối lại, đóng khi gỡ, một kết nối mỗi tab) và phần ack
// của WCH-06. `socket.io-client` là bản giả của `test/fake-socket-io.ts` (cài ở `test/setup.ts`); `fetch` giả cho route REST làm mới token. Mã ca CRT-nn là [đề xuất].
let token = 'token-1';
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fakeSocketIo.reset();
  token = 'token-1';
  setApiAuthHooks({
    getAccessToken: () => token,
    recoverFromUnauthorized: async () => false,
  });
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ soHoiThoaiChuaDoc: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

/** Xả microtask và các promise của lời gọi REST. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function hold({ strict = false } = {}) {
  return renderHook(() => useChatConnection(), {
    wrapper: strict
      ? ({ children }: { children: ReactNode }) => (
          <StrictMode>{children}</StrictMode>
        )
      : undefined,
  });
}

describe('chat F2 — kết nối (WCH-04)', () => {
  it('WCH-04 CRT-01 mở MỘT socket (cả StrictMode): `/api/socket.io/`, chỉ websocket, token trong gói xác thực, không trên URL', async () => {
    const view = hold({ strict: true });
    await settle();
    expect(fakeSocketIo.sockets).toHaveLength(1);
    const socket = fakeSocketIo.last();
    expect(socket.url).toBeUndefined();
    expect(socket.options).toMatchObject({
      path: '/api/socket.io/',
      transports: ['websocket'],
      autoConnect: false,
    });
    expect(socket.handshakes).toEqual([{ token: 'token-1' }]);
    expect(getChatConnectionSnapshot().status).toBe('connecting');
    act(() => socket.serverAccept());
    expect(getChatConnectionSnapshot()).toEqual({
      status: 'connected',
      everConnected: true,
    });
    view.unmount();
  });

  it('WCH-04 CRT-02 hai nơi giữ dùng chung một socket; nơi cuối nhả thì đóng và gỡ mọi listener', async () => {
    const first = hold();
    const second = hold();
    await settle();
    expect(fakeSocketIo.sockets).toHaveLength(1);
    const socket = fakeSocketIo.last();
    act(() => socket.serverAccept());
    first.unmount();
    await settle();
    expect(socket.closedByClient).toBe(false);
    second.unmount();
    await settle();
    expect(socket.closedByClient).toBe(true);
    expect(socket.listenerCount()).toBe(0);
    expect(getChatConnectionSnapshot()).toEqual({
      status: 'offline',
      everConnected: false,
    });
  });

  it('WCH-04 CRT-03 bắt tay bị từ chối vì token ⇒ gọi REST (lớp client làm mới token) rồi nối lại bằng token MỚI', async () => {
    const view = hold();
    await settle();
    const socket = fakeSocketIo.last();
    token = 'token-2';
    act(() => socket.serverReject('TOKEN_KHONG_HOP_LE'));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/chat/unread-count');
    expect(socket.handshakes).toEqual([
      { token: 'token-1' },
      { token: 'token-2' },
    ]);
    act(() => socket.serverAccept());
    expect(getChatConnectionSnapshot().status).toBe('connected');
    view.unmount();
  });

  it('WCH-04 CRT-04 máy chủ chủ động ngắt (token hết hạn) ⇒ làm mới rồi nối lại; mất mạng thường ⇒ để thư viện tự nối, không gọi REST', async () => {
    const view = hold();
    await settle();
    const socket = fakeSocketIo.last();
    act(() => socket.serverAccept());
    act(() => socket.drop('transport close'));
    await settle();
    expect(getChatConnectionSnapshot()).toEqual({
      status: 'connecting',
      everConnected: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(socket.connectCalls).toBe(1);
    act(() => socket.serverAccept());
    token = 'token-3';
    act(() => socket.drop('io server disconnect'));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(socket.connectCalls).toBe(2);
    expect(socket.handshakes.at(-1)).toEqual({ token: 'token-3' });
    view.unmount();
  });

  it('WCH-04 CRT-05 (âm) sai vai trò hay quá số kết nối ⇒ thôi nối (REST dự phòng); bị từ chối vì token quá 3 lần liền ⇒ thôi', async () => {
    const view = hold();
    await settle();
    const socket = fakeSocketIo.last();
    act(() => socket.serverReject('CHAT_QUA_NHIEU_KET_NOI'));
    await settle();
    expect(getChatConnectionSnapshot().status).toBe('offline');
    expect(socket.connectCalls).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();

    for (let i = 0; i < 4; i += 1) {
      act(() => socket.serverReject('PHIEN_HET_HIEU_LUC'));
      await settle();
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(socket.connectCalls).toBe(4);
    expect(getChatConnectionSnapshot().status).toBe('offline');
    view.unmount();
  });
});

describe('chat F2 — gửi qua socket (WCH-06)', () => {
  const input = { hoiThoaiId: '1', noiDung: 'Chào', maGui: 'ma-1' };

  it('WCH-06 CRT-06 `chat:gui` có ack: ok ⇒ thân như 201 của REST; ack lỗi ⇒ ApiError cùng `maLoi`; chưa nối ⇒ SocketUnavailableError', async () => {
    const view = hold();
    await settle();
    await expect(sendOverSocket(input)).rejects.toBeInstanceOf(
      SocketUnavailableError,
    );
    const socket = fakeSocketIo.last();
    act(() => socket.serverAccept());
    const tinNhan = message({ id: '77', laCuaToi: true, maGui: 'ma-1' });
    const sent = sendOverSocket(input);
    expect(socket.emitted.at(-1)).toMatchObject({
      event: 'chat:gui',
      payload: input,
    });
    socket.emitted.at(-1)!.reply({ ok: true, hoiThoaiId: '1', tinNhan });
    await expect(sent).resolves.toEqual({ hoiThoaiId: '1', tinNhan });

    const failed = sendOverSocket(input);
    socket.emitted.at(-1)!.reply({ ok: false, maLoi: 'CHAT_GUI_QUA_NHANH' });
    const error = await failed.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ maLoi: 'CHAT_GUI_QUA_NHANH' });
    view.unmount();
  });

  it('WCH-06 CRT-07 không có ack sau 10 giây ⇒ SocketAckTimeoutError (nơi gọi gửi lại bằng REST cùng mã)', async () => {
    vi.useFakeTimers();
    const view = hold();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => fakeSocketIo.last().serverAccept());
    const sent = sendOverSocket(input).catch((e: unknown) => e);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_999);
    });
    let settled = false;
    void sent.then(() => {
      settled = true;
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(settled).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(await sent).toBeInstanceOf(SocketAckTimeoutError);
    view.unmount();
  });
});
