import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GENERIC_ERROR_MESSAGE } from '../../../../shared/api/error-message';
import { jsonResponse } from '../../testing/fetch-routing';
import { RatingForm } from './rating-form';

// doctor-exam F6, WDG-02, WDG-03, WDG-05, WDG-06, WDG-07, WDG-10, WDG-15, WDG-17: form "Đánh giá bác sĩ" (Figma `423:2`; B6). `fetch` là hàm giả theo hợp đồng B6 (KHÔNG gọi backend thật). Số sao BẮT BUỘC, nhận xét TUỲ CHỌN (L1, Đại 16/11/2026). `POST` không idempotent:
// KHÔNG BAO GIỜ tự gửi lại; mỗi lỗi giữ nguyên sao và nhận xét. Mã `DU_LIEU_KHONG_HOP_LE` kèm `loi[{ truong, ma }]` hiện ĐÚNG ô. Kích thước thật đo ở Chromium (TRACKING 24.8): ở đây khoá TÊN LỚP, MỖI lớp một khẳng định (AI-BUG-052).
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const CREATED = {
  soSao: 5,
  nhanXet: 'Rất tốt',
  thoiDiemTao: '2026-06-10T03:00:00.000Z',
};
const MA = 'CLX-1';

function renderForm() {
  const onRated = vi.fn();
  const onAlreadyRated = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <RatingForm
      maLichHen={MA}
      onRated={onRated}
      onAlreadyRated={onAlreadyRated}
      onCancel={onCancel}
    />,
  );
  return { onRated, onAlreadyRated, onCancel, ...view };
}

const radio = (stars: number) =>
  screen.getByRole('radio', { name: `${stars} sao` });
const comment = () => screen.getByRole('textbox', { name: /Nhận xét/ });
const send = () =>
  screen.getByRole('button', { name: /Gửi đánh giá|Đang gửi/ });
const cancel = () => screen.getByRole('button', { name: 'Huỷ' });
const pick = (stars: number) => fireEvent.click(radio(stars));
const type = (value: string) =>
  fireEvent.change(comment(), { target: { value } });
const counter = () =>
  document.getElementById(
    comment().getAttribute('aria-describedby')!.split(' ').pop()!,
  );
const checkedStars = () =>
  screen
    .getAllByRole('radio')
    .filter((element) => element.getAttribute('aria-checked') === 'true')
    .map((element) => element.getAttribute('aria-label'));
const sentBody = (call = 0) =>
  JSON.parse(String(fetchMock.mock.calls[call][1]?.body));

async function clickSend() {
  await act(async () => {
    fireEvent.click(send());
  });
}

const apiError = (status: number, maLoi: string, extra: object = {}) =>
  jsonResponse({ maLoi, thongBao: 'x', ...extra }, status);

