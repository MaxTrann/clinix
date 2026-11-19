import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  BRANCH,
  apiError,
  installFakeApi,
  json,
  makeGate,
  makePatient,
  renderPatientPage,
} from './testing/patient-accounts-test-kit';

// admin F9, danh sách Bệnh nhân (mã TKF9-20 đến 29 là [đề xuất], TRACKING admin 9A.12 mục 3). Phủ phía giao diện của TK-05 (phân trang biên) và TK-06 (từ khoá đặc biệt).
// API giả có trạng thái ở mức hợp đồng B17; không có dữ liệu thật, không email thật.

const TABLE = 'Danh sách tài khoản bệnh nhân';
const many = (count: number) =>
  Array.from({ length: count }, (_, i) => makePatient(i + 1));

const table = () => screen.findByRole('table', { name: TABLE });
const bodyRows = (element: HTMLElement) =>
  within(element).getAllByRole('row').slice(1);
const select = (label: string) => screen.getByRole('combobox', { name: label });
const choose = (label: string, value: string) =>
  fireEvent.change(select(label), { target: { value } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TKF9-20 tải thành công', () => {
  it('TKF9-20 Toàn hệ thống: tiêu đề, tổng, sáu cột, hai mươi dòng, chân phân trang; lời gọi đúng tham số', async () => {
    const api = installFakeApi({ accounts: many(45) });
    renderPatientPage();

    const grid = await table();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Tài khoản bệnh nhân' }),
    ).toBeInTheDocument();
    expect(screen.getByText('45 bệnh nhân')).toBeInTheDocument();
    expect(
      within(grid)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual([
      'Họ tên',
      'Email',
      'Số điện thoại',
      'Trạng thái',
      'Đặt lịch',
      'Thao tác',
    ]);
    expect(bodyRows(grid)).toHaveLength(20);
    expect(screen.getByText('Hiển thị 1 – 20 trên 45')).toBeInTheDocument();
    expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument();

    const first = api.lists()[0];
    expect(first.search.getAll('vaiTro')).toEqual(['BenhNhan']);
    expect(first.search.get('page')).toBe('1');
    expect(first.search.get('pageSize')).toBe('20');
    expect([...first.search.keys()].sort()).toEqual([
      'page',
      'pageSize',
      'vaiTro',
    ]);
  });

  it('TKF9-20 mỗi dòng có họ tên, email, SĐT, trạng thái; cột "Đặt lịch" phân biệt bị khoá, bình thường, chưa có hồ sơ', async () => {
    installFakeApi({
      accounts: [
        makePatient(1, { khoaDatLichDoNoShow: true, soLanNoShow: 3 }),
        makePatient(2, { trangThai: 'NgungHoatDong' }),
        makePatient(3, {
          khoaDatLichDoNoShow: null,
          soLanNoShow: null,
          daXacMinhEmail: false,
        }),
      ],
    });
    renderPatientPage();

    const rows = bodyRows(await table());
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Bệnh nhân 1')).toBeInTheDocument();
    expect(within(rows[0]).getByText('bn1@example.test')).toBeInTheDocument();
    expect(within(rows[0]).getByText('0900000001')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Đang hoạt động')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Bị khoá do no-show')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Ngừng hoạt động')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Bình thường')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Chưa có')).toBeInTheDocument();
  });
});

describe('TKF9-21 đang tải', () => {
  it('TKF9-21 giữa lúc chờ API: có "Đang tải danh sách bệnh nhân…", chưa có bảng; xong thì mất', async () => {
    const gate = makeGate();
    const api = installFakeApi({ accounts: many(2) });
    api.override(
      (r) => r.path === '/admin/accounts',
      async () => {
        await gate.promise;
        return json({
          items: [makePatient(1)],
          total: 1,
          page: 1,
          pageSize: 20,
        });
      },
    );
    renderPatientPage();
    try {
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Đang tải danh sách bệnh nhân…',
      );
      expect(screen.queryByRole('table', { name: TABLE })).toBeNull();
    } finally {
      gate.open();
    }
    await table();
    expect(screen.queryByText('Đang tải danh sách bệnh nhân…')).toBeNull();
  });
});

