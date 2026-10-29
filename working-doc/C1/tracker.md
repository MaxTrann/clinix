# C1 — Tracker

Overall: done — triển khai local; chưa PR/review/merge  
Mode: IMPLEMENT  
Updated: 2026-10-29

## Status rules

- `pending`: chưa bắt đầu; `in_progress`: đang thực hiện.
- `waiting_for_user`: chờ câu trả lời/duyệt; `blocked`: blocker kỹ thuật đã xác minh.
- `done`: có evidence; `skipped`: không cần và có lý do.

## Tasks

| ID | Task | Depends on | Status | Evidence/result | Updated |
|---|---|---|---|---|---|
| T1 | Khảo sát và lập plan | — | done | Đọc issue #52 qua GitHub REST, #23/#46 CLOSED; source auth/P2/P7, Q40/Q42, ma trận PQ và test harness; tạo hai artifact C1 | 2026-10-29 |
| T2 | Duyệt plan/contract và coverage PQ | T1 | done | Người dùng duyệt plan C1 và yêu cầu bắt đầu triển khai trong chat | 2026-10-29 |
| T3 | Type và policy/filter | T2 | done | Policy matrix/SQL predicate; focused unit/HTTP 20/20 và MySQL 4/4 | 2026-10-29 |
| T4 | Repository/resolver/guard/decorator/module | T3 | done | Đọc scope mỗi request, context và fail-closed; typecheck/build pass | 2026-10-29 |
| T5 | GET /admin/me và ghép guard upload | T4 | done | Source đã ghép; P7 multipart regression nằm trong focused 20/20; service check giữ nguyên | 2026-10-29 |
| T6 | Route audit và ma trận PQ | T5 | done | Test âm metadata/guard/context pass; HTTP đầu 10/11, lỗi fixture CHECK học vị/chức danh đã sửa; rerun thật cùng auth guard đang chạy | 2026-10-29 |
| T7 | Verification, review diff và tài liệu | T6 | done | Unit1071/1071; HTTP48/48; MySQL C1/P7 sau fix12/12; seed-collision P7 8/8; static/build pass. Full integration đầu388/389, lỗi fixture đã sửa/kiểm nhóm liên quan; chưa rerun toàn29 file | 2026-10-29 |

## Open questions and blockers

| ID | Question/blocker | Owner | Needed for | Status |
|---|---|---|---|---|
| Q1 | Duyệt plan và response `/admin/me`, tích hợp guard upload P7 | Trung | Bắt đầu T3 | done — duyệt plan trong chat 29/10 |
| Q2 | Duyệt cách kiểm PQ bằng probe và ghi phần acceptance nghiệp vụ còn phụ thuộc; không tự giảm điều kiện đóng #52 | Trung | Phạm vi T6/bàn giao | done — duyệt plan trong chat 29/10 |
| Q3 | AI_USAGE_LOG.md chỉ sửa khi được cho phép riêng theo AGENTS | Trung | Log tác động repo | done — người dùng yêu cầu ghi AI log trong chat; đã thêm dòng26 |
| R1 | Docker/MySQL test riêng | Khi IMPLEMENT | Verification DB | Đã bật Docker Desktop; container mới clinix-c1-tests-20261029, cổng 33309, MySQL 8.4; mọi TEST_DB_* override tới DB test riêng, không dùng DB dev | 

## Verification log

