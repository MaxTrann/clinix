import { useEffect, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getApiAuthHooks } from '../../../shared/api/auth-hooks';
import { ApiError } from '../../../shared/api/errors';
import {
  getChatUnreadCount,
  parseMessage,
  parseSendResult,
  sendMessage,
} from '../api/chat-api';
import type { ChatMessage, SendResult } from '../api/chat-types';

// Kết nối WebSocket của nhắn tin ở web (chat F2; PLAN chat 5.7; Q2, Q8, R3, R11). Đây là NƠI DUY NHẤT mở socket (PLAN 5.13 "Kiến trúc").
//
//  - MỘT kết nối mỗi tab: kho ở mức module, đếm số nơi đang giữ (`retainChatConnection`). Router giữ cho khung Bệnh nhân, Bác sĩ, Lễ tân; khung gỡ (đăng xuất,
//    đổi vai trò) là nhả, nơi giữ cuối nhả thì đóng. Đóng được hoãn tới microtask để `StrictMode` (gắn, gỡ, gắn lại liền nhau) không mở hai kết nối.
//  - Token nằm trong gói xác thực (`auth` là HÀM: socket.io gọi lại mỗi lần nối, nên nối lại luôn mang token mới nhất), KHÔNG trên URL hay query.
//  - Máy chủ từ chối vì token, phiên (`connect_error` có `data.maLoi`) hay chủ động ngắt (`io server disconnect`, ví dụ token hết hạn): gọi MỘT route REST
//    qua lớp client để nó tự làm mới token (nếp `recoverFromUnauthorized`), rồi nối lại; tối đa `AUTH_RETRY_LIMIT` lần liền. Mã khác (sai vai trò, sai Origin,
//    quá 5 kết nối) thì thôi nối: web chạy bằng REST và thăm dò như khi mất kết nối.
//  - Lỗi mạng: thư viện tự nối lại; trong lúc đó trạng thái là `connecting`.
//  - Tin được đẩy (`chat:tin-moi`) chỉ được PHÁT cho nơi nghe; mốc bù của khung tin không lấy từ đây (R11, đột biến 28).

/** Đường socket ở trình duyệt; proxy nginx và Vite bỏ `/api` (P4). */
export const CHAT_SOCKET_URL_PATH = '/api/socket.io/';
/** Gửi qua socket không có ack sau 10 giây ⇒ coi là chưa rõ, gửi lại bằng REST cùng `maGui` (PLAN 5.7). */
export const CHAT_ACK_TIMEOUT_MS = 10_000;
const AUTH_RETRY_LIMIT = 3;
// Mã của auth dùng lại cho bắt tay (chat P4): làm mới token rồi nối lại được
const AUTH_CODES = new Set([
  'CHUA_DANG_NHAP',
  'TOKEN_KHONG_HOP_LE',
  'PHIEN_HET_HIEU_LUC',
]);
const SEND_EVENT = 'chat:gui';
const PUSH_EVENT = 'chat:tin-moi';

export type ChatConnectionStatus = 'offline' | 'connecting' | 'connected';

export interface ChatConnectionSnapshot {
  status: ChatConnectionStatus;
  /** Đã từng nối được trong lần giữ này: mất kết nối sau đó thì hiện dòng "Đang nối lại…". */
  everConnected: boolean;
}

export interface PushedMessage {
  hoiThoaiId: string;
  tinNhan: ChatMessage;
}

/** Socket chưa nối: nơi gọi gửi qua REST. */
export class SocketUnavailableError extends Error {
  constructor() {
    super('Kết nối tức thời chưa sẵn sàng');
    this.name = 'SocketUnavailableError';
  }
}

/** Không có ack trong hạn: máy chủ có thể đã ghi, gửi lại bằng REST CÙNG `maGui`. */
export class SocketAckTimeoutError extends Error {
  constructor() {
    super('Không nhận được xác nhận gửi');
    this.name = 'SocketAckTimeoutError';
  }
}

const OFFLINE: ChatConnectionSnapshot = {
  status: 'offline',
  everConnected: false,
};

let socket: Socket | null = null;
let holders = 0;
let snapshot: ChatConnectionSnapshot = OFFLINE;
let authRetries = 0;
const statusListeners = new Set<() => void>();
const pushListeners = new Set<(message: PushedMessage) => void>();

function setSnapshot(next: ChatConnectionSnapshot) {
  if (
    next.status === snapshot.status &&
    next.everConnected === snapshot.everConnected
  )
    return;
  snapshot = next;
  for (const listener of statusListeners) listener();
}

const setStatus = (status: ChatConnectionStatus) =>
  setSnapshot({
    status,
    everConnected: snapshot.everConnected || status === 'connected',
  });

function readMaLoi(error: unknown): string | null {
  const data = (error as { data?: { maLoi?: unknown } } | null)?.data;
  return typeof data?.maLoi === 'string' ? data.maLoi : null;
}

/** Làm mới token qua lớp client rồi nối lại; quá số lần thì thôi (phiên đã hết thì lớp client đưa người dùng về đăng nhập). */
function refreshThenReconnect(target: Socket) {
  if (authRetries >= AUTH_RETRY_LIMIT) {
    setStatus('offline');
    return;
  }
  authRetries += 1;
  setStatus('connecting');
  getChatUnreadCount()
    .catch(() => {
      // Lỗi ở đây do lớp client xử lý (401 không phục hồi được ⇒ đăng xuất); vẫn thử nối, lần từ chối sau sẽ đếm tiếp
    })
    .finally(() => {
      if (socket === target) target.connect();
    });
}

