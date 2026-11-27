import type { ContextIndex } from '../context/context.types.js';
import {
  PLACEHOLDER_STAND_IN,
  parsePlaceholders,
} from '../context/placeholder.js';
import {
  compileRules,
  foldVietnamese,
  matchRules,
  splitWords,
} from '../safety/phrase-matcher.js';
import {
  ALLOWED_NUMBER,
  CANARY_MIN_CHARS,
  PROMPT_FRAGMENT_MIN_CHARS,
} from './answer.constants.js';
import {
  V4_ABBREVIATED_TITLES,
  V4_SPELLED_TITLES,
  V5_CONNECTORS,
  V7_RULES,
  V8_MASK_RULES,
  V8_RULES,
} from './verifier-rules.js';

// Luật đối chiếu V2 đến V9 (chatbot B2; PLAN chatbot 5.7, T2; 2.4.7 b5 và A2). HÀM THUẦN, TẤT ĐỊNH: không DB, không mạng, không đồng hồ, không đọc biến
// môi trường, không log, KHÔNG gọi mô hình khác để chấm. V1 (sai lược đồ, rỗng, quá 800) là `isValidAnswer` ở `output.schema.ts` và đã xử lý ở chuỗi dự phòng.
// Vi phạm một luật nào thì CẢ câu trả lời bị thay bằng câu A2; kết quả chỉ mang MÃ LUẬT, không mang câu hỏi hay chữ của mô hình (không có gì để log ngoài mã).
// Các luật chữ chạy trên bản đã thay mỗi chỗ giữ hợp lệ bằng `PLACEHOLDER_STAND_IN`. Giới hạn đã biết (PLAN R5): khẳng định định tính không chứa từ khoá,
// số viết bằng chữ ("hai trăm nghìn"), tên khoa không kèm chữ "chuyên khoa" vẫn lọt.

export type RuleId = 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7' | 'V8' | 'V9';

export interface VerifierContext {
  /** Chỉ mục chỗ giữ của NGỮ CẢNH ĐÃ GỬI cho đúng lượt này (do `ContextBuilder` trả về). */
  readonly index: ContextIndex;
  /** Mã chim mồi sinh ngẫu nhiên mỗi lần khởi động (chatbot B3 truyền vào); ít nhất `CANARY_MIN_CHARS` ký tự. */
  readonly canary: string;
  /** Lời nhắc hệ thống (hoặc đoạn cần bảo vệ); rỗng thì chỉ kiểm mã chim mồi. */
  readonly protectedPrompt: string;
}

export type VerifyResult =
  { readonly ok: true } | { readonly ok: false; readonly ruleId: RuleId };

const fail = (ruleId: RuleId): VerifyResult => ({ ok: false, ruleId });

// ---- V3: chữ số ------------------------------------------------------------------------------------------------------------------------------

// "115" chỉ được đứng RIÊNG: "1150" và "2115" vẫn là chữ số lọt
const ALLOWED_NUMBER_PATTERN = new RegExp(
  `(?<!\\p{Nd})${ALLOWED_NUMBER}(?!\\p{Nd})`,
  'gu',
);

function hasForbiddenDigit(text: string): boolean {
  return /\p{Nd}/u.test(text.replace(ALLOWED_NUMBER_PATTERN, ' '));
}

// ---- V4: chức danh đứng trước một từ viết hoa --------------------------------------------------------------------------------------------------

const WORD_EDGE_BEFORE = '(?<![\\p{L}\\p{N}])';
const WORD_EDGE_AFTER = '(?![\\p{L}\\p{N}])';
const spelledTitle = new RegExp(
  `${WORD_EDGE_BEFORE}(?:${V4_SPELLED_TITLES.map((title) => title.replace(/\s+/g, '\\s+')).join('|')})${WORD_EDGE_AFTER}`,
  'giu',
);
const abbreviatedTitle = new RegExp(
  `${WORD_EDGE_BEFORE}(?:${V4_ABBREVIATED_TITLES.join('|')})${WORD_EDGE_AFTER}`,
  'giu',
);
const abbreviatedTitleAtStart = new RegExp(
  `^(?:${V4_ABBREVIATED_TITLES.join('|')})${WORD_EDGE_AFTER}`,
  'iu',
);