describe('TKF9-22 rỗng', () => {
  it('TKF9-22 chưa có bệnh nhân nào và không lọc: "Chưa có bệnh nhân nào."', async () => {
    installFakeApi({ accounts: [] });
    renderPatientPage();
    await table();
    expect(screen.getByText('Chưa có bệnh nhân nào.')).toBeInTheDocument();
    expect(screen.getByText('Hiển thị 0 trên 0')).toBeInTheDocument();
  });

  it('TKF9-22 có lọc mà không khớp: "Không tìm thấy bệnh nhân phù hợp."', async () => {
    installFakeApi({ accounts: many(3) });
    renderPatientPage();
    await table();
    choose('Lọc trạng thái', 'NgungHoatDong');
    expect(
      await screen.findByText('Không tìm thấy bệnh nhân phù hợp.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Chưa có bệnh nhân nào.')).toBeNull();
  });
});

describe('TKF9-23 lỗi tải', () => {
  it('TKF9-23 mất mạng: câu mất mạng có "Thử lại"; bấm thì tải lại và hiện bảng', async () => {
    const api = installFakeApi({ accounts: many(2) });
    api.override(
      (r) => r.path === '/admin/accounts',
      () => Promise.reject(new TypeError('Failed to fetch')),
    );
    renderPatientPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
    );
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await table()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.lists()).toHaveLength(2);
  });

  it('TKF9-23 403: câu "Bạn không có quyền thực hiện thao tác này." (không phải câu chung)', async () => {
    const api = installFakeApi({ accounts: many(2) });
    api.override(
      (r) => r.path === '/admin/accounts',
      () => apiError(403, 'KHONG_DU_QUYEN'),
    );
    renderPatientPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bạn không có quyền thực hiện thao tác này.',
    );
  });

  it('TKF9-23 500 và phản hồi không phải JSON: câu chung, vẫn có "Thử lại"', async () => {
    const api = installFakeApi({ accounts: many(2) });
    api.override(
      (r) => r.path === '/admin/accounts',
      () => apiError(500, 'LOI_HE_THONG'),
    );
    renderPatientPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Đã có lỗi xảy ra. Vui lòng thử lại sau.');
    expect(
      within(alert).getByRole('button', { name: 'Thử lại' }),
    ).toBeInTheDocument();

    api.override(
      (r) => r.path === '/admin/accounts',
      () => new Response('<html>Bad Gateway</html>', { status: 502 }),
    );
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Đã có lỗi xảy ra.'),
    );
    // HTML của nginx không lọt ra màn hình
    expect(screen.queryByText(/Bad Gateway/)).toBeNull();
  });
});

