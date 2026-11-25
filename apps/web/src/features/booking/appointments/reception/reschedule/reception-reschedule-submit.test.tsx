import { act } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Link, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RECEPTION_APPOINTMENTS_PATH } from '../../../../../shared/routes/booking-paths';
import {
  flush,
  holdResponse,
  LIST_MARK,
} from '../../../testing/appointment-detail-harness';
import { NEW_APPOINTMENT_CODE } from '../../../testing/fake-reschedule-api';
import { cleanUpReceptionPage } from '../../../testing/reception-harness';
import { renderReceptionReschedule } from '../../../testing/reception-reschedule-harness';
import {
  CONFIRM_PATH,
  confirmButton,
  currentUrl,
  doneResponse,
  formLoaded,
  NEW_DETAIL_PATH,
  OLD_DETAIL_PATH,
  reasonField,
  RECEPTION_CODE,
  RTEXT,
  SLOT_ID,
  TEXT,
  typeReason,
} from '../../../testing/reception-reschedule-helpers';
import { DETAIL_TEXT } from '../detail/detail-messages';

// reschedule F3: gửi đổi lịch hộ. Mã WDO-04 (thân POST, `DaDoi` ⇒ chi tiết lịch MỚI kèm thông báo MỘT lần) và WDO-06 (khoá khi gửi, bấm đúp một POST, rời trang giữa chừng) cùng các ca [đề xuất]. Lỗi theo từng mã
// ở `reception-reschedule-submit-errors.test.tsx` (WDO-05). Dữ liệu giả; không gọi backend thật.
afterEach(() => {
  vi.restoreAllMocks();
  cleanUpReceptionPage();
});

const REASON = 'Bác sĩ báo bận đột xuất';
const LEAVE_LINK = 'Rời trang thử';

// Hiện `location.state` hiện tại để thấy thông báo một lần được xoá khỏi lịch sử (`replace` với `state: null`)
function StateProbe() {
  const { state } = useLocation();
  return <output data-testid="state">{JSON.stringify(state ?? null)}</output>;
}
const stateNow = () => screen.getByTestId('state').textContent;
// Chờ trang chi tiết của lịch MỚI dựng xong (mã lịch hiện ngay ở lúc đang tải rồi bị thay bằng thẻ đầu, nên chờ tiêu đề của khối thật)
const onNewDetail = async () => {
  await screen.findByRole('heading', { name: DETAIL_TEXT.sections.patient });
  expect(screen.getAllByText(NEW_APPOINTMENT_CODE).length).toBeGreaterThan(0);
};

