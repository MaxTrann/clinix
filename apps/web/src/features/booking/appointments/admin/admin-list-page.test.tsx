import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminListQueries,
  adminRowCodes,
  BRANCH_SCOPE,
  cleanUpAdminAppointments,
  field,
  lastAdminListQuery,
  listLoaded,
  renderAdminAppointments,
  searchBox,
} from '../../../../router/admin-appointments-harness';
import {
  makeAdminAppointment,
  makeAdminAppointments,
} from '../../testing/fake-admin-api';
import { apiErrorResponse } from '../../testing/fake-appointment-list-api';
import { holdResponse } from '../../testing/appointment-detail-harness';
import { LIST_TEXT } from './list-messages';

// booking F10: trang "Lịch hẹn" của Quản trị viên (Figma `511:2`, `621:2`) với API giả và router thật. Mã AQL là [đề xuất] (PLAN booking mục 7.41). QT-01 = AQL-15, AQL-16 (và AQL-05).
// Mức W: trang với API giả (không gọi backend thật); jsdom không đo bố cục và tương phản thật nên phần đó là kiểm tay `M`.
const LIST_URL = '/admin/lich-hen';

afterEach(() => {
  vi.restoreAllMocks();
  cleanUpAdminAppointments();
});

const optionsOf = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);

