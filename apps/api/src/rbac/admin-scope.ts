import type { AuthenticatedRequest } from '../auth/decorators/current-user.decorator.js';

export type AdminScope =
  | { readonly kind: 'ToanHeThong' }
  | { readonly kind: 'ChiNhanh'; readonly chiNhanhId: string };

export type AdminScopeRequirement = 'Any' | 'ToanHeThong';
export const ADMIN_SCOPE_KEY = 'rbac:admin-scope';
export type AdminScopeRequest = AuthenticatedRequest & {
  adminScope?: AdminScope;
};

export type AdminMe =
  | { phamVi: 'ToanHeThong' }
  | { phamVi: 'ChiNhanh'; chiNhanh: { id: string; ten: string } };
