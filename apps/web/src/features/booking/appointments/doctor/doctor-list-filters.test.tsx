import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOCTOR_APPOINTMENTS_PATH } from '../../../../shared/routes/booking-paths';
import {
  advanceClock,
  startFakeClock,
} from '../../testing/appointment-list-harness';
import {
  chip,
  cleanUpDoctorAppointments,
  currentUrl,
  dateInput,
  doctorListQueries,
  lastDoctorListQuery,
  loaded,
  renderDoctorAppointments,
  rowCodes,
  searchBox,
  select,
  typeSearch,
  type DoctorHarnessOptions,
} from '../../testing/doctor-harness';
import {
  makeDoctorAppointment,
  makeDoctorAppointments,
} from '../../testing/fake-doctor-api';
import { LIST_TEXT } from './list-messages';

// booking F11: bộ lọc của danh sách Bác sĩ: chip ngày (DAF-01…DAF-06), `Ca khám` (DAF-07), `Sắp xếp` (DAF-08), ô tìm (DAF-09), bấm lại không gọi lại (DAF-10), bộ lọc trên URL (DAF-11, DAF-12), kho trình duyệt
// (DAF-13), `Xóa lọc` (DAF-14). Mã DAF là [đề xuất] (PLAN booking mục 7.44); BSI-01 (lọc ngày, tuần, tháng) = DAF-01…DAF-04. API giả CHỈ lọc `q`, `ca`, `trangThai`: các ca khẳng định truy vấn đã GỬI.
afterEach(cleanUpDoctorAppointments);

// Chỉ giả `Date` (hẹn giờ thật vẫn chạy)
function setNow(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}
// 10:00 ngày 14/10/2026 (Thứ 4) giờ Việt Nam
const WEDNESDAY = '2026-10-14T03:00:00.000Z';

async function mount(
  path: string = DOCTOR_APPOINTMENTS_PATH,
  before?: DoctorHarnessOptions['before'],
) {
  const view = renderDoctorAppointments(path, { before });
  await loaded();
  return view;
}
const requested = (api: Parameters<typeof doctorListQueries>[0]) =>
  doctorListQueries(api).length;

