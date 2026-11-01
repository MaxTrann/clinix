import { Outlet } from 'react-router';
import { AdminForbiddenPage } from './admin-forbidden-page';
import type { AdminRoutePolicy } from './admin-scope-policy';
import { canAccessAdminPolicy } from './admin-scope-policy';
import { useAdminScope } from './use-admin-scope';

export function AdminScopeGuard({ policy }: { policy: AdminRoutePolicy }) {
  const adminMe = useAdminScope();
  return canAccessAdminPolicy(adminMe, policy) ? (
    <Outlet />
  ) : (
    <AdminForbiddenPage />
  );
}
