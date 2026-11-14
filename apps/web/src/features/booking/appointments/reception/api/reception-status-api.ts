import { request } from '../../../../../shared/api/client';
import {
  readCode,
  readRecord,
  readRefund,
  readText,
  unusableResponse,
} from '../../common/response-readers';
import { receptionAppointmentApiPath } from './reception-appointment-detail-api';
import type {
  ReceptionTarget,
  StatusChangeBody,
  StatusChangeResult,
} from './reception-appointment-types';

// Route ghi của Lễ tân `POST /reception/appointments/:maLichHen/status` (booking F9; hợp đồng B12: TRACKING 3.26 B12-E, 3.30 F9-D). GẮN access token. Số hoàn luôn là chuỗi
// decimal của máy chủ: client chỉ kiểm dạng và hiện, không bao giờ tính.

// Kiểm 200: `trangThai` phải đúng ĐÍCH đã gửi (kết quả khác là hợp đồng gãy, không được hiện "đã làm" khi máy chủ nói điều khác); `DaHuy` phải có `hoanCoc` là `null` hay đủ
// hai khoá. Hai đích còn lại chỉ có `maLichHen` và `trangThai`; khoá thừa không được chép theo.
export function parseStatusResult(
  raw: unknown,
  target: ReceptionTarget,
): StatusChangeResult {
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

// Thân dựng TƯỜNG MINH từng trường: `lyDo` chỉ đi theo `DaHuy`; `VangMat` và `DaTiepDon` không gửi `lyDo` dù nơi gọi lỡ truyền (Q27; backend vẫn bỏ qua, nhưng không gửi dữ liệu thừa).
// Không truyền `signal`: yêu cầu đã gửi thì máy chủ vẫn xử lý dù ngăn bị gỡ, nên huỷ ở client chỉ làm người dùng không biết kết quả (nếp F2). Lỗi (404, 409, 503…) là `ApiError`;
// mạng, quá giờ, phản hồi lạ là các lỗi còn lại và nơi gọi coi là "chưa rõ".
export async function changeReceptionStatus(
  maLichHen: string,
  body: StatusChangeBody,
): Promise<StatusChangeResult> {
  const json =
    body.trangThai === 'DaHuy'
      ? { trangThai: body.trangThai, lyDo: body.lyDo }
      : { trangThai: body.trangThai };
  return parseStatusResult(
    await request<unknown>(`${receptionAppointmentApiPath(maLichHen)}/status`, {
      method: 'POST',
      json,
    }),
    body.trangThai,
  );
}
