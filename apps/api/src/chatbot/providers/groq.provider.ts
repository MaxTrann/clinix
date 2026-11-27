import { GROQ_REASONING_EFFORT } from '../chatbot.constants.js';
import {
  composeSystemText,
  type AiProvider,
  type AiRawAnswer,
  type AiRequest,
} from './ai-provider.js';
import type { HttpTransport } from './http-transport.js';
import { ProviderError, throwIfNotSuccess } from './provider-error.js';
import { isRecord, parseEnvelope } from './response-parsing.js';

export interface GroqProviderConfig {
  /** `AI_ENABLED`. */
  readonly enabled: boolean;
  readonly apiKey?: string;
  readonly model: string;
  /** Địa chỉ gốc, không có dấu `/` cuối (ví dụ `https://api.groq.com/openai/v1`). */
  readonly baseUrl: string;
}

// Adapter Groq: `POST {baseUrl}/chat/completions`, khoá ở header `Authorization: Bearer` (HDA-12). Hình dạng theo
// console.groq.com/docs/structured-outputs và /docs/reasoning, tra 27/11/2026 (xem docs/adr/ và testing/fixtures/NGUON.md).
export class GroqProvider implements AiProvider {
  readonly name = 'groq' as const;
  readonly configured: boolean;

  constructor(
    private readonly config: GroqProviderConfig,
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
        url: `${this.config.baseUrl}/chat/completions`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildBody(request, this.config.model)),
      },
      signal,
    );
    throwIfNotSuccess(response.status);
    return { text: readText(response.bodyText) };
  }
}

function buildBody(request: AiRequest<unknown>, model: string): unknown {
  return {
    model,
    messages: [
      { role: 'system', content: composeSystemText(request) },
      ...request.history.map((turn) => ({
        role: turn.role,
        content: turn.content,
      })),
      { role: 'user', content: request.question },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: request.output.name,
        strict: true,
        schema: request.output.jsonSchema,
      },
    },
    reasoning_effort: GROQ_REASONING_EFFORT,
    include_reasoning: false,
    max_completion_tokens: request.maxOutputTokens,
  };
}

// Chữ của mô hình nằm ở `choices[0].message.content` (chuỗi JSON)
function readText(bodyText: string): string {
  const { choices } = parseEnvelope(bodyText);
  const first: unknown = Array.isArray(choices) ? choices[0] : undefined;
  const message = isRecord(first) ? first.message : undefined;
  const content = isRecord(message) ? message.content : undefined;
  if (typeof content !== 'string' || content === '') {
    throw new ProviderError('badOutput');
  }
  return content;
}
