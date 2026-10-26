# Tracking — module `auth`

Nhật ký tiến độ riêng của module `auth`. Kế hoạch, task, phụ thuộc và danh sách test case nằm ở
[`PLAN.md`](PLAN.md); file này chỉ ghi việc **đã làm** để sau này giải thích lại được (luồng chạy, test nào pass,
chỗ nào phát sinh vấn đề). Giữ vĩnh viễn trong repo, không xoá sau khi merge.

**Cách ghi**
- Thêm một dòng mới **sau mỗi task** (mã task `P*`/`A*`/`F*`/`D*`/`X*` theo PLAN.md), mới nhất ở cuối.
- "Test case": liệt kê mã test case ở mục 7 của PLAN.md (ví dụ `DK-01, DK-02`); "Kết quả": `Pass` / `Fail` / `Một phần` (ghi rõ
  ca nào ở cột cuối). Ca `Fail` phải có dòng sau ghi cách xử lý và lần chạy lại.
- Đổi kế hoạch khi đang làm thì sửa `PLAN.md`; ghi lý do ở cột cuối của dòng tương ứng.
- Khi cả module xong: thêm **đúng một dòng** vào `docs/TRACKING.md` ở gốc, trỏ sang file này.

## 1. Nhật ký

| Ngày | Việc đã làm | Test case | Kết quả | Vấn đề phát sinh / cách xử lý |
|---|---|---|---|---|
| 26/10/2026 | **P0** (issue #12): ghi quyết định Q1 (TypeORM), Q2 (thời hạn token, cookie, cùng origin) và N5 (staging phải HTTPS) vào `docs/PLAN.md` Phase 0 (dòng #1, #2, #4) và Phase 4 (mục thuê server staging) | Không áp dụng (chỉ sửa tài liệu) | n/a | Không có. Đã kiểm số liệu với mục 3 của file này và cấu trúc bảng ở `docs/PLAN.md` |
| 26/10/2026 | **P1** (issue #13): khởi tạo `apps/api` bằng khung Nest CLI 12.0.10 (Vitest 4 + oxlint + ESM, TypeScript `strict`); `GET /health` ở gốc (không global prefix); `ConfigModule` kiểm `API_PORT`/`NODE_ENV` lúc khởi động; `cookie-parser`, `trust proxy`, `ValidationPipe` toàn cục; thêm `argon2`. Sửa `.github/workflows/ci.yml` (bỏ `--ci`), `docs/CODING_CONVENTION.md`, `AGENTS.md` (đổi chữ ESLint, thêm dòng về `.js`, cập nhật "Trạng thái hiện tại"), `.jscpd.json`, `docs/TECH_DEBT.md` (3 dòng nợ: override multer, lệch cổng `API_PORT`, chưa typecheck spec trong CI). Tick P0 trong `PLAN.md` | Không có mã test case riêng. Test đã thêm: `health.controller.spec`, `env.validation.spec` (4 ca), `argon2.smoke.spec`, e2e `/health` (2 ca) | Pass: `lint`, `tsc --noEmit`, `build`, 6 unit, 2 e2e; `docker build` 3 stage (`dev`, `build`, `prod`), image prod chạy non-root, argon2 chạy trong Alpine, HEALTHCHECK `healthy`; `npm audit` 0; Trivy (cờ như CI) 0; gitleaks sạch | **(1) AI-BUG-004:** `ci.yml` dùng `--ci` (cờ của Jest), Vitest báo `Unknown option --ci` → đã bỏ cờ. **(2)** Khung Nest 12 là Vitest + oxlint + ESM, lệch tài liệu "ESLint" → chọn theo khung chính thức, cập nhật tài liệu. **(3)** `npm audit` 9 → 0: `@nestjs/platform-express@12.2.0` ghim cứng `multer` 2.4.0 (HIGH, bản vá 2.5.0, Trivy sẽ chặn) → `overrides` multer 2.5.0 (gỡ khi platform-express nâng multer); gỡ `@nestjs/mau` (chỉ cho `nest deploy`, 6 lỗ hổng dev chưa có bản vá). **(4)** Đã thử ở scratchpad TypeORM 1.1.2 + MySQL 8.4 + Vitest (2 entity 1–1 hai chiều `Relation<>`, migration, CHECK/UNIQUE/ROLLBACK/khoá `FOR UPDATE NOWAIT`, DI Nest): ổn. Lưu ý cho P3: spec dùng chung DB phải chạy tuần tự; `bigint` trả về chuỗi; NOWAIT dùng `setOnLocked`. **(5) Việc cho P6:** proxy phải **gỡ tiền tố `/api`** khi chuyển sang API (Vite `rewrite`; nginx `proxy_pass http://api:3000/;` có dấu `/` cuối), vì API không có global prefix và `/health` ở gốc. **(6)** `.jscpd.json` đổi `path` thành `["apps/api/src"]` vì `apps/web/src` chưa có (jscpd báo `ENOENT`, job `duplication` của CI sẽ đỏ). **P2 nhớ thêm lại `apps/web/src` vào `path`.** **(7)** `npx` trong Git Bash lỗi như AI-BUG-003 → dùng PowerShell |
| | | | | |
| | | | | |

## 2. Kết quả test theo use case

Cập nhật lần chạy mới nhất; chi tiết từng ca xem mục 1.

| Nhóm test (PLAN.md mục 7) | Tổng số ca | Pass | Fail | Chưa chạy | Ngày chạy gần nhất |
|---|---|---|---|---|---|
| Đăng ký tài khoản (`DK-*`) | | | | | |
| Đăng nhập (`DN-*`) | | | | | |
| Quên mật khẩu (`QM-*`) | | | | | |
| Đổi mật khẩu (`DM-*`) | | | | | |
| Đăng xuất (`DX-*`) | | | | | |
| Bảo mật dùng chung (`SE-*`) | | | | | |

## 3. Quyết định đã chốt trong lúc làm

Ghi câu trả lời cho các câu hỏi/điểm mở ở mục 4 của PLAN.md và ngày chốt, để PLAN.md có thể bỏ thẻ `[CHỜ …]`.
Chi tiết hệ quả của từng quyết định xem PLAN.md mục 4.1.

| Mã câu hỏi | Quyết định | Ngày chốt | Ghi chú |
|---|---|---|---|
| Q1 | TypeORM, tắt `synchronize`, migration SQL đối chiếu schema chính thức | 25/10/2026 | |
| Q2 | Access JWT 15 phút; phiên không hoạt động 30 phút, tối đa 8 giờ; refresh ngẫu nhiên 256 bit lưu băm, xoay mỗi lần dùng, token mang mã phiên có chữ ký, dùng lại ⇒ thu hồi phiên; cookie `HttpOnly; Secure; SameSite=Lax`, access chỉ trong bộ nhớ; web và API cùng origin qua proxy, kiểm `Origin` cho `/refresh`, `/logout` | 25/10/2026 | Không đổi schema. Staging truy cập qua mạng phải HTTPS + cookie Secure (N5) |
| Q3 | Gmail SMTP cho dev và staging/demo, không Mailpit; App Password qua env; test tự động mock `MailService` | 25/10/2026 | Nhóm tạo Gmail riêng + App Password, điền cấu hình (N8) |
| Q4 | Tài khoản Bệnh nhân chưa xác minh sống 24 giờ từ khi tạo, không gia hạn khi gửi lại OTP; dọn bằng job + kiểm khi đăng ký lại; không xoá nhân sự | 25/10/2026 | Thay "[15 phút]" trong 2.4 |
| Q5 | Đúng mật khẩu nhưng chưa xác minh email ⇒ không tạo phiên, hướng tới màn OTP; chỉ sau OTP đúng mới đăng nhập được | 25/10/2026 | Thay quyết định cũ "cho vào"; cần sửa 2.4 (D8); không tự gửi mail khi đăng nhập (N2) |
| Q6 | QMK cho tài khoản chưa xác minh được phép; OTP `QuenMatKhau` chỉ đổi mật khẩu | 25/10/2026 | Theo N3: thu hồi OTP đăng ký đang chờ, hướng dẫn đăng ký lại cùng email |
| Q7 | Mỗi lần đăng ký lại là một lần xác minh riêng, dữ liệu gắn với OTP, chỉ áp khi OTP đó đúng | 25/10/2026 | Thiết kế ở PLAN.md mục 5.2, đã chốt N1 (có `da_gui_luc`); thay đổi schema: 3 cột + CHECK trong `ma_xac_thuc` (D7) |
| Q8 | QMK thành công: thu hồi mọi phiên; ĐMK: thu hồi phiên khác và xoay token phiên hiện tại | 25/10/2026 | D8 |
| Q9 | Tạo `vi_noi_bo` (0/0) trong cùng giao dịch xác minh OTP và tạo `benh_nhan` | 25/10/2026 | D4 |
| Q10 | Giữ `phien_dang_nhap`, `refresh_token_bam`, `tao_luc`, `het_han_luc`, `thu_hoi_luc`; bỏ nhãn `[đề xuất]` | 25/10/2026 | D3 |
| Q11 | Mật khẩu 8–64 ký tự, ≥ 1 chữ số 0–9 và ≥ 1 ký tự đặc biệt; không bắt buộc chữ hoa/thường; không kiểm danh sách mật khẩu phổ biến | 25/10/2026 | Chỉ ASCII in được; "ký tự đặc biệt" = 32 dấu câu/ký hiệu ASCII (N9, N10); sửa Figma, 2.4 |
| S1 | Dùng `thu_hoi_luc` cho cả OTP đăng ký và quên mật khẩu | 25/10/2026 | D2 |
| S2 | `resetToken` ký riêng, mục đích reset, tài khoản + mã OTP liên quan, 10 phút từ lúc xác minh; `da_dung_luc` đặt khi đặt mật khẩu | 25/10/2026 | N6 |
| S3 | OTP 6 số, HMAC-SHA-256 khoá riêng (gồm tài khoản, loại, mã lần gửi); kiểm hạn trước; gửi lỗi ⇒ vô hiệu mã mới, giữ mã cũ, vẫn tính giới hạn | 25/10/2026 | D2, D5 |
| S4 | QMK thành công xoá bộ đếm/khoá; `NgungHoatDong` có mật khẩu được đặt lại nhưng vẫn ngưng và phải báo rõ; chưa từng có mật khẩu ⇒ kích hoạt nhân sự | 25/10/2026 | Câu chữ thông báo: N7 |
| S5 | SĐT 10 số bắt đầu 0 (chuẩn hoá); email trim, giữ phần trước `@`, tên miền chữ thường | 25/10/2026 | Email ASCII: N9 |
| S6 | Argon2id m=19 MiB, t=2, p=1; không tự chuyển bcrypt khi build lỗi | 25/10/2026 | |
| S7 | Chưa làm throttling theo IP / cho mật khẩu cũ; phải bổ sung trước khi mở công khai | 25/10/2026 | `TECH_DEBT`, X3 |
| G1 | Bỏ "Còn N lần thử"; chỉ thông báo chung cho tới khi bị khoá | 25/10/2026 | Sửa Figma |
| G2 | Hai mẫu email: OTP hiệu lực 10 phút | 25/10/2026 | Sửa Figma |
| G3 | Bỏ mọi banner/tài khoản/mật khẩu/OTP demo; dev và demo nhận OTP qua Gmail thật | 25/10/2026 | Sửa Figma |
| G4 | Tên hiển thị CLINIX; bỏ hotline/địa chỉ chân trang nếu chưa có giá trị thật | 25/10/2026 | Email gửi/hỗ trợ: N8 |
| G5 | Đăng xuất ngay, không hộp xác nhận | 25/10/2026 | |
| N1 | Dữ liệu đăng ký gắn với OTP; không lấy hàng mới nhất tuyệt đối — dùng `da_gui_luc`, chỉ mã mới nhất **đã gửi thành công** mới thay mã cũ | 25/10/2026 | Mục 5.2; D2, D7 |
| N2 | Đăng nhập chưa xác minh: không tự gửi mail; màn OTP + "Gửi lại mã" theo giới hạn; nói rõ khi mã cũ hết hạn | 25/10/2026 | Đáp ứng đăng nhập có `trangThaiMa` |
| N3 | QMK thành công trên tài khoản chưa xác minh: đổi mật khẩu, thu hồi OTP đăng ký đang chờ, hướng dẫn đăng ký lại cùng email | 25/10/2026 | Hàng bị thu hồi do QMK được NULL dữ liệu đăng ký |
| N4 | Web Locks cho làm mới token giữa các tab; mất phản hồi mạng ghi `TECH_DEBT` | 25/10/2026 | |
| N5 | Staging có người truy cập qua mạng phải HTTPS + cookie Secure; chỉ tắt Secure ở phát triển cục bộ | 25/10/2026 | API từ chối khởi động nếu `COOKIE_SECURE=false` ngoài `development` |
| N6 | `resetToken`: kiểm chữ ký/hạn; OTP gắn token chưa dùng, chưa thu hồi; không kiểm lại hạn OTP | 25/10/2026 | |
| N7 | Khung "Hoàn tất" + dòng cảnh báo tài khoản ngưng hoạt động; lỗi chưa có frame dùng kiểu lỗi hiện có, nhóm bổ sung Figma | 25/10/2026 | Câu chữ đề xuất: PLAN.md mục 5.5 |
| N8 | Nhóm tạo Gmail riêng; dùng làm địa chỉ hỗ trợ nếu có người theo dõi; địa chỉ thật trong cấu hình, App Password ngoài repo | 25/10/2026 | Việc của nhóm |
| N9 | Chỉ nhận email ASCII; mật khẩu: chữ số `[0-9]`, ký tự đặc biệt là dấu câu/ký hiệu, không trim, FE/BE cùng quy tắc | 25/10/2026 | Phạm vi ký tự: N10 |
| N10 | Mật khẩu chỉ nhận ký tự ASCII in được (chữ không dấu, số, dấu câu/ký hiệu, dấu cách); 8–64 ký tự, ≥ 1 số, ≥ 1 dấu câu/ký hiệu; `.` được tính, dấu cách không; không trim; không cần chuẩn hoá NFC | 25/10/2026 | Ghi `TECH_DEBT`: mật khẩu tiếng Việt có dấu bị từ chối |
| Trang giữ chỗ | Chưa có trang thật của vai trò ⇒ hiển thị tên vai trò + nút Đăng xuất; thay bằng trang thật khi module tương ứng xong | 25/10/2026 | F1, F3 |
| P1-A | `apps/api` dùng khung Nest CLI 12 chính thức: **Vitest + oxlint (type-aware) + ESM** (import tương đối có đuôi `.js`); không global prefix, `/health` ở gốc, tiền tố `/api` do proxy gỡ | 26/10/2026 | `ci.yml` bỏ `--ci`; `CODING_CONVENTION.md` và `AGENTS.md` đã cập nhật |

## 4. Ghi chú AI

Mỗi lần dùng AI sinh mã/tài liệu cho module này đã được ghi vào `AI_USAGE_LOG.md` (bảng 1); lỗi AI phát hiện (`AI-BUG-nnn`)
ghi ở bảng 2. Dòng nhật ký ở mục 1 nên trỏ tới số thứ tự tương ứng khi có dùng AI.

| Ngày | Mục trong `AI_USAGE_LOG.md` (số thứ tự / `AI-BUG-nnn`) | Task liên quan |
|---|---|---|
| | | |
