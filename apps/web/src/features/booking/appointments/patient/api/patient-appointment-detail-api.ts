import { request } from '../../../../../shared/api/client';
import {
  readAmount,
  readFlag,
  readIsoDateTime,
  readMilestones,
  readRecord,
  readText,
  unusableResponse,
} from '../../common/response-readers';
import { parseAppointment } from './patient-appointments-api';
import {
  RESCHEDULE_REQUEST_STATES,
  type PatientAppointmentDetail,
  type PaymentSummary,
  type RefundSummary,
  type RescheduleRequestSummary,
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

// `null` khi lịch chưa từng có yêu cầu đổi lịch. Trạng thái lạ ⇒ không dùng được (không đoán nhãn cho một trạng thái yêu cầu chưa biết); khoá thừa không chép theo.
function parseRescheduleRequest(raw: unknown): RescheduleRequestSummary | null {
  if (raw === null) return null;
  const view = readRecord(raw);
  const trangThai = readText(view.trangThai);
  const state = RESCHEDULE_REQUEST_STATES.find((item) => item === trangThai);
  if (state === undefined) return unusableResponse();
  return {
    trangThai: state,
    thoiGianMongMuon: readIsoDateTime(view.thoiGianMongMuon),
    ghiChuXuLy: view.ghiChuXuLy === null ? null : readText(view.ghiChuXuLy),
    thoiDiemTao: readIsoDateTime(view.thoiDiemTao),
  };
}

// Đủ mười chín khoá: mười hai của dòng danh sách (dùng lại `parseAppointment` của F1) + `lyDoKham`, `thanhToan`, `hoanTien`, `thoiGianMayChu`, `moc` (booking B19),
// `choPhepDoiLich`, `yeuCauDoiLich` (reschedule B5; F1 đọc NGHIÊM vì PR chỉ merge sau B5 và B6, phiên kiểm duyệt 25/11/2026).
// Thiếu một khoá (kể cả `thanhToan`, `hoanTien` hay `yeuCauDoiLich`, vốn có thể `null` nhưng luôn có mặt) ⇒ phản hồi không dùng được.
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
    moc: readMilestones(body.moc),
    choPhepDoiLich: readFlag(body.choPhepDoiLich),
    yeuCauDoiLich: parseRescheduleRequest(body.yeuCauDoiLich),
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
