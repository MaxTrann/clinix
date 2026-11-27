import type {
  SpecialtyOption,
  SuggestParams,
  SuggestShift,
  Suggestion,
} from '../api/chatbot-types';
import type { SuggestError } from './suggest-errors';

// Kiểu trạng thái của thẻ gợi ý (chatbot F2; sơ đồ ở TRACKING 3.9). Hàm thuần, không gọi mạng.

// Lựa chọn của người dùng. `ngay` và `ca` là `null` khi chưa chọn (máy chủ tự chọn ngày sớm nhất, mọi ca).
export interface Selection {
  chuyenKhoaId: string | null;
  ngay: string | null;
  ca: SuggestShift | null;
}

// Lựa chọn đã có chuyên khoa: điều kiện để gọi API
export interface ActiveSelection extends Selection {
  chuyenKhoaId: string;
}

export const EMPTY_SELECTION: Selection = {
  chuyenKhoaId: null,
  ngay: null,
  ca: null,
};

export type SuggestView =
  // Chưa chọn chuyên khoa: không có lời gọi nào
  | { kind: 'idle' }
  | { kind: 'loading' }
  // `data.bacSi` không rỗng
  | { kind: 'result'; data: Suggestion }
  // `data.bacSi` rỗng (A5): `data.lyDoRong` cho biết lý do
  | { kind: 'empty'; data: Suggestion }
  | { kind: 'error'; error: SuggestError };

// Danh sách "Chọn chuyên khoa khác": tải một lần khi mở lần đầu, giữ lại khi đóng
export interface SpecialtyListState {
  open: boolean;
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: SpecialtyOption[];
  error: SuggestError | null;
}

export const INITIAL_LIST: SpecialtyListState = {
  open: false,
  status: 'idle',
  items: [],
  error: null,
};

export function viewOf(data: Suggestion): SuggestView {
  return data.bacSi.length > 0
    ? { kind: 'result', data }
    : { kind: 'empty', data };
}

// Tham số gửi máy chủ: tham số vắng thì BỎ (không gửi `null`). `chiNhanhId` do nơi gọi đọc LÚC GỌI từ `getSelectedBranch()`.
export function paramsOf(
  selection: ActiveSelection,
  chiNhanhId: string | null,
): SuggestParams {
  return {
    chuyenKhoaId: selection.chuyenKhoaId,
    ...(chiNhanhId !== null ? { chiNhanhId } : {}),
    ...(selection.ngay !== null ? { ngay: selection.ngay } : {}),
    ...(selection.ca !== null ? { ca: selection.ca } : {}),
  };
}

// Bấm lại ô đang chọn thì bỏ chọn (ngày và ca bỏ chọn được; Đại duyệt 27/11/2026)
export function toggled<T>(current: T | null, value: T): T | null {
  return current === value ? null : value;
}
