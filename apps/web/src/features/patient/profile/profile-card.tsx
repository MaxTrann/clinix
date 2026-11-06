import type { ReactNode } from 'react';
import { initialsOf } from './profile-format';

export interface ProfileCardProps {
  name: string;
  // Nhãn dưới tên, ví dụ "Bản thân"; F4, F5 đổi chữ này
  badge: string;
  // Chỗ nút bên phải đầu thẻ (nút "Chỉnh sửa" ở chế độ xem; chế độ sửa không có)
  action?: ReactNode;
  children: ReactNode;
}

// Vỏ thẻ hồ sơ (frame `416:2`, `432:2`): avatar chữ viết tắt, tên, nhãn, đường kẻ, rồi phần thân do nơi dùng truyền vào.
// Không có biểu tượng máy ảnh: ảnh đại diện hoãn (Q4 = A), nút không làm gì là điều khiển chết (TRACKING F3-K).
// Màu theo token ADR 0004: chữ trắng trên brand-strong 5,28:1, brand-strong trên brand-soft 5,07:1 (Figma #49bce2 chỉ 2,19:1 và 2,05:1).
export function ProfileCard({
  name,
  badge,
  action,
  children,
}: ProfileCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-4 px-[1.6rem] py-[1.3333rem]">
        <span
          aria-hidden="true"
          className="flex size-[3.2rem] shrink-0 items-center justify-center rounded-full bg-brand-strong text-lg font-bold text-white"
        >
          {initialsOf(name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-normal font-bold break-words text-gray-900">
            {name}
          </p>
          <p className="mt-[3px]">
            <span className="inline-block rounded-full bg-brand-soft px-2.5 py-0.5 text-xs leading-normal font-semibold text-brand-strong">
              {badge}
            </span>
          </p>
        </div>
        {action}
      </div>
      <div className="border-t border-gray-100">{children}</div>
    </div>
  );
}
