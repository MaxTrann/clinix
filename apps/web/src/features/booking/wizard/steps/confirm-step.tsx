import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { usePageActive } from '../../../auth';
import type { CreatedAppointment } from '../../api/booking-types';
import { useBookingDraft, type BookingDraft } from '../booking-draft-context';
import { destinationAfterCreate } from '../confirm/after-create';
import { ConfirmPanel } from '../confirm/confirm-panel';

interface ConfirmStepProps {
  khungGioId: string;
  // Bản nháp của Bước 4, đã kiểm đúng khung giờ này (khung wizard đưa về Bước 4 nếu thiếu hay lệch)
  draft: BookingDraft;
}

// Bước 5 "Xác nhận" (booking F5, Figma `451:2`): `confirm/confirm-panel.tsx` vẽ tóm tắt và nút xác nhận; file này CHỈ nối nó vào wizard.
//  - `usePageActive()`: người dùng rời trang trong lúc `POST` tạo lịch còn chờ thì phản hồi về sau không được kéo họ quay lại (WZ-13).
//  - Tạo xong thì `navigate(đích, { replace: true })`: Back không quay lại Bước 5 để đặt lần hai. Đích theo `canThanhToan` (`confirm/after-create.ts`).
//  - Bản nháp (kể cả lý do khám, dữ liệu sức khoẻ) được XOÁ SAU KHI thân Bước 5 bị gỡ, KHÔNG ngay lúc tạo xong: `BookingConfirmPage` (F3) hễ thấy bản nháp rỗng là chuyển về
//    Bước 4, nên xoá trước khi router kịp đổi sang trang đích có thể kéo người dùng về Bước 4 thay vì Thanh toán hay Hoàn tất (ca XNA-01 qua ứng dụng thật, đột biến M22).
//  - `key={khungGioId}`: đổi khung giờ ngay trên cùng route thì tóm tắt và trạng thái gửi đặt lại.
export function ConfirmStep({ khungGioId, draft }: ConfirmStepProps) {
  const navigate = useNavigate();
  const { clearDraft } = useBookingDraft();
  const active = usePageActive();

  const created = useRef(false);
  // `clearDraft` đổi danh tính theo từng bản nháp (provider dùng `useMemo`): giữ bản mới nhất trong ref để hàm dọn bên dưới chỉ chạy khi gỡ
  const latestClearDraft = useRef(clearDraft);
  useEffect(() => {
    latestClearDraft.current = clearDraft;
  });
  useEffect(
    () => () => {
      if (created.current) latestClearDraft.current();
    },
    [],
  );

  function handleCreated(result: CreatedAppointment) {
    created.current = true;
    navigate(destinationAfterCreate(result), { replace: true });
  }

  return (
    <ConfirmPanel
      key={khungGioId}
      khungGioId={khungGioId}
      draft={draft}
      active={active}
      onCreated={handleCreated}
    />
  );
}
