import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { setApiAuthHooks } from '../../../../shared/api/auth-hooks';
import { resetAuthForTest } from '../../../auth/auth-session';
import { setAuthState } from '../../../auth/auth-store';
import { RELATIVES } from '../../testing/fake-booking-api';
import { renderInfoStep } from '../../testing/info-step-harness';

// booking F4: bản nháp (`useBookingDraft`), hợp đồng với F5 và kho trình duyệt. WZ-03, WZ-09 (phần F4: gõ lý do thật, URL, log) của PLAN booking 7.15; BDF-01…BDF-05 là
// [đề xuất] (mục 7.38). Lý do khám là thông tin sức khoẻ: KHÔNG được ghi vào bất kỳ kho nào, không lên URL, không vào log (đo bằng `localStorage.length`, `sessionStorage.length`,
// KHÔNG dùng `vi.spyOn(Storage.prototype, 'setItem')` vì spy đó chỉ thấy lần gọi đầu).
const SECRET_REASON = 'đau ngực trái khi leo cầu thang, nghi ngờ bệnh tim';

const continueButton = () => screen.getByRole('button', { name: 'Tiếp tục' });
const toggle = () =>
  screen.getByRole('button', { name: 'Chọn người thân khác' });
const textbox = () =>
  screen.getByRole('textbox', { name: 'Lý do khám (không bắt buộc)' });
const selectedCard = () => screen.getByText('Đang chọn').closest('div')!;
const draft = () =>
  JSON.parse(screen.getByTestId('draft').textContent ?? 'null') as unknown;
const here = (router: {
  state: { location: { pathname: string; search: string } };
}) => router.state.location.pathname + router.state.location.search;

async function ready() {
  await waitFor(() => expect(continueButton()).toBeEnabled());
}
async function chooseRelative(name: RegExp) {
  fireEvent.click(toggle());
  const group = await screen.findByRole('radiogroup', {
    name: 'Chọn người đi khám',
  });
  await waitFor(() =>
    expect(within(group).getAllByRole('radio')).toHaveLength(3),
  );
  fireEvent.click(within(group).getByRole('radio', { name }));
  fireEvent.click(screen.getByRole('button', { name: 'Đóng danh sách' }));
  await ready();
}
async function goToConfirm(router: Parameters<typeof here>[0]) {
  await ready();
  fireEvent.click(continueButton());
  await waitFor(() =>
    expect(here(router)).toBe('/dat-lich/xac-nhan?khungGioId=5'),
  );
}

beforeEach(() => {
  resetAuthForTest();
  setAuthState({
    status: 'authenticated',
    user: { vaiTro: 'BenhNhan', hoTen: 'Nguyễn Văn A', daXacMinhEmail: true },
  });
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setApiAuthHooks(null);
  resetAuthForTest();
});

