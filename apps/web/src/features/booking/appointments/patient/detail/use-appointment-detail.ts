import { useCallback, useState } from 'react';
import { useRemote } from '../../../../../shared/hooks/use-remote';
import { useKeepPrevious } from '../../common/use-keep-previous';
import { getPatientAppointment } from '../api/patient-appointment-detail-api';
import type { PatientAppointmentDetail } from '../api/patient-appointment-types';

// Hook của trang chi tiết (booking F2): tải bằng `useRemote` và GIỮ DỮ LIỆU CŨ khi tải lại. `useRemote` không giữ: `retry()` là `loading` ngay, mà hộp huỷ (đang
// hiện lỗi 409 hay "chưa rõ" kèm `Tải lại chi tiết`) nằm trong trang nên không được gỡ đi lúc tải lại. Phần giữ dùng chung ở `common/use-keep-previous.ts`
// (F8, trả TECH_DEBT dòng 112); ở đây còn phần riêng: đổi sang `DaHuy` tại chỗ sau khi huỷ xong.

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

  const kept = useKeepPrevious(state);

  // Vừa huỷ xong (200): trang đổi sang `DaHuy` TẠI CHỖ từ kết quả của máy chủ, không GET lại (Đại duyệt 12/11/2026, câu (c)). Nếu sau đó tải lại mà bản mới
  // vẫn là trạng thái cũ (không xảy ra với máy chủ thật) thì vẫn hiện `DaHuy`; bản mới đã là `DaHuy` thì dùng nguyên bản mới.
  const [cancelled, setCancelled] = useState(false);
  const markCancelled = useCallback(() => setCancelled(true), []);

  // `kept` có thêm `previous` ở nhánh lỗi mà trang chi tiết không dùng: lỗi thì chỉ hiện lỗi (như trước khi nâng hook)
  let view: DetailView =
    kept.kind === 'error'
      ? { kind: 'error', error: kept.error }
      : kept.kind === 'ready'
        ? { kind: 'ready', detail: kept.data, refreshing: kept.refreshing }
        : kept;
  if (view.kind === 'ready' && cancelled && view.detail.trangThai !== 'DaHuy') {
    view = {
      ...view,
      detail: { ...view.detail, trangThai: 'DaHuy', choPhepHuy: false },
    };
  }

  return { view, reload: retry, markCancelled };
}
