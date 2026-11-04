// Kho "chi nhánh đang chọn" dùng chung (PLAN search Q7). Đặt ở shared/ vì booking, nhắn tin cũng đọc và features/ không được import chéo.
// Chỉ lưu `{ chiNhanhId | null, nguon }` — KHÔNG lưu toạ độ người dùng (H9). `chiNhanhId = null` nghĩa là "Toàn quốc".

export type BranchSource = 'DinhVi' | 'NguoiDung';

export interface BranchSelection {
  chiNhanhId: string | null;
  nguon: BranchSource;
}

export const SELECTED_BRANCH_STORAGE_KEY = 'clinix.chiNhanhDangChon';

const ID_PATTERN = /^[1-9]\d{0,18}$/;

// Giá trị hiện tại giữ trong bộ nhớ: `localStorage` có thể ném lỗi (chế độ riêng tư, bị chặn) hoặc đầy, khi đó vẫn dùng được trong phiên (H10).
let current: BranchSelection | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): BranchSelection | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { chiNhanhId, nguon } = value as Record<string, unknown>;
    const idOk =
      chiNhanhId === null ||
      (typeof chiNhanhId === 'string' && ID_PATTERN.test(chiNhanhId));
    if (!idOk || (nguon !== 'DinhVi' && nguon !== 'NguoiDung')) return null;
    return { chiNhanhId, nguon } as BranchSelection;
  } catch {
    return null;
  }
}

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    current = parse(window.localStorage.getItem(SELECTED_BRANCH_STORAGE_KEY));
  } catch {
    current = null;
  }
}

/** `null` = chưa từng chọn (kể cả khi dữ liệu đã lưu bị hỏng). */
export function getSelectedBranch(): BranchSelection | null {
  load();
  return current;
}

export function setSelectedBranch(selection: BranchSelection): void {
  load();
  current = { chiNhanhId: selection.chiNhanhId, nguon: selection.nguon };
  try {
    window.localStorage.setItem(
      SELECTED_BRANCH_STORAGE_KEY,
      JSON.stringify(current),
    );
  } catch {
    // Không ghi được thì giữ trong bộ nhớ; trang vẫn hoạt động
  }
  listeners.forEach((listener) => listener());
}

export function subscribeSelectedBranch(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Chỉ cho test: quên giá trị trong bộ nhớ để lần đọc sau nạp lại từ `localStorage`. */
export function resetSelectedBranchForTest(): void {
  current = null;
  loaded = false;
  listeners.clear();
}
