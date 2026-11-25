import { fireEvent, screen } from '@testing-library/react';
import {
  receptionAppointmentDetailPath,
  receptionAppointmentRescheduleConfirmPath,
  receptionAppointmentReschedulePath,
} from '../../../shared/routes/booking-paths';
import { RESCHEDULE_TEXT } from '../appointments/common/reschedule-text';
import { RECEPTION_RESCHEDULE_TEXT } from '../appointments/reception/reschedule/reception-reschedule-text';
import { jsonResponse } from './fake-appointment-list-api';
import { makeDoneResult, NEW_APPOINTMENT_CODE } from './fake-reschedule-api';

// Đồ dùng chung của các test Lễ tân đổi lịch hộ (reschedule F3): mã lịch, đường dẫn, câu và tìm phần tử. Chỉ test dùng; dữ liệu giả, KHÔNG gọi backend thật. Tách khỏi `reception-reschedule-harness.tsx` vì
// luật `react-refresh/only-export-components` không cho một file `.tsx` vừa xuất thành phần vừa xuất hằng và hàm. Id khung giờ LỚN HƠN 2^53 để mọi ca chứng minh id đi nguyên chuỗi.
export const RECEPTION_CODE = 'CP20261018001';
export const SLOT_ID = '9007199254740993';
export const GRID_PATH = receptionAppointmentReschedulePath(RECEPTION_CODE);
export const CONFIRM_PATH = receptionAppointmentRescheduleConfirmPath(
  RECEPTION_CODE,
  SLOT_ID,
);
export const OLD_DETAIL_PATH = receptionAppointmentDetailPath(RECEPTION_CODE);
export const NEW_DETAIL_PATH =
  receptionAppointmentDetailPath(NEW_APPOINTMENT_CODE);

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
    /THONG_BAO_NOI_BO|req-nội-bộ|LOI_HE_THONG|MA_LA|KHONG_DU_QUYEN|KHONG_TIM_THAY|LICH_HEN_|VUOT_SO|KHUNG_GIO_|DA_CO_YEU_CAU|HE_THONG_|LY_DO_BAT_BUOC|chiTiet|stack/,
  );

export const TEXT = RESCHEDULE_TEXT;
export const RTEXT = RECEPTION_RESCHEDULE_TEXT;
export const confirmButton = () =>
  screen.getByRole('button', { name: RTEXT.confirmButton });
export const reasonField = () =>
  screen.getByRole<HTMLTextAreaElement>('textbox', { name: RTEXT.reasonLabel });
export const typeReason = (value: string) =>
  fireEvent.change(reasonField(), { target: { value } });
export const currentUrl = () => screen.getByTestId('url').textContent;
// 201 `DaDoi` của lịch mẫu (dùng với `holdResponse` để giữ phản hồi)
export const doneResponse = () =>
  jsonResponse(makeDoneResult({ maLichHenCu: RECEPTION_CODE }), 201);
// Chờ màn xác nhận vẽ xong phần "cũ → mới" (preview đã về)
export const formLoaded = () =>
  screen.findByRole('heading', { level: 2, name: TEXT.newTitle });
