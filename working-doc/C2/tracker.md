# C2 — Tracker

Overall: done — VERIFIED local; issue94 còn chờ review/merge  
Mode: IMPLEMENT  
Updated: 2026-10-30

## Status rules

- pending: chưa làm; in_progress: đang thực hiện; waiting_for_user: chờ duyệt/access.
- blocked: blocker kỹ thuật đã xác minh; done: có evidence; skipped: không cần có lý do.
- C2 implementation local hoàn tất; issue94 online đã đọc. Acceptance consumer B-task, CI/review/merge không gộp với test cơ chế C2.

## Tasks

| ID | Task | Depends on | Status | Evidence/result | Updated |
|---|---|---|---|---|---|
| T1 | Khảo sát và lập plan/issue body | — | done | Đọc Q39/PLAN5.10, entity/enum/migration P3/schema/auth handoff; soạn body ở cuối plan; chưa code | 2026-10-29 |
| T2 | Tạo issue GitHub C2, đọc lại | T1 | done | Người dùng tự tạo #94; đã đọc body bằng GitHub REST, OPEN | 2026-10-30 |
| T3 | Duyệt plan và Q1/Q2 | T1 | done | Người dùng yêu cầu triển khai theo plan ngày30/10, duyệt Q1/Q2 | 2026-10-30 |
| T4 | Types/validator/unit | T3 | done | C2 unit77/77; có regression role array bị ép string, whitelist nested, copy JSON, timestamp/snapshot | 2026-10-30 |
| T5 | Service/repository/module | T4 | done | Module export service, manager transaction caller, repository một insert, lỗi cố định không SQL/cause | 2026-10-30 |
| T6 | MySQL/HTTP probe | T5 | done | MySQL cuối11/11, HTTP8/8; transaction/FK/CHECK/actor/scope/concurrency/timezone và bigint thật pass | 2026-10-30 |
| T7 | Review/docs/tracker | T6 | done | Diff/format/security scan pass; Admin PLAN/TRACKING, log Trung dòng28, AI-BUG-023 và TECH_DEBT46 cập nhật | 2026-10-30 |

## Open questions and blockers

| ID | Question/blocker | Owner | Needed for | Status |
|---|---|---|---|---|
| ACCESS | Đã giải quyết: người dùng tự tạo issue94, đọc bằng REST; task này không cần GitHub write | Trung | T2 | resolved |
| Q1 | Contract service/transaction/lỗi duyệt theo yêu cầu tiến hành C2 ngày30/10 | Trung | T4/T5 | approved |
| Q2 | Whitelist11 action, từ chối action cũ chưa contract và giới hạn scanner đã duyệt ngày30/10 | Trung | T4/T6 | approved |

## Verification log

| Command/check | Result | Date |
|---|---|---|
| Workspace SKILL/AGENTS, project-start-task, clinix-admin-workflow | Đã đọc, task PLAN; chưa implementation | 2026-10-29 |
| Git status/branch | main, sạch lúc bắt đầu C2; không Git mutation | 2026-10-29 |
| GitHub REST source | #47/#52 CLOSED; label backend/prerequisite/module:admin và milestone catalog#2 tồn tại; chưa xác minh merge SHA riêng | 2026-10-29 |
| Audit source/schema | Entity + registry + P3 enum/FK/index/CHECK có thật; chưa AuditService/module. Không cần migration mới theo evidence hiện có | 2026-10-29 |
| GitHub write capability | Không gh PATH/hai vị trí chuẩn; tìm GitHub plugin xác nhận installed=false; đã đề xuất kết nối. Chưa đọc token/credential, chưa POST issue | 2026-10-29 |
| Build/lint/unit/MySQL/HTTP | Chưa chạy — chỉ PLAN, không kết nối DB | 2026-10-29 |
| Artifact review/diff | Đủ 9 mục plan, mapping C2-01…08, body issue đầy đủ; chỉ hai artifact mới, Markdown fences khớp; git diff --check pass | 2026-10-29 |

## Handoff tại thời điểm PLAN 29/10/2026 (lịch sử)

- Plan/issue body đã sẵn trong plan.md; chờ duyệt Q1/Q2 và kết nối GitHub để tạo issue thực.
- Khi có access, kiểm lại không trùng issue C2 rồi tạo đúng title/body/labels/milestone ở plan, đọc lại number/URL/body và cập nhật hai artifact. Không cần xin phép lại việc tạo issue.
- Chỉ tạo hai artifact C2; không sửa source/Admin tracking/AI log trong PLAN, không commit/push/PR/merge/deploy.
- Không dùng probe để đánh dấu acceptance CH/BS/NS/TK/CN đã pass. Không có màn xem audit trong C2.

## Cập nhật trước IMPLEMENT 30/10/2026

- Issue #94 và plan đã duyệt. Source chưa sửa vì checkout hiện là main; đã hỏi người dùng tạo/chuyển feat/admin-c2 hoặc cho phép agent tạo, theo AGENTS.
- Docker daemon chưa chạy; đã mở Docker Desktop ở chế độ hidden để chuẩn bị container test riêng; chưa chạm DB dev.

