# P4 — Hạ tầng test tích hợp admin

Status: Done (triển khai và kiểm thử local; chờ PR của người dùng)  
Mode: IMPLEMENT  
Owner: Trung  
Updated: 2026-10-27

## 1. Goal and scope

- Xây factory chi nhánh/7 thứ, danh mục, tài khoản/hồ sơ, ca, khung giờ, lịch hẹn theo trạng thái; helper đồng hồ, mail và chạy đua.
- Không đổi schema, API, nghiệp vụ, seed dev hoặc mã auth.
- Acceptance: dữ liệu fixture hợp lệ trên MySQL thật; có thể ghi đè cho ca âm/biên; helper chạy đua giữ đủ kết quả; lint/build/unit/integration pass.

## 2. Evidence and context

- Issue #48 đã đọc qua GitHub API; không có mã test riêng hoặc yêu cầu đồng bộ schema.
- VERIFIED: nhánh feat/admin-p4 sạch; P1/P2/P3 đã có trên main; hạ tầng test-database và auth-fixtures dùng lại được.
- UNKNOWN: chữ ký MailService thật (auth P4 chưa có trong source).

## 3. Questions, assumptions and decisions

- Người dùng yêu cầu ghi nhật ký vào TRUNG_AI_USAGE_LOG.md.
- Dữ liệu mặc định chỉ minh họa trong test, không phải chính sách phòng khám.
- Mock mail là hàm Vitest có kiểu do test gọi cung cấp; chưa khai báo interface MailService thật.
- Dùng DB test cục bộ và vòng đời tạo/dọn DB hiện có; không đụng DB dev.

## 4. Core-feature impact

Không đổi hành vi ứng dụng; helpers chỉ được import bởi test, không đăng ký provider sản phẩm.

## 5. Proposed approach

- Backend: thư mục admin/testing, tái dùng entity và fixture auth.
- Data: factory nhận DataSource hoặc EntityManager để dùng được trong transaction; chặn DB ngoài *_test.
- Integration: fake Date, mock hàm gửi mail có thể trả lỗi, nhóm thao tác đồng thời chờ tất cả kết thúc.
- Security/privacy: email example.com, dữ liệu mẫu; không SMTP thật, không thêm secret.

## 6. Work breakdown

| ID | Task | Output/evidence | Depends on | Parallel with |
|---|---|---|---|---|
| T1 | Factory + helper và test | Unit, integration riêng P4 | — | — |
| T2 | Chạy kiểm tra và rà diff | lint/build/unit/integration | T1 | — |
| T3 | Ghi tracking và nhật ký | Kết quả thật, giới hạn rõ | T2 | — |

## 7. Expected file/module impact

- Tạo apps/api/src/admin/testing/*.ts và working-doc/P4/{plan,tracker}.md.
- Sửa docs/features/admin/TRACKING.md, TRUNG_AI_USAGE_LOG.md.
- Không sửa auth, schema, env, dependency/lockfile.

## 8. Verification

- Unit: clock, mail, chạy đua (thành công/lỗi/chờ tác vụ chậm).
- Integration: fixture đủ quan hệ và trạng thái; CHECK/UNIQUE thật, rollback qua manager, ghi đè dữ liệu.
- API lint/build/test và test:int; web lint/build/test theo gate repo.
- Không cần E2E mới vì không thêm luồng ứng dụng.

## 9. Completion criteria

- Helpers và test đạt phạm vi issue; kết quả thật ghi tracker.
- Cập nhật nhật ký; PR/commit/merge do người dùng thực hiện.
