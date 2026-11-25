import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TIMEOUT_MS } from '../../../shared/api/client';
import {
  apiError,
  cleanUpFakeNotificationApi,
  installFakeNotificationApi,
  unread,
} from '../testing/fake-notification-api';
import { getUnreadSnapshot } from './unread-store';
import { UNREAD_POLL_MS, useUnreadCount } from './use-unread-count';

// notification F1 — thăm dò số chưa đọc (PLAN 5.5): WTB-02 (nhịp, tạm dừng, không chồng, dọn dẹp), WTB-03 (số tăng), WTB-04 (lỗi giữ số cũ). Đồng hồ giả, API giả.
let visibility: DocumentVisibilityState = 'visible';
let online = true;

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  online = true;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => online,
  });
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.useRealTimers();
  cleanUpFakeNotificationApi();
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(navigator, 'onLine');
});

let cleanup: (() => void) | null = null;

/** Gắn hook rồi chờ lời gọi đầu xong. */
async function mount() {
  const view = renderHook(() => useUnreadCount());
  cleanup = view.unmount;
  await flush();
  return view;
}

/** Chạy hẹn giờ và các promise đang chờ trong `act`. */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function fire(target: EventTarget, type: string) {
  await act(async () => {
    target.dispatchEvent(new Event(type));
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('useUnreadCount — nhịp và tạm dừng (WTB-02)', () => {
  it('WTB-02 gọi ngay khi gắn, rồi đúng mỗi 30 giây; chưa đủ 30 giây thì không gọi', async () => {
    const api = installFakeNotificationApi(2);
    const { result } = await mount();
    expect(api.requests).toHaveLength(1);
    expect(result.current.unread).toBe(2);
    expect(UNREAD_POLL_MS).toBe(30_000);
    await flush(UNREAD_POLL_MS - 1);
    expect(api.requests).toHaveLength(1);
    await flush(1);
    expect(api.requests).toHaveLength(2);
    await flush(UNREAD_POLL_MS * 3);
    expect(api.requests).toHaveLength(5);
  });

  it('WTB-02 tab ẩn ⇒ tạm dừng (không gọi dù qua nhiều nhịp); tab hiện lại ⇒ gọi ngay một lần rồi nối nhịp', async () => {
    const api = installFakeNotificationApi();
    await mount();
    await setVisibility('hidden');
    await flush(UNREAD_POLL_MS * 10);
    expect(api.requests).toHaveLength(1);
    await setVisibility('visible');
    expect(api.requests).toHaveLength(2);
    await flush(UNREAD_POLL_MS);
    expect(api.requests).toHaveLength(3);
  });

  it('WTB-02 cửa sổ được focus ⇒ gọi ngay và hẹn lại từ lúc đó (lượt cũ bị huỷ, không gọi hai lần)', async () => {
    const api = installFakeNotificationApi();
    await mount();
    await flush(10_000);
    await fire(window, 'focus');
    expect(api.requests).toHaveLength(2);
    // Mốc 30 giây tính từ lúc gắn: lượt cũ đã bị huỷ
    await flush(UNREAD_POLL_MS - 10_000);
    expect(api.requests).toHaveLength(2);
    await flush(10_000);
    expect(api.requests).toHaveLength(3);
  });

  it('WTB-02 lời gọi chậm không chồng: đang bay thì không hẹn lượt mới, focus không gọi thêm; xong mới hẹn 30 giây', async () => {
    const api = installFakeNotificationApi(1);
    api.replies.push({ hold: true });
    await mount();
    await flush(10_000);
    await fire(window, 'focus');
    await setVisibility('visible');
    expect(api.requests).toHaveLength(1);
    await act(async () => {
      api.release(unread(4));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getUnreadSnapshot().unread).toBe(4);
    await flush(UNREAD_POLL_MS - 1);
    expect(api.requests).toHaveLength(1);
    await flush(1);
    expect(api.requests).toHaveLength(2);
  });

  it('WTB-02 gỡ ⇒ huỷ lời gọi đang bay, không còn hẹn giờ, không còn listener; kho về trạng thái đầu', async () => {
    const api = installFakeNotificationApi(3);
    const view = await mount();
    expect(getUnreadSnapshot().unread).toBe(3);
    api.replies.push({ hold: true });
    await flush(UNREAD_POLL_MS);
    expect(api.requests).toHaveLength(2);
    view.unmount();
    cleanup = null;
    expect(api.requests[1]?.signal?.aborted).toBe(true);
    // Hẹn giờ quá giờ của lớp client được dọn khi lời gọi bị huỷ từ chối xong (một vòng microtask): chờ vòng đó rồi mới đếm
    await flush();
    expect(vi.getTimerCount()).toBe(0);
    expect(getUnreadSnapshot()).toEqual({
      unread: null,
      announce: false,
      increases: 0,
    });
    await fire(window, 'focus');
    await setVisibility('visible');
    await flush(UNREAD_POLL_MS * 3);
    expect(api.requests).toHaveLength(2);
  });

  it('WTB-04 mất mạng ⇒ dừng hẳn; có mạng lại ⇒ gọi ngay rồi nối nhịp', async () => {
    const api = installFakeNotificationApi();
    await mount();
    online = false;
    await fire(window, 'offline');
    await flush(UNREAD_POLL_MS * 4);
    expect(api.requests).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    online = true;
    await fire(window, 'online');
    expect(api.requests).toHaveLength(2);
    await flush(UNREAD_POLL_MS);
    expect(api.requests).toHaveLength(3);
  });
});

describe('useUnreadCount — số tăng, số giảm (WTB-03)', () => {
  it('WTB-03 lần đầu không tính là tăng; số tăng ⇒ announce và đếm lần tăng; số giảm hay giữ nguyên ⇒ chỉ cập nhật số', async () => {
    const api = installFakeNotificationApi();
    api.replies.push(unread(2), unread(5), unread(5), unread(3), unread(9));
    const { result } = await mount();
    expect(result.current).toEqual({
      unread: 2,
      announce: false,
      increases: 0,
    });
    await flush(UNREAD_POLL_MS);
    expect(result.current).toEqual({ unread: 5, announce: true, increases: 1 });
    await flush(UNREAD_POLL_MS);
    expect(result.current).toEqual({
      unread: 5,
      announce: false,
      increases: 1,
    });
    await flush(UNREAD_POLL_MS);
    expect(result.current).toEqual({
      unread: 3,
      announce: false,
      increases: 1,
    });
    await flush(UNREAD_POLL_MS);
    expect(result.current).toEqual({ unread: 9, announce: true, increases: 2 });
  });
});

describe('useUnreadCount — lỗi thăm dò (WTB-04)', () => {
  it('WTB-04 mạng, 5xx, phản hồi hỏng, 401 ⇒ giữ số cũ, không ném; mỗi nhịp đúng một lời gọi (401 không vòng lặp); nhịp sau đọc lại được', async () => {
    const api = installFakeNotificationApi();
    api.replies.push(
      unread(2),
      { network: true },
      apiError(500, 'LOI_HE_THONG'),
      { body: { soChuaDoc: 'nhiều' } },
      apiError(401, 'TOKEN_KHONG_HOP_LE'),
      unread(6),
    );
    const { result } = await mount();
    for (let i = 0; i < 4; i += 1) {
      await flush(UNREAD_POLL_MS);
      expect(result.current.unread, `nhịp ${i + 2}`).toBe(2);
      expect(api.requests).toHaveLength(i + 2);
    }
    await flush(UNREAD_POLL_MS);
    expect(result.current.unread).toBe(6);
    expect(api.requests).toHaveLength(6);
  });

  it('WTB-04 quá giờ (15 giây của lớp client) ⇒ giữ số cũ, lượt sau hẹn 30 giây kể từ lúc hết giờ', async () => {
    const api = installFakeNotificationApi(1);
    const { result } = await mount();
    api.replies.push({ hold: true });
    await flush(UNREAD_POLL_MS);
    expect(api.requests).toHaveLength(2);
    await flush(DEFAULT_TIMEOUT_MS);
    expect(api.requests[1]?.signal?.aborted).toBe(true);
    expect(result.current.unread).toBe(1);
    await flush(UNREAD_POLL_MS - 1);
    expect(api.requests).toHaveLength(2);
    await flush(1);
    expect(api.requests).toHaveLength(3);
  });
});
