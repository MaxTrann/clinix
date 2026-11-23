import { act, renderHook } from '@testing-library/react';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import type { AdminMe } from '../admin-me';
import { FORBIDDEN_MESSAGE } from '../account-common/account-errors';
import {
  EMAIL_IN_USE_MESSAGE,
  GENERAL_INVALID_MESSAGE,
} from './staff-create-errors';
import {
  BLANK_MESSAGE,
  initialValues,
  type CreateValues,
} from './staff-create-model';
import { createStaff, type CreateOutcome } from './staff-create-service';
import { useStaffCreate } from './use-staff-create';

// admin F8 PR2, hook trạng thái của hộp "Tạo tài khoản nhân sự" (mã NSF8-104 là [đề xuất], TRACKING admin 9A.21 mục 3). Ca này có vì bài học đột biến M13 của PR1: test bấm đúp ở
// giao diện KHÔNG chứng minh được chốt `useRef`, vì sau lần bấm đầu nút đã `disabled`. Hook phải tự chặn khi hai lời gọi `submit` đến TRƯỚC khi React vẽ lại nút.
// Phủ NS-09 (409 giữ dữ liệu), NS-11, NS-19 (thư lỗi không thành "đã gửi"), NS-26, NS-45 (phía giao diện).

vi.mock('./staff-create-service', () => ({ createStaff: vi.fn() }));
const createMock = vi.mocked(createStaff);

const SYSTEM: AdminMe = { phamVi: 'ToanHeThong' };
const BRANCH_ME: AdminMe = {
  phamVi: 'ChiNhanh',
  chiNhanh: { id: '5', ten: 'Chi nhánh Quận 1' },
};

const valid: CreateValues = {
  ...initialValues(SYSTEM),
  vaiTro: 'LeTan',
  hoTen: 'Lê Văn An',
  email: ' an@example.invalid ',
  soDienThoai: '0912345678',
  chiNhanhId: '5',
};

function setup(me: AdminMe = SYSTEM) {
  const onCreated = vi.fn();
  const hook = renderHook(() => useStaffCreate({ me, onCreated }));
  act(() => hook.result.current.update(valid));
  return { ...hook, onCreated };
}

function gate<T>() {
  let release!: (value: T) => void;
  let fail!: (error: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    release = resolve;
    fail = reject;
  });
  return { promise, release, fail };
}

beforeEach(() => {
  createMock.mockReset();
});

describe('NSF8-104 chặn gửi hai lần (NS-09, NS-45)', () => {
  it('NSF8-104 hai lời gọi submit trong cùng một khung hình (nút chưa kịp tắt): chỉ MỘT lần gọi API, onCreated MỘT lần', async () => {
    const { result, onCreated } = setup();
    const pending = gate<CreateOutcome>();
    createMock.mockReturnValue(pending.promise);

    await act(async () => {
      void result.current.submit();
      void result.current.submit();
      pending.release({ kind: 'sent', taiKhoanId: '77' });
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toEqual({
      kind: 'created',
      outcome: 'sent',
      taiKhoanId: '77',
      email: 'an@example.invalid',
    });
  });

  it('NSF8-104 trong lúc chờ pending là true; xong thì false', async () => {
    const { result } = setup();
    const pending = gate<CreateOutcome>();
    createMock.mockReturnValue(pending.promise);

    let done!: Promise<void>;
    await act(async () => {
      done = result.current.submit();
    });
    expect(result.current.pending).toBe(true);
    await act(async () => {
      pending.release({ kind: 'sent', taiKhoanId: '77' });
      await done;
    });
    expect(result.current.pending).toBe(false);
  });

  it('NSF8-104 chốt được NHẢ khi lỗi: sau lỗi mạng gửi lại được (lần hai là lần gọi API thứ hai)', async () => {
    const { result } = setup();
    createMock.mockRejectedValueOnce(new NetworkError());
    createMock.mockResolvedValueOnce({ kind: 'sent', taiKhoanId: '78' });

    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.pending).toBe(false);
    await act(async () => {
      await result.current.submit();
    });

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.current.phase).toMatchObject({
      kind: 'created',
      taiKhoanId: '78',
    });
  });

  it('NSF8-104 gửi thân đúng: đã trim, đúng tập khoá của Lễ tân (buildBody), MỘT đối số', async () => {
    const { result } = setup();
    createMock.mockResolvedValue({ kind: 'sent', taiKhoanId: '77' });
    await act(async () => {
      await result.current.submit();
    });
    expect(createMock).toHaveBeenCalledWith({
      vaiTro: 'LeTan',
      hoTen: 'Lê Văn An',
      email: 'an@example.invalid',
      soDienThoai: '0912345678',
      chiNhanhId: '5',
    });
  });
});

