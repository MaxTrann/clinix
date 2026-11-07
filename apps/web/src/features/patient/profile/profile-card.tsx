import { Pencil } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
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

export interface InfoCell {
  label: string;
  // null hoặc undefined ⇒ "Chưa cập nhật"
  value: ReactNode;
}

// Lưới ô xem của thẻ (danh sách định nghĩa `dl`): dùng chung cho thẻ Bản thân (F3) và thẻ người thân (F6, TRACKING F6-B).
// Trường trống hiện "Chưa cập nhật" (gray-500 nghiêng: 4,84:1, Figma #bbb chỉ 1,92:1).
export function InfoGrid({ cells }: { cells: readonly InfoCell[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-[1.8667rem] gap-y-4 px-[1.6rem] py-[1.3333rem] sm:grid-cols-2 xl:grid-cols-3">
      {cells.map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs leading-normal font-semibold tracking-[0.04em] text-gray-500 uppercase">
            {label}
          </dt>
          <dd className="mt-1 text-[0.9333rem] leading-normal font-medium break-words text-gray-900">
            {value ?? (
              <span className="text-gray-500 italic">Chưa cập nhật</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export interface EditButtonProps {
  onClick: () => void;
  // Để trang trả focus về nút sau khi lưu hoặc "Hủy"
  buttonRef?: Ref<HTMLButtonElement>;
  // Tên truy cập khi trang có nhiều nút "Chỉnh sửa" (thẻ người thân: "Chỉnh sửa hồ sơ {họ tên}"); bắt đầu bằng chữ hiện trên nút
  accessibleName?: string;
}

// Nút "Chỉnh sửa" ở đầu thẻ (frame `416:2`)
export function EditButton({
  onClick,
  buttonRef,
  accessibleName,
}: EditButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label={accessibleName}
      className="flex min-h-[2.4rem] items-center justify-center gap-[0.4rem] rounded-lg border border-gray-200 bg-white px-[0.9333rem] text-sm leading-normal font-medium text-gray-600 transition-colors hover:bg-gray-50"
    >
      <Pencil className="size-3.5" aria-hidden="true" />
      Chỉnh sửa
    </button>
  );
}
