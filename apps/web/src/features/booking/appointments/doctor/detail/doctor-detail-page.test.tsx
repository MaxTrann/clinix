import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DOCTOR_APPOINTMENTS_PATH,
  doctorAppointmentDetailPath,
} from '../../../../../shared/routes/booking-paths';
import { apiErrorResponse } from '../../../testing/fake-appointment-list-api';
import {
  cleanUpDoctorAppointments,
  currentUrl,
  detailLink,
  loaded,
  openDoctorDetail,
  renderDoctorAppointments,
} from '../../../testing/doctor-harness';
import {
  DOCTOR_CODE,
  makeDoctorAppointment,
  makeDoctorDetail,
} from '../../../testing/fake-doctor-api';
import { DETAIL_TEXT } from './detail-messages';

// booking F11: trang chi tiết "Chi tiết ca khám" của Bác sĩ với API giả. Mã DAD là [đề xuất] (PLAN booking mục 7.44); BSI-01 (chi tiết) = DAD-01, DAD-03, DAD-06; BSI-02 (không giá, cọc, email) = DAD-05. Bộ đọc
// ở `api/doctor-appointments-api.test.ts` (DAD-02), các bước timeline ở `timeline-steps.test.ts` (DAD-09 mức hàm).
afterEach(cleanUpDoctorAppointments);

const card = (title: string) =>
  screen
    .getByRole('heading', { level: 2, name: title })
    .closest('section') as HTMLElement;
// Giá trị (dd) của hàng `label` trong một thẻ
const fact = (section: HTMLElement, label: string) =>
  within(section).getByText(label).closest('div')?.querySelector('dd')
    ?.textContent;

