# B2 — Quản lý nhóm dịch vụ (backend)

Status: Done — backend local verified; F3/D2/CI/review/merge riêng
Mode: IMPLEMENT  
Owner: Trung  
Updated: 2026-10-31

## 1. Goal and scope

- Triển khai issue #56 theo Admin PLAN mục 6.4/B2, Q11/Q14/Q15/Q42 và DV-01…06, DV-16 phần nhóm dịch vụ.
- In scope: list/create/update/delete nhóm; validation, tên không trùng, thứ tự, phân quyền thật C1, transaction và xử lý UNIQUE/FK khi chạy đua.
- Out of scope: dịch vụ khám B3, frontend F3, bật/tắt, schema/migration, seed, audit action mới, dependency, dữ liệu dev/chia sẻ, Git publication.
- Acceptance: Admin hai phạm vi đọc danh mục chung; chỉ Toàn hệ thống ghi. Tên hợp lệ/không trùng theo collation DB; thứ tự nguyên không âm; chỉ xóa nhóm rỗng; không trả 500 cho UNIQUE/FK đã lường trước. Không lưu một phần khi lỗi.
- D2 Word: Chi nhánh chỉ xem, chỉ xóa nhóm rỗng, thứ tự nguyên không âm, không bật/tắt; thành viên đồng bộ tài liệu gốc, không coi test backend là đã hoàn tất D2.

## 2. Evidence and context

- VERIFIED: checkout `feat/admin-b2`, git status sạch khi bắt đầu 31/10; không thay đổi Git.
- VERIFIED: GitHub REST issue #56 OPEN, đọc nội dung/phụ thuộc/test/điều kiện đóng ngày 31/10. Dependency P1/P6/C1 có trong lịch sử checkout; C1 qua #92, P6 qua #82. B1 hiện ở commit 4fab403 (#99).
- VERIFIED khi khảo sát: `docs/features/admin/PLAN.md:451` có GET/POST /admin/service-groups và PATCH/DELETE /admin/service-groups/:id; GET Any, ghi Toàn hệ thống. Payload/response lúc đó chưa chốt; sau đó người dùng duyệt mục 3, đã đồng bộ contract vào Admin PLAN5.3.
- VERIFIED: `apps/api/src/admin/entities/nhom-dich-vu.entity.ts:6`, `docs/database/clinix_mysql.sql:224`: bigint ID, ten varchar(100) UNIQUE, thu_tu_hien_thi signed int default 0, collation utf8mb4_unicode_ci. SQL :742 có FK dich_vu_kham.nhom_dich_vu_id tới nhóm. Không cần migration cho B2.
- VERIFIED: B1 có mẫu controller/service/repository/module tại `apps/api/src/admin/specialties/`; C1 dùng Roles + RequireAdminScope và BranchAccessPolicy; auth guard toàn cục thật. P6 cung cấp PageQueryDto/Paged/escapeLikePattern.
- Đã đọc workspace entry, AGENTS, project-start-task, project-implement-change, clinix-admin-workflow, Matrix B, convention, CONTRIBUTING và auth TRACKING mục 5. Áp dụng NestJS/TypeORM và error contract của source repo; không chuyển sang Prisma hoặc envelope tài liệu cũ.
- UNKNOWN: CI hiện tại, UI/browser và D2 Word. Môi trường MySQL ban đầu chưa xác minh; đã tạo riêng và kiểm ở bước IMPLEMENT (mục 10).

## 3. Questions, assumptions and decisions

### Contract đã được người dùng duyệt ngày 31/10/2026

| Method/path | Input | Success |
|---|---|---|
| GET /admin/service-groups | page, pageSize, q? | 200 `{items,total,page,pageSize}` |
| POST /admin/service-groups | `{ten,thuTuHienThi?}` | 201 ServiceGroup |
| PATCH /admin/service-groups/:id | `{ten?,thuTuHienThi?}`, ít nhất một trường | 200 ServiceGroup |
| DELETE /admin/service-groups/:id | ID bigint dạng chuỗi số dương | 204, không body |

