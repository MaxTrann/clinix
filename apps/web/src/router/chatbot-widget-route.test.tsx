import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, matchRoutes } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import {
  FORGOT_PASSWORD_PATH,
  LOGIN_PATH,
  REGISTER_PATH,
  type VaiTro,
} from '../features/auth';
import { resetAuthForTest } from '../features/auth/auth-session';
import { setAuthState } from '../features/auth/auth-store';
import {
  DOCTOR_LOOKUP_PATH,
  entityPath,
} from '../features/chatbot/widget/entity-paths';
import {
  HIDDEN_PATH_PREFIXES,
  STAFF_ACTIVATION_PATH_COPY,
} from '../features/chatbot/widget/visibility';
import { STAFF_ACTIVATION_PATH } from '../features/staff-activation';
import { PATIENT_APPOINTMENTS_PATH } from '../shared/routes/booking-paths';
import { PATIENT_WALLET_PATH } from '../shared/routes/wallet-paths';
import { createAppRoutes } from './routes';

// Chatbot F1 `[ĐỤNG router]`. WTL-01 qua bảng route THẬT (`createAppRoutes()`): `RootLayout` gắn khung chat, nút hiện đúng nhóm và ẩn đúng nhóm.
// Cộng với bộ khoá hợp đồng: các đường dẫn mà chatbot giữ riêng (bác sĩ, chuyên khoa, chi nhánh, "Tra cứu bác sĩ", "/kich-hoat") phải khớp route thật,
// vì chatbot không import `features/search` hay `features/staff-activation` (PLAN chatbot 1.2) nên không có gì khác giữ chúng khớp nhau.
const LAUNCHER = { name: 'Trợ lý AI' };

function stubPublicApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}', { status: 500 }))),
  );
}

function setAuth(role: 'guest' | VaiTro) {
  if (role === 'guest') {
    setAuthState({ status: 'unauthenticated', user: null });
  } else {
    setAuthState({
      status: 'authenticated',
      user: { vaiTro: role, hoTen: 'Người dùng thử', daXacMinhEmail: true },
    });
  }
}

function renderAt(path: string) {
  const router = createMemoryRouter(createAppRoutes(), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  cleanup();
  resetAuthForTest();
  vi.unstubAllGlobals();
});

describe('khung chat gắn ở RootLayout (WTL-01)', () => {
  it('WTL-01 khách thấy nút "Trợ lý AI" ở trang chủ công khai', () => {
    stubPublicApi();
    setAuth('guest');
    renderAt('/');
    expect(
      screen.getByRole('heading', {
        name: 'Đặt lịch khám đúng bác sĩ, đúng giờ',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', LAUNCHER)).toBeInTheDocument();
  });

  it('WTL-01 Bệnh nhân thấy nút ở trang công khai', () => {
    stubPublicApi();
    setAuth('BenhNhan');
    renderAt('/');
    expect(screen.getByRole('button', LAUNCHER)).toBeInTheDocument();
  });

  it('WTL-01 Bệnh nhân thấy nút ở cổng Bệnh nhân', async () => {
    stubPublicApi();
    setAuth('BenhNhan');
    renderAt(PATIENT_APPOINTMENTS_PATH);
    expect(await screen.findByRole('button', LAUNCHER)).toBeInTheDocument();
  });

  it('WTL-01 Bác sĩ, Lễ tân, Quản trị viên KHÔNG thấy nút (kể cả ở trang công khai)', () => {
    stubPublicApi();
    for (const role of ['BacSi', 'LeTan', 'QuanTriVien'] as const) {
      setAuth(role);
      renderAt('/');
      expect(
        screen.getByRole('heading', {
          name: 'Đặt lịch khám đúng bác sĩ, đúng giờ',
        }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', LAUNCHER)).toBeNull();
      cleanup();
    }
  });

  it('WTL-01 khách không thấy nút ở trang đăng nhập, đăng ký và quên mật khẩu', async () => {
    stubPublicApi();
    const pages: Array<[string, string]> = [
      [LOGIN_PATH, 'Đăng nhập'],
      [REGISTER_PATH, 'Tạo tài khoản'],
      [FORGOT_PASSWORD_PATH, 'Quên mật khẩu'],
    ];
    for (const [path, heading] of pages) {
      setAuth('guest');
      renderAt(path);
      await screen.findByRole('heading', { name: heading });
      expect(screen.queryByRole('button', LAUNCHER)).toBeNull();
      cleanup();
    }
  });

  it('WTL-01 phiên chưa rõ (đang kiểm tra) thì chưa có nút', () => {
    stubPublicApi();
    setAuthState({ status: 'checking', user: null });
    renderAt('/');
    expect(screen.queryByRole('button', LAUNCHER)).toBeNull();
  });
});

describe('khoá hợp đồng đường dẫn của chatbot với bảng route thật', () => {
  const routes = createAppRoutes();
  // Mẫu route của khớp cuối cùng; `*` là trang 404 (đường dẫn chatbot dựng ra mà rơi vào đây là sai)
  const leafPath = (path: string) =>
    matchRoutes(routes, path)?.at(-1)?.route.path;

  it('WTL-01 liên kết thực thể khớp đúng route: bác sĩ, chuyên khoa, chi nhánh (không rơi vào trang 404)', () => {
    expect(leafPath(entityPath('BacSi', '5')!)).toBe('bac-si/:id');
    expect(leafPath(entityPath('ChuyenKhoa', '5')!)).toBe('chuyen-khoa/:id');
    expect(leafPath(entityPath('ChiNhanh', '5')!)).toBe('chi-nhanh/:id');
  });

  it('WTL-01 "Tra cứu bác sĩ và lịch khám" khớp trang Đội ngũ bác sĩ, không phải 404', () => {
    expect(leafPath(DOCTOR_LOOKUP_PATH)).toBe('bac-si');
  });

  it('WTL-05 "Lịch hẹn của tôi" và "Ví của tôi" khớp route của cổng Bệnh nhân, không phải 404', () => {
    for (const path of [PATIENT_APPOINTMENTS_PATH, PATIENT_WALLET_PATH]) {
      const last = leafPath(path);
      expect(last).toBeDefined();
      expect(last).not.toBe('*');
    }
  });

  it('WTL-01 đường dẫn lạ vẫn rơi vào 404 (đối chứng: bộ so có tác dụng)', () => {
    expect(leafPath('/duong-khong-co')).toBe('*');
    expect(leafPath('/bac-si/5/khong-co')).toBe('*');
  });

  it('WTL-01 danh sách trang ẩn khớp đúng hằng của auth và staff-activation', () => {
    expect(STAFF_ACTIVATION_PATH_COPY).toBe(STAFF_ACTIVATION_PATH);
    expect(HIDDEN_PATH_PREFIXES).toEqual([
      LOGIN_PATH,
      REGISTER_PATH,
      FORGOT_PASSWORD_PATH,
      STAFF_ACTIVATION_PATH,
    ]);
  });

  it('WTL-01 mỗi trang trong danh sách ẩn có route thật (không ẩn nhầm đường dẫn không tồn tại)', () => {
    for (const path of HIDDEN_PATH_PREFIXES) {
      const last = leafPath(path);
      expect(last).toBeDefined();
      expect(last).not.toBe('*');
    }
  });
});