// Sau chức danh viết tắt: bỏ khoảng trắng, dấu chấm và các chức danh nối tiếp ("ThS.BS."), rồi xem từ kế tiếp có viết hoa chữ đầu không.
// Không dùng cờ `i` cho phép thử chữ hoa: với `u` và `i`, `\p{Lu}` khớp cả chữ thường.
function capitalWordFollowsAbbreviation(afterTitle: string): boolean {
  let rest = afterTitle;
  for (;;) {
    const trimmed = rest.replace(/^[\s.]+/u, '');
    const chained = abbreviatedTitleAtStart.exec(trimmed);
    if (chained === null) return /^\p{Lu}/u.test(trimmed);
    rest = trimmed.slice(chained[0].length);
  }
}

function hasTitleBeforeName(text: string): boolean {
  for (const match of text.matchAll(spelledTitle)) {
    // "bác sĩ" viết đủ: chỉ khoảng trắng mới nối với tên ("gặp bác sĩ. Tôi…" là hết câu, không phải tên)
    const rest = text.slice(match.index + match[0].length);
    if (/^\s+\p{Lu}/u.test(rest)) return true;
  }
  for (const match of text.matchAll(abbreviatedTitle)) {
    const rest = text.slice(match.index + match[0].length);
    if (capitalWordFollowsAbbreviation(rest)) return true;
  }
  return false;
}

// ---- V5: sau "chuyên khoa" ------------------------------------------------------------------------------------------------------------------------

interface Token {
  readonly kind: 'word' | 'standIn' | 'punct';
  /** Từ đã bỏ dấu và chữ thường (chỉ có nghĩa với `word`). */
  readonly fold: string;
}

const TOKEN = /[\p{L}\p{M}\p{N}]+||[^\s\p{L}\p{M}\p{N}]/gu;

function tokenize(text: string): Token[] {
  return Array.from(text.matchAll(TOKEN), (match): Token => {
    const raw = match[0];
    if (raw === PLACEHOLDER_STAND_IN) return { kind: 'standIn', fold: raw };
    if (/^[\p{L}\p{M}\p{N}]/u.test(raw)) {
      return { kind: 'word', fold: foldVietnamese(raw) };
    }
    return { kind: 'punct', fold: raw };
  });
}

const foldWords = (phrase: string): string[] =>
  splitWords(phrase).map(foldVietnamese);

const CONNECTOR_PHRASES: readonly (readonly string[])[] =
  V5_CONNECTORS.map(foldWords);

function startsWithPhrase(
  words: readonly string[],
  phrase: readonly string[],
): boolean {
  return (
    phrase.length > 0 && phrase.every((word, offset) => words[offset] === word)
  );
}

// Được phép: hết chữ, dấu câu, chỗ giữ (đã kiểm ở V2), từ nối của PLAN, hay tên một chuyên khoa đang hoạt động (so không dấu, theo chuỗi từ)
function isAllowedAfterSpecialtyWord(
  after: readonly Token[],
  specialtyNames: readonly (readonly string[])[],
): boolean {
  const first = after[0];
  if (first === undefined || first.kind !== 'word') return true;
  const words: string[] = [];
  for (const token of after) {
    if (token.kind !== 'word') break;
    words.push(token.fold);
  }
  return [...CONNECTOR_PHRASES, ...specialtyNames].some((phrase) =>
    startsWithPhrase(words, phrase),
  );
}

function hasUnknownAfterSpecialtyWord(
  text: string,
  activeSpecialties: ReadonlyMap<string, string>,
): boolean {
  const tokens = tokenize(text);
  const names = [...activeSpecialties.values()].map(foldWords);
  return tokens.some((token, index) => {
    const next = tokens[index + 1];
    const isSpecialtyWord =
      token.kind === 'word' &&
      token.fold === 'chuyen' &&
      next?.kind === 'word' &&
      next.fold === 'khoa';
    return (
      isSpecialtyWord &&
      !isAllowedAfterSpecialtyWord(tokens.slice(index + 2), names)
    );
  });
}

// ---- V6: URL, email, thẻ HTML, liên kết markdown -------------------------------------------------------------------------------------------

const MARKUP_PATTERNS: readonly RegExp[] = [
  /(?:https?:\/\/|www\.)/i,
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/u,
  // `<` ngay trước chữ cái, `/` hay `!`: "a < b" và "Tim & mạch" vẫn là chữ (DCR-12)
  /<[a-z/!]/i,
  /\[[^\]]*\]\([^)]*\)/,
  /(?<![\p{L}\p{N}.@-])[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|vn|org|net|io|edu|gov)(?![\p{L}\p{N}])/iu,
];

