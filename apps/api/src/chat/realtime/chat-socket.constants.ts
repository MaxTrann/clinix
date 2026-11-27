import { AUTH_ERROR_CODES } from '../../auth/auth.constants.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';

// Hằng của kênh WebSocket chat (chat P4; PLAN chat 5.7, T1, T8). Tên hằng KHÔNG đặt đuôi `_EVENTS` (DMS-13 quét mọi `export const …_EVENTS`).

/** Đường của socket.io ở API (trình duyệt nối `/api/socket.io/`, proxy nginx hay Vite bỏ `/api`). */
export const CHAT_SOCKET_PATH = '/socket.io';
/** Tối đa 5 kết nối mỗi tài khoản (nhiều tab, nhiều máy; T8). */
export const CHAT_SOCKET_MAX_PER_ACCOUNT = 5;
/** Gói socket tối đa 64 KB (T8; chữ tối đa 2000 điểm mã, tệp đi bằng HTTP). */
export const CHAT_SOCKET_MAX_BYTES = 64 * 1024;

/** Vai trò được nối (Quản trị viên bị từ chối, Q13). */
export const CHAT_SOCKET_ROLES = ['BenhNhan', 'BacSi', 'LeTan'] as const;
export type ChatSocketRole = (typeof CHAT_SOCKET_ROLES)[number];

/**
 * Mã từ chối bắt tay, gửi trong `connect_error` (`err.message` và `err.data.maLoi`). Ba mã đầu dùng lại của auth để web xử lý giống 401 của REST
 * (làm mới token rồi nối lại); hai mã cuối là `[đề xuất]` của chat P4.
 */
export const CHAT_SOCKET_ERRORS = {
  NOT_LOGGED_IN: AUTH_ERROR_CODES.NOT_LOGGED_IN,
  INVALID_TOKEN: AUTH_ERROR_CODES.INVALID_TOKEN,
  SESSION_INACTIVE: AUTH_ERROR_CODES.SESSION_INACTIVE,
  FORBIDDEN: COMMON_ERROR_CODES.FORBIDDEN,
  BAD_ORIGIN: 'CHAT_NGUON_KHONG_HOP_LE',
  TOO_MANY: 'CHAT_QUA_NHIEU_KET_NOI',
} as const;
export type ChatSocketError =
  (typeof CHAT_SOCKET_ERRORS)[keyof typeof CHAT_SOCKET_ERRORS];

/** Tên sự kiện socket (chat B5; PLAN chat 5.7). Client gửi `chat:gui` (có ack); máy chủ đẩy `chat:tin-moi`. Không đuôi `_EVENTS` (DMS-13). */
export const CHAT_SOCKET_MESSAGES = {
  SEND: 'chat:gui',
  NEW_MESSAGE: 'chat:tin-moi',
} as const;

/** Quét phiên của mọi kết nối mỗi 60 giây (PLAN chat 5.7 "Vòng đời"): đăng xuất hay bị khoá thì bị ngắt chậm nhất sau chừng đó (SOC-09). */
export const CHAT_SOCKET_SWEEP_MS = 60_000;