- ServiceGroup chỉ gồm `{nhomDichVuId,ten,thuTuHienThi}`; ID giữ string, không thêm count dịch vụ hoặc endpoint detail ngoài PLAN.
- Tên trim/gộp khoảng trắng như B1; dài 1–100 sau chuẩn hóa; null/rỗng không hợp lệ. DB quyết định trùng không phân biệt hoa/thường/dấu; kiểm trước để báo thân thiện, bắt UNIQUE để chặn race.
- thuTuHienThi JSON number nguyên 0…2147483647 (khớp int DB); tạo bỏ trường dùng 0, PATCH bỏ trường giữ cũ; null/chuỗi/số lẻ từ chối.
- q trim, tối đa 200 ký tự như B1; tìm tên bằng LIKE có escape %, _, !. q rỗng như không có. Sort thuTuHienThi ASC, ten ASC, nhomDichVuId ASC; list và total cùng snapshot. P6 mặc định page=1/pageSize=20, tối đa 100.
- PATCH rỗng/trường lạ bị 400 DU_LIEU_KHONG_HOP_LE; POST cũng từ chối trường lạ. Lỗi validation trả loi theo trường qua configureApp.
- PATCH/DELETE ID hợp lệ nhưng không tồn tại: 404 KHONG_TIM_THAY; ID sai: 400 DU_LIEU_KHONG_HOP_LE. DELETE lặp sau xóa: 404.
- Trùng tên: 409 TEN_NHOM_DICH_VU_TRUNG. Nhóm còn dịch vụ: 409 NHOM_DICH_VU_CON_DICH_VU. 401/403 theo auth/C1; lỗi DB ngoài dự kiến không đổi thành lỗi nghiệp vụ.

### Assumptions nhỏ

- TASK_ID lấy B2 từ người dùng; dùng nhánh hiện có, không tạo/chuyển nhánh.
- Không sửa log AI khi chưa có yêu cầu riêng (AGENTS repo); nhắc thành viên ghi khi bàn giao.
- Không ghi audit cho nhóm vì PLAN 5.10 không định nghĩa action; không thêm schema.

## 4. Core-feature impact

- Danh mục nền cho B3/F3; không thay đổi booking, giá, đặt cọc, lịch khám hay dữ liệu sức khỏe.
- Xóa thật chỉ nhóm rỗng theo Q14; FK hiện hữu chặn orphan kể cả khi tạo/chuyển dịch vụ đồng thời. Giữ data access/transaction đúng layer.
- Rollback code không cần DDL; không tự sửa/xóa nhóm hoặc chuẩn hóa dữ liệu cũ.

## 5. Proposed approach

1. DTO/list response allowlist; kế thừa P6, kiểm ID bigint theo mẫu B1.
2. Repository sở hữu query parameterized, transaction, đọc/khóa nhóm, kiểm tên/dịch vụ, insert/update/delete và đọc lại; không ép ID sang Number.
3. Service sở hữu transaction và policy ghi; khóa nhóm khi sửa/xóa, kiểm rỗng rồi DELETE, bắt đúng UNIQUE tên và FK nhóm đã biết khi race. Kiểm metadata constraint hiện tại trước viết bộ phân loại lỗi; không đoán tên FK.
4. Controller mỏng dùng guard auth và C1 thật; import RbacModule và đăng ký ServiceGroupModule trong AppModule. Không sửa auth hay B1.
5. Test unit validation/permission/error mapping; MySQL constraint/race/rollback; HTTP AppModule/auth thật cho role/scope/validation/response.
6. Đồng bộ contract B2 trong Admin PLAN và evidence TRACKING sau kiểm thử; không sửa trạng thái task khác trong PR B2.

## 6. Work breakdown