| Command/check | Result | Date |
|---|---|---|
| git status / branch / remote (read-only) | feat/admin-c1; ba file dirty có sẵn: AppModule, UploadModule, Admin TRACKING; giữ nguyên | 2026-10-29 |
| gh issue list | gh không có trong PATH; chuyển GitHub REST read-only thành công | 2026-10-29 |
| GitHub REST issues #52, #23, #46 | Đã đọc body C1; A4/P2 CLOSED; chưa kiểm riêng merge SHA | 2026-10-29 |
| Read source/schema/docs/scripts | Guard auth toàn cục có thật; P2 entities/constraints có thật; P7 guard scope riêng cần ghép C1; chưa có rbac | 2026-10-29 |
| Lint/build/unit/integration/e2e | Chưa chạy — lượt PLAN, chưa có code C1 | 2026-10-29 |
| Review artifact / git diff --check / status | Đã review hai file mới; diff tracked không có lỗi whitespace; ba file dirty ban đầu giữ nguyên, chỉ thêm working-doc/C1/ | 2026-10-29 |
| Focused unit/HTTP | npm test -- src/rbac src/common/upload/test/upload.controller.spec.ts: 5 file, 20/20 pass | 2026-10-29 |
| MySQL C1 | npm run test:int -- src/rbac: 4/4 pass trên DB riêng clinix_c1_20261029_int_test, cổng 33309 | 2026-10-29 |
| Typecheck/build | npm exec -- tsc --noEmit và npm run build pass; lượt đầu bắt sai kiểu HocVi ở probe và metadata controller Nest, đã sửa theo enum/type metadata thật | 2026-10-29 |
| Full unit API | npm test: 60 file, 1071/1071 pass; sau bổ sung ca thiếu metadata trong guard test, focused guard2/2 và build pass | 2026-10-29 |
| E2E lượt đầu | 10/11 pass; ca ghi probe dùng TS với chức danh BS vi phạm CHECK hiện hữu. Sửa probe ghi đồng thời chức danh khớp học vị; không sửa schema hoặc code nghiệp vụ để né constraint | 2026-10-29 |
| E2E sau sửa fixture | npm run test:e2e -- test/admin-scope.e2e-spec.ts test/auth-guards.e2e-spec.ts: 2 file, 48/48 pass (C1 11 và auth 37), AppModule/auth/MySQL thật | 2026-10-29 |
| Kiểm cuối static/format | Prettier check toàn scope TypeScript, tsc --noEmit và lint pass; build pass; không spec/test helper trong dist/rbac | 2026-10-29 |
| EXPLAIN lookup scope | Trên DB mẫu riêng: SELECT theo tai_khoan_id dùng PRIMARY, type=const, rows=1. Chỉ chứng minh access path, không phải benchmark tải | 2026-10-29 |
| Môi trường full integration | Container test dùng một lần cổng33309; sau hơn15 phút chạy suite, đặt GLOBAL innodb_flush_log_at_trx_commit=2, tiếp đó sync_binlog=0 để giảm flush I/O của fixture/transaction. Chỉ container mới của C1, không đổi DB dev/schema/constraint/isolation. Lượt focused C1 4/4 và e2e48/48 trước đó chạy cấu hình mặc định. Không kiểm crash durability hoặc benchmark production | 2026-10-29 |
| Full integration lượt đầu | 29 file:28 pass/1 fail; 389 ca:388 pass/1 fail. P7 scope test lỗi UNIQUE tai_khoan.email do nguoi.dung.2@example.com từ file trước còn lại, trong khi counter fixture riêng mỗi file. P7 standalone DB mới8/8 chứng minh phụ thuộc dữ liệu giữa suite. Không phải lỗi guard/query quyền | 2026-10-29 |
| Sửa fixture và rerun nhóm liên quan | Thêm resetTables(db) đầu suite upload.int-spec.ts, dùng helper test có guard tên DB. npm run test:int -- src/rbac src/common/upload/test/upload.int-spec.ts:12/12 pass, gồm4 C1+8 P7. Không sửa helper/source auth hoặc schema | 2026-10-29 |
| Regression đúng email trùng | Harness tạm trong node_modules/.cache/c1-verification dựng DB mới riêng và seed nguoi.dung.2@example.com trước chạy suite P7. Sau fix8/8 pass. Đây là kiểm dữ liệu dư từ file trước; không chỉ rerun DB trống. Chưa rerun full29 file sau fix | 2026-10-29 |
| Kiểm cuối sau sửa fixture | Prettier check, tsc --noEmit, lint và git diff --check pass. Build đã pass với source production hiện tại; thay đổi sau đó chỉ test/Markdown | 2026-10-29 |
| Cleanup | Container mới clinix-c1-tests-20261029 đã dừng; không sửa/dừng container dev có sẵn. Ba thay đổi scheduler ban đầu giữ nguyên | 2026-10-29 |
| AI usage log | Người dùng yêu cầu ghi AI log; đã thêm dòng26 trong bảng1, đúng người dùng/công cụ/scope và kết quả thực; giữ giới hạn full suite và chưa commit/PR | 2026-10-29 |

## Handoff

- Triển khai C1 local hoàn tất. API unit1071/1071, C1/auth HTTP48/48; MySQL C1/P7 sau sửa fixture12/12; regression seed email trùng8/8. Full suite đầu388/389; không tuyên bố đã chạy lại toàn bộ sau fix.
- AI_USAGE_LOG.md đã thêm dòng26 theo yêu cầu riêng của người dùng ngày29/10/2026; chưa ghi người dùng đã tự review/sửa mã khi chưa có xác nhận.
- Issue #52 vẫn OPEN; không commit/push/PR. Chỉ dùng MySQL/container test mới riêng, không thao tác DB dev/chia sẻ.

### Coverage và cách dùng

- PQ-01/02/03/04/05/09/10/11/12: có HTTP thật trên route C1 và upload hiện hữu; route tương lai vẫn cần test riêng. Invalid NULL profile chỉ unit vì CHECK DB cấm dựng dữ liệu đó.
- PQ-06/07/08/13/14/15: policy và probe HTTP/MySQL, lấy chi nhánh tài nguyên từ DB, kiểm sau khóa dòng, lọc cả danh sách/total, actor lấy từ phiên. Không thay acceptance CRUD B-task hoặc AuditService C2; timing404 chỉ cùng nhánh/mã/body, không có benchmark chống timing side-channel.
- Consumer import RbacModule, khai báo Roles + RequireAdminScope; AdminScopeCtx chuyển scope sang service; resource lấy chi nhánh từ DB. Policy patientVisibilityFilter phải được repository gắn vào SELECT và COUNT; không dùng để lọc RAM.
- `GET /admin/me`: TH `{phamVi:'ToanHeThong'}`; CN `{phamVi:'ChiNhanh',chiNhanh:{id:string,ten:string}}`; không có trường phiên/email/địa chỉ/token.
- Gợi ý PR: `feat(rbac): thêm phạm vi quản trị theo chi nhánh dùng chung`. Chưa gắn đóng #52 khi acceptance nghiệp vụ và review/merge còn chưa đủ.

### Nội dung AI log — đã ghi dòng26 theo yêu cầu người dùng

Ngày: 29/10/2026; người dùng: Trung; công cụ: Codex; phạm vi: C1/#52, module rbac, ghép guard upload và tài liệu. Prompt: đọc issue/lập plan, sau đó triển khai plan C1 đã duyệt. AI sinh: source/policy/guard/controller, unit/MySQL/HTTP test và cập nhật plan/tracker. Phần tự sửa/viết: người dùng điền sau review, chưa có evidence trong phiên này. Kiểm chứng: dùng kết quả thực tại Verification log ở trên. Commit/PR: chưa thực hiện. Không đoán model hoặc ghi người dùng đã review mã khi chưa có xác nhận.
