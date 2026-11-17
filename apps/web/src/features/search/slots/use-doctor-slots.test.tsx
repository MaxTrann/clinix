import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import * as api from '../api/search-service';
import type { DoctorSlotsById } from '../api/slot-types';
import { day, NGAY, slot, slotsById } from './testing/slot-fixtures';
import { isSlotDateError, useDoctorSlots } from './use-doctor-slots';

vi.mock('../api/search-service');

// search PR-C2, mã ca SLT-30 đến SLT-36: MỘT lời gọi cho cả trang, đổi ngày hoặc danh sách thì gọi lại và huỷ yêu cầu cũ, lỗi riêng + thử lại.
const NGAY_2 = '2026-11-19';

function deferred() {
  let resolve!: (value: DoctorSlotsById) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<DoctorSlotsById>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ids20 = Array.from({ length: 20 }, (_, index) => String(100 + index));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useDoctorSlots', () => {
  it('SLT-30 MỘT lời gọi cho cả trang 20 bác sĩ (không N+1), đúng id và ngày; không gọi lại khi render lại với cùng id và ngày', async () => {
    vi.mocked(api.getDoctorSlots).mockResolvedValue(
      slotsById(ids20.map((id) => day(id, [slot('901', '08:00')]))),
    );
    const { result, rerender } = renderHook(
      ({ ids, ngay }) => useDoctorSlots(ids, ngay),
      { initialProps: { ids: ids20, ngay: NGAY } },
    );
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(api.getDoctorSlots).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.getDoctorSlots).mock.calls[0][0]).toEqual({
      bacSiIds: ids20,
      ngay: NGAY,
    });
    rerender({ ids: [...ids20], ngay: NGAY });
    expect(api.getDoctorSlots).toHaveBeenCalledTimes(1);
  });

  it('SLT-31 đổi ngày ⇒ gọi lại và HUỶ yêu cầu cũ; phản hồi muộn của ngày cũ không ghi đè kết quả mới', async () => {
    const first = deferred();
    const second = deferred();
    vi.mocked(api.getDoctorSlots)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ ngay }) => useDoctorSlots(['12'], ngay),
      { initialProps: { ngay: NGAY } },
    );
    const firstSignal = vi.mocked(api.getDoctorSlots).mock.calls[0][1];
    rerender({ ngay: NGAY_2 });
    expect(api.getDoctorSlots).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.getDoctorSlots).mock.calls[1][0]).toEqual({
      bacSiIds: ['12'],
      ngay: NGAY_2,
    });
    expect(firstSignal?.aborted).toBe(true);
    // Ngày mới về trước, ngày cũ về sau: chỉ ngày mới được dùng
    await act(async () => {
      second.resolve(
        slotsById([
          day('12', [slot('2', '09:00', 'ConTrong', 'CaSang', NGAY_2)]),
        ]),
      );
    });
    await act(async () => {
      first.resolve(slotsById([day('12', [slot('1', '08:00')])]));
    });
    expect(result.current.state).toMatchObject({ status: 'ready' });
    const state = result.current.state;
    expect(
      state.status === 'ready' && state.data.get('12')?.khungGio[0].khungGioId,
    ).toBe('2');
  });

  it('SLT-32 đổi danh sách bác sĩ (đổi trang hoặc bộ lọc) ⇒ gọi lại cho id mới', async () => {
    vi.mocked(api.getDoctorSlots).mockResolvedValue(
      slotsById([day('12'), day('13')]),
    );
    const { rerender } = renderHook(({ ids }) => useDoctorSlots(ids, NGAY), {
      initialProps: { ids: ['12'] },
    });
    await waitFor(() => expect(api.getDoctorSlots).toHaveBeenCalledTimes(1));
    rerender({ ids: ['12', '13'] });
    await waitFor(() => expect(api.getDoctorSlots).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.getDoctorSlots).mock.calls[1][0].bacSiIds).toEqual([
      '12',
      '13',
    ]);
  });

  it('SLT-33 không có bác sĩ nào ⇒ KHÔNG gọi mạng, kết quả rỗng', async () => {
    const { result } = renderHook(() => useDoctorSlots([], NGAY));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(api.getDoctorSlots).not.toHaveBeenCalled();
    const state = result.current.state;
    expect(state.status === 'ready' && state.data.size).toBe(0);
  });

  it('SLT-34 lỗi mạng, hết giờ, 200 sai hình dạng, 500 ⇒ trạng thái lỗi; `retry` gọi lại đúng lần gọi hiện tại rồi thành công', async () => {
    for (const error of [
      new NetworkError(),
      new TimeoutError(),
      new UnexpectedResponseError(200),
      new ApiError(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
    ]) {
      vi.mocked(api.getDoctorSlots).mockReset();
      vi.mocked(api.getDoctorSlots)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(slotsById([day('12')]));
      const { result, unmount } = renderHook(() =>
        useDoctorSlots(['12'], NGAY),
      );
      await waitFor(() => expect(result.current.state.status).toBe('error'));
      expect(result.current.state).toMatchObject({ error });
      act(() => result.current.retry());
      await waitFor(() => expect(result.current.state.status).toBe('ready'));
      expect(api.getDoctorSlots).toHaveBeenCalledTimes(2);
      expect(vi.mocked(api.getDoctorSlots).mock.calls[1][0]).toEqual({
        bacSiIds: ['12'],
        ngay: NGAY,
      });
      unmount();
    }
  });
});

describe('isSlotDateError (SLT-35)', () => {
  const bad = (
    loi: { truong: string; ma: string }[] | undefined,
    status = 400,
  ) =>
    new ApiError(status, { maLoi: 'BO_LOC_KHONG_HOP_LE', thongBao: 'x', loi });

  it('SLT-35 400 có lỗi ở trường `ngay` (ngoài khoảng hoặc không hợp lệ) ⇒ true', () => {
    expect(
      isSlotDateError(bad([{ truong: 'ngay', ma: 'NGAY_NGOAI_KHOANG' }])),
    ).toBe(true);
    expect(
      isSlotDateError(bad([{ truong: 'ngay', ma: 'NGAY_KHONG_HOP_LE' }])),
    ).toBe(true);
    expect(
      isSlotDateError(
        bad([
          { truong: 'bacSiIds', ma: 'QUA_NHIEU_BAC_SI' },
          { truong: 'ngay', ma: 'NGAY_NGOAI_KHOANG' },
        ]),
      ),
    ).toBe(true);
  });

  it('SLT-35 lỗi khác ⇒ false: 400 của `bacSiIds`, mã `ngay` lạ, không có `loi`, 500, mạng, hết giờ, 200 sai hình dạng, không phải lỗi', () => {
    expect(
      isSlotDateError(bad([{ truong: 'bacSiIds', ma: 'QUA_NHIEU_BAC_SI' }])),
    ).toBe(false);
    expect(isSlotDateError(bad([{ truong: 'ngay', ma: 'MA_LA' }]))).toBe(false);
    expect(isSlotDateError(bad(undefined))).toBe(false);
    expect(
      isSlotDateError(bad([{ truong: 'ngay', ma: 'NGAY_NGOAI_KHOANG' }], 500)),
    ).toBe(false);
    for (const error of [
      new NetworkError(),
      new TimeoutError(),
      new UnexpectedResponseError(200),
      null,
      'x',
    ])
      expect(isSlotDateError(error)).toBe(false);
  });
});
