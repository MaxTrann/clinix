import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkError } from '../../../../../shared/api/errors';
import * as api from './reschedule-preview-api';
import type { ReschedulePreview } from './reschedule-types';
import { useReschedulePreview } from './use-reschedule-preview';

vi.mock('./reschedule-preview-api');

// reschedule F1, mã ca WDH-15 [đề xuất]: hook xem trước đổi lịch dựng trên `useRemote`: đổi mã lịch hay `khungGioId` thì gọi lại và HUỶ yêu cầu cũ, kết quả muộn không ghi đè, `retry` gọi lại.
function preview(bacSiId: string): ReschedulePreview {
  return {
    choPhepDoi: true,
    loai: 'TuDoi',
    soLanDaDoi: 0,
    soLanToiDa: 2,
    coYeuCauChoDuyet: false,
    lichCu: { thoiGian: '2026-11-30T02:30:00.000Z', bacSiId },
    lichMoi: null,
    thoiGianMayChu: '2026-11-25T03:00:00.000Z',
  };
}

function deferred() {
  let resolve!: (value: ReschedulePreview) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<ReschedulePreview>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useReschedulePreview', () => {
  it('WDH-15 gọi MỘT lần với đúng mã lịch và `khungGioId = null`; render lại cùng tham số không gọi lại', async () => {
    vi.mocked(api.getReschedulePreview).mockResolvedValue(preview('12'));
    const { result, rerender } = renderHook(
      ({ ma, khungGioId }) => useReschedulePreview(ma, khungGioId),
      { initialProps: { ma: 'CP1', khungGioId: null as string | null } },
    );
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(api.getReschedulePreview).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.getReschedulePreview).mock.calls[0][0]).toBe('CP1');
    expect(vi.mocked(api.getReschedulePreview).mock.calls[0][1]).toBeNull();
    rerender({ ma: 'CP1', khungGioId: null });
    expect(api.getReschedulePreview).toHaveBeenCalledTimes(1);
  });

  it('WDH-15 đổi `khungGioId` ⇒ gọi lại với id mới (chuỗi nguyên vẹn) và HUỶ yêu cầu cũ; phản hồi muộn không ghi đè', async () => {
    const first = deferred();
    const second = deferred();
    vi.mocked(api.getReschedulePreview)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ khungGioId }) => useReschedulePreview('CP1', khungGioId),
      { initialProps: { khungGioId: null as string | null } },
    );
    const firstSignal = vi.mocked(api.getReschedulePreview).mock.calls[0][2];
    rerender({ khungGioId: '9007199254740993' });
    expect(api.getReschedulePreview).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.getReschedulePreview).mock.calls[1][1]).toBe(
      '9007199254740993',
    );
    expect(firstSignal?.aborted).toBe(true);
    // Yêu cầu MỚI về trước, yêu cầu CŨ về sau: chỉ kết quả mới được dùng
    await act(async () => {
      second.resolve(preview('22'));
    });
    await act(async () => {
      first.resolve(preview('11'));
    });
    const state = result.current.state;
    expect(state.status === 'ready' && state.data.lichCu.bacSiId).toBe('22');
  });

  it('WDH-15 đổi mã lịch ⇒ về `loading` ngay (không hiện kết quả của lịch trước)', async () => {
    vi.mocked(api.getReschedulePreview).mockImplementation(async (ma) =>
      preview(ma === 'CP1' ? '11' : '22'),
    );
    const { result, rerender } = renderHook(
      ({ ma }) => useReschedulePreview(ma, null),
      { initialProps: { ma: 'CP1' } },
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    rerender({ ma: 'CP2' });
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    const state = result.current.state;
    expect(state.status === 'ready' && state.data.lichCu.bacSiId).toBe('22');
  });

  it('WDH-15 lỗi ⇒ `error` kèm đúng lỗi; `retry` gọi lại đúng một lần và có thể thành công', async () => {
    const failure = new NetworkError();
    vi.mocked(api.getReschedulePreview)
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(preview('12'));
    const { result } = renderHook(() => useReschedulePreview('CP1', null));
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    const state = result.current.state;
    expect(state.status === 'error' && state.error).toBe(failure);
    expect(api.getReschedulePreview).toHaveBeenCalledTimes(1);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(api.getReschedulePreview).toHaveBeenCalledTimes(2);
  });

  it('WDH-15 gỡ hook ⇒ huỷ yêu cầu đang chờ (không ghi state sau khi gỡ)', async () => {
    const pending = deferred();
    vi.mocked(api.getReschedulePreview).mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useReschedulePreview('CP1', null));
    const signal = vi.mocked(api.getReschedulePreview).mock.calls[0][2];
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
