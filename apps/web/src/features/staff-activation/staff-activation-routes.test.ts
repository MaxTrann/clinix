import { createAppRoutes } from '../../router/routes';
import { readCssSource } from '../../test/css-source';
import { STAFF_ACTIVATION_PATH } from './staff-activation-paths';

// Admin F10. Mã ca NSF10-nn là [đề xuất] (TRACKING admin 9A.7); ca nào phủ test case của PLAN thì ghi kèm mã đó.
// `readCssSource` chỉ là hàm đọc file văn bản UTF-8 từ đĩa (tên theo chỗ dùng đầu tiên của nó): vitest `import.meta.glob` không nạp nguồn
// của file đang test, nên đọc bằng `node:fs` như các test hợp đồng khác.
const FEATURE_SOURCES = [
  'staff-activation-page.tsx',
  'activation-form.tsx',
  'activation-result-panels.tsx',
  'activation-link.ts',
  'activation-service.ts',
  'activation-errors.ts',
];

describe('tuyến và cấu trúc của trang kích hoạt', () => {
  it('NSF10-46 /kich-hoat nằm NGOÀI PublicLayout và NGOÀI RequireAuth, cùng cấp với các trang auth, đăng ký bằng lazy', () => {
    const [root] = createAppRoutes();
    const children = root?.children ?? [];

    const route = children.find(({ path }) => path === STAFF_ACTIVATION_PATH);
    expect(route).toBeDefined();
    expect(route?.lazy).toBeTypeOf('function');
    // Không có route nào bọc nó (khung công khai, RequireAuth, khu vai trò)
    const nested = children
      .flatMap(({ children: inner }) => inner ?? [])
      .filter(({ path }) => path === STAFF_ACTIVATION_PATH);
    expect(nested).toEqual([]);
    expect(STAFF_ACTIVATION_PATH).toBe('/kich-hoat');
  });

  it('NSF10-46 index.ts KHÔNG xuất trang (để chunk chính không phình, ADR 0002): chỉ xuất đường dẫn và danh sách route', async () => {
    const mod = await import('./index');
    expect(Object.keys(mod).sort()).toEqual([
      'STAFF_ACTIVATION_PATH',
      'STAFF_ACTIVATION_ROUTES',
    ]);
  });

  it.each(FEATURE_SOURCES)(
    'NSF10-46 %s không dùng useLocation hay useAuth (fragment ở router không bị đọc; phiên bị bỏ qua)',
    (file) => {
      const source = readCssSource(import.meta.url, `./${file}`);
      expect(source).not.toMatch(/\buse(Location|Auth)\s*\(/);
      expect(source).not.toMatch(
        /import\s*\{[^}]*\buse(Location|Auth)\b[^}]*\}/,
      );
    },
  );

  it.each(FEATURE_SOURCES)(
    'NSF10-46 %s không dùng kho trình duyệt hay console (token và mật khẩu chỉ ở state của trang)',
    (file) => {
      const source = readCssSource(import.meta.url, `./${file}`);
      expect(source).not.toMatch(
        /\b(localStorage|sessionStorage|document\.cookie|indexedDB|console\.)/,
      );
    },
  );
});
