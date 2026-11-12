import { useCallback, useState } from 'react';
import { useRemote } from '../../../../../shared/hooks/use-remote';
import { getPatientAppointment } from '../api/patient-appointment-detail-api';
import type { PatientAppointmentDetail } from '../api/patient-appointment-types';

// Hook của trang chi tiết (booking F2): tải bằng `useRemote` và GIỮ DỮ LIỆU CŨ khi tải lại. `useRemote` không giữ: `retry()` là `loading` ngay, mà hộp huỷ (đang
// hiện lỗi 409 hay "chưa rõ" kèm `Tải lại chi tiết`) nằm trong trang nên không được gỡ đi lúc tải lại. Cùng mẫu "state từ lần render trước" của React như
// `use-appointment-list.ts` của F1 (TECH_DEBT: nâng lên `shared/hooks/` khi có người dùng thứ ba).

// `loading`: lần tải đầu. `ready` + `refreshing`: đang tải lại, vẫn hiện bản trước (kèm `aria-busy`).
export type DetailView =
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown }
  | { kind: 'ready'; detail: PatientAppointmentDetail; refreshing: boolean };

export function useAppointmentDetail(maLichHen: string) {
  const { state, retry } = useRemote(
    (signal) => getPatientAppointment(maLichHen, signal),
    [maLichHen],
  );

  // Bản `ready` gần nhất, cập nhật NGAY trong lúc render (không `setState` trong effect)
  const [lastReady, setLastReady] = useState<PatientAppointmentDetail | null>(
    null,
  );
  if (state.status === 'ready' && state.data !== lastReady) {
    setLastReady(state.data);
  }

  // Vừa huỷ xong (200): trang đổi sang `DaHuy` TẠI CHỖ từ kết quả của máy chủ, không GET lại (Đại duyệt 12/11/2026, câu (c)). Nếu sau đó tải lại mà bản mới
  // vẫn là trạng thái cũ (không xảy ra với máy chủ thật) thì vẫn hiện `DaHuy`; bản mới đã là `DaHuy` thì dùng nguyên bản mới.
  const [cancelled, setCancelled] = useState(false);
  const markCancelled = useCallback(() => setCancelled(true), []);

  let view: DetailView;
  if (state.status === 'ready') {
    view = { kind: 'ready', detail: state.data, refreshing: false };
  } else if (state.status === 'error') {
    view = { kind: 'error', error: state.error };
  } else if (lastReady === null) {
    view = { kind: 'loading' };
  } else {
    view = { kind: 'ready', detail: lastReady, refreshing: true };
  }
  if (view.kind === 'ready' && cancelled && view.detail.trangThai !== 'DaHuy') {
    view = {
      ...view,
      detail: { ...view.detail, trangThai: 'DaHuy', choPhepHuy: false },
    };
  }

  return { view, reload: retry, markCancelled };
}