describe('TKF9-24 phân trang (TK-05 phía giao diện)', () => {
  it('TKF9-24 "Sau" gửi page=2, hiện dòng 21–40; "Trước" ở trang 1 bị tắt, "Sau" ở trang cuối bị tắt', async () => {
    const api = installFakeApi({ accounts: many(45) });
    renderPatientPage();
    await table();
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(
      await screen.findByText('Hiển thị 21 – 40 trên 45'),
    ).toBeInTheDocument();
    expect(api.lists().at(-1)?.search.get('page')).toBe('2');
    expect(screen.getByText('Bệnh nhân 21')).toBeInTheDocument();
    expect(screen.queryByText('Bệnh nhân 1')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(
      await screen.findByText('Hiển thị 41 – 45 trên 45'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  });

  it('TKF9-24 đổi bất kỳ bộ lọc nào thì về TRANG 1 (không giữ trang 2)', async () => {
    const api = installFakeApi({ accounts: many(45) });
    renderPatientPage();
    await table();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByText('Hiển thị 21 – 40 trên 45');

    choose('Lọc trạng thái', 'DangHoatDong');
    await screen.findByText('Hiển thị 1 – 20 trên 45');
    const last = api.lists().at(-1);
    expect(last?.search.get('page')).toBe('1');
    expect(last?.search.get('trangThai')).toBe('DangHoatDong');
  });
});

describe('TKF9-25 trang lệch được tự sửa', () => {
  it('TKF9-25 trang vượt (items rỗng nhưng total > 0): tải lại trang cuối, KHÔNG hiện "không tìm thấy"', async () => {
    const api = installFakeApi({ accounts: many(35) });
    renderPatientPage();
    await table();
    // Người khác vừa xoá bớt: trang 2 giờ rỗng dù còn 15 bệnh nhân (chỉ vừa một trang)
    api.override(
      (r) => r.path === '/admin/accounts' && r.search.get('page') === '2',
      () => json({ items: [], total: 15, page: 2, pageSize: 20 }),
    );
    api.override(
      (r) => r.path === '/admin/accounts' && r.search.get('page') === '1',
      () => json({ items: many(15), total: 15, page: 1, pageSize: 20 }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));

    expect(
      await screen.findByText('Hiển thị 1 – 15 trên 15'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Không tìm thấy bệnh nhân phù hợp.')).toBeNull();
    expect(screen.queryByText('Chưa có bệnh nhân nào.')).toBeNull();
    expect(api.lists().map((r) => r.search.get('page'))).toEqual([
      '1',
      '2',
      '1',
    ]);
  });

  it('TKF9-25 400 TRANG_KHONG_HOP_LE: về trang 1 thay vì báo lỗi', async () => {
    const api = installFakeApi({ accounts: many(35) });
    renderPatientPage();
    await table();
    api.override(
      (r) => r.path === '/admin/accounts' && r.search.get('page') === '2',
      () =>
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', [
          { truong: 'page', ma: 'TRANG_KHONG_HOP_LE' },
        ]),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));

    expect(
      await screen.findByText('Hiển thị 1 – 20 trên 35'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.lists().map((r) => r.search.get('page'))).toEqual([
      '1',
      '2',
      '1',
    ]);
  });

  it('TKF9-25 danh sách thật sự rỗng ở trang 1 thì KHÔNG vòng lặp tải lại', async () => {
    const api = installFakeApi({ accounts: [] });
    renderPatientPage();
    await table();
    expect(api.lists()).toHaveLength(1);
  });
});

describe('TKF9-26 bộ lọc', () => {
  it('TKF9-26 Toàn hệ thống: trạng thái, khoá no-show và chi nhánh đi đúng tham số; chi nhánh lấy từ GET /admin/branches', async () => {
    const api = installFakeApi({ accounts: many(5) });
    renderPatientPage();
    await table();
    expect(
      await screen.findByRole('option', { name: 'Chi nhánh Quận 3' }),
    ).toBeInTheDocument();
    expect(api.calls('GET', '/admin/branches')).toHaveLength(1);
    expect(api.calls('GET', '/admin/branches')[0].search.get('pageSize')).toBe(
      '100',
    );

    choose('Lọc trạng thái', 'NgungHoatDong');
    await waitFor(() =>
      expect(api.lists().at(-1)?.search.get('trangThai')).toBe('NgungHoatDong'),
    );
    choose('Lọc khoá đặt lịch do no-show', 'true');
    await waitFor(() =>
      expect(api.lists().at(-1)?.search.get('khoaNoShow')).toBe('true'),
    );
    choose('Lọc khoá đặt lịch do no-show', 'false');
    await waitFor(() =>
      expect(api.lists().at(-1)?.search.get('khoaNoShow')).toBe('false'),
    );
    choose('Lọc chi nhánh', '6');
    await waitFor(() =>
      expect(api.lists().at(-1)?.search.get('chiNhanhId')).toBe('6'),
    );
    const last = api.lists().at(-1);
    expect(Object.fromEntries(last?.search ?? [])).toEqual({
      page: '1',
      pageSize: '20',
      vaiTro: 'BenhNhan',
      trangThai: 'NgungHoatDong',
      khoaNoShow: 'false',
      chiNhanhId: '6',
    });

    // Về "Tất cả": tham số biến mất
    choose('Lọc trạng thái', 'all');
    choose('Lọc khoá đặt lịch do no-show', 'all');
    choose('Lọc chi nhánh', 'all');
    await waitFor(() =>
      expect([...(api.lists().at(-1)?.search.keys() ?? [])].sort()).toEqual([
        'page',
        'pageSize',
        'vaiTro',
      ]),
    );
  });

  it('TKF9-26 lọc khoá no-show thật sự thu hẹp danh sách', async () => {
    installFakeApi({
      accounts: [
        makePatient(1, { khoaDatLichDoNoShow: true, soLanNoShow: 3 }),
        makePatient(2),
        makePatient(3),
      ],
    });
    renderPatientPage();
    await table();
    choose('Lọc khoá đặt lịch do no-show', 'true');
    await screen.findByText('1 bệnh nhân');
    expect(screen.getByText('Bệnh nhân 1')).toBeInTheDocument();
    expect(screen.queryByText('Bệnh nhân 2')).toBeNull();
  });

  it('TKF9-26 không tải được danh sách chi nhánh: ô lọc vẫn có "Tất cả chi nhánh" và báo ngắn, danh sách không hỏng', async () => {
    const api = installFakeApi({ accounts: many(2) });
    api.override(
      (r) => r.path === '/admin/branches',
      () => apiError(500, 'LOI_HE_THONG'),
    );
    renderPatientPage();
    await table();
    expect(
      await screen.findByText('Không tải được danh sách chi nhánh.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Tất cả chi nhánh' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('TKF9-27 tìm kiếm (TK-06 phía giao diện)', () => {
  it('TKF9-27 gõ liên tiếp "a", "an", "ana": đúng MỘT lời gọi với q=ana, không có lời gọi cho chuỗi dở', async () => {
    const api = installFakeApi({
      accounts: [makePatient(1, { hoTen: 'Ana Lê' }), makePatient(2)],
    });
    renderPatientPage();
    await table();
    const box = screen.getByRole('searchbox', {
      name: 'Tìm theo tên, email hoặc số điện thoại',
    });
    for (const text of ['a', 'an', 'ana'])
      fireEvent.change(box, { target: { value: text } });

    await screen.findByText('1 bệnh nhân');
    const queries = api.lists().map((r) => r.search.get('q'));
    expect(queries).toEqual([null, 'ana']);
  });

  it.each([["50%_'--"], ['100%'], ['a_b'], ["'; DROP TABLE tai_khoan; --"]])(
    'TKF9-27 từ khoá %s được gửi nguyên văn; trang không lỗi, hiện "không tìm thấy"',
    async (text) => {
      const api = installFakeApi({ accounts: many(3) });
      renderPatientPage();
      await table();
      fireEvent.change(
        screen.getByRole('searchbox', {
          name: 'Tìm theo tên, email hoặc số điện thoại',
        }),
        { target: { value: text } },
      );
      expect(
        await screen.findByText('Không tìm thấy bệnh nhân phù hợp.'),
      ).toBeInTheDocument();
      expect(api.lists().at(-1)?.search.get('q')).toBe(text);
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('TKF9-27 khoảng trắng hai đầu bị bỏ; toàn khoảng trắng thì không gửi q; ô giới hạn 200 ký tự', async () => {
    const api = installFakeApi({
      accounts: [makePatient(1, { hoTen: 'Ana Lê' }), makePatient(2)],
    });
    renderPatientPage();
    await table();
    const box = screen.getByRole('searchbox', {
      name: 'Tìm theo tên, email hoặc số điện thoại',
    });
    expect(box).toHaveAttribute('maxlength', '200');

    fireEvent.change(box, { target: { value: '   ana   ' } });
    await screen.findByText('1 bệnh nhân');
    expect(api.lists().at(-1)?.search.get('q')).toBe('ana');

    fireEvent.change(box, { target: { value: '     ' } });
    await screen.findByText('2 bệnh nhân');
    expect(api.lists().at(-1)?.search.has('q')).toBe(false);
  });
});

describe('TKF9-28 chữ tự do không sinh phần tử', () => {
  it('TKF9-28 họ tên chứa thẻ HTML hiển thị nguyên văn ở bảng', async () => {
    installFakeApi({
      accounts: [
        makePatient(1, {
          hoTen: '<img src="x" onerror="window.xss=1"><b>đậm</b>',
        }),
      ],
    });
    const { container } = renderPatientPage();
    await table();
    expect(
      screen.getByText('<img src="x" onerror="window.xss=1"><b>đậm</b>'),
    ).toBeInTheDocument();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });
});

describe('TKF9-29 kết quả muộn không đè kết quả mới; StrictMode', () => {
  it('TKF9-29 yêu cầu đầu bị giữ lại, gõ từ khoá, yêu cầu sau xong trước: sau khi yêu cầu đầu về muộn, bảng vẫn là kết quả của yêu cầu sau', async () => {
    const gate = makeGate();
    const api = installFakeApi({
      accounts: [
        makePatient(1, { hoTen: 'Ana Lê' }),
        makePatient(2, { hoTen: 'Bình Võ' }),
      ],
    });
    api.override(
      (r) => r.path === '/admin/accounts' && !r.search.has('q'),
      async () => {
        await gate.promise;
        return json({
          items: [makePatient(2, { hoTen: 'Bình Võ' })],
          total: 1,
          page: 1,
          pageSize: 20,
        });
      },
    );
    renderPatientPage();
    try {
      const box = await screen.findByRole('searchbox', {
        name: 'Tìm theo tên, email hoặc số điện thoại',
      });
      fireEvent.change(box, { target: { value: 'ana' } });
      await screen.findByText('Ana Lê');
    } finally {
      gate.open();
    }
    // Chờ yêu cầu muộn về xong (nó đã bị huỷ) rồi kiểm lại: không bị đè
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText('Ana Lê')).toBeInTheDocument();
    expect(screen.queryByText('Bình Võ')).toBeNull();
  });

  it('TKF9-29 StrictMode (effect chạy hai lần như main.tsx ở chế độ dev): vẫn ra đúng bảng, không lỗi', async () => {
    const api = installFakeApi({ accounts: many(3) });
    renderPatientPage({ strict: true });
    expect(bodyRows(await table())).toHaveLength(3);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.lists().length).toBeLessThanOrEqual(2);
  });
});

describe('TKF9-20 Admin Chi nhánh thấy danh sách rút gọn (xem thêm TKF9-50 đến 54)', () => {
  it('TKF9-20 Chi nhánh: năm cột, không cột "Đặt lịch"; banner chỉ xem; hai ô lọc, không có lọc no-show và chi nhánh', async () => {
    const api = installFakeApi({ scope: BRANCH, accounts: many(2) });
    renderPatientPage({ scope: BRANCH });

    const grid = await table();
    expect(
      within(grid)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Họ tên', 'Email', 'Số điện thoại', 'Trạng thái', 'Thao tác']);
    expect(screen.getByRole('note')).toHaveTextContent('chỉ có quyền xem');
    expect(
      screen.queryByRole('combobox', { name: 'Lọc khoá đặt lịch do no-show' }),
    ).toBeNull();
    expect(
      screen.queryByRole('combobox', { name: 'Lọc chi nhánh' }),
    ).toBeNull();
    expect(
      screen.getByRole('combobox', { name: 'Lọc trạng thái' }),
    ).toBeInTheDocument();
    // Chi nhánh không gọi danh sách chi nhánh, và lời gọi danh sách không có tham số của Toàn hệ thống
    expect(api.calls('GET', '/admin/branches')).toHaveLength(0);
    expect([...(api.lists()[0]?.search.keys() ?? [])].sort()).toEqual([
      'page',
      'pageSize',
      'vaiTro',
    ]);
  });
});
