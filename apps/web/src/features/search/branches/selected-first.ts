import type { BranchSummary } from '../api/search-types';

// Chi nhánh đang chọn xếp đầu, còn lại giữ thứ tự của API (tên, id) — Q5.
export function selectedFirst(
  items: readonly BranchSummary[],
  selectedId: string | null,
): BranchSummary[] {
  if (selectedId === null) return [...items];
  return [
    ...items.filter((item) => item.chiNhanhId === selectedId),
    ...items.filter((item) => item.chiNhanhId !== selectedId),
  ];
}