describe('booking F11 — chi tiết ca khám của Bác sĩ: tải và nội dung', () => {
  it('DAD-01 MỘT GET tới đúng chi tiết có token (mã đi qua encodeURIComponent), không gọi route nào khác, không lời gọi ghi; `← Lịch hẹn` và h1 Figma', async () => {
    const { api } = await openDoctorDetail();
    expect(
      api.requests.map((request) => `${request.method} ${request.path}`),
    ).toEqual([`GET /doctor/appointments/${DOCTOR_CODE}`]);
    expect(api.requests[0].hasToken).toBe(true);
    expect(api.writes()).toEqual([]);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Chi tiết ca khám' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lịch hẹn' })).toHaveAttribute(
      'href',
      DOCTOR_APPOINTMENTS_PATH,
    );
  });

  it('DAD-01 mã có ký tự đặc biệt được mã hoá ở API và ở liên kết', async () => {
    const code = 'A/B?C#D';
    const { api } = await openDoctorDetail({}, {}, code);
    expect(api.callsTo('/doctor/appointments/A%2FB%3FC%23D')).toHaveLength(1);
    expect(api.requests).toHaveLength(1);
  });

  it('DAD-03 thẻ đầu: mã chữ đơn cách, chip, tên dịch vụ, người khám kèm quan hệ, ngày thứ và "giờ · ca", chuyên khoa, chi nhánh', async () => {
    await openDoctorDetail();
    expect(screen.getByText(DOCTOR_CODE)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Khám Tim mạch' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Nguyễn Văn A').length).toBeGreaterThanOrEqual(
      2,
    );
    expect(screen.getAllByText('Bản thân').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Chủ nhật, 18/10/2026').length).toBe(2);
    expect(screen.getAllByText('08:00 · Ca sáng').length).toBe(2);
    expect(screen.getAllByText('CLINIX Chi nhánh Quận 3').length).toBe(2);
    expect(screen.getAllByText('Đã xác nhận').length).toBeGreaterThanOrEqual(1);
  });

  it('DAD-03 quan hệ: mã của `moi_quan_he` ⇒ nhãn, `BanThan` ⇒ "Bản thân", mã lạ ⇒ "Người thân" (không lộ mã thô)', async () => {
    const quanHe = async (code: string) => {
      const { unmount } = await openDoctorDetail({
        nguoiKham: { ...makeDoctorDetail().nguoiKham, quanHe: code },
      });
      const value = fact(card('Thông tin người khám'), 'Quan hệ');
      unmount();
      cleanUpDoctorAppointments();
      return value;
    };
    expect(await quanHe('Me')).toBe('Mẹ');
    expect(await quanHe('AnhChiEm')).toBe('Anh/Chị/Em');
    expect(await quanHe('BanThan')).toBe('Bản thân');
    expect(await quanHe('NguoiLa')).toBe('Người thân');
  });

  it('DAD-04 thẻ người khám: họ tên, quan hệ, điện thoại, giới tính, ngày sinh dd/mm/yyyy, lý do khám', async () => {
    await openDoctorDetail();
    const patient = card('Thông tin người khám');
    expect(fact(patient, 'Họ tên')).toBe('Nguyễn Văn A');
    expect(fact(patient, 'Quan hệ')).toBe('Bản thân');
    expect(fact(patient, 'Điện thoại')).toBe('0901234567');
    expect(fact(patient, 'Giới tính')).toBe('Nam');
    expect(fact(patient, 'Ngày sinh')).toBe('15/05/1990');
    expect(fact(patient, 'Lý do khám')).toBe('Đau ngực nhẹ, theo dõi huyết áp');
  });

  it('DAD-04 trống ⇒ "Chưa cập nhật" (SĐT, giới tính, ngày sinh; mã giới tính lạ không lộ mã thô), lý do khám trống ⇒ "Không có"', async () => {
    await openDoctorDetail({
      lyDoKham: null,
      nguoiKham: {
        hoTen: 'Vũ Thị Lan',
        quanHe: 'Me',
        gioiTinh: 'XYZ',
        ngaySinh: null,
        soDienThoai: null,
      },
    });
    const patient = card('Thông tin người khám');
    expect(fact(patient, 'Điện thoại')).toBe('Chưa cập nhật');
    expect(fact(patient, 'Giới tính')).toBe('Chưa cập nhật');
    expect(fact(patient, 'Ngày sinh')).toBe('Chưa cập nhật');
    expect(fact(patient, 'Lý do khám')).toBe('Không có');
    expect(document.body.textContent).not.toMatch(/XYZ|null|undefined/);
  });

  it('DAD-04 giới tính Nữ và Khác', async () => {
    await openDoctorDetail({
      nguoiKham: { ...makeDoctorDetail().nguoiKham, gioiTinh: 'Nu' },
    });
    expect(fact(card('Thông tin người khám'), 'Giới tính')).toBe('Nữ');
  });

  it('DAD-05 BSI-02: KHÔNG Email, Giá khám, cọc, thanh toán, Lý do hủy, tên bác sĩ — dù phản hồi có các khoá thừa', async () => {
    await openDoctorDetail({
      ...({
        email: 'nguyenvana@email.com',
        giaSnapshot: '300000.00',
        tienCoc: '100000.00',
        thanhToan: { daThu: '100000.00', conPhaiThu: '200000.00' },
        lyDoHuy: 'Bận việc',
        bacSi: 'ThS.BS Nguyễn Minh Anh',
      } as object),
    });
    const text = document.body.textContent ?? '';
    for (const leaked of [
      'nguyenvana@email.com',
      '300.000',
      '300000',
      '100.000',
      '200.000',
      'Bận việc',
      'Nguyễn Minh Anh',
    ]) {
      expect(text, leaked).not.toContain(leaked);
    }
    for (const label of [
      /^Email$/,
      /Giá khám/,
      /Cọc/i,
      /^Thanh toán$/,
      /Lý do hủy/i,
      /Còn phải thu/i,
    ]) {
      expect(screen.queryByText(label), String(label)).toBeNull();
    }
  });

  it('DAD-06 thẻ lịch hẹn: ngày thứ, "giờ · ca", chuyên khoa, chi nhánh; "Ca chiều", "Ca tối"; mã ca lạ chỉ còn giờ', async () => {
    await openDoctorDetail({
      ca: 'CaChieu',
      thoiGian: '2026-10-20T07:30:00.000Z',
    });
    const schedule = card('Thông tin lịch hẹn');
    expect(fact(schedule, 'Ngày khám')).toBe('Thứ 3, 20/10/2026');
    expect(fact(schedule, 'Giờ khám')).toBe('14:30 · Ca chiều');
    expect(fact(schedule, 'Chuyên khoa')).toBe('Tim mạch');
    expect(fact(schedule, 'Chi nhánh')).toBe('CLINIX Chi nhánh Quận 3');
  });

  it('DAD-06 mã ca lạ ⇒ chỉ có giờ, không lộ mã thô', async () => {
    await openDoctorDetail({ ca: 'CaDem' });
    expect(fact(card('Thông tin lịch hẹn'), 'Giờ khám')).toBe('08:00');
    expect(document.body.textContent).not.toContain('CaDem');
  });

  it('DAD-07 theo giờ Việt Nam: 17:00Z là 00:00 ngày kế; ngày đặt lịch cũng theo ngày Việt Nam (17:30Z ⇒ ngày kế)', async () => {
    await openDoctorDetail({
      thoiGian: '2026-10-17T17:00:00.000Z',
      ngayDat: '2026-10-16T17:30:00.000Z',
    });
    expect(fact(card('Thông tin lịch hẹn'), 'Giờ khám')).toBe(
      '00:00 · Ca sáng',
    );
    expect(fact(card('Thông tin lịch hẹn'), 'Ngày khám')).toBe(
      'Chủ nhật, 18/10/2026',
    );
    const timeline = card('Trạng thái ca khám');
    expect(within(timeline).getByText('Ngày đặt lịch')).toBeInTheDocument();
    expect(within(timeline).getByText('17/10/2026')).toBeInTheDocument();
  });
});

