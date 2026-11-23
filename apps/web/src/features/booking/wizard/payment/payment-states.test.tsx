import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PATIENT_APPOINTMENTS_PATH,
  bookingDonePath,
} from '../../../../shared/routes/booking-paths';
import { BOOKING_ERROR_CODES } from '../../api/booking-errors';
import { flush, holdResponse } from '../../testing/appointment-detail-harness';
import { makeDetail } from '../../testing/fake-appointment-detail-api';
import {
  apiErrorResponse,
  jsonResponse,
} from '../../testing/fake-appointment-list-api';
import { paidBody, previewBody } from '../../testing/fake-deposit-gateway';
import {
  DONE_MARK,
  LIST_MARK,
  PAY_API_PATH,
  PAY_CODE,
  PAY_POST_API_PATH,
  PREVIEW_API_PATH,
  advance,
  cleanUpPaymentPage,
  fakeClock,
  holdDetail,
  renderPaymentPage,
} from '../../testing/payment-step-harness';
import { DONE_TEXT } from '../done/done-messages';
import { PAYMENT_TEXT } from './payment-messages';

// booking F6: mỗi trạng thái của trang theo kết quả tải, thanh toán thành công và các nhánh lỗi. WPF6-20…WPF6-34 là [đề xuất] (TRACKING booking 3.49.3); WZ-09, WZ-11, WZ-13.
// Trang thật, `DepositPaymentPanel` THẬT, `fetch` giả. Dữ liệu giả; không gọi backend thật.
afterEach(() => {
  cleanUpPaymentPage();
  vi.restoreAllMocks();
});
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const heading = (name: string) =>
  screen.findByRole('heading', { level: 1, name });
const PAY_BUTTON = /^Thanh toán .+ từ ví$/;
const payButton = () => screen.queryByRole('button', { name: PAY_BUTTON });

