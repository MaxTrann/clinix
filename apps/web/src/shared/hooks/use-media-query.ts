import { useCallback, useSyncExternalStore } from 'react';

// `true` khi media query khớp, đổi theo sự kiện `change` của MediaQueryList (patient F11).
// Khung dùng hook này thay cho biến thể `lg:` của Tailwind: Vitest chạy `css: false`, nên hẹp/rộng phải do JS quyết định thì test mới kiểm được.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
  );
}
