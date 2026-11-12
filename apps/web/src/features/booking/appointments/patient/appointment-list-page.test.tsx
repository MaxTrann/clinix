import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  jsonResponse,
  makeAppointment,
  makeAppointments,
} from '../../testing/fake-appointment-list-api';
import {
  LIST_PATH,
  cleanUpListPage,
  currentUrl,
  field,
  lastListQuery,
  listQueries,
  loaded,
  renderListPage,
  rowCodes,
  searchBox,
  tab,
  typeSearch,
} from '../../testing/appointment-list-harness';
import { LIST_TEXT } from './list-messages';

// booking F1: trang "Lịch hẹn của tôi" với API giả (không gọi backend thật). Mã LHL là [đề xuất] (PLAN booking mục 7.31 sau khi duyệt); LH-01 là
// tổng của các mã này. Dữ liệu giả. Bộ lọc, ô tìm, lỗi, router ở các file cạnh: `appointment-list-filters`, `-errors`, `-routing`.
afterEach(cleanUpListPage);

const DOCTORS = {
  items: [
    { bacSiId: '5', hoTen: 'Nguyễn Minh Anh' },
    { bacSiId: '8', hoTen: 'Lê Thảo Vy' },
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
const RELATIVES = {
  items: [
    {
      hoSoNguoiThanId: '12',
      hoTen: 'Lê Minh D',
      trangThaiHieuLuc: true,
    },
  ],
};

describe('thẻ lọc có số đếm và chip trạng thái', () => {
  it('LHL-01 số đếm từng thẻ lấy từ demTheoTrangThai; `Tất cả` là tổng sáu số; số 0 vẫn hiện', async () => {
    renderListPage({
      before: (api) => {
        api.appointments = [
          makeAppointment({ maLichHen: 'CP1', trangThai: 'ChoThanhToan' }),
          makeAppointment({ maLichHen: 'CP2', trangThai: 'DaXacNhan' }),
          makeAppointment({ maLichHen: 'CP3', trangThai: 'DaXacNhan' }),
          makeAppointment({ maLichHen: 'CP4', trangThai: 'HoanThanh' }),
          makeAppointment({ maLichHen: 'CP5', trangThai: 'HoanThanh' }),
          makeAppointment({ maLichHen: 'CP6', trangThai: 'HoanThanh' }),
        ];
      },
    });
    await loaded();

    for (const name of [
      'Tất cả 6',
      'Chờ thanh toán 1',
      'Đã xác nhận 2',
      'Đã tiếp đón 0',
      'Hoàn thành 3',
      'Đã hủy 0',
      'Vắng mặt 0',
    ]) {
      expect(tab(name)).toBeInTheDocument();
    }
    expect(screen.getByText('Hiển thị 6 / 6 lịch hẹn')).toBeInTheDocument();
  });

  // Đột biến "tự đếm từ items": phản hồi cố ý cho số đếm KHÁC những gì đếm được từ `items` (một dòng, nhưng nơi khác còn nhiều lịch)
  it('LHL-01 số đếm KHÔNG đếm lại từ `items`: giao diện theo demTheoTrangThai dù `items` chỉ có một dòng', async () => {
    renderListPage({
      before: (api) => {
        api.failNext('list', () =>
          jsonResponse({
            items: [makeAppointment({ trangThai: 'HoanThanh' })],
            total: 1,
            page: 1,
            pageSize: 20,
            demTheoTrangThai: {
              ChoThanhToan: 7,
              DaXacNhan: 0,
              DaTiepDon: 0,
              HoanThanh: 5,
              DaHuy: 0,
              VangMat: 2,
            },
          }),
        );
      },
    });
    await loaded();

    expect(tab('Tất cả 14')).toBeInTheDocument();
    expect(tab('Chờ thanh toán 7')).toBeInTheDocument();
    expect(tab('Hoàn thành 5')).toBeInTheDocument();
    expect(tab('Vắng mặt 2')).toBeInTheDocument();
    expect(screen.getByText('Hiển thị 1 / 1 lịch hẹn')).toBeInTheDocument();
  });

  it('LHL-02 mỗi dòng có chip đúng chữ của trạng thái; mã lạ và `DaDoiLich` hiện "Chưa xác định", không lộ mã thô', async () => {
    renderListPage({
      before: (api) => {
        api.appointments = [
          ...['ChoThanhToan', 'DaXacNhan', 'DaTiepDon', 'HoanThanh'].map(
            (trangThai, index) =>
              makeAppointment({ maLichHen: `CP10${index}`, trangThai }),
          ),
          makeAppointment({ maLichHen: 'CP104', trangThai: 'DaHuy' }),
          makeAppointment({ maLichHen: 'CP105', trangThai: 'VangMat' }),
          makeAppointment({ maLichHen: 'CP106', trangThai: 'DaDoiLich' }),
          makeAppointment({ maLichHen: 'CP107', trangThai: 'MaLaXyz' }),
        ];
      },
    });
    const table = within(await loaded());

    for (const label of [
      'Chờ thanh toán',
      'Đã xác nhận',
      'Đã tiếp đón',
      'Hoàn thành',
      'Đã hủy',
      'Vắng mặt',
    ]) {
      expect(table.getAllByText(label)).toHaveLength(1);
    }
    expect(table.getAllByText('Chưa xác định')).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/DaDoiLich|MaLaXyz/);
  });

  it('LHL-03 chọn thẻ ⇒ gửi `trangThai=<mã>` (một khoá) và `page=1`, thẻ có aria-pressed; `Tất cả` ⇒ không `trangThai`', async () => {
    const { api } = renderListPage({
      before: (fake) => {
        fake.appointments = makeAppointments(12);
      },
    });
    await loaded();
    expect(tab('Tất cả 12')).toHaveAttribute('aria-pressed', 'true');
    expect(lastListQuery(api)).toEqual({ page: '1' });

    fireEvent.click(tab(/^Hoàn thành/));
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({ page: '1', trangThai: 'HoanThanh' }),
    );
    await waitFor(() => expect(rowCodes()).toHaveLength(2));
    expect(tab(/^Hoàn thành/)).toHaveAttribute('aria-pressed', 'true');
    expect(tab(/^Tất cả/)).toHaveAttribute('aria-pressed', 'false');
    // Số đếm không đổi khi chọn thẻ: B1 áp mọi bộ lọc TRỪ trạng thái
    expect(tab('Tất cả 12')).toBeInTheDocument();

    fireEvent.click(tab(/^Tất cả/));
    await waitFor(() => expect(lastListQuery(api)).toEqual({ page: '1' }));
    await waitFor(() => expect(rowCodes()).toHaveLength(12));
  });
});

