# C3 — Tracker

Overall: done (local implementation + verification); AI log và review/merge do thành viên thực hiện  
Updated: 2026-10-28

## Status rules

- `pending`: chưa bắt đầu; `in_progress`: đang thực hiện; `waiting_for_user`: cần quyết định/duyệt.
- `blocked`: có blocker kỹ thuật đã xác minh; `done`: có evidence; `skipped`: không cần và có lý do.

## Tasks

| ID | Task | Depends on | Status | Evidence/result | Updated |
|---|---|---|---|---|---|
| T1 | Khảo sát và lập plan | — | done | Issue #53 đọc trực tiếp; P3 entity/registry, lỗi chuẩn, AppModule và test config đã khảo sát; nhánh feat/admin-c3 sạch ban đầu; plan.md Draft | 2026-10-28 |
| T2 | Repository, service, module, wiring | Duyệt plan | done | Module chỉ đọc singleton; AppException409; hook bootstrap cảnh báo; AppModule import; không cache/default | 2026-10-28 |
| T3 | Unit và module tests | T2 | done | 7/7 pass; consumer module inject được; app.init chạy hook thật; lỗi DB không bị đổi thành409; CH-10 chỉ phần service | 2026-10-28 |
| T4 | MySQL integration DB mới riêng | T2, T3 | done | 2/2 pass, MySQL8.4 container clinix-c3-mysql-20261028-2228/cổng33308, DB clinix_c3_20261028_2228_test; null/409/warn/JSON/decimal/no-cache, không tự tạo dòng | 2026-10-28 |
| T5 | Verification, review và tài liệu | T3, T4 | done | Full unit993/993; focused7/7; MySQL2/2; lint/typecheck/build/format pass; review scope và Admin tracker cập nhật; AI log chưa sửa | 2026-10-28 |

## Open questions and blockers

| ID | Question/blocker | Owner | Needed for | Status |
|---|---|---|---|---|
| Q1 | Duyệt plan C3 | Trung | Bắt đầu T2 | done — người dùng duyệt trong chat 28/10 |
| Q2 | Cập nhật AI_USAGE_LOG.md | Trung | Ghi log tác động repo; có thể tự ghi hoặc cho phép sửa lúc bàn giao | pending |

## Verification log

| Command/check | Result | Date |
|---|---|---|
| git status --short / branch --show-current (clinix) | Sạch trước tạo artifact; feat/admin-c3 | 2026-10-28 |
| Read issue #53 trên GitHub | Scope/phụ thuộc P3/CH-10 xác nhận; không ghi lên GitHub | 2026-10-28 |
| Read source/test config/schema | Entity có sẵn; helper integration có recreate DB; chưa thay source hay chạy DB | 2026-10-28 |
| npm test -- src/admin/system-config | 2 file, 7/7 pass; rerun sau chỉnh fixture type pass | 2026-10-28 |
| npm test | 53 file, 993/993 pass; gồm C3 7 test. Log lỗi P7 xuất hiện trong test nhánh lỗi dự kiến, suite vẫn xanh | 2026-10-28 |
| npm run test:int -- src/admin/system-config | 1 file, 2/2 pass trên MySQL8.4 mới riêng. TEST_DB_HOST/PORT/USER/PASSWORD/NAME đều override cho container test, không dùng credential thật. Global setup migrate DB test riêng | 2026-10-28 |
| npm exec -- tsc --noEmit | Pass sau sửa test fixture. Lượt đầu phát hiện ép kiểu thiếu private field repository; lượt sau phát hiện Partial entity không đủ kiểu; đã dùng repository thật có spy và object đủ trường, không ép unknown/any | 2026-10-28 |
| npm run lint / build | Pass. Lint từng cảnh báo spread entity class trong fixture; đã dùng object satisfies entity, rerun lint không chẩn đoán | 2026-10-28 |
| Prettier --check src/admin/system-config src/app.module.ts | Pass | 2026-10-28 |
| Build output | Có dist/admin/system-config/system-config.service.js; không có spec output trong module | 2026-10-28 |
| Final review / git diff --check | Pass; chỉ source C3/AppModule, hai tài liệu Admin và hai artifact C3. Container test riêng đã dừng; focused7/7 và format kiểm cuối pass | 2026-10-28 |

## Handoff

- Import `SystemConfigModule`, inject `SystemConfigService`; `get()` trả entity hoặc null, `getOrThrow()` ném409 khi thiếu. Decimal giữ dạng string; đọc DB mỗi lần, không cache hoặc tự tạo dòng.
- Chưa phủ CH-10 phần GET/chuaCauHinh (B5), CN-55 phần approve (B10); không thêm endpoint C3.
- Docker ban đầu chưa có engine; đã khởi động Docker Desktop để test. Các container compose có restart policy tự chạy lại; không rebuild/recreate API hay chạy lệnh ghi DB dev. Test C3 chỉ trỏ container mới riêng.
- Chưa chỉnh AI_USAGE_LOG.md vì AGENTS repo yêu cầu đồng ý riêng. Dòng gợi ý: ngày28/10/2026; Trung; Codex; C3/#53 đọc cấu hình dùng chung, unit993/993, C3 MySQL2/2, lint/type/build pass; người dùng tự review mã và ghi đúng các cột hiện có, không đoán model.
- Chưa stage/commit/push/PR. Gợi ý PR: `feat(admin): thêm service đọc cấu hình hệ thống`; body `Closes #53` cùng evidence trên. Đóng issue sau review/merge do thành viên thực hiện.
