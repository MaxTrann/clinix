import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../../shared/api/errors';
import { COMMON_LIST_TEXT } from '../list-text';
import { describeLookupFailure } from './request-handle-failure';
import { HANDLE_TEXT } from './request-handle-text';
import { useReplacementSlot, type FindDoctor } from './use-replacement-slot';

// reschedule F4 Pha B2, `[đề xuất]` WXD-92, WXD-94: câu lỗi khi không lấy được id bác sĩ (hàm thuần) và hook giữ khung giờ thay thế: một lời gọi mỗi lần, huỷ khi đóng, gửi hay rời trang, kết quả muộn bị bỏ.
const apiError = (status: number, maLoi: string) =>
  new ApiError(status, { maLoi, thongBao: 'THONG_BAO_CUA_MAY_CHU' });

describe('câu lỗi khi không lấy được id bác sĩ', () => {
  it.each([
    ['CHUA_DANG_NHAP', 401],
    ['TOKEN_KHONG_HOP_LE', 401],
    ['PHIEN_HET_HIEU_LUC', 401],
  ])('WXD-92 `%s` ⇒ phiên hết hạn', (code, status) => {
    expect(describeLookupFailure(apiError(status, code))).toBe(
      COMMON_LIST_TEXT.sessionExpired,
    );
  });

  it('WXD-92 mạng đứt và quá giờ có câu riêng của lớp API', () => {
    expect(describeLookupFailure(new NetworkError())).toBe(
      NETWORK_ERROR_MESSAGE,
    );
    expect(describeLookupFailure(new TimeoutError())).toBe(
      TIMEOUT_ERROR_MESSAGE,
    );
  });

  it.each([
    ['404', apiError(404, 'KHONG_TIM_THAY')],
    ['403', apiError(403, 'KHONG_DU_QUYEN')],
    ['500', apiError(500, 'LOI_HE_THONG')],
    ['mã lạ', apiError(418, 'constructor')],
    ['200 sai hình dạng', new UnexpectedResponseError(200)],
    ['lỗi lạ', new Error('x')],
  ])('WXD-92 %s ⇒ một câu chung, không in chữ của máy chủ', (_name, error) => {
    expect(describeLookupFailure(error)).toBe(HANDLE_TEXT.pickFailed);
  });
});

// Lời hỏi treo: trả hàm thả và `signal` hook đã truyền
function pending() {
  const held: {
    resolve: (id: string) => void;
    reject: (error: unknown) => void;
    signal: AbortSignal | undefined;
  } = {
    resolve: () => undefined,
    reject: () => undefined,
    signal: undefined,
  };
  const find = vi.fn<FindDoctor>((signal) => {
    held.signal = signal;
    return new Promise<string>((resolve, reject) => {
      held.resolve = resolve;
      held.reject = reject;
    });
  });
  return { held, find };
}

describe('hook khung giờ thay thế', () => {
  it('WXD-93 đang hỏi thì lần gọi thứ hai bị bỏ qua; xong thì gọi `onFound` một lần và về `idle`', async () => {
    const { held, find } = pending();
    const found = vi.fn();
    const { result } = renderHook(() => useReplacementSlot());
    act(() => {
      void result.current.findDoctorId(find, found);
      void result.current.findDoctorId(find, found);
    });
    expect(result.current.lookup).toEqual({ kind: 'loading' });
    expect(find).toHaveBeenCalledTimes(1);
    await act(async () => held.resolve('12'));
    expect(found.mock.calls).toEqual([['12']]);
    expect(result.current.lookup).toEqual({ kind: 'idle' });
  });

  it('WXD-92 lỗi ⇒ `failed` kèm câu; hỏi lại được và xoá câu cũ', async () => {
    const first = pending();
    const second = pending();
    const found = vi.fn();
    const { result } = renderHook(() => useReplacementSlot());
    act(() => {
      void result.current.findDoctorId(first.find, found);
    });
    await act(async () => first.held.reject(new NetworkError()));
    expect(result.current.lookup).toEqual({
      kind: 'failed',
      message: NETWORK_ERROR_MESSAGE,
    });
    act(() => {
      void result.current.findDoctorId(second.find, found);
    });
    expect(result.current.lookup).toEqual({ kind: 'loading' });
    expect(second.find).toHaveBeenCalledTimes(1);
    expect(found).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)(
    'WXD-94 huỷ (`reset`) rồi kết quả muộn (%s) ⇒ không gọi `onFound`, không câu lỗi, `signal` đã huỷ',
    async (outcome) => {
      const { held, find } = pending();
      const found = vi.fn();
      const { result } = renderHook(() => useReplacementSlot());
      act(() => {
        void result.current.findDoctorId(find, found);
      });
      act(() => result.current.reset());
      expect(held.signal?.aborted).toBe(true);
      await act(async () =>
        outcome === 'resolve'
          ? held.resolve('12')
          : held.reject(new NetworkError()),
      );
      expect(found).not.toHaveBeenCalled();
      expect(result.current.lookup).toEqual({ kind: 'idle' });
    },
  );

  it('WXD-94 rời trang (gỡ hook) khi đang hỏi ⇒ `signal` bị huỷ, kết quả muộn không làm gì', async () => {
    const { held, find } = pending();
    const found = vi.fn();
    const { result, unmount } = renderHook(() => useReplacementSlot());
    act(() => {
      void result.current.findDoctorId(find, found);
    });
    unmount();
    expect(held.signal?.aborted).toBe(true);
    await act(async () => held.resolve('12'));
    expect(found).not.toHaveBeenCalled();
  });

  it('WXD-98 `choose` chỉ chép id và giờ bắt đầu; `clearChoice` bỏ lựa chọn; `reset` bỏ cả hai', () => {
    const { result } = renderHook(() => useReplacementSlot());
    const cell = {
      khungGioId: '9223372036854775807',
      batDau: '2026-11-25T01:00:00.000Z',
      ketThuc: '2026-11-25T01:30:00.000Z',
      trangThai: 'ConTrong',
    };
    act(() => result.current.choose(cell));
    expect(result.current.chosen).toEqual({
      khungGioId: cell.khungGioId,
      batDau: cell.batDau,
    });
    act(() => result.current.clearChoice());
    expect(result.current.chosen).toBeNull();
    act(() => result.current.choose(cell));
    act(() => result.current.reset());
    expect(result.current.chosen).toBeNull();
  });
});
