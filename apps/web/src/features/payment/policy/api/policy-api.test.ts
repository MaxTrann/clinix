import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../shared/api/auth-hooks';
import { UnexpectedResponseError } from '../../../../shared/api/errors';
import {
  getPolicyGroups,
  getServicePolicy,
  parsePolicyGroups,
  parseServicePolicy,
  saveServicePolicy,
} from './policy-api';

// payment F5: lời gọi và bộ kiểm hình dạng ba API chính sách cọc của B10. Dữ liệu giả.
afterEach(() => {
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

const GROUPS = {
  nhom: [
    {
      nhomDichVuId: '1',
      ten: 'Khám theo chuyên khoa',
      dichVu: [
        {
          dichVuKhamId: '7',
          ten: 'Tim mạch',
          giaMacDinh: '300000.00',
          mucDatCoc: '0.00',
          coChinhSachRieng: false,
        },
      ],
    },
  ],
};
const POLICY = {
  dichVuKhamId: '7',
  mucDatCoc: '100000.00',
  moc: [{ soGioTruocToiThieu: 24, tyLeHoan: 100 }],
};

describe('policy-api (payment F5)', () => {
  it('WCP-01 đọc đúng danh sách theo nhóm và chi tiết; tiền giữ nguyên chuỗi', () => {
    expect(parsePolicyGroups(GROUPS)).toEqual(GROUPS.nhom);
    expect(parseServicePolicy(POLICY)).toEqual(POLICY);
  });

  it('WCP-06 tiền dạng số hay sai dạng ⇒ phản hồi hỏng; khoá thiếu, kiểu lạ ⇒ phản hồi hỏng', () => {
    const bad = (value: unknown, parse: (v: unknown) => unknown) =>
      expect(() => parse(value)).toThrow(UnexpectedResponseError);
    bad({ ...POLICY, mucDatCoc: 100000 }, parseServicePolicy);
    bad(
      { ...POLICY, moc: [{ soGioTruocToiThieu: '24', tyLeHoan: 100 }] },
      parseServicePolicy,
    );
    bad(
      { ...POLICY, moc: [{ soGioTruocToiThieu: 1.5, tyLeHoan: 100 }] },
      parseServicePolicy,
    );
    bad({ nhom: 'x' }, parsePolicyGroups);
    bad(
      {
        nhom: [
          {
            ...GROUPS.nhom[0],
            dichVu: [
              { ...GROUPS.nhom[0]!.dichVu[0], coChinhSachRieng: 'true' },
            ],
          },
        ],
      },
      parsePolicyGroups,
    );
    bad(null, parsePolicyGroups);
  });

  it('gọi đúng đường dẫn và phương thức, gắn access token, PUT gửi đúng thân JSON', async () => {
    const calls: {
      url: string;
      method: string;
      body: unknown;
      auth: string | null;
    }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          method: init?.method ?? 'GET',
          body:
            typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
          auth: new Headers(init?.headers).get('Authorization'),
        });
        const payload = String(input).endsWith('/services') ? GROUPS : POLICY;
        return new Response(JSON.stringify(payload), { status: 200 });
      }),
    );
    setApiAuthHooks({
      getAccessToken: () => 'token-gia',
      recoverFromUnauthorized: async () => false,
    });

    await getPolicyGroups();
    await getServicePolicy('7');
    await saveServicePolicy('7', {
      mucDatCoc: '100000',
      moc: [{ soGioTruocToiThieu: 24, tyLeHoan: 100 }],
    });

    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['GET', '/api/admin/payment-policy/services'],
      ['GET', '/api/admin/payment-policy/services/7'],
      ['PUT', '/api/admin/payment-policy/services/7'],
    ]);
    expect(calls[2]!.body).toEqual({
      mucDatCoc: '100000',
      moc: [{ soGioTruocToiThieu: 24, tyLeHoan: 100 }],
    });
    for (const call of calls) expect(call.auth).toBe('Bearer token-gia');
  });
});