function open() {
  const target = io({
    path: CHAT_SOCKET_URL_PATH,
    transports: ['websocket'],
    autoConnect: false,
    auth: (callback) =>
      callback({ token: getApiAuthHooks()?.getAccessToken() ?? null }),
  });
  socket = target;
  authRetries = 0;
  target.on('connect', () => {
    authRetries = 0;
    setStatus('connected');
  });
  target.on('connect_error', (error) => {
    const maLoi = readMaLoi(error);
    if (maLoi === null) {
      // Lỗi mạng hay máy chủ chưa lên: thư viện tự thử lại
      setStatus(target.active ? 'connecting' : 'offline');
      return;
    }
    if (AUTH_CODES.has(maLoi)) refreshThenReconnect(target);
    else setStatus('offline');
  });
  target.on('disconnect', (reason) => {
    if (reason === 'io client disconnect') return;
    if (reason === 'io server disconnect') refreshThenReconnect(target);
    else setStatus('connecting');
  });
  target.on(PUSH_EVENT, (raw: unknown) => {
    let pushed: PushedMessage;
    try {
      const body = raw as { hoiThoaiId?: unknown; tinNhan?: unknown };
      if (typeof body?.hoiThoaiId !== 'string') return;
      pushed = {
        hoiThoaiId: body.hoiThoaiId,
        tinNhan: parseMessage(body.tinNhan),
      };
    } catch {
      // Gói sai hình dạng: bỏ qua, REST sẽ tải bù
      return;
    }
    for (const listener of pushListeners) listener(pushed);
  });
  setStatus('connecting');
  target.connect();
}

function close() {
  const target = socket;
  socket = null;
  target?.removeAllListeners();
  target?.disconnect();
  setSnapshot(OFFLINE);
}

/** Giữ kết nối; trả hàm nhả. Nơi giữ đầu tiên mở, nơi giữ cuối cùng nhả thì đóng (hoãn tới microtask). */
export function retainChatConnection(): () => void {
  holders += 1;
  if (socket === null) open();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    queueMicrotask(() => {
      if (holders === 0) close();
    });
  };
}

/** Router gọi ở khung Bệnh nhân, Bác sĩ, Lễ tân: giữ kết nối khi khung gắn, nhả khi gỡ (đăng xuất là khung gỡ). */
export function useChatConnection(): void {
  useEffect(() => retainChatConnection(), []);
}

function subscribeStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function getChatConnectionSnapshot(): ChatConnectionSnapshot {
  return snapshot;
}

export function useChatConnectionStatus(): ChatConnectionSnapshot {
  return useSyncExternalStore(subscribeStatus, getChatConnectionSnapshot);
}

/** Nghe tin được đẩy; trả hàm huỷ. */
export function subscribeChatMessages(
  listener: (message: PushedMessage) => void,
): () => void {
  pushListeners.add(listener);
  return () => pushListeners.delete(listener);
}

/** Gửi qua socket, chờ ack tối đa `timeoutMs`. Ack lỗi ⇒ `ApiError` cùng `maLoi` như REST (giao diện chọn câu như nhau). */
export function sendOverSocket(
  input: { hoiThoaiId: string; noiDung: string; maGui: string },
  timeoutMs = CHAT_ACK_TIMEOUT_MS,
): Promise<SendResult> {
  const target = socket;
  if (target === null || !target.connected)
    return Promise.reject(new SocketUnavailableError());
  return new Promise((resolve, reject) => {
    target
      .timeout(timeoutMs)
      .emit(SEND_EVENT, input, (timedOut: Error | null, raw: unknown) => {
        if (timedOut) return reject(new SocketAckTimeoutError());
        try {
          const ack = raw as { ok?: unknown; maLoi?: unknown; loi?: unknown };
          if (ack?.ok === true) return resolve(parseSendResult(ack));
          if (typeof ack?.maLoi === 'string')
            return reject(
              new ApiError(0, {
                maLoi: ack.maLoi,
                thongBao: '',
                loi: Array.isArray(ack.loi) ? ack.loi : undefined,
              }),
            );
          reject(new SocketAckTimeoutError());
        } catch (error) {
          reject(error);
        }
      });
  });
}

/**
 * Gửi tin chữ: socket nếu đang nối, ngược lại REST. Socket chưa sẵn sàng, quá hạn ack hay phiên của kết nối vừa hết ⇒ gửi lại bằng REST với CÙNG `maGui`
 * (máy chủ trả 200 cùng thân nếu đã ghi, nên không thành hai tin). Lỗi nghiệp vụ khác (quá nhanh, người nhận ngưng…) trả nguyên cho nơi gọi.
 */
export async function sendChatMessage(
  hoiThoaiId: string,
  input: { noiDung: string; maGui: string },
): Promise<SendResult> {
  if (snapshot.status !== 'connected') return sendMessage(hoiThoaiId, input);
  try {
    return await sendOverSocket({ hoiThoaiId, ...input });
  } catch (error) {
    const fallBack =
      error instanceof SocketUnavailableError ||
      error instanceof SocketAckTimeoutError ||
      (error instanceof ApiError && AUTH_CODES.has(error.maLoi));
    if (!fallBack) throw error;
    return sendMessage(hoiThoaiId, input);
  }
}
