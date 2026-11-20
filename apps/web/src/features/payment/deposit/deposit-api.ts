import { request } from '../../../shared/api/client';
import {
  invalid,
  readAmount,
  readBoolean,
  readIso,
  readRecord,
  readText,
} from '../api/read-json';

// Hai API thanh toán cọc bằng ví của Bệnh nhân (payment F3; hợp đồng B5, PLAN 5.5, 5.11 #6, #7). Gắn access token (mặc định của `request()`); chủ lịch backend lấy từ token,
// web KHÔNG gửi `benhNhanId`, `viNoiBoId` hay `soTien`: thân POST là `{}` (Q14, QTT-03). Phản hồi sai hình dạng ⇒ `UnexpectedResponseError`.
// Mọi số tiền là CHUỖI decimal do máy chủ tính; client KHÔNG tự trừ (WTT-01).

const appointmentPath = (maLichHen: string) =>
  `/patient/appointments/${encodeURIComponent(maLichHen)}`;

export interface DepositPreview {
  soTienCan: string;
  soDuKhaDung: string;
  /** `null` khi `duSoDu = false` (máy chủ không trả "số dư âm"). */
  soDuSauThanhToan: string | null;
  duSoDu: boolean;
  hanThanhToan: string | null;
  thoiGianMayChu: string;
}

export interface DepositPaymentResult {
  maLichHen: string;
  trangThai: 'DaXacNhan';
  soTien: string;
  soDuKhaDung: string;
  /** `true` khi lịch đã được thanh toán từ trước (bấm đúp, hai tab, gửi lại sau lỗi mạng): ví KHÔNG bị trừ lần hai. */
  daXuLyTruocDo: boolean;
}

export function parseDepositPreview(raw: unknown): DepositPreview {
  const body = readRecord(raw);
  const duSoDu = readBoolean(body.duSoDu);
  return {
    soTienCan: readAmount(body.soTienCan),
    soDuKhaDung: readAmount(body.soDuKhaDung),
    soDuSauThanhToan:
      body.soDuSauThanhToan === null ? null : readAmount(body.soDuSauThanhToan),
    duSoDu,
    hanThanhToan:
      body.hanThanhToan === null ? null : readIso(body.hanThanhToan),
    thoiGianMayChu: readIso(body.thoiGianMayChu),
  };
}

export function parseDepositPaymentResult(raw: unknown): DepositPaymentResult {
  const body = readRecord(raw);
  if (body.trangThai !== 'DaXacNhan') return invalid();
  return {
    maLichHen: readText(body.maLichHen),
    trangThai: 'DaXacNhan',
    soTien: readAmount(body.soTien),
    soDuKhaDung: readAmount(body.soDuKhaDung),
    daXuLyTruocDo: readBoolean(body.daXuLyTruocDo),
  };
}

export async function getDepositPreview(
  maLichHen: string,
  signal?: AbortSignal,
): Promise<DepositPreview> {
  return parseDepositPreview(
    await request<unknown>(`${appointmentPath(maLichHen)}/payment-preview`, {
      signal,
    }),
  );
}

/** Gửi lại an toàn: máy chủ idempotent theo lịch (`daXuLyTruocDo`), lần hai không trừ ví (TLK-04). */
export async function payDeposit(
  maLichHen: string,
): Promise<DepositPaymentResult> {
  return parseDepositPaymentResult(
    await request<unknown>(`${appointmentPath(maLichHen)}/payment`, {
      method: 'POST',
      json: {},
    }),
  );
}
