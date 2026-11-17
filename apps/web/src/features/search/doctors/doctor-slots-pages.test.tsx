import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppRoutes } from '../../../router/routes';
import { resetSelectedBranchForTest } from '../../../shared/branch-selection';
import {
  createFakeAuthApi,
  createFakeLocks,
} from '../../../test/fake-auth-api';
import { resetAuthForTest } from '../../auth/auth-session';
import { setAuthState } from '../../auth/auth-store';
import { LOGIN_PATH } from '../../auth/roles';
import type { DoctorItem, SpecialtySummary } from '../api/search-types';
import { FOOTER_SPECIALTY_COUNT } from '../shell/public-footer';
import { day, rawResponse, slot } from '../slots/testing/slot-fixtures';

// search PR-C2, mã ca SLT-70 đến SLT-85: ba trang bác sĩ (chuyên khoa, Đội ngũ bác sĩ, Bước 3 đặt lịch) dùng chung dải "Ngày khám" và lưới khung giờ.
// Router thật + fetch giả, MỘT lời gọi `GET /public/doctor-slots` cho cả trang. Hôm nay (giờ Việt Nam) là Thứ Ba 17/11/2026, đồng hồ giả CHỈ `Date`.
const NOW = '2026-11-17T03:00:00Z';
const TODAY = '2026-11-17';
const BRANCH = {
  chiNhanhId: '1',
  ten: 'Chi nhánh Sài Gòn',
  diaChi: '1 Đường Mẫu',
  toaDoLat: null,
  toaDoLng: null,
};
const TIM_MACH: SpecialtySummary = {
  chuyenKhoaId: '10',
  ten: 'Tim mạch',
  moTa: null,
  anhDaiDien: null,
  soBacSi: 2,
};
const doctor = (bacSiId: string, hoTen: string): DoctorItem => ({
  bacSiId,
  hoTen,
  chucDanh: 'BS_CKII',
  soNamKinhNghiem: 12,
  chuyenKhoa: { chuyenKhoaId: '10', ten: 'Tim mạch' },
  chiNhanh: {
    chiNhanhId: '1',
    ten: 'Chi nhánh Sài Gòn',
    diaChi: '1 Đường Mẫu',
  },
  dichVu: { dichVuKhamId: '20', ten: 'Tim mạch', thoiLuong: 30 },
  gia: {
    giaMacDinh: '300000.00',
    phuPhi: '0.00',
    giaKham: '300000.00',
    mucDatCoc: '100000.00',
  },
  danhGia: { diemTrungBinh: null, soDanhGia: 0 },
});
const DOCTORS = [
  doctor('100', 'Nguyễn Minh Anh'),
  doctor('101', 'Lê Quang Hùng'),
];
const SERVICE = {
  dichVuKhamId: '20',
  ten: 'Tim mạch',
  nhomDichVu: { id: '5', ten: 'Khám theo chuyên khoa' },
  thoiLuong: 30,
  giaMacDinh: '300000.00',
  mucDatCoc: '100000.00',
  soBacSi: 2,
};

const PAGES = [
  { name: 'chuyên khoa', path: '/chuyen-khoa/10' },
  { name: 'Đội ngũ bác sĩ', path: '/bac-si' },
  { name: 'Bước 3 đặt lịch', path: '/dat-lich/nhom/5/dich-vu/20' },
];

