import { fireEvent, render, screen } from '@testing-library/react';
import type { AdminMe } from '../admin-me';
import { AdminMeProvider } from '../admin-me-context';
import { ClinicInfoPage } from './clinic-info-page';
import type { ClinicInfo } from './clinic-info-types';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clinicInfo(overrides: Partial<ClinicInfo> = {}): ClinicInfo {
  return {
    tenThuongHieu: 'CLINIX Clinic',
    diaChiTruSo: '123 Nguyễn Thị Minh Khai, Phường 6, Quận 3',
    duongDayNong: '1900 1234',
    email: 'contact@clinix.vn',
    ...overrides,
  };
}

function renderPage(scope: AdminMe = { phamVi: 'ToanHeThong' }) {
  return render(
    <AdminMeProvider value={scope}>
      <ClinicInfoPage />
    </AdminMeProvider>,
  );
}

// AF4-09: nút Lưu mờ khi chưa đổi gì, nên các ca bấm Lưu phải sửa một ô trước (ô tên không liên quan tới lỗi đang kiểm)
function editBrandName(value = 'CLINIX Mới') {
  fireEvent.change(screen.getByLabelText(/Tên thương hiệu/), {
    target: { value },
  });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ClinicInfoPage (F4)', () => {
  it('AF4-07 Admin Chi nhánh xem chỉ đọc: ô nhập khóa, không có nút lưu (Figma 629:2)', async () => {
    fetchMock.mockResolvedValueOnce(response(clinicInfo()));
    renderPage({
      phamVi: 'ChiNhanh',
      chiNhanh: { id: '1', ten: 'Chi nhánh Quận 3' },
    });

    const brand = await screen.findByLabelText(/Tên thương hiệu/);
    expect(brand).toHaveValue('CLINIX Clinic');
    expect(brand).toBeDisabled();
    expect(screen.getByLabelText(/Email liên hệ chung/)).toBeDisabled();
    expect(
      screen.getByText(/chỉ Admin Toàn hệ thống có thể chỉnh sửa/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Lưu thông tin chung/ }),
    ).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('AF4-02 tải bốn giá trị từ B4 và hiển thị các tab theo Figma', async () => {
    fetchMock.mockResolvedValueOnce(response(clinicInfo()));
    renderPage();

    expect(await screen.findByLabelText(/Tên thương hiệu/)).toHaveValue(
      'CLINIX Clinic',
    );
    expect(screen.getByLabelText(/Địa chỉ trụ sở chính/)).toHaveValue(
      '123 Nguyễn Thị Minh Khai, Phường 6, Quận 3',
    );
    expect(screen.getByLabelText(/Đường dây nóng/)).toHaveValue('1900 1234');
    expect(screen.getByLabelText(/Email liên hệ chung/)).toHaveValue(
      'contact@clinix.vn',
    );
    expect(
      screen.getByRole('tab', { name: 'Thông tin chung' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Chi nhánh' })).toBeEnabled();
  });

  it('AF6a bật tab Chi nhánh và tải danh sách B7 khi được chọn', async () => {
    fetchMock
      .mockResolvedValueOnce(response(clinicInfo()))
      .mockResolvedValueOnce(
        response({ items: [], total: 0, page: 1, pageSize: 20 }),
      );
    render(
      <AdminMeProvider value={{ phamVi: 'ToanHeThong' }}>
        <ClinicInfoPage />
      </AdminMeProvider>,
    );
    await screen.findByDisplayValue('CLINIX Clinic');

    fireEvent.click(screen.getByRole('tab', { name: 'Chi nhánh' }));

    expect(
      await screen.findByText('Chưa có chi nhánh nào.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Chi nhánh' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/api/admin/branches?page=1&pageSize=20',
    );
  });

  it('AF4-02 GET chưa cấu hình để bốn input trống, không điền dữ liệu mẫu', async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        tenThuongHieu: null,
        diaChiTruSo: null,
        duongDayNong: null,
        email: null,
      }),
    );
    renderPage();

    expect(await screen.findByLabelText(/Tên thương hiệu/)).toHaveValue('');
    expect(screen.getByLabelText(/Địa chỉ trụ sở chính/)).toHaveValue('');
    expect(screen.getByLabelText(/Đường dây nóng/)).toHaveValue('');
    expect(screen.getByLabelText(/Email liên hệ chung/)).toHaveValue('');
  });

  it('AF4-03 chặn hotline sai định dạng trước khi gửi PUT', async () => {
    fetchMock.mockResolvedValueOnce(response(clinicInfo()));
    renderPage();
    await screen.findByLabelText(/Tên thương hiệu/);

    fireEvent.change(screen.getByLabelText(/Đường dây nóng/), {
      target: { value: '12345' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Lưu thông tin chung' }),
    );

    expect(
      await screen.findByText('Đường dây nóng không đúng định dạng.'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('AF4-04 PUT chỉ gửi bốn field và hiển thị xác nhận khi lưu thành công', async () => {
    const current = clinicInfo();
    fetchMock
      .mockResolvedValueOnce(response(current))
      .mockResolvedValueOnce(response({ ...current, tenThuongHieu: 'CLINIX' }));
    renderPage();
    await screen.findByDisplayValue('CLINIX Clinic');

    fireEvent.change(screen.getByLabelText(/Tên thương hiệu/), {
      target: { value: 'CLINIX' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Lưu thông tin chung' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã lưu thông tin chung.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, options] = fetchMock.mock.calls[1] ?? [];
    expect(options?.method).toBe('PUT');
    expect(JSON.parse(String(options?.body))).toEqual({
      tenThuongHieu: 'CLINIX',
      diaChiTruSo: current.diaChiTruSo,
      duongDayNong: current.duongDayNong,
      email: current.email,
    });
  });

  it('AF4-05 gắn lỗi DTO vào đúng trường và giữ nguyên nội dung khi API từ chối', async () => {
    const current = clinicInfo();
    fetchMock.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(
      response(
        {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          thongBao: 'Dữ liệu không hợp lệ.',
          loi: [
            {
              truong: 'duongDayNong',
              ma: 'DUONG_DAY_NONG_KHONG_HOP_LE',
            },
          ],
        },
        400,
      ),
    );
    renderPage();
    await screen.findByDisplayValue('CLINIX Clinic');

    editBrandName();
    fireEvent.click(
      screen.getByRole('button', { name: 'Lưu thông tin chung' }),
    );

    expect(
      await screen.findByText('Đường dây nóng không đúng định dạng.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Đường dây nóng/)).toHaveValue('1900 1234');
    expect(screen.getByLabelText(/Đường dây nóng/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('AF4-05 gắn mã lỗi email từ B4 vào trường email', async () => {
    const current = clinicInfo();
    fetchMock.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(
      response(
        {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          thongBao: 'Dữ liệu không hợp lệ.',
          loi: [{ truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' }],
        },
        400,
      ),
    );
    renderPage();
    await screen.findByDisplayValue('CLINIX Clinic');

    editBrandName();
    fireEvent.click(
      screen.getByRole('button', { name: 'Lưu thông tin chung' }),
    );

    expect(
      await screen.findByText('Email liên hệ chung không đúng định dạng.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Email liên hệ chung/)).toHaveValue(
      current.email,
    );
  });

  it('AF4-05 cho phép thử lại GET sau lỗi tạm thời', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({ maLoi: 'LOI_HE_THONG', thongBao: 'Lỗi máy chủ.' }, 503),
      )
      .mockResolvedValueOnce(response(clinicInfo()));
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Thử lại' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(
      await screen.findByDisplayValue('CLINIX Clinic'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('AF4-05 không tự gửi lại PUT khi mất kết nối', async () => {
    fetchMock
      .mockResolvedValueOnce(response(clinicInfo()))
      .mockRejectedValueOnce(new Error('connection lost'));
    renderPage();
    await screen.findByDisplayValue('CLINIX Clinic');

    editBrandName();
    fireEvent.click(
      screen.getByRole('button', { name: 'Lưu thông tin chung' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('AF4-06 khóa nút trong lúc PUT đang chờ và không gửi lần hai', async () => {
    const current = clinicInfo();
    let finishSave!: (value: Response) => void;
    fetchMock.mockResolvedValueOnce(response(current)).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishSave = resolve;
        }),
    );
    renderPage();
    await screen.findByDisplayValue('CLINIX Clinic');

    const saveButton = screen.getByRole('button', {
      name: 'Lưu thông tin chung',
    });
    editBrandName();
    fireEvent.click(saveButton);
    expect(
      await screen.findByRole('button', { name: 'Đang lưu…' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Đang lưu…' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    finishSave(response(current));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã lưu thông tin chung.',
    );
  });
});

describe('ClinicInfoPage Hủy và Lưu mờ (AF4-08, AF4-09)', () => {
  const cancelButton = () => screen.getByRole('button', { name: 'Hủy' });
  const saveButton = () =>
    screen.getByRole('button', { name: 'Lưu thông tin chung' });

  it('AF4-09 Lưu và Hủy cùng mờ khi chưa đổi gì: bấm Lưu không gọi PUT', async () => {
    fetchMock.mockResolvedValueOnce(response(clinicInfo()));
    renderPage();
    await screen.findByDisplayValue('CLINIX Clinic');

    expect(saveButton()).toBeDisabled();
    expect(cancelButton()).toBeDisabled();
    fireEvent.click(saveButton());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    editBrandName();
    expect(saveButton()).toBeEnabled();
    expect(cancelButton()).toBeEnabled();
  });

  it('AF4-08 gõ lại đúng giá trị đã tải thì Lưu và Hủy mờ lại', async () => {
    fetchMock.mockResolvedValueOnce(response(clinicInfo()));
    renderPage();
    await screen.findByDisplayValue('CLINIX Clinic');

    editBrandName('CLINIX Khác');
    expect(cancelButton()).toBeEnabled();
    editBrandName('CLINIX Clinic');

    expect(cancelButton()).toBeDisabled();
    expect(saveButton()).toBeDisabled();
  });

  it('AF4-08 so từng ký tự: thêm một dấu cách cuối cũng là thay đổi, Hủy trả về giá trị đã tải', async () => {
    fetchMock.mockResolvedValueOnce(response(clinicInfo()));
    renderPage();
    await screen.findByDisplayValue('CLINIX Clinic');

    editBrandName('CLINIX Clinic ');
    expect(cancelButton()).toBeEnabled();
    fireEvent.click(cancelButton());

    expect(screen.getByLabelText(/Tên thương hiệu/)).toHaveValue(
      'CLINIX Clinic',
    );
    expect(cancelButton()).toBeDisabled();
  });

  it('AF4-08 Hủy khôi phục cả bốn ô, bỏ lỗi kiểm tra tại chỗ, không gọi PUT và đưa focus về ô đầu tiên', async () => {
    const current = clinicInfo();
    fetchMock.mockResolvedValueOnce(response(current));
    renderPage();
    await screen.findByDisplayValue('CLINIX Clinic');

    editBrandName('Tên khác');
    fireEvent.change(screen.getByLabelText(/Địa chỉ trụ sở chính/), {
      target: { value: 'Địa chỉ khác' },
    });
    fireEvent.change(screen.getByLabelText(/Đường dây nóng/), {
      target: { value: '12345' },
    });
    fireEvent.change(screen.getByLabelText(/Email liên hệ chung/), {
      target: { value: 'khac@clinix.vn' },
    });
    fireEvent.click(saveButton());
    expect(
      await screen.findByText('Đường dây nóng không đúng định dạng.'),
    ).toBeInTheDocument();

    fireEvent.click(cancelButton());

    expect(screen.getByLabelText(/Tên thương hiệu/)).toHaveValue(
      current.tenThuongHieu,
    );
    expect(screen.getByLabelText(/Địa chỉ trụ sở chính/)).toHaveValue(
      current.diaChiTruSo,
    );
    expect(screen.getByLabelText(/Đường dây nóng/)).toHaveValue(
      current.duongDayNong,
    );
    expect(screen.getByLabelText(/Email liên hệ chung/)).toHaveValue(
      current.email,
    );
    expect(
      screen.queryByText('Đường dây nóng không đúng định dạng.'),
    ).toBeNull();
    expect(screen.getByLabelText(/Đường dây nóng/)).toHaveAttribute(
      'aria-invalid',
      'false',
    );
    expect(screen.getByLabelText(/Tên thương hiệu/)).toHaveFocus();
    expect(cancelButton()).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('AF4-08 Hủy bỏ lỗi do API trả về và đưa ô về giá trị đã tải', async () => {
    const current = clinicInfo();
    fetchMock.mockResolvedValueOnce(response(current)).mockResolvedValueOnce(
      response(
        {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          thongBao: 'Dữ liệu không hợp lệ.',
          loi: [{ truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' }],
        },
        400,
      ),
    );
    renderPage();
    await screen.findByDisplayValue('CLINIX Clinic');

    editBrandName();
    fireEvent.click(saveButton());
    expect(
      await screen.findByText('Email liên hệ chung không đúng định dạng.'),
    ).toBeInTheDocument();

    fireEvent.click(cancelButton());

    expect(
      screen.queryByText('Email liên hệ chung không đúng định dạng.'),
    ).toBeNull();
    expect(screen.getByLabelText(/Email liên hệ chung/)).toHaveAttribute(
      'aria-invalid',
      'false',
    );
    expect(screen.getByLabelText(/Tên thương hiệu/)).toHaveValue(
      current.tenThuongHieu,
    );
  });

  it('AF4-08 lưu lỗi mạng rồi Hủy: bỏ thông báo lỗi chung và trả về giá trị đã tải', async () => {
    fetchMock
      .mockResolvedValueOnce(response(clinicInfo()))
      .mockRejectedValueOnce(new Error('connection lost'));
    renderPage();
    await screen.findByDisplayValue('CLINIX Clinic');

    editBrandName();
    fireEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng.',
    );

    fireEvent.click(cancelButton());

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText(/Tên thương hiệu/)).toHaveValue(
      'CLINIX Clinic',
    );
  });

  it('AF4-08 sau khi lưu thành công, Hủy trả về giá trị VỪA LƯU chứ không phải giá trị tải ban đầu; dòng "Đã lưu" và Hủy không cùng hiện', async () => {
    const current = clinicInfo();
    fetchMock
      .mockResolvedValueOnce(response(current))
      .mockResolvedValueOnce(response({ ...current, tenThuongHieu: 'CLINIX' }));
    renderPage();
    await screen.findByDisplayValue('CLINIX Clinic');

    editBrandName('CLINIX');
    fireEvent.click(saveButton());
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã lưu thông tin chung.',
    );
    expect(cancelButton()).toBeDisabled();
    expect(saveButton()).toBeDisabled();

    editBrandName('Khác nữa');
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(cancelButton());

    expect(screen.getByLabelText(/Tên thương hiệu/)).toHaveValue('CLINIX');
  });

  it('AF4-08 đang lưu thì Hủy cũng bị khóa', async () => {
    let finishSave!: (value: Response) => void;
    fetchMock
      .mockResolvedValueOnce(response(clinicInfo()))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishSave = resolve;
          }),
      );
    renderPage();
    await screen.findByDisplayValue('CLINIX Clinic');

    editBrandName();
    fireEvent.click(saveButton());

    expect(
      await screen.findByRole('button', { name: 'Đang lưu…' }),
    ).toBeDisabled();
    expect(cancelButton()).toBeDisabled();

    finishSave(response(clinicInfo({ tenThuongHieu: 'CLINIX Mới' })));
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('AF4-08 Admin Chi nhánh (chỉ đọc) không có nút Hủy lẫn nút Lưu', async () => {
    fetchMock.mockResolvedValueOnce(response(clinicInfo()));
    renderPage({
      phamVi: 'ChiNhanh',
      chiNhanh: { id: '1', ten: 'Chi nhánh Quận 3' },
    });
    await screen.findByDisplayValue('CLINIX Clinic');

    expect(screen.queryByRole('button', { name: 'Hủy' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Lưu thông tin chung' }),
    ).toBeNull();
  });
});
