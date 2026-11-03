import { Stethoscope } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

// Khung thẻ của các màn xác thực (Figma nhóm Xác thực). Đặt ở shared vì `features/` không import chéo mà trang kích hoạt của admin cũng cần.
export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <main className="flex min-h-screen items-start justify-center overflow-y-auto bg-linear-to-br from-brand-soft to-teal-50 px-4 py-8 sm:items-center">
      <div className="my-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="mb-6 inline-flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand">
              <Stethoscope className="size-5 text-white" aria-hidden="true" />
            </span>
            <span className="text-xl font-bold text-gray-900">CLINIX</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {/* `wrap-anywhere`: email dài không dấu cách trong phụ đề (màn nhập mã) làm trang cuộn ngang ở 320px, đo Chrome ở F4 (D14) */}
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500 wrap-anywhere">
              {subtitle}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          {children}
        </div>
      </div>
    </main>
  );
}
