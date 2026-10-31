# B2 — Tracker

Overall: done — backend local verified; F3/D2/CI/review/merge riêng
Updated: 2026-10-31

## Status rules

- pending: chưa bắt đầu; in_progress: đang làm; waiting_for_user: chờ quyết định.
- done: có evidence; blocked: blocker kỹ thuật đã xác minh; skipped: không cần và có lý do.

## Tasks

| ID | Task | Depends on | Status | Evidence/result | Updated |
|---|---|---|---|---|---|
| T1 | Khảo sát và lập plan B2 | — | done | Đọc issue #56 qua REST, Admin PLAN/Q11/14/15/42/DV, schema/entity, B1/P6/C1/auth handoff và manifest; checkout feat/admin-b2 sạch ban đầu | 2026-10-31 |
| T2 | Chốt contract API còn thiếu | T1 | done | Người dùng duyệt tiến hành ngày 31/10/2026; giữ contract plan mục 3 | 2026-10-31 |
| T3 | Triển khai source và unit | T2 | done | DTO/repository/service/controller/module và AppModule; B2 unit27/27 | 2026-10-31 |
| T4 | MySQL/HTTP regression | T3 | done | MySQL cuối11/11, HTTP B2+C1 19/19 (8+11), auth thật; UNIQUE/FK/race/rollback/bigint | 2026-10-31 |
| T5 | Verification/docs/review/handoff | T4 | done | Toàn API1544/1544, lint/build/typecheck/format, Linux duplication1,93%, Gitleaks sạch; đồng bộ contract/tracker; D2 Word/F3/CI/merge riêng, log AI cần thành viên ghi | 2026-10-31 |

## Open questions and blockers

| ID | Question/blocker | Owner | Needed for | Status |
|---|---|---|---|---|
| Q1 | Duyệt contract đề xuất plan mục 3? | Trung | T3 | resolved — người dùng yêu cầu tiến hành 31/10/2026 |
| D2 | Đồng bộ Word: Chi nhánh chỉ xem, xóa nhóm rỗng, thứ tự nguyên không âm, không bật/tắt | Thành viên | Issue acceptance | pending |
| R1 | Xác minh MySQL test mới riêng trước global setup reset DB | Agent | T4 | resolved — container mới riêng clinix-b2-tests-20261031/cổng33313; hai DB *_test riêng |

## Verification log

| Command/check | Result | Date |
|---|---|---|
| git status/branch/log (read-only) | feat/admin-b2, sạch trước tạo artifact; B1 #99 và phụ thuộc có trong checkout | 2026-10-31 |
| GitHub REST read-only | #56 OPEN, đã đọc body/dependency/acceptance | 2026-10-31 |
| Schema/source review | Nhóm có UNIQUE tên, int default0 và FK dịch vụ; mẫu B1/P6/C1/auth thật có sẵn; không cần migration | 2026-10-31 |
| npm test -- src/admin/service-groups | 2 file27/27 pass; validation/permission/PATCH rỗng/offset/UNIQUE mapping | 2026-10-31 |
| npm run test:int -- src/admin/service-groups | Lượt đầu10/11, COUNT trả chuỗi nhưng assertion so số; sửa kiểu kết quả và Number assertion, rerun11/11. Kiểm trùng hoa/dấu/space, UNIQUE create/update thật, FK thật khi bỏ precheck, hai thứ tự race insert/delete, rollback sau update/delete, paging/escape/total và bigint9007199254740993 | 2026-10-31 |
| npm run test:e2e -- test/admin-service-groups.e2e-spec.ts test/admin-scope.e2e-spec.ts | 2 file19/19 pass (B2 8+C1 11). ValidationPipe/auth/C1 thật, role/scope/thu hồi phiên, 204/404/409, rollback sau lỗi DELETE và response không lộ lỗi gốc | 2026-10-31 |
| npm test | API89 file1544/1544 pass; không phải full MySQL/HTTP | 2026-10-31 |
| npm run lint; npm run build; npm exec -- tsc --noEmit | Pass; lint đầu cảnh báo spread DTO instance, đã chuyển allowlist hai trường, lint cuối sạch | 2026-10-31 |
| npm exec -- prettier --check src/admin/service-groups src/app.module.ts test/admin-service-groups.e2e-spec.ts | Pass | 2026-10-31 |
| Linux node:22-alpine npx jscpd@4 --config .jscpd.json --output /tmp/b2-jscpd | Read-only mount repo, 255 file/31756 dòng,613 dòng trùng=1,93% <3%; không sửa cấu hình/dependency | 2026-10-31 |
| Gitleaks8.30.1 detect --no-git --redact | Read-only mount riêng thư mục B2 source/test và file HTTP B2; cả hai exit0/no leaks | 2026-10-31 |
| Final review / git diff --check / cleanup | Review source mới và tracked diff đúng scope; diff check sạch, format scope source/test pass; container clinix-b2-tests-20261031 đã dừng sau kiểm thử, giữ lại để xem nếu cần; không dừng/sửa container dev | 2026-10-31 |

## Handoff

- Backend B2 local hoàn tất, issue #56 chưa đóng; checkbox tổng B2 giữ mở vì D2/review/merge riêng. Contract tại Admin PLAN5.3.
- Điểm cần giải thích: service giữ transaction, khóa nhóm trước sửa/xóa; UNIQUE giải quyết race tên sau precheck; FK đảm bảo không có dịch vụ mồ côi. List/total cùng snapshot; bigint dùng CAST CHAR/LAST_INSERT_ID cùng connection.
- D2 Word và F3/UI chưa nghiệm thu; DV-16 mới phủ nhóm, dịch vụ chờ B3. Không full MySQL/full HTTP/CI, không commit/push/PR/merge hoặc đổi issue remote.
- Log AI chưa thêm mục B2 theo AGENTS repo: thành viên cần ghi scope/check thật, không khẳng định tự review mã khi chưa xác nhận. Giữ thay đổi ngoài B2 xuất hiện giữa phiên tại TRUNG_AI_USAGE_LOG.md, working-doc/C2/tracker.md và tham chiếu DEBT46 của C2 trong Admin TRACKING.
- Gợi ý commit/PR do thành viên thực hiện: `feat(admin): thêm quản lý nhóm dịch vụ`; body `Closes #56` khi đủ điều kiện.
