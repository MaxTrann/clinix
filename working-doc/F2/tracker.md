# F2 — Tracker

Overall: done  
Updated: 2026-11-02

## Status rules

- `pending`: chưa bắt đầu.
- `in_progress`: đang thực hiện; chỉ một task chính ở trạng thái này.
- `waiting_for_user`: cần câu trả lời hoặc quyết định.
- `blocked`: không thể tiếp tục do blocker kỹ thuật đã xác minh.
- `done`: hoàn tất và có evidence.
- `skipped`: không cần thực hiện; phải ghi lý do.

## Tasks

| ID | Task | Depends on | Status | Evidence/result | Updated |
|---|---|---|---|---|---|
| T1 | Đối chiếu issue #61, dependency, Figma, API và checkout | — | done | #60/#55 closed; #61 open. Nhánh `feat/admin-f2`, HEAD `eb0dba7`, sạch. Đọc frame 538:2/539:2/540:2/628:2; source B1/P7 đã kiểm. | 2026-11-02 |
| T2 | Chốt trạng thái chuyên khoa khi tạo mới | T1 | done | Người dùng chọn giữ contract B1; checkbox tạo mới disabled và checked, API không đổi. | 2026-11-02 |
| T3 | Tạo feature service/hook, route/menu và danh sách | T2 | done | API B1/P6; loading/error/empty, tìm kiếm/lọc/phân trang; route/menu `/admin/chuyen-khoa`; Chi nhánh chỉ xem. | 2026-11-02 |
| T4 | Tạo/sửa, ảnh P7, đổi trạng thái, xử lý lỗi trùng | T2, T3 | done | Create/edit, checkbox tạo mới khóa hoạt động, upload/preview/gỡ ảnh theo P7, PATCH status riêng; CK-15 giữ dữ liệu form. | 2026-11-02 |
| T5 | Tests, docs/tracker và review diff | T3, T4 | done | 188/188 tests; lint/build pass; docs Admin và tracker cập nhật; diff được rà soát, không đổi API/schema/dependency. | 2026-11-02 |
| T6 | Browser/Figma visual comparison | T3, T4 | skipped | Không có browser/Playwright runtime khả dụng trong môi trường; không xác nhận pixel-level visual match. | 2026-11-02 |

## Open questions and blockers

| ID | Question/blocker | Owner | Needed for | Status |
|---|---|---|---|---|
| Q1 | Có cho phép tạo chuyên khoa `NgungHoatDong` không? | Người dùng | T2–T4 | resolved: giữ contract B1; tạo mới luôn hoạt động, checkbox khóa |

## Verification log

| Command/check | Result | Date |
|---|---|---|
| `git status --porcelain=v1 --branch` trong `clinix` | `feat/admin-f2`, sạch trước task | 2026-11-02 |
| GitHub issue #61/#55/#60 | #61 open; #55 B1 và #60 F1 closed | 2026-11-02 |
| Figma design context | Đọc list/create/edit/branch frames 538:2/539:2/540:2/628:2; screenshot trả về | 2026-11-02 |
| API source B1/P7 | POST default active; PATCH status; upload POST multipart `file`; response/field contract đã đối chiếu | 2026-11-02 |
| Figma assets | SVG add/search/doctors/edit/toggle-status và upload icon từ node 539:625 được tải về `apps/web/public/assets/admin/specialties/`; không dùng URL tạm lúc chạy | 2026-11-02 |
| `npm test` (`apps/web`) | Pass: 9 files, 188/188 tests | 2026-11-02 |
| `npm run lint` (`apps/web`) | Pass | 2026-11-02 |
| `npm run build` (`apps/web`) | Pass: `tsc -b` và Vite production build | 2026-11-02 |
| Browser visual comparison | Không thực hiện: không có browser executable hoặc Playwright/Puppeteer runtime khả dụng | 2026-11-02 |
| AI usage log | `TRUNG_AI_USAGE_LOG.md` đã thêm mục 34 và ghi lỗi kiểm tra ban đầu AI-BUG-031 theo yêu cầu người dùng | 2026-11-02 |
