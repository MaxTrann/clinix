// `socket.io-client` giả cho MỌI test web (chat F2): `test/setup.ts` thay module thật bằng file này, nên không test nào mở WebSocket thật (khung Bệnh nhân,
// Bác sĩ, Lễ tân giữ kết nối khi gắn). Mặc định socket giả chỉ "đang nối" mãi, không hẹn giờ, không phát sự kiện: test cũ chạy như trước (thăm dò bằng REST).
// Test của chat F2 điều khiển "máy chủ" qua `fakeSocketIo.last()`: chấp nhận, từ chối kèm `maLoi`, lỗi mạng, ngắt, đẩy sự kiện, trả ack.

type Handler = (...args: unknown[]) => void;

export interface FakeSocketOptions {
  path?: string;
  transports?: string[];
  autoConnect?: boolean;
  auth?: (callback: (data: unknown) => void) => void;
}

export interface FakeEmit {
  event: string;
  payload: unknown;
  /** Máy chủ giả trả ack (huỷ hẹn giờ quá hạn). */
  reply(raw: unknown): void;
}

export class FakeSocket {
  connected = false;
  active = false;
  closedByClient = false;
  connectCalls = 0;
  /** Gói xác thực của từng lần bắt tay (socket.io gọi hàm `auth` mỗi lần nối). */
  readonly handshakes: unknown[] = [];
  readonly emitted: FakeEmit[] = [];
  private readonly handlers = new Map<string, Set<Handler>>();

  readonly url: string | undefined;
  readonly options: FakeSocketOptions;

  constructor(url: string | undefined, options: FakeSocketOptions) {
    this.url = url;
    this.options = options;
  }

  on(event: string, handler: Handler) {
    const set = this.handlers.get(event) ?? new Set<Handler>();
    set.add(handler);
    this.handlers.set(event, set);
    return this;
  }

  off(event: string, handler?: Handler) {
    if (handler) this.handlers.get(event)?.delete(handler);
    else this.handlers.delete(event);
    return this;
  }

  removeAllListeners() {
    this.handlers.clear();
    return this;
  }

  listenerCount() {
    let total = 0;
    for (const set of this.handlers.values()) total += set.size;
    return total;
  }

  connect() {
    this.connectCalls += 1;
    this.active = true;
    this.options.auth?.((data) => this.handshakes.push(data));
    return this;
  }

  disconnect() {
    const wasConnected = this.connected;
    this.connected = false;
    this.active = false;
    this.closedByClient = true;
    if (wasConnected) this.fire('disconnect', 'io client disconnect');
    return this;
  }

  timeout(ms: number) {
    return {
      emit: (event: string, payload: unknown, ack: Handler) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          ack(new Error('operation has timed out'));
        }, ms);
        this.emitted.push({
          event,
          payload,
          reply: (raw) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            ack(null, raw);
          },
        });
      },
    };
  }

  // ---- phía "máy chủ" do test gọi ----

  serverAccept() {
    this.connected = true;
    this.fire('connect');
  }

  /** Từ chối bắt tay ở middleware: socket.io không tự nối lại (`active` = false). */
  serverReject(maLoi: string) {
    this.active = false;
    const error = Object.assign(new Error(maLoi), { data: { maLoi } });
    this.fire('connect_error', error);
  }

  /** Lỗi mạng khi bắt tay: thư viện còn tự thử lại (`active` giữ nguyên). */
  networkError() {
    this.fire('connect_error', new Error('websocket error'));
  }

  /** Mất kết nối; `io server disconnect` là máy chủ chủ động ngắt (thư viện không tự nối lại). */
  drop(reason = 'transport close') {
    this.connected = false;
    if (reason === 'io server disconnect') this.active = false;
    this.fire('disconnect', reason);
  }

  push(event: string, payload: unknown) {
    this.fire(event, payload);
  }

  private fire(event: string, ...args: unknown[]) {
    for (const handler of [...(this.handlers.get(event) ?? [])])
      handler(...args);
  }
}

const sockets: FakeSocket[] = [];

export const fakeSocketIo = {
  sockets,
  reset() {
    sockets.length = 0;
  },
  last(): FakeSocket {
    const socket = sockets.at(-1);
    if (!socket) throw new Error('Chưa có socket nào được tạo');
    return socket;
  },
};

export function io(
  first?: string | FakeSocketOptions,
  second?: FakeSocketOptions,
): FakeSocket {
  const url = typeof first === 'string' ? first : undefined;
  const options = (typeof first === 'object' ? first : second) ?? {};
  const socket = new FakeSocket(url, options);
  sockets.push(socket);
  if (options.autoConnect !== false) socket.connect();
  return socket;
}

export { io as connect };
export default io;
