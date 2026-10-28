# Kế hoạch module `admin`

> **Trạng thái: bản nháp 3 (25/10/2026) — đã chốt Q1–Q48, trừ phần còn lại của Q45.** Issue P3 #47 chốt migration các bảng vận hành, trạng thái/cột quá hạn và email BoQua; Trung xác nhận dùng toàn bộ tên audit PLAN 5.10 ngày 27/10/2026. Mã sự kiện thông báo kèm phiên bản vẫn là đề xuất cho service thông báo.
> Phần đầu của module `admin` = 8 use case: Quản lý chi nhánh / cơ sở, Quản lý chuyên khoa, Quản lý loại dịch vụ khám, Quản lý hồ sơ bác sĩ, Tạo tài khoản nhân sự, Quản lý tài khoản người dùng, Cập nhật thông tin phòng khám, Cập nhật cấu hình hệ thống.
> Kế hoạch do AI (Claude) lập theo [`docs/FEATURE_PLANNING_PROMPT.md`](../../FEATURE_PLANNING_PROMPT.md) và `Prompt_Admin_2026-10-25.md` →
> **ghi `AI_USAGE_LOG.md` (bảng 1) cho lần này và cho mọi lần dùng AI sinh code theo kế hoạch** (kế hoạch này không tự ghi vì chỉ được tạo đúng 2 file).
> Tiến độ thật và quyết định đã chốt ghi ở [`TRACKING.md`](TRACKING.md) cùng thư mục.
> **Module `auth` chưa code xong**: kế hoạch này coi hạ tầng và quyết định của [`auth`](../auth/PLAN.md) là nền *sẽ có* và chỉ tham chiếu theo mã task của auth (ví dụ "auth A4"). Việc nào cần thứ auth chưa có được nêu rõ ở cột "Phụ thuộc".
> Đã đối chiếu Figma CLINIX ngày 25/10/2026: liệt kê tên toàn bộ frame cấp 1 của trang "Figma Design CLINIX" (252 frame) và xem ảnh 10 frame Admin (mục 4.4). **Chưa** đọc chi tiết từng trạng thái; chỗ nào theo *tên frame* chưa thấy trạng thái thì ghi ở 4.4, không tự thiết kế.

## 0. Quy ước đọc

- Tên use case viết tắt trong cột "Truy vết": **CN** = Quản lý chi nhánh / cơ sở, **CK** = Quản lý chuyên khoa, **DV** = Quản lý loại dịch vụ khám,
  **BS** = Quản lý hồ sơ bác sĩ, **NS** = Tạo tài khoản nhân sự, **TK** = Quản lý tài khoản người dùng, **PK** = Cập nhật thông tin phòng khám,
  **CH** = Cập nhật cấu hình hệ thống. `b4` = bước (4); `A2/4c` = luồng thay thế A2, mục 4c. Số bước/luồng lấy đúng 2.4 bản Drive 25/10/2026 (đã dán trong prompt).
- "auth Qn", "auth A4"… = quyết định / task trong `docs/features/auth/`. "Qn" không kèm chữ "auth" = câu hỏi của module `admin` (mục 4.2).
- Nguồn đúng khi lệch: **schema DB (`docs/database/`, bản 20/10/2026) để code**; chỗ lệch với 2.4 và Figma ở mục 3.4 — **không tự chọn một bên**.
- Thẻ: `[ĐỒNG BỘ TL]` = task phải cập nhật tài liệu (2.4, `docs/database/*`, sơ đồ, Figma) trong **cùng PR** (CONTRIBUTING mục 7);
  `[TIỀN ĐỀ]` = hạ tầng mà module cần; `[CHỜ Qn]` = bị chặn bởi câu hỏi chưa trả lời.
- Cột "Bắt đầu": **NGAY** = chỉ cần nền của auth (P1/P3, đã mô tả trong kế hoạch auth), không cần chờ tính năng auth; **SOẠN TRƯỚC** = viết được logic thuần + unit test, ghép controller sau;
  **SAU auth Xn / SAU task** = phải chờ.
- Mỗi task = **một PR** nhỏ, tiêu đề Conventional Commits, scope `admin` (hạ tầng: `rbac`/`audit`/`notification`/`api`/`web`/`db`/`docs`). Test đặt cạnh mã; mỗi test ghi mã test case ở mục 7.
- Mã định danh trong code bằng tiếng Anh (`branches`, `specialties`…); mã lỗi nghiệp vụ ổn định dùng tiếng Việt không dấu viết hoa như auth (`TEN_CHUYEN_KHOA_TRUNG`…).

## 1. Phạm vi

**Làm:** 8 use case ở trên, cho cả Quản trị viên phạm vi **Toàn hệ thống** và phạm vi **Chi nhánh** (quyền khác nhau theo từng use case).

**Làm kèm (bổ trợ, vì use case không chạy được nếu thiếu):**
- Cơ chế **phạm vi dữ liệu theo chi nhánh** dùng chung (mục 5.2) — module đầu tiên cần.
- Phần ghi **Audit Log tối thiểu** (`AuditService`, chỉ ghi, không có màn xem) — Q39 đã chốt: làm ngay, kèm **mở rộng enum** nhật ký (mục 5.10).
- `SystemConfigService` (đọc cấu hình, từ chối khi chưa cấu hình — CH A3, quy tắc service 35) để các module khác dùng lại.
- Trang **`/kich-hoat`** và API kích hoạt tài khoản nhân sự (auth PLAN mục 1 đã giao cho module này): "Link không hợp lệ", "Kích hoạt thành công".
- Công việc nền tối thiểu cho thông báo/email tới bệnh nhân khi duyệt yêu cầu thay đổi chi nhánh (CN b9, A4) — Q9 đã chốt (kể cả báo người đề xuất khi duyệt/từ chối/rút/hủy).
- Tác vụ định kỳ **áp dụng yêu cầu thay đổi chi nhánh tại thời điểm có hiệu lực** (CN b10).
- Các endpoint tra cứu phục vụ biểu mẫu (danh sách chi nhánh/chuyên khoa/dịch vụ theo chi nhánh), dữ liệu mẫu (seed) và script tạo Admin Toàn hệ thống đầu tiên — Q30, Q44 đã chốt.

**Không làm (module/use case khác — kể cả khi Figma đã có frame):**
- "Xem nhật ký hành động (Audit Log)" (màn xem; nút "Xem nhật ký" ở trang Nhân sự là của use case đó). Riêng tab "Lịch sử thay đổi" của Cài đặt hệ thống: Q37 đã chốt — làm ở mức đọc audit `CapNhatCauHinh`.
- "Cấu hình chính sách đặt cọc / hủy / hoàn tiền" (`dich_vu_kham.muc_dat_coc`, `moc_hoan_tien`) — frame "Admin - Đặt cọc và hoàn tiền".
- Cấu hình bảng **phụ phí bác sĩ** (`phu_phi_bac_si`) — frame "Admin - Phụ phí bác sĩ" **không nằm trong 8 use case**; module này chỉ **đọc** để hiển thị phụ phí hiện hành (Q21).
- "Điều chỉnh số lần no-show" (UC 52 trong Figma), "Trung tâm thông báo" (màn hình), "Gửi email thông báo theo sự kiện" (đầy đủ), lịch làm việc bác sĩ, đặt lịch, ví/thanh toán/rút tiền, bài viết, kiểm duyệt đánh giá, thống kê, tra cứu công khai chi nhánh/chuyên khoa/bác sĩ.
- Đổi mật khẩu, đăng xuất, "Thông tin cá nhân" (auth / module khác). Trang giữ chỗ Quản trị viên của auth F1 được thay bằng trang Admin ở task F1 (admin).

## 2. Hiện trạng repo (đã kiểm tra 25/10/2026)

- `apps/api`, `apps/web` **chỉ có `Dockerfile`** (và `nginx.conf` ở web) — chưa có `package.json`, chưa có mã. Mọi thứ bên dưới là nền *sẽ có* theo kế hoạch auth.
- `docs/features/` chỉ có `auth/` (PLAN + TRACKING). Auth đã chốt Q1–Q11, S1–S7, G1–G5, N1–N10; **chưa có task nào tick**.
- `commitlint.config.cjs` đã có scope `admin`, `rbac`, `audit`, `notification`, `search`, `doctor`, `booking`… → không cần thêm scope.
- `git status`: `AI_USAGE_LOG.md` đang sửa dở (`M`) — kiểm tra nội dung đó trước khi thêm dòng ghi lần lập kế hoạch này, để không ghi trùng hoặc lẫn vào PR khác.
- `docs/database/` bản 20/10/2026 (44 bảng, 27 enum, 37 CHECK): **không có dòng seed nào** cho `cau_hinh_he_thong`; `thong_tin_phong_kham`, các bảng danh mục đều rỗng; `phu_phi_bac_si` "không có dòng nào tạo sẵn".
- Chưa có module `audit`, `notification`, `rbac`, `booking`, `schedule`. Các bảng `lich_hen`, `khung_gio`, `lich_lam_viec`, `ho_so_nguoi_than`, `thong_bao`, `email_thong_bao`, `nhat_ky_hanh_dong` **chưa có migration** (kế hoạch auth P3 chỉ tạo 5 bảng của auth) → Q41.
- Figma: file `1OsOfwD5myNNRv7FPCD9YC`, trang "Figma Design CLINIX" (63:2). Có đủ nhóm frame "Admin - …" (toàn hệ thống), "Admin chi nhánh - …", "Kích hoạt tài khoản" (+2 trạng thái), 3 email liên quan (mục 4.4).

## 3. Phân tích ảnh hưởng

### 3.1 Bảng/cột `admin` chạm tới (đọc từ `docs/database/`, bản 20/10/2026)

| Bảng | Cột / ràng buộc quan trọng | Use case | Ghi/đọc |
|---|---|---|---|
| `chi_nhanh` | `ten` ≤100 NOT NULL, `dia_chi` ≤255 NOT NULL, `toa_do_lat/lng decimal(10,7)` NULL được | CN, BS, NS, TK | ghi |
| `chi_nhanh_lich_hoat_dong` | PK `(chi_nhanh_id, thu_trong_tuan)`; `hoat_dong` + **4 cột giờ (hai khoảng sáng/chiều)**; CHECK `chk_lich_hoat_dong_thu/_khoang/_khong_chong/_ngay`. DB **không** ép đủ 7 dòng | CN | ghi |
| `chi_nhanh_dich_vu_kham` | PK `(chi_nhanh_id, dich_vu_kham_id)`; cặp (chi nhánh, dịch vụ) của bác sĩ và lịch hẹn phải có ở đây (service kiểm) | CN, BS, NS | ghi |
| `yeu_cau_thay_doi_chi_nhanh`, `yeu_cau_thay_doi_chi_nhanh_lich_hen` | JSON `noi_dung_truoc/sau` (6 khóa mỗi thứ); `chk_yc_chi_nhanh_noi_dung/_xu_ly` (`hieu_luc_tu >= thoi_diem_duyet + so_ngay_bao_truoc`, TuChoi bắt buộc `ly_do_tu_choi`); PK `(yêu cầu, lịch hẹn)` | CN | ghi |
| `chuyen_khoa` | `ten` NOT NULL **không UNIQUE**; `anh_dai_dien varchar(255)`; `trang_thai_hoat_dong` | CK, BS, NS | ghi |
| `nhom_dich_vu` | `ten` UNIQUE; `thu_tu_hien_thi` int | DV | ghi |
| `dich_vu_kham` | `nhom_dich_vu_id` FK, `ten`, `thoi_luong int` (phút), `gia_mac_dinh decimal(12,2)`; `muc_dat_coc` (use case khác); **không có cột trạng thái** | DV, BS, CN | ghi |
| `moc_hoan_tien` | không đụng; FK → `dich_vu_kham` (chặn xoá dịch vụ nếu có dòng) | — | — |
| `phu_phi_bac_si` | **chỉ đọc** để tính phụ phí hiện hành (truy vấn mẫu cuối `clinix_mysql.sql`) | BS | đọc |
| `bac_si` | `chuyen_khoa_id`, `chi_nhanh_id`, `dich_vu_kham_id` NOT NULL; `so_nam_kinh_nghiem`≥0; `hoc_vi` + `chuc_danh` (CHECK `chk_bac_si_chuc_danh_hoc_vi`); `mo_ta_chuyen_mon` NULL được. ENUM NOT NULL tự lấy giá trị đầu (`BS`) nếu bỏ trống → **service phải bắt buộc nhập** | BS, NS, TK | ghi |
| `le_tan` | `chi_nhanh_id` NOT NULL | NS, TK | ghi |
| `quan_tri_vien` | `pham_vi_quan_tri` + `chi_nhanh_id` (CHECK `chk_qtv_pham_vi`) — **nguồn của phạm vi quản trị** | NS, TK, mọi UC (scope) | ghi/đọc |
| `tai_khoan` | `email` UNIQUE (`utf8mb4_unicode_ci`: không phân biệt hoa/thường và dấu); `so_dien_thoai` **NOT NULL**; `mat_khau_bam` NULL khi `ChoKichHoat`; `trang_thai`; `da_xac_minh_email`; `loai_tai_khoan`; CHECK `chk_tai_khoan_mat_khau`, `chk_tai_khoan_cho_kich_hoat_nhan_su` | NS, TK | ghi |
| `benh_nhan` | `khoa_dat_lich_do_no_show`, `so_lan_no_show` | TK | ghi cờ khoá |
| `ma_xac_thuc` (`loai = KichHoatNhanSu`) | `ma_bam`, `het_han_luc`, `da_gui_luc`, `thu_hoi_luc`, `da_dung_luc`; cột sinh STORED **UNIQUE** `kich_hoat_dang_hieu_luc`; CHECK `chk_ma_xac_thuc_kich_hoat_da_gui`, `chk_ma_xac_thuc_dung_hoac_thu_hoi`; index `(tai_khoan_id, loai, tao_luc)` cho giới hạn gửi lại | NS, TK | ghi |
| `phien_dang_nhap` | `thu_hoi_luc` — thu hồi phiên khi khoá tài khoản | TK | ghi |
| `thong_tin_phong_kham` | 1 dòng `id = 1`; 4 cột NULL được (nhưng Figma đánh dấu cả 4 là bắt buộc) | PK | ghi |
| `cau_hinh_he_thong` | 1 dòng `id = 1`; 7 cột NOT NULL không DEFAULT (`[cần điền]`); `chk_cau_hinh_gia_tri`, `chk_cau_hinh_nhac_lich` (JSON_SCHEMA_VALID) | CH, CN | ghi/đọc |
| `nhat_ky_hanh_dong` | CHECK `chk_nhat_ky_cap_nhat_cau_hinh` bắt buộc `{truoc, sau, ly_do}` cùng tập khóa, `ly_do` không rỗng | CH, BS, … | ghi |
| `thong_bao`, `email_thong_bao` | UNIQUE `(yeu_cau_thay_doi_chi_nhanh_id, tai_khoan_id, loai_su_kien)`; `noi_dung ≤ 500`; email: `ChoGui/DaGui/ThatBai` + CHECK `chk_email_thong_bao_ket_qua` | CN | ghi |
| `lich_hen`, `khung_gio`, `lich_lam_viec`, `ho_so_nguoi_than` | **chỉ đọc**: phát hiện lịch hẹn/ca/khung giờ bị ảnh hưởng (CN), chặn đổi chi nhánh bác sĩ (BS), lọc Bệnh nhân theo chi nhánh (TK) | CN, BS, TK | đọc |

### 3.2 Bảng ngoài danh sách prompt đã mở thêm (và lý do)

- `lich_hen`, `khung_gio`, `lich_lam_viec`, `ho_so_nguoi_than` (DDL + FK kép): cần cho 3 kiểm tra nghiệp vụ (ảnh hưởng lịch hẹn CN, chặn đổi chi nhánh BS, Bệnh nhân theo chi nhánh TK). Chưa module nào sở hữu → **Q41**.
- `thong_bao`, `email_thong_bao`: CN b9 yêu cầu thông báo trong ứng dụng + email; module `notification` chưa có → **Q9**.
- `benh_nhan`, `phien_dang_nhap`, `phu_phi_bac_si`, `lich_hen` (đọc): xem 3.1.
- `hanh_dong_nhay_cam_enum`, `loai_doi_tuong_enum` (đọc giá trị): chỉ có `DoiChiNhanhBacSi`, `CapNhatCauHinh` (và `DoiQuyen`, `ChinhNoShow`…) — **không có** giá trị cho khoá/mở khoá tài khoản, tạo nhân sự, duyệt yêu cầu chi nhánh → **Q39**.

### 3.3 Hành vi/module khác bị ảnh hưởng

| Module | Điểm chạm | Cách xử lý |
|---|---|---|
| `auth` (đã chốt) | `tai_khoan`, `ma_xac_thuc`, `phien_dang_nhap`, `MailService` (auth P4), `JwtAuthGuard`/`RolesGuard`/`@CurrentUser` (auth A4), `PasswordHasher` + chính sách mật khẩu + validator email/SĐT (auth A1), thu hồi phiên hàng loạt (auth A3), khung mẫu email (auth A14), trang `/kich-hoat` | **Tái dùng, không thiết kế lại.** Admin chỉ ghi `trang_thai` (khoá/mở khoá, kích hoạt) — auth không ghi trường này. Guard auth đã kiểm `trang_thai = DangHoatDong` **mỗi request** nên khoá có hiệu lực ngay (Q29 chỉ bổ sung thu hồi phiên). |
| `auth` — tài liệu/DB | auth D2/D3/D7 sửa ghi chú `ma_xac_thuc` (`da_gui_luc`, `thu_hoi_luc`, 3 cột dữ liệu đăng ký) trong **cả 3 file** `docs/database/*` | Task D6 của admin sửa **cùng dòng** (TTL, giới hạn gửi lại, ghi chú KichHoatNhanSu) → **merge sau auth D7**, hoặc làm cùng một PR tài liệu; không để hai PR sửa song song cùng khối dòng. |
| `auth` — A5/A7 | A5 cung cấp `UnverifiedPatientCleaner.purgeIfExpired` để xoá lười; A7 chạy job dọn định kỳ. Chỉ xoá Bệnh nhân chưa xác minh **Đang hoạt động** quá 24 giờ; không xoá Bệnh nhân `NgungHoatDong` hoặc nhân sự. | B15 dùng hàm của A5 cho Q32 sau khi A5 merge, không chờ job A7. Email của tài khoản không đủ điều kiện xoá vẫn là `EMAIL_DA_DUNG`. |
| `auth` — QMK S4 | tài khoản chưa từng có mật khẩu ⇒ "kích hoạt nhân sự" | Thông báo trỏ về "liên hệ Quản trị viên để gửi lại liên kết" — khớp TK A2. |
| `booking` / `schedule` (lịch làm việc) | (a) kiểm lịch hoạt động khi sinh khung giờ/giữ chỗ/đặt lịch (quy tắc 29); (b) **phải khoá `bac_si` bằng `FOR SHARE` trong cùng giao dịch khi tạo `lich_hen`/`lich_lam_viec` cho bác sĩ** để việc đổi chi nhánh bác sĩ (BS) không bị lọt chạy đua; (c) **phải chặn đặt VÀ đổi lịch** vào khung giờ không còn hợp lệ sau `hieu_luc_tu` (Q6 đã chốt; admin cung cấp `getPendingEffectiveChanges`, kiểm tra nằm ở `booking`); (d) bác sĩ/chuyên khoa/dịch vụ ngừng hoạt động | Ghi chú sang PLAN của `booking` và `schedule`. |
| `search` (tra cứu công khai) | ẩn chuyên khoa `NgungHoatDong` (CK hậu điều kiện); chi nhánh chưa khai báo đủ lịch; tính chi nhánh gần nhất dùng toạ độ (nhập tay) | Admin cung cấp cột trạng thái và dữ liệu; lọc nằm ở `search`. |
| no-show / `booking` | "Mở khoá no-show" giữ nguyên `so_lan_no_show` (TK hậu điều kiện) ⇒ nếu số lần ≥ ngưỡng thì lần no-show kế tiếp có thể khoá lại ngay | Câu hỏi chuyển cho module no-show — Q31. |
| `notification` | tạo `thong_bao` + `email_thong_bao`, worker gửi/gửi lại không trùng (quy tắc 34), mẫu email "Kết quả thay đổi thông tin chi nhánh" (689:2) và "Thay đổi chi nhánh ảnh hưởng bệnh nhân" (690:2) | Q9: làm tối thiểu ở `apps/api/src/notification/` để module sau mở rộng. |
| `audit` | `AuditService.record(...)` dùng cùng giao dịch | Q39: làm tối thiểu ở `apps/api/src/audit/` hay chờ. |
| module "Cấu hình phụ phí bác sĩ", "Cấu hình chính sách đặt cọc" | cùng nhóm màn "Hệ thống/Nội dung" trên Figma | Ngoài 8 use case; chỉ phụ thuộc: admin đọc `phu_phi_bac_si` (Q21) và **không** nhận `muc_dat_coc` từ form DV (DV-18). |
| hạ tầng (`docker`, staging) | cấu hình Cloudinary ở backend (Q13), biến môi trường mới, múi giờ (Q43); ảnh không cần volume hoặc proxy `/uploads` | Task P7, D8. |

### 3.4 Chỗ 2.4, schema và Figma lệch/mơ hồ — **nêu rõ, không tự chọn**

| # | Lệch / mơ hồ | Đề xuất xử lý (chờ nhóm) | Đồng bộ |
|---|---|---|---|
| L1 | **CN b2/b4/A3, mô tả:** "giờ mở – giờ đóng", "chưa có nhiều ca mở cửa trong một ngày" ↔ **schema (19/10/2026):** hai khoảng nhận khám (sáng/chiều) và `hoat_dong` suy từ khoảng ↔ **Figma "Sửa lịch và dịch vụ chi nhánh":** mỗi thứ có "Hoạt động" + "Buổi sáng" + "Buổi chiều" | Q1 | D1 (2.4) |
| L2 | **CN b3/b6:** "KHÔNG lưu thay đổi vào thông tin chi nhánh" khi có ảnh hưởng ↔ **schema:** `noi_dung_truoc/sau` chỉ có khóa `lich_hoat_dong` và/hoặc `dich_vu_kham_ids` — **tên/địa chỉ/toạ độ không có chỗ trong yêu cầu** | Q2 | D1 |
| L3 | **CN b6:** "lưu … danh sách lịch hẹn bị ảnh hưởng để người duyệt xem" lúc đề xuất ↔ **schema (`yeu_cau_thay_doi_chi_nhanh_lich_hen`):** "chụp lúc duyệt, tính với thời điểm có hiệu lực" | Q46 | D1, D6 |
| L4 | **CK, DV (2.4):** "Quản trị viên" nói chung ↔ **Figma "Admin chi nhánh - Chuyên khoa / Loại dịch vụ khám" (628:2, 630:2):** có banner "chỉ dành cho Admin toàn hệ thống … chỉ xem" | Q11 | D2 |
| L5 | **DV (2.4):** chỉ có "tên nhóm"; "[cần điền: bật/tắt nhóm và dịch vụ]" ↔ **schema:** `nhom_dich_vu.thu_tu_hien_thi`, **không có cột trạng thái** cho nhóm/dịch vụ ↔ **Figma:** "Xác nhận xóa nhóm" (563:2), cột "Thứ tự" | Q14, Q15 | D2, D6 |
| L6 | **CK A1:** "tên không trùng chuyên khoa khác" ↔ **schema:** `chuyen_khoa.ten` **không UNIQUE**; collation `unicode_ci` coi "Tim mạch" = "Tim mach" | Q12 | D6 (nếu thêm UNIQUE) |
| L7 | **NS b2:** biểu mẫu **không có số điện thoại** ↔ **schema:** `tai_khoan.so_dien_thoai NOT NULL` ↔ **Figma "Tạo tài khoản nhân sự" (523:2):** có "Số điện thoại *" | Q24 | D3 |
| L8 | **NS A4/b6, TK A2 (2.4)** mô tả `da_gui_luc`/`thu_hoi_luc` cho KichHoatNhanSu ↔ ghi chú các cột này ở schema **sẽ bị auth D2/D7 sửa** (OTP cũng dùng) | Phối hợp thứ tự PR (3.3) | D6 |
| L9 | **TK b2 (2.4):** danh sách của Quản trị viên Chi nhánh = Bác sĩ/Lễ tân chi nhánh mình + Bệnh nhân (không nêu Quản trị viên) ↔ **Figma "Admin chi nhánh - Nhân sự & Tài khoản" (625:2):** danh sách có dòng "Admin Quận 3" (vai trò Admin) | Q27 | D4 / Figma |
| L10 | **TK (2.4):** "Mở khoá no-show" là một hành động ↔ **Figma "Tài khoản bệnh nhân - Chi tiết" (533:2):** chỉ thấy "Điều chỉnh số lần no-show (UC 52)" và "Khóa tài khoản"; chưa thấy nút mở khoá no-show ở trạng thái bình thường | Q31 | D4 / Figma |
| L11 | **PK b2/b4:** "định dạng email, số điện thoại" ↔ quy tắc SĐT của auth S5 (10 số bắt đầu 0) **không khớp** hotline mẫu Figma "1900 1234" (`duong_day_nong varchar(20)`) ↔ Figma bắt buộc cả 4 trường, DB cho NULL | Q33 | D5 |
| L12 | **CH b4:** "giá trị số dương, trong khoảng hợp lý" ↔ DB CHECK chỉ chặn cận dưới (có cột cho `0`), **chưa có cận trên** (`[cần điền]`) | Q34 | D6 (ghi cận trên) |
| L13 | **CH (2.4):** "[đề xuất: bắt buộc] lý do" ↔ DB CHECK `chk_nhat_ky_cap_nhat_cau_hinh` **đã ép** `ly_do` không rỗng ⇒ thực tế bắt buộc | Q38 | D5 |
| L14 | **BS b4:** "dịch vụ khám chính được cung cấp tại chi nhánh công tác" ↔ **CN (bỏ dịch vụ khỏi chi nhánh)** không nói gì về bác sĩ đang gán dịch vụ đó ⇒ có thể phá ràng buộc (quy tắc service 1) | Q8 | D1 |
| L15 | **BS:** thời lượng khám = `dich_vu_kham.thoi_luong` quyết định khung giờ (quy tắc 39); 2.4 cho đổi dịch vụ khám chính/ sửa thời lượng dịch vụ **không** nêu tác động lên khung giờ/lịch hẹn đã có (truy vấn ảnh hưởng dùng `thoi_luong` hiện tại) | Q16, Q17 | D2, D5 |
| L16 | **Audit:** Lưu ý riêng của prompt nêu "đổi quyền/phạm vi, khoá tài khoản, đổi chi nhánh bác sĩ" cần nhật ký ↔ enum chỉ có `DoiChiNhanhBacSi`, `CapNhatCauHinh` (và `DoiQuyen`, `ChinhNoShow`…) | Q39 | D6 |
| L17 | **TK/CN:** "thông báo cho người gửi" khi **từ chối** (CN A2) có; khi **duyệt** không nói (Figma có email "Kết quả thay đổi thông tin chi nhánh" 689:2) | Q9 | D1 |
| L18 | **dbml/sql** `chi_nhanh_lich_hoat_dong`: "[cần điền: 07:30 là giờ bắt đầu nhận khám hay chỉ giờ mở cửa tiếp đón]" — form admin nhập **giờ nhận khám**; Figma ví dụ "Thứ 2: S: 08:30–11:30, C: 13:30–17:00" | Q1 (ghi nhãn "giờ nhận khám") | D1, D6 |
| L19 | Nhóm "Hệ thống" trên Figma có thêm "Phụ phí bác sĩ", "Đặt cọc và hoàn tiền", "Nhật ký hành động" nhưng **không thuộc 8 use case** | Q21 (ghi rõ phạm vi) | — |

**Cập nhật 25/10/2026 sau khi nhóm trả lời:** L1→Q1, L2→Q2, L3→Q46, L4→Q11, L5→Q14/Q15, L6→Q12, L7→Q24, L9→Q27 (ẩn cả chính họ), L10→Q31, L11→Q33, L13→Q38, L14→Q8, L15→Q16/Q17, L16→Q39 (mở rộng enum), L17→Q9 đều đã có quyết định. L12 có thêm một lệch cố ý: nhóm chốt `so_ngay_bao_truoc_doi_gio_lam` **1–60** ở service (Q34) trong khi DB CHECK cho phép `>= 0`. Hai lệch mới phát sinh từ trả lời, **đã giải quyết**: **Q7 ↔ luồng thông báo/báo trước của 2.4** (Q48 = B) và **Q3 ↔ enum `trang_thai` chỉ có 3 giá trị** (Q47). Ngoài ra Q40 (ngoài phạm vi ⇒ 404) **lệch với 2.4** ở BS A3, TK A1, NS A3 ("thông báo không đủ quyền/lỗi cụ thể") → D10.
### 3.5 Bẫy/rủi ro (xử lý trong task)