| ID | Task | Output/evidence | Depends on |
|---|---|---|---|
| T1 | Khảo sát issue/plan/schema/source, lập plan | Hai artifact B2 | — |
| T2 | Chốt contract còn thiếu | Người dùng duyệt mục 3 | T1 |
| T3 | DTO/repository/service/module/controller | Source đúng layer và DV unit | T2 |
| T4 | Kiểm MySQL và HTTP | DV-01…06, DV-16 phần B2 và regression race | T3 |
| T5 | Review/verification/docs/handoff | Lint/build/test, tracker và contract | T4 |

## 7. Expected file/module impact

- Tạo `apps/api/src/admin/service-groups/service-group.{dto,repository,service,controller,module}.ts`, test unit/integration liên quan và `apps/api/test/admin-service-groups.e2e-spec.ts`.
- Sửa `apps/api/src/app.module.ts`, `docs/features/admin/PLAN.md`, `docs/features/admin/TRACKING.md`, hai artifact B2.
- Không sửa schema, migration, auth, frontend, dependency, env thật, AI log khi chưa được yêu cầu.

## 8. Verification

- Unit DV-02 và DTO biên, thiếu/null/chuỗi, PATCH rỗng; scope service; phân loại UNIQUE/FK đúng và không che lỗi DB lạ.
- MySQL DV-01/03/04/05/06: tên khác hoa/dấu, tự sửa tên, race tạo/sửa trùng tên, xóa/insert hoặc chuyển dịch vụ chạy đua, rollback; pagination/search escape/sort/total; bigint ngoài Number safe range.
- HTTP DV-16: thiếu token 401, sai role 403, Admin Chi nhánh GET được nhưng POST/PATCH/DELETE 403; TH CRUD; ID sai/không tồn tại; unknown field; body/status đúng.
- Chỉ test DB mới riêng sau kiểm tra hạ tầng; không dùng .env thật hoặc global setup reset DB dev/chia sẻ. Nếu chưa có môi trường an toàn thì ghi limitation, không chạy reset.
- Lệnh có trong manifest API: npm test; npm run test:int; npm run test:e2e; npm run lint; npm run build. Xác minh setup và filter trước khi chạy.
- D2 Word/F3/browser và CI không được coi là pass từ backend tests.

## 9. Completion criteria

- [x] Người dùng chốt contract mục 3 trước sửa source.
- [x] Source/test đúng scope và acceptance B2; UNIQUE/FK/race được xử lý.
- [x] Lint/build/test liên quan pass; evidence/giới hạn tại tracker.
- [x] Review diff, contract và tracker cập nhật, nhắc D2/log AI trong handoff.
- Thành viên tự commit/PR/review/merge; không gọi issue #56 đã đóng chỉ từ kiểm local.

## 10. Evidence IMPLEMENT

- B2 unit27/27, API89 file1544/1544; B2 MySQL11/11; HTTP B2+C1 19/19 (8+11). Lint/build/typecheck/Prettier pass; Linux jscpd1,93% trên255 file, Gitleaks hai scope B2 sạch.
- Dùng container MySQL8.4 mới `clinix-b2-tests-20261031`, cổng33313, DB riêng `clinix_b2_20261031_int_test` và `clinix_b2_20261031_http_test`; user/password chỉ là fixture của container mới. Không DB dev/chia sẻ, không gửi mail/Cloudinary thật.
- Lượt MySQL đầu10/11: COUNT trả string vì cấu hình bigint; sửa khai báo kết quả/assertion trong test, rerun11/11. Lint đầu cảnh báo spread DTO instance; thay bằng allowlist hai field, lint cuối sạch.
- Không thay schema/migration/dependency/frontend/auth hoặc Git. Giữ thay đổi ngoài B2 xuất hiện giữa phiên tại log AI, C2 tracker và dòng C2 của Admin TRACKING.
- Chưa kiểm full MySQL/full HTTP/CI/browser; D2 Word và log AI do thành viên xử lý. Không tự cập nhật issue remote hay coi đã merge.
