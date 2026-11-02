import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ApiError } from '../../../shared/api/errors';
import { AdminMeProvider } from '../admin-me-context';
import { SpecialtyDialog } from './specialty-dialog';
import { SpecialtyPage } from './specialty-page';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  setStatus: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('./specialty-service', () => ({
  createSpecialty: mocks.create,
  listSpecialties: mocks.list,
  setSpecialtyStatus: mocks.setStatus,
  updateSpecialty: mocks.update,
  uploadSpecialtyImage: mocks.upload,
}));

const ITEM = {
  chuyenKhoaId: '12',
  ten: 'Tim mạch',
  moTa: 'Khám và điều trị bệnh tim mạch.',
  anhDaiDien: null,
  trangThaiHoatDong: 'DangHoatDong' as const,
  soBacSi: 3,
};

function renderPage(phamVi: 'ToanHeThong' | 'ChiNhanh') {
  return render(
    <AdminMeProvider
      value={
        phamVi === 'ToanHeThong'
          ? { phamVi }
          : { phamVi, chiNhanh: { id: '4', ten: 'Chi nhánh 4' } }
      }
    >
      <MemoryRouter>
        <SpecialtyPage />
      </MemoryRouter>
    </AdminMeProvider>,
  );
}

describe('Admin specialty feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({
      items: [ITEM],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    mocks.setStatus.mockResolvedValue({ ...ITEM, trangThaiHoatDong: 'NgungHoatDong' });
  });

  it('AF2-01 Admin Chi nhánh xem danh sách nhưng không có thao tác ghi', async () => {
    renderPage('ChiNhanh');

    expect(
      await screen.findByText(
        'Quản lý chuyên khoa chỉ dành cho Admin toàn hệ thống. Bạn có thể xem danh sách nhưng không thể thêm hoặc sửa.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Tim mạch')).toBeInTheDocument();
    expect(screen.getByText('Chỉ xem')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Thêm chuyên khoa' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Chỉnh sửa Tim mạch' }),
    ).not.toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith(
      { page: 1, pageSize: 20, q: undefined, trangThaiHoatDong: undefined },
      expect.any(AbortSignal),
    );
  });

  it('AF2-02 Admin Toàn hệ thống mở form tạo; trạng thái mặc định không thể bỏ chọn', async () => {
    renderPage('ToanHeThong');

    expect(await screen.findByText('Tim mạch')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm chuyên khoa' }));

    const status = screen.getByRole('checkbox', { name: 'Đang hoạt động' });
    expect(status).toBeChecked();
    expect(status).toBeDisabled();
    expect(
      screen.getByText('Chuyên khoa mới luôn được tạo ở trạng thái hoạt động.'),
    ).toBeInTheDocument();
  });

  it('AF2-03 đổi trạng thái gọi endpoint riêng rồi tải lại danh sách', async () => {
    renderPage('ToanHeThong');

    expect(await screen.findByText('Tim mạch')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Ngừng hoạt động Tim mạch' }),
    );

    await waitFor(() => expect(mocks.setStatus).toHaveBeenCalledWith('12', 'NgungHoatDong'));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
  });

  it('tìm kiếm và lọc trạng thái gửi query mới, đặt lại về trang đầu', async () => {
    mocks.list.mockResolvedValue({
      items: [ITEM],
      total: 21,
      page: 1,
      pageSize: 20,
    });
    renderPage('ToanHeThong');

    expect(await screen.findByText('Tim mạch')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => {
      expect(mocks.list).toHaveBeenLastCalledWith(
        { page: 2, pageSize: 20, q: undefined, trangThaiHoatDong: undefined },
        expect.any(AbortSignal),
      );
    });

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'tim' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc trạng thái' }), {
      target: { value: 'NgungHoatDong' },
    });

    await waitFor(
      () => {
        expect(mocks.list).toHaveBeenLastCalledWith(
          {
            page: 1,
            pageSize: 20,
            q: 'tim',
            trangThaiHoatDong: 'NgungHoatDong',
          },
          expect.any(AbortSignal),
        );
      },
      { timeout: 2000 },
    );
  });
});

