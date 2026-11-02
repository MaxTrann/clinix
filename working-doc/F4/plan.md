# F4 — Thông tin phòng khám (frontend)

Status: IMPLEMENT complete locally  
Mode: IMPLEMENT  
Owner: Trung  
Updated: 2026-11-02

## 1. Goal and scope

- Goal: triển khai giao diện Admin “Thông tin chung” để đọc và cập nhật cấu hình phòng khám qua B4.
- In scope: route `/admin/thong-tin-phong-kham`; mục sidebar; màn hình theo Figma frame `541:2`; GET/PUT `/admin/clinic-info`; form 4 trường; validation và ánh xạ lỗi API; loading/error/success/submitting; quyền Toàn hệ thống; component/service/route tests; cập nhật Admin PLAN/TRACKING và nhật ký Trung.
- Out of scope: API/B4, schema/migration/seed, chức năng tab Chi nhánh, thay đổi auth/RBAC, dependency/lockfile, Figma edits, commit/push/PR/merge/deploy.
- Task input: Admin PLAN row F4 và Figma file `1OsOfwD5myNNRv7FPCD9YC`, node `541:2`; B4 contract/source. Issue number/URL riêng của F4 chưa tìm thấy trong checkout.

### Acceptance criteria

- Admin Toàn hệ thống mở được route và thấy shell/sidebar hiện tại cùng nội dung theo frame Figma; mục “Thông tin phòng khám” đang hoạt động.
- GET lấy đúng bốn trường `tenThuongHieu`, `diaChiTruSo`, `duongDayNong`, `email`; giá trị null hiển thị thành ô trống, không dùng dữ liệu mẫu.
- Bốn trường có nhãn, trạng thái bắt buộc và icon theo frame; form báo lỗi theo rule PK nếu dữ liệu thiếu/sai định dạng.
- PUT gửi đúng bốn field, không gửi id hoặc field ngoài contract; nút chống gửi lặp, phản hồi thành công được thông báo.
- Lỗi validation từ API gắn đúng field và giữ nội dung người dùng; lỗi mạng/5xx có thông báo an toàn. GET có thể thử lại; thao tác PUT không tự retry.
- Admin Chi nhánh bị route guard từ chối; quyền backend B4 vẫn là chốt bảo mật.
- Loading, error, success và submitting hỗ trợ bàn phím, nhãn truy cập được và bố cục co giãn.
- UI bám node `541:2`; static SVG dùng trong form được lưu local, không dùng URL tạm của Figma.

## 2. Evidence and context

- VERIFIED: Admin PLAN row F4 mô tả form bốn trường, lỗi định dạng, từ chối Chi nhánh; phụ thuộc F1 và B4.
- VERIFIED: Figma node `541:2` là “Admin - Thông tin phòng khám”, khung 1440px; có heading/subtitle, tab “Thông tin chung”, tab “Chi nhánh”, card form bốn trường và nút “Lưu thông tin chung”.
- VERIFIED: B4 controller khai báo `GET/PUT /admin/clinic-info`, role `QuanTriVien`, scope `ToanHeThong`.
- VERIFIED: GET trả bốn field nullable; PUT trả bốn field camelCase, không có id. DTO yêu cầu tên 1–100, địa chỉ 1–255, hotline mobile 10 số hoặc 1800/1900 + 4–6 số (chuẩn hóa dấu cách/chấm/gạch), email theo auth S5.
- VERIFIED: frontend dùng React 19, TypeScript strict, React Router 8.4 Data Mode, CSS Modules và API client chung; không có React Hook Form/Zod trong manifest web.
- UNKNOWN: số issue GitHub của F4; chưa tìm thấy trong checkout, không suy đoán từ thứ tự issue. Figma Code Connect không đọc được do tài khoản hiện không có Dev/Full seat; đối chiếu dùng Figma screenshot và assets SVG tĩnh.
- VERIFIED: mở preview local của trang F4 bằng dữ liệu mock, chụp và đối chiếu bố cục/icon với Figma node `541:2`; không gọi API hay ghi DB. Screenshot: `C:\Users\Admin\.codex\visualizations\2026\11\02\01a19b93-33d3-7c03-9402-51c20bb2c36d\f4-local.png`.

## 3. Decisions and assumptions

