// chatbot B1 — che định danh trong câu hỏi và lịch sử TRƯỚC khi gửi cho nhà cung cấp AI (PLAN chatbot 5.9, Q5, RTU-01 đến RTU-05).
// Thay bằng "[đã ẩn]" theo ĐÚNG danh sách của 5.9: email; số điện thoại Việt Nam (cách, chấm, gạch, +84); mọi dãy từ 9 chữ số liền
// (CMND, CCCD, số tài khoản); mã lịch `CLX-yyyyMMdd-XXXXX`; ngày dd/mm/yyyy; tên theo mẫu tự giới thiệu ("tôi tên là …", "tên em là …").
// KHÔNG bắt được mọi họ tên, địa chỉ, mô tả bệnh sử: vì vậy có thông báo trước câu đầu tiên (Q5). Web vẫn hiện nguyên câu người dùng gõ.
// Hàm thuần, không ném lỗi với đầu vào lạ. Mọi mẫu có chặn độ dài hoặc không lồng nhau nên chạy tuyến tính (không quay lui bậc hai).

export const REDACTED_MARK = '[đã ẩn]';

// Mã lịch: rộng hơn mẫu thật (`[0-9A-HJKMNP-TV-Z]`) và không phân biệt hoa thường, vì người dùng gõ tay
const APPOINTMENT_CODE =
  /(?<![\p{L}\p{N}])CLX-\d{8}-[0-9A-Z]{5}(?![\p{L}\p{N}])/giu;
// Phần trước @ tối đa 64 ký tự (RFC), mỗi nhãn tên miền tối đa 63: có chặn nên không quay lui bậc hai
const EMAIL = /[\w.+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){1,5}/g;
// dd/mm/yyyy (cũng nhận gạch ngang và dấu chấm); không có năm ("ngày 5/3") thì giữ
const DATE = /(?<!\d)\d{1,2}[/.-]\d{1,2}[/.-]\d{4}(?!\d)/g;
// Tiền tố 0, 84 hay +84 rồi 9 đến 11 chữ số, giữa các chữ số cho phép MỘT dấu cách, chấm hay gạch.
// 11 chữ số để bắt máy bàn có mã vùng 3 số và CCCD gõ cách ("079 303 012 345"). Giá tiền ("2.000.000") không có tiền tố nên không dính.
const PHONE = /(?<!\d)(?:\(?\+84\)?|84|0)(?:[ .-]?\d){9,11}(?!\d)/g;
// Mọi dãy từ 9 chữ số liền (kể cả chữ số toàn góc)
const LONG_DIGITS = /\p{Nd}{9,}/gu;

// Thứ tự áp dụng; mỗi mẫu một dòng
const REDACTION_PATTERNS: readonly RegExp[] = [
  APPOINTMENT_CODE,
  EMAIL,
  DATE,
  PHONE,
  LONG_DIGITS,
];

// --- Tên theo mẫu tự giới thiệu ---
// Chạy trên bản đã BỎ DẤU, CÙNG ĐỘ DÀI với bản gốc (mỗi chữ có dấu thành đúng một chữ không dấu) nên chỉ số khớp trên bản bỏ dấu
// cũng là chỉ số trên câu gốc, và người dùng gõ có dấu hay không dấu đều bắt được.
const PRONOUN = '(?:toi|em|minh|con|chau|be|anh|chi)';
const NAME_WORD = '[^\\s,.;:!?\\(\\)\\[\\]\\{\\}"\'\\p{N}]+';
// "<đại từ> tên là" hay "tên (của) <đại từ> là", rồi TỐI ĐA 4 từ (họ tên Việt thường 2 đến 4 từ) đến khi gặp dấu câu, chữ số hay xuống dòng.
// Cố ý không dùng danh sách từ dừng: "đặt" bỏ dấu trùng tên "Đạt".
const NAME_INTRO = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${PRONOUN}\\s+ten\\s+la|ten\\s+(?:cua\\s+)?${PRONOUN}\\s+la)\\s+((?:${NAME_WORD}[ \\t]+){0,3}${NAME_WORD})`,
  'gu',
);

// Một chữ thành một chữ không dấu, đúng một đơn vị UTF-16; điểm mã ngoài BMP và chữ lạ giữ nguyên để không lệch chỉ số
function foldChar(char: string): string {
  const base = char.toLowerCase().normalize('NFD').charAt(0);
  const folded = base === 'đ' ? 'd' : base;
  return folded.length === 1 ? folded : char;
}

function foldSameLength(text: string): string {
  const pieces: string[] = [];
  for (const char of text) {
    pieces.push(char.length === 1 ? foldChar(char) : char);
  }
  return pieces.join('');
}

// Tên viết hoa chữ đầu ("Lan và muốn đặt lịch"): chỉ lấy các từ liền nhau cũng viết hoa chữ đầu, giữ phần câu phía sau.
// Gõ toàn chữ thường thì không biết chỗ dừng nên che đủ số từ đã khớp (thà che thừa).
function capitalisedPrefix(name: string): string {
  if (!/^\p{Lu}/u.test(name)) return name;
  const parts = name.split(/([ \t]+)/); // [từ, khoảng cách, từ, …]
  let kept = parts[0] ?? '';
  for (let index = 2; index < parts.length; index += 2) {
    const word = parts[index] ?? '';
    if (!/^\p{Lu}/u.test(word)) break;
    kept += (parts[index - 1] ?? '') + word;
  }
  return kept;
}

function redactIntroducedNames(text: string): string {
  const folded = foldSameLength(text);
  if (folded.length !== text.length) return text; // phòng thủ: không để lệch chỉ số
  let result = '';
  let cursor = 0;
  for (const match of folded.matchAll(NAME_INTRO)) {
    const name = match[1] ?? '';
    const start = (match.index ?? 0) + match[0].length - name.length;
    const kept = capitalisedPrefix(text.slice(start, start + name.length));
    result += text.slice(cursor, start) + REDACTED_MARK;
    cursor = start + kept.length;
  }
  return result + text.slice(cursor);
}

/**
 * Che mọi định danh trong `input` (bản gửi đi cho nhà cung cấp). Trả chuỗi NFC. Đầu vào không phải chuỗi cho `''`.
 * Idempotent: che hai lần cho kết quả như che một lần.
 */
export function redactText(input: string): string {
  if (typeof input !== 'string') return '';
  const named = redactIntroducedNames(input.normalize('NFC'));
  return REDACTION_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, REDACTED_MARK),
    named,
  );
}

/**
 * Che cả LỊCH SỬ (RTU-04, PLAN 5.9: tối đa 6 lượt cũng đi tới nhà cung cấp). Trả BẢN MỚI, không sửa đầu vào, giữ nguyên các trường khác.
 * Lưu ý khi nối: trường ở đây là `noiDung` (lược đồ API 5.12) còn lượt của cổng nhà cung cấp (chatbot P1) có thể tên khác: chatbot B3 ánh xạ.
 */
export function redactTurns<T extends { noiDung: string }>(
  turns: readonly T[],
): T[] {
  if (!Array.isArray(turns)) return [];
  return turns.map((turn) => ({
    ...turn,
    noiDung: redactText(turn.noiDung),
  }));
}
