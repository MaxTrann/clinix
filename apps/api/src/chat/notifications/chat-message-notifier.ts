import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { nowVN, toSecond } from '../../common/time/time.js';
import { newMessageEventCode } from '../chat.constants.js';
import type {
  ChatMessageEvent,
  ChatNotifier,
} from '../core/ports/chat-notifier.port.js';
import {
  buildChatNotificationText,
  type ChatNotificationText,
} from './chat-notification-text.js';
import {
  ChatNotificationRepository,
  type TextParts,
} from './chat-notification.repository.js';

// Bản thật của cổng `ChatNotifier` (chat B6; PLAN chat 5.10, Q11; thay `NoopChatNotifier`). Chat TỰ ghi thông báo của mình (nếp Q5 của thông báo),
// không qua repository của Trung tâm thông báo. Chạy TRONG giao dịch gửi: ghi lỗi thì tin cũng bị hoàn tác (LOI-14). Không email, không nhật ký hành động.
//
// Người nhận (5.10): Bệnh nhân gửi ở hội thoại bác sĩ ⇒ Bác sĩ; ở hộp thư chung ⇒ mọi Lễ tân đang hoạt động của chi nhánh;
// Bác sĩ hay Lễ tân gửi ⇒ Bệnh nhân chủ (đồng nghiệp Lễ tân KHÔNG nhận).

/** Lỗi khi dữ liệu không đủ dựng câu (hội thoại hỏng): ném để giao dịch gửi hoàn tác, không ghi thông báo sai. Thông điệp chỉ có id. */
export class ChatNotificationDataError extends Error {
  constructor(hoiThoaiId: string) {
    super(`Thiếu dữ liệu để dựng thông báo (hoiThoaiId=${hoiThoaiId})`);
    this.name = 'ChatNotificationDataError';
  }
}

@Injectable()
export class ChatMessageNotifier implements ChatNotifier {
  constructor(private readonly repo: ChatNotificationRepository) {}

  async notify(em: EntityManager, event: ChatMessageEvent): Promise<void> {
    const parts = await this.repo.textParts(em, event);
    if (parts === null) throw new ChatNotificationDataError(event.hoiThoaiId);
    const n = {
      noiDung: buildChatNotificationText(textOf(event, parts)),
      loaiSuKien: newMessageEventCode(event.hoiThoaiId),
      thoiDiemTao: toSecond(nowVN()),
    };
    if (event.vaiTroNguoiGui !== 'BenhNhan') {
      await this.repo.notifyOne(em, event.benhNhanId, n);
      return;
    }
    if (event.loai === 'BenhNhan_LeTan') {
      if (event.chiNhanhId === null)
        throw new ChatNotificationDataError(event.hoiThoaiId);
      await this.repo.notifyReceptionists(em, event.chiNhanhId, n);
      return;
    }
    if (event.bacSiId === null)
      throw new ChatNotificationDataError(event.hoiThoaiId);
    await this.repo.notifyOne(em, event.bacSiId, n);
  }

  /**
   * Người đọc đã đọc HẾT tin của hội thoại (người gọi kiểm, chat B2 `markRead`) ⇒ thông báo tin mới của hội thoại đó, của RIÊNG người đọc, thành đã đọc.
   * Đọc một phần thì người gọi không gọi hàm này (TBC-09).
   */
  async markConversationRead(
    em: EntityManager,
    taiKhoanId: string,
    hoiThoaiId: string,
  ): Promise<void> {
    await this.repo.markRead(em, taiKhoanId, newMessageEventCode(hoiThoaiId));
  }
}

function textOf(
  event: ChatMessageEvent,
  parts: TextParts,
): ChatNotificationText {
  const missing = () => new ChatNotificationDataError(event.hoiThoaiId);
  switch (event.vaiTroNguoiGui) {
    case 'BacSi':
      if (parts.bacSiHoTen === null) throw missing();
      return {
        kind: 'FromDoctor',
        bacSiHoTen: parts.bacSiHoTen,
        bacSiChucDanh: parts.bacSiChucDanh,
      };
    case 'LeTan':
      if (parts.tenChiNhanh === null) throw missing();
      return { kind: 'FromReception', tenChiNhanh: parts.tenChiNhanh };
    case 'BenhNhan':
      if (event.loai === 'BenhNhan_BacSi')
        return { kind: 'ToDoctor', benhNhanHoTen: parts.benhNhanHoTen };
      if (parts.tenChiNhanh === null) throw missing();
      return {
        kind: 'ToReception',
        benhNhanHoTen: parts.benhNhanHoTen,
        tenChiNhanh: parts.tenChiNhanh,
      };
  }
}