describe('doctor-exam F6 — form: cấu trúc và chữ (WDG-02)', () => {
  it('WDG-02 nhãn "Số sao *", nhận xét TUỲ CHỌN (nhãn "Nhận xét (tuỳ chọn)", KHÔNG dấu `*`), gợi ý không còn "tối thiểu 10 ký tự", bộ đếm "0/1.000", hai nút `Huỷ` và `Gửi đánh giá`', () => {
    renderForm();
    // Tên của nhóm lấy từ nhãn "Số sao *": dấu `*` là `aria-hidden` nên KHÔNG vào tên truy cập
    expect(
      screen.getByRole('radiogroup', { name: 'Số sao' }),
    ).toBeInTheDocument();
    expect(comment().closest('div')!.querySelector('label')!.textContent).toBe(
      'Nhận xét (tuỳ chọn)',
    );
    expect(comment()).toHaveAttribute(
      'placeholder',
      'Chia sẻ trải nghiệm của bạn',
    );
    expect(comment()).not.toBeRequired();
    expect(counter()).toHaveTextContent('0/1.000');
    expect(cancel()).toBeEnabled();
    expect(send()).toHaveTextContent('Gửi đánh giá');
    expect(screen.getAllByText('*')).toHaveLength(1);
  });

  it('WDG-15 vừa mở: tiêu điểm ở ô sao nằm trong Tab (ô đầu); nút gửi chưa khoá; chưa gọi API', () => {
    renderForm();
    expect(document.activeElement).toBe(radio(1));
    expect(send()).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('WDG-10 bộ đếm theo `length` UTF-16 SAU chuẩn hoá: "Tốt" 3, "a\\r\\nb" 3 (CRLF là 1), emoji 2, chỉ khoảng trắng 0, hai đầu cắt', () => {
    renderForm();
    type('Tốt');
    expect(counter()).toHaveTextContent('3/1.000');
    type('a\r\nb');
    expect(counter()).toHaveTextContent('3/1.000');
    type('😀');
    expect(counter()).toHaveTextContent('2/1.000');
    type('   \n ');
    expect(counter()).toHaveTextContent('0/1.000');
    type('  x  ');
    expect(counter()).toHaveTextContent('1/1.000');
  });

  it('WDG-10 bộ đếm đổi sang `text-danger` KHI quá 1.000 (1.000 vẫn `text-gray-500`, 1.001 đổi)', () => {
    renderForm();
    type('a'.repeat(1000));
    expect(counter()).toHaveTextContent('1.000/1.000');
    expect(counter()).toHaveClass('text-gray-500');
    expect(counter()).not.toHaveClass('text-danger');
    type('a'.repeat(1001));
    expect(counter()).toHaveTextContent('1.001/1.000');
    expect(counter()).toHaveClass('text-danger');
    expect(counter()).not.toHaveClass('text-gray-500');
  });

  it('WDG-02 chọn sao ⇒ hiện nhãn mức sao cạnh sao (Rất tệ … Xuất sắc), đổi sao thì đổi nhãn', () => {
    renderForm();
    expect(screen.queryByText('Xuất sắc')).toBeNull();
    pick(1);
    expect(screen.getByText('Rất tệ')).toBeInTheDocument();
    pick(3);
    expect(screen.getByText('Bình thường')).toBeInTheDocument();
    expect(screen.queryByText('Rất tệ')).toBeNull();
    pick(5);
    expect(screen.getByText('Xuất sắc')).toBeInTheDocument();
  });

  it('WDG-15 `Huỷ` đóng form qua `onCancel` và KHÔNG gọi API (kể cả khi đã chọn sao và gõ nhận xét)', () => {
    const { onCancel } = renderForm();
    pick(2);
    type('Nội dung sắp bỏ');
    fireEvent.click(cancel());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('doctor-exam F6 — form: kiểm ở máy trước khi gửi (WDG-03, WDG-10)', () => {
  it('WDG-03 chưa chọn sao ⇒ "Vui lòng chọn số sao." dưới hàng sao, `aria-invalid`, KHÔNG gọi API, GIỮ nhận xét', async () => {
    renderForm();
    type('Nhận xét phải được giữ');
    await clickSend();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Vui lòng chọn số sao.',
    );
    expect(screen.getByRole('radiogroup')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('radiogroup')).toHaveAccessibleDescription(
      'Vui lòng chọn số sao.',
    );
    expect(comment()).toHaveValue('Nhận xét phải được giữ');
  });

  it('WDG-03 chọn sao thì lỗi sao biến mất ngay; gửi tiếp được', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CREATED, 201));
    renderForm();
    await clickSend();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    pick(4);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('radiogroup')).not.toHaveAttribute('aria-invalid');
    await clickSend();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WDG-10 nhận xét 1.001 đơn vị ⇒ "Tối đa 1.000 ký tự." dưới ô, `aria-invalid`, KHÔNG gọi API, giữ nội dung; sửa về 1.000 thì gửi được', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CREATED, 201));
    renderForm();
    pick(5);
    type('a'.repeat(1001));
    await clickSend();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Tối đa 1.000 ký tự.');
    expect(comment()).toHaveAttribute('aria-invalid', 'true');
    expect(comment()).toHaveAccessibleDescription(/Tối đa 1\.000 ký tự\./);
    expect(comment()).toHaveValue('a'.repeat(1001));
    type('a'.repeat(1000));
    expect(screen.queryByRole('alert')).toBeNull();
    await clickSend();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody().nhanXet).toHaveLength(1000);
  });

  it('WDG-10 500 emoji (1.000 đơn vị) gửi được, 501 emoji (1.002 đơn vị) bị chặn', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CREATED, 201));
    renderForm();
    pick(5);
    type('😀'.repeat(501));
    await clickSend();
    expect(fetchMock).not.toHaveBeenCalled();
    type('😀'.repeat(500));
    await clickSend();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WDG-03 chưa chọn sao VÀ nhận xét quá dài ⇒ hiện CẢ HAI lỗi, đúng ô của mỗi lỗi', async () => {
    renderForm();
    type('a'.repeat(1001));
    await clickSend();
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getByRole('radiogroup')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(comment()).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('doctor-exam F6 — form: gửi một lần (WDG-04, WDG-06)', () => {
  it('WDG-04 gửi đúng MỘT POST tới /patient/exam-records/<mã>/rating, thân `{ soSao, nhanXet }` đã chuẩn hoá (cắt hai đầu), rồi gọi `onRated` với thân 201', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CREATED, 201));
    const { onRated } = renderForm();
    pick(5);
    type('  Rất tốt  ');
    await clickSend();
    await waitFor(() => expect(onRated).toHaveBeenCalledTimes(1));
    expect(onRated).toHaveBeenCalledWith(CREATED);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/api/patient/exam-records/CLX-1/rating');
    expect(init?.method).toBe('POST');
    expect(sentBody()).toEqual({ soSao: 5, nhanXet: 'Rất tốt' });
  });

  it('WDG-04 không viết nhận xét (hay chỉ khoảng trắng) ⇒ thân CHỈ có `soSao`', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ...CREATED, nhanXet: null }, 201),
    );
    renderForm();
    pick(3);
    type('   \n  ');
    await clickSend();
    expect(String(fetchMock.mock.calls[0][1]?.body)).toBe('{"soSao":3}');
  });

  it('WDG-06 BẤM ĐÚP: hai `click` liên tiếp TRONG CÙNG lượt xử lý (state chưa kịp vẽ lại) ⇒ MỘT POST', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const { onRated } = renderForm();
    pick(4);
    act(() => {
      fireEvent.click(send());
      fireEvent.click(send());
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(jsonResponse(CREATED, 201));
    });
    await waitFor(() => expect(onRated).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WDG-06 bấm lần hai khi nút đã khoá (sau khi vẽ lại) cũng KHÔNG gửi thêm', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    renderForm();
    pick(4);
    await clickSend();
    expect(send()).toBeDisabled();
    fireEvent.click(send());
    fireEvent.click(send());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WDG-15 đang gửi: nút "Đang gửi..." và khoá, `Huỷ` khoá, ô sao khoá, nhận xét chỉ đọc, vùng form `aria-busy`; xong (lỗi) thì mở lại', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    renderForm();
    const busyArea = () =>
      screen.getByRole('radiogroup').closest('[aria-busy]')!;
    expect(busyArea()).toHaveAttribute('aria-busy', 'false');
    pick(2);
    type('Đang gõ');
    await clickSend();
    expect(send()).toHaveTextContent('Đang gửi...');
    expect(send()).toBeDisabled();
    expect(cancel()).toBeDisabled();
    expect(comment()).toHaveAttribute('readonly');
    for (const element of screen.getAllByRole('radio')) {
      expect(element).toBeDisabled();
    }
    expect(busyArea()).toHaveAttribute('aria-busy', 'true');
    await act(async () => {
      finish(apiError(503, 'HE_THONG_DANG_BAN'));
    });
    await screen.findByRole('alert');
    expect(send()).toBeEnabled();
    expect(send()).toHaveTextContent('Gửi đánh giá');
    expect(cancel()).toBeEnabled();
    expect(comment()).not.toHaveAttribute('readonly');
    expect(busyArea()).toHaveAttribute('aria-busy', 'false');
  });
});