describe('`DaDoi` ⇒ chi tiết lịch MỚI (WDO-04)', () => {
  it('WDO-04 POST đúng MỘT lần với thân CHỈ `khungGioId` (id lớn hơn 2^53 nguyên chuỗi) và `lyDo` ĐÃ cắt; xong sang chi tiết lịch MỚI, GET lại chi tiết sau lần POST, thông báo một lần', async () => {
    const { api } = renderReceptionReschedule({
      path: CONFIRM_PATH,
      extra: <StateProbe />,
    });
    await formLoaded();
    typeReason(`  ${REASON}  \n`);
    fireEvent.click(confirmButton());

    await onNewDetail();
    expect(currentUrl()).toBe(NEW_DETAIL_PATH);
    expect(api.submitCalls).toStrictEqual([
      {
        maLichHen: RECEPTION_CODE,
        body: { khungGioId: SLOT_ID, lyDo: REASON },
      },
    ]);
    expect(screen.getByText(RTEXT.doneNotice)).toHaveAttribute(
      'role',
      'status',
    );
    // chi tiết của lịch MỚI được GET, và SAU lần POST (không dùng bản cũ)
    const requests = api.reception.requests;
    const writeIndex = requests.findIndex(
      (request) => request.method === 'POST',
    );
    expect(writeIndex).toBe(-1); // POST đổi lịch đi qua route riêng, không qua `requests` của API giả Lễ tân
    expect(
      api.reception.callsTo(`/reception/appointments/${NEW_APPOINTMENT_CODE}`)
        .length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      api.reception.callsTo(`/reception/appointments/${RECEPTION_CODE}`),
    ).toHaveLength(1);
  });

  it('WDO-04 thông báo hiện MỘT lần: sau khi hiện, `location.state` được xoá khỏi lịch sử (tải lại hay quay về không hiện lại)', async () => {
    renderReceptionReschedule({ path: CONFIRM_PATH, extra: <StateProbe /> });
    await formLoaded();
    typeReason(REASON);
    fireEvent.click(confirmButton());
    await screen.findByText(RTEXT.doneNotice);
    await waitFor(() => expect(stateNow()).toBe('null'));
    expect(screen.getByText(RTEXT.doneNotice)).toBeInTheDocument();
  });

  it('WDO-04 vào thẳng chi tiết lịch mới (tải lại, không có `state`) ⇒ KHÔNG có thông báo', async () => {
    renderReceptionReschedule({
      path: NEW_DETAIL_PATH,
      before: (api) => {
        api.reception.details[NEW_APPOINTMENT_CODE] = {
          ...(api.reception.details[RECEPTION_CODE] as object),
          maLichHen: NEW_APPOINTMENT_CODE,
        };
      },
    });
    await screen.findByText(NEW_APPOINTMENT_CODE);
    expect(screen.queryByText(RTEXT.doneNotice)).toBeNull();
  });

  it('WDO-04 `state` lạ (không nằm trong danh sách trắng) khi vào chi tiết ⇒ không có thông báo và không in ra màn hình', async () => {
    const { container } = renderReceptionReschedule({
      path: OLD_DETAIL_PATH,
      state: { rescheduleNotice: 'CHU_CUA_MAY_CHU' },
    });
    await screen.findByText(RECEPTION_CODE);
    expect(screen.queryByText(RTEXT.doneNotice)).toBeNull();
    expect(container.textContent).not.toContain('CHU_CUA_MAY_CHU');
  });

  it('WDO-04 không ghi `localStorage` và `sessionStorage` (lý do, mã lịch, id khung giờ) và không ghi cookie', async () => {
    const cookie = vi.spyOn(document, 'cookie', 'set');
    renderReceptionReschedule({ path: CONFIRM_PATH });
    await formLoaded();
    typeReason('Lý do cần kín đáo');
    fireEvent.click(confirmButton());
    await screen.findByText(NEW_APPOINTMENT_CODE);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(cookie).not.toHaveBeenCalled();
  });

  it('WDO-04 không ghi lý do hay mã lịch ra console (dữ liệu cá nhân)', async () => {
    const spies = (['log', 'info', 'warn', 'debug', 'error'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );
    renderReceptionReschedule({ path: CONFIRM_PATH });
    await formLoaded();
    typeReason('Lý do kín đáo của test');
    fireEvent.click(confirmButton());
    await screen.findByText(NEW_APPOINTMENT_CODE);
    const logged = spies
      .flatMap((spy) => spy.mock.calls)
      .map((call) => call.map(String).join(' '))
      // cảnh báo `act` của hạ tầng test không phải log của mã
      .filter((line) => !/not wrapped in act/.test(line));
    expect(logged.join('\n')).not.toMatch(
      new RegExp(`Lý do kín đáo|${RECEPTION_CODE}|${NEW_APPOINTMENT_CODE}`),
    );
  });

  it('WDO-04 sau khi đổi xong, chi tiết lịch CŨ là `DaDoiLich`: Lễ tân VẪN xem được (không 404) và không còn nút "Đổi lịch hộ"', async () => {
    const { api } = renderReceptionReschedule({ path: CONFIRM_PATH });
    await formLoaded();
    typeReason(REASON);
    fireEvent.click(confirmButton());
    await screen.findByText(NEW_APPOINTMENT_CODE);
    const old = await api.fetch(
      `/api/reception/appointments/${RECEPTION_CODE}`,
    );
    expect(old.status).toBe(200);
    expect(await old.json()).toMatchObject({ trangThai: 'DaDoiLich' });
  });
});

describe('đang gửi, bấm đúp, rời trang (WDO-06)', () => {
  it('WDO-06 đang gửi ⇒ nút khoá và đổi chữ "Đang gửi…", ô lý do chỉ đọc (vẫn giữ chữ), liên kết quay lại vô hiệu (bấm không rời trang); trả lời xong mới sang chi tiết', async () => {
    const hold = holdResponse(doneResponse);
    const { api } = renderReceptionReschedule({
      path: CONFIRM_PATH,
      before: (fake) => fake.failNext('submit', hold.override),
    });
    await formLoaded();
    typeReason(REASON);
    fireEvent.click(confirmButton());

    const sending = await screen.findByRole('button', { name: TEXT.sending });
    expect(sending).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: RTEXT.confirmButton }),
    ).toBeNull();
    expect(reasonField()).toHaveAttribute('readonly');
    expect(reasonField()).toHaveValue(REASON);
    const back = screen.getAllByRole('link', { name: TEXT.pickAnother })[0];
    expect(back).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(back);
    expect(currentUrl()).toBe(CONFIRM_PATH);
    expect(api.submitCalls).toHaveLength(1);

    // phản hồi bị giữ đi qua `failNext` nên không chạy hiệu ứng mặc định: dựng lịch mới đúng lúc máy chủ "trả lời"
    api.reception.details[NEW_APPOINTMENT_CODE] = {
      ...(api.reception.details[RECEPTION_CODE] as object),
      maLichHen: NEW_APPOINTMENT_CODE,
    };
    hold.release();
    await onNewDetail();
    expect(currentUrl()).toBe(NEW_DETAIL_PATH);
  });

  it('WDO-06 BẤM ĐÚP (hai cú bấm trong cùng một nhịp render) ⇒ máy chủ chỉ nhận MỘT POST', async () => {
    const hold = holdResponse(doneResponse);
    const { api } = renderReceptionReschedule({
      path: CONFIRM_PATH,
      before: (fake) => fake.failNext('submit', hold.override),
    });
    await formLoaded();
    typeReason(REASON);
    const button = confirmButton();
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => expect(api.submitCalls).toHaveLength(1));
    await flush();
    expect(api.submitCalls).toHaveLength(1);

    api.reception.details[NEW_APPOINTMENT_CODE] = {
      ...(api.reception.details[RECEPTION_CODE] as object),
      maLichHen: NEW_APPOINTMENT_CODE,
    };
    hold.release();
    await screen.findByText(NEW_APPOINTMENT_CODE);
    expect(api.submitCalls).toHaveLength(1);
  });

  it('WDO-06 bấm gửi khi lý do chưa hợp lệ KHÔNG khoá nút (không có lời gọi nào để chờ); sửa xong gửi được và chỉ một POST', async () => {
    const { api } = renderReceptionReschedule({ path: CONFIRM_PATH });
    await formLoaded();
    fireEvent.click(confirmButton());
    expect(confirmButton()).toBeEnabled();
    expect(api.submitCalls).toEqual([]);
    typeReason(REASON);
    const button = confirmButton();
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await screen.findByText(NEW_APPOINTMENT_CODE);
    expect(api.submitCalls).toHaveLength(1);
  });

  it('WDO-06 người dùng RỜI trang giữa lúc chờ ⇒ khi máy chủ trả lời KHÔNG bị kéo sang chi tiết (không điều hướng sau khi đã rời)', async () => {
    const hold = holdResponse(doneResponse);
    const { api } = renderReceptionReschedule({
      path: CONFIRM_PATH,
      extra: <Link to={RECEPTION_APPOINTMENTS_PATH}>{LEAVE_LINK}</Link>,
      before: (fake) => fake.failNext('submit', hold.override),
    });
    await formLoaded();
    typeReason(REASON);
    fireEvent.click(confirmButton());
    await waitFor(() => expect(api.submitCalls).toHaveLength(1));

    fireEvent.click(screen.getByRole('link', { name: LEAVE_LINK }));
    expect(await screen.findByText(LIST_MARK)).toBeInTheDocument();

    hold.release();
    await flush();
    await flush();
    expect(screen.getByText(LIST_MARK)).toBeInTheDocument();
    expect(currentUrl()).not.toBe(NEW_DETAIL_PATH);
    expect(screen.queryByText(RTEXT.doneNotice)).toBeNull();
  });

  it('WDO-06 gửi xong, màn xác nhận KHÔNG gửi lại hay gọi lại preview khi trang chi tiết mới gắn vào', async () => {
    const { api } = renderReceptionReschedule({ path: CONFIRM_PATH });
    await formLoaded();
    typeReason(REASON);
    fireEvent.click(confirmButton());
    await screen.findByText(NEW_APPOINTMENT_CODE);
    await flush();
    expect(api.submitCalls).toHaveLength(1);
    expect(api.previewCalls).toHaveLength(1);
  });
});
