import type { RemoteState } from '../../../../shared/hooks/use-remote';
import { classifyListError } from './error-kinds';
import { useKeepPrevious } from './use-keep-previous';

// Hình dạng hiển thị của một trang danh sách có phân trang (booking F1 viết trong `patient/use-appointment-list.ts`, chuyển lên `common/` ở F8; Lễ tân dùng lại).
// Phần riêng của danh sách trên nền `useKeepPrevious`: trang vượt cuối và lỗi từ khoá.

// `loading`: lần tải đầu, chưa có gì để hiện. `ready` + `refreshing`: đang tải truy vấn mới, vẫn hiện dữ liệu của truy vấn trước (kèm `aria-busy`).
// `keywordRejected`: API từ chối từ khoá (400 `TU_KHOA_KHONG_HOP_LE`, lưới an toàn của luật ở client): giữ danh sách, báo dưới ô tìm.
export type ListView<T> =
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown }
  | {
      kind: 'ready';
      data: T;
      refreshing: boolean;
      keywordRejected: boolean;
    };

// Phần của một trang kết quả mà việc phân trang cần: `{ items, total, pageSize }` của `Paged<T>` ở backend
export interface PagedData {
  items: readonly unknown[];
  total: number;
  pageSize: number;
}

export function lastPageOf(data: PagedData): number {
  return Math.max(1, Math.ceil(data.total / data.pageSize));
}

// Trang vượt cuối: API trả 200 rỗng mà `total` vẫn đúng (ví dụ lịch bị huỷ ở nơi khác lúc đang xem trang 5). Trang `total` = 0 thì KHÔNG phải vượt cuối.
export function isBeyondLastPage(data: PagedData, page: number): boolean {
  return data.items.length === 0 && data.total > 0 && page > lastPageOf(data);
}

// `goToPage` được gọi KHI VẼ (như `dispatch` của `useReducer` trong lúc render) để về trang cuối còn dữ liệu. Mỗi bước giảm nghiêm ngặt (`page` lớn hơn trang
// cuối mới) nên không lặp vô hạn. Trang vượt cuối KHÔNG được giữ làm dữ liệu cũ: nếu giữ, lúc tải trang cuối đúng sẽ nháy câu "chưa có lịch hẹn nào".
export function useListView<T extends PagedData>(
  remote: RemoteState<T>,
  page: number,
  goToPage: (page: number) => void,
): ListView<T> {
  const kept = useKeepPrevious(remote, (data) => !isBeyondLastPage(data, page));

  let view: ListView<T>;
  if (kept.kind === 'error') {
    view =
      classifyListError(kept.error) === 'keyword' && kept.previous !== null
        ? {
            kind: 'ready',
            data: kept.previous,
            refreshing: false,
            keywordRejected: true,
          }
        : { kind: 'error', error: kept.error };
  } else if (kept.kind === 'ready') {
    view = { ...kept, keywordRejected: false };
  } else {
    view = kept;
  }

  if (remote.status === 'ready' && isBeyondLastPage(remote.data, page)) {
    goToPage(lastPageOf(remote.data));
  }
  return view;
}