describe('SpecialtyDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CK-15/AF2-04 lỗi trùng tên hiện tại ô tên và giữ nguyên dữ liệu nhập', async () => {
    mocks.create.mockRejectedValue(
      new ApiError(409, {
        maLoi: 'TEN_CHUYEN_KHOA_TRUNG',
        thongBao: 'Tên chuyên khoa đã tồn tại.',
      }),
    );
    const onSaved = vi.fn();
    render(
      <SpecialtyDialog
        open
        specialty={null}
        onClose={vi.fn()}
        onSaved={onSaved}
        onPartialSaved={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Tên chuyên khoa/), {
      target: { value: '  Tim mạch  ' },
    });
    fireEvent.change(screen.getByLabelText('Mô tả'), {
      target: { value: 'Mô tả cần được giữ sau lỗi.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(
      await screen.findByText('Tên chuyên khoa đã tồn tại. Vui lòng chọn tên khác.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Tên chuyên khoa/)).toHaveValue('  Tim mạch  ');
    expect(screen.getByLabelText('Mô tả')).toHaveValue(
      'Mô tả cần được giữ sau lỗi.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('CK-15/AF2-04 lỗi trùng khi sửa giữ ảnh, trạng thái và nội dung đang nhập', async () => {
    mocks.update.mockRejectedValue(
      new ApiError(409, {
        maLoi: 'TEN_CHUYEN_KHOA_TRUNG',
        thongBao: 'Tên chuyên khoa đã tồn tại.',
      }),
    );
    const onPartialSaved = vi.fn();
    render(
      <SpecialtyDialog
        open
        specialty={{
          ...ITEM,
          anhDaiDien: 'https://images.example.test/current.webp',
        }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onPartialSaved={onPartialSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Tên chuyên khoa/), {
      target: { value: 'Thần kinh học' },
    });
    fireEvent.change(screen.getByLabelText('Mô tả'), {
      target: { value: 'Mô tả sau chỉnh sửa.' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Đang hoạt động' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(
      await screen.findByText('Tên chuyên khoa đã tồn tại. Vui lòng chọn tên khác.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Tên chuyên khoa/)).toHaveValue('Thần kinh học');
    expect(screen.getByLabelText('Mô tả')).toHaveValue('Mô tả sau chỉnh sửa.');
    expect(screen.getByRole('checkbox', { name: 'Đang hoạt động' })).not.toBeChecked();
    expect(
      screen.getByRole('img', { name: 'Ảnh đại diện chuyên khoa' }),
    ).toHaveAttribute('src', 'https://images.example.test/current.webp');
    expect(onPartialSaved).not.toHaveBeenCalled();
  });

  it('AF2-05 sửa trạng thái dùng PATCH riêng và không gửi PATCH rỗng', async () => {
    mocks.setStatus.mockResolvedValue({
      ...ITEM,
      trangThaiHoatDong: 'NgungHoatDong',
    });
    const onSaved = vi.fn();
    render(
      <SpecialtyDialog
        open
        specialty={ITEM}
        onClose={vi.fn()}
        onSaved={onSaved}
        onPartialSaved={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Đang hoạt động' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => {
      expect(mocks.setStatus).toHaveBeenCalledWith('12', 'NgungHoatDong');
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('AF2-06 upload ảnh dùng uploadId, không đưa URL ảnh vào payload tạo', async () => {
    mocks.upload.mockResolvedValue({
      uploadId: 'upload-uuid',
      url: 'https://images.example.test/specialty.webp',
      expiresAt: '2026-11-03T00:00:00.000Z',
    });
    mocks.create.mockResolvedValue(ITEM);
    render(
      <SpecialtyDialog
        open
        specialty={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onPartialSaved={vi.fn()}
      />,
    );

    const file = new File(['image bytes'], 'specialty.png', {
      type: 'image/png',
    });
    fireEvent.change(document.getElementById('specialty-image')!, {
      target: { files: [file] },
    });
    expect(
      await screen.findByRole('img', { name: 'Ảnh đại diện chuyên khoa' }),
    ).toHaveAttribute('src', 'https://images.example.test/specialty.webp');

    fireEvent.change(screen.getByLabelText(/Tên chuyên khoa/), {
      target: { value: 'Thần kinh học' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => {
      expect(mocks.create).toHaveBeenCalledWith({
        ten: 'Thần kinh học',
        moTa: null,
        imageUploadId: 'upload-uuid',
      });
    });
  });
});
