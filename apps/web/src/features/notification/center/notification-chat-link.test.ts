import { describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  DOCTOR_CHAT_PATH,
  PATIENT_CHAT_PATH,
  RECEPTION_CHAT_PATH,
} from '../../../shared/routes/chat-paths';
import { parseNotificationItem } from '../api/notification-api';
import { notice } from '../testing/fake-notification-api';
import { GROUP_ICONS } from './notification-icons';
import { notificationLinkPath } from './notification-links';
import { GROUP_LABELS, LINK_LABELS } from './notification-text';

// chat F1 — TBC-08 phần web (PLAN chat 5.10, 7.9): thông báo `TinNhanMoi` của chat B6 (nhóm `TinNhan`, liên kết `{ kieu: 'HoiThoai', hoiThoaiId }`).
// Trước F1, bộ đọc không biết hai giá trị này nên trang Thông báo báo "phản hồi hỏng" ngay khi có tin nhắn đầu tiên (B6 đã merge).
describe('chat F1 — thông báo tin nhắn mới ở Trung tâm thông báo (TBC-08 web)', () => {
  it('TBC-08 bộ đọc nhận nhóm TinNhan và liên kết HoiThoai kèm id', () => {
    const item = parseNotificationItem(
      notice({
        loai: 'TinNhanMoi',
        nhom: 'TinNhan',
        tieuDe: 'Tin nhắn mới',
        lienKet: { kieu: 'HoiThoai', hoiThoaiId: '42' },
      }),
    );
    expect(item.nhom).toBe('TinNhan');
    expect(item.lienKet).toEqual({ kieu: 'HoiThoai', hoiThoaiId: '42' });
  });

  it('TBC-08 (âm): liên kết HoiThoai thiếu id hay id không phải chuỗi ⇒ phản hồi hỏng', () => {
    for (const lienKet of [
      { kieu: 'HoiThoai' },
      { kieu: 'HoiThoai', hoiThoaiId: 42 },
    ])
      expect(() => parseNotificationItem(notice({ lienKet }))).toThrow(
        UnexpectedResponseError,
      );
  });

  it('TBC-08 nút mở đúng trang Tin nhắn theo vai trò, mở sẵn hội thoại (`?hoiThoai=`); Quản trị viên không có trang ⇒ không nút', () => {
    const link = { kieu: 'HoiThoai', hoiThoaiId: '42' } as const;
    expect(
      (['BenhNhan', 'LeTan', 'BacSi', 'QuanTriVien'] as const).map((role) =>
        notificationLinkPath(link, role),
      ),
    ).toEqual([
      `${PATIENT_CHAT_PATH}?hoiThoai=42`,
      `${RECEPTION_CHAT_PATH}?hoiThoai=42`,
      `${DOCTOR_CHAT_PATH}?hoiThoai=42`,
      null,
    ]);
  });

  it('TBC-08 nhóm TinNhan có nhãn và biểu tượng riêng (không rơi về "Khác"); nút có chữ', () => {
    expect(GROUP_LABELS.TinNhan).toBe('Tin nhắn');
    expect(GROUP_ICONS.TinNhan).not.toBe(GROUP_ICONS.Khac);
    expect(LINK_LABELS.HoiThoai).toBe('Mở hội thoại');
  });
});
