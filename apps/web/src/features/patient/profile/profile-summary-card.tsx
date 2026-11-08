import { initialsOf } from './profile-format';

export interface ProfileSummaryCardProps {
  name: string;
  // Dòng dưới tên, ví dụ "Lễ tân · CLINIX Chi nhánh Quận 3"
  subtitle: string;
  // Nhãn trạng thái dưới dòng phụ (ví dụ "Đang hoạt động"); không truyền thì không có nhãn
  statusLabel?: string;
}

// Thẻ đầu của trang "Thông tin cá nhân" (patient F4; frame `503:2`, `504:2`): avatar chữ viết tắt, tên, dòng phụ, nhãn trạng thái.
// Tên trung tính để trang Quản trị viên (F5) dùng lại. Không biểu tượng máy ảnh: ảnh đại diện hoãn (Q4 = A, TRACKING F3-K, F4-L).
// Màu: avatar chữ brand-strong trên cyan-100 đạt 4,71:1; dòng phụ brand-strong (Figma #0092b8 chỉ 3,62:1 trên trắng); nhãn theo
// ba token success (chữ trên nền nhạt 4,72:1), đúng màu Figma (ADR 0004).
export function ProfileSummaryCard({
  name,
  subtitle,
  statusLabel,
}: ProfileSummaryCardProps) {
  return (
    <div className="flex items-center gap-5 rounded-2xl border border-gray-200 bg-white px-6 py-5">
      <span
        aria-hidden="true"
        className="flex size-16 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xl font-bold text-brand-strong"
      >
        {initialsOf(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold break-words text-gray-900">{name}</p>
        <p className="pt-[0.125rem] text-sm break-words text-brand-strong">
          {subtitle}
        </p>
        {statusLabel && (
          // flex: nhãn là phần tử flex nên không có khoảng trống của dòng chữ, thẻ cao 108,2 px (Figma 108,98), không phải 110,4
          <p className="mt-[0.375rem] flex">
            <span className="inline-block rounded-full border border-success-line bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
              {statusLabel}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
