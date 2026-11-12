import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chip,
  cleanUpReceptionPage,
  lastListQuery,
  listQueries,
  loaded,
  renderReceptionPage,
  rowCodes,
  select,
} from '../../testing/reception-harness';
import { jsonResponse } from '../../testing/fake-appointment-list-api';
import {
  makeReceptionAppointment,
  makeReceptionAppointments,
} from '../../testing/fake-reception-api';
import { LIST_TEXT } from './list-messages';

// booking F8: trang "Quản lý lịch hẹn" của Lễ tân với API giả (không gọi backend thật). Mã LTL là [đề xuất] (PLAN booking mục 7.34); LTN-01 (chip ngày, lọc, nút theo
// `chuyenDuoc[]`) là tổng của LTL-01…LTL-04, LTL-13 và LTC-02. Dữ liệu giả. Bộ lọc, ô tìm và ngày ở `reception-list-filters.test.tsx`; lỗi và riêng tư ở
// `reception-list-errors.test.tsx`; ngăn chi tiết ở `detail/`.
afterEach(cleanUpReceptionPage);

// 10:00 ngày 18/10/2026 (Chủ nhật) giờ Việt Nam. Chỉ giả `Date`: hẹn giờ thật vẫn chạy, nên `findBy` và `waitFor` dùng được
const NOW = '2026-10-18T03:00:00.000Z';
function setNow(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

const headerNames = () =>
  within(screen.getByRole('region', { name: LIST_TEXT.resultsRegion }))
    .getAllByRole('columnheader')
    .map((header) => header.textContent);

describe('danh sách: tải đầu, bảng, dòng đếm', () => {
  it('LTL-01 tải đầu: chip Hôm nay đang chọn, GET một lần với tuNgay = denNgay = hôm nay (giờ Việt Nam), tiêu đề và phụ đề đúng Figma, chỉ GET', async () => {
    setNow(NOW);
    const { api } = renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(3);
      },
    });
    await loaded();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Quản lý lịch hẹn' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Tra cứu, theo dõi và xử lý lịch hẹn của bệnh nhân'),
    ).toBeInTheDocument();
    expect(listQueries(api)).toEqual([
      { page: '1', tuNgay: '2026-10-18', denNgay: '2026-10-18' },
    ]);
    expect(chip('Hôm nay')).toHaveAttribute('aria-pressed', 'true');
    for (const other of ['Ngày mai', 'Tuần này', 'Khoảng ngày']) {
      expect(chip(other)).toHaveAttribute('aria-pressed', 'false');
    }
    expect(rowCodes()).toEqual([
      'CP20261018001',
      'CP20261018002',
      'CP20261018003',
    ]);
    // Lễ tân chỉ ĐỌC ở F8: không lời gọi nào khác GET
    expect(api.writes()).toEqual([]);
  });

  it('LTL-14 bảng: tiêu đề cột đúng Figma, không cột `Kênh` hay thanh toán, hàng chỉ có `Chi tiết` (không `Thu tiền`, `Tiếp đón`), không thẻ lọc kèm số đếm', async () => {
    setNow(NOW);
    renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(6);
      },
    });
    await loaded();

    expect(headerNames()).toEqual([
      'Mã lịch',
      'Ngày & Giờ',
      'Bệnh nhân',
      'Bác sĩ / Chuyên khoa',
      'Trạng thái',
      'Thao tác',
    ]);
    expect(screen.queryByText('Kênh')).toBeNull();
    expect(screen.queryByText(/Online|Tại quầy/)).toBeNull();

    const rows = within(
      screen.getByRole('region', { name: LIST_TEXT.resultsRegion }),
    )
      .getAllByRole('row')
      .slice(1);
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      const buttons = within(row).getAllByRole('button');
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveAccessibleName(/^Chi tiết lịch hẹn CP\d+$/);
    }
    expect(
      screen.queryByRole('button', { name: /Thu tiền|Tiếp đón/ }),
    ).toBeNull();
    // B3 không trả `demTheoTrangThai`: không thẻ lọc trạng thái kèm số đếm (nút nào có tên là một trạng thái và một số)
    expect(screen.queryByRole('button', { name: /^Tất cả \d+$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /\w \d+$/ })).toBeNull();
  });

  it('LTL-14 dòng đếm góc phải LUÔN là `total` của API, không đếm lại `items`', async () => {
    setNow(NOW);
    renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(5);
        fake.pageSize = 2;
      },
    });
    await loaded();
    expect(rowCodes()).toHaveLength(2);
    expect(screen.getByText('5 lịch hẹn')).toBeInTheDocument();
    expect(screen.queryByText('2 lịch hẹn')).toBeNull();
  });

  it('LTL-14 ô "Ngày & Giờ": giờ rồi ngày ngắn theo NGÀY giờ Việt Nam (17:30 UTC đã là 00:30 hôm sau); mã trạng thái lạ hiện "Chưa xác định"', async () => {
    setNow(NOW);
    renderReceptionPage({
      before: (fake) => {
        fake.appointments = [
          makeReceptionAppointment({
            maLichHen: 'CP20261018001',
            thoiGian: '2026-10-18T01:00:00.000Z',
          }),
          makeReceptionAppointment({
            maLichHen: 'CP20261018002',
            thoiGian: '2026-10-17T17:30:00.000Z',
            trangThai: 'MaTrangThaiLa',
          }),
        ];
      },
    });
    await loaded();
    const [first, second] = within(
      screen.getByRole('region', { name: LIST_TEXT.resultsRegion }),
    )
      .getAllByRole('row')
      .slice(1);
    expect(first).toHaveTextContent('08:00');
    expect(first).toHaveTextContent('18/10');
    expect(first).toHaveTextContent('Đã xác nhận');
    expect(second).toHaveTextContent('00:30');
    expect(second).toHaveTextContent('18/10');
    expect(second).toHaveTextContent('Chưa xác định');
    expect(second).not.toHaveTextContent('MaTrangThaiLa');
  });

  it('LTL-15 cột Bệnh nhân: người khám, SĐT người đặt; người khám khác người đặt thì thêm "Đặt bởi", cùng một người thì không', async () => {
    setNow(NOW);
    renderReceptionPage({
      before: (fake) => {
        fake.appointments = [
          makeReceptionAppointment({
            maLichHen: 'CP20261018001',
            nguoiKham: { hoTen: 'Bùi Minh Khoa', laBanThan: false },
            nguoiDat: { hoTen: 'Lê Thị M', soDienThoai: '0912345678' },
          }),
          makeReceptionAppointment({
            maLichHen: 'CP20261018002',
            nguoiKham: { hoTen: 'Nguyễn Văn A', laBanThan: true },
            nguoiDat: { hoTen: 'Nguyễn Văn A', soDienThoai: '0901234567' },
          }),
        ];
      },
    });
    await loaded();
    const [relative, own] = within(
      screen.getByRole('region', { name: LIST_TEXT.resultsRegion }),
    )
      .getAllByRole('row')
      .slice(1);
    expect(relative).toHaveTextContent('Bùi Minh Khoa');
    expect(relative).toHaveTextContent('0912345678');
    expect(relative).toHaveTextContent('Đặt bởi Lê Thị M');
    expect(own).toHaveTextContent('Nguyễn Văn A');
    expect(own).toHaveTextContent('0901234567');
    expect(own).not.toHaveTextContent('Đặt bởi');
  });
});

