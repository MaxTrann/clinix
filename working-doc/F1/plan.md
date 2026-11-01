# F1 — Khung Admin frontend (issue #60)

Status: In Progress  
Mode: IMPLEMENT  
Owner: junUTE (assignee theo issue #60)  
Updated: 2026-11-01
Approval: Người dùng yêu cầu triển khai F1 theo Figma ngày 01/11/2026.

## 1. Goal and scope

- Goal: hoàn thiện shell Admin cho Quản trị viên Toàn hệ thống và Quản trị viên Chi nhánh; dùng thông tin phạm vi từ GET /admin/me, bảo vệ route theo vai trò/phạm vi ở mức UX, thay placeholder Admin của auth F1, và cung cấp các control dùng chung cho F2–F9.
- In scope:
  - Layout Admin, thanh điều hướng theo phạm vi, thông tin chi nhánh khi scope là ChiNhanh.
  - Guard bọc trong route đã được auth F1 bảo vệ; guard scope dựa trên AdminMe và policy của route.
  - Trang không đủ quyền cho route chỉ dành cho Toàn hệ thống khi Admin Chi nhánh truy cập trực tiếp.
  - Component thuần dùng chung: bảng phân trang, ô tìm kiếm, hộp xác nhận, panel chi tiết, hiển thị lỗi theo cơ chế hiện có.
  - Kiểm thử component, route, trạng thái tải/lỗi và hai scope Admin.
- Out of scope:
  - Auth store, đăng nhập, refresh token, Web Locks, đăng xuất và thay đổi AccessGate thuộc auth F1.
  - API/RBAC, endpoint GET /admin/me, schema/migration, seed và cấu hình.
  - Màn nghiệp vụ F2–F10; chỉ cung cấp shell và component nền.
  - Đổi framework, router, state-management hoặc thêm dependency trong issue này khi chưa có quyết định.
- Acceptance criteria đề xuất:
  - F1-01: chỉ route Admin đã qua auth gate mới khởi tạo nội dung Admin; người dùng chưa đăng nhập và vai trò khác được xử lý bởi auth F1 theo contract đã chốt.
  - F1-02: khi auth đã sẵn sàng, frontend đọc GET /admin/me qua API client dùng chung; trạng thái loading và lỗi không làm lộ menu hoặc nội dung sai scope.
  - F1-03: scope ToanHeThong và ChiNhanh hiển thị layout/nhãn phạm vi đúng contract AdminMe; tên chi nhánh chỉ lấy từ response, không suy ra từ URL hay client input.
  - F1-04: route gắn policy ToanHeThong bị chặn ở frontend với trang không đủ quyền khi scope là ChiNhanh; API tiếp tục là nơi authorize có thẩm quyền.
  - F1-05: menu, nhóm mục và nhãn khớp Figma frame 522:2/625:2; các mục F2–F9 vẫn hiển thị nhưng vô hiệu hóa cho tới khi có route; không dựng badge/số liệu giả.
  - F1-06: component dùng chung có API thuần, có trạng thái rỗng/lỗi/tải phù hợp, thao tác bàn phím và test; không tự gọi HTTP hoặc mang business rule của từng page.
  - F1-07: Admin placeholder được thay bằng shell; placeholder và route của các vai trò khác vẫn hoạt động.
  - F1-08: test case F1 mới được ghi vào docs/features/admin/PLAN.md trước hoặc cùng PR triển khai; kết quả được ghi vào docs/features/admin/TRACKING.md.

## 2. Evidence and context

- Task input: issue [#60](https://github.com/MaxTrann/clinix/issues/60), yêu cầu layout theo GET /admin/me, route guard vai trò/phạm vi, thay placeholder, component dùng chung và trang không đủ quyền.
- Source and docs inspected:
  - docs/features/admin/PLAN.md mục 4.4, 5.2, 5.6, 6.1, 6.5, 7.9–7.10.
  - docs/features/admin/TRACKING.md, gồm trạng thái P6, C1 và các task Admin hiện có.
  - docs/features/auth/TRACKING.md mục 5; auth PLAN và issue #35.
  - apps/web/src/router/routes.tsx, access-gate.tsx, shared/api/auth-hooks.ts, shared/ui/.
  - apps/api/src/rbac/admin-me.controller.ts, admin-scope.ts, admin-scope.service.ts; apps/api/src/common/paging/.
- VERIFIED:
  - Checkout Clinix đang ở `feat/admin-f1`, HEAD `0556d23` (merge auth F1 #120); `working-doc/F1/` chưa được theo dõi. Không chạy lệnh làm thay đổi Git.
  - Issue #60 đang mở, giao junUTE; issue hiện ghi rõ điểm cắm vào `ROLE_ROUTES`.
  - Phụ thuộc #35, #18, #52 và #50 đều đã đóng trên GitHub; #121/ADR Clinix 0002 đã merge.
  - Admin tracker ghi C1 đã kiểm chứng local và P6 mới hoàn tất một phần; endpoint adoption/search còn riêng.
  - API GET /admin/me và contract scope đã có trong source: AdminMe là ToanHeThong hoặc ChiNhanh kèm id/tên chi nhánh.
  - Web hiện có route registry tại apps/web/src/router/routes.tsx, AccessGate thuần và API auth hook point. Shared UI hiện có LoadingState, ErrorState, EmptyState và OfflineBanner; chưa thấy table/search/confirm/detail panel.
  - Clinix dùng React Router 8.4.0 Data Mode theo ADR 0002 đã merge; workspace ADR-001 là mặc định Framework Mode, Clinix là ngoại lệ. Không đổi router/kiến trúc trong #60.
  - Figma file key `1OsOfwD5myNNRv7FPCD9YC` đã đọc được. Đã lấy design context và screenshot của frame 522:2 (Admin toàn hệ thống) và 625:2 (Admin chi nhánh); đã liệt kê frame và tìm thấy trang Tổng quan 507:2/587:2. Chỉ đọc, không chỉnh sửa nội dung Figma.
- UNKNOWN:
  - P6 #50 đã đóng; tracker ghi adoption contract tìm kiếm/phân trang ở các endpoint nghiệp vụ còn theo từng consumer. F1 controls không gọi API.
  - Chưa chụp màn hình chạy trình duyệt ở desktop/mobile để so pixel trực tiếp với Figma; thông số layout, màu và SVG được lấy từ frame đã đọc.

## 3. Questions, assumptions and decisions

### Questions requiring an answer

- Không còn câu hỏi chặn F1 shell. API adoption của P6 là việc từng màn nghiệp vụ; shell chỉ dựng control thuần theo contract đã có.

### Assumptions

- F1 chỉ hiển thị phạm vi và điều hướng; ẩn route hoặc trang 403 không phải security boundary.
- Menu F2–F9 hiển thị theo Figma nhưng không bấm được cho tới khi có route; không tạo số badge giả.
- Không thêm debounce/search request behavior vào shared input. Feature hook của các task F2–F9 quyết định thời điểm gửi query theo contract API đã chốt.
- Không sửa API, database, env hoặc dependency để hoàn tất shell nếu chưa phát sinh quyết định/scope riêng.

### Decisions

- Clinix dùng React Router 8.4 Data Mode, SPA theo ADR 0002 đã Accepted; giữ nguyên kiến trúc hiện có, không migrate router trong #60.
- Contract GET /admin/me và scope guard C1 được xem là nền đã có trong source.
- Đã đọc frame Admin 522:2 và Admin chi nhánh 625:2; xác nhận menu F2–F9 hiện disabled, không route/badge giả.
- Theo xác nhận người dùng ngày 01/11/2026, dashboard KPI/biểu đồ 507:2/587:2 không thuộc F1; không dựng dữ liệu tĩnh. Route `/admin` chỉ cung cấp shell và outlet cho page về sau.

## 4. Core-feature impact

- Does this change core behavior? Yes — thay đổi trải nghiệm điều hướng và chặn truy cập UI theo vai trò/phạm vi.
- Affected actors/flows: Quản trị viên Toàn hệ thống, Quản trị viên Chi nhánh; các actor khác đi qua auth gate hiện có.
- Reason: Admin là portal có nội dung và menu khác nhau theo quyền; truy cập trực tiếp URL phải có cùng kết quả với điều hướng trong menu.
- Backward-compatibility risk: thấp; chỉ thay route Admin, giữ route/placeholder các vai trò khác và dùng React Router 8.4 Data Mode đã chốt cho Clinix.

## 5. Proposed approach

- Frontend:
  - Sau khi Q1 được giải quyết và auth F1 đã merge, lồng AdminLayout và AdminScopeGuard vào protected route theo handoff auth F1; không thay AccessGate hoặc viết lại auth.
  - Lấy AdminMe từ GET /admin/me qua shared API client. Dùng response để dựng shell và nhãn phạm vi; không lấy scope từ path, query, local storage hay token.
  - Tách cấu hình menu khỏi component layout; menu theo ma trận được duyệt và frame Figma. Route policy hỗ trợ ít nhất Any và ToanHeThong; module page cung cấp policy của route khi được thêm.
  - Tạo các control trình bày thuần trong shared UI hoặc feature public API phù hợp với kiến trúc được chọn. Bảng nhận dữ liệu phân trang theo contract P6; control không tự gọi API.
  - Dùng ErrorState/error-message hiện có cho lỗi đọc; chỉ thêm notification UI nếu code hiện hữu hoặc Figma xác nhận yêu cầu đó.
- Backend: không đổi. GET /admin/me, auth guard và AdminScopeGuard backend đã có trong source; backend tiếp tục kiểm tra mọi API.
- Data: không đổi schema, migration hoặc dữ liệu.
- Integration/AI: không thêm integration. Cập nhật Admin tracker khi triển khai; AI_USAGE_LOG do thành viên thực hiện theo AGENTS.md hiện hành.
- Security/privacy:
  - Chỉ dùng AdminMe tối thiểu để render menu/phạm vi; không đưa access/refresh token vào component hoặc storage bền vững.
  - Mọi yêu cầu vẫn phải chịu auth/RBAC backend; route UI không cấp quyền.
  - Trạng thái 401 thuộc auth F1; 403 scope hiển thị trang không đủ quyền; lỗi mạng/timeout dùng thông báo an toàn, không hiển thị response tùy ý.

## 6. Work breakdown

| ID | Task | Output/evidence | Depends on | Parallel with |
|---|---|---|---|---|
| T1 | Chốt Q1–Q2, frame, nav contract và test IDs | Quyết định ghi trong plan; AF1-01…10 được rà soát | Người dùng | — |
| T2 | Kiểm tra điều kiện bắt đầu | #35/#18/#50/#52 đã đóng; ADR Clinix 0002 đã merge | T1, upstream PRs | — |
| T3 | Ghép AdminMe và shell vào protected route | Layout theo scope, loading/error, profile scope type | T2, auth F1 | — |
| T4 | Route guard phạm vi và trang không đủ quyền | Direct URL và navigation có cùng access outcome; API guard không đổi | T3, C1 | — |
| T5 | Component dùng chung | Table pagination, search input, confirmation dialog, detail panel, error UI | T1, T3, P6 contract | — |
| T6 | Test, feature-plan traceability và review diff | Test IDs được thêm vào admin PLAN; tracking ghi evidence; web lint/build/test có kết quả thật | T3–T5 | — |

## 7. Expected file/module impact

- Create:
  - apps/web/src/features/admin/ (`components/`, `hooks/`, route/layout/guard và component tests).
  - Trang không đủ quyền, nếu không có component dùng chung phù hợp trong source.
- Modify:
  - `apps/web/src/router/role-routes.tsx` và auth route test để thay kỳ vọng placeholder Admin; các vai trò còn lại giữ nguyên.
  - `docs/features/admin/PLAN.md` để ghi test case F1 và `docs/features/admin/TRACKING.md` để ghi kết quả triển khai.
- Do not touch:
  - apps/api, schema/migrations, .env, dependencies/lockfiles, auth F1 implementation.
  - AI_USAGE_LOG.md nếu chưa được thành viên cho phép; không commit/push/PR/merge trong bước plan.

## 8. Verification

- Unit: menu mapping theo AdminMe; scope policy; từng component qua dữ liệu rỗng, lỗi và biên page/pageSize; confirmation/dialog keyboard behavior.
- Integration: route test với scope ToanHeThong, ChiNhanh, lỗi 403 và lỗi API; kiểm tra loading/error của GET /admin/me.
- E2E: nếu hạ tầng/fixtures hiện có hỗ trợ, kiểm direct URL và navigation cho Admin Toàn hệ thống, Admin Chi nhánh và vai trò không phải Admin; không dùng dữ liệu bệnh nhân thật.
- Lint/typecheck/build: chỉ chạy script tìm thấy trong apps/web/package.json sau khi triển khai.
- Manual check: so shell/menu với Figma được cấp quyền ở desktop/mobile; kiểm tra keyboard/focus và placeholder của portal khác. Pixel-level browser compare chưa chạy trong phiên này.

## 9. Completion criteria

- [x] Q1–Q2 về router, Figma, menu và dashboard được giải quyết; người dùng yêu cầu triển khai.
- [x] Dependencies #35/#18/#52/#50 đã đóng; auth F1 và AdminMe contract có trong checkout.
- [x] Acceptance criteria, scope dashboard và test IDs `AF1-01…AF1-10` được chốt; shell/menu triển khai theo frame Figma.
- [x] Web lint, build và test pass.
- [x] Admin PLAN/TRACKING được cập nhật.
- [ ] Pixel-level browser compare còn pending; dòng AI_USAGE_LOG đã được Trung thêm theo AGENTS.md.
