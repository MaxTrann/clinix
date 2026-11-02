# F3 — Tracker

Overall: in_progress
Updated: 2026-11-02

## Status rules

- pending: chưa bắt đầu.
- in_progress: đang thực hiện; chỉ một task chính ở trạng thái này.
- waiting_for_user: cần câu trả lời hoặc duyệt plan.
- blocked: không thể tiếp tục do blocker kỹ thuật đã xác minh.
- done: hoàn tất và có evidence.
- skipped: không cần thực hiện; phải ghi lý do.

## Tasks

| ID  | Task                                                                       | Depends on | Status      | Evidence/result                                                                                                                             | Updated    |
| --- | -------------------------------------------------------------------------- | ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| T1  | Đối chiếu issue, dependencies, Admin plan/tracker, branch và API contracts | —          | done        | #62 open; #56/#57/#60 closed. feat/admin-f3 tại 7e4b9a7, sạch; B2/B3 controllers và contracts đã kiểm.                                      | 2026-11-02 |
| T2  | Người dùng review/duyệt plan F3 trước triển khai                           | T1         | done        | Người dùng yêu cầu tiếp tục triển khai F3; duyệt giữ API contract B2/B3, bỏ Cọc/Trạng thái/nút Tắt/trường đặt cọc trong mockup.             | 2026-11-02 |
| T3  | Xem Figma frame states, xác minh route và trích xuất token colors          | T2         | done        | Đã xem 548:2, 560:2–565:2, 630:2; route `/admin/dich-vu-kham`; màu từ design context. Code Connect bị Figma chặn do seat, không có mapping. | 2026-11-02 |
| T4  | Thêm Tailwind foundation và ADR 0003 theo quyết định đã chốt               | T3         | done        | Pin Tailwind/Vite plugin 4.3.3, Lucide 1.59.0, Inter Variable 5.3.0; token từ Figma; bỏ preflight để không reset F1/F2. ADR 0003 thêm.      | 2026-11-02 |
| T5  | Làm tab Nhóm, CRUD nhóm và xác nhận xóa                                    | T4         | done        | Dùng B2; form thêm/sửa, thứ tự, confirm xóa, map lỗi và giữ form. Số dịch vụ là `—` vì API chưa trả aggregate.                              | 2026-11-02 |
| T6  | Làm tab Dịch vụ, tạo/sửa và xử lý lỗi                                      | T4         | done        | Dùng B3; form nhóm/tên/thời lượng/giá chuỗi; bỏ Cọc/Trạng thái/Tắt/DELETE; lọc nhóm tạm trên trang đang tải.                               | 2026-11-02 |
| T7  | Nối route/menu, kiểm tra scope và accessibility                            | T5, T6     | done        | Route/menu `/admin/dich-vu-kham`; Chi nhánh chỉ xem; nhãn, trạng thái, retry và dialog focus dùng shared UI. Chưa kiểm scope runtime thủ công. | 2026-11-02 |
| T8  | Cập nhật traceability, lint/build, rà diff và Figma                        | T7         | in_progress | Admin PLAN/ADR/tracker cập nhật; lint/build pass; chưa thêm/chạy UI tests hoặc so ảnh trên browser runtime.                                  | 2026-11-02 |

## Open questions and blockers

| ID  | Question/blocker                                                                  | Owner            | Needed for       | Status                                                                                                                    |
| --- | --------------------------------------------------------------------------------- | ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Duyệt plan trước khi chuyển IMPLEMENT?                                            | Người dùng       | T3–T8            | done: người dùng yêu cầu triển khai F3                                                                                    |
| U1  | Xác minh trạng thái/chi tiết Figma và màu token thực tế                           | Người triển khai | Trước T4         | done; Code Connect không khả dụng do quyền Figma seat                                                                     |
| U2  | Route dự kiến /admin/dich-vu-kham có khớp router/Figma không?                     | Người triển khai | T3               | done; route thêm vào Admin route tree dưới `/admin`                                                                       |
| U3  | Figma có lọc nhóm và số lượng dịch vụ/nhóm, API B2/B3 không cung cấp contract này | Người dùng       | Tab Dịch vụ/nhóm | done: người dùng phát triển API sau; F3 giữ control, lọc client trên dữ liệu đang tải, số lượng là `—` tới khi API hỗ trợ |

## Verification log

| Command/check                             | Result                                                                                                       | Date       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------- |
| git status --short --branch trong clinix  | feat/admin-f3, HEAD 7e4b9a7, sạch trước khi lập plan                                                         | 2026-11-02 |
| GitHub issue status                       | #62 open; dependencies #56, #57, #60 closed                                                                  | 2026-11-02 |
| Admin PLAN/TRACKING và B2/B3 plan/tracker | Scope F3, DV cases, API contracts và trạng thái local đã đối chiếu; ghi discrepancy B2/B3 tracker trong plan | 2026-11-02 |
| API source review                         | B2 controller GET/POST/PATCH/DELETE; B3 controller GET list/detail, POST/PATCH, scope guards hiện hữu        | 2026-11-02 |
| apps/web/package.json                     | Đã pin dependency styling theo quyết định nhóm; package-lock đồng bộ                                          | 2026-11-02 |
| Figma                                     | Đã mở design context/screenshot cho frame F3; trích màu và trạng thái; Code Connect trả lỗi seat Dev/Full    | 2026-11-02 |
| User decision                             | Giữ B2/B3 contract; bỏ trường/cột/nút cọc và trạng thái/tắt từ mockup                                        | 2026-11-02 |
| `npm run lint` trong `apps/web`            | Pass                                                                                                         | 2026-11-02 |
| `npm run build` trong `apps/web`           | Pass; `tsc -b` + Vite production build; Inter được self-host trong `dist/assets`                             | 2026-11-02 |
| `git diff --check`                         | Pass; không có whitespace errors                                                                             | 2026-11-02 |
| UI tests / browser visual compare         | Chưa chạy UI tests hoặc kiểm tra runtime bằng browser                                                        | 2026-11-02 |
| TRUNG_AI_USAGE_LOG.md                     | Thêm mục 35 và AI-BUG-032 theo yêu cầu người dùng                                                           | 2026-11-02 |