- **H1 — IDOR / phạm vi sai.** Quản trị viên Chi nhánh gửi `chiNhanhId` của người khác, hoặc đoán `id` bác sĩ/tài khoản/yêu cầu. Chi nhánh của **tài nguyên** phải đọc từ DB, không tin client; kiểm trong cùng giao dịch với ghi (mục 5.2). Test PQ-*.
- **H2 — Chạy đua đổi chi nhánh bác sĩ.** Kiểm "không còn lịch hẹn/ca" rồi lưu, trong lúc `booking` tạo lịch hẹn mới ⇒ bác sĩ ở chi nhánh mới nhưng còn lịch hoạt động ở chi nhánh cũ. Giải pháp: `SELECT … FOR UPDATE` dòng `bac_si` ở admin; `FOR SHARE` ở booking/schedule (ghi chú 3.3). Test BS-36.
- **H3 — Khoá hai Quản trị viên Toàn hệ thống cùng lúc.** Hai admin khoá lẫn nhau khi chỉ còn hai ⇒ đếm "còn ít nhất một" ở hai giao dịch song song đều thấy "còn một" ⇒ về 0. Khoá hàng tất cả `quan_tri_vien` Toàn hệ thống theo thứ tự id trước khi đếm (mục 5.6). Test TK-19.
- **H4 — Chạy đua gửi lại liên kết kích hoạt.** Hai lần gửi lại song song; thứ tự "thu hồi liên kết cũ **rồi** đặt `da_gui_luc`" (quy tắc 21) để không vi phạm UNIQUE `kich_hoat_dang_hieu_luc`; khoá hàng `tai_khoan` ở giao dịch hậu gửi. Test TK-45, TK-46.
- **H5 — Không giữ giao dịch mở khi gọi SMTP** (auth H9): tạo liên kết (commit) → gửi mail → giao dịch ngắn cập nhật kết quả. Tài khoản + hồ sơ luôn nằm **trước** khi gửi (NS A4 yêu cầu giữ tài khoản khi mail lỗi).
- **H6 — Lộ token kích hoạt.** Token trong query string rơi vào log proxy/`Referer`. Đề xuất đặt trong **fragment** (`#`) (Q25); chỉ lưu băm; so sánh hằng định; log che token (auth P5); thông báo lỗi chung cho mọi lý do "liên kết không hợp lệ" (không cho dò) (NS-35).
- **H7 — Mass assignment.** DTO có `trangThai`, `loaiTaiKhoan`, `phamViQuanTri`, `matKhau`… do client gửi lên. `ValidationPipe` `whitelist + forbidNonWhitelisted`; DTO tách riêng cho từng hành động; trạng thái chỉ đổi qua hành động có tên (SE-A2).
- **H8 — `ENUM NOT NULL` tự nhận giá trị đầu.** `bac_si.chuc_danh`/`hoc_vi` bỏ trống vẫn qua DB (thành `BS`) — service **bắt buộc nhập tường minh** (đã ghi ở dbml, test GAP). Test NS-11, BS-04.
- **H9 — Cấu hình chưa có dòng.** Không dùng giá trị ngầm (quy tắc 35); `SystemConfigService.getOrThrow()` ném `HE_THONG_CHUA_CAU_HINH`; mọi module đọc cấu hình đi qua service này (không SQL tay) — CH-10.
- **H10 — Mất đồng bộ yêu cầu thay đổi chi nhánh.** Sửa trực tiếp chi nhánh (không ảnh hưởng) trong lúc có yêu cầu `ChoDuyet`/`DaDuyet` chưa áp dụng làm `noi_dung_truoc` lỗi thời và lúc áp dụng ghi đè mất thay đổi. Chặn theo Q3.
- **H11 — Áp dụng hai lần / áp dụng sớm** (job chạy song song nhiều instance). Điều kiện `trang_thai='DaDuyet' AND ap_dung_luc IS NULL AND hieu_luc_tu <= NOW()` + khoá hàng + `UPDATE` có điều kiện (quy tắc 31(4)); không dùng khoá bộ nhớ tiến trình. CN-82.
- **H12 — Trộn giờ cũ khi áp dụng.** Mỗi phần tử `lich_hoat_dong` là **toàn bộ dòng** của thứ đó, thay cả dòng (quy tắc 43); không `UPDATE` từng cột. Đọc được cả dạng cũ `gio_mo_cua/gio_dong_cua` ở yêu cầu lịch sử (CN-90).
- **H13 — Múi giờ.** `datetime` MySQL không mang múi giờ; "hôm nay", "thứ trong tuần" (`WEEKDAY`), `hieu_luc_tu`, ca hôm nay phải cùng một múi giờ (Q43). Test biên 23:59/00:00 (BS-37).
- **H14 — Tên có dấu/hoa thường.** Trùng tên so theo collation `unicode_ci` (không phân biệt dấu) — người dùng thấy "Tim mạch" và "Tim mach" là một. Chuẩn hoá khoảng trắng (trim, gộp khoảng trắng liên tiếp) trước khi so.
- **H15 — Upload ảnh Cloudinary:** backend kiểm magic bytes, không tin `Content-Type`/đuôi; chỉ ảnh tĩnh JPEG/PNG/WebP đầu vào ≤ 10 MB/25 MP; ảnh ≤ 2 MB không chủ động resize/nén; > 2 MB đến 10 MB nén trước/resize khi cần, output ≤ 2 MB (mục tiêu mềm 700–800 KB); tự chuẩn hóa EXIF, giữ alpha/tỷ lệ, không phóng to/crop, cấm SVG/tệp rỗng; từ chối tên chứa traversal, định danh do server tạo, không dùng tên gốc. Kiểm quyền trước khi gọi provider; secret chỉ ở backend, không ghi log. Test tự động mock adapter. Khi lỗi/timeout không báo thành công, không thay tham chiếu ảnh cũ; timeout có thể đã tạo tài nguyên, đối soát/dọn theo working-doc/P7/plan.md mục 3c, hoàn tất cơ chế kỹ thuật trước code. SE-A7.
- **H16 — Số lượng thông báo lớn.** Một yêu cầu có thể ảnh hưởng hàng trăm lịch hẹn ⇒ tạo `thong_bao`/`email_thong_bao` theo lô trong giao dịch duyệt (gom theo bệnh nhân), gửi email **ngoài** giao dịch bằng worker; không gửi đồng bộ trong request.
- **H17 — Thông tin cá nhân Bệnh nhân.** Quản trị viên Chi nhánh chỉ XEM danh sách trường hành chính đã chốt (Q26); response không chứa `mat_khau_bam`, mã xác thực, ví, hồ sơ khám. Test TK-04.
- **H18 — Tạo Admin Toàn hệ thống đầu tiên** không thể dùng giao diện (cần admin có sẵn) ⇒ script bootstrap (Q30) — chỉ chạy khi chưa có Toàn hệ thống nào, không log mật khẩu.
- **H19 — Áp dụng yêu cầu khi còn lịch/ca chưa xử lý (Q7, Q46).** Danh sách ảnh hưởng chụp lúc duyệt có thể lỗi thời sau vài ngày (lịch mới, lịch đã đổi/hủy). `UnresolvedImpactGate` **tính lại** với mốc `hieu_luc_tu` ngay trước khi áp dụng và không tin bản chụp; còn lịch hẹn hoặc ca tương lai bị ảnh hưởng ⇒ **không áp dụng**, giữ `DaDuyet`, đánh dấu **quá hạn** (`qua_han_luc`) và cảnh báo Admin; **không tự áp dụng muộn** khi danh sách rỗng lại (chỉ dời hiệu lực hoặc hủy); không tự hủy/đổi/hoàn tiền. Test CN-66…CN-69, CN-100…CN-111.
- **H20 — Dò tài nguyên ngoài phạm vi (Q40).** 403 riêng cho "ngoài phạm vi" xác nhận bản ghi tồn tại. Id ngoài tầm nhìn trả **cùng 404** (cùng thân phản hồi, thời gian gần nhau) như id không tồn tại; 403 chỉ dùng cho tài nguyên người gọi được thấy nhưng không có quyền hành động. Test PQ-13.
- **H21 — Email thông báo lỗi thời sau hủy/dời (Q47, Q48).** Bệnh nhân có thể nhận email báo "thay đổi sẽ có hiệu lực" khi yêu cầu đã bị hủy/dời. Dừng email còn chờ gửi (`BoQua`) trong cùng giao dịch hủy/dời; câu lệnh nhận việc của worker chỉ nhận `ChoGui`/`ThatBai`; email đã trên đường gửi không thu hồi được ⇒ luôn gửi thêm thông báo "hủy"/"dời hiệu lực". Test CN-105, CN-106.

## 4. Quyết định và điểm còn mở

### 4.1 Đã chốt ở module khác (kế thừa — **không bàn lại**)

Xem `docs/features/auth/TRACKING.md` mục 3. Những điểm chạm module này:

| Nguồn | Nội dung | Hệ quả cho admin |
|---|---|---|
| auth Q1 | TypeORM, tắt `synchronize`, migration SQL viết tay đối chiếu schema chính thức | P1–P3 viết migration tay từ `clinix_mysql.sql`, kiểm khớp từng dòng |
| auth Q2 | Access JWT 15 phút; refresh cookie `HttpOnly; Secure; SameSite=Lax`; web và API cùng origin qua proxy | Admin gọi `/api/admin/...` cùng origin; access token trong header (không cookie) ⇒ API admin không dính CSRF (SE-A13) |
| auth Q3 + N8 | Gmail SMTP qua `MailService`; test tự động mock; không Mailpit | Email kích hoạt/thông báo dùng `MailService`; test mock |
| auth S5, N9 | Email ASCII, trim, tên miền chữ thường; SĐT 10 số bắt đầu 0 | Tái dùng validator của auth A1 cho email/SĐT nhân sự (hotline: Q33) |
| auth Q11, N10, S6 | Chính sách mật khẩu; Argon2id | Đặt mật khẩu kích hoạt dùng đúng validator + `PasswordHasher` của auth A1 |
| auth S2/S3/H10 | Mỗi loại bí mật dùng đúng loại băm | Liên kết kích hoạt: token ngẫu nhiên 256 bit, lưu SHA-256 (giống refresh token) — Q25 |
| auth N5 | Cookie `Secure`, staging HTTPS | Liên kết kích hoạt trỏ `WEB_ORIGIN` (HTTPS khi có người truy cập qua mạng) |
| auth mục 5.4 | Mã lỗi ổn định cho từng nhánh nghiệp vụ; log che mật khẩu/token/OTP | Dùng bộ lọc lỗi + che log của auth P5; mã lỗi admin ở mục 5.9 |
| auth G4 | Tên hiển thị **CLINIX**; bỏ hotline/địa chỉ chân trang nếu chưa có giá trị thật | Sau PK, `thong_tin_phong_kham` có thể cấp dữ liệu chân trang email (module sau) |
| auth mục 3.3 (`admin`) | `auth` không ghi `trang_thai`; guard kiểm `trang_thai` mỗi request; admin phải làm phiên cũ mất hiệu lực khi khoá | Q29 (chốt cách) |

### 4.2 Câu hỏi gộp và đề xuất ban đầu (**đã được nhóm trả lời ngày 25/10/2026 — quyết định cuối ở mục 4.2a, ưu tiên hơn các bảng dưới**)

Các bảng dưới giữ nguyên **đề xuất ban đầu của AI** để truy vết; chỗ nhóm trả lời khác/bổ sung thì xem 4.2a. Cột "Chặn" liệt kê task phụ thuộc câu hỏi đó.

**A. Chi nhánh (use case CN)**

| Q | Câu hỏi | Đề xuất | Lý do | Chặn |
|---|---|---|---|---|
| Q1 | L1: form lịch hoạt động nhập **một** khoảng giờ mở–đóng (2.4) hay **hai** khoảng sáng/chiều (schema, Figma)? | **Hai khoảng** (sáng/chiều), ngày hoạt động cần ≥ 1 khoảng đầy đủ; nhãn là "giờ nhận khám"; sửa 2.4 theo schema/Figma | Schema 19/10 và Figma đã theo hai khoảng; một khoảng không biểu diễn giờ nghỉ trưa, khung giờ sẽ xuyên giờ nghỉ | B7, B8, F6, D1 |
| Q2 | L2: lần gửi có **cả** tên/địa chỉ/toạ độ **và** thay đổi lịch/dịch vụ có ảnh hưởng thì xử lý thế nào? | **Áp dụng ngay** tên/địa chỉ/toạ độ; **toàn bộ phần lịch + dịch vụ** của lần gửi (đã diff) vào **một** yêu cầu `ChoDuyet`; phản hồi nói rõ phần nào đã lưu/phần nào chờ duyệt | Yêu cầu trong schema không chứa tên/địa chỉ/toạ độ; hai nhóm này không ảnh hưởng lịch hẹn | B8, D1 |
| Q3 | "Có cho nhiều yêu cầu `ChoDuyet` cùng một chi nhánh không?" Người gửi có **rút** được yêu cầu không? | **Không** cho: mỗi chi nhánh tối đa một yêu cầu `ChoDuyet` **hoặc** `DaDuyet` chưa áp dụng; trong lúc đó **chặn luôn** sửa lịch/dịch vụ áp dụng-ngay của chi nhánh đó (tên/địa chỉ/toạ độ vẫn sửa được). **Không** có chức năng rút (enum không có trạng thái "đã rút") | Tránh `noi_dung_truoc` lỗi thời và áp dụng chồng nhau (H10); đơn giản hoá | B8, B9 |
| Q4 | Quản trị viên Toàn hệ thống có được **tự duyệt** đề xuất của chính mình? | **Có** (ghi `nguoi_de_xuat_id`/`nguoi_duyet_id` đúng), không chặn | Nếu chỉ có một Admin Toàn hệ thống thì yêu cầu của người đó sẽ kẹt vĩnh viễn; DB hiện không chặn | B9, B10 |
| Q5 | Ai chọn `hieu_luc_tu`? | **Người duyệt nhập** ngày giờ; tối thiểu = (thời điểm duyệt + số ngày báo trước), ô điền sẵn mốc sớm nhất; server kiểm; thời điểm duyệt chụp một lần dùng cho cả CHECK DB | Khớp CHECK `hieu_luc_tu >= thoi_diem_duyet + n ngày`; linh hoạt chọn giờ ít bệnh nhân | B10, F6 |
| Q6 | Sau khi **duyệt** và trước `hieu_luc_tu`: có **chặn đặt mới** vào khung giờ sẽ bị ảnh hưởng không? | **Có** (Phương án B): `booking` kiểm các yêu cầu `DaDuyet` chưa áp dụng của chi nhánh; admin cung cấp hàm đọc `getPendingEffectiveChanges(chiNhanhId)`. Phương án A: không chặn, lịch đặt thêm vào danh sách "ảnh hưởng muộn" nhưng không được báo đủ số ngày | B không chặn làm vi phạm cam kết báo trước cho người đặt sau lúc duyệt | B10, ghi chú `booking` |
| Q7 | Sau áp dụng: lịch hẹn bị ảnh hưởng (giữ/đổi/hủy + hoàn cọc), ca làm việc và khung giờ trống ngoài lịch mới xử lý thế nào? | Admin **chỉ** áp dụng + giữ danh sách + hiển thị cảnh báo; **không** tự hủy/đổi/hoàn tiền/xoá ca/khung giờ. Lịch hẹn do bệnh nhân/Lễ tân xử lý bằng use case đổi/hủy sẵn có; `booking` chặn đặt vào khung giờ ngoài lịch mới (quy tắc 29c). Nhóm quyết sau việc hủy-hoàn cọc | Hủy/hoàn tiền thuộc `booking`/`wallet`, chưa có quyết định | B8, B11, D1 |
| Q8 | Bỏ dịch vụ khỏi chi nhánh khi **còn bác sĩ** của chi nhánh đó đang gán làm dịch vụ khám chính (phá quy tắc 1) | **Chặn cứng** (`DICH_VU_CON_BAC_SI`, kèm danh sách bác sĩ) đến khi các bác sĩ đổi dịch vụ chính | Cặp (chi nhánh, dịch vụ) của bác sĩ bắt buộc có trong `chi_nhanh_dich_vu_kham` | B8, D1 |
| Q9 | `notification` chưa có: ai làm phần tạo/gửi thông báo + email khi duyệt/từ chối? Thử lại bao nhiêu lần? Có báo cho **người gửi khi duyệt** không? | Làm **tối thiểu ở `apps/api/src/notification/`** (`NotificationService` tạo `thong_bao` + `email_thong_bao ChoGui` trong giao dịch duyệt; worker gửi qua `MailService`, nhận việc bằng `UPDATE` có điều kiện — quy tắc 34); thử lại **3 lần cách 5 phút** như nhắc lịch; **có** báo người gửi cả khi duyệt (email 689:2); bỏ qua màn Trung tâm thông báo | Không làm thì CN b9/A4 không đạt; 3×5' lấy theo quy tắc nhắc lịch | C4, B9, B10, B11 |
| Q10 | Toạ độ (vĩ độ/kinh độ): bắt buộc? miền giá trị? | **Tùy chọn** (khớp Figma/DB); nếu nhập phải **đủ cặp**, `lat ∈ [-90,90]`, `lng ∈ [-180,180]`, tối đa 7 chữ số thập phân; chi nhánh thiếu toạ độ bị `search` bỏ qua khi tính "gần nhất" | Figma không đánh dấu `*` cho toạ độ | B7, B8 |

**B. Danh mục (CK, DV)**

| Q | Câu hỏi | Đề xuất | Lý do | Chặn |
|---|---|---|---|---|
| Q11 | L4: Quản trị viên Chi nhánh được **sửa** chuyên khoa/nhóm/dịch vụ hay chỉ **xem**? | **Chỉ xem** (khớp Figma); sửa 2.4 | Dữ liệu dùng chung toàn hệ thống | B1–B3, F2, F3, D2 |
| Q12 | L6: chống trùng tên chuyên khoa: chỉ ở service hay thêm **UNIQUE** ở DB? | **Thêm UNIQUE `chuyen_khoa.ten`** (đổi schema, đồng bộ 3 file) + service báo lỗi thân thiện; so sánh sau trim/gộp khoảng trắng | Chống chạy đua hai request cùng tên; collation `unicode_ci` đã không phân biệt hoa/thường/dấu | P1, B1, D6 |
| Q13 | Tải **hình ảnh** chuyên khoa (CK b2) lưu ở đâu? | **Cloudinary** (người dùng đổi quyết định ngày 28/10/2026): frontend → API kiểm quyền/nội dung → adapter Cloudinary; chỉ ảnh tĩnh JPEG/PNG/WebP đầu vào ≤ 10 MB/25 MP; ảnh ≤ 2 MB không chủ động resize/nén; > 2 MB đến 10 MB nén trước/resize khi cần, output ≤ 2 MB (mục tiêu mềm 700–800 KB); tự chuẩn hóa EXIF, giữ alpha/tỷ lệ, không phóng to/crop, kiểm magic bytes, định danh ngẫu nhiên, cấm SVG. Bỏ kế hoạch volume ảnh và Nginx `/uploads/`. **Đã duyệt thiết kế:** bảng anh_tai_len lưu URL/public_id, chuyên khoa tham chiếu FK; uploadId; Chưa gắn/Đã gắn/Chờ xóa, hạn gắn 24 giờ, dọn mỗi giờ tối đa 50 ảnh/lượt; giữ trường hợp timeout chưa rõ để kiểm tra thủ công. DDL/cấu hình/SDK đã triển khai và kiểm local; manual acceptance còn mở; xem `working-doc/P7/plan.md`. | Đã đồng ý thiết kế dữ liệu/API/vòng đời ảnh; chưa triển khai | P7, B1, F2 |
| Q14 | L5: nhóm dịch vụ có **xoá** (Figma có "Xác nhận xóa nhóm") và `thu_tu_hien_thi` nhập được? | **Xoá chỉ khi nhóm không còn dịch vụ** (`NHOM_DICH_VU_CON_DICH_VU`); `thu_tu_hien_thi` nhập số nguyên ≥ 0; bổ sung vào 2.4 | FK `dich_vu_kham → nhom_dich_vu` | B2, D2 |
| Q15 | "[cần điền] quy tắc bật/tắt nhóm và dịch vụ"? | **Không làm bật/tắt** ở đợt này (không đổi schema); "ngừng cung cấp" = bỏ dịch vụ khỏi `chi_nhanh_dich_vu_kham` (qua CN). Nếu muốn bật/tắt: thêm cột trạng thái cho `dich_vu_kham` (đổi schema + ảnh hưởng `booking`/`search`) | Schema/Figma chưa có trạng thái | B2, B3, D2 |
| Q16 | L15: sửa `thoi_luong` dịch vụ khi dịch vụ đang là dịch vụ chính của bác sĩ có khung giờ tương lai/lịch hẹn hoạt động; tên dịch vụ có được trùng? | **Chặn đổi `thoi_luong`** khi còn lịch hẹn đang hoạt động hoặc khung giờ chưa qua của bác sĩ dùng dịch vụ đó (`THOI_LUONG_DANG_DUNG`); sửa tên/giá/nhóm luôn được; **tên không trùng trong cùng nhóm** (so sánh như H14) | Khung giờ sinh theo `thoi_luong`; truy vấn ảnh hưởng dùng giá trị hiện tại | B3, D2 |

**C. Hồ sơ bác sĩ (BS)**

| Q | Câu hỏi | Đề xuất | Lý do | Chặn |
|---|---|---|---|---|
| Q17 | Đổi **dịch vụ khám chính** (khác thời lượng) khi còn lịch hẹn hoạt động/ca từ hôm nay | **Dùng cùng kiểm tra chặn như đổi chi nhánh** (liệt kê lịch hẹn/ca đang chặn, không lưu gì) | Cùng lý do thời lượng khung giờ | B13 |
| Q18 | Quy tắc "ca của hôm nay": chốt cách hiểu | Giữ đúng 2.4: **mọi ca có `ngay >= hôm nay (giờ VN)` đều chặn**, kể cả ca đã kết thúc theo giờ; không xét giờ ca | Chưa có giờ ca cụ thể; đơn giản, an toàn | B13, D5 |
| Q19 | Chuyên khoa `NgungHoatDong` có được **gán mới** cho bác sĩ (tạo tài khoản / đổi chuyên khoa) | **Không** (chỉ chọn chuyên khoa đang hoạt động); bác sĩ đã gán trước đó giữ nguyên khi không đổi trường này | Chuyên khoa ẩn khỏi tra cứu thì gán mới vô nghĩa | B13, B15 |
| Q20 | Xác nhận `BS_CKI`, `BS_CKII` ↔ học vị `BS` ([đề xuất] trong DB); học vị **điền sẵn nhưng vẫn là trường riêng** (server kiểm tương thích); trần số năm kinh nghiệm | Đồng ý theo `chk_bac_si_chuc_danh_hoc_vi`; học vị điền sẵn theo chức danh, vẫn gửi riêng; `so_nam_kinh_nghiem` nguyên `0..60` | Figma có ô học vị riêng; DB chưa có cận trên | B13, B15 |
| Q21 | Ai làm use case **cấu hình bảng phụ phí** (Figma có "Phụ phí bác sĩ")? Quy tắc "tắt mốc cao thì xét mốc thấp hơn" đã chốt chưa? | Admin **chỉ đọc** + hàm `computeSurcharge` + hiển thị "Giá dịch vụ" trong danh sách bác sĩ; use case cấu hình nằm ngoài 8 UC (đề nghị đưa vào kế hoạch riêng); coi "rơi xuống mốc thấp" là đúng theo dbml cho tới khi nhóm xác nhận | Prompt chỉ giao 8 UC | B12 |

**D. Nhân sự & tài khoản (NS, TK)**

| Q | Câu hỏi | Đề xuất | Lý do | Chặn |
|---|---|---|---|---|
| Q22 | Thời hạn liên kết kích hoạt | **24 giờ** (`STAFF_ACTIVATION_TTL_HOURS=24`, không có cột cấu hình); tính từ lúc tạo liên kết | 2.4/dbml chỉ ghi [đề xuất: 24 giờ] | B14 |
| Q23 | Giới hạn tần suất **gửi lại** liên kết ([cần điền] ở dbml) | **≥ 60 giây** giữa hai lần và **≤ 5 lần/giờ** mỗi tài khoản (tính cả lần gửi lỗi, đo theo `ma_xac_thuc.tao_luc` của loại KichHoatNhanSu); trả `GUI_LAI_QUA_SOM` | Giống OTP (quy tắc 17), chống spam email | B14, B20 |
| Q24 | L7: thêm **Số điện thoại** (bắt buộc, quy tắc SĐT của auth) vào biểu mẫu tạo nhân sự; xác nhận `da_xac_minh_email = true` khi kích hoạt xong | Đồng ý cả hai; sửa 2.4 | `so_dien_thoai NOT NULL`; Figma đã có ô | B15, B16, D3 |
| Q25 | Dạng liên kết/token | `WEB_ORIGIN/kich-hoat#id=<ma_xac_thuc_id>&token=<256 bit base64url>` (**fragment**); `ma_bam = SHA-256(token)`; trang đọc fragment rồi `history.replaceState` xoá khỏi URL; API nhận `{id, token}` bằng `POST` | Fragment không vào log/`Referer` (H6) | B14, B16, F10 |
| Q26 | "Thông tin hành chính" của Bệnh nhân mà Quản trị viên Chi nhánh được xem | `ho_ten`, `email`, `so_dien_thoai`, `ngay_sinh`, `gioi_tinh`, `dia_chi`, `thoi_diem_tao`, `trang_thai`; **không** gồm no-show, ví, lịch sử khám, ảnh | Chỉ dữ liệu hành chính tối thiểu | B17, F9, D4 |
| Q27 | L9: Quản trị viên Chi nhánh có thấy Quản trị viên (kể cả chính mình) trong danh sách nhân sự? | Theo **2.4: không thấy** Quản trị viên; chỉnh Figma | 2.4 liệt kê rõ phạm vi danh sách | B17, F8, D4 |
| Q28 | Mở khoá có **xoá** `so_lan_dang_nhap_sai`/`khoa_dang_nhap_den`? Khoá bác sĩ còn lịch hẹn/ca thì xử lý? | Mở khoá **đặt bộ đếm về 0 và bỏ khoá tạm**; **không** tự xử lý lịch hẹn/ca của bác sĩ bị khoá (ghi chú sang `booking`/`schedule` lọc theo `trang_thai`) | 2.4 không nêu; tránh tài khoản vừa mở khoá vẫn "khoá tạm" | B18 |
| Q29 | Làm phiên cũ mất hiệu lực khi khoá (auth mục 3.3 yêu cầu chốt cách) | **Cả hai**: guard auth kiểm `trang_thai` mỗi request (hiệu lực tức thì, không cần làm gì thêm) **và** trong cùng giao dịch khoá đặt `thu_hoi_luc` cho mọi `phien_dang_nhap` chưa thu hồi (refresh cũng hỏng; dữ liệu nhất quán) | Phòng thủ nhiều lớp, chi phí thấp | B18 |
| Q30 | Tạo **Quản trị viên Toàn hệ thống đầu tiên** | Script `npm run seed:first-admin` (đọc `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` từ env, tạo `DangHoatDong`, `da_xac_minh_email=true`; **từ chối nếu đã có Toàn hệ thống**; không log mật khẩu) | Không có giao diện nào tạo được Admin đầu tiên | C5 |
| Q31 | L10: nút "Mở khoá no-show" nằm ở đâu trong Figma (frame có "Điều chỉnh số lần no-show UC 52")? Sau mở khoá, số lần ≥ ngưỡng thì no-show kế tiếp có khoá lại ngay? | Nút chỉ hiện khi `khoa_dat_lich_do_no_show = true`, trong panel chi tiết, chỉ Toàn hệ thống. Câu hỏi thứ hai **chuyển cho module no-show** (admin giữ đúng hậu điều kiện: không đổi `so_lan_no_show`) | UC 52 nằm ngoài phạm vi | B19, F9 |
| Q32 | Email trùng với **Bệnh nhân chưa xác minh Đang hoạt động đã quá 24 giờ** nhưng job dọn chưa chạy | Sau khi auth A5 merge, gọi `UnverifiedPatientCleaner.purgeIfExpired` trước khi báo trùng; B15 không chờ job A7. Bệnh nhân `NgungHoatDong` và nhân sự không bị xoá, trả `EMAIL_DA_DUNG`. | Chỉ giải phóng email của tài khoản đủ điều kiện xoá | B15 |

**E. Phòng khám & cấu hình (PK, CH)**

| Q | Câu hỏi | Đề xuất | Lý do | Chặn |
|---|---|---|---|---|
| Q33 | L11: định dạng đường dây nóng; trường bắt buộc; tạo dòng đầu | Hotline hợp lệ: **10 số bắt đầu 0** hoặc **tổng đài 1800/1900 + 4–6 số**; bỏ khoảng trắng/dấu chấm/gạch trước khi kiểm và lưu dạng chuẩn hoá (≤ 20); email theo auth N9; **cả 4 trường bắt buộc** (theo Figma, service ép dù DB cho NULL); chưa có dòng thì `PUT` **tạo** dòng `id = 1` | Hotline mẫu "1900 1234" không qua quy tắc SĐT của auth | B4, D5 |
| Q34 | L12: cận trên "khoảng hợp lý" từng thông số; `w1/w2`; mảng nhắc lịch rỗng | Bảng ở mục 5.7 (ví dụ giữ chỗ 1–60 phút, ngưỡng no-show 1–10 …); `w1`,`w2` ∈ [0,1], 2 chữ số thập phân, **tổng = 1,00**; mảng nhắc lịch **không rỗng** (1–5 mốc, mỗi mốc 1–720 giờ, không trùng) | DB chưa có cận trên; mảng rỗng "chưa chốt có cho tắt" | B5, D6 |
| Q35 | CH A3/1c: cấu hình **lần đầu** nhập ở biểu mẫu hay người triển khai chạy mẫu `INSERT` | **Biểu mẫu** (tạo dòng khi chưa có; nhật ký `truoc = null` từng tham số, đúng ghi chú dbml) **và** script seed dev riêng với giá trị thử (Q44) | Không cần quyền DB trực tiếp; vẫn có audit | B5, C5 |
| Q36 | Giá trị chính thức các tham số `[cần điền]` (check-in trước/sau, số lịch hẹn/hồ sơ, số lần tự đổi lịch, số ngày báo trước, w1/w2) | Nhóm điền; **dữ liệu thử cho dev**: số lịch hẹn/hồ sơ 3, tự đổi lịch 2, w1 0,60 / w2 0,40 (2.4 đang ghi [đề xuất]), check-in trước/sau tạm 30/15 phút, báo trước tạm 3 ngày — **ghi rõ là dữ liệu thử, không phải quyết định** (quy tắc 5.2) | Không bịa giá trị chính thức | C5, D6 |
| Q37 | Tab "Lịch sử thay đổi" (Figma 578:2) của Cài đặt hệ thống | Làm **tối thiểu**: endpoint đọc `nhat_ky_hanh_dong` có `hanh_dong = CapNhatCauHinh`, chỉ Toàn hệ thống, phân trang; màn Nhật ký tổng quát để module `audit` | Figma đã gắn vào UC này | B6, F5 |
| Q38 | `ly_do` thay đổi cấu hình: bắt buộc, tối đa bao nhiêu ký tự? Lần gửi không đổi gì thì sao? | Bắt buộc (DB đã ép), 1–500 ký tự sau trim; không đổi gì ⇒ `KHONG_CO_THAY_DOI` (không audit) | CHECK DB cần ≥ 1 khóa | B5, D5 |

**F. Chung**

| Q | Câu hỏi | Đề xuất | Lý do | Chặn |
|---|---|---|---|---|
| Q39 | **Audit tối thiểu:** (a) làm `AuditService` (chỉ ghi) ở module này hay chờ module `audit`? (b) enum chưa có hành động cho khoá/mở khoá, tạo nhân sự, duyệt/từ chối yêu cầu chi nhánh, mở khoá no-show: mở rộng enum hay chỉ ghi các giá trị có sẵn? | **Chưa chọn thay nhóm.** (a) Phương án A: làm tối thiểu ở `apps/api/src/audit/` (cần ngay vì CH bắt buộc ghi cùng giao dịch); Phương án B: chờ — CH và đổi chi nhánh bác sĩ bị chặn. (b) Phương án i: chỉ ghi `CapNhatCauHinh`, `DoiChiNhanhBacSi`, các thao tác khác **chưa ghi** (ghi `TECH_DEBT`); Phương án ii: thêm giá trị enum (đổi schema 3 file + migration) | Quyết định phạm vi/schema thuộc nhóm | C2, B5, B13, B18, B19, B10 |
| Q40 | Vị trí cơ chế phạm vi dùng chung; mã lỗi ngoài phạm vi | **`apps/api/src/rbac/`** (module `rbac`, scope commit `rbac`); tài nguyên **tồn tại nhưng ngoài phạm vi ⇒ 403 `NGOAI_PHAM_VI`** (2.4 yêu cầu "thông báo không đủ quyền"), không tồn tại ⇒ 404 — **đã được nhóm đổi ở 4.2a: ngoài phạm vi ⇒ 404** | Module sau (`doctor`, `booking`, `report`, `audit`) dùng lại mà không import `admin` | C1 |
| Q41 | Ai tạo migration cho `lich_hen`, `khung_gio`, `lich_lam_viec`, `ho_so_nguoi_than` (admin cần đọc), `thong_bao`, `email_thong_bao`, `nhat_ky_hanh_dong` | **Admin tạo** (DDL nguyên văn từ `clinix_mysql.sql`, entity chỉ-đọc ở phần admin); `booking`/`schedule` sau này thêm logic, không tạo lại | Test tích hợp cần bảng thật | P2, P3, B8, B13, B17 |
| Q42 | Phân trang/tìm kiếm danh sách | **Offset**: `page` (từ 1), `pageSize` (mặc định 20, tối đa 100); trả `{items, total, page, pageSize}`; `q` tìm theo tên/email/SĐT (LIKE đã escape `%` `_`), sắp xếp cố định; bộ lọc bằng query string, DTO kiểm | Figma có số trang "Hiển thị 1–7 của 7" | P6, B1, B3, B17 |
| Q43 | Múi giờ | `TZ=Asia/Ho_Chi_Minh` cho API, TypeORM `timezone: '+07:00'`, DB lưu **giờ VN**; helper `nowVN()`/`todayVN()` | `WEEKDAY`, "hôm nay", ca (H13) | P5, B13 |
| Q44 | Dữ liệu mẫu (seed) dùng chung | Script idempotent `npm run seed:catalog` (chuyên khoa 8, nhóm 3, dịch vụ, 4 chi nhánh đủ 7 thứ, `thong_tin_phong_kham`) + `seed:dev-accounts` (mật khẩu từ env, không commit); **từ chối chạy khi `NODE_ENV=production`**; tên lấy từ Figma/dbml, giá/giờ ghi rõ là **dữ liệu minh hoạ** | Cả nhóm cùng dữ liệu; module sau dùng được ngay | C5 |
| Q45 | Xác nhận hàng loạt các `[đề xuất]` đã ghi sẵn trong tài liệu (xem 4.3, cột "Q45") | Đồng ý tất cả | Đã có trong 2.4/DB, chỉ cần xác nhận | D3–D6 |
| Q46 | L3: danh sách lịch hẹn bị ảnh hưởng — lưu lúc đề xuất hay tính lại | **Tính lại khi xem** yêu cầu `ChoDuyet` (mốc = bây giờ), **ghi bảng `yeu_cau_thay_doi_chi_nhanh_lich_hen` lúc duyệt** (mốc = `hieu_luc_tu`) theo schema; sửa 2.4 b6 | Khớp ghi chú schema; số liệu luôn mới | B8, B9, B10, D1 |

