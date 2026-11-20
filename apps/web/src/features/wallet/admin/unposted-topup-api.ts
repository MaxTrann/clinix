import { request } from '../../../shared/api/client';
import {
  invalid,
  readAmount,
  readCount,
  readIso,
  readOneOf,
  readRecord,
  readString,
} from '../api/read-json';

// Gọi và kiểm hình dạng ba API "Nạp ví chưa cộng" của Quản trị viên `ToanHeThong` (payment F9; hợp đồng của B15, PLAN 5.11 #13). Máy chủ kiểm quyền; người xử lý lấy từ token.
// `Cộng ví` gửi thân RỖNG: số tiền cộng chỉ lấy từ giao dịch ở máy chủ. Phản hồi sai hình dạng ⇒ `UnexpectedResponseError`. Tiền là CHUỖI decimal, web không cộng trừ.

export const ADMIN_UNPOSTED_TOPUPS_API = '/admin/payment/unposted-topups';

const GATEWAYS = ['VNPay', 'MoMo'] as const;
const HANDLING = ['ChoXuLy', 'KhongTheXuLy'] as const;
const RECONCILE = ['DaDoiSoat', 'ChoDoiSoat'] as const;

export type UnpostedGateway = (typeof GATEWAYS)[number];

export interface UnpostedTopupItem {
  maGiaoDich: string;
  phuongThuc: UnpostedGateway;
  maGiaoDichCong: string | null;
  benhNhan: { hoTen: string };
  soTien: string;
  thoiDiemXacMinh: string;
  soLanThuTuDong: number;
  toiDaThuTuDong: number;
  trangThaiXuLy: (typeof HANDLING)[number];
  lyDoKhongTheXuLy: string | null;
}

export interface UnpostedTopupHandled {
  maGiaoDich: string;
  trangThaiDoiSoat: (typeof RECONCILE)[number];
}

const nullable = <T>(value: unknown, read: (v: unknown) => T): T | null =>
  value === null ? null : read(value);

export function parseUnpostedTopupItem(raw: unknown): UnpostedTopupItem {
  const row = readRecord(raw);
  const patient = readRecord(row.benhNhan);
  return {
    maGiaoDich: readString(row.maGiaoDich),
    phuongThuc: readOneOf(row.phuongThuc, GATEWAYS),
    maGiaoDichCong: nullable(row.maGiaoDichCong, readString),
    benhNhan: { hoTen: readString(patient.hoTen) },
    soTien: readAmount(row.soTien),
    thoiDiemXacMinh: readIso(row.thoiDiemXacMinh),
    soLanThuTuDong: readCount(row.soLanThuTuDong),
    toiDaThuTuDong: readCount(row.toiDaThuTuDong, 1),
    trangThaiXuLy: readOneOf(row.trangThaiXuLy, HANDLING),
    lyDoKhongTheXuLy: nullable(row.lyDoKhongTheXuLy, readString),
  };
}

export function parseUnpostedTopups(raw: unknown): UnpostedTopupItem[] {
  const body = readRecord(raw);
  if (!Array.isArray(body.items)) return invalid();
  return body.items.map(parseUnpostedTopupItem);
}

function parseHandled(raw: unknown): UnpostedTopupHandled {
  const body = readRecord(raw);
  return {
    maGiaoDich: readString(body.maGiaoDich),
    trangThaiDoiSoat: readOneOf(body.trangThaiDoiSoat, RECONCILE),
  };
}

const itemPath = (maGiaoDich: string) =>
  `${ADMIN_UNPOSTED_TOPUPS_API}/${encodeURIComponent(maGiaoDich)}`;

export async function getUnpostedTopups(
  signal?: AbortSignal,
): Promise<UnpostedTopupItem[]> {
  return parseUnpostedTopups(
    await request<unknown>(ADMIN_UNPOSTED_TOPUPS_API, { signal }),
  );
}

export async function creditUnpostedTopup(
  maGiaoDich: string,
): Promise<UnpostedTopupHandled> {
  return parseHandled(
    await request<unknown>(`${itemPath(maGiaoDich)}/credit`, {
      method: 'POST',
      json: {},
    }),
  );
}

export async function markTopupUnprocessable(
  maGiaoDich: string,
  lyDo: string,
): Promise<UnpostedTopupHandled> {
  return parseHandled(
    await request<unknown>(`${itemPath(maGiaoDich)}/mark-unprocessable`, {
      method: 'POST',
      json: { lyDo },
    }),
  );
}