describe('WPF6 trạng thái theo kết quả tải', () => {
  it('WPF6-20 đang tải: "Đang tải lịch hẹn..." (role status), chưa có panel, chưa gọi xem trước cọc', async () => {
    fakeClock();
    const held = holdResponse(() => jsonResponse(holdDetail()));
    const { api } = renderPaymentPage({
      before: (fake) => {
        fake.failNext('detail', held.override);
      },
    });
    await flush();

    // `LocationProbe` của harness cũng là `<output>` (role status): chỉ tìm trong thân Bước 5
    expect(
      within(screen.getByTestId('booking-step-5-body')).getByRole('status'),
    ).toHaveTextContent(PAYMENT_TEXT.loading);
    expect(payButton()).toBeNull();
    expect(api.callsTo('GET', PREVIEW_API_PATH)).toHaveLength(0);
    // Trang thanh toán vẫn là bước 5 và có bọc để test của F3 và router tìm
    expect(screen.getByTestId('booking-step-5-body')).toBeInTheDocument();

    held.release();
    await flush();
    await heading(PAYMENT_TEXT.title);
  });

  it('WPF6-21 DaHuy lúc tải: thông báo đã hủy, hai liên kết đi tiếp, không panel, không gọi xem trước cọc (đúng 1 GET)', async () => {
    fakeClock();
    const { api } = renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail({
          leftMs: null,
          overrides: { trangThai: 'DaHuy', choPhepHuy: false },
        });
      },
    });

    await heading(PAYMENT_TEXT.cancelledTitle);
    expect(screen.getByText(PAYMENT_TEXT.cancelledNote)).toBeInTheDocument();
    expect(payButton()).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(
      screen.getByRole('link', { name: PAYMENT_TEXT.pickAnother }),
    ).toHaveAttribute('href', '/dat-lich');
    expect(
      screen.getByRole('link', { name: PAYMENT_TEXT.myAppointments }),
    ).toHaveAttribute('href', PATIENT_APPOINTMENTS_PATH);
    await flush();
    expect(api.requests).toHaveLength(1);
  });

  it('WPF6-21 DaHuy vẫn mang hạn còn trong tương lai: KHÔNG đồng hồ, KHÔNG câu "sắp hết giờ" cho trình đọc màn hình, KHÔNG tải lại khi tới hạn (hạn chỉ có nghĩa với ChoThanhToan)', async () => {
    fakeClock();
    const { api } = renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail({
          leftMs: 30_000,
          overrides: { trangThai: 'DaHuy', choPhepHuy: false },
        });
      },
    });

    await heading(PAYMENT_TEXT.cancelledTitle);
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.getByTestId('hold-announcement')).toBeEmptyDOMElement();
    // Không bộ hẹn giờ nào chạy cho một lịch đã hủy
    expect(vi.getTimerCount()).toBe(0);

    await advance(60_000);
    expect(screen.getByTestId('hold-announcement')).toBeEmptyDOMElement();
    expect(api.requests).toHaveLength(1);
  });

  it('WPF6-22 WZ-09 DaXacNhan lúc tải (mở lại đường dẫn cũ): chuyển Bước 6 bằng replace, không gọi xem trước cọc', async () => {
    fakeClock();
    const { api, router } = renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail({
          leftMs: null,
          overrides: { trangThai: 'DaXacNhan' },
        });
      },
    });

    expect(await screen.findByText(DONE_MARK)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(bookingDonePath(PAY_CODE));
    expect(router.state.historyAction).toBe('REPLACE');
    await flush();
    expect(api.requests).toHaveLength(1);
  });

  it('WPF6-23 ChoThanhToan đã quá hạn NGAY LÚC TẢI (giờ máy chủ ≥ hạn): thông báo hết hạn, không panel, không tải lại, không gọi xem trước cọc', async () => {
    fakeClock();
    const { api } = renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail({ leftMs: -1000, skewMs: 0 });
      },
    });

    await heading(PAYMENT_TEXT.expiredTitle);
    expect(screen.getByText(PAYMENT_TEXT.expiredNote)).toBeInTheDocument();
    expect(payButton()).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByText(PAYMENT_TEXT.checking)).toBeNull();
    // Đã hết hạn lúc tải thì KHÔNG đặt nhịp nào (không có gì để đếm): thêm sau đột biến M25 (nhịp thừa vẫn chạy mà chữ không đổi nên không thấy qua DOM)
    expect(vi.getTimerCount()).toBe(0);

    await advance(120_000);
    expect(api.requests).toHaveLength(1);
  });

  it('WPF6-23 đúng mốc là hết: giờ máy chủ = hạn ⇒ hết hạn (nửa mở)', async () => {
    fakeClock();
    renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail({ leftMs: 0 });
      },
    });
    await heading(PAYMENT_TEXT.expiredTitle);
    expect(payButton()).toBeNull();
  });

  it.each(['VangMat', 'HoanThanh', 'DaTiepDon', 'MaLaChuaBietXyz'])(
    'WPF6-24 trạng thái %s: chuyển Bước 6 (có câu đúng trạng thái), không panel, không lộ mã thô',
    async (status) => {
      fakeClock();
      const { api } = renderPaymentPage({
        before: (fake) => {
          fake.detail = holdDetail({
            leftMs: null,
            overrides: { trangThai: status },
          });
        },
      });

      expect(await screen.findByText(DONE_MARK)).toBeInTheDocument();
      expect(payButton()).toBeNull();
      await flush();
      expect(api.callsTo('GET', PREVIEW_API_PATH)).toHaveLength(0);
    },
  );

  it('WPF6-27 ChoThanhToan không có hạn (null): có panel, KHÔNG có đồng hồ, không "00:00"', async () => {
    fakeClock();
    renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail({ leftMs: null });
      },
    });

    await heading(PAYMENT_TEXT.title);
    expect(
      await screen.findByRole('button', { name: PAY_BUTTON }),
    ).toBeEnabled();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByText('00:00')).toBeNull();
    await advance(60_000);
    expect(payButton()).not.toBeNull();
  });

  it('WPF6-28 khung tóm tắt theo giờ VIỆT NAM ở biên ngày: 17:30 UTC ngày 24 là 00:30 ngày 25 (Thứ 4), không theo múi giờ máy', async () => {
    fakeClock();
    renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail({
          overrides: { thoiGian: '2026-11-24T17:30:00.000Z' },
        });
      },
    });

    await heading(PAYMENT_TEXT.title);
    const details = screen.getByRole('region', { name: 'Chi tiết lịch hẹn' });
    expect(within(details).getByText('Thứ 4, 25/11/2026')).toBeInTheDocument();
    expect(within(details).getByText('00:30')).toBeInTheDocument();
    expect(within(details).queryByText(/24\/11/)).toBeNull();
  });
});

