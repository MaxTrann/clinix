import { act, fireEvent, screen, within } from '@testing-library/react';
import { Link } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PATIENT_APPOINTMENTS_PATH,
  bookingPaymentPath,
} from '../../../../shared/routes/booking-paths';
import { flush, holdResponse } from '../../testing/appointment-detail-harness';
import { makeDetail } from '../../testing/fake-appointment-detail-api';
import { jsonResponse } from '../../testing/fake-appointment-list-api';
import {
  DONE_MARK,
  NOW_MS,
  PAY_API_PATH,
  PAY_CODE,
  PREVIEW_API_PATH,
  advance,
  cleanUpPaymentPage,
  fakeClock,
  holdDetail,
  renderPaymentPage,
} from '../../testing/payment-step-harness';
import { PAYMENT_TEXT } from './payment-messages';

// booking F6: đồng hồ giữ chỗ theo giờ MÁY CHỦ và những gì xảy ra khi về 0. WPF6-10…WPF6-18 là [đề xuất] (TRACKING booking 3.49.3); WZ-10, WZ-11. Đi qua trang thật (`BookingPaymentPage`) với
// `DepositPaymentPanel` THẬT, `fetch` giả và đồng hồ giả (`Date`, `setInterval`; `setTimeout` thật để promise chạy). Dữ liệu giả; không gọi backend thật.
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
const timer = () =>
  screen.getByRole('timer', { name: PAYMENT_TEXT.timerLabel });
const PAY_BUTTON = /^Thanh toán .+ từ ví$/;
const payButton = () => screen.queryByRole('button', { name: PAY_BUTTON });
const at = (ms: number) => new Date(NOW_MS + ms).toISOString();

describe('WPF6 mở trang và đếm xuống', () => {
  it('WPF6-10 WZ-11 mở trang ChoThanhToan còn hạn: đúng 2 GET (chi tiết, xem trước cọc), 0 lời gọi ghi; đồng hồ, khung tóm tắt, panel', async () => {
    fakeClock();
    const { api } = renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail();
      },
    });

    await heading(PAYMENT_TEXT.title);
    expect(
      await screen.findByRole('button', { name: PAY_BUTTON }),
    ).toBeEnabled();
    expect(timer()).toHaveTextContent('15:00');

    // Bọc của thân tạm F3 được giữ: test của F3 và của router tìm Bước 5 bằng nó
    expect(screen.getByTestId('booking-step-5-body')).toHaveAttribute(
      'data-reference',
      PAY_CODE,
    );

    // Khung tóm tắt: mã lấy từ API, năm hàng chi tiết, giá và cọc
    expect(screen.getByText(PAY_CODE, { selector: 'dd' })).toBeInTheDocument();
    const details = screen.getByRole('region', { name: 'Chi tiết lịch hẹn' });
    expect(within(details).getByText('Khám tim mạch')).toBeInTheDocument();
    expect(within(details).getByText('Nguyễn Minh Anh')).toBeInTheDocument();
    expect(within(details).getByText('CLINIX Quận 1')).toBeInTheDocument();
    expect(within(details).getByText('Thứ 3, 20/10/2026')).toBeInTheDocument();
    const cost = screen.getByRole('region', { name: PAYMENT_TEXT.costTitle });
    expect(within(cost).getByText('300.000đ')).toBeInTheDocument();
    expect(within(cost).getByText('100.000đ')).toBeInTheDocument();

    expect(api.callsTo('GET', PAY_API_PATH)).toHaveLength(1);
    expect(api.callsTo('GET', PREVIEW_API_PATH)).toHaveLength(1);
    expect(api.requests).toHaveLength(2);
    expect(api.writes()).toHaveLength(0);
  });

  it.each([
    ['máy chậm 90 giây', 90_000],
    ['máy nhanh 90 giây', -90_000],
  ])(
    'WPF6-11 WZ-10 giờ MÁY CHỦ lệch giờ máy (%s): đồng hồ vẫn ra 15:00 rồi 13:59 sau 61 giây (không theo giờ máy)',
    async (_name, skew) => {
      fakeClock();
      renderPaymentPage({
        before: (fake) => {
          fake.detail = holdDetail({ skewMs: skew });
        },
      });

      await heading(PAYMENT_TEXT.title);
      // Tính theo giờ máy sẽ ra 16:30 (máy chậm) hay 13:30 (máy nhanh)
      expect(timer()).toHaveTextContent('15:00');

      await advance(61_000);
      expect(timer()).toHaveTextContent('13:59');
    },
  );

  it('WPF6-12 đếm xuống mỗi giây; tab nền quay lại: tính từ ĐỒNG HỒ (nhảy 5 phút mà không chạy nhịp nào vẫn ra 09:59), không trừ dần', async () => {
    fakeClock();
    renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail();
      },
    });
    await heading(PAYMENT_TEXT.title);

    await advance(1000);
    expect(timer()).toHaveTextContent('14:59');
    await advance(1000);
    expect(timer()).toHaveTextContent('14:58');

    // Tab nền: trình duyệt giãn hẹn giờ nên KHÔNG nhịp nào chạy trong 5 phút; đồng hồ nhảy rồi tab hiện lại
    vi.setSystemTime(Date.now() + 300_000);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(timer()).toHaveTextContent('09:58');
  });
});

