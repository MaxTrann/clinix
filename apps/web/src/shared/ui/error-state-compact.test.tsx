import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../api/error-message';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../api/errors';
import { ErrorState } from './error-state';
import { ERROR_VARIANTS } from './error-variant';
import { ServerErrorCard } from './server-error-card';

// DUX4-30 đến 36 (doctor UX4, G18, T9, phương án B): khối lỗi nhỏ thêm icon và tiêu đề của màn 500 nhưng GIỮ NGUYÊN câu cũ (`errorMessageFor`),
// props `error` và `onRetry`, một `role="alert"`, nút "Thử lại". Test cũ WS-62 đến 66 (status.test.tsx) giữ nguyên.

const CASES = [
  {
    name: 'sự cố hệ thống',
    error: new UnexpectedResponseError(502),
    title: ERROR_VARIANTS.system.title,
    message: GENERIC_ERROR_MESSAGE,
  },
  {
    name: 'mất kết nối',
    error: new NetworkError(),
    title: ERROR_VARIANTS.connection.title,
    message: NETWORK_ERROR_MESSAGE,
  },
  {
    name: 'quá thời gian',
    error: new TimeoutError(),
    title: ERROR_VARIANTS.connection.title,
    message: TIMEOUT_ERROR_MESSAGE,
  },
];

describe('ErrorState dạng gọn', () => {
  it.each(CASES)(
    'DUX4-30 $name: icon aria-hidden, tiêu đề của màn 500 và câu CŨ nguyên văn, trong đúng MỘT role=alert',
    ({ error, title, message }) => {
      render(<ErrorState error={error} />);

      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(1);
      const alert = alerts[0];
      expect(within(alert).getByText(title)).toBeInTheDocument();
      expect(within(alert).getByText(message)).toBeInTheDocument();
      expect(alert.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    },
  );

  it('DUX4-31 tiêu đề KHÔNG phải heading (không đổi đại cương của 55 trang dùng khối này)', () => {
    render(<ErrorState error={new NetworkError()} />);

    expect(screen.queryByRole('heading')).toBeNull();
    expect(
      screen.getByText(ERROR_VARIANTS.connection.title),
    ).toBeInTheDocument();
  });

  it('DUX4-32 không lộ chi tiết lỗi: thông điệp máy chủ, SQL, mã nội bộ, requestId, stack không xuất hiện', () => {
    const withStack = new Error('ECONNREFUSED 10.0.0.5:3306 tại C:\\app\\x.ts');
    withStack.stack =
      'Error: x\n    at Object.<anonymous> (C:\\app\\src\\x.ts:1:1)';
    const errors = [
      new ApiError(500, {
        maLoi: 'LOI_HE_THONG',
        thongBao: 'SELECT * FROM tai_khoan',
        requestId: 'r-bi-mat-1',
        chiTiet: { bang: 'tai_khoan' },
      }),
      withStack,
      'SELECT * FROM tai_khoan',
      { message: 'ECONNREFUSED' },
    ];
    for (const error of errors) {
      const { container, unmount } = render(<ErrorState error={error} />);
      const text = container.textContent ?? '';
      for (const secret of [
        'SELECT',
        'tai_khoan',
        'ECONNREFUSED',
        '10.0.0.5',
        'C:\\app',
        'x.ts',
        'LOI_HE_THONG',
        'r-bi-mat-1',
      ]) {
        expect(text, `lộ "${secret}"`).not.toContain(secret);
      }
      unmount();
    }
  });

  it('DUX4-33 yêu cầu bị huỷ thì không hiện gì, kể cả khi có onRetry', () => {
    const { container } = render(
      <ErrorState
        error={new RequestAbortedError()}
        onRetry={() => undefined}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('DUX4-34 "Thử lại" gọi onRetry đúng một lần; không có onRetry thì không có nút', () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <ErrorState error={new TimeoutError()} onRetry={onRetry} />,
    );
    const retry = screen.getByRole('button', { name: 'Thử lại' });
    expect(retry).toHaveAttribute('type', 'button');
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(<ErrorState error={new TimeoutError()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('DUX4-35 KHÔNG cướp focus: ô nhập đang có focus vẫn giữ khi khối lỗi hiện ra', () => {
    const { rerender } = render(
      <>
        <input aria-label="Ô đang gõ" />
        <div />
      </>,
    );
    const input = screen.getByLabelText('Ô đang gõ');
    input.focus();

    rerender(
      <>
        <input aria-label="Ô đang gõ" />
        <ErrorState error={new NetworkError()} onRetry={() => undefined} />
      </>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Ô đang gõ')).toHaveFocus();
  });

  it('DUX4-36 cùng một lỗi thì khối nhỏ và màn 500 dùng CÙNG icon và tiêu đề (một nguồn ERROR_VARIANTS)', () => {
    for (const { error, title } of CASES) {
      const compact = render(<ErrorState error={error} />);
      const compactIcon = compact.container
        .querySelector('svg')
        ?.getAttribute('class');
      expect(compactIcon).toBeTruthy();
      expect(within(compact.container).getByText(title)).toBeInTheDocument();
      compact.unmount();

      const page = render(
        <MemoryRouter>
          <ServerErrorCard error={error} />
        </MemoryRouter>,
      );
      expect(
        page.container.querySelector('main svg')?.getAttribute('class'),
      ).toContain(
        (compactIcon ?? '').split(' ').find((c) => c.startsWith('lucide-')) ??
          'không-có-lớp-lucide',
      );
      expect(
        within(page.container).getByRole('heading', { name: title }),
      ).toBeInTheDocument();
      page.unmount();
    }
  });
});
