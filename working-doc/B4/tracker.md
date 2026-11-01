# B4 — Tracker

Overall: in_progress  
Updated: 2026-11-01

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
| T1 | Khảo sát issue #58, B3 handoff, Admin plan/tracker, source/schema và dependency | — | done | #58 + PK-01…09/Q33; entity/table singleton; P3 `682c289` và C1 `6916371` đã vào main; branch B4 hiện cùng commit B3 | 2026-11-01 |
| T2 | Chốt GET khi chưa có row, email whitespace, response shape | T1 | done | Người dùng chốt GET object bốn field null, auth S5 cho email, response không có id | 2026-11-01 |
| T3 | DTO/repository/service/controller/module và unit tests | T2 | done | DTO, repository, service, controller/module, unit tests đã viết; unit 7/7, lint, typecheck, build, Prettier pass | 2026-11-01 |
| T4 | MySQL integration và HTTP authorization tests | T3 | done | MySQL integration 2/2; HTTP 3/3 pass trên MySQL 8.4 riêng cổng 33315; container test đã dừng/xóa | 2026-11-01 |
| T5 | Review diff, checks, đồng bộ Admin docs/tracker | T4 | done | Diff reviewed; docs Admin + tracker cập nhật; lint/build/typecheck/Prettier/diff check pass; D5 Word vẫn pending ngoài checkout | 2026-11-01 |

## Open questions and blockers

| ID | Question/blocker | Owner | Needed for | Status |
|---|---|---|---|---|
| D5 | Đồng bộ use case 2.4 ở repo Word nguồn | Thành viên | Đóng issue #58 | pending — nguồn không có trong checkout |

## Verification log

| Command/check | Result | Date |
|---|---|---|
| `git -C clinix status --short --branch` | `feat/admin-b4`, clean | 2026-11-01 |
| Dependency ancestry/source check | P3 `682c289` và C1 `6916371` là ancestor của `main`; B4 độc lập B3 | 2026-11-01 |
| Issue #58 | Open; phụ thuộc P3/C1; yêu cầu PK-01…09 và D5 | 2026-11-01 |
| `npm.cmd test -- src/admin/clinic-info/test/clinic-info.dto.spec.ts src/admin/clinic-info/test/clinic-info.service.spec.ts` | 2 files, 7/7 pass | 2026-11-01 |
| `npm.cmd run lint` | Pass, 0 diagnostic sau khi sửa warning | 2026-11-01 |
| `npm.cmd exec -- tsc --noEmit` | Pass | 2026-11-01 |
| `npm.cmd run build` | Pass | 2026-11-01 |
| `npm.cmd exec -- prettier --check src/admin/clinic-info src/app.module.ts test/admin-clinic-info.e2e-spec.ts` | Pass | 2026-11-01 |
| `npm.cmd run test:int -- src/admin/clinic-info/test/clinic-info.int-spec.ts` | 1 file, 2/2 pass trên MySQL 8.4 riêng, DB `clinix_b4_test`, port 33315 | 2026-11-01 |
| `npm.cmd run test:e2e -- test/admin-clinic-info.e2e-spec.ts` | 1 file, 3/3 pass trên AppModule/auth/C1/MySQL thật | 2026-11-01 |
| Test DB cleanup | Container `clinix-b4-tests-20261101` đã dừng/xóa; `clinix-db-1` vẫn stopped | 2026-11-01 |
| `git -C clinix diff --check` | Pass | 2026-11-01 |

