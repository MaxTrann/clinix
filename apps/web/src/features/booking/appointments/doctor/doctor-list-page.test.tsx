import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DOCTOR_APPOINTMENTS_PATH } from '../../../../shared/routes/booking-paths';
import { apiErrorResponse } from '../../testing/fake-appointment-list-api';
import {
  cleanUpDoctorAppointments,
  currentUrl,
  detailLink,
  doctorListQueries,
  lastDoctorListQuery,
  loaded,
  renderDoctorAppointments,
  rowCodes,
  type DoctorHarnessOptions,
} from '../../testing/doctor-harness';
import {
  makeDoctorAppointment,
  makeDoctorAppointments,
} from '../../testing/fake-doctor-api';
import {
  advanceClock,
  startFakeClock,
} from '../../testing/appointment-list-harness';
import { LIST_TEXT } from './list-messages';

// booking F11: trang danh sách "Lịch hẹn" của Bác sĩ với API giả. Mã DAL là [đề xuất] (PLAN booking mục 7.44); BSI-01 (danh sách, chi tiết, lọc ngày, tuần, tháng) = DAL-01…DAL-08, DAL-11 cùng DAF; BSI-02 (không
// giá, cọc, email) = DAL-03. API giả CHỈ lọc `q`, `ca`, `trangThai`: các ca khẳng định truy vấn đã GỬI, không khẳng định kết quả lọc ngày hay thứ tự.
afterEach(cleanUpDoctorAppointments);

async function mount(before?: DoctorHarnessOptions['before']) {
  const view = renderDoctorAppointments(DOCTOR_APPOINTMENTS_PATH, { before });
  await loaded();
  return view;
}

// Sáu lịch như Figma `457:2`: Chờ thanh toán 1, Đã xác nhận 2, Đã tiếp đón 1, Hoàn thành 2
const SIX = [
  makeDoctorAppointment({
    maLichHen: 'CP20261008051',
    trangThai: 'ChoThanhToan',
  }),
  makeDoctorAppointment({ maLichHen: 'CP20261018006', trangThai: 'DaTiepDon' }),
  makeDoctorAppointment({ maLichHen: 'CP20261018001', trangThai: 'DaXacNhan' }),
  makeDoctorAppointment({ maLichHen: 'CP20261008009', trangThai: 'DaXacNhan' }),
  makeDoctorAppointment({ maLichHen: 'CP20260520001', trangThai: 'HoanThanh' }),
  makeDoctorAppointment({ maLichHen: 'CP20260520005', trangThai: 'HoanThanh' }),
];

const statusTabs = () =>
  within(screen.getByRole('group', { name: LIST_TEXT.statusGroup }));
const tabLabels = () =>
  statusTabs()
    .getAllByRole('button')
    .map((button) => button.textContent);
const tab = (name: RegExp) => statusTabs().getByRole('button', { name });

