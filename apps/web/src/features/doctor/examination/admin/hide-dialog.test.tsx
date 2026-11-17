import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiAuthHooks } from '../../../../shared/api/auth-hooks';
import { jsonResponse } from '../../testing/fetch-routing';
import type { AdminReviewItem } from '../api/admin-review-types';
import { HideDialog } from './hide-dialog';
import hookSource from './use-hide.ts?raw';
import dialogSource from './hide-dialog.tsx?raw';

// doctor-exam F8: hộp "Ẩn đánh giá" (Figma `571:2`; PLAN 5.8, 5.14; Q8). WKD-05 (lý do bắt buộc, 10–255, lỗi theo ô, giữ nội dung), WKD-07 (lỗi), WKD-08 (bấm đúp), WKD-24 (đóng, tiêu điểm, `inert`, bộ đếm, trợ năng), WKD-26 (không kho, URL, log),
// WKD-27 (tóm tắt chữ thuần). Mức hộp (happy-dom, `css:false`): `fetch` giả theo hợp đồng B8; hộp gọi `hideAdminReview` thật. Dữ liệu giả, không phải của ai.
const fetchMock = vi.fn<typeof fetch>();
const onClose = vi.fn();
const onHidden = vi.fn();
const onSettled = vi.fn();
const onReload = vi.fn();
let trigger: HTMLButtonElement;

