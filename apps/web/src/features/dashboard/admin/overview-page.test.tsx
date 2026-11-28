import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppRoutes } from '../../../router/routes';
import { NETWORK_ERROR_MESSAGE } from '../../../shared/api/error-message';
import { EMPTY_ADMIN_DASHBOARD } from '../../../test/empty-admin-dashboard';
import { createFakeAuthApi } from '../../../test/fake-auth-api';
import { resetAuthForTest, restoreSession } from '../../auth/auth-session';
import type { AdminDashboard } from '../api/dashboard-api';
import { BRANCH_NOT_FOUND_TEXT, EMPTY_TEXT } from './overview-page';

// dashboard F1 — trang Tổng quan Quản trị viên qua ROUTER THẬT (khung `AdminLayout`, `AdminScopeGuard`, `RequireAuth`, `lazy`) với API giả: DWB-01…DWB-11
// (PLAN dashboard 7.6, mức GỌN). Bộ giả trả `/admin/me` theo phạm vi của ca; `/admin/dashboard` trả qua `failNext` (mặc định của bộ giả là số liệu rỗng).
// Đồng hồ giả chỉ thay `Date`: "hôm nay" của trang là 04/12/2026 giờ Việt Nam. Dữ liệu giả.

const NOW = new Date('2026-12-04T10:00:00+07:00');

const SAMPLE: AdminDashboard = {
  boLoc: { tuNgay: '2026-11-05', denNgay: '2026-12-04', chiNhanhId: null },
  capNhatLuc: NOW.toISOString(),
  homNay: { ngay: '2026-12-04', lichKham: 3, hoanThanh: 1 },
  trongKhoang: { lichKham: 7, hoanThanh: 3 },
  vangMat: { tuSo: 2, mauSo: 6, phanTram: 33.3 },
  khungGio: { tuSo: 7, mauSo: 12, phanTram: 58.3 },
  tienCoc: { soKhoan: 9, tongTien: '30000709999.97' },
  hoanTien: { soKhoan: 3, tongTien: '230000.00', soKhoanDangLoi: 1 },
  xuHuong: { donVi: 'Ngay', diem: [] },
  choDuyet: { nghiPhep: 2, doiLich: 3, thayDoiChiNhanh: 1, rutTien: 2 },
  coDuLieu: true,
};
const BRANCH_ADMIN = {
  phamVi: 'ChiNhanh',
  chiNhanh: { id: '7', ten: 'Phòng khám A' },
} as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

let api: ReturnType<typeof createFakeAuthApi>;
let urls: string[];

/** Đăng nhập Quản trị viên với phạm vi cho trước; ghi lại MỌI URL được gọi (bộ giả bỏ phần query nên ghi riêng). */
async function signIn(scope: unknown = { phamVi: 'ToanHeThong' }) {
  // `shouldAdvanceTime`: `Date` giả vẫn chạy theo thời gian thật, nếu không thì hàm chờ của Testing Library (đo bằng `Date`) không bao giờ hết giờ
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  resetAuthForTest();
  api = createFakeAuthApi({
    vaiTro: 'QuanTriVien',
    hoTen: 'Quản trị thử',
    daXacMinhEmail: true,
  });
  urls = [];
  // Giữ bộ giả và mảng URL CỦA CA NÀY: lời gọi muộn của ca trước (yêu cầu bị huỷ, thăm dò) không được ăn phản hồi đã xếp cho ca sau
  const current = api;
  const seen = urls;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(String(input));
      return current.fetch(input, init);
    }),
  );
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
  for (let i = 0; i < 3; i += 1) api.failNext('/admin/me', () => json(scope));
  api.startSession();
  await restoreSession();
}

