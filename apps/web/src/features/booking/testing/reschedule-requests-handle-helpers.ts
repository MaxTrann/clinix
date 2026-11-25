import { fireEvent, screen, within } from '@testing-library/react';
import { HANDLE_TEXT } from '../appointments/common/reschedule-requests/request-handle-text';
import { REQUEST_TEXT } from '../appointments/common/reschedule-requests/request-text';
import type { RequestDetail } from '../appointments/common/reschedule-requests/request-types';
import { fakeRecord } from './fake-reschedule-requests-api';
import { createFakeRescheduleRequestsHandleApi } from './fake-reschedule-requests-handle-api';
import { makeRequestDetail } from './reschedule-requests-fixtures';
import { renderRequests } from './reschedule-requests-harness';

// Trợ giúp cho test luồng Duyệt, Từ chối của trang chi tiết yêu cầu đổi lịch (reschedule F4 Pha B1). Chỉ test dùng. Dựng trang THẬT của Lễ tân với API giả GHI (`fake-reschedule-requests-handle-api.ts`).
export const DETAIL = '/le-tan/yeu-cau-doi-lich';

export function makeHandleApi() {
  return createFakeRescheduleRequestsHandleApi(
    async () => new Response('Không có trong API giả', { status: 404 }),
  );
}

export type HandleApi = ReturnType<typeof makeHandleApi>;

// Vào trang chi tiết của MỘT yêu cầu đang chờ (id 101) và chờ thẻ tóm tắt hiện. `setup` chạy sau khi kho đã có dữ liệu và trước khi dựng trang (đặt `onHandle`, `failNextWrite`…).
export async function openPending(
  detail: Partial<RequestDetail> = {},
  options: {
    setup?: (api: HandleApi) => void;
    entry?: string | { pathname: string; search?: string; state?: unknown };
  } = {},
) {
  const api = makeHandleApi();
  api.records = [fakeRecord(makeRequestDetail({ yeuCauId: '101', ...detail }))];
  options.setup?.(api);
  const view = renderRequests({
    makeApi: () => api,
    entry: options.entry ?? `${DETAIL}/101`,
  });
  await screen.findByRole('region', { name: REQUEST_TEXT.summary });
  return { ...view, api };
}

export const approveButton = () =>
  screen.getByRole('button', { name: HANDLE_TEXT.approve });
export const rejectButton = () =>
  screen.getByRole('button', { name: HANDLE_TEXT.reject });

export const dialogOf = (target: 'approve' | 'reject') =>
  screen.getByRole('dialog', {
    name:
      target === 'approve' ? HANDLE_TEXT.approveTitle : HANDLE_TEXT.rejectTitle,
  });

export const noteBox = (target: 'approve' | 'reject') =>
  within(dialogOf(target)).getByRole<HTMLTextAreaElement>('textbox', {
    name: /Ghi chú xử lý/,
  });

export const confirmButton = (target: 'approve' | 'reject') =>
  within(dialogOf(target)).getByRole('button', {
    name:
      target === 'approve'
        ? HANDLE_TEXT.approveConfirm
        : HANDLE_TEXT.rejectConfirm,
  });

export const typeNote = (target: 'approve' | 'reject', value: string) =>
  fireEvent.change(noteBox(target), { target: { value } });

// Mở hộp, gõ ghi chú rồi bấm xác nhận (MỘT lần bấm)
export function submitDialog(target: 'approve' | 'reject', note: string) {
  fireEvent.click(target === 'approve' ? approveButton() : rejectButton());
  typeNote(target, note);
  fireEvent.click(confirmButton(target));
}
