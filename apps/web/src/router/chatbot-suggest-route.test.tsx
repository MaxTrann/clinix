import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter, matchRoutes } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { LOGIN_PATH, type VaiTro } from '../features/auth';
import { resetAuthForTest } from '../features/auth/auth-session';
import { setAuthState } from '../features/auth/auth-store';
import { createFakeBookingApi } from '../features/booking/testing/fake-booking-api';
import {
  doctorDisplayName as chatbotDisplayName,
  doctorTitleLabel as chatbotTitleLabel,
} from '../features/chatbot/suggest/doctor-label';
import { timeLabelVn } from '../features/chatbot/suggest/suggest-format';
import { openAndAsk } from '../features/chatbot/testing/render-widget';
import { createFakeProfileApi } from '../features/patient/testing/fake-profile-api';
import {
  doctorDisplayName as searchDisplayName,
  doctorTitleLabel as searchTitleLabel,
} from '../features/search/format/doctor-title';
import { timeLabel as searchTimeLabel } from '../features/search/slots/slot-dates';
import { fakeMatchMedia } from '../test/fake-match-media';
import { createFakeAuthApi } from '../test/fake-auth-api';
import {
  BOOKING_INFO_PATH,
  bookingInfoPath,
} from '../shared/routes/booking-paths';
import { createAppRoutes } from './routes';

// Chatbot F2 `[ĐỒNG BỘ TL]`. WTL-13 qua bảng route THẬT (`createAppRoutes()`): khách bấm ô giờ trong thẻ gợi ý → `RequireAuth` đưa tới đăng nhập → đăng nhập xong
// về đúng bước 4 của Đặt lịch với đúng khung giờ (T9: `state.from`, KHÔNG `sessionStorage`; thay chữ A6 của 2.4.7); Bệnh nhân bấm thì vào thẳng bước 4.
// Lớp API của khung chat là bản THẬT (`httpChatbotApi`) nói chuyện với `fetch` giả, nên ca cũng chứng minh đường dẫn, tham số và bộ phân tích thật.
// Cộng F2-16: khoá các bản chép của chatbot (giờ Việt Nam, nhãn chức danh) với `features/search` và `bookingInfoPath` với route thật,
// vì chatbot không import `features/search` (PLAN 1.2) nên không có gì khác giữ chúng khớp nhau.
const GOI_Y = {
  ketQua: 'GoiY',
  doan: [
    { kieu: 'chu', chu: 'Bạn có thể cân nhắc chuyên khoa Nội tổng quát.' },
  ],
  chuyenKhoaGoiY: [{ chuyenKhoaId: '3', ten: 'Nội tổng quát' }],
  lienKet: [],
  coTheGuiLai: false,
  tinhVaoLichSu: true,
};

// Thân thật của máy chủ có thể mang thêm trường (học vị, điểm xếp hạng): web phải bỏ, không được hiện
const SUGGESTION = {
  chuyenKhoa: { chuyenKhoaId: '3', ten: 'Nội tổng quát' },
  ngay: '2026-11-28',
  bacSi: [
    {
      bacSiId: '11',
      hoTen: 'Nguyễn Minh Anh',
      chucDanh: 'TS_BS',
      hocVi: 'HOC_VI_NOI_BO',
      diemXepHang: 987654,
      chiNhanh: {
        chiNhanhId: '2',
        ten: 'CLINIX Quận 1',
        diaChi: '12 Đường Mẫu',
      },
      giaKham: '350000.00',
      danhGia: { diemTrungBinh: '4.5', soDanhGia: 12 },
      khungGio: [
        { khungGioId: '101', batDau: '2026-11-28T02:30:00.000Z', ca: 'CaSang' },
        { khungGioId: '102', batDau: '2026-11-28T03:00:00.000Z', ca: 'CaSang' },
      ],
    },
  ],
};

let auth: ReturnType<typeof createFakeAuthApi>;
let booking: ReturnType<typeof createFakeBookingApi>;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

