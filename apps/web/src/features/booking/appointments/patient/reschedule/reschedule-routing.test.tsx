import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from '../../../../../router/routes';
import {
  patientAppointmentDetailPath,
  patientAppointmentReschedulePath,
} from '../../../../../shared/routes/booking-paths';
import { createFakeAuthApi } from '../../../../../test/fake-auth-api';
import { type AuthUser, type VaiTro } from '../../../../auth';
import { resetAuthForTest } from '../../../../auth/auth-session';
import { setAuthState } from '../../../../auth/auth-store';
import { makeDetail } from '../../../testing/fake-appointment-detail-api';
import { createFakeRescheduleApi } from '../../../testing/fake-reschedule-api';
import { DETAIL_TEXT } from '../detail/detail-messages';
import { RESCHEDULE_TEXT } from './reschedule-text';

// reschedule F1, mã ca WDH-23 [đề xuất] (PLAN reschedule 7.11): hai route mới đi qua ứng dụng thật (`createAppRoutes`) với API giả. Route nằm trong mảng `PATIENT_APPOINTMENT_ROUTES`
// (không chạm `router/`). Đúng vai, sai vai, khách, nút ở chi tiết dẫn tới trang chọn, chọn ô tới màn xác nhận, tải lại. Dữ liệu giả.
let fake: ReturnType<typeof createFakeRescheduleApi>;

function signedInAs(vaiTro: VaiTro) {
  const user: AuthUser = {
    vaiTro,
    hoTen: `Họ tên ${vaiTro}`,
    daXacMinhEmail: true,
  };
  setAuthState({ status: 'authenticated', user });
}

function renderAt(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: ['/', path],
    initialIndex: 1,
  });
  render(<RouterProvider router={router} />);
  return router;
}

const CODE = 'CP20261020001';
const PICKER = patientAppointmentReschedulePath(CODE);
const CONFIRM = `${PICKER}/xac-nhan`;
const pageHeading = () =>
  screen.queryByRole('heading', { level: 1, name: RESCHEDULE_TEXT.title });
const apiCalls = () =>
  fake.detail.requests.filter(
    (request) =>
      request.path.startsWith('/patient/appointments') ||
      request.path.startsWith('/public/doctor-slots'),
  );

// Nạp trước các trang lazy: ca đầu tiên không phải gánh chi phí biên dịch lần đầu trong hạn 5 giây mặc định của vitest (máy bận ⇒ chậm)
beforeAll(async () => {
  await Promise.all([
    import('./reschedule-page'),
    import('./reschedule-confirm-page'),
    import('../detail/appointment-detail-page'),
  ]);
}, 60_000);

