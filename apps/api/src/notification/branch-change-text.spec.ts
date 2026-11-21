import { joinWithinLimit, THONG_BAO_MAX_LENGTH } from './branch-change-text.js';

// Admin C4: gom nhiều lịch của một bệnh nhân vào một thông báo ≤ 500 ký tự (CN-52, CN b9).
const HEAD = 'Thay đổi giờ làm việc của chi nhánh ảnh hưởng các lịch hẹn:';
const code = (i: number) => `LH${String(i).padStart(8, '0')} ngày 10/12/2026`;

describe('CN-52 (phần C4) gom lịch hẹn trong giới hạn 500 ký tự', () => {
  it('ít lịch: hiện đủ, không có "lịch khác"', () => {
    expect(joinWithinLimit(HEAD, [code(1), code(2)])).toBe(
      `${HEAD} ${code(1)}, ${code(2)}.`,
    );
  });

  it('nhiều lịch: cắt theo mục và ghi "và N lịch khác", tổng ≤ 500', () => {
    const items = Array.from({ length: 60 }, (_, i) => code(i + 1));
    const text = joinWithinLimit(HEAD, items);
    expect(text.length).toBeLessThanOrEqual(THONG_BAO_MAX_LENGTH);
    const match = /và (\d+) lịch khác\.$/.exec(text);
    expect(match).not.toBeNull();
    const hidden = Number(match?.[1]);
    const shown = items.length - hidden;
    // Đúng số mục hiện ra, và thêm một mục nữa thì vượt giới hạn (cắt tối thiểu)
    expect(text).toContain(code(shown));
    expect(text).not.toContain(code(shown + 1));
  });

  it('biên: đúng 500 ký tự vẫn giữ nguyên; vượt 500 thì cắt bớt mục cuối', () => {
    const base = `${HEAD} `;
    const filler = 'x'.repeat(THONG_BAO_MAX_LENGTH - base.length - 1);
    expect(joinWithinLimit(HEAD, [filler])).toHaveLength(THONG_BAO_MAX_LENGTH);
    const text = joinWithinLimit(HEAD, ['a', `${filler}y`]);
    expect(text).toBe(`${HEAD} a và 1 lịch khác.`);
  });

  it('ca âm: một mục cũng không vừa, hoặc danh sách rỗng ⇒ chỉ câu mở đầu', () => {
    expect(joinWithinLimit(HEAD, ['y'.repeat(600)])).toBe(`${HEAD} (1 lịch)`);
    expect(joinWithinLimit(HEAD, [])).toBe(HEAD);
  });

  it('chữ có xuống dòng hay ký tự điều khiển bị gộp thành một dòng', () => {
    expect(joinWithinLimit('Đầu\nđề:', ['LH1\r\nphụ', 'LH2\u0007'])).toBe(
      'Đầu đề: LH1 phụ, LH2.',
    );
  });
});
