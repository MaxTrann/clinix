# B7 — Quản lý chi nhánh: xem danh sách và thêm mới (backend)

Status: In progress  
Mode: IMPLEMENT  
Owner: Trung  
Updated: 2026-11-01

## 1. Goal and scope

- **Goal:** Hoàn thành backend issue [#59](https://github.com/MaxTrann/clinix/issues/59): đọc danh sách/chi tiết chi nhánh và tạo mới chi nhánh.
- **In scope:**
  - `GET /admin/branches`, `GET /admin/branches/:id`: trả thông tin chi nhánh, lịch đủ 7 thứ, dịch vụ gắn và cờ yêu cầu thay đổi đang mở.
  - `POST /admin/branches`: tạo chi nhánh, đủ 7 dòng lịch và các liên kết dịch vụ trong một giao dịch.
  - Dùng phân quyền/phạm vi C1 và phân trang P6; viết `validateWeeklySchedule` thuần theo Q1.
- **Out of scope:** sửa chi nhánh/yêu cầu ảnh hưởng lịch (B8+), giao diện F6a, cấu hình B5, thay schema/migration/seed, ghi vào DB dev/chia sẻ. D1 Word chỉ xử lý khi có đúng tài liệu nguồn trong checkout hoặc người phụ trách bàn giao.
- **Acceptance criteria:**
  1. GET list/detail cho cả hai phạm vi Admin; Admin Chi nhánh chỉ đọc chi nhánh mình. ID ngoài phạm vi trả cùng 404 `KHONG_TIM_THAY` như ID không tồn tại.
  2. POST chỉ cho Admin Toàn hệ thống; lỗi quyền/validation không ghi dữ liệu.
  3. POST tạo một bản ghi `chi_nhanh`, đúng 7 dòng lịch và các liên kết dịch vụ trong một giao dịch; lỗi giữa chừng rollback toàn bộ.
  4. Lịch phải đủ thứ ISO 1–7, không lặp; ngày nghỉ không có giờ; ngày hoạt động có ít nhất một khoảng đầy đủ; giờ mỗi khoảng tăng dần, hai khoảng không chồng. Trả mọi lỗi theo thứ.
  5. Toạ độ tùy chọn nhưng phải đi theo cặp, đúng miền và tối đa 7 chữ số thập phân theo Q10. Tên/địa chỉ theo giới hạn CN-11.
  6. ID dịch vụ không tồn tại bị từ chối; ID lặp được gộp; danh sách rỗng được phép theo CN-12.
  7. Danh sách và chi tiết áp dụng scope trước khi trả bản ghi và `total`; cờ yêu cầu dùng trạng thái đang mở theo Q3.
  8. Test B7 phủ `CN-01…15`, `PQ-01…08`, `PQ-11`, `PQ-13` theo phạm vi tương ứng.

## 2. Evidence and context

- **Task input:** issue #59 đang OPEN; mô tả GET list/detail + POST, trace `CN b1–b2, b4, A1, A3`, phụ thuộc #45/#52/#50, test `CN-01…13`, đồng bộ D1; dòng “SOẠN TRƯỚC (validator)”.
- **VERIFIED:** issue phụ thuộc #45 P1, #50 P6, #52 C1 đều CLOSED. Commit `9464aee` (P1), `1b4fd52` (P6), `6916371` (C1) là ancestor của `main` tại `306244d`; source entity, paging và RBAC có trong checkout.
- **VERIFIED:** nhánh hiện tại `feat/admin-b7`, tạo từ HEAD của `main`, working tree sạch trước khi lập artifact. Không tạo hoặc đổi nhánh trong task này.
- **VERIFIED:** schema hiện có `chi_nhanh`, `chi_nhanh_lich_hoat_dong`, `chi_nhanh_dich_vu_kham`, `yeu_cau_thay_doi_chi_nhanh`; entity đã đăng ký. Không thấy nhu cầu DDL/migration cho B7.
- **VERIFIED:** Q1 chốt hai khoảng sáng/chiều, nhãn “giờ nhận khám”; Q10 chốt toạ độ tùy chọn nhưng đủ cặp, miền hợp lệ, thiếu toạ độ vẫn hiển thị.
- **VERIFIED:** C1 cung cấp `@Roles`, `@RequireAdminScope`, `BranchAccessPolicy.branchFilter/assertCanSee`; ngoài phạm vi phải là 404. P6 có `PageQueryDto` mặc định page 1/pageSize 20, tối đa 100 và helper escape LIKE.
- **VERIFIED:** Q3 định nghĩa yêu cầu đang mở là `ChoDuyet` hoặc `DaDuyet` chưa áp dụng; schema có cột sinh `dang_mo_chi_nhanh`.
- **VERIFIED:** code hiện dùng NestJS + TypeORM và các entity/module B1–B4. Tài liệu `0.docs/DEVELOPMENT_RULES.md` còn mô tả Prisma; với B7 theo AGENTS, package và source hiện hành.
- **APPROVED:** search, response shape, kiểu thời gian/toạ độ và chính sách tên trùng được người dùng duyệt trong Q1/Q2; row schedule theo shape hiện có ở Admin PLAN 5.4.
- **UNKNOWN:** tài liệu Word D1 gốc được chỉ tới ở repo khác, không có đường dẫn nguồn được xác nhận trong checkout này.
- **VERIFIED:** test integration và HTTP dùng `global-setup` để tạo lại DB `_test`; không có Docker daemon hoặc MySQL service/listener hiện khả dụng. Hai nhóm test chưa chạy và không được trỏ sang DB dev/chia sẻ.

## 3. Questions, assumptions and decisions

### Questions requiring an answer

- None. Người dùng đã duyệt đề xuất API và chính sách tên trùng ngày 2026-11-01.

### Decisions

- **Q1 — APPROVED 2026-11-01:**
   - GET list dùng `page`, `pageSize`, `q?` theo P6; `q` trim, tối đa 200 ký tự, tìm tên và địa chỉ; mặc định sắp tên tăng dần rồi ID; trả `{items,total,page,pageSize}`.
   - List/detail trả cùng `BranchView`: `{chiNhanhId,ten,diaChi,toaDoLat,toaDoLng,lichHoatDong,dichVuKham,coYeuCauDangMo}`. Lịch luôn có 7 phần tử `{thuTrongTuan,hoatDong,sang,chieu}`; `sang`/`chieu` là `{batDau,ketThuc}` hoặc `null`; dịch vụ tối thiểu `{dichVuKhamId,ten}`. ID và DECIMAL toạ độ trả chuỗi; thời gian nhận `HH:mm` và trả `HH:mm:ss`. Hàng chi nhánh cũ thiếu lịch không bị suy diễn là ngày nghỉ: phần tử đó có `hoatDong:null` và hai khoảng `null`.
   - POST nhận `{ten,diaChi,toaDoLat?:string,toaDoLng?:string,lichHoatDong:[7],dichVuKhamIds:[string]}`, trả 201 cùng `BranchView`. ID dịch vụ không tồn tại trả `KHONG_TIM_THAY`; trường sai trả mã validation hiện hành; lịch sai trả `LICH_HOAT_DONG_KHONG_HOP_LE` cùng danh sách `{thu,maLoi}`.
   - Lịch POST theo shape đã có trong Admin PLAN 5.4: `{thuTrongTuan,hoatDong,sang?:{batDau,ketThuc},chieu?:{batDau,ketThuc}}`; giờ đầu vào đúng `HH:mm`. Mã lỗi chi tiết ổn định gồm `DANH_SACH_KHONG_HOP_LE`, `THU_KHONG_HOP_LE`, `THU_BI_THIEU`, `THU_BI_TRUNG`, `TRANG_THAI_HOAT_DONG_KHONG_HOP_LE`, `NGAY_NGHI_CO_GIO`, `NGAY_HOAT_DONG_THIEU_KHOANG`, `KHOANG_GIO_KHONG_HOP_LE`, `KHOANG_GIO_CHUA_DAY_DU`, `GIO_KHONG_HOP_LE`, `KHOANG_GIO_KHONG_TANG`, `KHOANG_GIO_CHONG_NHAU`.
- **Q2 — APPROVED 2026-11-01:** cho phép tên chi nhánh trùng; không thêm uniqueness check hoặc migration.

### Assumptions

- Các quy tắc CN-01…13 và Q1/Q10 là hợp đồng nghiệp vụ hiện hành; không thêm quy tắc B8/approval vào B7.
- `coYeuCauDangMo` dựa trên hàng `dang_mo_chi_nhanh` tương ứng, gồm cả yêu cầu đã duyệt nhưng chưa áp dụng.
- Tên trim/gộp whitespace; địa chỉ trim đầu/cuối. Hàng chi nhánh cũ thiếu ngày được thể hiện chưa khai báo bằng `hoatDong:null`, không tự chuyển thành ngày nghỉ.
- Không sửa D1 Word nguồn ngoài repo; nếu cần cập nhật cùng PR, thành viên cung cấp file/repo nguồn.

- Không đổi schema, vendor, dependency hoặc kiến trúc.

## 4. Core-feature impact

- Does this change core behavior? **Yes.** Thêm dữ liệu chi nhánh mà chức năng đặt lịch và hồ sơ nhân sự sẽ đọc.
- Affected actors/flows: Admin Toàn hệ thống tạo; hai phạm vi Admin đọc trong đúng phạm vi; các luồng sử dụng danh sách dịch vụ/giờ nhận khám.
- Backward-compatibility risk: chưa tìm thấy endpoint B7 hiện hữu; cần giữ nguyên entity, schema và mã lỗi chung C1/P5 để các module sau dùng được.

## 5. Proposed approach

- **Backend:** module `admin/branches` theo pattern NestJS hiện hành: DTO, controller mỏng, service nghiệp vụ, repository TypeORM; import `RbacModule`, không tạo guard thay thế.
- **Read:** lọc scope bằng `BranchAccessPolicy` trước truy vấn/phân trang; dùng cùng predicate cho rows và total; chỉ trả quan hệ của chi nhánh được phép xem; đọc cờ yêu cầu mở từ nguồn dữ liệu P3.
- **Create:** strict DTO whitelist; gọi validator thuần; kiểm ID dịch vụ; trong một transaction tạo chi nhánh, đủ 7 dòng lịch và liên kết dịch vụ; không audit ngoài yêu cầu B7.
- **Validation:** gom đủ lỗi lịch `{thu,maLoi}`; phản chiếu Q1/Q10 và CHECK schema; không để lộ lỗi CHECK/SQL thô.
- **Data:** chỉ dùng entity/migration P1/P3 hiện có; không thêm cột/bảng/index.
- **Security/privacy:** AuthModule + guard C1 thật trong HTTP tests; BranchAccessPolicy chạy ở service; ngoài phạm vi trả 404; không nhận `chiNhanhId` phạm vi từ body để quyết định quyền.
- **Tests:** unit validator/DTO/service; MySQL integration cho tạo đủ quan hệ, FK và rollback; HTTP với AppModule/Auth/C1 thật cho roles, scope, pagination, 404 và validation.

## 6. Work breakdown

| ID | Task | Output/evidence | Depends on | Parallel with |
|---|---|---|---|---|
| T1 | Đọc issue, Admin plan/tracker, source/schema và xác minh dependency | VERIFIED ở mục 2 | — | — |
| T2 | Chốt API contract và quy tắc tên trùng | Quyết định cập nhật mục 3 | T1 | — |
| T3 | Viết `validateWeeklySchedule` và unit tests | Validator thuần, test CN-03…10 | T2 | — |
| T4 | DTO/repository/service/controller/module và unit, MySQL, HTTP tests | Source + test specs; verification evidence ở T5 | T2, T3 | — |
| T5 | Chạy kiểm tra liên quan, review diff, cập nhật Admin PLAN/TRACKING và tracker | Evidence thật; D1 Word ghi pending nếu chưa có nguồn | T4 | — |

## 7. Expected file/module impact

- **Create:** `apps/api/src/admin/branches/` (DTO, controller, service, repository, module, validator và test); `apps/api/test/admin-branches.e2e-spec.ts`; `working-doc/B7/plan.md`, `working-doc/B7/tracker.md`.
- **Modify:** `apps/api/src/app.module.ts`; `docs/features/admin/PLAN.md`, `docs/features/admin/TRACKING.md`.
- **Do not touch:** `docs/database/*`, migration, frontend, dependency/lockfile, `.env`, seed/DB dev or shared, B8+, `AI_USAGE_LOG.md` (thành viên ghi theo AGENTS), Word D1 ngoài checkout.

## 8. Verification

- Unit: `npm.cmd test -- src/admin/branches`.
- Integration: `npm.cmd run test:int -- src/admin/branches/test/branch.int-spec.ts` trên MySQL test disposable riêng; chưa chạy do Docker daemon và MySQL service không khả dụng trong môi trường hiện tại.
- HTTP: `npm.cmd run test:e2e -- test/admin-branches.e2e-spec.ts` với Auth/C1 thật; chưa chạy do thiếu MySQL test service.
- Lint/typecheck/build/format: `npm.cmd run lint`, `npm.cmd exec -- tsc --noEmit`, `npm.cmd run build`, `npm.cmd exec -- prettier --check src/admin/branches src/app.module.ts test/admin-branches.e2e-spec.ts`.
- Không kết nối DB dev/chia sẻ; không sửa migration/schema. Khi chạy integration/e2e, harness tự dựng lại đúng DB riêng có tên `_test`; hiện chưa có Docker daemon/MySQL test service nên hai nhóm này chưa chạy. Unit, lint, typecheck, build và Prettier có kết quả ở tracker.

## 9. Completion criteria

- [x] Người dùng duyệt plan và chốt hai câu ở mục 3 ngày 2026-11-01.
- [ ] B7 source đáp ứng issue #59 và test theo CN/PQ liên quan pass.
- [x] Admin PLAN/TRACKING và tracker B7 cập nhật bằng evidence.
- [ ] D1 Word được thành viên đồng bộ trong nguồn được chỉ định hoặc được ghi pending rõ; không tuyên bố issue hoàn tất khi còn mục bắt buộc chưa làm.
- [x] Không commit/push/PR/merge; các thao tác đó do thành viên tự thực hiện theo AGENTS.
