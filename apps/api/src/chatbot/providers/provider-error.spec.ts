import {
  ProviderError,
  failureFromStatus,
  throwIfNotSuccess,
} from './provider-error.js';

// chatbot P1 — bảng mã HTTP ⇒ loại hỏng (PLAN 5.5, T10; hỗ trợ HDA-05, HDA-06, HDA-15), kể cả các biên.
describe('failureFromStatus', () => {
  it.each([200, 201, 204, 299])('HTTP %i (2xx) ⇒ không hỏng', (status) => {
    expect(failureFromStatus(status)).toBeNull();
  });

  it.each([429])(
    'HTTP %i ⇒ rateLimited (không thử lại, cooldown)',
    (status) => {
      expect(failureFromStatus(status)).toBe('rateLimited');
    },
  );

  it.each([400, 401, 402, 403, 404, 408, 413, 422, 428, 430, 499])(
    'HTTP %i (4xx khác 429: cấu hình sai) ⇒ rejected',
    (status) => {
      expect(failureFromStatus(status)).toBe('rejected');
    },
  );

  it.each([500, 501, 502, 503, 504, 599])(
    'HTTP %i (5xx) ⇒ server (thử lại một lần)',
    (status) => {
      expect(failureFromStatus(status)).toBe('server');
    },
  );

  it.each([-1, 0, 100, 199, 300, 301, 399, 600, 999])(
    'HTTP %i (ngoài 2xx, 4xx, 5xx) ⇒ badOutput',
    (status) => {
      expect(failureFromStatus(status)).toBe('badOutput');
    },
  );
});

describe('throwIfNotSuccess', () => {
  it('2xx không ném', () => {
    expect(() => throwIfNotSuccess(200)).not.toThrow();
    expect(() => throwIfNotSuccess(299)).not.toThrow();
  });

  it('mã khác thì ném ProviderError mang đúng loại hỏng và mã HTTP', () => {
    for (const [status, kind] of [
      [429, 'rateLimited'],
      [401, 'rejected'],
      [503, 'server'],
      [302, 'badOutput'],
    ] as const) {
      expect(() => throwIfNotSuccess(status)).toThrow(ProviderError);
      try {
        throwIfNotSuccess(status);
      } catch (error) {
        expect(error).toMatchObject({ kind, httpStatus: status });
      }
    }
  });
});

describe('ProviderError', () => {
  it('thông điệp cố định theo loại hỏng và mã HTTP, không nhận thân lỗi', () => {
    expect(new ProviderError('timeout').message).toBe(
      'AI provider failure: timeout',
    );
    expect(new ProviderError('rejected', 401).message).toBe(
      'AI provider failure: rejected (HTTP 401)',
    );
    const error = new ProviderError('server', 500);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ProviderError');
  });
});
