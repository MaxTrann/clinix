import { useRemote } from '../../../../../shared/hooks/use-remote';
import { useKeepPrevious } from '../../common/use-keep-previous';
import { getReceptionAppointment } from '../api/reception-appointment-detail-api';

// Hook của ngăn chi tiết (booking F8): tải bằng `useRemote` và GIỮ DỮ LIỆU CŨ khi tải lại (`common/use-keep-previous.ts`), để F9 tải lại sau khi huỷ hay đánh vắng mặt
// mà hộp đang mở không bị gỡ đi. `loading`: lần tải đầu. `ready` + `refreshing`: đang tải lại, vẫn hiện bản trước (kèm `aria-busy`). Đổi `maLichHen` thì ngăn bị dựng lại
// (nơi gọi đặt `key`), nên bản cũ của lịch khác không bao giờ hiện cho lịch mới.
export function useReceptionDetail(maLichHen: string) {
  const { state, retry } = useRemote(
    (signal) => getReceptionAppointment(maLichHen, signal),
    [maLichHen],
  );
  return { view: useKeepPrevious(state), reload: retry };
}
