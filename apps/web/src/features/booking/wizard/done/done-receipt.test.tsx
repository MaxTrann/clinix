import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PATIENT_APPOINTMENTS_PATH,
  bookingDonePath,
} from '../../../../shared/routes/booking-paths';
import {
  DONE_CODE,
  HOME_MARK,
  LIST_MARK,
  cleanUpDonePage,
  renderDonePage,
} from '../../testing/done-step-harness';
import { makeDetail } from '../../testing/fake-appointment-detail-api';
import { HOME_PATH } from './done-actions';
import { DONE_TEXT } from './done-messages';

// booking F7: phiếu hẹn của Bước 6 (Figma `453:2`). WZ-11 của PLAN booking 7.18; HTR-01…HTR-08 là [đề xuất] (mục 7.42, TRACKING 3.36.3). Dữ liệu giả; không gọi backend thật.
// Mọi số tiền là chuỗi của API (H4): không `Number`, không cộng trừ ở client.
afterEach(cleanUpDonePage);

const success = () =>
  screen.findByRole('heading', { level: 1, name: DONE_TEXT.successTitle });
const detailsCard = () =>
  screen.getByRole('region', { name: DONE_TEXT.detailsTitle });
const costCard = () =>
  screen.getByRole('region', { name: DONE_TEXT.costTitle });
// Hàng "nhãn, giá trị" của một thẻ: phần tử cha của `dt`
const row = (card: HTMLElement, label: string) =>
  within(card).getByText(label).parentElement as HTMLElement;

