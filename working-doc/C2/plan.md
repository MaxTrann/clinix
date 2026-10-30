# C2 — AuditService tối thiểu dùng chung

Status: Done — VERIFIED local 30/10/2026; issue #94 còn chờ review/merge  
Mode: IMPLEMENT  
Owner: Trung  
Updated: 2026-10-30

## 1. Goal and scope

Tạo nền ghi nhật ký nhạy cảm cho các thao tác Admin theo Q39, cùng transaction với nghiệp vụ và không lưu bí mật. Người dùng đã tạo issue [C2 #94](https://github.com/MaxTrann/clinix/issues/94); ngày 30/10/2026 duyệt triển khai theo plan, gồm Q1/Q2. Đã xác nhận nhánh người dùng tạo feat/admin-c2; chỉ working-doc/C2/ untracked trước code.

In scope sau duyệt:

- `AuditModule`, `AuditService.record(manager, entry)`, repository chỉ dùng manager caller, kiểu entry và validator cho 11 hành động Admin ở PLAN 5.10.
- Validation runtime JSON, mapping action/target/branch, bigint, transaction, timestamp, bảo mật và unit/MySQL/probe HTTP phù hợp.
- Tài liệu cách consumer gọi, traceability và tracking; không đưa logic authorization của consumer vào audit service.

Out of scope:

- Controller/API/màn xem audit, lịch sử B6, phân trang/tìm kiếm audit.
- Triển khai nghiệp vụ B5/B13/B15/B18/B19/duyệt chi nhánh hoặc thêm audit vào consumer chưa tồn tại.
- Schema/entity migration mới, thay FK/CHECK/enum P3; không chuyển entity audit ra khỏi admin trong task này.
- Audit hệ thống/job không có người thực hiện; retry/outbox; auto-dedupe; backfill log cũ; retention/delete policy.
- Dữ liệu bệnh nhân thật, mail/cloud, cài dependency, commit/push/PR/merge/deploy.

Acceptance criteria:

1. C2-01: `record` chỉ chấp nhận manager có QueryRunner còn hoạt động trong transaction; default/global manager, runner đã release hoặc không có transaction bị từ chối trước insert. Không tự mở/commit/rollback transaction của caller.
2. C2-02: mỗi call hợp lệ insert đúng một dòng, actor/branch/action/target/result/payload đúng; không SELECT để suy permission thay caller. DB dùng ID thực dạng string, không mất chính xác qua Number.
3. C2-03: 11 action Admin theo mục 5.10 có schema tường minh; trường thừa/sai kiểu/null sai chỗ/action-target sai bị chặn trước SQL. Config có cùng tập khóa đã đổi, ít nhất một, giá trị cũ null từng tham số khi tạo lần đầu.
4. C2-04: audit và thay đổi thử nghiệm cùng commit hoặc cùng rollback; audit error, outer rollback và FK/CHECK error không để lại ghi một phần trong transaction caller đúng mẫu.
5. C2-05: không nhận/lưu bí mật có key nhạy cảm; kiểm mọi key nested và chuỗi có mẫu bí mật nhận diện được. Không log toàn input, SQL parameters hay lỗi chứa payload. Không lưu nội dung y tế hoặc toàn snapshot tài khoản.
6. C2-06: thời điểm do service tạo bằng `toSecond(nowVN())`, không nhận timestamp người dùng; test Date giả và biên giây/múi giờ DB hiện hữu.
7. C2-07: module consumer import được AuditModule/export AuditService, không phải tự cung cấp repository; không có route thật mới. Probe test dùng auth/C1 thật, actor từ phiên; actor giả trong request không trở thành người ghi.
8. C2-08: hai transaction song song có đúng actor/branch/payload riêng, không chia sẻ manager/state. Caller chịu trách nhiệm gọi một lần cho một thao tác; C2 không hứa idempotent hoặc exactly-once qua retries.
9. Không đánh dấu CH/BS/NS/TK/CN acceptance đã pass khi mới dùng probe cơ chế C2. Lint/build/unit và MySQL liên quan có evidence; không mutation DB dev/chia sẻ.

## 2. Evidence and context

Evidence khảo sát PLAN ngày 29/10/2026 (snapshot trước implementation):

- `docs/features/admin/PLAN.md:604–621`: matrix 11 hành động và atomicity, actor từ phiên; job không actor không ghi audit. `:663`: task C2; `TRACKING.md:102`: Q39 đã chốt, ưu tiên hơn đề xuất cũ Q39 ở PLAN.
- `PLAN.md` mục7.7: CH-01/CH-11; CH-14/15/18, BS-20/38, NS-24, TK-25, CN-99/100, PQ-15, SE-A15 là các điểm liên quan. Mã test là định danh chính, số dòng có thể dịch khi chỉnh tài liệu.
- `apps/api/src/admin/entities/nhat-ky-hanh-dong.entity.ts`: entity/index/CHECK đã có. `admin/entities/enums.ts`: enum đủ 11 action Admin và enum lịch sử khác; không có service/module audit trong source ngoài helper audit metadata route của C1 (không phải nhật ký nghiệp vụ).
- `apps/api/src/database/entities.ts`: NhatKyHanhDong đã đăng ký; migration P3 `1793090000000-tao-bang-van-hanh.ts` đã chứa bảng, enum, FK, index và CHECK.
- `docs/database/clinix_mysql.sql:555`: nhat_ky_hanh_dong; `:861/863`: FK actor→tai_khoan, branch→chi_nhanh. ma_doi_tuong không FK có chủ đích; không tự thêm FK/check tồn tại mục tiêu chung. DBML `:895` khớp contract audit.
- `common/time/time.ts`: nowVN()/toSecond() đã có, DATETIME chính xác giây. `common/logging/sanitize.ts`: isSensitiveKey()/redactText() có thể tái dùng cho phát hiện, nhưng redactor không chứng minh nhận diện được mọi bí mật văn bản tự do.
- `common/errors/app.exception.ts`: AppException dành lỗi HTTP 4xx/503, không nên bịa HTTP contract cho lỗi lập trình của internal AuditService.
- `docs/features/auth/TRACKING.md` mục5: dùng manager cùng transaction, registry DB/timezone/test helpers dùng chung. Caller HTTP dùng guard thật; actor lấy CurrentUser.accountId.
- Stack thực là NestJS/TypeORM/MySQL8.4; references workspace có Prisma/baseline cũ không thay thế source hiện hữu.
- Nhánh `main`, git status sạch lúc bắt đầu task C2; không tạo/switch branch hoặc chạy Git mutation. Task PLAN chỉ tạo hai artifact C2.
- GitHub REST: issue #47 và #52 CLOSED; không có issue C2 riêng trong danh sách đã khảo sát. GitHub CLI không có trong PATH/hai vị trí cài chuẩn đã kiểm. Plugin GitHub được tìm thấy nhưng xác nhận chưa cài/kết nối; hiện chưa có kênh xác thực để POST issue mà không đọc token.

UNKNOWN / chưa xác minh:

- Đã giải quyết ngày30/10: issue C2 #94 OPEN, do người dùng tạo; đã đọc body thật trước IMPLEMENT.
- Merge SHA phụ thuộc chưa xác minh riêng. Lượt PLAN không chạy DB; kết quả implementation tại tracker.
- Consumer B-task chưa có acceptance riêng; plan này không làm thay các tác vụ đó.

## 3. Questions, assumptions and decisions

### Contract Q1/Q2 đã được người dùng duyệt ngày30/10/2026

**Q1 — Biên service/transaction/lỗi**

Đề xuất `record(manager: EntityManager, entry: AuditEntry): Promise<void>`. Entry dùng định danh tiếng Anh ở service: `actorId`, `branchId`, `action`, `targetType`, `targetId`, `result`, `changes`; entity giữ tên tiếng Việt camelCase theo quy ước đã có. branchId phải ghi rõ null hoặc string, không dùng undefined để tự suy đoán. Actor không optional.

- Actor/target/branch dùng chuỗi thập phân dương, kiểm giới hạn signed BIGINT trước persist; không ép kiểu number. IDs ở payload như chi_nhanh_id cũng string/null, số đếm/tham số config là số JSON hữu hạn.
- `result` nhận ThanhCong/ThatBai đúng enum hiện hữu, caller phải truyền rõ. C2 không tự sinh audit ThatBai ngoài transaction để lưu lại sau rollback.
- Transaction/entry sai → internal error với mã cố định (đề xuất AUDIT_TRANSACTION_REQUIRED / AUDIT_ENTRY_INVALID / AUDIT_SENSITIVE_DATA / AUDIT_ACTION_UNSUPPORTED). DB insert lỗi → AUDIT_WRITE_FAILED an toàn, không kèm input/query/parameters trong message/public cause. Không tự thêm HTTP code mới; caller HTTP đi qua lỗi hệ thống hiện hữu.
- Không catch rồi tiếp tục commit tại consumer. C2 không tự rollback transaction người khác; atomicity phải được chứng minh bằng consumer mẫu await và để error thoát khỏi callback transaction.

**Q2 — C2 hỗ trợ schema nào và giới hạn bảo mật**

- C2 triển khai 11 action Admin trong mục5.10. Các enum lịch sử khác vẫn giữ nguyên ở DB/entity; chưa có payload contract thì service từ chối rõ, không chấp nhận JSON tùy ý. Mở rộng action schema sau bằng task riêng có contract.
- Mỗi action dùng whitelist đóng cho cả envelope và nested payload. Tái dùng isSensitiveKey cho key và so `redactText(value) !== value` để từ chối chuỗi có dạng token/hash/credential đã nhận diện; không sửa/redact âm thầm rồi lưu payload khác.
- Lý do từ chối/hủy/cấu hình là chuỗi không rỗng sau trim. Văn bản tự do có thể chứa bí mật không mang pattern (ví dụ sáu chữ số đơn lẻ): không hứa scanner phát hiện tất cả; caller chỉ xây payload bằng trường được cho phép, không copy body/entity/error vào changes. Không thu thập env secret thật để làm mẫu so khớp audit.
- Không tự thêm cận trên nghiệp vụ cho config/số đếm trong C2; B5/caller validate miền và luật chuyển trạng thái. C2 kiểm type/shape, số đếm nguyên không âm, mapping action và các invariant định nghĩa ở matrix.
- JSON chỉ chấp nhận object thuần/array đúng schema, không cycle/Date object/undefined/bigint JS/function/getter/prototype lạ; timestamp trong changes là chuỗi ISO có timezone do caller tạo. Field thừa bị từ chối, không strip silently.

### Assumptions nhỏ

- TASK_ID C2 theo người dùng. Chỉ plan.md/tracker.md được tạo trong PLAN; nội dung issue nháp nằm ngay trong plan, không thêm issue.md.
- Module dùng chung ở src/audit; giữ entity P3 tại admin/entities để tránh refactor ownership ngoài scope. Có thể import type/constant có sẵn, không sao chép enum.
- Không đổi schema/ADR/dependency; nếu phát hiện cần DDL, dừng để chốt lại scope, không sửa migration đã áp dụng.
- Nội dung issue giữ yêu cầu đã chốt ở PLAN; các chi tiết Q1/Q2 chờ duyệt trong task plan này. Tạo issue không đồng nghĩa duyệt implementation.

## 4. Core-feature impact

- Không thay API/permission hay nghiệp vụ hiện tại; cung cấp audit sink để consumer sau sử dụng.
- Ảnh hưởng trực tiếp tính toàn vẹn khi caller bắt đầu ghi: ghi nghiệp vụ và audit phải cùng transaction; không fire-and-forget, không queue hoặc transaction thứ hai.
- Authorization và đọc branch của mục tiêu vẫn tại caller dưới khóa phù hợp; audit service không tin body và không thay BranchAccessPolicy. Actor là giá trị từ CurrentUser được truyền bởi code server, C2 không thể tự xác minh nguồn phiên chỉ từ một string.
- Không audit job không actor vì tai_khoan_id NOT NULL và PLAN5.10 nói rõ không ghi; không tạo tài khoản hệ thống giả.
- Backward compatibility: không đổi dữ liệu cũ, default hoặc schema. Không sửa code các consumer chưa tồn tại.

## 5. Proposed approach

### Module/service/repository

- AuditModule cung cấp/export AuditService; repository nhận manager trên từng lời gọi, không inject mặc định manager để fallback. Service validate trước query; gọi repository insert đúng entity một lần.
- Không Global module hoặc controller mới; consumer import AuditModule. Kiểm DI/module bằng Nest test; chỉ import AppModule nếu probe test cần app thật.
- Dùng `toSecond(nowVN())` ở service. Caller không truyền thoiDiem, ID log tự sinh; result không mặc định. Không giữ mutable actor/manager trên singleton service.
- Không tự dedupe: DB không có khóa idempotency. Mỗi caller phải gọi đúng một lần; retry transaction có rollback không để lại audit cũ, còn retry sau commit là hành vi khác cần contract riêng.

### Mapping payload (theo PLAN5.10, không thêm dữ liệu cá nhân)

| Action | Target / branch | Payload |
|---|---|---|
| TaoTaiKhoanNhanSu | tai_khoan / branch nhân sự, null khi ToanHeThong | loai_tai_khoan, chi_nhanh_id, pham_vi?; chỉ role nhân sự, scope chỉ cho QuanTriVien; kiểm branch khớp envelope |
| KhoaTaiKhoan / MoKhoaTaiKhoan | tai_khoan / branch bác sĩ-lễ tân hoặc null với bệnh nhân/admin | truoc:{trang_thai}, sau:{trang_thai}, phien_thu_hoi; số phiên nguyên không âm; luật ai được khóa ai do caller |
| MoKhoaNoShow | benh_nhan / null | truoc:{khoa_dat_lich_do_no_show:true}, sau:{khoa_dat_lich_do_no_show:false}, so_lan_no_show nguyên không âm |
| DoiChiNhanhBacSi | tai_khoan / branch mới | truoc:{chi_nhanh_id}, sau:{chi_nhanh_id}; ID mới khớp branchId, before/after khác nhau |
| DuyetThayDoiChiNhanh | yeu_cau_thay_doi_chi_nhanh / branch yêu cầu | hieu_luc_tu, so_ngay_bao_truoc, nguoi_de_xuat_id, so_lich_hen_anh_huong, so_ca_anh_huong |
| TuChoiThayDoiChiNhanh | như trên | ly_do_tu_choi, nguoi_de_xuat_id |
| RutThayDoiChiNhanh | như trên | nguoi_de_xuat_id |
| HuyThayDoiChiNhanh | như trên | ly_do_huy, hieu_luc_tu, qua_han:boolean, so_benh_nhan_da_bao |
| DoiHieuLucThayDoiChiNhanh | như trên | truoc:{hieu_luc_tu}, sau:{hieu_luc_tu}, so_lan_doi_hieu_luc, so_benh_nhan_thong_bao_lai |
| CapNhatCauHinh | cau_hinh_he_thong / targetId='1', branchId=null | truoc/sau là hai object cùng tập tên cột config được phép và khác nhau, ít nhất 1; ly_do không rỗng; old value null từng tham số khi tạo lần đầu |

- Config whitelist từ 12 cột tham số hiện hữu, không gồm id; reminders array số nguyên dương theo kiểu tham số, weights số JSON, các tham số khác số hữu hạn đúng kiểu. Không serialize decimal entity string thành log string trái CH-18; caller chuyển giá trị đúng kiểu trước khi gọi.
- Không query mục tiêu chung theo ma_doi_tuong: schema cố ý không FK để giữ lịch sử khi tài nguyên bị xóa/ẩn. Actor/branch có FK thật; validation và authorization sự liên quan của chúng tại caller.
- Không có sửa/xóa audit API hoặc cơ chế lưu audit khi transaction thất bại bằng transaction khác.

### Data/security/recovery

- Giữ schema/migration/entity/enum/index/FK đã có; chỉ read source trong PLAN, chưa kết nối DB.
- Không log entry kể cả validation lỗi. Error chỉ có mã cố định; DB error không mang nguyên SQL/parameters vào logger. Không lưu bệnh án, tên/email/SĐT, mật khẩu/hash/token/OTP.
- Nếu validation/audit ghi lỗi trong callback transaction tiêu chuẩn thì rollback nghiệp vụ. Sau lỗi commit mạng chưa rõ trạng thái, không tự retry để hứa exactly-once; dùng quy tắc kiểm chứng của thao tác gốc.
- Module độc lập không thay consumer trước khi có scope; nếu module chưa được consumer import, đó không phải đã tích hợp các B-task.

## 6. Work breakdown

| ID | Task | Output/evidence | Depends on | Parallel with |
|---|---|---|---|---|
| T1 | Khảo sát source/schema/Q39 và soạn issue | Body cuối plan + evidence hiện hữu | — | — |
| T2 | Tạo issue GitHub và reread xác nhận | URL/number/body/label/milestone thật, không dự đoán | T1 + kết nối GitHub | — |
| T3 | Duyệt Q1/Q2 và plan | Xác nhận người dùng trước code | T1 | — |
| T4 | Types/validator bảo mật và unit | C2-01/03/05/06 | T3 | — |
| T5 | Service/repository/module | record cùng manager caller, DI/unit C2-02/07 | T4 | — |
| T6 | MySQL và auth probe | C2-04/07/08; rollback và actor thật | T5 | — |
| T7 | Review/check/docs/tracker | Kết quả thật và acceptance consumer còn pending | T6 | — |

Không dùng subagent, không thêm release/deploy phase. T2 chỉ thiếu access, không phải thiếu user authorization; người dùng đã yêu cầu tạo issue rõ ràng.

## 7. Expected file/module impact

- Create khi IMPLEMENT: `apps/api/src/audit/{audit.module.ts,audit.service.ts,audit.repository.ts,audit-entry.ts,audit-validation.ts}` và unit/MySQL spec cạnh mã. Tên chia file có thể tinh chỉnh nhỏ trong scope.
- Có thể tạo `apps/api/test/audit.e2e-spec.ts` chỉ chứa probe test import module/auth thật, không route runtime mới.
- Modify trong IMPLEMENT: Admin PLAN/TRACKING, hai artifact C2 và log Trung nếu được ghi theo quyền đã có/yêu cầu riêng; không ghi vào AI_USAGE_LOG.md. PLAN lượt này chưa sửa AI log.
- Không sửa source auth, frontend, C5, SQL/DBML/quy tắc/migration, package/lock/env/compose/CI trong scope hiện tại.
- Không sửa Admin PLAN/TRACKING ở PLAN trừ khi người dùng yêu cầu riêng; issue online là thao tác được người dùng yêu cầu rõ, không phải commit/PR.

## 8. Verification

Chưa chạy build/test/DB trong PLAN. Commands đã có manifest tại apps/api:

- `npm run lint`, `npm run build`, `npm test -- src/audit` khi đã có module; API unit toàn bộ một lần trước bàn giao nếu khả dụng.
- `npm run test:int -- src/audit` trên MySQL8.4 disposable *_test riêng, không DB dev/chia sẻ; helper test có reset/drop chỉ dùng môi trường mẫu được phép.
- `npm run test:e2e -- test/audit.e2e-spec.ts` nếu tạo probe; configureApp, guard thật, MailService mock, không email thật.
- Typecheck/format theo binary/config sẵn có, diff check; không cài tool mới chỉ để PLAN.

| ID kiểm cơ chế mới | Nội dung / mapping |
|---|---|
| C2-01 | Manager không transaction/released bị chặn; không mở transaction con |
| C2-02 | Insert một dòng, đủ action/target/result/actor/branch; ID >2^53 không bị làm tròn; mapping đủ 11 action |
| C2-03 | Payload tốt/xấu mỗi action, field thừa/nested sai; CapNhatCauHinh old null từng field, keys mismatch/no-change/rỗng; mapping phần cơ chế CH-01/11/18 |
| C2-04 | Commit chung, outer rollback, FK/CHECK failure thật và audit error rollback nghiệp vụ thử; kiểm CHECK tầng thấp như CH-15; chưa phải B5/BS38 acceptance |
| C2-05 | Key camel/snake/case nhạy cảm, token/hash pattern trong lý do, cycle/nonJSON/type lạ bị từ chối; không in raw entry; cơ chế SE-A15 |
| C2-06 | Thời điểm VN và cắt milliseconds, không mutate Date; biên 23:59/00:00 khi đọc DATETIME |
| C2-07 | DI import/export; probe HTTP lấy actor từ token/CurrentUser, actor request không ghi được; phần cơ chế PQ-15 |
| C2-08 | Hai transaction/actor/branch chạy đồng thời, không dùng chung manager/state; hai lần gọi có hai dòng có chủ đích, không tuyên bố auto-dedupe |

Legacy UC codes CH/BS/NS/TK/CN vẫn cần acceptance tại endpoint tương ứng; C2 tests không được gán passed thay các UC đó. Không cần UI/browser vì task không có màn hình mới.

## 9. Completion criteria

- [x] Issue C2 #94 đã được người dùng tạo và đọc lại xác nhận.
- [x] Người dùng duyệt plan và Q1/Q2 ngày 30/10/2026.
- [x] Module/validator/transaction/security có evidence thật C2-01…08; unit77/77, MySQL11/11, HTTP8/8.
- [x] Build/lint/typecheck/format/diff và Gitleaks scoped pass; API unit1300/1300. Chỉ DB test riêng, không dữ liệu thật.
- [x] Admin PLAN/TRACKING, tracker C2, TRUNG_AI_USAGE_LOG dòng28 và DEBT42 được cập nhật; consumer acceptance vẫn riêng.

Issue close theo quy trình nhóm còn cần người còn lại review/squash merge; agent không tự thực hiện. Gợi ý PR: `feat(audit): thêm dịch vụ ghi nhật ký dùng chung`.

## Nội dung issue C2 đã chuẩn bị để tạo

**Trạng thái:** Người dùng đã tạo [issue #94](https://github.com/MaxTrann/clinix/issues/94), OPEN; body đã đọc qua GitHub REST ngày 30/10/2026. Phần nháp bên dưới giữ để truy vết, hợp đồng hiện tại là body issue #94 và plan đã duyệt.

**Title:** `[admin] C2 · AuditService tối thiểu: ghi nhật ký cùng giao dịch`  
**Labels dự kiến:** backend, prerequisite, module:admin (đã xác minh tồn tại).  
**Milestone dự kiến:** catalog (#2, đã xác minh tồn tại). Không tự assign hoặc mention thành viên khác.

Body chính xác dự kiến:

```markdown
## Mô tả
Bổ sung **C2 — AuditService tối thiểu** theo quyết định Q39 và `docs/features/admin/PLAN.md` mục 5.10, task C2 mục 6.3.

- Module dùng chung `apps/api/src/audit/`, export `AuditService.record(manager, entry)`.
- Chỉ ghi bằng EntityManager trong transaction của người gọi; không tự mở/commit transaction; lỗi audit phải làm caller rollback thao tác.
- Kiểm cấu trúc `chi_tiet_thay_doi` và mapping action/đối tượng/chi nhánh cho 11 hành động Admin ở mục 5.10; giữ bigint dạng chuỗi và timestamp đúng helper VN.
- Người thực hiện lấy từ phiên ở caller; không lấy actor từ body. C2 không có controller/màn xem.
- Từ chối khóa chứa mật khẩu/token/băm/OTP và payload ngoài schema; không log đầu vào, SQL parameters hay dữ liệu sức khỏe. Cấu hình lần đầu dùng `truoc` có giá trị null cho từng tham số, không phải `truoc=null` cả object.
- Dùng entity/bảng/enum/CHECK hiện có từ P3; không tạo migration mới nếu không phát hiện chênh lệch có bằng chứng.
- Không triển khai B5/B6/B13/B15/B18/B19/B10/B21/B22 trong issue này. Những consumer đó vẫn cần acceptance riêng.

## Phụ thuộc
- #47 — P3: bảng/enum/CHECK audit (đã CLOSED; source hiện hữu).
- Caller có HTTP dùng auth A4 và C1 #52 để xác thực/kiểm phạm vi; phần service C2 không cần controller mới.

## Kiểm chứng
- Unit: schema 11 hành động; ID bigint; dữ liệu cấu hình null lần đầu; payload sai/khóa nhạy cảm; transaction manager bắt buộc; không log bí mật.
- MySQL thật: 1 dòng cho 1 lần gọi; audit và thay đổi nghiệp vụ cùng commit/rollback; lỗi FK/CHECK audit rollback thay đổi; outer rollback xóa cả audit; hai transaction độc lập không trộn actor/branch; thời điểm chính xác đến giây.
- Probe HTTP chỉ trong test với auth/guard thật: actor lấy từ phiên, không từ body (PQ-15). Không công bố probe trong app thật.
- Truy vết: CH-01/11/14/15/18; BS-20/38; NS-24; TK-25; CN-99/100; PQ-15; SE-A15. C2 chỉ chứng minh cơ chế dùng chung, không đánh dấu UC chưa có là passed.
- Các test cơ chế C2-01…C2-08 được mô tả ở `working-doc/C2/plan.md`; đây là mã bổ sung riêng C2, không thay mã UC của PLAN Admin.

## Đồng bộ
`docs/features/admin/PLAN.md`, `TRACKING.md`, `working-doc/C2/{plan,tracker}.md`; log của Trung tại `TRUNG_AI_USAGE_LOG.md` theo yêu cầu của người dùng. Không đổi schema ba file khi DDL không thay đổi.

## Đóng khi
- [ ] Plan/contract kỹ thuật được người dùng duyệt trước triển khai.
- [ ] Module và test cơ chế C2 hoàn tất; lint/build/test liên quan có kết quả thật.
- [ ] Tracking ghi rõ phần C2 đã kiểm và acceptance consumer còn thiếu.
- [ ] Không có secret/PII/debug log, endpoint audit hoặc thay đổi ngoài scope.
- [ ] Thành viên tự commit/PR, người còn lại review và squash merge theo quy trình nhóm. Gợi ý tiêu đề: `feat(audit): thêm dịch vụ ghi nhật ký dùng chung`.
```

## Kết quả IMPLEMENT — 30/10/2026

- Nhánh người dùng tạo `feat/admin-c2`, trước sửa source chỉ có working-doc/C2 untracked. Không Git mutation/commit/push/PR/merge.
- AuditModule export AuditService; 11 action union/whitelist; safe JSON snapshot, ID string, transaction manager caller; timestamp VN đến giây; lỗi fixed code không raw cause. Không AppModule/controller/schema/migration/auth/frontend/dependency thay đổi.
- Unit riêng77/77; toàn API1300/1300 (73 file); MySQL cuối11/11; HTTP/auth/C1 probe8/8. Build/lint/typecheck/format/diff và Gitleaks scope C2 pass.
- Regression role-array: test đỏ trước khi sửa typeof string (AI-BUG-016). Setup fixture bigint ban đầu FK fail; probe xác nhận TypeORM generatedMap nối thêm0 khi insertId là string. C2 không dùng generatedMap, fixture insert ID chỉ định/đọc lại DB; nợ ngoài scope ghi TECH_DEBT42, không sửa thư viện hoặc auth.
- Chỉ MySQL8.4 container mới cổng33311, DB *_test riêng; test credentials sinh ngẫu nhiên trong bộ nhớ, user dọn sau run; container đã dừng. Không DB dev3306, không full MySQL/e2e/CI/browser.
- Probe không thay acceptance các B-task; consumer phải import AuditModule và gọi cùng manager, lấy actor từ phiên. Issue94 còn OPEN, review/merge của nhóm chưa thực hiện.
