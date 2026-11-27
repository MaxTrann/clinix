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
  type SendResult,
  DEFAULT_BRANCH_SOURCES,
  type BranchOption,
  type DefaultBranch,
  type StartHeader,
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

export function parseSendResult(raw: unknown): SendResult {
  const body = readRecord(raw);
  return {
    hoiThoaiId: readString(body.hoiThoaiId),
    tinNhan: parseMessage(body.tinNhan),
  };
}

/**
 * Gửi tin chữ vào hội thoại đã có (chat B3; PLAN 5.6). 201 khi ghi mới, 200 cùng thân khi `maGui` đã dùng cho đúng nội dung này (gửi lại an toàn),
 * nên web gửi lại sau lỗi mạng bằng CÙNG `maGui` (A1, WCH-09). Không tự thử lại ở đây: lớp client không thử lại yêu cầu làm đổi dữ liệu.
 */
export async function sendMessage(
  hoiThoaiId: string,
  input: { noiDung: string; maGui: string },
): Promise<SendResult> {
  return parseSendResult(
    await request(messagesPath(hoiThoaiId), { method: 'POST', json: input }),
  );
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

// ---- chat F4: Bệnh nhân bắt đầu trò chuyện (chat B3; PLAN 5.6, Q4, Q24, MH1). Đọc đầu khung KHÔNG tạo gì; hội thoại chỉ tạo khi gửi tin đầu. ----

export const doctorStartPath = (bacSiId: string) =>
  `/chat/doctors/${segment(bacSiId)}`;
export const branchStartPath = (chiNhanhId: string) =>
  `/chat/branches/${segment(chiNhanhId)}`;
export const DEFAULT_BRANCH_PATH = '/chat/default-branch';
/** Danh sách chi nhánh công khai cho bộ chọn. Chat tự gọi (không import `features/search`, PLAN 5.13); trần 100 như bộ chọn của search. */
export const PUBLIC_BRANCHES_PATH = '/public/branches';
export const BRANCH_PICKER_PAGE_SIZE = 100;

export function parseStartHeader(raw: unknown): StartHeader {
  const row = readRecord(raw);
  return {
    hoiThoaiId: readNullableString(row.hoiThoaiId),
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

export function parseDefaultBranch(raw: unknown): DefaultBranch {
  const row = readRecord(raw);
  return {
    chiNhanhId: readNullableString(row.chiNhanhId),
    nguon: readNullableOneOf(row.nguon, DEFAULT_BRANCH_SOURCES),
  };
}

export function parseBranchOptions(raw: unknown): BranchOption[] {
  return readArray(readRecord(raw).items).map((item) => {
    const row = readRecord(item);
    return {
      chiNhanhId: readString(row.chiNhanhId),
      ten: readString(row.ten),
      diaChi: readString(row.diaChi),
    };
  });
}

export async function getDoctorStart(
  bacSiId: string,
  signal?: AbortSignal,
): Promise<StartHeader> {
  return parseStartHeader(await request(doctorStartPath(bacSiId), { signal }));
}

export async function getBranchStart(
  chiNhanhId: string,
  signal?: AbortSignal,
): Promise<StartHeader> {
  return parseStartHeader(
    await request(branchStartPath(chiNhanhId), { signal }),
  );
}

export async function getDefaultBranch(
  signal?: AbortSignal,
): Promise<DefaultBranch> {
  return parseDefaultBranch(await request(DEFAULT_BRANCH_PATH, { signal }));
}

export async function getBranchOptions(
  signal?: AbortSignal,
): Promise<BranchOption[]> {
  return parseBranchOptions(
    await request(PUBLIC_BRANCHES_PATH, {
      query: { pageSize: BRANCH_PICKER_PAGE_SIZE },
      skipAuthToken: true,
      signal,
    }),
  );
}

/** Đích của tin đầu: bác sĩ hay hộp thư lễ tân của một chi nhánh. */
export type StartTarget =
  { kind: 'doctor'; bacSiId: string } | { kind: 'branch'; chiNhanhId: string };

/** Tin đầu: tìm-hoặc-tạo hội thoại rồi gửi (201; gửi lại cùng `maGui` ⇒ 200 cùng thân, không thành hai hội thoại hay hai tin). */
export async function sendFirstMessage(
  target: StartTarget,
  input: { noiDung: string; maGui: string },
): Promise<SendResult> {
  const base =
    target.kind === 'doctor'
      ? doctorStartPath(target.bacSiId)
      : branchStartPath(target.chiNhanhId);
  return parseSendResult(
    await request(`${base}/messages`, { method: 'POST', json: input }),
  );
}
