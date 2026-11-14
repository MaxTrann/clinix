import { useRemote } from '../../../../../shared/hooks/use-remote';
import { useKeepPrevious } from '../../common/use-keep-previous';
import { getDoctorAppointment } from '../api/doctor-appointment-detail-api';

// Hook của trang chi tiết (booking F11): tải bằng `useRemote` và GIỮ DỮ LIỆU CŨ khi tải lại (`common/use-keep-previous.ts`; `Thử lại` không đưa trang về "Đang tải"). `loading`: lần tải đầu. `ready` + `refreshing`:
// đang tải lại, vẫn hiện bản trước (kèm `aria-busy`). Đổi `maLichHen` thì trang bị dựng lại (nơi gọi đặt `key`), nên bản cũ của lịch khác không bao giờ hiện cho lịch mới (bài học M18 của F7).
export function useDoctorDetail(maLichHen: string) {
  const { state, retry } = useRemote(
    (signal) => getDoctorAppointment(maLichHen, signal),
    [maLichHen],
  );
  return { view: useKeepPrevious(state), reload: retry };
}