function useApi(vaiTro: VaiTro = 'BenhNhan') {
  auth = createFakeAuthApi({
    vaiTro,
    hoTen: 'Người mẫu',
    daXacMinhEmail: true,
  });
  const profile = createFakeProfileApi(auth.fetch);
  booking = createFakeBookingApi(profile.fetch);
  fetchMock = vi.fn<typeof fetch>((input, init) => {
    const url = String(input);
    if (url === '/api/chatbot/messages') return Promise.resolve(json(GOI_Y));
    if (url.startsWith('/api/chatbot/suggestions')) {
      return Promise.resolve(json(SUGGESTION));
    }
    // Khung công khai gọi /public/* khi gắn: trả 500 để không đi ra mạng thật (chân trang chịu được lỗi)
    if (url.includes('/public/')) {
      return Promise.resolve(new Response('{}', { status: 500 }));
    }
    return booking.fetch(input, init);
  });
  vi.stubGlobal('fetch', fetchMock);
}

function renderAt(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const here = (router: ReturnType<typeof renderAt>) => {
  const { pathname, search, hash } = router.state.location;
  return pathname + search + hash;
};

async function logIn() {
  fireEvent.change(await screen.findByLabelText('Email'), {
    target: { value: 'a@b.vn' },
  });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), {
    target: { value: 'Matkhau@1' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
}

// Mở khung, hỏi một câu (nhận `GoiY`), chọn chuyên khoa, rồi trả về liên kết ô giờ 09:30
async function openSlotLink() {
  openAndAsk('Tôi muốn khám tổng quát');
  fireEvent.click(
    await screen.findByRole('button', { name: 'Chọn chuyên khoa này' }),
  );
  return screen.findByRole('link', {
    name: '09:30 ngày 28/11, TS.BS. Nguyễn Minh Anh',
  });
}

beforeEach(() => {
  fakeMatchMedia(1024);
  resetAuthForTest();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  cleanup();
  resetAuthForTest();
  vi.unstubAllGlobals();
});

describe('khách và Bệnh nhân bấm ô giờ trong thẻ gợi ý (WTL-13)', () => {
  it('WTL-13 khách bấm ô giờ: tới đăng nhập với `state.from` là đường dẫn bước 4; đăng nhập xong về ĐÚNG bước 4 của khung giờ đó, không có lời gọi ghi booking', async () => {
    useApi();
    setAuthState({ status: 'unauthenticated' });
    const router = renderAt('/');

    const link = await openSlotLink();
    expect(link).toHaveAttribute('href', bookingInfoPath('101'));
    expect(screen.getByText('Đăng nhập để đặt lịch')).toBeInTheDocument();
    fireEvent.click(link);

    await screen.findByRole('heading', { name: 'Đăng nhập' });
    expect(router.state.location.pathname).toBe(LOGIN_PATH);
    expect(router.state.location.state).toEqual({
      from: bookingInfoPath('101'),
    });
    // Khung chat ẩn ở trang đăng nhập và không giữ lựa chọn nào ở kho trình duyệt (thay `sessionStorage` của A6)
    expect(screen.queryByRole('button', { name: 'Trợ lý AI' })).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
    expect(booking.count('GET', '/booking/eligibility')).toBe(0);

    await logIn();
    const body = await screen.findByTestId('booking-step-4-body');
    expect(body).toHaveAttribute('data-reference', '101');
    expect(here(router)).toBe(bookingInfoPath('101'));
    expect(booking.bookingWrites()).toEqual([]);
  });

  it('WTL-13 Bệnh nhân bấm ô giờ: vào thẳng bước 4 với đúng khung giờ (không qua đăng nhập)', async () => {
    useApi();
    setAuthState({
      status: 'authenticated',
      user: { vaiTro: 'BenhNhan', hoTen: 'Người mẫu', daXacMinhEmail: true },
    });
    const router = renderAt('/');

    const link = await openSlotLink();
    expect(screen.queryByText('Đăng nhập để đặt lịch')).toBeNull();
    fireEvent.click(link);

    await waitFor(() => expect(here(router)).toBe(bookingInfoPath('101')));
    const body = await screen.findByTestId('booking-step-4-body');
    expect(body).toHaveAttribute('data-reference', '101');
    expect(booking.bookingWrites()).toEqual([]);
  });

  it('WTL-13 mọi lời gọi của luồng gợi ý đều là GET (chỉ câu hỏi là POST): chatbot không giữ chỗ, không đặt lịch', async () => {
    useApi();
    setAuthState({ status: 'unauthenticated' });
    renderAt('/');

    await openSlotLink();

    const calls = fetchMock.mock.calls.map(([input, init]) => ({
      url: String(input),
      method: init?.method ?? 'GET',
    }));
    const suggestions = calls.filter((call) =>
      call.url.startsWith('/api/chatbot/suggestions'),
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toEqual({
      url: '/api/chatbot/suggestions?chuyenKhoaId=3',
      method: 'GET',
    });
    expect(
      calls.filter((call) => call.method !== 'GET').map((call) => call.url),
    ).toEqual(['/api/chatbot/messages']);
  });

  it('F2-01 trường lạ của máy chủ (học vị, điểm xếp hạng) không hiện ở bất cứ chỗ nào trên màn hình', async () => {
    useApi();
    setAuthState({ status: 'unauthenticated' });
    renderAt('/');

    await openSlotLink();

    expect(document.body.textContent).not.toContain('HOC_VI_NOI_BO');
    expect(document.body.textContent).not.toContain('987654');
    expect(
      within(
        screen.getByRole('region', { name: 'Gợi ý đặt lịch khám' }),
      ).getByText('Giá khám 350.000đ'),
    ).toBeInTheDocument();
  });
});

describe('khoá bản chép của chatbot với search và route thật (F2-16)', () => {
  const routes = createAppRoutes();
  const leafPath = (path: string) =>
    matchRoutes(routes, path)?.at(-1)?.route.path;

  it('F2-16 `bookingInfoPath` khớp route thật của bước 4 (không rơi vào trang 404)', () => {
    expect(leafPath('/dat-lich/thong-tin')).toBe(BOOKING_INFO_PATH);
    expect(bookingInfoPath('101').split('?')[0]).toBe(BOOKING_INFO_PATH);
    expect(leafPath('/dat-lich/duong-khong-co/thong-tin')).toBe('*');
  });

  it('F2-16 giờ hiển thị của chatbot bằng `timeLabel` của search trên nhiều mốc (đầu ngày, cuối ngày, qua ngày, qua năm)', () => {
    const instants = [
      '2026-11-28T02:30:00.000Z',
      '2026-11-27T16:59:00.000Z',
      '2026-11-27T17:00:00.000Z',
      '2026-12-31T17:30:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2026-06-15T05:05:00.000Z',
      '2026-11-28T11:59:59.000Z',
      '2026-11-28T12:00:00.000Z',
      '2026-03-08T07:30:00.000Z',
      '2026-11-01T06:00:00.000Z',
      '2026-11-28T23:59:00.000Z',
      '2027-02-28T16:00:00.000Z',
    ];
    for (const instant of instants) {
      expect(timeLabelVn(instant)).toBe(searchTimeLabel(instant));
    }
  });

  it('F2-16 nhãn chức danh và tên của chatbot bằng của search cho bảy mã và một mã lạ', () => {
    const titles = [
      'BS',
      'BS_CKI',
      'BS_CKII',
      'ThS_BS',
      'TS_BS',
      'PGS_TS_BS',
      'GS_TS_BS',
      'CHUC_DANH_MOI',
    ];
    for (const title of titles) {
      expect(chatbotTitleLabel(title)).toBe(searchTitleLabel(title));
      expect(chatbotDisplayName(title, 'Nguyễn Minh Anh')).toBe(
        searchDisplayName(title, 'Nguyễn Minh Anh'),
      );
    }
  });
});
