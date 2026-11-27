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
import {
  GeminiProvider,
  type GeminiProviderConfig,
} from './gemini.provider.js';
import { ProviderError } from './provider-error.js';

// chatbot P1 — adapter Gemini (Interactions API): HDA-13 (yêu cầu), HDA-14 (đọc phản hồi), HDA-15 (phân loại lỗi, thân lỗi không rò).
// Fixture ở testing/fixtures/gemini.
const KEY = fakeSecretValue('gemini');
const CONFIG: GeminiProviderConfig = {
  enabled: true,
  apiKey: KEY,
  model: 'gemini-3.5-flash-lite',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
};
const OK_TEXT = '{"loai":"hoiDap","noiDung":"Phòng khám mở cửa lúc 8 giờ."}';

function build(
  replies: FakeReply[],
  overrides: Partial<GeminiProviderConfig> = {},
) {
  const transport = new FakeHttpTransport(replies);
  const provider = new GeminiProvider({ ...CONFIG, ...overrides }, transport);
  return { provider, transport };
}
const call = (provider: GeminiProvider) =>
  provider.generate(buildSampleRequest(), new AbortController().signal);
const withSteps = (steps: unknown, status = 'completed') =>
  JSON.stringify({ status, steps });

describe('GeminiProvider (chatbot P1)', () => {
  it('HDA-13: yêu cầu gửi đi đúng URL, header x-goog-api-key và thân theo fixture (store: false, response_format có lược đồ)', async () => {
    const { provider, transport } = build([
      reply(200, readFixture('gemini/response-ok.json')),
    ]);

    await call(provider);

    const sent = transport.requests[0];
    expect(transport.requests).toHaveLength(1);
    expect(sent?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
    );
    expect(sent?.headers).toEqual({
      'Content-Type': 'application/json',
      'x-goog-api-key': KEY,
      'Api-Revision': '2026-05-20',
    });
    expect(JSON.parse(sent?.body ?? '')).toEqual(
      readJsonFixture('gemini/request.json'),
    );
  });

  it('HDA-13: khoá chỉ ở header x-goog-api-key, không ở URL, query hay thân', async () => {
    const { provider, transport } = build([
      reply(200, readFixture('gemini/response-ok.json')),
    ]);

    await call(provider);

    const sent = transport.requests[0];
    expect(sent?.url).not.toContain(KEY);
    expect(new URL(sent?.url ?? '').search).toBe('');
    expect(sent?.body).not.toContain(KEY);
    const headersWithKey = Object.entries(sent?.headers ?? {}).filter(
      ([, value]) => value.includes(KEY),
    );
    expect(headersWithKey).toEqual([['x-goog-api-key', KEY]]);
  });

  it('HDA-13: store luôn false (mặc định của Google là true); lịch sử là mảng bước không có role; không gửi temperature', async () => {
    const { provider, transport } = build([
      reply(200, readFixture('gemini/response-ok.json')),
    ]);

    await provider.generate(
      buildSampleRequest({ maxOutputTokens: 321 }),
      new AbortController().signal,
    );

    const body = JSON.parse(transport.requests[0]?.body ?? '') as Record<
      string,
      unknown
    >;
    expect(body.store).toBe(false);
    expect(body.generation_config).toEqual({ max_output_tokens: 321 });
    expect(body.response_format).toEqual({
      type: 'text',
      mime_type: 'application/json',
      schema: SAMPLE_OUTPUT.jsonSchema,
    });
    expect(JSON.stringify(body.input)).not.toContain('"role"');
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('stream');
  });

  it('HDA-13: model và địa chỉ gốc lấy từ cấu hình; không có lịch sử thì chỉ có một bước user_input và chuỗi hệ thống bỏ ngữ cảnh rỗng', async () => {
    const { provider, transport } = build(
      [reply(200, readFixture('gemini/response-ok.json'))],
      { model: 'gemini-3.5-flash', baseUrl: 'http://localhost:7777/v1beta' },
    );

    await provider.generate(
      buildSampleRequest({ history: [], context: '' }),
      new AbortController().signal,
    );

    const sent = transport.requests[0];
    const body = JSON.parse(sent?.body ?? '') as Record<string, unknown>;
    expect(sent?.url).toBe('http://localhost:7777/v1beta/interactions');
    expect(body.model).toBe('gemini-3.5-flash');
    expect(body.system_instruction).toBe(
      'Bạn là trợ lý của phòng khám (lời nhắc mẫu cho test).',
    );
    expect(body.input).toEqual([
      {
        type: 'user_input',
        content: [{ type: 'text', text: 'Phòng khám mở cửa lúc mấy giờ?' }],
      },
    ]);
  });

  it('HDA-14: đọc phản hồi thành công mẫu ⇒ đúng chuỗi JSON, bỏ qua bước thought đứng trước', async () => {
    const { provider } = build([
      reply(200, readFixture('gemini/response-ok.json')),
    ]);

    const answer = await call(provider);

    expect(answer).toEqual({ text: OK_TEXT });
    expect(SAMPLE_OUTPUT.isValid(JSON.parse(answer.text))).toBe(true);
  });

  it('HDA-14: nhiều khối text trong cùng bước model_output được nối lại theo thứ tự', async () => {
    const { provider } = build([
      reply(
        200,
        withSteps([
          {
            type: 'model_output',
            content: [
              { type: 'text', text: '{"loai":"hoiDap",' },
              { type: 'image', data: 'x' },
              { type: 'text', text: '"noiDung":"a"}' },
            ],
          },
        ]),
      ),
    ]);

    await expect(call(provider)).resolves.toEqual({
      text: '{"loai":"hoiDap","noiDung":"a"}',
    });
  });

  it('HDA-14: status incomplete (chạm max_tokens, JSON bị cụt) ⇒ badOutput', async () => {
    const { provider } = build([
      reply(200, readFixture('gemini/response-incomplete.json')),
    ]);
    await expect(call(provider)).rejects.toMatchObject({ kind: 'badOutput' });
  });

  it.each([
    ['không phải JSON', readFixture('weird-body.txt')],
    ['JSON nhưng không phải đối tượng', '[]'],
    ['không có status', JSON.stringify({ steps: [] })],
    ['status failed', withSteps([], 'failed')],
    ['không có steps', JSON.stringify({ status: 'completed' })],
    ['steps rỗng', withSteps([])],
    [
      'chỉ có bước thought',
      withSteps([{ type: 'thought', summary: [{ type: 'text', text: 'x' }] }]),
    ],
    ['model_output không có content', withSteps([{ type: 'model_output' }])],
    [
      'model_output có text rỗng',
      withSteps([
        { type: 'model_output', content: [{ type: 'text', text: '' }] },
      ]),
    ],
    [
      'model_output có text không phải chuỗi',
      withSteps([
        { type: 'model_output', content: [{ type: 'text', text: 5 }] },
      ]),
    ],
  ])('HDA-14: phản hồi 200 %s ⇒ badOutput', async (_name, body) => {
    const { provider } = build([reply(200, body)]);
    await expect(call(provider)).rejects.toMatchObject({ kind: 'badOutput' });
  });

  it.each([
    [429, 'gemini/error-429.json', 'rateLimited'],
    [400, 'gemini/error-400.json', 'rejected'],
    [401, 'gemini/error-400.json', 'rejected'],
    [403, 'gemini/error-400.json', 'rejected'],
    [404, 'gemini/error-400.json', 'rejected'],
    [500, 'gemini/error-500.json', 'server'],
    [503, 'gemini/error-500.json', 'server'],
    [504, 'gemini/error-500.json', 'server'],
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
      reply(200, readFixture('gemini/response-ok.json')),
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
    const { provider, transport } = build([], { apiKey: undefined });

    await expect(call(provider)).rejects.toMatchObject({ kind: 'rejected' });
    expect(transport.requests).toHaveLength(0);
  });
});
