import { request } from '../../../shared/api/client';
import {
  invalid,
  readAmount,
  readCount,
  readIso,
  readOneOf,
  readRecord,
  readString,
} from './read-json';
import {
  WALLET_TRANSACTION_STATUSES,
  WALLET_TRANSACTION_TYPES,
  WITHDRAWAL_STATUSES,
  type CreatedWithdrawal,
  type LatestWithdrawal,
  type TopupLimits,
  type WalletOverview,
  type WalletTransaction,
  type WalletTransactionPage,
  type WalletTransactionType,
} from './wallet-types';

// Gọi và kiểm hình dạng API ví của Bệnh nhân: hai API đọc (payment F1) và gửi yêu cầu rút (payment F6). Route của Bệnh nhân nên GẮN access token (mặc định của `request()`);
// chủ ví do backend lấy từ token, web KHÔNG gửi `benhNhanId` (gửi lên là 400 `TRUONG_KHONG_DUOC_PHEP`).
// Phản hồi sai hình dạng ⇒ `UnexpectedResponseError` (giao diện hiện câu lỗi chung), không để chuỗi lạ hay `undefined` lọt ra màn hình.

export const WALLET_OVERVIEW_PATH = '/patient/wallet';
export const WALLET_TRANSACTIONS_PATH = '/patient/wallet/transactions';
export const WALLET_WITHDRAWALS_PATH = '/patient/wallet/withdrawals';

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
    hanMucNap: parseLimits(body.hanMucNap),
    congThanhToan: parseGateways(body.congThanhToan),
  };
}

function parseLimits(raw: unknown): TopupLimits {
  const limits = readRecord(raw);
  return {
    toiThieu: readAmount(limits.toiThieu),
    toiDa: readAmount(limits.toiDa),
  };
}

// Chỉ kiểm là mảng chuỗi; tên cổng lạ do tab Nạp tiền (payment) tự bỏ qua
function parseGateways(raw: unknown): string[] {
  if (!Array.isArray(raw)) return invalid();
  return raw.map(readString);
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

/** Hình dạng 201 của rút tiền: bốn khoá, tiền là chuỗi decimal (payment F6). */
export function parseCreatedWithdrawal(raw: unknown): CreatedWithdrawal {
  const body = readRecord(raw);
  return {
    maYeuCau: readString(body.maYeuCau),
    soTien: readAmount(body.soTien),
    soDuKhaDung: readAmount(body.soDuKhaDung),
    soTienDangGiu: readAmount(body.soTienDangGiu),
  };
}

/** Gửi yêu cầu rút (payment F6). `soTien` là chuỗi chữ số đồng ("100000") như DTO của B11; thân KHÔNG có ví hay chủ ví (máy chủ lấy từ token). */
export async function createWithdrawal(input: {
  soTien: string;
}): Promise<CreatedWithdrawal> {
  return parseCreatedWithdrawal(
    await request<unknown>(WALLET_WITHDRAWALS_PATH, {
      method: 'POST',
      json: { soTien: input.soTien },
    }),
  );
}
