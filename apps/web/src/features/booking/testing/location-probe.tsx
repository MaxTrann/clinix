import { useLocation } from 'react-router';

// Hiện URL hiện tại của router để test đọc (booking F1, LHL-19: bộ lọc và từ khoá không được lọt vào URL). Chỉ test dùng; tách file riêng vì
// `react-refresh/only-export-components` không cho một file vừa xuất component vừa xuất hàm khác.
export function LocationProbe() {
  const { pathname, search, hash } = useLocation();
  return <output data-testid="url">{`${pathname}${search}${hash}`}</output>;
}
