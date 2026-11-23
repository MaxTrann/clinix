import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { patientAppointmentDetailPath } from '../../../../shared/routes/booking-paths';
import { flush, holdResponse } from '../../testing/appointment-detail-harness';
import { makeDetail } from '../../testing/fake-appointment-detail-api';
import { jsonResponse } from '../../testing/fake-appointment-list-api';
import {
  DETAIL_MARK,
  NOW_MS,
  PAY_CODE,
  advance,
  cleanUpPaymentPage,
  fakeClock,
  holdDetail,
  renderPaymentPage,
} from '../../testing/payment-step-harness';
import { HOLD_ANNOUNCEMENTS, PAYMENT_TEXT } from './payment-messages';

// booking F6: trợ năng của trang Thanh toán (WZ-14). WPF6-40…WPF6-42 là [đề xuất] (TRACKING booking 3.49.3). Đồng hồ KHÔNG đọc từng giây cho trình đọc màn hình: một vùng `aria-live="polite"`
// chỉ đổi chữ ở mốc 5 phút, 1 phút và hết giờ. Chữ thời gian đủ, không chỉ màu. Dữ liệu giả; không gọi backend thật.
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
const announcement = () => screen.getByTestId('hold-announcement');
const PAY_BUTTON = /^Thanh toán .+ từ ví$/;
const at = (ms: number) => new Date(NOW_MS + ms).toISOString();

describe('WPF6 đồng hồ và vùng thông báo', () => {
  it('WPF6-40 WZ-14 `role="timer"` không phải vùng live; chỉ MỘT vùng `aria-live="polite"`, chữ đổi ĐÚNG 3 lần qua 15 phút (mốc 5 phút, 1 phút, hết giờ)', async () => {
    fakeClock();
    const { api } = renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail();
      },
    });
    await heading(PAYMENT_TEXT.title);

    // Đồng hồ không tự đọc: không `aria-live` bật; chỉ một vùng live, kiểu polite
    const live = [...document.querySelectorAll('[aria-live]')];
    expect(live).toHaveLength(1);
    expect(live[0]).toBe(announcement());
    expect(live[0]).toHaveAttribute('aria-live', 'polite');
    expect([null, 'off']).toContain(timer().getAttribute('aria-live'));
    expect(announcement()).toHaveClass('sr-only');

    // Lấy mẫu mỗi giây; ngay trước giây cuối đặt sẵn câu trả lời "đã hết hạn" cho lần tải lại
    const seen: string[] = [announcement().textContent ?? ''];
    const timerTexts = new Set<string>();
    for (let second = 1; second <= 900; second += 1) {
      if (second === 900) {
        api.detail = makeDetail({
          maLichHen: PAY_CODE,
          trangThai: 'ChoThanhToan',
          hanThanhToan: at(900_000),
          thoiGianMayChu: at(901_000),
        });
      }
      await advance(1000);
      if (second < 900) timerTexts.add(timer().textContent ?? '');
      const text = announcement().textContent ?? '';
      if (text !== seen[seen.length - 1]) seen.push(text);
    }

    // Số trên đồng hồ đổi mỗi giây (899 giá trị khác nhau) mà vùng thông báo chỉ đổi ở ba mốc
    expect(timerTexts.size).toBe(899);
    expect(seen).toEqual([
      '',
      HOLD_ANNOUNCEMENTS.within5,
      HOLD_ANNOUNCEMENTS.within1,
      HOLD_ANNOUNCEMENTS.ended,
    ]);
  });

  it('WPF6-40 chữ thời gian đủ, không chỉ màu: từ 60 giây trở xuống có chữ "Sắp hết thời gian giữ chỗ" cạnh số; trên 60 giây thì chưa', async () => {
    fakeClock();
    renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail({ leftMs: 61_000 });
      },
    });
    await heading(PAYMENT_TEXT.title);

    expect(timer()).toHaveTextContent('01:01');
    expect(screen.queryByText(PAYMENT_TEXT.hurry)).toBeNull();

    await advance(1000);
    expect(timer()).toHaveTextContent('01:00');
    expect(screen.getByText(PAYMENT_TEXT.hurry)).toBeInTheDocument();
  });
});

