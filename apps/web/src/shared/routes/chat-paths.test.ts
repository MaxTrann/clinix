import { describe, expect, it } from 'vitest';
import { ROLE_HOME_PATHS } from '../../features/auth';
import {
  CHAT_SEGMENT,
  DOCTOR_CHAT_PATH,
  PATIENT_CHAT_PATH,
  RECEPTION_CHAT_PATH,
  chatConversationPath,
} from './chat-paths';

// chat F1 — đường dẫn trang Tin nhắn (PLAN chat 5.13), phần đường dẫn của WCH-02. Mã CP-01, CP-02 là [đề xuất] (nếp NP-01 của notification).
describe('chat F1 — đường dẫn trang Tin nhắn', () => {
  it('WCH-02 CP-01 ba đường dẫn đúng chữ của PLAN 5.13, nằm dưới gốc từng khu; không có đường dẫn của Quản trị viên', () => {
    expect([PATIENT_CHAT_PATH, RECEPTION_CHAT_PATH, DOCTOR_CHAT_PATH]).toEqual([
      '/benh-nhan/tin-nhan',
      '/le-tan/tin-nhan',
      '/bac-si-portal/tin-nhan',
    ]);
    expect(PATIENT_CHAT_PATH).toBe(
      `${ROLE_HOME_PATHS.BenhNhan}/${CHAT_SEGMENT}`,
    );
    expect(RECEPTION_CHAT_PATH).toBe(
      `${ROLE_HOME_PATHS.LeTan}/${CHAT_SEGMENT}`,
    );
    expect(DOCTOR_CHAT_PATH).toBe(`${ROLE_HOME_PATHS.BacSi}/${CHAT_SEGMENT}`);
  });

  it('WCH-02 CP-02 mở một hội thoại bằng `?hoiThoai=`; giá trị được mã hoá', () => {
    expect(chatConversationPath(DOCTOR_CHAT_PATH, '42')).toBe(
      '/bac-si-portal/tin-nhan?hoiThoai=42',
    );
    expect(chatConversationPath(PATIENT_CHAT_PATH, 'a&b')).toBe(
      '/benh-nhan/tin-nhan?hoiThoai=a%26b',
    );
  });
});