### 4.2a Kết quả trả lời ngày 25/10/2026 — **quyết định cuối**

"Chốt" = nhóm đồng ý (kể cả khi bổ sung); chỗ **khác đề xuất ban đầu** in đậm. Hệ quả đã được cập nhật ở các mục 5, 6, 7.

| Q | Trạng thái | Quyết định cuối (phần khác/bổ sung so với đề xuất) |
|---|---|---|
| Q1 | Chốt | Hai khoảng sáng/chiều, nhãn "giờ nhận khám". |
| Q2 | Chốt | Tên/địa chỉ/toạ độ áp dụng ngay; lịch + dịch vụ có ảnh hưởng đi vào yêu cầu. **Giao diện phải báo rõ phần đã lưu, phần đang chờ — kể cả khi yêu cầu sau đó bị từ chối** (phần đã lưu không tự hoàn lại). |
| Q3 | Chốt, **khác đề xuất** | Mỗi chi nhánh một yêu cầu **chưa hoàn tất** (`ChoDuyet` hoặc `DaDuyet` chưa áp dụng). **Người gửi được rút** khi `ChoDuyet`; **Admin Toàn hệ thống được hủy** khi `DaDuyet` nhưng chưa có hiệu lực. Cần **trạng thái và audit riêng** cho rút/hủy (nếu không, yêu cầu duyệt nhầm sẽ tự áp dụng mà không có đường dừng). Thiết kế schema: **Q47 (đã chốt)**. |
| Q4 | Chốt | Cho phép tự duyệt; audit ghi rõ người đề xuất và người duyệt. |
| Q5 | Chốt | Người duyệt chọn thời điểm; server ép `>= thời điểm duyệt + số ngày báo trước` (có thể chọn muộn hơn, không được rút ngắn). |
| Q6 | Chốt, **mở rộng** | Chặn **đặt hoặc đổi lịch** mới vào khung giờ sẽ không còn hợp lệ sau hiệu lực. **Kiểm tra nằm ở `booking`** (chỉ cảnh báo ở admin là không đủ). Admin cung cấp `getPendingEffectiveChanges`. |
| Q7 | **Không đồng ý đề xuất; nguyên tắc đã chốt, cách thực hiện = Q48 phương án B** | Không "áp dụng rồi chỉ cảnh báo". Mỗi lịch hẹn **và ca** tương lai bị ảnh hưởng phải được xử lý, hoặc có quyết định rõ "chi nhánh vẫn tiếp nhận theo lịch cũ". **Không tự hủy/hoàn tiền** khi chưa có quy tắc tài chính. Trong TLCN, chưa có luồng xử lý ⇒ **chặn *áp dụng* (không chặn duyệt) yêu cầu còn lịch/ca bị ảnh hưởng** (Q48 = B) và cho người quản trị xem danh sách cần xử lý (ví dụ: không thể giữ lịch 16:30 đã xác nhận khi giờ kết thúc nhận khám đổi thành 16:00 mà không ai chịu trách nhiệm). Hệ quả đã áp dụng: **ca tương lai bị ảnh hưởng cũng buộc tạo yêu cầu** (không áp dụng ngay). |
| Q8 | Chốt | Chặn bỏ dịch vụ khi bác sĩ tại chi nhánh còn dùng làm dịch vụ khám chính; trả danh sách bác sĩ cần đổi trước. |
| Q9 | Chốt | Thông báo tối thiểu; **báo người đề xuất khi duyệt và từ chối**; báo bệnh nhân khi có thay đổi ảnh hưởng; `[đề xuất]` thử gửi email tối đa 3 lần cách 5 phút; **ghi và hiển thị trạng thái gửi thất bại cho người quản trị** (SMTP nhận thư ≠ người nhận đã đọc — không dùng chữ "đã đọc"). |
| Q10 | Chốt | Toạ độ tùy chọn nhưng đủ cặp; kiểm miền; thiếu toạ độ vẫn hiển thị, chỉ không tham gia "gần nhất". |
| Q11 | Chốt | Admin Chi nhánh chỉ xem chuyên khoa, nhóm, dịch vụ. |
| Q12 | Chốt, **bổ sung** | `UNIQUE` ở DB + chuẩn hoá (bỏ khoảng trắng thừa) trước khi lưu. **Phải kiểm và xử lý dữ liệu trùng đã có trước migration.** |
| Q13 | Đã duyệt thiết kế; chưa triển khai | 28/10/2026: Cloudinary thay Docker volume. Giữ ảnh tĩnh JPEG/PNG/WebP đầu vào ≤ 10 MB/25 MP; ảnh ≤ 2 MB không chủ động resize/nén; > 2 MB đến 10 MB nén trước/resize khi cần, output ≤ 2 MB (mục tiêu mềm 700–800 KB); tự chuẩn hóa EXIF, giữ alpha/tỷ lệ, không phóng to/crop và kiểm nội dung; đã duyệt bảng upload + FK, uploadId và ba trạng thái, TTL 24 giờ/dọn mỗi giờ tối đa 50 ảnh/lượt; chi tiết còn lại tại `working-doc/P7/plan.md`. |
| Q14 | Chốt | Chỉ xoá nhóm rỗng; `thu_tu_hien_thi` nguyên ≥ 0. |
| Q15 | Chốt | Không làm bật/tắt; "chi nhánh ngừng cung cấp" = bỏ liên kết chi nhánh–dịch vụ. Muốn ngừng toàn hệ thống: chức năng và trạng thái riêng, sau này. |
| Q16 | Chốt, **bổ sung** | Chặn đổi thời lượng khi còn khung giờ tương lai hoặc lịch hẹn hoạt động phụ thuộc; giữ giá đã chốt. **Tên dịch vụ không trùng trong cùng nhóm, có `UNIQUE (nhom_dich_vu_id, ten)` ở DB sau chuẩn hoá, giống Q12.** |
| Q17 | Chốt, làm rõ | Chặn đổi dịch vụ khám chính khi còn lịch hẹn/ca tương lai bị ảnh hưởng, trả danh sách; **kể cả hai dịch vụ cùng thời lượng** (lịch đã đặt gắn với dịch vụ cũ). |
| Q18 | Chốt | Mọi ca `>= hôm nay (giờ VN)` đều chặn; chỉ nới khi dữ liệu giờ ca đáng tin cậy. |
| Q19 | Chốt | Chỉ gán mới chuyên khoa đang hoạt động; bác sĩ đã gán giữ khi không sửa trường này. |
| Q20 | Chốt **kèm việc nhóm** | Học vị điền sẵn, server vẫn kiểm; 0–60 năm là giới hạn nhập liệu. **Nhóm xác nhận ánh xạ chức danh–học vị (đặc biệt `BS_CKI/BS_CKII ↔ BS`) trước khi đưa vào báo cáo.** |
| Q21 | Chốt, **bổ sung** | Chỉ đọc và tính phụ phí; không mở màn cấu hình phụ phí. Quy tắc "tắt mốc cao thì dùng mốc thấp hơn còn hiệu lực, không về 0" là **quyết định giá của nhóm**: ghi tường minh (D6, `TRACKING`), cài đặt thành quy tắc có tên + test, **không để code tự suy từ truy vấn DB**. |
| Q22 | Chốt | 24 giờ từ lúc tạo. |
| Q23 | Chốt, làm rõ | ≥ 60 giây giữa hai lần, ≤ 5 lần/giờ/tài khoản, **tính cả lần gửi đầu và lần gửi lỗi**. |
| Q24 | Chốt | SĐT bắt buộc (validator auth); kích hoạt xong `da_xac_minh_email = true`. |
| Q25 | Chốt | Token 256 bit trong fragment; DB chỉ lưu băm; xoá fragment khỏi thanh địa chỉ sau khi đọc. |
| Q26 | Chốt, **ít hơn đề xuất** | Admin Chi nhánh xem Bệnh nhân có lịch tại chi nhánh với **họ tên, email, SĐT, ngày sinh, giới tính, trạng thái**; **bỏ địa chỉ và thời điểm tạo**; không ví/no-show/hồ sơ khám. |
| Q27 | Chốt | Admin Chi nhánh không thấy Quản trị viên nào, kể cả chính mình; sửa Figma. |
| Q28 | Chốt, **bổ sung** | Mở khoá xoá bộ đếm sai và khoá tạm. Khoá bác sĩ có hiệu lực ngay; **response nêu các lịch hẹn/ca đang phụ thuộc** để người có trách nhiệm bố trí lại; "lọc bác sĩ khỏi tìm kiếm" **không** được coi là đã xử lý lịch cũ. |
| Q29 | Chốt | Thu hồi các phiên **và** guard auth kiểm trạng thái mỗi request. |
| Q30 | Chốt | Script tạo Admin Toàn hệ thống đầu tiên, chỉ khi chưa có; email/mật khẩu từ môi trường; không log mật khẩu. |
| Q31 | Chốt | Nút chỉ hiện khi đang bị khoá, chỉ Toàn hệ thống; giữ `so_lan_no_show`; giao diện báo rõ no-show kế tiếp có thể khoá lại ngay; muốn giảm số lần thì dùng use case điều chỉnh riêng. |
| Q32 | Chốt, **phụ thuộc auth A5** | Dùng `UnverifiedPatientCleaner.purgeIfExpired` của A5; sau khi A5 merge, B15 không chờ job A7. Chỉ xoá Bệnh nhân chưa xác minh `DangHoatDong` quá 24 giờ; `NgungHoatDong` và nhân sự giữ email đã dùng. |
| Q33 | Chốt | Hotline dùng quy tắc riêng (10 số hoặc 1800/1900); 4 trường bắt buộc ở service; lần lưu đầu tạo `id = 1`. |
| Q34 | Chốt, **sửa** | Cận trên theo 5.7; `w1 + w2 = 1`; nhắc lịch không trùng, không rỗng; **`so_ngay_bao_truoc_doi_gio_lam` 1–60 (không cho 0)**. |
| Q35 | Chốt | Cấu hình lần đầu nhập qua biểu mẫu (có audit); seed chỉ dev/demo. |
| Q36 | Chốt **chỉ ở mức dữ liệu demo có nhãn** | `[đề xuất]` tối đa 3 lịch/hồ sơ, tự đổi lịch 2, check-in 30/15 phút, báo trước 3 ngày, w1 0,60 / w2 0,40. **Nhóm phải chốt từng số** trước khi dùng trong báo cáo/demo như chính sách CLINIX. |
| Q37 | Chốt | Tab Lịch sử: đọc audit `CapNhatCauHinh`, phân trang, chỉ Toàn hệ thống. |
| Q38 | Chốt | Lý do 1–500 ký tự sau trim; không đổi gì ⇒ "Không có thay đổi", không audit giả. |
| Q39 | Chốt, **khác đề xuất** | Làm `AuditService` tối thiểu **ngay** và **mở rộng enum** cho: tạo nhân sự, khoá/mở khoá, duyệt/hủy/từ chối thay đổi chi nhánh, mở khoá no-show (thêm: rút, theo Q3). Không đưa mật khẩu/token vào audit. Tên giá trị: mục 5.10. |
| Q40 | Chốt, **khác đề xuất** | Tách `rbac` dùng chung. Id ngoài chi nhánh người gọi ⇒ **404 như không tồn tại**; **403** chỉ cho tài nguyên họ được thấy nhưng không có quyền thực hiện hành động. Sửa 2.4 (D10). |
| Q41 | Chốt, làm rõ | Một migration nền thuộc task `db` do admin sở hữu (P2/P3); `booking`/`schedule` **không tạo lại** bảng; ghi rõ chủ sở hữu. |
| Q42 | Chốt | Offset, mặc định 20, tối đa 100; escape `%`/`_`; danh sách và `total` đều lọc theo phạm vi. |
| Q43 | Chốt, **bổ sung** | Giờ VN thống nhất ở API, TypeORM **và session MySQL** (không chỉ TZ của API/TypeORM); test 23:59/00:00 cả `NOW()` phía DB. |
| Q44 | Chốt | Seed idempotent, từ chối ở production; tên/giá/giờ từ Figma ghi rõ **dữ liệu minh họa**. |
| Q45 | **Chốt một phần** | Đồng ý các mục kỹ thuật: lý do từ chối bắt buộc; không khoá tài khoản `ChoKichHoat`; phạm vi gửi lại liên kết. Mục nghiệp vụ/giá trị chính thức theo Q20, Q21, Q34, Q36 — không gom. **Còn chờ xác nhận riêng** (4.3): "thứ chưa khai báo", mã sự kiện thông báo, cách hiểu cửa sổ tiếp đón, các mặc định `[đề xuất]` của cấu hình (nằm trong Q36). |
| Q46 | Chốt, **bổ sung** | Tính lại khi xem và khi duyệt; lưu bản chụp lúc duyệt; **trước job áp dụng kiểm lại lịch/ca chưa xử lý (Q7)**. |

**Hai câu phát sinh từ trả lời — đã chốt 25/10/2026:**

| Q | Trạng thái | Quyết định cuối |
|---|---|---|
| Q47 | **Chốt** (đồng ý đề xuất) | Thêm `DaRut` và `DaHuy` cho `yeu_cau_thay_doi_chi_nhanh.trang_thai`; cột `nguoi_huy_id`, `thoi_diem_huy`, `ly_do_huy`; sửa `chk_yc_chi_nhanh_xu_ly`; cột sinh STORED + UNIQUE `dang_mo_chi_nhanh` để DB giữ "mỗi chi nhánh một yêu cầu chưa hoàn tất"; audit `RutThayDoiChiNhanh`, `HuyThayDoiChiNhanh`. **Quyền:** người gửi chỉ **rút** khi `ChoDuyet`; Admin Toàn hệ thống **từ chối** yêu cầu `ChoDuyet` hoặc **hủy** yêu cầu `DaDuyet` khi **chưa áp dụng (`ap_dung_luc IS NULL`)** — dựa vào "chưa áp dụng", **kể cả khi `hieu_luc_tu` đã qua nhưng yêu cầu đang bị hoãn theo Q48**. Khi hủy: báo người đề xuất **và** bệnh nhân đã được thông báo; **email thông báo thay đổi còn chờ gửi phải được dừng** để bệnh nhân không nhận thông tin lỗi thời. |
| Q48 | **Chốt — phương án B, có bổ sung xử lý quá hạn** | Cho **duyệt** và thông báo bệnh nhân trước N ngày. Trong thời gian chờ: bệnh nhân/Lễ tân xử lý lịch hẹn, bộ phận phụ trách xử lý ca; `booking` chặn đặt/đổi lịch mới vào vùng giờ sẽ bị loại. **Đến `hieu_luc_tu`, job tính lại:** không còn lịch/ca bị ảnh hưởng ⇒ áp dụng; còn ⇒ **không áp dụng**, không tự hủy/đổi lịch/hoàn tiền, **đánh dấu yêu cầu quá hạn/chờ xử lý và cảnh báo Admin**. **Không tự áp dụng muộn** khi danh sách sau đó trở nên rỗng: Admin phải **chọn thời điểm hiệu lực mới** (bảo đảm lại tối thiểu N ngày báo trước) rồi **thông báo lại bệnh nhân**, hoặc **hủy** theo Q47. **`hieu_luc_tu` là thời điểm dự kiến; `ap_dung_luc` là lúc thực sự áp dụng** — phải ghi rõ ở 2.4, schema, Figma, API. Cập nhật 2.4, Figma và test cho cả nhánh quá hạn (D1, D6, D7; CN-100…CN-111). |

**Chi tiết thiết kế bổ sung theo Q47/Q48 — đề xuất của AI, nhóm xác nhận khi viết migration (không chặn task):**
1. **Quá hạn không thêm giá trị enum:** là trạng thái suy ra `trang_thai = 'DaDuyet' AND ap_dung_luc IS NULL AND qua_han_luc IS NOT NULL`; thêm cột `qua_han_luc datetime NULL` (thời điểm job phát hiện còn lịch/ca chưa xử lý) và `so_lan_doi_hieu_luc int NOT NULL DEFAULT 0`; CHECK: `qua_han_luc` chỉ có khi `DaDuyet` chưa áp dụng.
2. **Job chỉ chọn yêu cầu `qua_han_luc IS NULL`** ⇒ một khi đã đánh dấu quá hạn thì **không bao giờ tự áp dụng muộn**; chỉ "dời hiệu lực" (đặt lại `hieu_luc_tu`, `qua_han_luc = NULL`, `so_lan_doi_hieu_luc + 1`) hoặc "hủy" mới thoát trạng thái này.
3. **Dời hiệu lực** (`POST …/:id/reschedule`, chỉ Toàn hệ thống, chỉ khi quá hạn): `hieu_luc_tu` mới `>= bây giờ + N ngày`, với N = **lớn hơn** giữa `so_ngay_bao_truoc` đã chụp và giá trị cấu hình hiện hành; tính lại và ghi lại bản chụp lịch hẹn ảnh hưởng ở mốc mới; thông báo + email lại cho bệnh nhân trong danh sách mới; dừng email cũ còn chờ gửi; audit `DoiHieuLucThayDoiChiNhanh`. Chỉ cho dời khi **đã quá hạn** (mở rộng cho trường hợp chưa quá hạn nếu nhóm cần).
4. **Dừng email:** thêm giá trị `BoQua` ("đã dừng, không gửi") cho `email_thong_bao.trang_thai` (cột inline, không đụng `nhac_lich_hen`), sửa `chk_email_thong_bao_ket_qua`; khi hủy/dời, trong cùng giao dịch `UPDATE … SET trang_thai = 'BoQua' WHERE trang_thai IN ('ChoGui','ThatBai')` của các thông báo thuộc yêu cầu; câu lệnh nhận việc của worker chỉ nhận `ChoGui`/`ThatBai` nên không gửi sau khi đã dừng. **Giới hạn đã biết:** email đang trên đường gửi (đã `UPDATE` nhận việc trước thời điểm hủy) vẫn có thể tới người nhận — vì vậy luôn gửi thêm thông báo "hủy"/"dời".
5. **Mã sự kiện thông báo** kèm phiên bản để không vướng UNIQUE `(yêu cầu, tài khoản, loại sự kiện)`: `ThayDoiChiNhanhAnhHuongLichHen:v{n}`, `YeuCauThayDoiChiNhanhQuaHan:v{n}` (cảnh báo **trong ứng dụng** cho mọi Toàn hệ thống đang hoạt động và người đề xuất; thêm banner ở danh sách yêu cầu), `HuyThayDoiChiNhanh`, `DoiHieuLucThayDoiChiNhanh:v{n}`, `KetQuaYeuCauThayDoiChiNhanh`.
6. **`booking` vẫn chặn đặt/đổi lịch vào vùng bị loại trong suốt thời gian yêu cầu còn `DaDuyet` chưa áp dụng — kể cả khi quá hạn** (`getPendingEffectiveChanges` trả cả yêu cầu quá hạn) cho tới khi áp dụng, hủy hoặc dời.
7. Job không có người thực hiện nên **không ghi audit**; dấu vết là `qua_han_luc`, `ap_dung_luc` và thông báo cảnh báo.

### 4.3 Mọi chỗ còn `[cần điền]` / `[đề xuất]` — đối chiếu với câu hỏi

| Nguồn | Nội dung | → |
|---|---|---|
| 2.4 CN tiền điều kiện | chi nhánh chưa khai báo lịch một thứ thì không nhận phân công/đặt lịch **[đề xuất]** | Q45 (còn chờ xác nhận riêng) |
| 2.4 CN tiền điều kiện | số ngày thông báo trước **[cần điền]** (giá trị) | Q36 |
| 2.4 CN b4 | cách xử lý ca làm việc/khung giờ trống ngoài lịch mới **[cần điền]** | Q7 |
| 2.4 CN b6 | nhiều yêu cầu Chờ phê duyệt cùng chi nhánh **[cần điền]** | Q3 |
| 2.4 CN b7 | Toàn hệ thống tự duyệt đề xuất của mình **[cần điền]** | Q4 |
| 2.4 CN b8 | ai chọn thời điểm có hiệu lực **[cần điền]** | Q5 |
| 2.4 CN b10 | cách xử lý từng lịch hẹn sau áp dụng; chặn đặt mới trong thời gian chờ **[cần điền]** | Q7, Q6 |
| 2.4 DV mô tả | quy tắc bật/tắt nhóm và dịch vụ **[cần điền]** | Q15 |
| 2.4 BS mô tả | BS.CKI/BS.CKII ↔ học vị BS **[đề xuất]** | Q20 |
| 2.4 BS mô tả | bảng phụ phí do Toàn hệ thống cấu hình **[đề xuất]** | Q21 |
| 2.4 BS mô tả | tắt mốc cao thì xét mốc thấp hơn **[đề xuất]** | Q21 |
| 2.4 BS mô tả | ca của hôm nay / giờ cụ thể của ca **[cần điền]** | Q18 |
| 2.4 NS mô tả, b6, A4/TK A2 | thời hạn liên kết **[24 giờ]** / **[đề xuất: 24 giờ]** | Q22 |
| 2.4 NS b2 | học vị điền sẵn theo chức danh **[đề xuất]** | Q20 |
| 2.4 TK mô tả | gửi lại liên kết cho tài khoản nhân sự **mọi chi nhánh** (Toàn hệ thống) **[đề xuất]** | Q45 ✔ (đã đồng ý) |
| 2.4 TK mô tả | thông tin hành chính Bệnh nhân Quản trị viên Chi nhánh được xem **[cần điền]** | Q26 |
| 2.4 TK mô tả | Quản trị viên Chi nhánh gửi lại liên kết cho nhân sự chi nhánh mình **[đề xuất]** | Q45 ✔ (đã đồng ý) |
| 2.4 TK A6/4a | không cho Khoá tài khoản Chờ kích hoạt **[đề xuất]** | Q45 ✔ (đã đồng ý) |
| 2.4 CH mô tả | giá trị check-in, số lịch hẹn/hồ sơ **[cần điền]**; no-show 3 **[đề xuất]**; số ngày báo trước **[cần điền]** | Q36 (giá trị chính thức còn chờ nhóm chốt từng số) |
| 2.4 CH b2 | cách hiểu hai thông số tiếp đón **[đề xuất cách hiểu]** | Q45 (còn chờ xác nhận riêng) |
| 2.4 CH b3, A1 | nhập lý do **[đề xuất: bắt buộc]**; "khoảng hợp lý" | Q38, Q34 |
| 2.4 CH A3/1c | cách tạo cấu hình lần đầu **[cần điền]** | Q35 |
| dbml/sql `ma_xac_thuc` | thời hạn **[đề xuất: 24 giờ]**; giới hạn tần suất gửi lại **[cần điền]**; `da_xac_minh_email = true` khi kích hoạt **[đề xuất]** | Q22, Q23, Q24 |
| dbml/sql `bac_si` | `so_nam_kinh_nghiem` ≥ 0 **[đề xuất]**; BS_CKI/BS_CKII **[đề xuất]** | Q20 |
| dbml/sql `chi_nhanh_lich_hoat_dong` | 07:30 là giờ nhận khám hay giờ mở cửa tiếp đón **[cần điền]** | Q1 |
| dbml/sql `nhom_dich_vu` | `thu_tu_hien_thi` **[đề xuất]** | Q14 |
| dbml/sql `yeu_cau_thay_doi_chi_nhanh` | tự duyệt **[cần điền]**; `ly_do_tu_choi` bắt buộc khi TuChoi **[đề xuất]**; ai chọn `hieu_luc_tu` **[cần điền]**; rút yêu cầu, nhiều yêu cầu ChoDuyet, xử lý lịch hẹn sau áp dụng **[cần điền]** | Q4, Q45 ✔ (lý do từ chối), Q5, Q3/Q47, Q7/Q48 |
| dbml/sql `yeu_cau_thay_doi_chi_nhanh_lich_hen` | chưa lưu cách xử lý từng lịch hẹn **[cần điền]** | Q7 |
| dbml/sql `thong_bao` | mã sự kiện `ThayDoiChiNhanhAnhHuongLichHen`, `KetQuaYeuCauThayDoiChiNhanh` **[đề xuất]** | Q45 (còn chờ xác nhận riêng) |
| dbml/sql `email_thong_bao` | số lần thử lại và khoảng cách **[cần điền]** | Q9 |
| dbml/sql `phu_phi_bac_si` | giá trị phụ phí **[cần điền]**; ý nghĩa "rơi xuống mốc thấp" **[cần điền]**; có ghi nhật ký khi sửa bảng phụ phí hay không **[cần điền]** | Q21 (ngoài phạm vi) |
| dbml/sql `cau_hinh_he_thong` | 7 cột `[cần điền]`; `thoi_gian_giu_cho`/`thoi_han_phan_hoi_loi_moi`/`so_muc_cho_toi_da`/`nguong_no_show`/nhắc lịch **[đề xuất]**; mảng nhắc lịch rỗng "chưa chốt"; cận trên **[cần điền]** | Q36, Q34 |
| `clinix_quy_tac_nghiep_vu.md` 13, 29 | ca của hôm nay; giờ của ca **[đề xuất]/[cần điền]** | Q18 |
| `clinix_quy_tac_nghiep_vu.md` 24 | không khoá tài khoản Chờ kích hoạt **[đề xuất]** | Q45 ✔ (đã đồng ý) |
| `clinix_quy_tac_nghiep_vu.md` 25 | danh sách trường hành chính **[cần điền]** | Q26 |
| `clinix_quy_tac_nghiep_vu.md` 35, 5.2 | ai chạy mẫu khởi tạo cấu hình **[cần điền]** | Q35 |
| `clinix_quy_tac_nghiep_vu.md` 36 | lý do cập nhật cấu hình **[đề xuất: bắt buộc]** | Q38 |
| `clinix_quy_tac_nghiep_vu.md` 40 | cách hiểu cửa sổ tiếp đón **[đề xuất]** (module `booking`) | Q45 (còn chờ; thuộc module `booking`) |

### 4.4 Đối chiếu Figma (đã đọc 25/10/2026)

**Có frame (theo tên, và đã xem ảnh các frame in đậm):**
- Chuyên khoa: **538:2** (Admin toàn hệ thống), 539:2 Thêm, 540:2 Chỉnh sửa; **628:2** (Admin chi nhánh, chỉ xem).
- Loại dịch vụ khám: 548:2, 560:2 Dịch vụ khám, 561:2 Thêm nhóm, 562:2 Sửa nhóm, 563:2 Xác nhận xóa nhóm, 564:2 Thêm dịch vụ, 565:2 Sửa dịch vụ; **630:2** (chi nhánh, chỉ xem).
- Bác sĩ: 535:2 danh sách, 536:2 Hồ sơ bác sĩ, **537:2 Chỉnh sửa** (chức danh, học vị, chuyên khoa, dịch vụ khám chính, kinh nghiệm, giới thiệu, chi nhánh công tác); **627:2** (chi nhánh).
- Nhân sự & Tài khoản: 522:2, **523:2 Tạo tài khoản nhân sự** (có SĐT), 524:2/525:2 lỗi bỏ trống (Bác sĩ/Lễ tân), 526:2 Tạo thành công, **527:2 Chi tiết — Chờ kích hoạt** ("Hết hạn", "Gửi lại email kích hoạt"), 530:2, 531:2 Xác nhận ngưng, 532:2 Tài khoản bệnh nhân, **533:2** chi tiết, 534:2 Xác nhận khóa; **625:2/626:2** (chi nhánh).
- Thông tin phòng khám: **541:2** (tab "Thông tin chung": 4 trường đánh `*`), 542:2 tab Chi nhánh, 543:2 Thêm chi nhánh, **544:2 Sửa lịch và dịch vụ chi nhánh** (hai khoảng/thứ), 546:2 Xác nhận duyệt, 547:2 Xác nhận từ chối; **629:2, 693:2** (chi nhánh; có danh sách yêu cầu nhưng không có nút Duyệt/Từ chối). Có dòng cảnh báo "Chưa cấu hình số ngày báo trước".
- Cài đặt hệ thống: 556:2, 557:2 Danh sách chờ và nhắc lịch, 558:2 Quy tắc nâng cao, 577:2 Chi tiết cấu hình, 578:2 Lịch sử thay đổi, 662:2 Đã chỉnh sửa, 663:2 Xác nhận lưu thay đổi, 669:2 Đã lưu.
- Kích hoạt tài khoản: 646:2, 647:2 Link không hợp lệ, 648:2 Kích hoạt thành công. Email: 674:2 Kích hoạt tài khoản nhân sự, 675:2 Gửi lại liên kết kích hoạt, 689:2 Kết quả thay đổi thông tin chi nhánh, 690:2 Thay đổi chi nhánh ảnh hưởng bệnh nhân.

**Theo tên frame, chưa thấy trạng thái riêng (nhóm bổ sung Figma; trong lúc đó FE dùng kiểu thông báo lỗi sẵn có với câu chữ ở mục 5.9 — không tự thiết kế):**
CN A3 (lỗi lịch không hợp lệ theo thứ); CK A1 (tên trùng); DV A1 (lỗi dữ liệu); BS A1/A2/A3 (lỗi dữ liệu, **danh sách lịch hẹn/ca đang chặn đổi chi nhánh**, không đủ quyền); NS A1, A2, A3 (email trùng, không đủ quyền, ngoài phạm vi), **A4 (gửi email kích hoạt thất bại)**, A5/A6 ở trang `/kich-hoat` (mật khẩu không hợp lệ, hết hạn có thể dùng "Link không hợp lệ"); TK A1–A6, "gửi lại liên kết" thành công/thất bại, "Mở khoá no-show"; PK lỗi định dạng; CH lỗi từng ô, "chưa có cấu hình"; thông báo "không đủ quyền" cho mọi trang chỉ Toàn hệ thống khi Quản trị viên Chi nhánh truy cập trực tiếp. Chi tiết yêu cầu thay đổi chi nhánh (danh sách lịch hẹn ảnh hưởng, ca, khung giờ) chỉ thấy nút "Chi tiết" — **chưa xem được màn chi tiết**: hỏi khi làm F6. Theo Q47/Q48 còn thiếu trạng thái/hộp thoại: **"Quá hạn – chờ xử lý"** (kèm danh sách lịch/ca cần xử lý), **Dời hiệu lực**, **Hủy yêu cầu**, **Rút yêu cầu**, nhãn `hieu_luc_tu` = **"dự kiến có hiệu lực"** và `ap_dung_luc` = **"đã áp dụng lúc"**, thông báo/email "hủy" và "dời hiệu lực" cho bệnh nhân (D7).

**Cần sửa/ghi nhận Figma (việc của nhóm):** thêm trạng thái ở trên; Admin chi nhánh: dòng Admin trong danh sách nhân sự (L9); nút mở khoá no-show (L10); nhãn "giờ nhận khám" (L18); ô "Số điện thoại" khi tạo Quản trị viên; hotline không dùng quy tắc SĐT (L11).

### 4.5 Việc của nhóm (ngoài repo)