describe('booking F11 — danh sách Lịch hẹn của Bác sĩ: tải đầu, cột, dữ liệu', () => {
  it('DAL-01 tải đầu: MỘT GET chỉ có `page=1` (không ngày, trạng thái, ca, sắp xếp, từ khoá, bacSiId, chiNhanhId, pageSize), có token, không lời gọi ghi; h1 và phụ đề Figma', async () => {
    const { api } = await mount();
    expect(doctorListQueries(api)).toEqual([{ page: '1' }]);
    expect(api.callsTo('/doctor/appointments')).toHaveLength(1);
    expect(api.callsTo('/doctor/appointments')[0].hasToken).toBe(true);
    expect(api.writes()).toEqual([]);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Lịch hẹn' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Danh sách ca khám được phân công theo ngày và khoảng thời gian.',
      ),
    ).toBeInTheDocument();
  });

  it('DAL-02 sáu cột đúng Figma `457:2`; KHÔNG cột bác sĩ, chi nhánh, giá; dòng mẫu đủ ngày ngắn, giờ, mã, người khám, SĐT, chuyên khoa, lý do, chip, liên kết', async () => {
    await mount();
    expect(
      screen.getAllByRole('columnheader').map((header) => header.textContent),
    ).toEqual([
      'Ngày / Giờ',
      'Bệnh nhân',
      'Chuyên khoa',
      'Lý do khám',
      'Trạng thái',
      'Thao tác',
    ]);
    const row = within(screen.getAllByRole('row')[1]);
    for (const text of [
      'CN, 18/10/2026',
      '08:00',
      'CP20261018001',
      'Nguyễn Văn A',
      '0901234567',
      'Tim mạch',
      'Đau ngực nhẹ, theo dõi huyết áp',
      'Đã xác nhận',
    ]) {
      expect(row.getByText(text), text).toBeInTheDocument();
    }
    for (const absent of [/Bác sĩ/, /Chi nhánh/, /Giá/, /Email/, /Cọc/]) {
      expect(screen.queryByRole('columnheader', { name: absent })).toBeNull();
    }
  });

  it('DAL-03 BSI-02: khoá thừa của API (giá, cọc, email, người đặt, tên bác sĩ, lý do hủy) KHÔNG lên màn hình', async () => {
    await mount((api) => {
      api.appointments = [
        {
          ...makeDoctorAppointment(),
          giaSnapshot: '300000.00',
          tienCoc: '100000.00',
          email: 'nguyenvana@email.com',
          bacSi: 'ThS.BS Nguyễn Minh Anh',
          nguoiDat: { hoTen: 'Người đặt', soDienThoai: '0988888888' },
          lyDoHuy: 'Bận việc',
        },
      ];
    });
    const text = document.body.textContent ?? '';
    for (const leaked of [
      '300.000',
      '100.000',
      '300000',
      'nguyenvana@email.com',
      'Nguyễn Minh Anh',
      'Người đặt',
      '0988888888',
      'Bận việc',
    ]) {
      expect(text, leaked).not.toContain(leaked);
    }
  });

  it('DAL-03 dòng sai hình dạng (thiếu khoá) ⇒ hộp lỗi với `Thử lại`, KHÔNG vẽ bảng dở dang', async () => {
    const { api } = renderDoctorAppointments(DOCTOR_APPOINTMENTS_PATH, {
      before: (fake) => {
        fake.appointments = [
          { maLichHen: 'CP20261018001', trangThai: 'DaXacNhan' },
        ];
      },
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: LIST_TEXT.resultsRegion }),
    ).toBeNull();
    expect(api.callsTo('/doctor/appointments')).toHaveLength(1);
  });

  it('DAL-04 thứ tự dòng GIỮ NGUYÊN thứ tự của API (web không sắp lại)', async () => {
    await mount((api) => {
      api.appointments = [
        makeDoctorAppointment({ maLichHen: 'CP20261018003' }),
        makeDoctorAppointment({ maLichHen: 'CP20261018001' }),
        makeDoctorAppointment({ maLichHen: 'CP20261018002' }),
      ];
    });
    expect(rowCodes()).toEqual([
      'CP20261018003',
      'CP20261018001',
      'CP20261018002',
    ]);
  });

  it('DAL-05 ngày và giờ theo NGÀY giờ Việt Nam: 16:59Z còn T7 17/10 lúc 23:59, 17:00Z đã là CN 18/10 lúc 00:00', async () => {
    await mount((api) => {
      api.appointments = [
        makeDoctorAppointment({
          maLichHen: 'CP20261017001',
          thoiGian: '2026-10-17T16:59:00.000Z',
        }),
        makeDoctorAppointment({
          maLichHen: 'CP20261017002',
          thoiGian: '2026-10-17T17:00:00.000Z',
        }),
        makeDoctorAppointment({
          maLichHen: 'CP20261020001',
          thoiGian: '2026-10-20T01:00:00.000Z',
        }),
      ];
    });
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('T7, 17/10/2026')).toBeInTheDocument();
    expect(within(rows[0]).getByText('23:59')).toBeInTheDocument();
    expect(within(rows[1]).getByText('CN, 18/10/2026')).toBeInTheDocument();
    expect(within(rows[1]).getByText('00:00')).toBeInTheDocument();
    expect(within(rows[2]).getByText('T3, 20/10/2026')).toBeInTheDocument();
  });

  it('DAL-06 SĐT null ⇒ không dòng thứ hai (KHÔNG chữ "null"); lý do khám null ⇒ "Không có"', async () => {
    await mount((api) => {
      api.appointments = [
        makeDoctorAppointment({
          lyDoKham: null,
          nguoiKham: {
            hoTen: 'Vũ Thị Lan',
            quanHe: 'Me',
            gioiTinh: null,
            ngaySinh: null,
            soDienThoai: null,
          },
        }),
      ];
    });
    const row = within(screen.getAllByRole('row')[1]);
    expect(row.getByText('Vũ Thị Lan')).toBeInTheDocument();
    expect(row.getByText('Không có')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/null|undefined/);
  });

  it('DAL-10 không bao giờ hiện DaDoiLich: không chip, không ô lọc; dòng lạ ⇒ chip "Chưa xác định", không lộ mã thô', async () => {
    await mount((api) => {
      api.appointments = [makeDoctorAppointment({ trangThai: 'DaDoiLich' })];
    });
    expect(screen.queryByText(/Đã đổi lịch/i)).toBeNull();
    expect(screen.queryByText('DaDoiLich')).toBeNull();
    expect(
      within(screen.getAllByRole('row')[1]).getByText('Chưa xác định'),
    ).toBeInTheDocument();
    expect(tabLabels()).not.toContain('Đã đổi lịch');
    expect(tabLabels()).toHaveLength(7);
  });

  it('DAL-18 lý do khám là chữ tự do: `<script>`, `<img onerror>`, nháy, gạch chéo, emoji hiện NGUYÊN VĂN là chữ, không thành thẻ', async () => {
    const hostile = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      `"nháy" 'đơn' \\ gạch / chéo 😷`,
    ];
    await mount((api) => {
      api.appointments = hostile.map((lyDoKham, index) =>
        makeDoctorAppointment({
          maLichHen: `CP2026101800${index + 1}`,
          lyDoKham,
        }),
      );
    });
    for (const text of hostile) {
      expect(screen.getByText(text), text).toBeInTheDocument();
    }
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });
});

