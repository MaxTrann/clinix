import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { vi } from 'vitest';
import type { ExamDetail, ExamRating } from '../../api/patient-exam-types';
import { PATIENT_EXAM_RECORDS_PATH } from '../patient-exam-paths';
import { PatientExamSections } from '../patient-exam-sections';
import {
  createFakePatientExamApi,
  NOTE,
  SELF,
  visit,
  type ExamResponder,
  type FakeExamData,
  type FakeVisit,
} from './fake-patient-exam-api';
import { LocationProbe, SectionsLayout } from './sections-layout';

// Dựng hai thẻ hồ sơ và đánh giá cho test mức thành phần (doctor-exam F6): `PatientExamSections` trong router trong bộ nhớ, `fetch` là bộ giả theo hợp đồng B5, B6 (`fake-patient-exam-api.ts`). `children` vẽ hai cột giả (`left-column`, `right-column`)
// như booking đặt thẻ hồ sơ ở cột trái và thẻ đánh giá ở cột phải. Dữ liệu giả, không phải của ai.
export const SECTIONS_CODE = 'CLX-S1';
export const OTHER_CODE = 'CLX-S2';

export const RATING: ExamRating = {
  soSao: 5,
  nhanXet: 'Bác sĩ rất tận tâm, giải thích rõ ràng và chi tiết.',
  thoiDiemTao: '2026-06-10T03:00:00.000Z',
};

// Một chi tiết đủ chín khoá (không qua mạng) cho test thẻ riêng lẻ; mặc định: có hồ sơ, chưa đánh giá
export function detailOf(overrides: Partial<ExamDetail> = {}): ExamDetail {
  return {
    maLichHen: SECTIONS_CODE,
    thoiGian: '2026-06-10T02:00:00.000Z',
    chuyenKhoa: 'Tim mạch',
    chiNhanh: 'CLINIX Chi nhánh Quận 3',
    bacSi: { hoTen: 'Nguyễn Minh Anh', chucDanh: 'ThS_BS' },
    nguoiKham: { hoTen: SELF.hoTen, quanHe: null },
    hoSoKham: NOTE,
    danhGia: null,
    coTheDanhGia: true,
    ...overrides,
  };
}

// Hai ca `Hoàn thành` của bản thân: `CLX-S1` (mặc định có hồ sơ, chưa đánh giá) và `CLX-S2` (chưa hồ sơ, chưa đánh giá)
export function sectionsData(
  first: Partial<FakeVisit> = {},
  second: Partial<FakeVisit> = {},
): FakeExamData {
  return {
    visits: [
      visit('2026-06-10T02:00:00.000Z', {
        maLichHen: SECTIONS_CODE,
        chuyenKhoa: 'Tim mạch',
        bacSi: { hoTen: 'Nguyễn Minh Anh', chucDanh: 'ThS_BS' },
        coHoSoKham: true,
        hoSoKham: NOTE,
        ...first,
      }),
      visit('2026-06-12T02:00:00.000Z', {
        maLichHen: OTHER_CODE,
        ...second,
      }),
    ],
    people: [SELF],
  };
}

export function renderSections(
  options: {
    data?: FakeExamData;
    trangThai?: string;
    maLichHen?: string;
    respond?: ExamResponder;
  } = {},
) {
  const data = options.data ?? sectionsData();
  const api = createFakePatientExamApi(data, options.respond);
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  const ui = (trangThai: string, maLichHen: string) => (
    <MemoryRouter initialEntries={['/chi-tiet']}>
      <Routes>
        <Route
          path="/chi-tiet"
          element={
            <PatientExamSections maLichHen={maLichHen} trangThai={trangThai}>
              {(cards) => <SectionsLayout {...cards} />}
            </PatientExamSections>
          }
        />
        <Route
          path={PATIENT_EXAM_RECORDS_PATH}
          element={<p>Trang sổ khám bệnh</p>}
        />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
  const view = render(
    ui(options.trangThai ?? 'HoanThanh', options.maLichHen ?? SECTIONS_CODE),
  );
  return {
    api,
    data,
    ...view,
    // Cùng cây React, đổi props (KHÔNG gỡ thành phần): đổi lịch hẹn hay trạng thái giữa chừng
    rerenderWith: (trangThai: string, maLichHen: string) =>
      view.rerender(ui(trangThai, maLichHen)),
  };
}