describe('WPF6 về 0: tải lại MỘT lần và để máy chủ quyết (WZ-10)', () => {
  async function openWithFiveSecondsLeft() {
    fakeClock();
    const view = renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail({ leftMs: 5000 });
      },
    });
    await heading(PAYMENT_TEXT.title);
    await screen.findByRole('button', { name: PAY_BUTTON });
    return view;
  }

  it('WPF6-13 WZ-10 về 0 ⇒ gỡ panel và nút trả tiền NGAY, đúng 1 GET chi tiết thêm; máy chủ trả DaHuy ⇒ thông báo đã hủy', async () => {
    const { api } = await openWithFiveSecondsLeft();
    // Giữ phản hồi tải lại để thấy trạng thái "đang kiểm tra"
    const held = holdResponse(() =>
      jsonResponse(
        makeDetail({
          maLichHen: PAY_CODE,
          trangThai: 'DaHuy',
          hanThanhToan: null,
          choPhepHuy: false,
          thoiGianMayChu: at(5200),
        }),
      ),
    );
    api.failNext('detail', held.override);

    await advance(5000);

    // Ngay lúc 0: nút trả tiền biến mất, chữ hết giờ, đang kiểm tra lại
    expect(payButton()).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
    await heading(PAYMENT_TEXT.expiredTitle);
    expect(screen.getByText(PAYMENT_TEXT.checking)).toBeInTheDocument();
    expect(api.callsTo('GET', PAY_API_PATH)).toHaveLength(2);

    held.release();
    await flush();

    await heading(PAYMENT_TEXT.cancelledTitle);
    expect(screen.getByText(PAYMENT_TEXT.cancelledNote)).toBeInTheDocument();
    expect(screen.queryByText(PAYMENT_TEXT.checking)).toBeNull();
    expect(payButton()).toBeNull();
    expect(
      screen.getByRole('link', { name: PAYMENT_TEXT.pickAnother }),
    ).toHaveAttribute('href', '/dat-lich');
    expect(
      screen.getByRole('link', { name: PAYMENT_TEXT.myAppointments }),
    ).toHaveAttribute('href', PATIENT_APPOINTMENTS_PATH);
    // Panel đã gỡ: không gọi xem trước cọc lần hai
    expect(api.callsTo('GET', PREVIEW_API_PATH)).toHaveLength(1);
    expect(api.writes()).toHaveLength(0);
  });

  it('WPF6-14 WZ-10 về 0 mà máy chủ VẪN ChoThanhToan (job quét chưa chạy, hạn đã qua): thông báo hết hạn, không nút trả tiền, KHÔNG tải lại lần ba', async () => {
    const { api } = await openWithFiveSecondsLeft();
    // Giờ máy chủ đã qua hạn 1 giây nhưng lịch chưa bị quét
    api.detail = makeDetail({
      maLichHen: PAY_CODE,
      trangThai: 'ChoThanhToan',
      hanThanhToan: at(5000),
      thoiGianMayChu: at(6000),
    });

    await advance(5000);
    await flush();

    await heading(PAYMENT_TEXT.expiredTitle);
    expect(screen.getByText(PAYMENT_TEXT.expiredNote)).toBeInTheDocument();
    expect(screen.queryByText(PAYMENT_TEXT.checking)).toBeNull();
    expect(payButton()).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(api.callsTo('GET', PAY_API_PATH)).toHaveLength(2);

    // Không vòng lặp: một phút sau vẫn chỉ hai lần tải
    await advance(60_000);
    expect(api.callsTo('GET', PAY_API_PATH)).toHaveLength(2);
    expect(api.callsTo('GET', PREVIEW_API_PATH)).toHaveLength(1);
  });

  it('WPF6-15 WZ-10 về 0, máy chủ trả DaXacNhan (đã trả ở tab khác): chuyển Bước 6 bằng replace', async () => {
    const { api, router } = await openWithFiveSecondsLeft();
    api.detail = makeDetail({
      maLichHen: PAY_CODE,
      trangThai: 'DaXacNhan',
      hanThanhToan: null,
      thoiGianMayChu: at(5200),
    });

    await advance(5000);
    await flush();

    expect(await screen.findByText(DONE_MARK)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      `/dat-lich/hoan-tat/${PAY_CODE}`,
    );
    expect(router.state.historyAction).toBe('REPLACE');
    expect(payButton()).toBeNull();
  });

  it('WPF6-16 về 0, tải lại lỗi mạng: khối lỗi chung có "Thử lại"; bấm thì GET lại và dựng đúng theo kết quả mới', async () => {
    const { api } = await openWithFiveSecondsLeft();
    api.failNext('detail', () =>
      Promise.reject(new TypeError('Failed to fetch')),
    );

    await advance(5000);
    await flush();

    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    expect(payButton()).toBeNull();
    expect(api.callsTo('GET', PAY_API_PATH)).toHaveLength(2);

    api.detail = makeDetail({
      maLichHen: PAY_CODE,
      trangThai: 'DaHuy',
      hanThanhToan: null,
      thoiGianMayChu: at(5400),
    });
    fireEvent.click(retry);
    await flush();

    await heading(PAYMENT_TEXT.cancelledTitle);
    expect(api.callsTo('GET', PAY_API_PATH)).toHaveLength(3);
  });

  it('WPF6-18 sau tải lại máy chủ thấy hạn còn 0,1 giây (sai số mạng): đồng hồ mới đếm tiếp rồi về 0 lần nữa; số lần tải CÓ CHẶN, không vô hạn', async () => {
    const { api } = await openWithFiveSecondsLeft();
    // Giờ máy chủ chậm hơn 100 ms so với giờ máy lúc về 0
    api.detail = makeDetail({
      maLichHen: PAY_CODE,
      trangThai: 'ChoThanhToan',
      hanThanhToan: at(5000),
      thoiGianMayChu: at(4900),
    });
    await advance(5000);
    await flush();
    expect(timer()).toHaveTextContent('00:01');
    expect(api.callsTo('GET', PAY_API_PATH)).toHaveLength(2);

    // Lần tải thứ ba: máy chủ đã qua hạn
    api.detail = makeDetail({
      maLichHen: PAY_CODE,
      trangThai: 'ChoThanhToan',
      hanThanhToan: at(5000),
      thoiGianMayChu: at(9000),
    });
    await advance(500);
    await flush();

    await heading(PAYMENT_TEXT.expiredTitle);
    expect(payButton()).toBeNull();
    expect(api.callsTo('GET', PAY_API_PATH)).toHaveLength(3);
    await advance(120_000);
    expect(api.callsTo('GET', PAY_API_PATH)).toHaveLength(3);
  });
});

