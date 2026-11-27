import { request, requestBinary } from '../../../shared/api/client';
import type { BinaryResponse } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  CHAT_ROLES,
  CONVERSATION_KINDS,
  RELATIONSHIPS,
  REPLY_STATUSES,
  type ChatMessage,
  type ChatPartner,
  type ConversationDetail,
  type ConversationFilter,
  type ConversationListItem,
  type ConversationPage,
  type MessageCursor,
  type MessagePage,
} from './chat-types';

// Gọi API nhắn tin phần đọc và tải tệp (chat B2, B4; PLAN chat 5.6) qua lớp client DUY NHẤT (`request`, `requestBinary`), gắn access token.
// Tài khoản do backend lấy từ token; web không gửi id tài khoản nào. Phản hồi sai hình dạng ⇒ `UnexpectedResponseError` (giao diện hiện câu lỗi chung),
// không để chuỗi lạ hay `undefined` lọt ra màn hình (nếp `notification-api.ts`). Id trong đường dẫn luôn được mã hoá.

export const CONVERSATIONS_PATH = '/chat/conversations';
export const CHAT_UNREAD_COUNT_PATH = '/chat/unread-count';
const segment = (id: string) => encodeURIComponent(id);
export const conversationPath = (id: string) =>
  `${CONVERSATIONS_PATH}/${segment(id)}`;
export const messagesPath = (id: string) => `${conversationPath(id)}/messages`;
export const markReadPath = (id: string) => `${conversationPath(id)}/read`;
export const attachmentPath = (tinNhanId: string) =>
  `/chat/messages/${segment(tinNhanId)}/attachment`;

const invalid = (): never => {
  throw new UnexpectedResponseError(200);
};

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid();
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : invalid();
}

function readTime(value: unknown): string {
  const text = readString(value);
  return Number.isNaN(Date.parse(text)) ? invalid() : text;
}

function readNullableString(value: unknown): string | null {
  return value === null ? null : readString(value);
}

function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : invalid();
}

function readBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : invalid();
}

function readOneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  return allowed.find((item) => item === value) ?? invalid();
}

function readNullableOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  return value === null ? null : readOneOf(value, allowed);
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : invalid();
}

function parsePartner(raw: unknown): ChatPartner {
  const row = readRecord(raw);
  const partner: ChatPartner = {
    vaiTro: readOneOf(row.vaiTro, CHAT_ROLES),
    tenHienThi: readString(row.tenHienThi),
  };
  if (row.soDienThoai !== undefined)
    partner.soDienThoai = readString(row.soDienThoai);
  return partner;
}

export function parseConversationItem(raw: unknown): ConversationListItem {
  const row = readRecord(raw);
  const last = readRecord(row.tinCuoi);
  return {
    id: readString(row.id),
    loai: readOneOf(row.loai, CONVERSATION_KINDS),
    doiTac: parsePartner(row.doiTac),
    tinCuoi: {
      id: readString(last.id),
      trichDan: readString(last.trichDan),
      nguoiGuiHienThi: readString(last.nguoiGuiHienThi),
      thoiDiemGui: readTime(last.thoiDiemGui),
    },
    soTinChuaDoc: readCount(row.soTinChuaDoc),
    trangThaiTraLoi: readNullableOneOf(row.trangThaiTraLoi, REPLY_STATUSES),
    traLoiBoi: readNullableString(row.traLoiBoi),
    quanHe: readNullableOneOf(row.quanHe, RELATIONSHIPS),
  };
}

export function parseConversationPage(raw: unknown): ConversationPage {
  const body = readRecord(raw);
  return {
    items: readArray(body.items).map(parseConversationItem),
    truocTiepTheo: readNullableString(body.truocTiepTheo),
  };
}

export function parseConversationDetail(raw: unknown): ConversationDetail {
  const row = readRecord(raw);
  return {
    id: readString(row.id),
    loai: readOneOf(row.loai, CONVERSATION_KINDS),
    doiTac: parsePartner(row.doiTac),
    quanHe: readNullableOneOf(row.quanHe, RELATIONSHIPS),
    banner: readBoolean(row.banner),
    coTheGui: readBoolean(row.coTheGui),
    lyDoKhongGui: readNullableOneOf(row.lyDoKhongGui, [
      'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG',
    ] as const),
  };
}

export function parseMessage(raw: unknown): ChatMessage {
  const row = readRecord(raw);
  const sender = readRecord(row.nguoiGui);
  let tep: ChatMessage['tep'] = null;
  if (row.tep !== null) {
    const file = readRecord(row.tep);
    tep = {
      ten: readString(file.ten),
      loai: readString(file.loai),
      dungLuong: readCount(file.dungLuong),
    };
  }
  return {
    id: readString(row.id),
    laCuaToi: readBoolean(row.laCuaToi),
    nguoiGui: {
      vaiTro: readOneOf(sender.vaiTro, CHAT_ROLES),
      tenHienThi: readString(sender.tenHienThi),
    },
    noiDung: readString(row.noiDung),
    tep,
    thoiDiemGui: readTime(row.thoiDiemGui),
    maGui: readNullableString(row.maGui),
  };
}

export function parseMessagePage(raw: unknown): MessagePage {
  const body = readRecord(raw);
  return {
    items: readArray(body.items).map(parseMessage),
    coThem: readBoolean(body.coThem),
  };
}

export function parseChatUnreadCount(raw: unknown): number {
  return readCount(readRecord(raw).soHoiThoaiChuaDoc);
}

export async function getConversations(
  params: {
    loc?: ConversationFilter;
    q?: string;
    truoc?: string;
    limit?: number;
  },
  signal?: AbortSignal,
): Promise<ConversationPage> {
  return parseConversationPage(
    await request(CONVERSATIONS_PATH, { query: params, signal }),
  );
}

export async function getConversation(
  id: string,
  signal?: AbortSignal,
): Promise<ConversationDetail> {
  return parseConversationDetail(
    await request(conversationPath(id), { signal }),
  );
}

export async function getMessages(
  id: string,
  { cursor = null, limit }: { cursor?: MessageCursor; limit?: number } = {},
  signal?: AbortSignal,
): Promise<MessagePage> {
  return parseMessagePage(
    await request(messagesPath(id), {
      query: { ...(cursor ?? {}), limit },
      signal,
    }),
  );
}

/** Đẩy mốc đã đọc tới `tinNhanId`; trả mốc thật sau khi ghi (không bao giờ lùi). */
export async function markConversationRead(
  id: string,
  tinNhanId: string,
): Promise<string> {
  const body = readRecord(
    await request(markReadPath(id), { method: 'POST', json: { tinNhanId } }),
  );
  return readString(body.tinNhanCuoiDaDocId);
}

/** Số hội thoại có tin chưa đọc (trần 100) cho mục "Tin nhắn" ở menu. */
export async function getChatUnreadCount(
  signal?: AbortSignal,
): Promise<number> {
  return parseChatUnreadCount(
    await request(CHAT_UNREAD_COUNT_PATH, { signal }),
  );
}

/** Tải tệp đính kèm của một tin (byte; F6 hiện ảnh hay lưu PDF). */
export function downloadAttachment(
  tinNhanId: string,
  signal?: AbortSignal,
): Promise<BinaryResponse> {
  return requestBinary(attachmentPath(tinNhanId), { signal });
}
