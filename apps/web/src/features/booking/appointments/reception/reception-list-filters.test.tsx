import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advanceClock,
  startFakeClock,
} from '../../testing/appointment-list-harness';
import {
  chip,
  cleanUpReceptionPage,
  lastListQuery,
  listQueries,
  loaded,
  renderReceptionPage,
  searchBox,
  select,
  typeSearch,
} from '../../testing/reception-harness';
import { apiErrorResponse } from '../../testing/fake-appointment-list-api';
import { makeReceptionAppointments } from '../../testing/fake-reception-api';
import { LIST_TEXT } from './list-messages';

// booking F8: chip ngày (LTL-01…LTL-04), ô tìm (LTL-05) và các ô chọn (LTL-13). Mã LTL là [đề xuất] (PLAN booking mục 7.34). API giả CHỈ lọc `q` và `trangThai`: các ca bộ lọc
// khẳng định truy vấn đã GỬI, không khẳng định kết quả lọc.
afterEach(cleanUpReceptionPage);

// Chỉ giả `Date` (hẹn giờ thật vẫn chạy)
function setNow(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}
// 10:00 ngày 18/10/2026 (Chủ nhật) giờ Việt Nam
const SUNDAY = '2026-10-18T03:00:00.000Z';

const DOCTORS = {
  items: [
    { bacSiId: '5', hoTen: 'Nguyễn Minh Anh' },
    { bacSiId: '9007199254740993', hoTen: 'Lê Thảo Vy' },
  ],
  total: 2,
  page: 1,
  pageSize: 100,
};
const SPECIALTIES = {
  items: [
    { chuyenKhoaId: '1', ten: 'Tim mạch' },
    { chuyenKhoaId: '2', ten: 'Nhi khoa' },
  ],
  total: 2,
  page: 1,
  pageSize: 100,
  soCoBacSi: 2,
};

