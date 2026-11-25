import { useRemote } from '../../../../../shared/hooks/use-remote';
import { useKeepPrevious } from '../use-keep-previous';
import type { RescheduleRequestsApi } from './request-types';

// Hook của trang chi tiết một yêu cầu đổi lịch (reschedule F4; nếp `use-reception-detail.ts`): tải bằng `useRemote` và GIỮ BẢN CŨ khi tải lại (`useKeepPrevious`), để sau khi Pha B tải lại chi tiết vì
// một lỗi 409 mà hộp đang mở không bị gỡ đi. `loading`: lần tải đầu. `ready` + `refreshing`: đang tải lại. Đổi `yeuCauId` thì trang bị dựng lại (nơi gọi đặt `key`), nên bản cũ của yêu cầu khác
// không bao giờ hiện cho yêu cầu mới. Chỉ ĐỌC.
export function useRequestDetail(api: RescheduleRequestsApi, yeuCauId: string) {
  const { state, retry } = useRemote(
    (signal) => api.get(yeuCauId, signal),
    [yeuCauId],
  );
  return { view: useKeepPrevious(state), reload: retry };
}
