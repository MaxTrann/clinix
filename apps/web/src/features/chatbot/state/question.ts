import { MAX_QUESTION_LENGTH } from '../api/chatbot-types';

// Đếm theo ĐIỂM MÃ (như DTO của máy chủ), không theo đơn vị UTF-16: một biểu tượng cảm xúc là 1, không phải 2.
export function countCodePoints(text: string): number {
  return Array.from(text).length;
}

export function truncateCodePoints(text: string, max: number): string {
  const points = Array.from(text);
  return points.length <= max ? text : points.slice(0, max).join('');
}

export type QuestionProblem = 'empty' | 'tooLong';

// Web đếm bản đã cắt trắng nhưng CHƯA chuẩn hoá NFC hay bỏ ký tự điều khiển như máy chủ; bản của máy chủ không bao giờ dài hơn,
// nên điều web cho qua máy chủ luôn nhận (PLAN 5.4 bước 2).
export function questionProblem(text: string): QuestionProblem | null {
  const length = countCodePoints(text.trim());
  if (length === 0) return 'empty';
  return length > MAX_QUESTION_LENGTH ? 'tooLong' : null;
}
