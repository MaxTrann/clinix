import { fireEvent, render, screen, within } from '@testing-library/react';
import { AdminMeProvider } from '../admin-me-context';
import { BranchPage } from './branch-page';
import type {
  Branch,
  BranchSchedule,
  BranchUpdateResult,
} from './branch-types';

// Admin F6b — CN-89, CN-27b: form Sửa lịch / dịch vụ (Figma 544:2) mở ngay dưới thẻ, điền sẵn dữ liệu đang áp dụng, gửi PATCH (B8),
// báo phần đã lưu ngay và phần chờ duyệt (Q2), lỗi nghiệp vụ theo PLAN admin 5.9. API giả theo URL; không gọi máy chủ thật.

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function branch(overrides: Partial<Branch> = {}): Branch {
  const schedule: BranchSchedule[] = Array.from({ length: 7 }, (_, i) => ({
    thuTrongTuan: i + 1,
    hoatDong: i < 6,
    sang: i < 6 ? { batDau: '08:00:00', ketThuc: '11:30:00' } : null,
    chieu: i < 5 ? { batDau: '13:30:00', ketThuc: '17:00:00' } : null,
  }));
  return {
    chiNhanhId: '25',
    ten: 'Chi nhánh Quận 3',
    diaChi: '123 Nguyễn Thị Minh Khai',
    toaDoLat: '10.7769',
    toaDoLng: '106.6920',
    lichHoatDong: schedule,
    dichVuKham: [{ dichVuKhamId: '4', ten: 'Tim mạch' }],
    coYeuCauDangMo: false,
    ...overrides,
  };
}

const services = [
  {
    dichVuKhamId: '4',
    nhomDichVuId: '1',
    tenNhom: 'Chuyên khoa',
    ten: 'Tim mạch',
    thoiLuong: 30,
    giaMacDinh: '200000',
  },
  {
    dichVuKhamId: '5',
    nhomDichVuId: '1',
    tenNhom: 'Chuyên khoa',
    ten: 'Nhi khoa',
    thoiLuong: 30,
    giaMacDinh: '200000',
  },
];