let api: ReturnType<typeof createFakeAuthApi>;
let doctorCalls: URL[];
let slotCalls: URL[];
let doctorList: DoctorItem[];
let doctorTotal: number;
let slotsHandler: (url: URL) => Response | Promise<Response>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Mặc định: bác sĩ 100 có ô buổi sáng và chiều (901, 902 đã đặt, 903); đúng ngày 19/11 (Thứ Năm) chi nhánh nghỉ; bác sĩ 101 không có lịch
function defaultSlots(url: URL): Response {
  const ngay = url.searchParams.get('ngay') ?? '';
  const ids = (url.searchParams.get('bacSiIds') ?? '').split(',');
  return json(
    200,
    rawResponse(
      ngay,
      ids.map((id) => {
        if (id === '100' && ngay === '2026-11-19')
          return day(id, [], 'ChiNhanhNghi', 4);
        if (id === '100')
          return day(id, [
            slot('901', '08:00', 'ConTrong', 'CaSang', ngay),
            slot('902', '08:30', 'DaDat', 'CaSang', ngay),
            slot('903', '13:30', 'ConTrong', 'CaChieu', ngay),
          ]);
        return day(id, [], 'KhongCoLich');
      }),
    ),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  resetAuthForTest();
  resetSelectedBranchForTest();
  window.localStorage.clear();
  window.localStorage.setItem(
    'clinix.chiNhanhDangChon',
    JSON.stringify({ chiNhanhId: '1', nguon: 'NguoiDung' }),
  );
  api = createFakeAuthApi();
  doctorCalls = [];
  slotCalls = [];
  doctorList = DOCTORS;
  doctorTotal = DOCTORS.length;
  slotsHandler = defaultSlots;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const path = url.pathname;
      if (!path.includes('/public/')) return api.fetch(input, init);
      if (path.endsWith('/public/doctor-slots')) {
        slotCalls.push(url);
        return slotsHandler(url);
      }
      if (
        path.endsWith('/public/specialties') &&
        url.searchParams.get('pageSize') === String(FOOTER_SPECIALTY_COUNT)
      )
        return json(200, {
          items: [],
          total: 0,
          page: 1,
          pageSize: 8,
          soCoBacSi: 0,
        });
      if (path.endsWith('/public/clinic-info'))
        return json(200, {
          tenThuongHieu: 'CLINIX',
          diaChiTruSo: null,
          duongDayNong: null,
          email: null,
        });
      if (path.endsWith('/public/branches'))
        return json(200, { items: [BRANCH], total: 1, page: 1, pageSize: 100 });
      if (path.endsWith('/public/services'))
        return json(200, { items: [SERVICE] });
      if (path.endsWith('/public/specialties'))
        return json(200, {
          items: [TIM_MACH],
          total: 1,
          page: 1,
          pageSize: 100,
          soCoBacSi: 2,
        });
      if (/\/public\/specialties\/10$/.test(path))
        return json(200, { ...TIM_MACH });
      if (path.endsWith('/public/doctors')) {
        doctorCalls.push(url);
        return json(200, {
          items: doctorList,
          total: doctorTotal,
          page: Number(url.searchParams.get('page') ?? 1),
          pageSize: 20,
        });
      }
      return json(404, { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' });
    }),
  );
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: createFakeLocks(),
  });
  setAuthState({ status: 'unauthenticated' });
});