describe('booking F4 — bản nháp và hợp đồng với F5', () => {
  it('BDF-01 WZ-03 `Tiếp tục` ghi ĐÚNG ba khoá `{ khungGioId, hoSoNguoiThanId, lyDoKham }`; lý do ĐÃ chuẩn hoá (NFC, cắt khoảng trắng ASCII); để trống hay chỉ khoảng trắng ⇒ null, KHÔNG BAO GIỜ chuỗi rỗng', async () => {
    const { router } = renderInfoStep();
    await ready();
    fireEvent.change(textbox(), {
      target: { value: `  ${'Tôi bị ệ'.normalize('NFD')} \n` },
    });
    await goToConfirm(router);
    const saved = draft() as Record<string, unknown>;
    expect(Object.keys(saved)).toEqual([
      'khungGioId',
      'hoSoNguoiThanId',
      'lyDoKham',
    ]);
    expect(saved).toEqual({
      khungGioId: '5',
      hoSoNguoiThanId: null,
      lyDoKham: 'Tôi bị ệ'.normalize('NFC'),
    });
    expect((saved.lyDoKham as string).normalize('NFC')).toBe(saved.lyDoKham);
  });

  it.each(['', ' ', '   \n\t ', '\r\n'])(
    'BDF-01 lý do %j (trống) ⇒ `lyDoKham: null`, không bao giờ chuỗi rỗng',
    async (text) => {
      const { router } = renderInfoStep();
      await ready();
      fireEvent.change(textbox(), { target: { value: text } });
      await goToConfirm(router);
      const saved = draft() as { lyDoKham: unknown };
      expect(saved.lyDoKham).toBeNull();
      expect(saved.lyDoKham).not.toBe('');
    },
  );

  it('BDF-02 Bước 5 → "Sửa" → Bước 4: khôi phục hồ sơ và lý do từ bản nháp, gọi `checks` ĐÚNG MỘT lần cho hồ sơ đã chọn', async () => {
    const { router, api } = renderInfoStep();
    await ready();
    await chooseRelative(/Nguyễn Thị Bích/);
    fireEvent.change(textbox(), { target: { value: SECRET_REASON } });
    await goToConfirm(router);
    expect(draft()).toEqual({
      khungGioId: '5',
      hoSoNguoiThanId: '101',
      lyDoKham: SECRET_REASON,
    });

    const checksBefore = api.checkBodies.length;
    fireEvent.click(screen.getByRole('link', { name: 'Sửa' }));
    await waitFor(() =>
      expect(here(router)).toBe('/dat-lich/thong-tin?khungGioId=5'),
    );
    await ready();
    expect((textbox() as HTMLTextAreaElement).value).toBe(SECRET_REASON);
    // Thẻ hiện đúng người thân đã chọn (tên đến từ danh sách tải lại, bản nháp chỉ có id)
    await waitFor(() =>
      expect(
        within(selectedCard()).getByText('Nguyễn Thị Bích'),
      ).toBeInTheDocument(),
    );
    expect(api.checkBodies.slice(checksBefore)).toEqual([
      { khungGioId: '5', hoSoNguoiThanId: '101' },
    ]);
  });

  it('BDF-02 hồ sơ người thân trong bản nháp đã NGỪNG khi quay lại ⇒ về bản thân kèm thông báo, `checks` cho bản thân; lý do vẫn còn', async () => {
    const { router, api } = renderInfoStep();
    await ready();
    await chooseRelative(/Nguyễn Thị Bích/);
    fireEvent.change(textbox(), { target: { value: SECRET_REASON } });
    await goToConfirm(router);

    // Trong lúc ở Bước 5, hồ sơ 101 bị ngừng
    api.relatives = { items: [RELATIVES.items[1]] };
    fireEvent.click(screen.getByRole('link', { name: 'Sửa' }));
    expect(
      await screen.findByText(
        'Hồ sơ người thân đã chọn không còn khả dụng. Hệ thống đã chuyển về hồ sơ của bạn.',
      ),
    ).toBeInTheDocument();
    await ready();
    expect(
      within(selectedCard()).getByText('Nguyễn Văn A'),
    ).toBeInTheDocument();
    expect(api.checkBodies.at(-1)).toEqual({
      khungGioId: '5',
      hoSoNguoiThanId: null,
    });
    expect((textbox() as HTMLTextAreaElement).value).toBe(SECRET_REASON);
  });

  it('BDF-03 đổi `khungGioId` ngay trên cùng route ⇒ form đặt lại (không mang lý do và hồ sơ sang khung giờ khác), `checks` theo khung giờ mới', async () => {
    const { router, api } = renderInfoStep();
    await ready();
    await chooseRelative(/Nguyễn Minh Tuấn/);
    fireEvent.change(textbox(), { target: { value: SECRET_REASON } });

    fireEvent.click(screen.getByRole('link', { name: 'Sang khung giờ 6' }));
    await waitFor(() =>
      expect(here(router)).toBe('/dat-lich/thong-tin?khungGioId=6'),
    );
    await waitFor(() =>
      expect(api.checkBodies.at(-1)).toEqual({
        khungGioId: '6',
        hoSoNguoiThanId: null,
      }),
    );
    await ready();
    expect((textbox() as HTMLTextAreaElement).value).toBe('');
    expect(
      within(selectedCard()).getByText('Nguyễn Văn A'),
    ).toBeInTheDocument();
  });

  it('BDF-03 Bước 4 mở với bản nháp của khung giờ KHÁC ⇒ bản nháp bị xoá (lý do của khung giờ khác không nằm lại trong bộ nhớ) và form bắt đầu mặc định', async () => {
    const { router } = renderInfoStep();
    await ready();
    fireEvent.change(textbox(), { target: { value: SECRET_REASON } });
    await goToConfirm(router);
    expect(draft()).toMatchObject({ khungGioId: '5', lyDoKham: SECRET_REASON });

    await act(async () => {
      await router.navigate('/dat-lich/thong-tin?khungGioId=6');
    });
    await ready();
    expect((textbox() as HTMLTextAreaElement).value).toBe('');
    // Sang Bước 5 của khung giờ 6 (chưa bấm Tiếp tục): bản nháp phải là null
    await act(async () => {
      await router.navigate('/dat-lich/xac-nhan?khungGioId=6');
    });
    expect(draft()).toBeNull();
  });

  it('BDF-04 WZ-09 gõ lý do rồi Tiếp tục: không một kho nào nhận lý do (localStorage, sessionStorage, cookie), không lên URL, không vào log, không đổi tiêu đề tab', async () => {
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const title = document.title;
    const { router } = renderInfoStep();
    await ready();
    await chooseRelative(/Nguyễn Thị Bích/);
    fireEvent.change(textbox(), { target: { value: SECRET_REASON } });
    // Đang gõ: chưa có gì ở kho nào
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    await goToConfirm(router);
    expect(draft()).toMatchObject({ lyDoKham: SECRET_REASON });
    // Đo bằng SỐ MỤC, không bằng spy `setItem` (spy chỉ thấy lần gọi đầu)
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    const { pathname, search, hash } = router.state.location;
    const url = `${pathname}${search}${hash}`;
    expect(url).toBe('/dat-lich/xac-nhan?khungGioId=5');
    for (const form of [SECRET_REASON, encodeURIComponent(SECRET_REASON)]) {
      expect(url).not.toContain(form);
      expect(JSON.stringify(window.history.state ?? null)).not.toContain(form);
    }
    expect(JSON.stringify(router.state.location.state ?? null)).not.toContain(
      SECRET_REASON,
    );
    expect(document.title).toBe(title);
    for (const spy of logs) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain('đau ngực');
    }
  });

  it('BDF-05 WZ-09 bản nháp chỉ có id: tên, quan hệ, SĐT, giới tính, ngày sinh của người thân không nằm trong bản nháp', async () => {
    const { router } = renderInfoStep();
    await ready();
    await chooseRelative(/Nguyễn Thị Bích/);
    await goToConfirm(router);
    const text = screen.getByTestId('draft').textContent ?? '';
    expect(JSON.parse(text)).toEqual({
      khungGioId: '5',
      hoSoNguoiThanId: '101',
      lyDoKham: null,
    });
    for (const leaked of [
      'Nguyễn Thị Bích',
      'Me',
      'Mẹ',
      '0907654321',
      'Nu',
      '1960',
    ]) {
      expect(text).not.toContain(leaked);
    }
  });
});