describe('chip ngày theo giờ Việt Nam', () => {
  // Biên nửa đêm: 16:59:59 UTC vẫn là 23:59:59 ngày 18/10 ở Việt Nam, 17:00:00 UTC đã là 00:00 ngày 19/10; 17:30 UTC KHÔNG phải ngày 18 theo UTC
  it('LTL-01 Hôm nay tính theo NGÀY Việt Nam, không theo UTC: 16:59:59Z còn 18/10, 17:00:00Z sang 19/10', async () => {
    setNow('2026-10-18T16:59:59.000Z');
    const first = renderReceptionPage();
    await loaded();
    expect(lastListQuery(first.api)).toMatchObject({
      tuNgay: '2026-10-18',
      denNgay: '2026-10-18',
    });
    first.unmount();
    cleanUpReceptionPage();

    setNow('2026-10-18T17:00:00.000Z');
    const second = renderReceptionPage();
    await loaded();
    expect(lastListQuery(second.api)).toMatchObject({
      tuNgay: '2026-10-19',
      denNgay: '2026-10-19',
    });
  });

  it('LTL-02 Ngày mai: gửi đúng ngày kế tiếp (cuối tháng, cuối năm) và chip đổi sang đang chọn', async () => {
    setNow('2026-12-31T03:00:00.000Z');
    const { api } = renderReceptionPage();
    await loaded();

    fireEvent.click(chip('Ngày mai'));
    await waitFor(() =>
      expect(lastListQuery(api)).toMatchObject({
        tuNgay: '2027-01-01',
        denNgay: '2027-01-01',
        page: '1',
      }),
    );
    expect(chip('Ngày mai')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Hôm nay')).toHaveAttribute('aria-pressed', 'false');
  });

  it('LTL-03 Tuần này: thứ Hai đến Chủ nhật của tuần chứa hôm nay; Chủ nhật 18/10 vẫn thuộc tuần 12/10 đến 18/10', async () => {
    setNow(SUNDAY);
    const { api } = renderReceptionPage();
    await loaded();

    fireEvent.click(chip('Tuần này'));
    await waitFor(() =>
      expect(lastListQuery(api)).toMatchObject({
        tuNgay: '2026-10-12',
        denNgay: '2026-10-18',
      }),
    );
    expect(chip('Tuần này')).toHaveAttribute('aria-pressed', 'true');
  });

  it('LTL-01 bấm lại chip đang chọn không gọi lại API', async () => {
    setNow(SUNDAY);
    const { api } = renderReceptionPage();
    await loaded();
    const calls = listQueries(api).length;
    fireEvent.click(chip('Hôm nay'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(listQueries(api)).toHaveLength(calls);
  });

  it('LTL-04 Khoảng ngày: hai ô Từ ngày, Đến ngày chỉ hiện khi chọn chip này; chưa nhập thì KHÔNG gửi tuNgay, denNgay; chip được tô', async () => {
    setNow(SUNDAY);
    const { api } = renderReceptionPage();
    await loaded();
    expect(screen.queryByLabelText('Từ ngày')).toBeNull();
    expect(screen.queryByLabelText('Đến ngày')).toBeNull();

    fireEvent.click(chip('Khoảng ngày'));
    await waitFor(() => expect(lastListQuery(api)).toEqual({ page: '1' }));
    expect(chip('Khoảng ngày')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Từ ngày')).toBeInTheDocument();
    expect(screen.getByLabelText('Đến ngày')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Từ ngày'), {
      target: { value: '2026-10-01' },
    });
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({ page: '1', tuNgay: '2026-10-01' }),
    );
    fireEvent.change(screen.getByLabelText('Đến ngày'), {
      target: { value: '2026-10-31' },
    });
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({
        page: '1',
        tuNgay: '2026-10-01',
        denNgay: '2026-10-31',
      }),
    );
  });

  it('LTL-04 Đến ngày trước Từ ngày ⇒ không gọi API, báo lỗi dưới ô; sửa lại thì gọi', async () => {
    setNow(SUNDAY);
    const { api } = renderReceptionPage();
    await loaded();
    fireEvent.click(chip('Khoảng ngày'));
    fireEvent.change(screen.getByLabelText('Từ ngày'), {
      target: { value: '2026-10-20' },
    });
    await waitFor(() => expect(lastListQuery(api)?.tuNgay).toBe('2026-10-20'));
    const calls = listQueries(api).length;

    fireEvent.change(screen.getByLabelText('Đến ngày'), {
      target: { value: '2026-10-19' },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      LIST_TEXT.dateOrder,
    );
    expect(screen.getByLabelText('Đến ngày')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(listQueries(api)).toHaveLength(calls);

    fireEvent.change(screen.getByLabelText('Đến ngày'), {
      target: { value: '2026-10-21' },
    });
    await waitFor(() =>
      expect(lastListQuery(api)).toMatchObject({
        tuNgay: '2026-10-20',
        denNgay: '2026-10-21',
      }),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('ô tìm: luật từ khoá (đồng hồ giả cho hẹn giờ)', () => {
  async function mount() {
    const view = renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(3);
      },
    });
    await loaded();
    startFakeClock();
    return view;
  }
  const requested = (api: Parameters<typeof listQueries>[0]) =>
    listQueries(api).length;

  it('LTL-05 một ký tự (hay rỗng, hay khoảng trắng) ⇒ KHÔNG gọi API dù đợi lâu, một ký tự thì hiện gợi ý; chữ mờ đúng Figma', async () => {
    const { api } = await mount();
    expect(searchBox()).toHaveAttribute(
      'placeholder',
      'Tìm theo mã lịch, tên bệnh nhân, số điện thoại, bác sĩ...',
    );

    typeSearch('a');
    await advanceClock(2_000);
    expect(requested(api)).toBe(1);
    expect(screen.getByText(LIST_TEXT.keywordTooShort)).toBeInTheDocument();

    typeSearch('   ');
    await advanceClock(2_000);
    expect(requested(api)).toBe(1);
  });

  it('LTL-05 hai ký tự ⇒ gọi đúng sau 300 ms và gửi `q` đã cắt khoảng trắng hai đầu; Enter gọi ngay', async () => {
    const { api } = await mount();

    typeSearch('  ab ');
    await advanceClock(299);
    expect(requested(api)).toBe(1);
    await advanceClock(1);
    expect(requested(api)).toBe(2);
    expect(lastListQuery(api)).toMatchObject({ q: 'ab', page: '1' });

    typeSearch('0901234567');
    fireEvent.keyDown(searchBox(), { key: 'Enter' });
    await advanceClock(0);
    expect(lastListQuery(api)?.q).toBe('0901234567');
  });

  it('LTL-05 đúng 100 ký tự gọi; 101 ký tự không còn tìm được: báo "tối đa 100", bỏ từ khoá đang áp dụng NGAY và KHÔNG BAO GIỜ gửi q dài hơn 100', async () => {
    const { api } = await mount();
    typeSearch('a'.repeat(100));
    await advanceClock(300);
    expect(requested(api)).toBe(2);
    expect(lastListQuery(api)?.q).toBe('a'.repeat(100));

    typeSearch('a'.repeat(101));
    await advanceClock(2_000);
    // Đúng một lần gọi thêm: bỏ từ khoá cũ (không q); không có lần gọi nào cho 101 ký tự
    expect(requested(api)).toBe(3);
    expect(lastListQuery(api)).not.toHaveProperty('q');
    expect(screen.getByText(LIST_TEXT.keywordTooLong)).toBeInTheDocument();
    for (const query of listQueries(api)) {
      expect((query.q ?? '').length).toBeLessThanOrEqual(100);
    }
  });

  it('LTL-05 xoá còn dưới 2 ký tự thì bỏ từ khoá đang áp dụng NGAY (danh sách về chưa tìm)', async () => {
    const { api } = await mount();
    typeSearch('ab');
    await advanceClock(300);
    expect(lastListQuery(api)?.q).toBe('ab');

    typeSearch('a');
    await advanceClock(0);
    expect(lastListQuery(api)).not.toHaveProperty('q');
  });

  it('LTL-05 400 TU_KHOA_KHONG_HOP_LE: giữ danh sách đang hiện và báo dưới ô tìm (lưới an toàn của luật ở client)', async () => {
    const { api } = await mount();
    api.failNext('list', () =>
      apiErrorResponse(400, 'DU_LIEU_KHONG_HOP_LE', [
        { truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' },
      ]),
    );
    typeSearch('a\u0001b');
    await advanceClock(300);
    expect(screen.getByText(LIST_TEXT.keywordRejected)).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: LIST_TEXT.resultsRegion }),
    ).toBeInTheDocument();
  });
});

describe('ô chọn chuyên khoa, bác sĩ, trạng thái', () => {
  it('LTL-13 gửi đúng bacSiId (id lớn giữ nguyên chữ số), chuyenKhoaId và MỘT trangThai; KHÔNG bao giờ gửi dichVuKhamId, chiNhanhId, pageSize', async () => {
    setNow(SUNDAY);
    const { api } = renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(3);
        fake.doctors = DOCTORS;
        fake.specialties = SPECIALTIES;
      },
    });
    await loaded();
    await screen.findByRole('option', { name: 'Lê Thảo Vy' });

    fireEvent.change(select('Bác sĩ'), {
      target: { value: '9007199254740993' },
    });
    await waitFor(() =>
      expect(lastListQuery(api)?.bacSiId).toBe('9007199254740993'),
    );
    fireEvent.change(select('Chuyên khoa'), { target: { value: '2' } });
    await waitFor(() => expect(lastListQuery(api)?.chuyenKhoaId).toBe('2'));
    fireEvent.change(select('Trạng thái'), { target: { value: 'DaXacNhan' } });
    await waitFor(() =>
      expect(lastListQuery(api)?.trangThai).toBe('DaXacNhan'),
    );

    expect(lastListQuery(api)).toEqual({
      page: '1',
      tuNgay: '2026-10-18',
      denNgay: '2026-10-18',
      bacSiId: '9007199254740993',
      chuyenKhoaId: '2',
      trangThai: 'DaXacNhan',
    });
    for (const query of listQueries(api)) {
      for (const banned of ['dichVuKhamId', 'chiNhanhId', 'pageSize', 'nhom']) {
        expect(query).not.toHaveProperty(banned);
      }
    }
  });

  it('LTL-13 chữ trong ô đúng Figma (`Tất cả …` là mục đầu); ô trạng thái có đủ sáu trạng thái, KHÔNG có "Đã đổi lịch"', async () => {
    renderReceptionPage({
      before: (fake) => {
        fake.doctors = DOCTORS;
        fake.specialties = SPECIALTIES;
      },
    });
    await loaded();
    await screen.findByRole('option', { name: 'Tim mạch' });
    expect(select('Chuyên khoa').options[0]).toHaveTextContent(
      'Tất cả chuyên khoa',
    );
    expect(select('Bác sĩ').options[0]).toHaveTextContent('Tất cả bác sĩ');
    expect(select('Trạng thái').options[0]).toHaveTextContent(
      'Tất cả trạng thái',
    );
    expect(
      Array.from(select('Trạng thái').options).map(
        (option) => option.textContent,
      ),
    ).toEqual([
      'Tất cả trạng thái',
      'Chờ thanh toán',
      'Đã xác nhận',
      'Đã tiếp đón',
      'Hoàn thành',
      'Đã hủy',
      'Vắng mặt',
    ]);
    // Không có ô lọc dịch vụ (Figma không có)
    expect(screen.queryByRole('combobox', { name: /Dịch vụ/ })).toBeNull();
  });

  it('LTL-13 danh sách bác sĩ, chuyên khoa lấy từ hai route CÔNG KHAI: pageSize=100, KHÔNG gắn Authorization; route của Lễ tân thì có token', async () => {
    const { api } = renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(2);
      },
    });
    await loaded();
    await waitFor(() => expect(api.callsTo('/public/doctors')).toHaveLength(1));
    await waitFor(() =>
      expect(api.callsTo('/public/specialties')).toHaveLength(1),
    );
    for (const path of ['/public/doctors', '/public/specialties']) {
      const [call] = api.callsTo(path);
      expect(call.query).toEqual({ pageSize: '100' });
      expect(call.hasToken).toBe(false);
    }
    expect(api.callsTo('/reception/appointments')[0].hasToken).toBe(true);
  });

  it('LTL-13 `total` lớn hơn số mục nhận được ⇒ ghi "danh sách rút gọn" thay vì cắt âm thầm', async () => {
    renderReceptionPage({
      before: (fake) => {
        fake.doctors = { ...DOCTORS, total: 250 };
      },
    });
    await loaded();
    expect(
      await screen.findByText(
        'Danh sách bác sĩ rút gọn: chỉ hiện 100 mục đầu.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Danh sách chuyên khoa rút gọn/)).toBeNull();
  });

  it('LTL-13 lỗi tải MỘT danh sách chỉ làm ô đó còn `Tất cả` kèm câu nhỏ và `Thử lại`, không chặn bảng; `Thử lại` tải lại đúng danh sách đó', async () => {
    const { api } = renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(2);
        fake.doctors = DOCTORS;
        fake.failNext('specialties', () => apiErrorResponse(500, 'MA_LOI_LA'));
      },
    });
    await loaded();
    expect(
      await screen.findByText('Không tải được danh sách chuyên khoa.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: LIST_TEXT.resultsRegion }),
    ).toBeInTheDocument();
    expect(select('Chuyên khoa').options).toHaveLength(1);
    expect(select('Bác sĩ').options).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(api.callsTo('/public/specialties')).toHaveLength(2);
  });
});
