import { SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AdminForbiddenPage } from '../../features/admin/admin-forbidden-page';
import { NotFoundPage } from '../../pages/not-found-page';
import { ErrorPageCard, ForbiddenCard, NotFoundCard } from './error-page-card';

// UX1-45 đến UX1-54 (doctor UX1, G4): thẻ 404 và 403 có giao diện (icon, tiêu đề, một câu, nút). Chữ tiêu đề GIỮ NGUYÊN chữ cũ vì hàng chục test của
// nhiều module tìm theo tiêu đề. Cơ chế quyết định 404 hay 403 không đổi (require-auth.tsx chỉ import), test này chỉ khoá hiển thị.

function renderAt(entries: string[], element: ReactNode) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="/trang-truoc" element={<p>Trang trước</p>} />
        <Route path="*" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NotFoundCard (404)', () => {
  it('UX1-45 tiêu đề h1 "Không tìm thấy trang", một câu giải thích không lộ trang có tồn tại hay không, nằm trong `main`', () => {
    renderAt(['/bac-si-portal/lich-lam-viec'], <NotFoundCard />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Không tìm thấy trang' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Trang bạn tìm không tồn tại hoặc bạn không thể truy cập trang này.',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('main')).getByRole('heading', { level: 1 }),
    ).toBeInTheDocument();
  });

  it('UX1-46 có liên kết "Về trang chủ" tới "/" (không phải nút trần)', () => {
    renderAt(['/x'], <NotFoundCard />);

    const home = screen.getByRole('link', { name: 'Về trang chủ' });
    expect(home).toHaveAttribute('href', '/');
  });

  it('UX1-47 404 là trang thường: KHÔNG có `role="alert"`', () => {
    renderAt(['/x'], <NotFoundCard />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('UX1-48 "Quay lại" ẨN khi đây là trang đầu của phiên (bấm sẽ ra khỏi ứng dụng); HIỆN khi có trang trước và bấm thì lùi một bước', () => {
    const { unmount } = renderAt(['/x'], <NotFoundCard />);
    expect(screen.queryByRole('button', { name: 'Quay lại' })).toBeNull();
    unmount();

    renderAt(['/trang-truoc', '/x'], <NotFoundCard />);
    const back = screen.getByRole('button', { name: 'Quay lại' });
    expect(back).toHaveAttribute('type', 'button');

    fireEvent.click(back);

    expect(screen.getByText('Trang trước')).toBeInTheDocument();
  });

  it('UX1-49 thứ tự Tab: "Về trang chủ" rồi "Quay lại"; một h1 duy nhất; icon chỉ trang trí (aria-hidden)', () => {
    const { container } = renderAt(['/trang-truoc', '/x'], <NotFoundCard />);

    const home = screen.getByRole('link', { name: 'Về trang chủ' });
    const back = screen.getByRole('button', { name: 'Quay lại' });
    expect(
      home.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    const icon = container.querySelector('main svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('ForbiddenCard (403)', () => {
  it('UX1-50 giữ NGUYÊN chữ cũ: h1 "Không đủ quyền truy cập", câu "Bạn không có quyền truy cập trang này."; vùng chữ có `role="alert"`', () => {
    renderAt(['/admin/cai-dat'], <ForbiddenCard />);

    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByRole('heading', {
        level: 1,
        name: 'Không đủ quyền truy cập',
      }),
    ).toBeInTheDocument();
    expect(
      within(alert).getByText('Bạn không có quyền truy cập trang này.'),
    ).toBeInTheDocument();
  });

  it('UX1-51 nút nằm NGOÀI vùng `role="alert"` (trình đọc màn hình chỉ đọc chữ báo, không đọc cả nút); có "Về trang chủ", và "Quay lại" khi có trang trước', () => {
    renderAt(['/trang-truoc', '/admin/cai-dat'], <ForbiddenCard />);

    const alert = screen.getByRole('alert');
    const home = screen.getByRole('link', { name: 'Về trang chủ' });
    const back = screen.getByRole('button', { name: 'Quay lại' });
    expect(alert).not.toContainElement(home);
    expect(alert).not.toContainElement(back);
  });

  it('UX1-52 403 và 404 dùng cùng bố cục thẻ (một `main`, một h1, icon aria-hidden) nhưng icon và chữ khác nhau', () => {
    const forbidden = renderAt(['/x'], <ForbiddenCard />);
    const forbiddenIcon = forbidden.container.querySelector('main svg');
    expect(forbidden.container.querySelectorAll('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(forbiddenIcon).toHaveAttribute('aria-hidden', 'true');
    const forbiddenClass = forbiddenIcon?.getAttribute('class');
    forbidden.unmount();

    const notFound = renderAt(['/x'], <NotFoundCard />);
    const notFoundClass = notFound.container
      .querySelector('main svg')
      ?.getAttribute('class');
    expect(notFoundClass).toBeDefined();
    expect(notFoundClass).not.toBe(forbiddenClass);
  });
});

describe('ErrorPageCard (nền cho 404, 403 và màn 500 của UX4)', () => {
  it('UX1-53 hiển thị icon, tiêu đề, câu và nút nhận vào; `role` chỉ có khi nơi gọi truyền', () => {
    const { unmount } = renderAt(
      ['/x'],
      <ErrorPageCard
        icon={SearchX}
        title="Tiêu đề thử"
        message="Câu thử."
        actions={<button type="button">Nút thử</button>}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Tiêu đề thử' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Câu thử.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nút thử' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    unmount();

    renderAt(
      ['/x'],
      <ErrorPageCard icon={SearchX} title="Lỗi" message="Câu." role="alert" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Lỗi');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('UX1-54 `NotFoundPage` và `AdminForbiddenPage` (vỏ mỏng của hai thẻ trên) giữ nguyên tiêu đề, nút, `role` mà require-auth, router và khung Admin đang dùng', () => {
    const notFound = renderAt(['/x'], <NotFoundPage />);
    expect(
      screen.getByRole('heading', { name: 'Không tìm thấy trang' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Về trang chủ' }),
    ).toBeInTheDocument();
    notFound.unmount();

    renderAt(['/x'], <AdminForbiddenPage />);
    expect(
      within(screen.getByRole('alert')).getByRole('heading', {
        name: 'Không đủ quyền truy cập',
      }),
    ).toBeInTheDocument();
  });
});
