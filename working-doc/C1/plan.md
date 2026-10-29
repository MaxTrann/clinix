# C1 — RBAC: phạm vi quản trị theo chi nhánh dùng chung

Status: Done — triển khai và kiểm chứng local; chưa review/merge issue  
Mode: IMPLEMENT  
Owner: Trung  
Updated: 2026-10-29

## 1. Goal and scope

Xây cơ chế dùng chung để mỗi request Admin được xác thực vai trò và giới hạn đúng phạm vi Toàn hệ thống hoặc Chi nhánh. Các module sau tái dùng policy thay vì tự kiểm quyền riêng.

In scope:
- `apps/api/src/rbac/`: kiểu `AdminScope`, repository, `AdminScopeService`, `AdminScopeGuard`, `@RequireAdminScope`, `@AdminScopeCtx`, `BranchAccessPolicy`, module export các provider dùng chung.
- `GET /admin/me`: trả phạm vi hiện tại và thông tin tối thiểu của chi nhánh.
- Chuyển route upload P7 hiện hữu sang decorator/guard scope chung; giữ kiểm tra trước multipart và bảo vệ ở service.
- Test unit, MySQL và HTTP với guard auth thật; kiểm metadata toàn bộ route Admin.
- Khi IMPLEMENT: ghi kết quả thật vào tracker Admin; AI log theo sự đồng ý riêng của người dùng.

Out of scope:
- UI/F1, CRUD danh mục/chi nhánh/tài khoản, bảng quyền hành động tài khoản B15/B18, AuditService C2.
- Không thay schema/migration, JWT/session, dependency, vendor, cấu hình hay dữ liệu dev/chia sẻ.
- Không tự sửa tài liệu Word 2.4, không release/deploy, không thực hiện thao tác thay đổi Git.

Acceptance criteria:
1. Tái dùng JwtAuthGuard → RolesGuard của A4; request chưa xác thực trả 401, sai vai trò trả 403. Không stub guard khi kiểm HTTP tích hợp.
2. Resolve `quan_tri_vien` từ accountId của phiên mỗi request, không cache/JWT scope; scope đổi thì request kế tiếp áp dụng ngay. Không có hồ sơ hoặc hồ sơ không hợp lệ trả 403 `KHONG_DU_QUYEN`; lỗi DB không bị biến thành lỗi thiếu hồ sơ hay cho qua.
3. Route chỉ-Toàn-hệ-thống từ chối Admin Chi nhánh bằng 403 trước controller/interceptor; route Any gắn scope do server xác định. Không lấy scope/accountId từ body/query.
4. Policy phân biệt tài nguyên ngoài tầm nhìn: 404 `KHONG_TIM_THAY`; tài nguyên thấy được nhưng thiếu quyền hành động: 403 `KHONG_DU_QUYEN`. Filter và total cùng điều kiện SQL; không lọc sau khi đọc dữ liệu.
5. `/admin/me` trả đúng hai phạm vi; không lộ phiên, token, email, hồ sơ tài khoản hay danh sách chi nhánh khác. Bigint giữ dạng string.
6. Duyệt route metadata thực tế: mọi route `/admin` và `/admin/*` có effective `@Roles('QuanTriVien')` và `@RequireAdminScope`, không `@Public`, guard scope được gắn thực sự. Test âm cố ý thiếu từng lớp bảo vệ phải bị phát hiện.
7. Upload P7 giữ kết quả quyền và thứ tự trước multipart; request lỗi quyền không chạy processor/provider hoặc tạo ledger. Không gọi Cloudinary thật khi test tự động.
8. Có mapping PQ-01…PQ-15 theo mức kiểm chứng: cơ chế C1 / probe kiểm thử / endpoint nghiệp vụ chưa có. Không ghi các UC tương lai là đã pass nhờ probe.

## 2. Evidence and context

