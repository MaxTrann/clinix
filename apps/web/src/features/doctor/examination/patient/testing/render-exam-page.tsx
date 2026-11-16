import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { vi } from 'vitest';
import { ExamRecordsPage } from '../exam-records-page';
import { PATIENT_EXAM_RECORDS_PATH } from '../patient-exam-paths';
import {
  CHILD,
  createFakePatientExamApi,
  NOTE,
  SELF,
  visit,
  type ExamResponder,
  type FakeExamData,
} from './fake-patient-exam-api';

// Dựng trang "Hồ sơ khám bệnh" cho test mức trang (doctor-exam F5): router trong bộ nhớ (có `router.state` để kiểm URL, hành động điều hướng), `fetch` là bộ giả theo hợp đồng B4, B5. Đồng hồ giả (chỉ `Date`) đặt ở 16/11/2026 (03:00Z, 10:00 giờ VN)
// nên năm hiện tại theo giờ VN là 2026. Dữ liệu giả, không phải của ai.
export const NOW_ISO = '2026-11-16T03:00:00.000Z';

export function useFixedClock(iso: string = NOW_ISO) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

// Bộ dữ liệu theo Figma `414:2`, `443:2` (mã lịch viết tay để test đọc được):
//   tháng 10/2026: A1 (người thân Khoa, chưa có hồ sơ, 14:00 CN) và A2 (bản thân, ĐÃ có hồ sơ, 09:30 CN) ⇒ "2 ca";
//   tháng 6/2026: 5 ca của bản thân; tháng 5: 1 ca; tháng 3: 2 ca của người thân; 00:30 ngày 01/01/2026 giờ VN (17:30Z ngày 31/12/2025): 1 ca vào THÁNG 1 của 2026;
//   tháng 12/2025: 1 ca. Tổng 12 tháng 2026: [1, 0, 2, 0, 1, 5, 0, 0, 0, 2, 0, 0].
export function figmaData(): FakeExamData {
  const doctors = {
    vy: { hoTen: 'Lê Thảo Vy', chucDanh: 'BS' },
    nam: { hoTen: 'Phạm Hoàng Nam', chucDanh: 'TS_BS' },
    anh: { hoTen: 'Nguyễn Minh Anh', chucDanh: 'ThS_BS' },
    huy: { hoTen: 'Trần Quốc Huy', chucDanh: 'BS_CKII' },
    huong: { hoTen: 'Nguyễn Thu Hương', chucDanh: 'BS_CKI' },
  };
  const child = { hoTen: CHILD.hoTen, quanHe: 'Con' };
  const visits = [
    visit('2026-10-18T07:00:00.000Z', {
      maLichHen: 'CLX-A1',
      chuyenKhoa: 'Nhi khoa',
      bacSi: doctors.vy,
      nguoiKham: child,
      personId: '501',
    }),
    visit('2026-10-18T02:30:00.000Z', {
      maLichHen: 'CLX-A2',
      chuyenKhoa: 'Tiêu hóa',
      bacSi: doctors.nam,
      coHoSoKham: true,
      hoSoKham: NOTE,
    }),
    visit('2026-06-12T07:30:00.000Z', {
      maLichHen: 'CLX-J1',
      chuyenKhoa: 'Cơ Xương Khớp',
      bacSi: doctors.huy,
    }),
    visit('2026-06-11T02:30:00.000Z', {
      maLichHen: 'CLX-J2',
      chuyenKhoa: 'Da liễu',
      bacSi: doctors.huong,
    }),
    visit('2026-06-10T02:00:00.000Z', {
      maLichHen: 'CLX-J3',
      chuyenKhoa: 'Tim mạch',
      bacSi: doctors.anh,
      coHoSoKham: true,
      hoSoKham: NOTE,
    }),
    visit('2026-06-05T01:30:00.000Z', {
      maLichHen: 'CLX-J4',
      chuyenKhoa: 'Nhi khoa',
      bacSi: doctors.vy,
    }),
    visit('2026-06-01T03:30:00.000Z', {
      maLichHen: 'CLX-J5',
      chuyenKhoa: 'Tim mạch',
      bacSi: doctors.anh,
    }),
    visit('2026-05-20T02:30:00.000Z', {
      maLichHen: 'CLX-M1',
      chuyenKhoa: 'Tai Mũi Họng',
      bacSi: doctors.vy,
    }),
    visit('2026-03-04T02:00:00.000Z', {
      maLichHen: 'CLX-R2',
      chuyenKhoa: 'Nhi khoa',
      bacSi: doctors.vy,
      nguoiKham: child,
      personId: '501',
    }),
    visit('2026-03-03T02:00:00.000Z', {
      maLichHen: 'CLX-R1',
      chuyenKhoa: 'Nhi khoa',
      bacSi: doctors.vy,
      nguoiKham: child,
      personId: '501',
    }),
    visit('2025-12-31T17:30:00.000Z', {
      maLichHen: 'CLX-Y0',
      chuyenKhoa: 'Nội tổng quát',
      bacSi: doctors.vy,
    }),
    visit('2025-12-20T03:00:00.000Z', {
      maLichHen: 'CLX-Y1',
      chuyenKhoa: 'Nội tổng quát',
      bacSi: doctors.vy,
    }),
  ];
  return { visits, people: [SELF, CHILD] };
}

export function renderExamPage(
  options: {
    data?: FakeExamData;
    url?: string;
    respond?: ExamResponder;
  } = {},
) {
  const api = createFakePatientExamApi(
    options.data ?? figmaData(),
    options.respond,
  );
  vi.stubGlobal('fetch', vi.fn(api.fetch));
  const router = createMemoryRouter(
    [
      { path: PATIENT_EXAM_RECORDS_PATH, element: <ExamRecordsPage /> },
      { path: '*', element: <p>Trang khác</p> },
    ],
    { initialEntries: [options.url ?? PATIENT_EXAM_RECORDS_PATH] },
  );
  const view = render(<RouterProvider router={router} />);
  return { api, router, ...view };
}
