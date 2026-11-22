import { fireEvent, render, screen, within } from '@testing-library/react';
import { ChangeRequestsPanel } from './change-requests-panel';
import type {
  ChangeRequestDetail,
  ChangeRequestListItem,
  ChangeRequestStatus,
} from './change-request-types';

// Admin F6b — CN-89, CN-110: khối yêu cầu thay đổi chi nhánh (Figma 542:2, 693:2), Duyệt (546:2), Từ chối (547:2), chi tiết mở rộng.
// API giả theo URL; không gọi máy chủ thật. Đồng hồ giả chỉ cho `Date` (gợi ý mốc sớm nhất).

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function listItem(
  overrides: Partial<ChangeRequestListItem> = {},
): ChangeRequestListItem {
  return {
    yeuCauThayDoiChiNhanhId: '7',
    chiNhanh: { chiNhanhId: '25', ten: 'Chi nhánh Quận 3' },
    nguoiDeXuat: { taiKhoanId: '3', hoTen: 'Phạm Thị Lan' },
    trangThai: 'ChoDuyet',
    thoiDiemTao: '2026-10-18 09:00:00',
    thoiDiemDuyet: null,
    hieuLucTu: null,
    apDungLuc: null,
    quaHanLuc: null,
    thuThayDoi: [1],
    coDoiDichVu: false,
    laCuaToi: false,
    ...overrides,
  };
}

function detail(
  overrides: Partial<ChangeRequestDetail> = {},
): ChangeRequestDetail {
  return {
    ...listItem(),
    nguoiDuyet: null,
    lyDoTuChoi: null,
    soNgayBaoTruoc: null,
    nguoiHuy: null,
    thoiDiemHuy: null,
    lyDoHuy: null,
    soLanDoiHieuLuc: 0,
    noiDung: {
      lichHoatDong: [
        {
          thuTrongTuan: 1,
          truoc: {
            hoatDong: true,
            sang: { batDau: '08:00:00', ketThuc: '11:30:00' },
            chieu: null,
          },
          sau: { hoatDong: false, sang: null, chieu: null },
        },
      ],
      dichVu: {
        truoc: [],
        sau: [],
        them: [],
        bo: [{ dichVuKhamId: '5', ten: 'Nhi khoa' }],
      },
    },
    anhHuong: {
      nguon: 'TinhLai',
      moc: '2026-11-02 07:00:00',
      lichHen: {
        items: [
          {
            lichHenId: '100',
            maLichHen: 'LH-100',
            thoiGian: '2026-11-09 09:00:00',
            lyDoAnhHuong: 'NgayNghi',
          },
        ],
        tong: 51,
      },
      ca: {
        items: [
          {
            lichLamViecId: '8',
            bacSiId: '2',
            ngay: '2026-11-09',
            ca: 'CaSang',
          },
        ],
        tong: 1,
      },
      khungGioTrong: { items: [], tong: 0 },
    },
    thongBao: {
      tongHop: { ChoGui: 0, DaGui: 0, ThatBai: 0, BoQua: 0 },
      items: [],
    },
    ...overrides,
  };
}

const page = (items: ChangeRequestListItem[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
});

