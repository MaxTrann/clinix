import type { AiOutputSchema } from '../providers/ai-provider.js';
import { codePointLength } from '../safety/question-normalizer.js';
import {
  ANSWER_MAX_CODE_POINTS,
  SPECIALTY_ID_INPUT_MAX,
  SPECIALTY_ID_MAX_LENGTH,
} from './answer.constants.js';

// Lược đồ đầu ra của Trợ lý (chatbot B2; PLAN chatbot 5.7, T1) và luật V1. MỘT lời gọi có cấu trúc cho cả hỏi đáp lẫn ánh xạ chuyên khoa.
// `isValid` sai là `badOutput` ở chuỗi dự phòng (P1: thử lại đúng một lần rồi chuyển lớp), KHÔNG vào luật đối chiếu V2 đến V9.

export const ANSWER_KINDS = [
  'hoiDap',
  'goiYDatLich',
  'ngoaiPhamVi',
  'khanCap',
] as const;
export type AnswerKind = (typeof ANSWER_KINDS)[number];

export interface ModelAnswer {
  readonly loai: AnswerKind;
  readonly traLoi: string;
  /** Chuỗi id chuyên khoa (id BIGINT luôn là chuỗi: số JSON lớn hơn 2^53 mất chính xác). */
  readonly chuyenKhoaGoiY: readonly string[];
}

const KEYS = ['loai', 'traLoi', 'chuyenKhoaGoiY'] as const;

// Groq `strict` đòi: mọi trường nằm trong `required`, mọi đối tượng có `additionalProperties: false` (TRACKING mục 7). Không đặt `maxLength`
// hay `maxItems`: Gemini bỏ qua, Groq strict chưa chắc nhận (X1 M1 sẽ đo); độ dài và số phần tử kiểm ở `isValidAnswer`.
export const ANSWER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    loai: { type: 'string', enum: [...ANSWER_KINDS] },
    traLoi: { type: 'string' },
    chuyenKhoaGoiY: { type: 'array', items: { type: 'string' } },
  },
  required: [...KEYS],
} as const;

const isAnswerKind = (value: unknown): value is AnswerKind =>
  typeof value === 'string' &&
  (ANSWER_KINDS as readonly string[]).includes(value);

/** V1: đúng lược đồ; `traLoi` không rỗng (sau khi cắt trắng) và không quá 800 điểm mã; tối đa 10 id, mỗi id là chuỗi ngắn; không trường lạ. */
export function isValidAnswer(value: unknown): value is ModelAnswer {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== KEYS.length || !KEYS.every((key) => keys.includes(key))) {
    return false;
  }
  const { loai, traLoi, chuyenKhoaGoiY } = record;
  if (!isAnswerKind(loai)) return false;
  if (typeof traLoi !== 'string' || traLoi.trim() === '') return false;
  if (codePointLength(traLoi) > ANSWER_MAX_CODE_POINTS) return false;
  if (!Array.isArray(chuyenKhoaGoiY)) return false;
  if (chuyenKhoaGoiY.length > SPECIALTY_ID_INPUT_MAX) return false;
  return chuyenKhoaGoiY.every(
    (id) => typeof id === 'string' && id.length <= SPECIALTY_ID_MAX_LENGTH,
  );
}

export const ANSWER_OUTPUT: AiOutputSchema<ModelAnswer> = {
  name: 'tra_loi_tro_ly',
  jsonSchema: ANSWER_JSON_SCHEMA,
  isValid: isValidAnswer,
};
