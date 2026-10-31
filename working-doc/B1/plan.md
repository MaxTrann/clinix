# B1 — Quản lý chuyên khoa (backend)

Status: Done — backend local verified; UI/D2/PR chưa nghiệm thu  
Mode: IMPLEMENT  
Owner: Trung  
Updated: 2026-10-30

## 1. Goal and scope

- Chuẩn bị triển khai issue [#55](https://github.com/MaxTrann/clinix/issues/55) trên nhánh hiện có `feat/admin-b1`.
- Backend: danh sách/chi tiết, tạo, sửa và đặt trạng thái chuyên khoa; tìm kiếm/phân trang; dropdown đang hoạt động; tích hợp ảnh P7.
- Toàn hệ thống được ghi; Admin Chi nhánh chỉ đọc danh mục dùng chung (Q11). Không thêm CRUD xoá chuyên khoa.
- Ngoài scope: UI F2, tra cứu công khai/search, gán bác sĩ B13/B15, thay đổi schema/migration/vendor/dependency, gửi mail hoặc Cloudinary thật, dữ liệu dev/chia sẻ, commit/push/PR/merge.
- Lượt chuẩn bị chỉ tạo hai artifact; người dùng yêu cầu bám Admin PLAN và bắt đầu ngày 30/10/2026. Đã triển khai backend, cập nhật contract/tracking và kiểm local.

### Acceptance criteria

1. CK-01/02/12: tạo hợp lệ mặc định `DangHoatDong`; tên chuẩn hoá trim/gộp khoảng trắng, dài 1–100; mô tả tuỳ chọn, giới hạn 5.000 ký tự theo mục 3.
2. CK-03/04/05/06/10: so trùng theo `utf8mb4_unicode_ci`, loại chính bản ghi khi sửa; UNIQUE thật chống chạy đua; lỗi 409 `TEN_CHUYEN_KHOA_TRUNG`, không 500 và không lưu một phần.
3. CK-07/08/09: đặt trạng thái tường minh, lặp idempotent; không gỡ hoặc đổi bất kỳ bác sĩ nào đang gán.
4. CK-13 và PQ: GET cho hai scope Admin; mọi mutation chỉ Toàn hệ thống; 401/403/404 theo auth/C1 hiện có, không dùng guard giả.
5. CK-16/17: dropdown chỉ đang hoạt động; list có `soBacSi`, lọc trạng thái, q theo tên/mô tả, phân trang và total đúng; thứ tự ổn định, LIKE có escape.
6. CK-14 và phần tích hợp CK-11: cập nhật chuyên khoa/gắn ảnh dùng cùng giao dịch; lỗi rollback toàn bộ. Bỏ imageUploadId khi sửa = giữ, null = gỡ, UUID = gắn/thay; không nhận URL/public_id từ client.
7. Có unit, MySQL thật cho constraint/transaction/concurrency và HTTP dùng auth thật; lint/build pass hoặc ghi rõ blocker. Không ghi pass cho UI/manual/CI chưa chạy.

## 2. Evidence and context

### VERIFIED qua đọc ngày 30/10/2026

- Git branch `feat/admin-b1`; chỉ `TRUNG_AI_USAGE_LOG.md` dirty có sẵn. Không sửa file đó trong PLAN.
- GitHub REST: #55 OPEN; #45/P1, #50/P6, #51/P7, #52/C1 CLOSED. Commit dependency trong lịch sử HEAD: P1 `9464aee`, P6 `1b4fd52`, P7 `b3162b0`, C1 `6916371`. Tracker cũ ghi chưa merge không thay cho trạng thái hiện tại.
- Hợp đồng task: Admin PLAN dòng B1 tại `docs/features/admin/PLAN.md:707`; test CK tại `:789`; endpoint mục 5.3 tại `:444` vẫn ghi đề xuất. TRACKING Q11/Q12/Q13/Q19/Q42 là quyết định hiện hành.
- Entity `apps/api/src/admin/entities/chuyen-khoa.entity.ts:6`: bigint ID dạng string, tên varchar(100), mô tả nullable text, trạng thái enum, UNIQUE tên và ảnh/FK hiện có.
- SQL chuẩn `docs/database/clinix_mysql.sql:216`, `:574`, `:1269`: collation unicode_ci, UNIQUE tên, FK ảnh. Không cần migration mới cho scope B1.
- P6: `apps/api/src/common/paging/page-query.dto.ts:9` (page=1/pageSize=20/max100), `like-pattern.ts:8` (escape `!`, `%`, `_`), kiểu `paged.ts` đã có.
- C1 mẫu controller thật: `apps/api/src/rbac/admin-me.controller.ts:10`; consumer import RbacModule, dùng Roles + RequireAdminScope, scope truyền vào service.
- P7 `apps/api/src/common/upload/upload.repository.ts:66`: assignSpecialty nhận EntityManager transaction, khoá chuyên khoa và ảnh, kiểm chủ upload/mục đích/hạn/xác nhận/trạng thái; gỡ URL legacy khi chủ động thay/gỡ.
- `apps/api/src/common/upload/upload.module.ts` export UploadRepository/UploadService; cleanup scheduler hiện hữu xử lý ảnh ChoXoa. Không viết lại upload/cleanup trong B1.
- `apps/api/src/app.setup.ts:12`: configureApp dùng ValidationPipe từ chối trường lạ và filter lỗi chung. Auth handoff TRACKING mục 5: global JWT/Roles guard thật, dùng AppException và expectErrorResponse.
- Đã đọc hướng dẫn workspace, AGENTS repo, project-start-task và clinix-admin-workflow; Matrix B, convention, CONTRIBUTING, Phase 0 và schema liên quan. Source NestJS/TypeORM và contract repo đang chạy là evidence; không chuyển sang Prisma hay envelope trong tài liệu workspace cũ.

### UNKNOWN / lệch tài liệu

- Issue #55 vẫn ghi dependency P7 theo Docker volume; Q13/P7 hiện hành đã chuyển Cloudinary. Chỉ ghi nhận, không sửa issue từ lượt PLAN.
- CK-12 và contract B1 đã được cụ thể hóa trong đề xuất trước khi người dùng yêu cầu bắt đầu; contract triển khai được đồng bộ tại Admin PLAN mục 5.3.
- VERIFIED: MySQL8.4 container mới riêng33312, B1 MySQL14/14; HTTP B1+C1 21/21; unit B1 21/21 và API1517/1517. Chưa kiểm CI/full integration/full HTTP hoặc UI F2.
- D2: 2.4 phải phản ánh Chi nhánh chỉ xem. Chưa đối chiếu/sửa bản Word; thành viên phụ trách xác nhận đồng bộ, không coi hoàn tất.

## 3. Questions, assumptions and decisions

### Đã duyệt triển khai trong chat ngày 30/10/2026

1. Dùng contract dưới đây, giữ kiểu trường tiếng Việt camelCase phù hợp entity/consumer repo; không thêm success envelope.
2. Mô tả tối đa **5.000 ký tự**, q tối đa **200 ký tự**. Người dùng yêu cầu bắt đầu sau khi nhận ba đề xuất; giữ các giới hạn này trong scope B1.
3. `soBacSi` đếm mọi hồ sơ bác sĩ đang gán chuyên khoa trong toàn hệ thống, không lọc trạng thái tài khoản; cả hai scope xem cùng số đếm vì đây là danh mục chung. Không trả thông tin bác sĩ cá nhân. Nếu cần đếm riêng chi nhánh thì phải sửa contract/test trước code.

### Contract triển khai

Đường dẫn Nest bên dưới đi qua proxy `/api` hiện có; ID bigint là chuỗi số dương, không chuyển Number.

| Method/path | Input | Success | Scope |
|---|---|---|---|
| GET /admin/specialties | page, pageSize, q?, trangThaiHoatDong? | 200 `{items,total,page,pageSize}` | Any |
| GET /admin/specialties/:id | id | 200 Specialty | Any |
| POST /admin/specialties | `{ten, moTa?, imageUploadId?}` | 201 Specialty | ToanHeThong |
| PATCH /admin/specialties/:id | một hoặc nhiều trường `{ten?, moTa?, imageUploadId?}` | 200 Specialty | ToanHeThong |
| PATCH /admin/specialties/:id/status | `{trangThaiHoatDong}` | 200 Specialty | ToanHeThong |
| GET /admin/options/specialties | page, pageSize, q? | 200 `{items:[{chuyenKhoaId,ten}],total,page,pageSize}` | Any |

- Specialty: `{chuyenKhoaId, ten, moTa, anhDaiDien, trangThaiHoatDong, soBacSi}`. `anhDaiDien` lấy secure_url JOIN ảnh mới, fallback URL legacy nếu chưa chuyển; không lộ public_id hoặc metadata ledger.
- List mặc định tất cả trạng thái; q tìm tên/mô tả, trim; q rỗng như không có; literal `%`, `_`, `!` được escape. Sắp `ten ASC, chuyen_khoa_id ASC`. Dropdown luôn lọc DangHoatDong và có phân trang để không cắt dữ liệu âm thầm.
- Tên chuẩn hoá trước kiểm độ dài/lưu; không đổi dấu/hoa thường của tên hiển thị. `ten:null` không hợp lệ. Mô tả plain text, bỏ trường khi PATCH = giữ, null/chuỗi rỗng = xoá về null, không gộp khoảng trắng nội dung. Body PATCH rỗng/trường lạ hoặc gửi trạng thái qua PATCH nội dung bị từ chối 400.
- POST không nhận trạng thái; mặc định hoạt động. Status chỉ nhận enum DangHoatDong/NgungHoatDong, không dùng toggle mù.
- Bỏ/null imageUploadId khi tạo = không ảnh; khi sửa dùng quy ước P7. UUID sai/không hợp lệ dùng lỗi DTO/P7 hiện có. Không nhận anhDaiDien URL từ client.
- Lỗi: 400 DU_LIEU_KHONG_HOP_LE kèm loi theo trường; 400 ANH_TAI_LEN_KHONG_HOP_LE từ P7; 401 auth; 403 KHONG_DU_QUYEN; 404 KHONG_TIM_THAY; 409 TEN_CHUYEN_KHOA_TRUNG. Đối chiếu registry khi code, không mở framework lỗi mới.

### Assumptions triển khai nhỏ

- TASK_ID B1 lấy trực tiếp từ yêu cầu; giữ checkout hiện có, không tạo/chuyển nhánh.
- Không thêm audit CRUD chuyên khoa: PLAN 5.10/schema hiện tại không định nghĩa hành động này; không tự mở rộng enum.
- Để cleanup scheduler P7 xoá ảnh ChoXoa sau commit; không gọi provider trong giao dịch lưu chuyên khoa. Không hứa CDN xoá tức thì.

## 4. Core-feature impact

- Ảnh hưởng danh mục nền cho chọn chuyên khoa bác sĩ và UI F2, không sửa quy trình khám/đặt lịch hay hồ sơ bệnh nhân.
- Ngừng chuyên khoa giữ nguyên quan hệ bác sĩ; consumer gán mới dùng dropdown hoạt động (Q19); lọc public search thuộc module sau.
- Tận dụng schema hiện có; rollback lỗi lưu bằng transaction. Không sửa dữ liệu cũ/seed. Rollback code không yêu cầu DDL down.

## 5. Proposed approach

1. DTO/types tại admin/specialties: kế thừa PageQueryDto, enum/UUID/ID/giới hạn, response allowlist. Không cài dependency.
2. Repository: tìm tên bằng collation DB, exclude ID khi sửa, LIKE parameterized, count bác sĩ không gây nhân bản dòng/total, stable sort và paging; khoá dòng khi mutation.
3. Service sở hữu transaction; kiểm scope Toàn hệ thống cho ghi ở service lẫn route; precheck trùng rồi bắt đúng UNIQUE tên khi race. Không biến mọi lỗi DB thành lỗi trùng.
4. Tạo/sửa chuyên khoa + UploadRepository.assignSpecialty trong cùng manager; nhận accountId từ CurrentUser, không client. Đọc response từ cùng transaction. Gỡ/thay ảnh để scheduler xử lý sau commit; lỗi ảnh hoặc DB rollback cả tên/mô tả/FK/trạng thái ledger.
5. Controller mỏng, Roles QuanTriVien + RequireAdminScope Any/ToanHeThong; đăng ký module vào AppModule, dùng guard auth hiện hữu và route metadata audit C1.
6. Không đổi frontend, auth shared implementation, schema hoặc cấu hình tích hợp. Ghi evidence và handoff F2/D2 sau implementation.

## 6. Work breakdown

| ID | Task | Output/evidence | Depends on |
|---|---|---|---|
| T1 | Đọc issue, dependency, source và soạn plan | Hai artifact B1, evidence hiện tại | — |
| T2 | Duyệt contract/giới hạn/số bác sĩ | Xác nhận người dùng; cập nhật plan | T1 |
| T3 | DTO/repository/service + ảnh transaction | Unit CK-02/12, logic và lỗi nghiệp vụ | T2 |
| T4 | Controller/module/options + quyền thật | Endpoint, scope và route metadata đúng | T3 |
| T5 | MySQL và HTTP regression | CK-01–10/12–14/16/17, ảnh tích hợp và ma trận quyền | T4 |
| T6 | Lint/build/test, review và handoff | Kết quả thật, TRACKING, nhắc D2/log | T5 |

## 7. Expected file/module impact

- Tạo `apps/api/src/admin/specialties/`: module/controller/service/repository, DTO/types và test cạnh source theo convention.
- Thêm kiểm HTTP tại `apps/api/test/` cho chuyên khoa; tái dùng admin fixture/auth token/error assertions đã có.
- Sửa `apps/api/src/app.module.ts`; `docs/features/admin/TRACKING.md` khi IMPLEMENT. Chỉ cập nhật phần PLAN stale cần thiết nếu được phép ngoài mode PLAN.
- Giữ nguyên TRUNG_AI_USAGE_LOG.md đang dirty; nhật ký AI chỉ sửa khi người dùng đồng ý theo AGENTS. Cuối implementation soạn nội dung phù hợp nơi ghi log của Trung.
- Không chạm apps/web, schema/migration, .env, package/lock, shared auth hoặc source công việc khác.

## 8. Verification

- Unit: CK-02/12, normalize, input null/unknown/empty patch, response, scope denial và mapping lỗi UNIQUE đúng constraint; mỗi test mang mã truy vết.
- MySQL thật: CK-01/03–10/14/16/17; case-only/khác dấu/khoảng trắng; rollback; đếm bác sĩ 0/nhiều; tìm mô tả, escape wildcard; total/page quá cuối; race create/update, image assignment versus cleanup.
- Tích hợp ảnh: giữ/gỡ/thay, upload sai chủ/hết hạn/chưa xác nhận/đã dùng, URL legacy, race hai chuyên khoa dùng một upload, rollback khi ghi ảnh hoặc chuyên khoa lỗi; provider fake, không gọi Cloudinary thật.
- HTTP: configureApp + AuthModule/guard thật; TH/CN, patient/doctor/receptionist, chưa đăng nhập/phiên thu hồi, 400/404/409; CN được đọc tất cả chuyên khoa nhưng không ghi; metadata audit C1 nhận route mới.
- Lệnh đã tìm thấy trong apps/api/package.json/CI: `npm run lint`, `npm run build`, `npm test`, `npm run test:int`, `npm run test:e2e`. Chạy focused trước, unit API toàn bộ sau tích hợp, không ghi pass suite chưa chạy.
- Test DB: global-setup có reset DB. Chỉ chạy integration/e2e khi xác minh TEST_DB_* trỏ MySQL/container mới riêng cho B1, dùng giá trị giả; không reset DB hiện có/dev/chia sẻ. Chưa khởi động hay đổi DB trong PLAN.
- Review diff/whitespace, đảm bảo thay đổi đầu phiên được giữ; không test UI/browser hoặc tuyên bố CI/review/merge hoàn tất.

## 9. Completion criteria

- [x] Người dùng yêu cầu bắt đầu sau đề xuất contract/giới hạn/số bác sĩ; bám Admin PLAN.
- [x] Các AC và coverage backend B1 chạy đạt; phạm vi chưa nghiệm thu ghi trong tracker.
- [x] Quan hệ bác sĩ, quyền và vòng đời ảnh có evidence rollback/concurrency.
- [x] Tracker/Admin PLAN/TRACKING cập nhật; D2 Word và UI F2 bàn giao riêng.
- [ ] Thành viên review và tự thực hiện Git theo AGENTS; local completion không đồng nghĩa issue đóng.
