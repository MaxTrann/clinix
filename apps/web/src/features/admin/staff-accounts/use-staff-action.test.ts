import { act, renderHook } from '@testing-library/react';
import { ApiError } from '../../../shared/api/errors';
import type { StaffNotice } from './staff-types';
import { useStaffAction } from './use-staff-action';

// admin F8, hook chạy một hành động ghi (mã NSF8-65 là [đề xuất], TRACKING admin 9A.20 mục 10.11). Ca này sinh ra từ đột biến M13 (bỏ chặn gửi hai lần) SỐNG ở lần chạy đầu:
// test bấm đúp ở panel không chứng minh được chốt `useRef`, vì sau lần bấm đầu nút đã `disabled`. Hook phải tự chặn khi hai lời gọi `run` đến TRƯỚC khi React vẽ lại nút.
// Phủ TK-45 (hai lần gửi lại đồng thời), TK-10, TK-11 (khoá, mở khoá không gửi hai lần).

const success = (text: string): StaffNotice => ({ kind: 'success', text });
const describe404 = () => 'câu lỗi';

describe('NSF8-65 chặn gửi hai lần', () => {
  it('NSF8-65 hai lời gọi run trong cùng một khung hình (nút chưa kịp tắt): hành động chỉ chạy MỘT lần, onSettled MỘT lần', async () => {
    const onSettled = vi.fn();
    const { result } = renderHook(() => useStaffAction({ onSettled }));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const action = vi.fn(async () => {
      await gate;
      return success('xong');
    });

    await act(async () => {
      void result.current.run(action, describe404);
      void result.current.run(action, describe404);
      release();
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(result.current.notice).toEqual(success('xong'));
  });

  it('NSF8-65 xong rồi thì chạy lại được (chốt được nhả, cả khi hành động lỗi)', async () => {
    const onSettled = vi.fn();
    const { result } = renderHook(() => useStaffAction({ onSettled }));
    const failing = vi.fn(async (): Promise<StaffNotice> => {
      throw new Error('lỗi');
    });
    const working = vi.fn(async () => success('lần hai'));

    await act(async () => {
      await result.current.run(failing, describe404);
    });
    expect(result.current.notice).toEqual({ kind: 'error', text: 'câu lỗi' });
    await act(async () => {
      await result.current.run(working, describe404);
    });

    expect(failing).toHaveBeenCalledTimes(1);
    expect(working).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledTimes(2);
    expect(result.current.notice).toEqual(success('lần hai'));
    expect(result.current.pending).toBe(false);
  });
});

describe('NSF8-66 kết cục và thông báo', () => {
  it('NSF8-66 trong lúc chờ pending là true, thông báo cũ bị xoá; xong thì pending về false', async () => {
    const { result } = renderHook(() => useStaffAction({ onSettled: vi.fn() }));
    await act(async () => {
      await result.current.run(async () => success('cũ'), describe404);
    });
    expect(result.current.notice?.text).toBe('cũ');

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.run(async () => {
        await gate;
        return success('mới');
      }, describe404);
    });
    expect(result.current.pending).toBe(true);
    expect(result.current.notice).toBeNull();

    await act(async () => {
      release();
      await pending;
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.notice?.text).toBe('mới');
  });

  it('NSF8-66 lỗi 404 báo notFound cho onSettled (đóng chi tiết), lỗi khác thì không; chữ lỗi do nơi gọi chọn', async () => {
    const onSettled = vi.fn();
    const { result } = renderHook(() => useStaffAction({ onSettled }));
    const describe = vi.fn((error: unknown) =>
      error instanceof ApiError ? `mã ${error.maLoi}` : 'khác',
    );

    await act(async () => {
      await result.current.run(async () => {
        throw new ApiError(404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' });
      }, describe);
    });
    expect(onSettled).toHaveBeenLastCalledWith({ notFound: true });
    expect(result.current.notice).toEqual({
      kind: 'error',
      text: 'mã KHONG_TIM_THAY',
    });

    await act(async () => {
      await result.current.run(async () => {
        throw new ApiError(409, {
          maLoi: 'TRANG_THAI_KHONG_PHU_HOP',
          thongBao: 'x',
        });
      }, describe);
    });
    expect(onSettled).toHaveBeenLastCalledWith({ notFound: false });
  });

  it('NSF8-66 kết quả cảnh báo của hành động được giữ nguyên là cảnh báo; clearNotice xoá thông báo', async () => {
    const { result } = renderHook(() => useStaffAction({ onSettled: vi.fn() }));
    await act(async () => {
      await result.current.run(
        async () => ({ kind: 'warning', text: 'thư lỗi' }),
        describe404,
      );
    });
    expect(result.current.notice).toEqual({ kind: 'warning', text: 'thư lỗi' });

    act(() => result.current.clearNotice());
    expect(result.current.notice).toBeNull();
  });
});