describe('booking F11 — danh sách của Bác sĩ: chip trạng thái có số đếm', () => {
  it('DAL-07 bảy chip theo thứ tự Figma cộng `Chờ thanh toán`; số đếm LẤY NGUYÊN từ `demTheoTrangThai` (không đếm lại từ dòng); `Tất cả` là tổng sáu số', async () => {
    await mount((api) => {
      api.appointments = SIX;
      api.counts = {
        ChoThanhToan: 11,
        DaXacNhan: 12,
        DaTiepDon: 13,
        HoanThanh: 14,
        VangMat: 15,
        DaHuy: 16,
      };
    });
    expect(tabLabels()).toEqual([
      'Tất cả 81',
      'Chờ thanh toán 11',
      'Đã xác nhận 12',
      'Đã tiếp đón 13',
      'Hoàn thành 14',
      'Vắng mặt 15',
      'Đã hủy 16',
    ]);
  });

  it('DAL-07 chọn chip gửi đúng `trangThai` và về trang 1; chip đang chọn `aria-pressed`; `Tất cả` bỏ `trangThai`', async () => {
    const { api } = await mount((fake) => {
      fake.appointments = SIX;
    });
    expect(tabLabels()).toEqual([
      'Tất cả 6',
      'Chờ thanh toán 1',
      'Đã xác nhận 2',
      'Đã tiếp đón 1',
      'Hoàn thành 2',
      'Vắng mặt 0',
      'Đã hủy 0',
    ]);
    expect(tab(/^Tất cả/)).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(tab(/^Đã tiếp đón/));
    await waitFor(() =>
      expect(lastDoctorListQuery(api)).toMatchObject({
        trangThai: 'DaTiepDon',
        page: '1',
      }),
    );
    await waitFor(() =>
      expect(tab(/^Đã tiếp đón/)).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(tab(/^Tất cả/)).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(rowCodes()).toEqual(['CP20261018006']));

    fireEvent.click(tab(/^Tất cả/));
    await waitFor(() =>
      expect(lastDoctorListQuery(api)).not.toHaveProperty('trangThai'),
    );
  });

  it('DAL-08 khi đang chọn một chip, `Tất cả` VẪN là tổng sáu số (không phải `total` của danh sách đang lọc); dòng "Hiển thị" là số dòng / `total` của API', async () => {
    await mount((api) => {
      api.appointments = SIX;
    });
    fireEvent.click(tab(/^Hoàn thành/));
    await waitFor(() =>
      expect(rowCodes()).toEqual(['CP20260520001', 'CP20260520005']),
    );
    expect(tabLabels()?.[0]).toBe('Tất cả 6');
    expect(screen.getByText('Hiển thị 2 / 2 lịch hẹn')).toBeInTheDocument();
  });

  it('DAL-09 dòng "Hiển thị {số dòng của trang} / {total} lịch hẹn": 2 dòng trên 45', async () => {
    await mount((api) => {
      api.appointments = makeDoctorAppointments(45);
      api.pageSize = 2;
    });
    expect(screen.getByText('Hiển thị 2 / 45 lịch hẹn')).toBeInTheDocument();
  });
});

