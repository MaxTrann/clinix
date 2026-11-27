import { V7_PHRASES, V8_PHRASES } from '../answer/verifier-rules.js';
import { foldVietnamese, splitWords } from '../safety/phrase-matcher.js';
import { POLICY_LINES, buildPolicyLines } from './policy-knowledge.js';
import { parsePlaceholders } from './placeholder.js';

// chatbot B2 — tệp chính sách (NGC-06: chính sách không ghi số cứng, số ở dạng chỗ giữ) và ca cơ chế B2-nn.

const CONFIG = { thoiGianGiuCho: 15, soLanTuDoiLichToiDa: 2 };

describe('chatbot B2 — policy-knowledge', () => {
  it('NGC-06: không câu nào có chữ số (số đi qua chỗ giữ)', () => {
    for (const line of POLICY_LINES) {
      expect(line.text, line.id).not.toMatch(/\p{Nd}/u);
    }
  });

  it('NGC-06: mọi chỗ giữ trong chính sách hợp lệ và chỉ thuộc loại CS', () => {
    for (const line of POLICY_LINES) {
      const parsed = parsePlaceholders(line.text);
      expect(parsed.ok, line.id).toBe(true);
      if (!parsed.ok) continue;
      for (const ref of parsed.refs) expect(ref.kind, line.id).toBe('CS');
    }
  });

  it('B2-06: mỗi câu có mã duy nhất, nguồn không rỗng và chữ không rỗng', () => {
    const ids = POLICY_LINES.map((line) => line.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const line of POLICY_LINES) {
      expect(line.source.trim(), line.id).not.toBe('');
      expect(line.text.trim(), line.id).not.toBe('');
    }
  });

  it('B2-07: bảy câu P1 đến P7, đúng thứ tự', () => {
    expect(POLICY_LINES.map((line) => line.id)).toEqual([
      'P1',
      'P2',
      'P3',
      'P4',
      'P5',
      'P6',
      'P7',
    ]);
  });

  it('B2-08: chữ chính sách không chứa cụm mà V7 hay V8 chặn (không mời mô hình nhắc lại)', () => {
    const words = POLICY_LINES.flatMap((line) =>
      splitWords(line.text).map(foldVietnamese),
    );
    const joined = ` ${words.join(' ')} `;
    for (const phrase of [...V7_PHRASES, ...V8_PHRASES]) {
      const folded = splitWords(phrase).map(foldVietnamese).join(' ');
      expect(joined, phrase).not.toContain(` ${folded} `);
    }
  });

  it('B2-09: có cấu hình thì đủ bảy câu', () => {
    expect(buildPolicyLines(CONFIG)).toHaveLength(7);
  });

  it('B2-10: chưa cấu hình thì bỏ đúng hai câu cần chỗ giữ CS (P2, P6), giữ năm câu còn lại', () => {
    const lines = buildPolicyLines(null);
    expect(lines).toHaveLength(5);
    expect(lines.join(' ')).not.toContain('[[CS:');
    expect(lines).toEqual(
      POLICY_LINES.filter((line) => !['P2', 'P6'].includes(line.id)).map(
        (line) => line.text,
      ),
    );
  });
});
