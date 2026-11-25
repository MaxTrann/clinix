import { act } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Link } from 'react-router';
import { PATIENT_APPOINTMENTS_PATH } from '../../../../../shared/routes/booking-paths';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanUpDetailPage,
  currentUrl,
  DETAIL_CODE,
  flush,
  holdResponse,
  LIST_MARK,
} from '../../../testing/appointment-detail-harness';
import {
  makeRequestResult,
  NEW_APPOINTMENT_CODE,
} from '../../../testing/fake-reschedule-api';
import {
  becomeNewAppointment,
  becomePendingRequest,
  CONFIRM_PATH,
  confirmButton,
  doneResponse,
  formLoaded,
  LEAVE_LINK,
  NEW_DETAIL_PATH,
  OLD_DETAIL_PATH,
  reasonField,
  renderConfirm,
  requestButton,
  SLOT_ID,
  TEXT,
  typeReason,
} from '../../../testing/reschedule-confirm-helpers';

// reschedule F2: gửi đổi lịch. Mã WDH-37 [đề xuất] (khoá khi gửi, bấm đúp một lần, rời trang giữa chừng, không ghi kho trình duyệt), WDH-05 (`DaDoi` ⇒ chi tiết lịch mới kèm thông báo; `DaGuiYeuCau` ⇒ chi tiết lịch
// cũ kèm banner), WDH-07 (F2: đang gửi). Dữ liệu giả; hôm nay giả là 25/11/2026.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T03:00:00Z'));
});
afterEach(cleanUpDetailPage);

const REQUEST = { loai: 'GuiYeuCau', soLanDaDoi: 2, soLanToiDa: 2 } as const;
const detailGets = (
  api: ReturnType<typeof renderConfirm>['api'],
  code: string,
) => api.detail.callsTo('GET', `/patient/appointments/${code}`);