describe('NSF8-104 kiểm trước khi gửi (NS-11, NS-26)', () => {
  it('NSF8-104 có ô bỏ trống: KHÔNG gọi API, giữ nguyên dữ liệu, lỗi ở đúng ô, báo focus (focusTick tăng)', async () => {
    const { result } = setup();
    act(() => result.current.update({ ...valid, hoTen: '', email: 'sai' }));
    const before = result.current.focusTick;

    await act(async () => {
      await result.current.submit();
    });

    expect(createMock).not.toHaveBeenCalled();
    expect(result.current.errors).toEqual({
      hoTen: BLANK_MESSAGE,
      email: 'Email không hợp lệ.',
    });
    expect(result.current.values.soDienThoai).toBe('0912345678');
    expect(result.current.values.email).toBe('sai');
    expect(result.current.focusTick).toBe(before + 1);
    expect(result.current.pending).toBe(false);
  });

  it('NSF8-104 sửa một ô thì CHỈ lỗi của ô đó biến mất', async () => {
    const { result } = setup();
    act(() => result.current.update({ ...valid, hoTen: '', email: 'sai' }));
    await act(async () => {
      await result.current.submit();
    });

    act(() =>
      result.current.update({ ...result.current.values, hoTen: 'Lê Văn B' }),
    );
    expect(result.current.errors).toEqual({ email: 'Email không hợp lệ.' });
  });

  it('NSF8-104 đổi vai trò bỏ lỗi của các ô không còn thuộc vai trò mới', async () => {
    const { result } = setup();
    act(() =>
      result.current.update({
        ...initialValues(SYSTEM),
        vaiTro: 'BacSi',
      }),
    );
    await act(async () => {
      await result.current.submit();
    });
    expect(Object.keys(result.current.errors)).toContain('chucDanh');

    act(() =>
      result.current.update({
        ...result.current.values,
        vaiTro: 'LeTan',
      }),
    );
    expect(result.current.errors.chucDanh).toBeUndefined();
    expect(result.current.errors.hoTen).toBe(BLANK_MESSAGE);
  });
});

