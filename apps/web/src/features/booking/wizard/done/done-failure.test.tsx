import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from '../../../../shared/api/error-message';
import {
  PATIENT_APPOINTMENTS_PATH,
  bookingDonePath,
} from '../../../../shared/routes/booking-paths';
import { flush, holdResponse } from '../../testing/appointment-detail-harness';
import {
  DONE_API_PATH,
  DONE_CODE,
  cleanUpDonePage,
  renderDonePage,
} from '../../testing/done-step-harness';
import {
  makeDetail,
  notFoundResponse,
} from '../../testing/fake-appointment-detail-api';
import { jsonResponse } from '../../testing/fake-appointment-list-api';
import { DONE_TEXT } from './done-messages';

// booking F7: tải và lỗi của Bước 6, chọn câu theo `maLoi` (không theo mã HTTP; PLAN 5.13, 5.14). HTE-01…HTE-05 là [đề xuất] (PLAN booking mục 7.42); WZ-11. Dữ liệu giả.
afterEach(cleanUpDonePage);

const apiError = (status: number, maLoi: string) =>
  jsonResponse({ maLoi, thongBao: 'Lỗi giả của test' }, status);
const retryButton = () => screen.queryByRole('button', { name: 'Thử lại' });
const success = () => screen.queryByText(DONE_TEXT.successTitle);

describe('HTE tải và lỗi', () => {
  it('HTE-01 WZ-11 đang tải: "Đang tải lịch hẹn...", chưa có phiếu, thân vẫn có `data-reference`; xong thì hiện phiếu', async () => {
    const held = holdResponse(() => jsonResponse(makeDetail()));
    const { api } = renderDonePage({
      before: (fake) => fake.failNext('detail', held.override),
    });

    expect(screen.getByText(DONE_TEXT.loading)).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.getByTestId('booking-step-6-body')).toHaveAttribute(
      'data-reference',
      DONE_CODE,
    );
    expect(success()).toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();

    await flush();
    expect(api.callsTo('GET', DONE_API_PATH)).toHaveLength(1);
    held.release();
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: DONE_TEXT.successTitle,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(DONE_TEXT.loading)).toBeNull();
  });

  it('HTE-02 WZ-11 H10 404 `KHONG_TIM_THAY`: MỘT câu và liên kết "Lịch hẹn của tôi", không `Thử lại`, không phiếu; hai thân 404 khác nhau ra CÙNG một DOM; mã sai dạng cũng vậy', async () => {
    renderDonePage({
      before: (api) => {
        api.detail = null;
      },
    });

    const message = await screen.findByText(DONE_TEXT.notFound);
    expect(message).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: DONE_TEXT.backToList }),
    ).toHaveAttribute('href', PATIENT_APPOINTMENTS_PATH);
    expect(retryButton()).toBeNull();
    expect(success()).toBeNull();
    const first = document.body.innerHTML;
    cleanup();

    // Cùng `maLoi`, khác `thongBao` và `requestId` (lịch của người khác so với không tồn tại): không lộ lịch có tồn tại hay không
    renderDonePage({
      before: (api) =>
        api.failNext('detail', () =>
          notFoundResponse({ thongBao: 'Khác', requestId: 'r-2' }),
        ),
    });
    await screen.findByText(DONE_TEXT.notFound);
    expect(document.body.innerHTML).toBe(first);
    cleanup();

    renderDonePage({
      path: bookingDonePath('khong-dung-dang'),
      before: (api) => {
        api.detail = null;
      },
    });
    expect(await screen.findByText(DONE_TEXT.notFound)).toBeInTheDocument();
    expect(retryButton()).toBeNull();
  });

  it('HTE-03 WZ-11 `CHUA_DANG_NHAP` và `KHONG_DU_QUYEN`: câu riêng theo `maLoi`, không `Thử lại`; câu 403 nói về lịch hẹn, không nói về danh sách', async () => {
    renderDonePage({
      before: (api) =>
        api.failNext('detail', () => apiError(401, 'CHUA_DANG_NHAP')),
    });
    expect(
      await screen.findByText(DONE_TEXT.sessionExpired),
    ).toBeInTheDocument();
    expect(retryButton()).toBeNull();
    expect(success()).toBeNull();
    cleanup();

    renderDonePage({
      before: (api) =>
        api.failNext('detail', () => apiError(403, 'KHONG_DU_QUYEN')),
    });
    const forbidden = await screen.findByText(DONE_TEXT.forbidden);
    expect(forbidden).toHaveTextContent('lịch hẹn');
    expect(forbidden).not.toHaveTextContent('danh sách');
    expect(retryButton()).toBeNull();
  });

  it('HTE-04 WZ-11 mất mạng: câu mạng kèm `Thử lại`; đúng MỘT GET (không tự gửi lại); `Thử lại` ⇒ một GET nữa ⇒ phiếu, hết cảnh báo', async () => {
    const { api } = renderDonePage({
      before: (fake) =>
        fake.failNext('detail', () =>
          Promise.reject(new TypeError('Failed to fetch')),
        ),
    });

    expect(await screen.findByText(NETWORK_ERROR_MESSAGE)).toBeInTheDocument();
    await flush();
    expect(api.callsTo('GET', DONE_API_PATH)).toHaveLength(1);
    expect(success()).toBeNull();

    fireEvent.click(retryButton() as HTMLElement);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: DONE_TEXT.successTitle,
      }),
    ).toBeInTheDocument();
    expect(api.callsTo('GET', DONE_API_PATH)).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('HTE-05 WZ-11 200 nhưng thân sai hình dạng (thiếu khoá, tiền sai dạng): câu chung kèm `Thử lại`, không vẽ phiếu dở', async () => {
    renderDonePage({
      before: (api) => {
        const incomplete: Record<string, unknown> = { ...makeDetail() };
        delete incomplete.thanhToan;
        api.detail = incomplete;
      },
    });

    expect(await screen.findByText(GENERIC_ERROR_MESSAGE)).toBeInTheDocument();
    expect(retryButton()).toBeInTheDocument();
    expect(success()).toBeNull();
    expect(screen.queryByRole('region', { name: 'Chi phí' })).toBeNull();
    cleanup();

    renderDonePage({
      before: (api) => {
        api.detail = makeDetail({ giaSnapshot: '300000,00' });
      },
    });
    expect(await screen.findByText(GENERIC_ERROR_MESSAGE)).toBeInTheDocument();
    expect(success()).toBeNull();
  });
});
