import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RECEPTION_APPOINTMENTS_PATH,
  receptionAppointmentDetailPath,
} from '../../../../shared/routes/booking-paths';
import { makeReceptionAppointments } from '../../testing/fake-reception-api';
import {
  chip,
  cleanUpReceptionPage,
  currentUrl,
  detailLink,
  lastListQuery,
  listQueries,
  loaded,
  renderReceptionPage,
  searchBox,
  select,
  typeSearch,
} from '../../testing/reception-harness';
import { DETAIL_TEXT } from './detail/detail-messages';
import { LIST_TEXT } from './list-messages';

// booking F12b: bộ lọc KHÔNG cá nhân của "Quản lý lịch hẹn" của Lễ tân nằm trên URL (UIF-16) và `Quay lại danh sách` từ trang chi tiết khôi phục đúng bộ lọc (UIF-17). Mã UIF là [đề xuất] (PLAN booking
// mục 7.48; Đại duyệt 14/11/2026, TRACKING 3.42 câu (h)). Từ khoá `q` (tên, SĐT bệnh nhân) KHÔNG BAO GIỜ lên URL hay kho trình duyệt (LTL-12, F1, F8). API giả CHỈ lọc `q` và `trangThai`: test khẳng định
// truy vấn đã GỬI. Hàm thuần đọc, ghi URL ở `reception-query-state.test.ts`.
afterEach(cleanUpReceptionPage);

// Chỉ giả `Date` (hẹn giờ thật vẫn chạy)
function setNow(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}
// 10:00 ngày 18/10/2026 (Chủ nhật) giờ Việt Nam: `Tuần này` là thứ Hai 12/10 đến Chủ nhật 18/10; `Ngày mai` là 19/10
const SUNDAY = '2026-10-18T03:00:00.000Z';

