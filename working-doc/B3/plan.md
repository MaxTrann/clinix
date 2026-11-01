# B3 — Quản lý dịch vụ khám (backend)

Status: IMPLEMENT backend locally complete — unit, MySQL integration, and HTTP checks pass; D2 Word sync remains pending  
Mode: IMPLEMENT  
Owner: Trung  
Updated: 2026-11-01

## 1. Goal and scope

- Triển khai issue #57 theo `docs/features/admin/PLAN.md` mục 5.3, 6.4 và 7.2; chỉ quản lý dịch vụ khám ở backend.
- In scope: `GET /admin/services`, `GET /admin/services/:id`, `POST /admin/services`, `PATCH /admin/services/:id`; phân trang/tìm kiếm, kiểm nhóm, kiểm dữ liệu, quyền theo Q11, tên duy nhất theo nhóm và cổng chặn đổi thời lượng theo Q16.
- Out of scope: frontend/F3, xóa dịch vụ, bật/tắt trạng thái, thay đổi schema/migration, thay đổi `muc_dat_coc`/chính sách hoàn tiền, booking/schedule endpoint, seed, dữ liệu dùng chung, Git publication.
- Acceptance criteria:
  - Admin Chi nhánh và Admin Toàn hệ thống đều đọc được; chỉ Admin Toàn hệ thống được tạo/sửa.
  - Nhóm dịch vụ phải tồn tại; tên sau chuẩn hóa không rỗng và duy nhất trong cùng nhóm; trùng tên trả `TEN_DICH_VU_TRUNG` kể cả khi chạy đua.
  - Giá mặc định lớn hơn 0, tối đa theo `decimal(12,2)` và không quá hai số lẻ; thời lượng là số nguyên dương trong miền `INT`.
  - Payload lạ bị từ chối; đặc biệt không nhận `mucDatCoc` hoặc `chinhSachHoan`.
  - Không đổi `thoi_luong` khi còn lịch hẹn hoạt động hoặc khung giờ tương lai phụ thuộc dịch vụ; trả `THOI_LUONG_DANG_DUNG` và không lưu một phần. Sửa tên/giá/nhóm khi thời lượng đang được dùng vẫn được.
  - Cập nhật giá dịch vụ không sửa `lich_hen.gia_snapshot`; không có endpoint xóa dịch vụ.
  - Unit, MySQL integration và HTTP tests phủ các ca backend được issue dẫn: DV-07…15, DV-18…20; DV-16 phủ quyền đọc/ghi cho hai scope.

## 2. Evidence and context

