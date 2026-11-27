import { describe, expect, it } from 'vitest';
import { ROLE_HOME_PATHS } from '../../features/auth';
import {
  CHAT_SEGMENT,
  DOCTOR_CHAT_PATH,
  PATIENT_CHAT_PATH,
  RECEPTION_CHAT_PATH,
  chatConversationPath,
  patientChatBranchPath,
  patientChatDoctorPath,
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

describe('chat F4 — đường dẫn bắt đầu trò chuyện', () => {
  it('WCH-13 CP-03 `?bacSi=` và `?chiNhanh=` dưới trang Tin nhắn của Bệnh nhân; giá trị được mã hoá', () => {
    expect(patientChatDoctorPath('12')).toBe('/benh-nhan/tin-nhan?bacSi=12');
    expect(patientChatBranchPath('3')).toBe('/benh-nhan/tin-nhan?chiNhanh=3');
    expect(patientChatDoctorPath('a&b=1')).toBe(
      '/benh-nhan/tin-nhan?bacSi=a%26b%3D1',
    );
  });
});