describe('WPF6 lỗi tải', () => {
  it('WPF6-25 404 KHONG_TIM_THAY (không có, của người khác, mã sai dạng: cùng một thân): MỘT câu kèm "Lịch hẹn của tôi", không panel, không Thử lại', async () => {
    fakeClock();
    const { api } = renderPaymentPage({
      before: (fake) => {
        fake.detail = null;
      },
    });

    expect(await screen.findByText(DONE_TEXT.notFound)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: PAYMENT_TEXT.myAppointments }),
    ).toHaveAttribute('href', PATIENT_APPOINTMENTS_PATH);
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(payButton()).toBeNull();
    expect(api.requests).toHaveLength(1);
  });

  it.each([
    [401, BOOKING_ERROR_CODES.UNAUTHENTICATED, DONE_TEXT.sessionExpired],
    [403, BOOKING_ERROR_CODES.FORBIDDEN, DONE_TEXT.forbidden],
  ])(
    'WPF6-25 %i %s: câu riêng, KHÔNG có "Thử lại" (cùng yêu cầu sẽ cùng kết quả)',
    async (status, code, sentence) => {
      fakeClock();
      renderPaymentPage({
        before: (fake) => {
          fake.failNext('detail', () => apiErrorResponse(status, code));
        },
      });

      expect(await screen.findByText(sentence)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
      expect(payButton()).toBeNull();
    },
  );

  it.each([
    [
      'mất mạng',
      () =>
        Promise.reject(new TypeError('Failed to fetch')) as Promise<Response>,
    ],
    ['máy chủ 500', () => apiErrorResponse(500, 'LOI_HE_THONG')],
    ['phản hồi sai hình dạng (200 thiếu khoá)', () => jsonResponse({})],
  ])(
    'WPF6-26 %s: khối lỗi chung có "Thử lại"; bấm thì GET lại và dựng trang; thông điệp máy chủ KHÔNG xuất hiện',
    async (_name, failure) => {
      fakeClock();
      const { api } = renderPaymentPage({
        before: (fake) => {
          fake.detail = holdDetail();
          fake.failNext('detail', failure);
        },
      });

      const retry = await screen.findByRole('button', { name: 'Thử lại' });
      expect(screen.queryByText(/Lỗi giả của test/)).toBeNull();
      expect(screen.queryByText(/LOI_HE_THONG/)).toBeNull();
      expect(payButton()).toBeNull();

      fireEvent.click(retry);
      await heading(PAYMENT_TEXT.title);
      expect(
        await screen.findByRole('button', { name: PAY_BUTTON }),
      ).toBeEnabled();
      expect(api.callsTo('GET', PAY_API_PATH)).toHaveLength(2);
    },
  );
});

