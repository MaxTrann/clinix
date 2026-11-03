import { fireEvent, render, screen } from '@testing-library/react';
import { AdminMeProvider } from '../admin-me-context';
import { BranchPage } from './branch-page';
import type { Branch, BranchSchedule } from './branch-types';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function branch(overrides: Partial<Branch> = {}): Branch {
  const schedule: BranchSchedule[] = Array.from({ length: 7 }, (_, index) => ({
    thuTrongTuan: index + 1,
    hoatDong: index < 6,
    sang: index < 6 ? { batDau: '08:00:00', ketThuc: '11:30:00' } : null,
    chieu: index < 5 ? { batDau: '13:30:00', ketThuc: '17:00:00' } : null,
  }));
  return {
    chiNhanhId: '25',
    ten: 'CLINIX Chi nhánh Quận 3',
    diaChi: '123 Nguyễn Thị Minh Khai, Q.3, TP.HCM',
    toaDoLat: '10.7769',
    toaDoLng: '106.6920',
    lichHoatDong: schedule,
    dichVuKham: [{ dichVuKhamId: '4', ten: 'Tim mạch' }],
    coYeuCauDangMo: false,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <AdminMeProvider value={{ phamVi: 'ToanHeThong' }}>
      <BranchPage />
    </AdminMeProvider>,
  );
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BranchPage (F6a)', () => {
  it('CN b1–b2 loads branch cards and searches through the B7 paged endpoint', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({ items: [branch()], total: 1, page: 1, pageSize: 20 }),
      )
      .mockResolvedValueOnce(
        response({ items: [], total: 0, page: 1, pageSize: 20 }),
      );
    renderPage();

    expect(
      await screen.findByRole('article', { name: 'CLINIX Chi nhánh Quận 3' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 dịch vụ')).toBeInTheDocument();
    expect(
      screen.getByText(/Thứ 2: S: 08:00–11:30, C: 13:30–17:00/),
    ).toBeInTheDocument();
    expect(screen.getByText('10.7769, 106.6920')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm chi nhánh' }), {
      target: { value: 'Quận 1' },
    });

    expect(
      await screen.findByText('Không tìm thấy chi nhánh phù hợp.'),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      '/api/admin/branches?page=1&pageSize=20&q=Qu%E1%BA%ADn+1',
    );
  });

  it('CN b1 and CN-03–CN-10 shows schedule errors per day and does not POST an invalid week', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({ items: [], total: 0, page: 1, pageSize: 20 }),
      )
      .mockResolvedValueOnce(
        response({ items: [], total: 0, page: 1, pageSize: 100 }),
      );
    renderPage();
    await screen.findByText('Chưa có chi nhánh nào.');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm chi nhánh' }));
    await screen.findByText(/Có thể tạo chi nhánh mà chưa gán dịch vụ/);

    fireEvent.change(screen.getByRole('textbox', { name: /Tên chi nhánh/ }), {
      target: { value: 'Chi nhánh mới' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /Địa chỉ/ }), {
      target: { value: '1 Đường Mẫu, TP.HCM' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu chi nhánh' }));

    expect(
      await screen.findByText(/Thứ 2: Giờ phải theo định dạng 24 giờ HH:mm\./),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('CN-01 creates a branch with seven ISO weekdays and selected services', async () => {
    const created = branch({ ten: 'Chi nhánh mới', dichVuKham: [] });
    fetchMock
      .mockResolvedValueOnce(
        response({ items: [], total: 0, page: 1, pageSize: 20 }),
      )
      .mockResolvedValueOnce(
        response({
          items: [
            {
              dichVuKhamId: '4',
              nhomDichVuId: '2',
              tenNhom: 'Tim mạch',
              ten: 'Khám tim mạch',
              thoiLuong: 30,
              giaMacDinh: '300000.00',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 100,
        }),
      )
      .mockResolvedValueOnce(response(created, 201))
      .mockResolvedValueOnce(
        response({ items: [created], total: 1, page: 1, pageSize: 20 }),
      );
    renderPage();
    await screen.findByText('Chưa có chi nhánh nào.');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm chi nhánh' }));
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Khám tim mạch' }),
    );

    fireEvent.change(screen.getByRole('textbox', { name: /Tên chi nhánh/ }), {
      target: { value: '  Chi   nhánh mới ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /Địa chỉ/ }), {
      target: { value: '  1 Đường Mẫu, TP.HCM  ' },
    });
    for (const day of ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6']) {
      fireEvent.change(screen.getByLabelText(`${day} buổi sáng bắt đầu`), {
        target: { value: '08:00' },
      });
      fireEvent.change(screen.getByLabelText(`${day} buổi sáng kết thúc`), {
        target: { value: '11:30' },
      });
      fireEvent.change(screen.getByLabelText(`${day} buổi chiều bắt đầu`), {
        target: { value: '13:30' },
      });
      fireEvent.change(screen.getByLabelText(`${day} buổi chiều kết thúc`), {
        target: { value: '17:00' },
      });
    }
    fireEvent.change(screen.getByLabelText('Thứ 7 buổi sáng bắt đầu'), {
      target: { value: '08:00' },
    });
    fireEvent.change(screen.getByLabelText('Thứ 7 buổi sáng kết thúc'), {
      target: { value: '12:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu chi nhánh' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã thêm chi nhánh.',
    );
    expect(
      await screen.findByRole('article', { name: 'Chi nhánh mới' }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const [, options] = fetchMock.mock.calls[2] ?? [];
    expect(options?.method).toBe('POST');
    const body = JSON.parse(String(options?.body)) as {
      ten: string;
      diaChi: string;
      lichHoatDong: Array<{ thuTrongTuan: number; hoatDong: boolean }>;
      dichVuKhamIds: string[];
    };
    expect(body.ten).toBe('Chi nhánh mới');
    expect(body.diaChi).toBe('1 Đường Mẫu, TP.HCM');
    expect(body.lichHoatDong).toHaveLength(7);
    expect(body.lichHoatDong.map((day) => day.thuTrongTuan)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(body.lichHoatDong[5]).toMatchObject({
      thuTrongTuan: 6,
      hoatDong: true,
    });
    expect(body.lichHoatDong[6]).toMatchObject({
      thuTrongTuan: 7,
      hoatDong: false,
    });
    expect(body.dichVuKhamIds).toEqual(['4']);
  });

  it('shows retry when the branch list cannot be loaded', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({ maLoi: 'LOI_HE_THONG', thongBao: 'Lỗi máy chủ.' }, 503),
      )
      .mockResolvedValueOnce(
        response({ items: [], total: 0, page: 1, pageSize: 20 }),
      );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));

    expect(
      await screen.findByText('Chưa có chi nhánh nào.'),
    ).toBeInTheDocument();
  });
});
