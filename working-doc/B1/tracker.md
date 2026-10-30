# B1 — Tracker

Overall: done — backend local verified; F2/D2/PR còn riêng  
Mode: IMPLEMENT  
Updated: 2026-10-30

## Status rules

- pending: chưa thực hiện; in_progress: đang làm; waiting_for_user: chờ quyết định.
- done: có evidence; blocked: blocker kỹ thuật đã xác minh; skipped: không cần và có lý do.

## Tasks

| ID | Task | Depends on | Status | Evidence/result | Updated |
|---|---|---|---|---|---|
| T1 | Khảo sát và lập plan B1 | — | done | Đọc #55 qua GitHub REST, dependency #45/50/51/52 closed và commit trong lịch sử nhánh; kiểm entity/SQL/P6/C1/P7/auth handoff, test CK và manifest; tạo hai artifact | 2026-10-30 |
| T2 | Duyệt contract/giới hạn/số bác sĩ | T1 | done | Người dùng yêu cầu bám Admin PLAN và bắt đầu sau khi nhận đề xuất. plan mục 3: endpoint/body/response; mô tả 5.000, q 200; soBacSi toàn hệ thống | 2026-10-30 |
| T3 | DTO/repository/service và ảnh transaction | T2 | done | Unit21/21, MySQL14/14; UNIQUE race, bigint, transaction/ledger rollback, tìm kiếm và count đúng. | 2026-10-30 |
| T4 | Controller/module/options và quyền | T3 | done | Đã ghép module/controller/options, role và scope C1 thật. | 2026-10-30 |
| T5 | MySQL/HTTP regression B1 | T4 | done | MySQL B1 14/14; HTTP B1+C1 21/21 (10+11), auth/role/scope/actor và metadata route thật | 2026-10-30 |
| T6 | Verification, review, cập nhật docs/handoff | T5 | done | API unit1517/1517; lint/build/typecheck/format/diff pass; Linux jscpd1,91% trên249 file; Gitleaks hai scope source/test sạch; đồng bộ Admin PLAN/TRACKING | 2026-10-30 |

## Open questions and blockers

| ID | Question/blocker | Owner | Needed for | Status |
|---|---|---|---|---|
| Q1 | Duyệt contract đề xuất tại plan mục 3, gồm dropdown phân trang và PATCH/status tách riêng | Trung | T3/T4 | resolved — yêu cầu bắt đầu 30/10/2026 |
| Q2 | Mô tả tối đa 5.000 ký tự, q tối đa 200? CK-12 chưa có con số đã chốt | Trung | DTO/test | resolved — yêu cầu bắt đầu 30/10/2026 |
| Q3 | soBacSi đếm mọi bác sĩ gán toàn hệ thống cho cả hai scope, không lọc trạng thái tài khoản? | Trung | CK-07/17 | resolved — yêu cầu bắt đầu 30/10/2026 |
| D1 | #55 còn nhắc P7 Docker volume; quyết định hiện hành là Cloudinary | Thành viên | Review issue/handoff | open — đã ghi lệch, không sửa remote |
| D2 | Đồng bộ 2.4 CK: Admin Chi nhánh chỉ xem; không phải hoàn tất bằng backend test | Thành viên | Issue acceptance | pending |
| R1 | Xác minh môi trường test DB mới riêng trước integration/e2e vì global setup reset DB | Agent | T5 | resolved — container mới clinix-b1-tests-20261030, cổng33312; DB *_int_test và *_http_test riêng |

## Verification log

