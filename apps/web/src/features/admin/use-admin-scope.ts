import { useContext } from 'react';
import { AdminMeContext } from './admin-me-context-core';

export function useAdminScope() {
  const value = useContext(AdminMeContext);
  if (!value) throw new Error('AdminScopeGuard phải nằm trong AdminLayout');
  return value;
}
