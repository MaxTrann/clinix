# Phân công chung: phần admin còn lại (cụm 4 đến 9), Đại và Trung cùng làm

> Trung đã đồng ý cách chia ngày 17/11/2026. File này dành cho **AI agent** (Claude Code, Codex…) và người dùng của hai bên: đọc TRƯỚC khi chạm module `admin`. Nguồn: `docs/features/admin/PLAN.md` mục 6 (task) và mục 8 (thứ tự); rà soát issue 17/11/2026. Mọi tên thư mục mới ghi `[đề xuất]` là gợi ý, chốt trong kế hoạch của từng task.

## 1. Ai làm gì (milestone `admin`)

Epic: #497 Cấu hình hệ thống (Đại), #498 Nhân sự, kích hoạt và tài khoản (Đại), #499 Hồ sơ bác sĩ (Trung), #500 Yêu cầu thay đổi chi nhánh (Trung), #501 Hoàn tất module (cả hai). Phần Catalog đã xong ở epic #44.

| Người | Cụm (PLAN mục 8) | Task (issue) |
|---|---|---|
| **Đại** (`MaxTrann`) | 4 Cấu hình hệ thống | B5 (#502), B6 (#503), F5 (#504) |
| | 6 Nhân sự, kích hoạt | B14 (#505), B15 (#506), B16 (#507), F10 (#512) |
| | 7 Tài khoản | B17 (#508), B18 (#509), B19 (#510), B20 (#511), F8 (#513), F9 (#514) |
| **Trung** (`junUTE`) | 8 Hồ sơ bác sĩ | B12 (#515), B13 (#516), F7 (#517) |
| | 9 Yêu cầu thay đổi chi nhánh | C4 (#518), B8 (#519), B9 (#520), B10 (#521), B11 (#522), B21 (#523), B22 (#524), F6b (#525) |
| **Cả hai** | Hoàn tất | X1 (#526), X2 (#527), X3 (#528) |

Lưu ý tên: **F7 của admin (Hồ sơ bác sĩ, #517) khác F7 của module doctor-exam (Kiểm duyệt đánh giá)**. Người còn lại review mọi PR của cụm này.

## 2. Dành cho AI agent: khi bắt đầu một task

1. Đọc `AGENTS.md`, file này, đúng dòng task trong `docs/features/admin/PLAN.md` (mục 6) và các test case mục 7 liên quan, rồi `docs/features/admin/TRACKING.md` mục 9 (phần của người làm task).
2. Xác định task thuộc ai (bảng mục 1). **Chỉ sửa trong thư mục của cụm mình (mục 3) và các file dùng chung theo đúng cách ở mục 4.** Việc cần chạm phần của người kia: DỪNG, hỏi người dùng của bạn (người dùng báo người kia; mục 8).
3. Plan-first: ghi kế hoạch NGẮN vào phần TRACKING của mình (mục 5), kèm bảng test, rồi dừng chờ người dùng hoặc phiên kiểm duyệt; chưa viết mã trước khi được duyệt.
4. Một task = một PR nhỏ. Không sửa định dạng hàng loạt: chỉ chạy Prettier trên file bạn đã sửa. Không đổi tên, di chuyển hay xóa file của người kia, kể cả "cho gọn".
5. Không ghi `AI_USAGE_LOG.md`, `TRUNG_AI_USAGE_LOG.md`, `docs/TECH_DEBT.md` khi người dùng chưa cho phép; không thêm chữ ký hay dòng đồng tác giả của AI vào commit và PR; không `@Ten` trần trong PR hay issue (dùng backtick).

## 3. Thư mục riêng của từng cụm (theo PLAN 5.1)

| Cụm / task | Backend `apps/api/src/` | Web `apps/web/src/features/` |
|---|---|---|
| Đại: B5, B6, F5 | `admin/system-config/` (module có sẵn của C3) | `admin/system-settings/` `[đề xuất]` |
| Đại: B14, B16, B20 | `admin/staff-activation/` | F10: `staff-activation/` (trang `/kich-hoat`, công khai) |
| Đại: B15, B17, B18, B19 | `admin/accounts/` | F8: `admin/staff-accounts/` `[đề xuất]`; F9: `admin/patient-accounts/` `[đề xuất]` |
| Trung: B8 | `admin/branches/` (thêm `impact/` cho `BranchImpactService`) | F6b: `admin/branches/` |
| Trung: B9, B10, B11, B21, B22 | `admin/branch-change-requests/` (kèm `apply.job.ts`) | F6b: `admin/branches/` |
| Trung: C4 | `notification/` | không có |
| Trung: B12, B13 | `admin/doctors/` | F7: `admin/doctor-profiles/` `[đề xuất]` |

Thư mục của người kia (ví dụ Đại không sửa `branch-change-requests/`, `doctors/`, `notification/`; Trung không sửa `accounts/`, `staff-activation/`, `system-config/`) là vùng **chỉ đọc**. Module khác (`auth`, `rbac`, `audit`, `appointments`, `doctor`, `search`, `payment`, `wallet`) chỉ **import qua module đã export**; muốn sửa thì hỏi trước.

## 4. File dùng chung (điểm nóng) và cách sửa

Số lần các PR admin trước đây cùng đụng (đếm trên lịch sử): `TRACKING.md` admin 21, `PLAN.md` admin 14, `admin-sidebar.tsx` 9, `TECH_DEBT.md` 8, `migrations/index.ts` 8, `app.module.ts` 7, `docs/database/*` 6, `role-routes.tsx` 5.

| File | Cách sửa để ít xung đột |
|---|---|
| `apps/api/src/app.module.ts` | Chỉ THÊM đúng một dòng `import` và một dòng trong `imports: [...]` cho module mới của mình; không sắp xếp lại. |
| `apps/web/src/features/admin/admin-routes.tsx`, `apps/web/src/router/role-routes.tsx` | Chỉ thêm route của mình; không đổi thứ tự hay định dạng các route khác. |
| `apps/web/src/features/admin/components/admin-sidebar.tsx` | Các mục menu đã có sẵn: chỉ đặt `to` cho MỤC CỦA MÌNH (một dòng). Không đổi nhãn, icon, thứ tự mục khác. Chỗ mũi tên `>` của mục đang chọn (G9) đang chờ Đại, đừng sửa. |
| `apps/api/src/database/migrations/index.ts`, `entities.ts` | Dự kiến KHÔNG cần: bảng của cụm 4 đến 9 đã có từ P3 (#47). Nếu một task thật sự cần migration: báo người kia, chỉ MỘT người tạo migration mỗi lúc, timestamp lớn hơn mọi migration trên `main`. |
| `SystemConfigService` (C3) | B5 (Đại) chỉ THÊM phương thức ghi; KHÔNG đổi chữ ký hàm đọc, vì B8, B10, B22 (Trung) dùng. Đổi chữ ký hàm đọc thì phải báo Trung trước. |
| `.env.example`, `docs/DEV_SETUP.md` | Mỗi người thêm biến của mình trong khối riêng có dòng chú thích mở đầu (Đại: `STAFF_ACTIVATION_*`; Trung: `BRANCH_CHANGE_APPLY_CRON`, `EMAIL_OUTBOX_*`). |
| `audit/`, `rbac/` | Đã xong (C1, C2); không sửa. Cần giá trị nhật ký mới thì hỏi (PLAN 5.10 đã liệt kê đủ tên). |

**Email (điểm giao nhau):** B14, B15, B20 (Đại) gửi email kích hoạt qua `MailService` của `auth`. C4 (Trung) làm `notification` và outbox; module `appointments/notifications/` (booking B15) ĐÃ có email-outbox: C4 phải đọc và tái dùng trước khi viết, không viết lần hai; báo Đại nếu cần đổi file đó.

## 5. Tài liệu (nơi dễ xung đột nhất)

- **`docs/features/admin/TRACKING.md`, mục 9**: chia hai phần, mỗi người một phần. Mỗi task thêm MỘT mục con trong phần của mình (`#### 9A.n` cho Đại, `#### 9B.n` cho Trung; n tăng dần theo task, kèm mã task và ngày). Đại chèn mục mới ngay TRƯỚC dòng `<!-- HẾT PHẦN CỦA ĐẠI -->`; Trung thêm ở CUỐI file. Hai vị trí này cách xa nhau nên git gộp được. Không sửa phần của người kia.
- **`PLAN.md` admin**: chỉ tick `☐` thành `☑` đúng dòng task của mình, trong PR của task đó. Nếu xung đột ở bảng (hai dòng liền nhau): giữ cả hai tick.
- **`docs/TECH_DEBT.md`**: số dùng chung toàn repo. Kiểm số lớn nhất trên `origin/main` NGAY TRƯỚC khi ghi, chèn theo số; PR nào merge trước giữ số, PR sau đổi số khi gộp `main`.
- **Nhật ký AI**: Đại ghi `AI_USAGE_LOG.md`, Trung ghi `TRUNG_AI_USAGE_LOG.md` (hai file riêng, không xung đột). Mã `AI-BUG-nnn` dùng chung: kiểm số lớn nhất ở CẢ HAI file trước khi đặt.
- **Đồng bộ tài liệu ngoài code (nhóm D của PLAN 6.6):** 2.4 (file Word ở repo `TLCN_CLINIX`) và Figma: người làm cụm cập nhật phần của mình. `docs/database/*` (D6): ba file phải khớp nhau và là nơi dễ xung đột nhất: gom thành MỘT PR do chủ cụm làm ở cuối cụm, và báo người kia trước khi sửa; không sửa `CREATE TABLE`.

## 6. Nhánh, PR, DB test

- Nhánh `feat/admin-<mã task viết thường>-<mô tả ngắn>` (ví dụ `feat/admin-b5-cau-hinh`). Mở PR nháp sớm; PR nhỏ, merge trong 1 đến 2 ngày; không giữ nhánh dài ngày.
- **Gộp `main` bằng `git merge origin/main`** (không rebase), ngay trước khi mở PR và trước khi merge; không `--force`.
- DB test tích hợp: mỗi task một DB riêng `TEST_DB_NAME=clinix_admin_<mã task viết thường>_test`; không đụng DB `clinix` và `clinix_test`; không `SET GLOBAL`.
- Tiêu đề PR dạng Conventional Commits (`feat(admin): …`); thân PR có thẻ `[ĐỤNG admin]` và `[ĐỤNG <module khác>]` nếu có chạm; `Closes #<số issue>` và `Refs #<số epic>`.

## 7. Thứ tự làm và điểm giao nhau

- **Đại:** B5 → B6 → F5; B14 → B15 → B16 → F10; B17 → B18, B19, B20 → F8 → F9.
- **Trung:** C4 → B8 → B9 → B10 → B11 → B21 → B22 → F6b; B12 → B13 → F7 (cụm 8 độc lập với cụm 6 theo cột "Phụ thuộc" của PLAN, làm xen kẽ được). **B10 mở khoá booking #249 (B16b)**: ưu tiên sớm nếu booking cần.
- Hai bên độc lập về mã; chỗ chạm nhau chỉ là các file ở mục 4 và email ở trên. X1, X2, X3 làm sau khi hai bên xong phần của mình.

## 8. Khi cần chạm phần của người kia, và khi gặp xung đột

1. Cần sửa file hay thư mục của người kia: ghi một comment vào issue của task bên đó (hoặc nhắn người kia) nêu file và lý do; chờ đồng ý; sửa tối thiểu trong PR của bạn và gắn thẻ `[ĐỤNG admin]`.
2. Hai PR cùng chạm một file nóng: người mở PR sau gộp `main` và giữ CẢ HAI phía của chỗ xung đột (các điểm nóng chỉ là thêm dòng song song); chạy lại test của file đó.
3. Xung đột ở tài liệu (TRACKING, TECH_DEBT, số hàng nhật ký): giữ cả hai phía, đánh lại số theo mục 5; phiên kiểm của Đại có script giải xung đột mẫu.
4. Không giải xung đột bằng `-X ours` hoặc `-X theirs`, không xóa phần của người kia để "cho sạch".
