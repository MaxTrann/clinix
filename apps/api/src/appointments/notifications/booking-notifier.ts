import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { nowVN, toSecond } from '../../common/time/time.js';
import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import type {
  AppointmentEvent,
  AppointmentNotifier,
} from '../ports/appointment-notifier.port.js';
import {
  readNoShowFacts,
  readNotificationContext,
  type NotificationContext,
} from './notification-context.query.js';
import {
  buildNotificationText,
  type NotificationTextInput,
} from './notification-text.js';
import { insertEmailRow, insertThongBao } from './thong-bao-insert.query.js';

/**
 * `AppointmentNotifier` THẬT (task B15; PLAN booking 5.12; thay bản `Noop` của P2). Ghi MỘT dòng `thong_bao` cho tài khoản ĐẶT (`event.taiKhoanId` = `lich_hen.benh_nhan_id`, không phải người thân) và MỘT dòng
 * `email_thong_bao` `ChoGui` cho worker, bằng `em` CỦA NGƯỜI GỌI, nên cùng commit và cùng hoàn tác với lần đổi trạng thái (DL-27, HL-16, CG-02): lỗi ghi NỔI LÊN, không bị nuốt.
 *
 * Thứ tự khoá (PLAN 5.3): cả năm điểm gọi đã khoá lịch xong (tầng 6, hoặc `benh_nhan` rồi `lich_hen` ở `markNoShow`) TRƯỚC khi gọi `notify`; ở đây chỉ có các câu `SELECT` thường (không khoá) rồi hai câu `INSERT`, mà
 * `INSERT thong_bao` xin khoá S trên hàng cha `tai_khoan` và `lich_hen` (khoá ngoại; hàng `lich_hen` đã là X của chính giao dịch), `INSERT email_thong_bao` xin S trên hàng `thong_bao` vừa chèn của chính mình.
 * Không gọi mạng, không gửi thư trong giao dịch (việc của worker, sau commit).
 *
 * Sự kiện ghi lần hai cho cùng (lịch, tài khoản, loại) đụng UNIQUE của P7 ⇒ "đã có": không lỗi, không dòng email thứ hai (`insertThongBao`). Hết hạn giữ chỗ KHÔNG đi qua đây (Q6): `expire` không gọi `notify`.
 * Không log gì: mọi dữ liệu ở đây là dữ liệu cá nhân (H12).
 */
@Injectable()
export class BookingNotifier implements AppointmentNotifier {
  async notify(em: EntityManager, event: AppointmentEvent): Promise<void> {
    const context = await readNotificationContext(em, event.lichHenId);
    if (context === null)
      throw new Error(
        `lịch hẹn ${event.lichHenId} không có khi ghi thông báo ${event.loaiSuKien}`,
      );
    const noiDung = buildNotificationText(
      await textInputOf(em, event, context),
    );
    const inserted = await insertThongBao(em, {
      taiKhoanId: event.taiKhoanId,
      noiDung,
      loaiSuKien: event.loaiSuKien,
      lichHenId: event.lichHenId,
      thoiDiemTao: toSecond(nowVN()),
    });
    if (inserted.kind === 'AlreadyExists') return;
    await insertEmailRow(em, inserted.thongBaoId);
  }
}

// Số lần vắng mặt và ngưỡng đọc bằng `em` (đã thấy bản cộng của chính giao dịch): không cần thêm trường vào `AppointmentEvent` (TRACKING 3.37 B15-E)
async function textInputOf(
  em: EntityManager,
  event: AppointmentEvent,
  context: NotificationContext,
): Promise<NotificationTextInput> {
  switch (event.loaiSuKien) {
    case BOOKING_NOTIFICATION_EVENTS.CONFIRMED:
      return { loai: event.loaiSuKien, context };
    case BOOKING_NOTIFICATION_EVENTS.CANCELLED:
      return { loai: event.loaiSuKien, context, huy: event.huy };
    case BOOKING_NOTIFICATION_EVENTS.NO_SHOW:
    case BOOKING_NOTIFICATION_EVENTS.NO_SHOW_LOCK:
      return {
        loai: event.loaiSuKien,
        context,
        ...(await readNoShowFacts(em, event.taiKhoanId)),
      };
  }
}
