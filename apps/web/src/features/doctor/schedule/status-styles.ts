import type { ShiftStatus } from '../../../shared/schedule/shift-labels';

// Màu theo trạng thái (Figma `466:2`, WL-02); chữ dùng bậc đậm (700) để đạt tương phản 4,5:1 trên nền nhạt (ADR 0004).
export const STATUS_STYLES: Record<
  ShiftStatus,
  { cell: string; chip: string; dot: string }
> = {
  LamViec: {
    cell: 'border-sky-300 bg-sky-50 text-brand-strong hover:bg-sky-100',
    chip: 'border-sky-300 bg-sky-50 text-brand-strong',
    dot: 'border-sky-400 bg-sky-50',
  },
  DaDuyet: {
    cell: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
    chip: 'border-red-200 bg-red-50 text-red-700',
    dot: 'border-red-300 bg-red-50',
  },
  ChoDuyet: {
    cell: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
    chip: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'border-amber-300 bg-amber-50',
  },
  TuChoi: {
    cell: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100',
    chip: 'border-orange-200 bg-orange-50 text-orange-700',
    dot: 'border-orange-300 bg-orange-50',
  },
};