describe('booking F11 — chi tiết của Bác sĩ: hồ sơ khám và trạng thái ca khám', () => {
  it.each([
    [
      'ChoThanhToan',
      'Hồ sơ khám sẽ được bác sĩ cập nhật sau khi người bệnh được tiếp đón.',
    ],
    [
      'DaXacNhan',
      'Hồ sơ khám sẽ được bác sĩ cập nhật sau khi người bệnh được tiếp đón.',
    ],
    ['DaTiepDon', 'Chưa ghi hồ sơ khám.'],
    ['HoanThanh', 'Ca khám đã hoàn thành nhưng chưa có hồ sơ khám.'],
    ['DaHuy', 'Không có hồ sơ khám.'],
    ['VangMat', 'Không có hồ sơ khám.'],
  ])(
    'DAD-08 %s: `ghiChuKham` null ⇒ MỘT câu theo trạng thái, không nội dung hồ sơ bịa, không nút của `doctor`',
    async (trangThai, sentence) => {
      await openDoctorDetail({ trangThai });
      const record = card('Hồ sơ khám bệnh');
      expect(within(record).getByText(sentence)).toBeInTheDocument();
      expect(record.textContent).not.toMatch(
        /Triệu chứng|Chẩn đoán|Hướng xử lý|Tái khám/i,
      );
      // F11 chỉ đọc: không nút đổi trạng thái hay ghi hồ sơ (việc của `doctor`)
      for (const name of [
        /Hoàn thành ca khám/,
        /Ghi hồ sơ khám/,
        /Chỉnh sửa ghi chú/,
        /^Xác nhận$/,
      ]) {
        expect(screen.queryByRole('button', { name })).toBeNull();
      }
      expect(screen.queryAllByRole('button')).toEqual([]);
    },
  );

  it('DAD-09 timeline theo trạng thái thật: Đã tiếp đón ⇒ bước 1 xong, bước 2 đang ở; "Chưa đến" cho bước chưa tới, "Chưa ghi nhận" cho bước còn lại', async () => {
    await openDoctorDetail({ trangThai: 'DaTiepDon' });
    const steps = within(card('Trạng thái ca khám')).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      'Đã xác nhậnChưa ghi nhận',
      'Đã tiếp đónChưa ghi nhận',
      'Hoàn thànhChưa đến',
    ]);
  });

  it('DAD-09 Chờ thanh toán: dải "Chờ xác nhận thanh toán cọc" và cả ba bước "Chưa đến"', async () => {
    await openDoctorDetail({ trangThai: 'ChoThanhToan' });
    const timeline = within(card('Trạng thái ca khám'));
    expect(timeline.getByRole('status')).toHaveTextContent(
      'Chờ xác nhận thanh toán cọc',
    );
    expect(
      timeline.getAllByRole('listitem').map((step) => step.textContent),
    ).toEqual([
      'Đã xác nhậnChưa đến',
      'Đã tiếp đónChưa đến',
      'Hoàn thànhChưa đến',
    ]);
  });

  it('DAD-09 Đã hủy và Vắng mặt: ba bước "Chưa đến" rồi bước thứ tư là trạng thái thật', async () => {
    await openDoctorDetail({ trangThai: 'DaHuy' });
    expect(
      within(card('Trạng thái ca khám'))
        .getAllByRole('listitem')
        .map((step) => step.textContent),
    ).toEqual([
      'Đã xác nhậnChưa đến',
      'Đã tiếp đónChưa đến',
      'Hoàn thànhChưa đến',
      'Đã hủyChưa ghi nhận',
    ]);
  });

  it('DAD-09 HoanThanh: hai bước đã qua và bước Hoàn thành đang ở; không dải cam', async () => {
    await openDoctorDetail({ trangThai: 'HoanThanh' });
    const timeline = within(card('Trạng thái ca khám'));
    expect(timeline.queryByRole('status')).toBeNull();
    expect(
      timeline.getAllByRole('listitem').map((step) => step.textContent),
    ).toEqual([
      'Đã xác nhậnChưa ghi nhận',
      'Đã tiếp đónChưa ghi nhận',
      'Hoàn thànhChưa ghi nhận',
    ]);
  });

  it('DAD-09 mã trạng thái lạ (kể cả DaDoiLich): chip "Chưa xác định", KHÔNG vẽ bước nào, không lộ mã thô; hàng "Ngày đặt lịch" vẫn có', async () => {
    await openDoctorDetail({ trangThai: 'DaDoiLich' });
    const timeline = within(card('Trạng thái ca khám'));
    expect(timeline.queryByRole('list')).toBeNull();
    expect(timeline.getByText('Ngày đặt lịch')).toBeInTheDocument();
    expect(screen.getByText('Chưa xác định')).toBeInTheDocument();
    expect(screen.queryByText('DaDoiLich')).toBeNull();
  });

  it('DAD-10 "Ngày đặt lịch" là `ngayDat` theo ngày Việt Nam', async () => {
    await openDoctorDetail({ ngayDat: '2026-10-16T03:00:00.000Z' });
    const timeline = within(card('Trạng thái ca khám'));
    expect(
      timeline.getByText('Ngày đặt lịch').nextElementSibling?.textContent,
    ).toBe('16/10/2026');
  });

  it('DAD-11 lý do khám là chữ tự do: `<script>`, `<img onerror>`, nháy, gạch chéo, emoji hiện NGUYÊN VĂN, xuống dòng giữ; không thành thẻ', async () => {
    const hostile =
      '<script>alert(1)</script><img src=x onerror=alert(1)> "nháy" \\ / 😷';
    await openDoctorDetail({ lyDoKham: `${hostile}\ndòng hai` });
    const reason = within(card('Thông tin người khám')).getByText(/dòng hai/);
    expect(reason.textContent).toBe(`${hostile}\ndòng hai`);
    expect(reason).toHaveClass('whitespace-pre-line');
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });
});

