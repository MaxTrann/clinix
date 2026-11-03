import { fireEvent, render, screen } from '@testing-library/react';
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

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ClinicInfoPage (F4)', () => {
  it('AF4-02 tải bốn giá trị từ B4 và hiển thị các tab theo Figma', async () => {
    fetchMock.mockResolvedValueOnce(response(clinicInfo()));
    render(<ClinicInfoPage />);

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
    render(<ClinicInfoPage />);

    expect(await screen.findByLabelText(/Tên thương hiệu/)).toHaveValue('');
    expect(screen.getByLabelText(/Địa chỉ trụ sở chính/)).toHaveValue('');
    expect(screen.getByLabelText(/Đường dây nóng/)).toHaveValue('');
    expect(screen.getByLabelText(/Email liên hệ chung/)).toHaveValue('');
  });

  it('AF4-03 chặn hotline sai định dạng trước khi gửi PUT', async () => {
    fetchMock.mockResolvedValueOnce(response(clinicInfo()));
    render(<ClinicInfoPage />);
    await screen.findByLabelText(/Tên thương hiệu/);

    fireEvent.change(screen.getByLabelText(/Đường dây nóng/), {
      target: { value: '12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin chung' }));

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
    render(<ClinicInfoPage />);
    await screen.findByDisplayValue('CLINIX Clinic');

    fireEvent.change(screen.getByLabelText(/Tên thương hiệu/), {
      target: { value: 'CLINIX' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin chung' }));

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
    fetchMock
      .mockResolvedValueOnce(response(current))
      .mockResolvedValueOnce(
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
    render(<ClinicInfoPage />);
    await screen.findByDisplayValue('CLINIX Clinic');

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin chung' }));

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
    fetchMock
      .mockResolvedValueOnce(response(current))
      .mockResolvedValueOnce(
        response(
          {
            maLoi: 'DU_LIEU_KHONG_HOP_LE',
            thongBao: 'Dữ liệu không hợp lệ.',
            loi: [{ truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' }],
          },
          400,
        ),
      );
    render(<ClinicInfoPage />);
    await screen.findByDisplayValue('CLINIX Clinic');

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin chung' }));

    expect(
      await screen.findByText(
        'Email liên hệ chung không đúng định dạng.',
      ),
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
    render(<ClinicInfoPage />);

    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByDisplayValue('CLINIX Clinic')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('AF4-05 không tự gửi lại PUT khi mất kết nối', async () => {
    fetchMock
      .mockResolvedValueOnce(response(clinicInfo()))
      .mockRejectedValueOnce(new Error('connection lost'));
    render(<ClinicInfoPage />);
    await screen.findByDisplayValue('CLINIX Clinic');

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin chung' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('AF4-06 khóa nút trong lúc PUT đang chờ và không gửi lần hai', async () => {
    const current = clinicInfo();
    let finishSave!: (value: Response) => void;
    fetchMock
      .mockResolvedValueOnce(response(current))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishSave = resolve;
          }),
      );
    render(<ClinicInfoPage />);
    await screen.findByDisplayValue('CLINIX Clinic');

    const saveButton = screen.getByRole('button', {
      name: 'Lưu thông tin chung',
    });
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
