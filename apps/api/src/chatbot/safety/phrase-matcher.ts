// chatbot B1 — bộ máy khớp cụm từ dùng chung cho ba loại luật (khẩn cấp, ngoài phạm vi, tài khoản; PLAN chatbot 5.8, ATY-02, ATY-04).
// Các file `*.rules.ts` chỉ chứa DỮ LIỆU (bảng cụm từ nhóm duyệt) và một hàm gọi vào đây, để danh sách dễ đọc, dễ sửa và không rải trong logic.
//
// Cách khớp (theo TỪNG TỪ): câu và cụm đều được tách thành từ (chữ thường, NFC). Một từ của câu khớp một từ của cụm khi
//   (a) bằng đúng dạng có dấu của từ trong cụm, hoặc (b) bằng dạng đã bỏ dấu của nó.
// Hệ quả: câu toàn có dấu chỉ khớp đúng dấu ("ngạt mũi" không phải "ngất"); câu gõ không dấu khớp như bản không dấu; câu gõ lẫn
// ("toi bi dau nguc, khó chịu") vẫn bắt "dau nguc". Cụm là dãy từ LIỀN nhau. Phủ định không được xét (thà bắt thừa, ATY-03).

export interface PhraseRule {
  /** Mã nhóm ổn định (vào log thay cho nội dung câu hỏi). */
  readonly id: string;
  readonly phrases: readonly string[];
}

export interface RuleHit {
  readonly ruleId: string;
}

interface CompiledWord {
  /** Dạng có dấu (NFC, chữ thường). */
  readonly exact: string;
  /** Dạng đã bỏ dấu. */
  readonly plain: string;
}

interface CompiledRule {
  readonly id: string;
  readonly phrases: readonly (readonly CompiledWord[])[];
}

export type CompiledRules = readonly CompiledRule[];

// Một "từ" là dãy chữ, dấu ghép hay chữ số; mọi thứ khác (dấu cách, dấu câu, gạch ngang, emoji) là chỗ tách
const NOT_WORD = /[^\p{L}\p{M}\p{N}]+/u;

/** Chữ thường, bỏ dấu tiếng Việt, đ thành d. */
export function foldVietnamese(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd');
}

/** Tách thành các từ chữ thường (NFC). */
export function splitWords(text: string): string[] {
  return text
    .normalize('NFC')
    .toLowerCase()
    .split(NOT_WORD)
    .filter((word) => word !== '');
}

function compilePhrase(phrase: string, ruleId: string): CompiledWord[] {
  const words = splitWords(phrase).map((exact) => ({
    exact,
    plain: foldVietnamese(exact),
  }));
  // Cụm rỗng sẽ khớp mọi câu: lỗi dữ liệu phải lộ ra ngay khi nạp bảng
  if (words.length === 0) {
    throw new Error(`Cụm từ rỗng ở nhóm ${ruleId}`);
  }
  return words;
}

/** Biên dịch bảng một lần (lúc nạp module). Ném lỗi nếu có cụm rỗng hay mã nhóm trùng. */
export function compileRules(rules: readonly PhraseRule[]): CompiledRules {
  const seen = new Set<string>();
  return rules.map((rule) => {
    if (seen.has(rule.id)) throw new Error(`Mã nhóm trùng: ${rule.id}`);
    seen.add(rule.id);
    return {
      id: rule.id,
      phrases: rule.phrases.map((phrase) => compilePhrase(phrase, rule.id)),
    };
  });
}

function wordMatches(textWord: string, phraseWord: CompiledWord): boolean {
  return textWord === phraseWord.exact || textWord === phraseWord.plain;
}

// Vị trí bắt đầu của mọi lần cụm xuất hiện trong dãy từ
function occurrences(
  words: readonly string[],
  phrase: readonly CompiledWord[],
): number[] {
  const starts: number[] = [];
  for (let start = 0; start + phrase.length <= words.length; start += 1) {
    const matched = phrase.every((phraseWord, offset) =>
      wordMatches(words[start + offset] ?? '', phraseWord),
    );
    if (matched) starts.push(start);
  }
  return starts;
}

/**
 * Tìm nhóm ĐẦU TIÊN (theo thứ tự bảng) có một cụm xuất hiện trong `text`. Trả `null` nếu không có.
 * `masks`: cụm ngoại lệ có kiểm chứng (ví dụ "chẩn đoán hình ảnh" là tên dịch vụ): các từ của nó bị che, không dùng để khớp.
 * Hàm thuần, độ phức tạp tuyến tính theo độ dài câu × số cụm; không ném lỗi với câu bất kỳ.
 */
export function matchRules(
  text: string,
  rules: CompiledRules,
  masks: CompiledRules = [],
): RuleHit | null {
  const words = splitWords(text);
  if (words.length === 0) return null;

  const masked = Array.from({ length: words.length }, () => false);
  for (const mask of masks) {
    for (const phrase of mask.phrases) {
      for (const start of occurrences(words, phrase)) {
        for (let offset = 0; offset < phrase.length; offset += 1) {
          masked[start + offset] = true;
        }
      }
    }
  }

  for (const rule of rules) {
    for (const phrase of rule.phrases) {
      const found = occurrences(words, phrase).some((start) =>
        masked.slice(start, start + phrase.length).every((hidden) => !hidden),
      );
      if (found) return { ruleId: rule.id };
    }
  }
  return null;
}
