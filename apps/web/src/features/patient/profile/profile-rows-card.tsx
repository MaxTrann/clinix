import { useId } from 'react';
import type { ReactNode } from 'react';
import type { InfoCell } from './profile-card';

export const NOT_UPDATED_LABEL = 'Chưa cập nhật';

export interface ProfileRowsCardProps {
  title: string;
  // Chỗ nút bên phải đầu thẻ (nút "Chỉnh sửa" ở chế độ xem; chế độ sửa không có)
  action?: ReactNode;
  children: ReactNode;
}

// Vỏ thẻ thông tin của trang "Thông tin cá nhân" (patient F4; frame `503:2`, `504:2`): đầu thẻ có tiêu đề (h2) và nút, rồi thân do nơi dùng
// truyền vào (`InfoRows` ở chế độ xem, `ProfileForm` ở chế độ sửa). `section` có `aria-labelledby` trỏ tiêu đề.
// Đầu thẻ cao tối thiểu 49,5 px (Figma) cho cả hai chế độ, nên thẻ không giật khi đổi chế độ.
export function ProfileRowsCard({
  title,
  action,
  children,
}: ProfileRowsCardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-gray-200 bg-white"
    >
      <div className="flex min-h-[3.3rem] items-center justify-between gap-3 border-b border-gray-100 px-5">
        <h2 id={headingId} className="text-sm font-semibold text-gray-900">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export interface InfoRowsProps {
  rows: readonly InfoCell[];
}

// Xem dạng hàng (danh sách định nghĩa `dl`): nhãn bên trái rộng 10rem (150 px của Figma), giá trị bên phải; dưới 640 px nhãn đứng trên giá trị.
// Giá trị trống (null, undefined) ⇒ "Chưa cập nhật", gray-500 4,84:1 (Figma #99a1af chỉ 2,60:1), không nghiêng như `503:2`.
export function InfoRows({ rows }: InfoRowsProps) {
  return (
    <dl className="px-5 py-3">
      {rows.map(({ label, value }) => (
        <div
          key={label}
          className="flex flex-col gap-1 border-b border-gray-100 py-2.5 last:border-b-0 sm:flex-row sm:gap-4"
        >
          <dt className="shrink-0 pt-px text-xs text-gray-500 sm:w-40">
            {label}
          </dt>
          <dd className="min-w-0 flex-1 text-sm font-medium break-words text-gray-900">
            {value ?? (
              <span className="text-gray-500">{NOT_UPDATED_LABEL}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