describe('đổi bộ lọc về trang 1', () => {
  const CHANGES: [string, () => void][] = [
    ['thẻ lọc', () => fireEvent.click(tab(/^Hoàn thành/))],
    [
      'người khám',
      () =>
        fireEvent.change(field('Người khám'), { target: { value: 'BanThan' } }),
    ],
    [
      'bác sĩ',
      () => fireEvent.change(field('Bác sĩ'), { target: { value: '5' } }),
    ],
    [
      'chuyên khoa',
      () => fireEvent.change(field('Chuyên khoa'), { target: { value: '1' } }),
    ],
    [
      'từ ngày',
      () =>
        fireEvent.change(field('Từ ngày'), { target: { value: '2026-10-01' } }),
    ],
    [
      'đến ngày',
      () =>
        fireEvent.change(field('Đến ngày'), {
          target: { value: '2026-10-31' },
        }),
    ],
    [
      'từ khoá (Enter)',
      () => {
        typeSearch('nguyen');
        fireEvent.keyDown(searchBox(), { key: 'Enter' });
      },
    ],
  ];

  it.each(CHANGES)(
    'LHL-04 đang ở trang 3, đổi %s ⇒ yêu cầu kế tiếp là page=1',
    async (_name, change) => {
      const { api } = renderListPage({
        before: (fake) => {
          fake.appointments = makeAppointments(12);
          fake.pageSize = 2;
          fake.doctors = DOCTORS;
          fake.specialties = SPECIALTIES;
        },
      });
      await loaded();
      await screen.findByRole('option', { name: 'Nguyễn Minh Anh' });
      await screen.findByRole('option', { name: 'Tim mạch' });
      fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
      await screen.findByText('Trang 2 / 6');
      fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
      await screen.findByText('Trang 3 / 6');

      change();
      await waitFor(() =>
        expect(listQueries(api).map((query) => query.page)).toEqual([
          '1',
          '2',
          '3',
          '1',
        ]),
      );
    },
  );
});

