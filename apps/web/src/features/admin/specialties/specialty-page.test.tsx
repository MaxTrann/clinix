import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ApiError, NetworkError } from '../../../shared/api/errors';
import { AdminMeProvider } from '../admin-me-context';
import { SpecialtyDialog } from './specialty-dialog';
import { SpecialtyPage } from './specialty-page';
import styles from './specialty.module.css';

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
    // PR1 mục 3: bấm icon chỉ mở popup xác nhận, PATCH chỉ gửi sau khi bấm "Ngừng hoạt động" trong popup
    expect(mocks.setStatus).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Ngừng hoạt động',
      }),
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

const INACTIVE = {
  chuyenKhoaId: '15',
  ten: 'Da liễu',
  moTa: null,
  anhDaiDien: null,
  trangThaiHoatDong: 'NgungHoatDong' as const,
  soBacSi: 0,
};

describe('Admin specialty status popup (AF2-07, AF2-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({
      items: [ITEM, INACTIVE],
      total: 2,
      page: 1,
      pageSize: 20,
    });
    mocks.setStatus.mockResolvedValue({
      ...ITEM,
      trangThaiHoatDong: 'NgungHoatDong',
    });
  });

  async function openStopPopup() {
    renderPage('ToanHeThong');
    expect(await screen.findByText('Tim mạch')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Ngừng hoạt động Tim mạch' }),
    );
    return screen.getByRole('dialog', { name: 'Ngừng hoạt động chuyên khoa?' });
  }

  it('AF2-07 bấm Ngừng hoạt động chỉ mở popup: chưa gọi API, tên in đậm, ghi chú số bác sĩ (Figma 733:2)', async () => {
    const dialog = await openStopPopup();

    expect(mocks.setStatus).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Tim mạch').tagName).toBe('STRONG');
    expect(
      within(dialog).getByText(
        /sẽ được tạm dừng và ẩn khỏi kết quả tìm kiếm\/đặt lịch dành cho bệnh nhân\./,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('note')).toHaveTextContent(
      '3 bác sĩ thuộc chuyên khoa này vẫn giữ nguyên hồ sơ. Chuyên khoa không bị xóa hay gỡ liên kết.',
    );
    expect(
      within(dialog).getByRole('button', { name: 'Hủy' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Ngừng hoạt động' }),
    ).toBeInTheDocument();
  });

  it('AF2-07 chuyên khoa chưa có bác sĩ: ghi chú bỏ vế bác sĩ, chỉ còn câu không bị xóa hay gỡ liên kết', async () => {
    mocks.list.mockResolvedValue({
      items: [{ ...ITEM, soBacSi: 0 }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    const dialog = await openStopPopup();

    expect(within(dialog).getByRole('note')).toHaveTextContent(
      'Chuyên khoa không bị xóa hay gỡ liên kết.',
    );
    expect(within(dialog).queryByText(/bác sĩ thuộc chuyên khoa/)).toBeNull();
  });

  it('AF2-07 Hủy đóng popup, không gọi API và không tải lại danh sách', async () => {
    const dialog = await openStopPopup();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.setStatus).not.toHaveBeenCalled();
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it('AF2-07 Esc đóng popup, không gọi API và không tải lại danh sách', async () => {
    await openStopPopup();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.setStatus).not.toHaveBeenCalled();
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it('AF2-07 xác nhận gọi PATCH NgungHoatDong đúng một lần, đóng popup rồi tải lại danh sách', async () => {
    const dialog = await openStopPopup();

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Ngừng hoạt động' }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mocks.setStatus).toHaveBeenCalledExactlyOnceWith(
      '12',
      'NgungHoatDong',
    );
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
  });

  it('AF2-07 đang gửi: nút khóa, Esc không đóng popup, bấm lần hai không gọi thêm', async () => {
    let finish!: (value: unknown) => void;
    mocks.setStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const dialog = await openStopPopup();

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Ngừng hoạt động' }),
    );

    const busy = await within(dialog).findByRole('button', {
      name: 'Đang xử lý…',
    });
    expect(busy).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Hủy' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(busy);
    expect(mocks.setStatus).toHaveBeenCalledTimes(1);

    finish({ ...ITEM, trangThaiHoatDong: 'NgungHoatDong' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
  });

  it('AF2-07 lỗi 403: báo thiếu quyền, đóng popup và không tải lại danh sách', async () => {
    mocks.setStatus.mockRejectedValue(
      new ApiError(403, {
        maLoi: 'KHONG_DU_QUYEN',
        thongBao: 'Không đủ quyền.',
      }),
    );
    const dialog = await openStopPopup();

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Ngừng hoạt động' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bạn không có quyền đổi trạng thái chuyên khoa.',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it('AF2-07 lỗi khác: báo lỗi chung, đóng popup và không tải lại danh sách', async () => {
    mocks.setStatus.mockRejectedValue(new Error('boom'));
    const dialog = await openStopPopup();

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Ngừng hoạt động' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không đổi được trạng thái chuyên khoa. Vui lòng thử lại.',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it('AF2-07 ca âm: chuyên khoa đang ngừng bấm Kích hoạt gọi API ngay, không có popup (Đại chốt 16/11/2026)', async () => {
    mocks.setStatus.mockResolvedValue({
      ...INACTIVE,
      trangThaiHoatDong: 'DangHoatDong',
    });
    renderPage('ToanHeThong');
    expect(await screen.findByText('Da liễu')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kích hoạt Da liễu' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(mocks.setStatus).toHaveBeenCalledExactlyOnceWith(
        '15',
        'DangHoatDong',
      ),
    );
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
  });

  it('AF2-08 nút Chỉnh sửa dùng cùng icon bút chì và màu với trang Loại dịch vụ khám (đồng bộ, không còn edit.svg xám)', async () => {
    const { container } = renderPage('ToanHeThong');
    expect(await screen.findByText('Tim mạch')).toBeInTheDocument();

    const edit = screen.getByRole('button', { name: 'Chỉnh sửa Tim mạch' });

    expect(edit).toHaveAttribute('title', 'Chỉnh sửa');
    expect(edit.querySelector('svg')).toHaveClass('lucide-pencil');
    expect(edit).toHaveClass(styles.editAction);
    expect(
      container.querySelector('img[src$="specialties/edit.svg"]'),
    ).toBeNull();
  });

  it('AF2-08 icon theo trạng thái: đang hoạt động là tạm dừng tông cam, đang ngừng là phát tông xanh; giữ aria-label và title', async () => {
    const { container } = renderPage('ToanHeThong');
    expect(await screen.findByText('Tim mạch')).toBeInTheDocument();

    const stop = screen.getByRole('button', {
      name: 'Ngừng hoạt động Tim mạch',
    });
    expect(stop).toHaveAttribute('title', 'Ngừng hoạt động');
    expect(stop.querySelector('svg')).toHaveClass('lucide-circle-pause');
    expect(stop).toHaveClass(styles.pauseAction);
    expect(stop).not.toHaveClass(styles.resumeAction);

    const resume = screen.getByRole('button', { name: 'Kích hoạt Da liễu' });
    expect(resume).toHaveAttribute('title', 'Kích hoạt');
    expect(resume.querySelector('svg')).toHaveClass('lucide-circle-play');
    expect(resume).toHaveClass(styles.resumeAction);
    expect(resume).not.toHaveClass(styles.pauseAction);

    expect(container.querySelector('img[src$="toggle-status.svg"]')).toBeNull();
  });
});

describe('SpecialtyDialog lỗi tải ảnh lên (AF2-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderCreateDialog() {
    render(
      <SpecialtyDialog
        open
        specialty={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onPartialSaved={vi.fn()}
      />,
    );
  }

  function pickImage() {
    const file = new File(['image bytes'], 'specialty.png', {
      type: 'image/png',
    });
    fireEvent.change(document.getElementById('specialty-image')!, {
      target: { files: [file] },
    });
  }

  it.each([
    [
      'ảnh gốc quá dung lượng (giữ câu có sẵn)',
      new ApiError(413, { maLoi: 'ANH_QUA_DUNG_LUONG', thongBao: 'x' }),
      'Ảnh gốc không được vượt quá 10 MB.',
    ],
    [
      'mã lỗi lạ',
      new ApiError(400, { maLoi: 'MA_LA', thongBao: 'x' }),
      'Không tải được ảnh lên. Vui lòng thử lại.',
    ],
    [
      'LOI_HE_THONG 503 (thiếu cấu hình hoặc nhà cung cấp ảnh lỗi)',
      new ApiError(503, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
      'Tính năng tải ảnh hiện chưa sẵn sàng. Vui lòng thử lại sau hoặc lưu chuyên khoa không kèm ảnh.',
    ],
    [
      'LOI_HE_THONG 504 (chọn câu theo mã lỗi, không theo mã HTTP)',
      new ApiError(504, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
      'Tính năng tải ảnh hiện chưa sẵn sàng. Vui lòng thử lại sau hoặc lưu chuyên khoa không kèm ảnh.',
    ],
    [
      'lỗi không phải ApiError',
      new Error('boom'),
      'Không tải được ảnh lên. Vui lòng thử lại.',
    ],
    [
      'mất kết nối (giữ câu có sẵn)',
      new NetworkError(),
      'Chưa nhận được xác nhận từ máy chủ. Ảnh đang gắn vẫn được giữ nguyên.',
    ],
  ])('AF2-09 %s', async (_name, error, expected) => {
    mocks.upload.mockRejectedValue(error);
    renderCreateDialog();

    pickImage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(expected);
    expect(alert).not.toHaveTextContent('Không lưu được chuyên khoa');
    expect(screen.getByText(/Kéo thả ảnh vào đây/)).toBeInTheDocument();
  });

  it('AF2-09 ca âm: lỗi LƯU chuyên khoa vẫn dùng câu của thao tác lưu', async () => {
    mocks.create.mockRejectedValue(
      new ApiError(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
    );
    renderCreateDialog();

    fireEvent.change(screen.getByLabelText(/Tên chuyên khoa/), {
      target: { value: 'Thần kinh học' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không lưu được chuyên khoa. Vui lòng thử lại.',
    );
  });
});
