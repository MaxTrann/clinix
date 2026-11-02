# F3 — Quản lý loại dịch vụ khám (frontend)

Status: In progress
Mode: IMPLEMENT
Owner: junUTE
Updated: 2026-11-02

## 1. Goal and scope

- Goal: Hoàn thiện giao diện Admin quản lý loại dịch vụ khám theo issue [#62](https://github.com/MaxTrann/clinix/issues/62), dùng API B2/B3 hiện có.
- In scope:
  - Trang hai tab Nhóm/Dịch vụ, nối menu F3 và route Admin `/admin/dich-vu-kham`.
  - Admin Toàn hệ thống và Admin Chi nhánh xem danh sách; chỉ Toàn hệ thống được thêm/sửa/xóa nhóm và thêm/sửa dịch vụ.
  - Nhóm: danh sách, paging/search theo thiết kế, tạo/sửa, xác nhận xóa; API chỉ xóa nhóm rỗng.
  - Dịch vụ: danh sách, paging/search theo thiết kế, tạo/sửa; không có thao tác xóa dịch vụ.
  - Loading, empty, error/retry; giữ dữ liệu form khi mutation lỗi; ánh xạ maLoi theo Admin PLAN.
  - Áp dụng quyết định styling đã chốt: Tailwind CSS 4.3.3, @tailwindcss/vite 4.3.3, lucide-react 1.59.0, @fontsource-variable/inter 5.3.0 tự host; Inter, html 15px, token ngữ nghĩa từ màu Figma và quy ước arbitrary values. Tạo ADR 0003.
- Out of scope:
  - Thay đổi API/backend, schema/migration, seed, RBAC, dữ liệu booking, chính sách đặt cọc/hoàn tiền, hoặc thêm trạng thái bật/tắt.
  - Xóa dịch vụ khám.
  - Sửa Word 2.4 hoặc chỉnh Figma.
  - Di chuyển toàn bộ CSS Modules Admin hiện có trong task này; F3 dùng Tailwind. Chuyển shell F1 theo styling mới được theo dõi riêng sau F3.
  - Commit, push, PR, merge hoặc đóng issue.
  - Cọc, trạng thái dịch vụ, nút bật/tắt và trường đặt cọc vì không thuộc API contract B3.
- Acceptance criteria:
  1. UI bám sát các frame Figma 548:2, 560:2–565:2 và Chi nhánh chỉ xem 630:2, bỏ các mục ngoài contract theo quyết định người dùng.
  2. Tab Nhóm dùng GET /admin/service-groups; tab Dịch vụ dùng GET /admin/services. Hỗ trợ paging/search P6 khi thiết kế có các điều khiển đó; giữ thứ tự từ API.
  3. Toàn hệ thống có thể tạo/sửa nhóm và dịch vụ; xóa nhóm chỉ sau xác nhận. Nhóm còn dịch vụ báo lỗi, không bị xóa. Chi nhánh không có controls ghi; backend C1 tiếp tục kiểm quyền.
  4. Form dịch vụ có nhóm, tên, thời lượng, giá theo B3; giữ giaMacDinh dạng chuỗi thập phân và không gửi mucDatCoc/chinhSachHoan.
  5. Lỗi trùng tên, nhóm không tồn tại, nhóm còn dịch vụ và thời lượng đang được dùng được hiển thị đúng; form giữ dữ liệu để sửa/gửi lại; chọn câu theo maLoi.
  6. Không có nút xóa dịch vụ; đổi giá không tác động snapshot giá lịch hẹn; lỗi chặn đổi thời lượng không bị coi là thành công.
  7. Test UI gắn mã DV-* và AF3-*; thêm ma trận AF3 vào Admin PLAN trước khi dùng trong tests.
  8. Styling F3 dùng Tailwind/token đã duyệt, không tạo CSS Module mới; ADR 0003 ghi lựa chọn và migration plan.

### Mã test UI dự kiến

| ID     | Kịch bản                                                      | Mong đợi                                                                              |
| ------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| AF3-01 | Tải tab Nhóm/Dịch vụ; loading, rỗng, lỗi/retry, paging/search | Trạng thái/query đúng thiết kế/API; không lẫn dữ liệu giữa tab                        |
| AF3-02 | Tạo/sửa nhóm; dữ liệu sai hoặc trùng tên                      | Thành công cập nhật list; lỗi giữ form và báo trường (DV-01…04, DV-17)                |
| AF3-03 | Xóa nhóm                                                      | Có xác nhận; nhóm rỗng xóa được; nhóm còn dịch vụ báo lỗi (DV-05…06)                  |
| AF3-04 | Tạo/sửa dịch vụ; sai nhóm/giá/thời lượng/trùng tên            | Lỗi đúng trường; giữ form; không gửi field ngoài contract (DV-07…13, DV-15, DV-17…18) |
| AF3-05 | Đổi thời lượng đang bị lịch/khung giờ dùng                    | Báo THOI_LUONG_DANG_DUNG; giữ form; sửa tên/giá vẫn được (DV-14)                      |
| AF3-06 | Admin Chi nhánh mở trang                                      | Xem list và banner, không có thao tác ghi (DV-16)                                     |
| AF3-07 | Menu/route/dialog dùng bàn phím                               | Route active đúng; label, validation và focus hoạt động theo shared UI                |

## 2. Evidence and context

- Task input: [#62](https://github.com/MaxTrann/clinix/issues/62) đang mở; scope là hai tab, Thêm/Sửa, xác nhận xóa nhóm, Chi nhánh chỉ xem; issue dẫn DV-17 và ghi không cần đồng bộ tài liệu ngoài.
- Dependencies: [#60 F1](https://github.com/MaxTrann/clinix/issues/60), [#56 B2](https://github.com/MaxTrann/clinix/issues/56), [#57 B3](https://github.com/MaxTrann/clinix/issues/57) hiện đóng. Checkout feat/admin-f3, HEAD 7e4b9a7, sạch khi lập plan.
- Source inspected: apps/web/src/features/admin/admin-routes.tsx có guard Any và route chuyên khoa; sidebar còn menu Loại dịch vụ khám disabled. B2 controller có GET/POST/PATCH/DELETE; B3 controller có GET list/detail và POST/PATCH, không có DELETE.
- VERIFIED: source API B2/B3 có trong checkout; B2 mutation/xóa nhóm và B3 mutation dùng scope Toàn hệ thống; GET dùng được ở hai scope.
- VERIFIED: B2 contract ở Admin PLAN mục 5.3; B3 contract ở working-doc/B3/plan.md mục 3. ID bigint và giá decimal là chuỗi; không xóa dịch vụ; lỗi ổn định gồm TEN_NHOM_DICH_VU_TRUNG, NHOM_DICH_VU_CON_DICH_VU, TEN_DICH_VU_TRUNG, NHOM_DICH_VU_KHONG_TON_TAI, THOI_LUONG_DANG_DUNG.
- VERIFIED: Admin PLAN mục 4.4 liệt kê frame 548:2, 560:2–565:2, 630:2; mục 7.2 có DV-01…21, trong đó DV-17 yêu cầu giữ dữ liệu và báo lỗi từng trường.
- VERIFIED: apps/web/package.json có scripts test, lint, build; chưa có Tailwind/Lucide/Inter. docs/adr hiện có ADR 0001/0002.
- VERIFIED: Admin TRACKING vẫn ghi B2/B3 còn PR/review/merge, khác trạng thái issue đóng và source hiện tại. Rà soát traceability khi triển khai; không sửa lịch sử test cũ nếu chưa có evidence.
- VERIFIED: Design context/screenshot đã mở cho frames 548:2, 560:2–565:2 và 630:2; route ứng dụng là `/admin/dich-vu-kham`. Đã đối chiếu bảng, form inline, banner read-only và hộp xác nhận.
- VERIFIED: Design context dùng các màu `#0092b8`, `#007595`, `#101828`, `#4a5565`, `#99a1af`, `#f8fafc`, `#f9fafb`, `#e5e7eb`, `#ecfeff`, `#dcfce7`, `#008236`, `#fb2c36`; variable defs chỉ expose trắng bề mặt và trắng chữ trên brand. Code Connect bị Figma từ chối do yêu cầu Dev/Full seat; không có mapping khả dụng.
- VERIFIED: B3 không nhận/trả `mucDatCoc` hoặc `chinhSachHoan`, không có trạng thái bật/tắt; người dùng duyệt ngày 2026-11-02 giữ contract và bỏ Cọc/Trạng thái/nút Tắt/trường đặt cọc trong F3.
- DECIDED: Figma còn có lọc theo nhóm và cột số dịch vụ/nhóm nhưng B2/B3 chưa hỗ trợ; người dùng cho biết sẽ phát triển API sau. F3 hiện giữ control lọc và lọc client-side trên trang kết quả đang tải; cột số lượng dùng `—` đến khi API trả aggregate. Không gửi query/field mới.
- UNKNOWN: Word 2.4 gốc ngoài checkout; issue F3 không yêu cầu đồng bộ nên đây không phải blocker.

## 3. Questions, assumptions and decisions

### Questions requiring an answer

- Không còn câu hỏi về cọc/trạng thái; người dùng đã duyệt giữ contract B3 và bỏ các mục tương ứng trong Figma.

### Assumptions

- Route `/admin/dich-vu-kham` theo router Admin và menu F3.
- Paging mặc định pageSize 20 theo P6; chỉ thêm tìm kiếm/điều khiển khác nếu Figma có.
- Tái dùng AdminTable, AdminSearchInput, AdminConfirmationDialog, AdminScopeGuard và shared API client nếu phù hợp.
- Chi nhánh chỉ đọc trên UI; authorization vẫn do backend quyết định.

### Decisions

- Existing Accepted ADR: docs/adr/0002-web-react-router-data-mode.md; giữ React Router 8.4 Data Mode.
- Người dùng đã chốt ngày 2026-10-28: Tailwind CSS 4.3.3 + @tailwindcss/vite 4.3.3, lucide-react 1.59.0, @fontsource-variable/inter 5.3.0 tự host, Inter, html 15px, token ngữ nghĩa từ màu Figma/Make, quy ước arbitrary values; ADR 0003 thuộc F3. Không mở lại lựa chọn styling.
- Giữ API B2/B3; không thêm endpoint, field hoặc persistence.
- Ngày 2026-11-02, người dùng duyệt bắt đầu IMPLEMENT và giữ contract B2/B3; bỏ Cọc, Trạng thái, nút Tắt và trường đặt cọc theo mockup Figma. Không mở rộng API/schema.
- Ngày 2026-11-02, người dùng xác nhận API lọc nhóm/đếm nhóm sẽ phát triển sau; F3 giữ giao diện, không thay đổi contract hiện tại.

## 4. Core-feature impact

- Does this change core behavior? Yes — thay đổi giao diện quản trị danh mục dịch vụ khám.
- Affected actors/flows: Admin Toàn hệ thống quản lý nhóm/dịch vụ; Admin Chi nhánh xem danh mục.
- Reason: nhóm/dịch vụ là dữ liệu nền cho đặt lịch và quản lý bác sĩ/chi nhánh.
- Backward-compatibility risk: thấp nếu giữ contract hiện có; rủi ro chính là route/UI lệch Figma hoặc mất dữ liệu form khi API lỗi.

## 5. Proposed approach

- Frontend: tạo feature apps/web/src/features/admin/service-catalog với types, service qua shared API client, hooks, page hai tab và dialogs theo Figma. Dùng guard Any; chỉ render form ghi cho Toàn hệ thống. Sau mutation tải lại đúng list; map maLoi và giữ form khi lỗi.
- Backend: không sửa; dùng GET/POST/PATCH/DELETE /admin/service-groups và GET list/detail, POST/PATCH /admin/services; C1 kiểm role/scope.
- Data: không đổi schema/migration/seed. Giữ ID bigint và giá decimal dạng chuỗi.
- Integration/AI: API client cùng origin; không thêm dịch vụ ngoài. Figma chỉ đọc. Chủ repo tự ghi AI usage theo AGENTS; agent không sửa log.
- Security/privacy: không dùng dữ liệu bệnh nhân; không log secret/payload nhạy cảm. UI không thay thế backend authorization; không nhận URL/cấu hình tùy ý.

## 6. Work breakdown

| ID  | Task                                                                           | Output/evidence                                                              | Depends on | Parallel with |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------- | ------------- |
| T1  | Đối chiếu issue, dependencies, Admin plan/tracker, branch và API contracts     | Evidence ở mục 2; branch sạch, API/issue status đã kiểm                      | —          | —             |
| T2  | Người dùng duyệt plan                                                          | Được duyệt để IMPLEMENT ngày 2026-11-02                                      | T1         | —             |
| T3  | Đọc Figma context/screenshot cho frame F3; xác minh route, states và màu token | Frame 548:2, 560:2–565:2, 630:2; route và token ghi ở mục 2                   | T2         | —             |
| T4  | Thêm styling foundation và ADR 0003 theo quyết định đã chốt                    | Vite plugin, global CSS/token, Inter self-host, Lucide và ADR                | T3         | —             |
| T5  | Xây tab Nhóm, form và confirm                                                  | B2 API; tests AF3-01…03 và DV-01…06/DV-17                                    | T4         | —             |
| T6  | Xây tab Dịch vụ, form và xử lý lỗi                                             | B3 API; tests AF3-01/04/05 và DV-07…15/DV-17…19                              | T4         | —             |
| T7  | Nối route/menu, kiểm tra scope và keyboard/accessibility                       | Route F3 hoạt động; Chi nhánh chỉ xem; tests AF3-06/07 và DV-16              | T5, T6     | —             |
| T8  | Cập nhật traceability, kiểm thử/lint/build, rà diff và đối chiếu Figma         | Admin PLAN mục 7 có mã AF3; Admin TRACKING và tracker ghi evidence thật      | T7         | —             |

## 7. Expected file/module impact

- Create:
  - apps/web/src/features/admin/service-catalog/** (page, dialogs/forms, types, API service, hooks, component tests).
  - apps/web/src/index.css hoặc entry global phù hợp sau khi kiểm tra; Tailwind import, font và tokens.
  - docs/adr/0003-frontend-styling-system.md.
- Modify:
  - apps/web/package.json, apps/web/package-lock.json, apps/web/vite.config.ts, apps/web/src/main.tsx.
  - apps/web/src/features/admin/admin-routes.tsx, apps/web/src/features/admin/components/admin-sidebar.tsx.
  - docs/features/admin/PLAN.md (thêm ma trận AF3 mục 7.13) và docs/features/admin/TRACKING.md.
  - working-doc/F3/plan.md, working-doc/F3/tracker.md.
- Do not touch:
  - apps/api/**, docs/database/**, migrations, .env*, auth/RBAC implementation, P7 upload, DB dev/shared data, Figma source, Word 2.4, Git publication.
  - CSS Modules ngoài scope migration đã thống nhất theo giai đoạn.

## 8. Verification

- Unit: component/service tests có mã AF3-_/DV-_; paging/loading/empty/error, validation, form giữ dữ liệu, nhóm còn dịch vụ, duplicate name, duration blocker, read-only scope.
- Integration: không cần MySQL/API integration mới nếu không sửa backend; dùng API mocks. Không dùng DB dev/chia sẻ.
- E2E: chỉ chạy nếu runner/script tồn tại và đã kiểm chứng; không tự bịa command.
- Lint/typecheck/build: trong apps/web chạy scripts test, lint, build từ package.json; build gồm tsc -b.
- Manual: xem route ở hai scope nếu runtime/fixture có; so với Figma; kiểm keyboard/focus/responsive. Nếu browser không khả dụng, ghi giới hạn.

## 9. Completion criteria

- [x] Plan được người dùng duyệt trước khi code.
- [x] Figma frames, route và token colors đã xác minh; không còn UNKNOWN ảnh hưởng hành vi.
- [x] Acceptance criteria và mã AF3/DV được cập nhật vào Admin PLAN.
- [ ] Tests liên quan, lint và build pass hoặc blocker được ghi rõ.
- [x] Security/privacy/data risk và diff được rà; không có thay đổi API/schema ngoài scope.
- [x] Admin TRACKING và tracker F3 có evidence; owner đã ghi AI usage theo repo rules.
- [x] Review trực quan hoàn tất hoặc giới hạn môi trường được ghi: chưa có browser runtime/auth fixture để so ảnh.