- **Còn phải trả lời:** phần còn lại của Q45 (4.3). **Xác nhận khi viết migration** các chi tiết đề xuất theo Q47/Q48 (4.2a).
- **Chốt từng số** của `cau_hinh_he_thong` (Q36) trước khi dùng trong báo cáo/demo như chính sách CLINIX; **xác nhận ánh xạ chức danh–học vị** (Q20); **ghi quyết định giá** "tắt mốc cao → mốc thấp hơn" (Q21); **kiểm dữ liệu trùng** tên chuyên khoa/dịch vụ trước migration UNIQUE (Q12, Q16); **chuẩn bị tài khoản Cloudinary, review DDL/cơ chế dọn ảnh và theo dõi hạn mức** (Q13).
- Sửa **2.4** (file Word ở repo `TLCN_CLINIX`) theo D1–D5 và D10; sửa Figma như 4.4.
- Tạo Gmail/App Password (auth N8) — cần cho gửi thật email kích hoạt ở X1.
- Chuẩn bị **giá trị chính thức** cho `cau_hinh_he_thong` (Q36) và danh mục thật (chi nhánh, dịch vụ, giờ nhận khám) trước khi demo.
- Duyệt câu chữ thông báo ở mục 5.9.

## 5. Thiết kế kỹ thuật

### 5.1 Cấu trúc và cấu hình

```
apps/api/src/
  rbac/            # DÙNG CHUNG: phạm vi quản trị (C1) — module rbac
  audit/           # DÙNG CHUNG, tối thiểu: AuditService.record(manager, …) (C2)
  notification/    # DÙNG CHUNG, tối thiểu: NotificationService + email-outbox.worker (C4)
  common/          # time/ (nowVN, todayVN), paging/ (PageQueryDto, Paged<T>), upload/ (P7)
  admin/
    admin.module.ts
    branches/                 # CN: controller → service → repositories/, impact/branch-impact.service.ts, dto/
    branch-change-requests/   # CN: list/detail/approve/reject + apply.job.ts
    specialties/              # CK
    service-catalog/          # DV: groups + services
    doctors/                  # BS: doctors.service.ts, surcharge.calculator.ts
    accounts/                 # NS (tạo) + TK (danh sách, khoá, no-show, gửi lại): account-permission.policy.ts
    staff-activation/         # NS (kích hoạt công khai) + activation-link.service.ts dùng chung với gửi lại
    clinic-info/              # PK
    system-config/            # CH (+ SystemConfigService xuất ra cho module khác)
apps/web/src/features/admin/  # F1…F9; apps/web/src/features/staff-activation/  # F10 (trang /kich-hoat, công khai)
```
Quy ước: controller chỉ nhận/trả; logic ở service; truy vấn ở repository; entity/repository dùng chung với auth (`tai_khoan`, `ma_xac_thuc`, `phien_dang_nhap`, `benh_nhan`) được **import qua module đã export**, không sao chép — kiểm lại vị trí entity khi auth P3 merge.

**Biến môi trường mới (`.env.example`, không giá trị thật):** `STAFF_ACTIVATION_TTL_HOURS` (24, Q22), `STAFF_ACTIVATION_RESEND_MIN_SECONDS` (60), `STAFF_ACTIVATION_RESEND_MAX_PER_HOUR` (5) (Q23), **[policy P7]** giới hạn input 10 MB/25 MP, ngưỡng tối ưu/output 2 MB, mục tiêu mềm 700–800 KB; tự chỉnh EXIF, nén trước/resize khi cần (tách cấu hình input/output; tên biến cụ thể chờ review thay cho `UPLOAD_MAX_BYTES` chung), **[đề xuất P7]** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (chỉ backend; placeholder, không giá trị thật; Q13), `TZ=Asia/Ho_Chi_Minh`, `DB_TIMEZONE=+07:00` (Q43; áp dụng cả `SET time_zone` mỗi kết nối MySQL và `TZ` của container `db`), `BRANCH_CHANGE_APPLY_CRON` (mỗi phút), `EMAIL_OUTBOX_MAX_ATTEMPTS` (3), `EMAIL_OUTBOX_RETRY_MINUTES` (5), `EMAIL_OUTBOX_POLL_SECONDS` (30) (Q9), `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (Q30; **chỉ khi chạy script**, không đọc ở runtime). `WEB_ORIGIN` (đã có) dùng dựng liên kết kích hoạt. P7 không dùng `UPLOAD_DIR`/`UPLOAD_PUBLIC_PATH` cho ảnh Cloudinary.

### 5.2 Cơ chế phạm vi theo chi nhánh (module `rbac`, task C1)

**Vì sao ở `apps/api/src/rbac/` mà không ở `admin/`:** Quản trị viên Chi nhánh khác Toàn hệ thống là *phạm vi dữ liệu* (SOW 3.2.1: vai trò + quyền sở hữu + phạm vi); `doctor`, `booking`, `report`, `audit` sẽ cần cùng cơ chế mà không được phụ thuộc ngược vào `admin`. Auth chỉ làm "vai trò" (JwtAuthGuard + RolesGuard) và đã để Ownership/Scope cho `rbac`; commitlint đã có scope `rbac`. (Q40)

**Thành phần:**
1. `AdminScope` — giá trị `{ kind: 'ToanHeThong' } | { kind: 'ChiNhanh', chiNhanhId }`.
2. `AdminScopeService.resolve(taiKhoanId)` — đọc `quan_tri_vien` **mỗi request** (không đưa phạm vi vào JWT: JWT cũ sẽ lệch khi phạm vi đổi). Không có dòng, hoặc `pham_vi_quan_tri = 'ChiNhanh'` mà `chi_nhanh_id` NULL ⇒ **403 (đóng mặc định)**.
3. `@RequireAdminScope('Any' | 'ToanHeThong')` + `AdminScopeGuard` — chạy sau `JwtAuthGuard` + `@Roles('QuanTriVien')`; chặn thô ở mức route (ví dụ PK/CH chỉ `ToanHeThong`), gắn `request.adminScope`; decorator tham số `@AdminScopeCtx()`.
4. `BranchAccessPolicy` — hàm thuần, truyền `scope` + dữ liệu: `assertToanHeThong(scope)` (⇒ 403), `canAccessBranch(scope, chiNhanhId)`, `assertCanSee(scope, chiNhanhId)` (ngoài phạm vi ⇒ **404**), `assertCanAct(...)` (thấy được nhưng không có quyền ⇒ 403), `branchFilter(scope, requested?)` (Chi nhánh ⇒ luôn chi nhánh của mình; Toàn hệ thống ⇒ giá trị client yêu cầu hoặc "tất cả"), `patientVisibilityFilter(scope)` (Chi nhánh ⇒ `EXISTS lich_hen WHERE chi_nhanh_id = …`).
5. `admin/accounts/account-permission.policy.ts` — bảng quyền hành động × loại tài khoản đích × phạm vi (mục 5.6), xây trên các hàm trên; thuần, test theo ma trận.

**Quy tắc bắt buộc:**
- **Phạm vi của tài nguyên lấy từ DB, không từ client** (bác sĩ → `bac_si.chi_nhanh_id`; lễ tân → `le_tan.chi_nhanh_id`; yêu cầu → `yeu_cau_thay_doi_chi_nhanh.chi_nhanh_id`; bệnh nhân → có `lich_hen` tại chi nhánh). Với tạo mới, `chiNhanhId` do client chọn phải qua `assertCanSee` (chi nhánh ngoài phạm vi bị coi như không tồn tại — Q40).
- **Kiểm trong cùng giao dịch với ghi, sau khi khoá dòng** (`SELECT … FOR UPDATE`) khi chi nhánh của tài nguyên có thể đổi (bác sĩ đổi chi nhánh) — tránh TOCTOU.
- Service nhận `scope` làm **tham số**, không tự đọc từ `request` (dễ test, không phụ thuộc HTTP).
- **Ngoài phạm vi ⇒ 404, không đủ quyền ⇒ 403 (Q40):** tài nguyên nằm ngoài tầm nhìn của người gọi (bác sĩ/lễ tân chi nhánh khác, Bệnh nhân không có lịch tại chi nhánh mình, Quản trị viên với Admin Chi nhánh, yêu cầu của chi nhánh khác) ⇒ **cùng** `KHONG_TIM_THAY` như id không tồn tại (cùng thân phản hồi, thời gian gần nhau); `KHONG_DU_QUYEN` (403) chỉ khi tài nguyên thấy được mà hành động không được phép (ví dụ Chi nhánh khoá Bệnh nhân, đổi chi nhánh bác sĩ) hoặc route chỉ-Toàn-hệ-thống.
- **Mọi route dưới `/admin` phải có `@Roles` + `@RequireAdminScope`**; test đăng ký tuyến duyệt toàn bộ metadata và **fail** nếu có route thiếu (PQ-11).
- Danh sách lọc ở **truy vấn** (không lọc sau trong bộ nhớ); `total` chỉ đếm bản ghi trong phạm vi (PQ-12).
- FE chỉ ẩn/vô hiệu theo `GET /admin/me` (`{ phamVi, chiNhanh: {id, ten}? }`) — không phải lớp bảo vệ.

### 5.3 Endpoint đề xuất (tên chưa chốt; tiền tố `/api`; `TH` = chỉ Toàn hệ thống; `Any` = cả hai phạm vi, dữ liệu lọc theo phạm vi)

| Endpoint | Use case | Phạm vi | Ghi chú |
|---|---|---|---|
| `GET /admin/me` | — | Any | phạm vi + chi nhánh (cho FE) |
| `GET /admin/options/branches` · `/specialties` · `/services?branchId=` | BS, NS, CN | Any | dữ liệu cho dropdown; chuyên khoa chỉ đang hoạt động (Q19); dịch vụ theo chi nhánh |
| `GET/POST /admin/specialties`, `GET/PATCH /admin/specialties/:id`, `PATCH /admin/specialties/:id/status`, `POST /admin/uploads/specialty-image` | CK | GET Any · ghi TH (Q11) | ảnh (Q13) |
| `GET/POST /admin/service-groups`, `PATCH/DELETE /admin/service-groups/:id` | DV | GET Any · ghi TH | DELETE chỉ nhóm rỗng (Q14) |
| `GET/POST /admin/services`, `GET/PATCH /admin/services/:id` | DV | GET Any · ghi TH | không nhận `mucDatCoc` |
| `GET/PUT /admin/clinic-info` | PK | TH | upsert `id = 1` |
| `GET/PUT /admin/system-config`, `GET /admin/system-config/history` | CH | TH | `PUT` có `lyDo`; history (Q37) |
| `GET /admin/branches`, `GET /admin/branches/:id` | CN | Any | Chi nhánh: chỉ chi nhánh mình |
| `POST /admin/branches` | CN (thêm) | TH | giao dịch: chi nhánh + 7 dòng lịch + dịch vụ |
| `PATCH /admin/branches/:id` | CN (sửa) | Any (đúng chi nhánh) | nhận form đầy đủ, server diff; trả `{daLuu, yeuCau?, canhBao}` — nêu rõ phần **đã lưu** và phần **đang chờ duyệt** (Q2) |
| `GET /admin/branch-change-requests`, `GET …/:id` | CN | Any (CN: của chi nhánh mình) | chi tiết gồm lịch hẹn/ca/khung giờ ảnh hưởng (tính lại) |
| `POST /admin/branch-change-requests/:id/approve` `{hieuLucTu}` · `/reject` `{lyDo}` · `/cancel` `{lyDo}` | CN | TH | `cancel` khi `DaDuyet` và `ap_dung_luc IS NULL` (kể cả quá hạn) |
| `POST /admin/branch-change-requests/:id/withdraw` | CN | Any (**chỉ người đã gửi**, khi `ChoDuyet`) | |
| `POST /admin/branch-change-requests/:id/reschedule` `{hieuLucTu}` | CN | TH | chỉ khi **quá hạn** (Q48) |
| `GET /admin/doctors`, `GET/PATCH /admin/doctors/:id` | BS | Any (CN: bác sĩ của chi nhánh mình) | đổi `chiNhanhId` chỉ TH (kiểm ở service) |
| `GET /admin/accounts?loai=nhan-su\|benh-nhan&...`, `GET /admin/accounts/:id` | TK | Any | lọc theo phạm vi |
| `POST /admin/staff-accounts` | NS | Any (theo vai trò tạo) | trả `guiEmail` |
| `POST /admin/accounts/:id/lock` · `/unlock` · `/unlock-no-show` · `/resend-activation` | TK | theo ma trận 5.6 | |
| `POST /staff-activation/validate` `{id, token}` · `POST /staff-activation/complete` `{id, token, matKhauMoi, xacNhan}` | NS (kích hoạt) | **công khai** (`@Public`) | thông báo lỗi chung (H6) |

Mọi endpoint ghi chạy trong **một** giao dịch ở tầng service; DTO `whitelist + forbidNonWhitelisted` (H7).

### 5.4 Chi nhánh (CN): lịch hoạt động, ảnh hưởng, yêu cầu, áp dụng

**Dữ liệu vào (`PATCH /admin/branches/:id`):** `{ten, diaChi, toaDoLat?, toaDoLng?, lichHoatDong:[7 phần tử {thuTrongTuan, hoatDong, sang?:{batDau,ketThuc}, chieu?:{batDau,ketThuc}}], dichVuKhamIds:[…]}` (form đầy đủ như Figma; server **diff** với dữ liệu hiện tại: tập thứ thay đổi, dịch vụ thêm/bỏ).

**Kiểm lịch (hàm thuần `validateWeeklySchedule`, phản chiếu đúng các CHECK để người dùng không bao giờ thấy lỗi CHECK thô):** đủ 7 thứ 1–7, không trùng; ngày nghỉ ⇒ cả bốn giờ rỗng; ngày hoạt động ⇒ ≥ 1 khoảng đầy đủ; mỗi khoảng bắt đầu < kết thúc, trong `00:00:00–23:59:59`; kết thúc sáng ≤ bắt đầu chiều. Trả **mọi lỗi**, mỗi lỗi `{thu, maLoi}` (CN A3/4b: "chỉ rõ thứ và lỗi").

**Phát hiện ảnh hưởng (`BranchImpactService`)** — theo truy vấn mẫu cuối `clinix_mysql.sql` (quy tắc 30), chạy **cho từng thứ thay đổi** + dịch vụ bị bỏ:
1. Lịch hẹn `ChoThanhToan/DaXacNhan`, `thoi_gian >= mốc`, đúng chi nhánh, thứ chuyển nghỉ (`NgayNghi`) hoặc không còn nằm **trọn** trong khoảng mới ứng với ca của lịch (`NgoaiGioHoatDong`); dịch vụ bị bỏ (`BoDichVu`). Một lịch hẹn có nhiều lý do ⇒ **một** dòng, ưu tiên `NgayNghi` > `NgoaiGioHoatDong` > `BoDichVu` (PK `(yêu cầu, lịch hẹn)`).
2. Ca làm việc tương lai không còn khoảng tương ứng (`CaKhongTonTai`) — **tính là ảnh hưởng** (Q7: mỗi lịch hẹn **và ca** tương lai bị ảnh hưởng phải được xử lý). Khung giờ `ConTrong` ngoài lịch mới chỉ **liệt kê** (do `booking` chặn đặt/đổi, Q6); không tự xoá/hủy/hoàn tiền bất cứ thứ gì.
3. Mốc: lúc đề xuất = `nowVN()`; lúc duyệt = `hieu_luc_tu`.

**Phân nhánh khi gửi (b5/b6):** không có lịch hẹn **và không có ca** ảnh hưởng ⇒ giao dịch áp dụng ngay (khoá `chi_nhanh` `FOR UPDATE`; thay **cả dòng** của từng thứ; thay danh sách dịch vụ; cập nhật tên/địa chỉ/toạ độ), trả cảnh báo khung giờ `ConTrong` ngoài lịch mới nếu có. Có ảnh hưởng ⇒ khoá `chi_nhanh`, kiểm Q3 (không có yêu cầu `ChoDuyet` hoặc `DaDuyet` chưa áp dụng; DB giữ thêm bằng cột sinh UNIQUE — Q47), kiểm Q8 (bỏ dịch vụ còn bác sĩ gán), ghi `yeu_cau_thay_doi_chi_nhanh` (`ChoDuyet`, `noi_dung_truoc` = bản chụp **chỉ các thứ đổi** (+ danh sách dịch vụ nếu đổi), `noi_dung_sau` tương ứng, **đủ 6 khóa** mỗi thứ, khoảng không tồn tại ghi `null` — quy tắc 43), **không** đụng bảng đang áp dụng. Phần tên/địa chỉ/toạ độ: **áp dụng ngay** (Q2); phản hồi và giao diện nêu rõ phần **đã lưu** và phần **đang chờ duyệt**, kể cả khi yêu cầu sau đó bị từ chối/rút/hủy (phần đã lưu không tự hoàn lại).

**Duyệt (`approve`) — một giao dịch:** khoá yêu cầu; phải `ChoDuyet`; đọc `so_ngay_bao_truoc_doi_gio_lam` qua `SystemConfigService.getOrThrow` (chưa cấu hình ⇒ `HE_THONG_CHUA_CAU_HINH`, không duyệt); chốt **một** `thoiDiemDuyet`; kiểm `hieuLucTu >= thoiDiemDuyet + n ngày` (Q5); tính ảnh hưởng với mốc `hieuLucTu` (**không chặn duyệt** khi còn lịch/ca ảnh hưởng — Q48 = B; danh sách chỉ để người duyệt xem và để báo bệnh nhân) → ghi bản chụp `yeu_cau_thay_doi_chi_nhanh_lich_hen`; gom theo `lich_hen.benh_nhan_id` (kể cả khi người khám là hồ sơ người thân) → mỗi bệnh nhân **một** `thong_bao` (≤ 500 ký tự; chi tiết ở email) + một `email_thong_bao ChoGui`, đảm bảo `thoi_diem_tao < hieu_luc_tu`; `UPDATE` có điều kiện `trang_thai = 'ChoDuyet'` (ROW_COUNT 1) đặt `DaDuyet`, `nguoi_duyet_id`, `so_ngay_bao_truoc`, `hieu_luc_tu`. Dữ liệu chi nhánh **chưa đổi**.

**Từ chối (`reject`):** `ly_do_tu_choi` bắt buộc (CHECK DB) ≤ 255; `TuChoi`; thông báo + email cho `nguoi_de_xuat_id` (`KetQuaYeuCauThayDoiChiNhanh`); bệnh nhân **không** nhận gì (A2).

**Rút / Hủy (Q3, Q47):** *Rút* — chỉ **người đã gửi**, yêu cầu `ChoDuyet` ⇒ `DaRut`, chi nhánh không đổi, báo Toàn hệ thống. *Từ chối* — Toàn hệ thống với yêu cầu `ChoDuyet` (đường dừng của Toàn hệ thống khi chưa duyệt). *Hủy* — Toàn hệ thống, yêu cầu `DaDuyet` với **`ap_dung_luc IS NULL`** (điều kiện dựa vào **chưa áp dụng**, nên hủy được cả khi `hieu_luc_tu` đã qua và yêu cầu đang quá hạn), **bắt buộc lý do** ⇒ `DaHuy`; job sẽ không áp dụng; báo người đề xuất và **các bệnh nhân đã được thông báo** (`HuyThayDoiChiNhanh`); **dừng email thông báo thay đổi còn chờ gửi** (`BoQua`, mục 4.2a ý 4). Cả hai chạy trong giao dịch có khoá hàng yêu cầu, ghi audit riêng (5.10), và giải phóng "yêu cầu đang mở" của chi nhánh. Hủy đồng thời với job áp dụng: khoá hàng quyết định bên thắng.

**Email (A4):** worker nhận việc bằng `UPDATE email_thong_bao SET so_lan_thu = so_lan_thu + 1, lan_thu_cuoi_luc = NOW() WHERE … AND trang_thai <> 'DaGui' AND so_lan_thu = :đã_đọc` (quy tắc 34); gửi lỗi ⇒ `ThatBai + loi_cuoi` ở **giao dịch riêng**, **không** xoá `thong_bao`, **không** hoàn tác yêu cầu đã duyệt; thử lại tối đa **3 lần, cách 5 phút** (Q9); `DaGui` là trạng thái cuối ⇒ không gửi trùng. Trạng thái gửi (số `DaGui`/`ThatBai`, `loi_cuoi` rút gọn) hiển thị trong chi tiết yêu cầu để người quản trị biết; `DaGui` nghĩa là SMTP nhận thư, **không** bảo đảm người nhận đã đọc.

**Hai mốc thời gian (Q48):** `hieu_luc_tu` là **thời điểm dự kiến** có hiệu lực (người duyệt chọn, có thể được dời); `ap_dung_luc` là **lúc thực sự** ghi thay đổi vào bảng đang áp dụng (NULL = chưa áp dụng). Giao diện, API và tài liệu dùng đúng hai nhãn này.

**Áp dụng (`apply.job.ts`, cron mỗi phút):** chọn `trang_thai = 'DaDuyet' AND ap_dung_luc IS NULL AND qua_han_luc IS NULL AND hieu_luc_tu <= NOW()` theo `hieu_luc_tu`; **mỗi yêu cầu một giao dịch**: khoá hàng, kiểm lại điều kiện, kiểm lại `noi_dung_sau` bằng `validateWeeklySchedule`, **tính lại `UnresolvedImpactGate` với mốc `hieu_luc_tu` (Q7, Q46 — không tin bản chụp lúc duyệt)**:
- **Không còn lịch hẹn/ca tương lai bị ảnh hưởng** ⇒ thay cả dòng từng thứ + thay danh sách dịch vụ, đặt `ap_dung_luc = NOW()`.
- **Còn** ⇒ **không áp dụng gì (không áp dụng một phần)**; đặt `qua_han_luc = NOW()`; tạo cảnh báo trong ứng dụng cho mọi Admin Toàn hệ thống đang hoạt động và người đề xuất (`YeuCauThayDoiChiNhanhQuaHan:v{n}`), banner ở danh sách; **không tự hủy/đổi lịch/hoàn tiền**; yêu cầu vẫn `DaDuyet`, `ap_dung_luc` NULL.
- Yêu cầu đã có `qua_han_luc` **không còn được job chọn** ⇒ **không tự áp dụng muộn** dù danh sách sau đó rỗng; lối thoát duy nhất: **dời hiệu lực** hoặc **hủy**.
- Lỗi ⇒ rollback + thử lại lần quét sau (log, không nuốt). Job bị tắt rồi bật lại: yêu cầu chưa từng bị đánh dấu quá hạn và đã sạch ⇒ áp dụng bù (`ap_dung_luc >= hieu_luc_tu`). Không tự hủy/đổi/hoàn tiền lịch hẹn nào (chưa có quy tắc tài chính — Q7).

**Dời hiệu lực (`reschedule`, Q48):** Toàn hệ thống, yêu cầu quá hạn (`DaDuyet`, `ap_dung_luc IS NULL`, `qua_han_luc IS NOT NULL`), một giao dịch có khoá hàng: kiểm `hieuLucTuMoi >= bây giờ + N ngày` (N = lớn hơn giữa `so_ngay_bao_truoc` đã chụp và cấu hình hiện hành; thiếu cấu hình ⇒ `HE_THONG_CHUA_CAU_HINH`); đặt `hieu_luc_tu`, `qua_han_luc = NULL`, `so_lan_doi_hieu_luc + 1`; **tính lại** và thay bản chụp `yeu_cau_thay_doi_chi_nhanh_lich_hen` ở mốc mới; dừng email cũ còn chờ gửi (`BoQua`); tạo thông báo + email **lại** cho bệnh nhân trong danh sách mới (`DoiHieuLucThayDoiChiNhanh:v{n}`) và báo người đề xuất; audit `DoiHieuLucThayDoiChiNhanh`. Trong suốt thời gian chờ, `booking` vẫn chặn đặt/đổi vào vùng bị loại.

**Hiển thị lịch sử:** màn chi tiết đọc được cả dạng cũ `gio_mo_cua/gio_dong_cua` của yêu cầu đã xử lý (quy tắc 43).

### 5.5 Liên kết kích hoạt nhân sự (NS b6, b8–b12, A4–A6; TK A2)

`ActivationLinkService` (task B14) dùng chung cho **tạo tài khoản** và **gửi lại**. Token = 32 byte ngẫu nhiên (`crypto.randomBytes`), `ma_bam = SHA-256(token)`, `het_han_luc = bây giờ + TTL`. URL: `WEB_ORIGIN/kich-hoat#id=<ma_xac_thuc_id>&token=<…>` (Q25).

**Trạng thái của một hàng `ma_xac_thuc` loại `KichHoatNhanSu`** (suy ra, không thêm cột):

| Trạng thái | Điều kiện | Dùng để kích hoạt? |
|---|---|---|
| Mới tạo (chưa gửi) | `da_gui_luc` rỗng, `thu_hoi_luc` rỗng | **Không** (chưa hiệu lực) |
| Hợp lệ | `da_gui_luc` có, `thu_hoi_luc`, `da_dung_luc` rỗng, `het_han_luc > bây giờ` | Có |
| Hết hạn | như hợp lệ nhưng `het_han_luc ≤ bây giờ` | Không |
| Gửi lỗi / bị thay | `thu_hoi_luc` có | Không |
| Đã dùng | `da_dung_luc` có | Không |

**Tạo tài khoản (NS b5–b7):** giao dịch 1 (khoá `email` bằng UNIQUE ⇒ lỗi trùng → `EMAIL_DA_DUNG`, không 500): `tai_khoan` (`ChoKichHoat`, `mat_khau_bam` NULL, `loai_tai_khoan`) + hồ sơ vai trò (`bac_si`/`le_tan`/`quan_tri_vien`) + hàng liên kết (mới tạo) — **một giao dịch, lỗi một phần thì không tạo gì** (NS b5). Commit → gửi mail (**ngoài giao dịch**). Giao dịch 2: thành công ⇒ khoá hàng `tai_khoan`; thu hồi liên kết cũ chưa dùng (`thu_hoi_luc`) **rồi** đặt `da_gui_luc` (quy tắc 21, tránh vi phạm UNIQUE); thất bại ⇒ chỉ đặt `thu_hoi_luc` cho **chính hàng mới**, giữ tài khoản + hồ sơ `ChoKichHoat`, trả `guiEmail = {ketQua:'ThatBai', maLoi:'GUI_MAIL_LOI'}` (HTTP 201, FE **không** hiện "đã gửi") (A4).

**Gửi lại (TK A2/A3):** chỉ tài khoản nhân sự `ChoKichHoat` (khác ⇒ `TAI_KHOAN_KHONG_CHO_KICH_HOAT`); kiểm quyền + giới hạn (Q23) trong giao dịch khoá `tai_khoan`; chèn hàng mới (mới tạo); commit; gửi mail; giao dịch hậu gửi như trên. Gửi lỗi ⇒ liên kết cũ (nếu còn hạn) **giữ nguyên**.

**Kích hoạt công khai:** `validate` kiểm `{id, token}` (so SHA-256 hằng định) + trạng thái liên kết + `tai_khoan.trang_thai = 'ChoKichHoat'`; mọi lý do thất bại trả **cùng** `LIEN_KET_KHONG_HOP_LE`. `complete`: kiểm mật khẩu (validator auth A1) **trước** khi chạm DB; giao dịch: khoá liên kết + tài khoản, kiểm lại, đặt `mat_khau_bam` (Argon2id), `trang_thai = DangHoatDong`, `da_xac_minh_email = true` (Q24), `da_dung_luc` — mật khẩu sai định dạng **không** làm hỏng liên kết (A6). Hai lần kích hoạt song song: chỉ một thành công (khoá hàng).

### 5.6 Quản lý tài khoản (TK): ma trận quyền, khoá, phiên

| Hành động | Toàn hệ thống | Chi nhánh |
|---|---|---|
| Xem danh sách / chi tiết | tất cả | Bác sĩ + Lễ tân `chi_nhanh_id` = chi nhánh mình; Bệnh nhân có ≥ 1 `lich_hen` (mọi trạng thái) tại chi nhánh mình (chỉ xem, trường theo Q26); **không** thấy Quản trị viên (Q27) |
| Khoá / Mở khoá Bác sĩ, Lễ tân | mọi chi nhánh | chỉ chi nhánh mình |
| Khoá / Mở khoá Bệnh nhân | có | **không** |
| Khoá / Mở khoá Quản trị viên | có (không tự khoá; không khoá Toàn hệ thống cuối cùng) | **không** |
| Mở khoá no-show | có (chỉ Bệnh nhân) | **không** |
| Gửi lại liên kết kích hoạt | mọi nhân sự `ChoKichHoat` (kể cả Quản trị viên) | Bác sĩ/Lễ tân `ChoKichHoat` chi nhánh mình; **không** Quản trị viên |

**Thứ tự kiểm ở server (4a/4b):** (1) tồn tại → 404; (2) tài nguyên **ngoài tầm nhìn** của người gọi ⇒ 404 (nhân sự chi nhánh khác, Quản trị viên với Admin Chi nhánh, Bệnh nhân không có lịch tại chi nhánh mình — Q27, Q40); thấy được nhưng không có quyền (A1, ví dụ Chi nhánh khoá Bệnh nhân) ⇒ 403 `KHONG_DU_QUYEN`; (3) hành động hợp lệ với loại đích (no-show chỉ Bệnh nhân); (4) tự khoá (A4 `TU_KHOA_TAI_KHOAN`); (5) trạng thái (A6: khoá/mở khoá `ChoKichHoat` ⇒ `TAI_KHOAN_CHO_KICH_HOAT`; khoá tài khoản đã ngưng / mở khoá tài khoản đang hoạt động ⇒ `TRANG_THAI_KHONG_PHU_HOP`); (6) Toàn hệ thống cuối cùng (A5 `CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG`) — khoá hàng **tất cả** `quan_tri_vien` Toàn hệ thống theo thứ tự `tai_khoan_id` rồi đếm tài khoản `DangHoatDong` **ngoài** mục tiêu (H3).

**Khoá (7):** khi đích là **Bác sĩ**, response kèm danh sách lịch hẹn đang hoạt động và ca từ hôm nay trở đi đang phụ thuộc (tối đa 50 + tổng) để người có trách nhiệm bố trí lại — **không** tự xử lý (Q28). Một giao dịch: `trang_thai = NgungHoatDong` + `thu_hoi_luc` mọi `phien_dang_nhap` chưa thu hồi (Q29) + (Audit nếu Q39). **Mở khoá:** `DangHoatDong` (+ `so_lan_dang_nhap_sai = 0`, `khoa_dang_nhap_den` NULL — Q28). **Không** có đường `ChoKichHoat → DangHoatDong` bằng mở khoá.

### 5.7 Hồ sơ bác sĩ (BS) và cấu hình (CH)

**Sửa hồ sơ bác sĩ — một giao dịch, kiểm hết trước khi ghi:** khoá `bac_si` (+`tai_khoan`) `FOR UPDATE` → kiểm phạm vi trên chi nhánh **hiện tại** → kiểm trường (bắt buộc: chuyên khoa, chi nhánh, dịch vụ chính, học vị, chức danh; kinh nghiệm nguyên ≥ 0; chức danh–học vị tương thích; chuyên khoa đang hoạt động nếu đổi — Q19; cặp (chi nhánh **đích**, dịch vụ) có trong `chi_nhanh_dich_vu_kham`) → nếu `chiNhanhId` đổi: người thực hiện phải **Toàn hệ thống** (kiểm ở service, A3) rồi **kiểm chặn** (A2): `lich_hen` của bác sĩ ở chi nhánh hiện tại với `trang_thai IN (ChoThanhToan, DaXacNhan, DaTiepDon)` và `lich_lam_viec` của bác sĩ ở chi nhánh hiện tại với `ngay >= todayVN()` ⇒ `DOI_CHI_NHANH_BI_CHAN` kèm danh sách (tối đa 50 + tổng), **không lưu trường nào**. Đạt ⇒ ghi, `lich_lam_viec.chi_nhanh_id` cũ **giữ nguyên**, Audit `DoiChiNhanhBacSi` (Q39). Đổi dịch vụ khám chính: chặn như đổi chi nhánh khi còn lịch hẹn hoạt động/ca từ hôm nay, **kể cả hai dịch vụ cùng thời lượng** (Q17).

