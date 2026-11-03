import { renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { usePageActive } from './use-page-active';

// Task F4, D13. Mã ca PA-nn là [đề xuất].
describe('usePageActive', () => {
  it('PA-01 đang gắn thì true, gỡ thì false', () => {
    const { result, unmount } = renderHook(() => usePageActive());
    expect(result.current.current).toBe(true);
    unmount();
    expect(result.current.current).toBe(false);
  });

  it('PA-02 StrictMode (effect chạy, dọn, chạy lại) vẫn true khi đang gắn', () => {
    const { result, unmount } = renderHook(() => usePageActive(), {
      wrapper: StrictMode,
    });
    expect(result.current.current).toBe(true);
    unmount();
    expect(result.current.current).toBe(false);
  });
});
