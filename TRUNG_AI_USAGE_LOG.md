# Nhật ký sử dụng AI — Trung

Phân công: **Đại (MaxTrann)** phụ trách auth; **Trung** phụ trách admin. Các dòng lịch sử giữ theo cột “Người dùng”; dòng lập kế hoạch admin do MaxTrann thực hiện vẫn nằm trong nhật ký của Đại. Mã AI-BUG-nnn dùng chung toàn repo.

Minh chứng cho tiêu chí **TC2.3** của rubric. Điền **ngay khi dùng**, không viết bù cuối kỳ — hội đồng
đối chiếu nhật ký này với lịch sử commit và với phần vấn đáp.

Quy ước:
- Mỗi lần dùng AI có ảnh hưởng đến repo (mã, test, cấu hình, tài liệu) = một dòng ở bảng 1.
- Bảng 1 luôn xếp mục mới nhất trước; mục mới chèn ở đầu bảng và giữ nguyên số mục để các tài liệu tham chiếu không đổi.
- Mỗi lỗi/ảo giác của AI mà nhóm tự phát hiện = một dòng ở bảng 2, kèm commit sửa. Mục tiêu rubric Mức 5: **≥ 5 lỗi tính gộp hai nhật ký**.
- Cột "Commit sửa" ở bảng 2 ghi PR/commit đã sửa lỗi; mô tả PR nêu mã `AI-BUG-nnn` tương ứng.

## 1. Nhật ký sử dụng

