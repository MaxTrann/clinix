import type { EntityManager } from 'typeorm';
import { nowVN, toSecond } from '../../common/time/time.js';
import {
  RESCHEDULE_NOTIFICATION_EVENTS,
  type RescheduleNotificationEvent,
} from '../appointments.constants.js';
import type { AppointmentEvent } from '../ports/appointment-notifier.port.js';
import type { NotificationContext } from './notification-context.query.js';
import {
  buildRescheduleText,
  type RescheduleTextInput,
} from './reschedule-text.js';
import {
  insertEmailRow,
  insertThongBao,
  insertYeuCauThongBao,
} from './thong-bao-insert.query.js';

// Ghi thông báo của ĐỔI LỊCH và YÊU CẦU ĐỔI LỊCH (reschedule B3; PLAN reschedule 5.10; Q5, Q9, Q10), do `BookingNotifier` gọi sau khi đã đọc ngữ cảnh. Cùng nếp B15: MỘT dòng `thong_bao` cho tài khoản ĐẶT
// (`event.taiKhoanId`, người gọi truyền) và MỘT dòng `email_thong_bao` `ChoGui`, bằng `em` CỦA NGƯỜI GỌI nên cùng commit và cùng hoàn tác với hành động gốc (lỗi ghi NỔI LÊN, không bị nuốt).
//  - `LichHenDaDoiLich`: gắn `lich_hen_id` = lịch MỚI (`event.lichHenId`), UNIQUE `thong_bao_index_lich_hen`.
//  - ba loại yêu cầu: gắn `yeu_cau_doi_lich_ngoai_chinh_sach_id`, `lich_hen_id` NULL (một lịch có nhiều yêu cầu theo thời gian vẫn đủ thông báo), UNIQUE `thong_bao_index_yeu_cau_doi_lich`;
//    `event.lichHenId` là lịch CŨ, chỉ để đọc mã và giờ hiện tại cho câu chữ.
// Chạy lại cùng khoá ⇒ "đã có": không lỗi, không dòng email thứ hai. Thiếu `doiLich` hay `yeuCau` là lỗi lập trình của người gọi: NÉM trước mọi `INSERT` để hoàn tác hành động gốc, không đoán.
// Thứ tự khoá (PLAN 5.3): chỉ có `INSERT` (khoá S ngầm trên `tai_khoan`, và trên hàng yêu cầu, vốn đã là X của chính giao dịch gọi) sau các câu `SELECT` thường: không thêm chu trình.
// Không log gì: mọi dữ liệu ở đây là dữ liệu cá nhân (H12).

const { RESCHEDULED } = RESCHEDULE_NOTIFICATION_EVENTS;

const RESCHEDULE_EVENTS: ReadonlySet<string> = new Set(
  Object.values(RESCHEDULE_NOTIFICATION_EVENTS),
);

/** `loaiSuKien` thuộc bốn mã đổi lịch? (thu hẹp kiểu để `BookingNotifier` rẽ nhánh) */
export function isRescheduleEvent(
  loai: AppointmentEvent['loaiSuKien'],
): loai is RescheduleNotificationEvent {
  return RESCHEDULE_EVENTS.has(loai);
}

function textInputOf(
  event: AppointmentEvent,
  loai: RescheduleNotificationEvent,
  context: NotificationContext,
): RescheduleTextInput {
  if (loai === RESCHEDULED) {
    if (event.doiLich === undefined)
      throw new Error(`thiếu doiLich khi ghi thông báo ${loai}`);
    return { loai, context, doiLich: event.doiLich };
  }
  if (event.yeuCau === undefined)
    throw new Error(`thiếu yeuCau khi ghi thông báo ${loai}`);
  return { loai, context, yeuCau: event.yeuCau };
}

export async function notifyReschedule(
  em: EntityManager,
  event: AppointmentEvent,
  loai: RescheduleNotificationEvent,
  context: NotificationContext,
): Promise<void> {
  const input = textInputOf(event, loai, context);
  const common = {
    taiKhoanId: event.taiKhoanId,
    noiDung: buildRescheduleText(input),
    loaiSuKien: loai,
    thoiDiemTao: toSecond(nowVN()),
  };
  const inserted =
    input.loai === RESCHEDULED
      ? await insertThongBao(em, { ...common, lichHenId: event.lichHenId })
      : await insertYeuCauThongBao(em, {
          ...common,
          yeuCauId: input.yeuCau.yeuCauId,
        });
  if (inserted.kind === 'AlreadyExists') return;
  await insertEmailRow(em, inserted.thongBaoId);
}
