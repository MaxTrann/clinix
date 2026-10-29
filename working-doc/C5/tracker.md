# C5 — Tracker

Overall: waiting_for_user  
Mode: IMPLEMENT  
Updated: 2026-10-29

## Status rules

- pending: chưa bắt đầu; in_progress: đang thực hiện; waiting_for_user: chờ duyệt/decision.
- blocked: blocker kỹ thuật có evidence; done: hoàn tất bước và có evidence; skipped: không cần, có lý do.
- Implementation và automated verification hoàn tất local; SD-05 manual/review còn pending, không đánh dấu issue done.

## Tasks

| ID | Task | Depends on | Status | Evidence/result | Updated |
|---|---|---|---|---|---|
| T1 | Khảo sát và lập plan C5 | — | done | Đọc issue #54, phụ thuộc #45/#46/#47/#20 CLOSED; đọc source/policy/schema và SD-01…06; tạo plan/tracker | 2026-10-29 |
| T2 | Duyệt plan và Q1–Q3 | T1 | done | Người dùng duyệt toàn bộ bằng “oke tiến hành c5”; dùng manifest tạm, năm account và policy insert-only | 2026-10-29 |
| T3 | CLI/env/runner/repository | T2 | done | CLI/env/runner có mã; unit22/22; build/lint/typecheck pass sau sửa inference, đã xử lý kết quả GET_LOCK dạng chuỗi từ MySQL | 2026-10-29 |
| T4 | Catalog và config-dev | T3 | done | Đã triển khai manifest được duyệt, insert-only và validation Q34; đang verification | 2026-10-29 |
| T5 | Dev-accounts và first-admin | T4 | done | Đã triển khai profile/hasher/transaction; chưa seed DB dev | 2026-10-29 |
| T6 | Verification SD-01…06 | T5 | waiting_for_user | Automated pass: API1223/1223, C5unit30/30, MySQL16/16, HTTP5/5; SD-05 manual chưa thực hiện | 2026-10-29 |
| T7 | D8, review và tài liệu/AI log | T6 automated | done | .env.example/DEV_SETUP/Admin PLAN/TRACKING cập nhật; log Trung dòng27 và AI-BUG-014/015; diff/format/security scan pass | 2026-10-29 |

## Open questions and blockers

| ID | Question/blocker | Owner | Needed for | Status |
|---|---|---|---|---|
| Q1 | Cung cấp bộ catalog Figma hoặc duyệt rõ manifest tạm ở plan mục 3 (8 chuyên khoa, 3 nhóm, 3 dịch vụ, 4 chi nhánh, lịch/giá minh họa) | Trung | T4 | approved |
| Q2 | Duyệt 5 dev-account, SEED_DEV_PASSWORD chung cho demo; bổ sung SEED_ADMIN_FULL_NAME/PHONE bắt buộc cho first-admin | Trung | T3/T5 | approved |
| Q3 | Duyệt insert-only/preserve existing; conflict thì rollback; không tự sửa branch/account/config; first-admin chạy lại từ chối | Trung | T3–T5 | approved |
| ENV | Đã dùng MySQL8.4 container test mới clinix-c5-tests-20261029 cổng33310; đã dừng. Chưa seed DB dev/chia sẻ | Trung | Chạy seed ngoài DB test disposable | not_requested |
| MANUAL | SD-05: đăng nhập thủ công từng vai trò chưa thực hiện; HTTP5/5 là evidence bổ sung | Trung | Acceptance SD-05 / đóng issue | pending |

## Verification log

