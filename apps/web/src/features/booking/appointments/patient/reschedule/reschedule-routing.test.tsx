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
import {
  createFakeRescheduleApi,
  makePreview,
  makeRequestResult,
  NEW_APPOINTMENT_CODE,
} from '../../../testing/fake-reschedule-api';
import {
  becomeNewAppointment,
  becomePendingRequest,
} from '../../../testing/reschedule-confirm-helpers';
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
    // lưới được GET lại (không nhớ gì ở trình duyệt): preview của nút ở chi tiết, của trang chọn, của màn xác nhận (có `khungGioId`, reschedule F2), rồi của trang chọn lần hai
    expect(fake.previewCalls).toHaveLength(4);
    expect(fake.previewCalls.map((call) => call.khungGioId === null)).toEqual([
      true,
      true,
      false,
      true,
    ]);
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

  it('WDH-23 tải lại ở màn xác nhận (dựng router mới với cùng URL) vẫn chạy: id đọc từ URL, preview GET đúng id đó (nguyên chuỗi), KHÔNG ghi gì', async () => {
    signedInAs('BenhNhan');
    renderAt(`${CONFIRM}?khungGioId=9223372036854775807`);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: RESCHEDULE_TEXT.confirmTitle,
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: RESCHEDULE_TEXT.newTitle,
      }),
    ).toBeInTheDocument();
    expect(fake.previewCalls).toEqual([
      { maLichHen: CODE, khungGioId: '9223372036854775807' },
    ]);
    expect(fake.submitCalls).toEqual([]);
    expect(fake.detail.writes()).toEqual([]);
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

// reschedule F2, mã ca WDH-44 [đề xuất]: luồng ĐỦ qua ứng dụng thật (`createAppRoutes`) với API giả: chi tiết → nút → lưới → chọn ô → xác nhận → gửi → chi tiết (lịch mới hay lịch cũ kèm banner). Dữ liệu giả.
describe('luồng đủ đổi lịch (WDH-44)', () => {
  it('WDH-44 tự đổi: chi tiết → "Đổi lịch" → lưới → chọn ô → "Xác nhận đổi lịch" → chi tiết lịch MỚI kèm thông báo; Back không quay lại màn xác nhận (đã `replace`)', async () => {
    fake.detail.detail = makeDetail({ choPhepDoiLich: true });
    fake.onSubmit = () => becomeNewAppointment(fake);
    signedInAs('BenhNhan');
    const router = renderAt(patientAppointmentDetailPath(CODE));

    fireEvent.click(
      await screen.findByRole('link', { name: RESCHEDULE_TEXT.changeButton }),
    );
    fireEvent.click(
      (await screen.findAllByRole('button', { name: /còn trống/ }))[0],
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: RESCHEDULE_TEXT.confirmButton,
      }),
    );

    expect(await screen.findByText(NEW_APPOINTMENT_CODE)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      patientAppointmentDetailPath(NEW_APPOINTMENT_CODE),
    );
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.getByText(RESCHEDULE_TEXT.doneNotice)).toBeVisible();
    expect(fake.submitCalls).toHaveLength(1);
    expect(fake.submitCalls[0].body).toMatchObject({
      khungGioId: expect.stringMatching(/^1\d{2}1$/) as unknown,
    });

    // Back từ lịch mới về TRANG CHỌN (màn xác nhận đã bị thay): lịch cũ nay là 404 cùng thân
    fake.preview = null;
    await router.navigate(-1);
    await screen.findByRole('heading', {
      level: 1,
      name: RESCHEDULE_TEXT.title,
    });
    expect(router.state.location.pathname).toBe(PICKER);
  });

  it('WDH-44 hết lần tự đổi: nút "Gửi yêu cầu đổi lịch" → lưới → chọn ô → nhập lý do → gửi → về chi tiết lịch CŨ kèm thông báo và banner "Đang chờ duyệt"', async () => {
    fake.detail.detail = makeDetail({ choPhepDoiLich: true });
    fake.preview = makePreview({
      loai: 'GuiYeuCau',
      soLanDaDoi: 2,
      soLanToiDa: 2,
    });
    fake.submitResult = makeRequestResult();
    fake.onSubmit = () => becomePendingRequest(fake);
    signedInAs('BenhNhan');
    const router = renderAt(patientAppointmentDetailPath(CODE));

    fireEvent.click(
      await screen.findByRole('link', { name: RESCHEDULE_TEXT.requestButton }),
    );
    fireEvent.click(
      (await screen.findAllByRole('button', { name: /còn trống/ }))[0],
    );
    const field = await screen.findByRole('textbox', {
      name: RESCHEDULE_TEXT.reasonLabel,
    });
    fireEvent.change(field, { target: { value: 'Có việc đột xuất' } });
    fireEvent.click(
      screen.getByRole('button', { name: RESCHEDULE_TEXT.requestButton }),
    );

    expect(
      await screen.findByRole('region', { name: RESCHEDULE_TEXT.bannerTitle }),
    ).toHaveTextContent(RESCHEDULE_TEXT.bannerPending);
    expect(router.state.location.pathname).toBe(
      patientAppointmentDetailPath(CODE),
    );
    expect(screen.getByText(RESCHEDULE_TEXT.requestSentNotice)).toBeVisible();
    expect(
      screen.getByRole('button', { name: RESCHEDULE_TEXT.changeButton }),
    ).toBeDisabled();
    expect(fake.submitCalls[0].body).toMatchObject({
      lyDoYeuCau: 'Có việc đột xuất',
    });
  });

  it.each(['LeTan', 'BacSi', 'QuanTriVien'] as const)(
    'WDH-44 %s mở màn xác nhận ⇒ 404, không thấy trang, không gọi API nào',
    async (vaiTro) => {
      signedInAs(vaiTro);
      renderAt(`${CONFIRM}?khungGioId=5`);
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeInTheDocument();
      expect(apiCalls()).toEqual([]);
      expect(fake.submitCalls).toEqual([]);
    },
  );

  it('WDH-44 khách chưa đăng nhập mở màn xác nhận ⇒ về /dang-nhap, không gọi API, không gửi', async () => {
    setAuthState({ status: 'unauthenticated' });
    const router = renderAt(`${CONFIRM}?khungGioId=5`);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(apiCalls()).toEqual([]);
    expect(fake.submitCalls).toEqual([]);
  });
});
