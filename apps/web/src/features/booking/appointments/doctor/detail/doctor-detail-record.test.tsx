import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanUpDoctorAppointments,
  currentUrl,
  openDoctorDetail,
  renderDoctorAppointments,
} from '../../../testing/doctor-harness';
import { jsonResponse } from '../../../testing/fake-appointment-list-api';
import {
  DOCTOR_CODE,
  makeDoctorDetail,
} from '../../../testing/fake-doctor-api';
import { doctorAppointmentDetailPath } from '../../../../../shared/routes/booking-paths';
import type { DoctorExamRecord } from '../api/doctor-appointment-types';

// doctor-exam F2, mức TRANG: thẻ "Hồ sơ khám bệnh" của module `doctor` (`ExamRecordCard`, chỉ đọc) thay `RecordCard` của booking và nhận `ghiChuKham` từ chi tiết (Q20 phương án C: import CHỈ qua `features/doctor/index.ts`).
// Mã WHS-13 [đề xuất] (từ phản hồi API tới màn hình), WHS-10 và BDK-09 mức trang; phần thẻ ở `features/doctor/examination/doctor/exam-record-card.test.tsx`, bộ đọc ở `api/doctor-appointments-api.test.ts` (DAD-02). Dựng bằng harness có
// sẵn của F11; POST `/complete` do test trả lời (bao `fetch` ngay ở đây, không sửa `testing/` của booking). Dữ liệu giả, không phải của ai.
afterEach(cleanUpDoctorAppointments);

const NOTE: DoctorExamRecord = {
  trieuChung: 'Bệnh nhân mô tả đau ngực, khó thở khi gắng sức.',
  chanDoanSoBo: 'Ghi nhận ban đầu; cần theo dõi thêm.',
  huongXuLy: 'Hạn chế hoạt động thể lực nặng.',
  ngayTaiKhamDuKien: '2026-07-10',
  capNhatLanCuoi: '2026-06-10T10:30:00.000Z',
};

const card = (title: string) =>
  screen
    .getByRole('heading', { level: 2, name: title })
    .closest('section') as HTMLElement;
const record = () => card('Hồ sơ khám bệnh');

describe('doctor-exam F2 — thẻ Hồ sơ khám bệnh trên trang chi tiết', () => {
  it.each(['DaTiepDon', 'HoanThanh'])(
    'WHS-13 %s có hồ sơ ⇒ bốn khối và "Cập nhật lúc 17:30 ngày 10/06/2026" ngay dưới "Thông tin người khám" ở cột trái',
    async (trangThai) => {
      await openDoctorDetail({ trangThai, ghiChuKham: NOTE });
      const examinee = card('Thông tin người khám');
      expect(record().parentElement).toBe(examinee.parentElement);
      expect(
        examinee.compareDocumentPosition(record()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        within(record())
          .getAllByRole('definition')
          .map((definition) => definition.textContent),
      ).toEqual([
        NOTE.trieuChung,
        NOTE.chanDoanSoBo,
        NOTE.huongXuLy,
        '10/07/2026',
      ]);
      expect(
        within(record()).getByText('Cập nhật lúc 17:30 ngày 10/06/2026'),
      ).toBeInTheDocument();
    },
  );

  it('WHS-13 `DaTiepDon` có hồ sơ: vẫn đúng MỘT nút `Hoàn thành ca khám` (F1) và thẻ KHÔNG có nút ghi (F3)', async () => {
    await openDoctorDetail({ trangThai: 'DaTiepDon', ghiChuKham: NOTE });
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Hoàn thành ca khám']);
    expect(within(record()).queryAllByRole('button')).toEqual([]);
  });

  it('WHS-13 `ghiChuKham` null ⇒ câu theo trạng thái, nút `Hoàn thành ca khám` không phụ thuộc hồ sơ (Q6)', async () => {
    await openDoctorDetail({ trangThai: 'DaTiepDon', ghiChuKham: null });
    expect(
      within(record()).getByText('Chưa ghi hồ sơ khám.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Hoàn thành ca khám' }),
    ).toBeEnabled();
  });

  it('WHS-10 `DaHuy` mà API vẫn gửi hồ sơ cũ ⇒ KHÔNG hiện nội dung (Q16), chỉ câu "Không có hồ sơ khám."', async () => {
    await openDoctorDetail({ trangThai: 'DaHuy', ghiChuKham: NOTE });
    expect(
      within(record()).getByText('Không có hồ sơ khám.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(NOTE.trieuChung)).toBeNull();
    expect(screen.queryByText('Cập nhật lúc 17:30 ngày 10/06/2026')).toBeNull();
  });

  it('WHS-13 bấm `Hoàn thành ca khám` rồi xác nhận: chi tiết tải lại thấy `HoanThanh` kèm hồ sơ ⇒ thẻ đổi từ "chưa có" sang bốn khối', async () => {
    const { api } = await openDoctorDetail({
      trangThai: 'DaTiepDon',
      ghiChuKham: null,
    });
    expect(
      within(record()).getByText('Chưa ghi hồ sơ khám.'),
    ).toBeInTheDocument();
    const inner = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          api.details[DOCTOR_CODE] = makeDoctorDetail({
            maLichHen: DOCTOR_CODE,
            trangThai: 'HoanThanh',
            ghiChuKham: NOTE,
          });
          return jsonResponse({
            maLichHen: DOCTOR_CODE,
            trangThai: 'HoanThanh',
          });
        }
        return inner(input, init);
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hoàn thành ca khám' }));
    fireEvent.click(
      within(
        screen.getByRole('group', { name: 'Xác nhận hoàn thành ca khám' }),
      ).getByRole('button', { name: 'Xác nhận' }),
    );

    await waitFor(() =>
      expect(within(record()).getByText(NOTE.trieuChung)).toBeInTheDocument(),
    );
    expect(
      within(record()).getByText('Cập nhật lúc 17:30 ngày 10/06/2026'),
    ).toBeInTheDocument();
    expect(within(record()).queryByText('Chưa ghi hồ sơ khám.')).toBeNull();
  });

  it('WHS-13 hồ sơ sai hình dạng (thiếu khoá) ⇒ hộp lỗi, KHÔNG vẽ dở dang và KHÔNG lộ nội dung', async () => {
    renderDoctorAppointments(doctorAppointmentDetailPath(DOCTOR_CODE), {
      before: (api) => {
        api.details[DOCTOR_CODE] = {
          ...makeDoctorDetail({ trangThai: 'HoanThanh' }),
          ghiChuKham: { trieuChung: 'NỘI DUNG KHÔNG ĐƯỢC HIỆN' },
        };
      },
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/NỘI DUNG KHÔNG ĐƯỢC HIỆN/)).toBeNull();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('BDK-09 có hồ sơ trên trang: không ghi `localStorage`, `sessionStorage`, URL, `document.title`, `console`', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const title = document.title;
    const { router } = await openDoctorDetail({
      trangThai: 'HoanThanh',
      ghiChuKham: NOTE,
    });
    expect(within(record()).getByText(NOTE.trieuChung)).toBeInTheDocument();
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(router.state.location.search).toBe('');
    expect(router.state.location.hash).toBe('');
    expect(currentUrl()).not.toContain('đau ngực');
    expect(document.title).toBe(title);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