**Phụ phí hiện hành (`computeSurcharge`):** hàm thuần + truy vấn mẫu: dòng `phu_phi_bac_si` cùng `chuc_danh`, `ap_dung = true`, `so_nam_kinh_nghiem_tu <= kinh nghiệm`, lấy mốc **lớn nhất**; không có ⇒ 0. Hiển thị chỉ đọc; **không** nhập tay (BS mô tả); lịch đã đặt giữ `gia_snapshot`. Quy tắc "tắt mốc cao thì dùng mốc thấp hơn còn hiệu lực, không về 0" là **quyết định giá của nhóm** (Q21): ghi ở D6/`TRACKING`, cài đặt thành quy tắc có tên + test, không tự suy từ truy vấn.

**Cấu hình hệ thống — một giao dịch (quy tắc 36):** `SELECT … FROM cau_hinh_he_thong WHERE id = 1 FOR UPDATE` (hoặc chưa có dòng ⇒ tạo, Q35) → so với đầu vào, lấy **chỉ tham số đổi** → không đổi ⇒ `KHONG_CO_THAY_DOI` → kiểm miền (bảng dưới) + `ly_do` → `UPDATE` → `AuditService.record(manager, {CapNhatCauHinh, cau_hinh_he_thong, 1, chi_nhanh_id NULL, ThanhCong, {truoc, sau, ly_do}})`; ghi nhật ký lỗi (kể cả CHECK từ chối) ⇒ **rollback cả cấu hình** (A4). Khóa JSON dùng **tên cột** (`thoi_gian_giu_cho`…), giá trị đúng kiểu số.

Miền giá trị (Q34 — nhóm đồng ý dùng làm giới hạn kỹ thuật; DB chưa có cận trên; **riêng `so_ngay_bao_truoc_doi_gio_lam` là 1–60**):

| Tham số (cột) | Đơn vị | Miền |
|---|---|---|
| `thoi_gian_giu_cho` | phút | 1–60 |
| `thoi_diem_nhac_lich` | giờ | mảng 1–5 phần tử nguyên, mỗi phần tử 1–720, không trùng |
| `so_lich_hen_toi_da_moi_ho_so` | lịch | 1–20 |
| `so_lan_tu_doi_lich_toi_da` | lần | 0–10 |
| `check_in_truoc_phut`, `check_in_sau_phut` | phút | 0–240 |
| `thoi_han_phan_hoi_loi_moi` | phút | 1–1440 |
| `so_muc_cho_toi_da` | mục | 0–10 |
| `nguong_no_show` | lần | 1–10 |
| `so_ngay_bao_truoc_doi_gio_lam` | ngày | **1–60** (DB cho `>= 0`; service ép `>= 1` để "báo trước" còn nghĩa) |
| `trong_so_w1`, `trong_so_w2` | — | 0,00–1,00, 2 chữ số thập phân, w1 + w2 = 1,00 |

### 5.8 Thời gian, phân trang, lỗi, log, kiểm thử

- **Thời gian (Q43):** mọi "hôm nay/thứ trong tuần/ca hôm nay/hiệu lực" tính theo giờ VN qua `nowVN()`/`todayVN()`; test dùng đồng hồ giả. Thống nhất cả **session MySQL** (`SET time_zone = '+07:00'` ở mỗi kết nối trong pool) và `TZ` container `db` để `NOW()` phía DB cùng mốc giờ; ưu tiên truyền mốc thời gian từ ứng dụng thay vì dựa `NOW()` trong điều kiện nghiệp vụ; test ranh giới 23:59/00:00 cho cả mã ứng dụng và `NOW()` của DB.
- **Phân trang (Q42):** `PageQueryDto`, `Paged<T>`; `pageSize` tối đa 100; `q` escape `%` và `_`.
- **Giao dịch:** mọi thao tác đa bảng nằm trong một giao dịch ở tầng service; lỗi UNIQUE/FK ánh xạ sang mã lỗi nghiệp vụ (không 500).
- **Log:** không ghi mật khẩu, token kích hoạt, băm; che bằng bộ lọc auth P5; nhật ký nghiệp vụ (Audit) **không** chứa bí mật.
- **Kiểm thử:** unit (mock repo, `MailService` giả, đồng hồ giả) + **tích hợp MySQL thật** cho CHECK/UNIQUE/khoá hàng/chạy đua (hạ tầng auth P3/P4); FE: Vitest. Test tự động **không** gửi email thật.

### 5.9 Mã lỗi → thông báo (câu chữ đề xuất; nhóm duyệt và đưa vào Figma)

| Mã lỗi (HTTP) | Thông báo đề xuất | Nguồn |
|---|---|---|
| `KHONG_DU_QUYEN` (403) | Bạn không có quyền thực hiện thao tác này. | CN A1, BS A3, NS A2, TK A1, PK A2, CH A2 |
| ~~`NGOAI_PHAM_VI`~~ | **Không dùng** (Q40): tài nguyên ngoài phạm vi ⇒ `KHONG_TIM_THAY` (404) | TK A1, BS A3 |
| `KHONG_TIM_THAY` (404) | Không tìm thấy dữ liệu. | — |
| `DU_LIEU_KHONG_HOP_LE` (400, kèm `loi[{truong, ma}]`) | (theo từng trường) | mọi UC |
| `LICH_HOAT_DONG_KHONG_HOP_LE` (400, kèm `{thu, maLoi}`) | Thứ {n}: {lỗi cụ thể}. | CN A3 |
| `YEU_CAU_DANG_CHO` (409) | Chi nhánh đang có yêu cầu thay đổi chưa hoàn tất. Vui lòng chờ xử lý xong. | Q3 |
| `DICH_VU_CON_BAC_SI` (409) | Không thể bỏ dịch vụ: còn bác sĩ đang dùng làm dịch vụ khám chính. | Q8 |
| `HIEU_LUC_QUA_SOM` (400) | Thời điểm có hiệu lực phải từ {mốc} trở đi. | CN b8 |
| `YEU_CAU_KHONG_QUA_HAN` (409) | Chỉ dời hiệu lực được với yêu cầu đang quá hạn chờ xử lý. | Q48 |
| `YEU_CAU_KHONG_THE_RUT_HUY` (409) | Yêu cầu không còn ở trạng thái cho phép rút/hủy. | Q3, Q47 |
| `HE_THONG_CHUA_CAU_HINH` (409) | Hệ thống chưa được cấu hình. | CH A3 |
| `TEN_CHUYEN_KHOA_TRUNG` / `TEN_NHOM_DICH_VU_TRUNG` / `TEN_DICH_VU_TRUNG` (409) | Tên đã tồn tại. Vui lòng chọn tên khác. | CK A1, DV A1 |
| `NHOM_DICH_VU_KHONG_TON_TAI` (400) / `NHOM_DICH_VU_CON_DICH_VU` (409) | Nhóm dịch vụ không tồn tại. / Nhóm còn dịch vụ nên không xoá được. | DV A1, Q14 |
| `THOI_LUONG_DANG_DUNG` (409) | Dịch vụ đang có lịch/khung giờ nên chưa đổi được thời lượng. | Q16 |
| `CHUC_DANH_HOC_VI_KHONG_TUONG_THICH` (400) | Chức danh và học vị không tương thích. | BS b4 |
| `DICH_VU_KHONG_O_CHI_NHANH` (400) | Dịch vụ khám chính không được cung cấp tại chi nhánh đã chọn. | BS A1, NS A3 |
| `DOI_CHI_NHANH_BI_CHAN` (409, kèm danh sách) | Không thể đổi chi nhánh: bác sĩ còn lịch hẹn đang hoạt động hoặc ca làm việc từ hôm nay trở đi tại chi nhánh hiện tại. | BS A2 |
| `EMAIL_DA_DUNG` (409) | Email này đã được sử dụng. | NS A1 |
| `GUI_MAIL_LOI` (trong `guiEmail`) | Tài khoản đã tạo nhưng gửi email kích hoạt thất bại. Hãy gửi lại liên kết. | NS A4, TK A2 |
| `LIEN_KET_KHONG_HOP_LE` (400) | Liên kết kích hoạt không còn hiệu lực. Vui lòng liên hệ Quản trị viên để được gửi lại. | NS A5 |
| `MAT_KHAU_KHONG_HOP_LE`, `MAT_KHAU_KY_TU_KHONG_HOP_LE`, `XAC_NHAN_KHONG_KHOP` | (dùng nguyên câu chữ auth mục 5.5) | NS A6 |
| `GUI_LAI_QUA_SOM` (429) | Vui lòng thử lại sau. | Q23 |
| `TU_KHOA_TAI_KHOAN` (409) | Không thể tự khoá tài khoản của chính mình. | TK A4 |
| `CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG` (409) | Phải còn ít nhất một Quản trị viên Toàn hệ thống đang hoạt động. | TK A5 |
| `TAI_KHOAN_CHO_KICH_HOAT` (409) | Tài khoản đang chờ kích hoạt. Hãy dùng "Gửi lại liên kết kích hoạt". | TK A6 |
| `TAI_KHOAN_KHONG_CHO_KICH_HOAT` (409) | Tài khoản không còn chờ kích hoạt. Nếu cần đặt lại mật khẩu, dùng "Quên mật khẩu". | TK A3 |
| `TRANG_THAI_KHONG_PHU_HOP` (409) | Trạng thái hiện tại của tài khoản không cho phép thao tác này. | TK b4 |
| `KHONG_CO_THAY_DOI` (400) | Không có thay đổi nào để lưu. | CH, CN |
| `CAU_HINH_GIA_TRI_KHONG_HOP_LE`, `THIEU_LY_DO` (400) | (theo từng thông số) / Vui lòng nhập lý do thay đổi. | CH A1 |
| `ANH_KHONG_HOP_LE` (400) | Ảnh phải là JPEG, PNG hoặc WebP tĩnh, đọc được; giới hạn đầu vào 10 MB/25 MP. Lỗi quá dung lượng/tiền xử lý cần thông báo riêng theo plan P7 mục 3b–3d. | Q13 |

### 5.10 Audit mở rộng (Q39) — tên giá trị được Trung xác nhận ngày 27/10/2026 khi làm P3

Thêm vào `hanh_dong_nhay_cam_enum` (đổi schema 3 file, migration ở P3): `TaoTaiKhoanNhanSu`, `KhoaTaiKhoan`, `MoKhoaTaiKhoan`, `MoKhoaNoShow`, `DuyetThayDoiChiNhanh`, `TuChoiThayDoiChiNhanh`, `RutThayDoiChiNhanh`, `HuyThayDoiChiNhanh`, `DoiHieuLucThayDoiChiNhanh` (Q48); thêm `yeu_cau_thay_doi_chi_nhanh` vào `loai_doi_tuong_enum`. Giữ nguyên `DoiChiNhanhBacSi`, `CapNhatCauHinh`.

| Hành động | `loai_doi_tuong` / `ma_doi_tuong` | `chi_nhanh_id` | `chi_tiet_thay_doi` (không có mật khẩu/token/băm) |
|---|---|---|---|
| `TaoTaiKhoanNhanSu` | `tai_khoan` / id tài khoản mới | chi nhánh của nhân sự (NULL với Toàn hệ thống) | `{loai_tai_khoan, chi_nhanh_id, pham_vi?}` |
| `KhoaTaiKhoan`, `MoKhoaTaiKhoan` | `tai_khoan` / id đích | chi nhánh của đích (nhân sự), NULL (Bệnh nhân/Quản trị viên) | `{truoc:{trang_thai}, sau:{trang_thai}, phien_thu_hoi}` |
| `MoKhoaNoShow` | `benh_nhan` / id Bệnh nhân | NULL | `{truoc:{khoa_dat_lich_do_no_show:true}, sau:{…:false}, so_lan_no_show}` |
| `DoiChiNhanhBacSi` | `tai_khoan` / id bác sĩ | chi nhánh **mới** | `{truoc:{chi_nhanh_id}, sau:{chi_nhanh_id}}` |
| `DuyetThayDoiChiNhanh` | `yeu_cau_thay_doi_chi_nhanh` / id yêu cầu | chi nhánh của yêu cầu | `{hieu_luc_tu, so_ngay_bao_truoc, nguoi_de_xuat_id, so_lich_hen_anh_huong, so_ca_anh_huong}` |
| `TuChoiThayDoiChiNhanh` | như trên | như trên | `{ly_do_tu_choi, nguoi_de_xuat_id}` |
| `RutThayDoiChiNhanh` | như trên | như trên | `{nguoi_de_xuat_id}` |
| `HuyThayDoiChiNhanh` | như trên | như trên | `{ly_do_huy, hieu_luc_tu, qua_han, so_benh_nhan_da_bao}` |
| `DoiHieuLucThayDoiChiNhanh` | như trên | như trên | `{truoc:{hieu_luc_tu}, sau:{hieu_luc_tu}, so_lan_doi_hieu_luc, so_benh_nhan_thong_bao_lai}` |
| `CapNhatCauHinh` | `cau_hinh_he_thong` / 1 | NULL | `{truoc, sau, ly_do}` (có CHECK DB) |

Mọi dòng ghi **trong cùng giao dịch** với thao tác; ghi lỗi ⇒ rollback thao tác (kể cả `CapNhatCauHinh`). `tai_khoan_id` (người thực hiện) lấy từ **phiên**. Việc **áp dụng bởi job** không có người thực hiện (`tai_khoan_id` NOT NULL) nên **không** ghi audit; dấu vết là `ap_dung_luc` (ghi `TECH_DEBT` nếu nhóm muốn có người/hệ thống thực hiện).

## 6. Kế hoạch task

### 6.1 Sơ đồ phụ thuộc (cùng một hàng = làm song song được)

```
auth P1 (apps/api) ── auth P3 (TypeORM + 5 bảng auth + DB test) ──┐
auth P2/P6 (web shell + proxy) ───────────────────────────────────┼─────────────── FE
                                                                   │
P5 thời gian ‖ P6 phân trang ‖ P1 migr. danh mục ─┬─ P2 migr. nhân sự + bảng nền ─ P3 migr. vận hành ─ P4 hạ tầng test
                                                   │
 C3 SystemConfigService (P3) ‖ C1 rbac scope (auth A4 + P2) ‖ C2 audit (Q39) ‖ C4 notification (auth P4, P3, Q9) ‖ C5 seed (P1–P3, auth A1)
                                                   │
 B1 chuyên khoa ‖ B2→B3 dịch vụ ‖ B4 phòng khám        (cần C1, P1/P3)
 B5 cấu hình (C1, C2, C3) ─ B6 lịch sử
 B7 chi nhánh đọc+thêm ─ B8 sửa+ảnh hưởng ─ B9 yêu cầu/từ chối ─ B10 duyệt ─ B11 áp dụng ─ B21 rút/hủy ─ B22 dời hiệu lực quá hạn (C3, C4)
 B12 hồ sơ bác sĩ đọc ─ B13 sửa (C2, B7)
 B14 ActivationLinkService (auth P4, A14) ─ B15 tạo nhân sự (auth A1, C1, B7) ─ B16 kích hoạt (auth A1)
 B17 danh sách TK ─ B18 khoá (auth A3, C2) ‖ B19 no-show ‖ B20 gửi lại (B14)

FE: F1 (auth F1 + P6 web + C1) → F2 ‖ F3 ‖ F4 ‖ F5 ‖ F6a ‖ F7 ‖ F8 ‖ F9 ; F10 (auth F1 + B16) ; F6b (sau B8–B10)
D*: đi cùng PR task code ; X1 kiểm tay → X2 tổng kết → X3 (trước khi mở công khai)
```

### 6.2 Nhóm P — Tiền đề dữ liệu & hạ tầng (admin)

| ☐ | ID | Việc | Phụ thuộc | Bắt đầu | Truy vết | Thẻ / PR gợi ý |
|---|---|---|---|---|---|---|
| ☐ | P1 | Migration + entity **danh mục**: `chi_nhanh`, `chi_nhanh_lich_hoat_dong` (+ 4 CHECK), `chuyen_khoa` (+ **`UNIQUE ten`**, Q12), `nhom_dich_vu`, `dich_vu_kham` (+ **`UNIQUE (nhom_dich_vu_id, ten)`**, Q16), `chi_nhanh_dich_vu_kham`, FK, index — viết tay, đối chiếu từng dòng `clinix_mysql.sql`; **trước khi chạy: truy vấn kiểm tên trùng sau chuẩn hoá (trim, gộp khoảng trắng) và xử lý dữ liệu đã có — migration dừng, liệt kê, nếu còn trùng** | auth P1, P3 | NGAY | CN, CK, DV | `[TIỀN ĐỀ]` `[ĐỒNG BỘ TL]` D6 · `feat(db)` |
| ☐ | P2 | Migration + entity **nhân sự & bảng nền**: `bac_si`, `le_tan`, `quan_tri_vien` (+ CHECK), `phu_phi_bac_si`, `ho_so_nguoi_than`, `lich_lam_viec`, `khung_gio`, `lich_hen` (cột sinh `khung_gio_dang_giu` UNIQUE, FK kép); entity **chỉ-đọc** cho bảng nền | P1, auth P3 | NGAY sau P1 (Q41: admin sở hữu migration nền; `booking`/`schedule` không tạo lại) | BS, NS, TK, CN | `[TIỀN ĐỀ]` · `feat(db)` |
| ☐ | P3 | Migration + entity **vận hành**: `yeu_cau_thay_doi_chi_nhanh` (+ `_lich_hen`, 2 CHECK), `thong_tin_phong_kham`, `cau_hinh_he_thong` (+ 3 CHECK, `JSON_SCHEMA_VALID`), `nhat_ky_hanh_dong` (+ CHECK; **enum mở rộng — Q39, mục 5.10**), `thong_bao` (UNIQUE), `email_thong_bao` (+ CHECK); **`DaRut`/`DaHuy` + `nguoi_huy_id`/`thoi_diem_huy`/`ly_do_huy` + cột sinh UNIQUE `dang_mo_chi_nhanh` + `qua_han_luc` + `so_lan_doi_hieu_luc` + sửa `chk_yc_chi_nhanh_xu_ly`; `email_thong_bao.trang_thai` thêm `BoQua` + sửa CHECK; enum nhật ký thêm `DoiHieuLucThayDoiChiNhanh` (Q47, Q48)**. **Không** chèn dòng cấu hình (quy tắc 35) | P1, P2 | NGAY (phần không phụ thuộc P2) | CN, PK, CH | `[TIỀN ĐỀ]` · `feat(db)` |
| ☐ | P4 | Hạ tầng **test tích hợp admin**: factory/fixture (chi nhánh, 7 thứ, bác sĩ, lịch hẹn theo trạng thái, ca, khung giờ, tài khoản các loại), đồng hồ giả, `MailService` giả, helper chạy song song (`Promise.all`) cho test chạy đua | auth P3, P1 | NGAY | tất cả test | `[TIỀN ĐỀ]` · `test(admin)` |
| ☐ | P5 | `common/time`: `nowVN()`, `todayVN()`, `weekdayVN()`; cấu hình `TZ`, TypeORM `timezone` **và `SET time_zone = '+07:00'` mỗi kết nối MySQL** (+ `TZ` container `db`); test biên 23:59/00:00 gồm `NOW()` phía DB | auth P1 | NGAY | BS b4, CN b8, H13 | `[TIỀN ĐỀ]` · `feat(api)` |
| ☐ | P6 | `common/paging`: `PageQueryDto`, `Paged<T>`, helper escape LIKE; test | auth P1 | NGAY | TK b2, danh sách | `[TIỀN ĐỀ]` · `feat(api)` |
| ☐ | P7 | Tải ảnh qua `UploadService` + adapter Cloudinary từ backend; magic bytes ảnh tĩnh JPEG/PNG/WebP đầu vào ≤ 10 MB/25 MP; ảnh ≤ 2 MB không chủ động resize/nén; > 2 MB đến 10 MB nén trước/resize khi cần, output ≤ 2 MB (mục tiêu mềm 700–800 KB); tự chuẩn hóa EXIF, giữ alpha/tỷ lệ, không phóng to/crop, định danh ngẫu nhiên, cấm SVG; cấu hình mẫu + DEV_SETUP, mock provider và test nhánh dung lượng/nén/resize/EXIF; bảng upload + FK, uploadId và vòng đời ba trạng thái đã duyệt; DDL/cấu hình/SDK đã triển khai; evidence tại tracker P7. Bỏ volume/proxy ảnh. Plan và nháp issue #51: `working-doc/P7/plan.md` | auth P1; guard auth A4 và policy C1 cho controller; phối hợp B1/F2 | VERIFIED local; Cloudinary thật/B1/F2 acceptance pending | CK b2; CK-11, SE-A7 | `[TIỀN ĐỀ]` · `feat(api)` |

### 6.3 Nhóm C — Thành phần dùng chung

| ☐ | ID | Việc | Phụ thuộc | Bắt đầu | Truy vết | Thẻ |
|---|---|---|---|---|---|---|
| ☐ | C1 | **`rbac`** (mục 5.2): `AdminScopeService`, `@RequireAdminScope`, `AdminScopeGuard`, `BranchAccessPolicy`, decorator tham số, `GET /admin/me`, test duyệt toàn bộ route admin phải có decorator | auth A4, P2 (`quan_tri_vien`); Q40 | SOẠN TRƯỚC (policy thuần + unit test) · controller **SAU auth A4** (Q40: ngoài phạm vi ⇒ 404) | mọi UC (phạm vi); SOW 3.2.1 | `feat(rbac)` |
| ☐ | C2 | **`AuditService`** tối thiểu: `record(manager, entry)` chạy trong giao dịch của người gọi; kiểm cấu trúc `chi_tiet_thay_doi`; hỗ trợ các hành động mở rộng (5.10); từ chối mọi trường có dạng mật khẩu/token; không có màn xem | P3; Q39 | NGAY (sau P3) | CH, BS (đổi chi nhánh), TK, SOW 3.2.4 | `feat(audit)` |
| ☐ | C3 | **`SystemConfigService`**: `get()` (null nếu chưa có), `getOrThrow()` ⇒ `HE_THONG_CHUA_CAU_HINH`; kiểm cảnh báo khởi động khi chưa có dòng (quy tắc 35); module xuất ra dùng chung | P3 | NGAY | CH A3; CN (số ngày báo trước) | `feat(admin)` |
| ☐ | C4 | **`notification` tối thiểu**: `NotificationService` (tạo `thong_bao` + `email_thong_bao ChoGui` trong giao dịch của người gọi, idempotent theo UNIQUE), `email-outbox.worker` (nhận việc bằng `UPDATE` có điều kiện, `MailService`, thử lại), mẫu email 689:2 và 690:2 (dựng trên khung mẫu auth A14); **báo người đề xuất khi duyệt/từ chối/rút/hủy; ghi và hiển thị trạng thái gửi thất bại; dừng email còn chờ gửi khi yêu cầu bị hủy/dời hiệu lực (`BoQua`); cảnh báo quá hạn cho Toàn hệ thống** | P3, auth P4, auth A14, auth P5; Q9 | SAU auth P4 | CN b9, A2, A4 | `feat(notification)` |
| ☐ | C5 | **Seed**: `seed:catalog` (chuyên khoa, nhóm, dịch vụ, chi nhánh + 7 thứ + dịch vụ khả dụng, `thong_tin_phong_kham`), `seed:dev-accounts`, `seed:first-admin`, `seed:config-dev`; idempotent; từ chối khi `NODE_ENV=production` (trừ `first-admin`); dữ liệu ghi rõ là minh hoạ; `.env.example`, `docs/DEV_SETUP.md` | P1–P3, auth A1; Q30, Q35, Q36, Q44 | NGAY (catalog, sau P1–P3); `first-admin` SAU auth A1 | H18, CH A3/1c | `feat(db)` · `[ĐỒNG BỘ TL]` D8 |

### 6.4 Nhóm B — Backend theo use case

| ☐ | ID | Việc | Phụ thuộc | Bắt đầu | Truy vết | Thẻ |
|---|---|---|---|---|---|---|
| ☐ | B1 | **Chuyên khoa**: list/get/create/update/đổi trạng thái; chuẩn hoá (trim + gộp khoảng trắng) + kiểm trùng tên (bắt thêm lỗi UNIQUE khi chạy đua); ngừng hoạt động **không** gỡ bác sĩ; ảnh qua P7: imageUploadId và FK bản ghi ảnh, gắn/thay/gỡ theo plan P7 mục 3; Chi nhánh chỉ GET | P1, P6, C1; Q11, Q12, Q13 | SOẠN TRƯỚC; controller sau C1 | CK b1–b5, A1, A2 | `feat(admin)` |
| ☐ | B2 | **Nhóm dịch vụ**: list/create/update/(delete); tên không trùng; `thu_tu_hien_thi` | P1, P6, C1; Q11, Q14, Q15 | SOẠN TRƯỚC; controller sau C1 | DV b1–b5, A1 | `feat(admin)` |
| ☐ | B3 | **Dịch vụ khám**: list/create/update; kiểm nhóm tồn tại, tên không rỗng, giá > 0, thời lượng nguyên dương; không nhận `mucDatCoc`; kiểm sửa `thoi_luong` (Q16: chặn khi còn khung giờ tương lai/lịch hẹn hoạt động); tên không trùng trong nhóm (UNIQUE DB) | B2, P2 (kiểm khung giờ/lịch hẹn); Q16 | SOẠN TRƯỚC | DV b4–b5, A1 | `feat(admin)` |
| ☐ | B4 | **Thông tin phòng khám**: `GET/PUT` (upsert `id=1`), kiểm email/hotline (Q33), chỉ Toàn hệ thống (cả `GET`) | P3, C1; Q33 | SOẠN TRƯỚC | PK b1–b5, A1, A2 | `feat(admin)` |
| ☐ | B5 | **Cập nhật cấu hình**: `GET/PUT`; miền giá trị (5.7); diff; `ly_do`; giao dịch + Audit; tạo lần đầu; cờ `chuaCauHinh` | P3, C1, C2, C3; Q34, Q35, Q36, Q38, Q39 | SAU C2 | CH b1–b5, A1–A4 | `feat(admin)` · `[ĐỒNG BỘ TL]` D5, D6 |
| ☐ | B6 | **Lịch sử thay đổi cấu hình**: `GET …/history` đọc `nhat_ky_hanh_dong` loại `CapNhatCauHinh`, phân trang, chỉ Toàn hệ thống | B5, C2, P6; Q37, Q39 | SAU B5 | CH (Figma 578:2) | `feat(admin)` |
| ☐ | B7 | **Chi nhánh — đọc + thêm mới**: list/get (kèm lịch 7 thứ, dịch vụ, cờ yêu cầu chờ; Chi nhánh chỉ chi nhánh mình); `POST` giao dịch {chi nhánh + 7 dòng + dịch vụ}, chỉ Toàn hệ thống; `validateWeeklySchedule` | P1, C1, P6; Q1, Q10 | SOẠN TRƯỚC (validator) | CN b1–b2, b4, A1, A3 | `feat(admin)` · `[ĐỒNG BỘ TL]` D1 |
| ☐ | B8 | **Chi nhánh — sửa + phát hiện ảnh hưởng**: diff; `BranchImpactService` (lịch hẹn, ca, khung giờ, bỏ dịch vụ); nhánh áp dụng ngay (không lịch hẹn **và không ca** ảnh hưởng) / tạo yêu cầu `ChoDuyet`; `UnresolvedImpactGate` (Q7); kiểm Q3, Q8; Q2 cho phần tên/địa chỉ/toạ độ (nêu rõ phần đã lưu/đang chờ) | B7, P2, C3; Q1, Q2, Q3, Q7, Q8, Q41, Q46 | SOẠN TRƯỚC (impact thuần theo truy vấn mẫu); kiểm "yêu cầu đang mở" ở DB (Q47) | CN b3–b6, A3 | `feat(admin)` · `[ĐỒNG BỘ TL]` D1 |
| ☐ | B9 | **Yêu cầu thay đổi — xem + từ chối**: list (lọc trạng thái, Chi nhánh chỉ chi nhánh mình), detail (tính lại ảnh hưởng — Q46), `reject` (lý do, thông báo người gửi); hiển thị trạng thái gửi email (`DaGui`/`ThatBai`) | B8, C1, C4; Q4, Q9, Q46 | SAU B8, C4 | CN b7, A2 | `feat(admin)` |
| ☐ | B10 | **Yêu cầu thay đổi — duyệt**: giao dịch (chụp số ngày, kiểm `hieu_luc_tu`, ghi bảng ảnh hưởng, thông báo + email theo bệnh nhân, `DaDuyet`; **không chặn duyệt** khi còn lịch/ca ảnh hưởng — Q48 = B); hàm đọc `getPendingEffectiveChanges` cho `booking` (**`booking` chặn đặt và đổi lịch**, Q6; trả cả yêu cầu **quá hạn**) | B9, C3, C4; Q4, Q5, Q6, Q9, Q48 | SAU B9, C4 | CN b7–b9, A4 | `feat(admin)` |
| ☐ | B11 | **Áp dụng khi có hiệu lực**: `apply.job.ts` (cron), idempotent; **tính lại lịch/ca chưa xử lý trước khi áp dụng (Q7, Q46): còn ⇒ KHÔNG áp dụng, đặt `qua_han_luc`, cảnh báo Admin Toàn hệ thống + người đề xuất, không tự hủy/đổi/hoàn tiền; KHÔNG tự áp dụng muộn khi rỗng lại (job chỉ chọn `qua_han_luc IS NULL`)**; sạch ⇒ thay cả dòng thứ + dịch vụ, `ap_dung_luc` (Q48) | B10 (`@nestjs/schedule` dùng như auth A7), C4 | SAU B10 | CN b10 | `feat(admin)` |
| ☐ | B12 | **Hồ sơ bác sĩ — đọc**: list/get (lọc chuyên khoa, Chi nhánh chỉ chi nhánh mình), `computeSurcharge` (+ test bảng) | P2, C1, P6; Q21 | SOẠN TRƯỚC (`computeSurcharge`) | BS b1–b2 | `feat(admin)` |
| ☐ | B13 | **Hồ sơ bác sĩ — sửa**: toàn bộ kiểm (b4), chặn đổi chi nhánh **và đổi dịch vụ khám chính** (A2, Q17), quyền đổi chi nhánh ở service (A3), khoá `FOR UPDATE`, Audit `DoiChiNhanhBacSi`, không lưu một phần | B12, B7, P5, C2; Q17, Q18, Q19, Q20, Q39 | SAU B12, C2 | BS b3–b5, A1–A3 | `feat(admin)` · `[ĐỒNG BỘ TL]` D5 |
| ☐ | B14 | **`ActivationLinkService`**: sinh/băm token, tạo hàng, gửi mail (ngoài giao dịch), xác nhận hiệu lực/thu hồi theo quy tắc 21, kiểm giới hạn gửi lại; mẫu email 674:2 và 675:2 (dựng trên khung auth A14) | auth P4, auth A14, auth P5, P3; Q22, Q23, Q25 | SOẠN TRƯỚC | NS b6, A4; TK A2 | `feat(admin)` · `[ĐỒNG BỘ TL]` D3, D6 |
| ☐ | B15 | **Tạo tài khoản nhân sự**: kiểm quyền/chi nhánh/vai trò (A2, A3); email (auth A1 + Q32); trường theo vai trò; giao dịch {tài khoản + hồ sơ + liên kết}; trả `guiEmail` | B14, C1, P2, auth A1, auth P4, auth A5 (`UnverifiedPatientCleaner.purgeIfExpired`); Q19, Q20, Q24, Q32, Q39 | SAU B14; phần email trùng tài khoản hết hạn **SAU khi auth A5 merge** (Q32), không chờ job A7 | NS b1–b7, A1–A4 | `feat(admin)` · `[ĐỒNG BỘ TL]` D3 |
| ☐ | B16 | **Kích hoạt (công khai)**: `validate` + `complete` (5.5); `@Public`; lỗi chung; `da_xac_minh_email = true` | B14, auth A1, auth A4; Q24, Q25 | SAU B14 | NS b8–b12, A5, A6 | `feat(admin)` |
| ☐ | B17 | **Danh sách + chi tiết tài khoản**: lọc vai trò/trạng thái/cờ no-show/chi nhánh/tìm kiếm; phạm vi qua `BranchAccessPolicy`; Chi nhánh xem Bệnh nhân với 6 trường (họ tên, email, SĐT, ngày sinh, giới tính, trạng thái — Q26); không thấy Quản trị viên (Q27); ngoài phạm vi ⇒ 404 (Q40) | P2, C1, P6; Q26, Q27, Q41, Q42 | SOẠN TRƯỚC | TK b1–b2 | `feat(admin)` |
| ☐ | B18 | **Khoá / Mở khoá**: ma trận 5.6, thứ tự kiểm, khoá hàng Toàn hệ thống, thu hồi phiên; khoá Bác sĩ trả danh sách lịch hẹn/ca phụ thuộc (Q28); mở khoá xoá bộ đếm/khoá tạm | B17, auth A3 (`SessionService`), auth A4, C2; Q28, Q29, Q39 | SAU B17, auth A3 | TK b3–b7, A1, A4–A6 | `feat(admin)` · `[ĐỒNG BỘ TL]` D4 |
| ☐ | B19 | **Mở khoá no-show**: chỉ Toàn hệ thống, chỉ Bệnh nhân; tắt `khoa_dat_lich_do_no_show`, **không** đổi `so_lan_no_show`/`trang_thai` | B17, C2; Q31, Q39 | SAU B17 | TK hậu điều kiện (no-show) | `feat(admin)` |
| ☐ | B20 | **Gửi lại liên kết kích hoạt**: A2/A3, quyền theo 5.6, giới hạn, liên kết cũ giữ khi gửi lỗi | B14, B17; Q23 | SAU B14 | TK b3, A2, A3 | `feat(admin)` |
| ☐ | B21 | **Rút / Hủy yêu cầu thay đổi** (Q3): `withdraw` (người gửi, `ChoDuyet`), `cancel` (Toàn hệ thống, `DaDuyet` với `ap_dung_luc IS NULL` — **kể cả khi `hieu_luc_tu` đã qua/quá hạn**, lý do bắt buộc); khoá hàng; audit riêng (5.10); thông báo người đề xuất và bệnh nhân đã được báo; **dừng email thông báo thay đổi còn chờ gửi (`BoQua`)**; giải phóng "yêu cầu đang mở" | B9, B10, C2, C4; Q3, Q9, Q39, Q47 | SAU B10 | CN (hệ quả Q3) | `feat(admin)` · `[ĐỒNG BỘ TL]` D1, D6 |
| ☐ | B22 | **Quá hạn: dời hiệu lực** (Q48): `reschedule` (Toàn hệ thống, chỉ khi quá hạn; `hieu_luc_tu` mới `>=` bây giờ + N ngày; tính lại và thay bản chụp lịch hẹn ảnh hưởng; thông báo + email lại cho bệnh nhân; dừng email cũ; audit `DoiHieuLucThayDoiChiNhanh`); cảnh báo quá hạn trong ứng dụng cho Toàn hệ thống + người đề xuất (nếu chưa làm ở B11) | B11, B21, C3, C4; Q48 | SAU B11 | CN b10 (nhánh quá hạn) | `feat(admin)` · `[ĐỒNG BỘ TL]` D1, D6, D7 |

