import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '../../../../shared/api/errors';
import {
  PATIENT_FAILURE_CONTEXT,
  type FailureContext,
} from './reschedule-failure';
import { useRescheduleSubmit } from './use-reschedule-submit';

// reschedule F3, mã ca WDO-12 [đề xuất]: HOOK LÕI gửi đổi lịch (dùng chung Bệnh nhân và Lễ tân đổi hộ). Thử TRỰC TIẾP (không qua trang) từng điểm mà F2 đã khoá: chốt `useRef` (hai cú bấm một nhịp render), hạ chốt ở
// `finally`, cờ còn gắn trang, "chưa rõ" kèm gợi ý, `forcedRequest`, `reasonFocus`, về lưới khi khung giờ không còn. Các ca WDH-37, WDH-39 ở trang Bệnh nhân và WDO-05, WDO-06 ở trang Lễ tân chạy qua hook này. Dữ liệu giả.
const STAFF: FailureContext = {
  reasonField: 'lyDo',
  reasonInvalidMessage: 'CAU_LY_DO',
  askReasonOnOverLimit: false,
  uncertainMessage: 'CAU_CHUA_RO',
  afterUncertainHint: 'GOI_Y',
  succeededAfterUncertain: ['LICH_HEN_KHONG_CHO_DOI'],
};

const api = (
  maLoi: string,
  extra: { status?: number; loi?: { truong: string; ma: string }[] } = {},
) =>
  new ApiError(extra.status ?? 409, {
    maLoi,
    thongBao: 'THONG_BAO_NOI_BO',
    loi: extra.loi,
  });

// Một lời gọi gửi mà test quyết khi nào trả lời
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(context: FailureContext = PATIENT_FAILURE_CONTEXT) {
  const onDone = vi.fn();
  const onSlotGone = vi.fn();
  const sends: ReturnType<typeof deferred<string>>[] = [];
  const send = vi.fn<(reason: string | null) => Promise<string>>(() => {
    const call = deferred<string>();
    sends.push(call);
    return call.promise;
  });
  const hook = renderHook(() =>
    useRescheduleSubmit<string>({ send, context, onDone, onSlotGone }),
  );
  return { hook, send, sends, onDone, onSlotGone };
}

