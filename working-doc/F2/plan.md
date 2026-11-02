# F2 — Kế hoạch giao diện quản lý chuyên khoa

Status: In progress  
Mode: IMPLEMENT  
Owner: junUTE  
Updated: 2026-11-02

## 1. Goal and scope

- Goal: hoàn thiện giao diện Admin F2 cho quản lý chuyên khoa theo issue #61, frame Figma 538:2, 539:2, 540:2 và 628:2.
- In scope: trang danh sách; tìm kiếm/lọc/phân trang; tạo/sửa; đổi trạng thái; upload/preview ảnh theo P7; hiển thị lỗi trùng tên và giữ dữ liệu form; banner và quyền chỉ xem cho Admin Chi nhánh; route/menu nối vào shell F1.
- Out of scope: thay đổi API/backend, schema/migration, quy tắc nghiệp vụ, auth/RBAC, cấu hình Cloudinary, tài liệu 2.4/Figma, commit/push/PR/merge.
- Acceptance criteria:
  1. Route Admin chuyên khoa tải danh sách từ API thật, có loading/empty/error/retry và phân trang/tìm kiếm/lọc theo contract B1/P6.
  2. Admin Toàn hệ thống có thể tạo/sửa chuyên khoa và đổi trạng thái; chuyên khoa mới luôn bắt đầu ở `DangHoatDong`; thành công làm mới đúng dữ liệu.
  3. Admin Chi nhánh xem được danh sách cùng banner; không có thao tác ghi trên giao diện. Backend vẫn là ranh giới quyền.
  4. Lỗi `TEN_CHUYEN_KHOA_TRUNG` hiện tại trường tên, giữ dữ liệu nhập và cho sửa/gửi lại (CK-15).
  5. Ảnh tuân theo P7: gửi multipart `file` tới upload API, preview URL trả về, lưu `imageUploadId`; giới hạn UI phản ánh policy đã duyệt (đầu vào ≤10 MB/25 MP, kết quả ≤2 MB).
  6. Test component/route bao phủ các ca F2; lint/build/test web chạy được hoặc blocker được ghi rõ.

## 2. Evidence and context

