import { request } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  LINK_KINDS,
  NOTIFICATION_GROUPS,
  type MarkAllReadResult,
  type MarkReadResult,
  type NotificationItem,
  type NotificationLink,
  type NotificationPage,
  type ReadFilter,
} from './notification-types';

// Gọi API Trung tâm thông báo (notification B2, PLAN 5.4): số chưa đọc (F1), danh sách, đánh dấu một và đánh dấu tất cả (F2).
// Route của bốn vai trò, GẮN access token (mặc định của `request()`); tài khoản do backend lấy từ token, web không gửi id tài khoản nào.
// Phản hồi sai hình dạng ⇒ `UnexpectedResponseError` (giao diện hiện câu lỗi chung), không để chuỗi lạ hay `undefined` lọt ra màn hình.

export const NOTIFICATIONS_PATH = '/notifications';
export const UNREAD_COUNT_PATH = '/notifications/unread-count';
export const READ_ALL_PATH = '/notifications/read-all';
export const markReadPath = (id: string) =>
  `/notifications/${encodeURIComponent(id)}/read`;

/** Cỡ trang của danh sách (PLAN 5.10: 20 dòng; trùng mặc định của API). */
export const NOTIFICATION_PAGE_SIZE = 20;

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

function readCount(value: unknown, min = 0): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min
    ? value
    : invalid();
}

function readOneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  return allowed.find((item) => item === value) ?? invalid();
}

export function parseUnreadCount(raw: unknown): number {
  const value =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>).soChuaDoc
      : undefined;
  return readCount(value);
}

function parseLink(raw: unknown): NotificationLink | null {
  if (raw === null) return null;
  const link = readRecord(raw);
  const kieu = readOneOf(link.kieu, LINK_KINDS);
  if (kieu === 'LichHen')
    return { kieu, maLichHen: readString(link.maLichHen) };
  return { kieu };
}

export function parseNotificationItem(raw: unknown): NotificationItem {
  const row = readRecord(raw);
  if (typeof row.daDoc !== 'boolean') return invalid();
  const thoiDiemTao = readString(row.thoiDiemTao);
  if (Number.isNaN(Date.parse(thoiDiemTao))) return invalid();
  return {
    id: readString(row.id),
    loai: readString(row.loai),
    nhom: row.nhom === null ? null : readOneOf(row.nhom, NOTIFICATION_GROUPS),
    tieuDe: readString(row.tieuDe),
    noiDung: readString(row.noiDung),
    daDoc: row.daDoc,
    thoiDiemTao,
    lienKet: parseLink(row.lienKet),
  };
}

export function parseNotificationPage(raw: unknown): NotificationPage {
  const body = readRecord(raw);
  if (!Array.isArray(body.items)) return invalid();
  return {
    items: body.items.map(parseNotificationItem),
    total: readCount(body.total),
    page: readCount(body.page, 1),
    pageSize: readCount(body.pageSize, 1),
    soChuaDoc: readCount(body.soChuaDoc),
  };
}

export async function getUnreadCount(signal?: AbortSignal): Promise<number> {
  return parseUnreadCount(await request(UNREAD_COUNT_PATH, { signal }));
}

export async function getNotifications(
  { page, filter }: { page: number; filter: ReadFilter },
  signal?: AbortSignal,
): Promise<NotificationPage> {
  return parseNotificationPage(
    await request(NOTIFICATIONS_PATH, {
      query: {
        page,
        pageSize: NOTIFICATION_PAGE_SIZE,
        trangThaiDoc: filter,
      },
      signal,
    }),
  );
}

/** Đánh dấu một thông báo đã đọc (idempotent ở backend). */
export async function markNotificationRead(
  id: string,
): Promise<MarkReadResult> {
  const body = readRecord(await request(markReadPath(id), { method: 'POST' }));
  if (body.daDoc !== true) return invalid();
  return {
    id: readString(body.id),
    daDoc: true,
    soChuaDoc: readCount(body.soChuaDoc),
  };
}

export async function markAllNotificationsRead(): Promise<MarkAllReadResult> {
  const body = readRecord(await request(READ_ALL_PATH, { method: 'POST' }));
  return {
    daDanhDau: readCount(body.daDanhDau),
    soChuaDoc: readCount(body.soChuaDoc),
  };
}
