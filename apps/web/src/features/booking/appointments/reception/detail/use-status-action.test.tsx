import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../../shared/api/auth-hooks';
import {
  apiErrorResponse,
  jsonResponse,
} from '../../../testing/fake-appointment-list-api';
import { holdResponse } from '../../../testing/appointment-detail-harness';
import { useStatusAction } from './use-status-action';

// booking F9: máy trạng thái CHUNG của ba thao tác của Lễ tân. Mã LTA là [đề xuất] (PLAN booking mục 7.36). Dùng `changeReceptionStatus` thật trên `fetch` giả.
afterEach(() => {
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
});

type Responder = () => Response | Promise<Response>;

function setup(responses: Responder[]) {
  setApiAuthHooks({
    getAccessToken: () => 'token-gia',
    recoverFromUnauthorized: async () => false,
  });
  const queue = [...responses];
  const spy = vi.fn<typeof fetch>(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('hết phản hồi giả');
    return next();
  });
  vi.stubGlobal('fetch', spy);
  const onSucceeded = vi.fn();
  const onStale = vi.fn();
  const view = renderHook(
    (props: { onSucceeded: () => void }) =>
      useStatusAction({
        maLichHen: 'CP20261018001',
        onSucceeded: props.onSucceeded,
        onStale,
      }),
    { initialProps: { onSucceeded } },
  );
  return { ...view, spy, onSucceeded, onStale };
}

const cancelled = () =>
  jsonResponse({
    maLichHen: 'CP20261018001',
    trangThai: 'DaHuy',
    hoanCoc: { tyLe: 100, soTien: '1000.00' },
  });
const checkedIn = () =>
  jsonResponse({ maLichHen: 'CP20261018001', trangThai: 'DaTiepDon' });

describe('luồng thành công', () => {
  it('LTA-03 idle ⇒ submitting ⇒ done kèm kết quả đã kiểm; gọi `onSucceeded` đúng MỘT lần, không `onStale`', async () => {
    const held = holdResponse(cancelled);
    const { result, spy, onSucceeded, onStale } = setup([held.override]);
    expect(result.current.state).toEqual({ kind: 'idle' });

    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = result.current.submit({ trangThai: 'DaHuy', lyDo: 'Bận' });
    });
    expect(result.current.state).toEqual({ kind: 'submitting' });
    expect(result.current.isSending()).toBe(true);

    await act(async () => {
      held.release();
      await done;
    });
    expect(result.current.state).toEqual({
      kind: 'done',
      result: {
        maLichHen: 'CP20261018001',
        trangThai: 'DaHuy',
        hoanCoc: { tyLe: 100, soTien: '1000.00' },
      },
    });
    expect(result.current.isSending()).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(onSucceeded).toHaveBeenCalledTimes(1);
    expect(onStale).not.toHaveBeenCalled();
  });

  it('LTA-09 chặn bấm đúp: ba lần `submit` liên tiếp trong MỘT act ⇒ đúng một POST (cờ bằng ref, state chưa kịp vẽ lại)', async () => {
    const held = holdResponse(checkedIn);
    const { result, spy } = setup([held.override]);
    act(() => {
      void result.current.submit({ trangThai: 'DaTiepDon' });
      void result.current.submit({ trangThai: 'DaTiepDon' });
      void result.current.submit({ trangThai: 'DaTiepDon' });
    });
    expect(spy).toHaveBeenCalledTimes(1);
    await act(async () => held.release());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.state.kind).toBe('done');
  });

  it('LTA-03 `onSucceeded` mới nhất được gọi (không bị kẹt bản của lần vẽ trước)', async () => {
    const { result, rerender, onSucceeded } = setup([checkedIn]);
    const newer = vi.fn();
    rerender({ onSucceeded: newer });
    await act(async () => result.current.submit({ trangThai: 'DaTiepDon' }));
    expect(newer).toHaveBeenCalledTimes(1);
    expect(onSucceeded).not.toHaveBeenCalled();
  });
});

describe('luồng lỗi', () => {
  it('LTA-03 lỗi dừng hẳn (409 đã đổi trạng thái) ⇒ `stopped`, gọi `onStale("detailAndList")`, không `onSucceeded`; `reset` đưa về idle', async () => {
    const { result, onSucceeded, onStale } = setup([
      () =>
        apiErrorResponse(409, 'LICH_HEN_KHONG_CHO_HUY', undefined, {
          trangThai: 'DaTiepDon',
        }),
    ]);
    await act(async () =>
      result.current.submit({ trangThai: 'DaHuy', lyDo: 'Bận' }),
    );
    expect(result.current.state).toMatchObject({
      kind: 'stopped',
      failure: { kind: 'final', refresh: 'detailAndList' },
    });
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(onStale).toHaveBeenCalledWith('detailAndList');
    expect(onSucceeded).not.toHaveBeenCalled();

    act(() => result.current.reset());
    expect(result.current.state).toEqual({ kind: 'idle' });
  });

  it('LTA-03 503 ⇒ `failed` bấm lại được, KHÔNG tải lại; bấm lại thủ công thành công', async () => {
    const { result, spy, onSucceeded, onStale } = setup([
      () => apiErrorResponse(503, 'HE_THONG_DANG_BAN'),
      checkedIn,
    ]);
    await act(async () => result.current.submit({ trangThai: 'DaTiepDon' }));
    expect(result.current.state).toMatchObject({
      kind: 'failed',
      failure: { kind: 'retry' },
    });
    expect(onStale).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(1);

    await act(async () => result.current.submit({ trangThai: 'DaTiepDon' }));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.current.state.kind).toBe('done');
    expect(onSucceeded).toHaveBeenCalledTimes(1);
  });

  it('LTA-11 mạng đứt ⇒ `failed` "chưa rõ" (`uncertain`), đúng MỘT POST và KHÔNG tự gửi lại dù chờ; `onStale` không gọi', async () => {
    const { result, spy, onStale } = setup([
      () => Promise.reject(new TypeError('Failed to fetch')),
      checkedIn,
    ]);
    await act(async () => result.current.submit({ trangThai: 'DaTiepDon' }));
    expect(result.current.state).toMatchObject({
      kind: 'failed',
      failure: { kind: 'uncertain' },
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(onStale).not.toHaveBeenCalled();
  });

  it('LTA-11 200 sai hình dạng (`trangThai` khác đích đã gửi) ⇒ cũng là "chưa rõ", không `onSucceeded`', async () => {
    const { result, onSucceeded } = setup([cancelled]);
    await act(async () => result.current.submit({ trangThai: 'VangMat' }));
    expect(result.current.state).toMatchObject({
      kind: 'failed',
      failure: { kind: 'uncertain' },
    });
    expect(onSucceeded).not.toHaveBeenCalled();
  });

  it('LTA-03 `reset` khi đang gửi không làm gì: vẫn `submitting` cho tới khi phản hồi về', async () => {
    const held = holdResponse(checkedIn);
    const { result } = setup([held.override]);
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.submit({ trangThai: 'DaTiepDon' });
    });
    act(() => result.current.reset());
    expect(result.current.state).toEqual({ kind: 'submitting' });
    await act(async () => {
      held.release();
      await pending;
    });
    expect(result.current.state.kind).toBe('done');
  });
});