- Task input: issue [#61 — Admin F2 quản lý chuyên khoa](https://github.com/MaxTrann/clinix/issues/61), đang mở; mô tả danh sách/thêm-sửa/đổi trạng thái/lỗi trùng tên giữ dữ liệu/Chi nhánh chỉ xem; test case CK-15.
- Dependencies: issue #60 F1 và #55 B1 đã đóng; checkout đang ở `feat/admin-f2`, HEAD cùng commit `eb0dba7` như `main`.
- Figma: file `1OsOfwD5myNNRv7FPCD9YC`; danh sách 538:2, tạo 539:2, sửa 540:2, Chi nhánh 628:2. Danh sách có tên/mô tả/số bác sĩ/trạng thái/thao tác; form có tên/mô tả/ảnh tùy chọn/trạng thái.
- API: `apps/api/src/admin/specialties/` có GET list/detail, POST, PATCH detail, PATCH status. Upload P7 là POST `/admin/uploads/specialty-image`, multipart `file`, trả `uploadId`, `url`, `expiresAt`; PATCH bỏ `imageUploadId` để giữ, `null` để gỡ, UUID để gắn/thay.
- VERIFIED: API response có `chuyenKhoaId`, `ten`, `moTa`, `anhDaiDien`, `trangThaiHoatDong`, `soBacSi`; filter hỗ trợ `q`, `trangThaiHoatDong`, `page`, `pageSize`; lỗi trùng là HTTP 409 `TEN_CHUYEN_KHOA_TRUNG`.
- VERIFIED: nhánh sạch trước task; không có `working-doc/F2/` trước khi bắt đầu.
- VERIFIED: người dùng xác nhận giữ contract B1: tạo mới luôn `DangHoatDong`; checkbox ở form tạo disabled.
- VERIFIED: không có browser executable hoặc Playwright/Puppeteer runtime khả dụng để so sánh screenshot của ứng dụng; ghi nhận giới hạn ở tracker.

## 3. Questions, assumptions and decisions

### Questions requiring an answer

- None.

### Assumptions

- Route page là `/admin/chuyen-khoa`, phù hợp label/menu F1 và convention của router hiện tại.
- Tạo mới luôn hoạt động theo contract B1; checkbox ở form tạo được giữ checked và disabled. Trong form sửa, checkbox đổi trạng thái qua endpoint riêng.
- Lỗi mutation không xóa hoặc thay dữ liệu người dùng đang nhập.
- UI không coi route guard là security boundary; quyền backend C1/B1 giữ nguyên.

### Decisions

- Existing Accepted ADR: Clinix dùng React Router 8.4 Data Mode theo ADR 0002; không đổi router/kiến trúc.
- Không thay API hoặc schema nếu chưa có quyết định mới.
- Người dùng xác nhận ngày 2026-11-02: giữ contract B1; chuyên khoa tạo mới luôn `DangHoatDong`, không mở rộng API.

## 4. Core-feature impact

- Does this change core behavior? Yes.
- Affected actors/flows: Admin Toàn hệ thống quản lý danh mục; Admin Chi nhánh chỉ xem danh sách.
- Reason: F2 bật một luồng quản trị danh mục và ảnh hưởng nội dung chuyên khoa dùng bởi module khác.
- Backward-compatibility risk: thấp nếu giữ API B1; tăng nếu mở rộng API tạo mới hoặc đổi contract trạng thái.

## 5. Proposed approach

- Frontend: feature `admin/specialties` gồm typed service, hook, screen và dialog; dùng shared API client, `AdminTable`, `AdminSearchInput`, `AdminScopeGuard`; bật menu/route F2. Dùng endpoint status riêng. Checkbox tạo mới disabled và checked. Giữ trạng thái form sau lỗi API, đặc biệt 409.
- Backend: không đổi khi giữ contract B1. Nếu chọn tạo trạng thái ngừng, cần cập nhật riêng DTO/service/test B1 trước hoặc cùng implementation và điều chỉnh scope.
- Data: không đổi.
- Integration/AI: tái dùng upload P7, không gọi Cloudinary từ browser và không giữ secret.
- Security/privacy: giới hạn upload theo contract, backend kiểm role/scope/nội dung; Admin Chi nhánh chỉ GET; không đưa URL tùy ý hoặc `public_id` vào request.

## 6. Work breakdown

| ID | Task | Output/evidence | Depends on | Parallel with |
|---|---|---|---|---|
| T1 | Kiểm tra issue, dependency, Figma, API và trạng thái Git | Scope/API/design đã đối chiếu | — | — |
| T2 | Chốt trạng thái khởi tạo chuyên khoa | Người dùng chọn giữ contract B1; plan/tracker cập nhật | T1 | — |
| T3 | Thêm service/hook, route/menu, danh sách và query state | Page F2 hoạt động theo contract B1/P6 | T2 | — |
| T4 | Thêm form tạo/sửa, ảnh, trạng thái và lỗi giữ form | Dialogs theo frame 539:2/540:2; upload P7 | T2, T3 | — |
| T5 | Thêm component/route tests, cập nhật docs/tracker và review diff | CK-15 cùng F2 states được xác minh | T3, T4 | — |
| T6 | So sánh render browser với Figma nếu môi trường hiện có hỗ trợ | Ghi kết quả/giới hạn đối chiếu | T3, T4 | — |

## 7. Expected file/module impact

- Create: `apps/web/src/features/admin/specialties/**`; test files; `working-doc/F2/plan.md`, `working-doc/F2/tracker.md`.
- Modify: `apps/web/src/features/admin/admin-routes.tsx`, `apps/web/src/features/admin/components/admin-sidebar.tsx`, feature export nếu cần; `docs/features/admin/PLAN.md` và `TRACKING.md` để thêm test traceability/evidence.
- Do not touch: `apps/api/**` (trừ khi người dùng duyệt mở rộng API), schema/migrations, `.env*`, lockfiles/dependencies, auth/C1 implementation, tài liệu ngoài repo.

## 8. Verification

- Unit/component: list state, query/filter/page, create/edit, image upload validation/preview, duplicate name preserves form and focuses/reports the name field, branch read-only.
- Integration: không chạy MySQL/API test vì F2 là frontend; dùng API client mock trong component/route tests.
- E2E: chỉ nếu có hạ tầng và lệnh đã được xác minh.
- Lint/typecheck/build: scripts `npm run lint`, `npm test`, `npm run build` trong `apps/web/package.json`.
- Manual check: mở route ở cả scope Toàn hệ thống/Chi nhánh nếu fixture/runtime sẵn có; so screenshot Figma khi browser tool/runtime phù hợp.

## 9. Completion criteria

- [x] Quyết định trạng thái khi tạo đã được ghi.
- [x] Acceptance criteria và CK-15 được phủ bởi test phù hợp.
- [x] Lint/build/test đã chạy và kết quả thật được ghi.
- [x] Security/privacy, diff, Admin PLAN/TRACKING và task tracker được rà soát/cập nhật.
- [x] Browser visual comparison được xem xét; môi trường không có browser runtime, giới hạn đã ghi trong tracker.

Theo yêu cầu người dùng ngày 2026-11-02, `TRUNG_AI_USAGE_LOG.md` đã được cập nhật mục 34 và AI-BUG-031.
