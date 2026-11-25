import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanUpDetailPage,
  DETAIL_CODE,
} from '../../../testing/appointment-detail-harness';
import { renderReschedule } from '../../../testing/reschedule-harness';
import { RESCHEDULE_TEXT } from './reschedule-text';

// reschedule F1, mã ca WDH-21 [đề xuất]: ĐÍCH của việc chọn ô (thân thật là việc của reschedule F2). Chỉ kiểm hợp đồng chuyển: đọc `khungGioId` từ URL bằng `readSlotId` (nếp WZ-09), tải lại vẫn chạy,
// không gọi API, không hiện id, liên kết quay lại lưới. Dữ liệu giả.
afterEach(cleanUpDetailPage);

const BASE = `/benh-nhan/lich-hen-cua-toi/${DETAIL_CODE}/doi-lich/xac-nhan`;
const PICKER = `/benh-nhan/lich-hen-cua-toi/${DETAIL_CODE}/doi-lich`;

describe('màn xác nhận (đích của F1)', () => {
  it('WDH-21 id hợp lệ ⇒ tiêu đề, chữ "chưa triển khai", liên kết "Chọn khung giờ khác"; KHÔNG gọi API nào và KHÔNG hiện id', () => {
    const big = '9223372036854775807';
    const { api } = renderReschedule({ path: `${BASE}?khungGioId=${big}` });
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: RESCHEDULE_TEXT.confirmTitle,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(RESCHEDULE_TEXT.confirmNotReady),
    ).toBeInTheDocument();
    // Chỉ xét NỘI DUNG TRANG (khung `section`), không xét ô dò URL của harness (nó in đúng URL có id)
    const page = screen
      .getByRole('heading', { level: 1 })
      .closest('section') as HTMLElement;
    expect(page.textContent).not.toContain(big);
    expect(
      screen.queryByText(RESCHEDULE_TEXT.invalidLink),
    ).not.toBeInTheDocument();
    expect(api.detail.requests).toEqual([]);
    expect(api.previewCalls).toEqual([]);
    expect(api.slotCalls).toEqual([]);
    // tiêu điểm ở tiêu đề của trang
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 1 }),
    );
  });

  it('WDH-21 liên kết "Chọn khung giờ khác" (và liên kết quay lại ở đầu trang) về trang chọn; bấm thì thấy lại lưới', async () => {
    renderReschedule({ path: `${BASE}?khungGioId=5` });
    const links = screen.getAllByRole('link', {
      name: RESCHEDULE_TEXT.pickAnother,
    });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute('href', PICKER);
    fireEvent.click(links[1]);
    expect(
      await screen.findByRole('button', { name: '08:00, còn trống' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent(PICKER);
  });

  it('WDH-21 tải lại (dựng lại với cùng URL) vẫn ra màn xác nhận: id nằm trên URL, không ở kho trình duyệt', () => {
    const first = renderReschedule({ path: `${BASE}?khungGioId=77` });
    expect(
      screen.getByText(RESCHEDULE_TEXT.confirmNotReady),
    ).toBeInTheDocument();
    first.unmount();
    cleanUpDetailPage();
    renderReschedule({ path: `${BASE}?khungGioId=77` });
    expect(
      screen.getByText(RESCHEDULE_TEXT.confirmNotReady),
    ).toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it.each([
    ['thiếu khoá', ''],
    ['rỗng', '?khungGioId='],
    ['có chữ', '?khungGioId=abc'],
    ['số 0 đứng đầu', '?khungGioId=007'],
    ['số 0', '?khungGioId=0'],
    ['số âm', '?khungGioId=-5'],
    ['số thập phân', '?khungGioId=1.5'],
    ['dạng khoa học', '?khungGioId=1e5'],
    ['vượt BIGINT', '?khungGioId=9223372036854775808'],
    ['hai chữ số 0 dài quá 19 chữ số', '?khungGioId=12345678901234567890'],
    ['lặp khoá', '?khungGioId=1&khungGioId=2'],
    ['khoá sai tên', '?slot=5'],
  ])(
    'WDH-21 ca âm: %s ⇒ "Liên kết chọn khung giờ không hợp lệ." kèm liên kết về trang chọn, không chữ "chưa triển khai"',
    (_name, search) => {
      const { api } = renderReschedule({ path: `${BASE}${search}` });
      expect(screen.getByRole('alert')).toHaveTextContent(
        RESCHEDULE_TEXT.invalidLink,
      );
      expect(
        screen.queryByText(RESCHEDULE_TEXT.confirmNotReady),
      ).not.toBeInTheDocument();
      expect(
        screen.getAllByRole('link', { name: RESCHEDULE_TEXT.pickAnother })[0],
      ).toHaveAttribute('href', PICKER);
      expect(api.detail.requests).toEqual([]);
    },
  );
});
