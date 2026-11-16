import { useEffect, type RefObject } from 'react';

// Đưa focus vào ô lỗi ĐẦU TIÊN (phần tử `aria-invalid="true"` đứng đầu trong DOM của `containerRef`) mỗi khi `signal` đổi sang một giá
// trị "có" (admin PR2 mục 6.2). `signal` là bộ đếm lần bấm lưu hỏng (0 = chưa lần nào) hoặc `feedback` MỚI của máy chủ (null = chưa có).
// CỐ Ý chỉ chạy khi `signal` đổi: render lại vì lý do khác, hay người dùng đang gõ ở ô khác, không được kéo focus về ô lỗi (điều kiện B
// của phiên kiểm). Không cuộn nhảy trang: chỉ cuộn đủ để ô lộ ra (`block: 'nearest'`).
export function useFocusFirstInvalid(
  containerRef: RefObject<HTMLElement | null>,
  signal: unknown,
): void {
  useEffect(() => {
    if (!signal) return;
    const target = containerRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    if (!target) return;
    target.focus({ preventScroll: true });
    if (typeof target.scrollIntoView === 'function')
      target.scrollIntoView({ block: 'nearest' });
  }, [containerRef, signal]);
}
