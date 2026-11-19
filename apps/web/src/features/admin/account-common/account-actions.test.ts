import { lockAccount, unlockAccount, unlockNoShow } from './account-service';

// admin F9, ba lệnh ghi của API tài khoản qua `fetch` giả (mã TKF9-10 là [đề xuất], TRACKING admin 9A.12 mục 3): đúng đường dẫn, đúng phương thức, KHÔNG thân.

interface Seen {
  url: string;
  method: string;
  body: BodyInit | null | undefined;
}

let seen: Seen[];

beforeEach(() => {
  seen = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({
        url: String(input),
        method: init?.method ?? 'GET',
        body: init?.body,
      });
      return new Response(JSON.stringify({ taiKhoanId: '7' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TKF9-10 lệnh ghi: POST, không thân, đúng đường dẫn', () => {
  it.each([
    ['lock', lockAccount, '/api/admin/accounts/7/lock'],
    ['unlock', unlockAccount, '/api/admin/accounts/7/unlock'],
    ['unlock-no-show', unlockNoShow, '/api/admin/accounts/7/unlock-no-show'],
  ] as const)('TKF9-10 %s', async (_name, action, url) => {
    await expect(action('7')).resolves.toBeUndefined();
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe(url);
    expect(seen[0].method).toBe('POST');
    // Không thân: B18 và B19 không nhận thân, mọi thân gửi kèm bị bỏ qua (không ép được cờ hay số lần)
    expect(seen[0].body).toBeUndefined();
  });

  it('TKF9-10 id được mã hoá URL (ký tự lạ không đổi đường dẫn)', async () => {
    await lockAccount('7/../admin?x=1');
    expect(seen[0].url).toBe('/api/admin/accounts/7%2F..%2Fadmin%3Fx%3D1/lock');
    await unlockNoShow('a b');
    expect(seen[1].url).toBe('/api/admin/accounts/a%20b/unlock-no-show');
  });

  it('TKF9-10 phản hồi thành công KHÔNG được đọc: hình dạng nào cũng được (B18 còn có thể đổi khi merge)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{"bat-ky-hinh-dang":[1,2,3]}', { status: 200 }),
      ),
    );
    await expect(lockAccount('7')).resolves.toBeUndefined();
    await expect(unlockAccount('7')).resolves.toBeUndefined();
  });
});
