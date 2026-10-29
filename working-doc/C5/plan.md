# C5 — Seed dữ liệu mẫu và tạo Admin đầu tiên (#54)

Status: In progress — implementation VERIFIED local; SD-05 manual/review còn pending  
Mode: IMPLEMENT  
Owner: Trung  
Updated: 2026-10-29

## 1. Goal and scope

Tạo công cụ CLI để nhóm có dữ liệu mẫu nhất quán và có thể tạo Quản trị viên Toàn hệ thống đầu tiên, đúng issue [C5 #54](https://github.com/MaxTrann/clinix/issues/54).

In scope sau khi duyệt:

- Bốn script trong `apps/api/package.json`: `seed:catalog`, `seed:dev-accounts`, `seed:first-admin`, `seed:config-dev`.
- Dữ liệu catalog: 8 chuyên khoa, 3 nhóm dịch vụ, dịch vụ khám, 4 chi nhánh, 7 dòng lịch/chi nhánh, dịch vụ khả dụng, singleton thông tin phòng khám.
- Tài khoản mẫu đủ bốn vai trò; Admin có cả hai phạm vi; dùng chính sách email/SĐT/mật khẩu và PasswordHasher của auth.
- Cấu hình dev có nhãn dữ liệu thử; bootstrap first-admin; transaction, chạy lại, chạy đồng thời, lỗi/log an toàn.
- Test SD-01…SD-06; `.env.example`, `docs/DEV_SETUP.md`, tracking Admin và cùng tracker C5 khi IMPLEMENT.

Out of scope:

- API/UI quản trị, migration/schema mới, sửa migration đã áp dụng, đổi auth/vendor/dependency.
- Seed lịch hẹn, khung giờ, lịch làm việc, dữ liệu khám bệnh, nạp ví, phụ phí bác sĩ hoặc mốc hoàn tiền.
- Gửi mail/OTP, Cloudinary, tạo phiên đăng nhập trong CLI, tự động chạy seed lúc API khởi động.
- Commit/push/PR/merge/deploy; chạy seed lên DB dev/chia sẻ khi chưa xác nhận riêng môi trường và quyền ghi.

Acceptance criteria:

1. SD-01: catalog chạy hai lần trên cùng DB không nhân đôi và không lỗi; không phụ thuộc ID AUTO_INCREMENT cụ thể.
2. SD-02: tất cả CHECK/FK/UNIQUE hiện hữu thỏa; 4 chi nhánh có 28 dòng lịch ISO 1–7; bác sĩ có cặp (chi nhánh, dịch vụ) hợp lệ và hồ sơ đúng chức danh/học vị.
3. SD-03: ba seed mẫu từ chối production trước khi kết nối/ghi DB; first-admin vẫn được phép chạy production theo Q30. Không dùng điều kiện này làm bằng chứng được phép ghi DB nào.
4. SD-04: first-admin tạo tài khoản DangHoatDong, email đã xác minh, vai trò QuanTriVien và hồ sơ ToanHeThong/chiNhanhId NULL trong một transaction; từ chối nếu đã có bất kỳ hồ sơ ToanHeThong, kể cả tài khoản ngừng hoạt động. Mật khẩu đúng validator auth, băm Argon2id, không log bí mật.
5. SD-05: tài khoản mẫu đăng nhập được bằng auth thật cho từng vai trò; theo PLAN đây là manual acceptance, test HTTP bổ sung không tự thay thế phần manual.
6. SD-06: config-dev chỉ tạo singleton id=1 khi chưa có; giá trị thử đúng Q36/Q34/schema, ghi rõ không phải tham số nghiệp vụ chính thức.
7. Dev-accounts/config-dev chạy lại không reset mật khẩu, trạng thái, số dư hay cấu hình hiện hữu. Lỗi giữa chừng rollback phần ghi của toàn lệnh.
8. Chạy đồng thời các CLI C5 không tạo trùng chi nhánh/tài khoản hoặc hai first-admin; lỗi được báo gọn, exit khác 0, không in raw SQL/parameters/connection/error object.
9. D8 có hướng dẫn thứ tự chạy, env mới, precondition migration, hành vi chạy lại, dữ liệu minh họa và giới hạn concurrency.

## 2. Evidence and context

### Evidence lúc lập PLAN (được giữ để truy vết)

- Issue #54 OPEN, đọc body trực tiếp qua GitHub REST ngày 29/10/2026. Issue dẫn Q30/Q35/Q36/Q44, H18, CH A3/1c và SD-01…SD-06.
- Phụ thuộc #45/#46/#47/#20 đều CLOSED theo GitHub REST; source/migrations tương ứng tồn tại local. Chưa xác minh riêng merge SHA của từng issue.
- Nhánh hiện tại `feat/admin-c5`. Dirty ban đầu chỉ có `AI_USAGE_LOG.md`, `TRUNG_AI_USAGE_LOG.md`, `working-doc/C1/tracker.md` từ lượt sửa nơi ghi log; giữ nguyên các thay đổi này.
- `docs/features/admin/PLAN.md:226`: Q30 first-admin; `:236`: Q35; `:237`: Q36; `:250`: Q44; `:546`: miền Q34; `:666`: C5; `:1151`: SD-01…SD-06.
- `docs/features/admin/TRACKING.md`: quyết định đã chốt Q30/Q35; không có quyết định thay thế bộ seed của Q44. C1/C3 có evidence local, không phải phụ thuộc mới của C5.
- `docs/features/auth/TRACKING.md:221` mục 5: dùng lại registry DB, timezone, test DB riêng; không import helper test vào CLI dev.
- `apps/api/package.json`: NestJS/TypeORM/mysql2/argon2 hiện hữu, chưa có script seed; có build/lint/test/test:int/test:e2e. Không cần thêm thư viện chạy TypeScript.
- `apps/api/src/database/data-source.ts`: buildDataSourceOptions/dbSettingsFromEnv, MySQL, timezone driver + session, synchronize=false; registry explicit tại `migrations/index.ts`.
- `apps/api/src/database/migrate.ts`: precedent CLI ESM build rồi chạy dist; hiện dùng validateEnv toàn ứng dụng. CLI C5 cần tránh bootstrap AppModule/scheduler/mail/upload chỉ để ghi seed.
- `apps/api/src/auth/password/password-hasher.service.ts:13`: hash dùng Argon2id; `password-policy.ts`: checkPassword; `validation/email-policy.ts`: normalizeEmail/isValidEmail; phone/full-name policies hiện hữu. Tái dùng, không sao chép.
- `docs/database/clinix_mysql.sql:197`: chi_nhanh không có UNIQUE tên hay cặp tên/địa chỉ; `:205`: lịch PK (chi_nhanh_id, thu_trong_tuan); `:224`: nhóm UNIQUE tên; `:230`: dịch vụ; `:297`: config đủ 12 tham số.
- `apps/api/src/admin/entities/quan-tri-vien.entity.ts`: CHECK phạm vi; `bac-si.entity.ts`: CHECK học vị/chức danh; `auth/entities/tai-khoan.entity.ts`: hoTen và soDienThoai NOT NULL; `auth/entities/vi-noi-bo.entity.ts:11`: bệnh nhân đã xác minh có ví số dư 0.
- DBML mục chuyên khoa/nhóm chỉ cho ví dụ, chưa phải manifest đầy đủ 8 chuyên khoa/3 nhóm/4 chi nhánh. Chưa có link/frame Figma đủ dữ liệu seed trong input task này.
- `database/testing/test-database.ts`: guard DB *_test và helper migrated test DB; `admin/testing/admin-fixtures.ts`: factory ngẫu nhiên chỉ dành test, không phù hợp seed dev ổn định.

### UNKNOWN ở thời điểm PLAN; cập nhật hiện tại tại tracker

- Bộ tên và liên kết catalog chính xác từ Figma; dữ liệu dev-account và hồ sơ first-admin được nhóm muốn dùng.
- Docker/MySQL sẵn sàng, migration thực tế của DB đích, kết quả C5 unit/MySQL/HTTP/manual. Không đọc `.env` hay kết nối DB trong PLAN.
- Những ví dụ Prisma/frontend trong reference workspace không khớp source clinix; giữ stack NestJS/TypeORM/Argon2id thật, không chuyển kiến trúc.

## 3. Questions, assumptions and decisions

Người dùng đã duyệt plan và Q1–Q3 bằng yêu cầu “oke tiến hành c5” ngày 29/10/2026. Dùng bộ catalog tạm và dev-account bên dưới; không coi là tên đã đối chiếu Figma. Chỉ DB test disposable được dùng để verification, chưa chạy seed DB dev/chia sẻ.

### Q1 — Bộ catalog: cần bộ tên Figma hoặc duyệt dữ liệu tạm có chủ đích

Q44 nói tên lấy từ Figma/DBML. Cần người dùng cung cấp link/frame hoặc danh sách đã chốt. Nếu chưa có, có thể duyệt rõ bộ tạm bên dưới; hai chuyên khoa bổ sung, tên chi nhánh và tên dịch vụ là PROPOSED, không được ghi là đã khớp Figma.

| Nhóm dữ liệu | Đề xuất cụ thể để duyệt |
|---|---|
| 8 chuyên khoa | 6 tên ví dụ DBML: Cơ Xương Khớp, Thần kinh, Tiêu hóa, Nội tổng quát, Y học gia đình, Tâm thần; bổ sung đề xuất: Tim mạch, Tai Mũi Họng |
| 3 nhóm | Khám chuyên khoa, Khám tổng quát, Khám từ xa (lấy từ ví dụ DBML, việc chọn đúng ba nhóm này cần duyệt) |
| 3 dịch vụ tối thiểu | Khám chuyên khoa mẫu / Khám tổng quát mẫu / Tư vấn từ xa mẫu, mỗi dịch vụ vào nhóm tương ứng; lần lượt 30/60/30 phút, giá minh họa 200000.00/500000.00/150000.00, cọc đều 0.00 |
| 4 chi nhánh | CLINIX Mẫu 1…4; địa chỉ “Địa chỉ minh họa 1”…4, tọa độ NULL; đây là tên tạm, không phải tên Figma |
| Lịch từng chi nhánh | Thứ 2–7: 08:00–12:00 và 13:00–17:00; Chủ nhật nghỉ, bốn giờ NULL; đủ ISO 1–7 |
| Dịch vụ khả dụng | Cả ba dịch vụ ở cả bốn chi nhánh (12 cặp), chỉ để demo |
| Thông tin phòng khám | id=1, thương hiệu CLINIX (minh họa), địa chỉ “Địa chỉ trụ sở minh họa”, email clinic@example.invalid; hotline NULL vì không có số chính thức |
| Ảnh chuyên khoa | NULL, không upload/download ảnh hoặc bịa ledger ảnh |

### Q2 — Tài khoản dev và trường bắt buộc first-admin

PROPOSED: năm tài khoản dev cố định tại miền example.invalid: admin.system, admin.branch, doctor, receptionist, patient. Họ tên lần lượt “Quản trị hệ thống mẫu”, “Quản trị chi nhánh mẫu”, “Bác sĩ mẫu”, “Lễ tân mẫu”, “Bệnh nhân mẫu”. Tất cả DangHoatDong và đã xác minh email; không gửi thư. SĐT giả trong fixture lần lượt 0900000001…0900000005, không dùng để liên lạc.

- Admin Chi nhánh, bác sĩ và lễ tân thuộc chi nhánh mẫu 1. Bác sĩ: chuyên khoa Nội tổng quát, dịch vụ Khám chuyên khoa mẫu, chức danh BS/học vị BS, kinh nghiệm 0. Bệnh nhân có hồ sơ + ví 0.00, không dữ liệu bệnh án. Ngày sinh/giới tính/địa chỉ tùy chọn để NULL.
- Một biến riêng `SEED_DEV_PASSWORD` cho cả năm tài khoản demo, bắt buộc từ env và đúng checkPassword; không fallback mật khẩu, không đưa plaintext vào manifest/test/log/command argument. Test tự tạo mật khẩu ngẫu nhiên hợp lệ trong bộ nhớ.
- `seed:dev-accounts` yêu cầu catalog đã có; không tự seed catalog. Có Admin dev ToanHeThong thì first-admin phải từ chối, đúng Q30. Hướng dẫn bootstrap first-admin trước dev-accounts nếu cần dùng cả hai.
- First-admin giữ `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` theo Q30; đề xuất bổ sung bắt buộc `SEED_ADMIN_FULL_NAME`, `SEED_ADMIN_PHONE` vì bảng tài khoản yêu cầu hai trường này. Không tự dùng danh tính/số điện thoại giả cho bootstrap production. Không yêu cầu người dùng gửi giá trị bí mật qua chat.

Cần duyệt bộ năm tài khoản, một mật khẩu env chung chỉ cho demo, và hai biến hồ sơ first-admin mới.

### Q3 — Hành vi gặp dữ liệu có sẵn (PROPOSED)

- Insert-only: không update/reset/delete dữ liệu đã có. Singleton config/thông tin phòng khám có sẵn thì skip, giữ nguyên toàn dòng.
- Lookup chuyên khoa/nhóm bằng tên, dịch vụ bằng (nhóm, tên), chi nhánh bằng (tên, địa chỉ); lấy ID thật, không ép ID cứng. Chuẩn hóa trim/gộp khoảng trắng cho tên catalog theo Q12/Q16.
- Nếu có nhiều chi nhánh cùng khóa lookup, hoặc hồ sơ/quan hệ có sẵn không thỏa precondition của seed, dừng và rollback; báo loại xung đột và hướng dẫn đối chiếu thủ công, không tự chọn dòng đầu hoặc sửa dữ liệu.
- Existing branch đủ 7 ngày: giữ lịch hiện tại, không bổ sung/thay lịch/dịch vụ của chi nhánh đã có. Nếu thiếu lịch/cặp dịch vụ cần cho bác sĩ mẫu thì dừng; không tự sửa hoạt động chi nhánh đang dùng.
- Existing account cùng email: chỉ skip khi role, verified/active và hồ sơ/quan hệ cần thiết hợp lệ; không kiểm hay đổi plaintext/password hash của tài khoản đó. Không tự nâng quyền, mở khóa hoặc xóa bệnh nhân chưa xác minh. Báo số dòng skip; ghi chú tài khoản đã tồn tại không bảo đảm dùng mật khẩu env mới để login.
- first-admin là ngoại lệ intentional: chạy lần hai từ chối, không phải no-op thành công; không mâu thuẫn SD-01 chỉ dành catalog.

### Assumptions nhỏ

- TASK_ID dùng đúng C5; không tạo artifact ngoài hai file được phép trong PLAN.
- CLI không tự áp migration; schema chưa đủ thì dừng với hướng dẫn migration hiện hữu.
- Không thêm script ở root repo nếu chưa cần; docs ghi rõ chạy trong apps/api.
- AI log dùng `TRUNG_AI_USAGE_LOG.md` theo yêu cầu hiện tại, không ghi vào AI_USAGE_LOG.md. PLAN này chỉ tạo hai artifact; khi IMPLEMENT sẽ ghi log theo quyền người dùng cho phép.

## 4. Core-feature impact

- Không đổi runtime API/permission; seed ghi dữ liệu mà catalog, auth và C3 đọc, vì vậy sai liên kết hoặc chạy lại ghi đè sẽ ảnh hưởng nghiệp vụ.
- Seed dev chủ động tạo tài khoản đã xác minh để demo, không thay đường đăng ký/kích hoạt thật. Không tạo OTP, audit actor giả hoặc gửi email.
- Config-dev có thể khiến C3 chuyển từ thiếu cấu hình sang có cấu hình thử; chỉ thực hiện khi người chạy chủ động gọi lệnh trên môi trường đã cho phép.
- Backward compatibility: không DDL/backfill; không sửa default runtime hay chuyển state tài khoản hiện hữu.

## 5. Proposed approach

### CLI, service, repository

- Đặt mã ở `apps/api/src/database/seeds/`: CLI đọc command/env; service điều phối, validation và transaction; repository chứa query. Manifest catalog và dev-account tách khỏi orchestration, không chứa mật khẩu.
- Bốn npm scripts đề xuất chạy `nest build && node dist/database/seeds/seed.js <catalog|dev-accounts|first-admin|config-dev>` theo precedent migrate.ts. Đây là lệnh SẼ THÊM, hiện chưa tồn tại.
- Dùng DataSource với buildDataSourceOptions/registry/timezone hiện hữu, không Nest AppModule để tránh scheduler/provider cần SMTP/Cloudinary. Seed config chỉ kiểm nhóm biến DB/TZ/NODE_ENV và biến seed của đúng command; không ép cấu hình SMTP/JWT cho CLI thuần DB. Không refactor rộng validator ứng dụng.
- Chặn production cho ba seed mẫu trước initialize; environment không hợp lệ phải từ chối. Không silently bỏ qua NODE_ENV sai. First-admin dùng cùng validation đầu vào ở mọi môi trường.
- Chuẩn hóa email/full-name/phone và checkPassword trước ghi; hash trước mở transaction để tránh giữ khóa trong lúc Argon2 chạy.
- Không expose CLI qua HTTP; không thay đổi global guard C1/auth.

### Transaction và concurrency

- Mỗi command dùng một QueryRunner/connection riêng, acquire khóa MySQL GET_LOCK với tên ổn định theo database trước transaction; cả bốn command dùng cùng khóa cho DB đó. Timeout hữu hạn đề xuất 10 giây; không lấy được thì lỗi sạch. SQL dùng parameters, tên khóa không chứa credential.
- Khóa advisory giữ trên chính connection QueryRunner cho đến sau commit/rollback; luôn RELEASE_LOCK rồi release runner trong finally, kể cả thất bại. Test thật hai connection để xác minh không trả khóa nhầm connection trong pool.
- Mỗi command một transaction toàn bộ phần insert (catalog gồm graph branch + 7 lịch + liên kết; account gồm account + role profile + ví khi là bệnh nhân). Lỗi ở bất kỳ insert nào rollback toàn lệnh.
- first-admin kiểm sự tồn tại ToanHeThong bên trong critical section trước insert; không giới hạn toàn hệ thống vĩnh viễn chỉ một Admin — bootstrap chỉ từ chối khi đã có.
- GET_LOCK chỉ phối hợp các CLI C5 cùng protocol; không ngăn mọi writer API/SQL khác. Do chi_nhanh không UNIQUE khóa lookup và hệ thống vẫn cho tạo nhiều Admin, yêu cầu không chạy bootstrap cùng thao tác tạo Admin/catalog từ writer khác. Không tuyên bố row-lock trên tập rỗng đủ chống đua; không thêm UNIQUE làm đổi business rule.
- Mỗi liên kết dùng ID từ query/insert trong transaction; tiền và decimal lưu string; lịch giữ giờ địa phương theo schema. Không import factory test có resetTables vào production CLI.

### Config-dev (dữ liệu thử, không phải quyết định nghiệp vụ)

Ghi tường minh đủ 12 tham số: giữ chỗ 15 phút; nhắc [72,24,2] giờ; lịch/hồ sơ 3; tự đổi lịch 2; check-in trước/sau 30/15 phút; phản hồi lời mời 60 phút; danh sách chờ tối đa 2; no-show 3; báo trước 3 ngày; w1='0.60', w2='0.40'. Các giá trị không nằm trong Q36 lấy từ default schema chỉ để seed demo. Validate miền Q34, tổng w1+w2=1.00 trước insert; không tự tạo row ở startup C3. B5 vẫn là đường cấu hình chính thức có audit; không tạo fake AuditService/actor để seed.

### Existing data, rollback và security

- Không truncate/drop/upsert-update/replace, không tắt FK/CHECK; không sửa schema/migration/registry vì không có entity mới.
- Lỗi trước commit: rollback toàn command, đóng kết nối; rerun theo cùng policy sau khi nguyên nhân được xử lý. Auto-increment có thể nhảy sau rollback, không coi đó là lỗi.
- Sau commit không có auto-unseed: dữ liệu có thể đã được module khác tham chiếu. Nếu cần gỡ, phải có yêu cầu và kế hoạch riêng, không chạy DELETE hàng loạt.
- Log allowlist command + counts created/skipped + mã lỗi cố định; không dump env, email cá nhân, hash, password, SQL parameters, JWT/cookie. Test bắt stdout/stderr ở cả nhánh thành công, validation, DB lỗi và lock timeout.
- Không đọc `.env` thật trong lượt PLAN; `.env.example` chỉ placeholder không hoạt động. Không thêm dependency hoặc thay compose/CI.

## 6. Work breakdown

| ID | Task | Output/evidence | Depends on | Parallel with |
|---|---|---|---|---|
| T1 | Đọc issue, phụ thuộc, source/schema và lập plan | Hai artifact C5, evidence/UNKNOWN | — | — |
| T2 | Duyệt Q1–Q3 và plan | Bộ dữ liệu + contract CLI được chốt trong chat | T1 | — |
| T3 | CLI/env/DB runner/repository và lock/transaction | Unit SD-03, validation và lifecycle cleanup | T2 | — |
| T4 | Seed catalog và config-dev | SD-01/02/06, counts và chạy lại | T3 | — |
| T5 | Seed dev-account và first-admin | Hồ sơ đúng, hash thật, SD-04 và concurrency | T4 | — |
| T6 | MySQL/HTTP + manual handoff SD-05 | Kết quả từng SD; không đánh đồng HTTP với manual | T5 | — |
| T7 | D8, diff review, tracking và AI log đúng file | Docs/env/script khớp mã; checks thực; báo giới hạn | T6 | — |

Không dùng subagent; không thêm phase release/deploy.

## 7. Expected file/module impact

Đường dẫn mới bên dưới là PROPOSED, được phép tinh chỉnh cách chia file mà không đổi contract:

- Create `apps/api/src/database/seeds/{seed.ts,seed-config.ts,seed-runner.ts,seed.service.ts,seed.repository.ts,catalog-data.ts,dev-account-data.ts}` và unit/MySQL tests cạnh mã.
- Create HTTP test `apps/api/test/seed-login.e2e-spec.ts` nếu có thể tái dùng setup hiện hữu; không đổi contract login.
- Modify `apps/api/package.json`, `.env.example`, `docs/DEV_SETUP.md`, `docs/features/admin/{PLAN,TRACKING}.md`, `working-doc/C5/{plan,tracker}.md` trong IMPLEMENT.
- `TRUNG_AI_USAGE_LOG.md`: dùng đúng log Trung khi được ghi; giữ nguyên các entry cũ. Không thêm entry vào AI_USAGE_LOG.md.
- Do not touch: auth implementation của Đại (chỉ import policy/hasher), frontend, database schema/migrations, compose/CI, dữ liệu thật; giữ nguyên ba dirty files đầu lượt.
- Chưa cần sửa ba tài liệu schema: C5 không đổi DDL; D8 chỉ là env và DEV_SETUP. Nếu phát hiện phải thay schema, dừng để chốt lại scope.

## 8. Verification

Trong PLAN chưa chạy build/lint/unit/MySQL/seed. Sau duyệt, dùng script đã tồn tại trong apps/api:

- `npm run lint`, `npm run build`, `npm test`: kiểm source/API unit; không tự cài dependency.
- `npm run test:int -- src/database/seeds`: sau khi thêm tests, chạy trên MySQL 8.4 DB mẫu riêng *_test, không DB dev/chia sẻ. Hạ tầng test có reset/drop, chỉ dùng DB disposable đã xác nhận.
- `npm run test:e2e -- test/seed-login.e2e-spec.ts`: đường dẫn test dự kiến sau khi tạo; auth thật + MySQL thật, mock mail, không log token/cookie/mật khẩu.
- Format/diff theo tooling có sẵn; review script command thực sự gọi được artifact build và exit code đúng. Không dùng placeholder command làm bằng chứng đã pass.

| Ca | Kiểm chứng dự kiến |
|---|---|
| SD-01 | Catalog hai lần; counts/IDs ổn định, không đụng dữ liệu ngoài manifest; branch không UNIQUE vẫn không trùng khi hai CLI cùng chạy |
| SD-02 | CHECK/FK thật, đủ 7 ngày; doctor service hợp lệ; patient wallet zero; lỗi giữa graph rollback toàn lệnh; manifest không khớp/branch trùng thì từ chối rõ |
| SD-03 | Production chặn cả ba seed trước connect/insert; first-admin không bị chặn bởi production; thiếu/sai env không in giá trị |
| SD-04 | DB chưa có/có Admin (cả ngừng hoạt động), email trùng khác role, mật khẩu sai, name/phone sai, Argon2 verify, hai first-admin song song chỉ một thành công, lỗi insert profile rollback account |
| SD-05 | HTTP login của 5 account để kiểm role thật và dùng access token trong bộ nhớ kiểm /admin/me cho hai scope; manual login từng vai trò ghi riêng pending đến khi thực hiện |
| SD-06 | Đủ 12 giá trị đúng Q34/Q36, id=1; chạy lại giữ nguyên config đã đổi hợp lệ; C3 đọc được, không thay missing-config behavior |
| Bổ sung | Lock timeout/release/rollback, lỗi DB không leak secrets; rerun không reset account/hash/wallet/lịch/config; CLI unknown command thoát lỗi trước kết nối |

Không chạy browser hay DB hiện tại chỉ để chuẩn bị plan. Không ghi SD-05 manual passed từ test HTTP.

## 9. Completion criteria

- [x] Q1–Q3 và plan được người dùng duyệt; đã IMPLEMENT.
- [x] Bốn script hoạt động đúng contract, transaction/rerun/concurrency có evidence.
- [ ] SD-01…SD-06 được mapping kết quả thật; SD-05 manual còn thiếu phải ghi rõ.
- [x] Lint/build/unit và MySQL/HTTP liên quan pass; xem tracker, SD-05 manual chưa thực hiện.
- [x] D8, tracker và AI log Trung được cập nhật trong phạm vi plan đã duyệt.
- [x] Không secret/dữ liệu thật, không thay đổi ngoài scope; review diff xong.

Gợi ý tiêu đề PR cho thành viên tự thực hiện sau này: `feat(db): thêm seed dữ liệu mẫu và tạo Admin đầu tiên` (issue #54). Review/merge là điều kiện đóng issue của nhóm, không phải thao tác của agent trong task này.

## Kết quả implementation ngày 29/10/2026

API unit1223/1223; C5 unit30/30 sau kiểm cuối; MySQL C5 16/16; HTTP login5/5. Build/lint/typecheck/format/diff pass. Chỉ DB/container test riêng33310. Không đổi schema/migration/auth/runtime API, không thêm dependency. SD-05 manual và review/merge còn pending; không đánh dấu issue hoàn tất. Evidence/đợt lỗi đầu và khắc phục ghi ở tracker.
