# Kế hoạch module `patient`

> **Trạng thái: bản nháp 2 (03/11/2026).** Nhóm đã duyệt độc lập ("đạt, duyệt có chỉnh") và trả lời **đủ 27 câu** Q1–Q27: đồng ý đề xuất trừ **Q1 (đổi: Bác sĩ được dùng
> `GET/PUT /profile`)**, kèm 4 chỉnh nhỏ (Q21c, Q13, mục 5.3, Q3). Quyết định cuối ở [`TRACKING.md`](TRACKING.md) mục 3 và tóm tắt ở mục 4.2a; bảng 4.2 giữ làm lịch sử.
> Phiên kiểm độc lập bản nháp 2 (03/11/2026): **đạt**, sửa 4 chỗ nhỏ (mục 8, X1 thêm F11, B6 ghi rõ Q42 của admin, bất biến "không đọc thường trước khoá" ở 5.3/B5/NT-17 + ca NT-24).
> **Không còn thẻ `[CHỜ Qn]`.** Việc còn chờ là chờ người/module khác (thẻ `[PHỤ THUỘC …]`) hoặc bị hoãn theo quyết định (`[HOÃN]`).
> Kế hoạch do AI (Claude Code, Claude Opus 5.5) lập theo [`docs/FEATURE_PLANNING_PROMPT.md`](../../FEATURE_PLANNING_PROMPT.md) →
> **ghi `AI_USAGE_LOG.md` (bảng 1) cho lần lập kế hoạch này và cho mọi lần dùng AI sinh code theo kế hoạch** (CONTRIBUTING mục 4).
> Đã kiểm mã thật trên `origin/main` = `f79285b` (03/11/2026) và đọc Figma CLINIX ngày 03/11/2026 (13 frame, mục 4.4).

## 0. Quy ước đọc

- Tên use case viết tắt trong cột "Truy vết": **HSCN** = Cập nhật hồ sơ cá nhân, **HSNT** = Quản lý hồ sơ người thân, **TCBN** = Tra cứu hồ sơ bệnh nhân.
  `b4` = bước (4); `A1/4b` = luồng thay thế A1, mục 4b; `A2/*c` = luồng thay thế A2 của HSNT, mục *c; "MT" = phần Mô tả; "HĐK" = hậu điều kiện. Số bước lấy đúng
  2.4 bản Drive 03/11/2026 (nguyên văn trong prompt lập kế hoạch).
- Nguồn đúng khi lệch nhau: **schema DB (`docs/database/`, bản 20/10/2026 và các dòng lịch sử sau đó) để code**; chỗ 2.4/schema/Figma lệch nhau ở mục 3.4 — **chưa chọn bên nào**, đã hỏi ở mục 4.2.
- Thẻ: `[ĐỒNG BỘ TL]` = task phải cập nhật tài liệu (2.4, `docs/database/*`, Figma, sơ đồ) trong **cùng PR** (CONTRIBUTING mục 7); `[TIỀN ĐỀ]` = việc nền của module;
  `[CHỜ Qn]` = bị chặn bởi câu hỏi Qn chưa trả lời (bản nháp 2: không còn); `[PHỤ THUỘC x]` = chờ module/người khác; `[HOÃN]` = nhóm quyết định chưa làm trong đợt này;
  `[ĐỤNG auth]` / `[ĐỤNG admin]` = sửa file thuộc module khác, phải báo chủ module trước (AGENTS mục 6).
- Mỗi task = **một PR** nhỏ, tiêu đề Conventional Commits, scope `patient` (hạ tầng: `api`/`web`/`db`/`docs`). Test đặt cạnh mã; mỗi test ghi mã test case ở mục 7.
- `[đề xuất]` = giá trị AI tự đề xuất, chưa chốt; `[cần điền]` = thiếu thông tin, chưa có đề xuất.

## 1. Phạm vi

**Làm (3 use case):**
- **HSCN** — Bệnh nhân, **Bác sĩ** (Q1, chỉ phần API), Lễ tân, Quản trị viên (cả hai phạm vi) xem và sửa thông tin cá nhân của **chính mình**; email chỉ đọc.
  "Quét QR CCCD" làm sau cùng (Q5 = A, F9); "ảnh đại diện" **hoãn** (Q4 = A).
- **HSNT** — Bệnh nhân tạo, sửa, ngừng sử dụng hồ sơ người thân của **chính mình**; chặn ngừng sử dụng khi hồ sơ còn lịch hẹn `ChoThanhToan`/`DaXacNhan`/`DaTiepDon`.
- **TCBN** — Lễ tân tìm tài khoản Bệnh nhân theo họ tên/SĐT/email và xem hồ sơ bản thân + người thân liên kết. Chỉ đọc.

**Làm thêm theo quyết định nhóm 03/11/2026:** **khung giao diện Bệnh nhân** và **khung giao diện Lễ tân** (thay `RolePlaceholderPage` của đúng hai vai trò trong
`router/role-routes.tsx`), làm sớm để `booking` và `doctor` cắm trang vào.

**Ngoài 2.4 nhưng bắt buộc** (đánh dấu "bổ trợ"): `GET` hồ sơ cá nhân (HSCN b2 cần dữ liệu hiện tại; `GET /auth/me` không đủ trường — mục 5.2), `GET` danh sách hồ sơ người thân
(HSNT b1 "Quản lý hồ sơ người thân" cần danh sách để chọn sửa/ngừng).

**Không làm:**
- Đăng ký, xác minh OTP, tạo `benh_nhan` + `vi_noi_bo` (đã có ở `auth` A5/A6); đổi mật khẩu và form đổi mật khẩu (`auth` A13/F5 — module này chỉ chừa chỗ cắm, mục 5.6).
- Đặt lịch, huỷ lịch, "Lịch hẹn của tôi", thống kê lịch hẹn của Bệnh nhân (`booking`); ví (`wallet`); thông báo/chuông (`notification`); hồ sơ khám/kết quả khám (`doctor`/`booking`);
  màn xem nhật ký hành động (`audit`/`admin`); "Quản lý tài khoản người dùng" của Quản trị viên (`admin` B17).
- **Trang** "Thông tin cá nhân" của Bác sĩ (Figma `475:2`, `476:2`) và khung Bác sĩ: thuộc `doctor`; trang đó gọi `GET/PUT /profile` của module này (`[PHỤ THUỘC doctor]`).
  Khối "Thông tin chuyên môn" (chuyên khoa, học vị, kinh nghiệm, giá khám, mô tả) của frame `475:2` **không** lấy từ `/profile` (chốt 03/11/2026: chuyên môn do Quản trị viên sửa ở UC 47; đưa vào sẽ kéo bảng `bac_si`, chuyên khoa, phụ phí
  vào module này và nhân rủi ro H14) — module `doctor` lấy từ API hồ sơ bác sĩ (admin B12 hoặc `search`).
- Khung công khai: thuộc `search`.
- Ảnh đại diện (Q4 = A, hoãn); nhật ký tra cứu (Q20 = A, không ghi).

## 2. Hiện trạng repo (đã kiểm trên `origin/main` = `f79285b`, 03/11/2026)

**API (`apps/api/src/`):**
- `auth` đủ A1–A15: guard toàn cục `JwtAuthGuard` + `RolesGuard`, `@Public()`/`@Roles()`/`@CurrentUser()` (`user = { accountId, sessionId, role }`), `AppException` + bộ lọc lỗi chuẩn,
  logger che bí mật, `MailService`. **`GET /auth/me`** (`auth/me/me.controller.ts`, `me.service.ts`) trả **đúng 3 trường** `{ vaiTro, hoTen, daXacMinhEmail }` (danh sách trắng, test DN-23),
  `Cache-Control: no-store`; tài khoản không còn `DangHoatDong` ⇒ 401 `PHIEN_HET_HIEU_LUC`.
- Kiểm dữ liệu tài khoản dùng lại được: `auth/dto/account-field.decorators.ts` (`IsAccountFullName`, `IsAccountPhone`), `auth/validation/` (`full-name-policy.ts`: ≥ 1 chữ cái, ≤ 100 ký tự,
  không ký tự điều khiển; `phone-policy.ts`: 10 số bắt đầu 0, nhận một dấu cách/chấm giữa nhóm số, lưu 10 số liền), `VALIDATION_CODES` (`HO_TEN_KHONG_HOP_LE`, `SDT_KHONG_HOP_LE`).
  `AuthModule` export `TypeOrmModule` (repo của 5 bảng auth) nhưng **không** export `TaiKhoanRepository`.
- Entity có sẵn: `TaiKhoan` (`ho_ten`, `ngay_sinh` NULL được, `gioi_tinh` varchar(10) NULL được, `so_dien_thoai`, `anh_dai_dien` varchar(255), `dia_chi`, `email` UNIQUE…), `BenhNhan`
  (chỉ `khoa_dat_lich_do_no_show`, `so_lan_no_show`) ở `auth/entities/`; `HoSoNguoiThan`, `LeTan`, `QuanTriVien`, `LichHen` ở `admin/entities/` (migration `1793080000000-tao-bang-nhan-su`,
  admin sở hữu theo Q41 của admin). Enum `MOI_QUAN_HE_NGUOI_THAN` ở `admin/entities/enums.ts`.
- `audit`: `AuditService.record(manager, entry)` bắt buộc chạy trong giao dịch đang mở; `AuditEntry` là union có kiểu theo `ChangeMap` — **chỉ** các hành động admin hiện có
  (`TaoTaiKhoanNhanSu`, `KhoaTaiKhoan`, …, `CapNhatCauHinh`). Enum `hanh_dong_nhay_cam_enum` **không có** hành động xem/tra cứu/sửa hồ sơ; `loai_doi_tuong_enum` **không có** `ho_so_nguoi_than`.
- `common/upload` (ADR 0001): **chỉ** ảnh chuyên khoa — route `admin/uploads/specialty-image` cho Quản trị viên Toàn hệ thống, `SPECIALTY_IMAGE_POLICY`, bảng `anh_tai_len` có
  `CHECK (muc_dich = 'ChuyenKhoa')`; ADR ghi "Dữ liệu ảnh chuyên khoa là công khai, **không dùng cho ảnh bệnh nhân**".
- `common/paging` (`PageQueryDto`: `page` từ 1, `pageSize` mặc định 20, tối đa 100; `Paged<T>`; `escapeLikePattern`), `common/time` (`nowVN`, `todayVN`, `toSecond`), `database/mysql-errors.ts`.
- `rbac`: `RequireAdminScope`, `BranchAccessPolicy` (chỉ cho Quản trị viên). Lễ tân chưa có cơ chế phạm vi chi nhánh.
- Test: `AdminFixtures` (`admin/testing/admin-fixtures.ts`) dựng được chi nhánh, bác sĩ, ca, khung giờ và **`lich_hen`**; `auth/entities/testing/auth-fixtures.ts` dựng tài khoản/`benh_nhan`.
  Seed phát triển có 5 tài khoản demo (Bệnh nhân có `benh_nhan` + ví; Lễ tân có `le_tan` gắn chi nhánh; Bác sĩ; QTV Toàn hệ thống; QTV Chi nhánh).
- Một truy vấn của admin đã viết cứng tập "đang hoạt động" (`admin/services/service.repository.ts`: `trang_thai IN ('ChoThanhToan','DaXacNhan','DaTiepDon')`); chưa có hằng số dùng chung.
- **Chưa có** `apps/api/src/patient/`; chưa có endpoint nào ghi `tai_khoan.ho_ten/ngay_sinh/...` sau đăng ký, chưa có endpoint nào cho `ho_so_nguoi_than`.

**Web (`apps/web/src/`):**
- ADR 0002/0003/0004 đã áp dụng (Data Mode, Tailwind 4, Preflight bật, 13 token màu trong `styles/index.css`, WCAG 2.2 AA). `shared/ui` có `auth-card`, `empty-state`, `error-state`,
  `loading-state`, `offline-banner`; `shared/api/client.ts` là nơi duy nhất gọi `fetch`.
- `router/role-routes.tsx`: Bệnh nhân (`/benh-nhan`), Bác sĩ (`/bac-si-portal`), Lễ tân (`/le-tan`) đang là `RolePlaceholderPage`; Quản trị viên là `AdminLayout` + `ADMIN_ROUTES`.
  `AdminSidebar` có mục "Thông tin cá nhân" **chưa có `to`** (hiện nút vô hiệu "Chưa được triển khai").
- `features/auth/index.ts` export `useAuth`, `logout`, `RequireAuth`, `ROLE_HOME_PATHS`…; **không** export `validation/account-policy.ts` (họ tên, SĐT) và **không** có hàm cập nhật `hoTen`
  trong store sau khi người dùng đổi tên. `features/` không được import chéo nhau (CODING_CONVENTION, Frontend).
- auth frontend: F1–F3 đã merge, F4 (quên mật khẩu) đang làm, **F5 (form đổi mật khẩu + nút đăng xuất ở layout) chưa làm**.

## 3. Phân tích ảnh hưởng

### 3.1 Bảng/cột `patient` chạm tới (đọc từ `docs/database/`)

| Bảng | Cột / ràng buộc quan trọng | Dùng cho | Đọc/ghi |
|---|---|---|---|
| `tai_khoan` | `ho_ten` varchar(100) NOT NULL; `ngay_sinh` date NULL; `gioi_tinh` varchar(10) NULL (**không có tập giá trị**); `so_dien_thoai` varchar(20) NOT NULL (**không UNIQUE**); `anh_dai_dien` varchar(255); `dia_chi` varchar(255); `email` UNIQUE (chỉ đọc); `trang_thai`; `loai_tai_khoan`; `thoi_diem_tao` | HSCN (mọi vai trò); TCBN (đọc) | ghi (chỉ 5–6 cột hồ sơ), đọc |
| `benh_nhan` | PK = `tai_khoan_id`; chỉ `khoa_dat_lich_do_no_show`, `so_lan_no_show`. Ghi chú: **không** có cột họ tên/SĐT; cố ý không có `chi_nhanh_id` | HSNT (chủ sở hữu, khoá hàng); TCBN (chỉ Bệnh nhân đã xác minh mới có dòng) | đọc + khoá `FOR UPDATE` |
| `ho_so_nguoi_than` | `benh_nhan_id` FK → `benh_nhan`; `ho_ten` varchar(100), `ngay_sinh` date, `gioi_tinh` varchar(10) **NOT NULL**; `dia_chi` NULL; `moi_quan_he` ENUM 8 giá trị `[đề xuất]`; `so_dien_thoai` NULL; `trang_thai_hieu_luc` (không xoá thật); UNIQUE `(ho_so_nguoi_than_id, benh_nhan_id)` cho FK kép của `lich_hen` | HSNT; TCBN (đọc) | ghi, đọc |
| `le_tan` | `chi_nhanh_id` NOT NULL | HSCN (hiển thị chi nhánh chỉ đọc); TCBN (chỉ khi chọn phạm vi chi nhánh — Q16) | đọc |
| `quan_tri_vien` | `pham_vi_quan_tri`, `chi_nhanh_id` (`chk_qtv_pham_vi`) | HSCN (hiển thị phạm vi chỉ đọc) | đọc |
| `bac_si` | `chi_nhanh_id` NOT NULL (chỉ QTV Toàn hệ thống đổi — ghi chú DB) | HSCN Bác sĩ (Q1): chi nhánh công tác chỉ đọc (chốt 03/11/2026) | đọc |
| `chi_nhanh` | `ten` | HSCN (tên chi nhánh của Lễ tân/QTV Chi nhánh) | đọc |
| `lich_hen` | `benh_nhan_id`, `ho_so_nguoi_than_id` (NULL = bản thân), `trang_thai`, `thoi_gian`, `ma_lich_hen`, `bac_si_id`, `chi_nhanh_id`; chỉ mục `(ho_so_nguoi_than_id, benh_nhan_id, trang_thai)`; FK kép tới `ho_so_nguoi_than` | HSNT A2 (lịch hẹn đang chặn); TCBN nếu chọn phạm vi chi nhánh (Q16) | **chỉ đọc** |

### 3.2 Bảng ngoài danh sách đã mở thêm (và lý do)

- `chi_nhanh`: lấy **tên** chi nhánh để hiện "Chi nhánh công tác" ở trang Lễ tân (Figma `503:2`) và Bác sĩ (`475:2`).
- `bac_si` (chỉ cột `chi_nhanh_id`): Q1 = Có — Bác sĩ dùng `/profile`, trả thêm chi nhánh công tác chỉ đọc (chốt 03/11/2026).
- `anh_tai_len` (DDL + CHECK) và ADR 0001: kiểm khả năng dùng lại hạ tầng ảnh cho ảnh đại diện → **không dùng nguyên trạng được** (L5, Q4).
- `hanh_dong_nhay_cam_enum`, `loai_doi_tuong_enum`, `nhat_ky_hanh_dong` + `audit/audit-entry.ts`: kiểm việc ghi nhật ký cho tra cứu → enum chưa có giá trị phù hợp (L8, Q20).
- `cau_hinh_he_thong.so_lich_hen_toi_da_moi_ho_so` và quy tắc 37: cùng tập trạng thái "đang hoạt động" với HSNT A2 (Q12). Module này **không** đọc cấu hình.

### 3.3 API/hành vi đã có hoặc đã chốt bị chạm tới

