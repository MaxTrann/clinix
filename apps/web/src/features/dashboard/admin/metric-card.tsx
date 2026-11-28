import type { LucideIcon } from 'lucide-react';

// Thẻ số của trang Tổng quan (Figma `507:338` KpiCard): ô biểu tượng màu nhạt, nhãn nhỏ, số đậm, dòng giải thích. Là một mục `<li>` có tiêu đề để
// trình đọc màn hình đọc theo cặp "nhãn: số" (PLAN 5.11). Kích thước Figma (13,125; 11,25; 18,75 px) là bản thu 0,9375 lần nên dùng thang Tailwind gần nhất.

export type MetricTone =
  'blue' | 'cyan' | 'red' | 'indigo' | 'emerald' | 'orange';

// Lớp HẰNG (Tailwind chỉ sinh lớp viết nguyên văn trong mã, không ghép chuỗi)
const TONE_CLASS: Record<MetricTone, string> = {
  blue: 'bg-blue-50 text-blue-600',
  cyan: 'bg-cyan-50 text-cyan-600',
  red: 'bg-red-50 text-red-500',
  indigo: 'bg-indigo-50 text-indigo-500',
  emerald: 'bg-emerald-50 text-emerald-600',
  orange: 'bg-orange-50 text-orange-500',
};

export interface MetricCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: MetricTone;
  /** Dòng giải thích mẫu số hay số khoản (R5) */
  note?: string;
  /** Dòng cảnh báo màu đỏ (khoản hoàn đang lỗi) */
  warning?: string;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
  note,
  warning,
}: MetricCardProps) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl ${TONE_CLASS[tone]}`}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <h3 className="text-xs font-normal text-gray-500">{label}</h3>
        <p className="mt-1 text-xl font-bold text-text-primary">{value}</p>
        {note && <p className="mt-1 text-xs text-text-muted">{note}</p>}
        {warning && (
          <p className="mt-1 text-xs font-medium text-danger">{warning}</p>
        )}
      </div>
    </li>
  );
}
