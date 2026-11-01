# ADR — Web Clinix dùng React Router Data Mode (SPA)

Status: Accepted
Date: 2026-11-01
Scope: `apps/web`; liên quan P6 (PR #114), auth F1 (PR #120), Admin F1 (#60)

## Quyết định và căn cứ

Đại và Trung thống nhất ngày 01/11/2026: `apps/web` dùng React Router 8.4 ở **Data Mode** (`createBrowserRouter`), chạy SPA, KHÔNG dùng Framework Mode. ADR này không thay thế ADR-001 của workspace làm việc của nhóm (ngoài repo này), vốn chọn Framework Mode ở chế độ SPA làm mặc định cho các dự án của workspace; đây là một ngoại lệ có chủ đích cho Clinix.

- P6 và auth F1 đã dựng và kiểm trên Data Mode. Mã gắn với kiểu router chỉ gồm `App.tsx`, `router/routes.tsx`, `router/role-routes.tsx` và hai test route; lõi xác thực, lớp API client và thành phần trạng thái không phụ thuộc kiểu router.
- Mã Figma Make của nhóm (nguồn giao diện) dùng `createBrowserRouter` kiểu `Component:`, nên port từng trang sang Data Mode gần như giữ nguyên.
- Ứng dụng là SPA, không có yêu cầu SSR hay prerender; ADR-001 cũng không yêu cầu SSR.
- Data Mode có sẵn `loader`, `action`, `lazy` và `errorElement`.

## Đánh đổi

So với Framework Mode, Clinix không có route module theo quy ước, sinh kiểu tự động cho route và tham số, tách bundle tự động theo route, và error boundary theo quy ước. Nhóm bù bằng các quy ước dưới đây [đề xuất], áp dụng từ module đầu tiên có trang thật (Admin F1):

- Route module: mỗi `features/<module>/` xuất mảng `RouteObject[]`; `router/routes.tsx` chỉ ghép.
- Tách bundle: trang thật khai bằng `lazy: () => import(...)`; trang nhỏ cần ngay (giữ chỗ, đăng nhập) có thể import thường. `lazy` phải trả về `Component`, mà dự án dùng named export, nên viết `lazy: () => import('./ten-trang').then((m) => ({ Component: m.TenTrang }))`.
- Kiểu cho đường dẫn: hằng số đường dẫn và hàm dựng đường dẫn đặt trong module (như `ROLE_HOME_PATHS`, `LOGIN_PATH`); không rải chuỗi đường dẫn trong component.
- Error boundary: `errorElement` ở layout gốc (đã có `RouteErrorPage`), thêm ở layout từng module khi cần.

Rủi ro còn lại: các quy ước này do người giữ, không có công cụ ép như sinh kiểu tự động.

## Khi nào xem lại

Chuyển sang Framework Mode nếu một trong các điều sau xảy ra: cần SSR hoặc prerender (ví dụ SEO cho trang công khai); việc tự quản lý kiểu và `lazy` gây lỗi lặp lại hoặc tốn công rõ rệt; workspace bắt buộc một chế độ chung. Chi phí chuyển tăng theo số route: chạm `App.tsx`, `router/`, `main.tsx`, `vite.config.ts`, cấu hình Vitest, `Dockerfile`, `.dockerignore` và `eslint.config.js` (thư mục build `dist`), và hình dạng quy ước `features/<module>`; phải đo lại luồng đăng nhập. Nếu quyết định chuyển thì làm sớm, trước khi thêm nhiều module.

## Tương thích và xác minh

Không đổi mã. Đồng bộ `docs/PLAN.md` (Phase 1) và `docs/CODING_CONVENTION.md` (mục Frontend). `react-router` hiện ghim 8.4.0 và cần Node từ 22.22 (xem `docs/DEV_SETUP.md`).
