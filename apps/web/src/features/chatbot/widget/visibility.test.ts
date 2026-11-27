import type { AuthStatus, VaiTro } from '../../auth';
import {
  HIDDEN_PATH_PREFIXES,
  isWidgetVisible,
  STAFF_ACTIVATION_PATH_COPY,
} from './visibility';

// Chatbot F1, WTL-01 (hàm thuần; qua router thật ở `router/chatbot-widget-route.test.tsx`).
const SHOWN_PATHS = [
  '/',
  '/chuyen-khoa/3',
  '/bac-si',
  '/dat-lich/thong-tin',
  '/benh-nhan/lich-hen-cua-toi',
  '/trang-khong-co',
];
const HIDDEN_PATHS = [
  '/dang-nhap',
  '/dang-ky',
  '/dang-ky/xac-minh',
  '/quen-mat-khau',
  '/kich-hoat',
];
const STAFF: VaiTro[] = ['BacSi', 'LeTan', 'QuanTriVien'];

function visible(
  status: AuthStatus,
  vaiTro: VaiTro | undefined,
  pathname: string,
): boolean {
  return isWidgetVisible({ status, vaiTro, pathname });
}

describe('isWidgetVisible', () => {
  it('WTL-01 khách chưa đăng nhập thấy nút ở mọi trang công khai và cổng Bệnh nhân', () => {
    for (const path of SHOWN_PATHS) {
      expect(visible('unauthenticated', undefined, path)).toBe(true);
    }
  });

  it('WTL-01 Bệnh nhân thấy nút ở trang công khai và cổng Bệnh nhân', () => {
    for (const path of SHOWN_PATHS) {
      expect(visible('authenticated', 'BenhNhan', path)).toBe(true);
    }
  });

  it('WTL-01 Bác sĩ, Lễ tân, Quản trị viên KHÔNG thấy nút ở bất kỳ trang nào (kể cả trang công khai)', () => {
    for (const vaiTro of STAFF) {
      for (const path of [
        ...SHOWN_PATHS,
        '/le-tan',
        '/admin',
        '/bac-si-portal',
      ]) {
        expect(visible('authenticated', vaiTro, path)).toBe(false);
      }
    }
  });

  it('WTL-01 trang đăng nhập, đăng ký, xác minh, quên mật khẩu, kích hoạt nhân sự: ẩn với cả khách và Bệnh nhân', () => {
    for (const path of HIDDEN_PATHS) {
      expect(visible('unauthenticated', undefined, path)).toBe(false);
      expect(visible('authenticated', 'BenhNhan', path)).toBe(false);
    }
  });

  it('WTL-01 đang kiểm tra phiên hoặc phiên lỗi (chưa biết vai): ẩn (Đại duyệt 27/11/2026)', () => {
    for (const status of ['checking', 'error'] as const) {
      for (const path of SHOWN_PATHS) {
        expect(visible(status, undefined, path)).toBe(false);
        expect(visible(status, 'BenhNhan', path)).toBe(false);
      }
    }
  });

  it('WTL-01 ca biên: gạch chéo cuối, hoa thường, trang con của trang ẩn; tên chỉ giống tiền tố thì KHÔNG bị ẩn', () => {
    expect(visible('unauthenticated', undefined, '/dang-nhap/')).toBe(false);
    expect(visible('unauthenticated', undefined, '/DANG-NHAP')).toBe(false);
    expect(visible('unauthenticated', undefined, '/dang-ky/xac-minh')).toBe(
      false,
    );
    expect(visible('unauthenticated', undefined, '/kich-hoat/abc')).toBe(false);
    expect(visible('unauthenticated', undefined, '/dang-nhap-gia')).toBe(true);
    expect(visible('unauthenticated', undefined, '/dang-kyx')).toBe(true);
    expect(visible('unauthenticated', undefined, '/kich-hoat-gia')).toBe(true);
  });

  it('WTL-01 vai Bệnh nhân mà phiên chưa đăng nhập (dữ liệu lạ) vẫn theo trạng thái phiên: khách thì hiện, vai nhân sự thì ẩn', () => {
    expect(visible('unauthenticated', 'BacSi', '/')).toBe(true);
    expect(visible('authenticated', undefined, '/')).toBe(false);
  });

  it('WTL-01 danh sách trang ẩn đúng bốn nhóm', () => {
    expect(HIDDEN_PATH_PREFIXES).toEqual([
      '/dang-nhap',
      '/dang-ky',
      '/quen-mat-khau',
      STAFF_ACTIVATION_PATH_COPY,
    ]);
    expect(STAFF_ACTIVATION_PATH_COPY).toBe('/kich-hoat');
  });
});
