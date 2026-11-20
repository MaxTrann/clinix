import { request } from '../../../shared/api/client';
import {
  invalid,
  readAmount,
  readIso,
  readRecord,
  readText,
} from '../api/read-json';

// Hai API thu tiền mặt tại quầy của Lễ tân (payment F4; hợp đồng B6, PLAN 5.7, 5.11 #8 và #8a). Gắn access token; chi nhánh và người thu backend lấy từ token,
// web KHÔNG gửi `chiNhanhId`, `nguoiThuId`. Mọi số tiền là CHUỖI decimal do máy chủ tính; client KHÔNG lấy giá trừ đã thanh toán (WTQ-01).

const receptionPath = (maLichHen: string) =>
  `/reception/appointments/${encodeURIComponent(maLichHen)}`;

/** Ba số của hộp "Thu tiền & tiếp đón" (Figma `492:2`). */
export interface CashPreview {
  maLichHen: string;
  giaKham: string;
  daThanhToanTruoc: string;
  thuTaiQuay: string;
}

export interface CashReceipt {
  soPhieu: string;
  giaKham: string;
  daThanhToanTruoc: string;
  thuTaiQuay: string;
  thoiDiem: string;
  nguoiThu: string;
}

export interface CollectCashResult {
  maLichHen: string;
  trangThai: 'DaTiepDon';
  phieuThu: CashReceipt;
}

export function parseCashPreview(raw: unknown): CashPreview {
  const body = readRecord(raw);
  return {
    maLichHen: readText(body.maLichHen),
    giaKham: readAmount(body.giaKham),
    daThanhToanTruoc: readAmount(body.daThanhToanTruoc),
    thuTaiQuay: readAmount(body.thuTaiQuay),
  };
}

export function parseCollectCashResult(raw: unknown): CollectCashResult {
  const body = readRecord(raw);
  if (body.trangThai !== 'DaTiepDon') return invalid();
  const receipt = readRecord(body.phieuThu);
  return {
    maLichHen: readText(body.maLichHen),
    trangThai: 'DaTiepDon',
    phieuThu: {
      soPhieu: readText(receipt.soPhieu),
      giaKham: readAmount(receipt.giaKham),
      daThanhToanTruoc: readAmount(receipt.daThanhToanTruoc),
      thuTaiQuay: readAmount(receipt.thuTaiQuay),
      thoiDiem: readIso(receipt.thoiDiem),
      nguoiThu: readText(receipt.nguoiThu),
    },
  };
}

/**
 * Số gửi đi là số nguyên đồng dạng chuỗi (DTO của B6): "200000.00" ⇒ "200000". Chỉ bỏ phần lẻ TOÀN số 0, không làm tròn: số có lẻ (hiếm, do hoàn tiền làm tròn) gửi nguyên
 * để máy chủ từ chối bằng mã của nó, web không tự đoán số khác.
 */
export function cashAmountOf(thuTaiQuay: string): string {
  return thuTaiQuay.replace(/\.0+$/, '');
}

export async function getCashPreview(
  maLichHen: string,
  signal?: AbortSignal,
): Promise<CashPreview> {
  return parseCashPreview(
    await request<unknown>(`${receptionPath(maLichHen)}/cash-preview`, {
      signal,
    }),
  );
}

export async function collectCash(
  maLichHen: string,
  thuTaiQuay: string,
): Promise<CollectCashResult> {
  return parseCollectCashResult(
    await request<unknown>(`${receptionPath(maLichHen)}/collect-cash`, {
      method: 'POST',
      json: { soTien: cashAmountOf(thuTaiQuay) },
    }),
  );
}