describe('doctor-exam F6 — form: lỗi từ máy chủ, MỌI nhánh giữ sao và nhận xét (WDG-05)', () => {
  async function failWith(response: Response) {
    fetchMock.mockResolvedValue(response);
    const handlers = renderForm();
    pick(4);
    type('Nội dung phải còn nguyên');
    await clickSend();
    // `findAllBy…`: có nhánh hiện hai lỗi theo ô cùng lúc
    await screen.findAllByRole('alert');
    return handlers;
  }
  const kept = () => {
    expect(comment()).toHaveValue('Nội dung phải còn nguyên');
    expect(checkedStars()).toEqual(['4 sao']);
  };

  it('WDG-05 400 `soSao` ⇒ lỗi dưới hàng sao, KHÔNG dải chung, nội dung giữ', async () => {
    await failWith(
      apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'soSao', ma: 'SO_SAO_BAT_BUOC' }],
      }),
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('radiogroup')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Vui lòng chọn số sao.',
    );
    expect(send()).toBeEnabled();
    kept();
  });

  it('WDG-05 400 `nhanXet` `QUA_DAI` ⇒ lỗi dưới ô nhận xét, nội dung giữ', async () => {
    await failWith(
      apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'nhanXet', ma: 'QUA_DAI' }],
      }),
    );
    expect(comment()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Tối đa 1.000 ký tự.');
    kept();
  });

  it('WDG-05 400 mã lạ (lỗi lập trình) ⇒ dải chung "chưa thành công" bấm lại được; nội dung giữ', async () => {
    await failWith(
      apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'bacSiId', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
      }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(GENERIC_ERROR_MESSAGE);
    expect(send()).toBeEnabled();
    kept();
  });

  it('WDG-05 409 `LICH_HEN_CHUA_HOAN_THANH` ⇒ câu riêng, `Gửi đánh giá` KHOÁ (gửi lại không đổi kết quả), `Huỷ` còn dùng', async () => {
    await failWith(
      apiError(409, 'LICH_HEN_CHUA_HOAN_THANH', {
        chiTiet: { trangThai: 'DaXacNhan' },
      }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Chỉ đánh giá được ca khám đã hoàn thành.',
    );
    expect(send()).toBeDisabled();
    expect(cancel()).toBeEnabled();
    fireEvent.click(send());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    kept();
  });

  it('WDG-05 404, 403, 401 ⇒ câu theo mã và khoá gửi', async () => {
    const cases: [number, string, string][] = [
      [404, 'KHONG_TIM_THAY', 'Không tìm thấy ca khám này.'],
      [403, 'KHONG_DU_QUYEN', 'Bạn không có quyền thực hiện thao tác này.'],
      [
        401,
        'CHUA_DANG_NHAP',
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      ],
    ];
    for (const [status, maLoi, text] of cases) {
      fetchMock.mockReset();
      const view = (await failWith(apiError(status, maLoi))) as {
        unmount: () => void;
      };
      expect(screen.getByRole('alert')).toHaveTextContent(text);
      expect(send()).toBeDisabled();
      kept();
      view.unmount();
    }
  });

  it('WDG-05 503 `HE_THONG_DANG_BAN` ⇒ câu "đang bận", `Gửi` còn dùng; bấm lại là MỘT POST nữa do NGƯỜI DÙNG (không tự gửi lại)', async () => {
    await failWith(apiError(503, 'HE_THONG_DANG_BAN'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Hệ thống đang bận, thử lại sau ít phút.',
    );
    expect(send()).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValue(jsonResponse(CREATED, 201));
    await clickSend();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    kept();
  });

  it('WDG-05 409 `DA_DANH_GIA` ⇒ gọi `onAlreadyRated` đúng một lần (nơi gọi tải lại chi tiết) và hiện "Bạn đã đánh giá buổi khám này."; KHÔNG gọi `onRated`', async () => {
    const { onAlreadyRated, onRated } = await failWith(
      apiError(409, 'DA_DANH_GIA'),
    );
    expect(onAlreadyRated).toHaveBeenCalledTimes(1);
    expect(onRated).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bạn đã đánh giá buổi khám này.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WDG-05 gõ vào ô nhận xét chỉ bỏ lỗi của ô đó; chọn sao chỉ bỏ lỗi sao; dải chung ở lại', async () => {
    await failWith(
      apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [
          { truong: 'soSao', ma: 'SO_SAO_KHONG_HOP_LE' },
          { truong: 'nhanXet', ma: 'QUA_DAI' },
        ],
      }),
    );
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    type('Nội dung phải còn nguyên!');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('radiogroup')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    pick(5);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('doctor-exam F6 — form: "chưa rõ", KHÔNG tự gửi lại (WDG-07)', () => {
  const UNSURE = /Chưa rõ đánh giá đã được gửi chưa/;

  it('WDG-07 mất mạng ⇒ "Chưa rõ…", sao và nhận xét còn, nút mở lại, ĐÚNG MỘT POST sau khi chờ; người dùng bấm lại thì mới gửi lần hai', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderForm();
    pick(2);
    type('Giữ nguyên khi mất mạng');
    await clickSend();
    await screen.findByText(UNSURE);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(comment()).toHaveValue('Giữ nguyên khi mất mạng');
    expect(checkedStars()).toEqual(['2 sao']);
    expect(send()).toBeEnabled();

    fetchMock.mockResolvedValue(apiError(409, 'DA_DANH_GIA'));
    await clickSend();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('WDG-07 quá giờ chờ (15 giây) ⇒ cùng câu "chưa rõ", nội dung còn, MỘT POST', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    renderForm();
    pick(3);
    type('Nội dung còn khi quá giờ');
    fireEvent.click(send());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_001);
    });
    expect(screen.getByText(UNSURE)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(comment()).toHaveValue('Nội dung còn khi quá giờ');
    expect(send()).toBeEnabled();
  });

  it('WDG-07 201 sai hình dạng (thiếu khoá) ⇒ "chưa rõ" (có thể máy chủ đã lưu), KHÔNG gọi `onRated`, nội dung còn', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ soSao: 9 }, 201));
    const { onRated } = renderForm();
    pick(3);
    type('Còn nguyên');
    await clickSend();
    await screen.findByText(UNSURE);
    expect(onRated).not.toHaveBeenCalled();
    expect(comment()).toHaveValue('Còn nguyên');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WDG-07 nginx 502 (không phải JSON) ⇒ "chưa rõ" như mất mạng', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>Bad Gateway</html>', { status: 502 }),
    );
    renderForm();
    pick(1);
    await clickSend();
    await screen.findByText(UNSURE);
  });
});

