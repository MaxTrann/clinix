import { useState } from 'react';
import type { RemoteState } from '../../../../shared/hooks/use-remote';

// Giữ kết quả cũ trong lúc tải lại (booking F8, trả TECH_DEBT dòng 108 và 112: hai bản chép ở F1 `use-appointment-list.ts` và F2 `use-appointment-detail.ts`, bản
// thứ ba là danh sách của Lễ tân). `useRemote` KHÔNG giữ: đổi `deps` hay `retry()` là `loading` ngay, nên bảng nhấp nháy về "Đang tải" và một hộp đang hiện lỗi
// trong trang bị gỡ đi. Hook này bọc `RemoteState` của `useRemote` và giữ kết quả `ready` gần nhất.
//
//  - `loading`: lần tải đầu, chưa có gì để hiện.
//  - `ready` + `refreshing`: dữ liệu của truy vấn hiện tại (`refreshing: false`), hoặc dữ liệu CŨ trong lúc truy vấn mới đang tải (`refreshing: true`, nơi gọi gắn `aria-busy`).
//  - `error`: kèm `previous` (kết quả `ready` gần nhất, `null` nếu chưa có) để nơi gọi quyết định vẫn hiện bản cũ, ví dụ danh sách khi API từ chối từ khoá.
//
// `shouldKeep` trả `false` cho một kết quả `ready` KHÔNG được coi là dữ liệu: nó không được hiện và không được giữ làm dữ liệu cũ. Ví dụ trang vượt cuối của danh sách
// (200 rỗng mà `total` còn lớn): giữ nó thì lúc tải trang cuối đúng sẽ nháy câu "chưa có lịch hẹn nào". Kết quả bị bỏ được coi như đang tải.
//
// Bản `ready` gần nhất được cập nhật NGAY trong lúc render (mẫu "state từ lần render trước" của React), không `setState` trong effect, nên không có lần vẽ trung gian.
export type KeepPreviousView<T> =
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown; previous: T | null }
  | { kind: 'ready'; data: T; refreshing: boolean };

export function useKeepPrevious<T>(
  state: RemoteState<T>,
  shouldKeep: (data: T) => boolean = () => true,
): KeepPreviousView<T> {
  // Bọc trong đối tượng để dữ liệu có là hàm thì `setState` cũng không coi nó là hàm cập nhật
  const [previous, setPrevious] = useState<{ data: T } | null>(null);
  const fresh = state.status === 'ready' && shouldKeep(state.data);
  if (state.status === 'ready' && fresh && state.data !== previous?.data) {
    setPrevious({ data: state.data });
  }

  if (state.status === 'ready' && fresh) {
    return { kind: 'ready', data: state.data, refreshing: false };
  }
  if (state.status === 'error') {
    return {
      kind: 'error',
      error: state.error,
      previous: previous === null ? null : previous.data,
    };
  }
  return previous === null
    ? { kind: 'loading' }
    : { kind: 'ready', data: previous.data, refreshing: true };
}