const hasLinkOrMarkup = (text: string): boolean =>
  MARKUP_PATTERNS.some((pattern) => pattern.test(text));

// ---- V7, V8: bộ khớp cụm của B1 ----------------------------------------------------------------------------------------------------------------

const V7_COMPILED = compileRules(V7_RULES);
const V8_COMPILED = compileRules(V8_RULES);
const V8_MASKS_COMPILED = compileRules(V8_MASK_RULES);

// "uống … viên": B1 chỉ khớp cụm liền nhau nên mẫu có khoảng trống làm riêng (tối đa ba từ giữa "uống" và "viên")
const DRINK_GAP_MAX_WORDS = 3;

function hasDrinkTablets(text: string): boolean {
  const words = splitWords(text).map(foldVietnamese);
  return words.some(
    (word, index) =>
      word === 'uong' &&
      words.slice(index + 1, index + 2 + DRINK_GAP_MAX_WORDS).includes('vien'),
  );
}

function hasMedicalClaim(text: string): boolean {
  return (
    matchRules(text, V8_COMPILED, V8_MASKS_COMPILED) !== null ||
    hasDrinkTablets(text)
  );
}

// ---- V9: lộ lời nhắc hệ thống --------------------------------------------------------------------------------------------------------------------

// Bỏ ký tự định dạng vô hình (U+200B, U+00AD, BOM…) để chèn chúng giữa chữ không lách được so khớp
const INVISIBLE = /\p{Cf}/gu;

const normalizeForLeak = (text: string): string =>
  foldVietnamese(text.replace(INVISIBLE, '')).replace(/\s+/g, ' ').trim();

function leaksPrompt(traLoi: string, guard: VerifierContext): boolean {
  const canary = normalizeForLeak(guard.canary);
  // Mã chim mồi rỗng khớp MỌI câu, mã quá ngắn khớp bừa: cấu hình sai phải lộ ngay ở test của chatbot B3, không âm thầm tắt bảo vệ
  if (canary.length < CANARY_MIN_CHARS) {
    throw new RangeError('mã chim mồi quá ngắn');
  }
  const answer = normalizeForLeak(traLoi);
  if (answer.includes(canary)) return true;
  const prompt = normalizeForLeak(guard.protectedPrompt);
  for (
    let start = 0;
    start + PROMPT_FRAGMENT_MIN_CHARS <= prompt.length;
    start += 1
  ) {
    if (
      answer.includes(prompt.slice(start, start + PROMPT_FRAGMENT_MIN_CHARS))
    ) {
      return true;
    }
  }
  return false;
}

// ---- Ghép lại -----------------------------------------------------------------------------------------------------------------------------------------

/**
 * Áp V2 đến V9 theo thứ tự; luật vi phạm ĐẦU TIÊN là kết quả. V2 đứng đầu vì các luật sau chạy trên chữ đã thay chỗ giữ, mà chỗ giữ chỉ tin được khi hợp lệ.
 * Việc "thực thể không còn hiệu lực khi đọc lại" (cũng là V2) làm ở `EntityResolver`, vì cần đọc DB.
 */
export function verifyAnswer(
  traLoi: string,
  guard: VerifierContext,
): VerifyResult {
  const parsed = parsePlaceholders(traLoi);
  if (!parsed.ok) return fail('V2');
  if (!parsed.refs.every((ref) => guard.index.has(ref))) return fail('V2');
  // NFC (chữ có dấu tách rời không lách được cụm có dấu) và bỏ ký tự vô hình (không chèn được giữa các chữ của một từ cấm)
  const text = parsed.stripped.normalize('NFC').replace(INVISIBLE, '');
  if (hasForbiddenDigit(text)) return fail('V3');
  if (hasTitleBeforeName(text)) return fail('V4');
  if (hasUnknownAfterSpecialtyWord(text, guard.index.activeSpecialties)) {
    return fail('V5');
  }
  if (hasLinkOrMarkup(text)) return fail('V6');
  if (matchRules(text, V7_COMPILED) !== null) return fail('V7');
  if (hasMedicalClaim(text)) return fail('V8');
  if (leaksPrompt(traLoi, guard)) return fail('V9');
  return { ok: true };
}