describe('NSF8-104 kết quả của lần gửi (NS-09, NS-19, NS-45)', () => {
  it('NSF8-104 thư lỗi (mailFailed): màn tạo xong KHÔNG phải "đã gửi", danh sách vẫn tải lại (tài khoản đã có)', async () => {
    const { result, onCreated } = setup();
    createMock.mockResolvedValue({ kind: 'mailFailed', taiKhoanId: '78' });
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.phase).toEqual({
      kind: 'created',
      outcome: 'mailFailed',
      taiKhoanId: '78',
      email: 'an@example.invalid',
    });
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('NSF8-104 phản hồi 2xx sai hình dạng (unknown): màn "chưa rõ", vẫn tải lại danh sách', async () => {
    const { result, onCreated } = setup();
    createMock.mockResolvedValue({ kind: 'unknown' });
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.phase).toEqual({ kind: 'unclear' });
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it.each([[new NetworkError()], [new TimeoutError()]])(
    'NSF8-104 %o: Ở LẠI biểu mẫu, giữ dữ liệu, cờ "chưa rõ" bật, KHÔNG tải lại danh sách, KHÔNG tự gửi lại',
    async (error) => {
      const { result, onCreated } = setup();
      createMock.mockRejectedValue(error);
      await act(async () => {
        await result.current.submit();
      });
      expect(result.current.phase).toEqual({ kind: 'form' });
      expect(result.current.unknown).toBe(true);
      expect(result.current.values).toEqual(valid);
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(onCreated).not.toHaveBeenCalled();
    },
  );

  it('NSF8-104 gửi lại sau "chưa rõ": cờ bị xoá ngay khi bắt đầu lần mới', async () => {
    const { result } = setup();
    createMock.mockRejectedValueOnce(new NetworkError());
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.unknown).toBe(true);

    const pending = gate<CreateOutcome>();
    createMock.mockReturnValueOnce(pending.promise);
    await act(async () => {
      void result.current.submit();
    });
    expect(result.current.unknown).toBe(false);
    await act(async () => {
      pending.release({ kind: 'sent', taiKhoanId: '79' });
    });
  });

  it('NSF8-104 409 EMAIL_DA_DUNG: lỗi ở ô email, GIỮ dữ liệu, báo focus, không tải lại danh sách (NS-09)', async () => {
    const { result, onCreated } = setup();
    createMock.mockRejectedValue(
      new ApiError(409, { maLoi: 'EMAIL_DA_DUNG', thongBao: 'x' }),
    );
    const before = result.current.focusTick;
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.errors).toEqual({ email: EMAIL_IN_USE_MESSAGE });
    expect(result.current.values).toEqual(valid);
    expect(result.current.focusTick).toBe(before + 1);
    expect(result.current.phase).toEqual({ kind: 'form' });
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('NSF8-104 400 nhiều trường kèm trường lạ: lỗi vào ô và câu chung', async () => {
    const { result } = setup();
    createMock.mockRejectedValue(
      new ApiError(400, {
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        thongBao: 'x',
        loi: [
          { truong: 'soDienThoai', ma: 'SDT_KHONG_HOP_LE' },
          { truong: 'matKhau', ma: 'TRUONG_KHONG_DUOC_PHEP' },
        ],
      }),
    );
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.errors).toEqual({
      soDienThoai: 'Số điện thoại phải 10 số, bắt đầu bằng 0.',
    });
    expect(result.current.message).toBe(GENERAL_INVALID_MESSAGE);
  });

  it('NSF8-104 403 và 500: lỗi chung, giữ dữ liệu; lần gửi sau xoá lỗi chung cũ', async () => {
    const { result } = setup();
    createMock.mockRejectedValueOnce(
      new ApiError(403, { maLoi: 'KHONG_DU_QUYEN', thongBao: 'x' }),
    );
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.message).toBe(FORBIDDEN_MESSAGE);
    expect(result.current.values).toEqual(valid);

    const pending = gate<CreateOutcome>();
    createMock.mockReturnValueOnce(pending.promise);
    await act(async () => {
      void result.current.submit();
    });
    expect(result.current.message).toBeNull();
    await act(async () => {
      pending.release({ kind: 'sent', taiKhoanId: '80' });
    });
  });
});

describe('NSF8-104 "Tạo tài khoản khác" (NS-19)', () => {
  it('NSF8-104 về biểu mẫu trống, giữ vai trò đã chọn, xoá lỗi và màn kết quả', async () => {
    const { result } = setup();
    createMock.mockResolvedValue({ kind: 'sent', taiKhoanId: '77' });
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.phase.kind).toBe('created');

    act(() => result.current.createAnother());

    expect(result.current.phase).toEqual({ kind: 'form' });
    expect(result.current.values).toEqual({
      ...initialValues(SYSTEM),
      vaiTro: 'LeTan',
    });
    expect(result.current.errors).toEqual({});
    expect(result.current.message).toBeNull();
    expect(result.current.unknown).toBe(false);
  });

  it('NSF8-104 Admin Chi nhánh: biểu mẫu mới vẫn có chi nhánh của mình', async () => {
    const { result } = setup(BRANCH_ME);
    createMock.mockResolvedValue({ kind: 'sent', taiKhoanId: '77' });
    await act(async () => {
      await result.current.submit();
    });
    act(() => result.current.createAnother());
    expect(result.current.values.chiNhanhId).toBe('5');
  });
});