### 6.5 Nhóm F — Frontend (chỉ làm đúng frame Figma; trạng thái chưa có frame: mục 4.4)

| ☐ | ID | Việc | Phụ thuộc | Truy vết | Thẻ |
|---|---|---|---|---|---|
| ☐ | F1 | **Khung Admin**: layout thanh bên theo phạm vi (`GET /admin/me`), route guard theo vai trò + phạm vi, thay trang giữ chỗ Quản trị viên của auth F1, thành phần dùng chung (bảng phân trang, ô tìm kiếm, hộp xác nhận, panel chi tiết, thông báo lỗi sẵn có), trang "không đủ quyền" | auth F1, auth P6(web), C1, P6 | mọi UC | `feat(web)` |
| ☐ | F2 | **Chuyên khoa**: danh sách, Thêm/Chỉnh sửa, đổi trạng thái, lỗi trùng tên giữ dữ liệu; Chi nhánh chỉ xem (banner) | F1, B1 | CK b1–b5, A1, A2 | `feat(web)` |
| ☐ | F3 | **Loại dịch vụ khám**: tab Nhóm/Dịch vụ, Thêm/Sửa, xác nhận xoá nhóm; Chi nhánh chỉ xem | F1, B2, B3 | DV b1–b5, A1 | `feat(web)` |
| ☐ | F4 | **Thông tin phòng khám — tab "Thông tin chung"**: form 4 trường, lỗi định dạng; Chi nhánh bị từ chối | F1, B4 | PK b1–b5, A1, A2 | `feat(web)` |
| ☐ | F5 | **Cài đặt hệ thống**: các nhóm/tab, nhập lý do, "Xác nhận lưu thay đổi", "Đã lưu", lỗi từng ô, trạng thái "chưa có cấu hình", tab "Lịch sử thay đổi" | F1, B5, B6 | CH b1–b5, A1–A4 | `feat(web)` |
| ☐ | F6a | **Chi nhánh — danh sách + Thêm mới**: tab "Chi nhánh", form 7 thứ (hai khoảng), dịch vụ khả dụng, lỗi lịch theo thứ | F1, B7 | CN b1–b4, A1, A3 | `feat(web)` |
| ☐ | F6b | **Chi nhánh — Sửa lịch/dịch vụ + yêu cầu thay đổi (gồm nhánh quá hạn)**: kết quả "đã lưu ngay" / "đã gửi chờ duyệt", danh sách yêu cầu (Chờ duyệt/Đã duyệt/Từ chối), chi tiết + lịch hẹn ảnh hưởng, Duyệt (chọn thời điểm), Từ chối (lý do), Rút (người gửi), Hủy (Toàn hệ thống, có lý do), trạng thái **"Quá hạn – chờ xử lý"** (danh sách lịch/ca cần xử lý, banner cảnh báo) + nút **Dời hiệu lực** (chọn thời điểm mới) / **Hủy**, nhãn `hieu_luc_tu` = **"dự kiến có hiệu lực"** và `ap_dung_luc` = **"đã áp dụng lúc"**, hiển thị trạng thái gửi email thất bại, nêu rõ phần đã lưu/đang chờ (Q2), banner "chưa cấu hình số ngày báo trước" | F6a, B8–B10, B21, B22 | CN b3–b10, A2 | `feat(web)` |
| ☐ | F7 | **Hồ sơ bác sĩ**: danh sách (giá dịch vụ), panel Hồ sơ/Chỉnh sửa, học vị điền sẵn, trường chi nhánh khoá với Chi nhánh, **hiển thị danh sách lịch hẹn/ca đang chặn** (A2), giữ dữ liệu khi lỗi | F1, B12, B13 | BS b1–b5, A1–A3 | `feat(web)` |
| ☐ | F8 | **Nhân sự & Tài khoản**: tab Nhân sự (lọc), Tạo tài khoản nhân sự (3 vai trò, lỗi bỏ trống, "Tạo thành công", **trạng thái gửi mail lỗi**), chi tiết (Chờ kích hoạt: hạn + "Gửi lại email kích hoạt"; Đang hoạt động: khoá/mở khoá + xác nhận) | F1, B15, B17, B18, B20 | NS b1–b7, A1–A4; TK | `feat(web)` |
| ☐ | F9 | **Tài khoản bệnh nhân**: danh sách, chi tiết (Toàn hệ thống: khoá/mở khoá, mở khoá no-show — nút **chỉ hiện khi đang bị khoá** và báo rõ no-show kế tiếp có thể khoá lại (Q31); Chi nhánh: chỉ xem), xác nhận khoá | F1, B17–B19 | TK b2–b7, A1 | `feat(web)` |
| ☐ | F10 | **Trang `/kich-hoat`** (công khai): đọc fragment, xoá khỏi URL, form mật khẩu mới + xác nhận, "Link không hợp lệ", "Kích hoạt thành công" → Đăng nhập; dùng validator mật khẩu chung với auth | auth F1, auth P6(web), B16 | NS b8–b12, A5, A6 | `feat(web)` |

### 6.6 Nhóm D — Đồng bộ tài liệu (đi cùng PR của task code tương ứng)

2.4 là file Word ở repo `TLCN_CLINIX` → cập nhật bằng commit ở repo đó, dẫn link trong PR này. `docs/database/*`: sửa **cả ba file** (`clinix.dbml`, `clinix_mysql.sql`, `clinix_quy_tac_nghiep_vu.md`) cho khớp nhau + dòng lịch sử đầu `clinix.dbml`; **phối hợp thứ tự với auth D2/D3/D7** (3.3).

| ID | Nội dung | Đi cùng | Từ |
|---|---|---|---|
| D1 | 2.4 **CN**: hai khoảng sáng/chiều; nhãn "giờ nhận khám"; phần tên/địa chỉ/toạ độ áp dụng ngay (Q2); danh sách ảnh hưởng tính lại + ghi lúc duyệt + kiểm lại trước khi áp dụng (Q46); 1 yêu cầu chưa hoàn tất/chi nhánh, người gửi rút khi `ChoDuyet`, Toàn hệ thống hủy khi `DaDuyet` chưa hiệu lực (Q3, Q47); tự duyệt (Q4); người duyệt chọn hiệu lực (Q5); `booking` chặn đặt và đổi lịch (Q6); **quy trình quá hạn** (Q7, Q48 = B): cho duyệt + báo trước N ngày; đến `hieu_luc_tu` job tính lại — còn lịch/ca thì không áp dụng, đánh dấu quá hạn, không tự áp dụng muộn, Admin dời hiệu lực (≥ N ngày, thông báo lại) hoặc hủy; `hieu_luc_tu` = thời điểm **dự kiến**, `ap_dung_luc` = lúc **thực sự** áp dụng; **ca tương lai cũng là ảnh hưởng**; Toàn hệ thống từ chối yêu cầu `ChoDuyet`/hủy yêu cầu `DaDuyet` chưa áp dụng (Q47); chặn bỏ dịch vụ còn bác sĩ (Q8); thông báo người gửi khi duyệt (Q9); toạ độ (Q10) | B7, B8, B10 | Q1–Q10, Q46 |
| D2 | 2.4 **CK, DV**: Chi nhánh chỉ xem (Q11); xoá nhóm + thứ tự (Q14); bật/tắt (Q15); chặn đổi thời lượng + tên dịch vụ không trùng trong nhóm (Q16) | B1–B3 | Q11, Q14–Q16 |
| D3 | 2.4 **NS**: thêm SĐT (Q24); TTL 24 giờ, giới hạn gửi lại (Q22, Q23); `da_xac_minh_email = true`; chuyên khoa chỉ đang hoạt động (Q19); email trùng tài khoản hết hạn (Q32) | B14–B16 | Q19, Q22–Q24, Q32 |
| D4 | 2.4 **TK**: danh sách không có Quản trị viên với Chi nhánh (Q27); trường hành chính (Q26); mở khoá đặt lại bộ đếm (Q28); thu hồi phiên (Q29); vị trí mở khoá no-show (Q31); tài nguyên ngoài tầm nhìn trả 404 thay vì "không có quyền" (Q40) | B17–B19 | Q26–Q29, Q31 |
| D5 | 2.4 **BS, PK, CH**: chặn đổi dịch vụ chính (Q17); "ca hôm nay" (Q18); học vị/kinh nghiệm (Q20); hotline + bắt buộc (Q33); lý do bắt buộc 1–500 ký tự (Q38); `so_ngay_bao_truoc_doi_gio_lam` 1–60 (Q34) | B4, B5, B13 | Q17, Q18, Q20, Q33, Q38 |
| D6 | `docs/database/*` (3 file): `UNIQUE chuyen_khoa.ten` (Q12) và `UNIQUE dich_vu_kham (nhom_dich_vu_id, ten)` (Q16); `yeu_cau_thay_doi_chi_nhanh`: `DaRut`/`DaHuy`, cột huỷ, `qua_han_luc`, `so_lan_doi_hieu_luc`, cột sinh UNIQUE `dang_mo_chi_nhanh`, sửa `chk_yc_chi_nhanh_xu_ly`, ghi chú **`hieu_luc_tu` = thời điểm dự kiến / `ap_dung_luc` = lúc thực sự áp dụng** (Q47, Q48); `email_thong_bao.BoQua`; quy tắc 31 viết lại theo luồng quá hạn; enum nhật ký mở rộng (Q39, 5.10); quy tắc phụ phí "tắt mốc cao → mốc thấp hơn" ghi là **quyết định giá của nhóm** (Q21); ghi chú `ma_xac_thuc` KichHoatNhanSu (TTL, giới hạn gửi lại, token băm, URL); cận trên cấu hình + giá trị đã chốt (Q34, Q36); quy tắc 13/29 ("ca hôm nay"), 30–32 (đã chốt từng điểm `[cần điền]`), 36; không thêm cột trạng thái nhóm/dịch vụ (Q15); `phu_phi` ghi chú đọc; dòng lịch sử đầu `clinix.dbml` (số bảng/enum/CHECK nếu đổi) | P1, B5, B10, B14, C2 | Q12, Q15, Q22–Q23, Q34, Q36, Q39 |
| D7 | Figma: trạng thái còn thiếu (4.4) **gồm "Quá hạn – chờ xử lý", Dời hiệu lực, Hủy, Rút, nhãn "dự kiến"/"đã áp dụng lúc", email "hủy"/"dời hiệu lực"**, dòng Admin trong danh sách chi nhánh (L9), nút mở khoá no-show (L10), nhãn giờ nhận khám, ô SĐT Quản trị viên | các F-task | 4.4 |
| D8 | `.env.example` (mọi biến mới), `docs/DEV_SETUP.md` (seed, `first-admin`, cấu hình Cloudinary và quản lý/hạn mức ảnh, Gmail cho email kích hoạt) | C5, P7, B14 | 5.1 |
| D9 | `docs/PLAN.md` (tick "Chức năng quản trị tối thiểu" Phase 2), `docs/TRACKING.md` (đúng **một** dòng), `docs/TECH_DEBT.md` (ảnh cục bộ, không có cách ghi "vẫn tiếp nhận theo lịch cũ" cho từng lịch hẹn/ca bị ảnh hưởng (Q7), throttling X3, mất phản hồi email…) | X2 | — |
| D10 | 2.4 **phạm vi (Q40)**: BS A3, TK A1, NS A3, CN A1: phân biệt "ngoài tầm nhìn ⇒ không tìm thấy (404)" và "thấy được nhưng không có quyền ⇒ không đủ quyền (403)"; trang/chức năng chỉ-Toàn-hệ-thống vẫn báo "không đủ quyền" | C1, B13, B15, B17, B18 | Q40 |

### 6.7 Nhóm X — Hoàn tất

| ☐ | ID | Việc | Phụ thuộc |
|---|---|---|---|
| ☐ | X1 | Chạy tay trên `docker compose` với **Gmail SMTP thật**: tạo nhân sự → nhận email → kích hoạt → đăng nhập; gửi lại liên kết (cả đường gửi lỗi bằng App Password sai); duyệt yêu cầu thay đổi chi nhánh → email bệnh nhân (kể cả lỗi); kiểm hai phạm vi trên giao diện thật; điền kết quả vào `TRACKING.md`; độ phủ test module (mục tiêu ≥ 70% — `docs/PLAN.md` Phase 4) | B*, F*, C* |
| ☐ | X2 | Tổng kết: D9; kiểm mọi dòng `AI_USAGE_LOG.md`; chuẩn bị phần giải thích luồng cho vấn đáp (phạm vi, giao dịch duyệt/áp dụng, kích hoạt, chặn đổi chi nhánh) | X1 |
| ☐ | X3 | **Trước khi mở công khai** (ngoài phạm vi TLCN hiện tại): giới hạn request cho `/staff-activation/*` và API admin theo IP/tài khoản; kiểm thử | X2 |

### 6.8 Việc nào bắt đầu ngay, việc nào phải chờ `auth`

| Nhóm | Việc | Điều kiện |
|---|---|---|
| **BẮT ĐẦU NGAY** (chỉ cần nền auth P1/P3, **không** cần tính năng auth) | P1, P3 (phần không phụ thuộc P2), P4, C3; P2 nếu Q41 đồng ý | auth P1 (`apps/api`) + auth P3 (TypeORM, DB test) đã merge. Nếu chưa merge: soạn SQL migration và logic thuần trước, ghép sau |
| **SOẠN TRƯỚC** (logic thuần + unit test, ghép controller sau) | `BranchAccessPolicy` (C1), `validateWeeklySchedule`, `BranchImpactService`, `computeSurcharge`, `account-permission.policy`, validator DTO chuyên khoa/dịch vụ, `ActivationLinkService` (với `MailService` giả) | không cần guard thật |
| **Chờ auth A4** (guard) | mọi controller (`/admin/*`), C1 hoàn chỉnh | `JwtAuthGuard`, `RolesGuard`, `@CurrentUser` |
| **Chờ auth A1** | B15, B16 (validator email/SĐT/mật khẩu, `PasswordHasher`), C5 (băm mật khẩu seed) | |
| **Chờ auth P4 / A14** | B14, C4 (gửi mail, mẫu email) | `MailService`, khung mẫu |
| **Chờ auth A3** | B18 (thu hồi phiên hàng loạt) | `SessionService` |
| **Chờ auth F1 / P6(web)** | F1–F10 | lõi xác thực FE, router, API client |
| **Chờ nhóm trả lời** | Không còn `[CHỜ …]`. Còn: phần còn lại của Q45; **SAU khi auth A5 merge**: phần Q32 của B15 (dùng `purgeIfExpired`, không chờ A7); xác nhận chi tiết Q47/Q48 khi viết migration | 4.2a, 4.3 |

## 7. Test case dự kiến

Loại: **U** = unit, **I** = tích hợp MySQL thật, **C** = component/FE (Vitest), **M** = chạy tay (Gmail thật). Cột "Phủ" là nơi truy vết. Ghi kết quả vào `TRACKING.md`.
Ca có `[Qn]` phụ thuộc điểm còn mở — mong đợi là đề xuất. Test tự động dùng `MailService` giả và đồng hồ giả.

### 7.1 Quản lý chuyên khoa (CK)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| CK-01 | Toàn hệ thống tạo chuyên khoa hợp lệ (tên, mô tả, ảnh tuỳ chọn) | Có dòng mới, mặc định `DangHoatDong`; thông báo thành công | CK b3–b5 | I |
| CK-02 | Tên rỗng / chỉ khoảng trắng / > 100 ký tự | 400, không tạo | CK b4 | U |
| CK-03 | Tên trùng chuyên khoa khác (y hệt) | `TEN_CHUYEN_KHOA_TRUNG`, không đổi gì | CK A1/4a–4b | I |
| CK-04 | Trùng khác hoa/thường, khác dấu ("Tim mach"), thừa/gộp khoảng trắng | Vẫn là trùng | CK A1; H14 | I |
| CK-05 | Sửa mà giữ nguyên tên của chính nó | Thành công (không tự trùng) | CK b4 | I |
| CK-06 | Sửa đổi sang tên của chuyên khoa khác | `TEN_CHUYEN_KHOA_TRUNG`; sửa tên khác rồi gửi lại thành công | CK A1/4c | I |
| CK-07 | Chuyển `NgungHoatDong` khi còn bác sĩ gán | Thành công; `bac_si.chuyen_khoa_id` **không** đổi; số bác sĩ gán không đổi | CK A2 | I |
| CK-08 | Ngừng rồi bật lại | `DangHoatDong` | CK b1–b5 | I |
| CK-09 | Ngừng chuyên khoa đang ngừng (lặp) | Idempotent (200), không lỗi | CK b5 | I |
| CK-10 | Hai yêu cầu tạo cùng tên song song | Đúng 1 dòng; yêu cầu kia nhận `TEN_CHUYEN_KHOA_TRUNG`, không 500 `[Q12]` | CK A1; H14 | I |
| CK-11 | Ảnh: JPEG/PNG/WebP hợp lệ; sai định dạng; đuôi đúng nội dung sai (exe đổi đuôi); SVG/ảnh động/hỏng; biên 2 MB/10 MB/25 MP đầu vào, 2 MB đầu ra; ảnh nhỏ không chủ động resize/nén, ảnh lớn nén trước/resize khi cần; alpha, không phóng to/crop, chuẩn hóa EXIF 1–8 và preview kết quả; tên có `../`; provider lỗi/timeout `[Q13]` | Hợp lệ resize/nén theo plan P7 mục 3d trước khi gọi adapter Cloudinary và trả uploadId/url/expiresAt theo working-doc/P7/plan.md mục 3b; đầu vào sai trả lỗi phù hợp theo mục 3b–3d; đầu vào sai/tiền xử lý lỗi/đầu ra vượt trần không gọi provider; lỗi provider không báo thành công, giữ tham chiếu cũ. Test tự động dùng fake adapter, test thật tách riêng | CK b2; H15 | I |
| CK-12 | Mô tả rỗng được; mô tả rất dài | Rỗng hợp lệ; giới hạn độ dài trả 400 | CK b2 | U |
| CK-13 | Quản trị viên Chi nhánh `GET` / `POST` / `PATCH` / đổi trạng thái `[Q11]` | `GET` được; ghi ⇒ 403 | CK b1; L4 | I |
| CK-14 | Ép lỗi DB giữa chừng khi lưu | Rollback, không đổi gì | CK hậu điều kiện thất bại | I |
| CK-15 | FE: lỗi trùng tên | Hiện lỗi tại ô tên, giữ nguyên dữ liệu đã nhập, quay lại bước 3 | CK A1/4c | C |
| CK-16 | Danh sách "đang hoạt động" cho dropdown không chứa chuyên khoa ngừng `[Q19]` | Đúng | CK; BS | I |
| CK-17 | Danh sách có `soBacSi`, lọc trạng thái, tìm theo tên/mô tả, phân trang | Đúng số lượng; `total` đúng | CK b1 | I |
| CK-18 | Migration `UNIQUE ten` khi dữ liệu có sẵn hai chuyên khoa trùng sau chuẩn hoá | Truy vấn kiểm **dừng migration** và liệt kê bản ghi trùng; không mất dữ liệu | Q12 | I |

### 7.2 Quản lý loại dịch vụ khám (DV)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| DV-01 | Tạo nhóm hợp lệ (có `thu_tu_hien_thi` `[Q14]`) | Có dòng mới | DV b4–b5 | I |
| DV-02 | Tên nhóm rỗng / quá dài | 400 | DV A1/4a | U |
| DV-03 | Tên nhóm trùng (kể cả khác hoa/thường/dấu) | `TEN_NHOM_DICH_VU_TRUNG`; dữ liệu nhập giữ nguyên (FE) | DV A1 | I |
| DV-04 | Sửa nhóm (tên, thứ tự) | Thành công | DV b5 | I |
| DV-05 | Xoá nhóm không còn dịch vụ `[Q14]` | Thành công | Figma 563:2 | I |
| DV-06 | Xoá nhóm còn dịch vụ | `NHOM_DICH_VU_CON_DICH_VU`, không xoá | DV (FK) | I |
| DV-07 | Tạo dịch vụ hợp lệ | Có dòng; `muc_dat_coc = 0` mặc định | DV b4–b5 | I |
| DV-08 | Nhóm không tồn tại / nhóm id âm / null | `NHOM_DICH_VU_KHONG_TON_TAI` | DV A1/4a | I |
| DV-09 | Tên dịch vụ rỗng / chỉ khoảng trắng | 400 | DV A1/4a | U |
| DV-10 | Giá: 0, âm, không phải số, vượt `decimal(12,2)`, > 2 chữ số thập phân; biên 0,01 | Không hợp lệ ⇒ 400; biên hợp lệ qua | DV b4 | U |
| DV-11 | Thời lượng: 0, âm, 30,5, chuỗi, rất lớn; biên 1 | Không hợp lệ ⇒ 400; 1 hợp lệ | DV b4 | U |
| DV-12 | Sửa giá dịch vụ khi đã có lịch hẹn | `lich_hen.gia_snapshot` **không đổi** | DV hậu điều kiện; mô tả | I |
| DV-13 | Đổi nhóm của dịch vụ | Thành công; quan hệ cập nhật | DV b5 | I |
| DV-14 | Đổi `thoi_luong` khi còn lịch hẹn hoạt động / khung giờ tương lai của bác sĩ dùng dịch vụ (Q16) | `THOI_LUONG_DANG_DUNG`; sửa tên/giá vẫn được | L15 | I |
| DV-15 | Tên dịch vụ trùng trong cùng nhóm; trùng khác nhóm `[Q16]` | Cùng nhóm ⇒ `TEN_DICH_VU_TRUNG`; khác nhóm ⇒ cho phép | DV b4 | I |
| DV-16 | Quản trị viên Chi nhánh: xem được, thêm/sửa/xoá ⇒ 403 `[Q11]` | Đúng | L4 | I |
| DV-17 | FE: lỗi dữ liệu | Giữ nguyên dữ liệu, báo từng trường | DV A1/4b–4c | C |
| DV-18 | Body có `mucDatCoc`, `chinhSachHoan` | Bị từ chối (trường lạ) — thuộc use case khác | DV mô tả; H7 | U |
| DV-19 | Xoá/sửa dịch vụ làm hỏng khoá ngoại (`moc_hoan_tien`, `bac_si`, `lich_hen` tham chiếu) | Không xoá được (admin không có thao tác xoá dịch vụ); không lỗi 500 | DV | I |
| DV-20 | Hai yêu cầu tạo cùng tên dịch vụ trong cùng nhóm đồng thời | Một thành công; kia `TEN_DICH_VU_TRUNG`, không 500 (UNIQUE DB) | Q16 | I |
| DV-21 | Migration `UNIQUE (nhom_dich_vu_id, ten)` khi có dữ liệu trùng sau chuẩn hoá | Dừng và liệt kê | Q16 | I |

### 7.3 Quản lý hồ sơ bác sĩ (BS)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| BS-01 | `computeSurcharge`: không có quy tắc; 1 quy tắc mốc 0; 0 năm với mốc 0 và mốc ≥ 1; nhiều mốc (chọn lớn nhất ≤ năm); mốc cao `ap_dung = false` (rơi mốc thấp); tất cả tắt; khác chức danh; năm đúng bằng mốc | Phụ phí đúng từng ca; không có ⇒ 0 | BS mô tả (phụ phí) | U |
| BS-02 | Sửa hợp lệ chuyên khoa, dịch vụ chính, mô tả, kinh nghiệm, học vị, chức danh | Lưu toàn bộ; thông báo thành công; `gia_snapshot` lịch đã đặt không đổi | BS b3–b5 | I |
| BS-03 | Mô tả chuyên môn để trống / xoá nội dung | Hợp lệ | BS mô tả | I |
| BS-04 | Bỏ trống từng trường bắt buộc (chuyên khoa, chi nhánh, dịch vụ chính, học vị, chức danh) | `DU_LIEU_KHONG_HOP_LE`, **không lưu gì** (kể cả trường hợp lệ khác); không tự thành `BS` (H8) | BS A1/4a–4b | I |
| BS-05 | Kinh nghiệm: âm, 1,5, chuỗi, > 60 `[Q20]`, 0 | Không hợp lệ ⇒ lỗi; 0 và biên trên hợp lệ | BS A1/4a | U |
| BS-06 | Ma trận 7 chức danh × 5 học vị (35 tổ hợp) | Chỉ 7 tổ hợp tương thích qua (`BS/BS_CKI/BS_CKII↔BS`, `ThS_BS↔ThS`, `TS_BS↔TS`, `PGS_TS_BS↔PGS`, `GS_TS_BS↔GS`); còn lại `CHUC_DANH_HOC_VI_KHONG_TUONG_THICH` | BS b4; DB CHK | U |
| BS-07 | Dịch vụ chính không có ở chi nhánh hiện tại | `DICH_VU_KHONG_O_CHI_NHANH`, không lưu gì | BS A1/4a | I |
| BS-08 | Đổi chi nhánh sang chi nhánh có đủ dịch vụ; sang chi nhánh **không** có dịch vụ chính | Hợp lệ (khi hết chặn); không có ⇒ từ chối toàn bộ | BS b4 | I |
| BS-09 | Id chuyên khoa/dịch vụ/chi nhánh không tồn tại | 400/404, không lưu | BS b4 | I |
| BS-10 | Đổi sang chuyên khoa `NgungHoatDong` `[Q19]`; giữ chuyên khoa ngừng đã gán khi sửa trường khác | Đổi sang ngừng ⇒ từ chối; giữ nguyên ⇒ hợp lệ | BS b4 | I |
| BS-20 | Toàn hệ thống đổi chi nhánh khi không còn lịch hẹn hoạt động và không còn ca từ hôm nay | Lưu; Audit `DoiChiNhanhBacSi` có `truoc/sau` `[Q39]` | BS b5, hậu điều kiện | I |
| BS-21 | Còn lịch hẹn `ChoThanhToan` tại chi nhánh hiện tại, đồng thời sửa mô tả | `DOI_CHI_NHANH_BI_CHAN` kèm danh sách; **mô tả cũng không lưu** | BS A2/4a–4b | I |
| BS-22 | Còn lịch hẹn `DaXacNhan` | Chặn như BS-21 | BS A2 | I |
| BS-23 | Còn lịch hẹn `DaTiepDon` | Chặn | BS A2 | I |
| BS-24 | Chỉ còn lịch `HoanThanh`/`DaHuy`/`VangMat`/`DaDoiLich` | Không chặn | BS mô tả | I |
| BS-25 | Lịch hẹn hoạt động của **bác sĩ khác** cùng chi nhánh; lịch hẹn của bác sĩ này ở chi nhánh khác | Không chặn | BS A2 | I |
| BS-26 | Có ca làm việc **hôm nay** (kể cả ca đã kết thúc theo giờ) `[Q18]` | Chặn | BS A2 | I |
| BS-27 | Có ca **ngày mai** | Chặn | BS A2 | I |
| BS-28 | Chỉ có ca **hôm qua** | Không chặn; ca/lịch cũ giữ nguyên | BS mô tả | I |
| BS-29 | Có ca tương lai nhưng `lich_lam_viec.chi_nhanh_id` là chi nhánh **cũ hơn** (không phải chi nhánh hiện tại) | Không chặn | BS mô tả | I |
| BS-30 | Vừa còn lịch hẹn vừa còn ca | Danh sách chặn liệt kê **cả hai** | BS A2/4b | I |
| BS-31 | Sau đổi chi nhánh thành công | `lich_lam_viec.chi_nhanh_id` cũ **không đổi** | BS mô tả | I |
| BS-32 | Quản trị viên Chi nhánh gửi trực tiếp API đổi `chiNhanhId` (UI không chặn) | `KHONG_DU_QUYEN`; **không lưu gì** (kể cả trường khác) | BS A3/4a–4b | I |
| BS-33 | Quản trị viên Chi nhánh sửa bác sĩ ngoài chi nhánh | 404 `KHONG_TIM_THAY` (Q40), không đổi gì | BS tiền điều kiện; A3 | I |
| BS-34 | Quản trị viên Chi nhánh sửa bác sĩ của mình (không đổi chi nhánh) | Thành công | BS b3–b5 | I |
| BS-35 | Quản trị viên Chi nhánh gửi `chiNhanhId` **bằng** chi nhánh hiện tại | Hợp lệ (không phải "đổi") | BS A3 | I |
| BS-36 | Chạy đua: đổi chi nhánh song song với tạo `lich_hen`/`lich_lam_viec` (có `FOR SHARE` trên `bac_si`) | Không bao giờ ở trạng thái "đã đổi mà còn lịch hoạt động ở chi nhánh cũ" (H2) | BS b4 (kiểm ngay trước khi lưu) | I |
| BS-37 | Biên múi giờ: 23:59 và 00:01 VN quanh nửa đêm (ca "hôm nay") | Theo ngày VN, không theo UTC; `NOW()` của MySQL cùng mốc giờ VN (session `time_zone`) (Q43) | H13 | U |
| BS-38 | Ghi Audit lỗi khi đổi chi nhánh `[Q39]` | Rollback cả đổi chi nhánh | BS b5 | I |
| BS-39 | Bác sĩ `ChoKichHoat` / `NgungHoatDong` vẫn sửa được hồ sơ | Thành công | BS b1 | I |
| BS-40 | Id của Lễ tân/Quản trị viên/Bệnh nhân | 404 | BS tiền điều kiện | I |
| BS-41 | FE: bị chặn đổi chi nhánh | Hiện danh sách lịch hẹn/ca chặn, giữ dữ liệu, không lưu | BS A2/4b | C |
| BS-42 | FE: chọn chức danh ⇒ học vị điền sẵn, vẫn sửa được; trường chi nhánh khoá với Quản trị viên Chi nhánh | Đúng | BS b2 | C |
| BS-43 | Danh sách của Quản trị viên Chi nhánh chỉ chứa bác sĩ chi nhánh mình; lọc chuyên khoa/tìm kiếm | Đúng | BS tiền điều kiện | I |
| BS-44 | Đổi dịch vụ khám chính khi còn lịch hẹn hoạt động / ca từ hôm nay, **kể cả hai dịch vụ cùng thời lượng** (Q17) | Chặn như BS-21 | L15 | I |
| BS-45 | Sửa chức danh/kinh nghiệm ⇒ phụ phí hiển thị đổi; lịch đã đặt giữ `gia_snapshot` | Đúng | BS mô tả | I |