describe('HTR phiếu hẹn: nội dung', () => {
  it('HTR-01 WZ-11 `DaXacNhan` cọc 0đ: phiếu đủ trường, không địa chỉ, không "Lý do khám", không câu hứa email hay thông báo', async () => {
    renderDonePage({
      before: (api) => {
        api.detail = makeDetail({ tienCoc: '0.00', lyDoKham: 'ho kéo dài' });
      },
    });

    await success();
    expect(screen.getByText(DONE_TEXT.successNote)).toBeInTheDocument();
    expect(screen.getByText(DONE_TEXT.codeLabel)).toBeInTheDocument();
    expect(screen.getByText('CP20261020001')).toBeInTheDocument();

    const details = detailsCard();
    expect(row(details, 'Dịch vụ')).toHaveTextContent('Khám tim mạch');
    expect(row(details, 'Bác sĩ')).toHaveTextContent('Nguyễn Minh Anh');
    expect(row(details, 'Bác sĩ')).toHaveTextContent('Tim mạch');
    expect(row(details, 'Chi nhánh')).toHaveTextContent('CLINIX Quận 1');
    // 2026-10-20T01:00Z = 08:00 giờ Việt Nam, Thứ 3
    expect(row(details, 'Ngày & giờ khám')).toHaveTextContent(
      'Thứ 3, 20/10/2026',
    );
    expect(row(details, 'Ngày & giờ khám')).toHaveTextContent('08:00');
    expect(row(details, 'Người khám')).toHaveTextContent(
      'Nguyễn Văn A · Bản thân',
    );
    expect(within(details).queryByText('Lý do khám')).toBeNull();

    const cost = costCard();
    expect(row(cost, 'Giá khám')).toHaveTextContent('300.000đ');
    expect(within(cost).queryByText('Cọc yêu cầu')).toBeNull();
    expect(within(cost).queryByText('Thu tại quầy')).toBeNull();
    expect(within(cost).getByText(DONE_TEXT.counterNote)).toBeInTheDocument();

    // Không hứa việc hệ thống chưa làm (B15) và không lộ lý do khám
    expect(document.body.textContent).not.toMatch(
      /email|thư điện tử|thông báo/i,
    );
    expect(document.body.textContent).not.toContain('ho kéo dài');
  });

  it.each([
    ['2026-10-19T16:59:59.000Z', 'Thứ 2, 19/10/2026', '23:59'],
    ['2026-10-19T17:00:00.000Z', 'Thứ 3, 20/10/2026', '00:00'],
  ])(
    'HTR-02 WZ-11 giờ Việt Nam ở biên ngày: %s ⇒ %s lúc %s (không theo múi giờ máy)',
    async (iso, date, time) => {
      renderDonePage({
        before: (api) => {
          api.detail = makeDetail({ thoiGian: iso });
        },
      });

      await success();
      const visit = row(detailsCard(), 'Ngày & giờ khám');
      expect(visit).toHaveTextContent(date);
      expect(visit).toHaveTextContent(time);
    },
  );

  it('HTR-03 H4 tiền là chuỗi: số lớn hơn 2^53 hiện nguyên vẹn, không qua `Number`', async () => {
    renderDonePage({
      before: (api) => {
        api.detail = makeDetail({
          giaSnapshot: '9007199254740993.00',
          tienCoc: '9007199254740991.00',
        });
      },
    });

    await success();
    const cost = costCard();
    expect(row(cost, 'Giá khám')).toHaveTextContent('9.007.199.254.740.993đ');
    expect(row(cost, 'Cọc yêu cầu')).toHaveTextContent(
      '9.007.199.254.740.991đ',
    );
  });

  it('HTR-04 H4 Q20 cọc > 0, `thanhToan = null`: có "Cọc yêu cầu" nhưng KHÔNG có "Thu tại quầy" hay "Đã thu", và không số nào ngoài hai chuỗi của API', async () => {
    renderDonePage({
      before: (api) => {
        api.detail = makeDetail({ tienCoc: '100000.00', thanhToan: null });
      },
    });

    await success();
    const cost = costCard();
    expect(row(cost, 'Cọc yêu cầu')).toHaveTextContent('100.000đ');
    expect(within(cost).queryByText('Thu tại quầy')).toBeNull();
    expect(within(cost).queryByText('Đã thu')).toBeNull();
    // Chỉ "Giá khám" 300.000đ và "Cọc yêu cầu" 100.000đ: không có 200.000đ (giá trừ cọc) tính ở client
    expect(
      within(cost)
        .getAllByText(/^\d[\d.]*đ$/)
        .map((node) => node.textContent),
    ).toEqual(['300.000đ', '100.000đ']);
  });

  it('HTR-05 H4 `thanhToan` có: "Đã thu" và "Thu tại quầy" đúng chuỗi của cổng `payment` (không đổi chỗ hai khoá)', async () => {
    renderDonePage({
      before: (api) => {
        api.detail = makeDetail({
          thanhToan: {
            daThu: '9007199254740993.00',
            conPhaiThu: '9007199254740995.00',
          },
        });
      },
    });

    await success();
    const cost = costCard();
    expect(row(cost, 'Đã thu')).toHaveTextContent('9.007.199.254.740.993đ');
    expect(row(cost, 'Thu tại quầy')).toHaveTextContent(
      '9.007.199.254.740.995đ',
    );
    expect(row(cost, 'Thu tại quầy')).not.toHaveTextContent(
      '9.007.199.254.740.993đ',
    );
  });

  it('HTR-06 WZ-09 `lyDoKham` và khoá thừa của thân KHÔNG xuất hiện trong DOM', async () => {
    renderDonePage({
      before: (api) => {
        api.detail = {
          ...makeDetail({ lyDoKham: 'LY-DO-NHAN-DANG' }),
          khoaThua: 'GIA-TRI-THUA-NHAN-DANG',
        };
      },
    });

    await success();
    expect(document.body.textContent).not.toContain('LY-DO-NHAN-DANG');
    expect(document.body.textContent).not.toContain('GIA-TRI-THUA-NHAN-DANG');
  });

  it('HTR-08 WZ-11 mã lịch hẹn lấy từ API, không từ URL (URL chữ thường ⇒ hiện chữ hoa của API)', async () => {
    const lower = DONE_CODE.toLowerCase();
    const { api } = renderDonePage({
      path: bookingDonePath(lower),
      before: (fake) => {
        fake.detail = makeDetail({ maLichHen: DONE_CODE });
      },
    });

    await success();
    expect(screen.getByText(DONE_CODE)).toBeInTheDocument();
    expect(screen.queryByText(lower)).toBeNull();
    expect(api.requests[0].path).toBe(`/patient/appointments/${lower}`);
  });
});

describe('HTR hai nút (WZ-11)', () => {
  it('HTR-07 WZ-11 đúng hai liên kết trong khối nút, nhãn và đích từ hằng; không có "Quay lại"; thanh bước không có liên kết', async () => {
    renderDonePage();

    await success();
    const next = screen.getByRole('navigation', { name: DONE_TEXT.nextLabel });
    const links = within(next).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      DONE_TEXT.home,
      DONE_TEXT.myAppointments,
    ]);
    expect(links[0]).toHaveAttribute('href', HOME_PATH);
    expect(links[1]).toHaveAttribute('href', PATIENT_APPOINTMENTS_PATH);

    expect(screen.queryByRole('link', { name: /Quay lại/ })).toBeNull();
    expect(
      within(
        screen.getByRole('navigation', { name: 'Các bước đặt lịch' }),
      ).queryAllByRole('link'),
    ).toHaveLength(0);
  });

  it.each([
    [DONE_TEXT.home, HOME_MARK],
    [DONE_TEXT.myAppointments, LIST_MARK],
  ])('HTR-07 WZ-11 bấm "%s" tới đúng đích', async (name, mark) => {
    renderDonePage();

    await success();
    fireEvent.click(screen.getByRole('link', { name }));
    expect(await screen.findByText(mark)).toBeInTheDocument();
  });
});
