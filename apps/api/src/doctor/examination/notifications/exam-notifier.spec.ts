import { buildCompletedText } from './exam-notifier.js';

// doctor-exam B1 — nội dung thông báo hoàn thành ca khám (PLAN 5.12, 7.2 HTK-09, 7.11 TDK-03, BDK-07; Q17). Hàm THUẦN, không DB. Cố ý KHÔNG ghim nguyên văn câu chữ (`[đề xuất]`, nhóm có thể đổi):
// chỉ ghim các QUAN HỆ an toàn: một dòng, ≤ 500, không ký tự điều khiển, chứa mã lịch đã làm sạch và cắt 20 ký tự, không có dữ liệu khám hay SĐT. Phần ghi DB: exam-notifier.int-spec.ts.
const CODE = 'CLX-20261110-7K3QD';
const CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]/u;

describe('HTK-09, TDK-03 buildCompletedText', () => {
  it('chứa đúng mã lịch hẹn, MỘT dòng, không ký tự điều khiển, ≤ 500', () => {
    const text = buildCompletedText(CODE);
    expect(text).toContain(CODE);
    expect(text.length).toBeLessThanOrEqual(500);
    expect(text).not.toMatch(CONTROL);
    expect(text).not.toMatch(/[\r\n\t]/);
    expect(text).toBe(text.trim());
  });

  it('mã chứa xuống dòng, tab, ký tự điều khiển và Unicode phân dòng: vẫn một dòng, không ký tự điều khiển', () => {
    const text = buildCompletedText('A\nB\r\nC\tD\u0007E F G');
    expect(text).not.toMatch(CONTROL);
    expect(text).toContain('A B C D E F G');
  });

  it('mã rất dài bị cắt ở 20 ký tự (qua toSingleLine) và cả câu vẫn ≤ 500', () => {
    const long = `CLX-${'Z'.repeat(600)}`;
    const text = buildCompletedText(long);
    expect(text).toContain(long.slice(0, 20));
    expect(text).not.toContain(long.slice(0, 21));
    expect(text.length).toBeLessThanOrEqual(500);
  });

  it('mã rỗng hay chỉ khoảng trắng không làm hàm ném và vẫn một dòng', () => {
    for (const input of ['', '   ', '\n']) {
      const text = buildCompletedText(input);
      expect(text).not.toMatch(CONTROL);
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('không có dữ liệu khám, lý do khám hay số điện thoại (hàm chỉ nhận mã lịch hẹn)', () => {
    const text = buildCompletedText(CODE);
    expect(text).not.toMatch(
      /triệu chứng|chẩn đoán|hướng xử lý|lý do khám|điện thoại/i,
    );
    expect(text).not.toMatch(/\d{9,}/);
  });
});