const fetchMock = vi.fn<typeof fetch>();
let lists: Partial<Record<ChangeRequestStatus, ChangeRequestListItem[]>>;
let config: unknown;
let detailBody: ChangeRequestDetail;
let actionResponse: () => Response;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 07:00 02/11/2026 giờ Việt Nam
  vi.setSystemTime(new Date('2026-11-02T00:00:00Z'));
  lists = { ChoDuyet: [listItem()] };
  config = { chuaCauHinh: false, soNgayBaoTruocDoiGioLam: 3 };
  detailBody = detail();
  actionResponse = () => response(detail({ trangThai: 'DaDuyet' }));
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation((input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (init?.method === 'POST') return Promise.resolve(actionResponse());
    if (url.pathname === '/api/admin/system-config')
      return Promise.resolve(response(config));
    if (url.pathname === '/api/admin/branch-change-requests') {
      const status = url.searchParams.get('trangThai') as ChangeRequestStatus;
      return Promise.resolve(response(page(lists[status] ?? [])));
    }
    return Promise.resolve(response(detailBody));
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const onChanged = vi.fn();

function renderPanel(isSystemAdmin = true) {
  onChanged.mockReset();
  render(
    <ChangeRequestsPanel
      isSystemAdmin={isSystemAdmin}
      refreshKey={0}
      onChanged={onChanged}
    />,
  );
}

const card = () =>
  screen.findByRole('article', { name: 'Yêu cầu của Chi nhánh Quận 3' });
const calls = (method: string) =>
  fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method);

describe('CN-89 khối yêu cầu thay đổi — Admin Toàn hệ thống', () => {
  it('AF6B-10 ba tab kèm số đếm, nhãn "1 chờ", thẻ có người gửi, ngày gửi, nút Chi tiết, Duyệt, Từ chối', async () => {
    lists = {
      ChoDuyet: [listItem()],
      DaDuyet: [],
      TuChoi: [listItem({ trangThai: 'TuChoi', yeuCauThayDoiChiNhanhId: '6' })],
    };
    renderPanel();
    const item = await card();
    expect(within(item).getByText('Chờ duyệt')).toBeInTheDocument();
    expect(item).toHaveTextContent('Gửi bởi Phạm Thị Lan · 18/10/2026');
    expect(
      within(item).getByRole('button', { name: 'Duyệt' }),
    ).toBeInTheDocument();
    expect(
      within(item).getByRole('button', { name: 'Từ chối' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('1 chờ')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Chờ duyệt (1)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByRole('tab', { name: 'Đã duyệt (0)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Từ chối (1)' }),
    ).toBeInTheDocument();
    // Cấu hình đủ ⇒ không có banner
    expect(screen.queryByText('Chưa cấu hình số ngày báo trước')).toBeNull();
  });

  it('AF6B-11 đổi tab gọi API đúng trạng thái; tab rỗng ⇒ "Không có yêu cầu nào."', async () => {
    renderPanel();
    await card();
    fireEvent.click(screen.getByRole('tab', { name: /Đã duyệt/ }));
    expect(
      await screen.findByText('Không có yêu cầu nào.'),
    ).toBeInTheDocument();
    expect(
      calls('GET').some(([url]) =>
        String(url).includes('trangThai=DaDuyet&page=1'),
      ),
    ).toBe(true);
  });

  it('AF6B-12 banner "Chưa cấu hình số ngày báo trước" và hộp thoại Duyệt báo lỗi, tắt nút xác nhận (Figma 546:2)', async () => {
    config = { chuaCauHinh: true, soNgayBaoTruocDoiGioLam: null };
    renderPanel();
    expect(
      await screen.findByText('Chưa cấu hình số ngày báo trước'),
    ).toBeInTheDocument();
    fireEvent.click(
      within(await card()).getByRole('button', { name: 'Duyệt' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Xác nhận duyệt yêu cầu thay đổi',
    });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Hệ thống chưa được cấu hình',
    );
    expect(
      within(dialog).getByRole('button', { name: 'Xác nhận duyệt' }),
    ).toBeDisabled();
    expect(
      within(dialog).queryByLabelText(/Dự kiến có hiệu lực từ/),
    ).toBeNull();
  });

  it('AF6B-13 Duyệt: gợi ý mốc sớm nhất = bây giờ + N ngày; chưa chọn thời điểm ⇒ báo, không gọi API; chọn ⇒ POST hieuLucTu dạng API, đóng, báo thành công, tải lại', async () => {
    renderPanel();
    fireEvent.click(
      within(await card()).getByRole('button', { name: 'Duyệt' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Xác nhận duyệt yêu cầu thay đổi',
    });
    const input = await within(dialog).findByLabelText(
      /Dự kiến có hiệu lực từ/,
    );
    expect(input).toHaveAttribute('min', '2026-11-05T07:01');
    expect(dialog).toHaveTextContent(
      'Báo trước tối thiểu 3 ngày: sớm nhất 07:01 05/11/2026.',
    );

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Xác nhận duyệt' }),
    );
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Chưa chọn thời điểm',
    );
    expect(calls('POST')).toHaveLength(0);

    fireEvent.change(input, { target: { value: '2026-11-10T08:00' } });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Xác nhận duyệt' }),
    );
    expect(
      await screen.findByText(
        'Đã duyệt yêu cầu của Chi nhánh Quận 3, dự kiến có hiệu lực từ 08:00 10/11/2026.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    const [post] = calls('POST');
    expect(post?.[0]).toBe('/api/admin/branch-change-requests/7/approve');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      hieuLucTu: '2026-11-10 08:00:00',
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      {
        maLoi: 'HIEU_LUC_QUA_SOM',
        thongBao: 'x',
        chiTiet: { mocSomNhat: '2026-11-05 07:00:01' },
      },
      400,
      'Thời điểm có hiệu lực phải từ 07:00 05/11/2026 trở đi.',
    ],
    [
      { maLoi: 'YEU_CAU_KHONG_CON_CHO_DUYET', thongBao: 'x' },
      409,
      'Yêu cầu không còn ở trạng thái chờ duyệt.',
    ],
    [
      { maLoi: 'HE_THONG_CHUA_CAU_HINH', thongBao: 'x' },
      409,
      'Hệ thống chưa được cấu hình',
    ],
  ])(
    'AF6B-14 Duyệt bị máy chủ từ chối (%o) ⇒ khối lỗi trong hộp thoại, hộp thoại vẫn mở',
    async (body, status, text) => {
      actionResponse = () => response(body, status);
      renderPanel();
      fireEvent.click(
        within(await card()).getByRole('button', { name: 'Duyệt' }),
      );
      const dialog = screen.getByRole('dialog');
      fireEvent.change(
        await within(dialog).findByLabelText(/Dự kiến có hiệu lực từ/),
        {
          target: { value: '2026-11-05T07:01' },
        },
      );
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Xác nhận duyệt' }),
      );
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
      expect(onChanged).not.toHaveBeenCalled();
    },
  );

  it('AF6B-15 Từ chối: lý do rỗng (chỉ khoảng trắng) ⇒ báo, không gọi API; có lý do ⇒ POST lyDo đã trim, đóng, báo thành công', async () => {
    renderPanel();
    fireEvent.click(
      within(await card()).getByRole('button', { name: 'Từ chối' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Từ chối yêu cầu thay đổi',
    });
    const reason = within(dialog).getByLabelText(/Lý do từ chối/);
    fireEvent.change(reason, { target: { value: '   ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Vui lòng nhập lý do',
    );
    expect(calls('POST')).toHaveLength(0);

    fireEvent.change(reason, { target: { value: '  Chưa đủ bác sĩ  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Từ chối' }));
    expect(
      await screen.findByText('Đã từ chối yêu cầu của Chi nhánh Quận 3.'),
    ).toBeInTheDocument();
    const [post] = calls('POST');
    expect(post?.[0]).toBe('/api/admin/branch-change-requests/7/reject');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      lyDo: 'Chưa đủ bác sĩ',
    });
  });

  it('AF6B-16 Hủy hoặc Escape đóng hộp thoại, không gọi API', async () => {
    renderPanel();
    fireEvent.click(
      within(await card()).getByRole('button', { name: 'Từ chối' }),
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Hủy' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(
      within(await card()).getByRole('button', { name: 'Duyệt' }),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls('POST')).toHaveLength(0);
  });
});

describe('CN-89, CN-110 chi tiết yêu cầu', () => {
  it('AF6B-17 Chi tiết: so sánh Hiện tại / Đề xuất theo thứ, dịch vụ bỏ, lịch hẹn và ca bị ảnh hưởng (cắt 50, ghi "và N mục khác"), ghi chú phần đã lưu ngay (Q2)', async () => {
    renderPanel();
    const item = await card();
    fireEvent.click(within(item).getByRole('button', { name: 'Chi tiết' }));
    const table = await within(item).findByRole('table', {
      name: 'Lịch hoạt động thay đổi',
    });
    expect(within(table).getByRole('row', { name: /Thứ 2/ })).toHaveTextContent(
      'Thứ 2Sáng 08:00 – 11:30Nghỉ',
    );
    expect(item).toHaveTextContent('Bỏ dịch vụ: Nhi khoa');
    expect(item).toHaveTextContent(
      'LH-100 · 09:00 09/11/2026 · Ngày chuyển sang nghỉ',
    );
    expect(item).toHaveTextContent('… và 50 mục khác');
    expect(item).toHaveTextContent('09/11/2026 · Ca sáng');
    expect(item).toHaveTextContent('Tính lại tại 07:00 02/11/2026.');
    expect(item).toHaveTextContent(
      'Tên, địa chỉ và tọa độ (nếu có sửa) đã được lưu ngay khi gửi',
    );
    expect(
      within(item).getByRole('button', { name: 'Thu gọn' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('AF6B-18 CN-110 yêu cầu đã duyệt: nhãn "Dự kiến có hiệu lực" và "Đã áp dụng lúc" (chưa áp dụng ⇒ "Chưa áp dụng"); thư gửi thất bại hiện cảnh báo', async () => {
    lists = {
      ChoDuyet: [],
      DaDuyet: [
        listItem({ trangThai: 'DaDuyet', hieuLucTu: '2026-11-10 08:00:00' }),
      ],
    };
    detailBody = detail({
      trangThai: 'DaDuyet',
      thoiDiemDuyet: '2026-11-02 08:00:00',
      nguoiDuyet: { taiKhoanId: '1', hoTen: 'Admin CLINIX' },
      hieuLucTu: '2026-11-10 08:00:00',
      soNgayBaoTruoc: 3,
      thongBao: {
        tongHop: { ChoGui: 1, DaGui: 2, ThatBai: 1, BoQua: 0 },
        items: [],
      },
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('tab', { name: /Đã duyệt/ }));
    const item = await card();
    expect(within(item).getByText('Đã duyệt')).toBeInTheDocument();
    // Không còn ChoDuyet ⇒ không có nút Duyệt/Từ chối
    expect(within(item).queryByRole('button', { name: 'Duyệt' })).toBeNull();
    fireEvent.click(within(item).getByRole('button', { name: 'Chi tiết' }));
    const timeline = await within(item).findByText('Dự kiến có hiệu lực');
    expect(timeline.nextElementSibling).toHaveTextContent('08:00 10/11/2026');
    expect(
      within(item).getByText('Đã áp dụng lúc').nextElementSibling,
    ).toHaveTextContent('Chưa áp dụng');
    expect(item).toHaveTextContent(
      'Duyệt lúc08:00 02/11/2026 bởi Admin CLINIX',
    );
    expect(item).toHaveTextContent('Chờ gửi: 1 · Đã gửi: 2 · Gửi thất bại: 1');
    expect(within(item).getByRole('alert')).toHaveTextContent(
      'Có 1 thư gửi thất bại.',
    );
  });

  it('AF6B-19 CN-110 nhãn danh sách: đã áp dụng ⇒ "Đã áp dụng"; quá hạn ⇒ "Quá hạn – chờ xử lý"', async () => {
    lists = {
      ChoDuyet: [],
      DaDuyet: [
        listItem({ trangThai: 'DaDuyet', apDungLuc: '2026-11-10 08:00:00' }),
        listItem({
          yeuCauThayDoiChiNhanhId: '8',
          chiNhanh: { chiNhanhId: '26', ten: 'Chi nhánh Quận 7' },
          trangThai: 'DaDuyet',
          quaHanLuc: '2026-11-10 08:00:00',
        }),
      ],
    };
    renderPanel();
    fireEvent.click(await screen.findByRole('tab', { name: /Đã duyệt/ }));
    expect(await screen.findByText('Đã áp dụng')).toBeInTheDocument();
    expect(screen.getByText('Quá hạn – chờ xử lý')).toBeInTheDocument();
  });

  it('AF6B-20 lỗi tải danh sách ⇒ trạng thái lỗi có nút thử lại; thử lại thành công thì hiện thẻ', async () => {
    let failOnce = true;
    const base = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input, init) => {
      if (
        failOnce &&
        String(input).includes('trangThai=ChoDuyet&page=1&pageSize=20')
      ) {
        failOnce = false;
        return Promise.resolve(
          response({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }, 500),
        );
      }
      return base ? base(input, init) : Promise.reject(new Error('no mock'));
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Thử lại/ }));
    expect(await card()).toBeInTheDocument();
  });
});

describe('CN-89 khối yêu cầu thay đổi — Admin Chi nhánh (Figma 693:2)', () => {
  it('AF6B-21 chỉ xem: không có nút Duyệt/Từ chối, không gọi API cấu hình, không có banner', async () => {
    config = { chuaCauHinh: true, soNgayBaoTruocDoiGioLam: null };
    renderPanel(false);
    const item = await card();
    expect(
      within(item).getByRole('button', { name: 'Chi tiết' }),
    ).toBeInTheDocument();
    expect(within(item).queryByRole('button', { name: 'Duyệt' })).toBeNull();
    expect(within(item).queryByRole('button', { name: 'Từ chối' })).toBeNull();
    expect(screen.queryByText('Chưa cấu hình số ngày báo trước')).toBeNull();
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('system-config'),
      ),
    ).toBe(false);
  });
});

const overdueItem = () =>
  listItem({
    trangThai: 'DaDuyet',
    thoiDiemDuyet: '2026-10-20 08:00:00',
    hieuLucTu: '2026-10-25 08:00:00',
    quaHanLuc: '2026-10-25 08:00:00',
  });

describe('CN-89, CN-111 Rút, Hủy, quá hạn, Dời hiệu lực', () => {
  it('AF6B-23 Rút chỉ hiện cho người gửi (laCuaToi); xác nhận ⇒ POST withdraw không thân, báo thành công, tải lại', async () => {
    lists = { ChoDuyet: [listItem({ laCuaToi: true })] };
    renderPanel(false);
    fireEvent.click(within(await card()).getByRole('button', { name: 'Rút' }));
    const dialog = screen.getByRole('dialog', { name: 'Rút yêu cầu thay đổi' });
    expect(dialog).toHaveTextContent(
      'Tên, địa chỉ, tọa độ đã lưu lúc gửi không tự hoàn lại.',
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Rút yêu cầu' }),
    );
    expect(
      await screen.findByText('Đã rút yêu cầu của Chi nhánh Quận 3.'),
    ).toBeInTheDocument();
    const [post] = calls('POST');
    expect(post?.[0]).toBe('/api/admin/branch-change-requests/7/withdraw');
    expect(post?.[1]?.body).toBeUndefined();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('AF6B-23 Rút bị máy chủ từ chối (đã có người duyệt trước) ⇒ khối lỗi, hộp thoại vẫn mở', async () => {
    lists = { ChoDuyet: [listItem({ laCuaToi: true })] };
    actionResponse = () =>
      response({ maLoi: 'YEU_CAU_KHONG_THE_RUT_HUY', thongBao: 'x' }, 409);
    renderPanel(false);
    fireEvent.click(within(await card()).getByRole('button', { name: 'Rút' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Rút yêu cầu' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Yêu cầu không còn ở trạng thái cho phép rút/hủy.',
    );
  });

  it('AF6B-24 Hủy yêu cầu đã duyệt: bắt buộc lý do, POST cancel với lý do đã trim', async () => {
    lists = {
      ChoDuyet: [],
      DaDuyet: [
        listItem({ trangThai: 'DaDuyet', hieuLucTu: '2026-11-10 08:00:00' }),
      ],
    };
    renderPanel();
    fireEvent.click(await screen.findByRole('tab', { name: /Đã duyệt/ }));
    fireEvent.click(within(await card()).getByRole('button', { name: 'Hủy' }));
    const dialog = screen.getByRole('dialog', { name: 'Hủy yêu cầu thay đổi' });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Hủy yêu cầu' }),
    );
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Vui lòng nhập lý do',
    );
    expect(calls('POST')).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText(/Lý do hủy/), {
      target: { value: ' Duyệt nhầm ' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Hủy yêu cầu' }),
    );
    expect(
      await screen.findByText('Đã hủy yêu cầu của Chi nhánh Quận 3.'),
    ).toBeInTheDocument();
    const [post] = calls('POST');
    expect(post?.[0]).toBe('/api/admin/branch-change-requests/7/cancel');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ lyDo: 'Duyệt nhầm' });
  });

  it('AF6B-25 CN-111 quá hạn: banner ở đầu khối (bấm mở tab Đã duyệt), thẻ nhãn "Quá hạn – chờ xử lý" kèm lời giải thích, nút Dời hiệu lực và Hủy', async () => {
    lists = { ChoDuyet: [listItem()], DaDuyet: [overdueItem()] };
    renderPanel();
    const banner = (await screen.findByText(/Có yêu cầu thay đổi đã quá hạn/))
      .parentElement as HTMLElement;
    fireEvent.click(
      within(banner).getByRole('button', { name: 'Xem yêu cầu quá hạn' }),
    );
    expect(screen.getByRole('tab', { name: /Đã duyệt/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const item = await card();
    expect(within(item).getByText('Quá hạn – chờ xử lý')).toBeInTheDocument();
    expect(within(item).getByRole('note')).toHaveTextContent(
      'Xử lý hết danh sách trong Chi tiết rồi dời hiệu lực, hoặc hủy yêu cầu.',
    );
    expect(
      within(item).getByRole('button', { name: 'Dời hiệu lực' }),
    ).toBeInTheDocument();
    expect(
      within(item).getByRole('button', { name: 'Hủy' }),
    ).toBeInTheDocument();
  });

  it('AF6B-26 CN-111 chi tiết quá hạn: mục "Cần xử lý trước khi dời hiệu lực", mốc "Quá hạn lúc"', async () => {
    lists = { ChoDuyet: [], DaDuyet: [overdueItem()] };
    detailBody = detail({
      ...overdueItem(),
      soNgayBaoTruoc: 3,
      nguoiDuyet: { taiKhoanId: '1', hoTen: 'Admin CLINIX' },
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('tab', { name: /Đã duyệt/ }));
    const item = await card();
    fireEvent.click(within(item).getByRole('button', { name: 'Chi tiết' }));
    expect(
      await within(item).findByRole('region', {
        name: 'Cần xử lý trước khi dời hiệu lực',
      }),
    ).toHaveTextContent('LH-100');
    expect(
      within(item).getByText('Quá hạn lúc').nextElementSibling,
    ).toHaveTextContent('08:00 25/10/2026');
  });

  it('AF6B-27 Dời hiệu lực: mốc sớm nhất theo N = lớn hơn giữa số ngày đã chụp (5) và cấu hình (3); POST reschedule đúng dạng', async () => {
    lists = { ChoDuyet: [], DaDuyet: [overdueItem()] };
    detailBody = detail({ ...overdueItem(), soNgayBaoTruoc: 5 });
    renderPanel();
    fireEvent.click(await screen.findByRole('tab', { name: /Đã duyệt/ }));
    fireEvent.click(
      within(await card()).getByRole('button', { name: 'Dời hiệu lực' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Dời thời điểm hiệu lực',
    });
    expect(
      await within(dialog).findByText(/Báo trước tối thiểu 5 ngày/),
    ).toBeInTheDocument();
    const input = within(dialog).getByLabelText(
      /Thời điểm dự kiến có hiệu lực mới/,
    );
    expect(input).toHaveAttribute('min', '2026-11-07T07:01');
    fireEvent.change(input, { target: { value: '2026-11-20T08:00' } });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Dời hiệu lực' }),
    );
    expect(
      await screen.findByText(
        'Đã dời yêu cầu của Chi nhánh Quận 3, dự kiến có hiệu lực từ 08:00 20/11/2026.',
      ),
    ).toBeInTheDocument();
    const [post] = calls('POST');
    expect(post?.[0]).toBe('/api/admin/branch-change-requests/7/reschedule');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      hieuLucTu: '2026-11-20 08:00:00',
    });
  });

  it('AF6B-27 Dời hiệu lực bị từ chối vì không còn quá hạn ⇒ khối lỗi đúng câu PLAN 5.9', async () => {
    lists = { ChoDuyet: [], DaDuyet: [overdueItem()] };
    actionResponse = () =>
      response({ maLoi: 'YEU_CAU_KHONG_QUA_HAN', thongBao: 'x' }, 409);
    renderPanel();
    fireEvent.click(await screen.findByRole('tab', { name: /Đã duyệt/ }));
    fireEvent.click(
      within(await card()).getByRole('button', { name: 'Dời hiệu lực' }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByLabelText(/Thời điểm dự kiến có hiệu lực mới/),
      { target: { value: '2026-11-20T08:00' } },
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Dời hiệu lực' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Chỉ dời hiệu lực được với yêu cầu đang quá hạn chờ xử lý.',
    );
  });

  it('AF6B-28 Admin Chi nhánh thấy yêu cầu quá hạn: lời giải thích dành cho chi nhánh, không có Dời hiệu lực / Hủy', async () => {
    lists = { ChoDuyet: [], DaDuyet: [overdueItem()] };
    renderPanel(false);
    fireEvent.click(await screen.findByRole('tab', { name: /Đã duyệt/ }));
    const item = await card();
    expect(within(item).getByRole('note')).toHaveTextContent(
      'Quản trị viên Toàn hệ thống sẽ dời hiệu lực hoặc hủy yêu cầu.',
    );
    expect(
      within(item).queryByRole('button', { name: 'Dời hiệu lực' }),
    ).toBeNull();
    expect(within(item).queryByRole('button', { name: 'Hủy' })).toBeNull();
  });

  it('AF6B-29 tab Đã rút, Đã hủy; chi tiết yêu cầu đã hủy có người hủy, thời điểm, lý do', async () => {
    const cancelled = listItem({
      trangThai: 'DaHuy',
      hieuLucTu: '2026-11-10 08:00:00',
    });
    lists = { ChoDuyet: [], DaRut: [], DaHuy: [cancelled] };
    detailBody = detail({
      ...cancelled,
      thoiDiemDuyet: '2026-11-02 08:00:00',
      nguoiHuy: { taiKhoanId: '1', hoTen: 'Admin CLINIX' },
      thoiDiemHuy: '2026-11-03 09:00:00',
      lyDoHuy: 'Duyệt nhầm',
      anhHuong: {
        nguon: 'BanChup',
        moc: null,
        lichHen: { items: [], tong: 0 },
        ca: null,
        khungGioTrong: null,
      },
    });
    renderPanel();
    expect(
      await screen.findByRole('tab', { name: 'Đã rút (0)' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Đã hủy/ }));
    const item = await card();
    expect(within(item).getByText('Đã hủy')).toBeInTheDocument();
    fireEvent.click(within(item).getByRole('button', { name: 'Chi tiết' }));
    expect(await within(item).findByText('Lý do hủy')).toBeInTheDocument();
    expect(item).toHaveTextContent('Hủy lúc09:00 03/11/2026 bởi Admin CLINIX');
    expect(item).toHaveTextContent('Danh sách chụp lúc duyệt.');
  });
});
