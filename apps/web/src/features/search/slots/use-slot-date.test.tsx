import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSlotDate } from './use-slot-date';

// search PR-C2, SLT-02 và SLT-78: ngày đang xem của trang. "Hôm nay" theo GIỜ VIỆT NAM (không theo UTC hay múi giờ máy), tính một lần khi trang gắn;
// ngày chỉ nằm trong state (không URL, không storage). Đồng hồ giả chỉ `Date`.
afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

function at(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

describe('useSlotDate', () => {
  it('SLT-02 hôm nay theo giờ Việt Nam: 16:59:59Z còn là 17/11, 17:00:00Z đã sang 18/11 (ngày UTC vẫn là 17)', () => {
    at('2026-11-17T16:59:59Z');
    expect(renderHook(() => useSlotDate()).result.current.today).toBe(
      '2026-11-17',
    );
    at('2026-11-17T17:00:00Z');
    const { result } = renderHook(() => useSlotDate());
    expect(result.current.today).toBe('2026-11-18');
    expect(result.current.date).toBe('2026-11-18');
    expect(result.current.dates[0]).toBe('2026-11-18');
    expect(result.current.dates).toHaveLength(7);
  });

  it('SLT-02 mặc định là hôm nay; đổi ngày giữ nguyên dải 7 ngày', () => {
    at('2026-11-17T03:00:00Z');
    const { result } = renderHook(() => useSlotDate());
    expect(result.current.date).toBe('2026-11-17');
    const before = result.current.dates;
    act(() => result.current.setDate('2026-11-20'));
    expect(result.current.date).toBe('2026-11-20');
    expect(result.current.today).toBe('2026-11-17');
    expect(result.current.dates).toBe(before);
  });

  it('SLT-02 "xem lịch hôm nay" tính lại hôm nay khi trang để mở qua nửa đêm và dựng lại dải', () => {
    at('2026-11-17T10:00:00Z');
    const { result } = renderHook(() => useSlotDate());
    act(() => result.current.setDate('2026-11-19'));
    at('2026-11-18T10:00:00Z');
    expect(result.current.today).toBe('2026-11-17');
    act(() => result.current.resetToToday());
    expect(result.current.today).toBe('2026-11-18');
    expect(result.current.date).toBe('2026-11-18');
    expect(result.current.dates[0]).toBe('2026-11-18');
    expect(result.current.dates[6]).toBe('2026-11-24');
  });

  it('SLT-78 đổi ngày KHÔNG ghi localStorage, sessionStorage hay URL', () => {
    at('2026-11-17T03:00:00Z');
    const search = window.location.search;
    // Theo dõi cả hai hàm đổi lịch sử: không phụ thuộc môi trường giả có cập nhật `location` hay không
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    const { result } = renderHook(() => useSlotDate());
    act(() => result.current.setDate('2026-11-21'));
    act(() => result.current.resetToToday());
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.location.search).toBe(search);
    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
