import { Link, useRouteError } from 'react-router';
import { ErrorState } from '../shared/ui/error-state';

// Thay trang lỗi mặc định của router, vốn hiện cả stack
export function RouteErrorPage() {
  const error = useRouteError();
  return (
    <main>
      <ErrorState error={error} />
      <Link to="/">Về trang chủ</Link>
    </main>
  );
}
