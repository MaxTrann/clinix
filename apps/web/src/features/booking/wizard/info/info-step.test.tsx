import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../../shared/api/error-message';
import { setApiAuthHooks } from '../../../../shared/api/auth-hooks';
import { apiError, createFakeAuthApi } from '../../../../test/fake-auth-api';
import { PATIENT_PROFILE_PATH } from '../../../../shared/routes/booking-paths';
import { resetAuthForTest } from '../../../auth/auth-session';
import { setAuthState } from '../../../auth/auth-store';
import { RELATIVES, makeCheckResult } from '../../testing/fake-booking-api';
import {
  renderInfoStep,
  type InfoHarnessOptions,
} from '../../testing/info-step-harness';
import { VISIT_REASON_MESSAGES } from './visit-reason-rules';

// booking F4: giao diện Bước 4 "Người khám" (Figma `449:2`, `450:2`) với API giả. WZ-02, WZ-03, WZ-08 (phần điền sẵn), WZ-14 (phần Bước 4) của PLAN booking 7.15;
// BIS-01…BIS-11 là [đề xuất] (mục 7.38). Bản nháp, kho trình duyệt và hợp đồng với F5 ở `info-draft.test.tsx` (BDF).
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const failure = (status: number, maLoi: string, chiTiet?: unknown) =>
  json(status, { maLoi, thongBao: 'câu của API', chiTiet });

const continueButton = () => screen.getByRole('button', { name: 'Tiếp tục' });
const toggle = () =>
  screen.getByRole('button', { name: 'Chọn người thân khác' });
const textbox = () =>
  screen.getByRole('textbox', { name: 'Lý do khám (không bắt buộc)' });
const profileRegion = () =>
  screen.getByRole('region', { name: 'Người đi khám' });
const slotRegion = () =>
  screen.getByRole('complementary', { name: 'Lịch hẹn đang chọn' });
// Thẻ `Đang chọn` (khác các hàng của hộp chọn có cùng tên)
const selectedCard = () => screen.getByText('Đang chọn').closest('div')!;
const here = (router: {
  state: { location: { pathname: string; search: string } };
}) => router.state.location.pathname + router.state.location.search;

async function ready() {
  await waitFor(() => expect(continueButton()).toBeEnabled());
}
async function openPanel() {
  fireEvent.click(toggle());
  const group = await screen.findByRole('radiogroup', {
    name: 'Chọn người đi khám',
  });
  await waitFor(() =>
    expect(within(group).getAllByRole('radio').length).toBeGreaterThan(1),
  );
  return group;
}

