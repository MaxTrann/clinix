import type { AdminMe } from './admin-me';

export type AdminRoutePolicy = 'Any' | 'ToanHeThong';

export function canAccessAdminPolicy(
  adminMe: AdminMe,
  policy: AdminRoutePolicy,
): boolean {
  return policy === 'Any' || adminMe.phamVi === 'ToanHeThong';
}
