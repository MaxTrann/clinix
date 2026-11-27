import type { ChucDanhBacSi } from '../../admin/entities/enums.js';
import { toSingleLine } from '../../mail/mail-safety.js';
import { doctorLabel } from '../rest/chat-view.mapper.js';

// Câu chữ thông báo tin nhắn mới (chat B6; PLAN chat 5.10; chữ `[đề xuất]`). Hàm THUẦN.
// KHÔNG BAO GIỜ có nội dung tin, tên tệp, SĐT, email (TBC-05, PLAN 5.11): đầu vào chỉ có họ tên, chức danh, tên chi nhánh, nên không có đường nào đưa chúng vào.

/** Độ dài tối đa của `thong_bao.noi_dung` (cột `varchar(500)`; DMS-07 so với danh mục). */
export const CHAT_NOTIFICATION_MAX_LENGTH = 500;
/** Mỗi tên ghép vào câu cắt còn tối đa 150 ký tự, để câu luôn đủ chỗ và đọc được. `[đề xuất]` */
const NAME_MAX = 150;

export type ChatNotificationText =
  /** Bệnh nhân nhắn ở hội thoại bác sĩ ⇒ Bác sĩ nhận. */
  | { kind: 'ToDoctor'; benhNhanHoTen: string }
  /** Bệnh nhân nhắn vào hộp thư chung ⇒ mọi Lễ tân đang hoạt động của chi nhánh nhận. */
  | { kind: 'ToReception'; benhNhanHoTen: string; tenChiNhanh: string }
  /** Bác sĩ trả lời ⇒ Bệnh nhân nhận. */
  | {
      kind: 'FromDoctor';
      bacSiHoTen: string;
      bacSiChucDanh: ChucDanhBacSi | null;
    }
  /** Lễ tân trả lời ⇒ Bệnh nhân nhận (không lộ tên Lễ tân, Q18). */
  | { kind: 'FromReception'; tenChiNhanh: string };

const name = (value: string) => toSingleLine(value, NAME_MAX);

/** Một dòng, không ký tự điều khiển, ≤ 500 ký tự. */
export function buildChatNotificationText(input: ChatNotificationText): string {
  let text: string;
  switch (input.kind) {
    case 'ToDoctor':
      text = `Bạn có tin nhắn mới từ bệnh nhân ${name(input.benhNhanHoTen)}.`;
      break;
    case 'ToReception':
      text = `Bệnh nhân ${name(input.benhNhanHoTen)} nhắn tin vào hộp thư chi nhánh ${name(input.tenChiNhanh)}.`;
      break;
    case 'FromDoctor':
      text = `Bạn có tin nhắn mới từ ${name(doctorLabel(input.bacSiChucDanh, input.bacSiHoTen))}.`;
      break;
    case 'FromReception':
      text = `Bạn có tin nhắn mới từ lễ tân chi nhánh ${name(input.tenChiNhanh)}.`;
      break;
  }
  return toSingleLine(text, CHAT_NOTIFICATION_MAX_LENGTH);
}