- Issue đã đọc trực tiếp bằng GitHub REST API: [C1 #52](https://github.com/MaxTrann/clinix/issues/52), OPEN ngày 29/10/2026; phụ thuộc [A4 #23](https://github.com/MaxTrann/clinix/issues/23) và [P2 #46](https://github.com/MaxTrann/clinix/issues/46) đều CLOSED ngày 27/10/2026. Chưa kiểm độc lập PR merge SHA; source cần thiết đã có local.
- `docs/features/admin/PLAN.md:418`: thiết kế C1; `:656`: task C1; `:1105`: ma trận PQ; endpoint tại mục 5.3 vẫn ghi đề xuất.
- `docs/features/admin/TRACKING.md:99`: Q40 chốt ngoài phạm vi 404, thiếu quyền 403; Q42 yêu cầu cả danh sách và total lọc phạm vi.
- `docs/features/auth/TRACKING.md`, mục 5, điểm 8: bàn giao guard cho C1. `apps/api/src/auth/auth.module.ts`: APP_GUARD JwtAuthGuard rồi RolesGuard; `decorators/current-user.decorator.ts`: accountId/sessionId/role lấy từ auth.
- `apps/api/src/admin/entities/quan-tri-vien.entity.ts`, `chi-nhanh.entity.ts`; `docs/database/clinix_mysql.sql:152`, `:732`, `:734`, `:886`: bảng, FK và CHECK phạm vi đã có. C1 chỉ đọc.
- `apps/api/src/common/upload/upload.controller.ts`: route `admin/uploads/specialty-image`, Roles + SpecialtyUploadGuard; chưa có decorator C1. `upload.service.ts:21` và `upload.repository.ts:28` có kiểm Toàn hệ thống thật ở service/repository.
- `apps/api/src/admin/testing/admin-fixtures.ts:149`: fixture admin hai phạm vi; `test/auth-guards.e2e-spec.ts`: mẫu HTTP với AppModule, TokenService/SessionService và MySQL thật.
- `apps/api/src/app.setup.ts` và `common/errors/`: không có global prefix trong app; lỗi hiện tại `{ maLoi, thongBao, ... }`. Giữ convention NestJS/TypeORM/Argon2 hiện hành của clinix, không áp các ví dụ Prisma/bcrypt/API v1 cũ trong workspace vào C1.
- VERIFIED: branch `feat/admin-c1`; chưa có thư mục/source rbac trong danh sách file đã khảo sát. Ba file dirty có sẵn là AppModule, UploadModule và Admin TRACKING (follow-up scheduler P7); phải giữ nguyên.
- UNKNOWN: khả năng chạy Docker/MySQL hiện tại, kết quả lint/build/test C1, acceptance toàn bộ endpoint nghiệp vụ chưa tồn tại. Không chạy test hay chạm DB trong lượt PLAN.

## 3. Questions, assumptions and decisions

### Đã được người dùng duyệt trước code ngày 29/10/2026

- Người dùng duyệt toàn bộ plan trong chat và yêu cầu triển khai, gồm contract dưới đây và chuyển guard route upload sang C1.
- Issue #52 dẫn toàn bộ PQ-01…PQ-15 nhưng nhiều ca yêu cầu endpoint của B-task/C2 chưa có. Đề xuất C1 kiểm cơ chế bằng probe test riêng, ghi rõ phần UC còn phụ thuộc; chưa coi issue đủ điều kiện đóng nếu vẫn thiếu acceptance mà issue yêu cầu. Không tự giảm điều kiện đóng issue.

### Chi tiết triển khai trong plan đã duyệt

- ID là string; giá trị TH trong `branchFilter` khi không có requested branch biểu diễn bằng `undefined` (không thêm điều kiện), không truyền undefined vào một where có thể mở scope ngoài ý muốn.
- `assertCanAct` kiểm visibility trước rồi mới kiểm quyền hành động được caller tính; không tự tạo ma trận quyền tài khoản trong C1.
- `patientVisibilityFilter` cung cấp điều kiện có tham số để repository caller áp dụng SQL `EXISTS lich_hen` tại chi nhánh, không trả danh sách ID để lọc RAM. Alias do code kiểm soát, không lấy từ request. Chưa có rule giới hạn trạng thái/thời gian lịch hẹn nên không tự thêm.
- `GET /admin/me` ở controller path `admin`, theo source hiện tại; URL bên ngoài đi qua proxy `/api` hiện hành, không đổi proxy/prefix.
- Contract để duyệt: TH trả `{ phamVi: 'ToanHeThong' }`; CN trả `{ phamVi: 'ChiNhanh', chiNhanh: { id: '<bigint string>', ten: '<tên từ DB>' } }`. TH bỏ trường chiNhanh theo dấu `?` của PLAN 5.2; không thêm envelope mới.

### Quyết định kế thừa

- Q40: module rbac dùng chung, ngoài tầm nhìn 404; Q42: lọc truy vấn và total.
- Scope server đọc mỗi request; tài nguyên lấy chi nhánh từ DB. Service nhận scope qua tham số, không đọc HTTP request.
- Với mutation tài nguyên có thể chuyển chi nhánh: kiểm scope trong transaction sau khóa dòng. C1 cung cấp policy và probe kiểm điều kiện này; controller nghiệp vụ sau chịu trách nhiệm áp dụng.

## 4. Core-feature impact

- Có thay đổi authorization dùng chung cho actor QuanTriVien, bổ sung `/admin/me` và thay guard scope route upload.
- Bệnh nhân/bác sĩ/lễ tân vẫn bị chặn ở Admin; không đổi policy JWT/session hay auth endpoint.
- Rủi ro: sai thứ tự guard, bỏ decorator, scope cũ trong token/cache, lọc total không cùng phạm vi, gọi multipart trước kiểm quyền, rò dữ liệu qua 403/404. Test tập trung các điểm này.
- Tương thích: không đổi schema và response upload. Giữ kiểm service P7 để lời gọi ngoài HTTP vẫn được bảo vệ.

## 5. Proposed approach

1. Tạo kiểu scope dạng union đúng PLAN 5.2, policy thuần và test ma trận hai chi nhánh/TH.
2. Repository rbac đọc các bảng dùng chung đã tồn tại bằng DataSource/TypeORM có tham số; không import AdminModule/service nghiệp vụ. Entity hiện nằm dưới admin/entities là persistence có sẵn, không di chuyển file hay nhân bản entity trong C1. Module nghiệp vụ khác chỉ import RbacModule.
3. `AdminScopeService.resolve(accountId)` đọc/validate bản ghi mỗi request. Tách truy vấn tên chi nhánh tối thiểu cho `/me`; lỗi dữ liệu không được tạo scope mặc định.
4. `@RequireAdminScope` kết hợp metadata và `UseGuards(AdminScopeGuard)` để guard luôn chạy sau global auth/roles, trước interceptor. Guard đọc effective metadata cấp method/class, xác nhận user role Admin, resolve một scope cho request và gắn request.adminScope. Không đăng ký thêm global auth guard hoặc sửa AuthModule.
5. `@AdminScopeCtx` lấy scope đã resolve; thiếu context phải dừng, không tự tạo scope. Test sự tách biệt request và việc body/query giả không ghi đè context.
6. Controller `/admin/me` mỏng → service/repository; chỉ trả trường allowlist của contract.
7. Import RbacModule vào AppModule và UploadModule; thay SpecialtyUploadGuard trên controller bằng RequireAdminScope ToanHeThong. Giữ `UploadService.assertSystemAdmin` và repository hiện hữu trong C1 để bảo toàn bảo vệ direct-call và tránh mở rộng refactor P7. Giữ nguyên thay đổi scheduler có sẵn.
8. Test duyệt controller/handler đã đăng ký trong module graph thực tế bằng discovery/reflection, kiểm path/method/inherited metadata và binding guard. Không chỉ grep chuỗi source hoặc dùng danh sách route viết tay.

Frontend: không sửa. Data: không migration/seed/dev DB. Integration/AI: không thêm. Bảo mật: không log secret/token/PII; test chỉ dữ liệu mẫu, mail/provider mock, không Cloudinary thật.

## 6. Work breakdown

| ID | Task | Output/evidence | Depends on | Parallel with |
|---|---|---|---|---|
| T1 | Đọc issue, dependency, tracker, source; lập plan | Plan/tracker Draft; giữ dirty files | — | — |
| T2 | Người dùng duyệt plan/contract và cách ghi coverage PQ | Decision ghi trong plan/tracker | T1 | — |
| T3 | Scope type và policy/filter | Unit đầy đủ ma trận, 403/404, requested branch giả | T2 | — |
| T4 | Repository, resolver, guard/decorator/module | MySQL scope đổi; unit fail-closed/metadata/context | T3 | — |
| T5 | GET /admin/me và ghép guard upload | HTTP auth thật; response allowlist; regression P7 | T4 | — |
| T6 | Route audit và ma trận PQ | Test âm thiếu bảo vệ; probe IDOR/query/transaction/concurrency | T5 | — |
| T7 | Kiểm thử, review diff, cập nhật docs | Kết quả thật, coverage còn thiếu, hướng dẫn bàn giao | T6 | — |

## 7. Expected file/module impact

Create (tên nhỏ bên trong có thể điều chỉnh mà không đổi contract):
- `apps/api/src/rbac/rbac.module.ts`, `admin-scope.ts`, `admin-scope.service.ts`, `admin-scope.repository.ts`, `branch-access.policy.ts`.
- `apps/api/src/rbac/guards/admin-scope.guard.ts`; `decorators/require-admin-scope.decorator.ts`, `admin-scope-ctx.decorator.ts`.
- `apps/api/src/rbac/admin-me.controller.ts` và service riêng nếu orchestration cần; unit/int-spec cạnh mã tương ứng.
- `apps/api/test/admin-scope.e2e-spec.ts` và route-audit spec; probe controller chỉ trong test, không đăng ký vào app thật.

Modify (IMPLEMENT): AppModule, UploadModule, UploadController và các test P7 bị ảnh hưởng; Admin TRACKING. `AI_USAGE_LOG.md` chỉ khi được đồng ý riêng. Nếu contract khác PLAN cần cập nhật đúng mục sau khi được duyệt, không sửa trong PLAN mode này.

Do not touch: thay đổi scheduler P7 đã có, auth implementation/tracker của teammate, schema/migration, dependency/lockfile, .env, frontend, tài liệu Word. Lượt PLAN chỉ tạo hai file C1.

## 8. Verification

| Case | Kiểm trong C1 | Giới hạn acceptance |
|---|---|---|
| PQ-01/02 | Ma trận thiếu/hết hạn token, ba role không phải Admin trên route Admin hiện hữu qua auth thật | Mỗi endpoint mới phải thêm vào suite về sau |
| PQ-03/04/05 | `/me` hai scope; upload chỉ TH; route probe Any/TH | Không đại diện CRUD của các B-task |
| PQ-06/07/13 | Policy và HTTP probe với tài nguyên lấy từ DB; 404 cùng error body, sửa ID/body/query không mở scope; không có side effect | Đo thời gian như smoke/quan sát, không dùng ngưỡng cứng dễ flaky; UC tương lai phải test riêng |
| PQ-08 | Probe truy vấn MySQL dùng filter chung, data và total cùng scope; requested branch khác không lộ số lượng | Endpoint danh sách thực chưa có; sửa dẫn nhầm PQ-12 ở đoạn 5.2 bằng ghi chú, không đổi nghĩa PQ-12 |
| PQ-09/10 | Cùng access token, đổi scope DB test rồi request lại; thiếu hồ sơ 403; scope NULL sai kiểm unit vì CHECK DB thật cấm dữ liệu đó | Không tắt CHECK để dựng fixture sai |
| PQ-11 | Scan đăng ký route app thật, test âm thiếu Roles/scope/guard, có Public, override method lỏng quyền | Không chỉ kiểm tên decorator |
| PQ-12 | Tài khoản ngừng/phiên revoked → 401 với auth guard thật | Tái dùng API SessionService; không đổi auth |
| PQ-14 | Hai admin khác chi nhánh gọi song song trên probe; không dùng mutable scope dùng chung | Mutation tài nguyên thật ở B-task có regression riêng |
| PQ-15 | Probe ghi test lấy actor từ CurrentUser/phiên; payload giả actor không được dùng | AuditService thật thuộc C2, chưa tuyên bố audit nghiệp vụ hoàn tất |

Unit: policy, invalid scope, resolver lỗi DB, guard/decorator/context và route metadata. Integration: MySQL thật, fixture hai chi nhánh, scope thay đổi, SQL filter/patient EXISTS/total, transaction kiểm sau khóa dòng trên probe. E2E: AppModule + configureApp + JwtAuthGuard/RolesGuard thật, session/token tạo bằng service, mail/provider mock.

Các command đã có trong `apps/api/package.json`, dự kiến chạy tại `apps/api` sau khi triển khai:
- `npm test` (toàn API, gồm unit rbac và regression upload).
- `npm run test:int` (cấu hình include `src/**/*.int-spec.ts`).
- `npm run test:e2e` (cấu hình include `**/*.e2e-spec.ts`).
- `npm run lint`, `npm run build`.
- `npm run test:p7` chỉ khi cần regression upload MySQL riêng; harness yêu cầu tên DB mới `clinix_p7_<timestamp>_test`.
- `git diff --check` và review diff + untracked artifacts.

An toàn DB test: global-setup test:int/e2e hiện gọi helper tạo lại DB test. Trước khi chạy phải kiểm đích host/port/name và cơ chế cleanup; dùng DB/container mẫu riêng, không trỏ DB dev/chia sẻ, không đọc/in credential thật. Nếu cần thao tác destructive chưa được cho phép rõ, dừng phần đó xin phép; không coi duyệt plan là quyền reset DB hiện hữu. Docker/MySQL chưa kiểm ở lượt này.

## 9. Completion criteria

- [x] Plan được duyệt trước khi sửa source.
- [x] Acceptance 1–8 của cơ chế C1 đạt ở cấp unit/MySQL/HTTP; UC nghiệp vụ tương lai không ghi pass thay bằng probe.
- [x] Checks liên quan pass, review diff giữ công việc có sẵn. Full integration lượt đầu388/389, lỗi fixture P7 đã sửa và rerun nhóm12/12 + kiểm seed email trùng8/8; không tuyên bố full suite đã rerun xanh sau sửa.
- [x] Tracker C1/Admin và contract/cách dùng đã cập nhật; nháp AI log nằm ở tracker, người dùng tự ghi theo quyền riêng.
- [x] Không secret, schema/dependency/Git mutation hoặc thay đổi ngoài scope.
- [x] Bàn giao cách dùng policy/decorator và giới hạn coverage; gợi ý PR `feat(rbac): thêm phạm vi quản trị theo chi nhánh dùng chung`, `Closes #52` chỉ khi điều kiện đóng thực sự đạt. Commit/PR/review/merge do thành viên thực hiện.
