import { request } from '../../../../../shared/api/client';
import {
  readAmount,
  readIsoDateTime,
  readRecord,
  readText,
  unusableResponse,
} from '../../common/response-readers';
import { parseAppointment } from './patient-appointments-api';
import type {
  PatientAppointmentDetail,
  PaymentSummary,
  RefundSummary,
} from './patient-appointment-types';

// Gọi và kiểm hình dạng `GET /patient/appointments/:maLichHen` (booking F2; PLAN 5.9, hợp đồng B2: TRACKING 3.15, 3.27 F2-D). Route của Bệnh nhân nên GẮN
// access token (mặc định của `request()`); chủ sở hữu do backend lấy từ token. Chỉ đọc đúng các khoá cần: khoá thừa không bao giờ lọt ra màn hình.

// `null` tới khi module `payment` có. Chỉ hai khoá hiển thị (`daThu`, `conPhaiThu`); `giaoDich[]` F2 không vẽ nên không đọc, để hình dạng của nó đổi
// cũng không làm vỡ trang chi tiết.
function parsePayment(raw: unknown): PaymentSummary | null {
  if (raw === null) return null;
  const view = readRecord(raw);
  return {
    daThu: readAmount(view.daThu),
    conPhaiThu: readAmount(view.conPhaiThu),
  };
}

// `null` tới khi module `wallet` có hoặc chưa hoàn lần nào. `trangThai` lạ ⇒ không dùng được (không đoán nhãn cho một trạng thái hoàn tiền chưa biết).
function parseRefund(raw: unknown): RefundSummary | null {
  if (raw === null) return null;
  const view = readRecord(raw);
  const trangThai = readText(view.trangThai);
  if (trangThai !== 'ThanhCong' && trangThai !== 'ThatBai') {
    return unusableResponse();
  }
  return { soTien: readAmount(view.soTien), trangThai };
}

// Đủ mười sáu khoá: mười hai của dòng danh sách (dùng lại `parseAppointment` của F1) + `lyDoKham`, `thanhToan`, `hoanTien`, `thoiGianMayChu`.
// Thiếu một khoá (kể cả `thanhToan` hay `hoanTien`, vốn có thể `null` nhưng luôn có mặt) ⇒ phản hồi không dùng được.
export function parsePatientAppointmentDetail(
  raw: unknown,
): PatientAppointmentDetail {
  const body = readRecord(raw);
  return {
    ...parseAppointment(body),
    lyDoKham: body.lyDoKham === null ? null : readText(body.lyDoKham),
    thanhToan: parsePayment(body.thanhToan),
    hoanTien: parseRefund(body.hoanTien),
    thoiGianMayChu: readIsoDateTime(body.thoiGianMayChu),
  };
}

// Đường dẫn API của một lịch hẹn; mã đi qua `encodeURIComponent` (backend tự chuẩn hoá chữ hoa và kiểm dạng, sai dạng ⇒ 404 cùng thân)
export const appointmentApiPath = (maLichHen: string) =>
  `patient/appointments/${encodeURIComponent(maLichHen)}`;

export async function getPatientAppointment(
  maLichHen: string,
  signal?: AbortSignal,
): Promise<PatientAppointmentDetail> {
  return parsePatientAppointmentDetail(
    await request<unknown>(appointmentApiPath(maLichHen), { signal }),
  );
}
