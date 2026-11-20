import { request } from '../../../shared/api/client';
import {
  invalid,
  readAmount,
  readIso,
  readRecord,
  readString,
} from '../api/read-json';

// Gọi và kiểm hình dạng hai API "Hoàn tiền đặc biệt" của Quản trị viên `ToanHeThong` (payment F8; hợp đồng của B13, PLAN 5.6.2). Máy chủ kiểm quyền; người hoàn lấy từ token.
// Web chỉ tra theo MÃ LỊCH HẸN (Trung chốt 20/11/2026: web chưa có nguồn `benhNhanId`). Tiền là CHUỖI decimal; số trần `conCoTheHoan` do máy chủ tính, web không cộng trừ (WQL-05).

export const ADMIN_REFUNDABLE_PAYMENTS_API =
  '/admin/wallet/refundable-payments';
export const ADMIN_SPECIAL_REFUNDS_API = '/admin/wallet/special-refunds';

export interface RefundablePayment {
  maGiaoDich: string;
  /** Mã lịch CUỐI của chuỗi đổi lịch (lịch Bệnh nhân đang thấy) */
  maLichHen: string;
  soTien: string;
  daHoan: string;
  conCoTheHoan: string;
  thoiDiem: string;
}

export interface SpecialRefundInput {
  maGiaoDich: string;
  /** Số nguyên đồng dạng chuỗi, ví dụ `"100000"` */
  soTien: string;
  lyDo: string;
}

export function parseRefundablePayment(raw: unknown): RefundablePayment {
  const row = readRecord(raw);
  return {
    maGiaoDich: readString(row.maGiaoDich),
    maLichHen: readString(row.maLichHen),
    soTien: readAmount(row.soTien),
    daHoan: readAmount(row.daHoan),
    conCoTheHoan: readAmount(row.conCoTheHoan),
    thoiDiem: readIso(row.thoiDiem),
  };
}

export function parseRefundablePayments(raw: unknown): RefundablePayment[] {
  const body = readRecord(raw);
  if (!Array.isArray(body.items)) return invalid();
  return body.items.map(parseRefundablePayment);
}

export async function getRefundablePayments(
  maLichHen: string,
  signal?: AbortSignal,
): Promise<RefundablePayment[]> {
  return parseRefundablePayments(
    await request<unknown>(ADMIN_REFUNDABLE_PAYMENTS_API, {
      query: { maLichHen },
      signal,
    }),
  );
}

/** MỘT lời gọi ghi; không tự thử lại. Phản hồi chỉ được kiểm hình dạng (không có số dư, BDT-08). */
export async function createSpecialRefund(
  input: SpecialRefundInput,
): Promise<{ maGiaoDich: string; soTien: string }> {
  const body = readRecord(
    await request<unknown>(ADMIN_SPECIAL_REFUNDS_API, {
      method: 'POST',
      json: input,
    }),
  );
  return {
    maGiaoDich: readString(body.maGiaoDich),
    soTien: readAmount(body.soTien),
  };
}
