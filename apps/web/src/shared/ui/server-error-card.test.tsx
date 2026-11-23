import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../api/errors';
import { ERROR_VARIANTS, pageMessageFor } from './error-variant';
import { ServerErrorCard } from './server-error-card';

// DUX4-10 đến 19 (doctor UX4, G18, T9): màn lỗi 500 cả trang. Chữ chọn theo LOẠI lỗi; không bao giờ in chi tiết lỗi; focus vào tiêu đề khi hiện.

function renderCard(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const SYSTEM = ERROR_VARIANTS.system;
const CONNECTION = ERROR_VARIANTS.connection;

describe('ServerErrorCard: chữ theo loại lỗi', () => {
  it('DUX4-10 lỗi hệ thống (5xx, LOI_HE_THONG, phản hồi lạ): tiêu đề "Hệ thống đang gặp sự cố" và câu riêng', () => {
    const errors = [
      new ApiError(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
      new UnexpectedResponseError(502),
    ];
    for (const error of errors) {
      const { unmount } = renderCard(<ServerErrorCard error={error} />);
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Hệ thống đang gặp sự cố',
        }),
      ).toBeInTheDocument();
      expect(SYSTEM.title).toBe('Hệ thống đang gặp sự cố');
      expect(screen.getByText(pageMessageFor(error))).toBeInTheDocument();
      unmount();
    }
  });

  it('DUX4-11 một `h1`, một `main`, icon `aria-hidden`; `role="alert"` bọc tiêu đề và câu nhưng KHÔNG bọc nút', () => {
    const { container } = renderCard(
      <ServerErrorCard error={new Error('x')} onRetry={() => undefined} />,
    );

    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('main svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByRole('heading', { name: SYSTEM.title }),
    ).toBeInTheDocument();
    expect(alert).toHaveTextContent(pageMessageFor(new Error('x')));
    expect(alert).not.toContainElement(
      screen.getByRole('button', { name: 'Thử lại' }),
    );
    expect(alert).not.toContainElement(
      screen.getByRole('link', { name: 'Về trang chủ' }),
    );
  });

  it('DUX4-12 mất kết nối và quá thời gian: CÙNG một tiêu đề của biến thể mạng, câu khác nhau', () => {
    const network = renderCard(<ServerErrorCard error={new NetworkError()} />);
    expect(
      screen.getByRole('heading', { level: 1, name: CONNECTION.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(pageMessageFor(new NetworkError())),
    ).toBeInTheDocument();
    const networkIcon = network.container
      .querySelector('main svg')
      ?.getAttribute('class');
    network.unmount();

    const timeout = renderCard(<ServerErrorCard error={new TimeoutError()} />);
    expect(
      screen.getByRole('heading', { level: 1, name: CONNECTION.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(pageMessageFor(new TimeoutError())),
    ).toBeInTheDocument();
    expect(pageMessageFor(new TimeoutError())).not.toBe(
      pageMessageFor(new NetworkError()),
    );
    // Cùng biến thể thì cùng icon; khác icon của biến thể hệ thống
    expect(
      timeout.container.querySelector('main svg')?.getAttribute('class'),
    ).toBe(networkIcon);
    timeout.unmount();

    const system = renderCard(<ServerErrorCard error={new Error('x')} />);
    expect(
      system.container.querySelector('main svg')?.getAttribute('class'),
    ).not.toBe(networkIcon);
  });

  it('DUX4-13 lỗi không phân loại được (chuỗi, null, undefined, đối tượng trơn) vẫn hiện màn hệ thống, không vỡ', () => {
    for (const error of ['chuỗi', null, undefined, {}, 42]) {
      const { unmount } = renderCard(<ServerErrorCard error={error} />);
      expect(
        screen.getByRole('heading', { level: 1, name: SYSTEM.title }),
      ).toBeInTheDocument();
      unmount();
    }
  });
});

describe('ServerErrorCard: không lộ chi tiết lỗi', () => {
  const SECRETS = [
    'SELECT',
    'tai_khoan',
    'ECONNREFUSED',
    '10.0.0.5',
    'C:\\app',
    'x.ts',
    'Object.<anonymous>',
    'LOI_HE_THONG',
    'r-bi-mat-1',
    'bi-mat-chi-tiet',
  ];

  function leakyErrors(): unknown[] {
    const withStack = new Error('ECONNREFUSED 10.0.0.5:3306 tại C:\\app\\x.ts');
    withStack.stack =
      'Error: ECONNREFUSED 10.0.0.5:3306\n    at Object.<anonymous> (C:\\app\\src\\x.ts:1:1)';
    return [
      new ApiError(500, {
        maLoi: 'LOI_HE_THONG',
        thongBao: "SELECT * FROM tai_khoan WHERE email = 'a@b.vn'",
        requestId: 'r-bi-mat-1',
        chiTiet: { bang: 'tai_khoan', ghiChu: 'bi-mat-chi-tiet' },
      }),
      withStack,
      new UnexpectedResponseError(502),
      'SELECT * FROM tai_khoan',
      { message: 'ECONNREFUSED 10.0.0.5', stack: 'at x.ts' },
    ];
  }

  it('DUX4-14 thông điệp máy chủ, SQL, tên bảng, đường dẫn, stack, mã nội bộ và requestId KHÔNG xuất hiện trong DOM', () => {
    for (const error of leakyErrors()) {
      const { container, unmount } = renderCard(
        <ServerErrorCard error={error} onRetry={() => undefined} />,
      );
      const text = container.textContent ?? '';
      for (const secret of SECRETS) {
        expect(text, `lộ "${secret}"`).not.toContain(secret);
      }
      unmount();
    }
  });
});

describe('ServerErrorCard: nút', () => {
  it('DUX4-15 "Thử lại" gọi onRetry đúng một lần; không có onRetry thì không có nút', () => {
    const onRetry = vi.fn();
    const { unmount } = renderCard(
      <ServerErrorCard error={new Error('x')} onRetry={onRetry} />,
    );
    const retry = screen.getByRole('button', { name: 'Thử lại' });
    expect(retry).toHaveAttribute('type', 'button');
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    unmount();

    renderCard(<ServerErrorCard error={new Error('x')} />);
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Về trang chủ' }),
    ).toBeInTheDocument();
  });

  it('DUX4-16 "Về trang chủ" là liên kết tới "/"', () => {
    renderCard(<ServerErrorCard error={new Error('x')} />);
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('DUX4-17 thứ tự Tab: Thử lại rồi Về trang chủ; cả hai đủ cỡ chạm (`min-h-[44px]`)', () => {
    renderCard(
      <ServerErrorCard error={new Error('x')} onRetry={() => undefined} />,
    );
    const retry = screen.getByRole('button', { name: 'Thử lại' });
    const home = screen.getByRole('link', { name: 'Về trang chủ' });

    expect(
      retry.compareDocumentPosition(home) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // 44 px tuyệt đối: `min-h-11` chỉ ra 41,25 px vì cỡ chữ gốc là 15 px (đo ở trình duyệt, Đại duyệt đổi 23/11/2026)
    expect(retry).toHaveClass('min-h-[44px]');
    expect(home).toHaveClass('min-h-[44px]');
  });
});

describe('ServerErrorCard: focus', () => {
  it('DUX4-18 vừa hiện thì focus nằm ở tiêu đề (`h1` có `tabIndex=-1`)', () => {
    renderCard(
      <ServerErrorCard error={new Error('x')} onRetry={() => undefined} />,
    );
    const title = screen.getByRole('heading', { level: 1 });

    expect(title).toHaveAttribute('tabindex', '-1');
    expect(title).toHaveFocus();
  });

  it('DUX4-19 render lại sau khi người dùng đã chuyển focus sang nút thì KHÔNG bị giật về tiêu đề', () => {
    const onRetry = () => undefined;
    const { rerender } = renderCard(
      <ServerErrorCard error={new Error('x')} onRetry={onRetry} />,
    );
    const retry = screen.getByRole('button', { name: 'Thử lại' });
    retry.focus();
    expect(retry).toHaveFocus();

    rerender(
      <MemoryRouter>
        <ServerErrorCard error={new Error('khác')} onRetry={onRetry} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Thử lại' })).toHaveFocus();
  });
});