| # | Ngày | Người dùng | Công cụ / model | Phạm vi (module/file) | Prompt chính | Phần AI sinh | Phần tự sửa/viết | Cách kiểm chứng | Commit/PR |
|---|------|-----------|-----------------|-----------------------|--------------|--------------|------------------|-----------------|-----------|
| 7 | 27/10/2026 | Trung | Codex (GPT-6) | Admin P4 #48: `apps/api/src/admin/testing/*`, `working-doc/P4/*`, tracking admin | Triển khai P4 sau khi xác nhận P3 hoàn tất; ghi nhật ký vào file của Trung | Factory DB test, helper Date/mail/chạy đua, 3 unit và 6 integration test, plan/tracker | Chọn nơi ghi nhật ký; phần review mã do người dùng thực hiện sau bàn giao | API lint/build pass, unit 273/273; MySQL test:int 101/101 (7 file, gồm 6 ca P4); web lint/build và test 1/1; Prettier P4 pass. MailService thật chưa có: mock hàm typed, chưa ghép provider; không gửi mail | Chưa commit/PR; người dùng tự thực hiện |
| 6 | 27/10/2026 | Trung | Codex (GPT-6) | Admin P3 #47: `apps/api/src/admin/entities/*`, `apps/api/src/database/*`, `docs/database/*`, `docs/features/admin/PLAN.md`, `TRACKING.md` | Triển khai lại migration vận hành P3; dùng toàn bộ tên audit PLAN 5.10 | 7 entity, migration 42 câu DDL, test/parity, đồng bộ ba tài liệu schema và tracking | Chọn toàn bộ danh sách PLAN 5.10; review thay đổi | API lint/build pass; unit 212/212; test:int 42/42 trên MySQL | Chưa có commit/PR; người dùng tự commit/push và tạo PR |
| 5 | 27/10/2026 | Trung | Codex (GPT-6) | DAI_AI_USAGE_LOG.md, TRUNG_AI_USAGE_LOG.md | Khôi phục hai nhật ký đã tách theo thành viên; giữ nguyên lịch sử và yêu cầu nhật ký Trung xếp mục mới nhất trước | Khôi phục hai file từ bản sao stash; thêm bản ghi lần sử dụng hiện tại lên đầu nhật ký Trung, giữ nguyên số mục lịch sử | Yêu cầu tạo lại hai file và ưu tiên mục mới nhất ở đầu nhật ký Trung | Đối chiếu hai file với bản stash; kiểm bảng Trung theo thứ tự #5, #4, #3, #2, #1 | Chưa có commit/PR |
| 4 | 27/10/2026 | Trung | Codex | `TRUNG_AI_USAGE_LOG.md` (quy ước sắp xếp nhật ký) | Sắp xếp nhật ký của Trung theo thứ tự mới nhất trước và chèn mục mới ở đầu bảng | Thêm quy ước thứ tự giảm dần; đặt mục mới nhất lên đầu, giữ nguyên mã số các mục cũ | Yêu cầu ưu tiên mục mới trước; rà soát nội dung và thứ tự sau chỉnh sửa | Kiểm tra thứ tự #4, #3, #2, #1 và xác nhận không có khoảng trắng thừa | Chưa có commit/PR; Trung tự commit/push theo quy trình |
| 3 | 27/10/2026 | Trung | Codex (GPT-6) | Tách nhật ký AI theo thành viên và cập nhật liên kết trong AGENTS.md, README.md, CONTRIBUTING.md cùng tài liệu liên quan | Chia log gộp thành nhật ký của Đại/auth và Trung/admin, giữ nguyên người thực hiện trong lịch sử | Hai file nhật ký riêng và các tham chiếu theo người/module | Xác nhận phân công Đại phụ trách auth, Trung phụ trách admin | Đối chiếu đủ bản ghi cũ, mã AI-BUG và các tham chiếu tên file | Chưa có commit/PR |
| 2 | 27/10/2026 | Trung | Codex (GPT-6) | `apps/api/src/admin/entities/*`, `apps/api/src/database/*`, `docs/features/admin/TRACKING.md` (P2, issue #46) | Thêm migration và entity cho nhân sự, phụ phí và các bảng nền theo issue #46; giữ parity với `clinix_mysql.sql`, gồm CHECK, cột sinh UNIQUE và khóa ngoại kép | Enum/type P2, 8 entity, migration 48 câu DDL, đăng ký TypeORM, kiểm tra source migration và vòng đời migration, cập nhật parity/TRACKING | Cung cấp issue #46 và yêu cầu tiếp tục P2 trên nhánh `feat/admin-p2`; bật Docker và yêu cầu chạy test | `npm.cmd run lint`, API/web build, `npm.cmd test` (API 210/210, web 1/1), Prettier TypeScript P2 pass; `npm.cmd run test:int` 39/39 pass trên MySQL thật, gồm up/down và so `SHOW CREATE TABLE`; lọc bảng nội bộ TypeORM trong phép parity (AI-BUG-006) | Chưa mở PR; người dùng tự commit/push và mở PR để người còn lại review/squash merge |
| 1 | 26/10/2026 | Trung | Codex | `apps/api/src/admin/entities/*`, `apps/api/src/database/*`, `docs/database/*`, `docs/features/admin/TRACKING.md` (P1, issue #45) | Triển khai sáu entity và migration danh mục theo issue #45; bảo đảm parity với `clinix_mysql.sql`, kiểm tra Q12/Q16 và tiền kiểm dữ liệu trùng CK-18/DV-21 | Sáu entity, enum trạng thái, migration DDL, đăng ký entity/migration, kiểm thử parity và tiền kiểm dữ liệu, đồng bộ ba tài liệu schema; làm rõ service chịu trách nhiệm chuẩn hóa khoảng trắng trước UNIQUE | Cung cấp nội dung issue #45; chọn dừng và liệt kê bảng P1 có sẵn để đối chiếu thủ công; yêu cầu chạy test tích hợp trên DB test; review và mở PR do người dùng thực hiện | `npm run build`, `npm run lint`, `npm test` (18/18); unit xác nhận từng câu DDL khớp SQL chính thức. `npm run test:int`: 4 file, 34/34 pass trên MySQL 8.4, gồm CK-18/DV-21, vòng đời migration và SHOW CREATE TABLE của 11 bảng | Chưa mở PR; người dùng tự commit/push và tạo PR |

## 2. Lỗi / ảo giác của AI đã phát hiện

| Mã | Ngày | Mô tả lỗi | Nguyên nhân (phân tích) | Cách phát hiện | Commit sửa |
|----|------|-----------|--------------------------|----------------|------------|
| AI-BUG-006 | 27/10/2026 | Test schema parity tính bảng nội bộ `typeorm_metadata` là bảng nghiệp vụ sau khi migration có cột sinh, làm kiểm tra danh sách bảng fail | Bộ lọc chỉ bỏ bảng `migrations`, chưa tính việc TypeORM tạo `typeorm_metadata` khi có entity khai báo generated column; test này chưa chạy được khi Docker tắt | Lần chạy integration đầu trên Docker: `schema-parity.int-spec` báo thừa `typeorm_metadata`; cập nhật bộ lọc bỏ hai bảng nội bộ và chạy lại 5 file, 39/39 pass | Chờ thành viên commit; ghi mã `AI-BUG-006` trong commit sửa |

## 3. Quy trình kiểm soát đầu ra AI

<!-- Mức 5 yêu cầu quy trình thành hệ thống. Điền khi nhóm chốt, ví dụ: -->
- Review bằng checklist ở `.github/PULL_REQUEST_TEMPLATE.md` cho mọi PR có AI.
- Đối chiếu API/thư viện với tài liệu chính thức trước khi chấp nhận.
- Kiểm tra giấy phép khi AI đề xuất thư viện hoặc đoạn mã dài.
- Không đưa dữ liệu bệnh nhân thật, secret, khóa API vào prompt.