describe('danh sách: tải đầu, đếm, cột', () => {
  it('AQL-01 tải đầu: h1 `Lịch hẹn`; MỘT GET chỉ có `page`; không ngày, `pageSize`, `thanhToan`, `chiNhanhId`; dòng đếm là `total` của API (không đếm lại `items`)', async () => {
    const { api } = renderAdminAppointments(LIST_URL, {
      before: (fake) => {
        fake.appointments = makeAdminAppointments(5);
        fake.pageSize = 2;
      },
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lịch hẹn' }),
    ).toBeVisible();
    await listLoaded();
    expect(adminListQueries(api)).toEqual([{ page: '1' }]);
    expect(api.writes()).toEqual([]);
    // 2 dòng trên trang nhưng total = 5
    expect(adminRowCodes()).toHaveLength(2);
    expect(screen.getByText('5 lịch hẹn phù hợp')).toBeInTheDocument();
  });

  it('AQL-02 bảng theo Figma `511:2`: sáu cột + cột `Chi tiết`; không cột `Thanh toán`, `Chi nhánh`, `Kênh`; ngày rồi giờ theo NGÀY Việt Nam; thứ tự dòng giữ NGUYÊN thứ tự API (giảm dần)', async () => {
    renderAdminAppointments(LIST_URL, {
      before: (fake) => {
        fake.appointments = [
          // 17:30 UTC ngày 19/10 đã là 00:30 ngày 20/10 ở Việt Nam
          makeAdminAppointment({
            maLichHen: 'CP20261020001',
            thoiGian: '2026-10-19T17:30:00.000Z',
          }),
          makeAdminAppointment({ maLichHen: 'CP20261018001' }),
          makeAdminAppointment({
            maLichHen: 'CP20261015001',
            thoiGian: '2026-10-15T02:00:00.000Z',
          }),
        ];
      },
    });
    const region = await listLoaded();
    const headers = within(region)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual([
      'Mã lịch',
      'Ngày / Giờ',
      'Bệnh nhân',
      'Bác sĩ',
      'Dịch vụ',
      'Trạng thái',
      'Thao tác',
    ]);
    expect(headers.join(' ')).not.toMatch(/Thanh toán|Chi nhánh|Kênh/);
    expect(adminRowCodes()).toEqual([
      'CP20261020001',
      'CP20261018001',
      'CP20261015001',
    ]);
    const first = within(region).getAllByRole('row')[1];
    const cells = within(first).getAllByRole('cell');
    // Ngày ngắn rồi giờ: "20/10" rồi "00:30"
    expect(cells[1].textContent).toBe('20/1000:30');
    expect(cells[4].textContent).toBe('Khám tim mạch');
    expect(within(first).getByText('Đã xác nhận')).toBeInTheDocument();
  });

  it('AQL-13 cột `Bệnh nhân`: người khám, SĐT của NGƯỜI ĐẶT; người khám khác người đặt thì thêm "Đặt bởi {tên}", cùng một người thì không', async () => {
    renderAdminAppointments(LIST_URL, {
      before: (fake) => {
        fake.appointments = [
          makeAdminAppointment({
            maLichHen: 'CP20261018001',
            nguoiKham: { hoTen: 'Trần Thị Con', laBanThan: false },
            nguoiDat: { hoTen: 'Trần Văn Cha', soDienThoai: '0911111111' },
          }),
          makeAdminAppointment({ maLichHen: 'CP20261018002' }),
        ];
      },
    });
    const region = await listLoaded();
    const [relative, own] = within(region).getAllByRole('row').slice(1);
    expect(within(relative).getByText('Trần Thị Con')).toBeInTheDocument();
    expect(within(relative).getByText('0911111111')).toBeInTheDocument();
    expect(
      within(relative).getByText('Đặt bởi Trần Văn Cha'),
    ).toBeInTheDocument();
    expect(within(own).queryByText(/Đặt bởi/)).toBeNull();
    expect(within(own).getByText('0901234567')).toBeInTheDocument();
  });

  it('AQL-02 mỗi dòng có liên kết `Chi tiết` tới TRANG chi tiết (tên truy cập kèm mã lịch, mã được mã hoá)', async () => {
    renderAdminAppointments(LIST_URL);
    await listLoaded();
    const link = screen.getByRole('link', {
      name: 'Chi tiết lịch hẹn CP20261018001',
    });
    expect(link).toHaveAttribute('href', '/admin/lich-hen/CP20261018001');
  });
});

describe('ô tìm và hai ô ngày', () => {
  it('AQL-03 ô tìm `q`: 1 ký tự không gọi API; 2 ký tự gọi sau 300 ms với `q` đã cắt khoảng trắng', async () => {
    const { api } = renderAdminAppointments(LIST_URL);
    await listLoaded();
    expect(searchBox()).toHaveAttribute(
      'placeholder',
      'Mã lịch, tên bệnh nhân, số điện thoại...',
    );
    fireEvent.change(searchBox(), { target: { value: 'a' } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(adminListQueries(api)).toHaveLength(1);
    fireEvent.change(searchBox(), { target: { value: '  an  ' } });
    await waitFor(() => expect(lastAdminListQuery(api)?.q).toBe('an'));
    expect(adminListQueries(api)).toHaveLength(2);
  });

  it('AQL-04 `Từ ngày`, `Đến ngày` LUÔN hiện và mặc định trống (không gửi ngày); một đầu vẫn gửi; `Đến ngày` trước `Từ ngày` ⇒ không gọi API và báo dưới ô; sửa lại hợp lệ thì gọi', async () => {
    const { api } = renderAdminAppointments(LIST_URL);
    await listLoaded();
    expect(field('Từ ngày')).toHaveValue('');
    expect(field('Đến ngày')).toHaveValue('');
    expect(lastAdminListQuery(api)).toEqual({ page: '1' });

    fireEvent.change(field('Từ ngày'), { target: { value: '2026-10-20' } });
    await waitFor(() =>
      expect(lastAdminListQuery(api)).toEqual({
        page: '1',
        tuNgay: '2026-10-20',
      }),
    );
    const calls = adminListQueries(api).length;
    fireEvent.change(field('Đến ngày'), { target: { value: '2026-10-10' } });
    expect(
      await screen.findByText('Đến ngày phải sau hoặc bằng Từ ngày.'),
    ).toBeInTheDocument();
    expect(field('Đến ngày')).toHaveValue('2026-10-10');
    expect(adminListQueries(api)).toHaveLength(calls);

    fireEvent.change(field('Đến ngày'), { target: { value: '2026-10-25' } });
    await waitFor(() =>
      expect(lastAdminListQuery(api)).toEqual({
        page: '1',
        tuNgay: '2026-10-20',
        denNgay: '2026-10-25',
      }),
    );
    expect(
      screen.queryByText('Đến ngày phải sau hoặc bằng Từ ngày.'),
    ).toBeNull();
  });
});

describe('bốn ô chọn và Chi nhánh (QT-01)', () => {
  const withOptions = (
    fake: ReturnType<typeof renderAdminAppointments>['api'],
  ) => {
    fake.specialties = {
      items: [{ chuyenKhoaId: '2', ten: 'Tim mạch' }],
      total: 1,
      page: 1,
      pageSize: 100,
    };
    fake.doctors = {
      items: [{ bacSiId: '9007199254740993', hoTen: 'Nguyễn Minh Anh' }],
      total: 1,
      page: 1,
      pageSize: 100,
    };
    fake.services = { items: [{ dichVuKhamId: '31', ten: 'Khám tim mạch' }] };
    fake.branches = {
      items: [
        { chiNhanhId: '3', ten: 'CLINIX Chi nhánh Quận 3' },
        { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 1' },
      ],
      total: 2,
      page: 1,
      pageSize: 100,
    };
  };

  it('AQL-05 chọn chuyên khoa, bác sĩ (id lớn giữ đủ chữ số), loại dịch vụ, MỘT trạng thái ⇒ gửi đúng `chuyenKhoaId`, `bacSiId`, `dichVuKhamId`, `trangThai`; KHÔNG `pageSize`, `thanhToan`', async () => {
    const { api } = renderAdminAppointments(LIST_URL, {
      before: withOptions,
    });
    await listLoaded();
    expect(
      await screen.findByRole('option', { name: 'Tim mạch' }),
    ).toBeInTheDocument();
    fireEvent.change(field('Chuyên khoa'), { target: { value: '2' } });
    fireEvent.change(field('Bác sĩ'), {
      target: { value: '9007199254740993' },
    });
    fireEvent.change(field('Loại dịch vụ'), { target: { value: '31' } });
    fireEvent.change(field('Trạng thái lịch'), {
      target: { value: 'DaXacNhan' },
    });
    await waitFor(() =>
      expect(lastAdminListQuery(api)).toEqual({
        page: '1',
        trangThai: 'DaXacNhan',
        chuyenKhoaId: '2',
        bacSiId: '9007199254740993',
        dichVuKhamId: '31',
      }),
    );
    for (const query of adminListQueries(api)) {
      expect(Object.keys(query)).not.toContain('pageSize');
      expect(Object.keys(query)).not.toContain('thanhToan');
    }
    // Sáu trạng thái như Lễ tân (không `Đã đổi lịch`), mục đầu là `Tất cả`
    expect(optionsOf(field('Trạng thái lịch'))).toEqual([
      'Tất cả',
      'Chờ thanh toán',
      'Đã xác nhận',
      'Đã tiếp đón',
      'Hoàn thành',
      'Đã hủy',
      'Vắng mặt',
    ]);
  });

  it('AQL-15 Quản trị viên TOÀN HỆ THỐNG: `Chi nhánh` là ô chọn (tên đúng, từ `/public/branches`); chọn ⇒ gửi `chiNhanhId`; về `Tất cả` ⇒ không gửi', async () => {
    const { api } = renderAdminAppointments(LIST_URL, { before: withOptions });
    await listLoaded();
    const select = screen.getByRole('combobox', { name: 'Chi nhánh' });
    await screen.findByRole('option', { name: 'CLINIX Chi nhánh Quận 3' });
    expect(optionsOf(select)).toEqual([
      'Tất cả',
      'CLINIX Chi nhánh Quận 1',
      'CLINIX Chi nhánh Quận 3',
    ]);
    expect(lastAdminListQuery(api)).toEqual({ page: '1' });
    fireEvent.change(select, { target: { value: '3' } });
    await waitFor(() =>
      expect(lastAdminListQuery(api)).toEqual({ page: '1', chiNhanhId: '3' }),
    );
    fireEvent.change(select, { target: { value: '' } });
    await waitFor(() => expect(lastAdminListQuery(api)).toEqual({ page: '1' }));
    expect(api.callsTo('/public/branches')).toHaveLength(1);
  });

  it('AQL-16 Quản trị viên CHI NHÁNH: `Chi nhánh` là CHỮ cố định (ô chỉ đọc, không phải ô chọn), không gọi `/public/branches`, và KHÔNG BAO GIỜ gửi `chiNhanhId` (kể cả khi URL có `chiNhanhId`) qua tải đầu, đổi lọc, chuyển trang', async () => {
    const { api } = renderAdminAppointments(`${LIST_URL}?chiNhanhId=9`, {
      scope: BRANCH_SCOPE,
      before: (fake) => {
        withOptions(fake);
        fake.appointments = makeAdminAppointments(5);
        fake.pageSize = 2;
      },
    });
    await listLoaded();
    expect(screen.queryByRole('combobox', { name: 'Chi nhánh' })).toBeNull();
    const fixed = screen.getByLabelText<HTMLInputElement>('Chi nhánh');
    expect(fixed).toHaveValue('CLINIX Chi nhánh Quận 3');
    expect(fixed).toHaveAttribute('readonly');
    await screen.findByRole('option', { name: 'Tim mạch' });
    // Chuyển trang trước (đổi bộ lọc sau đó mới về trang 1)
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(lastAdminListQuery(api)?.page).toBe('2'));
    fireEvent.change(field('Trạng thái lịch'), {
      target: { value: 'DaXacNhan' },
    });
    await waitFor(() =>
      expect(lastAdminListQuery(api)?.trangThai).toBe('DaXacNhan'),
    );
    for (const query of adminListQueries(api)) {
      expect(Object.keys(query)).not.toContain('chiNhanhId');
    }
    expect(api.callsTo('/public/branches')).toEqual([]);
  });
});

describe('trang, giữ bảng cũ, rỗng, lỗi', () => {
  it('AQL-06 đổi bộ lọc ⇒ về trang 1; chọn lại đúng giá trị đang chọn không gọi lại API', async () => {
    const { api } = renderAdminAppointments(LIST_URL, {
      before: (fake) => {
        fake.appointments = makeAdminAppointments(6);
        fake.pageSize = 2;
      },
    });
    await listLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(lastAdminListQuery(api)?.page).toBe('2'));
    fireEvent.change(field('Trạng thái lịch'), {
      target: { value: 'ChoThanhToan' },
    });
    await waitFor(() =>
      expect(lastAdminListQuery(api)).toEqual({
        page: '1',
        trangThai: 'ChoThanhToan',
      }),
    );
    const calls = adminListQueries(api).length;
    fireEvent.change(field('Trạng thái lịch'), {
      target: { value: 'ChoThanhToan' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(adminListQueries(api)).toHaveLength(calls);
  });

  it('AQL-07 chuyển trang: `Trang X / Y` đúng, nút `Trước`/`Sau` vô hiệu ở biên, chỉ hiện từ hai trang', async () => {
    renderAdminAppointments(LIST_URL, {
      before: (fake) => {
        fake.appointments = makeAdminAppointments(5);
        fake.pageSize = 2;
      },
    });
    await listLoaded();
    expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByText('Trang 2 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByText('Trang 3 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  });

  it('AQL-08 đổi bộ lọc khi yêu cầu mới còn treo: bảng của truy vấn trước vẫn hiện (`aria-busy`), không về "Đang tải"; bảng mới thay khi về', async () => {
    const held = holdResponse(
      () =>
        new Response(
          JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const { api } = renderAdminAppointments(LIST_URL);
    await listLoaded();
    api.failNext('list', held.override);
    fireEvent.change(field('Trạng thái lịch'), { target: { value: 'DaHuy' } });
    await waitFor(() => expect(adminListQueries(api)).toHaveLength(2));
    const region = screen.getByRole('region', {
      name: LIST_TEXT.resultsRegion,
    });
    expect(region.closest('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText(LIST_TEXT.loading)).toBeNull();
    held.release();
    expect(
      await screen.findByText('Không có lịch hẹn nào khớp bộ lọc.'),
    ).toBeInTheDocument();
  });

  it('AQL-09 rỗng ba câu: không lọc ⇒ "Chưa có lịch hẹn nào."; chỉ khoảng ngày ⇒ "trong khoảng ngày đã chọn"; có bộ lọc khác ⇒ "khớp bộ lọc" kèm `Xóa lọc` đưa về mặc định', async () => {
    const { api } = renderAdminAppointments(LIST_URL, {
      before: (fake) => {
        fake.appointments = [];
      },
    });
    expect(
      await screen.findByText('Chưa có lịch hẹn nào.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xóa lọc' })).toBeNull();

    fireEvent.change(field('Từ ngày'), { target: { value: '2026-10-20' } });
    expect(
      await screen.findByText(
        'Không có lịch hẹn nào trong khoảng ngày đã chọn.',
      ),
    ).toBeInTheDocument();

    fireEvent.change(field('Trạng thái lịch'), { target: { value: 'DaHuy' } });
    expect(
      await screen.findByText('Không có lịch hẹn nào khớp bộ lọc.'),
    ).toBeInTheDocument();
    const clears = screen.getAllByRole('button', { name: 'Xóa lọc' });
    fireEvent.click(clears[clears.length - 1]);
    await waitFor(() => expect(lastAdminListQuery(api)).toEqual({ page: '1' }));
    expect(field('Từ ngày')).toHaveValue('');
    expect(field('Trạng thái lịch')).toHaveValue('');
  });

  it('AQL-10 lỗi tải theo `maLoi`: `KHONG_DU_QUYEN` câu riêng không `Thử lại`; `maLoi` lạ cùng 500 ⇒ câu chung kèm `Thử lại` và bấm gọi lại đúng truy vấn', async () => {
    const first = renderAdminAppointments(LIST_URL, {
      before: (fake) => {
        fake.failNext('list', () => apiErrorResponse(403, 'KHONG_DU_QUYEN'));
      },
    });
    expect(
      await screen.findByText('Bạn không có quyền xem danh sách này.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Lịch hẹn' }),
    ).toBeVisible();

    first.unmount();
    cleanUpAdminAppointments();
    const second = renderAdminAppointments(LIST_URL, {
      before: (fake) => {
        fake.failNext('list', () => apiErrorResponse(500, 'MA_LA_XYZ'));
      },
    });
    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    expect(adminListQueries(second.api)).toHaveLength(1);
    fireEvent.click(retry);
    await listLoaded();
    expect(adminListQueries(second.api)).toEqual([
      { page: '1' },
      { page: '1' },
    ]);
    expect(adminListQueries(first.api)).toHaveLength(1);
  });
});

describe('nguồn ô chọn, kho trình duyệt, URL', () => {
  it('AQL-12 nguồn ô chọn: `/public/specialties`, `/public/doctors`, `/public/services`, `/public/branches` KHÔNG gắn token; `/admin/appointments` có token; lỗi một danh sách không chặn bảng và `Thử lại` tải lại nó', async () => {
    const { api } = renderAdminAppointments(LIST_URL, {
      before: (fake) => {
        fake.failNext('doctors', () => new Response('x', { status: 502 }));
      },
    });
    await listLoaded();
    for (const path of [
      '/public/specialties',
      '/public/doctors',
      '/public/services',
      '/public/branches',
    ]) {
      const calls = api.callsTo(path);
      expect(calls.length, path).toBeGreaterThan(0);
      expect(
        calls.every((call) => !call.hasToken),
        path,
      ).toBe(true);
    }
    expect(
      api.callsTo('/admin/appointments').every((call) => call.hasToken),
    ).toBe(true);
    expect(api.callsTo('/public/services')[0].query).toEqual({});
    expect(
      await screen.findByText('Không tải được danh sách bác sĩ.'),
    ).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByText('Không tải được danh sách bác sĩ.')).getByRole(
        'button',
        { name: 'Thử lại' },
      ),
    );
    await waitFor(() => expect(api.callsTo('/public/doctors')).toHaveLength(2));
  });

  it('AQL-14 dữ liệu cá nhân: gõ SĐT vào ô tìm, đổi lọc, chuyển trang ⇒ `localStorage.length`, `sessionStorage.length` bằng 0, không cookie, không `console`, URL không chứa `q`', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const { api, router } = renderAdminAppointments(LIST_URL, {
      before: (fake) => {
        fake.appointments = makeAdminAppointments(5);
        fake.pageSize = 2;
      },
    });
    await listLoaded();
    fireEvent.change(searchBox(), { target: { value: '0901234567' } });
    await waitFor(() => expect(lastAdminListQuery(api)?.q).toBe('0901234567'));
    fireEvent.change(field('Trạng thái lịch'), { target: { value: 'DaHuy' } });
    await waitFor(() =>
      expect(lastAdminListQuery(api)?.trangThai).toBe('DaHuy'),
    );
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    const { pathname, search } = router.state.location;
    expect(`${pathname}${search}`).not.toContain('0901234567');
    // URL THẬT của cửa sổ (không chỉ URL của router bộ nhớ): lịch sử trình duyệt không được nhận `q`
    expect(window.location.href).not.toContain('0901234567');
  });

  it('AQL-17 bộ lọc KHÔNG cá nhân được ghi lên URL, `q` KHÔNG; `Xóa lọc` làm sạch URL', async () => {
    const { api, router } = renderAdminAppointments(LIST_URL);
    await listLoaded();
    fireEvent.change(field('Trạng thái lịch'), { target: { value: 'DaHuy' } });
    fireEvent.change(field('Từ ngày'), { target: { value: '2026-10-01' } });
    await waitFor(() =>
      expect(router.state.location.search).toBe(
        '?trangThai=DaHuy&tuNgay=2026-10-01',
      ),
    );
    fireEvent.change(searchBox(), { target: { value: 'Nguyễn' } });
    await waitFor(() => expect(lastAdminListQuery(api)?.q).toBe('Nguyễn'));
    expect(router.state.location.search).not.toContain('Nguy');
    // Bảng rỗng (lịch mẫu là `Đã xác nhận`, đang lọc `Đã hủy`): có hai nút `Xóa lọc` (khung lọc và câu rỗng), bấm nút đầu
    fireEvent.click(screen.getAllByRole('button', { name: 'Xóa lọc' })[0]);
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('AQL-17 mở lại với bộ lọc trên URL: truy vấn và các ô khôi phục đúng', async () => {
    const reopened = renderAdminAppointments(
      `${LIST_URL}?trangThai=DaHuy&bacSiId=12&tuNgay=2026-10-01&denNgay=2026-10-31&page=1`,
    );
    // Bảng rỗng (lịch mẫu `Đã xác nhận` không khớp `Đã hủy`): chờ truy vấn thay vì chờ bảng
    await waitFor(() => expect(adminListQueries(reopened.api)).toHaveLength(1));
    expect(lastAdminListQuery(reopened.api)).toEqual({
      page: '1',
      trangThai: 'DaHuy',
      bacSiId: '12',
      tuNgay: '2026-10-01',
      denNgay: '2026-10-31',
    });
    expect(field('Trạng thái lịch')).toHaveValue('DaHuy');
    expect(field('Từ ngày')).toHaveValue('2026-10-01');
  });

  it('AQL-17 giá trị sai hay lạ trên URL (trạng thái, id, ngày, trang, `pageSize`, `thanhToan`) bị bỏ như không có', async () => {
    const garbage = renderAdminAppointments(
      `${LIST_URL}?trangThai=XoaTatCa&chuyenKhoaId=0&bacSiId=1e3&tuNgay=2026-13-45&denNgay=abc&page=-1&pageSize=999&thanhToan=DaThu`,
    );
    await listLoaded();
    expect(adminListQueries(garbage.api)).toEqual([{ page: '1' }]);
  });
});
