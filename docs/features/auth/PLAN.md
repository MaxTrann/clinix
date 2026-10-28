# Kế hoạch module `auth`

> **Trạng thái: bản nháp 4 (25/10/2026).** Đã chốt toàn bộ: Q1–Q11, S1–S7, G1–G5 (mục 4.1), N1–N10 và trang giữ chỗ (mục 4.2). **Không còn điểm mở về thiết kế**;
> còn việc của nhóm ngoài repo (Figma, 2.4, tạo Gmail — mục 4.5). Task nào bị chặn bởi điểm mở sau này gắn thẻ `[CHỜ Nn]`.
> Kế hoạch do AI (Claude) lập theo [`docs/FEATURE_PLANNING_PROMPT.md`](../../FEATURE_PLANNING_PROMPT.md) →
> **ghi `AI_USAGE_LOG.md` (bảng 1) cho lần này và cho mọi lần dùng AI sinh code theo kế hoạch.**
> Tiến độ thật và quyết định đã chốt ghi ở [`TRACKING.md`](TRACKING.md) cùng thư mục.
> Đã đối chiếu Figma CLINIX ngày 25/10/2026 (20 frame: 14 màn AUTH, 2 email OTP, 4 trang "Thông tin cá nhân"/"Hồ sơ người khám").

## 0. Quy ước đọc

- Tên use case viết tắt trong cột "Truy vết": **ĐK** = Đăng ký tài khoản, **ĐN** = Đăng nhập, **QMK** = Quên mật khẩu,
  **ĐMK** = Đổi mật khẩu, **ĐX** = Đăng xuất. `b4` = bước (4); `A2/4c` = luồng thay thế A2, mục 4c. Số bước/luồng lấy
  đúng 2.4 bản Drive 25/10/2026 (**trước** các thay đổi của Q5/Q7/Q8 ở mục 4.1 — chúng phải được ghi ngược vào 2.4, task D8).
- Nguồn đúng khi lệch nhau: **schema DB (`docs/database/`, bản 20/10/2026) để code**; chỗ lệch với 2.4 ở mục 3.4.
- Thẻ: `[ĐỒNG BỘ TL]` = task phải cập nhật tài liệu (2.4, `docs/database/*`, sơ đồ) trong **cùng PR** (CONTRIBUTING mục 7);
  `[TIỀN ĐỀ]` = việc Phase 0/1 mà module cần; `[CHỜ Nn]` = bị chặn bởi điểm còn mở.
- Mỗi task = **một PR** nhỏ, tiêu đề Conventional Commits, scope `auth` (hoặc `api`/`web`/`db`/`docker`/`docs`). Test đặt
  cạnh mã; mỗi test ghi mã test case ở mục 7.

## 1. Phạm vi

**Làm:** 5 use case ĐK, ĐN, QMK, ĐMK, ĐX. "Gửi email mã OTP" **không** là use case riêng — hiện thực như bước trong ĐK (b6)
và QMK (b5).

**Không làm (module `admin`):** "Tạo tài khoản nhân sự", "Quản lý tài khoản người dùng", luồng kích hoạt bằng liên kết
(`loai_xac_thuc = KichHoatNhanSu`). Với nhánh "Chờ kích hoạt" ở ĐN (A3) và QMK (A5) chỉ làm phần **từ chối + thông báo**.

**Không làm (module khác):** hồ sơ bệnh nhân đầy đủ (`patient`), đặt lịch (`booking`), logic ví (`wallet`; `auth` chỉ tạo
dòng ví rỗng), Ownership/Scope của RBAC (`rbac`). `auth` chỉ cung cấp nền: định danh + vai trò + guard kiểm vai trò ở backend.

**Ngoài 2.4 nhưng bắt buộc** (đánh dấu "bổ trợ"): endpoint `refresh` (quyết định phiên đã chốt); `GET /auth/me` (giao diện cần
vai trò khi điều hướng, ĐN b8).

## 2. Hiện trạng repo (đã kiểm tra 25/10/2026)

- `apps/api`, `apps/web` **chỉ có `Dockerfile`** (và `nginx.conf`, `.dockerignore`) — chưa có `package.json`, chưa có mã.
- `docker-compose.yml`: 3 service `db` (MySQL 8.4), `api`, `web`. `docker-compose.staging.yml` **chưa đọc** — kiểm khi làm P6.
- `.env.example` có `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `WEB_ORIGIN`, `VITE_API_URL=http://localhost:3000`; **chưa có**
  biến SMTP, `OTP_HMAC_SECRET`, `JWT_RESET_SECRET`, thời hạn token.
- `apps/web/nginx.conf` **không proxy** sang API → hiện web và API khác origin; quyết định Q2 (cùng origin qua proxy) yêu cầu đổi.
- `.github/workflows/ci.yml` chạy `npm test -- --coverage` cho api/web, **không có service MySQL** → test tích hợp cần DB
  không chạy được trên CI trừ khi bổ sung (xem P3). *(Đã bổ sung ở P3: job `api` có service MySQL 8.4 và chạy `test:int`, `test:e2e`.)*
- `commitlint.config.cjs` có scope `auth`. `docs/PLAN.md` Phase 0: #1 ORM, #2 thời hạn token vẫn `[cần điền]` → P0 điền.

## 3. Phân tích ảnh hưởng

### 3.1 Bảng/cột `auth` chạm tới (đọc từ `docs/database/`, bản 20/10/2026)

| Bảng | Cột / ràng buộc quan trọng | Dùng cho |
|---|---|---|
| `tai_khoan` | `email` UNIQUE (collation `utf8mb4_unicode_ci`: **không phân biệt hoa/thường và dấu**); `mat_khau_bam`; `trang_thai`; `da_xac_minh_email` (mặc định false); `so_lan_dang_nhap_sai`, `khoa_dang_nhap_den`; `loai_tai_khoan`; `thoi_diem_tao`. CHECK `chk_tai_khoan_mat_khau` (DangHoatDong bắt buộc có mật khẩu; ChoKichHoat thì NULL), `chk_tai_khoan_cho_kich_hoat_nhan_su` | ĐK b5, b9; ĐN; QMK; ĐMK |
| `benh_nhan` | PK = `tai_khoan_id`; chỉ có `khoa_dat_lich_do_no_show`, `so_lan_no_show` (họ tên, SĐT… ở `tai_khoan`) | ĐK b9: tạo cùng giao dịch với xác minh |
| `vi_noi_bo` | `benh_nhan_id` UNIQUE NOT NULL; `so_du`, `so_tien_dang_giu` mặc định 0; `chk_vi_so_du` | ĐK b9 (Q9): tạo ví 0/0 cùng giao dịch |
| `ma_xac_thuc` | `loai` (`DangKy`/`QuenMatKhau`; `KichHoatNhanSu` **không dùng**), `ma_bam`, `het_han_luc`, `da_dung_luc`, `da_gui_luc` (**dùng cho OTP từ N1:** có giá trị = mail đã gửi thành công), `thu_hoi_luc`, `so_lan_nhap_sai`, `tao_luc`; index `(tai_khoan_id, loai, tao_luc)`; CHECK `da_dung_luc IS NULL OR thu_hoi_luc IS NULL`; FK → `tai_khoan` (không CASCADE). **Thêm 3 cột + 1 CHECK cho Q7 (mục 5.2)** | OTP: ĐK, QMK |
| `phien_dang_nhap` | `refresh_token_bam` UNIQUE, `tao_luc`, `het_han_luc`, `thu_hoi_luc`; FK → `tai_khoan` (không CASCADE). Tên đã chốt (Q10); **không cần cột mới** cho Q2 | ĐN b7; ĐX; refresh |

### 3.2 Bảng ngoài danh sách đã mở thêm (và lý do)

- `vi_noi_bo` (DDL + `chk_vi_so_du`): Q9 quyết định tạo ví ở `auth`.
- `hanh_dong_nhay_cam_enum`, `loai_doi_tuong_enum` (chỉ đọc giá trị): xác nhận auth **không** phải ghi Audit Log (enum không có đăng
  nhập/đổi mật khẩu/đăng ký) → không thêm gì.
- `email_thong_bao`: gắn với `thong_bao` (UC "Gửi email thông báo theo sự kiện") → **không dùng cho email OTP**.

### 3.3 Hành vi/module khác bị ảnh hưởng

| Module | Điểm chạm | Cách xử lý |
|---|---|---|
| `booking` | Tài khoản `da_xac_minh_email = false` không được đặt lịch | Do Q5, tài khoản chưa xác minh **không có phiên** nên không tới được `booking`; `booking` vẫn phải kiểm cờ ở backend (phòng thủ). Ghi chú sang PLAN của `booking`. |
| `patient` | Dòng `benh_nhan` chỉ có **sau** OTP đúng | Truy vấn `benh_nhan` ở module khác chịu được "chưa có hồ sơ" (không xảy ra với tài khoản đã đăng nhập được, nhưng giữ phòng thủ). |
| `wallet` | `vi_noi_bo` được `auth` tạo (số dư 0) | Module ví **không** tự tạo ví khi đăng ký; chỉ đọc/ghi sổ cái. Ghi chú sang PLAN của `wallet`. |
| `admin` | Tạo nhân sự (`ChoKichHoat`, `mat_khau_bam NULL`), khoá/mở khoá | `auth` không ghi `trang_thai`. Guard kiểm `trang_thai` mỗi request nên khoá tài khoản có hiệu lực ngay. Ghi chú sang PLAN của `admin`. |
| `rbac` | Role + Ownership + Scope | `auth` chỉ làm `JwtAuthGuard` + `RolesGuard` (vai trò). |
| `notification` | Email nghiệp vụ khác | `MailService` (P4) viết dùng chung. |
| hạ tầng (`docker`, staging) | Cookie `Secure` + cùng origin qua proxy (Q2); Gmail SMTP (Q3) | Nginx của `web` phải proxy `/api`; staging **phải chạy HTTPS** (xem H11, N5). |

### 3.4 Chỗ 2.4 và schema/docs lệch — cách đã giải quyết

| # | Lệch | Giải quyết | Đồng bộ |
|---|---|---|---|
| L1 | 2.4 "[15 phút]" vs docs `[cần điền]` | **24 giờ** từ `thoi_diem_tao`, không gia hạn (Q4) | D1 |
| L2 | "Vô hiệu OTP" nhưng ghi chú `thu_hoi_luc` và `da_gui_luc` chỉ cho kích hoạt nhân sự | Dùng `thu_hoi_luc` (S1) **và `da_gui_luc`** (N1: phân biệt mã đã gửi thành công) cho OTP — chỉ sửa ghi chú | D2 |
| L3 | Gửi mail lỗi: giới hạn/mã cũ chưa rõ | Hàng mới bị thu hồi (`da_gui_luc` rỗng), giữ mã cũ nếu còn hạn, lần lỗi vẫn tính giới hạn (S3, N1) | D2 |
| L4 | ĐX A1 "không hoạt động quá lâu"; `phien_dang_nhap` thiếu thời hạn | Idle 30 phút, trần 8 giờ, xoay + phát hiện dùng lại (Q2); dùng cột sẵn có; tên giữ nguyên (Q10) | D3 |
| L5 | QMK giữ "phiên đã xác minh OTP" không có chỗ lưu | `resetToken` ký riêng (S2) | D6 |
| L6 | Class Diagram: BenhNhan ◆ ViNoiBo 1–1, DB chưa có quy tắc tạo | Tạo ví 0/0 cùng giao dịch ĐK b9 (Q9) | D4 |
| L7 | "Độ mạnh mật khẩu", "định dạng SĐT" chưa có số | 8–64 ký tự, ≥ 1 chữ số, ≥ 1 ký tự đặc biệt (Q11); SĐT 10 số bắt đầu 0 (S5) | D5 |
| L8 | ĐK A4 "mã từng hợp lệ nhưng quá hạn" | Kiểm hạn **trước**, quá hạn ⇒ "hết hạn", không tăng lần sai (S3) | D5 |
| L9 | ĐK A2/4c chỉ gửi lại OTP, không nói dữ liệu đăng ký mới | Mỗi lần đăng ký lại là một **lần đăng ký riêng** gắn với OTP; chỉ áp dữ liệu khi OTP đó đúng; chỉ mã **đã gửi thành công** mới thay mã cũ (Q7, N1) ⇒ **thay đổi schema** (mục 5.2) | D7 |
| L10 | QMK chỉ loại `ChoKichHoat` | `NgungHoatDong` có mật khẩu được đặt lại; chưa từng có mật khẩu ⇒ như Chờ kích hoạt (S4) | D6 |
| L11 | 2.4 ĐN và quy tắc 23 chỉ kiểm trạng thái ⇒ tài khoản chưa xác minh được vào | **Đổi (Q5):** đúng mật khẩu nhưng chưa xác minh ⇒ **không tạo phiên**, hướng tới màn OTP | D8 |
| L12 | 2.4 ĐMK/QMK không nói thu hồi phiên | Có (Q8) | D8 |
| L13 | Figma "Còn N lần thử" vs 2.4 thông báo chung | Bỏ dòng đó, sửa Figma (G1) | Figma |
| L14 | Email Figma "hiệu lực 5 phút" vs 10 phút | Sửa Figma thành 10 phút (G2) | Figma |

Không lệch (đã đối chiếu): OTP 10 phút / 5 lần sai mỗi mã / gửi lại ≥ 60 giây và ≤ 5 mã/giờ (quy tắc 17); khoá đăng nhập 5 lần / 15
phút (quy tắc 18); kiểm trạng thái trước khi so mật khẩu (quy tắc 23); phiên dùng `refresh_token_bam`/`thu_hoi_luc` (quy tắc 19).

### 3.5 Bẫy/rủi ro (xử lý trong task)

- **H1 — Job dọn có thể xoá nhầm nhân sự.** Nhân sự `ChoKichHoat` cũng có `da_xac_minh_email = false`. Điều kiện xoá **bắt buộc**
  `loai_tai_khoan = 'BenhNhan'` và `da_xac_minh_email = false` và quá 24 giờ (DK-35).
- **H2 — Xoá bị FK chặn.** `ma_xac_thuc` và `phien_dang_nhap` tham chiếu `tai_khoan` không CASCADE → xoá hai bảng trước, trong cùng
  giao dịch; kiểm không còn bảng nào khác tham chiếu.
- **H3 — Chiếm trước tài khoản (pre-hijack).** Đã xử lý bằng thiết kế Q7 + N1: dữ liệu đăng ký gắn với OTP và chỉ áp khi chính OTP đó đúng; mọi thao tác
  xác minh/gửi lại kèm mã lần gửi; chỉ mã **đã gửi thành công** mới thay mã cũ (mục 5.2). **Còn lại:** (a) kẻ xấu dùng hết hạn mức 5 mã/giờ của tài khoản chờ ⇒
  nạn nhân bị "Vui lòng thử lại sau" tới khi hết giờ (giới hạn theo tài khoản, không theo IP — S7); (b) nạn nhân có thể nhận email OTP không do mình yêu cầu.
  Ghi `TECH_DEBT`.
