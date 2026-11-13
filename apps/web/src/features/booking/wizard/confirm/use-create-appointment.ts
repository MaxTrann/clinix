import { useCallback, useEffect, useRef, useState } from 'react';
import { createAppointment } from '../../api/booking-service';
import type {
  CreateAppointmentBody,
  CreatedAppointment,
} from '../../api/booking-types';
import { describeCreateFailure, type CreateFailure } from './create-failure';

// Máy trạng thái của nút xác nhận ở Bước 5 (booking F5; TRACKING 3.34 F5-H). Một lần gọi `submit` = đúng MỘT `POST /booking/appointments`; KHÔNG BAO GIỜ tự gửi lại (đặt lịch không idempotent).
//   idle        chưa gửi
//   submitting  đang gửi: không bấm lại được
//   failed      bấm lại được: 503, lỗi lạ, khung giờ đang giữ (`retry`), hay CHƯA RÕ máy chủ đã tạo lịch chưa (`uncertain`: mạng, quá giờ, 201 sai hình dạng)
//   stopped     cùng yêu cầu sẽ cùng kết quả (`final`): chỉ còn rời đi sửa
//   done        tạo xong, đang chuyển trang: giữ khoá để không có lần gửi thứ hai trong lúc chuyển
// Khuôn của `useStatusAction` (F9), khác ở chỗ có `active` (người dùng rời trang thì không đặt state, không chuyển trang) và gợi ý sau một lần "chưa rõ".
export type CreateState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'failed'; failure: CreateFailure }
  | { kind: 'stopped'; failure: CreateFailure }
  | { kind: 'done' };

interface UseCreateAppointmentOptions {
  body: CreateAppointmentBody;
  // `usePageActive()` của nơi gọi: `current` là false khi trang đã bị gỡ. Kiểm SAU `await` (WZ-13), trước khi đặt state hay gọi `onCreated`
  active: { readonly current: boolean };
  // 201 đã kiểm hình dạng: nơi gọi chuyển trang và dọn bản nháp
  onCreated: (created: CreatedAppointment) => void;
}

export function useCreateAppointment({
  body,
  active,
  onCreated,
}: UseCreateAppointmentOptions) {
  const [state, setState] = useState<CreateState>({ kind: 'idle' });
  // Cờ chống gửi đúp bằng ref: state chưa kịp render giữa hai lần bấm liên tiếp trong cùng một lượt xử lý (bài học F2, F9)
  const sending = useRef(false);
  // Đã có một lần "chưa rõ": khung giờ báo đã đặt hay đang giữ ở lần sau có thể là của CHÍNH lịch vừa tạo
  const afterUncertain = useRef(false);
  // Thân và hàm gọi lại luôn là bản mới nhất mà `submit` không phải đổi danh tính theo từng lần vẽ
  const latest = useRef({ body, onCreated });
  useEffect(() => {
    latest.current = { body, onCreated };
  });

  const submit = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    setState({ kind: 'submitting' });

    // Lấy kết quả trước, gọi hàm của nơi gọi SAU (lỗi trong `onCreated` không được bị coi là lỗi của POST)
    let outcome:
      | { ok: true; created: CreatedAppointment }
      | { ok: false; failure: CreateFailure };
    try {
      outcome = {
        ok: true,
        created: await createAppointment(latest.current.body),
      };
    } catch (error: unknown) {
      outcome = {
        ok: false,
        failure: describeCreateFailure(error, {
          afterUncertain: afterUncertain.current,
        }),
      };
    }

    // Người dùng đã rời trang trong lúc chờ: không đặt state, không kéo họ quay lại (lịch nếu đã tạo thì có ở "Lịch hẹn của tôi")
    if (!active.current) return;

    if (outcome.ok) {
      // Giữ `sending` = true: không còn lần gửi nào từ trang này
      setState({ kind: 'done' });
      latest.current.onCreated(outcome.created);
      return;
    }
    sending.current = false;
    const { failure } = outcome;
    if (failure.kind === 'uncertain') afterUncertain.current = true;
    setState(
      failure.kind === 'final'
        ? { kind: 'stopped', failure }
        : { kind: 'failed', failure },
    );
  }, [active]);

  return { state, submit };
}
