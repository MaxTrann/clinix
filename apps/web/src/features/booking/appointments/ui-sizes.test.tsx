import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanUpAdminAppointments,
  field as adminField,
  listLoaded as adminLoaded,
  renderAdminAppointments,
  searchBox as adminSearchBox,
} from '../../../router/admin-appointments-harness';
import { DOCTOR_APPOINTMENTS_PATH } from '../../../shared/routes/booking-paths';
import {
  cleanUpListPage,
  field as patientField,
  loaded as patientLoaded,
  renderListPage,
  searchBox as patientSearchBox,
} from '../testing/appointment-list-harness';
import {
  cleanUpDoctorAppointments,
  dateInput,
  loaded as doctorLoaded,
  openDoctorDetail,
  renderDoctorAppointments,
  searchBox as doctorSearchBox,
} from '../testing/doctor-harness';
import { LIST_TEXT as ADMIN_TEXT } from './admin/list-messages';
import { LIST_TEXT as DOCTOR_TEXT } from './doctor/list-messages';
import { LIST_TEXT as PATIENT_TEXT } from './patient/list-messages';

// booking F12b, UIF-10 (UI-10; mã UIF là [đề xuất], PLAN booking mục 7.48): kích thước các trang danh sách theo Figma TỪNG màn (Đại chọn "theo Figma từng màn", TRACKING 3.44 câu (b)). Mức W (`css: false`): chỉ khoá LỚP CSS
// (cấu trúc), không đo bố cục; số đo thật (getBoundingClientRect) là việc của giai đoạn trình duyệt. Gốc `html` là 15 px nên `text-2xl` = 22,5 px, `h-11` = 41,25 px, `h-9.5` = 35,6 px, `h-9` = 33,75 px, `size-7` = 26,25 px.
// Lỗi cũ F8 đến F11: số `rem` tuỳ ý tính theo gốc 16 (h1 20 px, ô 39 px, chấm 24,4 px): mọi ca dưới đây cũng khẳng định KHÔNG còn số `rem` tuỳ ý ở phần tử đang xét. Ô của Lễ tân ở `reception-list-page.test.tsx`, hộp thao tác ở
// `reception/detail/action-dialogs-a11y.test.tsx`.
afterEach(() => {
  vi.restoreAllMocks();
  cleanUpAdminAppointments();
  cleanUpListPage();
  cleanUpDoctorAppointments();
});

const noArbitraryRem = (element: Element) =>
  expect(element.className).not.toMatch(/\[\d+(\.\d+)?rem\]/);

describe('kích thước danh sách theo Figma từng màn (UIF-10)', () => {
  it('UIF-10 Bệnh nhân (Figma 411:2): h1 `text-2xl`, phụ đề `text-sm`; ô tìm, ô chọn, ô ngày cao 41,25 px (`h-11`; Figma 41,2 px)', async () => {
    renderListPage();
    await patientLoaded();
    const h1 = screen.getByRole('heading', {
      level: 1,
      name: PATIENT_TEXT.title,
    });
    expect(h1).toHaveClass('text-2xl', 'font-bold');
    noArbitraryRem(h1);
    const subtitle = screen.getByText(PATIENT_TEXT.subtitle);
    expect(subtitle).toHaveClass('text-sm', 'pt-1');
    noArbitraryRem(subtitle);

    const controls = [
      patientSearchBox(),
      ...screen.getAllByRole('combobox'),
      patientField('Từ ngày'),
      patientField('Đến ngày'),
    ];
    expect(controls.length).toBeGreaterThanOrEqual(6);
    for (const control of controls) {
      expect(control).toHaveClass('h-11');
      noArbitraryRem(control);
    }
  });

  it('UIF-10 Admin (Figma 511:2): h1 `text-2xl`; ô tìm và hai ô ngày cao 35,6 px (`h-9.5`; Figma 35,4 px), sáu ô chọn cao 33,75 px (`h-9`; Figma 34,2 px)', async () => {
    renderAdminAppointments('/admin/lich-hen');
    await adminLoaded();
    const h1 = screen.getByRole('heading', {
      level: 1,
      name: ADMIN_TEXT.title,
    });
    expect(h1).toHaveClass('text-2xl', 'font-bold');
    noArbitraryRem(h1);

    for (const control of [
      adminSearchBox(),
      adminField('Từ ngày'),
      adminField('Đến ngày'),
    ]) {
      expect(control).toHaveClass('h-9.5');
      noArbitraryRem(control);
    }
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(6);
    for (const box of selects) {
      expect(box).toHaveClass('h-9', 'appearance-none');
      noArbitraryRem(box);
    }
  });

  it('UIF-10 Bác sĩ (Figma 457:2): h1 `text-2xl`, phụ đề `text-sm`; ô tìm, ô chọn, ô ngày cao 41,25 px (`h-11`); chip cao 30 px (`min-h-8`; Figma 30 px)', async () => {
    renderDoctorAppointments(DOCTOR_APPOINTMENTS_PATH);
    await doctorLoaded();
    const h1 = screen.getByRole('heading', {
      level: 1,
      name: DOCTOR_TEXT.title,
    });
    expect(h1).toHaveClass('text-2xl', 'font-bold');
    noArbitraryRem(h1);
    const subtitle = screen.getByText(DOCTOR_TEXT.subtitle);
    expect(subtitle).toHaveClass('text-sm', 'pt-1');
    noArbitraryRem(subtitle);

    for (const control of [
      doctorSearchBox(),
      ...screen.getAllByRole('combobox'),
      dateInput('Từ ngày'),
      dateInput('Đến ngày'),
    ]) {
      expect(control).toHaveClass('h-11');
      noArbitraryRem(control);
    }
    const chips = within(
      screen.getByRole('group', { name: DOCTOR_TEXT.dateGroup }),
    ).getAllByRole('button');
    expect(chips.length).toBeGreaterThanOrEqual(6);
    for (const chip of chips) expect(chip).toHaveClass('min-h-8');
  });

  it('UIF-10 chấm bước của "Trạng thái ca khám" (Bác sĩ, Figma 26,25 px): `size-7`, không còn `size-[1.625rem]` (24,4 px)', async () => {
    await openDoctorDetail();
    await screen.findByRole('heading', { name: 'Trạng thái ca khám' });
    const dots = document.querySelectorAll('ol .size-7');
    expect(dots.length).toBeGreaterThanOrEqual(3);
    expect(document.querySelector('ol [class*="1.625rem"]')).toBeNull();
  });
});