function renderAt(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

/** Tham số của từng lần gọi `/admin/dashboard`, theo thứ tự. */
const dashboardCalls = () =>
  urls
    .filter((url) => url.split('?')[0]?.endsWith('/admin/dashboard'))
    .map((url) =>
      Object.fromEntries(new URL(url, 'http://web.invalid').searchParams),
    );

const answer = (body: unknown, status = 200) =>
  api.failNext('/admin/dashboard', () => json(body, status));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('dashboard F1 — mở trang và trạng thái', () => {
  it('DWB-01: mở /admin ⇒ "Tổng quan", MỘT lời gọi với khoảng mặc định (không gửi ngày), mục thanh bên sáng, nút "30 ngày" sáng', async () => {
    await signIn();
    answer(SAMPLE);
    renderAt('/admin');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tổng quan' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Lịch khám hôm nay')).toBeInTheDocument();
    expect(dashboardCalls()).toEqual([{}]);
    expect(screen.getByText('Thứ Sáu, 4 tháng 12, 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: '30 ngày' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Từ ngày')).toHaveValue('05/11/2026');
    expect(screen.getByLabelText('Đến ngày')).toHaveValue('04/12/2026');
  });

  it('DWB-02: đang tải ⇒ "Đang tải số liệu…"; 500 ⇒ khối lỗi và "Thử lại" gọi lại; mất mạng ⇒ câu mất mạng', async () => {
    await signIn();
    const release = api.hold('/admin/dashboard');
    renderAt('/admin');
    expect(await screen.findByText('Đang tải số liệu…')).toBeInTheDocument();
    // Chữ chờ có từ lúc route còn nạp lười: đợi trang gọi API thật rồi mới trả lời
    await waitFor(() => expect(dashboardCalls()).toHaveLength(1));
    release(500, { maLoi: 'LOI_HE_THONG', thongBao: 'Lỗi' });
    const alert = await screen.findByRole('alert');
    answer(SAMPLE);
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Lịch khám hôm nay')).toBeInTheDocument();
    expect(dashboardCalls()).toHaveLength(2);
    // Mất mạng ở lần "Tải lại"
    api.failNext('/admin/dashboard', () =>
      Promise.reject(new TypeError('Failed to fetch')),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }));
    expect(await screen.findByText(NETWORK_ERROR_MESSAGE)).toBeInTheDocument();
  });

  it('DWB-02: quá giờ (15 giây) ⇒ khối lỗi quá giờ', async () => {
    await signIn();
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout'],
      shouldAdvanceTime: true,
    });
    vi.setSystemTime(NOW);
    // `/admin/dashboard` treo như mạng chậm, và bị từ chối khi client huỷ lúc hết giờ (như fetch thật)
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        urls.push(String(input));
        return String(input).includes('/admin/dashboard')
          ? api.hang(init)
          : api.fetch(input, init);
      }),
    );
    renderAt('/admin');
    expect(await screen.findByText('Đang tải số liệu…')).toBeInTheDocument();
    await waitFor(() => expect(dashboardCalls()).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(15_100);
    expect(
      await screen.findByText(/mất quá nhiều thời gian/i),
    ).toBeInTheDocument();
  });

  it('DWB-03: `coDuLieu` false ⇒ thông báo A1, số 0 và "—", khối chờ duyệt vẫn hiện', async () => {
    await signIn();
    answer(EMPTY_ADMIN_DASHBOARD);
    renderAt('/admin');
    expect(await screen.findByText(EMPTY_TEXT)).toBeInTheDocument();
    const noShow = screen.getByRole('heading', {
      name: 'Tỷ lệ vắng mặt (no-show)',
    }).parentElement as HTMLElement;
    expect(within(noShow).getByText('—')).toBeInTheDocument();
    expect(within(noShow).getByText('Chưa đủ dữ liệu')).toBeInTheDocument();
    expect(screen.getAllByText('0đ')).toHaveLength(2);
    expect(
      screen.getByRole('heading', { name: 'Việc cần xử lý' }),
    ).toBeInTheDocument();
  });
});