- **H4 — Bơm email tới địa chỉ bên thứ ba.** `/auth/register` với vô số email mới không bị giới hạn theo IP (S7 hoãn) ⇒ có thể dùng hệ thống
  gửi thư rác, và tạo vô số tài khoản chờ (dọn sau 24 giờ). Chấp nhận trong phạm vi TLCN, **bắt buộc xử lý trước khi mở công khai**
  (`TECH_DEBT` + X3).
- **H5 — Tài khoản chưa xác minh không có phiên (Q5).** Giữ phòng thủ: job dọn vẫn xoá `phien_dang_nhap` của tài khoản trước khi xoá.
- **H6 — So mật khẩu với `NULL`.** Rẽ nhánh theo trạng thái **trước** khi gọi hàm so (không đưa `null` vào hàm băm).
- **H7 — Lộ tồn tại tài khoản qua thời gian phản hồi.** ĐN b4 thông báo chung khi email không tồn tại: so mật khẩu giả (DN-06). QMK A1 và các thông báo
  khoá/ngưng **cố ý** lộ theo 2.4 — ghi `TECH_DEBT`.
- **H8 — Chạy đua.** Đăng ký cùng email (UNIQUE ⇒ xử lý như A2, không 500); gửi lại OTP (khoá hàng `tai_khoan` `FOR UPDATE` rồi mới đếm);
  xác minh cùng OTP hai lần (PK `benh_nhan`/`vi_noi_bo` + điều kiện `da_dung_luc IS NULL`); đăng nhập sai song song (`UPDATE … n = n + 1`).
- **H9 — Không giữ giao dịch mở khi gọi SMTP.** Tạo hàng OTP (commit) → gửi mail → cập nhật theo kết quả.
- **H10 — Mỗi loại bí mật dùng đúng loại băm:** mật khẩu = Argon2id (m=19 MiB, t=2, p=1; S6); OTP = HMAC-SHA-256 với `OTP_HMAC_SECRET` riêng (S3);
  refresh token = chuỗi ngẫu nhiên 256 bit, lưu SHA-256 (tra cứu theo băm xác định; Q2); `resetToken` = ký bằng `JWT_RESET_SECRET` riêng (S2).
  SOW 3.2.2 "không SHA-256 trực tiếp" áp cho **mật khẩu**; ghi rõ trong mã để vấn đáp giải thích được.
- **H11 — Phụ thuộc hạ tầng.** (a) Cookie `Secure` không được trình duyệt chấp nhận trên `http://` ngoài `localhost` ⇒ staging có người truy cập qua mạng **phải chạy HTTPS**
  (N5); `COOKIE_SECURE=false` chỉ cho phát triển cục bộ. (b) Gmail SMTP cần xác thực 2 bước + App Password; hai người dùng chung một hộp thư ⇒ chia sẻ bí mật ngoài repo;
  Google có thể chặn đăng nhập từ IP máy chủ lạ; thư có thể vào spam; Gmail có hạn mức gửi hằng ngày. Mã chỉ biết "SMTP qua biến môi trường" nên đổi nhà cung cấp không sửa mã.
- **H12 — Phát hiện dùng lại refresh token có thể thu hồi nhầm.** Hai tab làm mới cùng lúc, hoặc mất phản hồi mạng sau khi server đã xoay token, khiến token
  cũ bị dùng lại ⇒ phiên bị thu hồi, người dùng phải đăng nhập lại. Giảm bằng làm mới **một lần tại một thời điểm** ở frontend (Web Locks API, F1; N4);
  trường hợp mất phản hồi mạng chấp nhận và ghi `TECH_DEBT`.
- **H13 — So sánh email không phân biệt dấu.** `utf8mb4_unicode_ci` coi `é = e`. **Đã chốt (N9):** chỉ nhận email ASCII trong phạm vi TLCN.
- **H14 — "Không hoạt động" chỉ đo ở lần làm mới.** Access token sống 15 phút nên thời gian không hoạt động thực tế nằm trong khoảng 15–30 phút kể từ thao tác
  cuối; trần 8 giờ kiểm cả ở guard (access token cấp lúc 7 giờ 59 phút không sống quá 8 giờ).

## 4. Quyết định và điểm còn mở

### 4.1 Đã chốt (25/10/2026) và hệ quả cho kế hoạch

| # | Quyết định | Hệ quả |
|---|---|---|
| Q1 | TypeORM, tắt `synchronize`, migration SQL đối chiếu schema chính thức | P3. Migration viết tay từ `clinix_mysql.sql`; kiểm khớp từng dòng. |
| Q2 | Access JWT 15 phút. Phiên không hoạt động 30 phút, tối đa 8 giờ từ lúc đăng nhập. Refresh token ngẫu nhiên 256 bit, lưu băm, xoay mỗi lần dùng; token mang mã phiên có chữ ký; token cũ có chữ ký hợp lệ bị dùng lại ⇒ thu hồi phiên. Refresh ở cookie `HttpOnly; Secure; SameSite=Lax`; access chỉ trong bộ nhớ. Web và API **cùng origin qua proxy**; kiểm `Origin` cho `/refresh`, `/logout` | A3, A4, A9, A10, F1, P6. Định dạng refresh token: `<sid>.<256 bit ngẫu nhiên>.<HMAC ký bằng JWT_REFRESH_SECRET>`; xoay tại chỗ (thay `refresh_token_bam`, đặt `het_han_luc = min(bây giờ + 30 phút, tao_luc + 8 giờ)`); chữ ký đúng nhưng băm không khớp băm hiện tại ⇒ thu hồi phiên. **Không đổi schema.** Access token mang `sid`; guard tra phiên + `trang_thai` mỗi request. H12, H14. |
| Q3 | Gmail SMTP cho cả dev và staging/demo; **không** Mailpit; ưu tiên một Gmail riêng cho CLINIX; cấu hình qua env + App Password; test tự động mock `MailService`; kiểm thử tay và demo gửi thư thật; nội dung theo 2 frame Figma | P4; H11. Không thêm service vào `docker-compose.yml`. |
| Q4 | Tài khoản Bệnh nhân chưa xác minh sống **24 giờ** từ khi tạo, **không gia hạn** khi gửi lại OTP; OTP vẫn 10 phút; dọn bằng job định kỳ **và** kiểm quá hạn ngay khi đăng ký lại; không xoá nhân sự | A5, A7, D1; H1. Hạn mức "5 mã/giờ" nay có ý nghĩa thật (tài khoản sống đủ lâu). |
| Q5 | Tài khoản Bệnh nhân tạo ngay (`DangHoatDong`, `da_xac_minh_email = false`). Đăng nhập **đúng mật khẩu nhưng chưa xác minh** ⇒ hướng tới màn nhập/gửi lại OTP, **không tạo phiên**. OTP đăng ký đúng ⇒ đặt cờ + tạo `benh_nhan` trong cùng giao dịch; từ đó mới đăng nhập được | A8, F2, F3, D8; **thay** quyết định cũ "cho vào". Chi tiết mục 5.2/5.3 và N2. |
| Q6 | Cho phép QMK với tài khoản chưa xác minh; OTP `QuenMatKhau` **chỉ đổi mật khẩu** (không đặt cờ, không tạo `benh_nhan`) | A11, A12. Theo N3: QMK thành công trên tài khoản chưa xác minh thu hồi các OTP đăng ký đang chờ và hướng dẫn đăng ký lại cùng email. |
| Q7 | Mỗi lần đăng ký lại cùng email chưa xác minh = một lần xác minh riêng, gắn OTP với thông tin đăng ký của lần đó; chỉ khi OTP tương ứng đúng mới cập nhật họ tên, SĐT, mật khẩu, đánh dấu xác minh, tạo `benh_nhan` cùng giao dịch. Cần thiết kế lưu/nhận diện, xử lý mã cũ, đồng bộ 2.4/schema/PLAN/test | Thiết kế ở mục 5.2 (đã chốt N1, có `da_gui_luc`). A2, A5, A6, P3, D7. |
| Q8 | QMK thành công: thu hồi **mọi** phiên. ĐMK: thu hồi các phiên khác và **xoay token** phiên hiện tại | A12, A13, D8. |
| Q9 | Tạo ví số dư 0 trong cùng giao dịch xác minh OTP + tạo `benh_nhan` | A6, P3, D4. |
| Q10 | Chốt `phien_dang_nhap`, `refresh_token_bam`, `tao_luc`, `het_han_luc`, `thu_hoi_luc`; bỏ nhãn `[đề xuất]` sau khi nhóm đồng ý | D3. |
| Q11 | Mật khẩu 8–64 ký tự, **bắt buộc ≥ 1 chữ số 0–9 và ≥ 1 dấu câu/ký hiệu** (`!`, `@`, `#`, `$`, `%`, `.`…; dấu cách **không** tính); không bắt buộc chữ hoa/thường; không kiểm danh sách mật khẩu phổ biến; cùng một quy tắc ở ĐK, QMK, ĐMK; cập nhật thông báo lỗi trong Figma, 2.4, test | A1, D5. **Chỉ nhận ký tự ASCII in được** (N10); định nghĩa "ký tự đặc biệt" ở N9/N10. **Figma phải sửa** (hiện chỉ có "Tối thiểu 8 ký tự"). |
| S1 | Dùng `ma_xac_thuc.thu_hoi_luc` cho cả OTP đăng ký và quên mật khẩu | A2, D2. Theo N1 dùng thêm `da_gui_luc` cho OTP. |
| S2 | OTP đúng ⇒ cấp `resetToken` ký riêng, ghi mục đích reset, tài khoản và mã OTP liên quan; hiệu lực 10 phút từ lúc xác minh; khi đặt mật khẩu kiểm lại hàng OTP rồi đặt `da_dung_luc` trong cùng giao dịch; giữ token khi mật khẩu mới sai định dạng | A11, A12, D6. Thêm `JWT_RESET_SECRET`. Giả định kiểm lại hàng OTP = chưa dùng + chưa thu hồi (N6). |
| S3 | OTP 6 chữ số sinh ngẫu nhiên an toàn; lưu HMAC-SHA-256 với khoá riêng, dữ liệu băm gồm mã tài khoản, loại, mã lần gửi; kiểm hạn trước khi so (quá hạn ⇒ "hết hạn", không tăng lần sai); gửi mail thất bại ⇒ vô hiệu mã mới, giữ mã cũ nếu còn hạn; lần thất bại vẫn tính giới hạn | A2, D2, D5. Thêm `OTP_HMAC_SECRET`. |
| S4 | QMK thành công ⇒ xoá bộ đếm sai và khoá tạm. `NgungHoatDong` đã có mật khẩu được đặt lại nhưng vẫn ngưng, **phải báo rõ sau khi hoàn tất**. Chưa từng có mật khẩu ⇒ đi qua kích hoạt nhân sự, không gửi OTP | A11, A12, F4; câu chữ thông báo ở N7. |
| S5 | SĐT: 10 chữ số bắt đầu 0, chuẩn hoá khoảng trắng/dấu chấm trước khi lưu. Email: bỏ khoảng trắng hai đầu, kiểm định dạng và độ dài, **giữ nguyên phần trước `@`, chuyển phần tên miền về chữ thường**; tra cứu theo so sánh không phân biệt hoa/thường của DB | A1; H13, N9. |
| S6 | Argon2id, khởi đầu m=19 MiB, t=2, p=1, đo hiệu năng trên môi trường chạy thật. **Không** tự chuyển bcrypt khi Docker build lỗi: xử lý lỗi build rồi mới cân nhắc đổi thuật toán và chính sách mật khẩu | P1, A1. |
| S7 | **Chưa** triển khai throttling chung theo IP và throttling riêng cho nhập sai mật khẩu cũ; ghi nhận là hướng mở rộng; vẫn làm đủ giới hạn đăng nhập và OTP của đặc tả; **trước khi mở công khai** phải bổ sung và kiểm thử giới hạn request cho API auth | P5 không có throttler; D9 + X3; H3, H4. |
| G1 | Bỏ "Còn N lần thử"; chỉ "Email hoặc mật khẩu không đúng" cho tới khi tài khoản thật sự bị khoá | A8, F3; sửa Figma. |
| G2 | Hai mẫu email: OTP hiệu lực 10 phút | A14; sửa Figma. |
| G3 | Bỏ mọi banner/tài khoản/mật khẩu/mã OTP demo khỏi giao diện triển khai; dev và demo nhận OTP qua Gmail SMTP thật; test tự động dùng `MailService` giả | F2, F4, F5, DK-40. |
| G4 | Tên hiển thị **CLINIX**; nhóm cung cấp địa chỉ gửi và email hỗ trợ có người theo dõi; bỏ hotline/địa chỉ chân trang nếu chưa có giá trị thật | A14, P4; nhóm tạo Gmail riêng và điền cấu hình (N8). |
| G5 | Đăng xuất ngay, không hộp xác nhận | F5. |

### 4.2 Quyết định bổ sung N1–N9 (25/10/2026)

