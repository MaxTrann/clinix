import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { HANDLE_TEXT } from './request-handle-text';
import { RequestNotice } from './request-notice';
import { noticeState, readRequestNotice } from './request-notice-state';

// reschedule F4 Pha B1, WXD-88 `[đề xuất]` (nếp WDH-41, WDH-43 của F2): thông báo MỘT LẦN từ trang chi tiết về danh sách sau khi duyệt hay từ chối xong. Đi qua `location.state` (không URL, không storage), đọc theo DANH SÁCH
// TRẮNG, chữ hiển thị cố định của web, và xoá khỏi lịch sử bằng `replace` nên tải lại hay quay về không hiện lại.
function StateProbe() {
  const location = useLocation();
  return <output data-testid="state">{JSON.stringify(location.state)}</output>;
}

function renderWith(state: unknown) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/le-tan/yeu-cau-doi-lich', state }]}
    >
      <div data-testid="notice">
        <RequestNotice />
      </div>
      <StateProbe />
    </MemoryRouter>,
  );
}

describe('đọc thông báo theo danh sách trắng', () => {
  it('WXD-88 hai giá trị hợp lệ đọc được; `noticeState` chỉ có MỘT khoá', () => {
    expect(readRequestNotice(noticeState('DaDuyet'))).toBe('DaDuyet');
    expect(readRequestNotice(noticeState('TuChoi'))).toBe('TuChoi');
    expect(Object.keys(noticeState('DaDuyet'))).toEqual([
      'rescheduleRequestNotice',
    ]);
  });

  it.each([
    null,
    undefined,
    'DaDuyet',
    42,
    [],
    {},
    { rescheduleRequestNotice: '<img src=x onerror=1>' },
    { rescheduleRequestNotice: 'ChoDuyet' },
    { rescheduleRequestNotice: 'daduyet' },
    { rescheduleRequestNotice: 5 },
    { rescheduleRequestNotice: null },
    // khoá của F2, không phải của F4
    { rescheduleNotice: 'DaDoi' },
    { rescheduleNotice: 'DaDuyet' },
    { other: 'DaDuyet' },
  ])(
    'WXD-88 `state` lạ %j ⇒ bỏ qua (không bao giờ in ra màn hình)',
    (state) => {
      expect(readRequestNotice(state)).toBeNull();
    },
  );
});

describe('hiện một lần', () => {
  it.each([
    ['DaDuyet', HANDLE_TEXT.doneApproved],
    ['TuChoi', HANDLE_TEXT.doneRejected],
  ] as const)(
    'WXD-88 `%s` ⇒ hiện câu cố định (role status), rồi XOÁ `state` khỏi lịch sử (`replace`) để tải lại không hiện lại',
    async (notice, text) => {
      renderWith(noticeState(notice));
      const status = screen.getByText(text);
      expect(status).toHaveAttribute('role', 'status');
      await waitFor(() =>
        expect(screen.getByTestId('state')).toHaveTextContent('null'),
      );
      // vẫn hiện trên trang này (giữ ở state của trang) cho tới khi rời đi
      expect(screen.getByText(text)).toBeInTheDocument();
    },
  );

  it('WXD-88 dựng lại trang (tải lại hay Back về) khi `state` đã bị xoá ⇒ KHÔNG hiện thông báo', () => {
    renderWith(null);
    expect(screen.queryByText(HANDLE_TEXT.doneApproved)).toBeNull();
    expect(screen.queryByText(HANDLE_TEXT.doneRejected)).toBeNull();
  });

  it('WXD-88 `state` có khoá lạ hay giá trị lạ ⇒ không hiện gì, KHÔNG in giá trị lạ, và không đụng `state` (không có gì của F4 để xoá)', () => {
    renderWith({
      rescheduleRequestNotice: 'GIA-TRI-LA',
      listSearch: '?tab=da-xu-ly',
    });
    // Chỗ thông báo trống: không in giá trị lạ (thẻ `state` của `StateProbe` nằm NGOÀI chỗ này)
    expect(screen.getByTestId('notice')).toBeEmptyDOMElement();
    expect(screen.getByTestId('state')).toHaveTextContent('GIA-TRI-LA');
  });
});
