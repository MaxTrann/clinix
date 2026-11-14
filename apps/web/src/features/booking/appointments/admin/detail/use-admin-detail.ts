import { useRemote } from '../../../../../shared/hooks/use-remote';
import { useKeepPrevious } from '../../common/use-keep-previous';
import { getAdminAppointment } from '../api/admin-appointment-detail-api';

// Hook của trang chi tiết (booking F10): tải bằng `useRemote` và GIỮ DỮ LIỆU CŨ khi tải lại (`common/use-keep-previous.ts`), để sau khi override mà hộp còn hiện thì trang không bị gỡ.
// `loading`: lần tải đầu. `ready` + `refreshing`: đang tải lại, vẫn hiện bản trước (kèm `aria-busy`). Đổi `maLichHen` thì trang bị dựng lại (nơi gọi đặt `key`), nên bản cũ của lịch khác
// không bao giờ hiện cho lịch mới.
export function useAdminDetail(maLichHen: string) {
  const { state, retry } = useRemote(
    (signal) => getAdminAppointment(maLichHen, signal),
    [maLichHen],
  );
  return { view: useKeepPrevious(state), reload: retry };
}