describe('giữ dữ liệu cũ khi đổi trang hay bộ lọc', () => {
  it('LHL-05 lần tải ĐẦU hiện khung "Đang tải", chưa có thẻ lọc hay bảng', () => {
    renderListPage({
      before: (api) => api.failNext('list', () => new Promise(() => {})),
    });

    expect(screen.getByText(LIST_TEXT.loading)).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Lọc theo trạng thái' }),
    ).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('LHL-05 đổi trang: bảng và số đếm của trang trước vẫn hiện (aria-busy) tới khi trang mới về, KHÔNG quay lại "Đang tải"', async () => {
    const { api } = renderListPage({
      before: (fake) => {
        fake.appointments = makeAppointments(4);
        fake.pageSize = 2;
      },
    });
    await loaded();
    const firstPage = rowCodes();
    expect(firstPage).toEqual(['CP20261000001', 'CP20261000002']);

    // Trang 2 treo cho tới khi `release()`
    const secondPage = await (
      await api.fetch('/api/patient/appointments?page=2')
    ).json();
    let release: () => void = () => {};
    api.failNext(
      'list',
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(jsonResponse(secondPage));
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));

    await waitFor(() =>
      expect(
        screen
          .getByRole('region', { name: LIST_TEXT.resultsRegion })
          .closest('[aria-busy]'),
      ).toHaveAttribute('aria-busy', 'true'),
    );
    expect(rowCodes()).toEqual(firstPage);
    expect(screen.queryByText(LIST_TEXT.loading)).toBeNull();
    expect(tab('Tất cả 4')).toBeInTheDocument();

    release();
    await waitFor(() =>
      expect(rowCodes()).toEqual(['CP20261000003', 'CP20261000004']),
    );
    expect(
      screen
        .getByRole('region', { name: LIST_TEXT.resultsRegion })
        .closest('[aria-busy]'),
    ).toHaveAttribute('aria-busy', 'false');
  });

  it('LHL-05 đổi thẻ lọc: dòng và thẻ của truy vấn trước vẫn hiện khi yêu cầu mới còn treo', async () => {
    const { api } = renderListPage({
      before: (fake) => {
        fake.appointments = makeAppointments(6);
      },
    });
    await loaded();
    const before = rowCodes();

    api.failNext('list', () => new Promise(() => {}));
    fireEvent.click(tab(/^Hoàn thành/));
    await waitFor(() =>
      expect(lastListQuery(api)).toEqual({ page: '1', trangThai: 'HoanThanh' }),
    );

    expect(rowCodes()).toEqual(before);
    expect(screen.queryByText(LIST_TEXT.loading)).toBeNull();
    expect(tab('Tất cả 6')).toBeInTheDocument();
  });
});