| Module / thành phần | Điểm chạm | Cách xử lý (không phá thiết kế đã chốt) |
|---|---|---|
| `auth` — `GET /auth/me` (A15) | Cùng là "đọc thông tin của người đang đăng nhập" | **Không đổi hợp đồng `/auth/me`** (DN-23 khoá danh sách trắng 3 trường, FE auth dựa vào nó để điều hướng). Đọc hồ sơ đầy đủ bằng endpoint **riêng** của module (`GET /profile`, mục 5.2) — `/auth/me` = "tôi là ai, vai trò gì" (nhỏ, gọi mỗi lần khôi phục phiên); `/profile` = "dữ liệu hồ sơ để xem/sửa" (chỉ trang hồ sơ gọi). Tên hiển thị trên khung sau khi sửa: FE gọi lại `/auth/me` (task P2). Q23 |
| `auth` — kiểm dữ liệu | Họ tên, SĐT dùng đúng quy tắc của đăng ký | **Dùng lại** `IsAccountFullName`, `IsAccountPhone` (BE) và `account-policy.ts` (FE, cần export qua `features/auth/index.ts` — P2 `[ĐỤNG auth]`). Không viết bản thứ hai |
| `auth` — guard, lỗi, log | Mọi endpoint mới | Dùng guard toàn cục + `@Roles`, `AppException`, `ValidationPipe` (`forbidNonWhitelisted`), `Logger` của Nest. Không gắn guard riêng |
| `auth` — thứ tự khoá | Auth khoá `tai_khoan` trước mọi bảng con (A12/A13) | `PUT /profile` chỉ là **một câu `UPDATE tai_khoan`** theo khoá chính, không khoá bảng khác ⇒ không tạo vòng khoá với auth. Ngừng hồ sơ người thân không đụng `tai_khoan` |
| `auth` F5 | Form đổi mật khẩu + nút Đăng xuất "ở layout do F1/F5 dựng" | Khung BN/LT do module này dựng (F1, F2) ⇒ **nút Đăng xuất nằm trong khung này** (gọi `logout()` của auth, đăng xuất ngay — G5); F5 chỉ còn `ChangePasswordForm`, cắm vào chỗ chừa sẵn ở F3/F4/F5 của module này. Chủ module auth xác nhận (Q21f) |
| `admin` — entity `HoSoNguoiThan`, `LichHen`, `LeTan`, `QuanTriVien` | Module này đọc/ghi các bảng admin đã tạo migration | **Không tạo lại** migration/entity. Ghi `ho_so_nguoi_than` qua repository của module `patient` trên entity sẵn có (entity hiện chú thích "Admin đọc cùng lịch hẹn" — chỉ sửa comment nếu cần, báo Trung) |
| `admin` — `AdminLayout`, `AdminSidebar` | Trang "Thông tin cá nhân" của QTV cắm vào khung Admin | Ghép route ở lớp `router/role-routes.tsx` (không import chéo `features/`); sửa **một** dòng `to` của mục "Thông tin cá nhân" trong `admin-sidebar.tsx` `[ĐỤNG admin]` — báo Trung trước (F5) |
| `admin` — B17 (Admin xem Bệnh nhân, Q26 của admin) | Cũng hiển thị thông tin hành chính Bệnh nhân | Tham chiếu danh sách trường Q26 của admin cho TCBN (Q18) để hai nơi nhất quán; **không** dùng chung mã (vai trò, phạm vi khác nhau) |
| `audit` | SOW 3.2.4 "thao tác nhạy cảm ghi nhật ký" | Enum hiện hành không có hành động phù hợp ⇒ Q20. Nếu thêm: thay đổi enum là của chủ `audit`/`admin` (Trung), làm trước, module này chỉ gọi `AuditService.record` |
| `common/upload` (ADR 0001) | Ảnh đại diện | Không dùng nguyên trạng (L5) ⇒ Q4 |
| `booking` (chưa có) | (a) Hồ sơ đã ngừng không được dùng để đặt lịch mới (HĐK HSNT); (b) chạy đua "ngừng hồ sơ" ↔ "đặt lịch cho hồ sơ đó" | **Hợp đồng ghi sẵn cho `booking`** (mục 5.3): khi tạo lịch hẹn, khoá `benh_nhan` `FOR UPDATE` trước (quy tắc 37 đã yêu cầu), kiểm `trang_thai_hieu_luc = true` dưới khoá, rồi mới chèn. Hàm kiểm "hồ sơ dùng được để đặt lịch" và hằng `ACTIVE_APPOINTMENT_STATES` đặt ở thư mục dùng chung `apps/api/src/appointments/` (Q13 = B); `booking` tiếp quản khi làm module. **PLAN `booking` phải xác nhận hợp đồng khoá trước khi làm X3** |
| `doctor` (chưa có) | Q1 = Có: Bác sĩ sửa hồ sơ của mình | API `GET/PUT /profile` ở module này nhận `BacSi`; **trang** Bác sĩ (`475:2`, `476:2`) làm trong khung Bác sĩ của `doctor` |
| `admin` — hồ sơ bác sĩ (admin BS) | QTV cũng sửa thông tin hồ sơ bác sĩ | Nếu màn hồ sơ bác sĩ của admin cũng ghi các cột ở `tai_khoan` (họ tên, SĐT…) thì có hai người cùng sửa một hàng: lần lưu sau thắng (như H10); báo Trung để hai bên thống nhất cột nào ai sửa (H14) |
| `doctor` (chưa có), `booking` | Cắm trang vào khung Lễ tân/Bệnh nhân | Khung nhận danh sách mục menu từ lớp router (mục 5.6); module sau chỉ sửa `router/role-routes.tsx` + file cấu hình menu ở lớp router, không sửa file của `patient` |
| Seed phát triển | Dữ liệu chạy tay | Dùng 5 tài khoản demo; **không** thêm tài khoản thật. Có thể thêm hồ sơ người thân mẫu vào seed `[đề xuất]` — seed do admin sở hữu, hỏi Trung khi làm X1 |

### 3.4 Chỗ 2.4, schema và Figma lệch hoặc mơ hồ — **nêu rõ, chưa chọn bên nào**

