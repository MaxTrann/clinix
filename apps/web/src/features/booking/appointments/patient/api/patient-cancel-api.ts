import { request } from '../../../../../shared/api/client';
import {
  readAmount,
  readCode,
  readCount,
  readFlag,
  readRecord,
  readText,
  unusableResponse,
} from '../../common/response-readers';
import { appointmentApiPath } from './patient-appointment-detail-api';
import type {
  CancelPreview,
  CancelResult,
  RefundAmount,
  RefundPreview,
} from './patient-appointment-types';

// Hai route huỷ của Bệnh nhân (booking F2; PLAN 5.6, 5.9; hợp đồng B10: TRACKING 3.23 B10-G, 3.27 F2-D). Cả hai GẮN access token. Số tiền luôn là chuỗi
// decimal của máy chủ: client chỉ kiểm dạng và hiện, không bao giờ tính.

// Số hoàn: `tyLe` nguyên 0 đến 100 (B10), `soTien` chuỗi decimal
function readRefund(raw: unknown): RefundAmount {
  const row = readRecord(raw);
  const tyLe = readCount(row.tyLe);
  if (tyLe > 100) return unusableResponse();
  return { tyLe, soTien: readAmount(row.soTien) };
}

function readRefundPreview(raw: unknown): RefundPreview {
  const row = readRecord(raw);
  return {
    ...readRefund(row),
    mocApDung: row.mocApDung === null ? null : readCount(row.mocApDung),
  };
}

// `choPhepHuy = false` ⇒ `hoanCoc` luôn `null` (không đọc); `lyDoKhongHuy` vắng cũng được. `choPhepHuy = true` ⇒ `hoanCoc` là `null` hay đủ ba khoá.
export function parseCancelPreview(raw: unknown): CancelPreview {
  const body = readRecord(raw);
  if (!readFlag(body.choPhepHuy)) {
    return {
      choPhepHuy: false,
      lyDoKhongHuy:
        body.lyDoKhongHuy === undefined ? null : readText(body.lyDoKhongHuy),
    };
  }
  return {
    choPhepHuy: true,
    hoanCoc: body.hoanCoc === null ? null : readRefundPreview(body.hoanCoc),
  };
}

// `trangThai` phải là `DaHuy`: kết quả khác là hợp đồng gãy, không được hiện "Đã hủy" khi máy chủ nói điều khác
export function parseCancelResult(raw: unknown): CancelResult {
  const body = readRecord(raw);
  if (readText(body.trangThai) !== 'DaHuy') return unusableResponse();
  return {
    maLichHen: readCode(body.maLichHen),
    hoanCoc: body.hoanCoc === null ? null : readRefund(body.hoanCoc),
  };
}

// CHỈ ĐỌC (không giữ chỗ, không ghi): số hoàn DỰ KIẾN (Q18)
export async function getCancelPreview(
  maLichHen: string,
  signal?: AbortSignal,
): Promise<CancelPreview> {
  return parseCancelPreview(
    await request<unknown>(`${appointmentApiPath(maLichHen)}/cancel-preview`, {
      signal,
    }),
  );
}

// Thân `{}`: Bệnh nhân không nhập lý do (Q27, L33), backend dùng chữ hằng. Không truyền `signal`: yêu cầu đã gửi thì máy chủ vẫn xử lý dù trang bị gỡ,
// nên huỷ ở client chỉ làm người dùng không biết kết quả. Kết quả lỗi (404, 409, 503…) là `ApiError`; mạng, quá giờ, phản hồi lạ là các lỗi còn lại.
export async function cancelPatientAppointment(
  maLichHen: string,
): Promise<CancelResult> {
  return parseCancelResult(
    await request<unknown>(`${appointmentApiPath(maLichHen)}/cancel`, {
      method: 'POST',
      json: {},
    }),
  );
}
