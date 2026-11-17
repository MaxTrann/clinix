import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminReviewPage } from '../api/admin-review-types';
import { listAdminReviews } from '../api/exam-api';
import { normalizeSearch, SEARCH_DEBOUNCE_MS, useReviews } from './use-reviews';

// doctor-exam F7, WKD-14 [đề xuất]: hook lọc và tải của trang Kiểm duyệt đánh giá. `listAdminReviews` được thay bằng giả (kiểm query và `signal`); đồng hồ giả CHỈ cho `setTimeout` để chạy debounce 300 ms. Dữ liệu giả.
vi.mock('../api/exam-api', () => ({ listAdminReviews: vi.fn() }));
const listMock = vi.mocked(listAdminReviews);

const pageOf = (overrides: Partial<AdminReviewPage> = {}): AdminReviewPage => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  demTheoTrangThai: { HienThi: 0, DaAn: 0 },
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
const lastQuery = () => listMock.mock.calls.at(-1)![0];
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  listMock.mockReset();
  listMock.mockImplementation(() => Promise.resolve(pageOf()));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('doctor-exam F7 — chuẩn hoá `q` (WKD-14)', () => {
  const lone = '\uD83D'; // nửa trước của cặp thay thế, đứng một mình
  it.each([
    ['', undefined],
    ['   ', undefined],
    ['\t\n', undefined],
    ['  Vũ Thị F  ', 'Vũ Thị F'],
    ['a'.repeat(100), 'a'.repeat(100)],
    ['a'.repeat(101), 'a'.repeat(100)],
    ['a'.repeat(300), 'a'.repeat(100)],
    // sau khi cắt còn khoảng trắng cuối thì bỏ nốt
    [`${'a'.repeat(99)} b`, 'a'.repeat(99)],
    // cắt giữa cặp thay thế (emoji hai đơn vị) thì lùi một đơn vị, không để nửa emoji
    [`${'a'.repeat(99)}😀`, 'a'.repeat(99)],
    [`${'a'.repeat(98)}😀`, `${'a'.repeat(98)}😀`],
    [`  ${'a'.repeat(100)}  `, 'a'.repeat(100)],
    [lone, undefined],
  ])('WKD-14 normalizeSearch(%j) = %j', (raw, expected) => {
    expect(normalizeSearch(raw)).toBe(expected);
  });

  it('WKD-14 kết quả không bao giờ dài hơn 100 đơn vị UTF-16 và không kết thúc bằng nửa cặp thay thế', () => {
    for (let length = 95; length <= 110; length += 1) {
      const out = normalizeSearch(`${'a'.repeat(length)}😀😀`) ?? '';
      expect(out.length).toBeLessThanOrEqual(100);
      expect(/[\uD800-\uDBFF]$/.test(out)).toBe(false);
    }
  });
});