- Không có quyết định nghiệp vụ đang chờ. Người dùng yêu cầu tiến hành F4.
- GET trả null: để trống input; không seed hoặc dựng giá trị ví dụ trên màn hình.
- Cả bốn trường đều bắt buộc theo frame; FE kiểm tra đầu vào dễ thấy và backend tiếp tục là nguồn xác thực cuối.
- PUT thành công: hiển thị xác nhận inline và cập nhật form từ response.
- Tab “Chi nhánh” được hiển thị disabled theo giới hạn F4; không dựng nội dung hoặc badge số lượng khi chưa có contract/API của F6.
- Lỗi mạng/timeout của PUT không được gửi lại tự động; chỉ cho phép người dùng chủ động bấm Lưu lần nữa.
- Chỉ sửa `TRUNG_AI_USAGE_LOG.md` theo yêu cầu trực tiếp của người dùng.

## 4. Core-feature and risk impact

- Does this change core behavior? Yes. Admin Toàn hệ thống sẽ cập nhật cấu hình phòng khám qua UI.
- Data/security: không đổi dữ liệu/API contract; gửi đúng bốn field; route guard UX chỉ bổ sung, backend B4 vẫn authorize.
- Privacy: không log payload, email hoặc hotline.
- Backward compatibility: không đổi API/schema; F4 chỉ tiêu thụ B4.

## 5. Proposed approach

- Route: thêm lazy route dưới `ADMIN_ROUTES`, bọc scope `ToanHeThong`; giữ route registry hiện tại.
- UI: feature `clinic-info/` gồm service, types, hook state và page; CSS Module theo F2/F3. Tái dùng loading/error và shell Admin hiện có.
- API: dùng `request` duy nhất; GET khi mount có AbortController; PUT gửi đúng shape, timeout mặc định, không retry tự động.
- Validation: kiểm required/length/hotline/email ở FE theo PK và auth S5; xử lý mã `DU_LIEU_KHONG_HOP_LE` bằng `loi[]` và giữ giá trị.
- Assets: tải SVG biểu tượng của hai tab, bốn trường và nút lưu từ Figma vào `public/assets/admin/clinic-info/`.
- Tests: component/service; role-scope và menu/route; happy path, null GET, invalid input/API errors, retry GET, double submit, forbidden scope.

## 6. Work breakdown

| ID | Task | Output/evidence | Depends on | Status |
|---|---|---|---|---|
| T1 | Xác định F4, kiểm tra nhánh/source, Admin plan/tracking, B4 API contract và Figma | Scope và evidence ở mục 2 | — | done |
| T2 | Tạo plan/tracker và chốt acceptance/assumptions | Plan này và tracker.md | T1 | done |
| T3 | Thêm service/hook/page, route/sidebar, styles và Figma SVG local | Source F4; route chỉ Toàn hệ thống; assets cục bộ | T2 | done |
| T4 | Viết test theo AF4 và chạy kiểm tra web phù hợp | Vitest 201/201, lint/build/diff pass; visual preview đối chiếu Figma | T3 | done |
| T5 | Rà diff, cập nhật Admin PLAN/TRACKING và nhật ký Trung | Evidence cuối phiên; CI/PR/review/merge vẫn pending | T4 | done |

## 7. Expected file impact

- Create: `working-doc/F4/plan.md`, `working-doc/F4/tracker.md`; `apps/web/src/features/admin/clinic-info/*`; F4 component tests; Figma SVG tại `apps/web/public/assets/admin/clinic-info/`.
- Modify: `apps/web/src/features/admin/admin-routes.tsx`, `apps/web/src/features/admin/components/admin-sidebar.tsx`, `apps/web/src/features/admin/admin-layout.test.tsx`, `docs/features/admin/PLAN.md`, `docs/features/admin/TRACKING.md`, `TRUNG_AI_USAGE_LOG.md`.
- Do not touch: API, schema/migrations, auth, .env, dependency manifests/lockfiles, shared root tracking.

## 8. Verification plan

- `npm run test -- --reporter=dot` trong `apps/web`.
- `npm run lint` và `npm run build` trong `apps/web`.
- `git diff --check` trong repo Clinix.
- So bố cục và icon F4 với screenshot node `541:2` bằng preview local; ghi rõ preview dùng dữ liệu mock, không xác minh tích hợp API runtime.

## 9. Completion criteria

- Acceptance trên được triển khai và có test evidence; route Chi nhánh bị từ chối. Đây là hoàn tất local, chưa phải CI/PR/review/merge.
- Lint/build/tests thực tế được ghi trong tracker; kiểm tra visual ghi rõ pass hoặc giới hạn.
- Admin PLAN/TRACKING và nhật ký Trung cập nhật; không có secret, URL asset tạm, thay đổi ngoài scope.
- Không commit/push/PR/merge/deploy.
