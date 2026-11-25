import { request } from '../../../../../shared/api/client';
import { APPOINTMENT_CODE } from '../../../api/booking-errors';
import {
  readIsoDateTime,
  readRecord,
  readText,
  unusableResponse,
} from '../../common/response-readers';
import { appointmentApiPath } from '../api/patient-appointment-detail-api';
import type {
  RescheduleDone,
  RescheduleRequestSent,
  RescheduleResult,
  RescheduleSubmitInput,
} from './reschedule-types';

// Gọi và kiểm hình dạng `POST /patient/appointments/:maLichHen/reschedule` (reschedule F2; PLAN reschedule 5.8; hợp đồng THẬT của B6: TRACKING mục 7). Route của Bệnh nhân nên GẮN access token
// (mặc định của `request()`); chủ sở hữu do backend lấy từ token. Bộ đọc NGHIÊM: thiếu khoá hay sai kiểu ⇒ `UnexpectedResponseError`, khoá thừa (kể cả `yeuCauId` nếu máy chủ lỡ trả) không bao giờ
// được chép ra kết quả. Ở pha GỬI, `UnexpectedResponseError` là "chưa rõ" (máy chủ có thể đã ghi), nên bộ đọc chỉ từ chối khi hình dạng thật sự sai.

// Mã lịch hẹn đi vào URL điều hướng: chỉ nhận đúng dạng mà luồng đặt lịch cũng nhận (`APPOINTMENT_CODE`)
function readAppointmentCode(value: unknown): string {
  const text = readText(value);
  return APPOINTMENT_CODE.test(text) ? text : unusableResponse();
}

function parseDone(body: Record<string, unknown>): RescheduleDone {
  const created = readRecord(body.lichHenMoi);
  const replaced = readRecord(body.lichHenCu);
  return {
    ketQua: 'DaDoi',
    lichHenMoi: {
      maLichHen: readAppointmentCode(created.maLichHen),
      thoiGian: readIsoDateTime(created.thoiGian),
      trangThai: readText(created.trangThai),
    },
    lichHenCu: { maLichHen: readAppointmentCode(replaced.maLichHen) },
    thoiGianMayChu: readIsoDateTime(body.thoiGianMayChu),
  };
}

function parseRequestSent(
  body: Record<string, unknown>,
): RescheduleRequestSent {
  const sent = readRecord(body.yeuCau);
  // Chỉ có MỘT trạng thái hợp lệ ngay sau khi gửi; khác đi là hợp đồng gãy, không đoán
  if (readText(sent.trangThai) !== 'ChoDuyet') return unusableResponse();
  return {
    ketQua: 'DaGuiYeuCau',
    yeuCau: {
      trangThai: 'ChoDuyet',
      thoiGianMongMuon: readIsoDateTime(sent.thoiGianMongMuon),
    },
    thoiGianMayChu: readIsoDateTime(body.thoiGianMayChu),
  };
}

export function parseRescheduleResult(raw: unknown): RescheduleResult {
  const body = readRecord(raw);
  const outcome = readText(body.ketQua);
  if (outcome === 'DaDoi') return parseDone(body);
  if (outcome === 'DaGuiYeuCau') return parseRequestSent(body);
  return unusableResponse();
}

// Không truyền `signal`: yêu cầu đã gửi thì máy chủ vẫn xử lý dù trang bị gỡ, nên huỷ ở client chỉ làm người dùng không biết kết quả (nếp hộp huỷ lịch). Hạn chờ 15 giây là của `request()`
// (`TimeoutError`). `lyDoYeuCau` vắng thì KHÔNG có khoá trong thân (không `null`): ở nhánh còn lần tự đổi máy chủ bỏ qua lý do, nên web không gửi thừa.
export async function submitReschedule(
  maLichHen: string,
  input: RescheduleSubmitInput,
): Promise<RescheduleResult> {
  const json =
    input.lyDoYeuCau === undefined
      ? { khungGioId: input.khungGioId }
      : { khungGioId: input.khungGioId, lyDoYeuCau: input.lyDoYeuCau };
  return parseRescheduleResult(
    await request<unknown>(`${appointmentApiPath(maLichHen)}/reschedule`, {
      method: 'POST',
      json,
    }),
  );
}
