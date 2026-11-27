import { fakeSecretValue } from '../../common/testing/sample-secrets.js';
import {
  FakeHttpTransport,
  reply,
  type FakeReply,
} from '../testing/fake-http-transport.js';
import {
  ERROR_BODY_MARKER,
  readFixture,
  readJsonFixture,
} from '../testing/fixture-reader.js';
import {
  SAMPLE_OUTPUT,
  buildSampleRequest,
} from '../testing/sample-request.js';
import { GroqProvider, type GroqProviderConfig } from './groq.provider.js';
import { ProviderError } from './provider-error.js';

// chatbot P1 — adapter Groq: HDA-12 (yêu cầu), HDA-14 (đọc phản hồi), HDA-15 (phân loại lỗi, thân lỗi không rò). Fixture ở testing/fixtures/groq.
const KEY = fakeSecretValue('groq');
const CONFIG: GroqProviderConfig = {
  enabled: true,
  apiKey: KEY,
  model: 'openai/gpt-oss-20b',
  baseUrl: 'https://api.groq.com/openai/v1',
};
const OK_TEXT = '{"loai":"hoiDap","noiDung":"Phòng khám mở cửa lúc 8 giờ."}';

function build(
  replies: FakeReply[],
  overrides: Partial<GroqProviderConfig> = {},
) {
  const transport = new FakeHttpTransport(replies);
  const provider = new GroqProvider({ ...CONFIG, ...overrides }, transport);
  return { provider, transport };
}
const call = (provider: GroqProvider) =>
  provider.generate(buildSampleRequest(), new AbortController().signal);

