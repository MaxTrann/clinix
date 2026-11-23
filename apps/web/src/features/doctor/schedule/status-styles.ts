import type { ShiftStatus } from '../../../shared/schedule/shift-labels';

// Màu theo trạng thái của CA (Figma `466:2`, WL-02; đổi ở doctor UX3, G16, T6). Chữ dùng bậc đậm để đạt tương phản ≥ 4,5:1 trên nền nhạt (ADR 0004, mục "Màu trạng thái lịch làm việc
// và yêu cầu nghỉ phép"; `status-colors.test.tsx` tính từ token thật):
// - "Nghỉ đã duyệt" TRUNG TÍNH (slate): đỏ trông như bị từ chối. Nền `slate-200`, không phải bậc 100, vì bậc 100 cùng độ chói với chấm "Không có lịch" (gray-100) ở lịch Lễ tân.
// - "Yêu cầu bị từ chối" đỏ nhạt: ca vẫn làm việc, chỉ yêu cầu nghỉ bị từ chối.
// Chip trạng thái của YÊU CẦU nghỉ (Đã duyệt, Chờ duyệt, Từ chối) KHÔNG đọc bảng này: nó dùng `components/status-badge` (xanh lá, vàng, đỏ) ở mọi màn.
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
    cell: 'border-slate-400 bg-slate-200 text-slate-800 hover:bg-slate-300',
    chip: 'border-slate-400 bg-slate-200 text-slate-800',
    dot: 'border-slate-500 bg-slate-200',
  },
  ChoDuyet: {
    cell: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
    chip: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'border-amber-300 bg-amber-50',
  },
  TuChoi: {
    cell: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
    chip: 'border-red-200 bg-red-50 text-red-700',
    dot: 'border-red-300 bg-red-50',
  },
};
