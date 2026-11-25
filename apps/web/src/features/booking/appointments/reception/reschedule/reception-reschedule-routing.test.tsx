import { fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, VaiTro } from '../../../../auth';
import { resetAuthForTest } from '../../../../auth/auth-session';
import { setAuthState } from '../../../../auth/auth-store';
import { createAppRoutes } from '../../../../../router/routes';
import {
  RECEPTION_APPOINTMENT_RESCHEDULE_CONFIRM_ROUTE,
  RECEPTION_APPOINTMENT_RESCHEDULE_CONFIRM_SEGMENT,
  RECEPTION_APPOINTMENT_RESCHEDULE_ROUTE,
  RECEPTION_APPOINTMENT_RESCHEDULE_SEGMENT,
  RECEPTION_APPOINTMENTS_PATH,
  receptionAppointmentDetailPath,
  receptionAppointmentRescheduleConfirmPath,
  receptionAppointmentReschedulePath,
} from '../../../../../shared/routes/booking-paths';
import { createFakeAuthApi } from '../../../../../test/fake-auth-api';
import { createFakeReceptionRescheduleApi } from '../../../testing/fake-reception-reschedule-api';
import { NEW_APPOINTMENT_CODE } from '../../../testing/fake-reschedule-api';
import { RECEPTION_APPOINTMENT_ROUTES } from '../reception-appointment-routes';
import { DETAIL_TEXT } from '../detail/detail-messages';
import { RECEPTION_RESCHEDULE_TEXT as RTEXT } from './reception-reschedule-text';
import { RESCHEDULE_TEXT as TEXT } from '../../common/reschedule-text';

// reschedule F3, mã ca WDO-15 [đề xuất]: hai route đổi lịch hộ cắm vào `RECEPTION_APPOINTMENT_ROUTES` (không chạm `router/`; nếp F1 của Bệnh nhân), đường dẫn dựng từ `booking-paths`, đúng và sai vai trò, và luồng
// đủ trên ROUTER THẬT: chi tiết → trang chọn → màn xác nhận → gửi → chi tiết lịch MỚI. API giả CHỈ cho các route của Lễ tân, lưới khung giờ và preview; mọi đường dẫn khác chuyển cho fake auth. Dữ liệu giả.
const CODE = 'CP20261018001';

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

let api: ReturnType<typeof createFakeReceptionRescheduleApi>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T03:00:00Z'));
  resetAuthForTest();
  const auth = createFakeAuthApi();
  api = createFakeReceptionRescheduleApi(auth.fetch);
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('đường dẫn (WDO-15)', () => {
  it('WDO-15 mẫu route tương đối với `/le-tan` cho mảng route con, mẫu đầy đủ cho liên kết; hàm dựng liên kết thay đúng mã lịch', () => {
    expect(RECEPTION_APPOINTMENT_RESCHEDULE_SEGMENT).toBe(
      'quan-ly-lich-hen/:maLichHen/doi-lich',
    );
    expect(RECEPTION_APPOINTMENT_RESCHEDULE_CONFIRM_SEGMENT).toBe(
      'quan-ly-lich-hen/:maLichHen/doi-lich/xac-nhan',
    );
    expect(RECEPTION_APPOINTMENT_RESCHEDULE_ROUTE).toBe(
      '/le-tan/quan-ly-lich-hen/:maLichHen/doi-lich',
    );
    expect(RECEPTION_APPOINTMENT_RESCHEDULE_CONFIRM_ROUTE).toBe(
      '/le-tan/quan-ly-lich-hen/:maLichHen/doi-lich/xac-nhan',
    );
    expect(receptionAppointmentReschedulePath(CODE)).toBe(
      `${receptionAppointmentDetailPath(CODE)}/doi-lich`,
    );
  });

  it('WDO-15 mã lịch và id khung giờ đi qua `encodeURIComponent`; id lớn hơn 2^53 giữ nguyên chuỗi', () => {
    expect(receptionAppointmentReschedulePath('A/B?c#d e')).toBe(
      '/le-tan/quan-ly-lich-hen/A%2FB%3Fc%23d%20e/doi-lich',
    );
    expect(
      receptionAppointmentRescheduleConfirmPath('A/B', '9007199254740993'),
    ).toBe(
      '/le-tan/quan-ly-lich-hen/A%2FB/doi-lich/xac-nhan?khungGioId=9007199254740993',
    );
    expect(receptionAppointmentRescheduleConfirmPath('A', 'x&y=1')).toBe(
      '/le-tan/quan-ly-lich-hen/A/doi-lich/xac-nhan?khungGioId=x%26y%3D1',
    );
  });

  it('WDO-15 hai route nằm trong `RECEPTION_APPOINTMENT_ROUTES` cùng danh sách và chi tiết; trang nạp qua `lazy` ra đúng thành phần', async () => {
    const paths = RECEPTION_APPOINTMENT_ROUTES.map((route) => route.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'quan-ly-lich-hen',
        'quan-ly-lich-hen/:maLichHen',
        RECEPTION_APPOINTMENT_RESCHEDULE_SEGMENT,
        RECEPTION_APPOINTMENT_RESCHEDULE_CONFIRM_SEGMENT,
      ]),
    );
    expect(new Set(paths).size).toBe(paths.length);
    const names: string[] = [];
    for (const segment of [
      RECEPTION_APPOINTMENT_RESCHEDULE_SEGMENT,
      RECEPTION_APPOINTMENT_RESCHEDULE_CONFIRM_SEGMENT,
    ]) {
      const route = RECEPTION_APPOINTMENT_ROUTES.find(
        (item) => item.path === segment,
      );
      const loaded = await (
        route?.lazy as () => Promise<{ Component: { name: string } }>
      )();
      names.push(loaded.Component.name);
    }
    expect(names).toEqual([
      'ReceptionReschedulePage',
      'ReceptionRescheduleConfirmPage',
    ]);
  });
});