### 7.4 Tạo tài khoản nhân sự & kích hoạt (NS)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| NS-01 | Toàn hệ thống tạo **Bác sĩ** hợp lệ | `tai_khoan` (`ChoKichHoat`, `mat_khau_bam` NULL, `loai = BacSi`, `da_xac_minh_email = false`) + `bac_si` **cùng giao dịch**; 1 hàng liên kết; `MailService` gọi 1 lần; sau gửi OK có `da_gui_luc`; thông báo "đã tạo, đã gửi email"; **không** có mật khẩu ở đâu | NS b1–b7 | I |
| NS-02 | Tạo **Lễ tân** hợp lệ | `tai_khoan` + `le_tan` (chi nhánh) | NS b4–b5 | I |
| NS-03 | Tạo **Quản trị viên Toàn hệ thống** | `quan_tri_vien` (`ToanHeThong`, `chi_nhanh_id` NULL) | NS b4–b5 | I |
| NS-04 | Tạo **Quản trị viên Chi nhánh** (chọn chi nhánh); thiếu chi nhánh | Có chi nhánh ⇒ tạo; thiếu ⇒ 400 (CHECK DB không bị chạm) | NS b2, b4 | I |
| NS-05 | Quản trị viên Chi nhánh tạo Bác sĩ/Lễ tân ở chi nhánh **mình** | Thành công | NS tiền điều kiện | I |
| NS-06 | Quản trị viên Chi nhánh tạo ở chi nhánh **khác**; gửi `chiNhanhId` giả | chi nhánh ngoài phạm vi bị coi như không tồn tại (`DU_LIEU_KHONG_HOP_LE` trên `chiNhanhId`, không lộ chi nhánh khác — Q40); không tạo tài khoản lẫn hồ sơ | NS A3/4a–4b | I |
| NS-07 | Quản trị viên Chi nhánh chọn vai trò **Quản trị viên** | `KHONG_DU_QUYEN`, kết thúc | NS A2/4a–4b | I |
| NS-08 | Toàn hệ thống tạo ở **mọi** chi nhánh | Thành công | NS tiền điều kiện | I |
| NS-09 | Email đã có (bất kỳ loại/trạng thái, khác hoa/thường/khoảng trắng, tài khoản `ChoKichHoat`) | `EMAIL_DA_DUNG`; không tạo; nhập email khác ⇒ thành công | NS A1 | I |
| NS-10 | Email thuộc Bệnh nhân chưa xác minh `DangHoatDong` quá 24 giờ, job dọn chưa chạy `[Q32]`; đối chiếu với Bệnh nhân `NgungHoatDong` và nhân sự | Sau khi A5 merge, gọi `UnverifiedPatientCleaner.purgeIfExpired`: chỉ tài khoản `DangHoatDong` đủ hạn bị xoá rồi tạo nhân sự; hai trường hợp còn lại trả `EMAIL_DA_DUNG`, không xoá | NS tiền điều kiện | I |
| NS-11 | Thiếu từng trường bắt buộc theo vai trò (Bác sĩ: chi nhánh, chuyên khoa, dịch vụ chính, chức danh, học vị, kinh nghiệm; Lễ tân: chi nhánh; Quản trị viên: phạm vi) | `DU_LIEU_KHONG_HOP_LE` đúng trường; **không** tạo tài khoản, hồ sơ, liên kết; giữ dữ liệu (FE) | NS A3/4a–4c; H8 | I |
| NS-12 | Kinh nghiệm âm / không nguyên / quá lớn | 400 | NS A3 | U |
| NS-13 | Dịch vụ chính không có ở chi nhánh chọn | `DICH_VU_KHONG_O_CHI_NHANH`; không tạo gì | NS A3/4a | I |
| NS-14 | Chức danh–học vị không tương thích (35 tổ hợp); học vị điền sẵn (FE) | Như BS-06; FE điền sẵn | NS b2, b4 | U/C |
| NS-15 | Họ tên rỗng/quá dài; email sai định dạng/không ASCII; SĐT sai | 400 theo quy tắc auth A1 | NS b4; Q24 | U |
| NS-16 | Chọn chuyên khoa `NgungHoatDong` `[Q19]` | Từ chối | NS b4 | I |
| NS-17 | Giả lập lỗi khi tạo `bac_si` (hoặc `tai_khoan`) | Không có `tai_khoan`, `bac_si`, `ma_xac_thuc` nào được tạo | NS b5 (một giao dịch) | I |
| NS-18 | Body có `matKhau`, `trangThai`, `daXacMinhEmail` | Bị từ chối (trường lạ); không có ô mật khẩu ở biểu mẫu | NS mô tả; H7 | U |
| NS-19 | **A4:** `MailService` giả trả lỗi | Tài khoản + hồ sơ **vẫn** `ChoKichHoat`; hàng liên kết mới có `thu_hoi_luc`, **không** hiệu lực; `guiEmail = ThatBai`; FE **không** hiện "đã gửi" | NS A4/6a–6c; H5 | I |
| NS-20 | Sau NS-19: gửi lại thành công | Có một liên kết hợp lệ; kích hoạt được | NS A4/6c; TK A2 | I |
| NS-21 | Quét log toàn luồng | Không có token kích hoạt/liên kết/băm | SOW 3.2.2; H6 | I |
| NS-22 | Hai Quản trị viên tạo **cùng email** đồng thời | Một thành công, một `EMAIL_DA_DUNG`; không 500 | NS A1; UNIQUE | I |
| NS-23 | Vai trò không hợp lệ (`BenhNhan`, rỗng) | 400 | NS b2 | U |
| NS-24 | Tạo nhân sự ghi audit `TaoTaiKhoanNhanSu` (5.10) | Có đúng 1 dòng cùng giao dịch; không chứa mật khẩu/token/băm; lỗi ghi ⇒ rollback | SOW 3.2.4 | I |
| NS-25 | Tài khoản mới đăng nhập bằng mật khẩu bất kỳ | Bị từ chối "chưa kích hoạt" (auth DN-15) | NS mô tả | I |
| NS-26 | FE: lỗi bỏ trống (Bác sĩ/Lễ tân), "Tạo thành công", **gửi mail lỗi** | Đúng từng trạng thái | NS b2–b7, A4 | C |
| NS-30 | Mở liên kết hợp lệ | `validate` OK; hiển thị form mật khẩu; không lộ dữ liệu nhạy cảm | NS b8–b9 | I |
| NS-31 | Đặt mật khẩu hợp lệ | **Một giao dịch**: `mat_khau_bam` (Argon2id), `trang_thai = DangHoatDong`, `da_xac_minh_email = true` `[Q24]`, `da_dung_luc`; liên kết vô hiệu; chuyển Đăng nhập; đăng nhập được | NS b10–b12 | I |
| NS-32 | Hết hạn: `het_han_luc − 1 giây` / `+ 1 giây` (đồng hồ giả) | Còn hạn ⇒ dùng được; quá hạn ⇒ `LIEN_KET_KHONG_HOP_LE`, tài khoản giữ `ChoKichHoat` | NS A5/9a | I |
| NS-33 | Dùng lại liên kết đã dùng | `LIEN_KET_KHONG_HOP_LE` | NS A5/9a | I |
| NS-34 | Dùng liên kết cũ sau gửi lại thành công | Từ chối; chỉ liên kết mới hợp lệ | NS A5/9a; TK A2/7c | I |
| NS-35 | Token sai (id đúng), id không tồn tại, định dạng rác, thiếu tham số | **Cùng** mã/thông báo `LIEN_KET_KHONG_HOP_LE` (không phân biệt); thời gian phản hồi gần nhau | NS A5; H6 | I |
| NS-36 | Tài khoản không còn `ChoKichHoat` (`DangHoatDong`/`NgungHoatDong`) | Từ chối, không đặt được mật khẩu | NS A5/9a | I |
| NS-37 | Liên kết có `thu_hoi_luc` (gửi lỗi) hoặc `da_gui_luc` rỗng | Từ chối | NS A5; quy tắc 22 | I |
| NS-38 | Mật khẩu không đạt (8 biên, 64 biên, thiếu số/ký tự đặc biệt, ký tự không ASCII), xác nhận không khớp | Lỗi tương ứng; liên kết **vẫn còn hiệu lực**; tài khoản `ChoKichHoat` | NS A6/11a–11b | I |
| NS-39 | Nhập sai rồi nhập đúng | Thành công | NS A6/11c | I |
| NS-40 | Hai lần `complete` đồng thời | Một thành công, một từ chối; không đặt mật khẩu hai lần | NS b11 | I |
| NS-41 | So token bằng so sánh hằng định; `ma_bam` là SHA-256 hex, không có token rõ trong DB | Đúng | H6; auth H10 | U/I |
| NS-42 | TTL đổi (`STAFF_ACTIVATION_TTL_HOURS`) | Liên kết mới theo TTL mới; liên kết cũ giữ hạn cũ | Q22 | U |
| NS-43 | FE `/kich-hoat`: đọc fragment, xoá khỏi URL, "Link không hợp lệ", "Kích hoạt thành công" → Đăng nhập; validator mật khẩu cùng vector với auth SE-08 | Đúng | NS b8–b12, A5, A6 | C |
| NS-44 | Gửi email kích hoạt thật qua Gmail (tạo thật, mở thư, kích hoạt) | Thư đúng mẫu 674:2, link dùng được, không có mật khẩu trong thư | NS b6–b12; auth Q3 | M |
| NS-45 | Giới hạn gửi lại ngay khi tạo (tạo rồi gửi lại < 60 giây) `[Q23]` | `GUI_LAI_QUA_SOM` | Q23 | I |

### 7.5 Quản lý tài khoản người dùng (TK)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| TK-01 | Toàn hệ thống: danh sách mọi loại; lọc vai trò/trạng thái/cờ no-show/chi nhánh; tìm kiếm; phân trang | Đúng; `total` đúng | TK b2 | I |
| TK-02 | Chi nhánh: chỉ Bác sĩ/Lễ tân chi nhánh mình + Bệnh nhân có ≥ 1 lịch hẹn (mọi trạng thái) tại chi nhánh mình; **không** Quản trị viên `[Q27]` | Đúng | TK b2 | I |
| TK-03 | Bệnh nhân chỉ có lịch hẹn ở chi nhánh khác | Không có trong danh sách; `GET` chi tiết ⇒ 404 `KHONG_TIM_THAY` (giống id không tồn tại — Q40) | TK tiền điều kiện | I |
| TK-04 | Chi nhánh xem chi tiết Bệnh nhân | Chỉ 6 trường (họ tên, email, SĐT, ngày sinh, giới tính, trạng thái — Q26); **không** địa chỉ, thời điểm tạo, `mat_khau_bam`, mã xác thực, ví, no-show, hồ sơ khám; không có dữ liệu bị đổi | TK hậu điều kiện (xem); H17 | I |
| TK-05 | Phân trang biên (trang 0, trang vượt, `pageSize` 0/101/âm) | 400 hoặc chuẩn hoá theo Q42 | TK b2 | U |
| TK-06 | Tìm kiếm có ký tự `%`, `_`, `'`, `--` | Không lỗi, không lọt dữ liệu (escape) | TK b2; SE-A8 | I |
| TK-10 | Toàn hệ thống khoá Bác sĩ / Lễ tân / Bệnh nhân / Quản trị viên khác | `NgungHoatDong`; mọi `phien_dang_nhap` chưa thu hồi có `thu_hoi_luc`; access token cũ ⇒ 401 ngay; refresh ⇒ 401 (Q29); khi đích là Bác sĩ, response kèm danh sách lịch hẹn hoạt động/ca từ hôm nay đang phụ thuộc, **không** tự hủy/đổi (Q28) | TK b7 | I |
| TK-11 | Mở khoá tài khoản `NgungHoatDong` | `DangHoatDong`; đăng nhập lại được; `so_lan_dang_nhap_sai = 0` và `khoa_dang_nhap_den` NULL (Q28) | TK b7 | I |
| TK-12 | Chi nhánh khoá/mở khoá Bác sĩ, Lễ tân chi nhánh mình | Thành công | TK mô tả | I |
| TK-13 | Chi nhánh khoá nhân sự chi nhánh khác | 404 `KHONG_TIM_THAY`, không đổi gì | TK A1 | I |
| TK-14 | Chi nhánh khoá/mở khoá một Quản trị viên (kể cả chính mình) | 404 (Quản trị viên nằm ngoài tầm nhìn của Admin Chi nhánh — Q27, Q40; kiểm tầm nhìn **trước** kiểm tự khoá) | TK A1 | I |
| TK-15 | Chi nhánh khoá/mở khoá Bệnh nhân | `KHONG_DU_QUYEN` | TK A1 | I |
| TK-16 | Tự khoá: Toàn hệ thống và Chi nhánh | `TU_KHOA_TAI_KHOAN` | TK A4 | I |
| TK-17 | Khoá Quản trị viên Toàn hệ thống **cuối cùng** đang hoạt động | `CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG` | TK A5 | I |
| TK-18 | Khoá một Toàn hệ thống khi còn một khác đang hoạt động / còn một khác nhưng `NgungHoatDong` hoặc `ChoKichHoat` | Còn hoạt động ⇒ thành công; còn nhưng không hoạt động ⇒ A5 | TK A5 | I |
| TK-19 | Hai Toàn hệ thống (chỉ còn hai) khoá nhau đồng thời | Không thể về 0; một thất bại (H3) | TK A5 | I |
| TK-20 | Khoá/Mở khoá tài khoản `ChoKichHoat` | `TAI_KHOAN_CHO_KICH_HOAT`, không đổi, hướng dẫn gửi lại | TK A6 | I |
| TK-21 | Khoá tài khoản đã ngưng; mở khoá tài khoản đang hoạt động | `TRANG_THAI_KHONG_PHU_HOP` | TK b4 | I |
| TK-22 | Mọi cặp (vai trò người gọi × loại đích × hành động) gọi **trực tiếp API** (UI đã ẩn nút) | Theo ma trận 5.6; vi phạm ⇒ từ chối, không đổi gì | TK A1/4a–4b | U/I |
| TK-23 | Bác sĩ / Lễ tân / Bệnh nhân / khách gọi API | 403 / 401 | TK tiền điều kiện | I |
| TK-24 | Lỗi khi thu hồi phiên (giả lập) | Rollback: `trang_thai` giữ nguyên | TK hậu điều kiện thất bại | I |
| TK-25 | Khoá/mở khoá/mở khoá no-show ghi audit `KhoaTaiKhoan`/`MoKhoaTaiKhoan`/`MoKhoaNoShow` (5.10) | 1 dòng cùng giao dịch; không có bí mật; lỗi ghi ⇒ rollback | SOW 3.2.4 | I |
| TK-26 | FE: ẩn/vô hiệu chức năng theo quyền; hộp xác nhận; hiển thị lỗi A1–A6 | Đúng | TK b2–b6 | C |
| TK-30 | Toàn hệ thống mở khoá no-show cho Bệnh nhân bị khoá | `khoa_dat_lich_do_no_show = false`; `trang_thai` và `so_lan_no_show` **không đổi** | TK hậu điều kiện (no-show) | I |
| TK-31 | Mở khoá no-show cho Bệnh nhân không bị khoá | Idempotent hoặc `TRANG_THAI_KHONG_PHU_HOP` (ghi theo Q31) | TK b4 | I |
| TK-32 | Mở khoá no-show cho nhân sự | Từ chối (chỉ Bệnh nhân) | TK b4 | I |
| TK-33 | Chi nhánh mở khoá no-show | `KHONG_DU_QUYEN` | TK A1 | I |
| TK-34 | FE: nút "Mở khoá no-show" chỉ hiện khi `khoa_dat_lich_do_no_show = true` và chỉ với Toàn hệ thống; báo rõ no-show kế tiếp có thể khoá lại ngay nếu còn ≥ ngưỡng | Đúng | TK hậu điều kiện (no-show); Q31 | C |
| TK-40 | Toàn hệ thống gửi lại cho nhân sự `ChoKichHoat` (kể cả Quản trị viên, mọi chi nhánh) | Hàng mới (chưa hiệu lực); gửi OK ⇒ **một giao dịch** thu hồi liên kết cũ rồi đặt `da_gui_luc` mới; liên kết cũ dùng ⇒ từ chối | TK A2/7a–7c | I |
| TK-41 | Gửi lại mà mail lỗi, liên kết cũ còn hạn | Liên kết mới `thu_hoi_luc`; **liên kết cũ vẫn dùng được**; tài khoản `ChoKichHoat`; thông báo thất bại (không "đã gửi") | TK A2/7d; thất bại | I |
| TK-42 | Liên kết cũ đã hết hạn + mail lỗi | Không còn liên kết hợp lệ; gửi lại lần sau thành công | TK A2/7d | I |
| TK-43 | Gửi lại cho tài khoản `DangHoatDong`/`NgungHoatDong` | `TAI_KHOAN_KHONG_CHO_KICH_HOAT`, hướng dẫn "Quên mật khẩu" | TK A3 | I |
| TK-44 | Chi nhánh gửi lại: nhân sự chi nhánh mình ⇒ được; chi nhánh khác ⇒ 404; Quản trị viên chờ kích hoạt ⇒ 404 (ngoài tầm nhìn — Q27) | Đúng | TK mô tả | I |
| TK-45 | Hai "Gửi lại" đồng thời | Cuối cùng đúng **một** liên kết hợp lệ; không vi phạm UNIQUE gây 500 | TK A2; H4 | I |
| TK-46 | Hồi quy thứ tự: đặt `da_gui_luc` trước khi thu hồi liên kết cũ | Gây vi phạm `kich_hoat_dang_hieu_luc` ⇒ test bắt được; mã đúng thứ tự không lỗi | quy tắc 21 | I |
| TK-47 | Gửi lại quá nhanh (< 60 giây) / > 5 lần/giờ (kể cả lần lỗi) `[Q23]` | `GUI_LAI_QUA_SOM` | Q23 | I |
| TK-48 | Liên kết gửi lại có hạn theo TTL mới | Đúng | Q22 | I |
| TK-49 | Nhân sự chờ kích hoạt dùng "Quên mật khẩu" | Bị từ chối theo auth QM-* (S4); thông báo trỏ về Quản trị viên | auth S4 | I |

### 7.6 Cập nhật thông tin phòng khám (PK)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| PK-01 | Toàn hệ thống lưu hợp lệ lần đầu (chưa có dòng) | Tạo `id = 1` với 4 trường | PK b3–b5 | I |
| PK-02 | Cập nhật lần sau | Dòng duy nhất đổi; không có dòng thứ hai | PK b5 | I |
| PK-03 | Email sai định dạng / có khoảng trắng / không ASCII / > 255 | `DU_LIEU_KHONG_HOP_LE`; giữ nguyên dữ liệu | PK A1 | U |
| PK-04 | Hotline: "1900 1234", "1800 1234", "0901234567", "090 123 4567", "12345", "0123", chữ, > 20 ký tự `[Q33]` | Hợp lệ được chuẩn hoá (bỏ khoảng trắng); sai ⇒ lỗi | PK A1; L11 | U |
| PK-05 | Bỏ trống từng trường (Figma bắt buộc) `[Q33]` | `DU_LIEU_KHONG_HOP_LE` | PK b4 | U |
| PK-06 | Biên độ dài tên 100 / 101, địa chỉ 255 / 256 | Đúng | PK b4 | U |
| PK-07 | Quản trị viên Chi nhánh `GET` và `PUT` | `KHONG_DU_QUYEN` cả hai (kết thúc) | PK A2/1a–1b | I |
| PK-08 | Bác sĩ/Lễ tân/Bệnh nhân; khách | 403 / 401 | PK tiền điều kiện | I |
| PK-09 | Hai `PUT` đồng thời | Một dòng cuối cùng nhất quán; không lỗi trùng khoá | PK b5 | I |
| PK-10 | FE: lỗi định dạng giữ nguyên dữ liệu; Chi nhánh thấy thông báo không đủ quyền | Đúng | PK A1/4b–4c, A2 | C |
| PK-11 | Nội dung có `<script>`/HTML | Lưu như văn bản; không thực thi khi hiển thị | SE-A6 | C |

### 7.7 Cập nhật cấu hình hệ thống (CH)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| CH-01 | Sửa **một** tham số hợp lệ + lý do | Cấu hình đổi; **1** dòng `nhat_ky_hanh_dong` (`CapNhatCauHinh`, `cau_hinh_he_thong`, 1, `chi_nhanh_id` NULL, `ThanhCong`) với `{truoc, sau, ly_do}` đúng; người thực hiện, thời điểm; **cùng giao dịch** `[Q39]` | CH b5; hậu điều kiện | I |
| CH-02 | Sửa **nhiều** tham số | **Một** dòng nhật ký gom; `truoc`/`sau` chỉ gồm tham số đổi, cùng tập khóa | CH hậu điều kiện | I |
| CH-03 | Không đổi gì | `KHONG_CO_THAY_DOI`; không nhật ký | CH b4 | I |
| CH-04 | Thiếu `ly_do` / chỉ khoảng trắng / > 500 ký tự `[Q38]` | `THIEU_LY_DO`/`DU_LIEU_KHONG_HOP_LE`; cấu hình không đổi | CH A1/4a–4b | U |
| CH-05 | Giá trị âm, 0 (với tham số phải > 0: giữ chỗ, hạn phản hồi, ngưỡng no-show, số lịch/hồ sơ), không phải số, không nguyên | Từ chối, **giữ giá trị cũ của tham số đó** | CH A1/4a–4b | U |
| CH-06 | Biên dưới/trên từng tham số theo bảng 5.7 (table-driven) `[Q34]` | Trong miền qua; ngoài miền ⇒ lỗi | CH b4 | U |
| CH-07 | `thoi_diem_nhac_lich`: không phải mảng; phần tử ≤ 0, không nguyên, trùng, > 720; rỗng; > 5 phần tử `[Q34]` | Lỗi theo bảng; DB `chk_cau_hinh_nhac_lich` không bao giờ là nguồn lỗi hiển thị | CH b4 | U |
| CH-08 | `w1`, `w2`: 3 chữ số thập phân, < 0, > 1, tổng ≠ 1,00 `[Q34]` | Lỗi | CH b4 | U |
| CH-09 | Quản trị viên Chi nhánh `GET`/`PUT`; vai trò khác | `KHONG_DU_QUYEN` / 403 | CH A2/1a–1b | I |
| CH-10 | **Chưa có dòng cấu hình** (A3): `GET`; `SystemConfigService.getOrThrow()` ở chức năng đọc cấu hình giả định | `chuaCauHinh = true`; `HE_THONG_CHUA_CAU_HINH`; **không** giá trị ngầm cho 7 cột | CH A3/1a–1b | I |
| CH-11 | Tạo lần đầu qua biểu mẫu `[Q35]`: đủ 7 cột `[cần điền]` | Tạo dòng; nhật ký `truoc = null` từng tham số | CH A3/1c | I |
| CH-12 | Tạo lần đầu thiếu một cột `[cần điền]` | 400 rõ ràng (không lộ lỗi MySQL 1364) | CH A3; quy tắc 32 | I |
| CH-13 | Gọi "tạo" khi đã có dòng | Xử lý như cập nhật; không lỗi 1062 | CH b5 | I |
| CH-14 | **A4:** ghi Audit lỗi (giả lập) | Rollback **cả** cấu hình; báo lỗi; thử lại được | CH A4/5a–5c | I |
| CH-15 | Ghi nhật ký bị `chk_nhat_ky_cap_nhat_cau_hinh` từ chối (ép `ly_do` rỗng ở tầng thấp) | Rollback cấu hình | CH A4 | I |
| CH-16 | Hai Toàn hệ thống sửa đồng thời cùng tham số | Tuần tự (khoá hàng); `truoc` của lần sau = `sau` của lần trước; không mất cập nhật | CH b5; quy tắc 36 | I |
| CH-17 | Không hồi tố: yêu cầu thay đổi chi nhánh đã duyệt giữ `so_ngay_bao_truoc` đã chụp khi đổi cấu hình | Giá trị cũ giữ nguyên | CH hậu điều kiện; CN b8 | I |
| CH-18 | Khóa JSON nhật ký là tên cột; giá trị là số (không chuỗi); không có bí mật | Đúng | CH hậu điều kiện | I |
| CH-19 | Tab "Lịch sử thay đổi": phân trang, chỉ `CapNhatCauHinh`, chỉ Toàn hệ thống `[Q37]` | Đúng | Figma 578:2 | I |
| CH-20 | FE: nhóm tham số, nhập lý do, "Xác nhận lưu thay đổi", "Đã lưu", lỗi từng ô, trạng thái chưa cấu hình | Đúng | CH b2–b5, A1, A3 | C |
| CH-21 | `so_ngay_bao_truoc_doi_gio_lam = 0` (DB cho phép) và `61` | `CAU_HINH_GIA_TRI_KHONG_HOP_LE` ở service (miền 1–60, Q34) | CH b4; L12 | U |

### 7.8 Quản lý chi nhánh / cơ sở (CN)

**Thêm mới và kiểm lịch**

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| CN-01 | Toàn hệ thống thêm chi nhánh đủ 7 thứ + dịch vụ | **Một giao dịch**: `chi_nhanh` + 7 dòng + dịch vụ; có hiệu lực ngay; thông báo thành công | CN b5; hậu điều kiện | I |
| CN-02 | Quản trị viên Chi nhánh thêm mới (gọi trực tiếp API) | `KHONG_DU_QUYEN`, kết thúc; không tạo gì | CN A1/1a–1b | I |
| CN-03 | Thiếu thứ (6 dòng); thứ trùng; thứ ngoài 1–7 | `LICH_HOAT_DONG_KHONG_HOP_LE` chỉ rõ thứ | CN A3/4a–4b | U |
| CN-04 | Ngày hoạt động không có khoảng nào; khoảng thiếu giờ bắt đầu hoặc kết thúc | Lỗi đúng thứ | CN A3/4a | U |
| CN-05 | Giờ bắt đầu **=** hoặc **>** kết thúc (sáng, chiều) | Lỗi | CN A3/4a | U |
| CN-06 | Ngày nghỉ còn giờ | Lỗi | CN A3/4a | U |
| CN-07 | Kết thúc sáng > bắt đầu chiều (chồng); bằng nhau (chạm) | Chồng ⇒ lỗi; chạm ⇒ hợp lệ | CN A3; `chk_lich_hoat_dong_khong_chong` | U |
| CN-08 | Giờ sai định dạng ("25:00", "7h"), `24:00:00`, qua đêm | Lỗi | CN A3 | U |
| CN-09 | Nhiều lỗi cùng lúc ở nhiều thứ | Trả **đủ** danh sách `{thu, maLoi}`; DB không đổi | CN A3/4b | U |
| CN-10 | Chỉ có khoảng sáng (T7) / chỉ khoảng chiều / cả hai | Hợp lệ (≥ 1 khoảng) | CN b2; schema | U |
| CN-11 | Tên/địa chỉ rỗng, quá dài; toạ độ: ngoài miền, chỉ một trong hai, chuỗi; biên hợp lệ `[Q10]` | Lỗi / hợp lệ theo Q10 | CN b4 | U |
| CN-12 | Dịch vụ khả dụng: id không tồn tại, trùng id, rỗng | Không tồn tại ⇒ lỗi; trùng gộp; rỗng cho phép (ghi nhận) | CN b2 | I |
| CN-13 | Lỗi giữa chừng khi thêm (giả lập lỗi ở dòng lịch thứ 5) | Rollback: không có `chi_nhanh` mồ côi | CN hậu điều kiện thất bại | I |

**Sửa không ảnh hưởng lịch hẹn (áp dụng ngay)**

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| CN-20 | Đổi tên/địa chỉ/toạ độ | Lưu ngay | CN b5 | I |
| CN-21 | Mở rộng giờ (sớm hơn/muộn hơn); chuyển ngày nghỉ → hoạt động; thêm dịch vụ | Lưu ngay, không tạo yêu cầu | CN b4–b5 | I |
| CN-22 | Thu hẹp giờ nhưng không lịch hẹn nào rơi vào vùng bị bỏ | Lưu ngay | CN b4–b5 | I |
| CN-23 | Lịch hẹn ở vùng bị bỏ nhưng ở **quá khứ**; hoặc trạng thái `HoanThanh`/`DaHuy`/`DaDoiLich`/`VangMat`/`DaTiepDon` | Không tính là ảnh hưởng | CN b4 | I |
| CN-24 | Biên mốc: lịch hẹn có `thoi_gian` **bằng** mốc kiểm tra | Tính (`>=`) | quy tắc 30 | I |
| CN-25 | Chỉ có khung giờ `ConTrong` ngoài lịch mới (không lịch hẹn, **không ca** ảnh hưởng) | Lưu ngay + cảnh báo liệt kê khung giờ; **không** xoá; `booking` chặn đặt/đổi (Q6) | CN b4 (câu cuối), b5 | I |
| CN-25b | Có **ca** làm việc tương lai không còn khoảng tương ứng nhưng không có lịch hẹn | **Tạo yêu cầu `ChoDuyet`** (ca cũng là ảnh hưởng — Q7); không áp dụng ngay | CN b4; Q7 | I |
| CN-26 | Gửi form **không có thay đổi** | `KHONG_CO_THAY_DOI` | CN b3 | I |
| CN-27 | Form hỗn hợp: đổi tên **và** thu hẹp giờ có ảnh hưởng `[Q2]` | Tên lưu ngay; phần lịch ⇒ yêu cầu `ChoDuyet`; phản hồi nêu rõ | L2 | I |
| CN-27b | Sau CN-27, yêu cầu bị **từ chối** (hoặc rút/hủy) | Tên/địa chỉ/toạ độ đã lưu **giữ nguyên**; giao diện/chi tiết vẫn nêu rõ phần nào đã lưu, phần nào bị từ chối (Q2) | L2; Q2 | I/C |

