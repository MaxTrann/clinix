import { useCallback, useSyncExternalStore } from 'react';
import {
  getSelectedBranch,
  setSelectedBranch,
  subscribeSelectedBranch,
  type BranchSelection,
  type BranchSource,
} from './selected-branch-store';

export interface UseSelectedBranch {
  // null = chưa có lựa chọn nào (lần đầu vào trang)
  selection: BranchSelection | null;
  select: (chiNhanhId: string | null, nguon: BranchSource) => void;
}

/** Đọc/ghi chi nhánh đang chọn; mọi nơi dùng hook này tự cập nhật khi giá trị đổi. */
export function useSelectedBranch(): UseSelectedBranch {
  const selection = useSyncExternalStore(
    subscribeSelectedBranch,
    getSelectedBranch,
  );
  const select = useCallback(
    (chiNhanhId: string | null, nguon: BranchSource) =>
      setSelectedBranch({ chiNhanhId, nguon }),
    [],
  );
  return { selection, select };
}