const DOCTORS = {
  items: [
    { bacSiId: '5', hoTen: 'Nguyễn Minh Anh' },
    { bacSiId: '9', hoTen: 'Lê Thảo Vy' },
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
const LIST = RECEPTION_APPOINTMENTS_PATH;

describe('bộ lọc của Lễ tân trên URL', () => {
  it('UIF-16 vào bằng URL có bộ lọc: truy vấn đầu tiên đã mang ĐÚNG bộ lọc (không có `q`), chip và ô chọn hiện đúng', async () => {
    setNow(SUNDAY);
    const { api } = renderReceptionPage({
      entry: `${LIST}?khoang=tuan-nay&trangThai=DaXacNhan&bacSiId=5&chuyenKhoaId=1&page=2`,
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(6);
        fake.doctors = DOCTORS;
        fake.specialties = SPECIALTIES;
      },
    });
    await loaded();
    await screen.findByRole('option', { name: 'Nguyễn Minh Anh' });

    // Lần gọi ĐẦU TIÊN đã đúng (không có lần gọi mặc định "Hôm nay" rồi mới đổi)
    expect(listQueries(api)[0]).toMatchObject({
      trangThai: 'DaXacNhan',
      bacSiId: '5',
      chuyenKhoaId: '1',
      tuNgay: '2026-10-12',
      denNgay: '2026-10-18',
      page: '2',
    });
    expect(listQueries(api)[0]).not.toHaveProperty('q');
    expect(chip('Tuần này')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Hôm nay')).toHaveAttribute('aria-pressed', 'false');
    expect(select('Bác sĩ').value).toBe('5');
    expect(select('Chuyên khoa').value).toBe('1');
    expect(select('Trạng thái').value).toBe('DaXacNhan');
    expect(searchBox().value).toBe('');
  });

  it('UIF-16 URL trơn là mặc định của Figma: chip Hôm nay, mọi ô Tất cả, URL KHÔNG đổi khi tải xong', async () => {
    setNow(SUNDAY);
    const { api } = renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(3);
      },
    });
    await loaded();
    expect(chip('Hôm nay')).toHaveAttribute('aria-pressed', 'true');
    expect(lastListQuery(api)).toMatchObject({
      tuNgay: '2026-10-18',
      denNgay: '2026-10-18',
      page: '1',
    });
    expect(currentUrl()).toBe(LIST);
  });

  it('UIF-16 URL sai dạng (chip lạ, trạng thái lạ, id chữ, trang âm) ⇒ bỏ như không có; `q` trên URL KHÔNG được đọc; API không nhận giá trị sai', async () => {
    setNow(SUNDAY);
    const { api } = renderReceptionPage({
      entry: `${LIST}?khoang=hom-qua&trangThai=DangCho&bacSiId=abc&chuyenKhoaId=0&page=-1&q=0901234567`,
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(3);
      },
    });
    await loaded();
    const query = lastListQuery(api);
    expect(query).toMatchObject({
      tuNgay: '2026-10-18',
      denNgay: '2026-10-18',
      page: '1',
    });
    for (const key of ['trangThai', 'bacSiId', 'chuyenKhoaId', 'q']) {
      expect(query).not.toHaveProperty(key);
    }
    expect(chip('Hôm nay')).toHaveAttribute('aria-pressed', 'true');
    // Ô tìm KHÔNG lấy chữ từ URL
    expect(searchBox().value).toBe('');
  });

  it('UIF-16 đổi chip và ô chọn ghi lên URL (thay mục lịch sử), đổi bộ lọc thì về trang 1; bấm lại chip đang chọn không đổi URL và không gọi lại API', async () => {
    setNow(SUNDAY);
    const { api } = renderReceptionPage({
      entry: `${LIST}?page=3`,
      before: (fake) => {
        // Một dòng mỗi trang để trang 3 là trang CÓ THẬT (vượt trang cuối thì danh sách tự kéo về trang cuối)
        fake.appointments = makeReceptionAppointments(3);
        fake.pageSize = 1;
        fake.doctors = DOCTORS;
      },
    });
    await loaded();
    await screen.findByRole('option', { name: 'Nguyễn Minh Anh' });
    expect(currentUrl()).toBe(`${LIST}?page=3`);

    fireEvent.click(chip('Tuần này'));
    await waitFor(() => expect(currentUrl()).toBe(`${LIST}?khoang=tuan-nay`));
    // Đổi chip về trang 1: `page=3` đã bỏ khỏi URL
    expect(lastListQuery(api)).toMatchObject({
      tuNgay: '2026-10-12',
      denNgay: '2026-10-18',
      page: '1',
    });

    fireEvent.change(select('Bác sĩ'), { target: { value: '5' } });
    await waitFor(() =>
      expect(currentUrl()).toBe(`${LIST}?khoang=tuan-nay&bacSiId=5`),
    );
    fireEvent.change(select('Trạng thái'), { target: { value: 'VangMat' } });
    await waitFor(() =>
      expect(currentUrl()).toBe(
        `${LIST}?khoang=tuan-nay&trangThai=VangMat&bacSiId=5`,
      ),
    );

    // Bấm lại chip đang chọn: không đổi URL, không gọi lại API
    const calls = listQueries(api).length;
    fireEvent.click(chip('Tuần này'));
    expect(currentUrl()).toBe(
      `${LIST}?khoang=tuan-nay&trangThai=VangMat&bacSiId=5`,
    );
    expect(listQueries(api)).toHaveLength(calls);

    // `Hôm nay` là mặc định nên KHÔNG ghi khoá `khoang`
    fireEvent.click(chip('Hôm nay'));
    await waitFor(() =>
      expect(currentUrl()).toBe(`${LIST}?trangThai=VangMat&bacSiId=5`),
    );
  });

  it('UIF-16 chuyển trang ghi `page` lên URL (trang 1 không ghi); `Xóa lọc` đưa URL về trơn, ô tìm về trống', async () => {
    setNow(SUNDAY);
    const { api } = renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(5);
        fake.pageSize = 2;
      },
    });
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /Trang sau|Sau/ }));
    await waitFor(() => expect(currentUrl()).toBe(`${LIST}?page=2`));
    expect(lastListQuery(api)).toMatchObject({ page: '2' });

    fireEvent.click(chip('Ngày mai'));
    await waitFor(() => expect(currentUrl()).toBe(`${LIST}?khoang=ngay-mai`));
    typeSearch('Người');
    fireEvent.keyDown(searchBox(), { key: 'Enter' });
    await waitFor(() =>
      expect(lastListQuery(api)).toMatchObject({ q: 'Người' }),
    );
    // `q` không lên URL
    expect(currentUrl()).toBe(`${LIST}?khoang=ngay-mai`);

    fireEvent.click(
      screen.getByRole('button', { name: LIST_TEXT.clearFilters }),
    );
    await waitFor(() => expect(currentUrl()).toBe(LIST));
    expect(searchBox().value).toBe('');
    expect(chip('Hôm nay')).toHaveAttribute('aria-pressed', 'true');
  });

  it('UIF-16 Khoảng ngày: ngày hợp lệ ghi `khoang`, `tuNgay`, `denNgay` lên URL; ngày sai thứ tự KHÔNG đổi URL và không gọi API; ngày của chip khác bị bỏ khỏi URL', async () => {
    setNow(SUNDAY);
    const { api } = renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(2);
      },
    });
    await loaded();
    fireEvent.click(chip('Khoảng ngày'));
    await waitFor(() =>
      expect(currentUrl()).toBe(`${LIST}?khoang=khoang-ngay`),
    );
    fireEvent.change(screen.getByLabelText('Từ ngày'), {
      target: { value: '2026-10-20' },
    });
    await waitFor(() =>
      expect(currentUrl()).toBe(`${LIST}?khoang=khoang-ngay&tuNgay=2026-10-20`),
    );
    const calls = listQueries(api).length;
    // Đến ngày trước Từ ngày: chưa áp dụng, URL và truy vấn giữ nguyên
    fireEvent.change(screen.getByLabelText('Đến ngày'), {
      target: { value: '2026-10-19' },
    });
    expect(currentUrl()).toBe(`${LIST}?khoang=khoang-ngay&tuNgay=2026-10-20`);
    expect(listQueries(api)).toHaveLength(calls);
    fireEvent.change(screen.getByLabelText('Đến ngày'), {
      target: { value: '2026-10-21' },
    });
    await waitFor(() =>
      expect(currentUrl()).toBe(
        `${LIST}?khoang=khoang-ngay&tuNgay=2026-10-20&denNgay=2026-10-21`,
      ),
    );
    expect(lastListQuery(api)).toMatchObject({
      tuNgay: '2026-10-20',
      denNgay: '2026-10-21',
    });

    // Sang chip khác: ngày không còn trên URL
    fireEvent.click(chip('Tuần này'));
    await waitFor(() => expect(currentUrl()).toBe(`${LIST}?khoang=tuan-nay`));
  });
});