## Evidence IMPLEMENT đang chạy

- GitHub issue #94 OPEN đã đọc; người dùng tạo/chuyển feat/admin-c2 và đã xác minh.
- Docker Desktop đã sẵn sàng; container MySQL8.4 mới clinix-c2-tests-20261030 cổng33311; không DB dev3306. Test user/password ngẫu nhiên chỉ trong bộ nhớ, dọn user sau run.
- Test negative role ["LeTan"] ban đầu không bị từ chối do String coercion; đã có red regression rồi sửa typeof string, C2unit77/77 pass.
- MySQL lượt đầu10/11, HTTP8/8 pass. Setup fixture admin big ID bị FK: probe transaction riêng xác nhận repo.save trả id="90071992547409930" trong khi DB lưu "9007199254740993". Owning source node_modules/typeorm/driver/mysql/MysqlDriver.js:832 cộng insertId chuỗi với entityIndex0. Không sửa thư viện/auth/helper chung; fixture C2 dùng insert ID định trước, bỏ qua generatedMap và kiểm lại dữ liệu đọc thật.
- TypeORM QueryDeepPartialEntity của cột Record<string,unknown> không biểu diễn nested null; cast được giới hạn đúng biên repository sau whitelist/copy JSON, không đổi entity/schema.

## Verification kết thúc IMPLEMENT — 30/10/2026

| Command/check | Result | Date |
|---|---|---|
| npm test -- src/audit | 2 file,77/77 pass; test coercion role có red trước fix | 2026-10-30 |
| npm test (toàn API) | 73 file,1300/1300 pass | 2026-10-30 |
| npm run test:int -- src/audit | DB clinix_c2_20261030_int_test cổng33311,11/11 pass sau sửa setup fixture bigint | 2026-10-30 |
| npm run test:e2e -- test/audit.e2e-spec.ts | DB clinix_c2_20261030_e2e_test cổng33311,8/8 pass; guard thật/actor session/scope/rollback; MailService mock | 2026-10-30 |
| npm run build / npm run lint / tsc --noEmit | Pass; lint cuối không cảnh báo | 2026-10-30 |
| Prettier --check scope audit source/test / git diff --check | Pass; reviewed tracked diff + source/test mới | 2026-10-30 |
| Gitleaks v8.30.1 image local dir /scan --redact --no-banner | Read-only mount chỉ audit source/tests và HTTP test; no leaks found | 2026-10-30 |
| Probe TypeORM bigint trong transaction rollback | insertId raw là string đúng; repo.save trả90071992547409930, DB lưu9007199254740993; owning MysqlDriver.js832 cộng chuỗi+entityIndex0. Ghi DEBT46, không sửa library/auth | 2026-10-30 |
| Cleanup | Test users sinh ngẫu nhiên đã DROP sau run; container clinix-c2-tests-20261030 đã dừng; không stop/mutate DB dev3306 | 2026-10-30 |
| Giới hạn | Không full MySQL/e2e, CI/browser/review/merge; không thay acceptance consumer B-task; không có route audit runtime mới | 2026-10-30 |

## Handoff cuối

- C2/#94 VERIFIED local; source chính src/audit/, probe test/audit.e2e-spec.ts. Module sẵn để consumer import; không tự ghi audit cho các B-task chưa có.
- Contract/cách dùng ở Admin PLAN5.10, plan C2. Log Trung dòng28; AI-BUG-023 là lỗi coercion đã sửa; DEBT46 là hạn chế generatedMap bigint hiện hữu ngoài scope.
- Actor lấy từ phiên tại caller; branch lấy từ DB sau khóa; await record trong cùng callback transaction, không catch rồi commit tiếp. Không truyền DataSource.manager, không tự retry/dedupe.
- Consumer UC vẫn cần test riêng; scanner pattern không bảo đảm phát hiện mọi bí mật trong văn bản tự do.
- Gợi ý PR: feat(audit): thêm dịch vụ ghi nhật ký dùng chung; Closes #94 khi nhóm chuẩn bị PR. Chưa commit/push/PR/merge hoặc đổi trạng thái issue.

## Kiểm tra sau khi người dùng chuyển ba test vào src/audit/test — 30/10/2026

- Ba file: audit-validation.spec.ts, audit.service.spec.ts, audit.int-spec.ts. Đã kiểm đủ17 relative imports, tất cả trỏ đến file thật; người dùng đã cập nhật đúng ../ và ../../, không cần sửa source.
- Vitest unit include **/*.spec.ts và integration src/**/*.int-spec.ts vẫn nhận thư mục test lồng trong audit; build exclude **/*spec.ts và src/**/testing không đóng gói test.
- npm test -- src/audit/test:2 file unit,77/77 pass. tsc --noEmit, npm run lint và npm run build:pass.
- Chưa chạy lại MySQL/HTTP trong lượt kiểm đường dẫn; kết quả11/11 và8/8 ở trên thuộc lượt triển khai trước khi di chuyển. Không kết nối/ghi DB trong lượt này.