beforeEach(() => {
  resetAuthForTest();
  setAuthState({
    status: 'authenticated',
    user: { vaiTro: 'BenhNhan', hoTen: 'Nguyễn Văn A', daXacMinhEmail: true },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
  resetAuthForTest();
});

describe('booking F4 — chọn hồ sơ đi khám', () => {
  it('BIS-01 WZ-02 mặc định: hồ sơ BẢN THÂN `Đang chọn` (tên từ phiên); Tiếp tục tắt tới khi `checks` xong', async () => {
    const { api } = renderInfoStep();
    expect(continueButton()).toBeDisabled();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Thông tin người khám' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Chọn hồ sơ người đi khám và cho bác sĩ biết lý do khám (nếu có)',
      ),
    ).toBeInTheDocument();
    const card = within(profileRegion());
    expect(card.getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(card.getByText('Bản thân')).toBeInTheDocument();
    expect(card.getByText('Đang chọn')).toBeInTheDocument();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');

    await ready();
    expect(api.checkBodies).toEqual([
      { khungGioId: '5', hoSoNguoiThanId: null },
    ]);
  });

  it('BIS-02 WZ-02 hộp chọn: bản thân + người thân HIỆU LỰC, ẩn hồ sơ ngừng; chọn người thân ⇒ thẻ đổi, hộp ở yên, `checks` gọi lại theo hồ sơ mới; đóng ⇒ tiêu điểm về nút mở', async () => {
    const { api } = renderInfoStep();
    await ready();
    const group = await openPanel();
    // Nút mở được thay bằng hộp (Figma `450:2`); lựa chọn đang chọn nhận tiêu điểm
    expect(
      screen.queryByRole('button', { name: 'Chọn người thân khác' }),
    ).toBeNull();
    expect(
      within(group).getByRole('radio', { name: /Nguyễn Văn A/ }),
    ).toHaveFocus();

    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(
      within(group).getByRole('radio', { name: /Nguyễn Văn A/ }),
    ).toBeChecked();
    expect(
      within(group).getByRole('radio', { name: /Nguyễn Thị Bích/ }),
    ).not.toBeChecked();
    expect(within(group).getByText('Mẹ')).toBeInTheDocument();
    expect(within(group).getByText('Con')).toBeInTheDocument();
    // Hồ sơ ngừng sử dụng không bao giờ hiện
    expect(screen.queryByText('Nguyễn Văn Cũ')).toBeNull();
    expect(screen.queryByText('Ông/Bà')).toBeNull();

    fireEvent.click(
      within(group).getByRole('radio', { name: /Nguyễn Minh Tuấn/ }),
    );
    expect(
      within(selectedCard()).getByText('Nguyễn Minh Tuấn'),
    ).toBeInTheDocument();
    expect(within(selectedCard()).getByText('Con')).toBeInTheDocument();
    expect(
      within(group).getByRole('radio', { name: /Nguyễn Minh Tuấn/ }),
    ).toBeChecked();
    await waitFor(() =>
      expect(api.checkBodies.at(-1)).toEqual({
        khungGioId: '5',
        hoSoNguoiThanId: '102',
      }),
    );
    await ready();
    expect(api.checkBodies).toHaveLength(2);

    fireEvent.click(
      screen.getByRole('button', { name: 'Đóng, giữ lựa chọn hiện tại' }),
    );
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(toggle()).toHaveFocus();
    // Đóng không đổi lựa chọn
    expect(
      within(selectedCard()).getByText('Nguyễn Minh Tuấn'),
    ).toBeInTheDocument();
    expect(api.checkBodies).toHaveLength(2);
  });

  it('BIS-03 WZ-02 danh sách người thân rỗng ⇒ chỉ có bản thân, kèm câu báo; nút ✕ cũng đóng hộp', async () => {
    renderInfoStep({
      before: (api) => {
        api.relatives = { items: [] };
      },
    });
    await ready();
    // Chỉ có một lựa chọn (bản thân) nên không dùng `openPanel` (nó chờ thêm radio)
    fireEvent.click(toggle());
    const group = await screen.findByRole('radiogroup', {
      name: 'Chọn người đi khám',
    });
    expect(within(group).getAllByRole('radio')).toHaveLength(1);
    expect(
      await screen.findByText('Bạn chưa có hồ sơ người thân.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng danh sách' }));
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(toggle()).toHaveFocus();
  });

  it.each([
    [
      'mất mạng',
      () => Promise.reject(new TypeError('Failed to fetch')),
      NETWORK_ERROR_MESSAGE,
      true,
    ],
    ['5xx', () => apiError(500, 'LOI_HE_THONG'), GENERIC_ERROR_MESSAGE, true],
    ['mã lạ', () => apiError(409, 'MA_LA'), GENERIC_ERROR_MESSAGE, true],
    [
      'phiên hết hạn',
      () => apiError(401, 'CHUA_DANG_NHAP'),
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      false,
    ],
    [
      'không đủ quyền',
      () => apiError(403, 'KHONG_DU_QUYEN'),
      'Bạn không có quyền xem danh sách này.',
      false,
    ],
  ])(
    'BIS-03 WZ-02 lỗi tải danh sách (%s) ⇒ câu trong HỘP, bản thân vẫn chọn và đi tiếp được',
    async (_name, override, message, retryable) => {
      const { api, router } = renderInfoStep({
        before: (api) => api.failRelativesNext(override),
      });
      await ready();
      fireEvent.click(toggle());
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(screen.queryByRole('button', { name: 'Thử lại' }) !== null).toBe(
        retryable,
      );
      // Chỉ ảnh hưởng hộp: bản thân vẫn là lựa chọn duy nhất, Tiếp tục vẫn bật
      expect(screen.getAllByRole('radio')).toHaveLength(1);
      expect(continueButton()).toBeEnabled();

      if (retryable) {
        fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
        await waitFor(() =>
          expect(screen.getAllByRole('radio')).toHaveLength(3),
        );
        expect(api.count('GET', '/patient/relatives')).toBe(2);
        expect(screen.queryByRole('alert')).toBeNull();
      } else {
        fireEvent.click(continueButton());
        await waitFor(() =>
          expect(here(router)).toBe('/dat-lich/xac-nhan?khungGioId=5'),
        );
      }
    },
  );

  it('BIS-03 quá giờ (15 giây) khi tải danh sách ⇒ câu quá giờ + Thử lại trong hộp', async () => {
    vi.useFakeTimers();
    const auth = createFakeAuthApi();
    renderInfoStep({
      before: (api) => api.failRelativesNext((init) => auth.hang(init)),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    fireEvent.click(toggle());
    expect(screen.getByRole('alert')).toHaveTextContent(TIMEOUT_ERROR_MESSAGE);
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeVisible();
    expect(continueButton()).toBeEnabled();
  });

  it('BIS-04 hồ sơ vừa bị NGỪNG giữa lúc đang chọn: 409 `HO_SO_NGUOI_THAN_DA_NGUNG` ⇒ câu, Tiếp tục tắt, danh sách tải lại, tự về bản thân kèm thông báo', async () => {
    let releaseReload!: (response: Response) => void;
    const { api, router } = renderInfoStep({
      before: (api) => {
        api.onCheck = (body) =>
          body.hoSoNguoiThanId === '101'
            ? failure(409, 'HO_SO_NGUOI_THAN_DA_NGUNG')
            : undefined;
      },
    });
    await ready();
    const group = await openPanel();
    // Lần tải lại danh sách kế tiếp bị giữ, rồi trả danh sách MỚI không còn hồ sơ 101
    api.failRelativesNext(
      () => new Promise<Response>((resolve) => (releaseReload = resolve)),
    );
    fireEvent.click(
      within(group).getByRole('radio', { name: /Nguyễn Thị Bích/ }),
    );

    const message = 'Hồ sơ này đã ngừng sử dụng. Vui lòng chọn hồ sơ khác.';
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
    await waitFor(() => expect(api.count('GET', '/patient/relatives')).toBe(2));

    await act(async () => {
      releaseReload(json(200, { items: [RELATIVES.items[1]] }));
    });
    expect(
      await screen.findByText(
        'Hồ sơ người thân đã chọn không còn khả dụng. Hệ thống đã chuyển về hồ sơ của bạn.',
      ),
    ).toBeInTheDocument();
    await ready();
    expect(screen.queryByText(message)).toBeNull();
    expect(
      within(selectedCard()).getByText('Nguyễn Văn A'),
    ).toBeInTheDocument();
    expect(api.checkBodies.at(-1)).toEqual({
      khungGioId: '5',
      hoSoNguoiThanId: null,
    });
    fireEvent.click(continueButton());
    await waitFor(() =>
      expect(here(router)).toBe('/dat-lich/xac-nhan?khungGioId=5'),
    );
  });
});

describe('booking F4 — lý do khám', () => {
  it('BIS-05 WZ-03 để trống ⇒ Tiếp tục sang Bước 5, lý do là null; ô có nhãn "Lý do khám (không bắt buộc)", chú thích và gợi ý đúng Figma', async () => {
    const { router } = renderInfoStep();
    await ready();
    expect(textbox()).toHaveAccessibleDescription(
      'Mô tả ngắn triệu chứng hoặc điều bạn muốn trao đổi với bác sĩ.',
    );
    expect(textbox()).toHaveAttribute(
      'placeholder',
      'Ví dụ: đau lưng 2 tuần, khó ngủ...',
    );
    expect(textbox()).toHaveAttribute('aria-invalid', 'false');
    expect(textbox()).not.toHaveAttribute('maxlength');
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(continueButton());
    await waitFor(() =>
      expect(here(router)).toBe('/dat-lich/xac-nhan?khungGioId=5'),
    );
    expect(JSON.parse(screen.getByTestId('draft').textContent ?? '')).toEqual({
      khungGioId: '5',
      hoSoNguoiThanId: null,
      lyDoKham: null,
    });
  });

  it('BIS-05 WZ-03 đúng 500 ký tự đi tiếp; 501 bị chặn NGAY dưới ô (role="alert", aria-invalid), Tiếp tục đưa tiêu điểm về ô; sửa còn 500 thì lỗi biến mất', async () => {
    const { router } = renderInfoStep();
    await ready();
    fireEvent.change(textbox(), { target: { value: 'a'.repeat(501) } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      VISIT_REASON_MESSAGES.tooLong,
    );
    expect(textbox()).toHaveAttribute('aria-invalid', 'true');
    expect(textbox()).toHaveAccessibleDescription(
      expect.stringContaining('tối đa 500 ký tự'),
    );
    // Không cắt thầm: ô vẫn giữ đủ 501 ký tự
    expect((textbox() as HTMLTextAreaElement).value).toHaveLength(501);

    fireEvent.click(continueButton());
    expect(textbox()).toHaveFocus();
    expect(here(router)).toBe('/dat-lich/thong-tin?khungGioId=5');

    fireEvent.change(textbox(), { target: { value: 'a'.repeat(500) } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(continueButton());
    await waitFor(() =>
      expect(here(router)).toBe('/dat-lich/xac-nhan?khungGioId=5'),
    );
    expect(
      JSON.parse(screen.getByTestId('draft').textContent ?? '').lyDoKham,
    ).toBe('a'.repeat(500));
  });

  it('BIS-05 WZ-03 đếm theo ĐIỂM MÃ: 500 emoji qua, 501 emoji bị chặn; ký tự điều khiển có câu riêng', async () => {
    renderInfoStep();
    await ready();
    fireEvent.change(textbox(), { target: { value: '😀'.repeat(500) } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.change(textbox(), { target: { value: '😀'.repeat(501) } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      VISIT_REASON_MESSAGES.tooLong,
    );
    fireEvent.change(textbox(), { target: { value: 'đau\tđầu' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      VISIT_REASON_MESSAGES.control,
    );
  });
});

describe('booking F4 — khối "Lịch hẹn đang chọn" và lỗi của `checks`', () => {
  it('BIS-06 ba hàng Dịch vụ, Bác sĩ, Thời gian theo giờ Việt Nam; KHÔNG giá, cọc, chi nhánh', async () => {
    renderInfoStep();
    expect(within(slotRegion()).getByRole('status')).toHaveTextContent(
      'Đang kiểm tra lịch hẹn',
    );
    expect(slotRegion()).toHaveAttribute('aria-busy', 'true');
    await ready();
    const slot = within(slotRegion());
    expect(slotRegion()).toHaveAttribute('aria-busy', 'false');
    expect(slot.getByText('Dịch vụ').nextElementSibling).toHaveTextContent(
      'Tim mạch',
    );
    expect(slot.getByText('Bác sĩ').nextElementSibling).toHaveTextContent(
      'ThS.BS. Nguyễn Minh Anh',
    );
    expect(slot.getByText('Thời gian').nextElementSibling).toHaveTextContent(
      '09:00 · Thứ 3, 20/10/2026',
    );
    // `tomTat` có giá, cọc, chi nhánh nhưng Bước 4 không chép
    for (const hidden of [
      /300\.000/,
      /100\.000/,
      /Quận 3/,
      /Nguyễn Thị Minh Khai/,
    ]) {
      expect(screen.queryByText(hidden)).toBeNull();
    }
  });

  it('BIS-06 giờ qua nửa đêm theo giờ Việt Nam: 17:30 UTC ⇒ 00:30 ngày hôm sau, không theo múi giờ máy', async () => {
    renderInfoStep({
      before: (api) => {
        api.check = makeCheckResult({ thoiGian: '2026-10-19T17:30:00.000Z' });
      },
    });
    await ready();
    expect(
      within(slotRegion()).getByText('Thời gian').nextElementSibling,
    ).toHaveTextContent('00:30 · Thứ 3, 20/10/2026');
  });

  // [HTTP, maLoi, chiTiet, câu, có liên kết "Chọn lại dịch vụ", có Thử lại]
  it.each([
    [
      409,
      'KHUNG_GIO_DA_DAT',
      undefined,
      'Khung giờ này vừa có người đặt. Vui lòng chọn khung giờ khác.',
      true,
      false,
    ],
    [
      409,
      'KHUNG_GIO_DANG_GIU',
      undefined,
      'Khung giờ này đang được người khác giữ chỗ. Vui lòng chọn khung giờ khác hoặc thử lại sau ít phút.',
      true,
      true,
    ],
    [
      409,
      'KHUNG_GIO_DA_QUA',
      undefined,
      'Khung giờ này đã qua. Vui lòng chọn khung giờ khác.',
      true,
      false,
    ],
    [
      404,
      'KHUNG_GIO_KHONG_TON_TAI',
      undefined,
      'Không tìm thấy khung giờ này.',
      true,
      false,
    ],
    [
      409,
      'CHI_NHANH_NGHI',
      { thuTrongTuan: 7 },
      'Chi nhánh nghỉ vào Chủ nhật.',
      true,
      false,
    ],
    [
      409,
      'NGOAI_GIO_HOAT_DONG',
      { thuTrongTuan: 3, gioMo: '07:30', gioDong: '17:00' },
      'Ngoài giờ hoạt động, chi nhánh mở cửa từ 07:30 đến 17:00.',
      true,
      false,
    ],
    [
      409,
      'BAC_SI_NGHI_PHEP',
      undefined,
      'Bác sĩ nghỉ vào thời gian này. Vui lòng chọn khung giờ khác.',
      true,
      false,
    ],
    [
      403,
      'DAT_LICH_BI_KHOA_NO_SHOW',
      undefined,
      'Tài khoản đang bị khoá đặt lịch trực tuyến do vắng mặt nhiều lần. Vui lòng liên hệ Lễ tân hoặc Quản trị viên.',
      false,
      false,
    ],
    [
      403,
      'KHONG_DU_QUYEN',
      undefined,
      'Tài khoản này không được phép đặt lịch.',
      false,
      false,
    ],
    [
      409,
      'HE_THONG_CHUA_CAU_HINH',
      undefined,
      'Hệ thống chưa sẵn sàng nhận đặt lịch. Vui lòng thử lại sau.',
      false,
      true,
    ],
  ])(
    'BIS-07 lỗi của khung giờ hoặc tài khoản %i %s ⇒ đúng câu theo `maLoi`, Tiếp tục tắt, không chuyển trang',
    async (status, maLoi, chiTiet, message, hasLink, hasRetry) => {
      const { router, api } = renderInfoStep({
        before: (api) => {
          api.onCheck = () => failure(status, maLoi, chiTiet);
        },
      });
      const slot = within(slotRegion());
      expect(await slot.findByRole('alert')).toHaveTextContent(message);
      expect(
        slot
          .queryByRole('link', { name: 'Chọn lại dịch vụ' })
          ?.getAttribute('href') ?? null,
      ).toBe(hasLink ? '/dat-lich' : null);
      expect(slot.queryByRole('button', { name: 'Thử lại' }) !== null).toBe(
        hasRetry,
      );
      expect(continueButton()).toBeDisabled();
      fireEvent.click(continueButton());
      expect(here(router)).toBe('/dat-lich/thong-tin?khungGioId=5');
      expect(api.bookingWrites()).toEqual([]);
    },
  );

  it('BIS-07 cùng mã HTTP 409, `maLoi` khác ⇒ câu khác (chọn theo `maLoi`, không theo mã HTTP)', async () => {
    const messages: string[] = [];
    for (const maLoi of ['KHUNG_GIO_DA_DAT', 'BAC_SI_KHONG_KHA_DUNG']) {
      const { unmount } = renderInfoStep({
        before: (api) => {
          api.onCheck = () => failure(409, maLoi);
        },
      });
      messages.push(
        (await within(slotRegion()).findByRole('alert')).textContent ?? '',
      );
      unmount();
    }
    expect(new Set(messages).size).toBe(2);
  });

  it.each([
    [
      'VUOT_SO_LICH_HEN_TOI_DA',
      { toiDa: 3 },
      'Hồ sơ này đã có 3 lịch hẹn đang hoạt động, là mức tối đa.',
    ],
    [
      'LICH_HEN_TRUNG_THOI_GIAN',
      { maLichHen: 'CP20261018001', thoiGian: '2026-10-20T02:00:00.000Z' },
      'Hồ sơ này đã có lịch hẹn CP20261018001 trùng thời gian.',
    ],
  ])(
    'BIS-07 A3 %s của RIÊNG hồ sơ bản thân ⇒ câu dưới thẻ hồ sơ, Tiếp tục tắt; chọn người thân thì kiểm lại, câu biến mất và đi tiếp được',
    async (maLoi, chiTiet, message) => {
      const { api, router } = renderInfoStep({
        before: (api) => {
          api.onCheck = (body) =>
            body.hoSoNguoiThanId === null
              ? failure(409, maLoi, chiTiet)
              : undefined;
        },
      });
      expect(
        await within(profileRegion()).findByText(message),
      ).toBeInTheDocument();
      // Khối bên phải không có tóm tắt cho hồ sơ này, và KHÔNG hiện câu lỗi lần hai
      expect(
        within(slotRegion()).getByText(
          'Chưa có thông tin lịch hẹn cho hồ sơ này.',
        ),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(continueButton()).toBeDisabled();

      const group = await openPanel();
      fireEvent.click(
        within(group).getByRole('radio', { name: /Nguyễn Thị Bích/ }),
      );
      await ready();
      expect(screen.queryByText(message)).toBeNull();
      expect(within(slotRegion()).getByText('Tim mạch')).toBeInTheDocument();
      fireEvent.click(continueButton());
      await waitFor(() =>
        expect(here(router)).toBe('/dat-lich/xac-nhan?khungGioId=5'),
      );
      expect(
        JSON.parse(screen.getByTestId('draft').textContent ?? '')
          .hoSoNguoiThanId,
      ).toBe('101');
      expect(api.bookingWrites()).toEqual([]);
    },
  );

  // booking F5 đổi có chủ ý hành vi nhỏ của Bước 4: 404 `KHONG_TIM_THAY` (hồ sơ không có hay của người khác, cùng một thân; PLAN 5.14 chưa có câu) vào bảng câu lỗi chung. Trước đây
  // rơi về câu chung + `Thử lại` vô ích (thử lại cùng yêu cầu cùng kết quả). Câu TRUNG TÍNH: 404 có thể do hồ sơ hay do khung giờ, nên không đổ riêng cho hồ sơ.
  it('BIS-07 F5 404 `KHONG_TIM_THAY` ⇒ câu TRUNG TÍNH dưới thẻ hồ sơ (không phải câu chung, không đổ riêng cho hồ sơ), không `Thử lại`, Tiếp tục tắt; chọn người thân thì kiểm lại và đi tiếp được', async () => {
    const message =
      'Không tìm thấy thông tin để đặt lịch. Vui lòng chọn lại hồ sơ đi khám hoặc khung giờ.';
    renderInfoStep({
      before: (api) => {
        api.onCheck = (body) =>
          body.hoSoNguoiThanId === null
            ? failure(404, 'KHONG_TIM_THAY')
            : undefined;
      },
    });
    expect(
      await within(profileRegion()).findByText(message),
    ).toBeInTheDocument();
    expect(message).not.toMatch(/ngừng|đã có|của người khác/);
    expect(screen.queryByText(GENERIC_ERROR_MESSAGE)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(continueButton()).toBeDisabled();

    const group = await openPanel();
    fireEvent.click(
      within(group).getByRole('radio', { name: /Nguyễn Thị Bích/ }),
    );
    await ready();
    expect(screen.queryByText(message)).toBeNull();
  });

  it.each([
    [
      'mất mạng',
      () => Promise.reject(new TypeError('Failed to fetch')),
      NETWORK_ERROR_MESSAGE,
    ],
    ['5xx', () => apiError(500, 'LOI_HE_THONG'), GENERIC_ERROR_MESSAGE],
    ['mã lạ', () => apiError(409, 'MA_LA'), GENERIC_ERROR_MESSAGE],
    [
      'thân lạ (HTML 502)',
      () => new Response('<html>502</html>', { status: 502 }),
      GENERIC_ERROR_MESSAGE,
    ],
  ])(
    'BIS-07 lỗi chung (%s) ⇒ câu chung + Thử lại; Tiếp tục tắt; Thử lại gọi lại và vào được',
    async (_name, override, message) => {
      const { api } = renderInfoStep({
        before: (api) => api.failCheckNext(override),
      });
      const slot = within(slotRegion());
      expect(await slot.findByRole('alert')).toHaveTextContent(message);
      expect(continueButton()).toBeDisabled();
      fireEvent.click(slot.getByRole('button', { name: 'Thử lại' }));
      await ready();
      expect(api.count('POST', '/booking/checks')).toBe(2);
      expect(slot.queryByRole('alert')).toBeNull();
    },
  );

  it('BIS-07 phản hồi 200 sai hình dạng ⇒ coi như lỗi (không vẽ dữ liệu sai), Tiếp tục tắt', async () => {
    renderInfoStep({
      before: (api) => {
        api.check = { tomTat: { dichVu: null } };
      },
    });
    expect(await within(slotRegion()).findByRole('alert')).toHaveTextContent(
      GENERIC_ERROR_MESSAGE,
    );
    expect(continueButton()).toBeDisabled();
  });
});

describe('booking F4 — điểm vào, điều hướng, trợ năng, đua', () => {
  it('BIS-08 WZ-08 điểm vào `?khungGioId=` đã đăng nhập: form điền sẵn mặc định, đúng khung giờ, MỘT lần `checks`, KHÔNG lời gọi ghi hay giữ chỗ', async () => {
    const { api, router } = renderInfoStep({
      path: '/dat-lich/thong-tin?khungGioId=9223372036854775807',
    });
    await ready();
    expect(api.checkBodies).toEqual([
      { khungGioId: '9223372036854775807', hoSoNguoiThanId: null },
    ]);
    expect(
      within(selectedCard()).getByText('Nguyễn Văn A'),
    ).toBeInTheDocument();
    expect((textbox() as HTMLTextAreaElement).value).toBe('');
    expect(api.count('GET', '/patient/relatives')).toBe(1);
    expect(api.bookingWrites()).toEqual([]);
    expect(here(router)).toBe(
      '/dat-lich/thong-tin?khungGioId=9223372036854775807',
    );
    // Tiếp tục mang đúng khung giờ sang Bước 5
    fireEvent.click(continueButton());
    await waitFor(() =>
      expect(here(router)).toBe(
        '/dat-lich/xac-nhan?khungGioId=9223372036854775807',
      ),
    );
    expect(api.bookingWrites()).toEqual([]);
  });

  it('BIS-09 bấm đúp Tiếp tục ⇒ đúng MỘT lần chuyển trang (và một mục lịch sử mới: lùi một bước là về Bước 4)', async () => {
    const { router } = renderInfoStep();
    await ready();
    const navigate = vi.spyOn(router, 'navigate');
    const button = continueButton();
    // Hai lần bấm trong CÙNG một lượt (chưa kịp vẽ lại): cờ chặn là thứ duy nhất ngăn lần hai
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() =>
      expect(here(router)).toBe('/dat-lich/xac-nhan?khungGioId=5'),
    );
    expect(navigate).toHaveBeenCalledTimes(1);
    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() =>
      expect(here(router)).toBe('/dat-lich/thong-tin?khungGioId=5'),
    );
  });

  it('BIS-09 `Quay lại` và liên kết "Chọn lại dịch vụ" (Đại duyệt 13/11/2026: tạm về Bước 1) ⇒ đều dẫn tới /dat-lich; bấm là sang Bước 1, không lời gọi ghi', async () => {
    const { router, api } = renderInfoStep();
    await ready();
    const back = screen.getByRole('link', { name: 'Quay lại' });
    const again = screen.getByRole('link', { name: 'Chọn lại dịch vụ' });
    expect(back).toHaveAttribute('href', '/dat-lich');
    expect(again).toHaveAttribute('href', '/dat-lich');
    fireEvent.click(back);
    await waitFor(() => expect(here(router)).toBe('/dat-lich'));
    expect(
      await screen.findByText('Bước 1 của luồng đặt lịch'),
    ).toBeInTheDocument();
    expect(api.bookingWrites()).toEqual([]);
  });

  it('BIS-10 WZ-14 bàn phím và nhãn: thứ tự Tab, nhóm radio cùng `name`, `Esc` đóng hộp và trả tiêu điểm, hộp có tên', async () => {
    renderInfoStep();
    await ready();
    // Các điểm dừng của phím Tab theo thứ tự trong DOM (không có `tabindex` dương nào)
    const stops = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), textarea, input',
        ),
      ).map((element) => {
        if (element.tagName === 'TEXTAREA') return 'textarea';
        if (element.tagName === 'INPUT')
          return (element as HTMLInputElement).type;
        return (
          element.getAttribute('aria-label') ?? element.textContent?.trim()
        );
      });
    // Hộp đóng: liên kết "Chọn lại dịch vụ" → nút mở → ô lý do → Quay lại → Tiếp tục (rồi liên kết của khung thử)
    expect(stops()).toEqual([
      'Chọn lại dịch vụ',
      'Chọn người thân khác',
      'textarea',
      'Quay lại',
      'Tiếp tục',
      'Sang khung giờ 6',
    ]);
    expect(
      document.querySelector('[tabindex]:not([tabindex="-1"])'),
    ).toBeNull();

    const group = await openPanel();
    // Hộp mở: ✕ → các radio → Thêm hồ sơ → Làm mới → nút đóng → ô lý do
    expect(stops().slice(0, 9)).toEqual([
      'Chọn lại dịch vụ',
      'Đóng danh sách',
      'radio',
      'radio',
      'radio',
      'Thêm hồ sơ người thân mới (mở trong tab mới)',
      'Làm mới danh sách',
      'Đóng, giữ lựa chọn hiện tại',
      'textarea',
    ]);
    const names = within(group)
      .getAllByRole('radio')
      .map((radio) => radio.getAttribute('name'));
    expect(new Set(names).size).toBe(1);
    expect(names[0]).toBeTruthy();

    fireEvent.keyDown(
      within(group).getByRole('radio', { name: /Nguyễn Văn A/ }),
      { key: 'Escape' },
    );
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(toggle()).toHaveFocus();
  });

  it('BIS-10 WZ-14 lỗi lý do nối với ô bằng `aria-describedby` (cả chú thích lẫn lỗi), lỗi `role="alert"`', async () => {
    renderInfoStep();
    await ready();
    fireEvent.change(textbox(), { target: { value: 'a'.repeat(501) } });
    const describedBy =
      textbox().getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(describedBy).toHaveLength(2);
    expect(document.getElementById(describedBy[1])).toBe(
      screen.getByRole('alert'),
    );
    expect(document.getElementById(describedBy[0])).toHaveTextContent(
      'Mô tả ngắn triệu chứng',
    );
  });

  const addProfileCases: [string, NonNullable<InfoHarnessOptions['before']>][] =
    [
      [
        'danh sách rỗng',
        (api) => {
          api.relatives = { items: [] };
        },
      ],
      ['danh sách có người thân', () => undefined],
      [
        'lỗi tải danh sách',
        (api) => api.failRelativesNext(() => apiError(500, 'LOI_HE_THONG')),
      ],
    ];
  it.each(addProfileCases)(
    'BIS-13 hàng "Thêm hồ sơ người thân mới" (%s) là liên kết mở TAB MỚI tới trang người thân (target=_blank, rel noopener noreferrer); bấm không đổi trang này',
    async (_name, before) => {
      const { router, api } = renderInfoStep({ before });
      await ready();
      fireEvent.click(toggle());
      const link = await screen.findByRole('link', {
        name: /Thêm hồ sơ người thân mới/,
      });
      expect(link).toHaveAttribute('href', PATIENT_PROFILE_PATH);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      expect(link.getAttribute('rel')).toContain('noreferrer');
      expect(link).toHaveAccessibleName(
        'Thêm hồ sơ người thân mới (mở trong tab mới)',
      );
      // KHÔNG bấm thử: happy-dom sẽ thật sự `fetch` URL của liên kết `target="_blank"`. `target` và `rel` đã khẳng định tab mới; trang này đứng yên
      expect(here(router)).toBe('/dat-lich/thong-tin?khungGioId=5');
      expect(api.bookingWrites()).toEqual([]);
    },
  );

  it('BIS-14 "Làm mới danh sách": người thân vừa thêm ở tab khác hiện ra; trong lúc tải lại danh sách cũ và thẻ đang chọn KHÔNG mất, nút tắt; hồ sơ đang chọn, lý do đã gõ giữ nguyên; không gọi lại `checks`', async () => {
    let releaseReload!: (response: Response) => void;
    const { api } = renderInfoStep({
      before: (api) => {
        api.relatives = { items: [RELATIVES.items[0]] };
      },
    });
    await ready();
    const group = await openPanel();
    fireEvent.change(textbox(), { target: { value: 'đau đầu' } });
    fireEvent.click(
      within(group).getByRole('radio', { name: /Nguyễn Thị Bích/ }),
    );
    await ready();
    const checksBefore = api.checkBodies.length;

    // Tab khác thêm một người thân; lần tải lại bị giữ để quan sát lúc đang tải
    api.failRelativesNext(
      () => new Promise<Response>((resolve) => (releaseReload = resolve)),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới danh sách' }));
    await waitFor(() => expect(api.count('GET', '/patient/relatives')).toBe(2));
    expect(
      screen.getByRole('button', { name: 'Làm mới danh sách' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('radiogroup', { name: 'Chọn người đi khám' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByText('Đang tải danh sách người thân...')).toBeNull();
    expect(screen.queryByText('Đang tải hồ sơ...')).toBeNull();
    expect(
      within(selectedCard()).getByText('Nguyễn Thị Bích'),
    ).toBeInTheDocument();

    await act(async () => {
      releaseReload(
        json(200, { items: [RELATIVES.items[0], RELATIVES.items[1]] }),
      );
    });
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(3));
    expect(
      screen.getByRole('button', { name: 'Làm mới danh sách' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('radio', { name: /Nguyễn Minh Tuấn/ }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('radio', { name: /Nguyễn Thị Bích/ }),
    ).toBeChecked();
    expect((textbox() as HTMLTextAreaElement).value).toBe('đau đầu');
    expect(api.checkBodies).toHaveLength(checksBefore);
    expect(api.bookingWrites()).toEqual([]);
  });

  it('BIS-11 đua: đổi hồ sơ liên tiếp ⇒ phản hồi của lần gọi CŨ về muộn bị bỏ qua, khối bên phải theo hồ sơ MỚI', async () => {
    let releaseOld!: () => void;
    const { api } = renderInfoStep({
      before: (api) => {
        api.onCheck = (body) => {
          if (body.hoSoNguoiThanId === '101') {
            return new Promise<Response>((resolve) => {
              releaseOld = () =>
                resolve(
                  json(
                    200,
                    makeCheckResult({
                      dichVu: {
                        ten: 'Dịch vụ của hồ sơ 101',
                        thoiLuongPhut: 30,
                      },
                    }),
                  ),
                );
            });
          }
          return body.hoSoNguoiThanId === '102'
            ? json(
                200,
                makeCheckResult({
                  dichVu: { ten: 'Dịch vụ của hồ sơ 102', thoiLuongPhut: 30 },
                }),
              )
            : undefined;
        };
      },
    });
    await ready();
    const group = await openPanel();
    fireEvent.click(
      within(group).getByRole('radio', { name: /Nguyễn Thị Bích/ }),
    ); // 101: treo
    // Chờ lời gọi 101 THẬT SỰ tới API giả (đang bay) rồi mới đổi sang 102
    await waitFor(() =>
      expect(api.checkBodies.at(-1)?.hoSoNguoiThanId).toBe('101'),
    );
    fireEvent.click(
      within(group).getByRole('radio', { name: /Nguyễn Minh Tuấn/ }),
    ); // 102: xong ngay
    expect(
      await within(slotRegion()).findByText('Dịch vụ của hồ sơ 102'),
    ).toBeInTheDocument();
    await ready();

    // Phản hồi cũ về MUỘN, theo thứ tự đảo
    await act(async () => {
      releaseOld();
    });
    expect(
      within(slotRegion()).getByText('Dịch vụ của hồ sơ 102'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Dịch vụ của hồ sơ 101')).toBeNull();
    expect(continueButton()).toBeEnabled();
    expect(api.checkBodies.map((body) => body.hoSoNguoiThanId)).toEqual([
      null,
      '101',
      '102',
    ]);
  });

  it('BIS-11 đổi hồ sơ: trong lúc `checks` của hồ sơ MỚI chưa về, Tiếp tục tắt và khối bên phải KHÔNG còn hiện tóm tắt của hồ sơ trước (đang kiểm lại)', async () => {
    let release!: () => void;
    const { api, router } = renderInfoStep({
      before: (api) => {
        api.onCheck = (body) =>
          body.hoSoNguoiThanId === '101'
            ? new Promise<Response>((resolve) => {
                release = () =>
                  resolve(
                    json(
                      200,
                      makeCheckResult({
                        dichVu: {
                          ten: 'Dịch vụ của hồ sơ 101',
                          thoiLuongPhut: 30,
                        },
                      }),
                    ),
                  );
              })
            : undefined;
      },
    });
    await ready();
    expect(within(slotRegion()).getByText('Tim mạch')).toBeInTheDocument();
    const group = await openPanel();
    fireEvent.click(
      within(group).getByRole('radio', { name: /Nguyễn Thị Bích/ }),
    );
    await waitFor(() =>
      expect(api.checkBodies.at(-1)?.hoSoNguoiThanId).toBe('101'),
    );

    // Đang kiểm lại cho hồ sơ mới: không đi tiếp được và không hiện tóm tắt của bản thân
    expect(continueButton()).toBeDisabled();
    fireEvent.click(continueButton());
    expect(here(router)).toBe('/dat-lich/thong-tin?khungGioId=5');
    expect(slotRegion()).toHaveAttribute('aria-busy', 'true');
    expect(within(slotRegion()).getByRole('status')).toHaveTextContent(
      'Đang kiểm tra lịch hẹn',
    );
    expect(screen.queryByText('Tim mạch')).toBeNull();

    await act(async () => {
      release();
    });
    await ready();
    expect(
      within(slotRegion()).getByText('Dịch vụ của hồ sơ 101'),
    ).toBeInTheDocument();
  });

  it('BIS-11 gỡ trang giữa lúc `checks` chưa xong ⇒ phản hồi về sau không báo lỗi, không cập nhật trạng thái trang đã gỡ', async () => {
    const errors = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    let release!: () => void;
    const { api, unmount } = renderInfoStep({
      before: (api) => {
        api.failCheckNext(
          () =>
            new Promise<Response>(
              (resolve) =>
                (release = () => resolve(json(200, makeCheckResult()))),
            ),
        );
      },
    });
    // Chờ lời gọi tới API giả (đang bay) rồi mới gỡ trang
    await waitFor(() => expect(api.count('POST', '/booking/checks')).toBe(1));
    unmount();
    await act(async () => {
      release();
    });
    expect(errors).not.toHaveBeenCalled();
  });
});
