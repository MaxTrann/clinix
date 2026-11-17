import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../shared/api/auth-hooks';
import { jsonResponse } from '../../testing/fetch-routing';
import { useHide } from './use-hide';

// doctor-exam F8, WKD-23 [đề xuất] (và WKD-07, WKD-08 phần hook): máy trạng thái MỘT lần ẩn đánh giá. `fetch` giả theo hợp đồng B8; hook gọi `hideAdminReview` thật (qua `request()` của `shared/api`). Dữ liệu giả.
const fetchMock = vi.fn<typeof fetch>();
const onHidden = vi.fn();
const onSettled = vi.fn();
const REASON = 'Lăng mạ bác sĩ trong phần nhận xét';

beforeEach(() => {
  fetchMock.mockReset();
  onHidden.mockReset();
  onSettled.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setApiAuthHooks({
    getAccessToken: () => 'khoa-gia',
    recoverFromUnauthorized: async () => false,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setApiAuthHooks(null);
});

const apiError = (status: number, maLoi: string, extra: object = {}) =>
  jsonResponse({ maLoi, thongBao: 'THÔNG BÁO KỸ THUẬT', ...extra }, status);
const ok = (id = '41') => jsonResponse({ danhGiaId: id, biAn: true });
const posts = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
const flush = () =>
  act(async () => {
    await Promise.resolve();
  });
// Chờ chuỗi `await` trong `hide` chạy hết (nhiều vi tác vụ nối tiếp)
const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });

function setup(danhGiaId = '41') {
  return renderHook(
    (props: { id: string }) =>
      useHide({ danhGiaId: props.id, onHidden, onSettled }),
    {
      initialProps: { id: danhGiaId },
    },
  );
}

describe('doctor-exam F8 — gửi MỘT lần (WKD-08, WKD-23)', () => {
  it('WKD-23 lý do hợp lệ ⇒ đúng MỘT POST tới `/hide` của đúng id, thân là lý do ĐÃ chuẩn hoá; 200 ⇒ `onHidden` MỘT lần, không lỗi, hết đang gửi', async () => {
    fetchMock.mockResolvedValue(ok('41'));
    const { result } = setup('41');
    await act(async () => {
      await result.current.hide(`  Dòng một\r\nDòng hai đủ dài  `);
    });
    expect(posts()).toHaveLength(1);
    const [url, init] = posts()[0];
    expect(new URL(String(url), 'http://x').pathname).toBe(
      '/api/admin/doctor-ratings/41/hide',
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      lyDo: 'Dòng một\nDòng hai đủ dài',
    });
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(onSettled).not.toHaveBeenCalled();
    expect(result.current.failure).toBeNull();
    expect(result.current.saving).toBe(false);
  });

  it('WKD-08 hai lần gọi `hide` CÙNG LƯỢT (state chưa kịp vẽ lại) ⇒ MỘT POST; đang gửi thì `saving`', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = setup();
    act(() => {
      void result.current.hide(REASON);
      void result.current.hide(REASON);
      void result.current.hide(REASON);
    });
    expect(posts()).toHaveLength(1);
    expect(result.current.saving).toBe(true);
    await act(async () => {
      finish(ok());
    });
    await settle();
    expect(posts()).toHaveLength(1);
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(result.current.saving).toBe(false);
  });

  it('WKD-08 sau khi lần đầu xong (lỗi), lần gọi kế tiếp do người dùng chủ động ĐƯỢC gửi (cờ đã hạ)', async () => {
    fetchMock.mockResolvedValueOnce(apiError(503, 'HE_THONG_DANG_BAN'));
    fetchMock.mockResolvedValueOnce(ok());
    const { result } = setup();
    await act(async () => {
      await result.current.hide(REASON);
    });
    expect(result.current.failure?.kind).toBe('retry');
    await act(async () => {
      await result.current.hide(REASON);
    });
    expect(posts()).toHaveLength(2);
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(result.current.failure).toBeNull();
  });
});

