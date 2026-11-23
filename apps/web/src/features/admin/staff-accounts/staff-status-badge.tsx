import { formatStatus } from '../account-common/account-format';
import type { AccountStatus } from '../account-common/account-types';

// Chip trạng thái tài khoản nhân sự (admin F8). Luôn kèm chữ, không chỉ dựa vào màu. Màu theo token của ADR 0004:
// `success` trên `success-soft` 4,72:1, `warning` trên `warning-soft` 4,85:1, xám 600 trên xám 100.

const TONES: Record<AccountStatus, string> = {
  DangHoatDong: 'bg-success-soft text-success',
  ChoKichHoat: 'bg-warning-soft text-warning',
  NgungHoatDong: 'bg-gray-100 text-gray-600',
};

export function StaffStatusBadge({ status }: { status: string }) {
  const tone = Object.hasOwn(TONES, status)
    ? TONES[status as AccountStatus]
    : TONES.NgungHoatDong;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tone}`}
    >
      {formatStatus(status)}
    </span>
  );
}