describe('rỗng, chuyển trang, trang vượt cuối', () => {
  it('LHL-09 chưa có lịch nào ⇒ câu "chưa có" kèm nút Đặt lịch khám (không có nút Xóa bộ lọc)', async () => {
    renderListPage({ before: (api) => (api.appointments = []) });

    expect(await screen.findByText(LIST_TEXT.noneYet)).toBeInTheDocument();
    expect(screen.queryByText(LIST_TEXT.noMatch)).toBeNull();
    expect(
      screen.queryByRole('button', { name: LIST_TEXT.clearFilters }),
    ).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Đặt lịch khám' })).toHaveLength(
      2,
    );
    expect(screen.getByText('Hiển thị 0 / 0 lịch hẹn')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('LHL-09 có lịch nhưng không khớp bộ lọc ⇒ câu "không khớp" kèm `Xóa bộ lọc`; bấm thì về mặc định, trang 1, có lại dòng', async () => {
    const { api } = renderListPage({
      before: (fake) => {
        fake.appointments = makeAppointments(3).map((row) => ({
          ...row,
          trangThai: 'DaXacNhan',
        }));
      },
    });
    await loaded();

    fireEvent.click(tab(/^Vắng mặt/));
    expect(await screen.findByText(LIST_TEXT.noMatch)).toBeInTheDocument();
    expect(screen.queryByText(LIST_TEXT.noneYet)).toBeNull();
    // Số đếm vẫn hiện: người dùng thấy có lịch ở thẻ khác
    expect(tab('Tất cả 3')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: LIST_TEXT.clearFilters }),
    );
    await waitFor(() => expect(rowCodes()).toHaveLength(3));
    expect(lastListQuery(api)).toEqual({ page: '1' });
    expect(tab(/^Tất cả/)).toHaveAttribute('aria-pressed', 'true');
  });

  it('LHL-09 tìm không ra ⇒ câu "không khớp"; `Xóa bộ lọc` xoá luôn chữ trong ô tìm', async () => {
    const { api } = renderListPage({
      before: (fake) => {
        fake.appointments = makeAppointments(3);
      },
    });
    await loaded();

    typeSearch('khong-co-ai');
    fireEvent.keyDown(searchBox(), { key: 'Enter' });
    expect(await screen.findByText(LIST_TEXT.noMatch)).toBeInTheDocument();
    expect(lastListQuery(api)).toEqual({ page: '1', q: 'khong-co-ai' });

    fireEvent.click(
      screen.getByRole('button', { name: LIST_TEXT.clearFilters }),
    );
    await waitFor(() => expect(rowCodes()).toHaveLength(3));
    expect(searchBox()).toHaveValue('');
    expect(lastListQuery(api)).toEqual({ page: '1' });
  });

  // [tổng lịch, cỡ trang, số trang]: biên `total` = 0, chia hết `pageSize`, dư 1, cỡ trang 1
  it.each([
    [7, 3, 3],
    [6, 3, 2],
    [4, 3, 2],
    [3, 3, 1],
    [3, 1, 3],
    [0, 3, 1],
  ])(
    'LHL-10 %i lịch, cỡ trang %i ⇒ %i trang: nhãn "Trang X / Y" đúng, chỉ hiện chuyển trang khi có từ hai trang',
    async (total, pageSize, pages) => {
      renderListPage({
        before: (api) => {
          api.appointments = makeAppointments(total);
          api.pageSize = pageSize;
        },
      });
      await screen.findByText(/Hiển thị \d+ \/ \d+ lịch hẹn/);

      if (pages === 1) {
        expect(
          screen.queryByRole('navigation', { name: LIST_TEXT.paginationLabel }),
        ).toBeNull();
        return;
      }
      expect(screen.getByText(`Trang 1 / ${pages}`)).toBeInTheDocument();
    },
  );

  it('LHL-10 Trước và Sau vô hiệu ở biên, gửi đúng `page`; dòng "Hiển thị X / Y" theo trang', async () => {
    const { api } = renderListPage({
      before: (fake) => {
        fake.appointments = makeAppointments(7);
        fake.pageSize = 3;
      },
    });
    await loaded();
    const previous = () => screen.getByRole('button', { name: 'Trang trước' });
    const next = () => screen.getByRole('button', { name: 'Trang sau' });

    expect(previous()).toBeDisabled();
    expect(next()).toBeEnabled();
    expect(screen.getByText('Hiển thị 3 / 7 lịch hẹn')).toBeInTheDocument();

    fireEvent.click(next());
    await screen.findByText('Trang 2 / 3');
    expect(lastListQuery(api)).toEqual({ page: '2' });
    expect(previous()).toBeEnabled();

    fireEvent.click(next());
    await screen.findByText('Trang 3 / 3');
    expect(lastListQuery(api)).toEqual({ page: '3' });
    expect(next()).toBeDisabled();
    expect(screen.getByText('Hiển thị 1 / 7 lịch hẹn')).toBeInTheDocument();

    fireEvent.click(previous());
    await screen.findByText('Trang 2 / 3');
    expect(lastListQuery(api)).toEqual({ page: '2' });
  });

  it('LHL-11 trang vượt cuối (200 rỗng, `total` > 0) ⇒ về trang cuối còn dữ liệu, đúng một yêu cầu thêm, không lặp', async () => {
    const { api } = renderListPage({
      before: (fake) => {
        fake.appointments = makeAppointments(7);
        fake.pageSize = 3;
      },
    });
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByText('Trang 2 / 3');

    // Lịch bị huỷ ở nơi khác: chỉ còn 4 lịch (2 trang) trong khi người dùng đang ở trang 2 và bấm sang trang 3
    api.appointments = makeAppointments(4);
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));

    await screen.findByText('Trang 2 / 2');
    await waitFor(() => expect(rowCodes()).toEqual(['CP20261000004']));
    expect(listQueries(api).map((query) => query.page)).toEqual([
      '1',
      '2',
      '3',
      '2',
    ]);
    // Không lặp: chờ thêm một nhịp rồi đếm lại
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(listQueries(api)).toHaveLength(4);
  });

  it('LHL-11 `total` = 0 ở trang xa ⇒ không sửa trang (chỉ hiện câu rỗng), không lặp', async () => {
    const { api } = renderListPage({
      before: (fake) => {
        fake.appointments = makeAppointments(7);
        fake.pageSize = 3;
      },
    });
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByText('Trang 2 / 3');

    api.appointments = [];
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByText(LIST_TEXT.noneYet)).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(listQueries(api).map((query) => query.page)).toEqual([
      '1',
      '2',
      '3',
    ]);
  });
});

