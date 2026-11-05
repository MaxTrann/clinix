# Kế hoạch module `search`

> **Trạng thái: bản nháp 2 (03/11/2026).** Phiên kiểm độc lập bản nháp 1: **đạt, duyệt có chỉnh nhỏ**. Nhóm trả lời đủ **26 câu** Q1–Q26: **đồng ý cả 26 đề xuất**, kèm ghi chú ở
> Q4, Q8, Q12, Q15, Q20, Q21, Q24 (mục 4.2a; quyết định cuối ở [`TRACKING.md`](TRACKING.md) mục 3). **Không còn thẻ `[CHỜ Qn]`.**
> **Người làm module: Trung (`junUTE`)** — cũng là chủ module `admin` (quyết định cập nhật 03/11/2026). Việc còn chờ: `[CHỜ admin B12]` (B4–B6, Trung tự tách `computeSurcharge` trước B4),
> xác nhận admin Q45 (phần quy tắc 28 của D3), frame Figma của nhóm (F3, F5), auth F5 (`useLogout()` cho F1), Đại review PR seed P2. Cụm 4 (trang chủ) làm sau cùng, bỏ trước nếu thiếu thời gian.
> Kế hoạch do AI (Claude Code, Claude Opus 5.5) lập theo [`docs/FEATURE_PLANNING_PROMPT.md`](../../FEATURE_PLANNING_PROMPT.md) →
> **ghi `AI_USAGE_LOG.md` (bảng 1) cho lần lập kế hoạch này và cho mọi lần dùng AI sinh mã theo kế hoạch** (CONTRIBUTING mục 4).
> Đã kiểm mã thật ở commit `7c2586a` (= PR #131; `origin/main` vẫn là `7c2586a` khi lập bản nháp 2) và đọc Figma CLINIX ngày 03/11/2026 (mục 4.4).

## 0. Quy ước đọc

- Tên use case viết tắt trong cột "Truy vết": **TCCN** = Tra cứu chi nhánh / chuyên khoa; **TCBS** = Tra cứu bác sĩ và lịch khám.
  `b4` = bước (4); `A1/4b` = luồng thay thế A1, mục 4b; `A2/*b` = A2 của TCCN, mục *b; "MT" = Mô tả; "TĐK" = tiền điều kiện; "HĐK" = hậu điều kiện.
  Số bước lấy đúng 2.4 bản Drive 03/11/2026 (nguyên văn trong prompt lập kế hoạch).
- Nguồn đúng khi lệch nhau: **schema DB (`docs/database/`) để code**; chỗ 2.4/schema/Figma lệch nhau ở mục 3.4 — đã hỏi ở mục 4.2, nhóm chọn ở mục 4.2a.
- Thẻ: `[ĐỒNG BỘ TL]` = task phải cập nhật tài liệu (2.4, `docs/database/*`, Figma) trong **cùng PR**; `[TIỀN ĐỀ]` = việc nền của module; `[CHỜ Qn]` = bị chặn bởi câu hỏi Qn (bản nháp 2: không còn);
  `[CHỜ admin B12]` = chờ hàm `computeSurcharge` của `admin`; `[PHỤ THUỘC x]` = chờ module/người khác; `[SAU]` = phần khung giờ, nhóm đã quyết làm sau (mục 1);
  `[ĐỤNG auth]` / `[ĐỤNG patient]` = sửa file thuộc module của Đại (chủ `auth`, `patient`) ⇒ **báo Đại** trước (AGENTS mục 6); `[ĐỤNG admin]` = sửa file của module `admin` —
  cùng người làm (Trung) nên không phải báo, giữ thẻ để truy vết.
- Mỗi task = **một PR** nhỏ, scope `search` (hạ tầng: `api`/`web`/`db`/`docs`). Test đặt cạnh mã; mỗi test ghi mã test case ở mục 7.
- `[đề xuất]` = giá trị AI tự đề xuất, chưa chốt; `[cần điền]` = thiếu thông tin, chưa có đề xuất.

## 1. Phạm vi

**Làm:**
- **TCCN — toàn bộ:** danh sách, tìm kiếm, bộ lọc, chi tiết chi nhánh và chuyên khoa (b1–b6), A1 (không có kết quả), A2 ("chi nhánh đang chọn": định vị lần đầu, chi nhánh gần nhất,
  "Toàn quốc", bộ chọn trên thanh điều hướng) và việc đồng bộ "chi nhánh đang chọn" khi đổi bộ lọc ở b3.
- **TCBS — phần không có khung giờ:** b1–b6 (chọn dịch vụ → chuyên khoa/lĩnh vực → bộ lọc chi nhánh, tên bác sĩ, khoảng giá, mức đánh giá → danh sách bác sĩ), phần **thông tin tóm tắt
  bác sĩ** của b8 (kinh nghiệm, chức danh, chi nhánh khám, giá khám áp dụng, điểm đánh giá trung bình), b9 (xem đầy đủ hồ sơ năng lực), A1.
- **Khung giao diện công khai** (nhóm chốt 03/11/2026: task ĐẦU của module): thanh điều hướng, ô "chi nhánh đang chọn", chân trang, trạng thái đã đăng nhập. `patient` và `booking` dùng chung về sau.

**Ngoài 2.4 nhưng cần để giao diện chạy được** (đánh dấu "bổ trợ", phạm vi chờ nhóm xác nhận): thông tin liên hệ ở chân trang (`thong_tin_phong_kham`), danh sách nhóm dịch vụ/dịch vụ
cho TCBS b1–b2, trang chủ (Q21) và ô tìm kiếm tổng "Trang chủ - Tìm kiếm" (Q20).

**`[SAU]` — không làm trong đợt này (nhóm quyết "phần khung giờ để sau"):** TCBS b7, b10, b11–b14 (tính trạng thái khung giờ, hiển thị khung giờ, chuyển sang "Đặt lịch khám"),
A2 (đăng ký chờ), A3 (bác sĩ không có lịch ngày đã chọn), A4 (Khách vãng lai chọn khung giờ → đăng nhập → khôi phục lựa chọn), bộ chọn "ngày muốn khám" của b4–b5.
Các task này ghi ở mục 6.6 kèm điều kiện để làm. API thiết kế sao cho phần khung giờ **cắm thêm endpoint mới**, không đổi hợp đồng đã có (mục 5.6).

**Không làm:** đặt lịch, giữ chỗ, danh sách chờ (`booking`, `waitlist`); lịch làm việc bác sĩ, nghỉ phép (`doctor`); tạo/kiểm duyệt đánh giá (module sở hữu `danh_gia_bac_si`, Q16);
nhắn tin (nút "Nhắn tin" trên thẻ bác sĩ); bài viết (mục "Cẩm nang"); quản trị chi nhánh, chuyên khoa, dịch vụ, hồ sơ bác sĩ, bảng phụ phí (`admin`); khung Bệnh nhân/Lễ tân (`patient`), khung Bác sĩ (`doctor`).
Không có use case nào của module này **tải ảnh lên** (chỉ hiển thị ảnh chuyên khoa đã có theo ADR 0001), nên không có câu hỏi nơi lưu tệp ảnh.

## 2. Hiện trạng repo (đã kiểm ở `7c2586a`, 03/11/2026)

**API (`apps/api/src/`):**
- `auth` đủ A1–A15. Guard toàn cục `JwtAuthGuard` + `RolesGuard`. **Hành vi route `@Public()` (đã đọc mã `auth/guards/jwt-auth.guard.ts`):** guard trả `true` **ngay khi gặp `@Public`, không đọc
  header `Authorization`** ⇒ token sai, hết hạn hay phiên đã thu hồi đều bị bỏ qua, **không** trả 401; đổi lại route công khai **không biết người gọi là ai** (`request.user` không có;
  `@Roles` trên route `@Public` ⇒ 401 theo `roles.guard.ts`, `@CurrentUser` ⇒ 401). Hành vi này hợp với module này (trang công khai không bao giờ lỗi vì token cũ) — **không cần sửa guard**.
- `AppException` + bộ lọc lỗi chuẩn (`{ maLoi, thongBao, loi?, chiTiet?, requestId? }`), `ValidationPipe` (`forbidNonWhitelisted`), bộ che log.
- `admin` (Trung): entity + migration danh mục và nhân sự ở `admin/entities/` (`ChiNhanh`, `ChiNhanhLichHoatDong`, `ChiNhanhDichVuKham`, `ChuyenKhoa`, `NhomDichVu`, `DichVuKham`, `BacSi`,
  `PhuPhiBacSi`, `ThongTinPhongKham`, `LichLamViec`, `KhungGio`, `LichHen`, …; enum ở `admin/entities/enums.ts`). API quản trị `admin/branches|specialties|services|service-groups|clinic-info`
  — **mọi route `@Roles('QuanTriVien')`**, không có route công khai; các module admin **không export** provider nào; repository dùng `DataSource` + SQL thô (ví dụ `specialty.repository.ts`:
  ảnh chuyên khoa = `COALESCE(anh_tai_len.secure_url, chuyen_khoa.anh_dai_dien)`, danh sách + `COUNT` chạy trong một giao dịch REPEATABLE READ để cùng ảnh chụp).
- **Chưa có:** mã hồ sơ bác sĩ của admin (B12/B13, kể cả `computeSurcharge` — `grep` không thấy), entity/migration `danh_gia_bac_si` và `yeu_cau_nghi_phep`, mã sinh `lich_lam_viec`/`khung_gio`.
- `common/paging` (`PageQueryDto`: `page` ≥ 1, `pageSize` 20, tối đa 100; `Paged<T>`; `escapeLikePattern` với ký tự thoát `!`), `common/time` (`nowVN`, `todayVN`, `weekdayVN`, `toSecond`).
- **Seed phát triển** (`database/seeds/catalog-data.ts`, `seed.repository.ts`, `dev-account-data.ts`): 8 chuyên khoa (chỉ tên, **không mô tả, không ảnh**, đều `DangHoatDong`); 3 nhóm, mỗi nhóm
  **1 dịch vụ** (`Khám chuyên khoa mẫu` 30 phút 200.000, `Khám tổng quát mẫu` 60 phút 500.000, `Tư vấn từ xa mẫu` 30 phút 150.000); 4 chi nhánh `CLINIX Mẫu 1..4` (**không toạ độ**, lịch giống
  hệt nhau: T2–T7 08:00–12:00 + 13:00–17:00, CN nghỉ, cung cấp cả 3 dịch vụ); thông tin phòng khám minh hoạ; 5 tài khoản demo, trong đó **một** bác sĩ (`BS`, 0 năm, "Nội tổng quát",
  dịch vụ "Khám chuyên khoa mẫu", chi nhánh Mẫu 1, `mo_ta_chuyen_mon` NULL). **Không** có dòng `phu_phi_bac_si`, đánh giá, lịch làm việc.
- Test: `AdminFixtures` (`admin/testing/admin-fixtures.ts`) dựng được chi nhánh (có `overrides`), lịch tuần, danh mục, bác sĩ, ca, khung giờ, lịch hẹn; `database/testing/test-database.ts`.
- Chưa có `apps/api/src/search/`.

**Web (`apps/web/src/`):**
- ADR 0002/0003/0004 đã áp dụng; `shared/ui` có `auth-card`, `empty-state`, `error-state`, `loading-state`, `offline-banner`; `shared/api/client.ts` là nơi duy nhất gọi `fetch`, có tuỳ chọn
  **`skipAuthToken`** (không gắn `Authorization`), timeout mặc định 15 giây.
- `router/routes.tsx`: `RootLayout` (chỉ `OfflineBanner` + `Outlet`) → `index: HomePage` (trang giữ chỗ, đọc `useAuth` để người đã đăng nhập **không** bị chuyển đi, có liên kết "Về trang của bạn"),
  trang auth, `RequireAuth`, route theo vai trò (`role-routes.tsx`: chỉ Quản trị viên có `AdminLayout`).
- `features/auth/roles.ts`: "theo routes.tsx của mã Figma Make của nhóm, **`/bac-si` là danh sách bác sĩ công khai**, nên khu Bác sĩ là `/bac-si-portal`".
- Chưa có thanh điều hướng công khai, chân trang, bộ chọn chi nhánh. Chưa có `features/search/`.

## 3. Phân tích ảnh hưởng

### 3.1 Bảng/cột module này đọc (đọc từ `docs/database/`) — **chỉ đọc, không ghi bảng nào**

| Bảng | Cột / ràng buộc quan trọng | Dùng cho |
|---|---|---|
| `chi_nhanh` | `ten`, `dia_chi` NOT NULL; `toa_do_lat/lng` decimal(10,7) NULL. **Không có cột trạng thái, không có cột mô tả, không có cột khu vực** | TCCN (chi nhánh), A2 (toạ độ), TCBS b4 |
| `chi_nhanh_lich_hoat_dong` | PK `(chi_nhanh_id, thu_trong_tuan)` 1..7 (ISO); `hoat_dong`; hai khoảng sáng/chiều (CHECK `chk_lich_hoat_dong_*`); là lịch **đang áp dụng**; thứ chưa có dòng = "chưa khai báo" (quy tắc 28 `[đề xuất]`) | TCCN b6 |
| `chi_nhanh_dich_vu_kham` | PK `(chi_nhanh_id, dich_vu_kham_id)`; quy tắc 1: cặp (chi nhánh, dịch vụ) của bác sĩ phải có ở đây | TCBS b2, b6; điều kiện công khai của bác sĩ (Q13) |
| `chuyen_khoa` | `ten` UNIQUE, `mo_ta`, `anh_tai_len_id` → `anh_tai_len.secure_url`, `anh_dai_dien` (URL cũ), `trang_thai_hoat_dong` | TCCN (chuyên khoa), TCBS b2–b3 |
| `anh_tai_len` | `secure_url` (ảnh công khai, ADR 0001) | Ảnh chuyên khoa |
| `nhom_dich_vu` | `ten` UNIQUE, `thu_tu_hien_thi` `[đề xuất]`; "chỉ để phân loại và điều hướng" | TCBS b1 |
| `dich_vu_kham` | `ten`, `thoi_luong`, `gia_mac_dinh`, `muc_dat_coc`. **Không có cột trạng thái** (admin Q15: không bật/tắt; "ngừng cung cấp" = bỏ khỏi `chi_nhanh_dich_vu_kham`) | TCBS b1–b2, giá |
| `bac_si` | `chuc_danh` (7 mức, hiển thị + tra phụ phí), `hoc_vi` (chỉ cho AI), `so_nam_kinh_nghiem` ≥ 0 `[đề xuất]`, `mo_ta_chuyen_mon`, `chuyen_khoa_id`, `chi_nhanh_id`, `dich_vu_kham_id` đều NOT NULL | TCBS b6, b8, b9 |
| `tai_khoan` (của bác sĩ) | **chỉ** `ho_ten`, `trang_thai`, `loai_tai_khoan` (không đọc email, SĐT, ngày sinh, giới tính, địa chỉ, ảnh, băm) | Tên bác sĩ, điều kiện công khai (Q13) |
| `phu_phi_bac_si` | UNIQUE `(chuc_danh, so_nam_kinh_nghiem_tu)`; `phu_phi` `[cần điền]`; `ap_dung` (`false` bị loại khỏi phép tính); **không có dòng tạo sẵn** | Giá khám áp dụng — qua `computeSurcharge` (Q15) |
| `thong_tin_phong_kham` | 1 dòng; `ten_thuong_hieu`, `dia_chi_tru_so`, `duong_day_nong`, `email` (NULL được) | Chân trang (bổ trợ) |
| `danh_gia_bac_si` | `so_sao` 1–5, `bi_an` + `ly_do_an` (CHECK), `lich_hen_id` UNIQUE → bác sĩ suy qua `lich_hen`. **Chưa có migration/entity** | Điểm đánh giá (Q16) |

**Chỉ tham khảo cho phần `[SAU]`:** `lich_lam_viec` (UNIQUE `(bac_si_id, ngay, ca)`, `chi_nhanh_id` là chi nhánh **lúc phân công**), `khung_gio` (`ngay_gio`, `trang_thai` 4 giá trị khớp 4 trạng thái của 2.4,
`giu_cho_den`), `yeu_cau_nghi_phep` (`CaNgay`/`TheoCa`, chỉ `DaDuyet` mới loại khung giờ; **chưa có migration**), `lich_hen.khung_gio_dang_giu`.

### 3.2 Bảng ngoài danh sách prompt đã mở thêm (và lý do)

- `anh_tai_len`: URL ảnh chuyên khoa thật nằm ở đây (P7 của admin), `chuyen_khoa.anh_dai_dien` chỉ còn là URL cũ.
- `yeu_cau_thay_doi_chi_nhanh`: kiểm rằng lịch công khai phải là lịch **đang áp dụng** (`chi_nhanh_lich_hoat_dong`), **không** được lộ `noi_dung_sau` của yêu cầu đang chờ (H2, TCN-09).
- `lich_hen`: `danh_gia_bac_si` chỉ nối tới bác sĩ qua `lich_hen.bac_si_id`.

### 3.3 API/hành vi đã có hoặc đã chốt bị chạm tới

| Module / thành phần | Điểm chạm | Cách xử lý (không phá thiết kế đã chốt) |
|---|---|---|
| `auth` A4 — guard, `@Public` | Mọi endpoint của module là công khai | Đặt `@Public()` **ở cấp class** cho mọi controller của `SearchModule`; **không** dùng `@Roles`/`@CurrentUser`. Token sai/hết hạn bị bỏ qua (mục 2) ⇒ kết quả giống hệt khi không gửi token (CC-02, CC-03). **Không sửa guard** |
| `auth` P5 — lỗi chuẩn, `ValidationPipe` | Tham số tìm kiếm/lọc | DTO + `class-validator`; mã lỗi ổn định (mục 5.8); test bằng `expectErrorResponse` |
| `auth` F1, F5 — `useAuth`, `homePathFor`, `useLogout()` (F5, đang làm) | Thanh điều hướng công khai hiện trạng thái đăng nhập, nút Đăng xuất | Import qua `features/auth/index.ts`; **không** sửa file auth. Đăng xuất dùng `useLogout()` của F5 (`[PHỤ THUỘC auth F5]`); F5 chưa merge thì gọi `logout()` (đã export) rồi đổi sau. Gọi API công khai bằng `skipAuthToken: true` để không gắn token, không kích hoạt làm mới phiên |
| `auth` — tác nhân Lễ tân của TCBS | Route công khai không biết người gọi | Lễ tân thấy **đúng như** Khách vãng lai (Q17); không cần "xác thực tuỳ chọn" (sẽ phải sửa guard của auth) |
| `admin` — entity danh mục/nhân sự | Đọc bảng do admin quản lý | **Không tạo lại** entity/migration, không đổi schema. Repository riêng của `search` dùng `DataSource` + SQL chỉ đọc, `SELECT` đúng các cột trong danh sách trắng; chỉ import **kiểu**/hằng từ `admin/entities/enums.ts`. Không import service/repository admin (chúng mang logic phạm vi quản trị và không được export) |
| `admin` B12 — `computeSurcharge` (Q21 của admin) | Giá khám áp dụng | **Dùng lại, không viết phép tính thứ hai.** Admin đặt tại `admin/doctors/surcharge.calculator.ts` (PLAN admin 5.1), đang "SOẠN TRƯỚC". Trung (chủ cả `admin` và `search`) tự tách thành PR nhỏ **trước task B4** của `search`, gồm cả phép cộng giá (Q15). Task cần giá gắn `[CHỜ admin B12]` |
| `admin` — quy tắc ảnh chuyên khoa | `COALESCE(secure_url, anh_dai_dien)` đang nằm trong SQL của admin | Search viết cùng biểu thức; nếu đổi cách lấy ảnh thì phải đổi cả hai — cân nhắc tách hằng SQL dùng chung khi làm B2 (cùng người làm) |
| `admin` Q10 — toạ độ | Tuỳ chọn, đủ cặp; "thiếu toạ độ vẫn hiển thị, chỉ không tham gia 'gần nhất'" | Tuân theo ở A2 (Q6) |
| `admin` Q28 — khoá bác sĩ | "lọc bác sĩ khỏi tìm kiếm" khi tài khoản bị khoá | Điều kiện công khai lọc `tai_khoan.trang_thai` (Q13) |
| `admin` Q45 — "thứ chưa khai báo" | Admin còn chờ nhóm xác nhận riêng | Q4 của module này dùng chung câu trả lời |
| `admin` Q44 — seed | Seed do admin sở hữu, idempotent, chỉ dev/demo | Thiếu dữ liệu cho demo/test (mục 2) ⇒ Q24; test tự động dùng fixture riêng của `search` dựng trên `AdminFixtures` (không sửa file admin) |
| `admin` — trang Admin | Không đụng | — |
| `patient` F1/F2 (khung BN/LT, chưa có mã) | Thanh bên BN có "Về trang chủ" | Trỏ về `/` (trang chủ công khai của module này). Không có phụ thuộc mã |
| `booking` (chưa có) | (a) bộ tính khung giờ dùng chung; (b) chuyển sang "Đặt lịch khám" với dữ liệu điền sẵn; (c) frame "Đặt lịch khám - Bước 1–3" trùng nội dung TCBS b1–b6 | Q18: chủ sở hữu bộ tính khung giờ; mục 5.6 hợp đồng mở rộng; Q10/Q19: module này dựng trang b1–b6, `booking` nối tiếp từ khung giờ (không dựng lại) |
| `doctor`, `waitlist`, module đánh giá, nhắn tin, bài viết | Khung giờ, đăng ký chờ, đánh giá, nút "Nhắn tin", "Cẩm nang" | Chỉ chừa chỗ; nút của module chưa có là nút vô hiệu "Chưa được triển khai" (cùng nếp `AdminSidebar`, patient Q21a) |
| Lớp `router/` (dùng chung) | Thay `HomePage`, bọc trang công khai bằng khung công khai | Sửa `router/routes.tsx` (và xoá `pages/home-page.tsx` khi trang chủ thật thay thế); route theo vai trò và trang auth **giữ nguyên** (KC-06) |

### 3.4 Chỗ 2.4, schema và Figma lệch hoặc mơ hồ — **nêu rõ; nhóm đã chọn ở mục 4.2a (03/11/2026)**

| # | Lệch / mơ hồ | Ghi chú | Hỏi |
|---|---|---|---|
| L1 | TCCN MT/b2 "lọc theo **trạng thái hoạt động**", "chi nhánh … đang hoạt động" ↔ schema: `chi_nhanh` **không có cột trạng thái** | Chuyên khoa có `trang_thai_hoat_dong`; nhưng hậu điều kiện "Quản lý chuyên khoa" của admin là **ẩn** chuyên khoa ngừng khỏi tra cứu ⇒ bộ lọc trạng thái trên trang công khai mâu thuẫn | Q1 |
| L2 | TCCN b6 "**mô tả** cho chi nhánh" ↔ `chi_nhanh` **không có cột mô tả** | | Q2 |
| L3 | TCCN b2, TCBS b4 "chi nhánh/**khu vực**" ↔ không có cột khu vực/tỉnh/quận | | Q3 |
| L4 | TCCN b6 "ngày và giờ hoạt động" (một khoảng) ↔ schema: **hai khoảng nhận khám** sáng/chiều (admin Q1 đã chốt nhãn "giờ nhận khám"); thứ **chưa khai báo** xử lý như ngày nghỉ `[đề xuất]` (2.4 TCBS b11, quy tắc 28) | | Q4 |
| L5 | TCCN b2 "danh sách … chuyên khoa … mặc định lọc theo chi nhánh đang chọn" ↔ `chuyen_khoa` **không gắn chi nhánh** (chỉ suy được qua bác sĩ) | | Q5 |
| L6 | "Dịch vụ đang hoạt động" (prompt) ↔ `dich_vu_kham` **không có trạng thái** (admin Q15) | Đề xuất: dịch vụ "đang cung cấp" = có ≥ 1 dòng `chi_nhanh_dich_vu_kham` | Q10 |
| L7 | **TCBS b1–b3 "chọn dịch vụ → chuyên khoa/lĩnh vực thuộc dịch vụ đã chọn"** ↔ schema: "chuyên khoa và dịch vụ là **hai chiều phân loại độc lập**" (ghi chú `bac_si`), không có bảng nối dịch vụ–chuyên khoa ↔ Figma "Đặt lịch khám - Bước 1–3": **nhóm dịch vụ → dịch vụ khám → bác sĩ** (dịch vụ trong nhóm "Khám theo chuyên khoa" mang tên chuyên khoa: "Tim mạch", "Cơ Xương Khớp"…) | Ba nguồn hiểu "dịch vụ" và "chuyên khoa" khác nhau | Q10 |
| L8 | TCBS b4 có bộ lọc **khoảng giá** và **mức đánh giá** ↔ Figma "Đội ngũ bác sĩ", "Bước 3": **không có** hai bộ lọc này | | Q12 |
| L9 | Figma "Đội ngũ bác sĩ" (`/bac-si`) và "Chi tiết chuyên khoa" liệt kê bác sĩ **không qua bước chọn dịch vụ** ↔ TCBS b1 bắt đầu từ dịch vụ | | Q11 |
| L10 | TCBS tác nhân có **Lễ tân** ↔ 2.4 không nêu Lễ tân thấy khác gì; route `@Public` không biết người gọi | | Q17 |
| L11 | Điểm đánh giá trung bình ↔ `danh_gia_bac_si` **chưa có migration**; có đánh giá bị ẩn (`bi_an`) | | Q16 |
| L12 | Giá khám = giá dịch vụ + phụ phí ↔ DB: giá trị phụ phí `[cần điền]`, ý nghĩa "tắt mốc cao rơi xuống mốc thấp" `[cần điền]` — **admin Q21 đã chốt** (quyết định giá của nhóm) nhưng 3 file DB chưa cập nhật (admin D6) | Không bàn lại; module này chỉ dùng hàm chung | Q15 |
| L13 | Figma có **ảnh chân dung bác sĩ** ↔ schema `bac_si` không có cột ảnh; `tai_khoan.anh_dai_dien` thuộc "ảnh đại diện" mà patient Q4 đã **hoãn** | | Q14 |
| L14 | Figma "Chi tiết bác sĩ" có "**Đặt trước tối đa 7 ngày**" ↔ quy tắc DB 38: **không** có giới hạn số ngày đặt trước | | Q14 |
| L15 | Figma thẻ bác sĩ có "**Cọc**", "30 phút/lượt", nút "**Nhắn tin**"; "Chi tiết chuyên khoa" có "**Giá khám từ … · cọc …**" và danh sách bác sĩ ↔ 2.4 TCCN b6 chuyên khoa chỉ "tên, mô tả, hình ảnh"; TCBS b8 không nêu cọc | Không mâu thuẫn dữ liệu (có cột), chỉ vượt 2.4 | Q9, Q14 |
| L16 | 2.4 TCCN A2 có **bộ chọn chi nhánh trên thanh điều hướng** ↔ Figma "Trang chủ": thanh điều hướng **không có**; **không có** frame công khai danh sách/chi tiết chi nhánh | | Q7, Q8, Q19 |
| L17 | Figma chân trang ghi cứng "Thứ 2 – Thứ 6: 7:30 – 17:00 / Thứ 7: 7:30 – 12:00 / Chủ nhật: Nghỉ" ↔ giờ là **theo từng chi nhánh** (`chi_nhanh_lich_hoat_dong`); `thong_tin_phong_kham` không có giờ; địa chỉ, email `[cần điền]` trong Figma | | Q19 |
| L18 | TCBS b4 "ngày muốn khám (mặc định **ngày gần nhất**)" — "gần nhất" là hôm nay hay ngày gần nhất có khung giờ? | Chỉ ảnh hưởng phần `[SAU]` | Q18 |
| L19 | 2.4 TCCN TĐK "chi nhánh đang chọn … **lưu tạm** phía trình duyệt" cho "**phiên làm việc này**" ↔ A2 "**lần đầu vào hệ thống** (chưa có lựa chọn lưu sẵn)" — lưu theo phiên hay lâu dài? Đổi chi nhánh ở TCBS b5 có cập nhật giá trị chung không (TCCN b3 nói có, cho bộ lọc của TCCN)? | | Q7 |
| L20 | Figma "Trang chủ - Tìm kiếm" (ô tìm tổng, gợi ý có nhãn loại "Chuyên khoa") và các con số "8 Chuyên khoa · 12 Bác sĩ · 10 Dịch vụ khám" — không thuộc rõ use case nào | | Q20, Q21 |

Không lệch (đã đối chiếu): bác sĩ luôn có chuyên khoa, chi nhánh, dịch vụ (NOT NULL — TCBS TĐK "được gán chuyên khoa và chi nhánh" do DB giữ); 4 trạng thái khung giờ của 2.4 khớp
`trang_thai_khung_gio_enum`; cách chia khung giờ liên tiếp theo thời lượng dịch vụ (TCBS b11) khớp ghi chú `khung_gio` và quy tắc 39 (chỉ dùng ở `[SAU]`); chức danh hiển thị khớp `chuc_danh_enum`.

### 3.5 Bẫy/rủi ro (xử lý trong task)

- **H1 — Lộ dữ liệu cá nhân bác sĩ.** Bác sĩ là một dòng `tai_khoan` có email, SĐT, ngày sinh… Mọi truy vấn chỉ `SELECT` cột trong danh sách trắng (Q14), không `SELECT *`, không trả entity;
  ca AN-06 quét toàn bộ JSON của mọi endpoint công khai tìm khoá và **giá trị** email/SĐT của bác sĩ mẫu.
- **H2 — Lộ lịch chưa áp dụng.** Lịch công khai chỉ đọc `chi_nhanh_lich_hoat_dong` (đang áp dụng), không đọc `yeu_cau_thay_doi_chi_nhanh` (TCN-09).
- **H3 — Hai phép tính giá.** Chỉ dùng `computeSurcharge` của admin (Q21 admin); không viết lại công thức trong SQL. Lọc theo giá vì vậy làm **trong bộ nhớ** sau khi tính bằng hàm chung (Q15, mục 5.4).
- **H4 — Sai số tiền.** `decimal` đọc ra là chuỗi; cộng giá không dùng `number` dấu phẩy động (Q15).
- **H5 — Đếm lệch danh sách.** "N bác sĩ" ở thẻ chuyên khoa, số liệu trang chủ và danh sách bác sĩ phải dùng **cùng một** điều kiện "bác sĩ công khai" (một hằng SQL — mục 5.3), nếu không sẽ có thẻ "2 bác sĩ" mà mở ra 1.
- **H6 — Danh sách và `total` lệch nhau** khi dữ liệu đổi giữa hai câu: chạy cả hai trong một giao dịch REPEATABLE READ chỉ đọc (cùng nếp `specialty.repository.ts` của admin).
- **H7 — Token cũ làm hỏng trang công khai.** Không xảy ra ở API (guard bỏ qua); FE gọi với `skipAuthToken: true` để không kích hoạt làm mới phiên khi đang ở trang công khai (CC-08).
- **H8 — Dò dữ liệu/quét toàn bộ.** Endpoint công khai không cần đăng nhập, chưa giới hạn theo IP (auth X3): trần `pageSize` 100, `q` ≤ 100 ký tự, `LIKE` có escape; ghi `TECH_DEBT`. Id là số tuần tự nhưng dữ liệu
  vốn công khai; tài nguyên không công khai trả **404 cùng thân** với không tồn tại (không cho biết "bác sĩ này đang bị khoá").
- **H9 — Riêng tư vị trí.** Toạ độ người dùng **không rời trình duyệt** (Q6), không lưu, không log; chỉ lưu mã chi nhánh đã chọn.
- **H10 — Bộ nhớ trình duyệt có thể ném lỗi** (chế độ riêng tư, bị chặn): mọi đọc/ghi bọc `try/catch`, lỗi ⇒ coi như chưa có lựa chọn ("Toàn quốc"), trang vẫn chạy (CNC-07).
- **H11 — Geolocation cần ngữ cảnh an toàn** (HTTPS hoặc `localhost`): staging đã bắt buộc HTTPS (auth N5); thiếu API ⇒ "Toàn quốc" (CNC-11).
- **H12 — Bác sĩ đổi chi nhánh** (admin B13): danh sách hiện chi nhánh **hiện tại** (`bac_si.chi_nhanh_id`); khung giờ `[SAU]` lại theo `lich_lam_viec.chi_nhanh_id` (chi nhánh lúc phân công) — K1 phải xử lý.
- **H13 — Đổi nguồn điểm đánh giá về sau** (khi có bảng): hợp đồng `danhGia: { diemTrungBinh, soDanhGia }` cố định ngay từ đầu, chỉ đổi phần đọc (K5).
- **H14 — Collation `utf8mb4_unicode_ci`** không phân biệt dấu/hoa thường: "tim" khớp "Tim mạch" (có lợi, đúng Figma `258:2`); không tự viết thêm chuẩn hoá.

## 4. Câu hỏi và quyết định

### 4.1 Đã chốt ở module khác (kế thừa — **không bàn lại**)

- `auth`: Q1 (TypeORM, migration viết tay), Q2 (cùng origin qua proxy, access token trong bộ nhớ), P5 (bộ lỗi chuẩn), A4 (guard toàn cục, `@Public`), G5 (đăng xuất ngay, không hỏi), S7/X3 (giới hạn theo IP hoãn).
- `admin`: Q1 (hai khoảng sáng/chiều, nhãn "giờ nhận khám"), Q10 (toạ độ tuỳ chọn, đủ cặp, thiếu toạ độ không tham gia "gần nhất"), Q15 (dịch vụ không có bật/tắt), Q19 (chỉ gán chuyên khoa
  đang hoạt động), Q21 (`computeSurcharge` ở admin B12; "tắt mốc cao ⇒ dùng mốc thấp hơn còn hiệu lực, không về 0" là quyết định giá), Q28 (khoá bác sĩ ⇒ lọc khỏi tìm kiếm), Q40 (ngoài phạm vi ⇒ 404 cùng thân),
  Q41 (admin sở hữu migration bảng nền), Q42 (phân trang offset 20/100, `{items,total,page,pageSize}`, escape LIKE), Q43 (giờ VN), Q44 (seed idempotent, dữ liệu minh hoạ có nhãn); ADR 0001 (ảnh chuyên khoa công khai).
- `patient`: Q21a (mục chưa có trang là nút vô hiệu "Chưa được triển khai"), Q21d (khung nhận cấu hình từ lớp `router/`, không import chéo `features/`), Q4 (ảnh đại diện hoãn), Q27 (id sai dạng ⇒ 404).
- Nhóm 03/11/2026: khung công khai là task đầu của module này; dữ liệu bác sĩ dùng seed trước, task cần bác sĩ thật gắn `[CHỜ admin B12]`; phần khung giờ để sau.

### 4.2 Câu hỏi gộp và đề xuất ban đầu (**đã được nhóm trả lời ngày 03/11/2026 — đồng ý cả 26 câu; quyết định cuối ở mục 4.2a và TRACKING mục 3**)

Cột "Chặn" giữ làm lịch sử (thẻ `[CHỜ Qn]` tương ứng đã bỏ ở mục 6).

**Tra cứu chi nhánh / chuyên khoa (TCCN)**

| # | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q1 | "Lọc theo **trạng thái hoạt động**" (L1): chi nhánh không có cột trạng thái; chuyên khoa ngừng phải ẩn khỏi tra cứu | **A — trang công khai chỉ hiện dữ liệu đang hoạt động, không có ô lọc trạng thái.** Mọi chi nhánh là công khai (không có cột để ẩn); chuyên khoa `NgungHoatDong` ẩn khỏi danh sách và chi tiết trả 404. Sửa 2.4 TCCN bỏ "lọc theo trạng thái" (D1). Phương án khác: **B** "trạng thái" = "đang nhận khám hôm nay/bây giờ" tính từ lịch tuần + `nowVN()` (thêm tham số, thêm test giờ biên); **C** thêm cột trạng thái cho `chi_nhanh` (đổi schema của admin, ảnh hưởng `booking`) | B1, B2, F3, F4 |
| Q2 | "**Mô tả** chi nhánh" (L2) | **A — bỏ khỏi 2.4**: chi tiết chi nhánh = tên, địa chỉ, giờ nhận khám 7 ngày, dịch vụ đang cung cấp, số bác sĩ, liên kết "Xem bác sĩ tại chi nhánh". **B** — thêm `chi_nhanh.mo_ta` (admin sửa schema 3 file + migration + form admin, trước task này) | B1, F3 |
| Q3 | "**Khu vực**" (L3) | **Không có bộ lọc khu vực riêng**; ô từ khoá khớp tên **và địa chỉ** (gõ "Quận 3" ra chi nhánh có địa chỉ Quận 3). Sửa câu 2.4 (D1). Thêm cột khu vực = đổi schema admin, không đề xuất | B1, F3 |
| Q4 | Thứ **chưa khai báo** lịch (quy tắc 28, 2.4 TCBS b11 `[đề xuất]`; admin Q45 còn chờ) và cách hiện giờ | API trả `hoatDong: null` cho thứ chưa khai báo (cùng dạng API admin); **giao diện hiện "Nghỉ"** như ngày nghỉ (khớp "xử lý như ngày nghỉ"); bỏ `[đề xuất]` ở quy tắc 28 và 2.4 (D3) — dùng chung câu trả lời với admin Q45. Ngày hoạt động hiện **cả hai khoảng** ("08:00 – 12:00, 13:00 – 17:00"), tiêu đề "Giờ nhận khám" (admin Q1) | B1, F3 |
| Q5 | Danh sách chuyên khoa "mặc định lọc theo **chi nhánh đang chọn**" (L5) và danh sách **chi nhánh** khi đã chọn một chi nhánh | Chuyên khoa: có chi nhánh ⇒ chỉ chuyên khoa có ≥ 1 bác sĩ công khai tại chi nhánh đó, "N bác sĩ" đếm tại chi nhánh đó; "Toàn quốc" ⇒ mọi chuyên khoa đang hoạt động, kể cả 0 bác sĩ (nhãn "Sắp có bác sĩ" như Figma). Chi nhánh: luôn hiện **tất cả**, chi nhánh đang chọn **xếp đầu** với nhãn "Đang chọn" (lọc danh sách chi nhánh theo chính nó thì chỉ còn một dòng, vô nghĩa) | B2, F3, F4 |
| Q6 | Tính **chi nhánh gần nhất** ở trình duyệt hay API; chưa chi nhánh nào có toạ độ | **Ở trình duyệt**: API danh sách chi nhánh trả `toaDoLat/Lng` (chuỗi, NULL được); FE lấy vị trí, tính khoảng cách đường tròn lớn (Haversine), bằng nhau ⇒ id nhỏ hơn. Lý do: toạ độ người dùng không rời trình duyệt (H9), không thêm endpoint, số chi nhánh nhỏ. Chi nhánh thiếu toạ độ bị bỏ qua (admin Q10); **không chi nhánh nào có toạ độ ⇒ "Toàn quốc", không xin quyền**. Chờ vị trí tối đa 10 giây `[đề xuất]` | F2 |
| Q7 | Lưu "chi nhánh đang chọn" (L19): bền hay theo phiên; xin quyền lúc nào; phạm vi đồng bộ; đặt mã ở đâu | (a) `localStorage`, chỉ lưu `{ chiNhanhId \| null, nguon: 'DinhVi' \| 'NguoiDung' }` (không lưu toạ độ); có giá trị ⇒ coi là "đã có lựa chọn", không xin quyền lại. (b) Xin quyền **tự động một lần** ở lần đầu vào trang công khai (đúng A2/*a); từ chối ⇒ lưu "Toàn quốc", không hỏi lại; người dùng tự bấm "Dùng vị trí của tôi" trong bộ chọn để thử lại. (c) Chi nhánh đã lưu không còn trong danh sách ⇒ về "Toàn quốc". (d) Đổi bộ lọc chi nhánh ở trang TCCN **có** cập nhật giá trị chung (TCCN b3); đổi ở bộ lọc TCBS b5 **không** cập nhật (2.4 TCBS b5 "kể cả đổi chi nhánh khác với mặc định") `[đề xuất]`. (e) Đăng nhập/đăng xuất không xoá lựa chọn. (f) Kho lưu + hook `useSelectedBranch()` đặt ở `apps/web/src/shared/branch-selection/` vì `booking`, nhắn tin cũng đọc và `features/` không được import chéo | F2 |
| Q8 | Trang **danh sách/chi tiết chi nhánh** chưa có frame; header không có mục "Chi nhánh" | Nhóm bổ sung frame; trong lúc chờ: đường dẫn `/chi-nhanh`, `/chi-nhanh/:id` `[đề xuất]`; danh sách dạng thẻ như "Chuyên khoa" (tên, địa chỉ, "Đang chọn"); chi tiết như "Chi tiết chuyên khoa" (tên, địa chỉ, bảng 7 ngày, dịch vụ, nút "Chọn làm chi nhánh của tôi", liên kết bác sĩ tại chi nhánh). Điểm vào: mục "Chi nhánh" trong bộ chọn chi nhánh ("Xem tất cả chi nhánh") và ở chân trang — **không** thêm mục mới vào thanh điều hướng của Figma | F3 |
| Q9 | "Chi tiết chuyên khoa" của Figma có "**Giá khám từ X · cọc Y**" và danh sách bác sĩ (ngoài 2.4 b6) | **Làm**: X = giá áp dụng **thấp nhất** của bác sĩ công khai thuộc chuyên khoa (theo chi nhánh đang chọn nếu có), Y = cọc của dịch vụ của bác sĩ đó; không có bác sĩ ⇒ ẩn dòng giá. Danh sách bác sĩ ở trang này dùng chung API TCBS lọc theo `chuyenKhoaId` (Q11). Sửa 2.4 TCCN b6 thêm hai mục này (D1) | B2, F4, F6 |

**Tra cứu bác sĩ (TCBS)**

| # | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q10 | **"Dịch vụ" và "chuyên khoa/lĩnh vực" ở b1–b3 nghĩa là gì** (L7) và "dịch vụ đang hoạt động" (L6) | **A — "dịch vụ" ở b1 = nhóm dịch vụ (`nhom_dich_vu`); "chuyên khoa/lĩnh vực cụ thể" ở b2–b3 = dịch vụ khám trong nhóm (`dich_vu_kham`); b6 lọc bác sĩ theo `bac_si.dich_vu_kham_id`.** Khớp Figma "Bước 1–3" và schema, không đổi DB; chuyên khoa (`chuyen_khoa`) vẫn hiện trên thẻ và là bộ lọc phụ tuỳ chọn. Sửa câu 2.4 TCBS b1–b3, b6 (D2). **B** — dịch vụ = `dich_vu_kham`, chuyên khoa = chuyên khoa có ≥ 1 bác sĩ công khai nhận dịch vụ đó (suy qua `bac_si`; lệch Figma). **C** — thêm bảng nối dịch vụ–chuyên khoa (đổi schema, admin). Dịch vụ "đang cung cấp" = có trong `chi_nhanh_dich_vu_kham` (của chi nhánh đang lọc, hoặc của ít nhất một chi nhánh); nhóm không còn dịch vụ nào ⇒ thẻ "Sắp triển khai", không bấm được (Figma) | B3, B5, F5 |
| Q11 | Trang "**Đội ngũ bác sĩ**" (`/bac-si`) và danh sách bác sĩ trong "Chi tiết chuyên khoa" (L9) có thuộc TCBS không | **Có**: cùng một API danh sách bác sĩ, dịch vụ là bộ lọc **tuỳ chọn**; ba điểm vào (luồng dịch vụ b1–b3, "Đội ngũ bác sĩ", chi tiết chuyên khoa) dùng chung thẻ bác sĩ và bộ lọc. Thêm vào 2.4 TCBS hai điểm vào này (D2) | F6 |
| Q12 | Bộ lọc **khoảng giá** và **mức đánh giá** (L8) và thứ tự sắp xếp | Giá: hai ô "Từ"/"Đến" (đồng, số nguyên ≥ 0, khoảng **đóng** hai đầu, so với **giá áp dụng**); `giaTu > giaDen` ⇒ 400. Đánh giá: chọn "Từ 3★ / 4★ / 4,5★"; bác sĩ **chưa có đánh giá bị loại** khi chọn mức này. Sắp xếp `[đề xuất]`: mặc định kinh nghiệm giảm dần → họ tên → id; thêm "Giá tăng dần", "Đánh giá cao" (khớp nhãn "Nhiều kinh nghiệm", "Được yêu thích" ở trang chủ). Nhóm bổ sung hai ô lọc vào frame "Đội ngũ bác sĩ" và "Bước 3" | B5, F5 |
| Q13 | Bác sĩ nào được **công khai** | Đồng thời: `tai_khoan.loai_tai_khoan = 'BacSi'` và `trang_thai = 'DangHoatDong'` (ẩn **`ChoKichHoat`** — chưa kích hoạt — và `NgungHoatDong` — admin Q28); chuyên khoa của bác sĩ `DangHoatDong` (ẩn bác sĩ thuộc chuyên khoa đã ngừng — nếu không, thẻ hiện tên chuyên khoa đã bị ẩn); cặp (`chi_nhanh_id`, `dich_vu_kham_id`) còn trong `chi_nhanh_dich_vu_kham`. Bác sĩ **chưa có lịch làm việc vẫn hiện** (TCBS A3). Ghi thành quy tắc trong `clinix_quy_tac_nghiep_vu.md` (D3) | B2, B5, B6 |
| Q14 | **Trường công khai** của bác sĩ; ảnh; các mục Figma vượt 2.4 (L13–L15) | Danh sách: `bacSiId`, họ tên, chức danh (mã + nhãn "BS.CKII"…), số năm kinh nghiệm, chuyên khoa `{id, ten}`, chi nhánh `{id, ten, diaChi}`, dịch vụ `{id, ten, thoiLuong}`, giá `{giaMacDinh, phuPhi, giaKham, mucDatCoc}`, đánh giá `{diemTrungBinh, soDanhGia}`. Chi tiết thêm: mô tả chuyên môn, giờ nhận khám của chi nhánh. **Không:** email, SĐT, ngày sinh, giới tính, địa chỉ cá nhân, trạng thái tài khoản, học vị (chỉ cho AI), ảnh. **Ảnh**: dùng ảnh chữ viết tắt (như patient Q4) cho tới khi có ảnh bác sĩ; ghi lệch Figma. "Đặt trước tối đa 7 ngày": **bỏ** (trái quy tắc 38). "Nhắn tin": nút vô hiệu "Chưa được triển khai". Cọc, "30 phút/lượt": hiện | B5, B6, F5, F7 |
| Q15 | **Giá khám áp dụng**: chỗ đặt phép tính, lúc nào có, lọc theo giá thế nào | (a) Trung (chủ cả admin B12 lẫn `search`) tự tách `computeSurcharge` (đang "SOẠN TRƯỚC") thành **PR nhỏ đi TRƯỚC task B4 của `search`**, gồm cả hàm cộng `giaKham = giaMacDinh + phuPhi` trên chuỗi decimal (không `number`) để `search` và `booking` dùng **cùng một** hàm; đặt ở `apps/api/src/pricing/` hoặc chỗ Trung chọn; **cấm công thức phụ phí lần hai**. (b) `search` đọc **toàn bộ** quy tắc `phu_phi_bac_si` (bảng nhỏ) một lần mỗi request rồi gọi hàm chung. (c) Lọc/sắp theo giá làm **trong bộ nhớ**: SQL lọc mọi điều kiện khác, tính giá từng bác sĩ bằng hàm chung, rồi lọc giá/đánh giá, sắp xếp, cắt trang — không viết công thức phụ phí trong SQL (H3); ghi `TECH_DEBT` (ổn ở quy mô TLCN). (d) Chưa có hàm ⇒ B4, B5, B6 `[CHỜ admin B12]`; **không** có cách làm tạm bằng số tự đặt | B4, B5, B6 |
| Q16 | **Điểm đánh giá trung bình** (L11) | Chỉ tính đánh giá **đang hiển thị** (`bi_an = false`); trung bình làm tròn **1 chữ số thập phân** (trả chuỗi `"4.3"`), kèm `soDanhGia`; 0 lượt ⇒ `diemTrungBinh: null` ("Chưa có đánh giá"). Bảng chưa có ⇒ API trả `null`/0 cho mọi bác sĩ (hợp đồng không đổi khi có bảng — K5). Migration `danh_gia_bac_si`: do module sở hữu use case đánh giá tạo (hoặc admin theo Q41) — nhóm chỉ định chủ. Tab "Đánh giá" (danh sách nhận xét kèm tên người đánh giá) để module đánh giá quyết định trường hiển thị — `[SAU]` | B5, B6 |
| Q17 | **Lễ tân** có thấy khác Khách vãng lai không (L10); token sai/hết hạn | **Không khác**: endpoint `@Public` không đọc token (mục 2) nên mọi vai trò thấy cùng dữ liệu; Lễ tân tự chọn chi nhánh như mọi người (không tự điền chi nhánh của Lễ tân — sẽ cần `GET /profile` của `patient` B1). Token sai/hết hạn/thu hồi: bị bỏ qua, kết quả như không có token (giữ hành vi auth, không sửa guard). Sửa 2.4 TCBS ghi rõ (D2) | — (ghi test CC-02, CC-03) |
| Q18 | **Phần `[SAU]`**: chủ sở hữu bộ tính khung giờ "dùng chung cho tra cứu, đặt lịch, đổi lịch, Trợ lý AI" (b11); "ngày gần nhất" (L18) | Bộ tính khung giờ thuộc **`booking`** (chủ của giữ chỗ/đặt lịch, cần khoá hàng) `[đề xuất]`, đặt ở thư mục dùng chung kiểu `apps/api/src/appointments/` (patient Q13); `search` chỉ mở endpoint đọc (K1). "Ngày gần nhất" = **hôm nay** theo giờ VN `[đề xuất]`. Không chặn task nào của đợt này | K1–K4 |

**Giao diện và chung**

| # | Câu hỏi | Đề xuất và lý do | Chặn |
|---|---|---|---|
| Q19 | **Khung công khai** (L16, L17): (a) vị trí bộ chọn chi nhánh; (b) trạng thái đã đăng nhập; (c) mục điều hướng của module chưa có; (d) nút "Đặt lịch khám"; (e) giờ ở chân trang; (f) màn hẹp; (g) đường dẫn | (a) Nút "📍 <tên chi nhánh> / Toàn quốc" bên trái "Đặt lịch khám", mở hộp chọn (danh sách chi nhánh, "Toàn quốc", "Dùng vị trí của tôi", "Xem tất cả chi nhánh"). (b) Thay "Đăng nhập" bằng nút họ tên mở menu "Trang của tôi" (`homePathFor`) + "Đăng xuất" (hook **`useLogout()` của auth F5** — `[PHỤ THUỘC auth F5]`, đang làm; F5 chưa merge thì dùng `logout()` trực tiếp rồi đổi sau; không hỏi — G5). (c) "Cẩm nang", "Liên hệ" và nút "Nhắn tin"/bong bóng chat: nút vô hiệu "Chưa được triển khai" / ẩn bong bóng. (d) "Đặt lịch khám" mở luồng TCBS b1 (chọn nhóm dịch vụ) cho tới khi `booking` có trang. (e) Chân trang: liên hệ lấy từ `thong_tin_phong_kham` (trống ⇒ ẩn dòng); giờ = giờ của **chi nhánh đang chọn**, "Toàn quốc" ⇒ ẩn khối giờ; danh sách chuyên khoa lấy từ API. (f) Dưới 1024 px: thanh điều hướng thu thành nút menu mở ngăn kéo — task **F10 riêng, cuối cụm 1** (như patient F11). (g) `/chuyen-khoa`, `/chuyen-khoa/:id`, `/bac-si`, `/bac-si/:id`, `/dich-vu-kham`, `/dich-vu-kham/:nhomId`, `/chi-nhanh`, `/chi-nhanh/:id` `[đề xuất]` — nhóm gửi đường dẫn trong `routes.ts` của mã Figma Make nếu khác | F1, F2, F10 |
| Q20 | "**Trang chủ - Tìm kiếm**" (`258:2`, L20) thuộc use case nào | **Thuộc module này** (gộp TCCN b3 và TCBS b1 cho người dùng chưa biết bắt đầu từ đâu): ô tìm trả **gợi ý** nhóm theo loại — chuyên khoa, dịch vụ khám, bác sĩ (tối đa 5 mỗi loại, chỉ dữ liệu công khai); bấm gợi ý mở trang chi tiết tương ứng (dịch vụ ⇒ danh sách bác sĩ của dịch vụ đó); Enter/"Tìm kiếm" khi chưa chọn gợi ý ⇒ trang "Đội ngũ bác sĩ" với từ khoá. Nếu nhóm coi là phạm vi khác: bỏ B8, F9 | B8, F9 |
| Q21 | **Trang chủ** làm phần nào | Làm: hero + ô tìm (Q20), 3 con số (đếm chuyên khoa đang hoạt động, bác sĩ công khai, dịch vụ đang cung cấp — cùng điều kiện công khai, H5), "Chọn dịch vụ khám" (nhóm dịch vụ: "N dịch vụ · từ X" = giá mặc định thấp nhất, "Sắp triển khai"), "Tìm bác sĩ theo lĩnh vực" (8 chuyên khoa đầu), "Đội ngũ bác sĩ" (8 bác sĩ đầu theo sắp xếp mặc định; hai nhãn "Nhiều kinh nghiệm"/"Được yêu thích" = hai cách sắp Q12), "Đặt lịch khám tại CLINIX" (tĩnh, **sửa câu "Giữ chỗ 15 phút"** thành đọc cấu hình hoặc bỏ số — Figma ghi cứng). **Ẩn** "Cẩm nang sức khỏe" tới khi có module bài viết | B7, F8 |
| Q22 | Tên endpoint | Tiền tố **`/public/`** cho mọi route của module (dễ kiểm "route nào cũng `@Public`", tách bạch với `/admin/*`): `GET /public/branches`, `/public/branches/:id`, `/public/specialties`, `/public/specialties/:id`, `/public/service-groups`, `/public/services`, `/public/doctors`, `/public/doctors/:id`, `/public/clinic-info`, `/public/overview`, `/public/suggestions` (mục 5.5) | B* |
| Q23 | Phân trang, tìm kiếm | `PageQueryDto` có sẵn (20/100, admin Q42) cho chi nhánh, chuyên khoa, bác sĩ; nhóm dịch vụ và dịch vụ **không phân trang** (ít). `q`: cắt khoảng trắng, **0–100 ký tự** (không có độ dài tối thiểu — dữ liệu công khai, khác TCBN của `patient`), escape LIKE, collation không dấu. Chi nhánh khớp tên + địa chỉ; chuyên khoa khớp tên + mô tả (như admin); bác sĩ khớp họ tên + tên chuyên khoa (ô Figma "Tìm theo tên bác sĩ hoặc chuyên khoa"). Bộ chọn chi nhánh và "gần nhất" lấy **mọi** chi nhánh bằng `pageSize=100` (ghi `TECH_DEBT` nếu > 100). Tham số lạ ⇒ 400 `TRUONG_KHONG_DUOC_PHEP` (giữ `forbidNonWhitelisted`); id lọc sai dạng ⇒ 400; id lọc không tồn tại ⇒ 200 rỗng | B* |
| Q24 | **Dữ liệu mẫu** cho demo và test (mục 2: thiếu toạ độ, mô tả/ảnh chuyên khoa, chỉ 1 bác sĩ, 0 phụ phí, 0 đánh giá, không có chuyên khoa ngừng, chi nhánh giống hệt nhau) | **Test tự động:** fixture riêng `apps/api/src/search/testing/search-fixtures.ts` dựng trên `AdminFixtures` (không sửa file admin). **Seed demo:** Trung (chủ file seed và chủ module `search`) thêm vào seed ở P2 (`[ĐỤNG admin]`); **Đại review PR**: toạ độ minh hoạ cho 4 chi nhánh, lịch khác nhau (một chi nhánh nghỉ thứ 7 chiều), mô tả chuyên khoa, ~8 bác sĩ demo (`DangHoatDong`, đủ chức danh/kinh nghiệm, rải chuyên khoa/chi nhánh), 1 chuyên khoa `NgungHoatDong`, 1 bác sĩ `ChoKichHoat`. **Phụ phí demo:** để **trống** (phụ phí = 0) trừ khi nhóm đưa bảng số minh hoạ có nhãn — không tự đặt số. Seed bác sĩ demo vẫn giữ nguyên khi admin B12 xong (B12 không đổi bảng) | P2 |
| Q25 | Trạng thái **chưa có frame** (mục 4.5) | Dùng `shared/ui` (`loading-state`, `error-state`, `empty-state`, `offline-banner`); câu chữ lấy nguyên 2.4 cho A1 ("Không tìm thấy kết quả phù hợp", "Không tìm thấy bác sĩ phù hợp") + gợi ý đổi bộ lọc; câu khác ở mục 5.8 | F* |
| Q26 | Màu Figma không đạt WCAG 2.2 AA (mục 4.4) | Theo ADR 0004: dùng token có sẵn (`brand-strong` cho nút có chữ trắng…); ghi danh sách lệch Figma để nhóm sửa; đo bằng màu thật khi làm FE | F* |

### 4.2a Kết quả trả lời ngày 03/11/2026 — **quyết định cuối**

Phiên kiểm độc lập bản nháp 1 (03/11/2026): **đạt, duyệt có chỉnh nhỏ** — đã đối chiếu mã thật ở `7c2586a` (`main` trên GitHub vẫn là `7c2586a`): guard `@Public` trả `true` ngay, không đọc token;
`chi_nhanh` không có cột trạng thái, mô tả, khu vực; chưa có `computeSurcharge`; `danh_gia_bac_si` chỉ có tên trong enum nhật ký; số câu hỏi, thẻ `[CHỜ Qn]` và số test case khớp nhau.

Nhóm **đồng ý đề xuất ở cả 26 câu** Q1–Q26 (bảng 4.2). Ghi chú kèm theo:

| # | Ghi chú của nhóm | Hệ quả cho kế hoạch |
|---|---|---|
| Q4 | Dùng chung câu trả lời với admin Q45 — **chờ Trung xác nhận Q45** | B1 không bị chặn (API luôn trả `hoatDong: null`, FE hiện "Nghỉ"); phần bỏ `[đề xuất]` ở quy tắc 28 (D3) chờ Q45; Q45 khác thì sửa Q4 theo Q45 |
| Q8, Q12 | Đồng ý; **nhóm bổ sung frame Figma** trang chi nhánh và hai ô lọc giá/đánh giá | F3, F5 làm theo bố cục đề xuất trong lúc chờ frame, chỉnh lại khi có (`[PHỤ THUỘC nhóm]`); ghi theo dõi ở `TRACKING.md` mục 5 |
| Q15 | Đồng ý (a)–(d). Cập nhật 03/11/2026: Trung là chủ cả admin B12 lẫn `search` ⇒ **Trung tự tách `computeSurcharge` và hàm cộng giá thành PR nhỏ TRƯỚC task B4**, đặt ở `apps/api/src/pricing/` hoặc chỗ Trung chọn; vẫn cấm công thức phụ phí lần hai | Giữ `[CHỜ admin B12]` cho B4, B5, B6 (và `giaKhamTu` của B2, F5–F7 qua B5) |
| Q19 | Đồng ý. Cập nhật 03/11/2026: nút Đăng xuất của khung công khai dùng **`useLogout()` của auth F5** (đang làm, chưa merge) | F1 ghi `[PHỤ THUỘC auth F5]` cho phần menu tài khoản; F5 chưa merge thì dùng `logout()` trực tiếp rồi đổi sau |
| Q20, Q21 | Đồng ý làm, nhưng **cụm 4 xếp sau cùng, bỏ trước nếu thiếu thời gian** | Tách `GET /public/overview` thành task **B9** (cụm 4); `GET /public/clinic-info` giữ ở **B7** và chuyển lên cụm 1 (chân trang cần); F1 có trang chủ tạm dẫn vào đủ hai use case; X1 không chờ cụm 4 (mục 6.7, 8) |
| Q24 | Đồng ý. Cập nhật 03/11/2026: **Trung (chủ file seed và chủ module) thêm seed demo ở P2; Đại review PR** | Ghi ở P2 và `TRACKING.md` mục 5 |

Hệ quả khác: bỏ mọi thẻ `[CHỜ Qn]` ở mục 6; tên endpoint mục 5.5 là tên chốt (Q22); `[đề xuất]` trong bảng 4.2 nay là quyết định. Thêm task B9; số test case không đổi (TCH-01 thuộc B9).
Sửa thêm khi rà: X3 trỏ nhầm "KGI-10" (chỉ có KGI-01…08) ⇒ "KGI-08".

### 4.3 Mọi chỗ còn `[cần điền]` / `[đề xuất]` liên quan

| Nơi | Nội dung | Thuộc | Câu hỏi |
|---|---|---|---|
| 2.4 TCBS b11 | Chi nhánh chưa khai báo lịch hoạt động cho thứ đó thì xử lý như ngày nghỉ `[đề xuất]` | module này (hiển thị) + `booking` (khung giờ) | Q4 |
| `clinix_quy_tac_nghiep_vu.md` quy tắc 28; ghi chú `chi_nhanh` | Thứ chưa có dòng = chưa khai báo, xử lý như nghỉ `[đề xuất]`; giờ cụ thể từng chi nhánh `[cần điền]` (giao diện minh hoạ chỉ là `[đề xuất]`) | admin (dữ liệu) / module này (hiển thị) | Q4, Q24 |
| `clinix.dbml` `chi_nhanh_lich_hoat_dong` | `[cần điền: 07:30 … là giờ bắt đầu nhận khám hay chỉ giờ mở cửa tiếp đón]` | admin (Q1 admin đã chốt nhãn "giờ nhận khám", file DB chưa cập nhật — admin D1/D6) | — (tham chiếu) |
| `phu_phi_bac_si.phu_phi` | Giá trị `[cần điền]`; `ap_dung` mặc định true `[đề xuất]`; ý nghĩa "rơi xuống mốc thấp" `[cần điền]` | admin (Q21 admin đã chốt ý nghĩa; giá trị vẫn chưa có) | Q15, Q24 |
| Quy tắc 11 | "Chỉ QTV Toàn hệ thống cấu hình bảng phụ phí `[đề xuất]`"; có ghi nhật ký khi sửa phụ phí `[cần điền]` | ngoài phạm vi (use case cấu hình phụ phí) | — |
| `bac_si.so_nam_kinh_nghiem`, `bac_si.chuc_danh` | `>= 0` `[đề xuất]`; ánh xạ `BS_CKI`/`BS_CKII` ↔ `BS` `[đề xuất]` | admin (Q20 admin: chốt kèm việc nhóm) | — (module này chỉ hiển thị) |
| `nhom_dich_vu.thu_tu_hien_thi` | `[đề xuất]` thứ tự hiển thị trên màn điều hướng | admin | — (module này sắp theo cột này rồi theo tên) |
| Quy tắc 38 | "Lịch làm việc đã tạo là hiển thị với bệnh nhân" — có bước **công bố lịch** riêng không `[cần điền]` | `doctor`/`booking` | Q18 (phần `[SAU]`) |
| Ghi chú `lich_lam_viec`, quy tắc 39 | Giờ của ca = khoảng nhận khám tương ứng `[đề xuất]` | `doctor`/`booking` | Q18 (phần `[SAU]`) |
| Quy tắc 44, enum `ca_lam_viec_enum` | `CaToi` giữ hay bỏ `[cần điền]` | `doctor` | — (phần `[SAU]`; khung giờ không có ca tối) |
| Figma chân trang | Địa chỉ, email `[cần điền]`; "1900 1234 (số demo)" | dữ liệu `thong_tin_phong_kham` (admin) | Q19 |
| 2.4 TCCN, TCBS | Không gắn thẻ nào khác; các chỗ **thiếu** (không gắn thẻ) đã liệt kê ở L1–L20 | module này | Q1–Q21 |

### 4.4 Đối chiếu Figma (đã đọc 03/11/2026, file `1OsOfwD5myNNRv7FPCD9YC`, trang `63:2`)

Frame đã đọc: "Trang chủ" `257:2`, "Trang chủ - Tìm kiếm" `258:2`, "Chuyên khoa" `217:2`, "Chuyên khoa - Chi tiết chuyên khoa" `259:2`, "Đội ngũ bác sĩ" `260:2`, "Đội ngũ bác sĩ - Chi tiết bác sĩ"
`653:2` (+ Giới thiệu `654:2`, Phòng khám `655:2`, Hướng dẫn `656:2`, Đánh giá `657:2`, Đã chọn giờ `658:2`), "Bệnh nhân - Đặt lịch khám - Bước 1" `444:2`, "Bước 2" `445:2`, "Bước 3" `446:2`.
**Không tìm thấy** frame công khai cho danh sách/chi tiết chi nhánh, bộ chọn chi nhánh, hộp "đăng ký danh sách chờ" riêng (Q8, Q19).

- **Thanh điều hướng:** logo CLINIX; Trang chủ, Dịch vụ khám (có mũi tên thả xuống), Chuyên khoa, Bác sĩ, Cẩm nang, Liên hệ; nút cam "Đặt lịch khám"; nút viền "Đăng nhập". Không có bộ chọn chi nhánh.
- **Chân trang:** logo + câu giới thiệu + 2 biểu tượng mạng xã hội; "Liên kết nhanh" (Trang chủ, Chuyên khoa, Đội ngũ bác sĩ, Cẩm nang sức khỏe, Về chúng tôi, Câu hỏi thường gặp); "Chuyên khoa" (8 tên);
  "Thông tin liên hệ" (địa chỉ `[cần điền]`, "1900 1234 (số demo)", email `[cần điền]`, giờ ghi cứng — L17); bản quyền, "Chính sách bảo mật", "Điều khoản sử dụng"; bong bóng chat có số đếm (nhắn tin — không thuộc module này).
- **Trang chủ:** hero "Đặt lịch khám đúng bác sĩ, đúng giờ", ô "Tìm bác sĩ, chuyên khoa, dịch vụ" + nút "Tìm kiếm", "Gợi ý: Khám theo chuyên khoa · Khám tổng quát"; 3 con số; "Chọn dịch vụ khám" (thẻ nhóm: "8 dịch vụ ·
  từ 200.000đ", "Chọn dịch vụ"; "Tầm soát ung thư — Sắp triển khai"); "Tìm bác sĩ theo lĩnh vực bạn cần thăm khám" (thẻ chuyên khoa + "N bác sĩ"/"Sắp có bác sĩ", "Xem tất cả"); "Đội ngũ bác sĩ" (nhãn "Nhiều kinh nghiệm",
  "Được yêu thích"; thẻ: điểm, tên kèm chức danh, "18 năm KN", "30 phút/lần", giá, "Xem lịch"); "Đặt lịch khám tại CLINIX" (4 bước, có "Giữ chỗ 15 phút" ghi cứng); "Cẩm nang sức khỏe".
- **Trang chủ - Tìm kiếm** (`258:2`): ô tìm có chữ "tim", hộp gợi ý dưới ô: "Tim mạch" + nhãn loại "Chuyên khoa".
- **Chuyên khoa** (`217:2`): breadcrumb; "Khám chuyên khoa"; "8 chuyên khoa, 7 chuyên khoa hiện đã có bác sĩ."; ô "Tìm chuyên khoa, ví dụ: tim mạch"; lưới thẻ (ảnh minh hoạ, tên, mô tả 2 dòng, "N bác sĩ"/"Sắp có bác sĩ").
  **Không có** bộ lọc chi nhánh hay trạng thái (Q1, Q5).
- **Chi tiết chuyên khoa** (`259:2`): ảnh, tên, mô tả, "2 bác sĩ", "Giá khám từ 350.000đ · cọc 100.000đ", nút "Đặt lịch khám"; "Bác sĩ chuyên khoa …": dải 7 ngày, thẻ bác sĩ bên trái (ảnh, chuyên khoa, tên, sao +
  "(1 đánh giá)"/"Chưa có đánh giá", "12 năm kinh nghiệm", chi nhánh, "Giá khám", "Cọc", "Xem hồ sơ", "Nhắn tin") và khung giờ bên phải (`[SAU]`; trạng thái "Bác sĩ không có lịch làm việc ngày này" = A3).
- **Đội ngũ bác sĩ** (`260:2`): ô "Tìm theo tên bác sĩ hoặc chuyên khoa", chọn "Tất cả chuyên khoa", "Chi nhánh — Tất cả chi nhánh", "Ngày khám" (dải 7 ngày — `[SAU]`); "12 bác sĩ · lịch Hôm nay 18/10"; thẻ như trên.
  **Không có** lọc giá, đánh giá, dịch vụ (Q11, Q12).
- **Chi tiết bác sĩ** (`653:2`–`658:2`): đầu trang (tên, chuyên khoa, điểm, kinh nghiệm, "30 phút/lượt", chi nhánh, giá, cọc); tab Lịch khám (`[SAU]`), Giới thiệu (mô tả chuyên môn + "Nội dung minh họa"),
  Phòng khám (địa chỉ, giờ làm việc), Hướng dẫn (5 bước đặt khám, tĩnh), Đánh giá (phân bố sao, nhận xét kèm tên người đánh giá — `[SAU]`, Q16); khối phải "Thông tin khám" (dịch vụ, giá, cọc, thời gian/lượt,
  **"Đặt trước tối đa 7 ngày"** — L14), "Nhắn tin với bác sĩ", "Địa chỉ phòng khám", "Hỗ trợ đặt lịch"; câu "Bạn cần đăng nhập để hoàn tất đặt lịch…" (A4 — `[SAU]`).
- **Đặt lịch khám - Bước 1–3** (`444:2`–`446:2`, khung Bệnh nhân có thanh bước 1–6): Bước 1 thẻ nhóm dịch vụ ("Chưa thể đặt lịch online cho nhóm này" cho nhóm sắp triển khai); Bước 2 danh sách dịch vụ của nhóm
  (mô tả, "Giá dịch vụ", "Cọc"/"Không cần cọc", "Phụ phí bác sĩ (nếu có) sẽ được cộng thêm…"); Bước 3 "Dịch vụ: Tim mạch", dải ngày, thẻ bác sĩ + khung giờ chia "Buổi sáng"/"Buổi chiều", 4 trạng thái,
  "Không có chi nhánh nào cung cấp dịch vụ này vào ngày …" (`[SAU]`). Đây là cơ sở của Q10.
- **Lệch WCAG 2.2 AA cần nhóm sửa Figma (Q26, đo khi làm FE bằng màu thật):** chữ trắng trên nút cam "Đặt lịch khám"/"Tìm kiếm"; chữ vàng trên nền xanh ngọc của hero; chữ xám nhạt "Vui lòng chọn ngày khác",
  "Chưa có đánh giá"; nhãn "Sắp có bác sĩ" xám trên xám; chữ cam "Cọc …" trên nền vàng nhạt.
- **Phải bỏ/sửa theo quyết định đã chốt:** "Đặt trước tối đa 7 ngày" (quy tắc 38); "Giữ chỗ 15 phút" ghi cứng (cấu hình `thoi_gian_giu_cho`); ảnh chân dung bác sĩ (Q14); giờ ghi cứng ở chân trang (Q19e).

### 4.5 Trạng thái chưa có frame Figma (nhóm bổ sung; trong lúc chờ FE theo Q25)

- Khung: bộ chọn chi nhánh (đóng/mở, đang định vị, từ chối quyền, không định vị được); trạng thái đã đăng nhập; màn hẹp (F10); mục chưa triển khai.
- TCCN: toàn bộ trang chi nhánh (Q8); đang tải; không có kết quả (A1); lỗi mạng/timeout; chi tiết không tồn tại (404); chuyên khoa không có ảnh/mô tả.
- TCBS: bộ lọc giá/đánh giá (Q12); danh sách rỗng "Không tìm thấy bác sĩ phù hợp" (A1); phân trang; đang tải; bác sĩ không có mô tả chuyên môn; gợi ý tìm kiếm rỗng/đang tải (Q20).

### 4.6 Việc của nhóm (ngoài repo)

- ~~Trả lời Q1–Q26~~ — xong 03/11/2026 (mục 4.2a).
- **Sửa 2.4** (file Word ở repo `TLCN_CLINIX`) theo D1, D2 (đi cùng PR của task code tương ứng).
- **Bổ sung frame Figma** (ghi theo dõi ở `TRACKING.md` mục 5): **trang danh sách/chi tiết chi nhánh** (Q8) và **hai ô lọc giá/đánh giá** ở "Đội ngũ bác sĩ" và "Bước 3" (Q12); thêm bộ chọn chi nhánh
  trên thanh điều hướng (Q19a), trạng thái mục 4.5, các mục "phải bỏ/sửa" và màu ở mục 4.4.
- Gửi đường dẫn trang công khai trong `routes.ts` của mã Figma Make (Q19g) nếu khác đề xuất.
- Trung (người làm module, chủ `admin`): tách `computeSurcharge` + hàm cộng giá trước B4 (Q15), xác nhận admin Q45 (Q4), thêm seed demo P2 (Q24). Đại: review PR P2.
- Ghi chủ migration `danh_gia_bac_si` khi lập kế hoạch module sở hữu use case đánh giá (Q16); bộ tính khung giờ thuộc `booking` (Q18).

## 5. Thiết kế kỹ thuật

### 5.1 Cấu trúc thư mục

**API — `apps/api/src/search/`** (controller chỉ nhận/trả, service điều phối, repository SQL chỉ đọc):

```
search/
  search.module.ts            # chỉ controllers + providers của module; không import module admin (chúng không export gì); DataSource có sẵn toàn cục
  search.constants.ts         # mã lỗi (mục 5.8), giới hạn q, số gợi ý
  common/                     # public-query.dto.ts (q + PageQueryDto), id-param.ts (id sai dạng ⇒ 404), public-doctor.sql.ts (MỘT hằng điều kiện "bác sĩ công khai" — H5),
                              # weekly-schedule.view.ts (7 dòng ⇒ 7 phần tử, thứ thiếu ⇒ hoatDong: null), read-only-tx.ts (danh sách + đếm cùng ảnh chụp — H6)
  branches/                   # public-branch.controller.ts, .service.ts, .repository.ts, .dto.ts        (TCCN — chi nhánh)
  specialties/                # public-specialty.controller.ts, …                                         (TCCN — chuyên khoa)
  service-catalog/            # public-service-catalog.controller.ts, …                                   (TCBS b1–b2)
  doctors/                    # public-doctor.controller.ts, .service.ts, .repository.ts, .dto.ts, doctor-list.rules.ts (lọc/sắp/cắt trang thuần)  (TCBS b3–b9)
  pricing/                    # exam-price.reader.ts: đọc toàn bộ phu_phi_bac_si, gọi hàm chung của admin (Q15) — KHÔNG có công thức riêng
  ratings/                    # doctor-rating.reader.ts: trả {null, 0} khi chưa có bảng; đổi nguồn ở K5 (Q16)
  site/                       # public-site.controller.ts: clinic-info (chân trang), overview (con số trang chủ)
  suggestions/                # public-suggestion.controller.ts (Q20)
  testing/                    # search-fixtures.ts (dựng trên AdminFixtures), public-route-audit.ts
```

**Web — `apps/web/src/features/search/`** (xuất `RouteObject[]` và layout cho `router/` ghép; không import chéo `features/`):

```
features/search/
  index.ts                    # SEARCH_ROUTES, PublicLayout
  search-paths.ts             # hằng đường dẫn (Q19g)
  api/                        # search-service.ts (mọi lời gọi request(..., { skipAuthToken: true })), search-types.ts, search-errors.ts
  shell/                      # public-layout.tsx, public-header.tsx, account-menu.tsx, branch-picker.tsx, public-footer.tsx, mobile-nav-drawer.tsx (F10)
  branches/                   # branch-list-page.tsx, branch-detail-page.tsx, weekly-hours.tsx
  specialties/                # specialty-list-page.tsx, specialty-detail-page.tsx, specialty-card.tsx
  services/                   # service-group-page.tsx (b1), service-list-page.tsx (b2)
  doctors/                    # doctor-list-page.tsx (b3–b6 + "Đội ngũ bác sĩ"), doctor-filters.tsx, doctor-card.tsx, doctor-detail-page.tsx (b9), use-doctor-search.ts
  home/                       # home-page.tsx (Q21), global-search.tsx (Q20)
  format/                     # money.ts (chuỗi decimal ⇒ "300.000đ"), doctor-title.ts (BS_CKII ⇒ "BS.CKII"), weekday.ts
shared/branch-selection/      # Q7f: selected-branch-store.ts (localStorage + try/catch), use-selected-branch.ts, nearest-branch.ts (Haversine thuần), geolocation.ts
```

### 5.2 Truy cập công khai

- Mọi controller của `SearchModule`: `@Public()` **ở cấp class**, đường dẫn bắt đầu bằng `public/` (Q22); **không** có `@Roles`, `@CurrentUser`, route ghi (POST/PUT/PATCH/DELETE).
  Ca CC-04 quét metadata mọi route của module (theo mẫu `rbac/testing/admin-route-audit.ts`) để giữ ba điều này.
- Vì guard bỏ qua token trên route `@Public`, kết quả **không phụ thuộc** người gọi (Q17): CC-02/CC-03 so thân phản hồi khi không token, token đúng của 4 vai trò, token hết hạn/sai chữ ký/phiên đã thu hồi.
- Chỉ đọc: không giao dịch ghi; danh sách + `COUNT` trong một giao dịch `REPEATABLE READ` chỉ đọc (H6). HĐK "không có thay đổi dữ liệu" kiểm bằng CC-07.
- Không ghi nhật ký hành động (không có thao tác nhạy cảm). Log: không ghi `q` và tham số lọc `[đề xuất]`; không có toạ độ người dùng nào tới API (H9).
- Không thêm cache phía máy chủ; dữ liệu admin đổi là thấy ngay ở lần gọi sau (AN-07).

### 5.3 Điều kiện "công khai" (một chỗ định nghĩa — H5)

| Dữ liệu | Hiện công khai khi | Nguồn |
|---|---|---|
| Chi nhánh | Mọi dòng `chi_nhanh` (không có cột trạng thái) | Q1 |
| Chuyên khoa | `trang_thai_hoat_dong = 'DangHoatDong'` | Q1, hậu điều kiện "Quản lý chuyên khoa" |
| Dịch vụ khám | Có trong `chi_nhanh_dich_vu_kham` (của chi nhánh đang lọc, hoặc của ≥ 1 chi nhánh) | Q10, admin Q15 |
| Nhóm dịch vụ | Mọi dòng; nhóm không còn dịch vụ công khai ⇒ cờ `sapTrienKhai` | Q10, Figma |
| Bác sĩ | `PUBLIC_DOCTOR_CONDITION` (`common/public-doctor.sql.ts`): tài khoản `BacSi` `DangHoatDong`, chuyên khoa `DangHoatDong`, cặp chi nhánh–dịch vụ còn | Q13 |

Mọi truy vấn đếm (`soBacSi`, con số trang chủ, `giaKhamTu`) dùng **cùng** hằng điều kiện này với danh sách bác sĩ. Ca AN-01…AN-04 kiểm từng nhánh trên mọi endpoint.

### 5.4 Giá khám áp dụng và lọc theo giá/đánh giá (TCBS b4, b6, b8)

1. SQL lấy **ứng viên**: `bac_si b JOIN tai_khoan t JOIN chuyen_khoa ck JOIN chi_nhanh cn JOIN dich_vu_kham dv WHERE PUBLIC_DOCTOR_CONDITION AND [dichVuKhamId] AND [chuyenKhoaId] AND [chiNhanhId] AND [q LIKE họ tên/tên chuyên khoa]`,
   chỉ chọn cột danh sách trắng (Q14).
2. `ExamPriceReader`: đọc **mọi** dòng `phu_phi_bac_si` một lần; với mỗi ứng viên gọi hàm chung của admin (Q15) ⇒ `phuPhi`, `giaKham` (chuỗi decimal).
3. `DoctorRatingReader`: một câu `GROUP BY` cho các ứng viên (khi có bảng); hiện trả `{ diemTrungBinh: null, soDanhGia: 0 }` (Q16).
4. `doctor-list.rules.ts` (hàm thuần, unit test): lọc `giaTu ≤ giaKham ≤ giaDen`, `diemTrungBinh ≥ diemTu` (bác sĩ chưa có đánh giá bị loại khi có `diemTu`), sắp (Q12) với khoá cuối là `bacSiId` để ổn định, cắt trang ⇒ `{items, total, page, pageSize}`.
   So sánh tiền bằng số nguyên **đồng** (chuỗi `"300000.00"` ⇒ `300000`), không dùng số thực.
5. Ghi `TECH_DEBT`: lọc giá trong bộ nhớ là O(số bác sĩ khớp) mỗi request — ổn ở quy mô TLCN; nếu lớn thì cần cột giá tính sẵn (đổi schema).

### 5.5 Endpoint (tên `[đề xuất]` — Q22; tiền tố `/api` qua proxy như mọi endpoint)

| Endpoint | Use case | Trả về (danh sách trắng) |
|---|---|---|
| `GET /public/branches?q=&page=&pageSize=` | TCCN b2–b4, A1; A2 (toạ độ) | `Paged<{ chiNhanhId, ten, diaChi, toaDoLat, toaDoLng }>` sắp `ten`, `chi_nhanh_id`; id và toạ độ là chuỗi |
| `GET /public/branches/:id` | TCCN b5–b6 | `{ chiNhanhId, ten, diaChi, toaDoLat, toaDoLng, lichHoatDong: [7 × { thuTrongTuan, hoatDong: true \| false \| null, sang: {batDau, ketThuc} \| null, chieu }], dichVuKham: [{ dichVuKhamId, ten }], soBacSi }` (+ `moTa` nếu Q2 = B). 404 cùng thân cho không có / sai dạng |
| `GET /public/specialties?q=&chiNhanhId=&page=&pageSize=` | TCCN b2–b4, A1 | `Paged<{ chuyenKhoaId, ten, moTa, anhDaiDien, soBacSi }>` + `soCoBacSi` (dòng "7 chuyên khoa hiện đã có bác sĩ") `[đề xuất]`; lọc chi nhánh theo Q5 |
| `GET /public/specialties/:id?chiNhanhId=` | TCCN b5–b6 | `{ chuyenKhoaId, ten, moTa, anhDaiDien, soBacSi, giaKhamTu: { giaKham, mucDatCoc } \| null }` (Q9); chuyên khoa ngừng ⇒ 404 |
| `GET /public/service-groups?chiNhanhId=` | TCBS b1 | `{ items: [{ nhomDichVuId, ten, soDichVu, giaTu \| null, sapTrienKhai }] }` sắp `thu_tu_hien_thi`, `ten` |
| `GET /public/services?nhomDichVuId=&chiNhanhId=` | TCBS b2–b3 | `{ items: [{ dichVuKhamId, ten, nhomDichVu: {id, ten}, thoiLuong, giaMacDinh, mucDatCoc, soBacSi }] }` |
| `GET /public/doctors?dichVuKhamId=&chuyenKhoaId=&chiNhanhId=&q=&giaTu=&giaDen=&diemTu=&sapXep=&page=&pageSize=` | TCBS b4–b6, b8 (tóm tắt), A1 | `Paged<{ bacSiId, hoTen, chucDanh, soNamKinhNghiem, chuyenKhoa: {chuyenKhoaId, ten}, chiNhanh: {chiNhanhId, ten, diaChi}, dichVu: {dichVuKhamId, ten, thoiLuong}, gia: {giaMacDinh, phuPhi, giaKham, mucDatCoc}, danhGia: {diemTrungBinh, soDanhGia} }>`; rỗng ⇒ `items: []`, `total: 0` (không 404) |
| `GET /public/doctors/:id` | TCBS b9 | Như một phần tử danh sách + `moTaChuyenMon`, `chiNhanh.lichHoatDong` (cùng dạng chi tiết chi nhánh). Không công khai/không có/sai dạng ⇒ 404 cùng thân |
| `GET /public/clinic-info` | Bổ trợ (chân trang) | `{ tenThuongHieu, diaChiTruSo, duongDayNong, email }` (NULL được; chưa có dòng ⇒ mọi trường `null`, không 404) |
| `GET /public/overview` | Bổ trợ (trang chủ, Q21) | `{ soChuyenKhoa, soBacSi, soDichVu }` |
| `GET /public/suggestions?q=` | Q20 | `{ chuyenKhoa: [{chuyenKhoaId, ten}], dichVu: [{dichVuKhamId, ten}], bacSi: [{bacSiId, hoTen, chucDanh}] }` mỗi nhóm ≤ 5; `q` rỗng ⇒ mảng rỗng |

### 5.6 Chừa chỗ cho phần khung giờ `[SAU]` — hợp đồng hiện tại **không đổi**

- Danh sách và chi tiết bác sĩ **không** nhận tham số ngày và **không** có trường khung giờ: ngày chỉ ảnh hưởng khung giờ, không lọc bác sĩ (TCBS A3: bác sĩ không có lịch vẫn hiện) ⇒ không mâu thuẫn 2.4.
- Phần sau **thêm endpoint mới** (K1): `GET /public/doctors/schedules?ngay=YYYY-MM-DD&bacSiId=…` (nhiều bác sĩ của một trang, ≤ `pageSize`) và `GET /public/doctors/:id/schedule?ngay=` ⇒
  `{ bacSiId, ngay, trangThaiNgay: 'CoLich' | 'KhongCoLich' | 'ChiNhanhNghi', thuNghi?, khungGio: [{ batDau, ketThuc, ca, trangThai: 'ConTrong' | 'DaDat' | 'DangGiuCho' | 'HetHan' }] }`
  (thời lượng lấy từ dịch vụ của bác sĩ — mỗi bác sĩ một dịch vụ). Lỗi dữ liệu lịch không hợp lệ (b14) ⇒ mã lỗi riêng do bộ tính khung giờ định nghĩa.
- FE: thẻ bác sĩ có **vùng chừa sẵn** bên phải (bố cục Figma) — đợt này hiện câu "Lịch khám sẽ hiển thị ở bước đặt lịch" `[đề xuất]` hoặc thu hẹp thẻ; K2 thay vùng này bằng khung giờ, không đổi thẻ.
- Chuyển sang "Đặt lịch khám" (b10) truyền `{ chiNhanhId, dichVuKhamId, bacSiId, ngayGio }` qua query/trạng thái điều hướng — hợp đồng ghi ở PLAN `booking`.

### 5.7 Khung công khai và "chi nhánh đang chọn"

- `PublicLayout` = `PublicHeader` + `<Outlet />` + `PublicFooter`, có `errorElement` riêng `[đề xuất]`. `router/routes.tsx`: bọc trang chủ và mọi trang công khai của module bằng `PublicLayout`;
  trang auth (`AUTH_PAGE_ROUTES`) và khu vai trò **giữ nguyên** (không có header công khai — Figma auth không có) — KC-06.
- Mục điều hướng là dữ liệu `{ label, to? }` khai ở lớp `router/` (`router/public-nav.ts` `[đề xuất]`, cùng nếp patient Q21d): module sau (bài viết, liên hệ) chỉ đặt `to`, không sửa `features/search/`.
- Trạng thái đăng nhập: `useAuth()`; đăng xuất dùng `useLogout()` của auth F5 (chưa merge thì gọi `logout()` trực tiếp rồi đổi sau); người đã đăng nhập vào `/` **không** bị chuyển đi (giữ hành vi `HomePage` hiện tại — KC-03).
- "Chi nhánh đang chọn" (Q6, Q7): khởi tạo **một lần** khi `PublicLayout` gắn — đọc kho lưu; chưa có ⇒ tải danh sách chi nhánh; có ≥ 1 chi nhánh đủ toạ độ và trình duyệt có Geolocation ⇒ xin vị trí
  (`timeout` 10 s, `maximumAge` 10 phút `[đề xuất]`) ⇒ `nearestBranch` (hàm thuần) ⇒ lưu `nguon: 'DinhVi'`; từ chối/lỗi/không có ⇒ lưu "Toàn quốc". Bộ lọc chi nhánh của trang TCCN ghi vào kho chung;
  bộ lọc chi nhánh của TCBS chỉ **khởi tạo** từ kho chung (Q7d).

### 5.8 Mã lỗi → thông báo (câu chữ `[đề xuất]`; nhóm duyệt và đưa vào Figma)

| Mã lỗi | HTTP | Thông báo |
|---|---|---|
| `TU_KHOA_KHONG_HOP_LE` | 400 | Từ khoá tối đa 100 ký tự. |
| `BO_LOC_KHONG_HOP_LE` (+ `loi[]`: `giaTu`, `giaDen`, `diemTu`, `sapXep`, id lọc) | 400 | Bộ lọc không hợp lệ. (dưới ô: "Giá phải là số không âm", "Giá từ phải nhỏ hơn hoặc bằng giá đến"…) |
| `TRUONG_KHONG_DUOC_PHEP` | 400 | Dùng lại của auth P5 (tham số lạ) |
| `KHONG_TIM_THAY` | 404 | Không tìm thấy dữ liệu. (FE theo trang: "Không tìm thấy chi nhánh/chuyên khoa/bác sĩ này.") |
| Danh sách rỗng TCCN (A1/4b) | 200 | **Không tìm thấy kết quả phù hợp** (2.4) + nút "Xoá bộ lọc" (A1/4c) |
| Danh sách rỗng TCBS (A1/6b) | 200 | **Không tìm thấy bác sĩ phù hợp** (2.4) + gợi ý "Đổi bộ lọc hoặc chọn dịch vụ khác" (A1/6c) |
| Mất mạng / timeout / 500 | — | Dùng `error-state`, `offline-banner` có sẵn, nút "Thử lại" |
| Định vị bị từ chối/không lấy được | — | (thông báo nhỏ trong bộ chọn) "Không lấy được vị trí — đang xem Toàn quốc. Bạn có thể chọn chi nhánh bất kỳ." |

### 5.9 Kiểm thử

- Unit: luật thuần (`doctor-list.rules`, `weekly-schedule.view`, `nearestBranch`, định dạng tiền/chức danh/thứ), DTO (biên `q`, giá, điểm, id).
- **Tích hợp MySQL thật** (`*.int-spec.ts`): điều kiện công khai, đếm, LIKE + collation, phân trang, cùng ảnh chụp, giá qua hàm chung, không đổi dữ liệu.
- **E2E** qua `configureApp(app)`: truy cập công khai (không token / token 4 vai trò / token hỏng), danh sách trắng trường, 404 cùng thân, hình dạng lỗi (`expectErrorResponse`).
- FE Vitest + happy-dom: dựa vào vai trò và nội dung; giả API qua lớp client; giả `navigator.geolocation` và `localStorage` (cả khi ném lỗi).

## 6. Kế hoạch task

### 6.1 Sơ đồ phụ thuộc (cùng một hàng = làm song song được)

```
Nền đã có: auth A1–A15, F1–F4, P5, P6 · admin entity/migration danh mục + nhân sự, common/paging, common/time, AdminFixtures, seed

Mọi câu hỏi Q1–Q26 đã trả lời (03/11/2026) — task bắt đầu được khi phụ thuộc của nó đã merge. Người làm: Trung (`junUTE`). Còn chờ: admin B12 (Trung tự tách `computeSurcharge` trước B4), xác nhận admin Q45, auth F5 (`useLogout`), Đại review P2.

Cụm 1 (khung):  P1 khung SearchModule + kiểm route công khai ── B7 clinic-info (chân trang)
                F1 khung công khai (header, footer, trạng thái đăng nhập) ── F10 ngăn kéo màn hẹp (cuối cụm, không chặn F1)
Cụm 2 (TCCN):   P1 ─ B1 chi nhánh ─┬─ F2 chi nhánh đang chọn + bộ chọn ─ F3 trang chi nhánh (chờ frame, Q8)
                P1 ─ B2 chuyên khoa ─ F4 trang chuyên khoa
Cụm 3 (TCBS):   P1 ─ B3 nhóm dịch vụ/dịch vụ
                admin B12 (computeSurcharge) ─ B4 giá + đánh giá ─ B5 danh sách bác sĩ ─ B6 chi tiết bác sĩ   [CHỜ admin B12]
                B2 + B4 ─ (giaKhamTu của B2, Q9)
                F1 + B3 + B5 ─ F5 luồng dịch vụ → danh sách bác sĩ ─ F6 "Đội ngũ bác sĩ" + bác sĩ trong chi tiết chuyên khoa ─ F7 chi tiết bác sĩ
Dữ liệu mẫu:    P2 seed demo [ĐỤNG admin] — Đại review (song song, cần trước X1)
HOÀN TẤT:       X1 chạy tay ─ X2 tổng kết  (sau cụm 1–3; không chờ cụm 4)
Cụm 4 (trang chủ — SAU CÙNG, BỎ TRƯỚC NẾU THIẾU THỜI GIAN):  B9 overview ─ F8 trang chủ ;  B8 gợi ý ─ F9 ô tìm tổng
[SAU]:          K1 API khung giờ ─ K2 FE khung giờ ─ K3 chuyển sang Đặt lịch + A4 ; K4 đăng ký chờ (A2) ; K5 nguồn đánh giá thật ;  X3 sau K1–K5
```

Cột trạng thái: ☐ = chưa làm, ☑ = đã merge. Rà lại 03/11/2026: **chưa task nào bắt đầu**.

### 6.2 Nhóm P — Tiền đề

| ☐ | ID | Việc | Phụ thuộc | Truy vết | Thẻ / PR gợi ý |
|---|---|---|---|---|---|
| ☐ | P1 | `SearchModule` (`apps/api/src/search/`, đăng ký `AppModule`); `search.constants.ts`; `common/`: `PublicQueryDto` (q 0–100, escape), id sai dạng ⇒ 404, `PUBLIC_DOCTOR_CONDITION` (khung, chốt nội dung ở B2/B5), `weekly-schedule.view.ts`, giao dịch đọc cùng ảnh chụp; `testing/search-fixtures.ts` (dựng trên `AdminFixtures`: chuyên khoa ngừng, bác sĩ `ChoKichHoat`/`NgungHoatDong`, chi nhánh có/không toạ độ, thiếu thứ, phụ phí); ca kiểm route công khai CC-04 | auth A4, P5; admin entity — đã có | TCCN, TCBS TĐK "không yêu cầu đăng nhập" | `[TIỀN ĐỀ]` · `feat(search)` — **làm ngay** |
| ☐ | P2 | Seed demo bổ sung theo Q24 (toạ độ, lịch khác nhau, mô tả chuyên khoa, ~8 bác sĩ, chuyên khoa ngừng, bác sĩ chưa kích hoạt); test seed idempotent | P1 | Demo cả hai use case | `[ĐỤNG admin]` (cùng người làm, không phải báo) — Trung viết, **Đại review PR** (Q24) · `feat(db)` |

### 6.3 Nhóm B — Backend

| ☐ | ID | Việc | Phụ thuộc | Truy vết | Thẻ |
|---|---|---|---|---|---|
| ☑ | B1 | `GET /public/branches` (q khớp tên + địa chỉ, phân trang, toạ độ) + `GET /public/branches/:id` (7 thứ, thứ thiếu ⇒ `hoatDong: null`, dịch vụ đang cung cấp, số bác sĩ công khai); chỉ đọc lịch đang áp dụng (H2) | P1 | TCCN b2–b6, A1/4a–4b; A2/*b (toạ độ) | `[ĐỒNG BỘ TL]` D1, D3 · `feat(search)` — Q1–Q4 đã chốt (Q4 chờ Trung xác nhận admin Q45: không chặn B1 vì API luôn trả `hoatDong: null`, chỉ chặn phần sửa quy tắc 28 ở D3) |
| ☐ | B2 | `GET /public/specialties` (chỉ đang hoạt động, q tên + mô tả, lọc chi nhánh theo Q5, `soBacSi` bằng điều kiện công khai, ảnh `COALESCE`) + `GET /public/specialties/:id` (ngừng ⇒ 404); `giaKhamTu` (Q9) thêm khi B4 xong | P1 (+ B4 cho `giaKhamTu`) | TCCN b2–b6, A1; HĐK | `[ĐỒNG BỘ TL]` D1, D3 · `feat(search)` (phần `giaKhamTu`: `[CHỜ admin B12]` qua B4) |
| ☑ | B3 | `GET /public/service-groups` + `GET /public/services` (dịch vụ đang cung cấp, theo chi nhánh nếu có; cờ "Sắp triển khai") | P1 | TCBS b1–b3 | `[ĐỒNG BỘ TL]` D2 · `feat(search)` |
| ☐ | B4 | `pricing/exam-price.reader.ts` (đọc mọi quy tắc phụ phí, gọi **hàm chung** của admin — không công thức riêng) + `ratings/doctor-rating.reader.ts` (trả `null`/0 khi chưa có bảng); unit + tích hợp đối chiếu kết quả với hàm chung | P1; **admin B12 (`computeSurcharge` + hàm cộng giá)** | TCBS b8 (giá, điểm) | `[CHỜ admin B12]` → **đã có** `apps/api/src/pricing/` (`computeSurcharge`, `computeExamPrice`, `addMoney`; 05/11/2026) · `feat(search)` |
| ☐ | B5 | `GET /public/doctors`: ứng viên bằng SQL + điều kiện công khai; giá/đánh giá qua B4; lọc giá/đánh giá, sắp, cắt trang trong bộ nhớ (5.4); danh sách trắng trường; rỗng ⇒ 200 | B4, B3 | TCBS b3–b6, b8 (tóm tắt), A1/6a–6b | `[CHỜ admin B12]` (qua B4) · `[ĐỒNG BỘ TL]` D2, D3 · `feat(search)` |
| ☐ | B6 | `GET /public/doctors/:id`: hồ sơ năng lực (mô tả chuyên môn, giờ nhận khám chi nhánh, dịch vụ, giá, đánh giá); 404 cùng thân | B5 | TCBS b9 | `[CHỜ admin B12]` (qua B4) · `feat(search)` |
| ☐ | B7 | `GET /public/clinic-info` (chân trang — Q19e) | P1 | Bổ trợ khung | Cụm 1 · `feat(search)` |
| ☐ | B8 | `GET /public/suggestions` (≤ 5 mỗi loại, chỉ dữ liệu công khai, dùng lại repository B2/B3/B5) | B2, B3, B5 | TCCN b3, TCBS b1 (ô tìm tổng — Q20) | **Cụm 4 — sau cùng, bỏ trước nếu thiếu thời gian** · `feat(search)` |
| ☐ | B9 | `GET /public/overview` (ba con số trang chủ, cùng điều kiện công khai — H5) | B2, B3, B5 | Bổ trợ trang chủ (Q21) | **Cụm 4 — sau cùng, bỏ trước nếu thiếu thời gian** · `feat(search)` |

### 6.4 Nhóm F — Frontend (bám frame mục 4.4; trạng thái chưa có frame theo Q25)

| ☐ | ID | Việc | Phụ thuộc | Truy vết | Thẻ |
|---|---|---|---|---|---|
| ☐ | F1 | **Khung công khai (task đầu của module):** `PublicLayout`, `PublicHeader` (mục theo Figma, `aria-current`, mục chưa có trang vô hiệu), menu tài khoản khi đã đăng nhập (`useAuth`; Đăng xuất dùng `useLogout()` của auth F5 — `[PHỤ THUỘC auth F5]`, F5 chưa merge thì dùng `logout()` trực tiếp rồi đổi sau), `PublicFooter` (liên hệ từ B7, trường trống ẩn dòng), cấu hình mục điều hướng ở `router/public-nav.ts`, ghép vào `router/routes.tsx`; `features/search/api/` dùng `skipAuthToken`; **trang chủ tạm** trong khung mới: nội dung `HomePage` cũ + liên kết vào "Dịch vụ khám", "Chuyên khoa", "Bác sĩ" (đủ để dùng hai use case nếu cụm 4 bị bỏ) | auth F1 (đã có); auth F5 (menu tài khoản); B7 cho dữ liệu chân trang | Khung (nhóm chốt 03/11/2026); TCCN A2/*c ("bộ chọn trên thanh điều hướng" — chỗ chừa cho F2) | **Làm ngay** · `feat(web)` |
| ☑ | F2 | "Chi nhánh đang chọn": `shared/branch-selection/` (kho lưu + `try/catch`, `nearestBranch`, Geolocation), `BranchPicker` trên header, khởi tạo lần đầu (A2), chân trang hiện giờ của chi nhánh đang chọn | F1, B1 | TCCN TĐK, A2/*a–*c, b3 | `feat(web)` |
| ☑ | F3 | Trang danh sách + chi tiết chi nhánh (giờ nhận khám 7 ngày, "Nghỉ", "Chọn làm chi nhánh của tôi"), tìm kiếm, rỗng A1 + "Xoá bộ lọc" | F2, B1 | TCCN b1–b6 (chi nhánh), A1/4a–4c | `[PHỤ THUỘC nhóm: frame Figma trang chi nhánh]` — trong lúc chờ làm theo bố cục Q8 · `feat(web)` |
| ☑ | F4 | Trang "Chuyên khoa" (`217:2`) + đầu trang "Chi tiết chuyên khoa" (`259:2`: ảnh, tên, mô tả, số bác sĩ, giá từ), mặc định lọc theo chi nhánh đang chọn | F2, B2 | TCCN b1–b6 (chuyên khoa), A1 | `feat(web)` (dòng "giá từ" hiện khi B2 có `giaKhamTu`) |
| ☐ | F5 | Luồng TCBS: nhóm dịch vụ (`444:2` không có thanh bước) → dịch vụ (`445:2`) → danh sách bác sĩ (`446:2` **không** khung giờ) với bộ lọc chi nhánh (điền sẵn chi nhánh đang chọn), tên, giá, đánh giá, sắp xếp; `DoctorCard`; rỗng A1 + quay lại chọn dịch vụ khác; huỷ yêu cầu cũ khi đổi bộ lọc | F1, F2, B3, B5 | TCBS b1–b6, b8 (tóm tắt), A1/6a–6c | `[CHỜ admin B12]` (qua B5) · `[PHỤ THUỘC nhóm: frame hai ô lọc giá/đánh giá]` — trong lúc chờ làm theo Q12 · `feat(web)` |
| ☐ | F6 | "Đội ngũ bác sĩ" `/bac-si` (`260:2`, bỏ dải ngày) + danh sách bác sĩ trong "Chi tiết chuyên khoa", dùng lại `DoctorCard`/bộ lọc của F5 | F5, F4 | TCBS b4–b6, b8 (điểm vào khác — Q11) | `feat(web)` |
| ☐ | F7 | Chi tiết bác sĩ `/bac-si/:id` (`653:2`–`657:2`): tab Giới thiệu, Phòng khám, Hướng dẫn (tĩnh), Đánh giá (chỉ điểm + số lượt — Q16); tab Lịch khám chừa chỗ `[SAU]`; "Nhắn tin" vô hiệu; bỏ "Đặt trước tối đa 7 ngày" | F5, B6 | TCBS b9 | `feat(web)` |
| ☐ | F8 | Trang chủ thật (`257:2`) theo Q21; xoá `pages/home-page.tsx` và trang chủ tạm của F1, giữ hành vi không chuyển người đã đăng nhập | F1, F4, F5, B9 | Điểm vào TCCN b1, TCBS b1 | **Cụm 4 — sau cùng, bỏ trước nếu thiếu thời gian** · `feat(web)` |
| ☐ | F9 | Ô tìm tổng + hộp gợi ý (`258:2`): tự tìm sau 300 ms, huỷ yêu cầu cũ, combobox ARIA, bấm gợi ý mở trang tương ứng | F8, B8 | TCCN b3, TCBS b1 (Q20) | **Cụm 4 — sau cùng, bỏ trước nếu thiếu thời gian** · `feat(web)` |
| ☐ | F10 | Màn hẹp (< 1024 px): thanh điều hướng thu vào ngăn kéo (bẫy focus, Esc đóng); bộ chọn chi nhánh trong ngăn kéo; **cuối cụm 1**, không chặn F1 | F1, F2 | Khung (Q19f) | `feat(web)` |

### 6.5 Nhóm D — Đồng bộ tài liệu (đi cùng PR của task code tương ứng)

2.4 là file Word ở repo `TLCN_CLINIX` ⇒ người dùng sửa ở repo đó, dẫn link trong PR. `docs/database/*`: sửa **cả ba file** cho khớp và thêm dòng lịch sử đầu `clinix.dbml`; chỉ sửa **ghi chú/quy tắc**
(không đổi DDL) thì giữ nguyên COMMENT trong `clinix_mysql.sql` và migration như auth A7 đã làm (để `schema-parity` không lệch). Nếu Q1/Q2/Q3 chọn phương án đổi schema ⇒ là việc của **admin** (chủ bảng), làm trước B1.

| ID | Nội dung | Đi cùng | Từ |
|---|---|---|---|
| D1 | 2.4 TCCN: bỏ/đổi "lọc theo trạng thái" (Q1), mô tả chi nhánh (Q2), "khu vực" = từ khoá trên địa chỉ (Q3), giờ nhận khám hai khoảng + thứ chưa khai báo (Q4), cách lọc chuyên khoa theo chi nhánh (Q5), A2 tính ở trình duyệt + lưu bền + khi nào xin quyền (Q6, Q7), chi tiết chuyên khoa có giá từ và danh sách bác sĩ (Q9). Figma: trang chi nhánh, bộ chọn chi nhánh (Q8, Q19) | B1, B2, F2 | Q1–Q9 |
| D2 | 2.4 TCBS: nghĩa "dịch vụ"/"chuyên khoa" ở b1–b3, b6 (Q10); điểm vào "Đội ngũ bác sĩ" và chi tiết chuyên khoa (Q11); ngữ nghĩa lọc giá/đánh giá + sắp xếp (Q12); Lễ tân thấy như mọi người (Q17); đánh giá nào được tính (Q16). Figma: hai ô lọc (Q12), bỏ "Đặt trước tối đa 7 ngày", ảnh bác sĩ (Q14) | B3, B5 | Q10–Q17 |
| D3 | `clinix_quy_tac_nghiep_vu.md` mục 2: quy tắc mới "Tra cứu công khai" (điều kiện hiển thị chi nhánh/chuyên khoa/dịch vụ/bác sĩ — mục 5.3, đánh giá được tính, giá áp dụng dùng hàm chung); quy tắc 28 bỏ `[đề xuất]` (Q4 — **chờ Trung xác nhận admin Q45**; nếu Q45 khác thì sửa Q4 theo Q45 trước khi làm phần này); dòng lịch sử `clinix.dbml` | B1, B2, B5 | Q4, Q13, Q15, Q16 |
| D4 | `docs/PLAN.md` (tick "Tra cứu chi nhánh / chuyên khoa / bác sĩ" ở Phase 2 khi xong phần không khung giờ, ghi rõ "lịch trống: còn K1–K4"); `docs/TRACKING.md` đúng **một** dòng; `docs/TECH_DEBT.md`: lọc giá trong bộ nhớ (5.4), endpoint công khai chưa giới hạn theo IP (H8, auth X3), LIKE quét toàn bảng, `pageSize=100` cho bộ chọn chi nhánh (Q23), biểu thức ảnh chuyên khoa lặp với admin (3.3). Dòng phát sinh từ task cụ thể ghi ngay trong PR của task đó | X2 | — |

### 6.6 Nhóm K — Phần khung giờ `[SAU]` (không làm đợt này; điều kiện để bắt đầu ghi rõ)

| ID | Việc | Điều kiện bắt đầu | Truy vết |
|---|---|---|---|
| K1 | Endpoint đọc khung giờ (5.6) gọi **bộ tính khung giờ dùng chung** (chủ theo Q18); bỏ khung trùng nghỉ phép đã duyệt; ngày chi nhánh nghỉ ⇒ `ChiNhanhNghi` + thứ; quá giờ ⇒ `HetHan` (`nowVN()`); lịch không hợp lệ ⇒ lỗi; xử lý H12 | `doctor` có `lich_lam_viec` thật; migration `yeu_cau_nghi_phep`; `booking` có giữ chỗ (`DangGiuCho`) và bộ tính khung giờ; Q18 đã chốt | TCBS b7, b11–b14, A3/7a |
| K2 | FE: dải 7 ngày (mặc định "ngày gần nhất" — Q18), khung giờ theo buổi, 4 trạng thái (rõ/mờ/không bấm được), "Bác sĩ không có lịch khám ngày này" / "Chi nhánh nghỉ vào Thứ …" + gợi ý đổi ngày | K1 | TCBS b4–b5 (ngày), b8 (khung giờ), A3/7b |
| K3 | Bấm khung Còn trống ⇒ "Đặt lịch khám" điền sẵn (b10); Khách vãng lai: giữ tạm lựa chọn, chuyển Đăng nhập/Đăng ký, khôi phục sau khi xong (A4) — **cùng cơ chế** với "Trò chuyện với Trợ lý AI" A6 | K2; `booking` có trang đặt lịch; cơ chế lưu tạm lựa chọn đã chốt (dùng chung với Trợ lý AI); auth hỗ trợ quay lại trang sau đăng nhập | TCBS b10, A4 |
| K4 | Bấm khung Đã đặt/Đang giữ chỗ ⇒ popup xác nhận đăng ký chờ cho ca chứa khung đó ⇒ "Đăng ký chờ và phản hồi lời mời" điền sẵn; huỷ ⇒ đóng popup | K2; module `waitlist` | TCBS A2/8a–8c |
| K5 | Đổi `DoctorRatingReader` sang bảng thật (chỉ `bi_an = false`); tab "Đánh giá" danh sách nhận xét (trường do module đánh giá quyết) | Migration `danh_gia_bac_si` (chủ theo Q16) | TCBS b8, b9 (điểm đánh giá) |

### 6.7 Nhóm X — Hoàn tất

| ☐ | ID | Việc | Phụ thuộc |
|---|---|---|---|
| ☐ | X1 | Chạy tay hai use case (phần đợt này) trên `docker compose up --build` với seed đã bổ sung: Khách vãng lai, đã đăng nhập 4 vai trò, token hết hạn, cho/từ chối định vị (trình duyệt thật, `localhost`), dữ liệu ngừng hoạt động, A1; kiểm độ phủ (≥ 70% — `docs/PLAN.md` Phase 4); điền `TRACKING.md` | B1–B7, F1–F7, F10, P2 (+ B8, B9, F8, F9 nếu cụm 4 đã làm; nếu bỏ thì chạy lại X1 phần trang chủ khi làm sau) |
| ☐ | X2 | Tổng kết: D4; rà `AI_USAGE_LOG.md`; chuẩn bị giải thích luồng cho vấn đáp (mục 9.6) | X1 |
| ☐ | X3 | Sau K1–K5: chạy lại toàn bộ test của mục 7 (hợp đồng cũ không đổi — KGI-08) + ca KGI-* | K1–K5 |

### 6.8 Việc nào bắt đầu ngay, việc nào phải chờ

- **Bắt đầu ngay:** **P1** (khung API + kiểm route công khai), **B7** (chân trang), **F1** (khung công khai), rồi B1, B2 (trừ `giaKhamTu`), B3, F2–F4, P2 theo phụ thuộc trong bảng — chạy trên dữ liệu
  seed/fixture. Mọi câu hỏi đã trả lời (03/11/2026); auth (`@Public`, guard, lỗi chuẩn, client, `useAuth`) và bảng danh mục đã có ⇒ **không chờ module nào**.
- **Làm trước, chỉnh sau khi người khác xong:** F3 (frame trang chi nhánh), F5 (frame hai ô lọc) — nhóm bổ sung Figma, trong lúc chờ làm theo Q8, Q12; phần sửa quy tắc 28 của D3 (xác nhận admin Q45);
  P2 cần Đại review; menu tài khoản của F1 đổi sang `useLogout()` khi auth F5 merge.
- **Cụm 4 (B8, B9, F8, F9) làm sau cùng**, bỏ trước nếu thiếu thời gian (quyết định 03/11/2026); trang chủ tạm của F1 vẫn dẫn vào đủ hai use case.
- **Chờ `admin` B12 (`computeSurcharge`):** B4 ⇒ B5, B6, `giaKhamTu` của B2 ⇒ F5–F7. Danh sách bác sĩ **không** chờ màn "Quản lý hồ sơ bác sĩ" (B12/B13/F7 của admin): bảng `bac_si` đã có, seed/fixture
  có bác sĩ; khi admin xong, **nguồn dữ liệu vẫn là bảng `bac_si`** nên không đổi gì ở module này (chỉ có thêm bác sĩ thật).
- **Chờ module khác (`[SAU]`):** K1–K4 (`doctor`, `booking`, `waitlist`), K5 (module đánh giá).

## 7. Test case dự kiến

Loại: **U** = unit, **I** = tích hợp MySQL thật (`*.int-spec.ts`), **E** = e2e qua `configureApp`, **C** = component/FE (Vitest), **M** = chạy tay. `[Qn]` trong ca = phụ thuộc câu trả lời Qn
(đổi câu trả lời thì sửa ca trước khi code). Ca nhóm KGI là `[SAU]`, không tính vào điều kiện hoàn thành đợt này. Ghi kết quả vào `TRACKING.md`.

### 7.1 Tra cứu chi nhánh (TCN)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| TCN-01 | Danh sách không lọc, DB có 3 chi nhánh | 200, đủ 3, sắp theo tên rồi id; mỗi phần tử **đúng** tập khoá `chiNhanhId, ten, diaChi, toaDoLat, toaDoLng`; id/toạ độ là chuỗi, toạ độ NULL ⇒ `null` | TCCN b2 | I |
| TCN-02 | `q` khớp một phần tên, địa chỉ ("quan 3" khớp "Quận 3"), khác hoa/thường | Có kết quả `[Q3]` | TCCN b3–b4 | I |
| TCN-03 | `q` không khớp chi nhánh nào | 200 `{items: [], total: 0}` (không 404) | TCCN A1/4a–4b | I |
| TCN-04 | `q` chứa `%`, `_`, `!` | Được coi là ký tự thường | H8 | I |
| TCN-05 | `q` 101 ký tự; 100 ký tự; chỉ khoảng trắng | 400 `TU_KHOA_KHONG_HOP_LE`; 100 qua; khoảng trắng = không lọc `[Q23]` | TCCN b3 | U |
| TCN-06 | Chi tiết chi nhánh có: thứ hoạt động hai khoảng, thứ chỉ buổi sáng, thứ nghỉ, **một thứ không có dòng** | 7 phần tử thứ 1..7; `hoatDong` `true`/`true`/`false`/`null`; khoảng không tồn tại ⇒ `null` `[Q4]` | TCCN b6 | I |
| TCN-07 | Chi tiết: dịch vụ đang cung cấp, `soBacSi` chỉ đếm bác sĩ công khai | Đúng danh sách dịch vụ; bác sĩ `ChoKichHoat`/`NgungHoatDong` không được đếm `[Q13]` | TCCN b6; H5 | I |
| TCN-08 | Chi tiết: id không tồn tại / `abc` / `-1` / `0` / vượt BIGINT | 404 `KHONG_TIM_THAY` **cùng thân** cho cả năm | H8 | E |
| TCN-09 | Chi nhánh có yêu cầu thay đổi `ChoDuyet` và `DaDuyet` chưa áp dụng (lịch mới khác lịch cũ) | Chi tiết hiện **lịch đang áp dụng**; không có khoá nào về yêu cầu (`coYeuCauDangMo`, `noiDungSau`…) | H2 | I |
| TCN-10 | Phân trang: mặc định 20; `pageSize` 100 qua, 101 ⇒ 400; `page` 0 ⇒ 400; `total` đúng | Đúng `[Q23]` | admin Q42 | I |
| TCN-11 | Nếu Q2 = B: chi tiết có `moTa`; nếu Q1 = B: lọc "đang nhận khám hôm nay" với đồng hồ giả 23:59/00:00 | Đúng `[Q1, Q2]` (chỉ chạy nếu chọn B) | TCCN b2, b6 | I |
| TCN-12 | FE danh sách: đang tải; có kết quả (chi nhánh đang chọn xếp đầu, nhãn "Đang chọn" `[Q5]`); rỗng "Không tìm thấy kết quả phù hợp"; "Xoá bộ lọc" về toàn bộ danh sách; lỗi mạng/timeout/500 có "Thử lại" | Đúng | TCCN b1–b4, A1/4b–4c | C |
| TCN-13 | FE chi tiết: 7 dòng Thứ Hai…Chủ nhật, "Nghỉ" cho ngày nghỉ và thứ chưa khai báo `[Q4]`, hai khoảng giờ; nút "Chọn làm chi nhánh của tôi" cập nhật bộ chọn trên header; 404 ⇒ "Không tìm thấy chi nhánh này." | Đúng | TCCN b5–b6, b3 | C |

### 7.2 Tra cứu chuyên khoa (TCK)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| TCK-01 | DB có chuyên khoa đang hoạt động và `NgungHoatDong` | Chỉ chuyên khoa đang hoạt động; đúng tập khoá `chuyenKhoaId, ten, moTa, anhDaiDien, soBacSi` | TCCN b2; HĐK | I |
| TCK-02 | Ảnh: có `anh_tai_len` (secure_url), chỉ có URL cũ, không có ảnh | `anhDaiDien` = secure_url / URL cũ / `null` (cùng quy tắc admin) | TCCN b6 (hình ảnh) | I |
| TCK-03 | `soBacSi` và "đã có bác sĩ": chuyên khoa chỉ có bác sĩ `ChoKichHoat`; chuyên khoa có bác sĩ công khai | 0 ("Sắp có bác sĩ") / đúng số `[Q13]` | H5 | I |
| TCK-04 | `chiNhanhId` = chi nhánh A | Theo Q5: chỉ chuyên khoa có bác sĩ công khai ở A, `soBacSi` đếm ở A; không truyền ⇒ mọi chuyên khoa `[Q5]` | TCCN b2 (mặc định lọc theo chi nhánh đang chọn) | I |
| TCK-05 | `q` khớp tên/mô tả không dấu ("tim" ⇒ "Tim mạch"); không khớp ⇒ rỗng | Đúng | TCCN b3–b4, A1 | I |
| TCK-06 | Chi tiết: đang hoạt động ⇒ 200; `NgungHoatDong` / không tồn tại / sai dạng ⇒ 404 cùng thân | Đúng | TCCN b5–b6; H8 | E |
| TCK-07 | Chi tiết `giaKhamTu`: bác sĩ giá 300.000 và 350.000 ⇒ 300.000 kèm cọc của dịch vụ đó; không có bác sĩ ⇒ `null` `[Q9]` | Đúng | TCCN b6 (Figma) | I |
| TCK-08 | `chiNhanhId` không tồn tại ⇒ 200 rỗng; `chiNhanhId=abc` ⇒ 400 `BO_LOC_KHONG_HOP_LE` `[Q23]` | Đúng | Biên | E |
| TCK-09 | FE danh sách (`217:2`): "N chuyên khoa, M chuyên khoa hiện đã có bác sĩ", ô tìm, thẻ có ảnh (có `alt`), "N bác sĩ"/"Sắp có bác sĩ", rỗng A1, mặc định theo chi nhánh đang chọn | Đúng | TCCN b1–b4, A1 | C |
| TCK-10 | FE chi tiết (`259:2`): ảnh/không ảnh, tên, mô tả (trống ⇒ ẩn), số bác sĩ, giá từ; 404 ⇒ thông báo | Đúng | TCCN b5–b6 | C |

### 7.3 Chi nhánh đang chọn (CNC)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| CNC-01 | Lần đầu (kho rỗng), cấp quyền, 3 chi nhánh có toạ độ | Chọn đúng chi nhánh gần nhất, lưu `nguon: 'DinhVi'`, header hiện tên | TCCN A2/*a–*b | C |
| CNC-02 | Lần đầu, từ chối quyền | "Toàn quốc"; tải lại trang **không** xin quyền lần nữa `[Q7]` | TCCN A2/*c | C |
| CNC-03 | Hết thời gian chờ / không lấy được vị trí | "Toàn quốc" + thông báo nhỏ | TCCN A2/*c | C |
| CNC-04 | Không chi nhánh nào có toạ độ | "Toàn quốc", **không gọi** Geolocation `[Q6]` | TCCN A2 | C |
| CNC-05 | `nearestBranch`: bỏ qua chi nhánh thiếu toạ độ; khoảng cách bằng nhau ⇒ id nhỏ hơn; một chi nhánh; điểm gần kinh tuyến 180 | Đúng | TCCN A2/*b | U |
| CNC-06 | Kho đã có lựa chọn (người dùng tự chọn) | Không xin quyền, dùng lựa chọn đã lưu | TCCN TĐK | C |
| CNC-07 | Lựa chọn đã lưu trỏ tới chi nhánh không còn; `localStorage` ném lỗi khi đọc/ghi | Về "Toàn quốc", trang vẫn hoạt động | H10 | C |
| CNC-08 | Đổi bộ lọc chi nhánh ở trang chi nhánh/chuyên khoa | Header đổi theo; trang khác mở sau đó mặc định chi nhánh mới | TCCN b3 | C |
| CNC-09 | Đổi bộ lọc chi nhánh ở danh sách bác sĩ (TCBS b5) | Danh sách đổi, giá trị chung **không** đổi `[Q7d]` | TCBS b5 | C |
| CNC-10 | Bộ chọn trên header: chọn chi nhánh, chọn "Toàn quốc", "Dùng vị trí của tôi"; dùng bàn phím, Esc đóng, focus quay lại nút | Đúng | TCCN A2/*c | C |
| CNC-11 | Trình duyệt không có `navigator.geolocation` | "Toàn quốc" | H11 | C |
| CNC-12 | Theo dõi mọi yêu cầu mạng trong CNC-01 | Không yêu cầu nào chứa toạ độ người dùng | H9 | C |
| CNC-13 | Đăng nhập rồi đăng xuất | Lựa chọn giữ nguyên `[Q7e]` | TCCN TĐK | C |
| CNC-14 | Trình duyệt thật trên `localhost`: cho phép và từ chối định vị | Đúng như CNC-01/02 | TCCN A2 | M |

### 7.4 Tra cứu bác sĩ (TBS)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| TBS-01 | Nhóm dịch vụ: nhóm có 2 dịch vụ đang cung cấp, nhóm có dịch vụ nhưng không chi nhánh nào cung cấp, nhóm rỗng | `soDichVu`, `giaTu` = giá mặc định nhỏ nhất; hai nhóm sau `sapTrienKhai: true`, `giaTu: null`; sắp `thu_tu_hien_thi` rồi tên `[Q10]` | TCBS b1 | I |
| TBS-02 | Dịch vụ của một nhóm, có và không có `chiNhanhId` | Chỉ dịch vụ đang cung cấp (ở chi nhánh đó nếu có); đúng tập khoá | TCBS b2 `[Q10]` | I |
| TBS-03 | `dichVuKhamId` (và `chuyenKhoaId` nếu Q10 = B) | Chỉ bác sĩ nhận dịch vụ đó (`bac_si.dich_vu_kham_id`) `[Q10]` | TCBS b6 | I |
| TBS-04 | `chiNhanhId` có / không | Chỉ bác sĩ của chi nhánh đó / mọi chi nhánh ("Toàn quốc") | TCBS b4–b6 | I |
| TBS-05 | `q` một phần họ tên không dấu; `q` = tên chuyên khoa | Có kết quả `[Q23]` | TCBS b4–b6 (tên bác sĩ) | I |
| TBS-06 | Giá: `giaTu` = đúng giá bác sĩ (biên đóng), `giaDen` = đúng giá; `giaTu > giaDen`; âm; số lẻ `100.5`; chữ | Biên được tính; còn lại 400 `BO_LOC_KHONG_HOP_LE` `[Q12]` | TCBS b4–b6 (khoảng giá) | I/U |
| TBS-07 | Đánh giá: `diemTu` 4 với bác sĩ 4.0, 3.9, chưa có đánh giá; `diemTu` 0, 5.1 | 4.0 có; 3.9 và chưa có đánh giá bị loại; ngoài miền ⇒ 400 `[Q12, Q16]` | TCBS b4–b6 (mức đánh giá) | I/U |
| TBS-08 | **Giá áp dụng** qua hàm chung: không có quy tắc phụ phí; quy tắc đúng chức danh đang áp dụng; mốc cao `ap_dung = false` (rơi mốc thấp); quy tắc khác chức danh; 0 năm với mốc 0 | `giaKham` = `giaMacDinh` + kết quả **của hàm chung** (so trực tiếp với lời gọi hàm, không tự tính lại); `phuPhi` đúng `[Q15]` | TCBS b8 (giá); H3 | I |
| TBS-09 | Tập khoá mỗi phần tử danh sách và chi tiết | **Chính xác** như mục 5.5 `[Q14]`; không có email, SĐT, ngày sinh, giới tính, địa chỉ cá nhân, trạng thái, học vị, ảnh | H1 | E |
| TBS-10 | Không bác sĩ nào khớp | 200 `{items: [], total: 0}` | TCBS A1/6a–6b | I |
| TBS-11 | Phân trang sau lọc trong bộ nhớ: 25 bác sĩ khớp, trang 2 cỡ 20 | 5 phần tử, `total` 25; thứ tự ổn định khi trùng kinh nghiệm và tên | 5.4 | I |
| TBS-12 | `doctor-list.rules`: lọc giá/điểm, các kiểu sắp, cắt trang, so tiền bằng số nguyên đồng | Đúng `[Q12]` | 5.4; H4 | U |
| TBS-13 | Chi tiết: mô tả chuyên môn (NULL ⇒ `null`), giờ nhận khám chi nhánh, dịch vụ, giá, đánh giá; bác sĩ không công khai / không có / sai dạng ⇒ 404 cùng thân | Đúng | TCBS b9 | E |
| TBS-14 | Đánh giá khi chưa có bảng | Mọi bác sĩ `{diemTrungBinh: null, soDanhGia: 0}` `[Q16]` | TCBS b8 (điểm) | I |
| TBS-15 | `dichVuKhamId` không tồn tại ⇒ 200 rỗng; `sapXep` ngoài danh sách ⇒ 400 | Đúng | Biên | E |
| TBS-16 | FE luồng: chọn nhóm (`444:2`) ⇒ dịch vụ (`445:2`) ⇒ danh sách bác sĩ; nhóm "Sắp triển khai" không bấm được; "Chọn lại dịch vụ" quay về b3 | Đúng `[Q10]` | TCBS b1–b3, A1/6c | C |
| TBS-17 | FE bộ lọc: chi nhánh điền sẵn chi nhánh đang chọn; nhập tên/giá/đánh giá ⇒ gọi lại API, huỷ yêu cầu cũ (kết quả cũ về sau không đè); lỗi ô giá | Đúng | TCBS b4–b6 | C |
| TBS-18 | FE rỗng: "Không tìm thấy bác sĩ phù hợp" + gợi ý đổi bộ lọc / chọn dịch vụ khác | Đúng | TCBS A1/6b–6c | C |
| TBS-19 | FE thẻ bác sĩ: chức danh "BS.CKII", "12 năm kinh nghiệm", chi nhánh, "350.000đ", cọc/"Không cần cọc", điểm hoặc "Chưa có đánh giá", ảnh chữ viết tắt `[Q14]`; **không** có khung giờ; "Nhắn tin" vô hiệu | Đúng | TCBS b8 (tóm tắt) | C |
| TBS-20 | FE chi tiết bác sĩ: các tab Giới thiệu/Phòng khám/Hướng dẫn/Đánh giá; tab Lịch khám chừa chỗ; không có "Đặt trước tối đa 7 ngày" | Đúng `[Q14]` | TCBS b9 | C |
| TBS-21 | FE "Đội ngũ bác sĩ" và danh sách trong chi tiết chuyên khoa dùng cùng thẻ/bộ lọc, không bắt chọn dịch vụ | Đúng `[Q11]` | TCBS b4–b6 | C |
| TBS-22 | FE đang tải; mất mạng; timeout; 500 | `loading-state`/`error-state`/`offline-banner`, giữ bộ lọc đã chọn | HĐK thất bại | C |

### 7.5 Chỉ lộ dữ liệu công khai (AN)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| AN-01 | Chuyên khoa `NgungHoatDong` có 2 bác sĩ | Không có trong danh sách chuyên khoa, gợi ý, con số trang chủ; chi tiết 404; bác sĩ của nó không có trong danh sách/chi tiết/đếm `[Q13]` | HĐK "Quản lý chuyên khoa"; prompt | I |
| AN-02 | Bác sĩ `ChoKichHoat` và `NgungHoatDong` | Không xuất hiện ở mọi endpoint (danh sách, chi tiết 404, đếm, `giaKhamTu`, gợi ý) `[Q13]` | admin Q28 | I |
| AN-03 | Dịch vụ không còn ở chi nhánh nào; bác sĩ có cặp chi nhánh–dịch vụ đã bị bỏ | Dịch vụ ẩn; bác sĩ ẩn `[Q10, Q13]` | Quy tắc 1 | I |
| AN-04 | DB chưa có dữ liệu danh mục nào (Quản trị viên chưa tạo) | Mọi danh sách 200 rỗng, con số 0, `clinic-info` mọi trường `null`; FE hiện trạng thái rỗng, không lỗi | TCCN, TCBS TĐK ("chưa có dữ liệu thì danh sách trống, không phải lỗi") | I/C |
| AN-05 | Bác sĩ mẫu có email/SĐT/ngày sinh/địa chỉ đặc trưng; gọi **mọi** endpoint công khai | Không chuỗi nào trong thân phản hồi chứa các giá trị đó; không có khoá `email`, `soDienThoai`, `ngaySinh`, `gioiTinh`, `diaChi` (của bác sĩ), `matKhau…`, `trangThai` (tài khoản), `hocVi` | H1 | E |
| AN-06 | Quản trị viên chuyển chuyên khoa sang `NgungHoatDong` / khoá bác sĩ giữa hai lần gọi | Lần gọi sau đã ẩn (không cache) | 5.2 | I |

### 7.6 Truy cập công khai (CC)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| CC-01 | Gọi mọi endpoint không có `Authorization` | 200 | TCCN, TCBS TĐK "không yêu cầu đăng nhập" | E |
| CC-02 | Gọi kèm access token hợp lệ của BN, BS, LT, QTV (cả hai phạm vi) | Thân phản hồi **giống hệt** khi không token `[Q17]` | TCBS tác nhân (Lễ tân); MT "không phân biệt theo vai trò" | E |
| CC-03 | Kèm token hết hạn, sai chữ ký, sai định dạng, phiên đã thu hồi, tài khoản bị khoá | 200, thân giống hệt CC-01 (không 401) | Mục 2 (hành vi `@Public`) | E |
| CC-04 | Quét mọi route của `SearchModule` | Route nào cũng `@Public`, đường dẫn bắt đầu `public/`, không `@Roles`/`@CurrentUser`, chỉ phương thức GET | 5.2 | U |
| CC-05 | `POST`/`PUT`/`DELETE` vào các đường dẫn `/public/*` | 404 (không có route ghi) | HĐK "không có thay đổi dữ liệu" | E |
| CC-06 | Tham số lạ (`?trangThai=NgungHoatDong`, `?email=`) | 400 `TRUONG_KHONG_DUOC_PHEP` (không dùng được để lấy dữ liệu ẩn) `[Q23]` | H1 | E |
| CC-07 | Chạy một loạt tìm kiếm + xem chi tiết | Số hàng + checksum các bảng liên quan không đổi | HĐK "không có thay đổi dữ liệu" | I |
| CC-08 | FE: lời gọi công khai khi đang đăng nhập và khi access token đã hết hạn | Không gắn `Authorization`, không gọi `/auth/refresh` | H7 | C |

### 7.7 Khung công khai (KC)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| KC-01 | Header: thứ tự mục như Figma; mục đang mở có `aria-current="page"`; mục chưa có trang là nút vô hiệu "Chưa được triển khai" | Đúng `[Q19c]` | Khung | C |
| KC-02 | Khách vãng lai: "Đăng nhập" ⇒ `/dang-nhap`. Đã đăng nhập: nút họ tên ⇒ "Trang của tôi" (`homePathFor`) và "Đăng xuất" (qua `useLogout()` của auth F5, hoặc `logout()` khi F5 chưa merge; gọi một lần, không hỏi) | Đúng `[Q19b]` | Khung; auth G5 | C |
| KC-03 | Người đã đăng nhập mở `/` | Không bị chuyển đi (giữ hành vi `HomePage` cũ) | Khung; TCCN tác nhân Bệnh nhân | C |
| KC-04 | Nút "Đặt lịch khám" | Mở luồng chọn nhóm dịch vụ (TCBS b1) `[Q19d]` | TCBS b1 | C |
| KC-05 | Chân trang: liên hệ từ `/public/clinic-info` (trường `null` ⇒ ẩn dòng), danh sách chuyên khoa từ API, giờ của chi nhánh đang chọn / ẩn khi "Toàn quốc"; API lỗi ⇒ chân trang vẫn hiện phần tĩnh | Đúng `[Q19e]` | Khung | C |
| KC-06 | Trang auth (`/dang-nhap`…), `/admin`, `/benh-nhan`, `/le-tan`, `/bac-si-portal` | **Không** có header/footer công khai; hành vi cũ giữ nguyên (`routes.test.tsx` vẫn xanh) | Ràng buộc nhóm 03/11/2026 | C |
| KC-07 | Mất mạng trên trang công khai | `OfflineBanner` vẫn hiện | Khung | C |
| KC-08 | Màn hẹp (< 1024 px) — **F10** | Header thu vào nút menu; ngăn kéo bẫy focus, Esc đóng, chọn mục thì đóng; có bộ chọn chi nhánh `[Q19f]` | Khung | C |
| KC-09 | Bàn phím: Tab qua header, bộ chọn, bộ lọc; focus thấy được; tương phản chữ/viền | Đạt WCAG 2.2 AA (ADR 0004) | ADR 0004 | C/M |
| KC-10 | Đường dẫn không tồn tại dưới khung công khai | Trang 404 có header/footer | Khung | C |

### 7.8 Trang chủ và tìm kiếm tổng (TCH) — cụm 4, sau cùng; bỏ cùng cụm 4 nếu thiếu thời gian

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| TCH-01 | `/public/overview` với dữ liệu có phần tử ngừng/ẩn | Ba con số bằng đúng số phần tử của các danh sách công khai tương ứng (cùng điều kiện — H5) | Q21 | I |
| TCH-02 | FE trang chủ: các khối theo Q21, "Sắp triển khai", "Sắp có bác sĩ", "Xem tất cả" mở đúng trang; khối "Cẩm nang" ẩn | Đúng | Q21 | C |
| TCH-03 | `/public/suggestions?q=tim` | Nhóm chuyên khoa có "Tim mạch"; mỗi nhóm ≤ 5; không có dữ liệu ẩn (AN-01/02) | Q20 | I |
| TCH-04 | `q` rỗng / 101 ký tự | Mảng rỗng / 400 | Q20 | U |
| TCH-05 | FE ô tìm tổng: gõ nhanh ⇒ một yêu cầu sau 300 ms, huỷ yêu cầu cũ; phím lên/xuống/Enter/Esc (combobox ARIA); bấm gợi ý mở trang tương ứng; không có gợi ý ⇒ "Không tìm thấy kết quả phù hợp" | Đúng | Q20 | C |

### 7.9 Bảo mật dùng chung (BMS)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| BMS-01 | Bắt log khi gọi các endpoint (cả nhánh lỗi 500) | Không có `q`, tham số lọc, token `[đề xuất]` | 5.2 | E |
| BMS-02 | Lỗi DB ngoài dự kiến | 500 `LOI_HE_THONG` + `requestId`, không SQL/giá trị trong phản hồi | auth P5 | E |
| BMS-03 | Chuỗi kiểu SQL injection trong `q`, `sapXep` | `q` là ký tự thường; `sapXep` ngoài danh sách trắng ⇒ 400 | H8 | I |
| BMS-04 | `gitleaks`, `.env.example` không giá trị thật (module không thêm biến môi trường) | Xanh | CONTRIBUTING 5 | M |

### 7.10 Khung giờ (KGI) — `[SAU]`, ghi trước để K1–K4 không đổi hợp đồng

| ID | Kịch bản | Mong đợi | Phủ |
|---|---|---|---|
| KGI-01 | Ca 07:30–12:00, dịch vụ 50 phút | 07:30–08:20, 08:20–09:10, …; phần dư cuối ca không sinh khung | TCBS b11 |
| KGI-02 | Khung `DaDat`, `DangGiuCho`, đã qua giờ (`nowVN()` giả) | Trả đủ 4 trạng thái; quá giờ ⇒ `HetHan` | TCBS b12–b14 |
| KGI-03 | Nghỉ phép đã duyệt cả ngày / theo ca; nghỉ phép chờ duyệt | Khung trùng nghỉ đã duyệt không hiện; chờ duyệt không ảnh hưởng | TCBS b7, b12 |
| KGI-04 | Chi nhánh nghỉ / thứ chưa khai báo / không có lịch làm việc | `ChiNhanhNghi` + thứ / như nghỉ `[Q4]` / `KhongCoLich`; FE "Chi nhánh nghỉ vào Thứ …" / "Bác sĩ không có lịch khám ngày này" | TCBS A3/7a–7b |
| KGI-05 | Dữ liệu lịch làm việc không hợp lệ | Lỗi có mã để nơi gọi xử lý | TCBS b14 |
| KGI-06 | Bấm Còn trống (đã đăng nhập / Khách vãng lai) | Sang "Đặt lịch khám" điền sẵn / đăng nhập rồi khôi phục lựa chọn | TCBS b10, A4 |
| KGI-07 | Bấm Đã đặt/Đang giữ chỗ; xác nhận / huỷ popup | Sang đăng ký chờ điền sẵn bác sĩ/ngày/ca / đóng popup | TCBS A2 |
| KGI-08 | Chạy lại toàn bộ ca TBS-*, TCK-*, CC-* sau khi thêm khung giờ | Vẫn xanh (hợp đồng cũ không đổi) | Mục 5.6 |

## 8. Gom cụm (nhóm đồng ý 03/11/2026; cụm 4 xếp sau cùng)

**Người làm: Trung (`junUTE`)** — full-stack trọn module; mỗi task một PR. Thứ tự theo phụ thuộc thật; bảng xếp theo **thứ tự làm**:

| Thứ tự | Cụm | Task (thứ tự PR) | Điều kiện bắt đầu | Kết quả nhìn thấy được |
|---|---|---|---|---|
| 1 | 1 — Khung | **P1**, **B7**, **F1**, rồi **F10** (cuối cụm) | Ngay | Trang công khai có header/footer thật, trang chủ tạm dẫn vào các use case; `patient`/`booking` cắm trang được; API có khung kiểm route công khai |
| 2 | 2 — Chi nhánh, chuyên khoa | **B1 → F2 → F3**, **B2 → F4** | Cụm 1 (P1, F1) | TCCN xong (trừ `giaKhamTu` nếu B4 chưa có) |
| 3 | 3 — Bác sĩ | **B3**, **B4 → B5 → B6**, **F5 → F6 → F7** | P1; admin B12 cho B4 | TCBS b1–b6, b8 (tóm tắt), b9, A1 xong |
| song song | Dữ liệu mẫu | **P2** (Trung viết, Đại review) | P1 | Seed đủ cho demo và X1 |
| 4 | Hoàn tất | **X1 → X2** | Cụm 1–3, P2 | Demo được hai use case (phần đợt này) |
| 5 | 4 — Trang chủ (**sau cùng, bỏ trước nếu thiếu thời gian**) | **B9 → F8**, **B8 → F9** | Cụm 2–3 | Trang chủ thật, ô tìm tổng; làm xong thì chạy lại X1 phần trang chủ |
| — | `[SAU]` | K1 → K2 → K3, K4, K5; X3 | Điều kiện mục 6.6 | Khung giờ, chuyển sang đặt lịch, đăng ký chờ, đánh giá thật |

Nếu admin B12 chậm: làm hết cụm 2, B3 và P2 trước; cụm 3 chỉ còn B4–B6, F5–F7 chờ. Nếu cần người khác hỗ trợ, phần tách gọn nhất là cụm 4 (ít file chung với cụm 2–3) — nhưng người làm chính
vẫn phải giải thích được toàn module khi vấn đáp.

## 9. Quy trình bắt buộc cho mỗi PR của module

1. Nhánh `feat/search-<việc>` do thành viên tạo; tiêu đề PR theo Conventional Commits, scope `search` (hạ tầng: `api`/`web`/`db`/`docs`), ví dụ `feat(search): thêm tra cứu công khai chi nhánh`.
   Commit/push/merge **do thành viên tự làm**; không có dòng `Co-Authored-By` hay chữ ký AI (CONTRIBUTING 9).
2. Dùng AI ⇒ ghi `AI_USAGE_LOG.md` bảng 1 **ngay** (công cụ ghi đúng tên kèm model); lỗi AI phát hiện ⇒ bảng 2 + `AI-BUG-nnn` trong commit sửa. **Lần lập kế hoạch này cũng cần một dòng.**
3. Đổi thiết kế/DB ⇒ cập nhật tài liệu trong cùng PR (task `[ĐỒNG BỘ TL]`, mục 6.5); `docs/database/*` sửa cả ba file; 2.4/Figma thì nhắc người dùng làm.
4. Sửa file của module `auth`/`patient` (`[ĐỤNG auth]`, `[ĐỤNG patient]`) hoặc file dùng chung (`router/*`, `docs/database/*`, `package.json`) ⇒ **báo Đại** trước, `git pull` bản mới trước khi bắt đầu.
   File của `admin` (`[ĐỤNG admin]`, kể cả `database/seeds/*`) cùng người làm nên không phải báo, nhưng PR vẫn cần Đại review.
5. Chạy thật `npm run lint`, `build`, `test`, `test:int`, `test:e2e`, `dup` (api) và `lint`, `test`, `build` (web), báo đúng kết quả; cập nhật `TRACKING.md` sau mỗi task; khi cả module xong thêm **đúng một dòng** vào `docs/TRACKING.md`.
6. Tự giải thích được mọi dòng — đặc biệt: vì sao route `@Public` không phụ thuộc token và Lễ tân thấy như khách (mục 2, Q17); vì sao "điều kiện công khai" chỉ có một chỗ (H5); vì sao giá lọc trong bộ nhớ
   mà không viết công thức trong SQL (H3, 5.4); vì sao tiền không dùng số thực (H4); vì sao chi nhánh gần nhất tính ở trình duyệt (H9); vì sao phần khung giờ cắm thêm được mà không đổi hợp đồng (5.6).

## 10. Điều kiện hoàn thành module (đợt này, chưa gồm `[SAU]`)

- Mọi test case ở mục 7.1–7.9 (trừ ca của phương án không được chọn; mục 7.8 chỉ khi cụm 4 đã làm) đã chạy, kết quả ghi trong `TRACKING.md`, không còn Fail.
- Không còn thẻ `[CHỜ …]` (task hoãn/không làm theo quyết định nhóm ghi rõ ở `TRACKING.md` mục 3 và `TECH_DEBT`); mọi `[ĐỒNG BỘ TL]` đã làm; 2.4, `docs/database/*` và Figma khớp với mã.
- Khung công khai đã thay trang giữ chỗ; người làm `patient`/`booking` đã được báo cách cắm trang và cách đọc "chi nhánh đang chọn".
- `docker compose up --build` chạy; X1 đạt. Lint/build/test xanh; không secret; `AI_USAGE_LOG.md` đầy đủ; K1–K5 ghi là việc còn lại kèm điều kiện ở mục 6.6.
