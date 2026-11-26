import {
  canOpen,
  canSee,
  counterpartToCheck,
  type ChatActor,
  type ConversationFacts,
} from './chat-access.policy.js';

// PLAN chat 5.3 (bảng quyền) ở mức hàm thuần; ca qua HTTP là QCH-03, QCH-04, QCH-05 của B2, B3.
const patient: ChatActor = { vaiTro: 'BenhNhan', taiKhoanId: '10' };
const doctor: ChatActor = { vaiTro: 'BacSi', taiKhoanId: '20' };
const receptionistA: ChatActor = {
  vaiTro: 'LeTan',
  taiKhoanId: '30',
  chiNhanhId: '1',
};
const receptionistB: ChatActor = { ...receptionistA, chiNhanhId: '2' };

const doctorChat = (actorIsMember: boolean): ConversationFacts => ({
  hoiThoaiId: '100',
  loai: 'BenhNhan_BacSi',
  chiNhanhId: null,
  nguoiTaoId: '10',
  actorIsMember,
});
const inbox = (actorIsMember: boolean): ConversationFacts => ({
  hoiThoaiId: '200',
  loai: 'BenhNhan_LeTan',
  chiNhanhId: '1',
  nguoiTaoId: '10',
  actorIsMember,
});

describe('chat B1 — chính sách quyền (PLAN 5.3)', () => {
  it('Bệnh nhân thấy hội thoại theo dòng thành viên của mình, cả hai loại; không thành viên thì không thấy (lõi của QCH-03)', () => {
    expect(canSee(patient, doctorChat(true))).toBe(true);
    expect(canSee(patient, inbox(true))).toBe(true);
    expect(canSee(patient, doctorChat(false))).toBe(false);
  });

  it('Bác sĩ cần CẢ dòng thành viên lẫn loại bác sĩ: hộp thư chung không thấy dù có dòng (lõi của QCH-04)', () => {
    expect(canSee(doctor, doctorChat(true))).toBe(true);
    expect(canSee(doctor, doctorChat(false))).toBe(false);
    expect(canSee(doctor, inbox(true))).toBe(false);
  });

  it('Lễ tân thấy hộp thư đúng chi nhánh, không cần dòng thành viên; chi nhánh khác và hội thoại bác sĩ thì không (lõi của QCH-05)', () => {
    expect(canSee(receptionistA, inbox(false))).toBe(true);
    expect(canSee(receptionistB, inbox(true))).toBe(false);
    expect(canSee(receptionistA, doctorChat(true))).toBe(false);
  });

  it('chỉ Bệnh nhân mở hội thoại mới', () => {
    expect(canOpen(patient)).toBe(true);
    expect(canOpen(doctor)).toBe(false);
    expect(canOpen(receptionistA)).toBe(false);
  });

  it('bên kia cần kiểm trạng thái: Bệnh nhân ở hội thoại bác sĩ ⇒ bác sĩ; ở hộp thư ⇒ không ai; Bác sĩ, Lễ tân ⇒ Bệnh nhân chủ (Q3)', () => {
    expect(counterpartToCheck(patient, doctorChat(true), '20')).toBe('20');
    expect(counterpartToCheck(patient, inbox(true), null)).toBeNull();
    expect(counterpartToCheck(doctor, doctorChat(true), '20')).toBe('10');
    expect(counterpartToCheck(receptionistA, inbox(false), null)).toBe('10');
  });
});