describe('GroqProvider (chatbot P1)', () => {
  it('HDA-12: yêu cầu gửi đi đúng URL, header Bearer và thân theo fixture (model từ cấu hình, json_schema strict, reasoning_effort)', async () => {
    const { provider, transport } = build([
      reply(200, readFixture('groq/response-ok.json')),
    ]);

    await call(provider);

    const sent = transport.requests[0];
    expect(transport.requests).toHaveLength(1);
    expect(sent?.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(sent?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
    });
    expect(JSON.parse(sent?.body ?? '')).toEqual(
      readJsonFixture('groq/request.json'),
    );
  });

  it('HDA-12: khoá chỉ ở header Authorization, không ở URL, query hay thân', async () => {
    const { provider, transport } = build([
      reply(200, readFixture('groq/response-ok.json')),
    ]);

    await call(provider);

    const sent = transport.requests[0];
    expect(sent?.url).not.toContain(KEY);
    expect(new URL(sent?.url ?? '').search).toBe('');
    expect(sent?.body).not.toContain(KEY);
    const headersWithKey = Object.entries(sent?.headers ?? {}).filter(
      ([, value]) => value.includes(KEY),
    );
    expect(headersWithKey).toEqual([['Authorization', `Bearer ${KEY}`]]);
  });

  it('HDA-12: model và địa chỉ gốc lấy từ cấu hình; trần token và lược đồ lấy từ yêu cầu', async () => {
    const { provider, transport } = build(
      [reply(200, readFixture('groq/response-ok.json'))],
      { model: 'openai/gpt-oss-120b', baseUrl: 'http://127.0.0.1:9999/v1' },
    );

    await provider.generate(
      buildSampleRequest({ maxOutputTokens: 321 }),
      new AbortController().signal,
    );

    const sent = transport.requests[0];
    const body = JSON.parse(sent?.body ?? '') as Record<string, unknown>;
    expect(sent?.url).toBe('http://127.0.0.1:9999/v1/chat/completions');
    expect(body.model).toBe('openai/gpt-oss-120b');
    expect(body.max_completion_tokens).toBe(321);
    expect(body).toMatchObject({
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: SAMPLE_OUTPUT.name,
          strict: true,
          schema: SAMPLE_OUTPUT.jsonSchema,
        },
      },
      reasoning_effort: 'low',
      include_reasoning: false,
    });
    // Không streaming (Groq không hỗ trợ cùng đầu ra cấu trúc) và không gửi temperature
    expect(body).not.toHaveProperty('stream');
    expect(body).not.toHaveProperty('temperature');
  });

  it('HDA-12: lịch sử đi đúng thứ tự và câu hỏi là lượt user cuối; lời nhắc và ngữ cảnh gộp trong một tin hệ thống', async () => {
    const { provider, transport } = build([
      reply(200, readFixture('groq/response-ok.json')),
    ]);

    await provider.generate(
      buildSampleRequest({ history: [], context: '' }),
      new AbortController().signal,
    );

    const body = JSON.parse(transport.requests[0]?.body ?? '') as {
      messages: { role: string; content: string }[];
    };
    expect(body.messages).toEqual([
      {
        role: 'system',
        content: 'Bạn là trợ lý của phòng khám (lời nhắc mẫu cho test).',
      },
      { role: 'user', content: 'Phòng khám mở cửa lúc mấy giờ?' },
    ]);
  });

  it('HDA-14: đọc phản hồi thành công mẫu ⇒ đúng chuỗi JSON của mô hình', async () => {
    const { provider } = build([
      reply(200, readFixture('groq/response-ok.json')),
    ]);

    const answer = await call(provider);

    expect(answer).toEqual({ text: OK_TEXT });
    expect(SAMPLE_OUTPUT.isValid(JSON.parse(answer.text))).toBe(true);
  });

  it.each([
    ['không phải JSON', readFixture('weird-body.txt')],
    ['JSON nhưng không phải đối tượng', '[]'],
    ['không có choices', '{}'],
    ['choices rỗng', '{"choices":[]}'],
    ['choices[0] không phải đối tượng', '{"choices":[1]}'],
    ['không có message', '{"choices":[{}]}'],
    ['content rỗng', '{"choices":[{"message":{"content":""}}]}'],
    ['content không phải chuỗi', '{"choices":[{"message":{"content":123}}]}'],
  ])('HDA-14: phản hồi 200 %s ⇒ badOutput', async (_name, body) => {
    const { provider } = build([reply(200, body)]);
    await expect(call(provider)).rejects.toMatchObject({ kind: 'badOutput' });
  });

  it.each([
    [429, 'groq/error-429.json', 'rateLimited'],
    [400, 'groq/error-400.json', 'rejected'],
    [401, 'groq/error-400.json', 'rejected'],
    [404, 'groq/error-400.json', 'rejected'],
    [413, 'groq/error-400.json', 'rejected'],
    [500, 'groq/error-500.json', 'server'],
    [503, 'groq/error-500.json', 'server'],
    [502, 'weird-body.txt', 'server'],
    [400, 'weird-body.txt', 'rejected'],
  ])(
    'HDA-15: HTTP %i với thân %s ⇒ loại hỏng %s; thân lỗi không vào thông điệp, ngăn xếp hay bản chuỗi hoá của lỗi',
    async (status, fixture, kind) => {
      const body = readFixture(fixture);
      expect(body).toContain(ERROR_BODY_MARKER);
      const { provider } = build([reply(status, body)]);

      const error: unknown = await call(provider).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ProviderError);
      expect(error).toMatchObject({ kind, httpStatus: status });
      const text = [
        (error as Error).message,
        (error as Error).stack ?? '',
        JSON.stringify(error),
      ].join('\n');
      expect(text).not.toContain(ERROR_BODY_MARKER);
      expect(text).not.toContain(KEY);
    },
  );

  it('HDA-15: lỗi do transport ném (timeout, network) đi qua nguyên loại hỏng', async () => {
    for (const kind of ['timeout', 'network'] as const) {
      const { provider } = build([new ProviderError(kind)]);
      await expect(call(provider)).rejects.toMatchObject({ kind });
    }
  });

  it('chuyển đúng signal của lần thử cho transport (để hết hạn thì fetch thật dừng)', async () => {
    const { provider, transport } = build([
      reply(200, readFixture('groq/response-ok.json')),
    ]);
    const controller = new AbortController();

    await provider.generate(buildSampleRequest(), controller.signal);

    expect(transport.signals[0]).toBe(controller.signal);
  });

  it.each([
    ['có khoá và AI_ENABLED', { enabled: true, apiKey: KEY }, true],
    ['AI_ENABLED=false dù có khoá', { enabled: false, apiKey: KEY }, false],
    ['không có khoá', { enabled: true, apiKey: undefined }, false],
    ['khoá rỗng', { enabled: true, apiKey: '' }, false],
  ])('HDA-10: %s ⇒ configured = %s', (_name, overrides, configured) => {
    const { provider } = build([], overrides);
    expect(provider.configured).toBe(configured);
  });

  it('HDA-10: lớp chưa cấu hình mà vẫn bị gọi thì từ chối NGAY, không chạm transport', async () => {
    const { provider, transport } = build([], { enabled: false });

    await expect(call(provider)).rejects.toMatchObject({ kind: 'rejected' });
    expect(transport.requests).toHaveLength(0);
  });
});