describe('booking F11 — danh sách của Bác sĩ: rỗng, lỗi, tải lại, chuyển trang', () => {
  it('DAL-11 rỗng ba câu: chưa có lịch nào (không `Xóa lọc`); chỉ khoảng ngày; có bộ lọc khác; chip trạng thái vẫn còn và bấm `Tất cả` thoát được', async () => {
    renderDoctorAppointments(DOCTOR_APPOINTMENTS_PATH, {
      before: (api) => {
        api.appointments = [];
      },
    });
    expect(await screen.findByText(LIST_TEXT.noneYet)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: LIST_TEXT.clearFilters }),
    ).toBeNull();
    // Chip và dòng "Hiển thị" vẫn có khi 0 dòng
    expect(tabLabels()?.[0]).toBe('Tất cả 0');
    expect(screen.getByText('Hiển thị 0 / 0 lịch hẹn')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hôm nay' }));
    expect(await screen.findByText(LIST_TEXT.noInRange)).toBeInTheDocument();
    // Hai nút `Xóa lọc`: một ở thẻ bộ lọc, một ở khung rỗng
    expect(
      screen.getAllByRole('button', { name: LIST_TEXT.clearFilters }),
    ).toHaveLength(2);

    fireEvent.click(tab(/^Đã hủy/));
    expect(await screen.findByText(LIST_TEXT.noMatch)).toBeInTheDocument();
  });

  it('DAL-11 lọc ra 0 dòng: chip còn bấm được, `Tất cả` đưa các dòng trở lại', async () => {
    await mount((api) => {
      api.appointments = [makeDoctorAppointment({ trangThai: 'DaXacNhan' })];
    });
    fireEvent.click(tab(/^Đã hủy/));
    expect(await screen.findByText(LIST_TEXT.noMatch)).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: LIST_TEXT.resultsRegion }),
    ).toBeNull();
    fireEvent.click(tab(/^Tất cả/));
    await waitFor(() => expect(rowCodes()).toEqual(['CP20261018001']));
  });

  it('DAL-11 chỉ đổi `Sắp xếp` (không lọc gì) mà rỗng ⇒ vẫn câu "chưa có lịch hẹn nào được phân công", KHÔNG nói "khoảng ngày"', async () => {
    renderDoctorAppointments(DOCTOR_APPOINTMENTS_PATH, {
      before: (api) => {
        api.appointments = [];
      },
    });
    expect(await screen.findByText(LIST_TEXT.noneYet)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Sắp xếp' }), {
      target: { value: 'CuNhat' },
    });
    await waitFor(() =>
      expect(currentUrl()).toBe(`${DOCTOR_APPOINTMENTS_PATH}?sapXep=CuNhat`),
    );
    expect(await screen.findByText(LIST_TEXT.noneYet)).toBeInTheDocument();
    expect(screen.queryByText(LIST_TEXT.noInRange)).toBeNull();
  });

  it('DAL-12 lỗi chọn câu theo `maLoi`: 401 và 403 có câu riêng và KHÔNG `Thử lại`; 500 có `Thử lại`', async () => {
    renderDoctorAppointments(DOCTOR_APPOINTMENTS_PATH, {
      before: (api) =>
        api.failNext('list', () => apiErrorResponse(401, 'CHUA_DANG_NHAP')),
    });
    expect(
      await screen.findByText(LIST_TEXT.sessionExpired),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Lịch hẹn' }),
    ).toBeInTheDocument();
  });

  it('DAL-12 403 `KHONG_DU_QUYEN` ⇒ "không có quyền", không `Thử lại`', async () => {
    renderDoctorAppointments(DOCTOR_APPOINTMENTS_PATH, {
      before: (api) =>
        api.failNext('list', () => apiErrorResponse(403, 'KHONG_DU_QUYEN')),
    });
    expect(await screen.findByText(LIST_TEXT.forbidden)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('DAL-12 500 ⇒ `Thử lại`: KHÔNG tự gửi lại; bấm `Thử lại` đúng MỘT GET nữa và hiện bảng', async () => {
    const { api } = renderDoctorAppointments(DOCTOR_APPOINTMENTS_PATH, {
      before: (fake) =>
        fake.failNext('list', () => apiErrorResponse(500, 'LOI_HE_THONG')),
    });
    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    // Đợi lâu hơn mọi hẹn giờ của trang: vẫn đúng một lời gọi
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(api.callsTo('/doctor/appointments')).toHaveLength(1);

    fireEvent.click(retry);
    await loaded();
    expect(api.callsTo('/doctor/appointments')).toHaveLength(2);
  });

  it('DAL-17 mất mạng (fetch ném TypeError) ⇒ hộp lỗi với `Thử lại`, h1 vẫn hiện, KHÔNG tự gửi lại', async () => {
    const { api } = renderDoctorAppointments(DOCTOR_APPOINTMENTS_PATH, {
      before: (fake) =>
        fake.failNext('list', () => {
          throw new TypeError('Failed to fetch');
        }),
    });
    expect(
      await screen.findByRole('button', { name: 'Thử lại' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Lịch hẹn' }),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(api.callsTo('/doctor/appointments')).toHaveLength(1);
  });

  it('DAL-13 đổi bộ lọc: bảng CŨ vẫn hiện (`aria-busy`, không về "Đang tải") tới khi truy vấn mới về', async () => {
    const { api } = await mount((fake) => {
      fake.appointments = SIX;
    });
    api.failNext('list', () => new Promise<Response>(() => undefined));
    fireEvent.click(tab(/^Hoàn thành/));
    await waitFor(() =>
      expect(document.querySelector('[aria-busy="true"]')).not.toBeNull(),
    );
    expect(rowCodes()).toHaveLength(6);
    expect(screen.queryByText(LIST_TEXT.loading)).toBeNull();
  });

  it('DAL-14 chuyển trang: gửi đúng `page`, URL ghi `page`; đổi bộ lọc về trang 1', async () => {
    const { api } = await mount((fake) => {
      fake.appointments = makeDoctorAppointments(5);
      fake.pageSize = 2;
    });
    expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() =>
      expect(lastDoctorListQuery(api)).toMatchObject({ page: '2' }),
    );
    await waitFor(() =>
      expect(currentUrl()).toBe(`${DOCTOR_APPOINTMENTS_PATH}?page=2`),
    );
    expect(screen.getByText('Trang 2 / 3')).toBeInTheDocument();

    fireEvent.click(tab(/^Đã xác nhận/));
    await waitFor(() =>
      expect(lastDoctorListQuery(api)).toMatchObject({
        trangThai: 'DaXacNhan',
        page: '1',
      }),
    );
    expect(currentUrl()).toBe(
      `${DOCTOR_APPOINTMENTS_PATH}?trangThai=DaXacNhan`,
    );
  });

  it('DAL-14 trang vượt cuối (URL `page=9`, API trả 200 rỗng mà `total` còn) ⇒ tự về trang cuối còn dữ liệu, không nháy câu "chưa có lịch hẹn"', async () => {
    renderDoctorAppointments(`${DOCTOR_APPOINTMENTS_PATH}?page=9`, {
      before: (fake) => {
        fake.appointments = makeDoctorAppointments(5);
        fake.pageSize = 2;
      },
    });
    await loaded();
    await waitFor(() =>
      expect(screen.getByText('Trang 3 / 3')).toBeInTheDocument(),
    );
    expect(screen.queryByText(LIST_TEXT.noneYet)).toBeNull();
    expect(currentUrl()).toBe(`${DOCTOR_APPOINTMENTS_PATH}?page=3`);
  });

  it('DAL-15 400 `TU_KHOA_KHONG_HOP_LE` (lưới an toàn của luật ở client): GIỮ bảng đang hiện và báo dưới ô tìm', async () => {
    const { api } = await mount();
    startFakeClock();
    api.failNext('list', () =>
      apiErrorResponse(400, 'DU_LIEU_KHONG_HOP_LE', [
        { truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' },
      ]),
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: LIST_TEXT.searchLabel }),
      {
        target: { value: 'ab' },
      },
    );
    await advanceClock(300);
    expect(screen.getByText(LIST_TEXT.keywordRejected)).toBeInTheDocument();
    expect(rowCodes()).toEqual(['CP20261018001']);
  });
});

describe('booking F11 — danh sách của Bác sĩ: liên kết Chi tiết', () => {
  it('DAL-16 `Chi tiết` là liên kết tới TRANG chi tiết (mã trên đường dẫn), tên truy cập kèm mã, mang `listSearch` và KHÔNG mang `q` hay lý do khám', async () => {
    const { router } = await mount((api) => {
      api.appointments = makeDoctorAppointments(2);
    });
    expect(detailLink('CP20261018002')).toHaveAttribute(
      'href',
      '/bac-si-portal/lich-hen/CP20261018002',
    );

    fireEvent.click(tab(/^Đã xác nhận/));
    await waitFor(() =>
      expect(currentUrl()).toBe(
        `${DOCTOR_APPOINTMENTS_PATH}?trangThai=DaXacNhan`,
      ),
    );
    fireEvent.click(detailLink('CP20261018001'));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/bac-si-portal/lich-hen/CP20261018001',
      ),
    );
    expect(router.state.location.state).toEqual({
      listSearch: '?trangThai=DaXacNhan',
    });
    expect(JSON.stringify(router.state.location)).not.toContain('Đau ngực');
  });

  it('DAL-16 từ khoá `q` (tên, SĐT) không lọt vào `listSearch` của liên kết', async () => {
    const { router } = await mount((api) => {
      api.appointments = makeDoctorAppointments(2);
    });
    startFakeClock();
    fireEvent.change(
      screen.getByRole('textbox', { name: LIST_TEXT.searchLabel }),
      {
        target: { value: 'Nguyễn' },
      },
    );
    await advanceClock(300);
    vi.useRealTimers();
    await waitFor(() => expect(rowCodes()).toHaveLength(2));
    fireEvent.click(detailLink('CP20261018001'));
    await waitFor(() =>
      expect(router.state.location.pathname).toContain('CP20261018001'),
    );
    const search = (router.state.location.state as { listSearch: string })
      .listSearch;
    expect(search).not.toMatch(/Nguy|q=/);
  });
});
