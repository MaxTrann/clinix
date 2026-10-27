# P4 — Tracker

Overall: done (phạm vi triển khai local; chưa PR/merge)  
Updated: 2026-10-27

| ID | Task | Depends on | Status | Evidence/result | Updated |
|---|---|---|---|---|---|
| T1 | Factory, helpers, tests | — | done | Factory + 3 unit và 6 integration test đã viết; mock mail là hàm typed, không chốt interface auth | 2026-10-27 |
| T2 | Kiểm tra | T1 | done | API/web lint/build/unit và MySQL test:int 101/101 pass | 2026-10-27 |
| T3 | Tracking và nhật ký | T2 | done | Tracking admin P4 và mục 7 TRUNG_AI_USAGE_LOG.md đã cập nhật | 2026-10-27 |

## Open questions and blockers

- MailService thật chưa có: cung cấp mock hàm có kiểu, ghép provider sau khi auth xuất service.

## Verification log

| Command/check | Result | Date |
|---|---|---|
| git status --short --branch | feat/admin-p4, sạch trước khi sửa | 2026-10-27 |
| API npm.cmd run lint / build / test | Pass; unit 273/273 | 2026-10-27 |
| Web npm.cmd run lint / build / test | Pass; unit 1/1 | 2026-10-27 |
| npm.cmd run test:int (sandbox) | Dừng sau khi chờ lâu; chạy lại ngoài sandbox, không tính pass | 2026-10-27 |
| npm.cmd run test:int (ngoài sandbox) | Pass: 7 file, 101/101; gồm 6 ca P4. Thời gian 266,52 giây | 2026-10-27 |
| npm.cmd exec -- prettier --check src/admin/testing/*.ts | Pass | 2026-10-27 |
| git diff --check | Pass trước bàn giao | 2026-10-27 |

## Cách dùng

Khởi tạo `new AdminFixtures(db)` trên DataSource test hiện có; gọi `branch()`, `weeklySchedule(branch.chiNhanhId)`, `doctor(branch)`, `patient()`, rồi `shift(doctor.profile)`, `slot(shift)`, `appointment(doctor.profile, slot, patient.account.taiKhoanId, { trangThai: 'DaHuy' })`.

Factory ghi trực tiếp dữ liệu để dựng điều kiện ban đầu, không gọi service nghiệp vụ, không tự chạy chuyển trạng thái. Test tự chọn trạng thái khung giờ/hạn giữ chỗ/thông tin hủy cho kịch bản cần kiểm. Muốn rollback toàn bộ fixture thì tạo factory bằng manager trong `db.transaction`.

`freezeTime(new Date('2026-10-27T23:59:59+07:00'))` chỉ giả Date ở ứng dụng, không thay đồng hồ MySQL `NOW()`. Gọi `restore()` hoặc `vi.useRealTimers()` trong afterEach. `createMailMock<[message: KiểuDoTestCungCấp]>()` trả mock function, dùng `mockRejectedValueOnce` để kiểm lỗi; ghép provider MailService sau khi auth xuất service thật. `runConcurrently([callback1, callback2])` trả mọi kết quả fulfilled/rejected và đợi hết trước khi cleanup; không cam kết thứ tự MySQL lấy khóa.
