import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../shared/api/auth-hooks';
import { jsonResponse } from '../../testing/fetch-routing';
import { ExamHeaderActions } from './complete-action';

// doctor-exam F1: nút `Hoàn thành ca khám` và hàng xác nhận tại chỗ (Figma `459:2`, `461:2`; Đại chọn "theo Figma" 15/11/2026). WHT-01 đến WHT-09 (PLAN mục 7.12). Mức W (happy-dom, `css:false`): khoá TÊN LỚP,
// kích thước thật đo ở Chromium (TRACKING doctor-exam mục 14.8). MỖI lớp một khẳng định `.not.toHaveClass` hay `toHaveClass` (jest-dom: `.not` với nhiều lớp chỉ đỏ khi có ĐỦ mọi lớp, AI-BUG-052).
const CODE = 'CP20261018001';
const COMPLETED = { maLichHen: CODE, trangThai: 'HoanThanh' };
const fetchMock = vi.fn<typeof fetch>();
const onChanged = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  onChanged.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setApiAuthHooks({
    getAccessToken: () => 'token-gia',
    recoverFromUnauthorized: async () => false,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  setApiAuthHooks(null);
});

function renderAction(trangThai = 'DaTiepDon') {
  const ui = (state: string) => (
    <ExamHeaderActions
      maLichHen={CODE}
      trangThai={state}
      onChanged={onChanged}
    />
  );
  const view = render(ui(trangThai));
  return { ...view, rerenderWith: (state: string) => view.rerender(ui(state)) };
}

const apiError = (status: number, maLoi: string, chiTiet?: unknown) =>
  jsonResponse(
    {
      maLoi,
      thongBao: 'THÔNG BÁO KỸ THUẬT KHÔNG ĐƯỢC HIỆN',
      ...(chiTiet === undefined ? {} : { chiTiet }),
    },
    status,
  );
const alreadyCompleted = () =>
  apiError(409, 'CHUYEN_TRANG_THAI_KHONG_HOP_LE', {
    tuTrangThai: 'HoanThanh',
    denTrangThai: 'HoanThanh',
  });
const posts = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');

const trigger = () =>
  screen.getByRole('button', { name: 'Hoàn thành ca khám' });
const group = () =>
  screen.getByRole('group', { name: 'Xác nhận hoàn thành ca khám' });
const confirmButton = () =>
  within(group()).getByRole('button', {
    name: /^(Xác nhận|Đang hoàn thành\.\.\.)$/,
  });
const cancelButton = () => within(group()).getByRole('button', { name: 'Hủy' });
const buttonTexts = () =>
  screen.getAllByRole('button').map((button) => button.textContent);

// Mở hàng xác nhận, đặt phản hồi của máy chủ rồi bấm `Xác nhận`
function openAndConfirm(respond: () => Response | Promise<Response>) {
  fetchMock.mockImplementation(() => Promise.resolve(respond()));
  fireEvent.click(trigger());
  fireEvent.click(confirmButton());
}