describe('WPF6 tiêu điểm, bận, thứ tự Tab', () => {
  it('WPF6-41 WZ-14 tiêu điểm vào h1 khi nội dung đầu tiên hiện; hết giờ thì chuyển tiêu điểm tới h1 (nút trả tiền biến mất, tiêu điểm không rơi về body)', async () => {
    fakeClock();
    const { api } = renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail({ leftMs: 5000 });
      },
    });
    const h1 = await heading(PAYMENT_TEXT.title);
    await screen.findByRole('button', { name: PAY_BUTTON });
    expect(h1).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(h1);
    // Lần tải lại lúc 0: máy chủ vẫn ChoThanhToan và giờ máy chủ đã qua hạn
    api.detail = makeDetail({
      maLichHen: PAY_CODE,
      trangThai: 'ChoThanhToan',
      hanThanhToan: at(5000),
      thoiGianMayChu: at(6000),
    });

    // Người dùng chuyển tiêu điểm sang liên kết "Để sau"; hết giờ thì nút gỡ đi, tiêu điểm về h1
    screen.getByRole('link', { name: PAYMENT_TEXT.later }).focus();
    expect(document.activeElement).not.toBe(h1);
    await advance(5000);

    const expiredHeading = await heading(PAYMENT_TEXT.expiredTitle);
    expect(document.activeElement).toBe(expiredHeading);
  });

  it('WPF6-41 DaHuy lúc tải: tiêu điểm vào h1 của thông báo', async () => {
    fakeClock();
    renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail({
          leftMs: null,
          overrides: { trangThai: 'DaHuy' },
        });
      },
    });
    const h1 = await heading(PAYMENT_TEXT.cancelledTitle);
    expect(document.activeElement).toBe(h1);
  });

  it('WPF6-41 đang kiểm tra lại sau khi về 0: vùng bao `aria-busy="true"`; tải xong thì hết', async () => {
    fakeClock();
    const { api } = renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail({ leftMs: 5000 });
      },
    });
    await heading(PAYMENT_TEXT.title);
    await screen.findByRole('button', { name: PAY_BUTTON });
    const body = screen.getByTestId('booking-step-5-body');
    expect(body.querySelector('[aria-busy="true"]')).toBeNull();

    const held = holdResponse(() =>
      jsonResponse(
        makeDetail({
          maLichHen: PAY_CODE,
          trangThai: 'DaHuy',
          hanThanhToan: null,
          thoiGianMayChu: at(5200),
        }),
      ),
    );
    api.failNext('detail', held.override);
    await advance(5000);
    expect(body.querySelector('[aria-busy="true"]')).not.toBeNull();

    held.release();
    await flush();
    await heading(PAYMENT_TEXT.cancelledTitle);
    expect(body.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('WPF6-42 thứ tự Tab: nút thanh toán trước liên kết "Để sau"; liên kết dẫn tới chi tiết ĐÚNG mã và bấm được', async () => {
    fakeClock();
    const { router } = renderPaymentPage({
      before: (fake) => {
        fake.detail = holdDetail();
      },
    });
    await heading(PAYMENT_TEXT.title);
    await screen.findByRole('button', { name: PAY_BUTTON });

    const body = screen.getByTestId('booking-step-5-body');
    const tabbable = [
      ...body.querySelectorAll(
        'a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ].map((element) => element.textContent?.trim());
    expect(tabbable).toEqual(['Thanh toán 100.000đ từ ví', PAYMENT_TEXT.later]);

    const later = screen.getByRole('link', { name: PAYMENT_TEXT.later });
    expect(later).toHaveAttribute(
      'href',
      patientAppointmentDetailPath(PAY_CODE),
    );
    fireEvent.click(later);
    expect(await screen.findByText(DETAIL_MARK)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      patientAppointmentDetailPath(PAY_CODE),
    );
    await act(async () => {});
  });
});