describe('`DaDoi` ⇒ chi tiết lịch MỚI (WDH-05)', () => {
  it('WDH-05 POST đúng một lần với thân CHỈ `khungGioId` (id lớn hơn 2^53 nguyên chuỗi, KHÔNG `lyDoYeuCau`); xong sang chi tiết lịch mới, GET lại chi tiết, thông báo một lần, không banner', async () => {
    const { api } = renderConfirm({
      before: (fake) => {
        fake.onSubmit = () => becomeNewAppointment(fake);
      },
    });
    await formLoaded();
    fireEvent.click(confirmButton());

    expect(await screen.findByText(NEW_APPOINTMENT_CODE)).toBeInTheDocument();
    expect(currentUrl()).toBe(NEW_DETAIL_PATH);
    expect(api.submitCalls).toStrictEqual([
      { maLichHen: DETAIL_CODE, body: { khungGioId: SLOT_ID } },
    ]);
    expect(screen.getByText(TEXT.doneNotice)).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('region', { name: TEXT.bannerTitle })).toBeNull();
    // chi tiết của lịch MỚI được GET (không dùng bản cũ), và sau lần POST
    expect(detailGets(api, NEW_APPOINTMENT_CODE).length).toBeGreaterThanOrEqual(
      1,
    );
    const writeIndex = api.detail.requests.findIndex(
      (request) => request.method === 'POST',
    );
    const newGetIndex = api.detail.requests.findIndex(
      (request) =>
        request.method === 'GET' &&
        request.path === `/patient/appointments/${NEW_APPOINTMENT_CODE}`,
    );
    expect(writeIndex).toBeGreaterThanOrEqual(0);
    expect(newGetIndex).toBeGreaterThan(writeIndex);
  });

  it('WDH-37 không ghi gì vào `localStorage` và `sessionStorage` (lý do, mã lịch, id khung giờ)', async () => {
    renderConfirm({
      preview: REQUEST,
      before: (fake) => {
        fake.onSubmit = () => becomeNewAppointment(fake);
      },
    });
    await formLoaded();
    typeReason('Lý do cần kín đáo');
    fireEvent.click(requestButton());
    await screen.findByText(NEW_APPOINTMENT_CODE);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('`DaGuiYeuCau` ⇒ chi tiết lịch CŨ kèm banner (WDH-05)', () => {
  it('WDH-05 thân có `lyDoYeuCau` ĐÃ chuẩn hoá; xong về chi tiết lịch CŨ, GET lại chi tiết, thông báo một lần cộng banner "Đang chờ duyệt", nút "Đổi lịch" vô hiệu', async () => {
    const { api } = renderConfirm({
      preview: REQUEST,
      before: (fake) => {
        fake.submitResult = makeRequestResult();
        fake.onSubmit = () => becomePendingRequest(fake);
      },
    });
    await formLoaded();
    typeReason('  Có việc đột xuất, xin đổi sang tuần sau  \n');
    fireEvent.click(requestButton());

    expect(
      await screen.findByRole('region', { name: TEXT.bannerTitle }),
    ).toHaveTextContent(TEXT.bannerPending);
    expect(currentUrl()).toBe(OLD_DETAIL_PATH);
    expect(api.submitCalls).toStrictEqual([
      {
        maLichHen: DETAIL_CODE,
        body: {
          khungGioId: SLOT_ID,
          lyDoYeuCau: 'Có việc đột xuất, xin đổi sang tuần sau',
        },
      },
    ]);
    expect(screen.getByText(TEXT.requestSentNotice)).toHaveAttribute(
      'role',
      'status',
    );
    // một GET chi tiết trước (thẻ "Lịch hẹn" của màn xác nhận) và một GET SAU lần POST (trang chi tiết gắn lại)
    expect(detailGets(api, DETAIL_CODE).length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole('button', { name: TEXT.changeButton }),
    ).toBeDisabled();
    expect(screen.getByText(TEXT.pendingReason)).toBeInTheDocument();
  });
});

describe('đang gửi, bấm đúp, rời trang (WDH-37, WDH-07)', () => {
  it('WDH-37 đang gửi ⇒ nút khoá và đổi chữ "Đang gửi…", liên kết quay lại vô hiệu (bấm không rời trang); trả lời xong mới sang chi tiết', async () => {
    const hold = holdResponse(doneResponse);
    const { api } = renderConfirm({
      before: (fake) => fake.failNext('submit', hold.override),
    });
    await formLoaded();
    fireEvent.click(confirmButton());

    const sending = await screen.findByRole('button', { name: TEXT.sending });
    expect(sending).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: TEXT.confirmButton }),
    ).toBeNull();
    const back = screen.getAllByRole('link', { name: TEXT.pickAnother })[0];
    expect(back).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(back);
    expect(currentUrl()).toBe(CONFIRM_PATH);
    expect(api.submitCalls).toHaveLength(1);

    // phản hồi bị giữ đi qua `failNext` nên không chạy `onSubmit`: đổi chi tiết sang lịch mới đúng lúc máy chủ "trả lời"
    becomeNewAppointment(api);
    hold.release();
    expect(await screen.findByText(NEW_APPOINTMENT_CODE)).toBeInTheDocument();
    expect(currentUrl()).toBe(NEW_DETAIL_PATH);
  });

  it('WDH-37 BẤM ĐÚP (hai cú bấm trong cùng một nhịp render) ⇒ máy chủ chỉ nhận MỘT POST', async () => {
    const hold = holdResponse(doneResponse);
    const { api } = renderConfirm({
      before: (fake) => fake.failNext('submit', hold.override),
    });
    await formLoaded();
    const button = confirmButton();
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => expect(api.submitCalls).toHaveLength(1));
    await flush();
    expect(api.submitCalls).toHaveLength(1);
    expect(api.detail.writes()).toHaveLength(1);

    becomeNewAppointment(api);
    hold.release();
    await screen.findByText(NEW_APPOINTMENT_CODE);
    expect(api.submitCalls).toHaveLength(1);
  });

  it('WDH-37 bấm đúp ở nhánh yêu cầu (có ô lý do) cũng chỉ một POST', async () => {
    const hold = holdResponse(
      () => new Response(JSON.stringify(makeRequestResult()), { status: 201 }),
    );
    const { api } = renderConfirm({
      preview: REQUEST,
      before: (fake) => fake.failNext('submit', hold.override),
    });
    await formLoaded();
    typeReason('Có việc đột xuất');
    const button = requestButton();
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => expect(api.submitCalls).toHaveLength(1));
    await flush();
    expect(api.submitCalls).toHaveLength(1);
    expect(reasonField()).toHaveAttribute('readonly');
    becomePendingRequest(api);
    hold.release();
    await screen.findByRole('region', { name: TEXT.bannerTitle });
  });

  it('WDH-37 người dùng RỜI trang giữa lúc chờ ⇒ khi máy chủ trả lời KHÔNG bị kéo sang chi tiết (không điều hướng sau khi đã rời)', async () => {
    const hold = holdResponse(doneResponse);
    const { api } = renderConfirm({
      extra: <Link to={PATIENT_APPOINTMENTS_PATH}>{LEAVE_LINK}</Link>,
      before: (fake) => fake.failNext('submit', hold.override),
    });
    await formLoaded();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(api.submitCalls).toHaveLength(1));

    fireEvent.click(screen.getByRole('link', { name: LEAVE_LINK }));
    expect(await screen.findByText(LIST_MARK)).toBeInTheDocument();

    becomeNewAppointment(api);
    hold.release();
    await flush();
    await flush();
    expect(screen.getByText(LIST_MARK)).toBeInTheDocument();
    expect(currentUrl()).not.toBe(NEW_DETAIL_PATH);
    expect(screen.queryByText(TEXT.doneNotice)).toBeNull();
  });

  it('WDH-07 sau khi gửi xong ở nhánh tự đổi, màn xác nhận KHÔNG gửi lại một lần nữa khi trang chi tiết mới gắn vào', async () => {
    const { api } = renderConfirm({
      before: (fake) => {
        fake.onSubmit = () => becomeNewAppointment(fake);
      },
    });
    await formLoaded();
    fireEvent.click(confirmButton());
    await screen.findByText(NEW_APPOINTMENT_CODE);
    await flush();
    expect(api.submitCalls).toHaveLength(1);
    expect(api.previewCalls).toHaveLength(1);
  });
});