describe('doctor-exam F1 — nút Hoàn thành ca khám: khi nào hiện', () => {
  it('WHT-01 DaTiepDon ⇒ đúng MỘT nút `Hoàn thành ca khám`, chưa gọi API, lớp cỡ Figma `459:2`', () => {
    renderAction();
    const button = trigger();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    // Figma 182,5×34: px 15, py 7,5, chữ 13,125 đậm, bo 13,375 (lệch có chủ ý: nền `bg-brand-strong` của ADR 0004, không phải `#00a63e`)
    for (const cls of [
      'px-4',
      'py-2',
      'gap-2',
      'text-sm',
      'font-semibold',
      'whitespace-nowrap',
      'rounded-[13.375px]',
      'bg-brand-strong',
      'text-white',
    ]) {
      expect(button).toHaveClass(cls);
    }
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(button.querySelector('svg')).toHaveClass('size-4');
  });

  it.each([
    'ChoThanhToan',
    'DaXacNhan',
    'HoanThanh',
    'DaHuy',
    'VangMat',
    'DaDoiLich',
    '',
  ])('WHT-07 trạng thái %j ⇒ không nút, không gì cả', (trangThai) => {
    const { container } = renderAction(trangThai);
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('doctor-exam F1 — hàng xác nhận tại chỗ (Figma 461:2)', () => {
  it('WHT-02 bấm nút ⇒ hàng `Xác nhận hoàn thành?` với `Xác nhận` và `Hủy` thay chỗ nút; không modal, không inert; 0 POST; tiêu điểm vào `Hủy`', () => {
    renderAction();
    fireEvent.click(trigger());

    expect(
      screen.queryByRole('button', { name: 'Hoàn thành ca khám' }),
    ).toBeNull();
    expect(group()).toHaveTextContent('Xác nhận hoàn thành?');
    expect(
      within(group())
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Xác nhận', 'Hủy']);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cancelButton()).toHaveFocus();
    // KHÔNG phải hộp thoại modal: không `dialog`, không lớp phủ, không nền `inert`
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[inert]')).toBeNull();
    expect(document.querySelector('[aria-modal]')).toBeNull();
    // Figma: `Xác nhận` px 11,25 py 5,625 nền chính, biểu tượng 13,125; `Hủy` viền; chữ không xuống dòng (đo Chromium 375 px: nút `Hoàn thành ca khám` từng bị bẻ hai dòng, cao 52,5 px)
    for (const cls of [
      'px-3',
      'py-1.5',
      'whitespace-nowrap',
      'bg-brand-strong',
      'text-white',
    ]) {
      expect(confirmButton()).toHaveClass(cls);
    }
    expect(confirmButton().querySelector('svg')).toHaveClass('size-3.5');
    for (const cls of [
      'px-3',
      'py-1.5',
      'whitespace-nowrap',
      'border',
      'border-gray-300',
    ]) {
      expect(cancelButton()).toHaveClass(cls);
    }
  });

  it('WHT-02 `Hủy` ⇒ về nút, tiêu điểm về nút, 0 POST', () => {
    renderAction();
    fireEvent.click(trigger());
    fireEvent.click(cancelButton());
    expect(screen.queryByRole('group')).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('WHT-02 Esc trong hàng = `Hủy`: về nút, tiêu điểm về nút, 0 POST; mở lại được', () => {
    renderAction();
    fireEvent.click(trigger());
    fireEvent.keyDown(cancelButton(), { key: 'Escape' });
    expect(screen.queryByRole('group')).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(trigger());
    expect(group()).toBeInTheDocument();
    expect(cancelButton()).toHaveFocus();
  });
});

describe('doctor-exam F1 — gửi MỘT lần', () => {
  it('WHT-03 `Xác nhận` ⇒ đúng MỘT POST /doctor/appointments/<mã>/complete, KHÔNG thân, có token; onChanged 1 lần; dòng "Đã hoàn thành ca khám." nhận tiêu điểm; nút không hiện lại', async () => {
    renderAction();
    openAndConfirm(() => jsonResponse(COMPLETED));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Đã hoàn thành ca khám.');
    expect(status).toHaveFocus();
    expect(status).toHaveClass('text-success');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
    // Chưa đợi trang tải lại mà nút đã không hiện lại (tránh bấm lần hai trong lúc tải)
    expect(screen.queryAllByRole('button')).toEqual([]);

    expect(posts()).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(`/doctor/appointments/${CODE}/complete`);
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer token-gia',
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('WHT-03 sau khi trang tải lại và `trangThai` thành HoanThanh: nút không có, dòng kết quả vẫn còn', async () => {
    const view = renderAction();
    openAndConfirm(() => jsonResponse(COMPLETED));
    await screen.findByRole('status');
    view.rerenderWith('HoanThanh');
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đã hoàn thành ca khám.',
    );
  });

  it('WHT-04 hai lần bấm `Xác nhận` CÙNG LƯỢT ⇒ MỘT POST; đang gửi thì `Xác nhận` và `Hủy` khoá, Esc không đóng', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    renderAction();
    fireEvent.click(trigger());
    const button = confirmButton();
    // Hai lần bấm trong MỘT lượt xử lý: nút `disabled` chưa kịp có hiệu lực, chỉ cờ trong hook chặn được
    act(() => {
      button.click();
      button.click();
    });
    expect(posts()).toHaveLength(1);

    expect(confirmButton()).toBeDisabled();
    expect(confirmButton()).toHaveTextContent('Đang hoàn thành...');
    expect(cancelButton()).toBeDisabled();
    expect(group()).toHaveAttribute('aria-busy', 'true');
    fireEvent.keyDown(cancelButton(), { key: 'Escape' });
    fireEvent.click(cancelButton());
    expect(group()).toBeInTheDocument();

    await act(async () => {
      finish(jsonResponse(COMPLETED));
    });
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('WHT-04 gỡ component khi đang gửi ⇒ yêu cầu bị huỷ, không tải lại, không cảnh báo', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const view = renderAction();
    fireEvent.click(trigger());
    fireEvent.click(confirmButton());
    const signal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(onChanged).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('doctor-exam F1 — 409 đã hoàn thành không phải lỗi', () => {
  it('WHT-05 409 với tuTrangThai=HoanThanh ⇒ "Ca khám này đã được hoàn thành." (status, KHÔNG alert, không lớp đỏ) và tải lại', async () => {
    renderAction();
    openAndConfirm(alreadyCompleted);

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Ca khám này đã được hoàn thành.');
    expect(status).toHaveClass('text-success');
    // Một lớp một khẳng định (AI-BUG-052)
    expect(status).not.toHaveClass('text-danger-strong');
    expect(status).not.toHaveClass('bg-danger-soft');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(posts()).toHaveLength(1);
  });

  it('WHT-05 409 với trạng thái khác ⇒ "Chỉ hoàn thành được ca khám đã tiếp đón." (alert) và tải lại để nút khớp lại', async () => {
    renderAction();
    openAndConfirm(() =>
      apiError(409, 'CHUYEN_TRANG_THAI_KHONG_HOP_LE', {
        tuTrangThai: 'DaXacNhan',
        denTrangThai: 'HoanThanh',
      }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chỉ hoàn thành được ca khám đã tiếp đón.');
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('WHT-05 409 mà chiTiet thiếu ⇒ KHÔNG đoán là đã hoàn thành', async () => {
    renderAction();
    openAndConfirm(() => apiError(409, 'CHUYEN_TRANG_THAI_KHONG_HOP_LE'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chỉ hoàn thành được ca khám đã tiếp đón.',
    );
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('doctor-exam F1 — lỗi theo mã, không tự gửi lại', () => {
  it.each([
    [
      '404 KHONG_TIM_THAY',
      () => apiError(404, 'KHONG_TIM_THAY'),
      'Không tìm thấy ca khám này.',
      1,
    ],
    [
      '403 KHONG_DU_QUYEN',
      () => apiError(403, 'KHONG_DU_QUYEN'),
      'Bạn không có quyền thực hiện thao tác này.',
      0,
    ],
    [
      '401 CHUA_DANG_NHAP',
      () => apiError(401, 'CHUA_DANG_NHAP'),
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      0,
    ],
  ])(
    'WHT-06 %s ⇒ câu theo mã, hàng xác nhận đóng, đúng MỘT POST, tải lại khi lịch đã lệch (404)',
    async (_name, respond, message, reloads) => {
      renderAction();
      openAndConfirm(respond);
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(alert).toHaveFocus();
      expect(alert).not.toHaveTextContent('KỸ THUẬT');
      expect(screen.queryByRole('group')).toBeNull();
      expect(posts()).toHaveLength(1);
      expect(onChanged).toHaveBeenCalledTimes(reloads);
    },
  );

  it('WHT-06 503 ⇒ câu "đang bận", hàng xác nhận Ở LẠI (bấm lại được, do người dùng chọn), không tự gửi lại, không tải lại', async () => {
    renderAction();
    openAndConfirm(() => apiError(503, 'HE_THONG_DANG_BAN'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Hệ thống đang bận, thử lại sau ít phút.');
    expect(alert).toHaveFocus();
    expect(confirmButton()).toBeEnabled();
    expect(confirmButton()).toHaveTextContent('Xác nhận');
    expect(cancelButton()).toBeEnabled();
    expect(posts()).toHaveLength(1);
    expect(onChanged).not.toHaveBeenCalled();

    // Người dùng bấm lại: lần này thành công
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse(COMPLETED)),
    );
    fireEvent.click(confirmButton());
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã hoàn thành ca khám.',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(posts()).toHaveLength(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('WHT-06 maLoi lạ (500) ⇒ câu chung, hàng xác nhận ở lại, không in thông báo kỹ thuật', async () => {
    renderAction();
    openAndConfirm(() => apiError(500, 'LOI_HE_THONG'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Đã có lỗi xảy ra. Vui lòng thử lại sau.');
    expect(alert).not.toHaveTextContent('KỸ THUẬT');
    expect(group()).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
  });

  it('WHT-06 mạng đứt ⇒ "chưa rõ đã lưu" + `Tải lại chi tiết`; KHÔNG tự gửi lại; nút tải lại chỉ gọi onChanged, không POST', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderAction();
    fireEvent.click(trigger());
    fireEvent.click(confirmButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chưa rõ ca khám đã được hoàn thành chưa');
    expect(screen.queryByRole('group')).toBeNull();
    expect(posts()).toHaveLength(1);
    expect(onChanged).not.toHaveBeenCalled();

    fireEvent.click(
      within(alert).getByRole('button', { name: 'Tải lại chi tiết' }),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(posts()).toHaveLength(1);
  });

  it('WHT-06 hết giờ 15 giây ⇒ "chưa rõ đã lưu"; đúng MỘT POST dù chờ thêm', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    renderAction();
    fireEvent.click(trigger());
    fireEvent.click(confirmButton());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(confirmButton()).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Chưa rõ ca khám đã được hoàn thành chưa',
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(posts()).toHaveLength(1);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it.each([
    ['200 sai hình dạng', () => jsonResponse({ ok: true })],
    [
      '502 không phải JSON (nginx)',
      () => new Response('<html>', { status: 502 }),
    ],
  ])(
    'WHT-06 %s ⇒ "chưa rõ đã lưu" (máy chủ có thể đã lưu), KHÔNG coi là thành công',
    async (_name, respond) => {
      renderAction();
      openAndConfirm(respond);
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Chưa rõ ca khám đã được hoàn thành');
      expect(screen.queryByRole('status')).toBeNull();
      expect(posts()).toHaveLength(1);
      expect(onChanged).not.toHaveBeenCalled();
    },
  );

  it('WHT-06 sau "chưa rõ" bấm lại mà lịch đã hoàn thành ở lần trước ⇒ 409 HoanThanh ⇒ "đã hoàn thành" (bấm lại luôn an toàn)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderAction();
    fireEvent.click(trigger());
    fireEvent.click(confirmButton());
    await screen.findByRole('alert');

    fetchMock.mockImplementation(() => Promise.resolve(alreadyCompleted()));
    fireEvent.click(trigger());
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(confirmButton());
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Ca khám này đã được hoàn thành.',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(posts()).toHaveLength(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});

describe('doctor-exam F1 — không lưu gì ở trình duyệt, nhãn truy cập', () => {
  it('WHT-08 thành công, 409 và lỗi: không ghi `localStorage`, `sessionStorage`, URL, `location.state`', async () => {
    const localSet = vi.spyOn(Storage.prototype, 'setItem');
    const before = window.location.href;
    const stateBefore = window.history.state;
    for (const respond of [
      () => jsonResponse(COMPLETED),
      alreadyCompleted,
      () => apiError(503, 'HE_THONG_DANG_BAN'),
    ]) {
      const view = renderAction();
      openAndConfirm(respond);
      await waitFor(() =>
        expect(
          screen.queryByRole('status') ?? screen.queryByRole('alert'),
        ).not.toBeNull(),
      );
      view.unmount();
    }
    expect(localSet).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(window.location.href).toBe(before);
    expect(window.history.state).toEqual(stateBefore);
  });

  it('WHT-09 tên truy cập và tiêu điểm: nút, nhóm có tên, `status` và `alert` nhận tiêu điểm, `aria-busy` khi gửi', async () => {
    renderAction();
    expect(buttonTexts()).toEqual(['Hoàn thành ca khám']);
    fireEvent.click(trigger());
    expect(group()).toHaveAttribute('role', 'group');
    expect(group()).toHaveAttribute('aria-busy', 'false');
    expect(buttonTexts()).toEqual(['Xác nhận', 'Hủy']);
    expect(cancelButton()).toHaveFocus();

    // Thất bại có thể bấm lại: tiêu điểm chuyển sang `alert`
    fetchMock.mockImplementation(() =>
      Promise.resolve(apiError(503, 'HE_THONG_DANG_BAN')),
    );
    fireEvent.click(confirmButton());
    expect(await screen.findByRole('alert')).toHaveFocus();

    // Thành công: hàng xác nhận biến mất nên tiêu điểm sang `status` (không rơi về body)
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse(COMPLETED)),
    );
    fireEvent.click(confirmButton());
    expect(await screen.findByRole('status')).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });
});
