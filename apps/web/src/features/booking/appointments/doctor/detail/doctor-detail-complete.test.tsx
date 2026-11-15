import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanUpDoctorAppointments,
  openDoctorDetail,
} from '../../../testing/doctor-harness';
import {
  apiErrorResponse,
  jsonResponse,
} from '../../../testing/fake-appointment-list-api';
import {
  DOCTOR_CODE,
  makeDoctorDetail,
} from '../../../testing/fake-doctor-api';
import { DETAIL_TEXT } from './detail-messages';

// doctor-exam F1, mức TRANG: nút `Hoàn thành ca khám` của module `doctor` cắm vào hàng tiêu đề của "Chi tiết ca khám" (`headerAside`, Q20 phương án C) và tải lại chi tiết sau khi bấm.
// Mã WHT-03 và WHT-05 (PLAN doctor-exam mục 7.12); phần component ở `features/doctor/examination/doctor/complete-action.test.tsx`. Dựng bằng harness có sẵn của F11; POST `/complete` do test
// trả lời (bao `fetch` ngay ở đây, không sửa `testing/` của booking), mọi GET đi tiếp vào API giả.
afterEach(cleanUpDoctorAppointments);

const detailPath = `/doctor/appointments/${DOCTOR_CODE}`;
const completed = () =>
  makeDoctorDetail({ maLichHen: DOCTOR_CODE, trangThai: 'HoanThanh' });

function answerComplete(respond: () => Response) {
  const inner = globalThis.fetch;
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        urls.push(String(input));
        return respond();
      }
      return inner(input, init);
    }),
  );
  return urls;
}

// Hàng tiêu đề (h1 và `headerAside`): harness có sẵn một phần tử `<output>` (vai trò `status`) để đọc URL nên `status` và `alert` của F1 phải tìm TRONG hàng này
const titleRow = () =>
  screen.getByRole('heading', { level: 1, name: 'Chi tiết ca khám' })
    .parentElement as HTMLElement;

const chipOfSummary = () =>
  within(screen.getByRole('region', { name: DETAIL_TEXT.summary })).queryByText(
    'Hoàn thành',
  );

function confirmCompletion() {
  fireEvent.click(screen.getByRole('button', { name: 'Hoàn thành ca khám' }));
  fireEvent.click(
    within(
      screen.getByRole('group', { name: 'Xác nhận hoàn thành ca khám' }),
    ).getByRole('button', { name: 'Xác nhận' }),
  );
}

describe('doctor-exam F1 — nút Hoàn thành ca khám trên trang chi tiết', () => {
  it('WHT-01 Đã tiếp đón: nút nằm CÙNG hàng với h1 `Chi tiết ca khám` (chỗ cắm `headerAside`), không nút nào khác', async () => {
    await openDoctorDetail({ trangThai: 'DaTiepDon' });
    expect(
      within(titleRow()).getByRole('button', { name: 'Hoàn thành ca khám' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('WHT-03 bấm rồi xác nhận ⇒ MỘT POST tới đúng mã, tải lại chi tiết (GET lần hai), chip `Hoàn thành`, nút biến mất, dòng "Đã hoàn thành ca khám."', async () => {
    const { api } = await openDoctorDetail({ trangThai: 'DaTiepDon' });
    expect(chipOfSummary()).toBeNull();
    const urls = answerComplete(() => {
      // Máy chủ đã đổi: lần tải lại sau đó thấy `HoanThanh`
      api.details[DOCTOR_CODE] = completed();
      return jsonResponse({ maLichHen: DOCTOR_CODE, trangThai: 'HoanThanh' });
    });

    confirmCompletion();

    await waitFor(() => expect(chipOfSummary()).toBeInTheDocument());
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(`${detailPath}/complete`);
    expect(api.callsTo(detailPath)).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: 'Hoàn thành ca khám' }),
    ).toBeNull();
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(within(titleRow()).getByRole('status')).toHaveTextContent(
      'Đã hoàn thành ca khám.',
    );
  });

  it('WHT-05 tab khác đã hoàn thành trước (409 HoanThanh) ⇒ "Ca khám này đã được hoàn thành.", không đỏ, trang tải lại và chip thành `Hoàn thành`', async () => {
    const { api } = await openDoctorDetail({ trangThai: 'DaTiepDon' });
    const urls = answerComplete(() => {
      api.details[DOCTOR_CODE] = completed();
      return apiErrorResponse(
        409,
        'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
        undefined,
        {
          tuTrangThai: 'HoanThanh',
          denTrangThai: 'HoanThanh',
        },
      );
    });

    confirmCompletion();

    await waitFor(() => expect(chipOfSummary()).toBeInTheDocument());
    expect(urls).toHaveLength(1);
    expect(api.callsTo(detailPath)).toHaveLength(2);
    expect(within(titleRow()).getByRole('status')).toHaveTextContent(
      'Ca khám này đã được hoàn thành.',
    );
    expect(within(titleRow()).queryByRole('alert')).toBeNull();
    expect(screen.queryAllByRole('button')).toEqual([]);
  });
});
