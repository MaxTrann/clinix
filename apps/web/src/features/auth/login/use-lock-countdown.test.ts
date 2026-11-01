import { act, renderHook } from '@testing-library/react';
import { formatCountdown, useLockCountdown } from './use-lock-countdown';

// Task F3. Mã ca LP-nn là [đề xuất]. Date KHÔNG nằm trong toFake ở ca chính: chứng minh đếm chạy theo mốc đơn điệu, không theo đồng hồ máy.
beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'performance'],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function started(seconds: number) {
  const view = renderHook(() => useLockCountdown());
  act(() => view.result.current.start(seconds));
  return view;
}

describe('formatCountdown', () => {
  it.each([
    [900, '15:00'],
    [599, '09:59'],
    [60, '01:00'],
    [59, '00:59'],
    [1, '00:01'],
    [0, '00:00'],
  ])('LP-40 %i giây là %s', (seconds, text) => {
    expect(formatCountdown(seconds)).toBe(text);
  });
});

describe('useLockCountdown', () => {
  it('LP-41 chưa khoá: còn 0 và không báo hết giờ', () => {
    const { result } = renderHook(() => useLockCountdown());
    expect(result.current.remaining).toBe(0);
    expect(result.current.expired).toBe(false);
  });

  it('LP-42 (DN-24) bắt đầu đúng số giây của phản hồi và giảm dần', () => {
    const { result } = started(900);
    expect(result.current.remaining).toBe(900);
    advance(1000);
    expect(result.current.remaining).toBe(899);
    advance(59_000);
    expect(result.current.remaining).toBe(840);
  });

  it('LP-43 làm tròn lên: còn phần lẻ của giây vẫn tính cả giây', () => {
    const { result } = started(2);
    advance(1250);
    expect(result.current.remaining).toBe(1);
    advance(500);
    expect(result.current.remaining).toBe(1);
  });

  it('LP-44 đổi đồng hồ máy không ảnh hưởng đếm ngược', () => {
    const { result } = started(100);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 3_600_000);
    advance(1000);
    expect(result.current.remaining).toBe(99);
  });

  it('LP-45 hết giờ: về 0, báo hết giờ và ngừng hẹn giờ', () => {
    const { result } = started(2);
    expect(result.current.expired).toBe(false);
    advance(1999);
    expect(result.current.remaining).toBe(1);
    expect(result.current.expired).toBe(false);
    advance(1);
    expect(result.current.remaining).toBe(0);
    expect(result.current.expired).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('LP-46 gỡ hook: dọn hẹn giờ và lắng nghe', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = started(100);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
  });

  it('LP-47 tab nền bị bóp hẹn giờ: quay lại tính đúng ngay', () => {
    const { result } = started(100);
    // Mốc đơn điệu chạy tiếp nhưng hẹn giờ chưa kịp nổ, như tab nền
    vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 30_000);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.remaining).toBe(70);
  });

  it('LP-48 tab nền quay lại khi đã quá hạn: mở khoá ngay', () => {
    const { result } = started(10);
    vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 30_000);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.remaining).toBe(0);
    expect(result.current.expired).toBe(true);
  });

  it('LP-49 khoá mới khi đang đếm: theo số mới, chỉ một hẹn giờ', () => {
    const { result } = started(100);
    advance(10_000);
    act(() => result.current.start(30));
    expect(result.current.remaining).toBe(30);
    expect(vi.getTimerCount()).toBe(1);
    advance(1000);
    expect(result.current.remaining).toBe(29);
  });

  it('LP-50 khoá mới sau khi hết giờ: xoá cờ hết giờ', () => {
    const { result } = started(1);
    advance(1000);
    expect(result.current.expired).toBe(true);
    act(() => result.current.start(5));
    expect(result.current.expired).toBe(false);
    expect(result.current.remaining).toBe(5);
  });
});