describe('danh sách: chuyển trang, giữ dữ liệu cũ, rỗng', () => {
  it('LTL-07 chuyển trang: Trước và Sau, Trang X / Y, vô hiệu ở biên; chỉ hiện từ hai trang', async () => {
    renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(5);
        fake.pageSize = 2;
      },
    });
    await loaded();
    expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() =>
      expect(rowCodes()).toEqual(['CP20261018003', 'CP20261018004']),
    );
    expect(screen.getByText('Trang 2 / 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(rowCodes()).toEqual(['CP20261018005']));
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  });

  it('LTL-07 một trang thì không có thanh chuyển trang', async () => {
    renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(2);
      },
    });
    await loaded();
    expect(
      screen.queryByRole('navigation', { name: 'Phân trang lịch hẹn' }),
    ).toBeNull();
  });

  it('LTL-07 trang vượt cuối mà total còn lớn (lịch bị huỷ ở nơi khác) ⇒ tự về trang cuối còn dữ liệu, không kẹt ở bảng rỗng', async () => {
    const { api } = renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(5);
        fake.pageSize = 2;
      },
    });
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() =>
      expect(rowCodes()).toEqual(['CP20261018003', 'CP20261018004']),
    );

    // Trang 3 nay rỗng nhưng total vẫn 4 (còn đúng hai trang)
    api.failNext('list', () =>
      jsonResponse({ items: [], total: 4, page: 3, pageSize: 2 }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(lastListQuery(api)?.page).toBe('2'));
    await waitFor(() => expect(rowCodes()).toHaveLength(2));
    expect(screen.queryByText(LIST_TEXT.noInRange)).toBeNull();
  });

  it('LTL-08 đổi chip: bảng của truy vấn trước vẫn hiện (aria-busy) tới khi truy vấn mới về, KHÔNG quay lại "Đang tải"', async () => {
    const { api } = renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(4);
      },
    });
    await loaded();
    const before = rowCodes();
    expect(before).toHaveLength(4);

    let release: () => void = () => {};
    api.failNext(
      'list',
      () =>
        new Promise<Response>((resolve) => {
          release = () =>
            resolve(
              jsonResponse({
                items: [
                  makeReceptionAppointment({ maLichHen: 'CP20261019001' }),
                ],
                total: 1,
                page: 1,
                pageSize: 20,
              }),
            );
        }),
    );
    fireEvent.click(chip('Ngày mai'));

    await waitFor(() =>
      expect(
        screen
          .getByRole('region', { name: LIST_TEXT.resultsRegion })
          .closest('[aria-busy]'),
      ).toHaveAttribute('aria-busy', 'true'),
    );
    expect(rowCodes()).toEqual(before);
    expect(screen.queryByText(LIST_TEXT.loading)).toBeNull();

    release();
    await waitFor(() => expect(rowCodes()).toEqual(['CP20261019001']));
    expect(
      screen
        .getByRole('region', { name: LIST_TEXT.resultsRegion })
        .closest('[aria-busy]'),
    ).toHaveAttribute('aria-busy', 'false');
  });

  it('LTL-06 đổi chip, trạng thái, bác sĩ về trang 1 (đang ở trang 2)', async () => {
    const { api } = renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(5);
        fake.pageSize = 2;
        fake.doctors = {
          items: [{ bacSiId: '5', hoTen: 'Nguyễn Minh Anh' }],
          total: 1,
          page: 1,
          pageSize: 100,
        };
      },
    });
    await loaded();
    await screen.findByRole('option', { name: 'Nguyễn Minh Anh' });

    const toSecondPage = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
      await waitFor(() => expect(lastListQuery(api)?.page).toBe('2'));
    };
    await toSecondPage();
    fireEvent.click(chip('Ngày mai'));
    await waitFor(() => expect(lastListQuery(api)?.page).toBe('1'));

    await toSecondPage();
    fireEvent.change(select('Trạng thái'), { target: { value: 'DaXacNhan' } });
    await waitFor(() => expect(lastListQuery(api)?.page).toBe('1'));
    expect(lastListQuery(api)?.trangThai).toBe('DaXacNhan');

    fireEvent.change(select('Trạng thái'), { target: { value: '' } });
    // Kết quả lọc một trạng thái chỉ có một dòng (không có trang 2): đợi danh sách đầy đủ về rồi mới sang trang 2
    await waitFor(() => expect(rowCodes()).toHaveLength(2));
    await toSecondPage();
    fireEvent.change(select('Bác sĩ'), { target: { value: '5' } });
    await waitFor(() => expect(lastListQuery(api)?.page).toBe('1'));
    expect(lastListQuery(api)?.bacSiId).toBe('5');
  });

  it('LTL-09 rỗng có hai câu khác nhau: chỉ chip ngày ⇒ "không có lịch trong khoảng ngày"; có bộ lọc khác ⇒ "không khớp bộ lọc" kèm `Xóa lọc`', async () => {
    renderReceptionPage({
      before: (fake) => {
        fake.appointments = [];
      },
    });
    expect(await screen.findByText(LIST_TEXT.noInRange)).toBeInTheDocument();
    expect(screen.getByText('0 lịch hẹn')).toBeInTheDocument();
    // Chỉ có chip mặc định: không có nút `Xóa lọc`
    expect(screen.queryByRole('button', { name: 'Xóa lọc' })).toBeNull();

    fireEvent.change(select('Trạng thái'), { target: { value: 'VangMat' } });
    expect(await screen.findByText(LIST_TEXT.noMatch)).toBeInTheDocument();
    expect(screen.queryByText(LIST_TEXT.noInRange)).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Xóa lọc' })).toHaveLength(2);
  });

  it('LTL-16 `Xóa lọc` đưa chip, ba ô chọn và ô tìm về mặc định bằng MỘT lần gọi; biến mất khi đã mặc định', async () => {
    const { api } = renderReceptionPage({
      before: (fake) => {
        fake.appointments = makeReceptionAppointments(3);
      },
    });
    await loaded();
    expect(screen.queryByRole('button', { name: 'Xóa lọc' })).toBeNull();

    fireEvent.click(chip('Tuần này'));
    fireEvent.change(select('Trạng thái'), { target: { value: 'DaXacNhan' } });
    await waitFor(() =>
      expect(lastListQuery(api)?.trangThai).toBe('DaXacNhan'),
    );
    await waitFor(() => expect(rowCodes()).toHaveLength(1));

    const calls = listQueries(api).length;
    fireEvent.click(screen.getByRole('button', { name: 'Xóa lọc' }));
    await waitFor(() => expect(listQueries(api)).toHaveLength(calls + 1));
    const query = lastListQuery(api);
    expect(query).not.toHaveProperty('trangThai');
    expect(query).toMatchObject({ page: '1' });
    expect(chip('Hôm nay')).toHaveAttribute('aria-pressed', 'true');
    expect(select('Trạng thái')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Xóa lọc' })).toBeNull();
  });
});
