import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  BRANCH,
  apiError,
  json,
  makeGate,
} from '../patient-accounts/testing/patient-accounts-test-kit';
import {
  installFakeStaffApi,
  makeAdmin,
  makeStaff,
  renderStaffPage,
} from './testing/staff-accounts-test-kit';

// admin F8, danh sách Nhân sự (mã NSF8-20 đến 31 là [đề xuất], TRACKING admin 9A.20 mục 3). Phủ phía giao diện của TK-01, TK-02 (Chi nhánh không thấy Quản trị viên: L9, Q27),
// TK-05 (phân trang biên) và TK-06 (từ khoá đặc biệt). API giả có trạng thái ở mức hợp đồng B17; không dữ liệu thật, không email thật.

const TABLE = 'Danh sách nhân sự';
const many = (count: number) =>
  Array.from({ length: count }, (_, i) => makeStaff(i + 1));

const table = () => screen.findByRole('table', { name: TABLE });
const bodyRows = (element: HTMLElement) =>
  within(element).getAllByRole('row').slice(1);
const select = (label: string) => screen.getByRole('combobox', { name: label });
const choose = (label: string, value: string) =>
  fireEvent.change(select(label), { target: { value } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NSF8-20 tải thành công', () => {
  it('NSF8-20 Toàn hệ thống: tiêu đề, tổng, sáu cột, hai mươi dòng, chân phân trang; lời gọi đúng tham số', async () => {
    const api = installFakeStaffApi({ accounts: many(45) });
    renderStaffPage();

    const grid = await table();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Nhân sự' }),
    ).toBeInTheDocument();
    expect(screen.getByText('45 nhân sự')).toBeInTheDocument();
    expect(
      within(grid)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      'Họ tên',
      'Vai trò',
      'Chi nhánh',
      'Trạng thái',
      'Ngày tạo',
      'Thao tác',
    ]);
    expect(bodyRows(grid)).toHaveLength(20);
    expect(screen.getByText('Hiển thị 1 – 20 trên 45')).toBeInTheDocument();
    expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument();

    const first = api.lists()[0];
    expect(first.search.getAll('vaiTro')).toEqual([
      'BacSi',
      'LeTan',
      'QuanTriVien',
    ]);
    expect(first.search.get('page')).toBe('1');
    expect(first.search.get('pageSize')).toBe('20');
    expect([...first.search.keys()].sort()).toEqual([
      'page',
      'pageSize',
      'vaiTro',
      'vaiTro',
      'vaiTro',
    ]);
  });

  it('NSF8-20 một dòng: họ tên với email và số điện thoại, vai trò, chi nhánh, trạng thái chữ, ngày tạo giờ Việt Nam', async () => {
    installFakeStaffApi({
      accounts: [
        makeStaff(1, {
          hoTen: 'Trần Thị Mai',
          email: 'mai@example.invalid',
          soDienThoai: '0912345678',
          loaiTaiKhoan: 'LeTan',
          trangThai: 'ChoKichHoat',
          thoiDiemTao: '2026-11-18T17:30:00.000Z',
        }),
      ],
    });
    renderStaffPage();

    const row = bodyRows(await table())[0];
    const cells = within(row).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('Trần Thị Mai');
    expect(cells[0]).toHaveTextContent('mai@example.invalid');
    expect(cells[0]).toHaveTextContent('0912345678');
    expect(cells[1]).toHaveTextContent('Lễ tân');
    expect(cells[2]).toHaveTextContent('Chi nhánh Quận 1');
    expect(cells[3]).toHaveTextContent('Chờ kích hoạt');
    // 17:30 UTC ngày 18 là 00:30 ngày 19 giờ Việt Nam
    expect(cells[4]).toHaveTextContent('19/11/2026');
    expect(
      within(row).getByRole('button', { name: 'Xem chi tiết Trần Thị Mai' }),
    ).toBeInTheDocument();
  });

  it('NSF8-20 Quản trị viên Toàn hệ thống: cột chi nhánh là "Toàn hệ thống"; ba trạng thái đều có chữ', async () => {
    installFakeStaffApi({
      accounts: [
        makeAdmin(1, 'ToanHeThong'),
        makeStaff(2, { trangThai: 'DangHoatDong' }),
        makeStaff(3, { trangThai: 'NgungHoatDong' }),
      ],
    });
    renderStaffPage();

    const rows = bodyRows(await table());
    const cellOf = (row: HTMLElement, i: number) =>
      within(row).getAllByRole('cell')[i];
    // Sắp theo họ tên (API): "Nhân sự 2", "Nhân sự 3", "Quản trị 1"
    expect(cellOf(rows[2], 1)).toHaveTextContent('Quản trị viên');
    expect(cellOf(rows[2], 2)).toHaveTextContent('Toàn hệ thống');
    expect(cellOf(rows[0], 3)).toHaveTextContent('Đang hoạt động');
    expect(cellOf(rows[1], 3)).toHaveTextContent('Ngừng hoạt động');
  });

  it('NSF8-20 khoá lạ của API (mật khẩu băm, địa chỉ…) KHÔNG bao giờ được vẽ ra', async () => {
    const api = installFakeStaffApi({ accounts: [makeStaff(1)] });
    api.override(
      (r) => r.path === '/admin/accounts',
      () =>
        json({
          items: [
            {
              ...makeStaff(1),
              matKhauBam: 'khong-duoc-ve',
              diaChi: 'Số 1 đường lạ',
              ngaySinh: '1990-01-01',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
    );
    renderStaffPage();

    await table();
    expect(document.body.textContent).not.toContain('khong-duoc-ve');
    expect(document.body.textContent).not.toContain('Số 1 đường lạ');
    expect(document.body.textContent).not.toContain('1990');
  });
});

describe('NSF8-21 đang tải', () => {
  it('NSF8-21 hiện trạng thái đang tải rồi mới có bảng', async () => {
    const api = installFakeStaffApi({ accounts: many(2) });
    const gate = makeGate();
    api.override(
      (r) => r.path === '/admin/accounts',
      async () => {
        await gate.promise;
        return json({ items: [makeStaff(1)], total: 1, page: 1, pageSize: 20 });
      },
    );
    renderStaffPage();

    try {
      expect(
        await screen.findByText('Đang tải danh sách nhân sự…'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('table', { name: TABLE })).toBeNull();
    } finally {
      gate.open();
    }
    expect(await table()).toBeInTheDocument();
    expect(screen.queryByText('Đang tải danh sách nhân sự…')).toBeNull();
  });
});

describe('NSF8-22 rỗng', () => {
  it('NSF8-22 chưa có nhân sự nào và không lọc: "Chưa có nhân sự nào."', async () => {
    installFakeStaffApi({ accounts: [] });
    renderStaffPage();
    expect(await screen.findByText('Chưa có nhân sự nào.')).toBeInTheDocument();
    expect(screen.getByText('0 nhân sự')).toBeInTheDocument();
  });

  it('NSF8-22 có lọc mà không khớp: "Không tìm thấy nhân sự phù hợp."', async () => {
    installFakeStaffApi({ accounts: many(3) });
    renderStaffPage();
    await table();
    choose('Lọc trạng thái', 'NgungHoatDong');
    expect(
      await screen.findByText('Không tìm thấy nhân sự phù hợp.'),
    ).toBeInTheDocument();
  });
});

describe('NSF8-23 lỗi tải danh sách', () => {
  it('NSF8-23 mất mạng: báo lỗi có "Thử lại"; bấm thì tải lại và hiện bảng', async () => {
    const api = installFakeStaffApi({ accounts: many(2) });
    api.override(
      (r) => r.path === '/admin/accounts',
      () => {
        throw new TypeError('Failed to fetch');
      },
    );
    renderStaffPage();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: TABLE })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await table()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('NSF8-23 403: câu "Bạn không có quyền thực hiện thao tác này."', async () => {
    const api = installFakeStaffApi();
    api.override(
      (r) => r.path === '/admin/accounts',
      () => apiError(403, 'KHONG_DU_QUYEN'),
    );
    renderStaffPage();
    expect(
      await screen.findByText('Bạn không có quyền thực hiện thao tác này.'),
    ).toBeInTheDocument();
  });

  it('NSF8-23 500: câu chung, không lộ thông điệp của máy chủ', async () => {
    const api = installFakeStaffApi();
    api.override(
      (r) => r.path === '/admin/accounts',
      () =>
        new Response(
          JSON.stringify({
            maLoi: 'LOI_HE_THONG',
            thongBao: 'stack nội bộ ở đây',
            requestId: 'abc',
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    renderStaffPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('stack nội bộ');
  });
});

describe('NSF8-24 phân trang (TK-05)', () => {
  it('NSF8-24 "Sau" tải trang 2: 20 dòng, chân phân trang đổi, đúng tham số', async () => {
    const api = installFakeStaffApi({ accounts: many(45) });
    renderStaffPage();
    await table();

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(
      await screen.findByText('Hiển thị 21 – 40 trên 45'),
    ).toBeInTheDocument();
    expect(api.lists().at(-1)?.search.get('page')).toBe('2');
    expect(bodyRows(await table())).toHaveLength(20);
    // Trang cuối chỉ còn 5 dòng
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(
      await screen.findByText('Hiển thị 41 – 45 trên 45'),
    ).toBeInTheDocument();
    expect(bodyRows(await table())).toHaveLength(5);
  });

  it('NSF8-24 đổi bộ lọc luôn về trang 1', async () => {
    const api = installFakeStaffApi({ accounts: many(45) });
    renderStaffPage();
    await table();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByText('Hiển thị 21 – 40 trên 45');

    choose('Lọc trạng thái', 'DangHoatDong');
    await waitFor(() => {
      const last = api.lists().at(-1);
      expect(last?.search.get('trangThai')).toBe('DangHoatDong');
      expect(last?.search.get('page')).toBe('1');
    });
    expect(await screen.findByText('Trang 1 / 3')).toBeInTheDocument();
  });

  it('NSF8-24 trang vượt quá (dữ liệu vừa ít đi, không còn dòng nào): tự về trang cuối, không báo lỗi', async () => {
    const api = installFakeStaffApi({ accounts: many(25) });
    renderStaffPage();
    await table();
    // Người khác vừa xoá bớt: lần hỏi trang 2 chỉ còn tổng 20 và không có dòng nào
    api.override(
      (r) => r.path === '/admin/accounts' && r.search.get('page') === '2',
      () => json({ items: [], total: 20, page: 2, pageSize: 20 }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));

    await waitFor(() =>
      expect(api.lists().map((r) => r.search.get('page'))).toEqual([
        '1',
        '2',
        '1',
      ]),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await table()).toBeInTheDocument();
  });

  it('NSF8-24 TRANG_KHONG_HOP_LE (400): về trang 1, không báo lỗi', async () => {
    const api = installFakeStaffApi({ accounts: many(45) });
    renderStaffPage();
    await table();
    api.override(
      (r) => r.path === '/admin/accounts' && r.search.get('page') === '2',
      () =>
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', [
          { truong: 'page', ma: 'TRANG_KHONG_HOP_LE' },
        ]),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));

    await waitFor(() =>
      expect(api.lists().map((r) => r.search.get('page'))).toEqual([
        '1',
        '2',
        '1',
      ]),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('NSF8-25 tìm kiếm (TK-06)', () => {
  it('NSF8-25 gõ liên tiếp chỉ gửi MỘT lời gọi sau độ trễ, q đã trim', async () => {
    const api = installFakeStaffApi({ accounts: many(3) });
    renderStaffPage();
    await table();
    const before = api.lists().length;

    const box = screen.getByRole('searchbox', {
      name: 'Tìm theo tên, email hoặc số điện thoại',
    });
    fireEvent.change(box, { target: { value: 'N' } });
    fireEvent.change(box, { target: { value: 'Nh' } });
    fireEvent.change(box, { target: { value: '  Nhân sự 2  ' } });

    await waitFor(() =>
      expect(api.lists().at(-1)?.search.get('q')).toBe('Nhân sự 2'),
    );
    expect(api.lists().length).toBe(before + 1);
    expect(await screen.findByText('1 nhân sự')).toBeInTheDocument();
  });

  it("NSF8-25 ký tự đặc biệt %, _, ', -- đi NGUYÊN VĂN, không lỗi", async () => {
    const api = installFakeStaffApi({ accounts: many(3) });
    renderStaffPage();
    await table();

    const box = screen.getByRole('searchbox', {
      name: 'Tìm theo tên, email hoặc số điện thoại',
    });
    fireEvent.change(box, { target: { value: "50%_'--" } });
    await waitFor(() =>
      expect(api.lists().at(-1)?.search.get('q')).toBe("50%_'--"),
    );
    expect(
      await screen.findByText('Không tìm thấy nhân sự phù hợp.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('NSF8-25 ô tìm giới hạn 200 ký tự', async () => {
    installFakeStaffApi({ accounts: many(1) });
    renderStaffPage();
    await table();
    expect(
      screen.getByRole('searchbox', {
        name: 'Tìm theo tên, email hoặc số điện thoại',
      }),
    ).toHaveAttribute('maxlength', '200');
  });
});

describe('NSF8-26 lọc vai trò và trạng thái', () => {
  it('NSF8-26 Toàn hệ thống: ô vai trò có bốn lựa chọn; chọn từng vai trò gửi đúng vaiTro', async () => {
    const api = installFakeStaffApi({ accounts: many(3) });
    renderStaffPage();
    await table();

    expect(
      within(select('Lọc vai trò'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Tất cả vai trò', 'Bác sĩ', 'Lễ tân', 'Quản trị viên']);

    choose('Lọc vai trò', 'LeTan');
    await waitFor(() =>
      expect(api.lists().at(-1)?.search.getAll('vaiTro')).toEqual(['LeTan']),
    );
    choose('Lọc vai trò', 'QuanTriVien');
    await waitFor(() =>
      expect(api.lists().at(-1)?.search.getAll('vaiTro')).toEqual([
        'QuanTriVien',
      ]),
    );
    choose('Lọc vai trò', 'all');
    await waitFor(() =>
      expect(api.lists().at(-1)?.search.getAll('vaiTro')).toEqual([
        'BacSi',
        'LeTan',
        'QuanTriVien',
      ]),
    );
  });

  it('NSF8-26 ô trạng thái có đủ ba trạng thái; "Chờ kích hoạt" gửi trangThai=ChoKichHoat', async () => {
    const api = installFakeStaffApi({
      accounts: [makeStaff(1, { trangThai: 'ChoKichHoat' }), makeStaff(2)],
    });
    renderStaffPage();
    await table();

    expect(
      within(select('Lọc trạng thái'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Tất cả trạng thái',
      'Chờ kích hoạt',
      'Đang hoạt động',
      'Ngừng hoạt động',
    ]);
    choose('Lọc trạng thái', 'ChoKichHoat');
    await waitFor(() =>
      expect(api.lists().at(-1)?.search.get('trangThai')).toBe('ChoKichHoat'),
    );
    expect(await screen.findByText('1 nhân sự')).toBeInTheDocument();
  });
});

describe('NSF8-27 Toàn hệ thống lọc theo chi nhánh', () => {
  it('NSF8-27 ô chi nhánh lấy từ GET /admin/branches; chọn thì gửi chiNhanhId', async () => {
    const api = installFakeStaffApi({
      accounts: [
        makeStaff(1),
        makeStaff(2, {
          chiNhanh: { chiNhanhId: '6', ten: 'Chi nhánh Quận 3' },
        }),
      ],
    });
    renderStaffPage();
    await table();

    await screen.findByRole('option', { name: 'Chi nhánh Quận 3' });
    choose('Lọc chi nhánh', '6');
    await waitFor(() =>
      expect(api.lists().at(-1)?.search.get('chiNhanhId')).toBe('6'),
    );
    expect(await screen.findByText('1 nhân sự')).toBeInTheDocument();
  });

  it('NSF8-27 không tải được danh sách chi nhánh: có thông báo nhỏ, bảng vẫn dùng được', async () => {
    const api = installFakeStaffApi({ accounts: many(2) });
    api.override(
      (r) => r.path === '/admin/branches',
      () => apiError(500, 'LOI_HE_THONG'),
    );
    renderStaffPage();

    expect(await table()).toBeInTheDocument();
    expect(
      await screen.findByText('Không tải được danh sách chi nhánh.'),
    ).toBeInTheDocument();
    expect(select('Lọc chi nhánh')).toBeInTheDocument();
  });
});

describe('NSF8-28 Admin Chi nhánh (TK-02, L9, Q27)', () => {
  it('NSF8-28 chỉ hỏi Bác sĩ và Lễ tân; không có lựa chọn Quản trị viên, không có ô chi nhánh; có ghi chú và tên chi nhánh', async () => {
    const api = installFakeStaffApi({
      scope: BRANCH,
      accounts: [
        makeStaff(1),
        makeStaff(2, { loaiTaiKhoan: 'LeTan' }),
        makeAdmin(3, 'ChiNhanh'),
        makeStaff(4, {
          chiNhanh: { chiNhanhId: '6', ten: 'Chi nhánh Quận 3' },
        }),
      ],
    });
    renderStaffPage({ scope: BRANCH });

    const grid = await table();
    expect(api.lists()[0].search.getAll('vaiTro')).toEqual(['BacSi', 'LeTan']);
    expect(api.lists()[0].search.has('chiNhanhId')).toBe(false);
    expect(
      within(select('Lọc vai trò'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Tất cả vai trò', 'Bác sĩ', 'Lễ tân']);
    expect(
      screen.queryByRole('combobox', { name: 'Lọc chi nhánh' }),
    ).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent(
      'Bạn chỉ thấy Bác sĩ và Lễ tân của chi nhánh mình.',
    );
    expect(
      screen.getByText('Chi nhánh của bạn: Chi nhánh Quận 1'),
    ).toBeInTheDocument();
    // API giả đã loại Quản trị viên và nhân sự chi nhánh khác
    expect(bodyRows(grid)).toHaveLength(2);
    expect(screen.queryByText('Quản trị 3')).toBeNull();
    expect(screen.queryByText('Nhân sự 4')).toBeNull();
  });

  it('NSF8-28 chọn "Tất cả vai trò" sau khi lọc: vẫn không bao giờ gửi QuanTriVien', async () => {
    const api = installFakeStaffApi({ scope: BRANCH, accounts: many(2) });
    renderStaffPage({ scope: BRANCH });
    await table();
    choose('Lọc vai trò', 'LeTan');
    choose('Lọc vai trò', 'all');
    await waitFor(() =>
      expect(api.lists().at(-1)?.search.getAll('vaiTro')).toEqual([
        'BacSi',
        'LeTan',
      ]),
    );
    for (const request of api.lists())
      expect(request.search.getAll('vaiTro')).not.toContain('QuanTriVien');
  });

  it('NSF8-28 Toàn hệ thống KHÔNG có ghi chú "chỉ thấy" của Chi nhánh', async () => {
    installFakeStaffApi({ accounts: many(1) });
    renderStaffPage();
    await table();
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('NSF8-29 thanh tab', () => {
  it('NSF8-29 trang Nhân sự có thanh tab với tab "Nhân sự" là trang hiện tại', async () => {
    installFakeStaffApi({ accounts: many(1) });
    renderStaffPage();
    await table();
    const nav = screen.getByRole('navigation', {
      name: 'Nhân sự và tài khoản',
    });
    expect(within(nav).getByRole('link', { name: 'Nhân sự' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      within(nav).getByRole('link', { name: 'Tài khoản bệnh nhân' }),
    ).toHaveAttribute('href', '/admin/tai-khoan-benh-nhan');
  });
});

describe('NSF8-30 mở chi tiết từ danh sách', () => {
  it('NSF8-30 bấm "Xem chi tiết" tải chi tiết mới nhất từ API rồi mở panel mang tên nhân sự', async () => {
    const api = installFakeStaffApi({ accounts: many(2) });
    renderStaffPage();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Xem chi tiết Nhân sự 2' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Nhân sự 2' }),
    ).toBeInTheDocument();
    expect(api.details().map((r) => r.path)).toEqual(['/admin/accounts/2']);
  });
});

describe('NSF8-31 StrictMode', () => {
  it('NSF8-31 trong StrictMode vẫn hiện đúng danh sách (không đứng ở trạng thái đang tải)', async () => {
    installFakeStaffApi({ accounts: many(3) });
    renderStaffPage({ strict: true });
    expect(bodyRows(await table())).toHaveLength(3);
  });
});