describe('chốt gửi một lần (WDO-12)', () => {
  it('WDO-12 hai (và ba) lần `submit` trong CÙNG một nhịp render ⇒ `send` chỉ được gọi MỘT lần; trạng thái `submitting`', async () => {
    const { hook, send, sends } = setup();
    act(() => {
      void hook.result.current.submit('Lý do');
      void hook.result.current.submit('Lý do');
      void hook.result.current.submit('Lý do');
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('Lý do');
    expect(hook.result.current.state).toEqual({ kind: 'submitting' });
    await act(async () => sends[0].resolve('xong'));
  });

  it('WDO-12 lời gọi đang chờ mà `submit` thêm lần nữa (trước khi trả lời) ⇒ vẫn bị chặn', async () => {
    const { hook, send, sends } = setup();
    await act(async () => {
      void hook.result.current.submit('a');
    });
    await act(async () => {
      void hook.result.current.submit('b');
    });
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => sends[0].resolve('xong'));
  });

  it('WDO-12 HẠ chốt ở `finally`: sau lỗi gửi lại được; sau lần thành công chốt cũng hạ (không kẹt ở lần sau)', async () => {
    const { hook, send, sends, onDone } = setup();
    await act(async () => {
      void hook.result.current.submit('a');
    });
    await act(async () =>
      sends[0].reject(api('HE_THONG_DANG_BAN', { status: 503 })),
    );
    expect(hook.result.current.state).toMatchObject({
      kind: 'failed',
      failure: { kind: 'retry' },
    });
    await act(async () => {
      void hook.result.current.submit('a');
    });
    expect(send).toHaveBeenCalledTimes(2);
    await act(async () => sends[1].resolve('xong'));
    expect(onDone).toHaveBeenCalledWith('xong');
    await act(async () => {
      void hook.result.current.submit('a');
    });
    expect(send).toHaveBeenCalledTimes(3);
    await act(async () => sends[2].resolve('xong'));
  });
});

describe('kết quả (WDO-12)', () => {
  it('WDO-12 thành công ⇒ `onDone` đúng một lần với kết quả; trạng thái ở lại `submitting` (nút không bật lại giữa chừng)', async () => {
    const { hook, sends, onDone, onSlotGone } = setup();
    await act(async () => {
      void hook.result.current.submit(null);
    });
    await act(async () => sends[0].resolve('ket-qua'));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('ket-qua');
    expect(onSlotGone).not.toHaveBeenCalled();
    expect(hook.result.current.state).toEqual({ kind: 'submitting' });
  });

  it('WDO-12 RỜI trang giữa lúc chờ (gỡ hook) ⇒ trả lời đến sau KHÔNG gọi `onDone`, `onSlotGone` và không cập nhật trạng thái', async () => {
    const { hook, sends, onDone, onSlotGone } = setup();
    await act(async () => {
      void hook.result.current.submit('a');
    });
    hook.unmount();
    await act(async () => sends[0].resolve('xong'));
    expect(onDone).not.toHaveBeenCalled();
    expect(onSlotGone).not.toHaveBeenCalled();
  });

  it('WDO-12 rời trang rồi lỗi đến sau cũng không gọi `onSlotGone`', async () => {
    const { hook, sends, onSlotGone } = setup();
    await act(async () => {
      void hook.result.current.submit('a');
    });
    hook.unmount();
    await act(async () => sends[0].reject(api('KHUNG_GIO_DA_DAT')));
    expect(onSlotGone).not.toHaveBeenCalled();
  });

  it.each([
    ['KHUNG_GIO_DA_DAT', 409],
    ['KHUNG_GIO_DANG_GIU', 409],
    ['KHUNG_GIO_DA_QUA', 409],
    ['KHUNG_GIO_KHONG_TON_TAI', 404],
  ])(
    'WDO-12 %s ⇒ `onSlotGone(mã)` (trang về lưới), KHÔNG vào `failed`',
    async (code, status) => {
      const { hook, sends, onSlotGone, onDone } = setup();
      await act(async () => {
        void hook.result.current.submit('a');
      });
      await act(async () => sends[0].reject(api(code, { status })));
      expect(onSlotGone).toHaveBeenCalledWith(code);
      expect(onDone).not.toHaveBeenCalled();
      expect(hook.result.current.state.kind).toBe('submitting');
    },
  );
});

describe('lỗi theo ngữ cảnh (WDO-12)', () => {
  it('WDO-12 ngữ cảnh Bệnh nhân: `VUOT_SO_LAN_TU_DOI` ⇒ `needsReason`, `forcedRequest` bật và `reasonFocus` tăng', async () => {
    const { hook, sends } = setup(PATIENT_FAILURE_CONTEXT);
    await act(async () => {
      void hook.result.current.submit(null);
    });
    await act(async () => sends[0].reject(api('VUOT_SO_LAN_TU_DOI')));
    expect(hook.result.current.forcedRequest).toBe(true);
    expect(hook.result.current.reasonFocus).toBe(1);
    expect(hook.result.current.state).toMatchObject({
      kind: 'failed',
      failure: { kind: 'needsReason' },
    });
  });

  it('WDO-12 ngữ cảnh Lễ tân: cùng mã KHÔNG bật `forcedRequest` và không đưa tiêu điểm vào ô', async () => {
    const { hook, sends } = setup(STAFF);
    await act(async () => {
      void hook.result.current.submit('a');
    });
    await act(async () => sends[0].reject(api('VUOT_SO_LAN_TU_DOI')));
    expect(hook.result.current.forcedRequest).toBe(false);
    expect(hook.result.current.reasonFocus).toBe(0);
    expect(hook.result.current.state).toMatchObject({
      kind: 'failed',
      failure: { kind: 'backToDetail' },
    });
  });

  it('WDO-12 400 ở trường lý do của ngữ cảnh ⇒ `reasonInvalid` kèm câu của ngữ cảnh, `reasonFocus` tăng mỗi lần lỗi', async () => {
    const { hook, sends } = setup(STAFF);
    const bad = () =>
      api('DU_LIEU_KHONG_HOP_LE', {
        status: 400,
        loi: [{ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' }],
      });
    await act(async () => {
      void hook.result.current.submit('a');
    });
    await act(async () => sends[0].reject(bad()));
    expect(hook.result.current.state).toMatchObject({
      kind: 'failed',
      failure: { kind: 'reasonInvalid', message: 'CAU_LY_DO' },
    });
    expect(hook.result.current.reasonFocus).toBe(1);
    await act(async () => {
      void hook.result.current.submit('b');
    });
    await act(async () => sends[1].reject(bad()));
    expect(hook.result.current.reasonFocus).toBe(2);
  });

  it('WDO-12 "chưa rõ" (mạng) rồi gửi lại ra mã "đã thành công" của ngữ cảnh ⇒ câu kèm GỢI Ý; mã khác thì không', async () => {
    const { hook, sends } = setup(STAFF);
    await act(async () => {
      void hook.result.current.submit('a');
    });
    await act(async () => sends[0].reject(new NetworkError()));
    expect(hook.result.current.state).toMatchObject({
      kind: 'failed',
      failure: { kind: 'uncertain', message: 'CAU_CHUA_RO' },
    });
    await act(async () => {
      void hook.result.current.submit('a');
    });
    await act(async () => sends[1].reject(api('LICH_HEN_KHONG_CHO_DOI')));
    const state = hook.result.current.state;
    expect(state.kind === 'failed' && state.failure.message).toMatch(/GOI_Y$/);

    await act(async () => {
      void hook.result.current.submit('a');
    });
    await act(async () => sends[2].reject(api('LICH_HEN_DA_QUA_GIO')));
    const other = hook.result.current.state;
    expect(other.kind === 'failed' && other.failure.message).not.toMatch(
      /GOI_Y/,
    );
  });

  it('WDO-12 lỗi KHÔNG có "chưa rõ" trước đó ⇒ không có gợi ý, dù cùng mã', async () => {
    const { hook, sends } = setup(STAFF);
    await act(async () => {
      void hook.result.current.submit('a');
    });
    await act(async () => sends[0].reject(api('LICH_HEN_KHONG_CHO_DOI')));
    const state = hook.result.current.state;
    expect(state.kind === 'failed' && state.failure.message).not.toMatch(
      /GOI_Y/,
    );
  });
});