const empty = { items: [], tong: 0 };
const fetchMock = vi.fn<typeof fetch>();
let patchResponse: () => Response;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation((input, init) => {
    const url = String(input);
    if (init?.method === 'PATCH') return Promise.resolve(patchResponse());
    if (url.startsWith('/api/admin/services'))
      return Promise.resolve(
        response({ items: services, total: 2, page: 1, pageSize: 100 }),
      );
    return Promise.resolve(
      response({ items: [branch()], total: 1, page: 1, pageSize: 20 }),
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function updateResult(
  overrides: Partial<BranchUpdateResult> = {},
): BranchUpdateResult {
  return {
    chiNhanh: branch(),
    daLuu: [],
    yeuCau: null,
    anhHuong: { lichHen: empty, ca: empty },
    canhBao: { khungGioTrongNgoaiLich: empty },
    ...overrides,
  };
}

async function openEdit(phamVi: 'ToanHeThong' | 'ChiNhanh' = 'ToanHeThong') {
  render(
    <AdminMeProvider
      value={
        phamVi === 'ToanHeThong'
          ? { phamVi }
          : { phamVi, chiNhanh: { id: '25', ten: 'Chi nhánh Quận 3' } }
      }
    >
      <BranchPage />
    </AdminMeProvider>,
  );
  const card = await screen.findByRole('article', { name: 'Chi nhánh Quận 3' });
  fireEvent.click(
    within(card).getByRole('button', { name: 'Sửa lịch / dịch vụ' }),
  );
  const form = screen.getByRole('form', { name: 'Sửa: Chi nhánh Quận 3' });
  await within(form).findByRole('checkbox', { name: 'Nhi khoa' });
  return form;
}

const patchCalls = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');

describe('CN-89 Sửa lịch / dịch vụ (F6b)', () => {
  it('AF6B-05 mở form ngay dưới thẻ, điền sẵn tên, địa chỉ, tọa độ, giờ (HH:mm) và dịch vụ đang có; nút đổi thành "Hủy"', async () => {
    const form = await openEdit();
    expect(
      within(form).getByRole('textbox', { name: /Tên chi nhánh/ }),
    ).toHaveValue('Chi nhánh Quận 3');
    expect(within(form).getByRole('textbox', { name: /Địa chỉ/ })).toHaveValue(
      '123 Nguyễn Thị Minh Khai',
    );
    expect(within(form).getByRole('textbox', { name: /Vĩ độ/ })).toHaveValue(
      '10.7769',
    );
    expect(within(form).getByLabelText('Thứ 2 buổi sáng bắt đầu')).toHaveValue(
      '08:00',
    );
    expect(
      within(form).getByLabelText('Thứ 6 buổi chiều kết thúc'),
    ).toHaveValue('17:00');
    // CN đang nghỉ: không có ô giờ
    expect(within(form).queryByLabelText('CN buổi sáng bắt đầu')).toBeNull();
    expect(
      within(form).getByRole('checkbox', { name: 'Tim mạch' }),
    ).toBeChecked();
    expect(
      within(form).getByRole('checkbox', { name: 'Nhi khoa' }),
    ).not.toBeChecked();

    const card = screen.getByRole('article', { name: 'Chi nhánh Quận 3' });
    const toggle = within(card).getByRole('button', { name: 'Hủy' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(
      screen.queryByRole('form', { name: 'Sửa: Chi nhánh Quận 3' }),
    ).toBeNull();
  });

  it('AF6B-06 Lưu gửi PATCH đúng chi nhánh với đủ 7 thứ và danh sách dịch vụ đầy đủ; không ảnh hưởng ⇒ báo "Đã lưu ngay", đóng form', async () => {
    patchResponse = () =>
      response(updateResult({ daLuu: ['lichHoatDong', 'dichVuKham'] }));
    const form = await openEdit();
    fireEvent.click(within(form).getByRole('checkbox', { name: 'Nhi khoa' }));
    fireEvent.click(
      within(form).getByRole('button', { name: 'Lưu chi nhánh' }),
    );

    expect(
      await screen.findByText('Đã lưu ngay: lịch hoạt động, dịch vụ khả dụng.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: /Sửa:/ })).toBeNull();
    const [call] = patchCalls();
    expect(call?.[0]).toBe('/api/admin/branches/25');
    const body = JSON.parse(String(call?.[1]?.body)) as {
      lichHoatDong: unknown[];
      dichVuKhamIds: string[];
      toaDoLat: string;
    };
    expect(body.lichHoatDong).toHaveLength(7);
    expect(body.lichHoatDong[0]).toEqual({
      thuTrongTuan: 1,
      hoatDong: true,
      sang: { batDau: '08:00', ketThuc: '11:30' },
      chieu: { batDau: '13:30', ketThuc: '17:00' },
    });
    expect(body.lichHoatDong[6]).toEqual({ thuTrongTuan: 7, hoatDong: false });
    expect(body.dichVuKhamIds).toEqual(['4', '5']);
    expect(body.toaDoLat).toBe('10.7769');
  });

  it('AF6B-07 CN-27b có ảnh hưởng ⇒ báo riêng phần đã lưu ngay và phần đã gửi chờ duyệt', async () => {
    patchResponse = () =>
      response(
        updateResult({
          daLuu: ['ten'],
          yeuCau: {
            yeuCauThayDoiChiNhanhId: '9',
            trangThai: 'ChoDuyet',
            thuThayDoi: [1],
            dichVuThem: [],
            dichVuBo: [],
          },
          anhHuong: { lichHen: { items: [], tong: 2 }, ca: empty },
        }),
      );
    const form = await openEdit();
    fireEvent.click(
      within(form).getByRole('button', { name: 'Lưu chi nhánh' }),
    );
    const status = await screen.findByText('Đã lưu ngay: tên.');
    const summary = status.closest('[role="status"]');
    expect(summary).toHaveTextContent(
      'Đã gửi yêu cầu thay đổi chờ Quản trị viên Toàn hệ thống duyệt (lịch Thứ 2), vì có 2 lịch hẹn và 0 ca làm việc bị ảnh hưởng. Phần này chưa áp dụng.',
    );
  });

  it.each([
    [
      'YEU_CAU_DANG_CHO',
      409,
      'Chi nhánh đang có yêu cầu thay đổi chưa hoàn tất. Vui lòng chờ xử lý xong.',
    ],
    [
      'DICH_VU_CON_BAC_SI',
      409,
      'Không thể bỏ dịch vụ: còn bác sĩ đang dùng làm dịch vụ khám chính.',
    ],
    ['KHONG_CO_THAY_DOI', 400, 'Không có thay đổi nào để lưu.'],
    ['KHONG_DU_QUYEN', 403, 'Bạn không có quyền sửa chi nhánh này.'],
  ])(
    'AF6B-08 lỗi %s ⇒ câu thông báo đúng PLAN 5.9, form vẫn mở để sửa tiếp',
    async (maLoi, status, message) => {
      patchResponse = () => response({ maLoi, thongBao: 'x' }, status);
      const form = await openEdit();
      fireEvent.click(
        within(form).getByRole('button', { name: 'Lưu chi nhánh' }),
      );
      expect(await within(form).findByText(message)).toBeInTheDocument();
      expect(
        screen.getByRole('form', { name: 'Sửa: Chi nhánh Quận 3' }),
      ).toBeInTheDocument();
    },
  );

  it('AF6B-08 lỗi lịch theo thứ từ máy chủ hiện ở đúng thứ (dùng chung bộ xử lý của F6a)', async () => {
    patchResponse = () =>
      response(
        {
          maLoi: 'LICH_HOAT_DONG_KHONG_HOP_LE',
          thongBao: 'x',
          chiTiet: [{ thu: 2, maLoi: 'KHONG_CO_KHOANG' }],
        },
        400,
      );
    const form = await openEdit();
    fireEvent.click(
      within(form).getByRole('button', { name: 'Lưu chi nhánh' }),
    );
    expect(await within(form).findByText(/^Thứ 3:/)).toBeInTheDocument();
  });

  it('AF6B-09 Admin Chi nhánh cũng mở được form Sửa của chi nhánh mình (phạm vi kiểm ở máy chủ, B8)', async () => {
    const form = await openEdit('ChiNhanh');
    expect(form).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm chi nhánh' })).toBeNull();
  });
});