| Command/check | Result | Date |
|---|---|---|
| git status/branch/log/remote (read-only) | feat/admin-b1; TRUNG_AI_USAGE_LOG.md modified có sẵn; không đổi Git | 2026-10-30 |
| GitHub REST read-only | #55 OPEN; #45/50/51/52 CLOSED; nội dung #55 và mã CK đã đọc | 2026-10-30 |
| Source dependency | Entity/constraint P1/P7, paging P6, global auth/C1 và assignSpecialty transaction có thật; chưa có consumer CRUD chuyên khoa | 2026-10-30 |
| Reference/task review | CK-01–18, Q11/12/13/19/42, auth handoff mục 5, convention/schema/manifest và test setup; không đọc secret/env thật | 2026-10-30 |
| PLAN trước triển khai | Chưa chạy test ở bước PLAN; kết quả IMPLEMENT ở các dòng sau | 2026-10-30 |
| Review artifact/status/diff | Đọc lại hai artifact, kiểm đường dẫn và source reference; git diff --check sạch cho tracked diff; status chỉ thêm working-doc/B1 ngoài log dirty ban đầu | 2026-10-30 |
| npm test -- src/admin/specialties | 2 file,21/21 unit pass (CK-02/12/validation, scope service, phân loại lỗi UNIQUE/FK) | 2026-10-30 |
| npm run test:int -- src/admin/specialties | 1 file,14/14 pass; MySQL8.4/container mới33312, clinix_b1_20261030_int_test. UNIQUE race buộc bỏ precheck trong test để thật sự nhận duplicate từ DB; ảnh và specialty rollback cùng transaction; bigint9007199254740993 giữ đúng | 2026-10-30 |
| npm run test:e2e -- test/admin-specialties.e2e-spec.ts test/admin-scope.e2e-spec.ts | Lượt đầu dừng trước test vì MYSQL_PASSWORD test rỗng không qua validator app; tạo user/mật khẩu giả chỉ trong container mới, không sửa validator. Rerun2 file21/21 pass, B1 10+C1 11; clinix_b1_20261030_http_test | 2026-10-30 |
| npm test | Toàn API87 file1517/1517 pass; không phải toàn MySQL/e2e | 2026-10-30 |
| npm run lint; npm run build; npm exec -- tsc --noEmit | Pass; lint lần đầu có warning thiếu comparator sort trong test, đã sửa và lint cuối sạch; build dist/admin/specialties không có spec/test helper | 2026-10-30 |
| Prettier check scope B1/AppModule | Pass sau format hai test file; không format ngoài scope | 2026-10-30 |
| npm run dup trên Windows | Exit0 nhưng không có thống kê file, không dùng kết quả này để kết luận duplication | 2026-10-30 |
| Linux node:22-alpine, jscpd@4 --config .jscpd.json | Pass:249 file,31123 dòng,596 dòng trùng=1,91% <3%; mount repo read-only, output /tmp trong container, không đổi cấu hình/dependency | 2026-10-30 |
| Gitleaks8.30.1 detect --no-git, config repo, redact | Source admin/specialties và riêng HTTP test: cả2 exit0/no leaks; không scan .env/dữ liệu dev hoặc in secret | 2026-10-30 |
| Final review | Đọc toàn source mới, review DTO→controller→service→repository/P7, response allowlist, binds SQL/locks/rollback; git diff --check pass; giữ nguyên TRUNG_AI_USAGE_LOG.md dirty đầu phiên | 2026-10-30 |

## Handoff

- Backend B1 local hoàn tất theo Admin PLAN; contract đồng bộ mục5.3, dòng B1 giữ checkbox chưa đóng vì issue còn review/merge/D2.
- Phần khó: service mở transaction, UNIQUE tên xử lý race sau precheck; khóa chuyên khoa rồi gọi P7 với cùng manager để thay ảnh/tên cùng commit/rollback. List và total đọc cùng snapshot; count bác sĩ qua subquery để không nhân bản dòng; bigint được CAST CHAR.
- CK-01–10/12–14/16/17 pass ở cấp backend; CK-11 tích hợp ảnh có evidence nhưng UI/preview chờ F2; CK-15 chỉ FE chưa làm. CK-18 kế thừa P1, không chạy lại migration ngoài global setup DB test mới.
- Còn D2 Word (Chi nhánh chỉ xem), UI F2 và CI/review/merge; không tuyên bố issue #55 đã đóng. Không full MySQL/full HTTP hoặc browser acceptance.
- Không commit/push/PR, không đổi schema/dependency/frontend/env thật, không đụng DB dev/chia sẻ/Cloudinary thật. Chỉ dùng container/DB mới của B1; container test dừng sau kiểm thử, giữ lại để người dùng xem nếu cần.
- TRUNG_AI_USAGE_LOG.md đã thêm mục29 lên đầu bảng1 theo yêu cầu riêng của người dùng ngày30/10/2026; giữ nguyên các mục trước đó. Ghi đúng scope/kết quả B1 và giới hạn F2/D2/CI/PR; không ghi người dùng đã tự review/sửa mã hoặc model chưa được xác minh.
- Gợi ý commit/PR do thành viên tự tạo: `feat(admin): thêm quản lý chuyên khoa`.

### Evidence IMPLEMENT

- Unit B1 21/21 pass; MySQL B1 14/14 pass trên container mới clinix-b1-tests-20261030, MySQL8.4/cổng33312, DB clinix_b1_20261030_int_test. Không DB dev/chia sẻ.
- Typecheck source lượt đầu pass; khi thêm HTTP test bắt hai lỗi kiểu unknown trong helper send, đã đổi đúng object; chưa dùng lỗi đó để sửa source nghiệp vụ.
