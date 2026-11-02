import type { ReactNode } from 'react';
import type { AdminMe } from './admin-me';
import { AdminMeContext } from './admin-me-context-core';

export function AdminMeProvider({
  value,
  children,
}: {
  value: AdminMe;
  children: ReactNode;
}) {
  return (
    <AdminMeContext.Provider value={value}>{children}</AdminMeContext.Provider>
  );
}