afterEach(() => {
  vi.useRealTimers();
  resetAuthForTest();
  resetSelectedBranchForTest();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const strip = () => screen.findByRole('group', { name: 'Ngày khám' });
const pickDay = async (name: string) =>
  fireEvent.click(within(await strip()).getByRole('button', { name }));
const slotNgays = () => slotCalls.map((url) => url.searchParams.get('ngay'));

describe.each(PAGES)('$name: dải ngày và lưới khung giờ', ({ path }) => {
  it('SLT-70 dải "Ngày khám" nằm DƯỚI bộ lọc, mặc định Hôm nay, 7 thẻ; MỘT lời gọi khung giờ cho cả trang với id và ngày của trang', async () => {
    renderAt(path);
    const group = await strip();
    const filters = screen.getByRole('search', { name: 'Bộ lọc bác sĩ' });
    expect(
      filters.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(group).getAllByRole('button')).toHaveLength(7);
    expect(
      within(group).getByRole('button', { name: 'Hôm nay, Thứ Ba 17/11' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await screen.findByRole('link', { name: '08:00, còn trống' });
    expect(slotCalls).toHaveLength(1);
    expect(slotCalls[0].searchParams.get('bacSiIds')).toBe('100,101');
    expect(slotCalls[0].searchParams.get('ngay')).toBe(TODAY);
  });

  it('SLT-71 đổi ngày ⇒ gọi lại với ngày mới và hiện dữ liệu ngày đó (chi nhánh nghỉ Thứ Năm 19/11)', async () => {
    renderAt(path);
    await screen.findByRole('link', { name: '08:00, còn trống' });
    await pickDay('Thứ Năm 19/11');
    expect(
      await screen.findByText('Chi nhánh nghỉ vào Thứ Năm'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: '08:00, còn trống' }),
    ).not.toBeInTheDocument();
    expect(slotNgays()).toEqual([TODAY, '2026-11-19']);
    expect(slotCalls[1].searchParams.get('bacSiIds')).toBe('100,101');
    expect(
      within(await strip()).getByRole('button', { name: 'Thứ Năm 19/11' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('SLT-72 bác sĩ có lịch hiện lưới sáng/chiều, bác sĩ không có lịch hiện câu Figma', async () => {
    renderAt(path);
    await screen.findByRole('link', { name: '08:00, còn trống' });
    expect(
      screen.getByRole('region', { name: 'Buổi sáng' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Buổi chiều' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '08:30, đã đặt' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Bác sĩ không có lịch làm việc ngày này'),
    ).toBeInTheDocument();
  });

  it('SLT-73 lỗi lưới giờ KHÔNG làm hỏng danh sách: thẻ vẫn hiện, mỗi thẻ báo lỗi riêng; "Thử lại" gọi lại và hiện lưới', async () => {
    slotsHandler = () => json(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' });
    renderAt(path);
    expect(
      await screen.findAllByText('Không tải được khung giờ.'),
    ).toHaveLength(2);
    expect(screen.getByText(/Nguyễn Minh Anh/)).toBeInTheDocument();
    expect(screen.getByText(/Lê Quang Hùng/)).toBeInTheDocument();
    slotsHandler = defaultSlots;
    fireEvent.click(screen.getAllByRole('button', { name: 'Thử lại' })[0]);
    await screen.findByRole('link', { name: '08:00, còn trống' });
    expect(slotCalls).toHaveLength(2);
    expect(
      screen.queryByText('Không tải được khung giờ.'),
    ).not.toBeInTheDocument();
  });

  it('SLT-74 200 sai hình dạng (thiếu phần tử của một bác sĩ) ⇒ lỗi riêng của lưới giờ, danh sách vẫn hiện', async () => {
    slotsHandler = (url) =>
      json(200, rawResponse(url.searchParams.get('ngay') ?? '', [day('100')]));
    renderAt(path);
    expect(
      await screen.findAllByText('Không tải được khung giờ.'),
    ).toHaveLength(2);
    expect(screen.getByText(/Lê Quang Hùng/)).toBeInTheDocument();
  });

  it('SLT-75 400 ngày không hợp lệ (trang mở qua nửa đêm) ⇒ "Xem lịch hôm nay" tính lại hôm nay và gọi lại với ngày mới', async () => {
    renderAt(path);
    await screen.findByRole('link', { name: '08:00, còn trống' });
    // Sang ngày mới mà trang vẫn giữ "hôm nay" cũ: máy chủ từ chối ngày 17/11
    vi.setSystemTime(new Date('2026-11-18T03:00:00Z'));
    slotsHandler = (url) =>
      url.searchParams.get('ngay') === TODAY
        ? json(400, {
            maLoi: 'BO_LOC_KHONG_HOP_LE',
            thongBao: 'x',
            loi: [{ truong: 'ngay', ma: 'NGAY_NGOAI_KHOANG' }],
          })
        : defaultSlots(url);
    // Đổi sang ngày khác rồi quay lại ngày cũ để buộc gọi lại ngày 17/11
    await pickDay('Thứ Tư 18/11');
    await screen.findByRole('link', { name: '08:00, còn trống' });
    await pickDay('Hôm nay, Thứ Ba 17/11');
    expect(
      await screen.findAllByText('Ngày đã chọn không còn hợp lệ.'),
    ).toHaveLength(2);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Xem lịch hôm nay' })[0],
    );
    await screen.findByRole('link', { name: '08:00, còn trống' });
    expect(slotNgays().at(-1)).toBe('2026-11-18');
    expect(
      within(await strip()).getByRole('button', {
        name: 'Hôm nay, Thứ Tư 18/11',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('SLT-76 đang tải: mỗi thẻ có khung chờ `aria-busy`, danh sách bác sĩ vẫn hiện', async () => {
    slotsHandler = () => new Promise<Response>(() => undefined);
    renderAt(path);
    await screen.findByText(/Nguyễn Minh Anh/);
    await waitFor(() =>
      expect(screen.getAllByText('Đang tải khung giờ…')).toHaveLength(2),
    );
    expect(
      screen
        .getAllByText('Đang tải khung giờ…')[0]
        .closest('[aria-busy="true"]'),
    ).not.toBeNull();
  });

  it('SLT-78 ngày KHÔNG lên URL và KHÔNG ghi storage', async () => {
    const router = renderAt(path);
    await screen.findByRole('link', { name: '08:00, còn trống' });
    const search = router.state.location.search;
    const storage = JSON.stringify({ ...window.localStorage });
    await pickDay('Thứ Sáu 20/11');
    await waitFor(() => expect(slotNgays().at(-1)).toBe('2026-11-20'));
    expect(router.state.location.search).toBe(search);
    expect(JSON.stringify({ ...window.localStorage })).toBe(storage);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('giữ ngày khi đổi trang và bộ lọc (SLT-77, SLT-81)', () => {
  it('SLT-77 đổi trang kết quả GIỮ ngày đã chọn và gọi khung giờ cho id của trang mới', async () => {
    doctorTotal = 40;
    renderAt('/bac-si');
    await screen.findByRole('link', { name: '08:00, còn trống' });
    await pickDay('Thứ Sáu 20/11');
    await waitFor(() => expect(slotNgays().at(-1)).toBe('2026-11-20'));
    doctorList = [doctor('200', 'Trần Thị Lan')];
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByText(/Trần Thị Lan/);
    await waitFor(() =>
      expect(slotCalls.at(-1)?.searchParams.get('bacSiIds')).toBe('200'),
    );
    expect(slotCalls.at(-1)?.searchParams.get('ngay')).toBe('2026-11-20');
    expect(
      within(await strip()).getByRole('button', { name: 'Thứ Sáu 20/11' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('SLT-81 bộ lọc hiện có vẫn chạy và giữ ngày; "Xoá bộ lọc" không đổi ngày', async () => {
    renderAt('/bac-si');
    await screen.findByRole('link', { name: '08:00, còn trống' });
    await pickDay('Thứ Sáu 20/11');
    doctorList = [];
    fireEvent.change(screen.getByLabelText('Tìm bác sĩ'), {
      target: { value: 'khong co' },
    });
    expect(
      await screen.findByText('Không tìm thấy bác sĩ phù hợp'),
    ).toBeInTheDocument();
    expect(doctorCalls.at(-1)?.searchParams.get('q')).toBe('khong co');
    doctorList = DOCTORS;
    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    await screen.findByText(/Nguyễn Minh Anh/);
    expect(
      within(await strip()).getByRole('button', { name: 'Thứ Sáu 20/11' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(slotNgays().at(-1)).toBe('2026-11-20'));
  });
});

describe('chữ riêng của từng trang (SLT-79)', () => {
  it('SLT-79 chuyên khoa: câu dẫn, "Đang xem lịch Hôm nay 17/11", mỗi thẻ có "Lịch khám Hôm nay 17/11" và dòng "chưa giữ chỗ"', async () => {
    renderAt('/chuyen-khoa/10');
    await screen.findByRole('link', { name: '08:00, còn trống' });
    expect(
      screen.getByText(
        'Chọn ngày, rồi chọn khung giờ còn trống của bác sĩ phù hợp.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Đang xem lịch Hôm nay 17/11')).toBeInTheDocument();
    expect(
      screen.getAllByText('Hôm nay 17/11', { selector: 'strong' }),
    ).toHaveLength(2);
    expect(
      screen.getAllByText(
        'Chọn giờ chỉ chuyển lựa chọn sang bước đặt lịch, chưa giữ chỗ.',
      ),
    ).toHaveLength(2);
  });

  it('SLT-79 Đội ngũ bác sĩ: dòng đếm có hậu tố "· lịch Hôm nay 17/11"; thẻ có tiêu đề lịch và dòng "chưa giữ chỗ"', async () => {
    renderAt('/bac-si');
    expect(
      await screen.findByText('2 bác sĩ · lịch Hôm nay 17/11'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('Hôm nay 17/11', { selector: 'strong' }),
    ).toHaveLength(2);
    expect(screen.queryByText(/Đang xem lịch/)).not.toBeInTheDocument();
  });

  it('SLT-79 Bước 3: tiêu đề "Chọn bác sĩ và khung giờ", banner (không "15 phút"), dòng cuối; thẻ chỉ có lưới, KHÔNG tiêu đề lịch và dòng "chưa giữ chỗ" ở từng thẻ', async () => {
    renderAt('/dat-lich/nhom/5/dich-vu/20');
    expect(
      await screen.findByRole('heading', {
        name: 'Chọn bác sĩ và khung giờ',
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Chọn giờ chỉ ghi nhận lựa chọn của bạn. Khung giờ chỉ được giữ khi bạn bắt đầu thanh toán cọc ở bước cuối.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/15 phút/)).not.toBeInTheDocument();
    await screen.findByRole('link', { name: '08:00, còn trống' });
    expect(
      screen.getByText('Chọn một khung giờ còn trống để tiếp tục.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Lịch khám/)).not.toBeInTheDocument();
    expect(screen.queryByText(/chưa giữ chỗ\.$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Đang xem lịch/)).not.toBeInTheDocument();
    expect(screen.getByText('2 bác sĩ')).toBeInTheDocument();
  });
});

describe('bấm giờ (SLT-85)', () => {
  it('SLT-85 khách chưa đăng nhập bấm giờ còn trống ⇒ cổng đăng nhập có `from` giữ nguyên `?khungGioId=`; không ghi log', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const router = renderAt('/bac-si');
    fireEvent.click(
      await screen.findByRole('link', { name: '08:00, còn trống' }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(LOGIN_PATH),
    );
    expect(router.state.location.state).toEqual({
      from: '/dat-lich/thong-tin?khungGioId=901',
    });
    expect(log).not.toHaveBeenCalled();
  });
});
