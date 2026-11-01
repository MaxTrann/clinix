# B3 — Tracker

Overall: in_progress — backend B3 hoàn tất và kiểm tra local pass; D2 Word sync còn pending  
Updated: 2026-11-01

## Status rules

- pending: chưa bắt đầu; in_progress: đang làm; waiting_for_user: chờ quyết định; done: có evidence; blocked: blocker kỹ thuật đã xác minh; skipped: không cần và có lý do.

## Tasks

| ID | Task | Depends on | Status | Evidence/result | Updated |
|---|---|---|---|---|---|
| T1 | Khảo sát issue/plan/schema/source/dependencies và lập plan B3 | — | done | Issue #57, Admin PLAN 5.3/6.4/7.2, Q11/Q16, auth TRACKING mục 5, P1/P2 entities, B1/B2 patterns đã đối chiếu; branch `feat/admin-b3` sạch khi bắt đầu | 2026-11-01 |
| T2 | Chốt list/request/response contract | T1 | done | Người dùng xác nhận contract đề xuất trong `plan.md` mục 3 ngày 2026-11-01 | 2026-11-01 |
| T3 | DTO/repository/service/controller/module + unit tests | T2 | done | Unit 27/27; API lint/build/typecheck; Prettier B3 scope pass | 2026-11-01 |
| T4 | MySQL integration và HTTP authorization/regression | T3 | done | MySQL integration 9/9 và HTTP 6/6 pass trên MySQL 8.4.13 riêng tại `127.0.0.1:33314`; C1 scope/read-write, validation, route không hỗ trợ DELETE và các DV regression đã kiểm | 2026-11-01 |
| T5 | Review, verification và đồng bộ local docs | T4 | done | Đã rà diff, đồng bộ Admin PLAN/TRACKING cùng plan/tracker B3; lint/build/typecheck/format pass. D2 Word gốc ở repo khác chưa có nội dung để cập nhật; AI_USAGE_LOG do thành viên ghi | 2026-11-01 |

## Open questions and blockers

| ID | Question/blocker | Owner | Needed for | Status |
|---|---|---|---|---|
| Q1 | Chốt contract đề xuất tại `plan.md` mục 3 hay muốn chỉnh? | Trung | T3 | resolved — người dùng xác nhận 2026-11-01 |
| ENV1 | Dùng container MySQL B3 riêng ở 33314 hay dừng `clinix-db-1` đang giữ 3306? | Trung | T4 | resolved — người dùng chọn dừng `clinix-db-1`, dùng container test riêng 2026-11-01 |
| D2 | Đồng bộ use case Word: chặn sửa thời lượng khi có lịch/khung giờ phụ thuộc; tên dịch vụ duy nhất trong nhóm | Thành viên | Đóng issue #57 | pending — tài liệu gốc không có trong checkout này |

## Verification log

| Command/check | Result | Date |
|---|---|---|
| `git status --short --branch` | `feat/admin-b3`, working tree sạch khi bắt đầu | 2026-11-01 |
| Git history/dependency source review | B2 merge `d7c27aa`, P2 migration/entity `5ffbd24`, P1 catalog `9464aee` có trong branch | 2026-11-01 |
| Issue #57 | OPEN; dependency #56/#46; acceptance/D2 đọc trực tiếp từ issue | 2026-11-01 |
| API contract | Người dùng chốt đề xuất tại `plan.md` mục 3 | 2026-11-01 |
| Schema/source review | UNIQUE `(nhom_dich_vu_id, ten)` có sẵn; không cần migration cho B3; entity lịch/khung giờ P2 có sẵn | 2026-11-01 |
| `npm.cmd test -- src/admin/services` | Unit: 2 file, 27/27 pass | 2026-11-01 |
| `npm.cmd run lint` | Pass; lần đầu có một cảnh báo sort comparator, đã sửa và chạy lại sạch | 2026-11-01 |
| `npm.cmd exec -- tsc --noEmit` | Pass sau khi sửa validator metadata/test response type | 2026-11-01 |
| `npm.cmd exec -- prettier --check src/admin/services src/app.module.ts test/admin-services.e2e-spec.ts` | Pass | 2026-11-01 |
| `npm.cmd run build` | Pass | 2026-11-01 |
| MySQL/HTTP test harness | Docker daemon ban đầu dừng; Docker Desktop tự bật `clinix-db-1` ở cổng 3306. Người dùng yêu cầu dừng container này; không kết nối hoặc reset DB đó | 2026-11-01 |
| Isolated test MySQL | MySQL 8.4.13 `clinix-b3-tests-20261101`, bind `127.0.0.1:33314`, DB `clinix_b3_test`; `clinix-db-1` stopped per user | 2026-11-01 |
| `npm.cmd run test:int -- src/admin/services/test/service.int-spec.ts` | 1 file, 9/9 pass | 2026-11-01 |
| `npm.cmd run test:e2e -- test/admin-services.e2e-spec.ts` — lần đầu | 5/6; test kỳ vọng nhóm không tồn tại là lỗi DTO chung, trong khi service trả mã nghiệp vụ `NHOM_DICH_VU_KHONG_TON_TAI` | 2026-11-01 |
| HTTP rerun | 5/6; assertion PATCH nhomDichVuId `1` là hợp lệ theo contract cho phép đổi nhóm; sửa ca dữ liệu sai sang `null` và bổ sung kiểm tra không có route DELETE | 2026-11-01 |
| `npm.cmd run test:e2e -- test/admin-services.e2e-spec.ts` — final | 1 file, 6/6 pass; bao gồm auth/scope, validation, CRUD contract, race/error mapping và DV-19 không có DELETE | 2026-11-01 |
| Final quality checks | Lint, typecheck, build, Prettier và `git diff --check` đều pass sau thay đổi e2e cuối | 2026-11-01 |
| Test container cleanup | `clinix-b3-tests-20261101` stopped sau kiểm tra; xác nhận `clinix-db-1` vẫn stopped | 2026-11-01 |

## Handoff

- Backend source B3, unit 27/27, MySQL integration 9/9, HTTP 6/6 và local quality checks đã pass. `clinix-db-1` đang stopped theo yêu cầu; container test riêng đã dừng sau kiểm tra.
- D2 Word chưa cập nhật vì bản gốc ở repo khác và chưa có nội dung; AI log do thành viên ghi theo AGENTS. Chưa commit/PR/review/merge hoặc đóng issue.
- Gợi ý tiêu đề PR sau khi hoàn tất: `feat(admin): thêm quản lý dịch vụ khám`; body `Closes #57` chỉ khi D2/review/merge đủ điều kiện.
