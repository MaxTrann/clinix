import type { AiOutputSchema, AiRequest } from '../providers/ai-provider.js';

// Yêu cầu và lược đồ MẪU chỉ để test P1 (cổng không tự viết lược đồ hay lời nhắc thật: đó là việc của chatbot B2, B3).
// Chữ trong đây là dữ liệu mẫu tổng hợp, không phải dữ liệu thật.

export interface SampleAnswer {
  readonly loai: 'hoiDap' | 'khanCap';
  readonly noiDung: string;
}

const LOAI_HOP_LE = ['hoiDap', 'khanCap'];

export const SAMPLE_OUTPUT: AiOutputSchema<SampleAnswer> = {
  name: 'tra_loi_mau',
  jsonSchema: {
    type: 'object',
    properties: {
      loai: { type: 'string', enum: LOAI_HOP_LE },
      noiDung: { type: 'string' },
    },
    required: ['loai', 'noiDung'],
    additionalProperties: false,
  },
  isValid: (value): value is SampleAnswer => {
    if (typeof value !== 'object' || value === null) return false;
    const { loai, noiDung } = value as Record<string, unknown>;
    return (
      typeof loai === 'string' &&
      LOAI_HOP_LE.includes(loai) &&
      typeof noiDung === 'string'
    );
  },
};

/** Chuỗi JSON hợp lệ theo `SAMPLE_OUTPUT`. */
export const sampleAnswerJson = (noiDung = 'Câu trả lời mẫu.'): string =>
  JSON.stringify({ loai: 'hoiDap', noiDung });

/** JSON hợp lệ nhưng `loai` ngoài enum ("sai lược đồ", HDA-04). */
export const WRONG_ENUM_JSON = JSON.stringify({
  loai: 'khongCoTrongEnum',
  noiDung: 'x',
});

export function buildSampleRequest(
  overrides: Partial<AiRequest<SampleAnswer>> = {},
): AiRequest<SampleAnswer> {
  return {
    systemPrompt: 'Bạn là trợ lý của phòng khám (lời nhắc mẫu cho test).',
    context: 'CHI NHÁNH: Chi nhánh mẫu A (id 1).',
    history: [
      { role: 'user', content: 'Xin chào' },
      { role: 'assistant', content: 'Chào bạn, tôi giúp được gì?' },
    ],
    question: 'Phòng khám mở cửa lúc mấy giờ?',
    output: SAMPLE_OUTPUT,
    maxOutputTokens: 800,
    ...overrides,
  };
}