describe('dòng lịch hẹn', () => {
  it('LHL-12 LHL-13 giờ Việt Nam, thứ và ngày như Figma; giá khám là chuỗi decimal định dạng "300.000đ"', async () => {
    renderListPage({
      before: (api) => {
        api.appointments = [
          makeAppointment({
            maLichHen: 'CP20261020001',
            thoiGian: '2026-10-20T01:00:00.000Z',
            giaSnapshot: '300000.00',
          }),
          makeAppointment({
            maLichHen: 'CP20261018001',
            // 17:30 UTC = 00:30 ngày hôm sau ở Việt Nam: Chủ nhật 18/10 là 2026-10-17T17:30Z
            thoiGian: '2026-10-17T17:30:00.000Z',
            giaSnapshot: '250000.00',
          }),
        ];
      },
    });
    const rows = within(await loaded())
      .getAllByRole('row')
      .slice(1);

    expect(within(rows[0]).getByText('Thứ 3, 20/10/2026')).toBeInTheDocument();
    expect(within(rows[0]).getByText('08:00')).toBeInTheDocument();
    expect(within(rows[0]).getByText('CP20261020001')).toBeInTheDocument();
    expect(within(rows[0]).getByText('300.000đ')).toBeInTheDocument();
    expect(
      within(rows[1]).getByText('Chủ nhật, 18/10/2026'),
    ).toBeInTheDocument();
    expect(within(rows[1]).getByText('00:30')).toBeInTheDocument();
    expect(within(rows[1]).getByText('250.000đ')).toBeInTheDocument();
  });

  it('LHL-14 người khám: `Bản thân` hoặc `Người thân` kèm họ tên; bác sĩ và chuyên khoa như API trả; khoá thừa của API không lọt ra màn hình', async () => {
    renderListPage({
      before: (api) => {
        api.appointments = [
          makeAppointment({
            maLichHen: 'CP1',
            nguoiKham: { hoTen: 'Nguyễn Văn A', laBanThan: true },
          }),
          {
            ...makeAppointment({
              maLichHen: 'CP2',
              bacSi: 'Lê Thảo Vy',
              chuyenKhoa: 'Nhi khoa',
              nguoiKham: { hoTen: 'Bùi Minh Khoa', laBanThan: false },
            }),
            lichHenId: 'LEAK-ID',
            soDienThoaiBacSi: 'LEAK-PHONE',
          },
        ];
      },
    });
    const rows = within(await loaded())
      .getAllByRole('row')
      .slice(1);

    expect(within(rows[0]).getByText('Bản thân')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Người thân')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Bùi Minh Khoa')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Lê Thảo Vy')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Nhi khoa')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('LEAK');
  });

  // Phần "Chi tiết vô hiệu" của LHL-24 hết hiệu lực khi F2 bật liên kết (thay bằng LCT-08 dưới đây); phần `Đặt lịch khám` giữ nguyên
  it('LHL-24 `Đặt lịch khám` trỏ /dat-lich', async () => {
    renderListPage({
      before: (api) => {
        api.appointments = makeAppointments(3);
      },
    });
    await loaded();

    expect(screen.getByRole('link', { name: 'Đặt lịch khám' })).toHaveAttribute(
      'href',
      '/dat-lich',
    );
  });

  it('LCT-08 nút `Chi tiết` là liên kết tới trang chi tiết của ĐÚNG lịch, tên truy cập kèm mã để phân biệt; mã có ký tự đặc biệt được mã hoá; không còn nút vô hiệu', async () => {
    renderListPage({
      before: (api) => {
        api.appointments = [
          ...makeAppointments(2),
          makeAppointment({ maLichHen: 'CP/X?1', trangThai: 'DaHuy' }),
        ];
      },
    });
    await loaded();

    const links = screen.getAllByRole('link', { name: /^Chi tiết/ });
    expect(links).toHaveLength(3);
    const rows = within(
      screen.getByRole('region', { name: LIST_TEXT.resultsRegion }),
    )
      .getAllByRole('row')
      .slice(1);
    expect(
      links.map((link) => [link.getAttribute('href'), link.textContent]),
    ).toEqual([
      [
        '/benh-nhan/lich-hen-cua-toi/CP20261000001',
        'Chi tiết lịch hẹn CP20261000001',
      ],
      [
        '/benh-nhan/lich-hen-cua-toi/CP20261000002',
        'Chi tiết lịch hẹn CP20261000002',
      ],
      ['/benh-nhan/lich-hen-cua-toi/CP%2FX%3F1', 'Chi tiết lịch hẹn CP/X?1'],
    ]);
    // Mỗi liên kết nằm đúng ở dòng của lịch đó, và tên truy cập của chúng khác nhau
    links.forEach((link, index) => expect(rows[index]).toContainElement(link));
    expect(new Set(links.map((link) => link.getAttribute('href'))).size).toBe(
      3,
    );
    expect(screen.queryByRole('button', { name: /^Chi tiết/ })).toBeNull();
  });
});