| Command/check | Result | Date |
|---|---|---|
| Workspace SKILL, project-start-task, project-change-data, clinix-admin-workflow và AGENTS | Đã đọc; chế độ PLAN, chỉ hai artifact C5 | 2026-10-29 |
| GitHub REST issue #54 và #45/#46/#47/#20 | C5 OPEN; bốn phụ thuộc CLOSED; chưa xác minh riêng merge SHA | 2026-10-29 |
| git status/branch | feat/admin-c5; PLAN ban đầu có ba dirty files; lúc IMPLEMENT chỉ còn TRUNG_AI_USAGE_LOG.md và working-doc/C1/tracker.md. Giữ nguyên thay đổi C1, bổ sung riêng C5 vào log Trung; không sửa AI_USAGE_LOG.md | 2026-10-29 |
| Source/schema/test/docs read | Có stack thật và auth policies/hasher; chưa seed scripts; chi_nhanh không UNIQUE lookup, cần khóa CLI/handling conflict; DBML không đủ manifest | 2026-10-29 |
| Lint/build/unit/MySQL/HTTP/manual | Chưa chạy — PLAN, chưa có implementation; không kết nối DB/chạy seed | 2026-10-29 |
| Review plan/tracker và diff | Đủ 9 mục plan, mapping SD-01…06, Q1–Q3 còn chờ duyệt; chỉ hai artifact C5 mới, các dirty files đầu lượt giữ nguyên; git diff --check pass | 2026-10-29 |
| MySQL lượt đầu + root cause | 12/13 fail do strict compare số1 với chuỗi"1" từ GET_LOCK; query độc lập xác nhận; sửa normalize số ở acquire/release và test free-lock | 2026-10-29 |
| MySQL lượt hai và HTTP setup | MySQL8/13 pass, lỗi fixture test save trực tiếp làm mutate manifest branch (null thừa vào lookup); đã clone fixture và lookup chỉ chọn ten/diaChi. HTTP chưa chạy ca nào vì AppModule cấm DB password rỗng; chuyển test user sinh ngẫu nhiên trong container C5 riêng | 2026-10-29 |
| Static checks cuối | npm run build; npm run lint; tsc --noEmit; Prettier --check scoped source/test/package; git diff --check: pass, lint không cảnh báo | 2026-10-29 |
| API unit toàn bộ | npm test: 71 file, 1223/1223 pass; sau chỉnh assertion không in hash/password, kiểm lại C5: 2 file,30/30 pass | 2026-10-29 |
| MySQL C5 cuối | npm run test:int -- src/database/seeds:16/16 pass trên clinix_c5_20261029_int_test; gồm catalog concurrent, first-admin concurrent, rollback, rerun/preserve, missing profile/service, email conflict và CLI thật | 2026-10-29 |
| HTTP C5 | npm run test:e2e -- test/seed-login.e2e-spec.ts:5/5 pass; AppModule/auth/MySQL thật, mock MailService; login4 role, GET /admin/me cho2 scope đúng; chưa manual SD-05 | 2026-10-29 |
| CLI smoke | seedCli:catalog59 created, first-admin với NODE_ENV=production trên DB test tạo rồi từ chối lần2, dev-accounts thành công; subprocess Node dist config-dev exit0/row1, catalog production exit1/mã cố định. Không SMTP/JWT cho CLI | 2026-10-29 |
| Security scan scoped C5 | Gitleaks v8.30.1 image có sẵn, dir /scan --redact --no-banner; mount read-only chỉ seed source/tests + HTTP test; no leaks found. Không quét/đọc .env thật | 2026-10-29 |
| Test environment/cleanup | Container mới MySQL8.4 cổng33310; test user/password sinh ngẫu nhiên trong bộ nhớ, user dọn sau run; không credential thật. Container đã dừng; không đổi MySQL dev3306 hay cấu hình durability server | 2026-10-29 |
| Giới hạn verification | Không chạy toàn bộ MySQL/e2e repository, browser/manual, CI, PR/review/merge; không seed DB dev/chia sẻ. Không đổi schema/migration/auth implementation/frontend/dependency | 2026-10-29 |

## Handoff

- C5 implementation VERIFIED local; T6 chỉ còn SD-05 manual, review/merge do thành viên thực hiện. Chưa đóng issue #54.
- Plan và Q1–Q3 đã duyệt; dùng manifest tạm, chưa khẳng định khớp Figma. Không tự seed DB dev/chia sẻ.
- Thay đổi: apps/api/src/database/seeds/, test/seed-login.e2e-spec.ts, package scripts, .env.example, DEV_SETUP, Admin PLAN/TRACKING, plan/tracker C5 và log Trung dòng27.
- Các thay đổi C1 đầu lượt giữ nguyên; không sửa AI_USAGE_LOG.md. AI-BUG-014/015 ghi lỗi thực và regression tương ứng trong log Trung.
- Không coi issue phụ thuộc CLOSED là bằng chứng merge SHA; không coi HTTP5/5 là manual SD-05.
- Gợi ý commit/PR: feat(db): thêm seed dữ liệu mẫu và tạo Admin đầu tiên. Chưa git add/commit/push/PR/merge.
