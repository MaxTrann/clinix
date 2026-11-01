# B7 — Tracker

Overall: in_progress  
Updated: 2026-11-01

## Status rules

- `pending`: chưa bắt đầu.
- `in_progress`: đang thực hiện; chỉ một task chính ở trạng thái này.
- `waiting_for_user`: cần câu trả lời hoặc quyết định.
- `blocked`: blocker kỹ thuật đã xác minh.
- `done`: hoàn tất và có evidence.
- `skipped`: không cần thực hiện; có lý do.

## Tasks

| ID | Task | Depends on | Status | Evidence/result | Updated |
|---|---|---|---|---|---|
| T1 | Khảo sát issue #59, dependency, Admin plan/tracker, source/schema | — | done | Issue #59 OPEN; #45/#50/#52 CLOSED; commit P1 `9464aee`, P6 `1b4fd52`, C1 `6916371` là ancestor của main; source hiện hữu | 2026-11-01 |
| T2 | Lập plan B7 và đề xuất API contract | T1 | done | `working-doc/B7/plan.md`; contract được trình bày rõ để duyệt | 2026-11-01 |
| T3 | Người dùng duyệt plan/chốt API contract và uniqueness | T2 | done | Người dùng duyệt toàn bộ đề xuất trong mục 3 ngày 2026-11-01 | 2026-11-01 |
| T4 | Validator, endpoint GET/POST và test specs | T3 | done | `BranchModule`, GET list/detail, POST atomic; unit/MySQL/HTTP specs đã viết; contract và test mapping được cập nhật trong Admin PLAN | 2026-11-01 |
| T5 | Verification scoped, docs/tracker và D1 handoff | T4 | in_progress | Unit 26/26, lint/typecheck/build/Prettier pass; Admin PLAN/TRACKING cập nhật; `TRUNG_AI_USAGE_LOG.md` mục #32 và AI-BUG-029. MySQL/HTTP chưa chạy vì không có Docker daemon/MySQL test service; D1 Word chưa có source trong checkout | 2026-11-01 |

## Open questions and blockers

| ID | Question/blocker | Owner | Needed for | Status |
|---|---|---|---|---|
| Q1 | Duyệt/chỉnh query, response/request shape, kiểu ID/toạ độ/thời gian và mã lỗi trong plan mục 3 | Người dùng | T4 | resolved — duyệt đề xuất 2026-11-01 |
| Q2 | Tên chi nhánh có bắt buộc duy nhất không? | Người dùng | T4 | resolved — cho phép trùng, không thêm uniqueness check/migration 2026-11-01 |
| ENV-01 | MySQL test service chưa khả dụng để chạy integration/HTTP | Hạ tầng local | T5 | blocked — Docker daemon không phản hồi; không có MySQL service hoặc listener ở các port kiểm tra; không dùng DB dev/chia sẻ |
| D1 | Đồng bộ use case Word theo issue #59 | Thành viên | Đóng issue | pending — file nguồn ở repo khác, chưa được cung cấp trong checkout này |

## Verification log

| Command/check | Result | Date |
|---|---|---|
| `git -C clinix status --short --branch` | `feat/admin-b7`, sạch trước khi tạo task artifacts | 2026-11-01 |
| Issue #59 và dependency #45/#50/#52 | #59 OPEN; ba dependency CLOSED theo GitHub REST | 2026-11-01 |
| Dependency commit ancestry | P1 `9464aee`, P6 `1b4fd52`, C1 `6916371`: ancestor của `main` | 2026-11-01 |
| Source/schema | Entity chi nhánh/lịch/dịch vụ, P6 PageQueryDto, C1 BranchAccessPolicy và generated `dang_mo_chi_nhanh` có trong checkout | 2026-11-01 |
| User approval | Người dùng duyệt plan và API contract; cho phép tên trùng | 2026-11-01 |
| `npm.cmd test -- src/admin/branches` | PASS — 3 files, 26/26 tests | 2026-11-01 |
| `npm.cmd exec -- tsc --noEmit` | PASS | 2026-11-01 |
| `npm.cmd run lint` | PASS, không còn warning B7 | 2026-11-01 |
| `npm.cmd run build` | PASS | 2026-11-01 |
| `npm.cmd exec -- prettier --check src/admin/branches src/app.module.ts test/admin-branches.e2e-spec.ts` | PASS | 2026-11-01 |
| Docker/MySQL availability | `docker ps -a` không kết nối được Docker API; không thấy service/listener ở 3306, 33313–33316; integration/e2e chưa chạy, không kết nối DB | 2026-11-01 |
| Diff/source review | PASS — `git diff --check` sạch; `git status` chỉ có module B7, test B7, Admin PLAN/TRACKING và working-doc/B7; source được rà lại theo issue/schema, không thấy sửa schema/dependency/AI log | 2026-11-01 |
