import {
  CANNED_ANSWERS,
  getCannedAnswer,
  type CannedKind,
} from './canned-answers.js';

// chatbot B1 — hợp đồng câu dựng sẵn (PLAN chatbot 5.16, Q4, Q6, Q13; 2.4.7 A1 đến A4; 2.4.76 A1). Chữ đã được Đại duyệt (xem TRACKING); ca pin chữ để
// không ai sửa chữ của phần an toàn mà không qua review. Mã `B1-nn`: ca bổ sung của chatbot B1, không có mã trong PLAN mục 7.
const KINDS: readonly CannedKind[] = [
  'KhanCap',
  'NgoaiPhamVi',
  'TaiKhoan',
  'KhongKhopDuLieu',
  'DuPhong',
  'KhongCoChuyenKhoa',
];

describe('chatbot B1 — câu dựng sẵn', () => {
  it('B1-01: đủ sáu loại, `ketQua` đúng tên loại, `getCannedAnswer` trả đúng đối tượng', () => {
    expect(Object.keys(CANNED_ANSWERS).sort()).toEqual([...KINDS].sort());
    for (const kind of KINDS) {
      expect(CANNED_ANSWERS[kind].ketQua).toBe(kind);
      expect(getCannedAnswer(kind)).toBe(CANNED_ANSWERS[kind]);
      expect(CANNED_ANSWERS[kind].doan.length).toBeGreaterThan(0);
      for (const paragraph of CANNED_ANSWERS[kind].doan) {
        expect(paragraph.trim()).toBe(paragraph);
        expect(paragraph.length).toBeGreaterThan(10);
      }
    }
  });

  it('B1-02: chữ đúng 5.16 (pin từng câu; sửa chữ phải sửa test này trong cùng PR)', () => {
    expect(CANNED_ANSWERS.KhanCap.doan[0]).toBe(
      'Có thể là tình huống khẩn cấp. Hãy gọi 115 hoặc đến cơ sở y tế gần nhất ngay. Trợ lý AI không xử lý cấp cứu.',
    );
    expect(CANNED_ANSWERS.NgoaiPhamVi.doan).toEqual([
      'Trợ lý AI không chẩn đoán và không kê đơn. Bạn nên gặp bác sĩ để được thăm khám; nếu mô tả triệu chứng, tôi có thể gợi ý chuyên khoa.',
    ]);
    expect(CANNED_ANSWERS.TaiKhoan.doan).toEqual([
      'Trợ lý không xem được dữ liệu tài khoản. Bạn xem tại Lịch hẹn của tôi hoặc Ví của tôi.',
    ]);
    expect(CANNED_ANSWERS.KhongKhopDuLieu.doan).toEqual([
      'Chưa đủ dữ liệu để trả lời chính xác phần này. Bạn có thể tra cứu bác sĩ và lịch khám hoặc nhắn lễ tân.',
    ]);
    expect(CANNED_ANSWERS.DuPhong.doan).toEqual([
      // nguyên văn 2.4.7 A3 (bước 3b), không dấu chấm cuối
      'Trợ lý AI hiện không phản hồi, vui lòng thử lại sau',
      'Trợ lý AI không chẩn đoán, không kê đơn. Trong lúc này bạn có thể tra cứu bác sĩ và lịch khám hoặc nhắn lễ tân.',
    ]);
    expect(CANNED_ANSWERS.KhongCoChuyenKhoa.doan).toEqual([
      'Chưa xác định được chuyên khoa phù hợp. Hãy mô tả rõ hơn hoặc tự chọn chuyên khoa ở Tra cứu bác sĩ và lịch khám.',
    ]);
  });

  it('B1-03: khẩn cấp (Q6): gọi 115 hoặc cơ sở y tế gần nhất; ghi rõ lễ tân không trực cấp cứu; liên kết gọi cấp cứu và nhắn lễ tân', () => {
    const text = CANNED_ANSWERS.KhanCap.doan.join(' ');
    expect(text).toContain('115');
    expect(text).toContain('cơ sở y tế gần nhất');
    expect(text).toContain('Lễ tân không trực cấp cứu');
    expect(CANNED_ANSWERS.KhanCap.lienKet).toEqual([
      'GoiCapCuu',
      'NhanTinLeTan',
    ]);
  });

  it('B1-04: tài khoản (Q4): chỉ liên kết, đúng hai liên kết (khớp TLA-10)', () => {
    expect(CANNED_ANSWERS.TaiKhoan.lienKet).toEqual([
      'LichHenCuaToi',
      'ViCuaToi',
    ]);
  });

  it('B1-05: không câu nào có chữ số khác "115" và không câu nào chứa lời khuyên y khoa (liều, uống, viên, chẩn đoán là, bạn bị)', () => {
    for (const kind of KINDS) {
      for (const paragraph of CANNED_ANSWERS[kind].doan) {
        for (const digits of paragraph.match(/\d+/g) ?? []) {
          expect(digits).toBe('115');
        }
        // ranh giới từ theo Unicode: "uống" nằm trong "tình huống" nhưng không phải từ "uống"
        expect(paragraph).not.toMatch(
          /(?<![\p{L}])(?:liều|uống|viên|chẩn đoán là|bạn bị|nên dùng|hãy dùng)(?![\p{L}])/iu,
        );
        // không URL, email, HTML, liên kết markdown (V6: câu của hệ thống cũng sạch như câu của mô hình)
        expect(paragraph).not.toMatch(/https?:|@|<|\]\(/);
      }
    }
  });

  it('B1-06: cờ theo loại (Q13): chỉ DuPhong cho "Gửi lại" và không vào lịch sử; các loại khác ngược lại', () => {
    expect(CANNED_ANSWERS.DuPhong).toMatchObject({
      coTheGuiLai: true,
      tinhVaoLichSu: false,
    });
    for (const kind of KINDS.filter((item) => item !== 'DuPhong')) {
      expect(CANNED_ANSWERS[kind]).toMatchObject({
        coTheGuiLai: false,
        tinhVaoLichSu: true,
      });
    }
  });

  it('B1-07: hằng bị đóng băng: nơi khác không sửa nổi câu của hệ thống', () => {
    expect(Object.isFrozen(CANNED_ANSWERS)).toBe(true);
    for (const kind of KINDS) {
      expect(Object.isFrozen(CANNED_ANSWERS[kind])).toBe(true);
      expect(Object.isFrozen(CANNED_ANSWERS[kind].doan)).toBe(true);
      expect(Object.isFrozen(CANNED_ANSWERS[kind].lienKet)).toBe(true);
    }
    expect(() => {
      (CANNED_ANSWERS.KhanCap.doan as string[]).push('x');
    }).toThrow(TypeError);
  });
});