beforeEach(() => {
  resetAuthForTest();
  const auth = createFakeAuthApi();
  fake = createFakeRescheduleApi(auth.fetch);
  vi.stubGlobal('fetch', vi.fn(fake.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  // Gỡ cây React TRƯỚC khi gỡ fetch giả: lời gọi còn bay (lưới, xem trước) không được rơi xuống fetch thật
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('route trang chọn khung giờ đổi lịch', () => {
  it('WDH-23 Bệnh nhân vào `…/doi-lich` ⇒ trang nằm trong khung Bệnh nhân, mục "Lịch hẹn của tôi" vẫn sáng (route con), có lưới; MỘT preview và MỘT lời gọi lưới', async () => {
    signedInAs('BenhNhan');
    const router = renderAt(PICKER);

    const aside = await screen.findByRole('complementary', {
      name: 'Điều hướng Bệnh nhân',
    });
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: RESCHEDULE_TEXT.title,
      }),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByRole('button', { name: /còn trống/ })).length,
    ).toBeGreaterThan(0);
    const link = within(
      within(aside).getByRole('navigation', { name: 'Menu chính' }),
    ).getByRole('link', { name: 'Lịch hẹn của tôi' });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(router.state.location.pathname).toBe(PICKER);
    expect(fake.previewCalls).toHaveLength(1);
    expect(fake.slotCalls).toHaveLength(1);
  });

  it('WDH-23 chi tiết → nút "Đổi lịch" → trang chọn → chọn ô → màn xác nhận (id trên URL); quay lại bằng liên kết và bằng nút Back của trình duyệt', async () => {
    fake.detail.detail = makeDetail({ choPhepDoiLich: true });
    signedInAs('BenhNhan');
    const router = renderAt(patientAppointmentDetailPath(CODE));

    fireEvent.click(
      await screen.findByRole('link', { name: RESCHEDULE_TEXT.changeButton }),
    );
    await screen.findByRole('heading', {
      level: 1,
      name: RESCHEDULE_TEXT.title,
    });
    expect(router.state.location.pathname).toBe(PICKER);

    const day = new Date().toISOString().slice(0, 10);
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const cells = await screen.findAllByRole('button', { name: /còn trống/ });
    fireEvent.click(cells[0]);
    await screen.findByRole('heading', {
      level: 1,
      name: RESCHEDULE_TEXT.confirmTitle,
    });
    expect(router.state.location.pathname).toBe(CONFIRM);
    expect(router.state.location.search).toMatch(/^\?khungGioId=1\d{2}1$/);
    expect(router.state.historyAction).toBe('PUSH');

    // liên kết "Chọn khung giờ khác" về lưới, rồi Back về màn xác nhận, rồi Back về lưới
    const another = screen.getAllByRole('link', {
      name: RESCHEDULE_TEXT.pickAnother,
    });
    fireEvent.click(another[another.length - 1]);
    await screen.findByRole('heading', {
      level: 1,
      name: RESCHEDULE_TEXT.title,
    });
    expect(router.state.location.pathname).toBe(PICKER);
    // lưới được GET lại (không nhớ gì ở trình duyệt)
    expect(fake.previewCalls).toHaveLength(3);
  });

  it('WDH-23 bấm đúp một ô ⇒ MỘT lần Back là về lại trang chọn (không có hai mục lịch sử của màn xác nhận)', async () => {
    signedInAs('BenhNhan');
    const router = renderAt(PICKER);
    const cell = (
      await screen.findAllByRole('button', { name: /còn trống/ })
    )[0];
    fireEvent.click(cell);
    fireEvent.click(cell);
    await screen.findByRole('heading', {
      level: 1,
      name: RESCHEDULE_TEXT.confirmTitle,
    });
    await router.navigate(-1);
    await screen.findByRole('heading', {
      level: 1,
      name: RESCHEDULE_TEXT.title,
    });
    expect(router.state.location.pathname).toBe(PICKER);
  });

  it('WDH-23 tải lại ở màn xác nhận (dựng router mới với cùng URL) vẫn chạy: id đọc từ URL, không gọi API nào', async () => {
    signedInAs('BenhNhan');
    renderAt(`${CONFIRM}?khungGioId=9223372036854775807`);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: RESCHEDULE_TEXT.confirmTitle,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(RESCHEDULE_TEXT.confirmNotReady)).toBeVisible();
    expect(apiCalls()).toEqual([]);
  });

  it('WDH-23 mã lịch hẹn có ký tự đặc biệt ⇒ URL mã hoá, preview gọi với mã đã mã hoá (không thoát khỏi đoạn đường)', async () => {
    signedInAs('BenhNhan');
    const router = renderAt(patientAppointmentReschedulePath('CP/1?x#y'));
    await screen.findAllByRole('button', { name: /còn trống/ });
    expect(router.state.location.pathname).toBe(
      '/benh-nhan/lich-hen-cua-toi/CP%2F1%3Fx%23y/doi-lich',
    );
    expect(fake.previewCalls[0].maLichHen).toBe('CP/1?x#y');
    expect(
      fake.detail.requests.some(
        (request) =>
          request.path ===
          '/patient/appointments/CP%2F1%3Fx%23y/reschedule-preview',
      ),
    ).toBe(true);
  });

  // Quyền thật do API kiểm; cổng ở giao diện chỉ để không hiện trang sai vai (PLAN 5.13). Sai vai hiện 404 như `RequireAuth` đã làm
  it.each(['LeTan', 'BacSi', 'QuanTriVien'] as const)(
    'WDH-23 %s mở `…/doi-lich` và `…/doi-lich/xac-nhan` ⇒ 404, không thấy trang, không gọi preview hay lưới',
    async (vaiTro) => {
      signedInAs(vaiTro);
      renderAt(PICKER);
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(pageHeading()).toBeNull();
      expect(apiCalls()).toEqual([]);
    },
  );

  it('WDH-23 khách chưa đăng nhập ⇒ về /dang-nhap bằng replace, không lộ trang, không gọi API', async () => {
    setAuthState({ status: 'unauthenticated' });
    const router = renderAt(PICKER);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(router.state.historyAction).toBe('REPLACE');
    expect(pageHeading()).toBeNull();
    expect(apiCalls()).toEqual([]);
  });

  it('WDH-23 trang chi tiết cũ không đổi: vẫn đúng một GET chi tiết và nút Hủy còn đó', async () => {
    signedInAs('BenhNhan');
    renderAt(patientAppointmentDetailPath(CODE));
    expect(
      await screen.findByRole('region', { name: DETAIL_TEXT.summary }),
    ).toBeInTheDocument();
    expect(
      fake.detail.callsTo('GET', `/patient/appointments/${CODE}`),
    ).toHaveLength(1);
    expect(fake.previewCalls).toEqual([]);
  });
});
