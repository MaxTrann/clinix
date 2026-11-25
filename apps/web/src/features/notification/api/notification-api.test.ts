import { afterEach, describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  cleanUpFakeNotificationApi,
  installFakeNotificationApi,
  unread,
} from '../testing/fake-notification-api';
import {
  getUnreadCount,
  parseUnreadCount,
  UNREAD_COUNT_PATH,
} from './notification-api';

// notification F1: lời gọi và bộ kiểm hình dạng `GET /notifications/unread-count` (PLAN 5.4). Dữ liệu giả.
afterEach(cleanUpFakeNotificationApi);

describe('notification-api (notification F1)', () => {
  it('WTB-01 đọc đúng `soChuaDoc`, kể cả 0 và số lớn', () => {
    expect(parseUnreadCount({ soChuaDoc: 0 })).toBe(0);
    expect(parseUnreadCount({ soChuaDoc: 7 })).toBe(7);
    expect(parseUnreadCount({ soChuaDoc: 12345 })).toBe(12345);
  });

  it('WTB-04 ca âm: số âm, số lẻ, chuỗi, thiếu khoá, không phải đối tượng ⇒ phản hồi hỏng (hook giữ số cũ)', () => {
    for (const raw of [
      { soChuaDoc: -1 },
      { soChuaDoc: 1.5 },
      { soChuaDoc: '3' },
      { soChuaDoc: null },
      {},
      null,
      undefined,
      3,
      'x',
    ])
      expect(() => parseUnreadCount(raw), JSON.stringify(raw)).toThrow(
        UnexpectedResponseError,
      );
  });

  it('gọi đúng đường dẫn bằng GET, gắn access token, không gửi id tài khoản', async () => {
    const api = installFakeNotificationApi();
    api.replies.push(unread(4));
    await expect(getUnreadCount()).resolves.toBe(4);
    expect(api.requests).toHaveLength(1);
    expect(api.requests[0]).toMatchObject({
      method: 'GET',
      path: UNREAD_COUNT_PATH,
      authorization: 'Bearer token-gia',
    });
    expect(String(api.fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/notifications/unread-count',
    );
  });
});
