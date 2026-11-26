import { fireEvent, screen, within } from '@testing-library/react';
import { HANDLE_TEXT } from '../appointments/common/reschedule-requests/request-handle-text';
import { REQUEST_TEXT } from '../appointments/common/reschedule-requests/request-text';
import type { RequestDetail } from '../appointments/common/reschedule-requests/request-types';
import { createFakeReceptionRescheduleApi } from './fake-reception-reschedule-api';
import { fakeRecord } from './fake-reschedule-requests-api';
import { createFakeRescheduleRequestsHandleApi } from './fake-reschedule-requests-handle-api';
import { makeRequestDetail } from './reschedule-requests-fixtures';
import { renderRequests } from './reschedule-requests-harness';
import {
  approveButton,
  DETAIL,
  dialogOf,
} from './reschedule-requests-handle-helpers';

// Trợ giúp cho test "Chọn khung giờ khác" (reschedule F4 Pha B2). Chỉ test dùng. Nối HAI API giả: yêu cầu đổi lịch (đọc và ghi, khớp B8, B9) đứng trước, đường dẫn lạ chuyển sang API giả đổi hộ của F3 (preview Lễ tân
// của B7 và lưới `public/doctor-slots`). Đồng hồ cố định để ngày của lưới và chữ giờ không đổi theo ngày chạy test. Dữ liệu giả, KHÔNG gọi backend thật.
export const TODAY = '2026-11-25';
export const DESIRED = '2026-11-27T03:30:00.000Z';
export const DESIRED_TEXT = 'Thứ 6, 27/11/2026, 10:30';
// Lưới mặc định của API giả cho ngày 25: `1251` (08:00, trống), `1252` (08:30, đã đặt), `1253` (09:00, trống)
export const FIRST_SLOT = {
  id: '1251',
  cell: '08:00, còn trống',
  text: 'Thứ 4, 25/11/2026, 08:00',
};
export const SECOND_SLOT = {
  id: '1253',
  cell: '09:00, còn trống',
  text: 'Thứ 4, 25/11/2026, 09:00',
};

export function fixClock() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T03:00:00Z`));
}

export function makeSlotApis() {
  const reception = createFakeReceptionRescheduleApi(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
  const api = createFakeRescheduleRequestsHandleApi(reception.fetch);
  return { api, reception };
}

export type SlotApis = ReturnType<typeof makeSlotApis>;

// Vào chi tiết yêu cầu 101 đang chờ rồi MỞ hộp Duyệt
export async function openApproveWithSlots(
  detail: Partial<RequestDetail> = {},
  options: { setup?: (apis: SlotApis) => void } = {},
) {
  const apis = makeSlotApis();
  apis.api.records = [
    fakeRecord(
      makeRequestDetail({
        yeuCauId: '101',
        thoiGianMongMuon: DESIRED,
        ...detail,
      }),
    ),
  ];
  options.setup?.(apis);
  const view = renderRequests({
    makeApi: () => apis.api,
    entry: `${DETAIL}/101`,
  });
  await screen.findByRole('region', { name: REQUEST_TEXT.summary });
  fireEvent.click(approveButton());
  return { ...view, ...apis };
}

export const pickButton = () =>
  within(dialogOf('approve')).getByRole('button', {
    name: HANDLE_TEXT.pickAnother,
  });
export const queryPickButton = () =>
  screen.queryByRole('button', { name: HANDLE_TEXT.pickAnother });
export const useDesiredButton = () =>
  within(dialogOf('approve')).getByRole('button', {
    name: HANDLE_TEXT.useDesired,
  });
export const panelHeading = () =>
  screen.queryByRole('heading', { level: 2, name: HANDLE_TEXT.panelTitle });
export const backToApproveButton = () =>
  screen.getByRole('button', { name: HANDLE_TEXT.backToApprove });
export const slotCell = (name: string) => screen.findByRole('button', { name });

// Từ hộp Duyệt đang mở: bấm "Chọn khung giờ khác" và chờ bảng chọn hiện
export async function openPanel() {
  fireEvent.click(pickButton());
  return screen.findByRole('heading', {
    level: 2,
    name: HANDLE_TEXT.panelTitle,
  });
}

// Mở bảng rồi chọn một ô còn trống (hộp Duyệt mở lại)
export async function chooseSlot(cell: string = FIRST_SLOT.cell) {
  await openPanel();
  fireEvent.click(await slotCell(cell));
}
