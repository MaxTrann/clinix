import { request } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import { isDecimalAmount } from '../../../shared/money/format-vnd';
import {
  WALLET_TRANSACTION_STATUSES,
  WALLET_TRANSACTION_TYPES,
  WITHDRAWAL_STATUSES,
  type LatestWithdrawal,
  type WalletOverview,
  type WalletTransaction,
  type WalletTransactionPage,
  type WalletTransactionType,
} from './wallet-types';

// Gọi và kiểm hình dạng hai API đọc ví của Bệnh nhân (payment F1). Route của Bệnh nhân nên GẮN access token (mặc định của `request()`);
// chủ ví do backend lấy từ token, web KHÔNG gửi `benhNhanId` (gửi lên là 400 `TRUONG_KHONG_DUOC_PHEP`).
// Phản hồi sai hình dạng ⇒ `UnexpectedResponseError` (giao diện hiện câu lỗi chung), không để chuỗi lạ hay `undefined` lọt ra màn hình.

export const WALLET_OVERVIEW_PATH = '/patient/wallet';
export const WALLET_TRANSACTIONS_PATH = '/patient/wallet/transactions';

const invalid = (): never => {
  throw new UnexpectedResponseError(200);
};

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return invalid();
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : invalid();
}

// Tiền: chuỗi decimal (có thể âm). KHÔNG nhận `number` dù máy chủ có lỡ trả: số đã qua JSON có thể đã mất chính xác (WVI-04).
function readAmount(value: unknown): string {
  return typeof value === 'string' && isDecimalAmount(value)
    ? value
    : invalid();
}

function readIso(value: unknown): string {
  const text = readString(value);
  return Number.isNaN(Date.parse(text)) ? invalid() : text;
}

function readCount(value: unknown, min = 0): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min
    ? value
    : invalid();
}

function readOneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  return allowed.find((item) => item === value) ?? invalid();
}

function parseWithdrawal(raw: unknown): LatestWithdrawal | null {
  if (raw === null) return null;
  const row = readRecord(raw);
  return {
    maYeuCau: readString(row.maYeuCau),
    soTien: readAmount(row.soTien),
    trangThai: readOneOf(row.trangThai, WITHDRAWAL_STATUSES),
    thoiDiemYeuCau: readIso(row.thoiDiemYeuCau),
  };
}

export function parseWalletOverview(raw: unknown): WalletOverview {
  const body = readRecord(raw);
  return {
    soDuKhaDung: readAmount(body.soDuKhaDung),
    soTienDangGiu: readAmount(body.soTienDangGiu),
    napChoXacNhan: readAmount(body.napChoXacNhan),
    yeuCauRutGanNhat: parseWithdrawal(body.yeuCauRutGanNhat),
  };
}

function parseTransaction(raw: unknown): WalletTransaction {
  const row = readRecord(raw);
  if (typeof row.quaCuaSo !== 'boolean') return invalid();
  return {
    id: readString(row.id),
    thoiDiem: readIso(row.thoiDiem),
    loai: readOneOf(row.loai, WALLET_TRANSACTION_TYPES),
    noiDung: readString(row.noiDung),
    soTien: readAmount(row.soTien),
    trangThai: readOneOf(row.trangThai, WALLET_TRANSACTION_STATUSES),
    quaCuaSo: row.quaCuaSo,
  };
}

export function parseWalletTransactionPage(
  raw: unknown,
): WalletTransactionPage {
  const body = readRecord(raw);
  if (!Array.isArray(body.items)) return invalid();
  return {
    items: body.items.map(parseTransaction),
    total: readCount(body.total),
    trang: readCount(body.trang, 1),
    kichThuoc: readCount(body.kichThuoc, 1),
  };
}

export async function getWalletOverview(
  signal?: AbortSignal,
): Promise<WalletOverview> {
  return parseWalletOverview(
    await request<unknown>(WALLET_OVERVIEW_PATH, { signal }),
  );
}

export interface WalletTransactionQuery {
  trang: number;
  // `null` = "Tất cả giao dịch": KHÔNG gửi `loai`
  loai: WalletTransactionType | null;
}

export async function getWalletTransactions(
  query: WalletTransactionQuery,
  signal?: AbortSignal,
): Promise<WalletTransactionPage> {
  // `kichThuoc` không gửi: dùng mặc định của máy chủ (20). Chỉ gửi khoá B1 nhận, khoá lạ là 400.
  const params: Record<string, string | number> = { trang: query.trang };
  if (query.loai !== null) params.loai = query.loai;
  return parseWalletTransactionPage(
    await request<unknown>(WALLET_TRANSACTIONS_PATH, { query: params, signal }),
  );
}
