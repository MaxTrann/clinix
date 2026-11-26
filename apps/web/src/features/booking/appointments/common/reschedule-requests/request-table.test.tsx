import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { makeRequestRows } from '../../../testing/reschedule-requests-fixtures';
import { RequestTable } from './request-table';
import { REQUEST_TEXT } from './request-text';

// reschedule X3, lỗi L-01, WXD-138 `[đề xuất]`: chữ ẩn `sr-only` của Tailwind là `position: absolute`. Vùng cuộn ngang không được định vị thì các chữ này thoát khỏi vùng và làm cả TRANG tràn ngang ở màn 375 px.
// GIỚI HẠN: happy-dom không dựng bố cục nên không đo được `scrollWidth`. Ca này chỉ khoá TÊN LỚP và việc chữ ẩn nằm trong vùng; bố cục thật phải đo bằng trình duyệt.
describe('reschedule L-01 — bảng yêu cầu đổi lịch ở màn hẹp', () => {
  it('WXD-138 vùng cuộn ngang vừa `relative` vừa `overflow-x-auto`, và mọi chữ ẩn `sr-only` của bảng nằm trong vùng đó', () => {
    const { container } = render(
      <MemoryRouter>
        <RequestTable
          rows={makeRequestRows(2)}
          detailPath={(yeuCauId) => yeuCauId}
          listSearch=""
        />
      </MemoryRouter>,
    );
    const region = screen.getByRole('region', {
      name: REQUEST_TEXT.resultsRegion,
    });
    expect(region).toHaveClass('relative', 'overflow-x-auto');

    // Ca phải nói về phần tử THẬT: chú thích bảng, tiêu đề cột Thao tác, và hai chữ ẩn ở mỗi dòng
    const hidden = container.querySelectorAll<HTMLElement>('.sr-only');
    expect(hidden).toHaveLength(2 + 2 * 2);
    for (const element of hidden) expect(region).toContainElement(element);
  });
});
