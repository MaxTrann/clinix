import {
  CHAT_NOTIFICATION_MAX_LENGTH,
  buildChatNotificationText,
} from './chat-notification-text.js';

// chat B6 — câu chữ thông báo tin mới (PLAN chat 5.10): TBC-05 (phần U). Hàm thuần.
describe('chat B6 — câu thông báo tin nhắn mới', () => {
  it('TBC-05: bốn câu theo người nhận; chức danh bác sĩ đặt trước họ tên; không lộ tên Lễ tân', () => {
    expect(
      buildChatNotificationText({
        kind: 'ToDoctor',
        benhNhanHoTen: 'Nguyễn An',
      }),
    ).toBe('Bạn có tin nhắn mới từ bệnh nhân Nguyễn An.');
    expect(
      buildChatNotificationText({
        kind: 'ToReception',
        benhNhanHoTen: 'Nguyễn An',
        tenChiNhanh: 'Quận 1',
      }),
    ).toBe('Bệnh nhân Nguyễn An nhắn tin vào hộp thư chi nhánh Quận 1.');
    expect(
      buildChatNotificationText({
        kind: 'FromDoctor',
        bacSiHoTen: 'Trần Bình',
        bacSiChucDanh: 'TS_BS',
      }),
    ).toBe('Bạn có tin nhắn mới từ TS.BS. Trần Bình.');
    // Dữ liệu hỏng thiếu chức danh: chỉ họ tên, không ném
    expect(
      buildChatNotificationText({
        kind: 'FromDoctor',
        bacSiHoTen: 'Trần Bình',
        bacSiChucDanh: null,
      }),
    ).toBe('Bạn có tin nhắn mới từ Trần Bình.');
    expect(
      buildChatNotificationText({
        kind: 'FromReception',
        tenChiNhanh: 'Quận 1',
      }),
    ).toBe('Bạn có tin nhắn mới từ lễ tân chi nhánh Quận 1.');
  });

  it('TBC-05 (biên): họ tên và tên chi nhánh rất dài, có xuống dòng, ký tự điều khiển ⇒ một dòng, ≤ 500 ký tự, mỗi tên cắt còn 150', () => {
    const longName = `Lê${'\n'}Thị${'\u0007'} ${'Ngọc'.repeat(200)}`;
    for (const text of [
      buildChatNotificationText({ kind: 'ToDoctor', benhNhanHoTen: longName }),
      buildChatNotificationText({
        kind: 'ToReception',
        benhNhanHoTen: longName,
        tenChiNhanh: longName,
      }),
      buildChatNotificationText({
        kind: 'FromDoctor',
        bacSiHoTen: longName,
        bacSiChucDanh: 'GS_TS_BS',
      }),
      buildChatNotificationText({
        kind: 'FromReception',
        tenChiNhanh: longName,
      }),
    ]) {
      expect(text.length).toBeLessThanOrEqual(CHAT_NOTIFICATION_MAX_LENGTH);
      expect(text).not.toMatch(/[\p{Cc}\p{Zl}\p{Zp}]/u);
      expect(text).toContain('Lê Thị Ngọc');
      // Câu vẫn còn dấu chấm cuối: tên bị cắt ở 150, không cắt cụt cả câu
      expect(text.endsWith('.')).toBe(true);
    }
    expect(CHAT_NOTIFICATION_MAX_LENGTH).toBe(500);
  });
});