- VERIFIED: issue [#57](https://github.com/MaxTrann/clinix/issues/57) còn mở; mô tả list/create/update, phụ thuộc B2 #56 và P2 #46, test DV-07…15/DV-18…20, D2 đồng bộ tài liệu.
- VERIFIED: checkout `feat/admin-b3` sạch khi bắt đầu. Lịch sử hiện tại có B2 merge `d7c27aa`, P2 migration/entity `5ffbd24`, P1 catalog `9464aee`; các phụ thuộc code có trong branch.
- VERIFIED: endpoint/permission, Q11/Q16 và test mong đợi nằm tại `docs/features/admin/PLAN.md:197,202,444-487,711-717,820-844`.
- VERIFIED: `DichVuKham` có bigint ID, nhóm, tên, thời lượng, giá decimal dạng chuỗi và UNIQUE `(nhom_dich_vu_id, ten)` tại `apps/api/src/admin/entities/dich-vu-kham.entity.ts`; canonical SQL/index ở `docs/database/clinix_mysql.sql:230-240,576`.
- VERIFIED: các entity P2 `BacSi`, `LichLamViec`, `KhungGio`, `LichHen` hiện có; active appointment statuses được nêu tại Admin PLAN 5.7; thời gian ứng dụng dùng `nowVN()`.
- VERIFIED: B1/B2 đã thiết lập controller/service/repository, C1 scope policy thật, P6 paging, MySQL fixtures và HTTP test patterns. Auth handoff `docs/features/auth/TRACKING.md` mục 5 xác nhận guard auth toàn cục; controller khai báo role/scope theo convention.
- VERIFIED: người dùng chốt API contract mục 3 ngày 2026-11-01.
- UNKNOWN: tài liệu 2.4 gốc (Word) ở repo khác không có trong checkout `clinix`; không sửa hoặc suy diễn nội dung đó.
- VERIFIED: unit B3 27/27; MySQL integration 9/9 và HTTP 6/6 trên MySQL 8.4.13 test riêng tại `127.0.0.1:33314`; `clinix-db-1` đã dừng theo yêu cầu và không được kết nối.
- VERIFIED: API lint, build, typecheck và Prettier scope B3 pass; không thay đổi schema/migration.

## 3. API contract — người dùng chốt ngày 2026-11-01

- GET list nhận `page`, `pageSize`, `q?` theo P6; `q` tìm tên dịch vụ. Trả `{items,total,page,pageSize}`. Mỗi item gồm `{dichVuKhamId,nhomDichVuId,tenNhom,ten,thoiLuong,giaMacDinh}`; ID bigint và giá decimal là chuỗi. Sắp theo `nhom_dich_vu.thu_tu_hien_thi`, tên dịch vụ, rồi ID.
- GET detail trả cùng shape item; ID bigint dạng chuỗi.
- POST nhận `{nhomDichVuId,ten,thoiLuong,giaMacDinh}`; PATCH nhận một hoặc nhiều trường này, trường bị bỏ qua giữ nguyên. `nhomDichVuId` là chuỗi bigint; `giaMacDinh` là decimal string để giữ chính xác; `thoiLuong` là JSON integer.
- `ten` trim/gộp khoảng trắng như Q12/H14; tên rỗng trả 400. `mucDatCoc`/`chinhSachHoan` và mọi field lạ trả 400 do whitelist.
- GET dùng được ở cả hai scope; POST/PATCH chỉ Toàn hệ thống; lỗi auth/scope theo C1.

## 4. Core-feature impact and data/security

- Giá dịch vụ mới chỉ ảnh hưởng lần đặt sau; `gia_snapshot` của lịch hẹn cũ giữ nguyên.
- Thời lượng dịch vụ đang được dùng ảnh hưởng khung giờ đã sinh; kiểm tra lịch/khung giờ trước khi ghi và trong transaction theo Q16. Không truy vấn hoặc trả thông tin định danh bệnh nhân.
- Không đổi DDL: UNIQUE tên trong nhóm và FK hiện hữu đã được đăng ký; lỗi UNIQUE/FK dự kiến phải được ánh xạ thành lỗi nghiệp vụ, lỗi DB khác giữ nguyên 500 chuẩn hóa.
- Không thêm log dữ liệu lịch hẹn, dữ liệu cá nhân, secret hoặc payload nhạy cảm.
- Rủi ro: writer tạo lịch/khung giờ của module booking/schedule chưa thấy trong checkout; nếu được thêm sau này phải tôn trọng cùng hợp đồng chặn thay đổi thời lượng.

## 5. Proposed approach

1. Contract list/body/response đã được người dùng chốt; không mở rộng thêm field ngoài mục 3.
2. DTO: strict whitelist, validation ID bigint/name/price/duration; dùng mã lỗi ổn định và escape LIKE từ P6.
3. Repository: query parameterized; cùng snapshot cho items/total; giữ bigint/decimal dạng chuỗi; dùng index UNIQUE đã có để xử lý race.
4. Service: policy C1, transaction cho POST/PATCH, kiểm nhóm tồn tại; khi thay đổi thời lượng kiểm lịch hẹn đang hoạt động và khung giờ tương lai phụ thuộc; phân loại lỗi UNIQUE/nhóm không tồn tại/lịch đang dùng.
5. Controller mỏng và module riêng; đăng ký trong `AppModule`; không thêm guard giả hoặc bỏ qua scope.
6. Test theo mã DV, gồm DTO/unit, MySQL thật cho UNIQUE/FK/snapshot/blocker/rollback/race, HTTP AppModule cho auth/scope/validation/status/body.
7. Sau verification, cập nhật Admin PLAN/TRACKING và tracker B3. D2 Word chỉ đồng bộ khi người dùng cung cấp nội dung/đường dẫn hợp lệ hoặc thành viên tự cập nhật.

## 6. Work breakdown

| ID | Task | Output/evidence | Depends on |
|---|---|---|---|
| T1 | Kiểm issue, plan/tracker, source/schema và dependency | Kết quả khảo sát ở đây | — |
| T2 | Chốt API contract còn thiếu | Quyết định người dùng, cập nhật plan | T1 |
| T3 | DTO/repository/service/controller/module + unit tests | B3 source, test DV | T2 |
| T4 | MySQL integration + HTTP authorization tests | DV-07…15/DV-18…20, DV-16 backend | T3 |
| T5 | Lint/build/typecheck/format, review diff, đồng bộ local docs/tracker | Evidence và handoff | T4 |

## 7. Expected file impact

- Tạo `apps/api/src/admin/services/service.{dto,repository,service,controller,module}.ts` và tests cạnh source.
- Tạo `apps/api/test/admin-services.e2e-spec.ts`; sửa `apps/api/src/app.module.ts`.
- Cập nhật `docs/features/admin/PLAN.md`, `docs/features/admin/TRACKING.md`, `working-doc/B3/plan.md`, `working-doc/B3/tracker.md`.
- Không sửa schema/migration, auth, B1/B2 implementation, frontend, dependency, env, AI log (thành viên tự ghi theo AGENTS).

## 8. Verification

- API unit: DTO boundaries, name normalization, group validation mapping, scope policy, duration blocker/error mapping, duplicate mapping.
- MySQL integration: DV-07/08/10/11/12/13/14/15/20; real UNIQUE race and FK; assert rollback and old appointment price snapshot unchanged.
- HTTP: DV-16/18/19 + validation, ID, 201/200/400/401/403/404/409, unknown-field rejection and response shape using real auth/C1 and `configureApp`.
- Chỉ dùng DB test mới riêng sau khi xác minh cấu hình; không reset DB dev/chia sẻ.
- Commands available in `apps/api/package.json`: `npm test -- ...`, `npm run test:int -- ...`, `npm run test:e2e -- ...`, `npm run lint`, `npm run build`, `npm exec -- tsc --noEmit`, `npm exec -- prettier --check ...`.
- D2 Word/browser, full test suites, CI, PR review/merge are not claimed from focused backend checks.

## 9. Completion criteria

- [x] Người dùng chốt API contract ở mục 3 ngày 2026-11-01.
- [x] Source cùng unit/MySQL/HTTP tests đáp ứng các acceptance backend B3 đã chốt; focused regression pass.
- [x] Unit 27/27, MySQL 9/9, HTTP 6/6, lint, build, typecheck, format scope B3 và `git diff --check` pass.
- [x] Review diff; Admin PLAN/TRACKING và B3 tracker phản ánh evidence local.
- [ ] Thành viên đồng bộ D2 Word, ghi AI usage, tự commit/PR; không tự push/merge/đóng issue.
