import {
  countCodePoints,
  questionProblem,
  truncateCodePoints,
} from './question';

// Chatbot F1. Mã ca WTL-nn là mã của PLAN chatbot mục 7.12; F1-nn là ca bổ sung ngoài PLAN (nếp B1-nn).
const EMOJI = String.fromCodePoint(0x1f600);

describe('question', () => {
  it('F1-01 đếm theo ĐIỂM MÃ: một biểu tượng cảm xúc là 1 (dài 2 đơn vị UTF-16)', () => {
    expect(EMOJI.length).toBe(2);
    expect(countCodePoints(EMOJI)).toBe(1);
    expect(countCodePoints('Tôi đau đầu')).toBe(11);
    expect(countCodePoints('')).toBe(0);
  });

  it('F1-02 cắt theo điểm mã không làm đứt đôi cặp thay thế; ngắn hơn giới hạn thì giữ nguyên', () => {
    const text = EMOJI.repeat(5);
    const cut = truncateCodePoints(text, 3);
    expect(cut).toBe(EMOJI.repeat(3));
    expect(countCodePoints(cut)).toBe(3);
    expect(truncateCodePoints('abc', 10)).toBe('abc');
    expect(truncateCodePoints('abc', 3)).toBe('abc');
  });

  it('WTL-08 biên của câu hỏi: rỗng và chỉ trắng bị từ chối; 1 và 500 điểm mã hợp lệ; 501 quá dài', () => {
    expect(questionProblem('')).toBe('empty');
    expect(questionProblem('   \n  ')).toBe('empty');
    expect(questionProblem('a')).toBeNull();
    expect(questionProblem('a'.repeat(500))).toBeNull();
    expect(questionProblem('a'.repeat(501))).toBe('tooLong');
  });

  it('WTL-08 đếm bản đã cắt trắng, và đếm điểm mã chứ không đếm đơn vị UTF-16 (500 biểu tượng vẫn hợp lệ)', () => {
    expect(questionProblem(`  ${'a'.repeat(500)}  `)).toBeNull();
    expect(questionProblem(EMOJI.repeat(500))).toBeNull();
    expect(questionProblem(EMOJI.repeat(501))).toBe('tooLong');
  });
});