**Sửa có ảnh hưởng → yêu cầu**

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| CN-30 | Chuyển nghỉ một thứ đang có lịch `ChoThanhToan` tương lai | Tạo yêu cầu `ChoDuyet`; `chi_nhanh_lich_hoat_dong`/`chi_nhanh_dich_vu_kham` **giữ nguyên**; `noi_dung_truoc/sau` chỉ các thứ đổi, **đủ 6 khóa**, `null` tường minh; `nguoi_de_xuat_id` đúng; người dùng thấy danh sách lịch ảnh hưởng (`NgayNghi`) | CN b4–b6; hậu điều kiện | I |
| CN-31 | Như CN-30 với `DaXacNhan` | Như trên | CN b4 | I |
| CN-32 | Giờ mới không còn chứa lịch hẹn (thu hẹp đầu/cuối) | `NgoaiGioHoatDong` | CN b4 | I |
| CN-33 | Giờ nghỉ trưa mới rơi vào giữa lịch hẹn | Ảnh hưởng | CN b4; quy tắc 30 | I |
| CN-34 | Lịch hẹn kết thúc **đúng** giờ đóng (biên) / bắt đầu đúng giờ mở | Không ảnh hưởng | quy tắc 29 | I |
| CN-35 | Ca của lịch (`CaSang`/`CaChieu`) quyết định khoảng so sánh: lịch ca chiều không bị tính theo khoảng sáng | Đúng | quy tắc 30 | I |
| CN-36 | Bỏ dịch vụ có lịch hẹn hoạt động ⇒ `BoDichVu`; bỏ dịch vụ không có lịch ⇒ áp dụng ngay | Đúng | CN b4 | I |
| CN-37 | Một lịch hẹn vừa nghỉ vừa bỏ dịch vụ | **Một** dòng, lý do theo thứ tự ưu tiên | PK `(yêu cầu, lịch hẹn)` | I |
| CN-38 | Lịch hẹn của chi nhánh khác | Không tính | CN b4 | I |
| CN-39 | Chi tiết yêu cầu liệt kê lịch hẹn, ca và khung giờ cần xử lý; không tự xoá/hủy/hoàn tiền | Đúng (Q7) | CN b4 | I |
| CN-40 | Vừa có thứ ảnh hưởng vừa có thứ không ảnh hưởng | Toàn bộ phần lịch/dịch vụ vào **một** yêu cầu `[Q2]` | L2 | I |
| CN-41 | Quản trị viên Chi nhánh sửa chi nhánh mình ⇒ được; chi nhánh khác ⇒ 404 `KHONG_TIM_THAY` (Q40) | Đúng | CN tiền điều kiện | I |
| CN-42 | Đã có yêu cầu `ChoDuyet` hoặc `DaDuyet` chưa áp dụng ⇒ gửi yêu cầu mới `[Q3]` | `YEU_CAU_DANG_CHO` | CN b6 | I |
| CN-43 | Cùng điều kiện CN-42: sửa lịch/dịch vụ **áp dụng ngay**; sửa chỉ tên/địa chỉ `[Q3]` | Lịch/dịch vụ ⇒ chặn; tên/địa chỉ ⇒ được | H10 | I |
| CN-44 | Bỏ dịch vụ còn bác sĩ gán `[Q8]` | `DICH_VU_CON_BAC_SI` kèm danh sách | L14 | I |
| CN-45 | Hai người gửi yêu cầu cho cùng chi nhánh đồng thời | Một tạo được, một `YEU_CAU_DANG_CHO` (cột sinh UNIQUE bắt cả khi lỡ bỏ khoá — Q47) | H10 | I |

**Duyệt / từ chối**

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| CN-50 | Toàn hệ thống duyệt | **Một giao dịch**: `so_ngay_bao_truoc` = cấu hình lúc duyệt; `hieu_luc_tu >= thoi_diem_duyet + n ngày`; ghi `yeu_cau_..._lich_hen` tính với `hieu_luc_tu`; thông báo + email `ChoGui` cho từng bệnh nhân; `thoi_diem_tao` thông báo < `hieu_luc_tu`; **chi nhánh chưa đổi** | CN b7–b9 | I |
| CN-51 | Biên `hieu_luc_tu`: đúng bằng mốc tối thiểu; sớm hơn 1 giây; ở quá khứ `[Q5]` | Bằng ⇒ chấp nhận; sớm hơn ⇒ `HIEU_LUC_QUA_SOM` | CN b8; CHECK DB | I |
| CN-52 | Một bệnh nhân có nhiều lịch bị ảnh hưởng (kể cả lịch người thân) | **Một** thông báo/email gom; nội dung ≤ 500 ký tự (cắt có "và N lịch khác") | CN b9 | I |
| CN-53 | Nhiều bệnh nhân khác nhau | Mỗi người một thông báo; không ai nhận hai | CN b9 | I |
| CN-54 | Lịch hẹn bị hủy giữa lúc đề xuất và lúc duyệt / lịch mới đặt thêm vào vùng bị ảnh hưởng `[Q6]` | Danh sách lúc duyệt phản ánh thực tế; đặt/đổi thêm vào vùng này bị `booking` chặn (Q6) | CN b8 | I |
| CN-55 | Chưa có cấu hình hoặc thiếu `so_ngay_bao_truoc_doi_gio_lam` | `HE_THONG_CHUA_CAU_HINH`; **không** duyệt | CN tiền điều kiện; CH A3 | I |
| CN-56 | Quản trị viên Chi nhánh duyệt/từ chối | `KHONG_DU_QUYEN` | CN b7 | I |
| CN-57 | Người duyệt = người đề xuất `[Q4]` | Cho phép (theo đề xuất); `nguoi_de_xuat_id`/`nguoi_duyet_id` ghi đúng | CN b7 | I |
| CN-58 | Duyệt yêu cầu đã duyệt/từ chối; duyệt hai lần đồng thời | Từ chối; **không** thông báo trùng (UNIQUE) | CN b7 (H11) | I |
| CN-59 | Duyệt khi tại `hieu_luc_tu` không còn lịch hẹn ảnh hưởng | Duyệt được; không thông báo | CN b8 | I |
| CN-60 | **Từ chối** có lý do | `TuChoi`, `ly_do_tu_choi`, người duyệt, thời điểm; dữ liệu chi nhánh giữ nguyên; **người gửi** nhận thông báo + email; **bệnh nhân không nhận gì** | CN A2/*a–*b | I |
| CN-61 | Từ chối không lý do / chỉ khoảng trắng / > 255 | 400; vẫn `ChoDuyet` | CN A2; CHECK DB | U |
| CN-62 | Email người gửi lỗi khi từ chối | Quyết định từ chối **không** hoàn tác | CN A2/*b | I |
| CN-63 | Duyệt khi người gửi (Quản trị viên Chi nhánh) bị khoá | Vẫn duyệt được; thông báo cho người gửi theo trạng thái tài khoản (không lỗi) | CN b7 | I |

**Email, áp dụng, lịch sử**

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| CN-70 | **A4:** `MailService` giả lỗi với **một** bệnh nhân | `thong_bao` giữ nguyên; `email_thong_bao` = `ThatBai` + `loi_cuoi` + `so_lan_thu ≥ 1`; yêu cầu **vẫn** `DaDuyet`; bệnh nhân khác vẫn gửi được | CN A4/9a–9b | I |
| CN-71 | Gửi lại email lỗi | Nhận việc bằng `UPDATE` có điều kiện; thành công ⇒ `DaGui` + `da_gui_luc`; **không** gửi trùng khi đã `DaGui` | CN A4; quy tắc 34 | I |
| CN-72 | Hai worker nhận cùng một email | Chỉ một có `ROW_COUNT = 1` được gọi `MailService` | quy tắc 34 | I |
| CN-73 | Thử lại tối đa/khoảng cách `[Q9]` | Dừng ở `ThatBai` sau số lần quy định | CN A4 | I |
| CN-74 | Duyệt chạy lại/retry không tạo thông báo trùng | UNIQUE `(yêu cầu, tài khoản, loại sự kiện)` | quy tắc 28 | I |
| CN-80 | Đến `hieu_luc_tu`: job áp dụng | Thay **cả dòng** từng thứ (không trộn giờ cũ), thay danh sách dịch vụ; `ap_dung_luc` đặt; nội dung khớp `noi_dung_sau` | CN b10 | I |
| CN-81 | Một giây **trước** `hieu_luc_tu` / ngay sau khi duyệt | **Không** áp dụng | CN hậu điều kiện | I |
| CN-82 | Job chạy hai lần / hai instance đồng thời | Áp dụng **đúng một lần** | H11 | I |
| CN-83 | Job tắt rồi bật lại sau `hieu_luc_tu` (yêu cầu **chưa từng** bị đánh dấu quá hạn, không còn lịch/ca chưa xử lý) | Áp dụng bù; `ap_dung_luc >= hieu_luc_tu` | CN b10 | I |
| CN-84 | Lỗi giữa chừng khi áp dụng nhiều thứ | Rollback; `ap_dung_luc` vẫn NULL; lần quét sau thử lại | CN b10 | I |
| CN-85 | Yêu cầu `ChoDuyet`/`TuChoi` không bị áp dụng | Đúng | CN b10 | I |
| CN-86 | `noi_dung_sau` không hợp lệ khi áp dụng (dữ liệu hỏng) | Không áp dụng; log lỗi; không làm hỏng lịch đang có | H12 | I |
| CN-87 | Đọc yêu cầu lịch sử dạng cũ `gio_mo_cua/gio_dong_cua` | Chi tiết hiển thị được, không lỗi | quy tắc 43 | I |
| CN-88 | `getPendingEffectiveChanges(chiNhanhId)` trả đúng các yêu cầu `DaDuyet` chưa áp dụng `[Q6]` | Đúng | CN b9–b10 | I |
| CN-89 | FE: thêm/sửa chi nhánh (hai khoảng/thứ), lỗi theo thứ, "đã lưu ngay" vs "chờ duyệt", chi tiết yêu cầu, Duyệt (chọn thời điểm, xác nhận), Từ chối (lý do), banner chưa cấu hình số ngày | Đúng từng trạng thái | CN b1–b9, A1–A3 | C |

**Lịch/ca chưa xử lý (Q7, Q46, Q48 = B), rút và hủy (Q3, Q47)**

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| CN-64 | Duyệt khi còn lịch hẹn hoặc ca tương lai bị ảnh hưởng (tính tại `hieu_luc_tu`) | **Duyệt được** (không chặn — Q48 = B); `DaDuyet`; bản chụp ảnh hưởng được ghi; thông báo + email cho bệnh nhân | Q48 | I |
| CN-65 | Trong thời gian chờ, `getPendingEffectiveChanges(chiNhanhId)` | Trả yêu cầu `DaDuyet` chưa áp dụng (kể cả quá hạn) để `booking` chặn đặt/đổi lịch vào vùng bị loại (Q6) | Q6; Q48 | I |
| CN-66 | Job đúng lúc `hieu_luc_tu` khi còn lịch hẹn/ca chưa xử lý | **Không áp dụng gì** (không một phần); `qua_han_luc` đặt; vẫn `DaDuyet`, `ap_dung_luc` NULL; chi nhánh chưa đổi; cảnh báo Admin Toàn hệ thống + người đề xuất; **không** hủy/đổi lịch, không hoàn tiền | Q7; Q46; Q48 | I |
| CN-67 | Sau CN-66, các lịch/ca được xử lý hết (giả lập) rồi job chạy nhiều lần | **Không tự áp dụng muộn** (`qua_han_luc IS NOT NULL` ⇒ job bỏ qua); `ap_dung_luc` vẫn NULL | Q48 | I |
| CN-68 | Lịch hẹn mới xuất hiện sau lúc duyệt (`booking` chưa chặn — kiểm phòng thủ) | Job **tính lại**, nhận ra lịch mới ⇒ coi như còn lịch chưa xử lý ⇒ quá hạn (không tin bản chụp lúc duyệt) | Q46; H19 | I |
| CN-69 | Quan sát `lich_hen`, ví, `khung_gio` trước/sau duyệt và sau job | Duyệt/job **không** tự hủy, đổi, hoàn tiền hay xoá ca/khung giờ | Q7 | I |
| CN-70b | Chi tiết yêu cầu sau khi có email lỗi | Hiển thị số `DaGui`/`ThatBai` và lỗi rút gọn cho Toàn hệ thống và Admin Chi nhánh của chi nhánh đó | Q9 | I |
| CN-90 | Người đã gửi **rút** yêu cầu `ChoDuyet` `[Q47]` | `DaRut`; dữ liệu chi nhánh nguyên; audit `RutThayDoiChiNhanh`; Toàn hệ thống được báo; "yêu cầu đang mở" được giải phóng | Q3 | I |
| CN-91 | Người khác (Admin Chi nhánh cùng chi nhánh nhưng không phải người gửi; Admin Chi nhánh khác) rút | Cùng chi nhánh ⇒ 403; khác chi nhánh ⇒ 404 | Q3; Q40 | I |
| CN-92 | Rút yêu cầu đã `DaDuyet`/`TuChoi`/`DaRut`/`DaHuy` | `YEU_CAU_KHONG_THE_RUT_HUY` | Q3 | I |
| CN-93 | Toàn hệ thống **hủy** yêu cầu `DaDuyet` chưa áp dụng, có lý do (cả khi chưa tới và khi **đã quá `hieu_luc_tu`/quá hạn**) | `DaHuy` + `nguoi_huy_id`/`thoi_diem_huy`/`ly_do_huy`; job **không** áp dụng; audit `HuyThayDoiChiNhanh`; thông báo người đề xuất **và** các bệnh nhân đã được báo; email thay đổi còn chờ gửi bị dừng (`BoQua`) | Q3; Q47 | I |
| CN-94 | Hủy sau khi đã `ap_dung_luc` | `YEU_CAU_KHONG_THE_RUT_HUY`; thay đổi giữ nguyên | Q3 | I |
| CN-95 | Hủy không lý do / chỉ khoảng trắng | 400; vẫn `DaDuyet` | Q3 | U |
| CN-96 | Hủy đồng thời với job áp dụng đúng `hieu_luc_tu` | Khoá hàng quyết định: hoặc áp dụng xong (hủy bị từ chối) hoặc hủy xong (job không áp dụng); không trạng thái lai | H11; Q3 | I |
| CN-97 | Sau rút/hủy gửi yêu cầu mới cho cùng chi nhánh | Được (cột sinh UNIQUE `dang_mo_chi_nhanh` giải phóng) | Q3; Q47 | I |
| CN-98 | Admin Chi nhánh gọi `cancel` | `KHONG_DU_QUYEN` | Q3 | I |
| CN-99 | Audit rút/hủy/duyệt/từ chối | Mỗi hành động 1 dòng cùng giao dịch, đúng `chi_tiet_thay_doi` (5.10), không bí mật | Q39 | I |

**Quá hạn, dời hiệu lực, dừng email (Q47, Q48)**

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| CN-100 | Admin Toàn hệ thống **dời hiệu lực** yêu cầu quá hạn với `hieu_luc_tu` mới `>=` bây giờ + N | `hieu_luc_tu` đổi; `qua_han_luc = NULL`; `so_lan_doi_hieu_luc + 1`; bản chụp ảnh hưởng **tính lại** ở mốc mới; thông báo + email **lại** cho bệnh nhân trong danh sách mới; báo người đề xuất; audit `DoiHieuLucThayDoiChiNhanh`; job sẽ tính lại ở mốc mới | Q48 | I |
| CN-101 | `hieu_luc_tu` mới sớm hơn bây giờ + N (biên: bằng ⇒ chấp nhận; sớm hơn 1 giây ⇒ `HIEU_LUC_QUA_SOM`); N = lớn hơn giữa giá trị đã chụp và cấu hình hiện hành | Đúng; thiếu cấu hình ⇒ `HE_THONG_CHUA_CAU_HINH` | Q48; Q5 | I |
| CN-102 | Dời hiệu lực với yêu cầu chưa quá hạn / `ChoDuyet` / `DaRut` / `DaHuy` / đã áp dụng | `YEU_CAU_KHONG_QUA_HAN` | Q48 | I |
| CN-103 | Admin Chi nhánh gọi `reschedule`; hai Toàn hệ thống dời đồng thời | 403; đồng thời: khoá hàng, chỉ một thành công | Q48; H11 | I |
| CN-104 | Hủy yêu cầu quá hạn (`ap_dung_luc IS NULL`, `hieu_luc_tu` đã qua) | Hủy được (điều kiện dựa vào "chưa áp dụng" — Q47) | Q47 | I |
| CN-105 | Hủy/dời khi có email thay đổi `ChoGui` hoặc `ThatBai` còn thử lại | Chuyển `BoQua`; worker **không** gửi nữa; email `DaGui` không đổi; câu lệnh nhận việc của worker sau thời điểm hủy ảnh hưởng 0 dòng | Q47; H21 | I |
| CN-106 | Hủy/dời | Bệnh nhân đã được báo nhận thông báo + email **"hủy"/"dời hiệu lực"** (kể cả khi email cũ đã `DaGui`/đang gửi); người đề xuất được báo | Q47; Q48; H21 | I |
| CN-107 | Sau khi quá hạn, danh sách trở nên rỗng, job chạy lại nhiều lần | **Không áp dụng**; chỉ dời hiệu lực hoặc hủy mới thoát; sau dời, job tính lại ở mốc mới và áp dụng nếu sạch | Q48 | I |
| CN-108 | Trong suốt thời gian quá hạn | `getPendingEffectiveChanges` vẫn trả yêu cầu ⇒ `booking` tiếp tục chặn đặt/đổi lịch vào vùng bị loại | Q6; Q48 | I |
| CN-109 | Cảnh báo quá hạn | 1 thông báo trong ứng dụng cho **mỗi** Admin Toàn hệ thống đang hoạt động và người đề xuất; job chạy lại không tạo trùng; sau dời hiệu lực rồi quá hạn lần nữa ⇒ cảnh báo **mới** (mã sự kiện kèm phiên bản) | Q48 | I |
| CN-110 | API/giao diện: `hieu_luc_tu` được trả/hiển thị là "**dự kiến có hiệu lực**", `ap_dung_luc` là "**đã áp dụng lúc**" (NULL ⇒ chưa áp dụng); trạng thái "Quá hạn – chờ xử lý" suy ra đúng | Đúng nhãn và giá trị | Q48 | I/C |
| CN-111 | FE: danh sách + chi tiết yêu cầu ở trạng thái quá hạn: danh sách lịch/ca cần xử lý, banner, nút Dời hiệu lực (chọn thời điểm, báo tối thiểu N ngày), nút Hủy (lý do), Admin Chi nhánh chỉ xem | Đúng từng trạng thái | Q47; Q48 | C |

### 7.9 Phân quyền theo phạm vi chi nhánh (PQ)

Ma trận: **Khách → 401 · Bệnh nhân/Bác sĩ/Lễ tân → 403 · Quản trị viên Chi nhánh (đúng chi nhánh) · Quản trị viên Chi nhánh (sai chi nhánh) · Quản trị viên Toàn hệ thống.**

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| PQ-01 | Mọi endpoint `/admin/*` (duyệt từ sổ tuyến) khi **thiếu/hết hạn token** | 401 | SOW 3.2.1 | I |
| PQ-02 | Mọi endpoint `/admin/*` với vai trò `BenhNhan`, `BacSi`, `LeTan` | 403 | SOW 3.2.1 | I |
| PQ-03 | Endpoint **chỉ Toàn hệ thống** (thêm chi nhánh, duyệt/từ chối/hủy/dời hiệu lực, PK, CH, ghi chuyên khoa/dịch vụ, đổi chi nhánh bác sĩ, tạo Quản trị viên, khoá Quản trị viên/Bệnh nhân, mở khoá no-show) với Quản trị viên Chi nhánh | `KHONG_DU_QUYEN` (kể cả khi gọi trực tiếp, UI không ẩn) | 2.4 các UC | I |
| PQ-04 | Toàn hệ thống trên **mọi** endpoint hợp lệ | Thành công | — | I |
| PQ-05 | Quản trị viên Chi nhánh **đúng chi nhánh**: chi nhánh, yêu cầu, bác sĩ, lễ tân, bệnh nhân (xem) | Thành công theo quyền | CN, BS, NS, TK | I |
| PQ-06 | Quản trị viên Chi nhánh **sai chi nhánh** (chi nhánh khác của hệ thống): đọc/sửa chi nhánh, yêu cầu, bác sĩ, lễ tân, tài khoản nhân sự, gửi lại liên kết | 404 `KHONG_TIM_THAY`; **không đổi gì** | TK A1; BS A3; CN | I |
| PQ-07 | IDOR: Quản trị viên Chi nhánh gửi `chiNhanhId` giả trong body/query (tạo nhân sự, sửa bác sĩ, lọc danh sách) | Bị từ chối / danh sách vẫn chỉ trong phạm vi; chi nhánh tài nguyên lấy từ DB | H1 | I |
| PQ-08 | Danh sách: `total`, bộ lọc `chiNhanhId` khác phạm vi, sắp xếp, tìm kiếm | Không lộ số lượng/bản ghi ngoài phạm vi | H1 | I |
| PQ-09 | Phạm vi **đổi sau khi cấp JWT** (sửa `quan_tri_vien.chi_nhanh_id` trực tiếp DB) | Request kế tiếp dùng phạm vi mới (đọc DB mỗi request) | 5.2 | I |
| PQ-10 | Tài khoản `QuanTriVien` **không có** dòng `quan_tri_vien` (dữ liệu hỏng) | 403 (đóng mặc định) | 5.2 | I |
| PQ-11 | Thêm một route mới dưới `/admin` mà thiếu `@Roles`/`@RequireAdminScope` | Test duyệt sổ tuyến **fail** | 5.2 | U |
| PQ-12 | Quản trị viên bị `NgungHoatDong` / phiên bị thu hồi gọi API | 401 (guard auth) | auth A4 | I |
| PQ-13 | Tài nguyên không tồn tại vs tồn tại nhưng ngoài phạm vi (Q40, H20) | **Cùng** 404, cùng thân phản hồi, thời gian gần nhau; 403 chỉ cho tài nguyên thấy được nhưng không có quyền hành động | TK A1 | I |
| PQ-14 | Hai Quản trị viên Chi nhánh của **hai chi nhánh** thao tác song song trên dữ liệu của nhau | Mỗi người chỉ thấy/sửa phạm vi mình | H1 | I |
| PQ-15 | Audit/ghi nhật ký lấy `tai_khoan_id` từ **phiên**, không từ body | Đúng | SOW 3.2.4 | I |

### 7.10 Bảo mật dùng chung (SE-A) và dữ liệu mẫu (SD)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| SE-A1 | Quét log toàn bộ luồng admin tìm token kích hoạt/mật khẩu/băm mẫu | Không có | SOW 3.2.2 | I |
| SE-A2 | Mọi DTO ghi: thêm trường lạ (`trangThai`, `loaiTaiKhoan`, `phamViQuanTri`, `matKhauBam`, `idNguoiTao`…) | Bị từ chối, không có ảnh hưởng | H7 | U |
| SE-A3 | `ma_xac_thuc.ma_bam` của liên kết = SHA-256 hex; không có token rõ | Đúng | auth H10 | I |
| SE-A4 | Token kích hoạt: 32 byte ngẫu nhiên, hai lần tạo khác nhau, đủ entropy | Đúng | H6 | U |
| SE-A5 | Mật khẩu kích hoạt lưu Argon2id (`$argon2id$`, m=19456, t=2, p=1) | Đúng | auth S6 | I |
| SE-A6 | Tên/mô tả có HTML/script hiển thị ở FE | Escape, không thực thi | SOW 3.2.2 | C |
| SE-A7 | Upload: MIME giả, SVG, `../` trong tên, tệp 0 byte, ảnh hỏng/động, quá 10 MB/25 MP, output quá 2 MB, tải nhiều lần; sai quyền; thiếu cấu hình; lỗi/timeout Cloudinary | Từ chối đầu vào sai/tiền xử lý thất bại trước provider; giới hạn decoder/buffer/tài nguyên; sai quyền không gọi provider; định danh server tạo, không lộ secret. Lỗi 4xx theo contract; provider 503/504 dùng LOI_HE_THONG + requestId theo convention hiện tại, không báo thành công giả; tải nhiều lần không ghi đè tài nguyên khác. Test tự động dùng fake adapter | H15 | I |
| SE-A8 | SQL injection qua `q`, `sort`, `order`, id, `lyDo` | Không lọt (tham số hoá/whitelist) | SOW 3.2.2 | I |
| SE-A9 | Mọi thao tác ghi đa bảng: ép lỗi bước cuối | Rollback toàn bộ | 5.8 | I |
| SE-A10 | Giới hạn độ dài `lyDo`, mô tả, `q` | Từ chối chuỗi quá dài (không DoS) | 5.8 | U |
| SE-A11 | `.env.example` có mọi biến mới, không giá trị thật; `gitleaks` xanh | Xanh | CONTRIBUTING 5 | M |
| SE-A12 | Mật khẩu/băm không có trong mọi response admin | Đúng | SOW 3.2.2 | I |
| SE-A13 | API admin dùng header `Authorization` (không cookie) ⇒ không CSRF; `/staff-activation/*` không đặt cookie | Đúng | auth Q2 | I |
| SE-A14 | `NOW()` của MySQL và mốc ứng dụng quanh 23:59/00:00 trên **mọi kết nối mới** trong pool | Cùng giờ VN (session `time_zone` đã đặt) | Q43; H13 | I |
| SE-A15 | Mọi dòng audit của admin (5.10) | Không chứa mật khẩu, token, băm, OTP | Q39; SOW 3.2.2 | I |
| SD-01 | `seed:catalog` chạy hai lần liên tiếp | Idempotent (không nhân đôi, không lỗi) | `[Q44]` | I |
| SD-02 | Dữ liệu seed thoả mọi CHECK (đủ 7 thứ/chi nhánh, cặp (chi nhánh, dịch vụ) của bác sĩ hợp lệ) | Đúng | quy tắc 28 | I |
| SD-03 | Seed chạy khi `NODE_ENV=production` | Từ chối (trừ `first-admin`) | `[Q44]` | U |
| SD-04 | `seed:first-admin`: tạo khi chưa có; khi đã có Toàn hệ thống | Tạo `DangHoatDong`; lần sau từ chối; không log mật khẩu; mật khẩu qua validator auth | `[Q30]`; H18 | I |
| SD-05 | `seed:dev-accounts` ⇒ đăng nhập được từng vai trò (auth) | Đúng | `[Q44]` | M |
| SD-06 | `seed:config-dev` tạo dòng cấu hình **dữ liệu thử** | Đúng; ghi rõ không phải quyết định | `[Q36]` | I |

## 8. Đề xuất chia việc và gom cụm (chỉ đề xuất — nhóm chốt)

Nguyên tắc: **một người làm trọn module `admin` (backend + frontend)** theo các cụm dưới đây; người còn lại tiếp tục `auth` hoặc module khác (xem auth PLAN mục 8). Mỗi task ở mục 6 là **một PR**; cụm chỉ là thứ tự làm. Hai người vẫn phải giải thích được toàn bộ module khi vấn đáp.

| Cụm | Nội dung (task) | Vì sao thứ tự này | Điều kiện bắt đầu |
|---|---|---|---|
| **0 — Chốt câu hỏi** | Q1–Q48 **đã trả lời 25/10/2026**; còn phần còn lại của Q45 | Tránh làm lại | — |
| **1 — Nền dữ liệu** | P1, P3 (+P2 nếu Q41), P4, P5, P6, C3 | Không cần chờ tính năng auth | auth P1 + P3 |
| **2 — Phạm vi & dùng chung** | C1 (policy thuần trước, controller sau auth A4), C2 `[Q39]`, P7 `[Q13; PLAN Cloudinary, Q1–Q3 đã duyệt]` | Mọi controller cần phạm vi | auth A4 |
| **3 — Danh mục đơn giản** | B1 → F2; B2 → B3 → F3; B4 → F4 | Dữ liệu nền cho bác sĩ/chi nhánh; ít phụ thuộc | C1 |
| **4 — Cấu hình hệ thống** | B5 → F5 (+B6) ; C5 (seed catalog + config-dev) | Cần cho duyệt yêu cầu chi nhánh và cho nhóm dùng chung dữ liệu mẫu | C2, C3 |
| **5 — Chi nhánh (đọc/thêm)** | B7 → F6a | Bác sĩ/nhân sự cần chi nhánh + dịch vụ khả dụng | B1–B3 |
| **6 — Nhân sự & kích hoạt** | B14 → B15 → B16 → F10 → F8 (phần tạo) | Cần `MailService` + `PasswordHasher` của auth | auth P4, A1 |
| **7 — Tài khoản người dùng** | B17 → B18 → B19 → B20 → F8 (phần quản lý) → F9 | Khoá cần `SessionService` | auth A3 |
| **8 — Hồ sơ bác sĩ** | B12 → B13 → F7 | Cần bác sĩ có sẵn từ cụm 6 và chi nhánh từ cụm 5 | B7, B15 |
| **9 — Yêu cầu thay đổi chi nhánh** (khó nhất, làm sau cùng) | C4 → B8 → B9 → B10 → B11 → B21 → B22 → F6b | Cần thông báo/email, cấu hình, bảng nền; nhiều điểm mở nhất | C3, C4, P2 |
| **10 — Hoàn tất** | D* (xuyên suốt), X1 → X2 (→ X3 khi cần) | | |

Thứ tự PR gợi ý: P1 → P3 → P4 → C1 → B1 → B2/B3 → B4 → B5 → C5 → B7 → B14 → B15/B16 → B17 → B18–B20 → B12 → B13 → C4 → B8 → B9 → B10 → B11 → B21 → B22 → các F-task ngay sau backend tương ứng.
Nếu cần chia nặng hơn: người thứ hai nhận cụm **9** (chi nhánh — yêu cầu thay đổi) hoặc nhóm F sau khi hợp đồng API của cụm tương ứng đã chốt.

## 9. Quy trình bắt buộc cho mỗi PR của module

1. Nhánh `feat/admin-<việc>`; tiêu đề PR theo Conventional Commits, scope `admin` (hạ tầng: `rbac`/`audit`/`notification`/`api`/`web`/`db`/`docker`/`docs`). Commit/push/merge **do thành viên tự làm**; không để lại dòng `Co-Authored-By` của AI (CONTRIBUTING 9).
2. Dùng AI ⇒ ghi `AI_USAGE_LOG.md` bảng 1 **ngay**; lỗi AI phát hiện ⇒ bảng 2 + `AI-BUG-nnn` trong commit sửa. **Lần lập kế hoạch này cũng cần một dòng** (kiểm file đang sửa dở trước — mục 2).
3. Đổi thiết kế/DB ⇒ cập nhật tài liệu trong cùng PR (task `[ĐỒNG BỘ TL]`, mục 6.6); sửa **cả ba** file `docs/database/*` và phối hợp thứ tự với auth D2/D3/D7.
4. Cấu hình mới ⇒ `.env.example`; **không** commit App Password/khoá/mật khẩu seed. Lối tắt kỹ thuật ⇒ `docs/TECH_DEBT.md`.
5. Cập nhật `TRACKING.md` sau mỗi task; khi cả module xong thêm **đúng một dòng** vào `docs/TRACKING.md` gốc.
6. Mỗi test ghi mã test case (mục 7); luôn có ca âm và ca biên; mọi endpoint mới có ca **đúng/sai vai trò, đúng/sai chi nhánh** (PQ).
7. Tự giải thích được mọi đoạn code — đặc biệt: cơ chế phạm vi và vì sao kiểm trong giao dịch sau khi khoá hàng; giao dịch duyệt (chụp số ngày, ghi danh sách ảnh hưởng, thông báo theo bệnh nhân); job áp dụng idempotent; thứ tự thu hồi–đặt `da_gui_luc` của liên kết kích hoạt; kiểm chặn đổi chi nhánh và chạy đua với đặt lịch; khoá Quản trị viên Toàn hệ thống cuối cùng.

## 10. Điều kiện hoàn thành module

- Mọi test case ở mục 7 đã chạy; kết quả ghi trong `TRACKING.md`; không còn Fail.
- Không còn thẻ `[CHỜ …]`; mọi `[ĐỒNG BỘ TL]` đã làm; 2.4, `docs/database/*` và Figma khớp với mã (đặc biệt L1–L19).
- Cả hai phạm vi (Toàn hệ thống, Chi nhánh) chạy đúng trên giao diện thật: Chi nhánh không thấy/không sửa được ngoài chi nhánh được gán, kể cả khi gọi API trực tiếp.
- `docker compose up --build` chạy ba service; seed dùng chung chạy được; gửi và nhận được email kích hoạt, gửi lại, và email thông báo thay đổi chi nhánh qua Gmail SMTP thật; kích hoạt xong đăng nhập được (auth).
- Lint/build/test xanh; không secret; `AI_USAGE_LOG.md` đầy đủ; X3 được ghi nhận là việc còn lại trước khi mở công khai.