describe('WPF6 gỡ trang và đổi mã', () => {
  it('WPF6-17 gỡ trang dọn hết hẹn giờ: không còn bộ hẹn giờ nào, không lời gọi thêm, không console.error', async () => {
    fakeClock();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { api, unmount } = renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail({ leftMs: 30_000 });
      },
    });
    await heading(PAYMENT_TEXT.title);
    await screen.findByRole('button', { name: PAY_BUTTON });
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);

    const calls = api.requests.length;
    await advance(60_000);
    expect(api.requests).toHaveLength(calls);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('WPF6-17 đổi mã trên cùng route: tải lại đúng mã mới và KHÔNG hiện lịch của mã trước trong lúc tải', async () => {
    fakeClock();
    const OTHER = 'CLX-20261123-ZZ999';
    const { api } = renderPaymentPage({
      extra: <Link to={bookingPaymentPath(OTHER)}>Đổi mã</Link>,
      before: (fake) => {
        fake.detail = holdDetail({
          overrides: { dichVu: 'Dịch vụ của mã đầu' },
        });
      },
    });
    await heading(PAYMENT_TEXT.title);
    expect(screen.getByText('Dịch vụ của mã đầu')).toBeInTheDocument();

    const held = holdResponse(() =>
      jsonResponse(
        holdDetail({
          overrides: { maLichHen: OTHER, dichVu: 'Dịch vụ của mã sau' },
        }),
      ),
    );
    api.failNext('detail', held.override);
    fireEvent.click(screen.getByRole('link', { name: 'Đổi mã' }));
    await flush();

    // Đang tải mã mới: không còn lịch cũ, không còn đồng hồ cũ
    // `LocationProbe` của harness cũng là `<output>` (role status): chỉ tìm trong thân Bước 5
    expect(
      within(screen.getByTestId('booking-step-5-body')).getByRole('status'),
    ).toHaveTextContent(PAYMENT_TEXT.loading);
    expect(screen.queryByText('Dịch vụ của mã đầu')).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();

    held.release();
    await flush();
    expect(await screen.findByText('Dịch vụ của mã sau')).toBeInTheDocument();
    expect(screen.getByTestId('booking-step-5-body')).toHaveAttribute(
      'data-reference',
      OTHER,
    );
  });
});
