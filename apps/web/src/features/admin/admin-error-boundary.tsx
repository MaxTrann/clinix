import { useRouteError } from 'react-router';
import { ErrorState } from '../../shared/ui/error-state';

export function AdminErrorBoundary() {
  const error = useRouteError();

  return (
    <main>
      <h1>Không thể tải trang quản trị</h1>
      <ErrorState error={error} />
    </main>
  );
}