describe('chỉ đọc, trợ năng', () => {
  it('LHL-20 mọi lời gọi là GET tới đúng đường dẫn; hai route của Bệnh nhân gắn token, hai route công khai thì không', async () => {
    const { api } = renderListPage({
      before: (fake) => {
        fake.appointments = makeAppointments(6);
        fake.pageSize = 3;
        fake.relatives = RELATIVES;
        fake.doctors = DOCTORS;
        fake.specialties = SPECIALTIES;
      },
    });
    await loaded();
    await screen.findByRole('option', { name: 'Lê Minh D' });
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByText('Trang 2 / 2');
    fireEvent.click(tab(/^Hoàn thành/));
    await waitFor(() => expect(listQueries(api)).toHaveLength(3));

    expect(api.writes()).toEqual([]);
    expect(new Set(api.requests.map((request) => request.path))).toEqual(
      new Set([
        '/patient/appointments',
        '/patient/relatives',
        '/public/specialties',
        '/public/doctors',
      ]),
    );
    for (const request of api.requests) {
      expect(request.hasToken).toBe(request.path.startsWith('/patient/'));
    }
  });

  // Từ khoá và bộ lọc là dữ liệu cá nhân (mã lịch, tên người thân): chỉ ở bộ nhớ của trang (Đại duyệt 12/11/2026, câu (e)); URL vào lịch sử trình duyệt,
  // `Referer` và log truy cập của nginx
  it('LHL-19 lọc, tìm, chuyển trang KHÔNG ghi `localStorage`, `sessionStorage`, cookie và KHÔNG đổi URL (không có `q` hay bộ lọc trên URL)', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { api } = renderListPage({
      before: (api) => {
        api.appointments = makeAppointments(12);
        api.pageSize = 3;
        api.relatives = RELATIVES;
        api.doctors = DOCTORS;
        api.specialties = SPECIALTIES;
      },
    });
    await loaded();
    await screen.findByRole('option', { name: 'Nguyễn Minh Anh' });
    await screen.findByRole('option', { name: 'Lê Minh D' });

    fireEvent.click(tab(/^Hoàn thành/));
    fireEvent.change(field('Người khám'), { target: { value: 'BanThan' } });
    fireEvent.change(field('Bác sĩ'), { target: { value: '5' } });
    fireEvent.change(field('Từ ngày'), { target: { value: '2026-10-01' } });
    typeSearch('nguyen');
    fireEvent.keyDown(searchBox(), { key: 'Enter' });
    await waitFor(() =>
      expect(lastListQuery(api)).toMatchObject({ q: 'nguyen' }),
    );

    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    expect(currentUrl()).toBe(LIST_PATH);
    expect(window.location.search).toBe('');
  });

  it('LHL-22 thẻ lọc là nút thật (Tab, Enter, Space của trình duyệt), tên truy cập gồm số đếm; ô tìm và bộ lọc có nhãn; "Hiển thị X / Y" nằm trong vùng aria-live', async () => {
    renderListPage({
      before: (api) => {
        api.appointments = makeAppointments(6);
      },
    });
    await loaded();

    const group = screen.getByRole('group', { name: 'Lọc theo trạng thái' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(7);
    for (const button of buttons) {
      expect(button.tagName).toBe('BUTTON');
      expect(button).not.toHaveAttribute('tabindex', '-1');
      expect(button).toHaveAttribute('aria-pressed');
    }
    expect(tab('Chờ thanh toán 1')).toBeInTheDocument();

    expect(searchBox()).toBeInTheDocument();
    for (const label of [
      'Người khám',
      'Bác sĩ',
      'Chuyên khoa',
      'Từ ngày',
      'Đến ngày',
    ]) {
      expect(field(label)).toBeInTheDocument();
    }
    const live = screen.getByText('Hiển thị 6 / 6 lịch hẹn');
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  it('LHL-22 thứ tự Tab theo thứ tự nhìn: ô tìm, năm bộ lọc, thẻ lọc, vùng bảng, chuyển trang', async () => {
    renderListPage({
      before: (api) => {
        api.appointments = makeAppointments(7);
        api.pageSize = 3;
      },
    });
    const region = await loaded();

    const inOrder = [
      searchBox(),
      field('Người khám'),
      field('Bác sĩ'),
      field('Chuyên khoa'),
      field('Từ ngày'),
      field('Đến ngày'),
      tab(/^Tất cả/),
      tab(/^Vắng mặt/),
      region,
      screen.getByRole('button', { name: 'Trang sau' }),
    ];
    for (let index = 1; index < inOrder.length; index += 1) {
      expect(
        inOrder[index - 1].compareDocumentPosition(inOrder[index]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    // Vùng cuộn ngang của bảng nhận Tab (màn hẹp cuộn bằng bàn phím)
    expect(region).toHaveAttribute('tabindex', '0');
  });
});
