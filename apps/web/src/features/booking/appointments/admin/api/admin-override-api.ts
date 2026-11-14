import { request } from '../../../../../shared/api/client';
import {
  readCode,
  readRecord,
  readRefund,
  readText,
  unusableResponse,
} from '../../common/response-readers';
import { adminAppointmentApiPath } from './admin-appointment-detail-api';
import type { OverrideBody, OverrideResult } from './admin-appointment-types';

// Route ghi của Quản trị viên `POST /admin/appointments/:maLichHen/override-status` (booking F10; hợp đồng B14: TRACKING 3.31). GẮN access token. Số hoàn luôn là chuỗi decimal của
// máy chủ: client chỉ kiểm dạng và hiện, không bao giờ tính.

// Kiểm 200: `trangThai` phải đúng ĐÍCH đã gửi (kết quả khác là hợp đồng gãy, không được hiện "đã đổi" khi máy chủ nói điều khác); `DaHuy` phải có `hoanCoc` là `null` hay đủ hai khoá.
// Ba đích còn lại chỉ có `maLichHen` và `trangThai`; khoá thừa không được chép theo.
export function parseOverrideResult(
  raw: unknown,
  target: OverrideBody['trangThai'],
): OverrideResult {
  const body = readRecord(raw);
  if (readText(body.trangThai) !== target) return unusableResponse();
  const maLichHen = readCode(body.maLichHen);
  if (target !== 'DaHuy') return { maLichHen, trangThai: target };
  return {
    maLichHen,
    trangThai: 'DaHuy',
    hoanCoc: body.hoanCoc === null ? null : readRefund(body.hoanCoc),
  };
}

// Thân dựng TƯỜNG MINH từng trường: đúng hai khoá `trangThai` và `lyDo` (lý do đã cắt khoảng trắng và đã qua kiểm, bắt buộc ở mọi đích). Không truyền `signal`: yêu cầu đã gửi thì máy chủ
// vẫn xử lý dù trang bị gỡ, nên huỷ ở client chỉ làm người dùng không biết kết quả (nếp F2). Lỗi (404, 409, 503…) là `ApiError`; mạng, quá giờ, phản hồi lạ là các lỗi còn lại và nơi
// gọi coi là "chưa rõ". KHÔNG ghi lý do ra URL hay log.
export async function overrideAppointmentStatus(
  maLichHen: string,
  body: OverrideBody,
): Promise<OverrideResult> {
  return parseOverrideResult(
    await request<unknown>(
      `${adminAppointmentApiPath(maLichHen)}/override-status`,
      {
        method: 'POST',
        json: { trangThai: body.trangThai, lyDo: body.lyDo },
      },
    ),
    body.trangThai,
  );
}