| # | Lệch / mơ hồ | Ghi chú | Hỏi |
|---|---|---|---|
| L1 | HSCN: tác nhân 2.4 = Bệnh nhân, Lễ tân, Quản trị viên; Figma có "Bác sĩ - Thông tin cá nhân" `475:2` **kèm** frame sửa `476:2` | **Đã chốt Q1 = Có:** nhóm đã gộp use case của Bác sĩ vào HSCN ngày 20/10/2026, 2.4 bản Drive sót Bác sĩ ở dòng tác nhân ⇒ sửa 2.4 (D1) | Q1 ✔ |
| L2 | HSCN b2 liệt kê họ tên, SĐT, ngày sinh, địa chỉ, ảnh — **không có giới tính**; Figma `432:2`, `504:2` có ô "Giới tính"; schema có `tai_khoan.gioi_tinh` | | Q2 |
| L3 | `gioi_tinh` (cả `tai_khoan` và `ho_so_nguoi_than`) là varchar(10) **không có tập giá trị** ở DB, 2.4 hay Figma (Figma chỉ thấy "Nam", "Nữ", "Chọn giới tính") | | Q3 |
| L4 | HSCN HĐK "thông tin tài khoản sẽ **đồng bộ** sang hồ sơ bệnh nhân bản thân": schema **không có** cột hồ sơ nào ở `benh_nhan`; họ tên/SĐT/ngày sinh… của "bản thân" **chỉ nằm ở `tai_khoan`**; `lich_hen` bản thân là `ho_so_nguoi_than_id = NULL` và đọc thẳng từ `tai_khoan` | Không cần sao chép: **một nguồn dữ liệu duy nhất** nên "đồng bộ" đúng ngay khi ghi `tai_khoan`; áp dụng cho Bệnh nhân (Lễ tân/QTV không có hồ sơ bệnh nhân). Schema **đã đủ chỗ lưu**. Chỉ đề nghị sửa câu chữ 2.4 (D1). Hệ quả: lịch hẹn cũ không có bản sao tên nên **hiện tên mới** | Q23 (xác nhận) |
| L5 | HSCN có "ảnh đại diện"; Figma **không có** frame tải/đổi ảnh (chỉ một biểu tượng máy ảnh nhỏ trên avatar chữ "NV" ở `416:2`); hạ tầng ảnh hiện có **cấm** dùng cho ảnh bệnh nhân (ADR 0001), `anh_tai_len` có `CHECK muc_dich = 'ChuyenKhoa'`, chỉ QTV Toàn hệ thống tải; `tai_khoan.anh_dai_dien` varchar(255) trong khi `secure_url` tới 2048 | Làm ảnh đại diện = đổi schema + ADR mới + sửa module upload của admin | Q4 |
| L6 | HSCN "Quét QR CCCD": Figma **không có** nút/frame; schema không có cột CCCD (khớp ý "không lưu") | Định dạng chuỗi QR trên CCCD gắn chip **chưa có nguồn trong repo** — không tự đoán | Q5 |
| L7 | HSCN tác nhân có Quản trị viên nhưng Figma `510:2`, `620:2` chỉ **xem** email + SĐT, **không có nút "Chỉnh sửa"** và không có frame sửa | | Q6 |
| L8 | SOW 3.2.4 (thao tác nhạy cảm ghi nhật ký) vs enum `hanh_dong_nhay_cam_enum`/`loai_doi_tuong_enum` không có giá trị cho tra cứu/xem hồ sơ Bệnh nhân hay sửa hồ sơ người thân | | Q20 |
| L9 | HSNT: MT nói "tạo, sửa, ngừng sử dụng" nhưng Các bước chỉ mô tả **tạo**. Thiếu cho luồng **sửa**: điểm vào, trường được sửa, có sửa hồ sơ đã ngừng/đang có lịch hẹn không. Thiếu cho luồng **ngừng sử dụng**: điểm vào (Figma không có nút), có hộp xác nhận không, hồ sơ đã ngừng còn hiện không, có "sử dụng lại" không, ngừng lần hai | | Q9, Q10 |
| L10 | HSNT A2/*c "liệt kê lịch hẹn đang chặn": không nói liệt kê trường nào; Figma không có frame | | Q11 |
| L11 | Tập trạng thái "đang hoạt động": 2.4 HSNT nêu rõ `ChoThanhToan`/`DaXacNhan`/`DaTiepDon`; DB (quy tắc 37, truy vấn mẫu cuối `clinix_mysql.sql`) cùng tập nhưng còn **`[cần điền]`** | Khớp nội dung, chỉ khác trạng thái chốt | Q12 |
| L12 | Danh sách mối quan hệ: 2.4 `[đề xuất]` (Cha, Mẹ, Vợ, Chồng, Con, Anh/Chị/Em, Ông/Bà, Khác) **khớp đúng** ENUM `moi_quan_he_enum` (cũng `[đề xuất]` trong ghi chú DB) | Không lệch nội dung; chỉ cần chốt | Q15 |
| L13 | `ho_so_nguoi_than.dia_chi` có ở schema nhưng 2.4 HSNT b2 và Figma `433:2`/`434:2` **không có** ô địa chỉ | | Q8 |
| L14 | TCBN: 2.4 không nêu phạm vi chi nhánh của Lễ tân; DB chỉ có quy tắc phạm vi cho QTV Chi nhánh (quy tắc 25) | | Q16 |
| L15 | TCBN b6 "hồ sơ bệnh nhân (bản thân) và danh sách hồ sơ người thân"; Figma `485:2` hiện **thêm**: ngày tạo tài khoản, "Số lần vắng khám", khối "Lịch sử lịch hẹn" (Tổng lịch / Sắp khám / Hoàn thành) và một mã nội bộ ("u1") | Số liệu lịch hẹn là dữ liệu của `booking`; mã nội bộ không nên lộ | Q18 |
| L16 | TCBN: 2.4 không nói người thân **đã ngừng** có hiện không, tài khoản Bệnh nhân **NgungHoatDong** có hiện không | | Q17 |
| L17 | Ngày sinh "hợp lệ" (HSCN b4, HSNT b4) chưa có quy tắc số (tương lai? năm tối thiểu?); Figma hiển thị lẫn `1990-05-15` và `08/03/1960` | | Q7 |
| L18 | Figma có "2 hồ sơ người thân · 2 đang sử dụng" (gợi ý hồ sơ đã ngừng vẫn hiện) nhưng không có trạng thái "Ngừng sử dụng" nào được vẽ | | Q10 |
| L19 | Tiêu đề trang Lễ tân trong Figma là "Hồ sơ bệnh nhân" còn mục menu là "Tra cứu bệnh nhân" | Chỉ câu chữ; FE theo Figma | — |

Không lệch (đã đối chiếu): email cố định (2.4 + Figma "Email dùng để đăng nhập, không thể thay đổi."); họ tên, SĐT bắt buộc ở hồ sơ bản thân (`NOT NULL` + dấu `*` Figma); người thân bắt buộc
họ tên, ngày sinh, giới tính, mối quan hệ (`NOT NULL` + dấu `*` Figma `433:2`), SĐT tuỳ chọn (`NULL` + "Tùy chọn"); "ngừng sử dụng" = `trang_thai_hieu_luc = false`, không xoá thật (ghi chú DB);
FK kép `lich_hen` → `ho_so_nguoi_than` ngăn gắn lịch với hồ sơ của Bệnh nhân khác (quy tắc DB 33); không lưu CCCD (không có cột).

### 3.5 Bẫy/rủi ro (xử lý trong task)

- **H1 — Chạy đua "ngừng hồ sơ" ↔ "đặt lịch".** Đọc "không có lịch đang chặn" rồi mới ghi là đọc-rồi-ghi: một lịch hẹn mới có thể chen vào giữa. Chống bằng **khoá chung một hàng cha**:
  cả ngừng hồ sơ (B5) lẫn tạo lịch hẹn (`booking`) khoá `benh_nhan` `FOR UPDATE` **trước**; `booking` kiểm `trang_thai_hieu_luc` dưới khoá. Ngừng hồ sơ: hai câu đầu đều là **đọc có khoá**
  (`benh_nhan`, rồi `ho_so_nguoi_than`), câu `SELECT` thường đầu tiên (đọc `lich_hen`) nằm **sau** khi đã giữ khoá ⇒ dưới REPEATABLE READ ảnh chụp nhất quán được tạo ở chính câu đó, nên đã thấy
  mọi lịch hẹn đã commit (kể cả của giao dịch `booking` vừa nhả khoá). **Chỉ thêm `FOR SHARE`** nếu NT-17 chứng minh cần. Chừng nào `booking` chưa có thì hợp đồng này chỉ được kiểm bằng giao dịch giả lập trong test.
- **H2 — Gán quyền hàng loạt (mass assignment).** DTO chỉ khai các trường được sửa; `forbidNonWhitelisted` trả `TRUONG_KHONG_DUOC_PHEP` cho `email`, `taiKhoanId`, `vaiTro`, `trangThai`,
  `chiNhanhId`, `benhNhanId`, `trangThaiHieuLuc`… (HS-06, HS-07, NT-05). Tài khoản luôn lấy từ token, không bao giờ từ thân/đường dẫn.
- **H3 — Dò tài nguyên của người khác (IDOR).** Mọi truy vấn hồ sơ người thân có `AND benh_nhan_id = :nguoiGoi`; không thuộc mình ⇒ **404 cùng thân** với không tồn tại (theo Q40 của admin) (NT-08).
- **H4 — Lộ dữ liệu cá nhân qua tra cứu.** Danh sách trắng trường trả về (Q18), từ khoá tối thiểu (Q19), phân trang trần 100, `Cache-Control: no-store`, chỉ Lễ tân. Không trả `mat_khau_bam`,
  khoá đăng nhập, ví, hồ sơ khám, mã nội bộ không cần.
- **H5 — Từ khoá tra cứu là dữ liệu cá nhân.** `q` (họ tên/SĐT/email) có thể nằm trong log truy cập của proxy nếu đi bằng query string. Ứng dụng không ghi `q` vào log; quyết định GET hay POST ở Q19.
- **H6 — `LIKE '%…%'` quét toàn bảng.** Chấp nhận ở quy mô TLCN; escape `%`, `_` bằng `escapeLikePattern` (TC-05); ghi `TECH_DEBT`.
- **H7 — Collation `utf8mb4_unicode_ci` không phân biệt dấu.** Có lợi cho tìm họ tên ("nguyen" khớp "Nguyễn"); nhưng email/SĐT cũng so theo collation này — đã chấp nhận ở auth (N9: email ASCII).
- **H8 — Tên hiển thị cũ trên khung.** Store auth giữ `hoTen` từ `/auth/me`; sau khi sửa phải làm mới (P2), nếu không thanh bên hiện tên cũ (HS-19).
- **H9 — Tài khoản bị khoá giữa chừng.** Guard đã kiểm `DangHoatDong`, nhưng QTV có thể khoá ngay sau đó: `UPDATE … WHERE tai_khoan_id = ? AND trang_thai = 'DangHoatDong'`, 0 hàng ⇒ 401
  `PHIEN_HET_HIEU_LUC` như `MeService` (HS-15).
- **H10 — Ghi đè đồng thời hai tab.** Hai lần lưu hồ sơ gần nhau: lần sau thắng trọn vẹn (một câu `UPDATE` đủ trường), không trộn trường; không có khoá lạc quan (Q24, `TECH_DEBT`).
- **H11 — Dữ liệu QR CCCD.** Nếu làm (Q5): giải mã ở trình duyệt, **không** gửi chuỗi QR/số CCCD lên API, không lưu, không log; test dùng chuỗi giả, không dùng CCCD thật.
- **H12 — Ảnh đại diện là dữ liệu cá nhân.** Không được đi đường ảnh công khai của chuyên khoa (ADR 0001) — Q4.
- **H13 — Lỗi FK đã lường trước.** Tạo hồ sơ người thân khi dòng `benh_nhan` không tồn tại (không xảy ra với tài khoản đăng nhập được, giữ phòng thủ) ⇒ bắt `isForeignKeyError`, không 500.
- **H14 — Hai người cùng sửa hồ sơ Bác sĩ (Q1).** Bác sĩ tự sửa qua `/profile`; QTV có thể sửa qua màn hồ sơ bác sĩ của admin. `PUT /profile` chỉ ghi 5 cột hồ sơ ở `tai_khoan`, **không** đụng `bac_si`
  (chi nhánh, chuyên khoa, chức danh do QTV quản lý). Phối hợp với Trung (TRACKING mục 5).

## 4. Câu hỏi và quyết định

### 4.1 Đã chốt ở module khác (kế thừa — **không bàn lại**)

- `auth` Q1 (TypeORM, migration viết tay), Q2 (phiên, cùng origin qua proxy), S5 (SĐT 10 số bắt đầu 0, chuẩn hoá), N9 (email ASCII), quy tắc họ tên A5-D (≥ 1 chữ cái, ≤ 100 ký tự,
  không ký tự điều khiển), G5 (đăng xuất ngay, không hỏi), G3 (bỏ banner/mật khẩu demo khỏi giao diện), bộ lỗi chuẩn P5 (`{ maLoi, thongBao, loi?, chiTiet?, requestId? }`), guard A4.
- `admin` Q40 (ngoài phạm vi ⇒ 404 cùng thân), Q41 (admin sở hữu migration các bảng nền), Q42 (phân trang offset `page`/`pageSize` 20/100, `{items,total,page,pageSize}`, `q` escape LIKE),
  Q43 (giờ VN qua `nowVN()`/`todayVN()`), Q26 (Admin Chi nhánh xem Bệnh nhân: họ tên, email, SĐT, ngày sinh, giới tính, trạng thái).
- Nhóm 03/11/2026: module này làm khung Bệnh nhân và khung Lễ tân; khung công khai của `search`; khung Bác sĩ của `doctor`.

### 4.2 Câu hỏi gộp và đề xuất ban đầu (**đã được nhóm trả lời ngày 03/11/2026 — quyết định cuối ở mục 4.2a và TRACKING mục 3, ưu tiên hơn các bảng dưới**)

**Hồ sơ cá nhân (HSCN)**

| # | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q1 | Bác sĩ có được tự sửa thông tin cá nhân không? (2.4 không có, Figma có `475:2` + `476:2`) | **Không** trong module này; nhóm **sửa Figma** `476:2` thành chỉ xem (hoặc bỏ). Lý do: hồ sơ bác sĩ hiển thị công khai và do QTV quản lý (admin BS), hai người cùng sửa một tên dễ mâu thuẫn. Nếu nhóm muốn có: sửa 2.4 thêm Bác sĩ, API dùng chung mở thêm vai trò `BacSi`, trang làm ở `doctor` | B2, HS-16, QP-02 |
| Q2 | Có cho sửa **giới tính** ở hồ sơ cá nhân không? | **Có**, tuỳ chọn (cột có sẵn, Figma có ô). Sửa 2.4 b2 thêm giới tính (D1) | B2, F3 |
| Q3 | Tập giá trị **giới tính** lưu trong DB (cả `tai_khoan` và `ho_so_nguoi_than`)? | Lưu mã ASCII giống phong cách enum hiện có: `Nam`, `Nu`, `Khac`; FE hiển thị "Nam", "Nữ", "Khác"; kiểm ở service (DB không có CHECK — không đổi DDL), ghi chú vào dbml (D2). Nếu nhóm không muốn "Khác" thì chỉ `Nam`, `Nu` | P1, B2, B3 |
| Q4 | **Ảnh đại diện** làm thế nào? | **A — hoãn** khỏi đợt này: không có frame, hạ tầng ảnh hiện tại cấm dùng cho ảnh bệnh nhân; ghi `TECH_DEBT` + D1. **B — làm sau** bằng ADR mới: thêm `muc_dich = 'AnhDaiDien'` vào `anh_tai_len`, `tai_khoan.anh_tai_len_id` FK, giao ảnh riêng tư (cách giao riêng tư của Cloudinary phải tra tài liệu thật trước khi chốt), mọi vai trò tải ảnh của chính mình, dọn ảnh cũ bằng trạng thái `ChoXoa` có sẵn; đổi schema của admin P7 nên Trung cùng duyệt. Giới hạn nếu B `[đề xuất]`: JPEG/PNG/WebP, đầu vào ≤ 10 MB/25 MP như P7, đầu ra cạnh dài ≤ 512 px, ≤ 300 KB. **C** — dùng đường ảnh công khai như chuyên khoa: **không đề xuất** (lộ ảnh cá nhân). Đề xuất: **A** | B8, F10 |
| Q5 | **Quét QR CCCD** làm thế nào? | **A — làm sau cùng, tuỳ chọn** (task F9 riêng) và chỉ khi nhóm cung cấp: frame Figma (nút + trạng thái quét/lỗi/không có camera) và **mẫu chuỗi QR giả** kèm mô tả định dạng từ nguồn chính thức; FE đọc mã bằng camera/ảnh, điền họ tên, ngày sinh, giới tính, địa chỉ; số CCCD bị bỏ ngay ở trình duyệt; API **không có trường CCCD** (gửi lên ⇒ `TRUONG_KHONG_DUOC_PHEP`). Thư viện đọc QR: tra phiên bản và hỗ trợ trình duyệt thật khi làm, không chọn theo trí nhớ. **B** — bỏ khỏi 2.4. Đề xuất: **A** | F9 |
| Q6 | Quản trị viên sửa hồ sơ bằng giao diện nào? (Figma `510:2`/`620:2` chỉ xem email + SĐT) | Nhóm bổ sung frame; trong lúc chờ, trang QTV dùng **cùng bố cục xem/sửa với Lễ tân** (`503:2`/`504:2`): họ tên, SĐT, giới tính, ngày sinh, địa chỉ, email chỉ đọc, thêm dòng chỉ đọc "Phạm vi quản trị" (và chi nhánh nếu phạm vi Chi nhánh) | F5 |
| Q7 | Quy tắc **ngày sinh** hợp lệ? | Ngày có thật, API nhận `YYYY-MM-DD`; **không sau hôm nay** (giờ VN, `todayVN()`); **không trước 1900-01-01**; hồ sơ bản thân được để trống và được **xoá** (gửi `null`); người thân bắt buộc. Hiển thị `dd/mm/yyyy` ở mọi nơi (sửa chỗ Figma ghi `1990-05-15`) | P1, B2, B3 |
| Q8 | Quy tắc **địa chỉ**; người thân có địa chỉ không? | Bản thân: tuỳ chọn, cắt khoảng trắng ASCII hai đầu, ≤ 255 ký tự, không ký tự điều khiển, chuỗi rỗng lưu `NULL`. Người thân: **không** nhập/hiện địa chỉ (2.4 + Figma không có), cột `dia_chi` giữ `NULL` | P1, B2, B3 |
| Q23 | Xác nhận hướng "một nguồn dữ liệu" (L4) và tách `GET /profile` khỏi `/auth/me` | Đồng ý: dữ liệu hồ sơ bản thân chỉ ở `tai_khoan`, không sao chép; `/auth/me` giữ nguyên 3 trường; sửa câu HĐK 2.4 thành "thông tin cá nhân là thông tin của hồ sơ bệnh nhân bản thân (một nguồn dữ liệu)"; chấp nhận lịch hẹn cũ hiện tên mới (không có bản sao tên trong `lich_hen`) | B1, B2, D1 |
| Q24 | Hai lần lưu đồng thời (hai tab) | Lần sau thắng trọn vẹn, không khoá lạc quan; ghi `TECH_DEBT` | B2 |

**Hồ sơ người thân (HSNT)**

| # | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q9 | Luồng **Sửa**: được sửa trường nào; hồ sơ **đã ngừng** có sửa được không; hồ sơ **đang có lịch hẹn hoạt động** có sửa được không? | Sửa đủ 5 trường của form tạo (họ tên, quan hệ, giới tính, ngày sinh, SĐT); điểm vào là nút "Chỉnh sửa" trên thẻ (Figma `434:2`); hồ sơ đã ngừng **không** sửa được (409 `HO_SO_NGUOI_THAN_DA_NGUNG`, FE ẩn nút); **cho sửa** khi có lịch hẹn (như hồ sơ bản thân; lịch hẹn hiện thông tin mới). Bổ sung các bước vào 2.4 (D4) | B4, F6 |
| Q10 | Luồng **Ngừng sử dụng**: nút ở đâu, có hộp xác nhận không, hồ sơ đã ngừng còn hiện không, có **sử dụng lại** không, ngừng lần hai thì sao? | Nút "Ngừng sử dụng" trong khung sửa hồ sơ; **có** hộp xác nhận (thao tác không đảo được nếu không có "sử dụng lại"); hồ sơ đã ngừng **vẫn hiện** trong danh sách với nhãn "Ngừng sử dụng", không có nút sửa (khớp "N hồ sơ · M đang sử dụng" của Figma); **không** có "sử dụng lại" (2.4 chỉ có tạo/sửa/ngừng — cần dùng lại thì tạo hồ sơ mới); ngừng hồ sơ đã ngừng ⇒ **200 không đổi gì** (idempotent). Nhóm bổ sung frame (4.5) và bước vào 2.4 (D4) | B5, F7 |
| Q11 | A2/*c **liệt kê lịch hẹn đang chặn** gồm trường nào? | Mỗi lịch: mã lịch hẹn, thời gian, trạng thái, tên bác sĩ, tên chi nhánh; sắp theo thời gian tăng dần. HTTP **409** `HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN`, `chiTiet` là **mảng** các lịch (cùng kiểu với lỗi lịch hoạt động của admin). "Gợi ý huỷ lịch hẹn đó trước": câu chữ + liên kết tới "Lịch hẹn của tôi" khi `booking` có trang (trước đó chỉ câu chữ) | B5, F7 |
| Q12 | Chốt tập trạng thái **"đang hoạt động"** = `ChoThanhToan`, `DaXacNhan`, `DaTiepDon` (2.4 HSNT đã nêu; DB quy tắc 37 còn `[cần điền]`) | Chốt; dùng **một hằng số chung** cho HSNT và `booking`; bỏ `[cần điền]` ở quy tắc 37 + truy vấn mẫu (D3). `DaDoiLich` không chặn (lịch đã được thay bằng lịch mới — lịch mới mới chặn) | B5, D3 |
| Q13 | **Đặt hàm kiểm lịch hẹn đang chặn ở đâu** (để `booking` dùng lại) và **hợp đồng khoá** với `booking` | **A** — trong `patient` (`patient/relatives/`), `PatientModule` export; `booking` import `PatientModule`. Được: làm ngay, một chủ. Mất: `booking` (chủ của `lich_hen`) phụ thuộc ngược vào `patient`. **B** — thư mục dùng chung `apps/api/src/appointments/` chỉ chứa hằng `ACTIVE_APPOINTMENT_STATES` + truy vấn đọc `lich_hen` theo hồ sơ đi khám (không controller); `patient` tạo, `booking` tiếp quản khi làm module. Được: đúng chiều phụ thuộc, admin cũng thay được chuỗi viết cứng. Mất: thêm một thư mục chưa có chủ rõ cho tới khi `booking` bắt đầu. **C** — chờ `booking` rồi mới làm ngừng sử dụng. Được: không đoán hợp đồng. Mất: HSNT A2 trễ, chặn F7. Đề xuất: **B**; hợp đồng khoá: `benh_nhan` `FOR UPDATE` trước, rồi `ho_so_nguoi_than`, rồi đọc `lich_hen` (mục 5.3) — người làm `booking` xác nhận | B5 |
| Q14 | Giới hạn **số hồ sơ người thân**; chặn **trùng** (cùng họ tên + ngày sinh)? | Không giới hạn, không chặn trùng trong TLCN (2.4 không yêu cầu); ghi `TECH_DEBT` | B3 |
| Q15 | Chốt danh sách **mối quan hệ** (2.4 `[đề xuất]` = ENUM DB `[đề xuất]`) | Chốt đúng 8 giá trị, nhãn hiển thị: Cha, Mẹ, Vợ, Chồng, Con, Anh/Chị/Em, Ông/Bà, Khác; bỏ `[đề xuất]` ở 2.4 và ghi chú dbml (D2) | B3, F6 |

**Tra cứu hồ sơ bệnh nhân (TCBN)**

| # | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q16 | Lễ tân tra cứu **toàn hệ thống** hay **chỉ chi nhánh mình**? | **Toàn hệ thống**: Bệnh nhân mới đến quầy thường chưa có lịch ở chi nhánh đó (lọc theo lịch hẹn kiểu quy tắc 25 thì hiện tại luôn rỗng vì chưa có `booking`); dữ liệu đã được giới hạn trường + chỉ đọc. Phương án khác: chỉ Bệnh nhân có ≥ 1 `lich_hen` với `chi_nhanh_id = le_tan.chi_nhanh_id` (ngoài phạm vi ⇒ 404). Sửa 2.4 TCBN nêu rõ phạm vi (D4) | B6, B7 |
| Q17 | Kết quả gồm những ai? | Chỉ tài khoản `BenhNhan` **đã xác minh** (có dòng `benh_nhan`); tài khoản `NgungHoatDong` **vẫn hiện** kèm nhãn "Ngừng hoạt động" (Lễ tân cần biết để giải thích tại quầy); người thân **đã ngừng** vẫn hiện kèm nhãn | B6, B7 |
| Q18 | Trường trả về? | **Danh sách:** họ tên, SĐT, email (Figma `484:2`) + mã tài khoản dùng để mở chi tiết (không hiển thị). **Chi tiết:** họ tên, email, SĐT, giới tính, ngày sinh, địa chỉ, ngày tạo tài khoản, trạng thái tài khoản; người thân: họ tên, quan hệ, giới tính, ngày sinh, SĐT, trạng thái. **Không:** mật khẩu/băm, khoá đăng nhập, ví, hồ sơ khám, ảnh, mã nội bộ "u1". **"Số lần vắng khám"** (`benh_nhan.so_lan_no_show`, đã có cột): đề xuất **hiện** vì phục vụ tiếp đón. **"Lịch sử lịch hẹn"** (3 con số): **không làm ở đây**, để `booking` thêm vào trang này sau | B7, F8 |
| Q19 | Cách tìm, phân trang, độ dài từ khoá; GET hay POST? | `q` sau khi cắt khoảng trắng dài **2–100** ký tự; khớp **chứa**: họ tên, email; nếu `q` chỉ gồm chữ số (bỏ dấu cách/chấm) thì khớp chứa trên SĐT; phân trang theo `common/paging` (Q42 của PLAN admin; 20/trang, tối đa 100), sắp `ho_ten`, rồi `tai_khoan_id`. FE tự tìm sau 300 ms ngừng gõ + Enter, huỷ yêu cầu cũ (Figma không có nút "Tìm"). Dùng **GET `?q=`** cho nhất quán với admin B17; ứng dụng không log `q`; log truy cập nginx có thể chứa `q` ⇒ ghi `TECH_DEBT` (phương án khác: `POST /reception/patients/search`) | B6, F8 |
| Q20 | Có **ghi nhật ký** khi Lễ tân tra cứu/xem hồ sơ (SOW 3.2.4) không? Sửa hồ sơ cá nhân/người thân có ghi không? | **A — không ghi** trong TLCN: enum hiện hành chỉ gồm thao tác ghi của admin, không có hành động xem; ghi `TECH_DEBT`. **B** — thêm `XemHoSoBenhNhan` vào `hanh_dong_nhay_cam_enum` (đối tượng `benh_nhan` đã có), ghi một dòng khi **xem chi tiết** (không ghi khi tìm), `chi_nhanh_id` = chi nhánh Lễ tân; cần migration đổi enum + 3 file `docs/database/*` + `ChangeMap`; chủ sở hữu: `audit`/`admin` (Trung) làm trước, `patient` chỉ gọi `AuditService.record`. Sửa hồ sơ cá nhân/người thân: **không ghi** (không phải thao tác nhạy cảm theo danh sách hiện hành). Đề xuất: **A** | B9, D5 |

**Giao diện và chung**

| # | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q21 | Khung Bệnh nhân/Lễ tân: (a) mục menu của module chưa có; (b) chuông thông báo + số đếm; (c) màn hẹp (Figma chỉ 1440 px); (d) cách module khác cắm trang; (e) trang mặc định `/benh-nhan`, `/le-tan` khi "Tổng quan" chưa có; (f) nút Đăng xuất thuộc khung này hay auth F5; (g) đường dẫn trang | (a) nút vô hiệu "Chưa được triển khai" như `AdminSidebar`; (b) **ẩn** tới khi `notification` có; (c) dưới 1024 px thanh bên thu thành nút menu mở ngăn kéo `[đề xuất]`, nhóm duyệt/bổ sung frame; (d) khung nhận **cấu hình menu từ lớp router** (`router/`), module khác chỉ sửa `router/`, không import chéo `features/`; (e) chuyển hướng tới "Hồ sơ người khám" (BN) và "Tra cứu bệnh nhân" (LT) cho tới khi có "Tổng quan"; (f) **trong khung** (gọi `logout()` của auth), F5 chỉ còn form đổi mật khẩu; (g) `/benh-nhan/ho-so-nguoi-kham`, `/le-tan/tra-cuu-benh-nhan`, `/le-tan/thong-tin-ca-nhan`, `/admin/thong-tin-ca-nhan` `[đề xuất]` — nhóm gửi đường dẫn trong mã Figma Make nếu có (như `roles.ts` đã làm) | F1, F2, F5 |
| Q22 | Trạng thái chưa có frame (mục 4.5) | Dùng thành phần có sẵn `loading-state`/`error-state`/`empty-state`/`offline-banner` và kiểu thông báo lỗi dưới ô như màn auth; câu chữ ở mục 5.9; nhóm bổ sung Figma sau | F* |
| Q25 | Màu Figma không đạt WCAG 2.2 AA (mục 4.4) | Theo ADR 0004: dùng token có sẵn (`brand-strong` cho nút có chữ trắng, token chữ phụ đạt 4,5:1); ghi vào danh sách lệch Figma để nhóm sửa Figma | F* |
| Q26 | Tên endpoint | `GET/PUT /profile`; `GET/POST /patient/relatives`, `PUT /patient/relatives/:id`, `POST /patient/relatives/:id/deactivate`; `GET /reception/patients`, `GET /reception/patients/:id` (mục 5.7) | B* |
| Q27 | Mã tài khoản/hồ sơ sai dạng trên đường dẫn (không phải số nguyên dương trong khoảng BIGINT) | Trả **404 `KHONG_TIM_THAY`** cùng thân với không tồn tại (không phân biệt "sai dạng" và "không có", H3) | B4, B5, B7 |

### 4.2a Kết quả trả lời ngày 03/11/2026 — **quyết định cuối**

Nhóm duyệt độc lập: "PLAN patient đạt, duyệt có chỉnh". **Đồng ý đề xuất** ở Q2, Q3, Q4 (A — hoãn), Q5 (A — làm sau cùng), Q6–Q12, Q13 (B), Q14–Q19, Q20 (A), Q21–Q27. Khác đề xuất và chỉnh:

| # | Quyết định | Hệ quả cho kế hoạch |
|---|---|---|
| Q1 | **ĐỔI — Có.** Nhóm đã chốt 20/10/2026 gộp use case của Bác sĩ vào "Cập nhật hồ sơ cá nhân"; 2.4 bản Drive sót Bác sĩ ở dòng tác nhân; Figma có trang Bác sĩ | Thêm `BacSi` vào `@Roles` của `GET/PUT /profile` (B1, B2). `GET /profile` của Bác sĩ trả thêm chi nhánh công tác chỉ đọc (`bac_si.chi_nhanh_id`) — nhóm đồng ý 03/11/2026. Trang Bác sĩ **không** làm ở đây (khung thuộc `doctor`, `[PHỤ THUỘC doctor]`). HS-16, QP-02 đổi (Bác sĩ được 200); QP-03, QP-04 giữ 403 cho Bác sĩ. D1: thêm Bác sĩ vào tác nhân của use case "Cập nhật hồ sơ cá nhân" trong 2.4. Rủi ro hai người cùng sửa: H14 |
| Q21c | Chỉnh: ngăn kéo cho màn hẹp tách thành **task cuối cụm 1** | Task mới **F11**; F1, F2 merge được mà không cần nó; KG-08 thuộc F11 |
| Q13 | Chỉnh: B, kèm hai điều kiện | (1) `TECH_DEBT`: truy vấn viết cứng `trang_thai IN ('ChoThanhToan','DaXacNhan','DaTiepDon')` ở `admin/services/service.repository.ts` nên chuyển sang dùng hằng `ACTIVE_APPOINTMENT_STATES` (việc của admin, D6). (2) **PLAN `booking` xác nhận hợp đồng khoá trước khi làm X3** |
| Mục 5.3 (H1) | Chỉnh: hai bước đầu là đọc có khoá, `SELECT` thường đầu tiên nằm sau khoá ⇒ REPEATABLE READ đã thấy mọi lịch hẹn đã commit | Bỏ phương án READ COMMITTED; chỉ thêm `FOR SHARE` nếu NT-17 chứng minh cần (mục 3.5 H1, 5.3) |
| Q3 | Chỉnh: báo Trung mã giới tính `Nam`/`Nu`/`Khac` | Để trang xem Bệnh nhân của admin (B17) ánh xạ nhãn "Nam"/"Nữ"/"Khác" (TRACKING mục 5) |

Hệ quả khác của các câu "đồng ý": Q4 = A ⇒ B8, F10 **hoãn** (ghi `TECH_DEBT`, `GET /profile` trả `anhDaiDien: null`); Q5 = A ⇒ F9 làm sau cùng, chỉ khi nhóm có frame + mẫu chuỗi QR giả;
Q16 ⇒ tra cứu **toàn hệ thống**; Q20 = A ⇒ B9, D5 **không làm**, TC-16 kiểm "không có dòng nhật ký"; Q26 ⇒ tên endpoint ở mục 5.7 là tên chốt.

### 4.3 Mọi chỗ còn `[cần điền]` / `[đề xuất]` liên quan và câu hỏi tương ứng

| Nơi | Nội dung | Thuộc | Câu hỏi |
|---|---|---|---|
| 2.4 HSNT b2 | Danh sách mối quan hệ `[đề xuất]` | module này | Q15 |
| `clinix.dbml` / `clinix_mysql.sql` — `ho_so_nguoi_than.moi_quan_he` | "`[đề xuất]` danh sách giá trị; Khac cho quan hệ không có trong danh sách" | module này (ghi chú) | Q15 |
| `clinix_quy_tac_nghiep_vu.md` quy tắc 37 + truy vấn mẫu "đếm lịch hẹn đang hoạt động" | Tập "đang hoạt động" `[cần điền]` | `booking` (chủ), module này dùng chung | Q12 |
| `clinix_quy_tac_nghiep_vu.md` quy tắc 25 | "Danh sách trường thông tin hành chính được xem: `[cần điền]`" — admin đã chốt Q26 nhưng file quy tắc chưa cập nhật | `admin` (báo Trung, không sửa ở đây) | — (tham chiếu cho Q18) |
| `tai_khoan.da_xac_minh_email` | "Nhân sự: đặt true khi kích hoạt … `[đề xuất]`" | `admin` | ngoài phạm vi |
| `bac_si.so_nam_kinh_nghiem`, `bac_si.chuc_danh` | `[đề xuất]` | `admin` | ngoài phạm vi |
| `tai_khoan.gioi_tinh`, `ho_so_nguoi_than.gioi_tinh` | Không có tập giá trị (không gắn thẻ nhưng thiếu) | module này | Q3 |
| 2.4 HSCN, HSNT, TCBN | Không còn thẻ nào khác; các chỗ **thiếu** (không gắn thẻ) đã liệt kê ở L1–L18 | module này | Q1–Q20 |

### 4.4 Đối chiếu Figma (đã đọc 03/11/2026)

Frame đã đọc: Bệnh nhân `416:2` (Hồ sơ người khám), `432:2` (Chỉnh sửa thông tin bản thân), `433:2` (Thêm hồ sơ người thân), `434:2` (Chỉnh sửa hồ sơ người thân); Lễ tân `503:2`, `504:2`
(Thông tin cá nhân + Chỉnh sửa), `483:2` (Tra cứu bệnh nhân), `484:2` (Kết quả tìm kiếm), `485:2` (Hồ sơ bệnh nhân), `505:2` (Không có kết quả); Admin `510:2`, Admin chi nhánh `620:2`;
Bác sĩ `475:2` (+ `476:2`: Q1 = Có — dùng API `/profile` của module này, trang làm ở `doctor`).

- **Khung Bệnh nhân** (`416:2`): thanh bên trái (logo CLINIX; thẻ người dùng "họ tên / Bệnh nhân"; Tổng quan, Lịch hẹn của tôi, Hồ sơ khám bệnh, Ví của tôi, Danh sách chờ, Tin nhắn (số đếm),
  Thông báo (số đếm), **Hồ sơ người khám**; cuối: "Về trang chủ", "Đăng xuất" chữ đỏ); thanh trên phải: chuông (số đếm) + "Đăng xuất".
- **Khung Lễ tân** (`483:2`, `503:2`): cùng kiểu; menu: Tổng quan, Quản lý lịch hẹn, **Tra cứu bệnh nhân**, Lịch làm việc bác sĩ, Yêu cầu đổi lịch (số đếm), Danh sách chờ, Tin nhắn,
  Thông báo (số đếm), **Thông tin cá nhân**; cuối: "Đăng xuất" (không có "Về trang chủ").
- **Hồ sơ người khám** (`416:2`): khối "Bản thân" (avatar chữ viết tắt + biểu tượng máy ảnh nhỏ; họ tên, email, SĐT, giới tính, ngày sinh, địa chỉ; "Chưa cập nhật" khi trống; nút "Chỉnh sửa"),
  khối "Người thân" ("N hồ sơ người thân · M đang sử dụng", nút "Thêm người thân", mỗi thẻ: họ tên, quan hệ, giới tính, ngày sinh, SĐT, "Trạng thái hồ sơ: Đang sử dụng", nút "Chỉnh sửa"),
  khối "Bảo mật tài khoản" (form đổi mật khẩu — của auth F5). Sửa bản thân/người thân là **sửa tại chỗ trong thẻ** (`432:2`, `434:2`); thêm người thân là một thẻ form "Thêm người thân mới" (`433:2`).
- **Lễ tân - Thông tin cá nhân** (`503:2`/`504:2`): thẻ đầu (avatar, họ tên, "Lễ tân · <chi nhánh>", nhãn "Đang hoạt động"); form: họ tên `*`, SĐT, giới tính ("Chọn giới tính"), ngày sinh,
  địa chỉ, email chỉ đọc + "Email dùng để đăng nhập, không thể chỉnh sửa.", "Chi nhánh công tác" chỉ đọc + "Chi nhánh do quản trị viên phân công, không thể tự…" (câu bị cắt trong Figma — `[cần điền]` câu đủ).
  Lưu ý: SĐT ở `504:2` **không** có dấu `*` trong khi cột `NOT NULL` và HSCN bắt buộc ⇒ FE vẫn bắt buộc (ghi lệch Figma).
- **Tra cứu** (`483:2`–`485:2`, `505:2`): hai cột — trái: ô tìm "Tìm theo họ tên, số điện thoại hoặc email...", danh sách kết quả (avatar, họ tên, SĐT, email), "N kết quả"; phải: "Chọn một bệnh nhân để xem hồ sơ"
  hoặc hồ sơ (L15); không có kết quả: "Không tìm thấy bệnh nhân" / "Thử tìm với từ khoá khác".
- **Phải bỏ/sửa theo quyết định đã chốt:** dòng "Mô phỏng trong bộ nhớ — không lưu server. Mật khẩu demo mặc định: demo123" (G3 của auth); placeholder "Tối thiểu 8 ký tự" (Q11/N10 của auth) — cả hai thuộc form auth F5.
- **Lệch WCAG 2.2 AA cần nhóm sửa Figma (Q25, đo khi làm FE bằng màu thật):** nút "Thêm người thân" nền xanh nhạt chữ trắng; chữ "Chưa cập nhật" xám nghiêng; nhãn "Bản thân"/quan hệ
  chữ xanh nhạt trên nền xanh nhạt; chữ phụ trong danh sách kết quả tra cứu; chữ "Đang sử dụng" xanh lá. FE dùng token đạt chuẩn của ADR 0004.
- **Không có trong Figma:** nút/khung tải ảnh đại diện (L5); nút "Quét QR CCCD" (L6); nút sửa của Admin (L7); mọi trạng thái ngừng sử dụng (L9, L10, L18); "Tổng quan" của hai vai trò thuộc module khác.

### 4.5 Trạng thái chưa có frame Figma (nhóm bổ sung; trong lúc chờ FE theo Q22)

- HSCN: đang tải; lưu thất bại do mạng/timeout/500; lưu thành công (thông báo ngắn hay chỉ quay về chế độ xem); lỗi từng trường (chỉ có dấu `*`); quét QR (nút, đang quét, không đọc được,
  không có quyền camera); Admin sửa hồ sơ (Q6); màn hẹp (F11). (Ảnh đại diện: hoãn — Q4 = A.)
- HSNT: danh sách rỗng (chưa có người thân); lỗi từng trường; hộp xác nhận ngừng sử dụng; ngừng bị chặn (lý do + danh sách lịch hẹn + gợi ý huỷ); thẻ hồ sơ đã ngừng.
- TCBN: đang tìm; lỗi mạng/timeout; từ khoá quá ngắn; phân trang (danh sách trái chỉ có "1 kết quả"); đang tải chi tiết; Bệnh nhân không có người thân; tài khoản ngừng hoạt động.
- Khung: mục menu chưa triển khai; màn hẹp; Lễ tân/Bệnh nhân không có "Tổng quan".
  **Màn hẹp (F11, 04/11/2026):** file Figma Design chưa có frame (252 frame đều 1440) nhưng **mã Make đã có** (`DashboardLayout.tsx` dòng 351–412: ngăn kéo `w-64`,
  nền `bg-black/50`, nút Menu bên trái thanh trên, `main` `p-4 md:p-6`); F11 bám Make. Lệch có chủ ý (TRACKING F11-I): ngưỡng 1024 px theo Q21c (Make `md` = 768 px);
  thêm nút "Đóng menu"; giữ chữ "Đăng xuất" ở thanh trên (Make ẩn chữ dưới 640 px, nút mất tên truy cập); hiệu ứng trượt vào (Make không có); chuông và số đếm ẩn (Q21b).
  Thanh trên luôn hiện khi hẹp như Make, nhưng bằng `sticky` (ở đây cả trang cuộn, Make cho `main` tự cuộn), kèm dải lỗi đăng xuất `sticky` ngay dưới: không phải lệch.

### 4.6 Việc của nhóm (ngoài repo)

- ~~Trả lời Q1–Q27~~ — xong 03/11/2026 (mục 4.2a).
- **Sửa 2.4** (file Word ở repo `TLCN_CLINIX`) theo D1, D4: thêm Bác sĩ vào tác nhân "Cập nhật hồ sơ cá nhân" (Q1), giới tính, câu "đồng bộ", luồng sửa/ngừng sử dụng, phạm vi tra cứu.
- **Sửa/bổ sung Figma:** Q6 (frame sửa hồ sơ QTV), trạng thái mục 4.5, màu mục 4.4, câu "Chi nhánh do quản trị viên phân công…" bị cắt.
- Cho F9 (Q5 = A): frame nút/trạng thái quét QR + mẫu chuỗi QR **giả** kèm nguồn mô tả định dạng. Chưa có thì F9 chưa làm.

## 5. Thiết kế kỹ thuật

### 5.1 Cấu trúc thư mục

**API — `apps/api/src/patient/`** (theo nếp của `auth`: mỗi use case một thư mục con, controller chỉ nhận/trả, service điều phối + giao dịch):

```
patient/
  patient.module.ts          # [P1, đã làm: @Module({}) rỗng] task sau thêm: import AuthModule (TypeOrmModule của tai_khoan/benh_nhan), TypeOrmModule.forFeature([HoSoNguoiThan, LichHen, LeTan, QuanTriVien, BacSi, ChiNhanh])
  patient.constants.ts       # [P1, đã làm] mã lỗi của module (mục 5.9), KEYWORD_MIN_LENGTH/MAX_LENGTH
  validation/                # birth-date-policy.ts, gender-policy.ts, address-policy.ts, relationship.ts (chỉ giá trị, nhãn ở web), patient-field.decorators.ts [P1, đã làm]
  profile/                   # profile.controller.ts, profile.service.ts, profile.dto.ts, profile.repository.ts  (HSCN — mọi vai trò được phép)
  relatives/                 # relatives.controller.ts, relatives.service.ts, relatives.dto.ts, relatives.repository.ts  (HSNT)
  reception-lookup/          # patient-lookup.controller.ts, patient-lookup.service.ts, patient-lookup.dto.ts, patient-lookup.repository.ts  (TCBN)
  testing/                   # fixture/hàm hỗ trợ test dùng chung của module
apps/api/src/appointments/   # Q13 = B: active-appointment-states.ts + active-appointment.query.ts (đọc lich_hen), không controller; booking tiếp quản sau
```

Ghi chú P1 (duyệt 04/11/2026, TRACKING P1-B): đề xuất `patient.module.ts` lúc P1 là `@Module({})` rỗng; `AuthModule` và `TypeOrmModule.forFeature` do từng task (B1, B3…) thêm khi có provider dùng tới, nên danh sách entity ở dòng trên là của cả module, không phải của P1. Decorator DTO đặt ở `validation/patient-field.decorators.ts`; mã giới tính ở `validation/gender-policy.ts`.

**Web — `apps/web/src/features/patient/`** (một module = một thư mục `features/`; xuất mảng `RouteObject[]` cho `router/` ghép):

```
features/patient/
  index.ts                   # bề mặt công khai: route của BN/LT/QTV, layout, kiểu cấu hình menu
  shell/                     # role-layout.tsx (F2, nội bộ: nối useAuth + useLogout vào RoleShell), patient-layout.tsx (F1), reception-layout.tsx (F2): hai lớp mỏng (ngăn kéo màn hẹp F11 KHÔNG đặt ở đây mà ở shared/, xem dưới)
  patient-routes.tsx         # PATIENT_ROUTES (route con của khung BN; F1 chỉ có trang giữ chỗ "Hồ sơ người khám", F3 thay), RECEPTION_ROUTES (khung LT; F2 chỉ có trang giữ chỗ "Tra cứu bệnh nhân", F8 thay)
  profile/                   # profile-service.ts, profile-types.ts, use-profile.ts, profile-view.tsx, profile-form.tsx (dùng chung 3 vai trò), profile-errors.ts
  relatives/                 # relatives-service.ts, relatives-types.ts, use-relatives.ts, relative-card.tsx, relative-form.tsx, deactivate-relative-dialog.tsx
  patient-lookup/            # patient-lookup-service.ts, use-patient-search.ts, patient-lookup-page.tsx, patient-result-list.tsx, patient-detail.tsx
  pages/                     # patient-profile-page.tsx (Hồ sơ người khám), reception-profile-page.tsx, admin-profile-page.tsx
  patient-paths.ts           # hằng đường dẫn (Q21g): PATIENT_PATHS (F1), RECEPTION_PATHS (F2)
router/role-nav.ts           # (Q21d) cấu hình mục menu của BN/LT — lớp router sở hữu để module sau chỉ sửa ở đây
shared/ui/role-shell.tsx     # [F1, duyệt 04/11/2026 — TRACKING F1-B] RoleShell thuần hiển thị + kiểu RoleNavItem; ở shared/ để khung Bác sĩ (doctor) dùng lại
shared/ui/shell-content-error.tsx  # [F1, duyệt 04/11/2026 — TRACKING F1-F] errorElement của vùng nội dung trong khung (khung vẫn còn khi trang con lỗi)
shared/ui/role-shell-sidebar.tsx   # [F11, duyệt 04/11/2026, đã làm — TRACKING F11-D] thân thanh bên (logo, thẻ, menu, mục cuối, Đăng xuất, hộp lỗi) tách khỏi role-shell.tsx; dùng cho cả thanh bên (rộng) và ngăn kéo (hẹp)
shared/hooks/use-media-query.ts    # [F11, duyệt 04/11/2026, đã làm — TRACKING F11-C] useMediaQuery(query) qua useSyncExternalStore (JS quyết định hẹp/rộng vì Vitest chạy css: false)
shared/hooks/use-modal-dialog.ts   # [F11, duyệt 04/11/2026, đã làm — TRACKING F11-C] focus vào trong, bẫy Tab/Shift+Tab, Esc, trả focus, khoá cuộn nền
src/test/fake-match-media.ts       # [F11, duyệt 04/11/2026, đã làm — TRACKING F11-D] matchMedia giả cho test màn hẹp (happy-dom 21 không bắn `change` ở lần thu hẹp đầu, TECH_DEBT dòng 64)
```

Ghi chú F11 (duyệt và làm 04/11/2026): PLAN cũ ghi `features/patient/shell/mobile-nav-drawer.tsx`, nhưng `RoleShell` ở `shared/ui/` từ F1 và `shared/` không import từ `features/`;
khung Bác sĩ của `doctor` cũng dùng `RoleShell` ⇒ ngăn kéo nằm trong `RoleShell` (và các file `shared/` ở trên), khung Bác sĩ có sẵn ngăn kéo mà không phải làm gì thêm.

Ghi chú F1 (duyệt 04/11/2026): `RoleShell` chuyển từ `features/patient/shell/` sang `shared/ui/` vì `features/` không import chéo, nên khung Bác sĩ (module `doctor`)
không dùng được bản đặt trong `features/patient/`. `RoleShell` không gọi `useAuth`/`useLogout`; `RoleLayout` (nội bộ, F2) nối chúng vào; `PatientLayout`, `ReceptionLayout` chỉ truyền vai trò, tên thanh bên và menu.

### 5.2 Hồ sơ cá nhân (HSCN): **một API dùng chung cho bốn vai trò** — vì sao

- **Dữ liệu sửa được của mọi vai trò nằm ở CÙNG một bảng `tai_khoan`** (`ho_ten`, `so_dien_thoai`, `gioi_tinh`, `ngay_sinh`, `dia_chi`, `anh_dai_dien`). Bảng con theo vai trò chỉ chứa dữ liệu
  **không** được tự sửa: `benh_nhan` (no-show), `bac_si` (chi nhánh, chuyên khoa, chức danh…), `le_tan.chi_nhanh_id`, `quan_tri_vien.pham_vi_quan_tri/chi_nhanh_id` (do QTV phân công). Vậy luật kiểm dữ liệu,
  câu `UPDATE` và mã lỗi giống hệt nhau ⇒ tách theo vai trò chỉ nhân bốn mã và test. Khác biệt duy nhất là **phần chỉ đọc** khi đọc (chi nhánh của Bác sĩ/Lễ tân, phạm vi của QTV) ⇒ một service rẽ nhánh khi đọc.
- `@Roles('BenhNhan', 'BacSi', 'LeTan', 'QuanTriVien')` (Q1 = Có); tài khoản = `user.accountId` từ token; **không có tham số id** trên đường dẫn ⇒ không thể sửa hồ sơ người khác (QP-05).
  QTV không cần `RequireAdminScope` vì chỉ đụng hàng của chính mình (cả hai phạm vi đều được).
- **"Đồng bộ sang hồ sơ bệnh nhân bản thân"** (L4): không có bước đồng bộ — hồ sơ bản thân **là** `tai_khoan` (một nguồn). `benh_nhan` không bị ghi. Test HS-04 kiểm `GET /auth/me` và
  `GET /profile` cùng trả tên mới, `benh_nhan` không đổi.
- **Quan hệ với `GET /auth/me`:** giữ nguyên (không mở rộng, không đổi hợp đồng đã chốt của auth). `GET /profile` là endpoint bổ trợ cho HSCN b2. Sau khi lưu, FE gọi hàm làm mới người dùng của auth
  (P2) để thanh bên hiện tên mới — dùng lại `/auth/me`, không nhân bản dữ liệu.
- **Ghi:** một câu `UPDATE tai_khoan SET ho_ten=?, so_dien_thoai=?, gioi_tinh=?, ngay_sinh=?, dia_chi=? WHERE tai_khoan_id=? AND trang_thai='DangHoatDong'`; 0 hàng ⇒ 401 `PHIEN_HET_HIEU_LUC` (H9);
  đọc lại và trả hồ sơ mới. **PUT thay cả bộ trường** (form luôn gửi đủ; trường tuỳ chọn gửi `null` để xoá — Q7, Q8), tránh mơ hồ của PATCH "không gửi = giữ hay xoá".
- **Email:** không có trong DTO ⇒ gửi lên là 400 `TRUONG_KHONG_DUOC_PHEP` (2.4 MT "Email cố định").
- **QR CCCD (Q5 = A, F9 làm sau cùng):** hoàn toàn ở FE — giải mã, đổ vào form, người dùng vẫn sửa và bấm "Lưu thay đổi" như bình thường. API chỉ nhận các trường đã điền; không có trường CCCD.
- **Ảnh đại diện:** **hoãn** (Q4 = A). `GET /profile` trả `anhDaiDien: null` và FE hiện avatar chữ viết tắt như Figma; DTO `PUT` không có trường ảnh.

### 5.3 Hồ sơ người thân (HSNT) và ngừng sử dụng

- `@Roles('BenhNhan')`; mọi truy vấn có `benh_nhan_id = user.accountId` (H3). Danh sách trả **cả hai trạng thái**, sắp: đang sử dụng trước, rồi theo `ho_so_nguoi_than_id` (Q10).
- **Tạo:** một câu `INSERT` với `trang_thai_hieu_luc = true`, `dia_chi = NULL` (Q8); lỗi FK (`isForeignKeyError`) ⇒ 403 `KHONG_DU_QUYEN` `[đề xuất]` (H13; không xảy ra với tài khoản đăng nhập được).
  Không khoá gì (Q14 không giới hạn; nếu nhóm đặt giới hạn thì khoá `benh_nhan` `FOR UPDATE` rồi đếm, cùng giao dịch).
- **Sửa:** `UPDATE … WHERE ho_so_nguoi_than_id=? AND benh_nhan_id=? AND trang_thai_hieu_luc=true`; 0 hàng ⇒ phân biệt "không có/không thuộc mình" (404) với "đã ngừng" (409, Q9) bằng một lần đọc lại.
- **Ngừng sử dụng — một giao dịch (H1):**
  1. `SELECT … FROM benh_nhan WHERE tai_khoan_id=? FOR UPDATE` — **khoá chung với `booking`** (quy tắc 37 yêu cầu booking khoá dòng này khi đếm và tạo lịch hẹn).
  2. `SELECT … FROM ho_so_nguoi_than WHERE ho_so_nguoi_than_id=? AND benh_nhan_id=? FOR UPDATE` — không có ⇒ 404; đã ngừng ⇒ trả thành công, không ghi (Q10).
  3. Đọc lịch hẹn đang chặn: `lich_hen WHERE ho_so_nguoi_than_id=? AND benh_nhan_id=? AND trang_thai IN (ChoThanhToan, DaXacNhan, DaTiepDon)` (dùng chỉ mục `lich_hen_index_ho_so_benh_nhan_trang_thai`),
     JOIN `bac_si`→`tai_khoan` lấy tên bác sĩ, `chi_nhanh` lấy tên. Đây là câu `SELECT` thường **đầu tiên** của giao dịch và nằm **sau** hai câu đọc có khoá ⇒ dưới REPEATABLE READ (mặc định)
     ảnh chụp nhất quán được tạo tại câu này nên đã thấy mọi lịch hẹn đã commit. Chỉ thêm `FOR SHARE` nếu NT-17 chứng minh cần (quyết định 03/11/2026).
  - **Bất biến bắt buộc:** **không câu đọc thường nào** (`SELECT` không khoá, kể cả `findOne`/`find` qua repository hay `manager`) được chạy trong giao dịch **trước** hai câu đọc có khoá ở bước 1–2;
    không mở giao dịch bằng `START TRANSACTION WITH CONSISTENT SNAPSHOT`. Lý do: dưới REPEATABLE READ, câu đọc thường đầu tiên chốt ảnh chụp; nếu nó chạy trước khoá thì
    lịch hẹn `booking` commit trong lúc chờ khoá sẽ **không** thấy được. Phiên kiểm độc lập 03/11/2026 đã thử trên MySQL thật: `SELECT` thường trước khoá thấy 0 lịch hẹn mới commit,
    `SELECT` thường sau khoá thấy 1. Mã B5 **phải** có comment ghi bất biến này ngay trên đoạn mở giao dịch, và ca **NT-24** (tất định) giữ nó: ai chèn câu đọc phía trước thì NT-24 đỏ.
  4. Có lịch ⇒ **trả kết quả có kiểu** (không ném trong giao dịch), commit (không ghi gì), rồi ném 409 `HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN` kèm `chiTiet` (Q11) — nếp của `LoginService` (A8).
  5. Không có ⇒ `UPDATE ho_so_nguoi_than SET trang_thai_hieu_luc=false`; lịch hẹn cũ (Hoàn thành/Đã hủy/Vắng mặt/Đã đổi lịch) **không** bị đụng (HĐK HSNT).
- **Hợp đồng cho `booking`** (ghi lại khi lập PLAN `booking`): thứ tự khoá `benh_nhan` → `ho_so_nguoi_than` → chèn `lich_hen`; dưới khoá phải kiểm `trang_thai_hieu_luc = true` (quy tắc service 5
  đã nêu "hồ sơ người thân đã ngừng hiệu lực"); dùng hằng `ACTIVE_APPOINTMENT_STATES` và hàm kiểm "hồ sơ dùng được để đặt lịch" ở `apps/api/src/appointments/` (Q13 = B). Nếu một luồng cần khoá cả `tai_khoan`
  và `benh_nhan` thì `tai_khoan` trước (cùng chiều với auth) `[đề xuất]`. **PLAN `booking` phải xác nhận hợp đồng này trước khi làm X3.**
- **Test khi chưa có `booking`:** dựng `lich_hen` thật bằng `AdminFixtures` (chi nhánh, bác sĩ, ca, khung giờ, lịch hẹn) trên MySQL thật; chạy đua NT-17 bằng một giao dịch giả lập đúng hợp đồng trên.
  Khi `booking` merge: X3 chạy lại với lịch hẹn tạo qua API thật.

### 5.4 Tra cứu hồ sơ bệnh nhân (TCBN)

- `@Roles('LeTan')`. Phạm vi **toàn hệ thống** (Q16): không lọc theo chi nhánh của Lễ tân, không đọc `le_tan`/`lich_hen` khi tra cứu.
- **Tìm:** `tai_khoan t JOIN benh_nhan b ON b.tai_khoan_id = t.tai_khoan_id WHERE t.loai_tai_khoan = 'BenhNhan' AND (t.ho_ten LIKE :p OR t.email LIKE :p [OR t.so_dien_thoai LIKE :pSo])`,
  `:p = '%' + escapeLikePattern(q) + '%'`; `ORDER BY t.ho_ten, t.tai_khoan_id`; `LIMIT/OFFSET` + `COUNT(*)` (Q19, Q42). Chọn **đúng** các cột trong danh sách trắng (Q18), không `SELECT *`.
- **Chi tiết:** một truy vấn hồ sơ + một truy vấn người thân (`ho_so_nguoi_than WHERE benh_nhan_id = ?`, cả hai trạng thái — Q17). Chỉ đọc, không giao dịch, không khoá.
- **Riêng tư:** `Cache-Control: no-store` (như `/auth/me`); không log `q` hay dữ liệu trả về; **không ghi nhật ký hành động** (Q20 = A, ghi `TECH_DEBT`).
- Dùng lại repository đọc người thân của B3 (một chỗ định nghĩa cột trả về cho người thân) — không viết truy vấn thứ hai.

### 5.5 Ảnh đại diện và QR CCCD — phân việc giao diện / API

| Việc | Giao diện | API | Lưu gì |
|---|---|---|---|
| Quét QR CCCD (Q5 = A, F9 làm sau cùng) | Mở camera hoặc chọn ảnh, giải mã chuỗi QR, tách trường, đổ vào form; bỏ số CCCD và các trường không dùng ngay trong bộ nhớ trình duyệt | **Không có endpoint riêng**; nhận các trường đã điền qua `PUT /profile` như nhập tay | Chỉ `ho_ten`, `ngay_sinh`, `gioi_tinh`, `dia_chi` (sau khi người dùng lưu). **Không** lưu số CCCD, chuỗi QR hay ảnh CCCD |
| Ảnh đại diện (Q4 = A: **hoãn**; cột dưới là hướng làm sau này nếu nhóm mở lại) | Nếu B: chọn ảnh, xem trước, gửi một tệp; gỡ ảnh | Nếu B: endpoint tải ảnh của chính mình + gắn/gỡ trong giao dịch (theo nếp B1/P7 của admin); kiểm định dạng/dung lượng ở API | Nếu B: một dòng `anh_tai_len` (`muc_dich = 'AnhDaiDien'`) + FK ở `tai_khoan`; ảnh cũ sang `ChoXoa` để job dọn có sẵn xoá |

### 5.6 Khung giao diện Bệnh nhân và Lễ tân

- `RoleShell` dùng chung (`shared/ui/role-shell.tsx` — F1, duyệt 04/11/2026): thanh bên (logo, thẻ người dùng, danh sách mục menu, mục cuối + "Đăng xuất"), thanh trên (nút "Đăng xuất";
  chuông ẩn — Q21b), vùng nội dung nhận `children` (nơi gọi truyền `<Outlet />`). **Thuần hiển thị:** họ tên, dòng phụ, mục menu, trạng thái đăng xuất đều đến qua props;
  `RoleLayout` (nội bộ module, F2; trước F2 là thân của `PatientLayout`) lấy `hoTen` + `ROLE_LABELS` từ `useAuth()` và gọi `useLogout()` **một lần** cho cả hai nút. `errorElement` đặt ở một route không đường dẫn bọc các trang con
  (`ShellContentError`), nên trang con lỗi thì khung vẫn còn (TRACKING F1-F). Mục menu là dữ liệu `{ label, icon, to? }`: có `to` ⇒ `NavLink` (đánh dấu mục đang mở bằng `aria-current`);
  không có ⇒ nút vô hiệu "Chưa được triển khai" (Q21a). Biểu tượng `lucide-react` (ADR 0003). Số đo Figma và token: TRACKING F1-C.
- `PatientLayout`, `ReceptionLayout` = `RoleShell` + cấu hình menu của vai trò; `router/role-routes.tsx` thay **đúng** hai mục `BenhNhan`, `LeTan` (giữ nguyên `BacSi`, `QuanTriVien` — KG-07).
  **F2 đã làm (04/11/2026, TRACKING F2-A…F2-K):** `RECEPTION_NAV` trong `role-nav.ts` (9 mục theo `483:2`, không có "Về trang chủ"), `reception-layout.tsx`, mục `LeTan` (khung + route
  mặc định `<Navigate replace>` + `errorElement` bọc trang con) trong `role-routes.tsx`. Thanh bên `483:2`/`503:2` trùng `416:2` từng số, chỉ khác menu và không có mục cuối ⇒ **không sửa
  `RoleShell`**, không file `shared/ui` nào đổi; thân của `PatientLayout` chuyển sang `RoleLayout` nội bộ (`vaiTro`, `navLabel`, `items`, `footerItems?`, không xuất qua `index.ts`),
  `PatientLayout` và `ReceptionLayout` là hai lớp mỏng; thêm `RECEPTION_PATHS` (`root`, `lookup`), `RECEPTION_ROUTES` (trang giữ chỗ "Tra cứu bệnh nhân", `lazy`, F8 thay); chỉ
  "Tra cứu bệnh nhân" có `to` (không `end`), "Thông tin cá nhân" là nút vô hiệu tới F4. Dòng phụ thẻ người dùng là `ROLE_LABELS.LeTan` (thẻ ở thanh bên `483:2` chỉ ghi "Lễ tân";
  chi nhánh chỉ có ở thẻ đầu trang `503:2`, thuộc F4).
- Màn hẹp (Q21c): dưới 1024 px thanh bên thu thành nút menu mở ngăn kéo — **task F11 riêng, cuối cụm 1**; F1, F2 merge được trước (khi đó thanh bên chỉ có bố cục màn rộng).
  **F11 đã làm (04/11/2026, TRACKING F11-A…F11-K):** trong `RoleShell`, không ở `features/patient/`; một DOM duy nhất, JS quyết định hẹp/rộng bằng `matchMedia('(min-width: 1024px)')`
  qua `useSyncExternalStore`. Rộng: DOM và số đo **y hệt F1, F2**. Hẹp: thanh trên có nút "Mở menu" (`aria-expanded`, `aria-controls`); thân thanh bên nằm trong một
  phần tử `role="dialog"` `aria-modal="true"` tên theo `navLabel`, đóng thì có thuộc tính `hidden`; mở thì vùng nội dung `inert`, focus vào ngăn kéo, bẫy Tab, Esc / nền mờ / "Đóng menu" /
  chọn mục / đổi đường dẫn / chuyển sang rộng đều đóng (khoá mở xoá ngay khi đổi đường dẫn, nên Back về trang cũ không mở lại), trả focus về nút mở, khoá cuộn nền;
  thanh trên và dải lỗi đăng xuất `sticky` khi hẹp (TRACKING F11-K mục 10, 11). Chữ ký props giữ nguyên, kiểu `RoleShellLogout` giữ nguyên chỗ (search F1 import).
- Cách module khác cắm trang (Q21d): module mới xuất `RouteObject[]`; lớp `router/` ghép vào `children` của khung và đặt `to` cho mục menu trong `router/role-nav.ts` — không sửa file trong `features/patient/`,
  không import chéo `features/`.
- Đăng xuất: gọi `logout()` của auth, không hộp xác nhận (G5); đây là phần "nút Đăng xuất ở layout" mà auth F5 từng nhận (Q21f).
- Chỗ chừa cho form đổi mật khẩu: trang "Hồ sơ người khám" (khối "Bảo mật tài khoản"), "Thông tin cá nhân" Lễ tân và QTV có một vùng render `ChangePasswordForm` của auth nếu F5 đã merge;
  nếu chưa, F5 tự cắm vào vùng này (F5 vẫn của auth).

### 5.7 Endpoint (tên đã chốt ở Q26; tiền tố `/api` qua proxy như mọi endpoint)

| Endpoint | Vai trò | Use case | Ghi chú |
|---|---|---|---|
| `GET /profile` | BN, BS, LT, QTV | HSCN b2 (bổ trợ) | 200 `{ hoTen, email, soDienThoai, gioiTinh, ngaySinh, diaChi, anhDaiDien (luôn null — Q4), vaiTro, chiNhanh: {chiNhanhId, ten} \| null, phamViQuanTri: 'ToanHeThong' \| 'ChiNhanh' \| null }`; `chiNhanh` của BS lấy từ `bac_si.chi_nhanh_id` (chỉ đọc), của LT từ `le_tan`, của QTV Chi nhánh từ `quan_tri_vien`; `no-store`. Không băm, trạng thái khoá, ví |
| `PUT /profile` | BN, BS, LT, QTV | HSCN b3–b5, A1 | Body `{ hoTen, soDienThoai, gioiTinh, ngaySinh, diaChi }` (3 trường cuối nhận `null`). 200 như `GET`. 400 `DU_LIEU_KHONG_HOP_LE` + `loi[]`; 401 `PHIEN_HET_HIEU_LUC` (H9) |
| `GET /patient/relatives` | BN | HSNT b1 (bổ trợ) | 200 `{ items: [{ hoSoNguoiThanId, hoTen, moiQuanHe, gioiTinh, ngaySinh, soDienThoai, trangThaiHieuLuc }] }` (không phân trang — số lượng nhỏ, Q14) |
| `POST /patient/relatives` | BN | HSNT b2–b5, A1 | Body `{ hoTen, moiQuanHe, gioiTinh, ngaySinh, soDienThoai? }`. 201 hồ sơ vừa tạo |
| `PUT /patient/relatives/:id` | BN | HSNT "sửa" (MT, HĐK), A1 | Body như POST. 200; 404 `KHONG_TIM_THAY`; 409 `HO_SO_NGUOI_THAN_DA_NGUNG` (Q9) |
| `POST /patient/relatives/:id/deactivate` | BN | HSNT "ngừng sử dụng" (MT, HĐK), A2 | Không thân. 200 `{ trangThaiHieuLuc: false }`; 404; 409 `HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN` + `chiTiet: [{ maLichHen, thoiGian, trangThai, bacSi, chiNhanh }]` (Q11) |
| `GET /reception/patients?q=&page=&pageSize=` | LT | TCBN b2–b4, A1 | 200 `Paged<{ taiKhoanId, hoTen, soDienThoai, email, trangThai }>`; rỗng ⇒ `items: []`, `total: 0` (không phải 404); 400 `TU_KHOA_KHONG_HOP_LE`; `no-store` |
| `GET /reception/patients/:id` | LT | TCBN b5–b6 | 200 `{ hoTen, email, soDienThoai, gioiTinh, ngaySinh, diaChi, thoiDiemTao, trangThai, soLanVangMat?, nguoiThan: [...] }` (Q18); 404 cùng thân cho không có / không phải BN / chưa xác minh / sai dạng (Q27); `no-store` |

### 5.8 Quy tắc kiểm dữ liệu (BE là nguồn đúng; FE dùng cùng quy tắc)

| Trường | Quy tắc | Mã lỗi trường | Nguồn |
|---|---|---|---|
| `hoTen` | Dùng lại `IsAccountFullName` (chuẩn hoá NFC, cắt khoảng trắng ASCII, ≥ 1 chữ cái, ≤ 100, không ký tự điều khiển) | `HO_TEN_KHONG_HOP_LE` | auth A5-D |
| `soDienThoai` | Dùng lại `IsAccountPhone` (10 số, bắt đầu 0, lưu 10 số liền); bản thân bắt buộc, người thân tuỳ chọn (rỗng ⇒ `NULL`) | `SDT_KHONG_HOP_LE` | auth S5 |
| `ngaySinh` | `YYYY-MM-DD`, ngày có thật, `1900-01-01 ≤ x ≤ todayVN()`; bản thân `null` được, người thân bắt buộc | `NGAY_SINH_KHONG_HOP_LE` `[đề xuất]` | Q7 |
| `gioiTinh` | Thuộc tập Q3; bản thân `null` được, người thân bắt buộc | `GIOI_TINH_KHONG_HOP_LE` `[đề xuất]` | Q3 |
| `diaChi` | Chỉ bản thân; cắt khoảng trắng ASCII, ≤ 255, không ký tự điều khiển, rỗng ⇒ `NULL` | `DIA_CHI_KHONG_HOP_LE` `[đề xuất]` | Q8 |
| `moiQuanHe` | Một trong 8 giá trị ENUM | `MOI_QUAN_HE_KHONG_HOP_LE` `[đề xuất]` | Q15 |
| `q` | Sau cắt khoảng trắng: 2–100 ký tự | `TU_KHOA_KHONG_HOP_LE` `[đề xuất]` | Q19 |
| trường lạ (`email`, `taiKhoanId`, `benhNhanId`, `trangThaiHieuLuc`, `soCccd`…) | Bị từ chối | `TRUONG_KHONG_DUOC_PHEP` | auth P5 |

### 5.9 Mã lỗi → thông báo (câu chữ đề xuất; nhóm duyệt và đưa vào Figma)

| Mã lỗi | HTTP | Thông báo `[đề xuất]` |
|---|---|---|
| `DU_LIEU_KHONG_HOP_LE` (+ `loi[]`) | 400 | Dữ liệu không hợp lệ. (chi tiết từng ô theo mã trường dưới) |
| `NGAY_SINH_KHONG_HOP_LE` | (mã trường) | Ngày sinh không hợp lệ. |
| `GIOI_TINH_KHONG_HOP_LE` | (mã trường) | Vui lòng chọn giới tính. |
| `DIA_CHI_KHONG_HOP_LE` | (mã trường) | Địa chỉ tối đa 255 ký tự và không chứa ký tự điều khiển. |
| `MOI_QUAN_HE_KHONG_HOP_LE` | (mã trường) | Vui lòng chọn mối quan hệ. |
| `HO_TEN_KHONG_HOP_LE`, `SDT_KHONG_HOP_LE` | (mã trường) | Dùng lại câu của auth (PLAN auth 5.5) |
| `TU_KHOA_KHONG_HOP_LE` | 400 | Nhập ít nhất 2 ký tự để tìm kiếm. |
| `HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN` | 409 | Không thể ngừng sử dụng hồ sơ này vì đang có lịch hẹn chưa hoàn tất. Vui lòng hủy các lịch hẹn dưới đây trước. |
| `HO_SO_NGUOI_THAN_DA_NGUNG` | 409 | Hồ sơ người thân này đã ngừng sử dụng nên không thể chỉnh sửa. |
| `KHONG_TIM_THAY` | 404 | Không tìm thấy dữ liệu. (dùng chung; FE trang tra cứu: "Không tìm thấy bệnh nhân.") |
| `KHONG_DU_QUYEN` | 403 | Bạn không có quyền thực hiện thao tác này. |
| `PHIEN_HET_HIEU_LUC` | 401 | Dùng lại của auth |
| `TRUONG_KHONG_DUOC_PHEP` | (mã trường) | Dùng lại của auth P5 |
| Lưu hồ sơ thành công | 200 | Đã cập nhật thông tin cá nhân. |
| Tra cứu rỗng | 200 | Không tìm thấy bệnh nhân. Thử tìm với từ khoá khác. (Figma `505:2`) |

### 5.10 Giao dịch, log, kiểm thử

- Giao dịch: chỉ "ngừng sử dụng" là nhiều bước (mục 5.3). Các ghi khác là một câu lệnh. Lỗi UNIQUE/FK đã lường trước ⇒ mã nghiệp vụ, không 500 (`database/mysql-errors.ts`).
- Log: `Logger` của Nest; **không** ghi họ tên, SĐT, email, ngày sinh, địa chỉ, `q`, chuỗi QR `[đề xuất — SOW chỉ bắt buộc mật khẩu/token/OTP, đây là mức chặt hơn cho dữ liệu cá nhân]`.
- Kiểm thử: unit cho luật thuần (ngày sinh có đồng hồ giả biên 23:59/00:00 giờ VN), DTO; **tích hợp MySQL thật** (`*.int-spec.ts`) cho sở hữu, ngừng sử dụng + chạy đua, truy vấn tra cứu, collation;
  **e2e** qua `configureApp(app)` cho phân quyền và hình dạng lỗi (`expectErrorResponse`); FE Vitest + happy-dom, dựa vào vai trò và nội dung (không tên class), giả API qua lớp client.

## 6. Kế hoạch task

### 6.1 Sơ đồ phụ thuộc (cùng một hàng = làm song song được)

```
Nền đã có: auth A1–A15, F1–F3 · admin P2 (entity + migration ho_so_nguoi_than, lich_hen, le_tan, quan_tri_vien), audit, common/*, seed

Mọi câu hỏi đã trả lời (03/11/2026) — mọi task dưới đây bắt đầu được khi phụ thuộc của nó đã merge.

Cụm 1 (khung + đọc):  F1 khung dùng chung + khung BN ── F2 khung LT ── F11 ngăn kéo màn hẹp (cuối cụm, không chặn F1/F2)
                      B1 GET /profile (BN, BS, LT, QTV)
                      P2 [ĐỤNG auth] export kiểm dữ liệu FE + làm mới hoTen
Cụm 2 (hồ sơ):        P1 khung PatientModule + luật kiểm dữ liệu
                      P1 ─ B2 PUT /profile ─┬─ F3 Hồ sơ người khám (Bản thân)  [cần F1, B1, P2]
                                            ├─ F4 Thông tin cá nhân Lễ tân      [cần F2, F3]
                                            └─ F5 Thông tin cá nhân QTV [ĐỤNG admin] [cần F3]
                      (trang Bác sĩ: module doctor gọi B1/B2 — PHỤ THUỘC doctor)
Cụm 3 (người thân):   P1 ─ B3 danh sách + tạo ─ B4 sửa ─ F6 người thân (danh sách/thêm/sửa) [cần F3]
                      B3 ─ B5 ngừng sử dụng + kiểm lịch hẹn (appointments/) ─ F7 UI ngừng sử dụng [cần F6]
Cụm 4 (tra cứu):      B6 tìm kiếm ─ B7 chi tiết (dùng repo người thân của B3) ─ F8 trang tra cứu [cần F2]
Cụm 5 (sau cùng):     F9 quét QR (Q5 = A) [cần F3; nhóm cung cấp frame + mẫu QR giả]
HOÃN / KHÔNG LÀM:     B8, F10 ảnh đại diện (Q4 = A — hoãn) · B9, D5 nhật ký tra cứu (Q20 = A — không làm)
HOÀN TẤT:             X1 chạy tay ─ X2 tổng kết ;  X3 sau khi booking có đặt lịch thật VÀ PLAN booking đã xác nhận hợp đồng khoá
```

Cột trạng thái: ☐ = chưa làm, ☑ = đã merge, ⏸ = hoãn theo quyết định, ✕ = không làm theo quyết định. Rà lại 03/11/2026: **chưa task nào merge**. 04/11/2026: F1 tick trong PR của chính nó (như nếp của auth), có hiệu lực khi PR đó merge.

### 6.2 Nhóm P — Tiền đề của module

| ☐ | ID | Việc | Phụ thuộc | Truy vết | Thẻ / PR gợi ý |
|---|---|---|---|---|---|
| ☑ | P1 | Khung `PatientModule` (`apps/api/src/patient/`, đăng ký `AppModule`, import `AuthModule` + `TypeOrmModule.forFeature` các entity cần); `patient.constants.ts` (mã lỗi 5.9); `validation/`: luật ngày sinh (`todayVN`, 1900-01-01…hôm nay — Q7), giới tính (`Nam`/`Nu`/`Khac` — Q3), địa chỉ (≤ 255 — Q8), mối quan hệ (8 giá trị — Q15) + decorator DTO; unit test. **Kế hoạch chi tiết (duyệt 04/11/2026): TRACKING P1-A…P1-H** | auth A1 (decorator họ tên/SĐT), admin P2 (entity) — đã có | HSCN b4, A1/4a; HSNT b4, A1/4a | `[TIỀN ĐỀ]` · `feat(patient)` |
| ☑ | P2 | FE: export qua `features/auth/index.ts` các hàm kiểm họ tên/SĐT có sẵn ở `validation/account-policy.ts`, và một hàm làm mới người dùng hiện tại (gọi lại `/auth/me`, cập nhật `hoTen` trong store); test. **Kế hoạch chi tiết (duyệt 05/11/2026): TRACKING P2-A…P2-H** | auth F1 (đã có) | HSCN b5 (tên mới hiện ngay); H8 | `[ĐỤNG auth]` · `feat(web)` — **báo chủ module auth** |

### 6.3 Nhóm B — Backend

| ☐ | ID | Việc | Phụ thuộc | Truy vết | Thẻ |
|---|---|---|---|---|---|
| ☐ | B1 | `GET /profile` cho **BN, BS, LT, QTV** (Q1): đọc `tai_khoan` + phần chỉ đọc theo vai trò (BS: chi nhánh công tác từ `bac_si`, chỉ đọc; LT: chi nhánh; QTV: phạm vi, chi nhánh); `anhDaiDien` luôn `null` (Q4); danh sách trắng trường; `no-store`; 401 nếu tài khoản không còn hoạt động | auth A4 (đã có) | HSCN b1–b2 | `feat(patient)` — làm ngay |
| ☐ | B2 | `PUT /profile` cho BN, BS, LT, QTV: DTO (email, ảnh, CCCD và trường lạ bị từ chối), chuẩn hoá, `UPDATE` 5 cột có điều kiện `DangHoatDong`, trả hồ sơ mới; không đụng `benh_nhan`/`bac_si`/`le_tan`/`quan_tri_vien` (H14) | P1, B1 | HSCN b3–b5, A1/4a–4b; HĐK thành công/thất bại | `[ĐỒNG BỘ TL]` D1 · `feat(patient)` |
| ☐ | B3 | `GET` + `POST /patient/relatives`: sở hữu theo `benh_nhan_id`, tạo ở trạng thái hiệu lực, không giới hạn số lượng, không chặn trùng (Q14), `dia_chi` luôn `NULL` (Q8); repository đọc người thân dùng chung với B7 | P1 | HSNT b1–b5, A1; HĐK tạo | `[ĐỒNG BỘ TL]` D2 · `feat(patient)` |
| ☐ | B4 | `PUT /patient/relatives/:id`: chỉ hồ sơ của mình và đang hiệu lực; được sửa khi có lịch hẹn; 404 (cả id sai dạng — Q27) / 409 `HO_SO_NGUOI_THAN_DA_NGUNG` (Q9) | B3 | HSNT MT "sửa", HĐK sửa, A1 | `[ĐỒNG BỘ TL]` D4 · `feat(patient)` |
| ☐ | B5 | `POST /patient/relatives/:id/deactivate`: giao dịch REPEATABLE READ khoá `benh_nhan` → `ho_so_nguoi_than` → đọc `lich_hen` đang chặn (`FOR SHARE` chỉ khi NT-17 cần); **không câu đọc thường nào (SELECT không khoá, kể cả `findOne` qua repository) được chạy trước hai câu đọc có khoá** — comment bắt buộc trong mã, giữ bằng NT-24 (mục 5.3); 409 kèm danh sách (Q11); idempotent (Q10); **tạo `apps/api/src/appointments/`** với hằng `ACTIVE_APPOINTMENT_STATES` (Q12) + hàm kiểm "hồ sơ dùng được để đặt lịch" (Q13 = B); test tích hợp bằng `AdminFixtures` + chạy đua với giao dịch giả lập `booking` (NT-17) + ca tất định NT-24 | B3 | HSNT MT "ngừng sử dụng", HĐK ngừng, A2/*a–*c | `[ĐỒNG BỘ TL]` D3, D4 · `feat(patient)`. **Không chờ `booking`** (dùng dữ liệu tự dựng); X3 kiểm lại với dữ liệu thật |
| ☐ | B6 | `GET /reception/patients`: phạm vi **toàn hệ thống** (Q16); chỉ BN đã xác minh, kể cả `NgungHoatDong` (Q17); `q` 2–100 ký tự, khớp chứa họ tên/email, SĐT khi `q` toàn chữ số (Q19); escape LIKE, phân trang theo `common/paging` (Q42 của PLAN admin), danh sách trắng trường, `no-store`; không ghi nhật ký (Q20 = A) | auth A4 | TCBN b1–b4, A1/4a–4b | `[ĐỒNG BỘ TL]` D3, D4 · `feat(patient)` |
| ☐ | B7 | `GET /reception/patients/:id`: trường theo Q18 (có "Số lần vắng khám", **không** có "Lịch sử lịch hẹn"), người thân cả hai trạng thái (dùng repo của B3); 404 cùng thân (Q27) | B6, B3 | TCBN b5–b6; HĐK (không đổi dữ liệu) | `feat(patient)` |
| ⏸ | B8 | Ảnh đại diện — **hoãn (Q4 = A)**. Nếu nhóm mở lại: ADR mới, migration `anh_tai_len.muc_dich` + FK `tai_khoan`, chính sách ảnh riêng, endpoint tải/gắn/gỡ của chính mình — phối hợp Trung (chủ `common/upload`) | B2 | HSCN b2–b3 (ảnh đại diện) | `[HOÃN]` · ghi `TECH_DEBT` ở D6 |
| ✕ | B9 | Ghi nhật ký khi Lễ tân xem chi tiết — **không làm (Q20 = A)** | — | TCBN; SOW 3.2.4 | ghi `TECH_DEBT` ở D6 |

### 6.4 Nhóm F — Frontend (bám frame Figma mục 4.4; trạng thái chưa có frame theo Q22)

| ☐ | ID | Việc | Phụ thuộc | Truy vết | Thẻ |
|---|---|---|---|---|---|
| ☑ | F1 | `RoleShell` dùng chung + `PatientLayout` (thanh bên + thanh trên theo `416:2`, thẻ người dùng từ `useAuth()`, mục chưa có trang là nút vô hiệu "Chưa được triển khai", ẩn chuông và số đếm, nút Đăng xuất gọi `useLogout()` một lần cho hai nút), thay mục `BenhNhan` trong `router/role-routes.tsx`; cấu hình menu ở `router/role-nav.ts`; trang mặc định chuyển tới "Hồ sơ người khám" (Q21). **Kế hoạch chi tiết (duyệt 04/11/2026): TRACKING F1-A…F1-K** — `RoleShell` đặt ở `shared/ui/` (F1-B); phải sửa test của `features/auth` đang khẳng định "Bệnh nhân là trang giữ chỗ" (F1-G) | auth F1, F5 (đã có) | Khung (nhóm chốt 03/11/2026); HSNT b1 (điểm vào "Hồ sơ người khám") | `feat(web)` · KG-01, KG-03…KG-07, KG-09 (phần tự động) |
| ☑ | F2 | `ReceptionLayout` (theo `483:2`/`503:2`), thay mục `LeTan`; trang mặc định chuyển tới "Tra cứu bệnh nhân". **Kế hoạch chi tiết (duyệt 04/11/2026): TRACKING F2-A…F2-J, kiểm chứng F2-K** — không sửa `RoleShell` (thanh bên `483:2` trùng `416:2`, F2-B); `RoleLayout` nội bộ cho cả hai khung (F2-C); sửa 3 ca test có sẵn còn khẳng định "Lễ tân là trang giữ chỗ" (F2-F, F2-K) | F1 | Khung; TCBN b1, HSCN b1 (Lễ tân) | `feat(web)` · KG-02, KG-03…KG-07 (phần Lễ tân), KG-09 (phần tự động) |
| ☑ | F11 | Ngăn kéo màn hẹp (Q21c): dưới 1024 px thanh bên thu thành nút menu mở ngăn kéo, cho cả hai khung; **task cuối cụm 1**, không chặn merge F1/F2. **Kế hoạch chi tiết (duyệt 04/11/2026): TRACKING F11-A…F11-J, kiểm chứng F11-K** — ngăn kéo nằm trong `shared/ui/role-shell.tsx` (sửa) + `shared/ui/role-shell-sidebar.tsx`, `shared/hooks/use-media-query.ts`, `shared/hooks/use-modal-dialog.ts` (mới), không ở `features/patient/shell/` (F11-D); một DOM, JS quyết định hẹp/rộng (F11-C); màn rộng không đổi DOM và số đo; 0 ca test có sẵn đỏ thật, không sửa test cũ nào (F11-K); bố cục bám mã Make, lệch có chủ ý ở F11-I | F1, F2 | Khung | `feat(web)` · KG-08, KG-09 (phần màn hẹp) |
| ☐ | F3 | Trang "Hồ sơ người khám" phần **Bản thân**: xem (`416:2`) + sửa tại chỗ (`432:2`), `ProfileForm` dùng chung (có giới tính — Q2; ngày `dd/mm/yyyy` — Q7), email chỉ đọc, lỗi theo trường giữ dữ liệu, làm mới tên trên khung; chừa vùng "Bảo mật tài khoản" cho auth F5 | F1, B1, B2, P2 | HSCN b1–b5, A1/4a–4c | `feat(web)` |
| ☐ | F4 | Lễ tân "Thông tin cá nhân" (`503:2`, `504:2`): dùng `ProfileForm`, chi nhánh chỉ đọc | F2, F3 | HSCN (tác nhân Lễ tân) | `feat(web)` |
| ☐ | F5 | QTV "Thông tin cá nhân" (`510:2`, `620:2`) với bố cục xem/sửa như Lễ tân + "Phạm vi quản trị" chỉ đọc (Q6): ghép route vào khung Admin ở `router/role-routes.tsx`, đặt `to` cho mục "Thông tin cá nhân" trong `admin-sidebar.tsx` | F3 | HSCN (tác nhân Quản trị viên) | `[ĐỤNG admin]` — báo Trung · `feat(web)` |
| ☐ | F6 | Người thân: danh sách + đếm "N · M đang sử dụng" + thêm (`433:2`) + sửa tại chỗ (`434:2`), nhãn trạng thái và nhãn quan hệ (Q15), hồ sơ đã ngừng không có nút sửa (Q9), danh sách rỗng | F3, B3, B4 | HSNT b1–b5, A1/4a–4c; sửa | `feat(web)` |
| ☐ | F7 | Ngừng sử dụng: nút trong khung sửa, hộp xác nhận, hiển thị lý do + danh sách lịch hẹn đang chặn (Q11) + gợi ý huỷ, thẻ hồ sơ đã ngừng; không có "sử dụng lại" (Q10) | F6, B5 | HSNT A2/*a–*c; HĐK ngừng | chưa có frame — theo Q22 · `feat(web)` |
| ☐ | F8 | Trang tra cứu (`483:2`, `484:2`, `485:2`, `505:2`): tự tìm sau 300 ms + Enter, huỷ yêu cầu cũ, danh sách + chi tiết (không khối "Lịch sử lịch hẹn", không mã nội bộ — Q18), rỗng/lỗi/đang tải, phân trang | F2, B6, B7 | TCBN b1–b6, A1/4a–4c | `feat(web)` |
| ☐ | F9 | Quét QR CCCD (Q5 = A, **làm sau cùng**): đọc QR ở trình duyệt, đổ vào `ProfileForm` (mọi trang dùng form), không gửi/lưu CCCD | F3 (+F4, F5) | HSCN b2–b3 (QR) | `[PHỤ THUỘC nhóm: frame + mẫu chuỗi QR giả]` · `feat(web)` |
| ⏸ | F10 | Ảnh đại diện — **hoãn (Q4 = A)** | B8, F3 | HSCN (ảnh) | `[HOÃN]` |

### 6.5 Nhóm D — Đồng bộ tài liệu (đi cùng PR của task code tương ứng)

2.4 là file Word ở repo `TLCN_CLINIX` → người dùng sửa bằng commit ở repo đó, dẫn link trong PR. `docs/database/*`: sửa **cả ba file** cho khớp nhau và thêm dòng lịch sử đầu `clinix.dbml`.
Chỉ sửa **ghi chú/quy tắc** (không đổi DDL) thì giữ nguyên COMMENT trong `clinix_mysql.sql` và migration như cách A7 của auth đã làm (để test `schema-parity` không lệch), ghi `TECH_DEBT` nếu cần.

| ID | Nội dung | Đi cùng | Từ |
|---|---|---|---|
| D1 | 2.4 "Cập nhật hồ sơ cá nhân" (nhóm gọi UC 16): **thêm Bác sĩ vào dòng tác nhân** (Q1); thêm giới tính (Q2); câu HĐK "đồng bộ" → "một nguồn dữ liệu" (Q23); ghi ảnh đại diện hoãn (Q4), QR chỉ hỗ trợ nhập liệu ở giao diện (Q5). Figma: frame sửa QTV (Q6) | B2, F3, F5 | Q1, Q2, Q4, Q5, Q6, Q23 |
| D2 | `docs/database/*`: ghi chú tập giá trị `gioi_tinh` ở `tai_khoan` và `ho_so_nguoi_than` (Q3); bỏ `[đề xuất]` ở `moi_quan_he` (Q15) — dbml + quy tắc; 2.4 HSNT b2 bỏ `[đề xuất]` | B3 | Q3, Q15 |
| D3 | `clinix_quy_tac_nghiep_vu.md` mục 2: quy tắc mới "Ngừng sử dụng hồ sơ người thân" (tập trạng thái chặn, khoá `benh_nhan` trước, idempotent, lịch hẹn cũ không đổi) + "Tra cứu hồ sơ bệnh nhân của Lễ tân" (phạm vi, trường); quy tắc 37 + truy vấn mẫu: bỏ `[cần điền]` tập "đang hoạt động" (Q12 — báo người làm `booking`); dbml dòng lịch sử | B5, B6 | Q12, Q13, Q16–Q18 |
| D4 | 2.4 HSNT: thêm các bước của luồng Sửa và Ngừng sử dụng, A2/*c danh sách trường (Q9–Q11); 2.4 TCBN: phạm vi + trường hiển thị + người thân/ tài khoản đã ngừng (Q16–Q18). Figma: frame mục 4.5 | B4, B5, B7 | Q9–Q11, Q16–Q18 |
| ~~D5~~ | ✕ Không làm (Q20 = A): không đổi enum nhật ký | — | Q20 |
| D6 | `docs/PLAN.md` (tick "Hồ sơ bệnh nhân" ở Phase 2); `docs/TRACKING.md` đúng **một** dòng; `docs/TECH_DEBT.md`: LIKE quét toàn bảng (H6), `q` có thể nằm trong log truy cập proxy (H5), ghi đè đồng thời (Q24, gồm cả H14 hai người sửa hồ sơ Bác sĩ), không giới hạn số người thân (Q14), ảnh đại diện hoãn (Q4), QR làm sau cùng (Q5), không ghi nhật ký tra cứu (Q20 = A), FE chép quy tắc kiểm dữ liệu (nối tiếp TECH_DEBT dòng 55), **truy vấn viết cứng tập "đang hoạt động" ở `admin/services/service.repository.ts` nên chuyển sang hằng `ACTIVE_APPOINTMENT_STATES`** (Q13; việc của admin). Các dòng nào phát sinh từ task cụ thể thì ghi ngay trong PR của task đó, D6 chỉ rà lại | X2 | Q13, Q14, Q20, Q24 |

### 6.6 Nhóm X — Hoàn tất

| ☐ | ID | Việc | Phụ thuộc |
|---|---|---|---|
| ☐ | X1 | Chạy tay 3 use case trên `docker compose up --build` với 5 tài khoản seed (đúng/sai vai trò, sở hữu, tra cứu rỗng, lỗi dữ liệu); điền kết quả vào `TRACKING.md`; kiểm độ phủ test của module (mục tiêu ≥ 70% — `docs/PLAN.md` Phase 4) | B1–B7, F1–F8, F11 (để KG-08 được chạy) |
| ☐ | X2 | Tổng kết: D6; kiểm mọi dòng `AI_USAGE_LOG.md`; chuẩn bị giải thích luồng cho vấn đáp (mục 9.6) | X1 |
| ☐ | X3 | Khi `booking` có đặt lịch thật: chạy lại NT-10…NT-17 và NT-24 với lịch hẹn tạo qua API thật; xác nhận `booking` tuân hợp đồng khoá (mục 5.3) và chặn đặt lịch cho hồ sơ đã ngừng (NT-18) | X1; `booking`; **PLAN `booking` đã xác nhận hợp đồng khoá** (Q13) |

### 6.7 Việc nào bắt đầu ngay, việc nào phải chờ

- **Bắt đầu ngay (mọi câu hỏi đã trả lời 03/11/2026):** F1 → F2 → F11 (khung — làm sớm vì `booking`/`doctor` cắm vào), B1, P2, P1; sau đó theo phụ thuộc trong bảng. Toàn bộ HSCN và TCBN không phụ thuộc module chưa có.
- **Làm được trước, kiểm lại sau:** B5, F7 — bảng và entity `lich_hen` đã có nên code + test bằng dữ liệu tự dựng; **dữ liệu thật** phải chờ `booking` và PLAN `booking` xác nhận hợp đồng khoá (X3).
- **Phải chờ người/module khác:** F5 (báo Trung trước khi sửa một dòng `admin-sidebar.tsx`), F9 (nhóm cung cấp frame + mẫu QR giả), trang Bác sĩ dùng `/profile` (module `doctor`). Form đổi mật khẩu trong các trang hồ sơ: chờ auth F5.
- **Hoãn / không làm:** B8, F10 (Q4 = A); B9, D5 (Q20 = A).

## 7. Test case dự kiến

Loại: **U** = unit, **I** = tích hợp MySQL thật (`*.int-spec.ts`), **E** = e2e qua `configureApp`, **C** = component/FE (Vitest), **M** = chạy tay. Cột "Phủ" là nơi truy vết.
`[Qn]` trong ca = quyết định đã chốt (TRACKING mục 3) mà ca kiểm. Ca thuộc task hoãn/không làm ghi "(không chạy …)" và không tính vào điều kiện hoàn thành. Ghi kết quả vào `TRACKING.md`.

### 7.1 Cập nhật hồ sơ cá nhân (HS)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| HS-01 | BN gọi `GET /profile` | 200, đúng tập khoá (không băm, khoá đăng nhập, ví, `taiKhoanId`), `chiNhanh` và `phamViQuanTri` là `null`, `Cache-Control: no-store` | HSCN b2 | E |
| HS-02 | LT gọi `GET /profile` | Có `chiNhanh {chiNhanhId, ten}` đúng `le_tan.chi_nhanh_id` | HSCN b2 (LT) | I |
| HS-03 | QTV Toàn hệ thống / QTV Chi nhánh gọi `GET /profile` | `phamViQuanTri` đúng; `chiNhanh` `null` / có giá trị | HSCN b2 (QTV) | I |
| HS-04 | BN `PUT /profile` hợp lệ đủ trường | 200; `tai_khoan` đổi đúng 5 cột; `benh_nhan` không đổi; `GET /auth/me` và `GET /profile` cùng trả tên mới (một nguồn — L4) | HSCN b5; HĐK thành công | I |
| HS-05 | LT, QTV `PUT /profile` hợp lệ | 200; `le_tan`/`quan_tri_vien` không đổi (chi nhánh, phạm vi giữ nguyên) | HSCN b5 | I |
| HS-06 | Thân có `email` | 400 `TRUONG_KHONG_DUOC_PHEP` ở trường `email`; email trong DB không đổi; không cột nào đổi | HSCN MT (email cố định) | E |
| HS-07 | Thân có `taiKhoanId`, `vaiTro`, `trangThai`, `chiNhanhId`, `loaiTaiKhoan`, `soCccd` | 400 `TRUONG_KHONG_DUOC_PHEP` cho từng trường; DB không đổi | H2 | E |
| HS-08 | SĐT: 9 số, 11 số, không bắt đầu 0, có chữ, `+84…`, hai dấu cách liền; hợp lệ có dấu cách/chấm | 400 `SDT_KHONG_HOP_LE`; ca hợp lệ lưu 10 số liền | HSCN b4, A1/4a | U |
| HS-09 | Ngày sinh: `2026-02-30`, `15/05/1990`, ngày mai theo giờ VN (đồng hồ giả 23:59:59 và 00:00:00 +07:00), `1899-12-31`; hợp lệ: hôm nay, `1900-01-01`, `null` | 400 `NGAY_SINH_KHONG_HOP_LE`; ca hợp lệ qua `[Q7]` | HSCN b4, A1/4a | U |
| HS-10 | Họ tên: rỗng, chỉ khoảng trắng, 101 ký tự, có ký tự điều khiển, không có chữ cái; hợp lệ: 100 ký tự có dấu | 400 `HO_TEN_KHONG_HOP_LE`; ca hợp lệ qua | HSCN b4 | U |
| HS-11 | Địa chỉ 256 ký tự / có xuống dòng; chuỗi rỗng; 255 ký tự | 400 `DIA_CHI_KHONG_HOP_LE`; rỗng ⇒ lưu `NULL`; 255 qua `[Q8]` | HSCN b4 | U |
| HS-12 | Giới tính ngoài tập; mỗi giá trị trong tập; `null` | 400 `GIOI_TINH_KHONG_HOP_LE`; còn lại qua `[Q3]` | HSCN b4 | U |
| HS-13 | Nhiều trường lỗi cùng lúc | 400 với `loi[]` đủ mọi trường; DB không đổi | HSCN A1/4b; HĐK thất bại | E |
| HS-14 | Xoá ngày sinh/địa chỉ/giới tính đã có (gửi `null`) | Cột về `NULL` `[Q7, Q8]` | HSCN b3 | I |
| HS-15 | Tài khoản bị chuyển `NgungHoatDong` sau khi guard cho qua (giả lập giữa hai bước) | 401 `PHIEN_HET_HIEU_LUC`; không cột nào đổi | H9 | I |
| HS-16 | Bác sĩ `GET /profile`, rồi `PUT /profile` hợp lệ | `GET` 200 có `chiNhanh` = `bac_si.chi_nhanh_id`; `PUT` 200, `tai_khoan` đổi đúng 5 cột, **`bac_si` không đổi cột nào** (H14) `[Q1]` | HSCN tác nhân (Bác sĩ) | E |
| HS-17 | FE: mở trang ⇒ hiện dữ liệu hiện tại; "Chưa cập nhật" cho trường trống; ngày dạng `dd/mm/yyyy`; email **không** có ô sửa + câu chỉ đọc | Đúng như mô tả | HSCN b1–b2 | C |
| HS-18 | FE: API trả lỗi từng trường ⇒ câu lỗi dưới đúng ô, dữ liệu đã nhập giữ nguyên, focus ô lỗi đầu; sửa rồi gửi lại thành công | Đúng | HSCN A1/4b–4c | C |
| HS-19 | FE: lưu thành công ⇒ thông báo, về chế độ xem, tên ở thanh bên đổi (P2) | Đúng | HSCN b5; H8 | C |
| HS-20 | FE: đang lưu (nút vô hiệu, không gửi trùng); mất mạng; timeout; 500 ⇒ thông báo, giữ dữ liệu; "Hủy" khôi phục dữ liệu cũ | Đúng | HSCN HĐK thất bại | C |
| HS-21 | FE Lễ tân: chi nhánh chỉ đọc kèm câu giải thích; QTV: phạm vi chỉ đọc `[Q6]` | Đúng | HSCN (LT, QTV) | C |
| HS-22 | FE QR `[Q5]`: chuỗi QR giả hợp lệ ⇒ điền đúng 4 trường, số CCCD không có trong bất kỳ yêu cầu mạng nào; chuỗi sai dạng ⇒ "Không đọc được mã QR", form không đổi; không có quyền camera ⇒ thông báo | Đúng | HSCN b2–b3 (QR); H11 | C |
| HS-23 | Hai `PUT` đồng thời với dữ liệu khác nhau | Kết quả cuối bằng đúng một trong hai bộ, không trộn trường `[Q24]` | H10 | I |
| HS-24 | Ảnh đại diện `[Q4 = A]`: `GET /profile` luôn `anhDaiDien: null`; thân `PUT` có `anhDaiDien` ⇒ 400 `TRUONG_KHONG_DUOC_PHEP` (phần tải ảnh không chạy — B8 hoãn) | Đúng | HSCN (ảnh — hoãn) | E |

### 7.2 Quản lý hồ sơ người thân (NT)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| NT-01 | Tạo hợp lệ, SĐT để trống | 201; `trang_thai_hieu_luc = true`, `benh_nhan_id` = người gọi, `so_dien_thoai` và `dia_chi` `NULL` | HSNT b3–b5; HĐK tạo | I |
| NT-02 | Thiếu từng trường bắt buộc (họ tên, ngày sinh, giới tính, mối quan hệ) | 400, đúng trường; không tạo | HSNT A1/4a | U |
| NT-03 | Mối quan hệ ngoài 8 giá trị; từng giá trị trong 8 | 400 `MOI_QUAN_HE_KHONG_HOP_LE`; 8 giá trị qua `[Q15]` | HSNT b2, A1/4a | U |
| NT-04 | Ngày sinh/SĐT sai định dạng khi có nhập; SĐT rỗng hợp lệ | 400 đúng mã; rỗng ⇒ `NULL` | HSNT b4 | U |
| NT-05 | Thân có `benhNhanId`, `trangThaiHieuLuc`, `hoSoNguoiThanId`, `diaChi` `[Q8]` | 400 `TRUONG_KHONG_DUOC_PHEP`; không tạo được hồ sơ cho người khác | H2 | E |
| NT-06 | Danh sách khi DB có hồ sơ của BN khác | Chỉ hồ sơ của người gọi, cả đang dùng và đã ngừng, đang dùng xếp trước | HSNT b1; QP | I |
| NT-07 | Sửa hợp lệ hồ sơ của mình | 200; đổi đúng 5 trường; `benh_nhan_id` giữ nguyên | HSNT sửa; HĐK sửa | I |
| NT-08 | Sửa / ngừng hồ sơ của BN khác; id không tồn tại; id sai dạng | 404 `KHONG_TIM_THAY` **cùng thân** cho cả ba; DB không đổi `[Q27]` | H3 | E |
| NT-09 | Sửa hồ sơ đã ngừng | 409 `HO_SO_NGUOI_THAN_DA_NGUNG`; không đổi `[Q9]` | HSNT sửa | I |
| NT-10 | Ngừng hồ sơ không có lịch hẹn | 200; `trang_thai_hieu_luc = false` | HSNT ngừng; HĐK ngừng | I |
| NT-11 | Ngừng hồ sơ chỉ có lịch `HoanThanh`, `DaHuy`, `VangMat`, `DaDoiLich` | 200; các lịch hẹn cũ không đổi một cột nào | HĐK ngừng (lịch cũ không ảnh hưởng) | I |
| NT-12 | Ngừng hồ sơ có đúng một lịch ở **từng** trạng thái `ChoThanhToan`, `DaXacNhan`, `DaTiepDon` (3 ca) | 409 `HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN`; `chiTiet` có đúng lịch đó với các trường Q11; hồ sơ vẫn hiệu lực | HSNT A2/*b–*c | I |
| NT-13 | Hồ sơ có nhiều lịch chặn + vài lịch không chặn | `chiTiet` đủ mọi lịch chặn, sắp theo thời gian, **không** có lịch không chặn | HSNT A2/*c | I |
| NT-14 | Lịch chặn thuộc hồ sơ **bản thân** (`ho_so_nguoi_than_id NULL`) hoặc người thân khác của cùng BN | Không chặn hồ sơ đang ngừng (200) | HSNT A2/*b (đúng hồ sơ) | I |
| NT-15 | Ngừng hồ sơ đã ngừng | 200, không ghi gì `[Q10]` | HSNT ngừng | I |
| NT-16 | Lỗi giả lập sau khi đã khoá (trước `UPDATE`) | Hoàn tác, hồ sơ vẫn hiệu lực, không khoá treo | HĐK thất bại | I |
| NT-17 | **Chạy đua**: ngừng hồ sơ song song với giao dịch giả lập `booking` (khoá `benh_nhan`, kiểm hiệu lực, chèn lịch `ChoThanhToan`), lặp ≥ 15 vòng. Mã ngừng hồ sơ tuân bất biến mục 5.3: không câu đọc thường nào (SELECT không khoá, kể cả `findOne` qua repository) chạy trước hai câu đọc có khoá | Mỗi vòng đúng một trong hai: (hồ sơ ngừng, không có lịch mới) hoặc (có lịch mới, ngừng bị 409); không deadlock, không 500 | H1; HSNT A2 | I |
| NT-18 | Hàm "hồ sơ dùng được để đặt lịch" với hồ sơ đã ngừng / của BN khác / đang hiệu lực | `false` / `false` / `true` (hợp đồng cho `booking`) `[Q13]` | HĐK ngừng ("không thể dùng để đặt lịch mới") | I |
| NT-19 | Nhiều hồ sơ cho một BN, hai hồ sơ trùng họ tên + ngày sinh | Đều tạo được `[Q14]` | HSNT b5 | I |
| NT-20 | FE danh sách: "N hồ sơ người thân · M đang sử dụng", nhãn trạng thái, nhãn quan hệ tiếng Việt, danh sách rỗng | Đúng | HSNT b1 | C |
| NT-21 | FE thêm: lỗi từng trường giữ dữ liệu; thành công ⇒ hồ sơ mới trong danh sách, form đóng | Đúng | HSNT b2–b5, A1/4b–4c | C |
| NT-22 | FE sửa tại chỗ: hiện dữ liệu hiện tại; "Hủy" khôi phục; hồ sơ đã ngừng không có nút "Chỉnh sửa" `[Q9]` | Đúng | HSNT sửa | C |
| NT-23 | FE ngừng: hộp xác nhận; bị chặn ⇒ lý do + danh sách lịch hẹn + gợi ý huỷ; thành công ⇒ nhãn "Ngừng sử dụng", mất nút sửa `[Q10, Q11]` | Đúng | HSNT A2/*a–*c | C |
| NT-24 | **Ảnh chụp sau khoá (tất định, giữ bất biến mục 5.3)**: giao dịch giả lập `booking` khoá `benh_nhan` `FOR UPDATE` trước; gọi ngừng hồ sơ ở kết nối khác và chờ tới khi nó **đang đợi khoá** (kiểm bằng `performance_schema.data_lock_waits`, không dùng `sleep` cố định); giao dịch giả lập chèn lịch `ChoThanhToan` cho hồ sơ đó rồi commit | Ngừng trả 409 `HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN`, `chiTiet` có đúng lịch vừa chèn; hồ sơ vẫn hiệu lực. Ca này đỏ (thấy 0 lịch, ngừng thành công) nếu có câu đọc thường chạy trước hai câu khoá | H1; HSNT A2 | I |

### 7.3 Tra cứu hồ sơ bệnh nhân (TC)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| TC-01 | Tìm một phần họ tên, khác hoa/thường, không dấu (`nguyen` khớp `Nguyễn Văn A`) | Có kết quả | TCBN b3–b4 | I |
| TC-02 | Tìm SĐT đầy đủ, một phần, có dấu cách/chấm | Có kết quả | TCBN b3–b4 | I |
| TC-03 | Tìm email đầy đủ và một phần | Có kết quả | TCBN b3–b4 | I |
| TC-04 | Từ khoá không khớp ai | 200 `{items: [], total: 0}` (không 404) | TCBN A1/4a–4b | I |
| TC-05 | `q` chứa `%`, `_`, `\` | Được coi là ký tự thường (không khớp tất cả) | H6 | I |
| TC-06 | `q` rỗng, 1 ký tự, 101 ký tự, chỉ khoảng trắng; biên 2 và 100 | 400 `TU_KHOA_KHONG_HOP_LE`; biên qua `[Q19]` | TCBN b3 | U |
| TC-07 | DB có Bác sĩ, Lễ tân, QTV và BN **chưa xác minh** khớp từ khoá | Không xuất hiện; chỉ BN đã xác minh | TCBN b4 `[Q17]` | I |
| TC-08 | BN `NgungHoatDong` khớp từ khoá | Xuất hiện kèm `trangThai` `[Q17]` | TCBN b4 | I |
| TC-09 | Phân trang: mặc định 20; `pageSize` 100 qua, 101 bị 400; `page` 0 bị 400; `total` đúng; thứ tự ổn định khi trùng họ tên | Đúng | Q19, admin Q42 | I |
| TC-10 | Danh sách: kiểm **chính xác** tập khoá mỗi phần tử | Chỉ `taiKhoanId, hoTen, soDienThoai, email, trangThai` `[Q18]` | H4 | E |
| TC-11 | Chi tiết BN có 2 người thân (1 đang dùng, 1 đã ngừng) | Đủ trường Q18 của bản thân + cả hai người thân kèm trạng thái; không trường thừa | TCBN b5–b6 `[Q17, Q18]` | E |
| TC-12 | Chi tiết: id không tồn tại / là tài khoản Lễ tân / BN chưa xác minh / sai dạng | 404 cùng thân `[Q27]` | H3 | E |
| TC-13 | Phạm vi toàn hệ thống `[Q16]`: BN không có lịch hẹn nào, và BN chỉ có lịch ở chi nhánh **khác** chi nhánh của Lễ tân | Cả hai xuất hiện trong kết quả và xem được chi tiết | TCBN tiền điều kiện | I |
| TC-14 | Sau tìm + xem chi tiết | Không bảng nào đổi (so số hàng + checksum các bảng liên quan trước/sau) | TCBN HĐK (chỉ đọc) | I |
| TC-15 | Phản hồi tìm và chi tiết | `Cache-Control: no-store` | H4 | E |
| TC-16 | Nhật ký `[Q20 = A]`: tìm rồi xem chi tiết | Không có dòng `nhat_ky_hanh_dong` nào được thêm | SOW 3.2.4 (quyết định không ghi) | I |
| TC-17 | FE: trạng thái ban đầu (`483:2`), kết quả (`484:2`), chọn ⇒ hồ sơ (`485:2`), không kết quả (`505:2`) với đúng câu Figma; đổi từ khoá ⇒ tìm lại | Đúng | TCBN b1–b6, A1/4b–4c | C |
| TC-18 | FE: gõ nhanh nhiều ký tự ⇒ một yêu cầu sau 300 ms; kết quả cũ về sau không đè kết quả mới; đang tìm; lỗi mạng/timeout; từ khoá 1 ký tự không gọi API | Đúng `[Q19]` | TCBN b3–b4 | C |

### 7.4 Phân quyền và sở hữu (QP)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| QP-01 | Gọi mọi endpoint mới không có token | 401 `CHUA_DANG_NHAP` | Tiền điều kiện cả 3 UC | E |
| QP-02 | `/profile`: BN, **BS**, LT, QTV (cả hai phạm vi) | 200 cho cả bốn vai trò `[Q1]` | HSCN tác nhân | E |
| QP-03 | `/patient/relatives*`: LT, QTV, **BS** | 403 `KHONG_DU_QUYEN` (Bác sĩ vẫn bị chặn dù được dùng `/profile`) | HSNT tác nhân | E |
| QP-04 | `/reception/patients*`: BN, BS, QTV (cả hai phạm vi) | 403 `KHONG_DU_QUYEN` | TCBN tác nhân | E |
| QP-05 | `/profile` kèm `?taiKhoanId=<người khác>` hoặc thân có `taiKhoanId` | Query bị bỏ qua (vẫn đọc/sửa **chính mình**); thân ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`; hồ sơ người khác không đổi | LT/QTV/BN chỉ sửa chính mình | E |
| QP-06 | BN A đọc/sửa/ngừng hồ sơ người thân của BN B | 404, hồ sơ của B không đổi (= NT-08) | BN chỉ đụng hồ sơ của mình | E |
| QP-07 | Phiên đã thu hồi; tài khoản bị khoá | 401 (guard có sẵn) | Tiền điều kiện | E |
| QP-08 | Quét mọi route của `PatientModule`: route nào cũng có `@Roles` (không route nào chỉ dựa guard đăng nhập) | Đạt (mẫu: `rbac/testing/admin-route-audit.ts`) | SOW 3.2.1 | U |

### 7.5 Khung giao diện Bệnh nhân / Lễ tân (KG)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| KG-01 | BN vào `/benh-nhan` | `PatientLayout`: thanh bên đúng thứ tự Figma, họ tên + "Bệnh nhân", trang mặc định theo Q21e | Khung BN | C |
| KG-02 | LT vào `/le-tan` | `ReceptionLayout` tương tự | Khung LT | C |
| KG-03 | BN mở `/le-tan`, LT mở `/benh-nhan` | Hành vi `RequireAuth` hiện có (không render khung sai vai trò) | Phân quyền FE (không thay backend) | C |
| KG-04 | Mục chưa có trang | Nút vô hiệu, `title`/nhãn "Chưa được triển khai", không điều hướng | Q21a | C |
| KG-05 | Bấm "Đăng xuất" ở thanh bên và thanh trên | Gọi `logout()` một lần, không hộp xác nhận, về trang đăng nhập | auth G5 | C |
| KG-06 | Mục đang mở | `aria-current="page"` | Khung | C |
| KG-07 | Mục `BacSi`, `QuanTriVien` trong `role-routes.tsx` | Không đổi (Bác sĩ vẫn trang giữ chỗ, QTV vẫn `AdminLayout`) | Ràng buộc nhóm 03/11/2026 | C |
| KG-08 | Màn hẹp (< 1024 px) `[Q21c]` — thuộc **F11** | Thanh bên ẩn, có nút menu mở ngăn kéo; ngăn kéo bẫy focus, Esc đóng, chọn mục thì đóng | Q21c | C |
| KG-09 | Bàn phím: Tab qua menu, focus thấy được; tương phản chữ/viền | Đạt WCAG 2.2 AA (ADR 0004) | ADR 0004 | C/M |

### 7.6 Bảo mật dùng chung (BM)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| BM-01 | Bắt log của các luồng HS/NT/TC (cả nhánh lỗi 500) | Không có họ tên, SĐT, email, ngày sinh, địa chỉ, `q` `[đề xuất]` | SOW 3.2 (mức chặt hơn) | E |
| BM-02 | Lỗi DB ngoài dự kiến | 500 `LOI_HE_THONG` + `requestId`, không SQL/giá trị trong phản hồi | auth P5 | E |
| BM-03 | Lỗi FK đã lường trước khi tạo người thân (H13) | Không 500 | AGENTS 3 | I |
| BM-04 | `gitleaks`, `.env.example` không giá trị thật | Xanh | CONTRIBUTING 5 | M |

## 8. Đề xuất gom cụm (chỉ đề xuất — nhóm chốt)

Một người làm full-stack trọn module; mỗi task một PR. Thứ tự cụm theo phụ thuộc thật và theo mức "đã đủ thông tin":

| Cụm | Task (thứ tự PR) | Điều kiện bắt đầu | Kết quả nhìn thấy được |
|---|---|---|---|
| 1 — Khung + đọc | **F1 → F2**, **B1**, **P2**, rồi **F11** (cuối cụm) | Ngay | BN/LT đăng nhập thấy khung thật (module khác cắm được trang); API đọc hồ sơ cho 4 vai trò |
| 2 — Hồ sơ cá nhân | **P1 → B2 → F3 → F4 → F5** | Cụm 1 (trừ F11) | BN, LT, QTV xem/sửa hồ sơ; API sẵn cho trang Bác sĩ của `doctor`; HSCN xong (trừ QR, ảnh hoãn) |
| 3 — Người thân | **B3 → B4 → F6 → B5 → F7** | P1 | HSNT xong (dữ liệu lịch hẹn tự dựng) |
| 4 — Tra cứu | **B6 → B7 → F8** | F2 (B6 làm ngay được) | TCBN xong |
| 5 — Sau cùng | F9 | Nhóm có frame + mẫu QR giả | Quét QR CCCD |
| 6 — Hoàn tất | X1 → X2; X3 khi có `booking` + PLAN `booking` xác nhận hợp đồng khoá | Cụm 1–4 | Module đủ điều kiện mục 10 |

Cụm 3 và 4 độc lập nhau. F1/F2 nên merge sớm nhất có thể vì người làm `booking`/`doctor` sẽ cắm trang vào (báo họ khi merge).
Nếu cần một người khác hỗ trợ, phần tách được gọn nhất là cụm 4 (không chung file với cụm 2–3 ngoài P1) — nhưng người làm chính vẫn phải giải thích được toàn module khi vấn đáp.

## 9. Quy trình bắt buộc cho mỗi PR của module

1. Nhánh `feat/patient-<việc>` do thành viên tạo; tiêu đề PR theo Conventional Commits, scope `patient` (hạ tầng: `api`/`web`/`db`/`docs`), ví dụ `feat(patient): thêm tra cứu hồ sơ bệnh nhân cho lễ tân`.
   Commit/push/merge **do thành viên tự làm**; không có dòng `Co-Authored-By` hay chữ ký AI (CONTRIBUTING 9).
2. Dùng AI ⇒ ghi `AI_USAGE_LOG.md` bảng 1 **ngay** (công cụ ghi đúng tên kèm model); lỗi AI phát hiện ⇒ bảng 2 + `AI-BUG-nnn` trong commit sửa. **Lần lập kế hoạch này cũng cần một dòng.**
3. Đổi thiết kế/DB ⇒ cập nhật tài liệu trong cùng PR (task `[ĐỒNG BỘ TL]`, mục 6.5); `docs/database/*` sửa cả ba file; 2.4/Figma thì nhắc người dùng làm.
4. Sửa file của module khác (`[ĐỤNG auth]`, `[ĐỤNG admin]`) hoặc file dùng chung (`docs/database/*`, `router/role-routes.tsx`, `package.json`) ⇒ báo người kia trước, `git pull` bản mới trước khi bắt đầu.
5. Chạy thật `npm run lint`, `build`, `test`, `test:int`, `test:e2e` (api) và `lint`, `test` (web), báo đúng kết quả; cập nhật `TRACKING.md` sau mỗi task; khi cả module xong thêm **đúng một dòng** vào `docs/TRACKING.md`.
6. Tự giải thích được mọi dòng — đặc biệt: vì sao một API hồ sơ cho bốn vai trò (mục 5.2), vì sao "đồng bộ" không cần sao chép (L4), thứ tự khoá và chống chạy đua khi ngừng hồ sơ (mục 5.3, NT-17),
   vì sao trả 404 cho hồ sơ của người khác, cách escape LIKE và giới hạn trường khi tra cứu, vì sao khung nhận cấu hình menu từ lớp router.

## 10. Điều kiện hoàn thành module

- Mọi test case ở mục 7 (trừ ca của phương án không được chọn) đã chạy; kết quả ghi trong `TRACKING.md`; không còn Fail.
- Không còn thẻ `[CHỜ …]` (task bị hoãn theo quyết định nhóm ghi rõ ở `TRACKING.md` mục 3 và `TECH_DEBT`); mọi `[ĐỒNG BỘ TL]` đã làm; 2.4, `docs/database/*` và Figma khớp với mã.
- Khung Bệnh nhân và Lễ tân đã thay `RolePlaceholderPage`; người làm `booking`/`doctor` đã được báo cách cắm trang.
- `docker compose up --build` chạy; X1 đạt với 5 tài khoản seed. Lint/build/test xanh; không secret; `AI_USAGE_LOG.md` đầy đủ; X3 ghi là việc còn lại tới khi `booking` xong.
