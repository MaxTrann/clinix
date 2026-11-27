import { GEMINI_API_REVISION } from '../chatbot.constants.js';
import {
  composeSystemText,
  type AiProvider,
  type AiRawAnswer,
  type AiRequest,
} from './ai-provider.js';
import type { HttpTransport } from './http-transport.js';
import { ProviderError, throwIfNotSuccess } from './provider-error.js';
import { isRecord, parseEnvelope } from './response-parsing.js';

export interface GeminiProviderConfig {
  /** `AI_ENABLED`. */
  readonly enabled: boolean;
  readonly apiKey?: string;
  readonly model: string;
  /** Địa chỉ gốc, không có dấu `/` cuối (ví dụ `https://generativelanguage.googleapis.com/v1beta`). */
  readonly baseUrl: string;
}

// Adapter Gemini bằng Interactions API: `POST {baseUrl}/interactions`, khoá ở header `x-goog-api-key` (HDA-13), `store: false`.
// Hình dạng theo aistudio.google.com/docs/structured-output, /api-reference/interactions-api và /docs/interactions, tra 27/11/2026.
// `store: false` KHÔNG bảo đảm dữ liệu gói miễn phí không bị Google dùng (PLAN 3.4, ADR): đừng viết như thể bảo đảm.
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;
  readonly configured: boolean;

  constructor(
    private readonly config: GeminiProviderConfig,
    private readonly transport: HttpTransport,
  ) {
    this.configured = config.enabled && !!config.apiKey;
  }

  async generate(
    request: AiRequest<unknown>,
    signal: AbortSignal,
  ): Promise<AiRawAnswer> {
    const { apiKey } = this.config;
    // Không có khoá hay AI bị tắt: không chạm transport (chuỗi vốn đã bỏ qua lớp này, đây là lớp chặn thứ hai)
    if (!this.configured || apiKey === undefined) {
      throw new ProviderError('rejected');
    }
    const response = await this.transport.post(
      {
        url: `${this.config.baseUrl}/interactions`,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
          'Api-Revision': GEMINI_API_REVISION,
        },
        body: JSON.stringify(buildBody(request, this.config.model)),
      },
      signal,
    );
    throwIfNotSuccess(response.status);
    return { text: readText(response.bodyText) };
  }
}

function textStep(
  type: 'user_input' | 'model_output',
  text: string,
): { type: string; content: { type: 'text'; text: string }[] } {
  return { type, content: [{ type: 'text', text }] };
}

// `input` không trạng thái là mảng bước (không có khoá `role`); `system_instruction` là chuỗi; không gửi `temperature`
// (trang xử lý sự cố: Gemini 4 và 3.6 trở lên bỏ qua và sẽ trả 400 ở bản sau).
function buildBody(request: AiRequest<unknown>, model: string): unknown {
  return {
    model,
    system_instruction: composeSystemText(request),
    input: [
      ...request.history.map((turn) =>
        textStep(
          turn.role === 'user' ? 'user_input' : 'model_output',
          turn.content,
        ),
      ),
      textStep('user_input', request.question),
    ],
    store: false,
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: request.output.jsonSchema,
    },
    generation_config: { max_output_tokens: request.maxOutputTokens },
  };
}

// Chữ nằm ở `steps[]` phần tử `model_output`, rồi `content[]` phần tử `text`. Có thể có bước `thought` đứng trước nên không lấy phần tử đầu.
// `status` khác `completed` (ví dụ `incomplete` = chạm max_tokens, JSON bị cụt) thì không dùng.
function readText(bodyText: string): string {
  const envelope = parseEnvelope(bodyText);
  if (envelope.status !== 'completed' || !Array.isArray(envelope.steps)) {
    throw new ProviderError('badOutput');
  }
  const parts: string[] = [];
  for (const step of envelope.steps as unknown[]) {
    if (!isRecord(step) || step.type !== 'model_output') continue;
    if (!Array.isArray(step.content)) continue;
    for (const part of step.content as unknown[]) {
      if (isRecord(part) && part.type === 'text') {
        if (typeof part.text === 'string') parts.push(part.text);
      }
    }
  }
  const text = parts.join('');
  if (text === '') throw new ProviderError('badOutput');
  return text;
}