describe('WPF6 thanh toán và chuyển sang Bước 6', () => {
  async function openAndPay(options: { leftMs?: number } = {}) {
    fakeClock();
    const view = renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail({ leftMs: options.leftMs ?? 900_000 });
      },
    });
    await heading(PAYMENT_TEXT.title);
    const button = await screen.findByRole('button', { name: PAY_BUTTON });
    return { ...view, button };
  }

  it('WPF6-30 thanh toán thành công: đúng 1 POST thân {}, chuyển Bước 6 bằng replace (Back không quay lại trang thanh toán)', async () => {
    const { api, gateway, router, button } = await openAndPay();

    fireEvent.click(button);

    expect(await screen.findByText(DONE_MARK)).toBeInTheDocument();
    expect(api.callsTo('POST', PAY_POST_API_PATH)).toHaveLength(1);
    expect(gateway.postBodies).toEqual(['{}']);
    expect(api.writes()).toHaveLength(1);
    expect(router.state.location.pathname).toBe(bookingDonePath(PAY_CODE));
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('WPF6-30 daXuLyTruocDo = true (bấm đúp, hai tab) vẫn chuyển Bước 6', async () => {
    const { gateway, button } = await openAndPay();
    gateway.paid = paidBody({ daXuLyTruocDo: true });

    fireEvent.click(button);

    expect(await screen.findByText(DONE_MARK)).toBeInTheDocument();
  });

  it('WPF6-31 WZ-13 rời trang giữa lúc POST còn bay: phản hồi về sau KHÔNG kéo người dùng quay lại Bước 6', async () => {
    const { api, gateway, router, button } = await openAndPay();
    const held = holdResponse(() => jsonResponse(paidBody()));
    gateway.failNext('pay', held.override);

    fireEvent.click(button);
    await flush();
    expect(api.callsTo('POST', PAY_POST_API_PATH)).toHaveLength(1);

    await act(async () => {
      await router.navigate(PATIENT_APPOINTMENTS_PATH);
    });
    expect(await screen.findByText(LIST_MARK)).toBeInTheDocument();

    held.release();
    await flush();
    expect(router.state.location.pathname).toBe(PATIENT_APPOINTMENTS_PATH);
    expect(screen.queryByText(DONE_MARK)).toBeNull();
  });

  it('WPF6-32 POST còn bay lúc đồng hồ về 0 (panel đã gỡ) rồi trả 200: vẫn chuyển Bước 6 (Q4: lịch chưa bị quét vẫn xác nhận được)', async () => {
    const { api, gateway, router, button } = await openAndPay({
      leftMs: 5000,
    });
    const held = holdResponse(() => jsonResponse(paidBody()));
    gateway.failNext('pay', held.override);
    // Tải lại lúc 0: máy chủ vẫn thấy ChoThanhToan và hạn đã qua
    api.detail = makeDetail({
      maLichHen: PAY_CODE,
      trangThai: 'ChoThanhToan',
      hanThanhToan: new Date(Date.now() + 5000).toISOString(),
      thoiGianMayChu: new Date(Date.now() + 6000).toISOString(),
    });

    await advance(3000);
    fireEvent.click(button);
    await flush();
    await advance(2000);
    await flush();

    // Panel đã gỡ lúc 0; thông báo hết hạn; POST vẫn còn bay
    await heading(PAYMENT_TEXT.expiredTitle);
    expect(payButton()).toBeNull();

    held.release();
    await flush();
    expect(await screen.findByText(DONE_MARK)).toBeInTheDocument();
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('WPF6-32 POST còn bay lúc 0 rồi trả 409 HET_HAN_GIU_CHO: không chuyển bước; kết quả theo máy chủ (đã hủy), không còn nút trả tiền', async () => {
    const { api, gateway, button } = await openAndPay({ leftMs: 5000 });
    const held = holdResponse(() => apiErrorResponse(409, 'HET_HAN_GIU_CHO'));
    gateway.failNext('pay', held.override);
    api.detail = makeDetail({
      maLichHen: PAY_CODE,
      trangThai: 'DaHuy',
      hanThanhToan: null,
      thoiGianMayChu: new Date(Date.now() + 6000).toISOString(),
    });

    await advance(3000);
    fireEvent.click(button);
    await flush();
    await advance(2000);
    await flush();
    await heading(PAYMENT_TEXT.cancelledTitle);

    held.release();
    await flush();
    expect(screen.queryByText(DONE_MARK)).toBeNull();
    await heading(PAYMENT_TEXT.cancelledTitle);
    expect(payButton()).toBeNull();
  });

  it('WPF6-33 số dư không đủ: panel thật gợi ý nạp tiền kèm liên kết tới ví và nút vô hiệu (trang không chép lại WTT-02)', async () => {
    fakeClock();
    renderPaymentPage({
      before: (fake, gateway) => {
        fake.detail = holdDetail();
        gateway.preview = previewBody({
          duSoDu: false,
          soDuSauThanhToan: null,
          soDuKhaDung: '20000.00',
        });
      },
    });

    await heading(PAYMENT_TEXT.title);
    expect(
      await screen.findByRole('button', { name: PAY_BUTTON }),
    ).toBeDisabled();
    expect(
      screen.getByRole('link', { name: 'Nạp tiền vào ví' }),
    ).toBeInTheDocument();
  });
});

describe('WPF6 an toàn: không kho trình duyệt, không lộ lỗi', () => {
  it('WPF6-34 WZ-09 sau mở, hết giờ, lỗi và thanh toán: localStorage và sessionStorage vẫn rỗng', async () => {
    fakeClock();
    const { api } = renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail({ leftMs: 4000 });
      },
    });
    await heading(PAYMENT_TEXT.title);
    api.failNext('detail', () => apiErrorResponse(500, 'LOI_HE_THONG'));
    await advance(4000);
    await flush();
    await screen.findByRole('button', { name: 'Thử lại' });

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('WPF6-34 lỗi 500 có mã nội bộ và thông điệp: không xuất hiện ở bất kỳ đâu trên trang', async () => {
    fakeClock();
    const { container } = renderPaymentPage({
      before: (fake) => {
        fake.failNext('detail', () =>
          jsonResponse(
            {
              maLoi: 'MA_NOI_BO_KHONG_DUOC_LO',
              thongBao: 'Chi tiết nội bộ: bảng lich_hen bị khoá',
              requestId: 'REQ-NOI-BO-1',
            },
            500,
          ),
        );
      },
    });

    await screen.findByRole('button', { name: 'Thử lại' });
    expect(container.textContent).not.toMatch(/MA_NOI_BO|lich_hen|REQ-NOI-BO/);
  });
});