describe('doctor-exam F8 — kiểm ở máy: KHÔNG gửi khi lý do chưa hợp lệ (WKD-05, WKD-20)', () => {
  it.each([
    ['', 'LY_DO_BAT_BUOC'],
    ['   \n ', 'LY_DO_BAT_BUOC'],
    ['ngắn quá', 'LY_DO_QUA_NGAN'],
    ['x'.repeat(256), 'LY_DO_QUA_DAI'],
  ])(
    'lý do %j ⇒ lỗi theo ô %s, không POST, không `onHidden`',
    async (reason, code) => {
      const { result } = setup();
      await act(async () => {
        await result.current.hide(reason);
      });
      expect(posts()).toHaveLength(0);
      expect(result.current.failure).toEqual({
        message: null,
        kind: 'field',
        code,
      });
      expect(result.current.saving).toBe(false);
      expect(onHidden).not.toHaveBeenCalled();
    },
  );

  it('WKD-05 biên: 10 và 255 đơn vị được gửi', async () => {
    fetchMock.mockResolvedValue(ok());
    const { result } = setup();
    await act(async () => {
      await result.current.hide('x'.repeat(10));
    });
    await act(async () => {
      await result.current.hide('x'.repeat(255));
    });
    expect(posts()).toHaveLength(2);
  });

  it('WKD-05 `clearReasonError` bỏ lỗi của ô nhưng KHÔNG bỏ dải chung (503, mạng…)', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.hide('');
    });
    expect(result.current.failure?.kind).toBe('field');
    act(() => result.current.clearReasonError());
    expect(result.current.failure).toBeNull();

    fetchMock.mockResolvedValue(apiError(503, 'HE_THONG_DANG_BAN'));
    await act(async () => {
      await result.current.hide(REASON);
    });
    expect(result.current.failure?.kind).toBe('retry');
    act(() => result.current.clearReasonError());
    expect(result.current.failure?.kind).toBe('retry');
  });
});

describe('doctor-exam F8 — kết quả theo mã lỗi (WKD-07, WKD-22, WKD-23)', () => {
  it('WKD-07 409 `DANH_GIA_DA_AN` ⇒ `onSettled("already")` MỘT lần, KHÔNG đặt lỗi đỏ, KHÔNG `onHidden`', async () => {
    fetchMock.mockResolvedValue(apiError(409, 'DANH_GIA_DA_AN'));
    const { result } = setup();
    await act(async () => {
      await result.current.hide(REASON);
    });
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith('already');
    expect(onHidden).not.toHaveBeenCalled();
    expect(result.current.failure).toBeNull();
    expect(result.current.saving).toBe(false);
  });

  it('WKD-07 404 ⇒ `onSettled("gone")` MỘT lần, KHÔNG lỗi đỏ, KHÔNG `onHidden`', async () => {
    fetchMock.mockResolvedValue(apiError(404, 'KHONG_TIM_THAY'));
    const { result } = setup();
    await act(async () => {
      await result.current.hide(REASON);
    });
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith('gone');
    expect(onHidden).not.toHaveBeenCalled();
    expect(result.current.failure).toBeNull();
  });

  it('WKD-07 400 theo trường `lyDo` (máy chủ) ⇒ `failure` loại `field` với đúng mã, không `onHidden`, không `onSettled`', async () => {
    fetchMock.mockResolvedValue(
      apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'lyDo', ma: 'NOI_DUNG_KHONG_HOP_LE' }],
      }),
    );
    const { result } = setup();
    await act(async () => {
      await result.current.hide(REASON);
    });
    expect(result.current.failure).toEqual({
      message: null,
      kind: 'field',
      code: 'NOI_DUNG_KHONG_HOP_LE',
    });
    expect(onHidden).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
    expect(posts()).toHaveLength(1);
  });

  it('WKD-07 503 ⇒ `retry` (giữ hộp), 403 ⇒ `final`, 401 ⇒ `final`, lỗi lạ ⇒ `retry`; không `onHidden`, không `onSettled`', async () => {
    for (const [response, kind] of [
      [apiError(503, 'HE_THONG_DANG_BAN'), 'retry'],
      [apiError(403, 'KHONG_DU_QUYEN'), 'final'],
      [apiError(401, 'CHUA_DANG_NHAP'), 'final'],
      [apiError(500, 'LOI_LA'), 'retry'],
    ] as const) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(response);
      const { result } = setup();
      await act(async () => {
        await result.current.hide(REASON);
      });
      expect(result.current.failure?.kind, kind).toBe(kind);
      expect(result.current.failure?.message).toEqual(expect.any(String));
    }
    expect(onHidden).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });
});