describe('doctor-exam F6 — form: gỡ khi đang gửi và khoá tên lớp (WDG-17, WDG-18)', () => {
  it('WDG-18 gỡ form khi đang gửi ⇒ yêu cầu bị huỷ (`signal`), kết quả muộn KHÔNG gọi `onRated` và không báo lỗi', async () => {
    let signal: AbortSignal | null | undefined;
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation((_input, init) => {
      signal = init?.signal;
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });
    const { onRated, unmount } = renderForm();
    pick(5);
    await clickSend();
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      finish(jsonResponse(CREATED, 201));
    });
    expect(onRated).not.toHaveBeenCalled();
  });

  it('WDG-17 nút chính `bg-brand-strong` (không `bg-brand`), chữ trắng, cao `h-12`, chia đôi `flex-1`; `Huỷ` viền `border-gray-300`, nền trắng, cùng cỡ', () => {
    renderForm();
    expect(send()).toHaveClass('bg-brand-strong');
    expect(send()).not.toHaveClass('bg-brand');
    expect(send()).toHaveClass('text-white');
    expect(send()).toHaveClass('h-12');
    expect(send()).toHaveClass('flex-1');
    expect(send()).toHaveClass('rounded-[13.375px]');
    expect(cancel()).toHaveClass('border-gray-300');
    expect(cancel()).toHaveClass('bg-white');
    expect(cancel()).toHaveClass('h-12');
    expect(cancel()).toHaveClass('flex-1');
    expect(cancel()).toHaveClass('rounded-[13.375px]');
    expect(send().parentElement).toHaveClass('gap-2.5');
  });

  it('WDG-17 KHÔNG có override focus riêng (quy tắc FE của Đại 16/11/2026, ADR 0004: lớp base `styles/index.css` lo viền focus): không lớp `focus:`, `focus-visible:`, `focus-within:`, `outline`, `ring` trên ô nhận xét, ô sao và hai nút', () => {
    renderForm();
    const own =
      /(^|:)(?:focus|focus-visible|focus-within)(?::|$)|(^|:)(?:outline|ring)(?:-|$)|outline-offset/;
    const elements = [
      comment(),
      ...screen.getAllByRole('radio'),
      send(),
      cancel(),
    ];
    for (const element of elements) {
      const found = element.className
        .split(/\s+/)
        .filter((token) => own.test(token));
      expect(found).toEqual([]);
    }
    // đối chứng: bộ lọc có tác dụng
    expect(
      [
        'focus:ring-2',
        'focus-visible:outline-2',
        'outline-none',
        'ring-1',
        'hover:focus:x',
      ].filter((token) => own.test(token)),
    ).toHaveLength(5);
    expect(
      [
        'border-gray-300',
        'aria-[invalid=true]:border-danger',
        'placeholder:text-gray-500',
      ].filter((token) => own.test(token)),
    ).toEqual([]);
  });

  it('WDG-17 (Chromium, TRACKING 24.8) ô nhận xét cao ĐÚNG 95,75 vì `rows` nhỏ (`rows` 4 làm ô cao 105,65: lỗi do Chromium bắt) và bộ đếm cách ô 6,5 (`mt-[6.5px]`: Figma `423:438` đặt ô 95,75 trong khung 102,25)', () => {
    renderForm();
    expect(comment()).toHaveAttribute('rows', '2');
    expect(counter()).toHaveClass('mt-[6.5px]');
  });

  it('WDG-17 ô nhận xét cao tối thiểu 95,75, bo 13,375, gợi ý `placeholder:text-gray-500`; dấu `*` của "Số sao" là `text-danger`', () => {
    renderForm();
    expect(comment()).toHaveClass('min-h-[95.75px]');
    expect(comment()).toHaveClass('rounded-[13.375px]');
    expect(comment()).toHaveClass('placeholder:text-gray-500');
    expect(comment()).toHaveClass('border-gray-300');
    expect(screen.getByText('*')).toHaveClass('text-danger');
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
  });
});
