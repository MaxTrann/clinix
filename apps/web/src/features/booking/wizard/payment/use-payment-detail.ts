import { useRemote } from '../../../../shared/hooks/use-remote';
import { useKeepPrevious } from '../../appointments/common/use-keep-previous';
import { getPatientAppointment } from '../../appointments/patient/api/patient-appointment-detail-api';
import type { PatientAppointmentDetail } from '../../appointments/patient/api/patient-appointment-types';
import { clockOffsetMs } from './hold-countdown';

// Dữ liệu một lần tải của trang Thanh toán: chi tiết lịch hẹn + chênh đồng hồ máy chủ so với máy ĐO LÚC DỮ LIỆU VỀ + số thứ tự lần tải (làm `key` để mỗi lần tải lại là một đồng hồ mới).
export interface PaymentDetailData {
  detail: PatientAppointmentDetail;
  offsetMs: number;
  serial: number;
}

export type PaymentDetailView =
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown }
  | { kind: 'ready'; data: PaymentDetailData; refreshing: boolean };

// Số thứ tự tăng ở MỖI lần tải xong (không phải lúc render): chỉ cần khác nhau giữa hai lần tải liên tiếp để `key` đổi
let loadSerial = 0;

// Hook tải của trang Thanh toán (booking F6): `GET /patient/appointments/:maLichHen` bằng `useRemote` + `useKeepPrevious` (như `useAppointmentDetail` của F2) nhưng ghi thêm chênh đồng hồ.
// Không dùng thẳng `useAppointmentDetail` vì nó chỉ trả `detail`: mốc giờ máy phải lấy ở đây, lúc dữ liệu về, chứ không lúc render (luật `react-hooks/purity`) và không trong effect
// (`set-state-in-effect`). Không lưu gì ở trình duyệt: tải lại trang là GET lại (WZ-09).
//  - `useKeepPrevious` giữ dữ liệu CŨ khi mã đổi, nên nơi gắn (`steps/payment-step.tsx`) PHẢI bọc `key={maLichHen}`.
//  - `refreshing` = đang tải lại sau khi đồng hồ về 0 (nơi gọi gắn `aria-busy`).
export function usePaymentDetail(maLichHen: string) {
  const { state, retry } = useRemote(
    async (signal) => {
      const detail = await getPatientAppointment(maLichHen, signal);
      loadSerial += 1;
      return {
        detail,
        offsetMs: clockOffsetMs(detail.thoiGianMayChu, Date.now()),
        serial: loadSerial,
      };
    },
    [maLichHen],
  );
  const kept = useKeepPrevious(state);

  // Lỗi thì chỉ hiện lỗi (kèm `Thử lại`), không hiện bản cũ: như trang chi tiết và Bước 6
  const view: PaymentDetailView =
    kept.kind === 'error' ? { kind: 'error', error: kept.error } : kept;
  return { view, reload: retry };
}