| # | Quyết định | Hệ quả |
|---|---|---|
| N1 | Dữ liệu mỗi lần đăng ký gắn với OTP (3 cột + CHECK trong `ma_xac_thuc`; mã lần gửi = `ma_xac_thuc_id`). **Không** lấy "hàng mới nhất" tuyệt đối: dùng `da_gui_luc` để phân biệt mã **đã gửi thành công**; chỉ mã mới nhất **đã gửi thành công** mới thay mã cũ | Mục 5.2; P3, A2, A5, A6; D2, D7. Gửi lỗi thì hàng mới không thay ai. |
| N2 | Đăng nhập chưa xác minh: **không tự gửi email**; đưa tới màn OTP và cho bấm "Gửi lại mã" theo giới hạn đã chốt; nếu mã cũ hết hạn, màn hình nói rõ để gửi lại | A8, F2, F3; đáp ứng đăng nhập kèm `trangThaiMa` (mục 5.3); DN-17, DN-37. |
| N3 | QMK thành công trên tài khoản chưa xác minh: đổi mật khẩu tài khoản, **thu hồi các OTP đăng ký đang chờ**, hướng dẫn **đăng ký lại cùng email** để nhập thông tin và nhận OTP mới (không cập nhật mật khẩu trong các OTP cũ) | A12, D6; hàng bị thu hồi do QMK được xoá dữ liệu đăng ký (NULL) để không thể "gửi lại" dữ liệu cũ (DK-50, QM-17, QM-18). |
| N4 | Dùng Web Locks để các tab không làm mới token cùng lúc; ghi nhận trường hợp mất phản hồi mạng vào `TECH_DEBT` | F1, A9, D9. |
| N5 | Staging có người truy cập qua mạng **phải dùng HTTPS và cookie Secure**; chỉ cho tắt `Secure` ở môi trường phát triển cục bộ | `COOKIE_SECURE` mặc định bật; API **từ chối khởi động** nếu tắt khi `NODE_ENV` ≠ `development` (A3, SE-09); P0 ghi yêu cầu HTTPS vào `docs/PLAN.md`; X1. |
| N6 | `resetToken`: kiểm chữ ký/hạn; OTP gắn với token phải chưa dùng, chưa thu hồi; **không** kiểm lại giờ hết hạn của OTP | A12, QM-11, QM-13. |
| N7 | Dùng khung "Hoàn tất" của QMK, thêm dòng: "Mật khẩu đã được đặt lại. Tài khoản của bạn hiện đang ngừng hoạt động nên chưa thể đăng nhập. Vui lòng liên hệ bộ phận hỗ trợ." Các lỗi chưa có frame dùng kiểu thông báo lỗi hiện có; nhóm bổ sung trạng thái tương ứng vào Figma | F4; mục 4.4, 5.5. |
| N8 | Nhóm tạo một Gmail riêng cho CLINIX; trước mắt dùng chính hộp thư đó làm địa chỉ hỗ trợ nếu có người theo dõi; địa chỉ thật điền vào cấu hình; App Password giữ ngoài repo | P4, A14, X1. **Việc của nhóm:** tạo Gmail, bật xác thực 2 bước, tạo App Password. |
| N9 | Chỉ nhận email **ASCII**. Mật khẩu: chữ số `[0-9]`; ký tự đặc biệt là dấu câu hoặc ký hiệu (dấu `.` được tính, khoảng trắng không); **không tự trim**; FE và BE dùng cùng quy tắc kiểm tra | A1, F2–F5, DK-06, SE-08; phạm vi ký tự cụ thể ở N10 (thay định nghĩa Unicode `\p{P}\p{S}` ban đầu). |
| N10 | Trong phạm vi TLCN, mật khẩu **chỉ nhận ký tự ASCII in được** (chữ không dấu, số, dấu câu/ký hiệu, dấu cách); giữ 8–64 ký tự, ≥ 1 số 0–9, ≥ 1 dấu câu/ký hiệu; `.` được tính, dấu cách không tính là ký tự đặc biệt; không trim. Vì không nhận Unicode nên **không chuẩn hoá NFC** | A1, F2–F5, D5; thêm mã lỗi `MAT_KHAU_KY_TU_KHONG_HOP_LE` (mục 5.5); DK-06, SE-08. Ký tự đặc biệt = 32 ký tự ASCII `!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~`. Độ dài = số ký tự (= số byte). Ghi `TECH_DEBT`: người dùng gõ tiếng Việt có dấu trong mật khẩu sẽ bị từ chối. |
| — | **Trang giữ chỗ theo vai trò** sau đăng nhập: khi trang thật của vai trò chưa có, hiển thị **tên vai trò và nút Đăng xuất**; thay bằng trang thật khi module tương ứng hoàn thành | F1, F3; DN-03. |

### 4.3 Việc Figma đã đối chiếu (đã đọc 25/10/2026)

Có đủ frame cho: Đăng nhập (5), Đăng ký (4), Quên mật khẩu (5, có thanh 3 bước), 2 email OTP. Mã node: `635:2`…`639:2`, `640:2`…`642:2`,
`649:2`, `643:2`…`645:2`, `651:2`, `652:2`; email `672:2`, `673:2`.

**Vị trí Đổi mật khẩu** (3 ô "Mật khẩu hiện tại / Mật khẩu mới / Xác nhận mật khẩu mới" + "Cập nhật mật khẩu" / "Hủy"): Bác sĩ `475:2`,
Lễ tân `503:2`, Quản trị viên toàn hệ thống `510:2`, Quản trị viên chi nhánh `620:2` — cuối trang "Thông tin cá nhân"; Bệnh nhân `416:2`
"Hồ sơ người khám", mục "Bảo mật tài khoản". **Nút Đăng xuất:** cuối thanh bên (chữ đỏ) và góc phải thanh trên của mọi vai trò.
Trang chủ sau đăng nhập là "Tổng quan" của từng vai trò (module khác).

**Cần sửa trong Figma:** bỏ "Còn N lần thử" (G1); email 10 phút (G2); bỏ banner OTP demo, dòng "Mật khẩu demo mặc định: demo123", chữ "Dữ liệu minh họa"
(G3); bỏ hotline/địa chỉ chưa có, đổi "CLINIXClinic" thành "CLINIX" (G4); placeholder/thông báo mật khẩu "Tối thiểu 8 ký tự" ⇒ phản ánh quy tắc Q11 + N10 (8–64 ký tự, có chữ số và ký tự đặc biệt, chỉ ký tự ASCII).

### 4.4 Trạng thái chưa có frame Figma

Theo N7: nhóm bổ sung các trạng thái này vào Figma; trong lúc đó FE dùng **kiểu thông báo lỗi hiện có** (chữ đỏ dưới ô; hộp cảnh báo đỏ/vàng như các frame đã thiết kế) với câu chữ ở mục 5.5.
- ĐK: email đã dùng + gợi ý đăng nhập (A2/4b); "Vui lòng thử lại sau" (A2/4d); mã sai / hết hạn / hết lượt / bị thay thế (A3, A4); gửi email lỗi (A5); màn OTP khi đăng nhập chưa xác minh,
  gồm trạng thái "mã đã hết hạn / đã thu hồi" (N2); lỗi email sai định dạng và xác nhận mật khẩu không khớp (Figma chỉ có 4 lỗi trống/10 số/8 ký tự).
- QMK: "Email chưa đăng ký" (A1); mã sai / hết hạn / hết lượt (A2, A3); mật khẩu mới yếu/không khớp (A4); gửi email lỗi (A6); thông báo đăng ký lại sau khi đặt lại mật khẩu trên tài khoản chưa xác minh (N3).
- ĐMK: mật khẩu cũ sai / mật khẩu mới yếu / không khớp (A1, A2); thông báo thành công.

Ngoài phạm vi `auth` (không làm): 3 frame "Kích hoạt tài khoản" và 2 email kích hoạt nhân sự → `admin`.

### 4.5 Còn mở và việc của nhóm

**Không còn điểm mở về thiết kế.** Việc của nhóm ngoài repo:
- **Sửa Figma:** G1, G2, G3, G4; thông báo lỗi mật khẩu theo Q11/N10; bổ sung các trạng thái ở mục 4.4; dòng cảnh báo N7; câu hướng dẫn đăng ký lại (N3).
- **Sửa 2.4** (file Word ở repo `TLCN_CLINIX`) theo D1–D8.
- **Tạo Gmail riêng + bật xác thực 2 bước + App Password** (N8; không dán vào chat/repo).
- **Duyệt câu chữ thông báo** ở mục 5.5.

## 5. Thiết kế kỹ thuật

### 5.1 Cấu trúc và cấu hình

**`apps/api/src/auth/`:** mỗi use case một thư mục con chứa controller (chỉ nhận/trả) và service (điều phối use case, giao dịch): đã chốt ở A5 với `register/register.controller.ts` và `register/register.service.ts` kèm luật thuần và lớp phụ của use case đó; A6 thêm vào cùng thư mục, use case khác đặt tương tự `[đề xuất]` → `repositories/` (`tai-khoan`, `ma-xac-thuc`,
`phien-dang-nhap`, `benh-nhan`, `vi-noi-bo`) → entity TypeORM. Phụ: `password/` (`password-hasher.service.ts` Argon2id, `password-policy.ts`), `validation/` (`email-policy.ts`, `phone-policy.ts`, `full-name-policy.ts`, `validation-codes.ts`), `otp/otp.service.ts` (HMAC),
`session/` (`token.service.ts`, `session.service.ts`, `refresh-cookie.service.ts`), `guards/` (`jwt-auth.guard.ts`, `roles.guard.ts`, `origin.guard.ts`), `decorators/` (`@Public()`, `@Roles()`, `@CurrentUser()`),
`dto/`, `auth.constants.ts` (10 phút, 5 lần sai, 60 giây, 5 mã/giờ, 5 lần đăng nhập sai, 15 phút khoá, 24 giờ giữ tài khoản — mỗi hằng có comment trỏ điều khoản 2.4).
`MailService` dùng chung ở `apps/api/src/mail/`.

**Biến môi trường mới (`.env.example`, không giá trị thật):** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (App Password), `MAIL_FROM_NAME` (= CLINIX),
`MAIL_FROM_ADDRESS`, `MAIL_SUPPORT_ADDRESS` (địa chỉ Gmail thật do nhóm điền, N8), `OTP_HMAC_SECRET`, `JWT_RESET_SECRET`, `COOKIE_SECURE` (**mặc định true**; API từ chối khởi động nếu `false`
khi `NODE_ENV` ≠ `development`, N5); `JWT_ACCESS_SECRET` và `JWT_REFRESH_SECRET` (ký access token / ký refresh token; mỗi khoá ≥ 32 ký tự và hai khoá phải khác nhau — đã làm ở A3);
`WEB_ORIGIN` (so với header `Origin` ở `/auth/refresh`, `/auth/logout`; đã làm ở A3); `VITE_API_URL` đổi thành đường dẫn tương đối `/api`.
*(Đã chốt ở A3, 27/10/2026: 15 phút của access token, 30 phút không hoạt động và 8 giờ trần tuyệt đối là **hằng số** trong `auth.constants.ts`, không phải biến môi trường
`JWT_ACCESS_TTL`, `SESSION_IDLE_MINUTES`, `SESSION_MAX_HOURS` như bản nháp trước — các giá trị này đã chốt ở Q2 và không khác nhau giữa các môi trường.)*

**Cùng origin qua proxy:** dev: `server.proxy` của Vite (`/api` → `http://api:3000`); build/staging: `location /api/` trong `apps/web/nginx.conf`; API đặt `trust proxy`.
Không cần CORS cho trình duyệt; `WEB_ORIGIN` dùng để so `Origin` ở `/auth/refresh` và `/auth/logout`. Cookie tên `refresh_token`, `Path=/api/auth`.

**Endpoint đề xuất** (tên chưa chốt; `bổ trợ` = ngoài 2.4):

| Endpoint | Use case | Ghi chú |
|---|---|---|
| `POST /auth/register` | ĐK b3–b6, A1, A2 | Body `{hoTen, email, soDienThoai, matKhau, xacNhan}`. 201 `{maXacThucId, hetHanLuc, coTheGuiLaiLuc}` (`coTheGuiLaiLuc` = lúc bấm được "Gửi lại mã"); **không bao giờ** trả OTP. Gửi thư lỗi: 503 `GUI_MAIL_LOI` kèm `chiTiet {maXacThucId, coTheGuiLaiLuc}` (tài khoản vẫn giữ) |
| `POST /auth/register/verify-otp` | ĐK b7–b10, A3, A4 | `{maXacThucId, otp}` |
| `POST /auth/register/resend-otp` | "Gửi lại mã" (A3/8d, A4/8b, A5/6b) | `{maXacThucId}` |
| `POST /auth/login` | ĐN | Thành công: access token + `Set-Cookie` refresh + vai trò. Chưa xác minh: lỗi `EMAIL_CHUA_XAC_MINH` + `maXacThucId`, **không** phiên |
| `POST /auth/refresh` | bổ trợ | Kiểm `Origin`; xoay; phát hiện dùng lại |
| `POST /auth/logout` | ĐX | Kiểm `Origin`; idempotent, luôn thành công |
| `POST /auth/forgot-password` | QMK b3–b5, A1, A5, A6 | |
| `POST /auth/forgot-password/verify-otp` | QMK b6–b8, A2, A3 | `{email, otp}` → `resetToken` |
| `POST /auth/forgot-password/resend-otp` | QMK "Gửi lại mã" | `{email}` |
| `POST /auth/reset-password` | QMK b9–b11, A4 | `{resetToken, matKhauMoi, xacNhan}` |
| `POST /auth/change-password` | ĐMK | Người dùng lấy từ token; trả refresh token mới của phiên hiện tại |
| `GET /auth/me` | bổ trợ | Vai trò, họ tên, `da_xac_minh_email` |

### 5.2 Lần đăng ký (Q5 + Q7 + N1/N2/N3)

**Dữ liệu:** thêm vào `ma_xac_thuc`: `ho_ten_dang_ky varchar(100)`, `so_dien_thoai_dang_ky varchar(20)`, `mat_khau_bam_dang_ky varchar(255)` (đều NULL được) và
`chk_ma_xac_thuc_du_lieu_dang_ky`: cả ba cùng NULL, hoặc cả ba cùng NOT NULL **và** `loai = 'DangKy'`. Dùng thêm cột sẵn có `da_gui_luc` cho OTP (N1). "Lần đăng ký" = chuỗi các hàng `DangKy`
của một tài khoản; **mã lần gửi** = `ma_xac_thuc_id`. HMAC của OTP gồm `tai_khoan_id | loai | ma_xac_thuc_id | otp` ⇒ chèn hàng để lấy `id` rồi đặt `ma_bam` trong cùng giao dịch (dưới khoá hàng tài khoản).

**Trạng thái của một hàng OTP đăng ký** (suy ra, không thêm cột):

| Trạng thái | Điều kiện | Xác minh được? | Gửi lại từ hàng này được? |
|---|---|---|---|
| Chưa gửi / gửi lỗi | `da_gui_luc` rỗng (gửi lỗi thì có `thu_hoi_luc`) | Không | Có (nếu còn dữ liệu đăng ký và không bị thay thế) |
| Đang dùng được | `da_gui_luc` có; `thu_hoi_luc`, `da_dung_luc` rỗng; `het_han_luc` > bây giờ; không bị thay thế | Có | Có |
| Hết hạn | như trên nhưng `het_han_luc` ≤ bây giờ | Không ("hết hạn") | Có |
| Bị thu hồi do sai 5 lần | `thu_hoi_luc` có, còn dữ liệu đăng ký | Không | Có |
| **Bị thay thế** | tồn tại hàng cùng tài khoản/loại có `da_gui_luc` và `ma_xac_thuc_id` lớn hơn | Không (`OTP_BI_THAY_THE`) | Không |
| Bị thu hồi do QMK (N3) | `thu_hoi_luc` có, **ba cột dữ liệu đăng ký = NULL** | Không | Không (`CAN_DANG_KY_LAI`) |
| Đã dùng | `da_dung_luc` có | — | Không |

