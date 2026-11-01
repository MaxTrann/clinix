# B4 — Cập nhật thông tin phòng khám (backend)

Status: IMPLEMENT backend locally complete — checks pass; D5 Word sync pending  
Mode: IMPLEMENT  
Owner: Trung  
Updated: 2026-11-01

## 1. Goal and scope

- Goal: triển khai issue [#58](https://github.com/MaxTrann/clinix/issues/58), API đọc/cập nhật thông tin phòng khám dùng singleton `id = 1`.
- In scope: `GET/PUT /admin/clinic-info`; xác thực Admin Toàn hệ thống cho cả hai route; validate 4 trường theo Q33; upsert không tạo dòng thứ hai khi gọi đồng thời; unit, MySQL integration và HTTP authorization tests; cập nhật Admin PLAN/TRACKING.
- Out of scope: F4/frontend; schema/migration (bảng và entity đã có); thay đổi B3; đồng bộ D5 vào Word ở repo khác nếu chưa có file/nội dung; ghi `AI_USAGE_LOG.md` (thành viên tự ghi theo `AGENTS.md`); commit/push/PR/merge/rebase.
- Acceptance criteria:
  - Chỉ Admin Toàn hệ thống gọi được GET và PUT; scope Chi nhánh nhận 403; actor khác và request không đăng nhập theo guard hiện hành.
  - PUT nhận đủ `tenThuongHieu`, `diaChiTruSo`, `duongDayNong`, `email`; field lạ/thiếu/sai định dạng bị từ chối; `tenThuongHieu` tối đa 100, `diaChiTruSo` tối đa 255.
  - Hotline chuẩn hoá theo Q33: bỏ khoảng trắng/dấu chấm/gạch trước khi kiểm và lưu; cho số di động 10 chữ số bắt đầu bằng 0 hoặc tổng đài 1800/1900 + 4–6 số.
  - Email theo chính sách auth S5: trim ASCII whitespace hai đầu, chuyển domain về chữ thường, còn whitespace bên trong thì từ chối.
  - Lần PUT đầu tạo `id = 1`; lần sau cập nhật cùng dòng; PUT đồng thời vẫn để một dòng hợp lệ.
  - GET khi chưa có dòng trả 200 với bốn field đều `null`.
  - PUT nhận và GET/PUT trả đúng bốn field camelCase; không public `id`.

## 2. Evidence and context

- Task input: issue #58, Admin PLAN B4, Q33, PK-01…PK-09; B3 tracker/plan được đọc để xác nhận handoff.
- VERIFIED: issue #58 đang Open; phụ thuộc P3 #47 và C1 #52; acceptance dẫn PK-01…PK-09 và D5.
- VERIFIED: `main` đã chứa P3 (`682c289`) và C1 (`6916371`); B4 không phụ thuộc B3.
- VERIFIED: entity `ThongTinPhongKham` và bảng `thong_tin_phong_kham` đã tồn tại với khoá chính `id`, CHECK `id = 1`, bốn cột nullable: tên thương hiệu, địa chỉ, hotline, email. Không cần DDL.
- VERIFIED: B3 branch commit `6a976b9` chưa nằm trong `main`; branch hiện tại `feat/admin-b4` đang trỏ cùng commit và working tree `clinix` sạch. PR B4 sẽ kèm B3 cho tới khi thành viên tách/rebase branch sau khi B3 merge.
- VERIFIED: C1 guard/policy thật đã được merge; controller admin dùng `@Roles('QuanTriVien')` và `@RequireAdminScope('ToanHeThong')`.
- VERIFIED: người dùng chốt GET chưa cấu hình trả object bốn field null; dùng email policy auth S5; response không có `id` (2026-11-01).
- UNKNOWN: D5 Word gốc nằm ở repo khác; chưa có file/nội dung trong checkout hiện tại để đồng bộ.

## 3. Questions, assumptions and decisions

### Questions requiring an answer

- None. Người dùng đã chốt ba điểm tại lượt hiện tại.

### Assumptions

- Không thêm audit vì issue/plan không yêu cầu.
- Không sửa dữ liệu seed hoặc migration; repository/service chỉ thao tác row `id = 1`.
- D5 Word vẫn pending cho tới khi thành viên đồng bộ tài liệu ở repo chứa 2.4.

### Decisions

- Existing Accepted ADR: không cần ADR mới; dùng NestJS/TypeORM và C1 đã có trong source.
- GET chưa có row: 200 `{tenThuongHieu:null,diaChiTruSo:null,duongDayNong:null,email:null}`.
- Email dùng shared auth S5: trim ASCII whitespace hai đầu, lowercase domain; whitespace bên trong không hợp lệ.
- Request/response public chỉ có bốn field camelCase; không trả `id`.

## 4. Core-feature impact

- Does this change core behavior? Yes.
- Affected actors/flows: Admin Toàn hệ thống cập nhật thông tin chung của phòng khám; F4 sẽ đọc contract này.
- Reason: dữ liệu cấu hình được dùng để hiển thị thông tin thương hiệu/liên hệ.
- Backward-compatibility risk: API mới; bảng hiện có nullable để tương thích dữ liệu chưa thiết lập.

## 5. Proposed approach

- Frontend: không thuộc B4; F4 tiêu thụ API sau.
- Backend: DTO allowlist + validation → controller mỏng → service giữ rule/upsert → repository query bằng TypeORM; dùng `BranchAccessPolicy`/C1 guard thật.
- Data: không migration; mọi thao tác trên một row singleton `id = 1`; bảo đảm upsert atomic dưới MySQL.
- Integration/AI: không gọi vendor/LLM.
- Security/privacy: chỉ role `QuanTriVien` có scope `ToanHeThong`; không log payload email/hotline.

## 6. Work breakdown

| ID | Task | Output/evidence | Depends on | Parallel with |
|---|---|---|---|---|
| T1 | Đối chiếu issue, plan, B3 handoff, source/schema và dependencies | Evidence ở mục 2 | — | — |
| T2 | Chốt GET-empty, email whitespace và response shape | Người dùng xác nhận ba điểm; ghi vào mục 3 | T1 | — |
| T3 | DTO, repository, service, controller, module và unit tests | Behavior PK-03…06, upsert rules | T2 | — |
| T4 | MySQL integration + HTTP tests | PK-01…02, PK-07…09 và PK-08 | T3 | — |
| T5 | Review diff, checks và cập nhật Admin PLAN/TRACKING/tracker | Evidence local; D5 Word pending nếu thiếu nguồn | T4 | — |

## 7. Expected file/module impact

- Create: `apps/api/src/admin/clinic-info/*`; tests cạnh module và HTTP test trong `apps/api/test`; `working-doc/B4/plan.md`, `working-doc/B4/tracker.md`.
- Modify: `apps/api/src/app.module.ts`; `docs/features/admin/PLAN.md`, `docs/features/admin/TRACKING.md`.
- Do not touch: schema/migrations, auth implementation, B1–B3 code, frontend, `.env*`, lockfiles, AI usage log, root tracker.

## 8. Verification

- Unit: email/hotline/required/length/unknown-field DTO cases PK-03…06.
- Integration: MySQL thật, singleton first write/update/concurrent PUT PK-01/02/09.
- E2E: AppModule thật, C1 scope/role/auth PK-07/08 và GET/PUT response.
- Lint/typecheck/build: dùng scripts đã xác minh trong `apps/api/package.json`; Prettier chỉ scope file B4.
- Manual check: D5 Word do thành viên cập nhật ở repo nguồn; không claim đã sync.

## 9. Completion criteria

- [x] Backend acceptance PK-01…09 met; D5 Word vẫn pending ngoài checkout.
- [x] Relevant unit, MySQL integration, HTTP tests and focused quality checks pass.
- [x] Security/privacy/data risks reviewed; no schema or migration changed.
- [x] Tracker and local Admin documentation updated.

Local backend work is complete. D5 Word sync, CI, PR/review/merge remain outside this checkout; no Git publication was performed. The current branch still has B3 as its parent, so the member must rebase/split B4 after B3 is merged before opening a one-issue PR.