describe('bấm lại chip đang chọn', () => {
  it('UIF-16 bấm lại chip `Khoảng ngày` đang chọn KHÔNG xoá khoảng ngày đã áp dụng (URL và truy vấn giữ nguyên, không gọi lại API); bấm chip khác rồi quay lại `Khoảng ngày` thì khoảng bắt đầu trống', async () => {
    setNow(SUNDAY);
    const { api } = renderReceptionPage({
      entry: `${LIST}?khoang=khoang-ngay&tuNgay=2026-10-01&denNgay=2026-10-31`,
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(2);
      },
    });
    await loaded();
    const range = `${LIST}?khoang=khoang-ngay&tuNgay=2026-10-01&denNgay=2026-10-31`;
    expect(currentUrl()).toBe(range);
    expect(screen.getByLabelText('Từ ngày')).toHaveValue('01/10/2026');

    const calls = listQueries(api).length;
    fireEvent.click(chip('Khoảng ngày'));
    expect(currentUrl()).toBe(range);
    expect(screen.getByLabelText('Từ ngày')).toHaveValue('01/10/2026');
    expect(listQueries(api)).toHaveLength(calls);

    // Sang chip khác rồi quay lại: khoảng cũ không được giữ (URL chỉ lưu ngày của chip `Khoảng ngày` đang chọn, như Bác sĩ F11)
    fireEvent.click(chip('Ngày mai'));
    await waitFor(() => expect(currentUrl()).toBe(`${LIST}?khoang=ngay-mai`));
    fireEvent.click(chip('Khoảng ngày'));
    await waitFor(() =>
      expect(currentUrl()).toBe(`${LIST}?khoang=khoang-ngay`),
    );
    expect(screen.getByLabelText('Từ ngày')).toHaveValue('');
  });
});