describe('doctor-exam F7 — hook useReviews (WKD-14)', () => {
  it('WKD-14 lần đầu: MỘT lời gọi, trang 1, 20 dòng, không bộ lọc nào; chưa có số đếm cho tới khi tải xong', async () => {
    const { result } = renderHook(() => useReviews(false));
    expect(listMock).toHaveBeenCalledTimes(1);
    expect(lastQuery()).toEqual({ page: 1, pageSize: 20 });
    expect(result.current.list.state.status).toBe('loading');
    expect(result.current.counts).toBeNull();
    expect(result.current.hasFilters).toBe(false);
    await flush();
    expect(result.current.list.state.status).toBe('ready');
    expect(result.current.counts).toEqual({ HienThi: 0, DaAn: 0 });
  });

  it('WKD-14 debounce: gõ liên tiếp trong 300 ms chỉ gọi MỘT lần với giá trị cuối; trước 300 ms thì chưa gọi', async () => {
    const { result } = renderHook(() => useReviews(false));
    await flush();
    act(() => result.current.change({ q: 'a' }));
    await advance(100);
    act(() => result.current.change({ q: 'ab' }));
    await advance(100);
    act(() => result.current.change({ q: 'abc' }));
    await advance(SEARCH_DEBOUNCE_MS - 1);
    expect(listMock).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(listMock).toHaveBeenCalledTimes(2);
    expect(lastQuery().q).toBe('abc');
    expect(SEARCH_DEBOUNCE_MS).toBe(300);
  });

  it('WKD-14 `q` toàn khoảng trắng hoặc chỉ thêm khoảng trắng ở rìa ⇒ KHÔNG gọi lại; `q` dài ⇒ gửi đúng 100 ký tự', async () => {
    const { result } = renderHook(() => useReviews(false));
    await flush();
    act(() => result.current.change({ q: '   ' }));
    await advance(SEARCH_DEBOUNCE_MS + 50);
    expect(listMock).toHaveBeenCalledTimes(1);

    act(() => result.current.change({ q: 'x'.repeat(150) }));
    await advance(SEARCH_DEBOUNCE_MS);
    expect(lastQuery().q).toBe('x'.repeat(100));
    const calls = listMock.mock.calls.length;
    act(() => result.current.change({ q: ` ${'x'.repeat(150)} ` }));
    await advance(SEARCH_DEBOUNCE_MS + 50);
    expect(listMock.mock.calls.length).toBe(calls);
  });

  it('WKD-14 đổi bất kỳ bộ lọc nào ⇒ về trang 1; đổi trang không đổi bộ lọc', async () => {
    const { result } = renderHook(() => useReviews(false));
    await flush();
    act(() => result.current.setPage(3));
    expect(lastQuery().page).toBe(3);

    act(() => result.current.change({ soSao: '5' }));
    expect(lastQuery()).toMatchObject({ page: 1, soSao: 5 });

    act(() => result.current.setPage(2));
    expect(lastQuery()).toMatchObject({ page: 2, soSao: 5 });

    for (const patch of [
      { trangThai: 'DaAn' as const },
      { bacSiId: '11' },
      { chiNhanhId: '2' },
    ]) {
      act(() => result.current.setPage(4));
      act(() => result.current.change(patch));
      expect(lastQuery().page).toBe(1);
    }
    act(() => result.current.setPage(4));
    act(() => result.current.change({ q: 'abc' }));
    expect(result.current.page).toBe(1);
  });

  it('WKD-14 query: số sao đổi sang SỐ, "Tất cả" (rỗng) ⇒ vắng khoá, `hasFilters` theo bộ lọc', async () => {
    const { result } = renderHook(() => useReviews(false));
    await flush();
    act(() =>
      result.current.change({
        soSao: '3',
        bacSiId: '12',
        trangThai: 'HienThi',
        chiNhanhId: '2',
      }),
    );
    expect(lastQuery()).toEqual({
      page: 1,
      pageSize: 20,
      soSao: 3,
      bacSiId: '12',
      trangThai: 'HienThi',
      chiNhanhId: '2',
    });
    expect(result.current.hasFilters).toBe(true);
    act(() =>
      result.current.change({
        soSao: '',
        bacSiId: '',
        trangThai: '',
        chiNhanhId: '',
      }),
    );
    expect(lastQuery()).toEqual({ page: 1, pageSize: 20 });
    expect(result.current.hasFilters).toBe(false);
  });

  it('WKD-14 phạm vi: Toàn hệ thống gửi `chiNhanhId`; Admin Chi nhánh KHÔNG BAO GIỜ gửi, kể cả khi state còn giá trị', async () => {
    const system = renderHook(() => useReviews(false));
    await flush();
    act(() => system.result.current.change({ chiNhanhId: '2' }));
    expect(lastQuery().chiNhanhId).toBe('2');
    system.unmount();

    listMock.mockClear();
    const branch = renderHook(() => useReviews(true));
    await flush();
    act(() => branch.result.current.change({ chiNhanhId: '2' }));
    expect(branch.result.current.filters.chiNhanhId).toBe('2');
    expect(
      listMock.mock.calls.some(([query]) => query.chiNhanhId !== undefined),
    ).toBe(false);
    expect(branch.result.current.hasFilters).toBe(false);
  });

  it('WKD-14 đổi bộ lọc HUỶ yêu cầu cũ (signal đã abort) và kết quả đến muộn của yêu cầu cũ KHÔNG ghi đè kết quả mới', async () => {
    const first = deferred<AdminReviewPage>();
    const second = deferred<AdminReviewPage>();
    listMock.mockReset();
    listMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { result } = renderHook(() => useReviews(false));
    const firstSignal = listMock.mock.calls[0][1]!;
    expect(firstSignal.aborted).toBe(false);

    act(() => result.current.change({ soSao: '5' }));
    expect(firstSignal.aborted).toBe(true);
    expect(listMock.mock.calls[1][1]!.aborted).toBe(false);

    second.resolve(
      pageOf({ total: 7, demTheoTrangThai: { HienThi: 7, DaAn: 0 } }),
    );
    await flush();
    first.resolve(
      pageOf({ total: 99, demTheoTrangThai: { HienThi: 99, DaAn: 0 } }),
    );
    await flush();
    const state = result.current.list.state;
    expect(state.status === 'ready' && state.data.total).toBe(7);
    expect(result.current.counts).toEqual({ HienThi: 7, DaAn: 0 });
  });

  it('WKD-14 trang vượt cuối (dữ liệu vừa ít đi): `items` rỗng, `total` > 0 ⇒ tự về trang cuối rồi tải lại', async () => {
    const { result } = renderHook(() => useReviews(false));
    await flush();
    listMock.mockImplementationOnce(() =>
      Promise.resolve(pageOf({ items: [], total: 15, page: 3 })),
    );
    act(() => result.current.setPage(3));
    await flush();
    expect(result.current.page).toBe(1);
    expect(lastQuery().page).toBe(1);
  });

  it('WKD-14 trang rỗng nhưng còn trong phạm vi, hay `total` 0 ⇒ KHÔNG tự đổi trang', async () => {
    const { result } = renderHook(() => useReviews(false));
    await flush();
    // `total` 0 (mặc định của giả): không có gì để lùi về
    act(() => result.current.setPage(2));
    await flush();
    expect(result.current.page).toBe(2);
    // trang 2 của 2 trang (25 dòng) mà rỗng: còn trong phạm vi nên giữ nguyên
    listMock.mockImplementation(() =>
      Promise.resolve(pageOf({ items: [], total: 25, page: 2 })),
    );
    act(() => result.current.change({ soSao: '1' }));
    act(() => result.current.setPage(2));
    await flush();
    expect(result.current.page).toBe(2);
  });

  it('WKD-14 số đếm: giữ số cũ trong lúc tải lại (chip không nhấp nháy); lỗi ⇒ ẩn; `Thử lại` gọi lại ĐÚNG query đó', async () => {
    listMock.mockImplementation(() =>
      Promise.resolve(
        pageOf({ total: 5, demTheoTrangThai: { HienThi: 3, DaAn: 2 } }),
      ),
    );
    const { result } = renderHook(() => useReviews(false));
    await flush();
    expect(result.current.counts).toEqual({ HienThi: 3, DaAn: 2 });

    const pending = deferred<AdminReviewPage>();
    listMock.mockImplementationOnce(() => pending.promise);
    act(() => result.current.change({ soSao: '2' }));
    expect(result.current.list.state.status).toBe('loading');
    expect(result.current.counts).toEqual({ HienThi: 3, DaAn: 2 });

    pending.reject(new Error('mạng'));
    await flush();
    expect(result.current.list.state.status).toBe('error');
    expect(result.current.counts).toBeNull();

    const before = listMock.mock.calls.length;
    act(() => result.current.list.retry());
    expect(listMock.mock.calls.length).toBe(before + 1);
    expect(lastQuery()).toMatchObject({ page: 1, soSao: 2 });
  });

  it('WKD-14 `reload` tải lại đúng query hiện tại và có định danh ỔN ĐỊNH giữa các lần render', async () => {
    const { result, rerender } = renderHook(() => useReviews(false));
    await flush();
    const reload = result.current.reload;
    rerender();
    expect(result.current.reload).toBe(reload);
    act(() => result.current.change({ bacSiId: '11' }));
    const before = listMock.mock.calls.length;
    act(() => result.current.reload());
    expect(listMock.mock.calls.length).toBe(before + 1);
    expect(lastQuery()).toMatchObject({ page: 1, bacSiId: '11' });
  });
});
