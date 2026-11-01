import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { LoadingState } from '../shared/ui/loading-state';

export type AccessDecision = 'checking' | 'allowed' | 'denied';

interface AccessGateProps {
  decision: AccessDecision;
  denied: ReactNode;
}

// Cổng thuần: không biết gì về đăng nhập hay vai trò, chỉ render theo quyết định được truyền vào. Cả hai prop đều bắt buộc,
// không có mặc định, nên không thể vô tình tạo cổng "luôn cho qua". Quyền thật vẫn do API kiểm.
export function AccessGate({ decision, denied }: AccessGateProps) {
  if (decision === 'allowed') return <Outlet />;
  if (decision === 'checking') return <LoadingState />;
  return denied;
}