describe('dashboard F2 — biểu đồ xu hướng trên trang', () => {
  it('DBD-01: trang vẽ đúng `xuHuong` máy chủ trả (chuỗi D0, 7 cột) cạnh "Việc cần xử lý"; rỗng A1 vẫn có khối biểu đồ', async () => {
    await signIn();
    const d0 = [3, 2, 1, 2, 0, 0, 1].map((soLuong, i) => ({
      tuNgay: `2026-12-0${i + 1}`,
      denNgay: `2026-12-0${i + 1}`,
      soLuong,
    }));
    answer({ ...SAMPLE, xuHuong: { donVi: 'Ngay', diem: d0 } });
    renderAt('/admin');
    expect(
      await screen.findByRole('img', {
        name: 'Xu hướng đăng ký khám theo ngày: tổng 9 lịch đặt mới; cao nhất 3 lịch, ngày 01/12/2026.',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('trend-bar')).toHaveLength(7);
    // Cùng một lưới với "Việc cần xử lý" (Figma 507:460): biểu đồ đứng trước
    const chart = screen.getByRole('region', { name: 'Xu hướng đăng ký khám' });
    const pending = screen.getByRole('heading', { name: 'Việc cần xử lý' });
    expect(chart.parentElement).toContainElement(pending);
    expect(
      chart.compareDocumentPosition(pending) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    cleanup();

    await signIn();
    answer(EMPTY_ADMIN_DASHBOARD);
    renderAt('/admin');
    expect(await screen.findByText(EMPTY_TEXT)).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Xu hướng đăng ký khám' }),
    ).toBeInTheDocument();
  });

  it('DBD-01 (biên): phản hồi thiếu `xuHuong.diem` ⇒ khối lỗi, trang không vỡ', async () => {
    await signIn();
    answer({ ...SAMPLE, xuHuong: { donVi: 'Ngay' } });
    renderAt('/admin');
    // Khối lỗi CỦA TRANG (có "Thử lại", tiêu đề và bộ lọc vẫn còn), không phải màn lỗi của router khi component vỡ
    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByRole('button', { name: 'Thử lại' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Tổng quan' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('trend-bar')).toBeNull();
  });
});

describe('dashboard F1 — bộ lọc', () => {
  it('DWB-04: đổi ngày rồi "Áp dụng" ⇒ gọi đúng tham số; thiếu, đảo ngược, quá 366 ngày ⇒ lỗi tại chỗ, KHÔNG gọi', async () => {
    await signIn();
    answer(SAMPLE);
    const router = renderAt('/admin');
    await screen.findByText('Lịch khám hôm nay');
    const from = screen.getByLabelText('Từ ngày');
    const to = screen.getByLabelText('Đến ngày');
    const apply = screen.getByRole('button', { name: 'Áp dụng' });

    fireEvent.change(from, { target: { value: '' } });
    fireEvent.click(apply);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chọn đủ hai ngày',
    );
    fireEvent.change(from, { target: { value: '2026-12-07' } });
    fireEvent.change(to, { target: { value: '2026-12-01' } });
    fireEvent.click(apply);
    expect(screen.getByRole('alert')).toHaveTextContent('không được trước');
    fireEvent.change(from, { target: { value: '2025-01-01' } });
    fireEvent.change(to, { target: { value: '2026-12-04' } });
    fireEvent.click(apply);
    expect(screen.getByRole('alert')).toHaveTextContent('tối đa 366 ngày');
    expect(dashboardCalls()).toHaveLength(1);

    answer(SAMPLE);
    fireEvent.change(from, { target: { value: '2026-12-01' } });
    fireEvent.change(to, { target: { value: '2026-12-07' } });
    fireEvent.click(apply);
    await waitFor(() => expect(dashboardCalls()).toHaveLength(2));
    expect(dashboardCalls()[1]).toEqual({
      tuNgay: '2026-12-01',
      denNgay: '2026-12-07',
    });
    expect(router.state.location.search).toBe(
      '?tuNgay=2026-12-01&denNgay=2026-12-07',
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('nút kỳ (Figma 507:2): "Năm nay" gửi 01/01 đến hôm nay và sáng lên; "7 ngày" gửi bảy ngày', async () => {
    await signIn();
    answer(SAMPLE);
    renderAt('/admin');
    await screen.findByText('Lịch khám hôm nay');
    answer(SAMPLE);
    fireEvent.click(screen.getByRole('button', { name: 'Năm nay' }));
    await waitFor(() => expect(dashboardCalls()).toHaveLength(2));
    expect(dashboardCalls()[1]).toEqual({
      tuNgay: '2026-01-01',
      denNgay: '2026-12-04',
    });
    expect(
      await screen.findByRole('button', { name: 'Năm nay', pressed: true }),
    ).toBeInTheDocument();
    answer(SAMPLE);
    fireEvent.click(screen.getByRole('button', { name: '7 ngày' }));
    await waitFor(() => expect(dashboardCalls()).toHaveLength(3));
    expect(dashboardCalls()[2]).toEqual({
      tuNgay: '2026-11-28',
      denNgay: '2026-12-04',
    });
  });

  it('DWB-05: Toàn hệ thống có ô chi nhánh và gửi `chiNhanhId`; Chi nhánh KHÔNG có ô và không gửi kể cả khi URL có', async () => {
    await signIn();
    api.failNext('/admin/branches', () =>
      json({
        items: [
          { chiNhanhId: '7', ten: 'Phòng khám A' },
          { chiNhanhId: '8', ten: 'Phòng khám B' },
        ],
        total: 2,
        page: 1,
        pageSize: 100,
      }),
    );
    answer(SAMPLE);
    renderAt('/admin');
    await screen.findByText('Lịch khám hôm nay');
    expect(screen.getByText('Toàn hệ thống')).toBeInTheDocument();
    const select = await screen.findByRole('combobox', { name: 'Chi nhánh' });
    await screen.findByRole('option', { name: 'Phòng khám B' });
    answer({ ...SAMPLE, boLoc: { ...SAMPLE.boLoc, chiNhanhId: '8' } });
    fireEvent.change(select, { target: { value: '8' } });
    await waitFor(() => expect(dashboardCalls()).toHaveLength(2));
    expect(dashboardCalls()[1]).toEqual({ chiNhanhId: '8' });
  });

  it('DWB-05: Quản trị viên Chi nhánh: nhãn chi nhánh, không ô chọn, không gửi `chiNhanhId` của URL', async () => {
    await signIn(BRANCH_ADMIN);
    answer({ ...SAMPLE, choDuyet: { ...SAMPLE.choDuyet, rutTien: null } });
    renderAt('/admin?chiNhanhId=8');
    await screen.findByText('Lịch khám hôm nay');
    expect(screen.getByText('Chi nhánh: Phòng khám A')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Chi nhánh' })).toBeNull();
    expect(dashboardCalls()).toEqual([{}]);
    expect(urls.some((url) => url.includes('/admin/branches'))).toBe(false);
  });

  it('DWB-08: đổi bộ lọc liên tiếp, phản hồi CŨ về sau ⇒ không đè kết quả mới', async () => {
    await signIn();
    const releaseFirst = api.hold('/admin/dashboard');
    renderAt('/admin');
    await screen.findByText('Đang tải số liệu…');
    await waitFor(() => expect(dashboardCalls()).toHaveLength(1));
    answer({ ...SAMPLE, trongKhoang: { lichKham: 99, hoanThanh: 0 } });
    fireEvent.click(screen.getByRole('button', { name: '7 ngày' }));
    expect(await screen.findByText('99')).toBeInTheDocument();
    releaseFirst(200, {
      ...SAMPLE,
      trongKhoang: { lichKham: 11, hoanThanh: 0 },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText('99')).toBeInTheDocument();
    expect(screen.queryByText('11')).toBeNull();
  });

  it('DWB-10: mở URL có tham số ⇒ khôi phục bộ lọc và gọi đúng; tham số hỏng ⇒ dùng mặc định', async () => {
    await signIn();
    answer(SAMPLE);
    renderAt('/admin?tuNgay=2026-12-01&denNgay=2026-12-07&chiNhanhId=7');
    await screen.findByText('Lịch khám hôm nay');
    expect(dashboardCalls()).toEqual([
      { tuNgay: '2026-12-01', denNgay: '2026-12-07', chiNhanhId: '7' },
    ]);
    expect(screen.getByLabelText('Từ ngày')).toHaveValue('01/12/2026');
    expect(screen.getByLabelText('Đến ngày')).toHaveValue('07/12/2026');
  });

  it('DWB-10: tham số hỏng (một ngày, ngày sai, id sai dạng) ⇒ gọi với mặc định', async () => {
    await signIn();
    answer(SAMPLE);
    renderAt('/admin?tuNgay=2026-02-30&chiNhanhId=abc');
    await screen.findByText('Lịch khám hôm nay');
    expect(dashboardCalls()).toEqual([{}]);
  });
});

describe('dashboard F1 — số liệu, việc cần xử lý, lỗi', () => {
  it('DWB-06: hiện đúng số máy chủ trả: phần trăm, "x trên y", tiền lớn định dạng VND, khoản hoàn đang lỗi', async () => {
    await signIn();
    answer(SAMPLE);
    renderAt('/admin');
    await screen.findByText('Lịch khám hôm nay');
    // "33,3%" có ở thẻ và ở chú thích vòng tròn "Kết quả lịch khám": kiểm trong thẻ
    const noShow = screen.getByRole('heading', {
      name: 'Tỷ lệ vắng mặt (no-show)',
    }).parentElement as HTMLElement;
    expect(within(noShow).getByText('33,3%')).toBeInTheDocument();
    expect(screen.getAllByText('33,3%')).toHaveLength(2);
    expect(screen.getByText('2 trên 6 lịch đã có kết quả')).toBeInTheDocument();
    expect(screen.getByText('58,3%')).toBeInTheDocument();
    expect(
      screen.getByText(
        '7 trên 12 khung giờ đã phát ra (trừ nghỉ phép đã duyệt)',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('30.000.709.999,97đ')).toBeInTheDocument();
    expect(screen.getByText('9 khoản cọc qua ví')).toBeInTheDocument();
    expect(screen.getByText('230.000đ')).toBeInTheDocument();
    expect(
      screen.getByText('1 khoản hoàn đang lỗi, chưa vào ví'),
    ).toBeInTheDocument();
  });

  it('DWB-06 (T5): phần trăm là ĐÚNG số máy chủ trả, web không tự tính lại từ tử và mẫu', async () => {
    await signIn();
    // Giá trị CỐ Ý khác tử/mẫu (2/6 = 33,3; 7/12 = 58,3) để bắt việc web tự chia lại
    answer({
      ...SAMPLE,
      vangMat: { tuSo: 2, mauSo: 6, phanTram: 40.1 },
      khungGio: { tuSo: 7, mauSo: 12, phanTram: 12.3 },
    });
    renderAt('/admin');
    await screen.findByText('Lịch khám hôm nay');
    expect(screen.getAllByText('40,1%')).toHaveLength(2);
    expect(screen.getByText('12,3%')).toBeInTheDocument();
    expect(screen.queryByText('33,3%')).toBeNull();
    expect(screen.queryByText('58,3%')).toBeNull();
  });

  it('DWB-07: đủ bốn dòng việc cần xử lý, liên kết đúng đích; số 0 vẫn hiện', async () => {
    await signIn();
    answer({ ...SAMPLE, choDuyet: { ...SAMPLE.choDuyet, nghiPhep: 0 } });
    renderAt('/admin');
    await screen.findByText('Lịch khám hôm nay');
    const link = (name: RegExp) => screen.getByRole('link', { name });
    expect(link(/^Mở Nghỉ phép bác sĩ: 0/)).toHaveAttribute(
      'href',
      '/admin/duyet-yeu-cau/nghi-phep',
    );
    expect(link(/^Mở Đổi lịch hẹn: 3/)).toHaveAttribute(
      'href',
      '/admin/duyet-yeu-cau/doi-lich',
    );
    expect(link(/^Mở Thay đổi chi nhánh: 1/)).toHaveAttribute(
      'href',
      '/admin/thong-tin-phong-kham?tab=chi-nhanh',
    );
    expect(link(/^Mở Yêu cầu rút tiền: 2/)).toHaveAttribute(
      'href',
      '/admin/yeu-cau-rut-tien',
    );
    expect(link(/^Xem tất cả/)).toHaveAttribute('href', '/admin/duyet-yeu-cau');
  });

  it('DWB-07: Quản trị viên Chi nhánh (rutTien null) ⇒ KHÔNG có dòng rút tiền; thay đổi chi nhánh ghi "Chờ Quản trị viên Toàn hệ thống duyệt"', async () => {
    await signIn(BRANCH_ADMIN);
    answer({ ...SAMPLE, choDuyet: { ...SAMPLE.choDuyet, rutTien: null } });
    renderAt('/admin');
    await screen.findByText('Lịch khám hôm nay');
    expect(screen.queryByRole('link', { name: /Yêu cầu rút tiền/ })).toBeNull();
    expect(
      screen.getByText('Chờ Quản trị viên Toàn hệ thống duyệt'),
    ).toBeInTheDocument();
  });

  it('DWB-09: 404 chi nhánh ⇒ thông báo và "Xem phạm vi của tôi" bỏ bộ lọc chi nhánh; 403 ⇒ trang không đủ quyền', async () => {
    await signIn();
    answer({ maLoi: 'KHONG_TIM_THAY', thongBao: 'x' }, 404);
    const router = renderAt('/admin?chiNhanhId=999');
    expect(await screen.findByText(BRANCH_NOT_FOUND_TEXT)).toBeInTheDocument();
    answer(SAMPLE);
    fireEvent.click(
      screen.getByRole('button', { name: 'Xem phạm vi của tôi' }),
    );
    expect(await screen.findByText('Lịch khám hôm nay')).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
    expect(dashboardCalls()).toEqual([{ chiNhanhId: '999' }, {}]);
  });

  it('DWB-09: 403 ⇒ trang "Không đủ quyền truy cập" của khu Admin', async () => {
    await signIn();
    answer({ maLoi: 'KHONG_DU_QUYEN', thongBao: 'x' }, 403);
    renderAt('/admin');
    expect(
      await screen.findByText('Không đủ quyền truy cập'),
    ).toBeInTheDocument();
  });

  it('DWB-11: bấm "Thay đổi chi nhánh" ⇒ trang Thông tin phòng khám mở tab Chi nhánh; mở không tham số vẫn ở tab chung', async () => {
    await signIn();
    answer(SAMPLE);
    // Tab Chi nhánh mở ngay nên tải danh sách chi nhánh và yêu cầu thay đổi: trả trang rỗng đúng hình dạng
    // `/admin/branches` hai lần: ô lọc chi nhánh của trang Tổng quan dùng lần đầu, tab Chi nhánh dùng lần sau
    const emptyPage = { items: [], total: 0, page: 1, pageSize: 20 };
    for (const path of [
      '/admin/branches',
      '/admin/branches',
      '/admin/branch-change-requests',
    ])
      api.failNext(path, () => json(emptyPage));
    const router = renderAt('/admin');
    await screen.findByText('Lịch khám hôm nay');
    fireEvent.click(
      screen.getByRole('link', { name: /^Mở Thay đổi chi nhánh/ }),
    );
    expect(
      await screen.findByRole('tab', { name: /Chi nhánh/, selected: true }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/thong-tin-phong-kham');
    expect(router.state.location.search).toBe('?tab=chi-nhanh');
    // MỞ MỚI trang không tham số (tham số chỉ là giá trị khởi tạo nên phải dựng lại trang, không điều hướng trong cùng trang)
    cleanup();
    for (const path of ['/admin/branches', '/admin/branch-change-requests'])
      api.failNext(path, () => json(emptyPage));
    renderAt('/admin/thong-tin-phong-kham');
    expect(
      await screen.findByRole('tab', {
        name: /Thông tin chung/,
        selected: true,
      }),
    ).toBeInTheDocument();
  });
});
