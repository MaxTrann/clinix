import { fireEvent, screen } from '@testing-library/react';
import {
  patientAppointmentDetailPath,
  patientAppointmentRescheduleConfirmPath,
  patientAppointmentReschedulePath,
} from '../../../shared/routes/booking-paths';
import { DETAIL_CODE } from './appointment-detail-harness';
import { jsonResponse } from './fake-appointment-list-api';
import { makeDetail } from './fake-appointment-detail-api';
import {
  makeDoneResult,
  makePreview,
  makeRequestResult,
  NEW_APPOINTMENT_CODE,
  NEW_SLOT_TIME,
  type SubmitCall,
} from './fake-reschedule-api';
import {
  renderReschedule,
  type RescheduleHarnessOptions,
} from './reschedule-harness';
import { RESCHEDULE_TEXT } from '../appointments/patient/reschedule/reschedule-text';

// Đồ dùng chung của các test màn xác nhận đổi lịch (reschedule F2). Chỉ test dùng; dữ liệu giả, KHÔNG gọi backend thật. Id khung giờ LỚN HƠN 2^53 để mọi ca đều chứng minh id đi nguyên chuỗi.
export const SLOT_ID = '9007199254740993';
export const CONFIRM_PATH = patientAppointmentRescheduleConfirmPath(
  DETAIL_CODE,
  SLOT_ID,
);
export const GRID_PATH = patientAppointmentReschedulePath(DETAIL_CODE);
export const OLD_DETAIL_PATH = patientAppointmentDetailPath(DETAIL_CODE);
export const NEW_DETAIL_PATH =
  patientAppointmentDetailPath(NEW_APPOINTMENT_CODE);

// Một `ApiError` giả: `thongBao` và `requestId` cố ý có dấu vết để test chứng minh chúng không bao giờ lên màn hình
export const apiError = (
  status: number,
  maLoi: string,
  extra: Record<string, unknown> = {},
) =>
  jsonResponse(
    {
      maLoi,
      thongBao: 'THONG_BAO_NOI_BO_CUA_MAY_CHU',
      requestId: 'req-nội-bộ-1',
      ...extra,
    },
    status,
  );
export const noLeak = (container: HTMLElement) =>
  expect(container.textContent).not.toMatch(
    /THONG_BAO_NOI_BO|req-nội-bộ|LOI_HE_THONG|MA_LA|KHONG_DU_QUYEN|KHONG_TIM_THAY|LICH_HEN_|VUOT_SO|KHUNG_GIO_|DA_CO_YEU_CAU|HE_THONG_|chiTiet|stack/,
  );

// Dựng màn xác nhận. `loai`/`soLanDaDoi`/`soLanToiDa` đặt preview; `afterSubmit` chạy khi máy chủ giả nhận POST hợp lệ (đổi chi tiết sang lịch mới hay lịch có yêu cầu chờ).
export interface ConfirmOptions extends Omit<RescheduleHarnessOptions, 'path'> {
  path?: string;
  preview?: Parameters<typeof makePreview>[0];
}
export function renderConfirm(options: ConfirmOptions = {}) {
  const { preview, before, path, ...rest } = options;
  return renderReschedule({
    ...rest,
    path: path ?? CONFIRM_PATH,
    before: (api) => {
      if (preview !== undefined) api.preview = makePreview(preview);
      before?.(api);
    },
  });
}

// Sau khi `DaDoi`: chi tiết của mã MỚI (khung giờ mới)
export function becomeNewAppointment(api: {
  detail: { detail: unknown };
}): void {
  api.detail.detail = makeDetail({
    maLichHen: NEW_APPOINTMENT_CODE,
    thoiGian: NEW_SLOT_TIME,
  });
}
// Sau khi `DaGuiYeuCau`: chi tiết của mã CŨ có yêu cầu `ChoDuyet` (nút "Đổi lịch" vô hiệu theo cờ máy chủ)
export function becomePendingRequest(api: {
  detail: { detail: unknown };
}): void {
  api.detail.detail = makeDetail({
    choPhepDoiLich: false,
    yeuCauDoiLich: {
      trangThai: 'ChoDuyet',
      thoiGianMongMuon: NEW_SLOT_TIME,
      ghiChuXuLy: null,
      thoiDiemTao: '2026-11-25T03:05:00.000Z',
    },
  });
}

export const doneResponse = () => jsonResponse(makeDoneResult(), 201);
export const requestSentResponse = () => jsonResponse(makeRequestResult(), 201);

// Chữ của liên kết rời trang giữa lúc chờ (thử "người dùng rời đi, rồi máy chủ mới trả lời"); test tự dựng `<Link to={PATIENT_APPOINTMENTS_PATH}>`
export const LEAVE_LINK = 'Rời trang thử';

export const TEXT = RESCHEDULE_TEXT;
export const confirmButton = () =>
  screen.getByRole('button', { name: TEXT.confirmButton });
export const requestButton = () =>
  screen.getByRole('button', { name: TEXT.requestButton });
export const reasonField = () =>
  screen.getByRole('textbox', { name: TEXT.reasonLabel });
export const typeReason = (value: string) =>
  fireEvent.change(reasonField(), { target: { value } });
export const bodyOf = (call: SubmitCall | undefined) => call?.body;
// Chờ màn xác nhận vẽ xong phần "cũ → mới" (preview đã về)
export const formLoaded = () =>
  screen.findByRole('heading', { level: 2, name: TEXT.newTitle });
