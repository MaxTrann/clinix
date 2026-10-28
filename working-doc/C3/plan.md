# C3 — SystemConfigService dùng chung

Status: Done locally — người dùng duyệt trong chat 28/10/2026  
Mode: IMPLEMENT  
Owner: Trung  
Updated: 2026-10-28

## 1. Goal and scope

- Goal: cung cấp một nơi đọc cấu hình nghiệp vụ từ dòng `cau_hinh_he_thong.id = 1` cho các module dùng lại, đúng issue [#53](https://github.com/MaxTrann/clinix/issues/53).
- In scope: repository chỉ đọc, `SystemConfigService`, module export service, wiring khởi động, test và ghi tiến độ Admin.
- Out of scope: controller/API GET/PUT và cờ response `chuaCauHinh` của B5; giao diện F5; audit C2; seed C5; migration/schema; thay đổi auth, upload hoặc nghiệp vụ booking/chi nhánh.
- Acceptance criteria:
  1. `get()` trả cấu hình đã lưu; không có dòng thì trả `null`.
  2. `getOrThrow()` trả cùng dữ liệu; không có dòng thì ném `AppException` HTTP 409, mã `HE_THONG_CHUA_CAU_HINH`, thông báo “Hệ thống chưa được cấu hình.”.
  3. Khi ứng dụng khởi động và thiếu dòng cấu hình, ghi một cảnh báo qua Nest Logger; không chặn khởi động chỉ vì chưa cấu hình.
  4. Không tạo dòng, không điền giá trị mặc định trong mã, không cache; lần đọc sau phản ánh dữ liệu mới đã commit.
  5. Module khác import `SystemConfigModule` và inject `SystemConfigService` được; không cần controller hay guard mới.
  6. Không chuyển lỗi kết nối/truy vấn DB thành lỗi thiếu cấu hình; lỗi hạ tầng lan theo cơ chế lỗi hệ thống hiện có.

## 2. Evidence and context

- Input: người dùng yêu cầu tiến hành C3 sau P7; đã thống nhất lập plan/tracker rồi duyệt trước code.
- `VERIFIED`: nhánh `feat/admin-c3`; `git status --short` sạch lúc khảo sát 28/10/2026.
- `VERIFIED`: issue #53 chỉ phụ thuộc P3, dẫn CH-10 và yêu cầu service đọc cấu hình, cảnh báo khởi động, export module.
- `VERIFIED`: `docs/features/admin/PLAN.md:658` mô tả C3; dòng 577 quy định lỗi 409; dòng 957 mô tả CH-10 gồm phần service và GET của B5.
- `VERIFIED`: `docs/database/clinix_quy_tac_nghiep_vu.md:90` (quy tắc service 35) yêu cầu đọc id=1, không dùng số cứng; kiểm count khi khởi động.
- `VERIFIED`: `apps/api/src/admin/entities/cau-hinh-he-thong.entity.ts:1` có entity, JSON reminder là `number[]`, decimal w1/w2 là `string`; entity đã đăng ký tại `apps/api/src/database/entities.ts:55`.
- `VERIFIED`: `apps/api/src/app.module.ts:10` là nơi ghép module; `common/errors/app.exception.ts` có cơ chế mã lỗi ổn định.
- `VERIFIED`: integration config có global setup; `database/testing/test-database.ts` có helper DROP/recreate DB test. Không chạy mặc định trên DB hiện có để khảo sát.
- Guidance: `0.docs/SKILL.md`, AGENTS workspace/repo, skill project-start-task và clinix-admin-workflow; convention NestJS/TypeORM của repo là evidence thực tế. Reference workspace còn mô tả Prisma là tài liệu định hướng cũ, không áp dụng để đổi stack.
- `UNKNOWN`: P3 đã merge vào remote main hay chưa chưa được kiểm độc lập trong lượt này; entity và registry có trong checkout. Trạng thái DB runtime/chất lượng khởi động sau C3 chưa xác minh; chưa chạy test.

## 3. Questions, assumptions and decisions

### Questions requiring an answer

- Plan đã được người dùng duyệt trong chat 28/10/2026. Không còn câu hỏi business rule chặn phạm vi chỉ đọc C3.

### Assumptions / PROPOSED

- Dùng task ID `C3`, artifact tại `working-doc/C3/` theo convention các task trước.
- Public signature tối thiểu: `get(): Promise<CauHinhHeThong | null>` và `getOrThrow(): Promise<CauHinhHeThong>`. Giữ nguyên kiểu entity nội bộ, gồm decimal dạng chuỗi; không tạo DTO HTTP.
- Không bổ sung API nhận manager/khóa hàng khi chưa có caller cần nó. Tích hợp transaction của B5/B10 sẽ đánh giá tại task tương ứng.
- C3 phân biệt thiếu dòng; không tự thiết kế lại miền giá trị hay quy tắc cột thiếu. Schema hiện tại có NOT NULL, miền giá trị ứng dụng thuộc B5. Nếu phát hiện dữ liệu legacy thiếu cột cần dùng thì ghi evidence và hỏi trước khi bổ sung hành vi.
- Cảnh báo count tại `onApplicationBootstrap()` của service, một lần cho mỗi vòng khởi động ứng dụng; có dòng thì không cảnh báo thiếu cấu hình. Lỗi DB không bị nuốt.
- Không dùng `@Global()`: module được import rõ ràng bởi AppModule và các consumer sau này.

### Decisions

- Giữ NestJS + TypeORM hiện có, không thêm dependency, không sửa schema/ADR.
- Q35 trong Admin TRACKING: dòng đầu tiên qua biểu mẫu Admin có audit; seed chỉ dev/demo. C3 không tạo cấu hình để vượt qua trạng thái chưa thiết lập.

## 4. Core-feature impact

- Affected flow: đọc cấu hình dùng chung cho B5 và các nghiệp vụ sau; C3 chưa thay đổi controller nghiệp vụ.
- API khởi động thêm truy vấn count và cảnh báo khi thiếu dòng; không tự làm hệ thống mất khả năng khởi động vì thiếu cấu hình.
- Compatibility: không đổi schema/API hiện có. Không biến service này thành API công khai; quyền của từng caller do task của caller thực thi.

## 5. Proposed approach

- Backend repository: inject TypeORM DataSource theo convention hiện tại; đọc entity theo `id = 1` và đếm dòng singleton qua ORM. Repository giữ truy vấn, không chứa thông báo/lỗi nghiệp vụ.
- Backend service: điều phối `get()`/`getOrThrow()`, dùng AppException và Logger; hook kiểm khởi động chỉ cảnh báo thiếu dòng, không log nội dung cấu hình hay thông tin kết nối.
- Module: register repository/service, chỉ export service, import vào AppModule. Repository inject DataSource toàn cục đã có từ DatabaseModule, nên không cần thêm `TypeOrmModule.forFeature`.
- Data: SELECT-only ở runtime C3; không seed, migrate, update hoặc delete DB dev/chia sẻ.
- Security/privacy: không đọc .env hay thông tin bệnh nhân, không log dữ liệu cấu hình/SQL/credential; không tạo endpoint hoặc permission mới.
- Frontend / integration / AI: không thay đổi.

## 6. Work breakdown

| ID | Task | Output/evidence | Depends on | Parallel with |
|---|---|---|---|---|
| T1 | Khảo sát issue, source, schema và lập plan | Contract, scope, evidence và rủi ro test DB đã ghi | — | — |
| T2 | Repository + service + module + wiring | Đọc singleton, 409, hook cảnh báo, export | Duyệt plan | — |
| T3 | Unit và module tests | CH-10 phần service, lỗi hạ tầng, warning, export, không cache | T2 | — |
| T4 | MySQL integration trên DB mới riêng | Đọc null/row, kiểu JSON/decimal, đọc lại sau thay đổi, không tự tạo dòng | T2, T3 | — |
| T5 | Kiểm chứng, review và cập nhật tài liệu | Lint/build/tests, diff, tracker Admin và giới hạn rõ ràng | T3, T4 | — |

## 7. Expected file/module impact

- Create: `apps/api/src/admin/system-config/system-config.repository.ts`, `system-config.service.ts`, `system-config.module.ts`.
- Create: test trong `apps/api/src/admin/system-config/test/` (service/module unit và MySQL integration). Giữ test ngoài runtime theo cách bố trí vừa dùng cho P6/P7.
- Modify khi implement: `apps/api/src/app.module.ts`, `docs/features/admin/TRACKING.md`, dòng C3 trong `docs/features/admin/PLAN.md` nếu cần phản ánh tiến độ; cùng hai artifact C3.
- Không sửa: entity/migration/schema, frontend, auth, P7, package/lock, .env, các tài liệu thiết kế gốc.
- `AI_USAGE_LOG.md`: chỉ soạn dòng gợi ý khi bàn giao; chỉ sửa khi người dùng cho phép theo AGENTS repo. Commit/push/PR do thành viên thực hiện.

## 8. Verification

- Unit: CH-10 phần service khi thiếu dòng; có dòng giữ đủ giá trị kể cả giá trị 0 hợp lệ; 409 đúng mã/thông báo; DB rejection không bị đổi thành 409; không cache kết quả có/không có; hook warning khi thiếu, không warning khi có; module export inject được từ consumer test.
- Integration: MySQL thật trong DB/container test mới riêng; tên DB kết thúc `_test`; kiểm cả null, đọc row, JSON/decimal và thay đổi sau commit. Chỉ ghi fixture do test tạo. Không reset DB dev/chia sẻ hoặc tái sử dụng DB test đang có dữ liệu.
- Commands đã tìm thấy trong `apps/api/package.json`: `npm test -- src/admin/system-config`, `npm run lint`, `npm run build`; `npm run test:int -- src/admin/system-config` chỉ sau khi cấu hình DB mới riêng và kiểm global setup.
- Kiểm typecheck theo compiler config và executable local khi implement; không cài thêm package để chạy kiểm chứng.
- Sau tập focused xanh, chạy unit API để bắt hồi quy wiring AppModule. Chỉ chạy integration rộng hơn nếu cần và bảo đảm DB riêng.
- E2E: chưa có endpoint C3; không tạo endpoint giả trong runtime. CH-10 phần GET `chuaCauHinh` và CN-55 phần approve để lại B5/B10, không báo phủ toàn bộ các ca đó.
- PLAN hiện tại: chỉ review artifact + `git diff --check`, không chạy build/test và không thao tác DB.

## 9. Completion criteria

- [x] Người dùng duyệt plan trước code.
- [x] Acceptance criteria C3 đạt; module export được dùng qua import rõ ràng.
- [x] Lint/build/typecheck/format/unit/MySQL integration pass; evidence tại tracker.
- [x] Không thêm migration, seed, dependency; fixture chỉ DB test mới riêng.
- [x] Tracker C3 và Admin cập nhật evidence thật; review/merge và AI log do thành viên hoàn tất sau.
- [x] Cách dùng: import `SystemConfigModule` trong module consumer, inject `SystemConfigService`, dùng `get()` khi cho phép thiếu hoặc `getOrThrow()` khi bắt buộc. Giới hạn: chưa có GET/PUT B5 hay approval B10. Gợi ý PR `feat(admin): thêm service đọc cấu hình hệ thống` (`Closes #53`).
