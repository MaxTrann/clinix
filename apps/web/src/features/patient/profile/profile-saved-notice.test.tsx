import { render, screen } from '@testing-library/react';
import { SAVED_MESSAGE } from './profile-errors';
import { SavedNotice } from './profile-saved-notice';

// patient F4 (TRACKING F4-C, F4-H): thông báo lưu thành công dùng chung với trang Bản thân. Mã ca CB-nn là [đề xuất]; mỗi ca ghi mã HS của PLAN mục 7.1.
// Markup của thông báo trong trang Bản thân của `HEAD` (patient F3, trước khi rút thành SavedNotice), trích từ DOM sau khi lưu: so từng ký tự.
// Cùng cách `DW-28` của F7 làm cho `FormActions`; đột biến đổi một thuộc tính của SavedNotice phải đỏ ở đây.
const BASELINE_NOTICE =
  '<div role="status"><p class="mb-3 flex items-start gap-2 rounded-xl border border-success-line bg-success-soft p-3 text-sm text-success"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check lucide-check-circle-2 mt-0.5 size-4 shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="m16 9-5.5 5.5L8 12"></path></svg><span>Đã cập nhật thông tin cá nhân.</span></p></div>';

describe('SavedNotice', () => {
  it('CB-20 HS-19 chưa lưu ⇒ vùng role="status" có sẵn nhưng trống (người đọc màn hình nghe được khi câu xuất hiện)', () => {
    render(<SavedNotice saved={false} />);
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();
    expect(screen.queryByText(SAVED_MESSAGE)).toBeNull();
  });

  it('CB-20 HS-19 đã lưu ⇒ câu "Đã cập nhật thông tin cá nhân." trong CHÍNH vùng đó; biểu tượng aria-hidden', () => {
    const { rerender } = render(<SavedNotice saved={false} />);
    const before = screen.getByRole('status');

    rerender(<SavedNotice saved />);

    const after = screen.getByRole('status');
    expect(after).toBe(before);
    expect(after).toHaveTextContent('Đã cập nhật thông tin cá nhân.');
    expect(SAVED_MESSAGE).toBe('Đã cập nhật thông tin cá nhân.');
    expect(after.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('CB-20b HS-19 markup khi đã lưu trùng từng ký tự với thông báo của trang Bản thân bản HEAD (DOM trang Bản thân không đổi)', () => {
    const { container } = render(<SavedNotice saved />);
    expect(container.innerHTML).toBe(BASELINE_NOTICE);
  });
});