describe('booking F11 — chip ngày của Bác sĩ theo giờ Việt Nam', () => {
  it('DAF-01 sáu chip đúng thứ tự Figma `457:2`; mặc định `Tùy chọn` sáng, hai ô ngày TRỐNG và KHÔNG gửi `tuNgay`, `denNgay`', async () => {
    const { api } = await mount();
    const group = within(
      screen.getByRole('group', { name: LIST_TEXT.dateGroup }),
    );
    expect(
      group.getAllByRole('button').map((button) => button.textContent),
    ).toEqual([
      'Hôm nay',
      'Ngày mai',
      'Tuần này',
      'Tuần sau',
      'Tháng này',
      'Tùy chọn',
    ]);
    expect(chip('Tùy chọn')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Hôm nay')).toHaveAttribute('aria-pressed', 'false');
    expect(dateInput('Từ ngày').value).toBe('');
    expect(dateInput('Đến ngày').value).toBe('');
    expect(lastDoctorListQuery(api)).toEqual({ page: '1' });
  });

  // Biên nửa đêm: 16:59:59 UTC vẫn là 23:59:59 ngày 18/10 ở Việt Nam, 17:00:00 UTC đã là 00:00 ngày 19/10; 17:30 UTC KHÔNG phải ngày 18 theo UTC
  it('DAF-02 Hôm nay tính theo NGÀY Việt Nam, không theo UTC: 16:59:59Z còn 18/10, 17:30Z là 19/10; ô ngày hiện khoảng đang áp dụng; URL ghi `khoang`, không ghi ngày', async () => {
    setNow('2026-10-18T16:59:59.000Z');
    const first = await mount();
    fireEvent.click(chip('Hôm nay'));
    await waitFor(() =>
      expect(lastDoctorListQuery(first.api)).toMatchObject({
        tuNgay: '2026-10-18',
        denNgay: '2026-10-18',
      }),
    );
    expect(dateInput('Từ ngày').value).toBe('2026-10-18');
    expect(dateInput('Đến ngày').value).toBe('2026-10-18');
    expect(chip('Hôm nay')).toHaveAttribute('aria-pressed', 'true');
    expect(currentUrl()).toBe(`${DOCTOR_APPOINTMENTS_PATH}?khoang=hom-nay`);
    first.unmount();
    cleanUpDoctorAppointments();

    setNow('2026-10-18T17:30:00.000Z');
    const second = await mount();
    fireEvent.click(chip('Hôm nay'));
    await waitFor(() =>
      expect(lastDoctorListQuery(second.api)).toMatchObject({
        tuNgay: '2026-10-19',
        denNgay: '2026-10-19',
      }),
    );
  });

  it('DAF-03 Ngày mai, Tuần này (T2 đến CN), Tuần sau gửi đúng `tuNgay`, `denNgay`; về trang 1', async () => {
    setNow(WEDNESDAY);
    const { api } = await mount();
    fireEvent.click(chip('Ngày mai'));
    await waitFor(() =>
      expect(lastDoctorListQuery(api)).toMatchObject({
        tuNgay: '2026-10-15',
        denNgay: '2026-10-15',
        page: '1',
      }),
    );
    fireEvent.click(chip('Tuần này'));
    await waitFor(() =>
      expect(lastDoctorListQuery(api)).toMatchObject({
        tuNgay: '2026-10-12',
        denNgay: '2026-10-18',
      }),
    );
    fireEvent.click(chip('Tuần sau'));
    await waitFor(() =>
      expect(lastDoctorListQuery(api)).toMatchObject({
        tuNgay: '2026-10-19',
        denNgay: '2026-10-25',
      }),
    );
    expect(currentUrl()).toBe(`${DOCTOR_APPOINTMENTS_PATH}?khoang=tuan-sau`);
  });

  it('DAF-04 Tháng này gửi ngày 1 đến ngày cuối của tháng (tháng 2 năm nhuận có 29 ngày)', async () => {
    setNow(WEDNESDAY);
    const first = await mount();
    fireEvent.click(chip('Tháng này'));
    await waitFor(() =>
      expect(lastDoctorListQuery(first.api)).toMatchObject({
        tuNgay: '2026-10-01',
        denNgay: '2026-10-31',
      }),
    );
    expect(chip('Tháng này')).toHaveAttribute('aria-pressed', 'true');
    first.unmount();
    cleanUpDoctorAppointments();

    setNow('2028-02-10T03:00:00.000Z');
    const second = await mount();
    fireEvent.click(chip('Tháng này'));
    await waitFor(() =>
      expect(lastDoctorListQuery(second.api)).toMatchObject({
        tuNgay: '2028-02-01',
        denNgay: '2028-02-29',
      }),
    );
  });

  it('DAF-05 sửa một ô ngày ⇒ `Tùy chọn` và gửi đúng ngày (đầu kia là ngày đang hiện); một đầu vẫn gửi; `Đến` trước `Từ` ⇒ KHÔNG gọi API và báo dưới ô', async () => {
    setNow(WEDNESDAY);
    const { api } = await mount();
    fireEvent.click(chip('Hôm nay'));
    await waitFor(() =>
      expect(lastDoctorListQuery(api)).toMatchObject({ tuNgay: '2026-10-14' }),
    );

    fireEvent.change(dateInput('Từ ngày'), { target: { value: '2026-10-10' } });
    await waitFor(() =>
      expect(lastDoctorListQuery(api)).toMatchObject({
        tuNgay: '2026-10-10',
        denNgay: '2026-10-14',
      }),
    );
    expect(chip('Tùy chọn')).toHaveAttribute('aria-pressed', 'true');
    expect(currentUrl()).toBe(
      `${DOCTOR_APPOINTMENTS_PATH}?tuNgay=2026-10-10&denNgay=2026-10-14`,
    );

    const before = requested(api);
    fireEvent.change(dateInput('Đến ngày'), {
      target: { value: '2026-10-01' },
    });
    expect(await screen.findByText(LIST_TEXT.dateOrder)).toBeInTheDocument();
    expect(requested(api)).toBe(before);
    expect(dateInput('Đến ngày').value).toBe('2026-10-01');
  });

  it('DAF-05 chỉ nhập `Từ ngày` (mặc định, hai ô trống): gửi MỘT đầu', async () => {
    const { api } = await mount();
    fireEvent.change(dateInput('Từ ngày'), { target: { value: '2026-10-10' } });
    await waitFor(() =>
      expect(lastDoctorListQuery(api)).toMatchObject({ tuNgay: '2026-10-10' }),
    );
    expect(lastDoctorListQuery(api)).not.toHaveProperty('denNgay');
  });

  it('DAF-06 qua nửa đêm: chip Hôm nay tự sang ngày mới ở lần vẽ kế tiếp, không hẹn giờ riêng', async () => {
    setNow('2026-10-18T16:59:59.000Z');
    const { api } = await mount();
    fireEvent.click(chip('Hôm nay'));
    await waitFor(() =>
      expect(lastDoctorListQuery(api)).toMatchObject({ tuNgay: '2026-10-18' }),
    );

    vi.setSystemTime(new Date('2026-10-18T17:00:00.000Z'));
    // Một thao tác bất kỳ làm vẽ lại: ngày của chip tính lại từ đồng hồ máy theo giờ Việt Nam
    fireEvent.click(screen.getByRole('button', { name: /^Đã xác nhận/ }));
    await waitFor(() =>
      expect(lastDoctorListQuery(api)).toMatchObject({
        tuNgay: '2026-10-19',
        denNgay: '2026-10-19',
        trangThai: 'DaXacNhan',
      }),
    );
  });
});

describe('booking F11 — `Ca khám` và `Sắp xếp` của Bác sĩ', () => {
  it('DAF-07 `Ca khám` có bốn mục; chọn gửi đúng MỘT giá trị `ca` và về trang 1; `Tất cả ca` không gửi `ca`', async () => {
    const { api } = await mount();
    const shift = select('Ca khám');
    expect(
      Array.from(shift.options).map((option) => option.textContent),
    ).toEqual(['Tất cả ca', 'Ca sáng', 'Ca chiều', 'Ca tối']);
    expect(shift.value).toBe('');
    expect(lastDoctorListQuery(api)).not.toHaveProperty('ca');

    fireEvent.change(shift, { target: { value: 'CaChieu' } });
    await waitFor(() =>
      expect(lastDoctorListQuery(api)).toMatchObject({
        ca: 'CaChieu',
        page: '1',
      }),
    );
    expect(currentUrl()).toBe(`${DOCTOR_APPOINTMENTS_PATH}?ca=CaChieu`);

    fireEvent.change(select('Ca khám'), { target: { value: '' } });
    await waitFor(() =>
      expect(lastDoctorListQuery(api)).not.toHaveProperty('ca'),
    );
    expect(currentUrl()).toBe(DOCTOR_APPOINTMENTS_PATH);
  });

  it('DAF-08 `Sắp xếp`: mặc định "Mới nhất trước" KHÔNG gửi `sapXep`; "Cũ nhất trước" gửi `CuNhat`; web KHÔNG sắp lại dòng', async () => {
    const { api } = await mount(DOCTOR_APPOINTMENTS_PATH, (fake) => {
      fake.appointments = [
        makeDoctorAppointment({ maLichHen: 'CP20261018003' }),
        makeDoctorAppointment({ maLichHen: 'CP20261018001' }),
        makeDoctorAppointment({ maLichHen: 'CP20261018002' }),
      ];
    });
    const sort = select('Sắp xếp');
    expect(
      Array.from(sort.options).map((option) => option.textContent),
    ).toEqual(['Mới nhất trước', 'Cũ nhất trước']);
    expect(sort.value).toBe('MoiNhat');
    expect(lastDoctorListQuery(api)).not.toHaveProperty('sapXep');

    fireEvent.change(sort, { target: { value: 'CuNhat' } });
    await waitFor(() =>
      expect(lastDoctorListQuery(api)).toMatchObject({ sapXep: 'CuNhat' }),
    );
    expect(currentUrl()).toBe(`${DOCTOR_APPOINTMENTS_PATH}?sapXep=CuNhat`);
    // Thứ tự dòng vẫn là thứ tự của API
    expect(rowCodes()).toEqual([
      'CP20261018003',
      'CP20261018001',
      'CP20261018002',
    ]);

    fireEvent.change(select('Sắp xếp'), { target: { value: 'MoiNhat' } });
    await waitFor(() =>
      expect(lastDoctorListQuery(api)).not.toHaveProperty('sapXep'),
    );
  });
});

describe('booking F11 — ô tìm của Bác sĩ', () => {
  it('DAF-09 một ký tự (hay rỗng) ⇒ KHÔNG gọi API dù đợi lâu, một ký tự thì hiện gợi ý; chữ mờ đúng Figma', async () => {
    const { api } = await mount();
    startFakeClock();
    expect(searchBox()).toHaveAttribute('placeholder', 'Mã lịch, tên, SĐT...');
    typeSearch('a');
    await advanceClock(2_000);
    expect(requested(api)).toBe(1);
    expect(screen.getByText(LIST_TEXT.keywordTooShort)).toBeInTheDocument();
    typeSearch('   ');
    await advanceClock(2_000);
    expect(requested(api)).toBe(1);
  });

  it('DAF-09 hai ký tự ⇒ gọi đúng sau 300 ms với `q` đã cắt khoảng trắng; Enter gọi ngay; `q` KHÔNG lên URL', async () => {
    const { api } = await mount();
    startFakeClock();
    typeSearch('  ab ');
    await advanceClock(299);
    expect(requested(api)).toBe(1);
    await advanceClock(1);
    expect(requested(api)).toBe(2);
    expect(lastDoctorListQuery(api)).toMatchObject({ q: 'ab', page: '1' });

    typeSearch('0901234567');
    fireEvent.keyDown(searchBox(), { key: 'Enter' });
    await advanceClock(0);
    expect(lastDoctorListQuery(api)?.q).toBe('0901234567');
    expect(currentUrl()).toBe(DOCTOR_APPOINTMENTS_PATH);
  });

  it('DAF-09 đúng 100 ký tự gọi; 101 ký tự không còn tìm được: báo "tối đa 100", bỏ từ khoá đang áp dụng NGAY và KHÔNG BAO GIỜ gửi `q` dài hơn 100', async () => {
    const { api } = await mount();
    startFakeClock();
    typeSearch('a'.repeat(100));
    await advanceClock(300);
    expect(lastDoctorListQuery(api)?.q).toBe('a'.repeat(100));
    typeSearch('a'.repeat(101));
    await advanceClock(2_000);
    expect(lastDoctorListQuery(api)).not.toHaveProperty('q');
    expect(screen.getByText(LIST_TEXT.keywordTooLong)).toBeInTheDocument();
    for (const query of doctorListQueries(api)) {
      expect((query.q ?? '').length).toBeLessThanOrEqual(100);
    }
  });
});

describe('booking F11 — bộ lọc của Bác sĩ trên URL và kho trình duyệt', () => {
  it('DAF-10 đặt lại đúng giá trị đang chọn KHÔNG gọi lại API: bấm lại chip đang chọn (ngày và trạng thái), chọn lại cùng ca', async () => {
    const { api } = await mount();
    const base = requested(api);
    fireEvent.click(chip('Tùy chọn'));
    fireEvent.change(select('Ca khám'), { target: { value: '' } });
    fireEvent.change(select('Sắp xếp'), { target: { value: 'MoiNhat' } });
    fireEvent.click(screen.getByRole('button', { name: /^Tất cả/ }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(requested(api)).toBe(base);

    fireEvent.click(screen.getByRole('button', { name: /^Đã xác nhận/ }));
    await waitFor(() => expect(requested(api)).toBe(base + 1));
    fireEvent.click(screen.getByRole('button', { name: /^Đã xác nhận/ }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(requested(api)).toBe(base + 1);
  });

  it('DAF-11 bộ lọc không cá nhân nằm trên URL theo thứ tự cố định, `replace` (không đẩy lịch sử); `q` (tên, SĐT) KHÔNG BAO GIỜ lên URL', async () => {
    const { api, router } = await mount(DOCTOR_APPOINTMENTS_PATH, (fake) => {
      fake.appointments = makeDoctorAppointments(5);
      fake.pageSize = 2;
    });
    fireEvent.click(screen.getByRole('button', { name: /^Đã xác nhận/ }));
    fireEvent.change(select('Ca khám'), { target: { value: 'CaSang' } });
    fireEvent.change(select('Sắp xếp'), { target: { value: 'CuNhat' } });
    fireEvent.click(chip('Tuần sau'));
    await waitFor(() =>
      expect(currentUrl()).toBe(
        `${DOCTOR_APPOINTMENTS_PATH}?trangThai=DaXacNhan&ca=CaSang&sapXep=CuNhat&khoang=tuan-sau`,
      ),
    );
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() =>
      expect(currentUrl()).toBe(
        `${DOCTOR_APPOINTMENTS_PATH}?trangThai=DaXacNhan&ca=CaSang&sapXep=CuNhat&khoang=tuan-sau&page=2`,
      ),
    );
    expect(router.state.historyAction).toBe('REPLACE');
    expect(lastDoctorListQuery(api)).toMatchObject({
      trangThai: 'DaXacNhan',
      ca: 'CaSang',
      sapXep: 'CuNhat',
      page: '2',
    });

    startFakeClock();
    typeSearch('Nguyễn Văn A');
    await advanceClock(300);
    expect(lastDoctorListQuery(api)?.q).toBe('Nguyễn Văn A');
    expect(currentUrl()).not.toMatch(/q=|Nguy/);
    expect(window.location.href).not.toMatch(/Nguy|q=/);
  });

  it('DAF-12 URL sai hay lạ bị bỏ như không có: trạng thái DaDoiLich, ca lạ, ngày không có thật, trang 0, chip lạ; KHÔNG gửi bacSiId, chiNhanhId, chuyenKhoaId, pageSize, q lên API', async () => {
    const { api } = await mount(
      `${DOCTOR_APPOINTMENTS_PATH}?trangThai=DaDoiLich&ca=Sang&tuNgay=2026-13-45&page=0&bacSiId=5&chiNhanhId=3&chuyenKhoaId=1&pageSize=100&q=abc&khoang=lạ&sapXep=Lạ`,
    );
    expect(doctorListQueries(api)).toEqual([{ page: '1' }]);
    expect(chip('Tùy chọn')).toHaveAttribute('aria-pressed', 'true');
    expect(select('Ca khám').value).toBe('');
    expect(select('Sắp xếp').value).toBe('MoiNhat');
  });

  it('DAF-12 URL hợp lệ (liên kết sâu): mọi bộ lọc được áp dụng đúng, chip, ô chọn và ô ngày phản ánh đúng', async () => {
    const { api } = await mount(
      `${DOCTOR_APPOINTMENTS_PATH}?trangThai=DaHuy&ca=CaToi&sapXep=CuNhat&tuNgay=2026-10-01&denNgay=2026-10-31&page=2`,
      (fake) => {
        fake.appointments = Array.from({ length: 5 }, (_, index) =>
          makeDoctorAppointment({
            maLichHen: `CP20261018${String(index + 1).padStart(3, '0')}`,
            trangThai: 'DaHuy',
            ca: 'CaToi',
          }),
        );
        fake.pageSize = 2;
      },
    );
    expect(doctorListQueries(api)).toEqual([
      {
        page: '2',
        trangThai: 'DaHuy',
        ca: 'CaToi',
        sapXep: 'CuNhat',
        tuNgay: '2026-10-01',
        denNgay: '2026-10-31',
      },
    ]);
    expect(chip('Tùy chọn')).toHaveAttribute('aria-pressed', 'true');
    expect(dateInput('Từ ngày').value).toBe('2026-10-01');
    expect(dateInput('Đến ngày').value).toBe('2026-10-31');
    expect(select('Ca khám').value).toBe('CaToi');
    expect(select('Sắp xếp').value).toBe('CuNhat');
    expect(screen.getByRole('button', { name: /^Đã hủy/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Trang 2 / 3')).toBeInTheDocument();
  });

  it('DAF-13 kho trình duyệt: sau mọi thao tác lọc `localStorage` và `sessionStorage` vẫn 0 mục (đo bằng `.length`)', async () => {
    const { api } = await mount();
    startFakeClock();
    fireEvent.click(chip('Tháng này'));
    fireEvent.change(select('Ca khám'), { target: { value: 'CaToi' } });
    fireEvent.change(select('Sắp xếp'), { target: { value: 'CuNhat' } });
    typeSearch('Nguyễn');
    await advanceClock(300);
    fireEvent.click(screen.getByRole('button', { name: /^Hoàn thành/ }));
    await advanceClock(0);
    expect(requested(api)).toBeGreaterThan(3);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('DAF-14 `Xóa lọc` chỉ hiện khi có gì khác mặc định; bấm đưa về mặc định: URL sạch, ô tìm rỗng, truy vấn không còn bộ lọc', async () => {
    const { api } = await mount();
    expect(
      screen.queryByRole('button', { name: LIST_TEXT.clearFilters }),
    ).toBeNull();
    startFakeClock();
    fireEvent.click(chip('Hôm nay'));
    fireEvent.change(select('Ca khám'), { target: { value: 'CaSang' } });
    typeSearch('Nguyễn');
    await advanceClock(300);
    expect(lastDoctorListQuery(api)).toMatchObject({
      ca: 'CaSang',
      q: 'Nguyễn',
    });

    fireEvent.click(
      screen.getByRole('button', { name: LIST_TEXT.clearFilters }),
    );
    await advanceClock(0);
    expect(lastDoctorListQuery(api)).toEqual({ page: '1' });
    expect(currentUrl()).toBe(DOCTOR_APPOINTMENTS_PATH);
    expect(searchBox().value).toBe('');
    expect(
      screen.queryByRole('button', { name: LIST_TEXT.clearFilters }),
    ).toBeNull();
  });
});