const ITEM: AdminReviewItem = {
  danhGiaId: '41',
  bacSi: { bacSiId: '11', hoTen: 'Nguyễn Minh Anh' },
  chiNhanh: { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' },
  nguoiDanhGia: { hoTen: 'Vũ Thị F' },
  soSao: 4,
  nhanXet: 'Tốt, sẽ giới thiệu cho bạn bè. Bác sĩ có chuyên môn cao.',
  thoiDiemTao: '2026-05-28T03:00:00.000Z',
  biAn: false,
};
const REASON = 'Lăng mạ bác sĩ trong phần nhận xét';

beforeEach(() => {
  fetchMock.mockReset();
  onClose.mockReset();
  onHidden.mockReset();
  onSettled.mockReset();
  onReload.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  setApiAuthHooks({
    getAccessToken: () => 'khoa-gia',
    recoverFromUnauthorized: async () => false,
  });
  trigger = document.createElement('button');
  document.body.appendChild(trigger);
});
afterEach(() => {
  trigger.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setApiAuthHooks(null);
  localStorage.clear();
  sessionStorage.clear();
});

function renderDialog(item: AdminReviewItem = ITEM) {
  return render(
    <HideDialog
      item={item}
      returnFocusRef={{ current: trigger }}
      onClose={onClose}
      onHidden={onHidden}
      onSettled={onSettled}
      onReload={onReload}
    />,
  );
}
const dialog = () => screen.getByRole('dialog', { name: 'Ẩn đánh giá' });
const input = () =>
  within(dialog()).getByLabelText(/^Lý do ẩn/) as HTMLTextAreaElement;
const confirmButton = () =>
  within(dialog()).getByRole('button', {
    name: /^(Xác nhận ẩn|Đang ẩn\.\.\.)$/,
  });
const cancelButton = () =>
  within(dialog()).getByRole('button', { name: 'Hủy' });
const closeIcon = () =>
  within(dialog()).getByRole('button', { name: 'Đóng hộp thoại' });
const banner = () =>
  within(dialog())
    .queryAllByRole('alert')
    .find((element) => element.tagName === 'DIV') ?? null;
const fieldAlert = () =>
  within(dialog())
    .queryAllByRole('alert')
    .find((element) => element.tagName === 'P') ?? null;
const posts = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
const postBody = (index = 0) =>
  JSON.parse(String(posts()[index][1]?.body)) as Record<string, unknown>;
const type = (value: string) =>
  fireEvent.change(input(), { target: { value } });
const apiError = (status: number, maLoi: string, extra: object = {}) =>
  jsonResponse({ maLoi, thongBao: 'THÔNG BÁO KỸ THUẬT', ...extra }, status);
const ok = () => jsonResponse({ danhGiaId: '41', biAn: true });
const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
const anyInert = () =>
  [...document.body.children].some((element) => element.hasAttribute('inert'));

describe('doctor-exam F8 — nội dung hộp theo Figma 571:2 (WKD-05)', () => {
  it('WKD-05 hộp: tên "Ẩn đánh giá", câu cảnh báo NGUYÊN VĂN, nhãn "Lý do ẩn" kèm `*`, gợi ý "tối thiểu 10 ký tự", `Hủy` và `Xác nhận ẩn`; tiêu điểm vào ô lý do; chưa gọi API', () => {
    renderDialog();
    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    expect(
      within(dialog()).getByText(
        'Đánh giá sẽ không còn hiển thị công khai nhưng vẫn được lưu trong hệ thống để truy vết. Hành động này sẽ được ghi vào Nhật ký hành động.',
      ),
    ).toBeVisible();
    expect(within(dialog()).getByText('*')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(input()).toHaveAttribute(
      'placeholder',
      'Nhập lý do ẩn đánh giá (tối thiểu 10 ký tự)...',
    );
    expect(input()).toBeRequired();
    expect(input()).toHaveValue('');
    expect(cancelButton()).toBeEnabled();
    expect(confirmButton()).toBeEnabled();
    expect(confirmButton()).toHaveTextContent('Xác nhận ẩn');
    expect(document.activeElement).toBe(input());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(banner()).toBeNull();
    expect(fieldAlert()).toBeNull();
  });

  it('WKD-05 tóm tắt: bác sĩ, năm sao có tên, "· người đặt · ngày gửi" (giờ Việt Nam), nhận xét một dòng', () => {
    renderDialog();
    const box = dialog();
    expect(within(box).getByText('Nguyễn Minh Anh')).toBeVisible();
    expect(within(box).getByRole('img', { name: '4 sao' })).toBeVisible();
    expect(within(box).getByText('· Vũ Thị F · 28/05/2026')).toBeVisible();
    expect(
      within(box).getByText(
        'Tốt, sẽ giới thiệu cho bạn bè. Bác sĩ có chuyên môn cao.',
      ),
    ).toBeVisible();
  });

  it('WKD-05 tên người đặt rỗng ⇒ bỏ cụm tên (không in "—" vào dòng ngày); nhận xét `null` hay rỗng ⇒ "—"', () => {
    const view = renderDialog({
      ...ITEM,
      nguoiDanhGia: { hoTen: '  ' },
      nhanXet: null,
    });
    expect(within(dialog()).getByText('· 28/05/2026')).toBeVisible();
    expect(within(dialog()).getByText('—')).toBeVisible();
    view.unmount();
    renderDialog({ ...ITEM, nhanXet: '   ' });
    expect(within(dialog()).getByText('—')).toBeVisible();
  });
});

describe('doctor-exam F8 — lý do bắt buộc, 10–255, lỗi theo ô, giữ nội dung (WKD-05, WKD-20)', () => {
  it('WKD-05 thiếu ⇒ "Vui lòng nhập lý do ẩn." ở đúng ô, `aria-invalid`, `aria-describedby` trỏ tới lỗi; KHÔNG POST', () => {
    renderDialog();
    fireEvent.click(confirmButton());
    const error = fieldAlert()!;
    expect(error).toHaveTextContent('Vui lòng nhập lý do ẩn.');
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(input().getAttribute('aria-describedby')).toContain(error.id);
    expect(posts()).toHaveLength(0);
    // Lỗi theo ô, không dải chung
    expect(banner()).toBeNull();
  });

  it('WKD-05 chỉ khoảng trắng và xuống dòng ⇒ "thiếu" (sau chuẩn hoá), nội dung đang gõ GIỮ NGUYÊN', () => {
    renderDialog();
    type('   \n  ');
    fireEvent.click(confirmButton());
    expect(fieldAlert()).toHaveTextContent('Vui lòng nhập lý do ẩn.');
    expect(input()).toHaveValue('   \n  ');
    expect(posts()).toHaveLength(0);
  });

  it('WKD-05 9 ký tự ⇒ "Lý do ẩn cần ít nhất 10 ký tự."; 256 ⇒ "Tối đa 255 ký tự."; cả hai KHÔNG POST và giữ nội dung', () => {
    renderDialog();
    type('x'.repeat(9));
    fireEvent.click(confirmButton());
    expect(fieldAlert()).toHaveTextContent('Lý do ẩn cần ít nhất 10 ký tự.');
    expect(input()).toHaveValue('x'.repeat(9));
    type('x'.repeat(256));
    expect(fieldAlert()).toBeNull();
    fireEvent.click(confirmButton());
    expect(fieldAlert()).toHaveTextContent('Tối đa 255 ký tự.');
    expect(input()).toHaveValue('x'.repeat(256));
    expect(posts()).toHaveLength(0);
  });

  it('WKD-05 đếm SAU chuẩn hoá bằng UTF-16: 9 chữ + khoảng trắng đầu cuối vẫn "ngắn"; 128 emoji (256 đơn vị) "quá dài", 127 emoji + 1 chữ (255) được gửi', () => {
    fetchMock.mockResolvedValue(ok());
    renderDialog();
    type(`   ${'x'.repeat(9)}   `);
    fireEvent.click(confirmButton());
    expect(fieldAlert()).toHaveTextContent('ít nhất 10 ký tự');
    type('😀'.repeat(128));
    fireEvent.click(confirmButton());
    expect(fieldAlert()).toHaveTextContent('Tối đa 255 ký tự.');
    expect(posts()).toHaveLength(0);
    type(`${'😀'.repeat(127)}a`);
    fireEvent.click(confirmButton());
    expect(posts()).toHaveLength(1);
  });

  it('WKD-05 gõ lại thì bỏ lỗi của ô; nội dung gõ không bị đổi', () => {
    renderDialog();
    fireEvent.click(confirmButton());
    expect(fieldAlert()).not.toBeNull();
    type('Lý do');
    expect(fieldAlert()).toBeNull();
    expect(input()).not.toHaveAttribute('aria-invalid');
    expect(input()).toHaveValue('Lý do');
  });

  it('WKD-24 bộ đếm `n/255` đếm SAU chuẩn hoá (trim, CRLF ⇒ LF, bỏ ký tự điều khiển, emoji 2 đơn vị); đỏ (`text-danger`) khi quá 255, xám (`text-gray-500`) khi chưa', () => {
    renderDialog();
    const counter = () =>
      within(dialog()).getByText(/^\d+\/255$/) as HTMLElement;
    expect(counter()).toHaveTextContent('0/255');
    expect(counter()).toHaveClass('text-gray-500');
    expect(counter()).not.toHaveClass('text-danger');
    type('  abc  \r\n');
    expect(counter()).toHaveTextContent('3/255');
    type('a\r\nb');
    expect(counter()).toHaveTextContent('3/255');
    type('😀');
    expect(counter()).toHaveTextContent('2/255');
    type('x'.repeat(255));
    expect(counter()).toHaveTextContent('255/255');
    expect(counter()).toHaveClass('text-gray-500');
    type('x'.repeat(256));
    expect(counter()).toHaveTextContent('256/255');
    expect(counter()).toHaveClass('text-danger');
    expect(counter()).not.toHaveClass('text-gray-500');
    expect(input().getAttribute('aria-describedby')).toContain(counter().id);
  });
});

describe('doctor-exam F8 — gửi và kết quả (WKD-05, WKD-06, WKD-07)', () => {
  it('WKD-06 lý do hợp lệ ⇒ ĐÚNG MỘT POST tới đúng id, thân là lý do ĐÃ chuẩn hoá (CRLF ⇒ LF, trim, nhiều dòng giữ nguyên); 200 ⇒ `onHidden` MỘT lần, không `onClose`', async () => {
    fetchMock.mockResolvedValue(ok());
    renderDialog();
    type('  Dòng một\r\nDòng hai 😀 đủ dài  ');
    fireEvent.click(confirmButton());
    await settle();
    expect(posts()).toHaveLength(1);
    expect(new URL(String(posts()[0][0]), 'http://x').pathname).toBe(
      '/api/admin/doctor-ratings/41/hide',
    );
    expect(postBody()).toEqual({ lyDo: 'Dòng một\nDòng hai 😀 đủ dài' });
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('WKD-05 `NOI_DUNG_KHONG_HOP_LE` ở trường `lyDo` ⇒ hiện THEO Ô (không dải chung), nội dung đang gõ GIỮ NGUYÊN, nút vẫn bấm được', async () => {
    fetchMock.mockResolvedValue(
      apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'lyDo', ma: 'NOI_DUNG_KHONG_HOP_LE' }],
      }),
    );
    renderDialog();
    type('Bệnh nhân khai otp: 3 lần/ngày');
    fireEvent.click(confirmButton());
    await settle();
    expect(fieldAlert()).toHaveTextContent(
      'Nội dung có đoạn giống mật khẩu hoặc mã bí mật; hãy viết lại.',
    );
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(input()).toHaveValue('Bệnh nhân khai otp: 3 lần/ngày');
    expect(banner()).toBeNull();
    expect(confirmButton()).toBeEnabled();
    expect(onHidden).not.toHaveBeenCalled();
  });

  it.each([
    ['LY_DO_BAT_BUOC', 'Vui lòng nhập lý do ẩn.'],
    ['LY_DO_QUA_NGAN', 'Lý do ẩn cần ít nhất 10 ký tự.'],
    ['LY_DO_QUA_DAI', 'Tối đa 255 ký tự.'],
  ])(
    'WKD-05 máy chủ trả %s (dù máy khách đã cho qua) ⇒ lỗi theo ô, giữ nội dung',
    async (ma, text) => {
      fetchMock.mockResolvedValue(
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'lyDo', ma }],
        }),
      );
      renderDialog();
      type(REASON);
      fireEvent.click(confirmButton());
      await settle();
      expect(fieldAlert()).toHaveTextContent(text);
      expect(input()).toHaveValue(REASON);
    },
  );

  it('WKD-07 409 `DANH_GIA_DA_AN` ⇒ `onSettled("already")`; 404 ⇒ `onSettled("gone")`; hộp KHÔNG hiện lỗi đỏ (nơi gọi đóng hộp, tải lại, báo)', async () => {
    fetchMock.mockResolvedValueOnce(apiError(409, 'DANH_GIA_DA_AN'));
    renderDialog();
    type(REASON);
    fireEvent.click(confirmButton());
    await settle();
    expect(onSettled).toHaveBeenLastCalledWith('already');
    expect(banner()).toBeNull();
    expect(fieldAlert()).toBeNull();

    fetchMock.mockResolvedValueOnce(apiError(404, 'KHONG_TIM_THAY'));
    fireEvent.click(confirmButton());
    await settle();
    expect(onSettled).toHaveBeenLastCalledWith('gone');
    expect(onSettled).toHaveBeenCalledTimes(2);
    expect(banner()).toBeNull();
    expect(onHidden).not.toHaveBeenCalled();
  });

  it('WKD-07 503 ⇒ "Hệ thống đang bận, thử lại sau ít phút." giữ hộp và lý do, KHÔNG lỗi ô; bấm lại ⇒ POST lần hai (do người dùng)', async () => {
    fetchMock.mockResolvedValueOnce(apiError(503, 'HE_THONG_DANG_BAN'));
    renderDialog();
    type(REASON);
    fireEvent.click(confirmButton());
    await settle();
    expect(banner()).toHaveTextContent(
      'Hệ thống đang bận, thử lại sau ít phút.',
    );
    expect(within(banner()!).queryByRole('button')).toBeNull();
    expect(fieldAlert()).toBeNull();
    expect(input()).toHaveValue(REASON);
    expect(confirmButton()).toBeEnabled();
    expect(posts()).toHaveLength(1);
    await settle();
    expect(posts()).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(ok());
    fireEvent.click(confirmButton());
    await settle();
    expect(posts()).toHaveLength(2);
    expect(onHidden).toHaveBeenCalledTimes(1);
  });

  it('WKD-07 403 và 401 ⇒ câu riêng, `Xác nhận ẩn` KHOÁ, chỉ còn `Hủy`/×; lý do còn', async () => {
    for (const [status, maLoi, text] of [
      [403, 'KHONG_DU_QUYEN', 'Bạn không có quyền thực hiện thao tác này.'],
      [
        401,
        'CHUA_DANG_NHAP',
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      ],
    ] as const) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(apiError(status, maLoi));
      const view = renderDialog();
      type(REASON);
      fireEvent.click(confirmButton());
      await settle();
      expect(banner(), maLoi).toHaveTextContent(text);
      expect(confirmButton(), maLoi).toBeDisabled();
      expect(cancelButton(), maLoi).toBeEnabled();
      expect(input(), maLoi).toHaveValue(REASON);
      fireEvent.submit(dialog().querySelector('form')!);
      await settle();
      expect(posts(), maLoi).toHaveLength(1);
      view.unmount();
    }
  });

  it('WKD-07 mất mạng ⇒ "Chưa rõ đánh giá đã được ẩn chưa …" kèm `Tải lại danh sách`; lý do còn; đúng MỘT POST dù chờ thêm (KHÔNG tự gửi lại); `Xác nhận ẩn` vẫn bấm lại được', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderDialog();
    type(REASON);
    fireEvent.click(confirmButton());
    await settle();
    expect(banner()).toHaveTextContent(
      'Chưa rõ đánh giá đã được ẩn chưa (mất kết nối hoặc quá thời gian chờ). Lý do của bạn vẫn còn ở đây.',
    );
    expect(input()).toHaveValue(REASON);
    expect(
      within(banner()!).getByRole('button', { name: 'Tải lại danh sách' }),
    ).toBeVisible();
    expect(confirmButton()).toBeEnabled();
    await settle();
    expect(posts()).toHaveLength(1);
    expect(onReload).not.toHaveBeenCalled();

    // Lần hai do người dùng: lần đầu thực ra đã ẩn ⇒ 409 ⇒ "đã được ẩn"
    fetchMock.mockResolvedValueOnce(apiError(409, 'DANH_GIA_DA_AN'));
    fireEvent.click(confirmButton());
    await settle();
    expect(posts()).toHaveLength(2);
    expect(onSettled).toHaveBeenCalledWith('already');
  });

  it('WKD-07 `Tải lại danh sách` gọi `onReload` MỘT lần (nơi gọi đóng hộp và tải lại); 200 sai hình dạng cũng ra "chưa rõ"', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ danhGiaId: '41', biAn: false }),
    );
    renderDialog();
    type(REASON);
    fireEvent.click(confirmButton());
    await settle();
    expect(banner()).toHaveTextContent('Chưa rõ đánh giá đã được ẩn chưa');
    fireEvent.click(
      within(banner()!).getByRole('button', { name: 'Tải lại danh sách' }),
    );
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onHidden).not.toHaveBeenCalled();
  });
});

