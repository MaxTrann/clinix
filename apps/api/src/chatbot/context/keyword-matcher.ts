import { foldVietnamese, splitWords } from '../safety/phrase-matcher.js';
import type { DoctorRow, NamedRow } from './context.types.js';

// Khớp từ khoá KHÔNG DẤU cho phần bác sĩ và dịch vụ của ngữ cảnh (chatbot B2; PLAN chatbot 5.6, NGC-03). Hàm thuần, tuyến tính theo số bác sĩ.
// Cách khớp: tách thành từ chữ thường bỏ dấu (`foldVietnamese`, `splitWords` của B1) rồi tìm CHUỖI TỪ LIỀN NHAU. Từ đơn (một chữ của họ tên) không đủ để khớp
// vì nhiều tên trùng chữ thường ("mai", "anh", "lan").

const SEPARATOR = '|'; // `splitWords` không bao giờ sinh ra '|', nên cụm không bắc qua hai lượt

const SCORE_FULL_NAME = 100;
const SCORE_TAIL_NAME = 60;
const SCORE_SPECIALTY = 40;
const SCORE_BRANCH = 20;
const SCORE_SELECTED_BRANCH = 5;

export const foldedWords = (text: string): string[] =>
  splitWords(text).map(foldVietnamese);

/** Từ của câu đang gửi và lượt NGƯỜI DÙNG ngay trước, đã bỏ dấu, ngăn cách bằng một từ đặc biệt. */
export function buildQuestionWords(
  question: string,
  previousUserTurn?: string,
): string[] {
  const current = foldedWords(question);
  const previous = previousUserTurn ? foldedWords(previousUserTurn) : [];
  return previous.length === 0 ? current : [...previous, SEPARATOR, ...current];
}

/** `phrase` xuất hiện liền nhau trong `words`. Cụm rỗng không bao giờ khớp. */
export function containsPhrase(
  words: readonly string[],
  phrase: readonly string[],
): boolean {
  if (phrase.length === 0) return false;
  for (let start = 0; start + phrase.length <= words.length; start += 1) {
    if (phrase.every((word, offset) => words[start + offset] === word)) {
      return true;
    }
  }
  return false;
}

function nameScore(name: readonly string[], words: readonly string[]): number {
  // Tên một chữ không khớp (xem đầu file)
  if (name.length < 2) return 0;
  if (containsPhrase(words, name)) return SCORE_FULL_NAME;
  return containsPhrase(words, name.slice(-2)) ? SCORE_TAIL_NAME : 0;
}

function doctorScore(
  doctor: DoctorRow,
  words: readonly string[],
  branchId: string | null | undefined,
): number {
  const matched =
    nameScore(foldedWords(doctor.hoTen), words) +
    (containsPhrase(words, foldedWords(doctor.chuyenKhoaTen))
      ? SCORE_SPECIALTY
      : 0) +
    (containsPhrase(words, foldedWords(doctor.chiNhanhTen)) ? SCORE_BRANCH : 0);
  // Chi nhánh đang chọn chỉ để ưu tiên giữa các bác sĩ ĐÃ khớp, không tự làm một bác sĩ thành "khớp"
  return matched > 0 && doctor.chiNhanhId === branchId
    ? matched + SCORE_SELECTED_BRANCH
    : matched;
}

/**
 * Tối đa `max` bác sĩ khớp tên, chuyên khoa hay chi nhánh trong câu hỏi. KHÔNG có từ khoá khớp thì KHÔNG bác sĩ nào (Đại duyệt 27/11/2026):
 * mô hình dẫn người dùng tới trang Tra cứu bác sĩ. Xếp điểm giảm dần; hoà điểm giữ thứ tự của `doctors` (nếp sắp của search).
 */
export function rankDoctors(
  doctors: readonly DoctorRow[],
  words: readonly string[],
  branchId: string | null | undefined,
  max: number,
): DoctorRow[] {
  return doctors
    .map((doctor, order) => ({
      doctor,
      order,
      score: doctorScore(doctor, words, branchId),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, max)
    .map((entry) => entry.doctor);
}

/** Dịch vụ có tên xuất hiện liền nhau trong câu hỏi; giữ thứ tự của `services`, tối đa `max`. */
export function matchServices(
  services: readonly NamedRow[],
  words: readonly string[],
  max: number,
): NamedRow[] {
  return services
    .filter((service) => containsPhrase(words, foldedWords(service.ten)))
    .slice(0, max);
}
