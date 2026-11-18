import { request } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import { isDecimalAmount } from '../../../shared/money/format-vnd';
import { TOPUP_GATEWAYS, type TopupGateway } from './topup-form';

// Hai API nạp ví của Bệnh nhân (payment F2; hợp đồng B4, PLAN 5.11 #3, #4). Gắn access token (mặc định của `request()`); chủ ví backend lấy từ token,
// web KHÔNG gửi `viNoiBoId`, `benhNhanId`. Phản hồi sai hình dạng ⇒ `UnexpectedResponseError`.
// Tạo nạp dùng thời gian chờ mặc định (15 giây) và KHÔNG tự gửi lại khi hết giờ hay mất mạng (WNT-06): mỗi lần gửi tạo một giao dịch mới ở máy chủ.

export const TOPUP_PATH = '/patient/wallet/topups';

export const TOPUP_STATUSES = ['DangXuLy', 'ThanhCong', 'ThatBai'] as const;
export type TopupStatusValue = (typeof TOPUP_STATUSES)[number];

export interface CreatedTopup {
  maGiaoDich: string;
  redirectUrl: string;
}

export interface TopupStatus {
  maGiaoDich: string;
  soTien: string;
  phuongThuc: TopupGateway;
  trangThai: TopupStatusValue;
  daCongVi: boolean;
  thoiDiemTao: string;
}

const invalid = (): never => {
  throw new UnexpectedResponseError(200);
};

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return invalid();
  return value as Record<string, unknown>;
}

const readString = (value: unknown): string =>
  typeof value === 'string' && value !== '' ? value : invalid();

const readOneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): T => allowed.find((item) => item === value) ?? invalid();

export function parseCreatedTopup(raw: unknown): CreatedTopup {
  const body = readRecord(raw);
  return {
    maGiaoDich: readString(body.maGiaoDich),
    redirectUrl: readString(body.redirectUrl),
  };
}

export function parseTopupStatus(raw: unknown): TopupStatus {
  const body = readRecord(raw);
  const soTien = readString(body.soTien);
  if (!isDecimalAmount(soTien) || typeof body.daCongVi !== 'boolean')
    return invalid();
  const thoiDiemTao = readString(body.thoiDiemTao);
  if (Number.isNaN(Date.parse(thoiDiemTao))) return invalid();
  return {
    maGiaoDich: readString(body.maGiaoDich),
    soTien,
    phuongThuc: readOneOf(body.phuongThuc, TOPUP_GATEWAYS),
    trangThai: readOneOf(body.trangThai, TOPUP_STATUSES),
    daCongVi: body.daCongVi,
    thoiDiemTao,
  };
}

/** `soTien` là chuỗi chữ số đồng ("200000"), đúng dạng DTO của B4. */
export async function createTopup(input: {
  soTien: string;
  phuongThuc: TopupGateway;
}): Promise<CreatedTopup> {
  return parseCreatedTopup(
    await request<unknown>(TOPUP_PATH, {
      method: 'POST',
      json: { soTien: input.soTien, phuongThuc: input.phuongThuc },
    }),
  );
}

export async function getTopupStatus(
  maGiaoDich: string,
  signal?: AbortSignal,
): Promise<TopupStatus> {
  return parseTopupStatus(
    await request<unknown>(`${TOPUP_PATH}/${encodeURIComponent(maGiaoDich)}`, {
      signal,
    }),
  );
}