**`POST /auth/register`** (một giao dịch khoá hàng `tai_khoan` theo email):
1. Không có tài khoản ⇒ tạo `tai_khoan` (BenhNhan, DangHoatDong, chưa xác minh, **dữ liệu của lần này**) + hàng OTP mang dữ liệu lần này.
2. Có tài khoản **đã xác minh** (hoặc không phải Bệnh nhân chưa xác minh, kể cả nhân sự) ⇒ `EMAIL_DA_DUNG`. Gồm cả Bệnh nhân chưa xác minh nhưng `NgungHoatDong`: không bao giờ xoá lười, kể cả quá 24 giờ (A5-F).
3. Có tài khoản Bệnh nhân chưa xác minh `DangHoatDong` **quá 24 giờ** (nửa mở: đúng 24:00:00 kể từ `thoi_diem_tao` là quá hạn) ⇒ xoá (H2) rồi như bước 1.
4. Có tài khoản chưa xác minh còn hạn ⇒ kiểm giới hạn (≥ 60 giây kể từ hàng `DangKy` mới nhất theo `tao_luc`, < 5 hàng trong 1 giờ — **kể cả hàng gửi lỗi**); đạt ⇒ chèn hàng OTP mới mang dữ liệu lần này. **`tai_khoan` không đổi** cho tới khi OTP đúng.
5. Commit → gửi mail. Thành công ⇒ **một giao dịch**: đặt `da_gui_luc` cho hàng mới **rồi** thu hồi mọi hàng `DangKy` cũ chưa dùng (cùng thứ tự với quy tắc 21 của kích hoạt nhân sự). Thất bại ⇒ chỉ thu hồi chính hàng mới (`da_gui_luc` rỗng), **giữ hàng cũ** (S3, N1).

**Cài đặt (A5, 28/10/2026):** "chèn trước, làm lại sau ROLLBACK" tối đa 3 lần (không `SELECT … FOR UPDATE` trên email chưa có vì khoá khoảng gây deadlock), giao dịch mở bằng `OtpService.transaction` (READ COMMITTED), băm mật khẩu một lần ngoài giao dịch, thư gửi tới email đã lưu, lỗi gửi thư trả 503 `GUI_MAIL_LOI`. Chi tiết, bằng chứng chạy thật và số đo: TRACKING A5-A…A5-F.

**`POST /auth/register/verify-otp {maXacThucId, otp}`:** hàng phải thuộc tài khoản chưa xác minh, **đã gửi thành công** và không bị thay thế; đã thu hồi ⇒ yêu cầu gửi lại (hoặc đăng ký lại nếu `CAN_DANG_KY_LAI`);
**kiểm hạn trước** (quá hạn ⇒ "hết hạn", không tăng lần sai); so HMAC bằng so sánh thời gian hằng định; sai ⇒ `so_lan_nhap_sai + 1`, đủ 5 ⇒ `thu_hoi_luc`; đúng ⇒ **một giao dịch**:
(i) ghi `ho_ten`, `so_dien_thoai`, `mat_khau_bam` từ hàng OTP vào `tai_khoan`, đặt `da_xac_minh_email = true`, `so_lan_dang_nhap_sai = 0`, `khoa_dang_nhap_den = NULL`;
(ii) tạo `benh_nhan`; (iii) tạo `vi_noi_bo` (0/0); (iv) đặt `da_dung_luc`, thu hồi các hàng khác, **đặt NULL ba cột dữ liệu đăng ký** trên mọi hàng `DangKy` của tài khoản (không giữ băm mật khẩu dư thừa).

**`POST /auth/register/resend-otp {maXacThucId}`:** theo bảng trạng thái ở trên; tài khoản phải còn hạn 24 giờ và chưa xác minh; chèn hàng mới **sao chép dữ liệu đăng ký** của hàng đó; cùng giới hạn,
cùng quy tắc `da_gui_luc`/thu hồi/gửi lỗi như bước 4–5.

**QMK trên tài khoản chưa xác minh (N3):** sau khi đổi mật khẩu, trong cùng giao dịch thu hồi mọi hàng `DangKy` chưa dùng **và đặt NULL ba cột dữ liệu đăng ký** của chúng; giao diện hướng dẫn đăng ký lại cùng email.
Đăng ký lại đi theo bước 4 (tài khoản chưa xác minh còn hạn) và mang dữ liệu mới.

**Vì sao chặn được chiếm trước:** kẻ xấu đăng ký trước bằng email nạn nhân (lần 1, mật khẩu P). Nạn nhân đăng ký (lần 2, mật khẩu V) và mail lần 2 gửi thành công ⇒ hàng lần 1 bị thu hồi/thay thế; nạn nhân chỉ xác minh được bằng
`maXacThucId` + mã của **chính lần 2** ⇒ `tai_khoan` nhận V. Nếu kẻ xấu đăng ký lại (lần 3) và mail lần 3 gửi thành công, hàng lần 2 bị thay thế ⇒ mã nạn nhân nhập (dù là mã lần 3 từ email mới nhất) đi kèm id lần 2 nên **bị từ chối**
— nạn nhân không bao giờ xác minh dữ liệu của kẻ xấu. Nếu mail lần 3 gửi lỗi thì lần 3 không thay ai (N1). Còn lại: H3(a)(b).

### 5.3 Phiên (Q2, Q8) và đăng nhập (Q5)

- Đăng nhập thứ tự: tìm theo email chuẩn hoá → trạng thái (`ChoKichHoat`/`NgungHoatDong` từ chối, không so mật khẩu, không đếm) → khoá tạm → so mật khẩu → sai: đếm nguyên tử, đủ 5 ⇒ khoá 15 phút →
  **đúng**: đặt bộ đếm về 0; **nếu chưa xác minh email ⇒ trả `EMAIL_CHUA_XAC_MINH` + `maXacThucId` (hàng `DangKy` đã gửi thành công mới nhất; nếu chưa có hàng nào đã gửi thì hàng mới nhất) + `trangThaiMa` ∈
  {`ConHan`, `HetHan`, `DaThuHoi`, `ChuaGui`, `CanDangKyLai`} + `hetHanLuc`; không tạo phiên, không tự gửi mail (N2)**; đã xác minh ⇒ tạo `phien_dang_nhap`, cấp token.
- Phiên mới: `tao_luc = bây giờ`, `het_han_luc = bây giờ + 30 phút`. Làm mới: kiểm chữ ký → tra phiên → phiên đã thu hồi/quá `het_han_luc`/quá `tao_luc + 8 giờ` ⇒ 401; băm không khớp (dùng lại) ⇒ thu hồi phiên + 401;
  khớp ⇒ xoay: `refresh_token_bam` mới, `het_han_luc = min(bây giờ + 30 phút, tao_luc + 8 giờ)`, cấp access token mới.
- Đăng xuất: đặt `thu_hoi_luc` của phiên hiện tại (idempotent, không ghi đè); xoá cookie. QMK thành công: thu hồi **mọi** phiên của tài khoản. ĐMK: thu hồi mọi phiên khác, xoay refresh token của phiên hiện tại.
- Guard mỗi request: chữ ký + `alg` cố định → phiên theo `sid` chưa thu hồi, chưa quá trần 8 giờ → `trang_thai = DangHoatDong`.

### 5.4 Giao dịch, lỗi, log, kiểm thử

Mọi thao tác đa bảng nằm trong **một** giao dịch ở tầng service (ĐK xác minh, QMK đặt mật khẩu, dọn tài khoản). Mỗi nhánh nghiệp vụ trả **mã lỗi ổn định** (`EMAIL_DA_DUNG`, `EMAIL_CHUA_XAC_MINH`, `OTP_SAI`, `OTP_HET_HAN`, `OTP_HET_LUOT`, `OTP_BI_THAY_THE`, `TAI_KHOAN_BI_KHOA_TAM`…)
để frontend chọn đúng giao diện; thông báo đăng nhập sai luôn chung. Log **không** ghi mật khẩu, băm, token, OTP (P5 che trường nhạy cảm). Kiểm thử: unit (mock repo, `MailService` giả, đồng hồ giả) + **tích hợp với MySQL thật**
cho CHECK/UNIQUE/khoá hàng/chạy đua; frontend: Vitest. Test tự động **không** gửi email thật; gửi thật chỉ ở kiểm thử tay (X1).

### 5.5 Mã lỗi → thông báo (câu chữ đề xuất; nhóm duyệt và đưa vào Figma — N7)

Các câu đã có trong Figma/2.4 giữ nguyên; các câu còn lại là **đề xuất** để FE không phải tự nghĩ lúc làm.