describe('doctor-exam F8 — bấm đúp và đang gửi (WKD-08, WKD-24)', () => {
  it('WKD-08 hai lần bấm `Xác nhận ẩn` CÙNG LƯỢT ⇒ MỘT POST; đang gửi thì nút khoá và đổi chữ, ô chỉ đọc, `Hủy` và × khoá, Esc, bấm nền và `Hủy` không đóng, `aria-busy`', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    renderDialog();
    type(REASON);
    const button = confirmButton();
    // Hai lần bấm trong MỘT lượt xử lý: nút `disabled` chưa kịp có hiệu lực, chỉ cờ trong hook chặn được
    act(() => {
      button.click();
      button.click();
    });
    expect(posts()).toHaveLength(1);

    expect(confirmButton()).toBeDisabled();
    expect(confirmButton()).toHaveTextContent('Đang ẩn...');
    expect(cancelButton()).toBeDisabled();
    expect(closeIcon()).toBeDisabled();
    expect(input()).toHaveAttribute('readonly');
    expect(dialog()).toHaveAttribute('aria-busy', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(dialog().parentElement as HTMLElement);
    fireEvent.click(cancelButton());
    fireEvent.click(closeIcon());
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog()).toBeInTheDocument();

    await act(async () => {
      finish(ok());
    });
    await settle();
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(posts()).toHaveLength(1);
  });

  it('WKD-08 gửi biểu mẫu (Enter ở nút, `submit`) hai lần liền cũng MỘT POST', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    renderDialog();
    type(REASON);
    const form = dialog().querySelector('form')!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(posts()).toHaveLength(1);
  });

  it('WKD-24 gỡ hộp khi đang gửi ⇒ yêu cầu bị huỷ, không `onHidden`, không cảnh báo', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const view = renderDialog();
    type(REASON);
    fireEvent.click(confirmButton());
    const signal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    view.unmount();
    expect(signal.aborted).toBe(true);
    await settle();
    expect(onHidden).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('doctor-exam F8 — đóng, tiêu điểm, nền inert (WKD-05, WKD-24)', () => {
  it('WKD-24 `Hủy`, × và `Esc` khi rảnh đều gọi `onClose` và KHÔNG gửi gì (kể cả khi đã gõ lý do hợp lệ)', () => {
    renderDialog();
    type(REASON);
    fireEvent.click(cancelButton());
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(closeIcon());
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
    fireEvent.click(dialog().parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(4);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onHidden).not.toHaveBeenCalled();
  });

  it('WKD-24 nền `inert` khi mở và gỡ khi đóng; tiêu điểm trả về nút đã bấm', () => {
    trigger.focus();
    const view = renderDialog();
    expect(anyInert()).toBe(true);
    expect(document.activeElement).toBe(input());
    view.unmount();
    expect(anyInert()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('WKD-24 nhãn truy cập: hộp có tên, ô nhập có nhãn, lỗi `role="alert"`, nút có tên; × có tên "Đóng hộp thoại"', () => {
    renderDialog();
    expect(dialog()).toHaveAccessibleName('Ẩn đánh giá');
    expect(input()).toHaveAccessibleName('Lý do ẩn');
    expect(confirmButton()).toHaveAccessibleName('Xác nhận ẩn');
    expect(closeIcon()).toBeVisible();
    fireEvent.click(confirmButton());
    expect(fieldAlert()).toHaveAttribute('role', 'alert');
  });
});

describe('doctor-exam F8 — hiển thị an toàn của tóm tắt (WKD-27)', () => {
  it('WKD-27 nhận xét và tên có `<script>`, `<img onerror>`, liên kết spam, thực thể HTML: hiện NGUYÊN VĂN là chữ, không phần tử `script`, `img`, `a`, `b`', () => {
    const spam =
      '<script>alert(1)</script> Click vào đây nhận ngay iPhone http://spam.example <img src=x onerror=alert(1)> &amp; &lt;b&gt;';
    renderDialog({
      ...ITEM,
      bacSi: { bacSiId: '11', hoTen: '<b>Bác sĩ</b> <i>X</i>' },
      nguoiDanhGia: { hoTen: '<script>alert(2)</script>' },
      nhanXet: spam,
    });
    const box = dialog();
    expect(within(box).getByText('<b>Bác sĩ</b> <i>X</i>')).toBeVisible();
    expect(
      within(box).getByText('· <script>alert(2)</script> · 28/05/2026'),
    ).toBeVisible();
    expect(within(box).getByText(spam)).toBeVisible();
    for (const tag of ['script', 'img', 'a', 'b', 'i']) {
      expect(box.querySelector(tag), tag).toBeNull();
    }
    expect(within(box).queryByRole('link')).toBeNull();
  });
});

describe('doctor-exam F8 — dữ liệu không vào kho trình duyệt, URL, tiêu đề, log (WKD-26)', () => {
  it('WKD-26 qua đủ luồng (gõ, lỗi ô, 503, thành công) lý do KHÔNG vào `localStorage`, `sessionStorage`, URL, `location.state`, tiêu đề tài liệu hay `console.*`', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const before = {
      href: window.location.href,
      title: document.title,
      state: JSON.stringify(window.history.state),
    };
    fetchMock.mockResolvedValueOnce(apiError(503, 'HE_THONG_DANG_BAN'));
    fetchMock.mockResolvedValueOnce(ok());
    renderDialog();
    fireEvent.click(confirmButton());
    type(REASON);
    fireEvent.click(confirmButton());
    await settle();
    fireEvent.click(confirmButton());
    await settle();
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
    expect(window.location.href).toBe(before.href);
    expect(document.title).toBe(before.title);
    expect(JSON.stringify(window.history.state)).toBe(before.state);
    expect(document.cookie).toBe('');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('WKD-26 mã nguồn của hộp và hook không có kho trình duyệt, URL, `console`, `document.title`, HTML thô (bộ quét tĩnh đầy đủ ở `reviews-hygiene.test.ts`)', () => {
    const code = `${dialogSource}\n${hookSource}`
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    for (const forbidden of [
      /\blocalStorage\b/,
      /\bsessionStorage\b/,
      /\bconsole\./,
      /\bdocument\.title\b/,
      /dangerouslySetInnerHTML/,
      /\bhistory\./,
      /\buseSearchParams\b/,
    ]) {
      expect(code).not.toMatch(forbidden);
    }
  });
});
