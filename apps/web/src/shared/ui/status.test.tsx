import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../api/errors';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { LoadingState } from './loading-state';
import { OfflineBanner } from './offline-banner';

// Task P6. Mã ca WS-nn là [đề xuất]. Test chỉ dựa vào vai trò và nội dung, không dựa vào tên class (quyết định 10).
const GENERIC = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';

describe('LoadingState, EmptyState', () => {
  it('WS-60 LoadingState có role status', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải');
  });

  it('WS-61 EmptyState hiện câu truyền vào', () => {
    render(<EmptyState message="Chưa có lịch khám." />);
    expect(screen.getByText('Chưa có lịch khám.')).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('WS-62 mất mạng dùng câu riêng', () => {
    render(<ErrorState error={new NetworkError()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
    );
  });

  it('WS-63 timeout dùng câu riêng', () => {
    render(<ErrorState error={new TimeoutError()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.',
    );
  });

  it('WS-64 lỗi khác dùng câu chung, không hiện chi tiết kỹ thuật', () => {
    const { rerender } = render(
      <ErrorState error={new UnexpectedResponseError(502)} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(GENERIC);
    expect(screen.getByRole('alert')).not.toHaveTextContent('502');

    rerender(
      <ErrorState
        error={
          new ApiError(500, {
            maLoi: 'LOI_HE_THONG',
            thongBao: 'bí mật',
            requestId: 'r-1',
          })
        }
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(GENERIC);
    expect(screen.getByRole('alert')).not.toHaveTextContent('LOI_HE_THONG');
    expect(screen.getByRole('alert')).not.toHaveTextContent('r-1');
  });

  it('WS-65 yêu cầu bị huỷ thì không hiện gì', () => {
    const { container } = render(
      <ErrorState
        error={new RequestAbortedError()}
        onRetry={() => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('WS-66 nút Thử lại gọi onRetry; không có onRetry thì không có nút', () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <ErrorState error={new NetworkError()} onRetry={onRetry} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(<ErrorState error={new NetworkError()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('OfflineBanner', () => {
  function setOnline(value: boolean) {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(value);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('WS-67 đang có mạng thì không hiện', () => {
    setOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('WS-68 hiện khi offline ngay từ đầu', () => {
    setOnline(false);
    render(<OfflineBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng',
    );
  });

  it('WS-69 phản ứng theo sự kiện offline và online', () => {
    setOnline(true);
    render(<OfflineBanner />);

    setOnline(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('WS-70 gỡ listener khi unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    setOnline(true);
    const { unmount } = render(<OfflineBanner />);
    unmount();
    expect(remove).toHaveBeenCalledWith('online', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
