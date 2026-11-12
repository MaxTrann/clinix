import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  useRemote,
  type RemoteState,
} from '../../../../shared/hooks/use-remote';
import { useKeepPrevious } from './use-keep-previous';

// booking F8: hook giữ kết quả cũ trong lúc tải lại (trả TECH_DEBT 108 và 112). Mã KPR là [đề xuất] (PLAN booking mục 7.34). Ngoài các ca dưới đây, hành vi cũ
// của F1 và F2 được giữ bởi LHL-*, LCT-* và HHL-* chạy lại nguyên văn.
type Page = { name: string };
const A: Page = { name: 'A' };
const B: Page = { name: 'B' };
const ready = (data: Page): RemoteState<Page> => ({ status: 'ready', data });
const LOADING: RemoteState<Page> = { status: 'loading' };
const failed = (error: unknown): RemoteState<Page> => ({
  status: 'error',
  error,
});

function mount(
  initial: RemoteState<Page>,
  shouldKeep?: (data: Page) => boolean,
) {
  return renderHook(
    ({ state }: { state: RemoteState<Page> }) =>
      useKeepPrevious(state, shouldKeep),
    { initialProps: { state: initial } },
  );
}

describe('booking F8 — useKeepPrevious', () => {
  it('KPR-01 lần tải đầu: chưa có gì để giữ ⇒ loading; lỗi ngay lần đầu ⇒ error kèm previous null', () => {
    const first = mount(LOADING);
    expect(first.result.current).toEqual({ kind: 'loading' });

    const error = new Error('mạng');
    const second = mount(failed(error));
    expect(second.result.current).toEqual({
      kind: 'error',
      error,
      previous: null,
    });
  });

  it('KPR-02 đang tải lại thì hiện bản cũ kèm refreshing; bản mới về thì thay bản cũ', () => {
    const view = mount(ready(A));
    expect(view.result.current).toEqual({
      kind: 'ready',
      data: A,
      refreshing: false,
    });

    view.rerender({ state: LOADING });
    expect(view.result.current).toEqual({
      kind: 'ready',
      data: A,
      refreshing: true,
    });

    view.rerender({ state: ready(B) });
    expect(view.result.current).toEqual({
      kind: 'ready',
      data: B,
      refreshing: false,
    });

    // Tải lại lần nữa: bản cũ là B (không quay về A)
    view.rerender({ state: LOADING });
    expect(view.result.current).toMatchObject({ data: B, refreshing: true });
  });

  it('KPR-03 lỗi mang theo bản `ready` gần nhất; hết lỗi (tải lại xong) thì trở về ready', () => {
    const error = new Error('5xx');
    const view = mount(ready(A));
    view.rerender({ state: failed(error) });
    expect(view.result.current).toEqual({
      kind: 'error',
      error,
      previous: A,
    });

    // Sau lỗi, đang tải lại vẫn thấy bản cũ (không về loading)
    view.rerender({ state: LOADING });
    expect(view.result.current).toMatchObject({ data: A, refreshing: true });

    view.rerender({ state: ready(B) });
    expect(view.result.current).toMatchObject({ data: B, refreshing: false });
  });

  it('KPR-04 `shouldKeep` trả false: kết quả đó không được hiện và không được giữ làm bản cũ', () => {
    const rejectB = (data: Page) => data !== B;

    // Chưa có bản cũ: kết quả bị bỏ coi như đang tải lần đầu
    const first = mount(ready(B), rejectB);
    expect(first.result.current).toEqual({ kind: 'loading' });

    // Có bản cũ A: kết quả bị bỏ hiện A (refreshing), và KHÔNG ghi đè A
    const view = mount(ready(A), rejectB);
    view.rerender({ state: ready(B) });
    expect(view.result.current).toEqual({
      kind: 'ready',
      data: A,
      refreshing: true,
    });
    view.rerender({ state: failed(new Error('x')) });
    expect(view.result.current).toMatchObject({ kind: 'error', previous: A });
  });

  it('KPR-05 cùng một dữ liệu vẽ lại nhiều lần không làm hook lặp vô hạn (cập nhật trong lúc render chỉ khi dữ liệu đổi)', () => {
    let renders = 0;
    const state = ready(A);
    const view = renderHook(() => {
      renders += 1;
      return useKeepPrevious(state);
    });
    // Số lượt vẽ lúc dựng (có `setState` trong lúc render) là chi tiết của React: chỉ cần hữu hạn
    expect(renders).toBeLessThan(5);
    const afterMount = renders;
    view.rerender();
    view.rerender();
    // Dữ liệu không đổi nên không `setState` nữa: mỗi `rerender` đúng MỘT lượt vẽ
    expect(renders).toBe(afterMount + 2);
  });

  it('KPR-06 ghép với `useRemote` thật: `retry()` giữ bản cũ trong lúc tải lại rồi hiện bản mới', async () => {
    const results = [A, B];
    let call = 0;
    const view = renderHook(() => {
      const { state, retry } = useRemote(async () => results[call++], []);
      return { view: useKeepPrevious(state), retry };
    });

    await waitFor(() =>
      expect(view.result.current.view).toEqual({
        kind: 'ready',
        data: A,
        refreshing: false,
      }),
    );

    act(() => view.result.current.retry());
    // Ngay sau `retry`, `useRemote` là loading nhưng hook vẫn hiện A
    expect(view.result.current.view).toMatchObject({
      data: A,
      refreshing: true,
    });

    await waitFor(() =>
      expect(view.result.current.view).toEqual({
        kind: 'ready',
        data: B,
        refreshing: false,
      }),
    );
  });
});