| Mã lỗi | Thông báo | Nguồn |
|---|---|---|
| `DANG_NHAP_SAI` | Email hoặc mật khẩu không đúng. | 2.4, Figma (bỏ "Còn N lần") |
| `TAI_KHOAN_BI_KHOA_TAM` | Tài khoản bị khóa tạm thời do nhập sai nhiều lần. Thử lại sau {mm:ss}. Quên mật khẩu? | Figma |
| `TAI_KHOAN_NGUNG` | Tài khoản đã bị ngưng hoạt động. Vui lòng liên hệ quản trị viên. | Figma |
| `TAI_KHOAN_CHUA_KICH_HOAT` | Tài khoản nhân sự này chưa được kích hoạt. Hãy dùng link kích hoạt trong email để thiết lập mật khẩu. | Figma (ĐN); khung QMK có câu riêng |
| `EMAIL_CHUA_XAC_MINH` | Email của bạn chưa được xác minh. Nhập mã OTP đã nhận hoặc bấm "Gửi lại mã". | đề xuất |
| `EMAIL_DA_DUNG` | Email này đã được sử dụng. Vui lòng đăng nhập. | đề xuất (2.4 ĐK A2/4b); A5: HTTP 409 |
| `GUI_LAI_QUA_SOM` | Vui lòng thử lại sau. | 2.4 ĐK A2/4d |
| `OTP_SAI` | Mã OTP không đúng. Vui lòng kiểm tra lại. | đề xuất |
| `OTP_HET_HAN` | Mã OTP đã hết hạn. Vui lòng bấm "Gửi lại mã". | đề xuất (2.4 ĐK A4) |
| `OTP_HET_LUOT` | Bạn đã nhập sai quá 5 lần. Mã đã bị vô hiệu, vui lòng bấm "Gửi lại mã". | đề xuất (2.4 ĐK A3/8d) |
| `OTP_BI_THAY_THE` | Yêu cầu xác minh này đã được thay bằng lần đăng ký mới hơn. Vui lòng đăng ký lại. | đề xuất |
| `CAN_DANG_KY_LAI` | Yêu cầu xác minh không còn hiệu lực. Vui lòng đăng ký lại bằng email này. | đề xuất (N3) |
| `GUI_MAIL_LOI` | Không gửi được email. Vui lòng thử lại sau ít phút. | đề xuất (2.4 ĐK A5, QMK A6); A5: HTTP **503**, thân kèm `chiTiet {maXacThucId, coTheGuiLaiLuc}`, tài khoản vẫn giữ |
| `EMAIL_CHUA_DANG_KY` | Email chưa đăng ký. | 2.4 QMK A1 |
| `MAT_KHAU_CU_SAI` | Mật khẩu hiện tại không đúng. | đề xuất |
| `MAT_KHAU_KHONG_HOP_LE` | Mật khẩu từ 8 đến 64 ký tự, gồm ít nhất một chữ số và một ký tự đặc biệt (ví dụ ! @ # $ % .). | đề xuất (Q11) |
| `MAT_KHAU_KY_TU_KHONG_HOP_LE` | Mật khẩu chỉ được dùng chữ không dấu, chữ số, dấu câu/ký hiệu và dấu cách. | đề xuất (N10) |
| `XAC_NHAN_KHONG_KHOP` | Mật khẩu xác nhận không khớp. | đề xuất |
| `EMAIL_KHONG_HOP_LE` / `SDT_KHONG_HOP_LE` | Email không hợp lệ. / Số điện thoại phải 10 số, bắt đầu bằng 0. | đề xuất / Figma |
| `HO_TEN_KHONG_HOP_LE` | Họ tên phải có ít nhất một chữ cái, tối đa 100 ký tự và không chứa ký tự điều khiển. | A5: quy tắc họ tên đã chốt (Trung xác nhận 28/10/2026; 2.4 chưa có quy tắc họ tên; chi tiết ở TRACKING A5-D). **Câu thông báo ở cột này vẫn [đề xuất]**, chờ nhóm chốt câu chữ |
| QMK hoàn tất, tài khoản ngưng | Mật khẩu đã được đặt lại. Tài khoản của bạn hiện đang ngừng hoạt động nên chưa thể đăng nhập. Vui lòng liên hệ bộ phận hỗ trợ. | N7 |
| QMK hoàn tất, tài khoản chưa xác minh | Mật khẩu đã được đặt lại. Tài khoản chưa xác minh email; vui lòng đăng ký lại bằng email này để nhận mã OTP mới. | đề xuất (N3) |
| `CHUA_DANG_NHAP` | Vui lòng đăng nhập để tiếp tục. | **[đề xuất]** A4 — 401: thiếu hoặc sai dạng `Authorization: Bearer <token>`; cũng khi route có `@Roles` mà chưa có người dùng |
| `TOKEN_KHONG_HOP_LE` | Phiên làm việc không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại. | **[đề xuất]** A4 — 401: sai chữ ký, `alg` không phải HS256 (kể cả none), khoá khác, hết hạn, sai `iss`/`aud`; FE làm mới một lần rồi mới về đăng nhập |
| `PHIEN_HET_HIEU_LUC` | Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại. | **[đề xuất]** A4 — 401: phiên đã thu hồi, không tồn tại hoặc quá trần 8 giờ, hoặc tài khoản không còn `DangHoatDong`; làm mới cũng sẽ thất bại nên về đăng nhập ngay |
| `LOI_HE_THONG` | Hệ thống đang gặp sự cố. Vui lòng thử lại sau. | **[đề xuất]** P5 — mọi lỗi ngoài dự kiến (5xx); thân kèm `requestId` |
| `YEU_CAU_KHONG_HOP_LE` | Yêu cầu không hợp lệ. | **[đề xuất]** P5 — 4xx chung: JSON hỏng, tham số sai |
| `DU_LIEU_KHONG_HOP_LE` | Dữ liệu không hợp lệ. (chi tiết từng trường ở `loi`) | plan admin 5.9; P5 — lỗi kiểm dữ liệu (400) |
| `TRUONG_KHONG_DUOC_PHEP` | (mã của MỘT trường trong `loi`) Trường này không được phép gửi. | **[đề xuất]** P5 — trường lạ (`forbidNonWhitelisted`) |
| `KHONG_DU_QUYEN` | Bạn không có quyền thực hiện thao tác này. | A4 (403 sai vai trò); plan admin 5.9 |
| `KHONG_TIM_THAY` | Không tìm thấy dữ liệu. | plan admin 5.9; P5 — route lạ, sai method và tài nguyên không có/ngoài phạm vi cùng một thân phản hồi |
| `PHUONG_THUC_KHONG_DUOC_PHEP` | Phương thức không được hỗ trợ. | **[đề xuất]** P5 — 405 (Nest trả 404 khi sai method; mã này chỉ khi code ném `MethodNotAllowedException`) |
| `DU_LIEU_QUA_LON` | Dữ liệu gửi lên quá lớn. | **[đề xuất]** P5 — 413 (body JSON quá 100 KB) |
| `ORIGIN_KHONG_HOP_LE` | Yêu cầu không đến từ trang web được phép. | **[đề xuất]** A3 — 403 ở `/auth/refresh`, `/auth/logout` (bổ sung vào bảng ở P5) |

**Dạng JSON của MỌI lỗi (task P5; tên trường và các mã đánh dấu `[đề xuất]` chờ nhóm duyệt):**

```json
{
  "maLoi": "DU_LIEU_KHONG_HOP_LE",
  "thongBao": "Dữ liệu không hợp lệ.",
  "loi": [{ "truong": "email", "ma": "EMAIL_KHONG_HOP_LE" }],
  "chiTiet": {},
  "requestId": "…"
}
```

- `maLoi` và `thongBao` luôn có. `loi` (mỗi lỗi `{truong, ma}`; `truong` là đường dẫn có dấu chấm như `address.city`) chỉ có ở lỗi kiểm dữ liệu (400 `DU_LIEU_KHONG_HOP_LE`).
  `chiTiet` là tuỳ chọn, JSON thuần (đối tượng hoặc mảng) cho dữ liệu nghiệp vụ kèm theo (ví dụ lỗi lịch hoạt động của admin, xem bullet kế tiếp). `requestId` chỉ có ở lỗi 5xx và khớp dòng log ERROR của đúng request đó.
- **Lỗi lịch hoạt động của admin (plan admin 5.9, CN A3) — Trung xác nhận 27/10/2026:** HTTP 400; `maLoi` là `LICH_HOAT_DONG_KHONG_HOP_LE` ở ngoài; `chiTiet` là **mảng** đặt trực tiếp, mỗi phần tử `{ thu, maLoi }` (ví dụ trong test: `{ thu: 2, maLoi: GIO_BAT_DAU_SAU_KET_THUC }`; bộ mã con do plan admin quyết định); không có khoá `loi`, vì `loi[{truong, ma}]` chỉ dành cho lỗi kiểm dữ liệu theo trường (`DU_LIEU_KHONG_HOP_LE`). Ca kiểm: `apps/api/src/common/errors/all-exceptions.filter.spec.ts`.
- **Frontend chọn thông báo theo `maLoi` (và `loi[].ma`)**, không theo `thongBao`: `thongBao` chỉ là câu mặc định theo trạng thái hoặc do người ném lỗi đặt; câu chữ chốt ở bảng trên và Figma.
- **Không bao giờ** có stack, thông điệp lỗi gốc, SQL, tên bảng/cột hay `cause` trong phản hồi, ở mọi môi trường. Lỗi ngoài dự kiến là 500 `LOI_HE_THONG`; chi tiết nằm trong log, tra bằng `requestId`.
- Mã mặc định theo trạng thái khi lỗi không mang mã: 400 `YEU_CAU_KHONG_HOP_LE`, 401 `CHUA_DANG_NHAP`, 403 `KHONG_DU_QUYEN`, 404 `KHONG_TIM_THAY`, 405 `PHUONG_THUC_KHONG_DUOC_PHEP`, 413 `DU_LIEU_QUA_LON`, 5xx `LOI_HE_THONG`.
  Thông điệp tự do của thư viện ("Cannot GET /x?token=…", đoạn JSON hỏng) **không** được chuyển ra. Mọi 404 (route lạ, sai method, tài nguyên không có hoặc ngoài phạm vi) có cùng một thân phản hồi.
- Lỗi kiểm dữ liệu: mã của từng trường lấy từ `message` của decorator nếu đó là mã (A1); trường lạ là `TRUONG_KHONG_DUOC_PHEP`; ràng buộc có sẵn của class-validator là tên ràng buộc viết SNAKE_CASE hoa (ví dụ `IS_STRING`).
- Cách ném lỗi: `docs/CODING_CONVENTION.md`. Mã nguồn: `apps/api/src/common/errors/`.

### 6.1 Sơ đồ phụ thuộc (cùng một hàng = làm song song được)

```
P0 (ghi quyết định vào docs/PLAN.md, yêu cầu HTTPS staging)
   │
   ├── P1 apps/api ─────────┬── P5 hạ tầng API chung (lỗi, che log)
   │                         ├── P4 MailService (Gmail SMTP; nhóm tạo Gmail — N8)
   │                         ├── A1 hasher + chính sách MK
   │                         └── P3 TypeORM + migration + docs schema
   ├── P2 apps/web ───────── P6 web shell + proxy cùng origin
   └── (P7 bật required checks sau PR code đầu tiên)

P3 ─┬─ A2 OTP (HMAC, lần gửi, da_gui_luc) ─┬─ A5 Đăng ký ─┬─ A6 Xác minh + gửi lại + ví
    │   (cần thêm A1)                       │              └─ A7 Dọn tài khoản 24 giờ
    │                                       └─ A11 QMK (1) ── A12 QMK (2)
    └─ A3 phiên/token ─┬─ A4 guard ─┬─ A10 Đăng xuất
                       │            ├─ A13 Đổi mật khẩu
                       │            └─ A15 /auth/me
                       ├─ A8 Đăng nhập (cần thêm A1)
                       └─ A9 refresh

A14 mẫu email (Figma, G2/G4): sau P4, song song A5/A11 (A5/A11 dùng mẫu văn bản thô trước)

FE: F1 (P6 + hợp đồng A3) → F2 (A5,A6,A8) ‖ F3 (A8,A15) ‖ F4 (A11,A12) ‖ F5 (A13,A10)
X1 kiểm tra tay (Gmail thật; staging HTTPS) → X2 tổng kết → X3 (trước khi mở công khai: giới hạn request — S7)
```

### 6.2 Nhóm P — Tiền đề (Phase 0/1)

| ☐ | ID | Việc | Phụ thuộc | Truy vết | Thẻ / PR gợi ý |
|---|---|---|---|---|---|
| ☑ | P0 | Ghi quyết định Q1/Q2 vào `docs/PLAN.md` Phase 0 (#1 ORM = TypeORM, #2 thời hạn token) và thêm yêu cầu **staging có HTTPS** (domain + chứng chỉ) vào Phase 0 #4/Phase 4 (N5) | — | Mọi UC | `[ĐỒNG BỘ TL]` `docs(repo)` |
| ☑ | P1 | Khởi tạo `apps/api` (NestJS TS `strict`, script `lint`/`build`/`test`/`start:dev`, ValidationPipe toàn cục, đọc cấu hình từ env, `cookie-parser`, `trust proxy`, `GET /health` → `{status:"ok"}`); **cài được `argon2` trong `Dockerfile`** (S6: lỗi build thì xử lý lỗi, không chuyển bcrypt) | — | Nền | `[TIỀN ĐỀ]` `feat(api)` |
| ☑ | P2 | Khởi tạo `apps/web` (React + Vite + TS, Vitest, script `lint`/`test`) | — (song song P1) | Nền | `[TIỀN ĐỀ]` `feat(web)` |
| ☑ | P3 | TypeORM + MySQL; **migration viết tay** cho `tai_khoan`, `benh_nhan`, `vi_noi_bo`, `ma_xac_thuc` (kèm 3 cột dữ liệu đăng ký + CHECK, mục 5.2), `phien_dang_nhap` + CHECK, cột sinh, index, FK — đối chiếu từng dòng với `clinix_mysql.sql` **đã cập nhật**; DB test (schema riêng); `docker compose up --build` chạy đủ 3 service; **quyết định cách chạy test tích hợp trên CI** (thêm service MySQL vào `ci.yml` hoặc chỉ chạy local) | P1 | Nền cho mọi UC | `[TIỀN ĐỀ]` `[ĐỒNG BỘ TL]` D7 · `feat(db)` |
| ☑ | P4 | `MailService` (nodemailer, SMTP qua env, giao diện để mock), biến `SMTP_*`/`MAIL_*` vào `.env.example`, hướng dẫn tạo Gmail riêng + App Password trong `docs/DEV_SETUP.md` (không lộ bí mật); mẫu văn bản thô 2 loại OTP; **không** thêm Mailpit. Chạy thật cần nhóm đã tạo Gmail (N8) | P1 | ĐK b6; QMK b5 | `[TIỀN ĐỀ]` `feat(api)` |
| ☑ | P5 | Hạ tầng chung: bộ lọc lỗi chuẩn hoá (mã lỗi ổn định), logger che mật khẩu/token/OTP. **Không** throttler (S7) | P1 | SOW 3.2.2 | `[TIỀN ĐỀ]` `feat(api)` |
| ☐ | P6 | Web shell: router (public/protected), **một** lớp API client duy nhất (gọi `/api/...`), thành phần loading/lỗi/mất mạng/timeout; **proxy cùng origin**: `server.proxy` của Vite + `location /api/` trong `apps/web/nginx.conf`, `VITE_API_URL=/api`; kiểm `docker-compose.staging.yml` | P2 | Nền cho F*; Q2 | `[TIỀN ĐỀ]` `feat(web)` |
| ☑ | P7 | Sau PR code đầu tiên: bật `api`, `web`, `docker` vào required status checks của ruleset (làm trên GitHub) | P1, P2 | `docs/PLAN.md` Phase 1 | `[TIỀN ĐỀ]` cấu hình |

### 6.3 Nhóm A — Backend `auth`

| ☐ | ID | Việc | Phụ thuộc | Truy vết | Thẻ |
|---|---|---|---|---|---|
| ☑ | A1 | `PasswordHasher` Argon2id (m=19 MiB, t=2, p=1; có hàm so giả cân bằng thời gian, H7; đo hiệu năng trên môi trường chạy thật); validator mật khẩu theo N10: chỉ ASCII in được (`\x20`–`\x7E`), 8–64 ký tự, `[0-9]`, ≥ 1 trong 32 dấu câu/ký hiệu ASCII, dấu cách không tính, không trim, không chuẩn hoá Unicode; lỗi `MAT_KHAU_KHONG_HOP_LE` / `MAT_KHAU_KY_TU_KHONG_HOP_LE`; SĐT (10 số bắt đầu 0, chuẩn hoá), email (trim, **ASCII**, ≤ 255, tên miền chữ thường); DTO dùng chung | P1 | ĐK b4, A1; QMK b10, A4; ĐMK b4, A2; SOW 3.2.2 | `[ĐỒNG BỘ TL]` D5 · `feat(auth)` |
| ☑ | A2 | `OtpService` + repo `ma_xac_thuc`: sinh 6 số (`crypto.randomInt`), HMAC (S3) gồm `ma_xac_thuc_id`, kiểm hạn trước, so hằng định, đếm sai theo mã (5 ⇒ thu hồi), **đặt `da_gui_luc` rồi thu hồi mã cũ chỉ sau khi gửi thành công** (N1), giới hạn gửi lại (≥ 60 giây, ≤ 5 hàng/giờ **kể cả gửi lỗi**) dưới khoá hàng `tai_khoan`, xử lý gửi lỗi, suy ra trạng thái hàng (bảng mục 5.2) | P3, A1, P4 (giao diện mail) | ĐK b6, b8–b9, A2/4c–4d, A3, A4, A5; QMK b5, b7, A2, A3, A6 | `[ĐỒNG BỘ TL]` D2 · `feat(auth)` |
| ☑ | A3 | `TokenService` + `SessionService` + repo `phien_dang_nhap`: access JWT (có `sid`, 15 phút); refresh token `sid.ngẫu nhiên.HMAC`; cấp/xoay/thu hồi; hết hạn trượt 30 phút + trần 8 giờ; phát hiện dùng lại ⇒ thu hồi; thu hồi hàng loạt theo tài khoản (trừ một phiên); cookie helper; `OriginGuard`; **từ chối khởi động nếu `COOKIE_SECURE=false` khi `NODE_ENV` ≠ `development`** (N5) | P3 | ĐN b7; ĐX b2, A1; Q2 | `[ĐỒNG BỘ TL]` D3 · `feat(auth)` |
| ☑ | A4 | `JwtAuthGuard` (chữ ký, `alg` cố định, phiên theo `sid` chưa thu hồi/chưa quá trần, `trang_thai = DangHoatDong`), `RolesGuard` + `@Roles()`, `@Public()`, `@CurrentUser()` | A3 | ĐMK/ĐX tiền điều kiện; SOW 3.2.1/3.2.2 | `feat(auth)` |
| ☑ | A5 | **Đăng ký** (mục 5.2): kiểm dữ liệu → các nhánh 1–5; email đã dùng/nhân sự ⇒ `EMAIL_DA_DUNG`; quá 24 giờ ⇒ xoá rồi tạo mới; UNIQUE chạy đua ⇒ như A2; gửi lỗi không thay mã cũ | A1, A2, P4 | ĐK b3–b6, A1, A2, A5 | `[ĐỒNG BỘ TL]` D7 · `feat(auth)` |
| ☐ | A6 | **Xác minh OTP đăng ký** + **Gửi lại mã** (mục 5.2): chỉ hàng đã gửi thành công, không bị thay thế; giao dịch {ghi dữ liệu từ hàng OTP vào `tai_khoan`, `da_xac_minh_email`, `benh_nhan`, `vi_noi_bo`, `da_dung_luc`, NULL dữ liệu đăng ký}; sai/hết hạn/hết lượt/bị thay thế/`CAN_DANG_KY_LAI`; xác minh lặp không tạo trùng | A5 | ĐK b7–b10, A3, A4, A5/6b | `[ĐỒNG BỘ TL]` D4 · `feat(auth)` |
| ☐ | A7 | **Dọn tài khoản** `BenhNhan` chưa xác minh quá 24 giờ kể từ `thoi_diem_tao`: job (`@nestjs/schedule`) + hàm dùng lại cho xoá lười ở A5; xoá `ma_xac_thuc` → `phien_dang_nhap` → `tai_khoan` trong một giao dịch; không đụng nhân sự (H1) và **bỏ qua Bệnh nhân `NgungHoatDong`** (A5-F; hàm `UnverifiedPatientCleaner.purgeIfExpired` đã có ở `auth/register/`) | A5 | ĐK b5 (câu cuối) | `[ĐỒNG BỘ TL]` D1 · `feat(auth)` |
| ☐ | A8 | **Đăng nhập** (mục 5.3): trạng thái trước mật khẩu; khoá tạm; so mật khẩu; đếm sai nguyên tử; chưa xác minh ⇒ `EMAIL_CHUA_XAC_MINH` + `maXacThucId` + `trangThaiMa`, **không phiên, không tự gửi mail** (N2); email không tồn tại ⇒ chung, không đếm, so giả; trả thời gian khoá còn lại để FE đếm ngược | A1, A3 | ĐN b3–b7, A1, A2, A3; Q5 | `[ĐỒNG BỘ TL]` D8 · `feat(auth)` |
| ☐ | A9 | **Làm mới phiên**: kiểm `Origin`, chữ ký, băm, hạn, trần; xoay; dùng lại ⇒ thu hồi; tài khoản không còn `DangHoatDong` ⇒ từ chối. Ghi `TECH_DEBT` trường hợp mất phản hồi mạng (N4) | A3 | Q2 (bổ trợ) | `feat(auth)` |
| ☐ | A10 | **Đăng xuất**: kiểm `Origin`; thu hồi **phiên hiện tại**; idempotent (phiên hết hạn/đã thu hồi vẫn thành công, không ghi đè `thu_hoi_luc` cũ); xoá cookie | A3, A4 | ĐX b2–b3, A1 | `feat(auth)` |
| ☐ | A11 | **Quên mật khẩu (1)**: email không tồn tại ⇒ "Email chưa đăng ký"; `ChoKichHoat` hoặc `mat_khau_bam IS NULL` ⇒ từ chối, không OTP (S4); tài khoản chưa xác minh **được phép** (Q6); cấp OTP `QuenMatKhau`; verify-otp ⇒ `resetToken` (`JWT_RESET_SECRET`, 10 phút, mang mục đích/tài khoản/`ma_xac_thuc_id`); gửi lại | A2, P4 | QMK b3–b8, A1, A2, A3, A5, A6 | `[ĐỒNG BỘ TL]` D6 · `feat(auth)` |
| ☐ | A12 | **Quên mật khẩu (2)**: kiểm chữ ký/hạn `resetToken` + hàng OTP chưa dùng, chưa thu hồi (không kiểm lại hạn OTP — N6) + mật khẩu mới; giao dịch {cập nhật `mat_khau_bam`, `da_dung_luc`, xoá bộ đếm/khoá, thu hồi **mọi** phiên; **nếu tài khoản chưa xác minh: thu hồi mọi hàng `DangKy` chưa dùng và NULL dữ liệu đăng ký của chúng** (N3)}; sai định dạng ⇒ giữ token; trả cờ để FE báo `NgungHoatDong` còn ngưng (N7) hoặc cần đăng ký lại (N3) | A11, A1, A3 | QMK b9–b11, A4; Q6, Q8, S2, S4 | `[ĐỒNG BỘ TL]` D6, D8 · `feat(auth)` |
| ☐ | A13 | **Đổi mật khẩu**: lấy tài khoản từ token; kiểm mật khẩu cũ, chính sách, khớp; cập nhật; thu hồi phiên khác; xoay refresh token của phiên hiện tại | A1, A4, A3 | ĐMK b3–b5, A1, A2; Q8 | `[ĐỒNG BỘ TL]` D8 · `feat(auth)` |
| ☐ | A14 | Mẫu email OTP đăng ký và OTP quên mật khẩu theo hai frame "Admin - Email Preview": tiêu đề `[CLINIX] Mã xác minh OTP đăng ký tài khoản` / `[CLINIX] Mã OTP đặt lại mật khẩu`, chào theo `ho_ten`, mã 6 số, **10 phút** (G2), tên hiển thị CLINIX, email hỗ trợ từ cấu hình `MAIL_SUPPORT_ADDRESS` (N8), bỏ hotline/địa chỉ nếu chưa có (G4); mẫu QMK nêu email tài khoản và cảnh báo không chia sẻ mã; HTML + văn bản thô | P4 | ĐK b6; QMK b5 | `feat(auth)` |
| ☐ | A15 | `GET /auth/me` | A4 | ĐN b8 (bổ trợ) | `feat(auth)` |

### 6.4 Nhóm F — Frontend `auth` (chỉ làm đúng frame Figma; trạng thái chưa có frame: mục 4.4)

| ☐ | ID | Việc | Phụ thuộc | Truy vết | Thẻ |
|---|---|---|---|---|---|
| ☐ | F1 | Lõi xác thực FE: store người dùng, hàm gọi API auth qua client chung, access token **chỉ trong bộ nhớ**, tự làm mới khi 401 **tuần tự bằng Web Locks** (H12), route guard theo vai trò, "refresh thất bại ⇒ về đăng nhập" (ĐX A1); **trang giữ chỗ theo vai trò** (tên vai trò + nút Đăng xuất) khi trang thật chưa có, thay bằng trang thật khi module tương ứng xong | P6, hợp đồng A3 | ĐN b8; ĐX A1; Q2 | `feat(web)` |
| ☐ | F2 | Đăng ký + xác minh email: 4 frame (6 ô nhập mã, "Mã hết hạn sau 10:00", "Gửi lại sau 60s", "Quay lại đăng ký"), giữ dữ liệu khi lỗi (A1/4b), giữ `maXacThucId` giữa các bước, **vào thẳng màn OTP khi đăng nhập trả `EMAIL_CHUA_XAC_MINH`** và nói rõ khi mã đã hết hạn/bị thu hồi để bấm "Gửi lại mã" (N2); **bỏ banner demo (G3)**; câu chữ lỗi: mục 5.5 | F1, A5, A6, A8 | ĐK b2–b3, b6–b10, A1–A5; Q5 | `feat(web)` |
| ☐ | F3 | Đăng nhập: 5 frame (khoá tạm có đếm ngược theo thời gian API trả, nút Đăng nhập vô hiệu, link Quên mật khẩu bấm được); **chỉ thông báo chung, không "Còn N lần" (G1)**; điều hướng theo vai trò (trang giữ chỗ nếu trang thật chưa có) | F1, A8, A15 | ĐN b2–b3, b8, A1–A3 | `feat(web)` |
| ☐ | F4 | Quên mật khẩu: 5 frame với thanh 3 bước, giữ `resetToken` giữa các bước, "Đổi email"/"Quay lại nhập mã"; **bỏ banner demo (G3)**; A1–A6; khung "Hoàn tất" thêm dòng cảnh báo cho `NgungHoatDong` (N7) và dòng hướng dẫn đăng ký lại cho tài khoản chưa xác minh (N3) | F1, A11, A12 | QMK b2–b11, A1–A6; S4 | `feat(web)` |
| ☐ | F5 | Thành phần dùng lại `ChangePasswordForm` (3 ô + "Cập nhật mật khẩu"/"Hủy", **bỏ dòng "mật khẩu demo"**) và nút Đăng xuất ở thanh bên + thanh trên của layout chung (P6), đăng xuất ngay (G5). Gắn form vào 4 trang "Thông tin cá nhân" và "Hồ sơ người khám" khi các trang đó tồn tại (module khác) — trước đó chỉ cần thành phần + test | F1, A13, A10, P6 | ĐMK b1–b5, A1–A2; ĐX b1–b3 | `feat(web)` |

### 6.5 Nhóm D — Đồng bộ tài liệu (đi cùng PR của task code tương ứng)

2.4 là file Word ở repo `TLCN_CLINIX` → cập nhật bằng commit ở repo đó, dẫn link trong PR này. `docs/database/*`: sửa **cả ba file** (`clinix.dbml`, `clinix_mysql.sql`,
`clinix_quy_tac_nghiep_vu.md`) cho khớp nhau, và ghi dòng lịch sử đầu `clinix.dbml` như các lần trước.

| ID | Nội dung | Đi cùng | Từ |
|---|---|---|---|
| D1 | Điền "24 giờ" vào ghi chú `da_xac_minh_email` (dbml/sql) và quy tắc 15; bỏ "[15 phút]" trong 2.4 ĐK b5 | **P3** (phần `docs/database`, xong 26/10/2026); A7 (phần 2.4) | Q4 |
| D2 | `ma_xac_thuc.thu_hoi_luc` và `da_gui_luc` dùng cho OTP (ghi chú dbml/sql); quy tắc 16–17: HMAC, gửi lỗi, **mã đã gửi thành công mới thay mã cũ**, giới hạn tính cả hàng lỗi | **P3** (toàn bộ, xong 26/10/2026) | S1, S3, N1 |
| D3 | `phien_dang_nhap`: bỏ `[đề xuất]`; 15 phút/30 phút/8 giờ; xoay + phát hiện dùng lại; quy tắc 19; 2.4 ĐX A1 ("không hoạt động" = 30 phút) | **P3** (phần `docs/database`, xong 26/10/2026); A3 (phần 2.4) | Q2, Q10 |
| D4 | Tạo `vi_noi_bo` ở ĐK b9: 2.4 (bước 9 + hậu điều kiện) + quy tắc 15 và 7 + ghi chú `benh_nhan`/`vi_noi_bo`; Class Diagram nếu cần | **P3** (phần `docs/database`, xong 26/10/2026); A6 (phần 2.4) | Q9 |
| D5 | Chính sách mật khẩu (8–64, chỉ ASCII in được, chữ số, ký tự đặc biệt — N10), SĐT, email ASCII, OTP 6 số, thứ tự kiểm hạn vs sai mã (sửa câu chữ ĐK A4) vào 2.4; thông báo lỗi trong Figma | A1, A2 | Q11, N9, N10, S3, S5 |
| D6 | QMK: `resetToken`, xoá khoá đăng nhập, từ chối tài khoản chưa từng có mật khẩu, tài khoản chưa xác minh được phép (chỉ đổi mật khẩu; thu hồi OTP đăng ký đang chờ và yêu cầu đăng ký lại — N3), cảnh báo `NgungHoatDong` (N7) | A11, A12 | S2, S4, Q6, N3, N7 |
| D7 | Lần đăng ký (Q7): 3 cột + CHECK `chk_ma_xac_thuc_du_lieu_dang_ky` trong dbml/sql; quy tắc 16 viết lại (có `da_gui_luc`, trạng thái hàng); 2.4 ĐK b5, b9, A2/4c; cập nhật dòng lịch sử `clinix.dbml` (số bảng không đổi, chỉ thêm cột) | P3 (phần `docs/database`, xong 26/10/2026); **2.4 (file Word) còn lại — làm cùng A5/A6** | Q7, N1 |
| D8 | 2.4 ĐN: chưa xác minh ⇒ không phiên, hướng tới OTP (bước + luồng thay thế mới); quy tắc 23; 2.4 ĐK b10; 2.4 ĐMK/QMK: thu hồi phiên (Q8) | A8, A12, A13 | Q5, Q8 |
| D9 | `docs/PLAN.md` (tick auth Phase 2, Phase 0); `docs/TRACKING.md` (đúng **một** dòng); `docs/TECH_DEBT.md`: S7 hoãn throttling (+ H3, H4), phát hiện dùng lại làm thu hồi nhầm và **mất phản hồi mạng khi xoay refresh token** (H12, N4), tiết lộ tồn tại tài khoản theo 2.4 (H7), phụ thuộc Gmail (H11) | X2 | S7, N4 |

### 6.6 Nhóm X — Hoàn tất

| ☐ | ID | Việc | Phụ thuộc |
|---|---|---|---|
| ☐ | X1 | Chạy tay toàn bộ kịch bản 5 UC trên `docker compose` với **Gmail SMTP thật** (cả đường gửi lỗi bằng cách đặt sai App Password); **staging truy cập qua mạng phải HTTPS + cookie Secure** (N5); điền kết quả vào `TRACKING.md`; kiểm độ phủ test của `auth` (mục tiêu ≥ 70% — `docs/PLAN.md` Phase 4) | A*, F* |
| ☐ | X2 | Tổng kết: D9; kiểm mọi dòng `AI_USAGE_LOG.md`; chuẩn bị phần giải thích luồng cho vấn đáp | X1 |
| ☐ | X3 | **Trước khi mở công khai cho người dùng thật** (không thuộc phạm vi TLCN hiện tại): giới hạn request cho API auth theo IP + cho nhập sai mật khẩu cũ, kiểm thử (S7, H3, H4) | X2 |

## 7. Test case dự kiến

Loại: **U** = unit, **I** = tích hợp MySQL thật, **C** = component/FE (Vitest), **M** = chạy tay (Gmail thật). Cột "Phủ" là nơi truy vết. Ghi kết quả vào `TRACKING.md`.
Ca có `[Nn]` phụ thuộc điểm còn mở — mong đợi là đề xuất. Test tự động dùng `MailService` giả và đồng hồ giả.

### 7.1 Đăng ký tài khoản (DK)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| DK-01 | Đăng ký hợp lệ (email mới) | Tạo `tai_khoan` (BenhNhan, DangHoatDong, `da_xac_minh_email=false`), mật khẩu băm Argon2id; **chưa** có `benh_nhan`/`vi_noi_bo`; 1 hàng `DangKy` mang dữ liệu đăng ký, `ma_bam` là HMAC; `MailService` gọi 1 lần; đáp ứng có `maXacThucId`, **không** có OTP | ĐK b3–b6 | I |
| DK-02 | OTP đúng (đúng `maXacThucId`) | Một giao dịch: `tai_khoan` nhận họ tên/SĐT/mật khẩu từ hàng OTP; `da_xac_minh_email=true`; có `benh_nhan` và `vi_noi_bo` (0/0); `da_dung_luc`; ba cột dữ liệu đăng ký về NULL trên mọi hàng `DangKy` | ĐK b8–b10 | I |
| DK-03 | Lỗi khi tạo `vi_noi_bo` (giả lập) | ROLLBACK: chưa xác minh, không `benh_nhan`, OTP chưa dùng, dữ liệu `tai_khoan` không đổi | ĐK hậu điều kiện thất bại | I |
| DK-04 | Email sai định dạng / rỗng / > 255 / có ký tự không ASCII | 400, không tạo tài khoản, không mail | ĐK A1/4a; N9 | U |
| DK-05 | SĐT sai định dạng / rỗng; SĐT có khoảng trắng/dấu chấm hợp lệ | 400; trường hợp hợp lệ được chuẩn hoá thành 10 số | ĐK A1/4a | U |
| DK-06 | Mật khẩu không đạt: 7 ký tự; 65 ký tự; thiếu chữ số; thiếu ký tự đặc biệt; chỉ dấu cách làm "ký tự đặc biệt" (không tính); có ký tự **không ASCII** (chữ có dấu như `Mậtkhẩu1!`, `é`, `€`, emoji, dấu cách không ngắt U+00A0); có ký tự điều khiển (tab, xuống dòng). Hợp lệ: biên 8 và 64 ký tự; không có chữ hoa; mỗi ký tự trong 32 dấu câu/ký hiệu ASCII (gồm `.`); dấu cách ở giữa; dấu cách ở đầu/cuối **được giữ nguyên và tính vào độ dài** (không trim) | 400 (`MAT_KHAU_KHONG_HOP_LE` hoặc `MAT_KHAU_KY_TU_KHONG_HOP_LE` theo từng lỗi); ca hợp lệ qua | ĐK A1/4a; Q11; N9, N10 | U |
| DK-07 | Xác nhận mật khẩu không khớp | 400 | ĐK A1/4a | U |
| DK-08 | Thiếu từng trường | 400, đúng trường | ĐK A1/4a | U |
| DK-09 | Nhiều trường lỗi cùng lúc | Trả đủ danh sách lỗi; DB không đổi | ĐK A1/4a–4b | U |
| DK-10 | FE: gửi form lỗi | Hiện lỗi từng trường, **giữ nguyên** dữ liệu đã nhập | ĐK A1/4b–4c | C |
| DK-11 | Email thuộc tài khoản đã xác minh | `EMAIL_DA_DUNG`, gợi ý đăng nhập; không tạo, không mail | ĐK A2/4b | I |
| DK-12 | Email chưa xác minh còn hạn, đủ giãn cách | Hàng OTP **mới** mang dữ liệu **lần này**; `tai_khoan` **không đổi**; khi gửi thành công: `da_gui_luc` của hàng mới được đặt rồi hàng cũ bị thu hồi (cùng giao dịch); `maXacThucId` mới | ĐK A2/4c; Q7; N1 | I |
| DK-13 | Như DK-12 nhưng 59 giây | "Vui lòng thử lại sau"; không mail | ĐK A2/4d | U |
| DK-14 | Như DK-12 nhưng đúng 60 giây | Được gửi | ĐK A2/4c (biên) | U |
| DK-15 | Đã có 5 hàng `DangKy` trong 1 giờ → thử thứ 6 (thứ 5 vẫn được) | Thứ 6 bị từ chối | ĐK A2/4d (biên) | I |
| DK-16 | Mã của hàng cũ sau khi có hàng mới **đã gửi thành công** | Từ chối (`OTP_BI_THAY_THE`) | ĐK A2/4c; N1 | I |
| DK-17 | Email khác hoa/thường ở tên miền hoặc có khoảng trắng đầu/cuối; khác hoa/thường ở phần trước `@` | Cùng tài khoản (A2), không lọt UNIQUE; phần trước `@` giữ nguyên khi lưu/gửi | ĐK b4; S5 | I |
| DK-18 | Sai OTP 1 lần | Báo sai; `so_lan_nhap_sai=1`; nhập lại được | ĐK A3/8a–8b | I |
| DK-19 | Sai 4 lần rồi đúng | Thành công như DK-02 | ĐK A3/8c | I |
| DK-20 | Sai đủ 5 lần | Hàng bị thu hồi ngay (`thu_hoi_luc`); yêu cầu "Gửi lại mã"; nhập mã đúng sau đó vẫn bị từ chối | ĐK A3/8d | I |
| DK-21 | Sau DK-20, "Gửi lại mã" (đủ giãn cách) bằng `maXacThucId` của hàng mới nhất | Hàng mới sao chép dữ liệu đăng ký; bộ đếm sai của mã mới = 0 | ĐK A3/8d → b6 | I |
| DK-22 | OTP đúng ở giây 599 / 601 (đồng hồ giả) | 599 thành công; 601 "hết hạn" | ĐK A4/8a–8b (biên) | U |
| DK-23 | OTP **sai và** quá hạn | Báo "hết hạn", **không** tăng `so_lan_nhap_sai` | ĐK A4; S3 | U |
| DK-24 | Hết hạn → "Gửi lại mã" → mã mới | Thành công | ĐK A4/8b → b6 | I |
| DK-25 | `MailService` giả trả lỗi (đăng ký lần đầu) | Báo lỗi cho phép thử lại; tài khoản **vẫn tồn tại**; hàng OTP mới có `thu_hoi_luc` và `da_gui_luc` rỗng; không xác minh được bằng hàng đó | ĐK A5/6a–6b; N1 | U |
| DK-26 | Gửi lỗi khi đang có hàng cũ còn hạn | Hàng mới bị thu hồi (`da_gui_luc` rỗng), **hàng cũ còn dùng được và không bị thay thế**; hàng lỗi vẫn tính giới hạn 60 giây và 5/giờ | ĐK A5/6b; S3; N1 | I |
| DK-27 | Hai đăng ký đồng thời cùng email mới | Đúng 1 tài khoản; yêu cầu kia đi theo A2; không 500 | ĐK b5 (H8) | I |
| DK-28 | Hai "Gửi lại mã" đồng thời | Chỉ 1 mã được cấp trong cùng 60 giây | ĐK A2/4d (H8) | I |
| DK-29 | Xác minh cùng OTP hai lần đồng thời | Một thành công, một bị từ chối; 1 `benh_nhan`, 1 `vi_noi_bo` | ĐK b9 (H8) | I |
| DK-30 | Xác minh cho tài khoản đã xác minh | Từ chối, không tạo bản ghi thứ hai | ĐK b9 | I |
| DK-31 | Mã `QuenMatKhau` dùng cho đăng ký; mã/`maXacThucId` của tài khoản khác | Từ chối | ĐK b8; S3 | I |
| DK-32 | Backend `booking` (khi có) với tài khoản chưa xác minh | Vẫn từ chối bằng kiểm `da_xac_minh_email` (phòng thủ); hiện tại: ghi chú sang PLAN `booking` | Quyết định 1 | I |
| DK-33 | Dọn: Bệnh nhân chưa xác minh tạo lúc T, thời điểm T+23:59 / T+24:01 | 23:59 còn; 24:01 bị xoá cùng `ma_xac_thuc`, `phien_dang_nhap` | ĐK b5; Q4 | I |
| DK-34 | Dọn: tài khoản **đã xác minh** quá 24 giờ | Không bị xoá | ĐK b5 | I |
| DK-35 | Dọn: nhân sự `ChoKichHoat` (`da_xac_minh_email=false`) quá 24 giờ | **Không** bị xoá (H1) | ĐK b5 / phạm vi | I |
| DK-36 | Đăng ký lại cùng email sau khi tài khoản cũ bị xoá | Tạo mới bình thường, bộ đếm OTP mới | ĐK b5, A2 | I |
| DK-37 | Đăng ký lại cùng email khi tài khoản cũ đã quá 24 giờ nhưng job chưa chạy | Xoá lười rồi tạo mới (không gửi lại OTP cho tài khoản cũ) | ĐK A2/4c; Q4 | I |
| DK-38 | Gửi lại mã ở T+23:00 | **Không** kéo dài hạn 24 giờ của tài khoản | Q4 | I |
| DK-39 | Log/exception mọi luồng | Không chứa mật khẩu, băm, OTP | SOW 3.2.2 | I |
| DK-40 | Mọi đáp ứng API và giao diện ở mọi môi trường (kể cả dev) | Không trả/hiện OTP | SOW 3.2.2; G3 | I |
| DK-41 | Email thuộc tài khoản nhân sự (kể cả `ChoKichHoat`) | `EMAIL_DA_DUNG`; không dọn, không gửi mail | ĐK A2; H1 | I |
| DK-42 | **Chiếm trước:** kẻ xấu đăng ký email X (mật khẩu P, lần 1); nạn nhân đăng ký X (mật khẩu V, lần 2) rồi xác minh bằng mã lần 2 | `tai_khoan` mang V; đăng nhập bằng P thất bại | ĐK A2/4c; Q7 (H3) | I |
| DK-43 | Sau DK-42 bước đăng ký lần 2, kẻ xấu đăng ký lại (lần 3); nạn nhân nhập **mã của email mới nhất** kèm `maXacThucId` lần 2 | Từ chối `OTP_BI_THAY_THE`; không xác minh dữ liệu của kẻ xấu | Q7 (H3) | I |
| DK-44 | "Gửi lại mã" bằng `maXacThucId` đã bị thay thế bởi hàng **đã gửi thành công** mới hơn | Từ chối | Q7; N1 | I |
| DK-45 | Sau xác minh thành công | Không còn băm mật khẩu đăng ký nào trong `ma_xac_thuc` của tài khoản | Q7; SOW 3.2.2 | I |
| DK-46 | FE: màn nhập mã | Đếm ngược 60 giây khoá "Gửi lại mã"; đúng thông báo sai/hết hạn/hết lượt/lỗi gửi; giữ `maXacThucId` giữa các bước | ĐK b6–b8, A3–A5 | C |
| DK-47 | Gửi mail thật qua Gmail SMTP (đăng ký thật, mở thư, nhập mã) | Thư đúng mẫu Figma, mã dùng được, "10 phút" | ĐK b6–b10; Q3, G2 | M |
| DK-48 | Hàng mới nhất gửi lỗi; "Gửi lại mã" bằng chính `maXacThucId` đó (đủ giãn cách) | Được phép (không bị thay thế vì không có hàng gửi thành công mới hơn); hàng mới sao chép dữ liệu; thành công thì thu hồi hàng cũ | ĐK A5/6b; N1 | I |
| DK-49 | Xác minh bằng `maXacThucId` của hàng chưa gửi thành công (`da_gui_luc` rỗng) | Từ chối, không tăng lần sai | N1 | I |
| DK-50 | Sau QMK thành công trên tài khoản chưa xác minh: xác minh hoặc "Gửi lại mã" bằng `maXacThucId` cũ | Từ chối `CAN_DANG_KY_LAI`; ba cột dữ liệu đăng ký của hàng đó là NULL; đăng ký lại cùng email thì đi theo A2/4c bình thường | N3 | I |

### 7.2 Đăng nhập (DN)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| DN-01 | Bệnh nhân `DangHoatDong` đã xác minh, đúng mật khẩu | Tạo `phien_dang_nhap` (`het_han_luc` = +30 phút, chỉ lưu băm refresh); access token + cookie refresh + vai trò; `so_lan_dang_nhap_sai=0` | ĐN b3–b7 | I |
| DN-02 | Như DN-01 cho Bác sĩ, Lễ tân, Quản trị viên | Đúng vai trò | ĐN b7–b8 | I |
| DN-03 | FE: điều hướng theo vai trò | Mỗi vai trò vào đúng trang (hoặc trang giữ chỗ) | ĐN b8 | C |
| DN-04 | Email đăng nhập khác hoa/thường | Đăng nhập được | ĐN b4 | I |
| DN-05 | Email không tồn tại | Thông báo chung; không đếm; không phiên | ĐN A1/4a | I |
| DN-06 | Thời gian phản hồi email không tồn tại ≈ mật khẩu sai | Chênh lệch trong ngưỡng | ĐN A1/4a (H7) | I |
| DN-07 | Sai mật khẩu lần 1–4 | Thông báo chung, **không** kèm "Còn N lần"; `so_lan_dang_nhap_sai` tăng; chưa khoá | ĐN A1/6a–6c; G1 | I |
| DN-08 | Sai lần thứ 5 liên tiếp | `khoa_dang_nhap_den` = bây giờ + 15 phút; thông báo khoá + thời gian còn lại | ĐN A1/6d | I |
| DN-09 | Đang khoá, nhập **đúng** mật khẩu | Vẫn từ chối bằng thông báo khoá; không so mật khẩu; không tăng bộ đếm | ĐN A1/6d | I |
| DN-10 | Hết khoá (14:59 / 15:01), nhập đúng | 14:59 từ chối; 15:01 vào được, bộ đếm về 0 | ĐN A1/6d (biên) | I |
| DN-11 | Sai 3, đúng 1, sai 4 | Không khoá | Quyết định 2 | I |
| DN-12 | 10 yêu cầu sai song song | Khoá đúng khi chạm 5; không mất lần đếm | ĐN A1 (H8) | I |
| DN-13 | Sai tiếp sau khi hết khoá | Bộ đếm hành xử đúng theo quy tắc chốt khi làm A8 (ghi vào `TRACKING.md`) | ĐN A1/6d | I |
| DN-14 | `NgungHoatDong`, mật khẩu đúng và sai | Cả hai: "đã bị khoá, liên hệ quản trị viên"; không so mật khẩu (spy); bộ đếm không đổi | ĐN A2/5a–5b | I |
| DN-15 | Nhân sự `ChoKichHoat` (`mat_khau_bam NULL`) | Thông báo chưa kích hoạt + hướng dẫn; không so mật khẩu, không lỗi null; bộ đếm không đổi | ĐN A3/5a–5b (H6) | I |
| DN-16 | `NgungHoatDong` **và** đang khoá tạm | Báo tài khoản bị khoá/ngưng (kiểm trạng thái trước) | ĐN b5 | I |
| DN-17 | **Chưa xác minh + đúng mật khẩu** | `EMAIL_CHUA_XAC_MINH` + `maXacThucId` (hàng `DangKy` đã gửi mới nhất) + `trangThaiMa`; **không** có hàng `phien_dang_nhap`, không token, không cookie; **không gửi mail tự động**; `so_lan_dang_nhap_sai` về 0 | ĐN b5–b7; Q5; N2 | I |
| DN-18 | Chưa xác minh + **sai** mật khẩu | Thông báo chung; đếm sai; khoá sau 5 lần như thường | ĐN A1; Q5 | I |
| DN-19 | Chưa xác minh + đang khoá tạm | Thông báo khoá | ĐN A1/6d; Q5 | I |
| DN-20 | Luồng liền: DN-17 → "Gửi lại mã" → OTP đúng → đăng nhập | Xác minh xong mới đăng nhập được, có `benh_nhan` | Q5 | I |
| DN-21 | Trong lúc bị khoá tạm, dùng Quên mật khẩu | Gửi OTP bình thường | ĐN A1/6d | I |
| DN-22 | Thiếu email/mật khẩu | 400 | ĐN b3 | U |
| DN-23 | Đáp ứng đăng nhập và `/auth/me` | Không bao giờ chứa `mat_khau_bam`, băm refresh hay dữ liệu đăng ký | SOW 3.2.2 | I |
| DN-24 | FE: từng frame lỗi (sai mật khẩu, khoá, ngưng, chưa kích hoạt) | Đúng frame theo mã lỗi; khoá có đếm ngược, nút vô hiệu, link Quên mật khẩu bấm được | ĐN A1–A3 | C |
| DN-25 | Endpoint cần đăng nhập: không token / sai chữ ký / `alg: none` / hết hạn | 401 | SOW 3.2.2 | I |
| DN-26 | Endpoint theo vai trò X với token vai trò Y | 403 (backend kiểm) | SOW 3.2.2 | I |
| DN-27 | `refresh` hợp lệ | Refresh mới khác cũ; `refresh_token_bam` thay; `het_han_luc = min(+30 phút, tao_luc + 8 giờ)`; access mới | Q2 | I |
| DN-28 | `refresh` với phiên đã thu hồi / không hoạt động 29:59 vs 30:01 / quá 8 giờ (7:59 vs 8:01) / tài khoản đã `NgungHoatDong` | 29:59 và 7:59 qua; còn lại 401 | Q2 (biên, H14) | I |
| DN-29 | Refresh token trong DB | Chỉ là băm SHA-256; định dạng `sid.ngẫu nhiên.chữ ký` | Q2 | I |
| DN-30 | **Dùng lại** refresh token cũ (chữ ký hợp lệ, băm không khớp) | 401, phiên bị thu hồi (`thu_hoi_luc`); token mới của phiên đó cũng vô hiệu | Q2 | I |
| DN-31 | Refresh token sai chữ ký / `sid` bị sửa | 401; **không** thu hồi phiên nào | Q2 | I |
| DN-32 | FE: nhiều tab làm mới cùng lúc | Chỉ một yêu cầu `refresh` được gửi (Web Locks), phiên không bị thu hồi | Q2 (H12, N4) | C |
| DN-33 | Cookie refresh | `HttpOnly`, `Secure` (luôn bật trừ `NODE_ENV=development` + `COOKIE_SECURE=false`), `SameSite=Lax`, `Path=/api/auth` | Q2; N5 | I |
| DN-34 | `Origin` của `/auth/refresh` và `/auth/logout`: đúng / sai / vắng | Đúng qua; sai hoặc vắng 403 | Q2 | I |
| DN-35 | Access token của phiên đã thu hồi; access token cấp lúc 7:59 dùng lúc 8:05 | 401 | Q2; ĐX | I |
| DN-36 | Dev/build: FE gọi `/api/...` cùng origin qua proxy (Vite, nginx) | Không CORS; cookie được gửi | Q2 | M |
| DN-37 | Chưa xác minh + đúng mật khẩu khi mã cũ đã hết hạn / bị thu hồi do sai 5 lần | `trangThaiMa` = `HetHan` / `DaThuHoi`; FE nói rõ và cho "Gửi lại mã"; "Gửi lại mã" theo giới hạn 60 giây / 5 mã/giờ | ĐN b5; N2 | I |
| DN-38 | Chưa xác minh + đúng mật khẩu sau khi QMK đã thu hồi OTP đăng ký | `trangThaiMa` = `CanDangKyLai`; FE hướng dẫn đăng ký lại cùng email | N3 | I |

### 7.3 Quên mật khẩu (QM)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| QM-01 | Toàn luồng thành công (b1–b11) | OTP → đúng → mật khẩu mới → đăng nhập bằng mật khẩu mới được, cũ không | QMK b3–b11 | I |
| QM-02 | Email không tồn tại | "Email chưa đăng ký"; không OTP, không mail | QMK A1 | I |
| QM-03 | Nhân sự `ChoKichHoat` | Từ chối, không OTP, hướng dẫn mở liên kết/liên hệ quản trị viên | QMK A5 | I |
| QM-04 | `mat_khau_bam IS NULL` nhưng `NgungHoatDong` | Xử lý như chưa kích hoạt (không OTP) | QMK A5; S4 | I |
| QM-05 | OTP sai 1…4 lần rồi đúng | Đếm sai theo mã; lần đúng sang bước mật khẩu mới | QMK A2/7a–7c | I |
| QM-06 | OTP sai đủ 5 lần | Mã vô hiệu; "Gửi lại mã" (≥ 60 giây, ≤ 5 mã/giờ) | QMK A2/7d | I |
| QM-07 | OTP hết hạn (599/601 giây); mã sai **và** quá hạn | 601 "hết hạn"; ca sai+quá hạn không tăng bộ đếm | QMK A3; S3 | U |
| QM-08 | Mật khẩu mới không đạt (Q11) / không khớp | Báo lỗi; **giữ** `resetToken`; nhập lại được; mật khẩu cũ không đổi | QMK A4; S2 | I |
| QM-09 | `MailService` giả lỗi | Báo lỗi, cho thử lại theo giới hạn; mã mới bị thu hồi, mã cũ còn dùng | QMK A6; S3 | U |
| QM-10 | Giới hạn gửi lại 59/60 giây, mã thứ 5/6; mã `DangKy` không tính vào `QuenMatKhau` | Đếm riêng theo `loai` | QMK A2/7d, A6/5b | I |
| QM-11 | `reset-password` không/sai/hết hạn `resetToken` (9:59 vs 10:01 từ lúc xác minh) | 401/403; mật khẩu không đổi | QMK b8–b10; S2 | I |
| QM-12 | `resetToken` của A kèm dữ liệu của B | Từ chối | QMK b10 | I |
| QM-13 | Dùng lại `resetToken` sau khi đặt lại thành công; hoặc khi hàng OTP đã bị thu hồi/đã dùng | Từ chối | QMK b10; S2, N6 | I |
| QM-14 | Access token dùng làm `resetToken` (và ngược lại) | Từ chối (khoá ký khác nhau, mục đích khác nhau) | S2 | U |
| QM-15 | Đặt lại thành công khi đang bị khoá đăng nhập | `so_lan_dang_nhap_sai=0`, `khoa_dang_nhap_den=NULL`; đăng nhập được ngay | QMK; ĐN A1/6d; S4 | I |
| QM-16 | Đặt lại thành công | **Mọi** `phien_dang_nhap` của tài khoản có `thu_hoi_luc`; refresh cũ bị từ chối | QMK b10; Q8 | I |
| QM-17 | Email thuộc tài khoản **chưa xác minh**, QMK thành công | Đổi mật khẩu của `tai_khoan`; `da_xac_minh_email` **không** đổi; không tạo `benh_nhan`; mọi hàng `DangKy` chưa dùng bị thu hồi **và** ba cột dữ liệu đăng ký về NULL; giao diện hướng dẫn đăng ký lại cùng email | QMK; Q6; N3 | I |
| QM-18 | Sau QM-17, đăng ký lại cùng email (dữ liệu mới) rồi xác minh bằng OTP mới | `tai_khoan` nhận dữ liệu của lần đăng ký mới (kể cả mật khẩu); mật khẩu đặt lại ở QM-17 không còn hiệu lực; có `benh_nhan`, `vi_noi_bo` | Q6 × Q7; N3 | I |
| QM-19 | `NgungHoatDong` có mật khẩu: đặt lại thành công | Đổi mật khẩu được; vẫn không đăng nhập được; khung "Hoàn tất" có dòng "Mật khẩu đã được đặt lại. Tài khoản của bạn hiện đang ngừng hoạt động nên chưa thể đăng nhập. Vui lòng liên hệ bộ phận hỗ trợ." | S4; N7 | I |
| QM-20 | Lỗi giữa giao dịch đặt lại (giả lập) | ROLLBACK: mật khẩu cũ, OTP chưa dùng, phiên chưa thu hồi | QMK hậu điều kiện thất bại | I |
| QM-21 | Hai `reset-password` đồng thời cùng token | Một thành công, một bị từ chối | QMK b10 (H8) | I |
| QM-22 | FE: 5 frame, trạng thái lỗi, giữ `resetToken` giữa các bước | Đúng frame theo mã lỗi | QMK b2–b11, A1–A6 | C |
| QM-23 | Gửi mail thật qua Gmail SMTP | Thư đúng mẫu Figma, nêu email tài khoản, "10 phút" | QMK b5; Q3, G2 | M |

### 7.4 Đổi mật khẩu (DM)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| DM-01 | Đúng mật khẩu cũ, mật khẩu mới hợp lệ và khớp | Cập nhật; đăng nhập bằng mật khẩu mới được | ĐMK b3–b5 | I |
| DM-02 | Lặp DM-01 cho 4 vai trò | Thành công cả 4 | ĐMK tác nhân | I |
| DM-03 | Mật khẩu cũ sai | Báo lỗi; không đổi | ĐMK A1 | I |
| DM-04 | Mật khẩu mới không đạt (Q11) / không khớp | Báo lỗi tương ứng | ĐMK A2 | U |
| DM-05 | Chưa đăng nhập / token hết hạn | 401 | ĐMK tiền điều kiện | I |
| DM-06 | Body cố truyền `tai_khoan_id` khác | Bỏ qua; chỉ đổi tài khoản của token | SOW 3.2.2 | I |
| DM-07 | Đổi thành công | Phiên khác bị thu hồi; phiên hiện tại tiếp tục dùng được với **refresh token mới**; refresh cũ của phiên này bị từ chối | ĐMK; Q8 | I |
| DM-08 | Sai mật khẩu cũ nhiều lần | **Không** tăng `so_lan_dang_nhap_sai`; chưa có throttling (S7 — ghi nhận) | ĐMK A1; S7 | I |
| DM-09 | Không ghi mật khẩu cũ/mới vào log | Log sạch | SOW 3.2.2 | I |
| DM-10 | FE: biểu mẫu 3 ô + "Cập nhật mật khẩu"/"Hủy", lỗi từng ô | Đúng thông báo; không có dòng "mật khẩu demo" | ĐMK b2–b3, A1–A2; G3 | C |

### 7.5 Đăng xuất (DX)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| DX-01 | Đăng xuất khi có phiên | `thu_hoi_luc` của phiên hiện tại được đặt; refresh với token đó ⇒ 401 | ĐX b2 | I |
| DX-02 | Access token cũ sau đăng xuất | 401 ngay (guard tra phiên) | ĐX hậu điều kiện | I |
| DX-03 | Chỉ thu hồi phiên hiện tại | Phiên thiết bị khác còn hiệu lực | ĐX mô tả | I |
| DX-04 | Phiên đã hết hạn / đã thu hồi từ nơi khác | Trả thành công (idempotent); FE về màn đăng nhập | ĐX A1/1a–1b | I |
| DX-05 | Đăng xuất hai lần | Lần hai không ghi đè `thu_hoi_luc` đầu | ĐX A1 | I |
| DX-06 | Không cookie refresh / không token | Không lỗi; FE về đăng nhập | ĐX A1 | I |
| DX-07 | `Origin` sai/vắng | 403 | Q2 | I |
| DX-08 | FE: sau đăng xuất, đăng xuất ngay không hộp xác nhận | Xoá trạng thái + token trong bộ nhớ; Back không hiện trang cần đăng nhập; chuyển tới đăng nhập/trang chủ | ĐX b3; G5 | C |
| DX-09 | FE: refresh thất bại giữa phiên | Tự về màn đăng nhập | ĐX A1 | C |

### 7.6 Bảo mật dùng chung (SE)

| ID | Kịch bản | Mong đợi | Phủ | Loại |
|---|---|---|---|---|
| SE-01 | `mat_khau_bam` trong DB | Tiền tố `$argon2id$` với m=19456, t=2, p=1 | SOW 3.2.2; S6 | I |
| SE-02 | `ma_bam` (OTP) | HMAC với khoá riêng; ≠ SHA-256 của mã; cùng mã ở hai hàng cho hai giá trị khác nhau | S3 | I |
| SE-03 | `refresh_token_bam` | Chỉ băm; không có bản rõ | Q2 | I |
| SE-04 | Quét log toàn bộ luồng để tìm mật khẩu/token/OTP mẫu | Không có | SOW 3.2.2 | I |
| SE-05 | Endpoint cần đăng nhập/vai trò | Thiếu token 401; sai vai trò 403 | SOW 3.2.2 | I |
| SE-06 | JWT: `alg` cố định; khoá riêng cho access/refresh/reset | Token ký bằng khoá khác bị từ chối | SOW 3.2.2 | U |
| SE-07 | Không secret trong mã/commit (`gitleaks`); `.env.example` không chứa giá trị thật | Xanh | CONTRIBUTING 5 | M |
| SE-08 | Quy tắc mật khẩu dùng chung FE/BE, cùng bộ vector thử: biên 7/8/64/65, chữ số, từng ký tự trong 32 dấu câu/ký hiệu ASCII, dấu cách đầu/giữa/cuối, ký tự không ASCII (có dấu, emoji, U+00A0), ký tự điều khiển | Cùng kết quả ở FE và BE; không trim; cùng độ dài | Q11; N9, N10 | U |
| SE-09 | Khởi động API với `COOKIE_SECURE=false` khi `NODE_ENV=production` hoặc `staging` | API từ chối khởi động; với `development` thì chạy | N5 | U |

## 8. Đề xuất chia việc (chỉ đề xuất — nhóm chốt)

Nguyên tắc: **một người làm trọn module `auth` (backend + frontend)**, người còn lại làm module khác song song.

| Giai đoạn | Người 1 | Người 2 |
|---|---|---|
| Trước khi bắt đầu | P0; tạo Gmail riêng + App Password (N8) | P0 |
| Tiền đề, song song | P1 → P5 → P3 → P4 | P2 → P6 (web shell + proxy dùng chung **mọi** module, làm trước để tránh xung đột), P7 |
| Sau tiền đề | **A1 → A3 → A4 → A8 → A9 → A10 → A15** (đăng nhập được sớm); **A2 → A5 → A6 → A7**; **A11 → A12 → A13**; A14; rồi **F1 → F2 → F3 → F4 → F5**; X1–X2 | Module không phụ thuộc `auth`, ví dụ `search` (tra cứu chi nhánh/chuyên khoa/bác sĩ công khai) rồi `patient` |

Thứ tự PR gợi ý: P1 → P3 → A1 → A3/A4 → A8 → A2 → A5/A6 → A10 → A11/A12 → A13 → F*. Nếu cần chia nặng hơn: Người 2 nhận nhóm F (sau F1 và hợp đồng API) — nhưng cả hai vẫn phải giải thích được toàn bộ module khi vấn đáp.

## 9. Quy trình bắt buộc cho mỗi PR của module

1. Nhánh `feat/auth-<việc>`; tiêu đề PR theo Conventional Commits, scope `auth` (hạ tầng: `api`/`web`/`db`/`docker`/`docs`). Commit/push/merge **do thành viên tự làm**; không để lại dòng `Co-Authored-By` của AI (CONTRIBUTING 9).
2. Dùng AI ⇒ ghi `AI_USAGE_LOG.md` bảng 1 **ngay**; lỗi AI phát hiện ⇒ bảng 2 + `AI-BUG-nnn` trong commit sửa. Lần lập/cập nhật kế hoạch này cũng cần một dòng.
3. Đổi thiết kế/DB ⇒ cập nhật tài liệu trong cùng PR (task `[ĐỒNG BỘ TL]`, mục 6.5).
4. Cấu hình mới ⇒ `.env.example`; **không** commit App Password/khoá. Lối tắt kỹ thuật ⇒ `docs/TECH_DEBT.md`.
5. Cập nhật `TRACKING.md` sau mỗi task; khi cả module xong thêm **đúng một dòng** vào `docs/TRACKING.md` gốc.
6. Tự giải thích được mọi đoạn code — đặc biệt: kiểm trạng thái trước mật khẩu, nhánh chưa xác minh, giao dịch xác minh OTP (ghi dữ liệu đăng ký, `benh_nhan`, ví), thiết kế lần đăng ký chống chiếm trước, khoá hàng khi cấp OTP, xoay và phát hiện dùng lại refresh token.

## 10. Điều kiện hoàn thành module

- Mọi test case ở mục 7 đã chạy; kết quả ghi trong `TRACKING.md`; không còn Fail.
- Không còn thẻ `[CHỜ …]`; mọi `[ĐỒNG BỘ TL]` đã làm; 2.4, `docs/database/*` và Figma khớp với mã.
- `docker compose up --build` chạy ba service; gửi và nhận được cả hai loại email OTP qua Gmail SMTP thật.
- Lint/build/test xanh; không secret; `AI_USAGE_LOG.md` đầy đủ; X3 được ghi nhận là việc còn lại trước khi mở công khai.
