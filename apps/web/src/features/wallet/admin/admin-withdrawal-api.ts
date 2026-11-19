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
import {
  WALLET_TRANSACTION_TYPES,
  WITHDRAWAL_STATUSES,
  type WalletTransactionType,
  type WithdrawalStatus,
} from '../api/wallet-types';

// Gọi và kiểm hình dạng bốn API Quản trị viên về rút tiền (payment F7; hợp đồng của B12, PLAN 5.11 #10, #11). Route của Quản trị viên `ToanHeThong`: máy chủ kiểm quyền,
// web chỉ ẩn menu và bọc guard. Người xử lý do máy chủ lấy từ token; thân duyệt và từ chối CHỈ có `ghiChu`. Phản hồi sai hình dạng ⇒ `UnexpectedResponseError`.
// Tiền là CHUỖI decimal, id là chuỗi; web không cộng trừ tiền (PLAN 5.13; Trung chốt 19/11/2026: khối ví chỉ hiện số máy chủ trả).

export const ADMIN_WITHDRAWALS_API = '/admin/wallet/withdrawals';

export interface AdminWithdrawalItem {
  maYeuCau: string;
  benhNhan: { hoTen: string };
  soTien: string;
  trangThai: WithdrawalStatus;
  thoiDiemYeuCau: string;
  thoiDiemXuLy: string | null;
}

export interface WithdrawalCounts {
  tatCa: number;
  choDuyet: number;
  daDuyet: number;
  tuChoi: number;
}

export interface AdminWithdrawalPage {
  items: AdminWithdrawalItem[];
  total: number;
  trang: number;
  kichThuoc: number;
  demTheoTrangThai: WithdrawalCounts;
}

export interface AdminLedgerEntry {
  thoiDiem: string;
  loai: WalletTransactionType;
  soTien: string;
}

export interface AdminWithdrawalDetail extends AdminWithdrawalItem {
  soDuHienTai: string;
  soTienDangGiu: string;
  giaoDichGanDay: AdminLedgerEntry[];
}

export interface WithdrawalDecided {
  maYeuCau: string;
  trangThai: WithdrawalStatus;
}

function parseItem(raw: unknown): AdminWithdrawalItem {
  const row = readRecord(raw);
  return {
    maYeuCau: readString(row.maYeuCau),
    benhNhan: { hoTen: readString(readRecord(row.benhNhan).hoTen) },
    soTien: readAmount(row.soTien),
    trangThai: readOneOf(row.trangThai, WITHDRAWAL_STATUSES),
    thoiDiemYeuCau: readIso(row.thoiDiemYeuCau),
    thoiDiemXuLy: row.thoiDiemXuLy === null ? null : readIso(row.thoiDiemXuLy),
  };
}

export function parseWithdrawalPage(raw: unknown): AdminWithdrawalPage {
  const body = readRecord(raw);
  if (!Array.isArray(body.items)) return invalid();
  const counts = readRecord(body.demTheoTrangThai);
  return {
    items: body.items.map(parseItem),
    total: readCount(body.total),
    trang: readCount(body.trang, 1),
    kichThuoc: readCount(body.kichThuoc, 1),
    demTheoTrangThai: {
      tatCa: readCount(counts.tatCa),
      choDuyet: readCount(counts.choDuyet),
      daDuyet: readCount(counts.daDuyet),
      tuChoi: readCount(counts.tuChoi),
    },
  };
}

export function parseWithdrawalDetail(raw: unknown): AdminWithdrawalDetail {
  const body = readRecord(raw);
  if (!Array.isArray(body.giaoDichGanDay)) return invalid();
  return {
    ...parseItem(body),
    soDuHienTai: readAmount(body.soDuHienTai),
    soTienDangGiu: readAmount(body.soTienDangGiu),
    giaoDichGanDay: body.giaoDichGanDay.map((entry) => {
      const row = readRecord(entry);
      return {
        thoiDiem: readIso(row.thoiDiem),
        loai: readOneOf(row.loai, WALLET_TRANSACTION_TYPES),
        soTien: readAmount(row.soTien),
      };
    }),
  };
}

export function parseWithdrawalDecided(raw: unknown): WithdrawalDecided {
  const body = readRecord(raw);
  return {
    maYeuCau: readString(body.maYeuCau),
    trangThai: readOneOf(body.trangThai, WITHDRAWAL_STATUSES),
  };
}

export interface WithdrawalListQuery {
  // `null` = tất cả: KHÔNG gửi `trangThai`
  trangThai: WithdrawalStatus | null;
  trang: number;
}

export async function getAdminWithdrawals(
  query: WithdrawalListQuery,
  signal?: AbortSignal,
): Promise<AdminWithdrawalPage> {
  // `kichThuoc` không gửi: dùng mặc định của máy chủ (20). Chỉ gửi khoá B12 nhận, khoá lạ là 400.
  const params: Record<string, string | number> = { trang: query.trang };
  if (query.trangThai !== null) params.trangThai = query.trangThai;
  return parseWithdrawalPage(
    await request<unknown>(ADMIN_WITHDRAWALS_API, { query: params, signal }),
  );
}

const itemPath = (maYeuCau: string) =>
  `${ADMIN_WITHDRAWALS_API}/${encodeURIComponent(maYeuCau)}`;

export async function getAdminWithdrawal(
  maYeuCau: string,
  signal?: AbortSignal,
): Promise<AdminWithdrawalDetail> {
  return parseWithdrawalDetail(
    await request<unknown>(itemPath(maYeuCau), { signal }),
  );
}

/** Duyệt: thân rỗng (Figma `567:2` không có ô ghi chú). */
export async function approveWithdrawal(
  maYeuCau: string,
): Promise<WithdrawalDecided> {
  return parseWithdrawalDecided(
    await request<unknown>(`${itemPath(maYeuCau)}/approve`, {
      method: 'POST',
      json: {},
    }),
  );
}

/** Từ chối: lý do BẮT BUỘC ở web (Figma `581:2`; Trung chốt 19/11/2026), máy chủ nhận ở `ghiChu` (tối đa 200 ký tự). */
export async function rejectWithdrawal(
  maYeuCau: string,
  ghiChu: string,
): Promise<WithdrawalDecided> {
  return parseWithdrawalDecided(
    await request<unknown>(`${itemPath(maYeuCau)}/reject`, {
      method: 'POST',
      json: { ghiChu },
    }),
  );
}