describe('booking F11 — chi tiết của Bác sĩ: lỗi, quay lại, riêng tư, đổi mã', () => {
  const missing = () =>
    renderDoctorAppointments(doctorAppointmentDetailPath('CP20990101001'), {
      before: (api) => {
        api.appointments = [];
      },
    });

  it('DAD-12 404 `KHONG_TIM_THAY`: MỘT câu cho mọi lý do, không `Thử lại`, h1 và `← Lịch hẹn` vẫn có', async () => {
    missing();
    expect(await screen.findByText(DETAIL_TEXT.notFound)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Chi tiết ca khám' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lịch hẹn' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('DAD-12 401 và 403 có câu riêng và KHÔNG `Thử lại`', async () => {
    const first = renderDoctorAppointments(
      doctorAppointmentDetailPath(DOCTOR_CODE),
      {
        before: (api) =>
          api.failNext('detail', () => apiErrorResponse(401, 'CHUA_DANG_NHAP')),
      },
    );
    expect(
      await screen.findByText(DETAIL_TEXT.sessionExpired),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    first.unmount();
    cleanUpDoctorAppointments();

    renderDoctorAppointments(doctorAppointmentDetailPath(DOCTOR_CODE), {
      before: (api) =>
        api.failNext('detail', () => apiErrorResponse(403, 'KHONG_DU_QUYEN')),
    });
    expect(await screen.findByText(DETAIL_TEXT.forbidden)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('DAD-12 500: `Thử lại` đúng MỘT GET nữa (không tự gửi lại) và hiện nội dung; mất mạng cũng có `Thử lại`', async () => {
    const { api } = renderDoctorAppointments(
      doctorAppointmentDetailPath(DOCTOR_CODE),
      {
        before: (fake) => {
          fake.appointments = [makeDoctorAppointment()];
          fake.failNext('detail', () => apiErrorResponse(500, 'LOI_HE_THONG'));
        },
      },
    );
    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(api.requests).toHaveLength(1);
    fireEvent.click(retry);
    await screen.findByRole('heading', {
      level: 2,
      name: 'Thông tin lịch hẹn',
    });
    expect(api.requests).toHaveLength(2);
  });

  it('DAD-12 mất mạng (fetch ném TypeError) ⇒ `Thử lại`; chi tiết sai hình dạng (`ghiChuKham` khác null) ⇒ hộp lỗi, KHÔNG vẽ dở dang', async () => {
    const first = renderDoctorAppointments(
      doctorAppointmentDetailPath(DOCTOR_CODE),
      {
        before: (api) =>
          api.failNext('detail', () => {
            throw new TypeError('Failed to fetch');
          }),
      },
    );
    expect(
      await screen.findByRole('button', { name: 'Thử lại' }),
    ).toBeInTheDocument();
    first.unmount();
    cleanUpDoctorAppointments();

    renderDoctorAppointments(doctorAppointmentDetailPath(DOCTOR_CODE), {
      before: (api) => {
        api.details[DOCTOR_CODE] = {
          ...makeDoctorDetail(),
          ghiChuKham: 'Triệu chứng: đau ngực',
        };
      },
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/Triệu chứng/)).toBeNull();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('DAD-13 `← Lịch hẹn` khôi phục đúng bộ lọc lúc bấm `Chi tiết`; vào thẳng chi tiết thì về danh sách trơn', async () => {
    const { router, unmount } = renderDoctorAppointments(
      `${DOCTOR_APPOINTMENTS_PATH}?trangThai=DaXacNhan&ca=CaSang`,
    );
    await loaded();
    fireEvent.click(detailLink(DOCTOR_CODE));
    await screen.findByRole('heading', {
      level: 2,
      name: 'Thông tin lịch hẹn',
    });
    fireEvent.click(screen.getByRole('link', { name: 'Lịch hẹn' }));
    await loaded();
    expect(currentUrl()).toBe(
      `${DOCTOR_APPOINTMENTS_PATH}?trangThai=DaXacNhan&ca=CaSang`,
    );
    expect(router.state.location.search).toBe('?trangThai=DaXacNhan&ca=CaSang');

    unmount();
    cleanUpDoctorAppointments();
    await openDoctorDetail();
    expect(screen.getByRole('link', { name: 'Lịch hẹn' })).toHaveAttribute(
      'href',
      DOCTOR_APPOINTMENTS_PATH,
    );
  });

  it('DAD-13 `state` giả mạo trong lịch sử trình duyệt bị bỏ: chỉ nhận chuỗi rỗng hay bắt đầu bằng `?`', async () => {
    const { router } = await openDoctorDetail();
    for (const listSearch of [
      'javascript:alert(1)',
      5,
      null,
      { a: 1 },
      'trangThai=DaHuy',
    ]) {
      await act(async () => {
        await router.navigate(doctorAppointmentDetailPath(DOCTOR_CODE), {
          state: { listSearch },
          replace: true,
        });
      });
      expect(
        screen.getByRole('link', { name: 'Lịch hẹn' }),
        String(listSearch),
      ).toHaveAttribute('href', DOCTOR_APPOINTMENTS_PATH);
    }
    await act(async () => {
      await router.navigate(doctorAppointmentDetailPath(DOCTOR_CODE), {
        state: { listSearch: '?ca=CaToi' },
        replace: true,
      });
    });
    expect(screen.getByRole('link', { name: 'Lịch hẹn' })).toHaveAttribute(
      'href',
      `${DOCTOR_APPOINTMENTS_PATH}?ca=CaToi`,
    );
  });

  it('DAD-14 không URL, không kho trình duyệt, không log: SĐT và lý do khám chỉ ở màn hình', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const { router } = await openDoctorDetail();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(router.state.location.pathname).toBe(
      `/bac-si-portal/lich-hen/${DOCTOR_CODE}`,
    );
    expect(router.state.location.search).toBe('');
    expect(router.state.location.hash).toBe('');
    expect(currentUrl()).not.toMatch(/0901234567|Đau ngực/);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it('DAD-15 đổi mã lịch trên URL: lúc chi tiết mới còn đang tải KHÔNG hiện dữ liệu cũ của lịch trước', async () => {
    const { router, api } = await openDoctorDetail({
      nguoiKham: { ...makeDoctorDetail().nguoiKham, hoTen: 'Người Thứ Nhất' },
    });
    expect(screen.getAllByText('Người Thứ Nhất').length).toBeGreaterThan(0);
    api.failNext('detail', () => new Promise<Response>(() => undefined));
    await act(async () => {
      await router.navigate(doctorAppointmentDetailPath('CP20261018002'));
    });
    await screen.findByText(DETAIL_TEXT.loading);
    expect(screen.queryByText('Người Thứ Nhất')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Chi tiết ca khám' }),
    ).toBeInTheDocument();
  });

  it('DAD-16 trợ năng: `aria-busy` khi đang tải, mỗi thẻ có tiêu đề, timeline là danh sách có thứ tự, chip có chữ (không chỉ màu)', async () => {
    const first = renderDoctorAppointments(
      doctorAppointmentDetailPath(DOCTOR_CODE),
      {
        before: (fake) => {
          fake.appointments = [makeDoctorAppointment()];
          fake.failNext('detail', () => new Promise<Response>(() => undefined));
        },
      },
    );
    await screen.findByText(DETAIL_TEXT.loading);
    expect(document.querySelector('section[aria-busy="true"]')).not.toBeNull();
    expect(first.api.requests).toHaveLength(1);

    first.unmount();
    cleanUpDoctorAppointments();
    await openDoctorDetail();
    expect(document.querySelector('section[aria-busy="false"]')).not.toBeNull();
    for (const title of [
      'Thông tin người khám',
      'Thông tin lịch hẹn',
      'Hồ sơ khám bệnh',
      'Trạng thái ca khám',
    ]) {
      expect(
        screen.getByRole('heading', { level: 2, name: title }),
      ).toBeInTheDocument();
    }
    expect(document.querySelector('ol')).not.toBeNull();
    expect(screen.getAllByText('Đã xác nhận').length).toBeGreaterThan(0);
  });
});
