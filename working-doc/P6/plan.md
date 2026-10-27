# P6 — Phân trang và tìm kiếm dùng chung

Status: In progress  
Mode: IMPLEMENT  
Owner: Trung  
Updated: 2026-10-27

## 1. Goal and scope

- Goal: cung cấp hạ tầng phân trang/tìm kiếm dùng chung theo issue #50 và Q42.
- In scope: `apps/api/src/common/paging/`, `PageQueryDto`, `Paged<T>`, helper escape LIKE and unit/MySQL integration tests.
- Out of scope: endpoint danh sách, lọc vai trò/chi nhánh, frontend, schema/migration, dependency, Git commit/push/PR.
- Acceptance criteria:
  - Query phân trang dùng offset; `page` bắt đầu từ 1, `pageSize` mặc định 20 và tối đa 100.
  - DTO kiểm đầu vào qua cơ chế class-transformer/class-validator và ValidationPipe hiện có; lỗi có mã ổn định.
  - `Paged<T>` mô tả `{ items, total, page, pageSize }`.
  - Helper escape ký tự đại diện `%`, `_` và ký tự escape; truy vấn sử dụng tham số, không ghép đầu vào vào SQL.
  - Unit covers TK-05 DTO boundaries and TK-06 escaping; MySQL integration proves LIKE wildcards match literally while quote/comment punctuation stays parameterized.
  - Record CK-17 and full TK-06 endpoint coverage as future consumer work.

## 2. Evidence and context

- Issue: https://github.com/MaxTrann/clinix/issues/50 (đã đọc ngày 27/10/2026).
- `VERIFIED`: Admin PLAN dòng P6, Q42 và mục 5.8; TRACKING quyết định Q42; test CK-17, TK-05, TK-06.
- `VERIFIED`: P5 được tracking ghi Pass; `working-doc/P5/tracker.md` ghi hoàn tất local. Không chạy lại P5 trong lần khảo sát này.
- `VERIFIED`: source dùng NestJS, TypeORM, class-validator, class-transformer, Vitest; `src/app.setup.ts` bật transform/whitelist và từ chối trường lạ.
- `VERIFIED`: auth TRACKING mục 5 yêu cầu dùng lỗi chuẩn hóa hiện có; không sửa lỗi/log/auth của đồng đội.
- `VERIFIED`: checkout `main`, sạch trước khảo sát. AGENTS.md yêu cầu người dùng tạo nhánh và không làm code trên main.
- `VERIFIED`: focused unit tests pass 11/11; API lint/build pass.
- `UNKNOWN`: MySQL integration result; local Docker engine is unavailable. The integration spec uses read-only SELECTs, but the standard integration harness recreates `clinix_test`.
- `UNKNOWN`: TK-05 behavior for a page beyond the result count belongs to a list endpoint, which P6 does not implement.
- Reference workspace có ví dụ Prisma/Zod khác source hiện tại; giữ stack NestJS/TypeORM đã chốt trong repo, không thay kiến trúc.

## 3. Questions, assumptions and decisions

- Checkout đã ở nhánh `feat/admin-p6`.
- Giả định TASK_ID là `P6`, theo quy ước P4/P5 đang có.
- Chi tiết triển khai dự kiến: khi thiếu `page` dùng 1; đầu vào phân trang sai trả 400 theo lựa chọn được TK-05 cho phép; không tự clamp 101 về 100.
- Không thêm tham số sort/order: Q42 yêu cầu sắp xếp cố định, từng repository sau này sở hữu thứ tự cụ thể.
- Không tự chốt giới hạn độ dài hoặc chuẩn hóa nghiệp vụ của `q` khi tài liệu chưa quy định; nếu cần đổi contract thì hỏi trước.
- Người dùng đã yêu cầu triển khai P6.

## 4. Core-feature impact

- Chưa thay hành vi endpoint đang chạy; các task danh sách sẽ tái sử dụng hạ tầng.
- `items` và `total` phải dùng cùng phạm vi tại repository của consumer; P6 không thay thế kiểm quyền.
- Backward compatibility: chỉ thêm thành phần dùng chung, không đổi response của route hiện hữu.

## 5. Proposed approach

- Backend: DTO query, kiểu response và helper thuần trong `common/paging`; tên file kebab-case, import tương đối đuôi `.js`.
- Data: không DDL, migration hoặc dữ liệu nghiệp vụ; kiểm LIKE trên dữ liệu mẫu bằng truy vấn tham số hóa.
- Security/privacy: không log query/PII; escape LIKE không thay thế parameter binding và authorization.
- Frontend/integration AI: không thay đổi.

## 6. Work breakdown

| ID | Task | Output/evidence | Depends on | Parallel with |
|---|---|---|---|---|
| T1 | Đối chiếu tracking, issue, source và nhánh | Scope xác định; checkout ở nhánh feature | — | — |
| T2 | Viết DTO, kiểu response và helper | Source dùng chung; theo convention Nest/class-validator hiện có | T1 | — |
| T3 | Thêm/chạy test TK-05 và TK-06 | Unit tests added/passed; MySQL integration spec added, execution needs local DB | T2 | — |
| T4 | Review, lint/build và cập nhật tracking | Ghi kết quả thật, chưa xác nhận integration | T2, T3 | — |

## 7. Expected file/module impact

- Create: `apps/api/src/common/paging/` chứa DTO, kiểu, helper, unit tests và một MySQL integration spec chỉ dùng SELECT.
- Modify: `docs/features/admin/TRACKING.md`, cùng plan/tracker này.
- Không sửa schema, auth, web, manifest/lockfile, env hoặc tài liệu thiết kế gốc.
- AI log: soạn nội dung cho người dùng; chỉ sửa file log khi có đồng ý theo AGENTS.md mục 5.7.

## 8. Verification

- Unit: `npm.cmd run test -- src/common/paging/page-query.dto.spec.ts src/common/paging/like-pattern.spec.ts` — pass 11/11.
- Integration: `like-pattern.int-spec.ts` uses parameterized SELECT only. Not run because MySQL/Docker is unavailable; the standard integration harness runs a global setup that drops and recreates `clinix_test`.
- Lint/build: `npm.cmd run lint`, `npm.cmd run build` trong apps/api.
- Format/diff: Prettier kiểm file P6 bằng công cụ đã cài; `git diff --check`.
- Không cần chạy lại web/P5 khi không có thay đổi liên quan.

## 9. Completion criteria

- [x] Source P6, unit tests, lint/build pass.
- [ ] MySQL integration runs; blocker is recorded in tracker.
- [ ] TK-05 result-page overflow behavior is verified by a future list endpoint consumer.
- [ ] Tracking phân biệt kiểm hạ tầng với CK-17/TK-06 endpoint chưa có.
- [ ] Người dùng nhận hướng dẫn dùng helper và nội dung commit/PR gợi ý; Git do người dùng thực hiện.