describe('quay lại danh sách từ trang chi tiết', () => {
  it('UIF-17 bấm `Chi tiết` ⇒ trang chi tiết; `Quay lại danh sách` ⇒ danh sách với ĐÚNG bộ lọc trên URL và cùng truy vấn; `q` đã gõ KHÔNG được mang theo', async () => {
    setNow(SUNDAY);
    const { api } = renderReceptionPage({
      entry: `${LIST}?khoang=tuan-nay&bacSiId=5`,
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(3);
        fake.doctors = DOCTORS;
      },
    });
    await loaded();
    typeSearch('0900000002');
    fireEvent.keyDown(searchBox(), { key: 'Enter' });
    await waitFor(() =>
      expect(lastListQuery(api)).toMatchObject({ q: '0900000002' }),
    );
    expect(currentUrl()).toBe(`${LIST}?khoang=tuan-nay&bacSiId=5`);

    const code = 'CP20261018002';
    fireEvent.click(detailLink(code));
    // Trang chi tiết hiện, URL là đường dẫn chi tiết (mã trên đường dẫn)
    await screen.findByRole('heading', { name: DETAIL_TEXT.sections.patient });
    expect(currentUrl()).toBe(receptionAppointmentDetailPath(code));
    expect(
      screen.getByRole('heading', { level: 1, name: DETAIL_TEXT.title }),
    ).toBeInTheDocument();
    // Danh sách KHÔNG còn mount cùng trang chi tiết (F8, F9: ngăn nằm trên danh sách)
    expect(
      screen.queryByRole('region', { name: LIST_TEXT.resultsRegion }),
    ).toBeNull();

    // Liên kết quay lại mang bộ lọc không cá nhân, KHÔNG có `q`
    const back = screen.getByRole('link', { name: DETAIL_TEXT.back });
    expect(back).toHaveAttribute('href', `${LIST}?khoang=tuan-nay&bacSiId=5`);
    const before = listQueries(api).length;
    fireEvent.click(back);
    await loaded();
    expect(currentUrl()).toBe(`${LIST}?khoang=tuan-nay&bacSiId=5`);
    expect(chip('Tuần này')).toHaveAttribute('aria-pressed', 'true');
    // Danh sách dựng lại và tự tải đúng bộ lọc cũ; `q` mất (nếp F10, F11)
    expect(listQueries(api).length).toBeGreaterThan(before);
    expect(lastListQuery(api)).toMatchObject({
      tuNgay: '2026-10-12',
      denNgay: '2026-10-18',
      bacSiId: '5',
    });
    expect(lastListQuery(api)).not.toHaveProperty('q');
    expect(searchBox().value).toBe('');
  });

  it('UIF-17 vào thẳng đường dẫn chi tiết (không có trạng thái điều hướng) ⇒ liên kết quay lại về danh sách TRƠN', async () => {
    renderReceptionPage({
      entry: receptionAppointmentDetailPath('CP20261018001'),
    });
    await screen.findByRole('heading', { name: DETAIL_TEXT.sections.patient });
    expect(
      screen.getByRole('link', { name: DETAIL_TEXT.back }),
    ).toHaveAttribute('href', LIST);
  });

  it('UIF-17 `listSearch` sai dạng trong lịch sử trình duyệt (không bắt đầu bằng `?`) bị bỏ ⇒ liên kết quay lại về danh sách TRƠN', async () => {
    renderReceptionPage({
      entry: {
        pathname: receptionAppointmentDetailPath('CP20261018001'),
        state: { listSearch: 'bacSiId=5&q=0901234567' },
      },
    });
    await screen.findByRole('heading', { name: DETAIL_TEXT.sections.patient });
    expect(
      screen.getByRole('link', { name: DETAIL_TEXT.back }),
    ).toHaveAttribute('href', LIST);
  });

  it('UIF-17 mã lịch có ký tự đặc biệt được mã hoá trên đường dẫn chi tiết và liên kết `Chi tiết`', async () => {
    renderReceptionPage({
      before: (fake) => {
        fake.appointments = [
          ...makeReceptionAppointments(1).map((row) => ({
            ...row,
            maLichHen: 'CP 2026/10?x',
          })),
        ];
      },
    });
    await loaded();
    const row = within(
      screen.getByRole('region', { name: LIST_TEXT.resultsRegion }),
    ).getAllByRole('row')[1];
    expect(within(row).getByRole('link')).toHaveAttribute(
      'href',
      '/le-tan/quan-ly-lich-hen/CP%202026%2F10%3Fx',
    );
  });
});