describe('doctor-exam F8 — không tự gửi lại; "chưa rõ" (WKD-07, WKD-23)', () => {
  it('WKD-23 mất mạng ⇒ `uncertain`, đúng MỘT POST dù chờ thêm (KHÔNG tự gửi lại); người dùng bấm lại thì gửi lần hai', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = setup();
    await act(async () => {
      await result.current.hide(REASON);
    });
    expect(result.current.failure?.kind).toBe('uncertain');
    await settle();
    await settle();
    expect(posts()).toHaveLength(1);
    expect(onHidden).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(apiError(409, 'DANH_GIA_DA_AN'));
    await act(async () => {
      await result.current.hide(REASON);
    });
    expect(posts()).toHaveLength(2);
    expect(onSettled).toHaveBeenCalledWith('already');
  });

  it('WKD-23 200 sai hình dạng (`biAn` false, id lệch) ⇒ `uncertain`, không `onHidden`, MỘT POST', async () => {
    for (const body of [
      { danhGiaId: '41', biAn: false },
      { danhGiaId: '99', biAn: true },
      { danhGiaId: '41' },
    ]) {
      fetchMock.mockReset();
      onHidden.mockReset();
      fetchMock.mockResolvedValue(jsonResponse(body));
      const { result } = setup('41');
      await act(async () => {
        await result.current.hide(REASON);
      });
      expect(result.current.failure?.kind).toBe('uncertain');
      expect(onHidden).not.toHaveBeenCalled();
      expect(posts()).toHaveLength(1);
    }
  });

  it('WKD-23 hết giờ 15 giây ⇒ `uncertain`, MỘT POST, không tự gửi lại', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      fetchMock.mockImplementation(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      );
      const { result } = setup();
      act(() => {
        void result.current.hide(REASON);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(14_999);
      });
      expect(result.current.failure).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(result.current.failure?.kind).toBe('uncertain');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(posts()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('doctor-exam F8 — gỡ hộp, kết quả muộn, hàm gọi lại (WKD-23)', () => {
  it('WKD-23 gỡ hook khi đang gửi ⇒ yêu cầu bị HUỶ, không `onHidden`, không `onSettled`, không cập nhật state, không cảnh báo', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const { result, unmount } = setup();
    act(() => {
      void result.current.hide(REASON);
    });
    const signal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
    await flush();
    await settle();
    expect(onHidden).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('WKD-23 kết quả về SAU khi gỡ hook (yêu cầu không huỷ kịp) bị bỏ: không `onHidden`', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const { result, unmount } = setup();
    act(() => {
      void result.current.hide(REASON);
    });
    unmount();
    await act(async () => {
      finish(ok());
    });
    await settle();
    expect(onHidden).not.toHaveBeenCalled();
  });

  it('WKD-23 lỗi ném ra TRONG `onHidden` không bị coi là lỗi mạng: không đặt `failure`, không gửi lại', async () => {
    fetchMock.mockResolvedValue(ok());
    onHidden.mockImplementation(() => {
      throw new Error('lỗi của nơi gọi');
    });
    const { result } = setup();
    await act(async () => {
      await expect(result.current.hide(REASON)).rejects.toThrow(
        'lỗi của nơi gọi',
      );
    });
    expect(result.current.failure).toBeNull();
    expect(posts()).toHaveLength(1);
  });

  it('WKD-23 `onHidden`, `onSettled` luôn là bản MỚI NHẤT (đổi giữa lúc gửi) mà `hide` không phải đổi danh tính', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const later = vi.fn();
    const { result, rerender } = renderHook(
      (props: { done: () => void }) =>
        useHide({ danhGiaId: '41', onHidden: props.done, onSettled }),
      { initialProps: { done: onHidden } },
    );
    const first = result.current.hide;
    act(() => {
      void result.current.hide(REASON);
    });
    rerender({ done: later });
    expect(result.current.hide).toBe(first);
    await act(async () => {
      finish(ok());
    });
    await settle();
    expect(later).toHaveBeenCalledTimes(1);
    expect(onHidden).not.toHaveBeenCalled();
  });

  it('WKD-23 đổi `danhGiaId` ⇒ lần gửi kế tiếp đi tới ĐÚNG id mới', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(ok('42')));
    const { result, rerender } = setup('41');
    rerender({ id: '42' });
    await act(async () => {
      await result.current.hide(REASON);
    });
    expect(new URL(String(posts()[0][0]), 'http://x').pathname).toBe(
      '/api/admin/doctor-ratings/42/hide',
    );
  });
});