describe('route thật: đúng và sai vai trò (WDO-15)', () => {
  it('WDO-15 Lễ tân mở trang chọn khung giờ: trong khung Lễ tân, mục menu `Quản lý lịch hẹn` VẪN sáng (trang con), gọi đúng preview của Lễ tân', async () => {
    signedInAs('LeTan');
    const router = renderAt(receptionAppointmentReschedulePath(CODE));
    expect(
      await screen.findByRole('heading', { level: 1, name: RTEXT.title }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe(
      '/le-tan/quan-ly-lich-hen/CP20261018001/doi-lich',
    );
    const link = within(
      screen.getByRole('complementary', { name: 'Điều hướng Lễ tân' }),
    ).getByRole('link', { name: 'Quản lý lịch hẹn' });
    expect(link).toHaveAttribute('href', RECEPTION_APPOINTMENTS_PATH);
    expect(link).toHaveAttribute('aria-current', 'page');
    await screen.findByRole('button', { name: '08:00, còn trống' });
    expect(api.previewCalls).toEqual([{ maLichHen: CODE, khungGioId: null }]);
  });

  it('WDO-15 Lễ tân mở màn xác nhận từ URL (tải lại): id từ URL, gọi preview có `khungGioId`', async () => {
    signedInAs('LeTan');
    renderAt(receptionAppointmentRescheduleConfirmPath(CODE, '1253'));
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: RTEXT.confirmTitle,
      }),
    ).toBeVisible();
    await screen.findByRole('heading', { level: 2, name: TEXT.newTitle });
    expect(api.previewCalls).toEqual([{ maLichHen: CODE, khungGioId: '1253' }]);
  });

  it.each([
    ['BenhNhan', 'trang chọn', receptionAppointmentReschedulePath(CODE)],
    ['BacSi', 'trang chọn', receptionAppointmentReschedulePath(CODE)],
    ['QuanTriVien', 'trang chọn', receptionAppointmentReschedulePath(CODE)],
    [
      'BenhNhan',
      'màn xác nhận',
      receptionAppointmentRescheduleConfirmPath(CODE, '1253'),
    ],
    [
      'BacSi',
      'màn xác nhận',
      receptionAppointmentRescheduleConfirmPath(CODE, '1253'),
    ],
    [
      'QuanTriVien',
      'màn xác nhận',
      receptionAppointmentRescheduleConfirmPath(CODE, '1253'),
    ],
  ] as const)(
    'WDO-15 %s mở %s đổi lịch hộ: 404, không thấy trang lẫn khung Lễ tân, KHÔNG gọi preview hay lưới (QDL-02, QDL-03 ở giao diện)',
    async (vaiTro, _name, path) => {
      signedInAs(vaiTro);
      renderAt(path);
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy trang' }),
      ).toBeVisible();
      for (const title of [RTEXT.title, RTEXT.confirmTitle]) {
        expect(
          screen.queryByRole('heading', { level: 1, name: title }),
        ).toBeNull();
      }
      expect(
        screen.queryByRole('complementary', { name: 'Điều hướng Lễ tân' }),
      ).toBeNull();
      expect(api.previewCalls).toEqual([]);
      expect(api.slots.slotCalls).toEqual([]);
      expect(api.submitCalls).toEqual([]);
    },
  );

  it('WDO-15 khách mở đường dẫn: về /dang-nhap, không lộ trang, không gọi preview', async () => {
    setAuthState({ status: 'unauthenticated', user: null });
    const router = renderAt(receptionAppointmentReschedulePath(CODE));
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/dang-nhap'),
    );
    expect(
      screen.queryByRole('heading', { level: 1, name: RTEXT.title }),
    ).toBeNull();
    expect(api.previewCalls).toEqual([]);
  });
});

describe('luồng đủ trên router thật (WDO-15)', () => {
  it('WDO-15 chi tiết → "Đổi lịch hộ" → chọn ô → màn xác nhận → lý do → "Xác nhận đổi lịch" → chi tiết lịch MỚI kèm thông báo; đúng MỘT POST với thân hai khoá', async () => {
    signedInAs('LeTan');
    const router = renderAt(receptionAppointmentDetailPath(CODE));
    await screen.findByRole('heading', { name: DETAIL_TEXT.sections.patient });

    fireEvent.click(screen.getByRole('link', { name: RTEXT.changeButton }));
    fireEvent.click(
      await screen.findByRole('button', { name: '09:00, còn trống' }),
    );
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: RTEXT.confirmTitle,
      }),
    ).toBeVisible();
    await screen.findByRole('heading', { level: 2, name: TEXT.newTitle });
    fireEvent.change(screen.getByRole('textbox', { name: RTEXT.reasonLabel }), {
      target: { value: 'Bác sĩ báo bận đột xuất' },
    });
    fireEvent.click(screen.getByRole('button', { name: RTEXT.confirmButton }));

    expect(await screen.findByText(RTEXT.doneNotice)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      receptionAppointmentDetailPath(NEW_APPOINTMENT_CODE),
    );
    expect(api.submitCalls).toEqual([
      {
        maLichHen: CODE,
        body: { khungGioId: '1253', lyDo: 'Bác sĩ báo bận đột xuất' },
      },
    ]);
    // khung Lễ tân vẫn đó, mục menu sáng
    expect(
      within(
        screen.getByRole('complementary', { name: 'Điều hướng Lễ tân' }),
      ).getByRole('link', { name: 'Quản lý lịch hẹn' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});
