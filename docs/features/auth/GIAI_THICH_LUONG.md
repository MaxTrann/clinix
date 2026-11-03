# Giải thích luồng module `auth` (chuẩn bị vấn đáp)

Tài liệu ôn tập ngắn cho phần vấn đáp (rubric mục 6). Mỗi luồng gồm: các bước theo đúng thứ tự trong mã, file cần mở để đọc,
và lý do của những chỗ khó. Đường dẫn API tính từ `apps/api/src/`, web tính từ `apps/web/src/`. Chi tiết quyết định (mã A…, F…)
nằm ở [`TRACKING.md`](TRACKING.md) mục 3; thiết kế đầy đủ ở [`PLAN.md`](PLAN.md) mục 4–5.

## 0. Khung chung (đọc trước)

| Thành phần           | File                                                                                                     | Ý chính                                                                                                                                                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Guard toàn cục       | `auth/guards/jwt-auth.guard.ts`, `auth/guards/roles.guard.ts`, `auth/decorators/*.ts`                    | Mọi route **mặc định cần đăng nhập**; route công khai phải ghi `@Public()`. Token chỉ đọc từ header `Authorization: Bearer`, không đọc cookie (cookie trình duyệt tự gửi ⇒ dễ bị CSRF). Thứ tự: chữ ký và `alg` → phiên theo `sid` chưa thu hồi, chưa quá 8 giờ → tài khoản `DangHoatDong` |
| Lỗi chuẩn            | `common/errors/app.exception.ts`, `all-exceptions.filter.ts`, `auth/auth.constants.ts`                   | Mỗi nhánh có **mã lỗi ổn định** (`DANG_NHAP_SAI`, `OTP_HET_HAN`…) để FE chọn câu; lỗi bất ngờ trả 500 kèm `requestId`, không lộ chi tiết                                                                                                                                                   |
| Che log              | `common/logging/sanitize.ts`                                                                             | Lớp phòng thủ thứ hai: che theo tên khoá và hình dạng chuỗi (JWT, Argon2…). Lớp thứ nhất là **không bao giờ** đưa mật khẩu, OTP, token, email vào log                                                                                                                                      |
| Băm                  | `auth/password/password-hasher.service.ts`, `auth/otp/otp-code.ts`, `auth/session/token.service.ts`      | Mỗi loại bí mật một cách băm (H10): mật khẩu Argon2id (m=19 MiB, t=2, p=1); OTP HMAC-SHA-256 với khoá riêng; refresh token SHA-256 (chuỗi ngẫu nhiên 256 bit nên không cần băm chậm); `resetToken` là JWT ký bằng khoá riêng                                                               |
| Giao dịch            | `auth/otp/otp.service.ts` (`transaction`)                                                                | Mọi thao tác nhiều bảng chạy trong **một giao dịch READ COMMITTED**, khoá theo thứ tự cố định `tai_khoan` → `ma_xac_thuc` → `phien_dang_nhap` để không deadlock. Băm Argon2id và gửi SMTP **luôn ở ngoài giao dịch** (không giữ khoá trong lúc chờ)                                        |
| Gửi thư              | `mail/mail.service.ts`, `mail/smtp-mail.service.ts`, `mail/mail-config.ts`, `mail/templates/otp-mail.ts` | `MailService` là lớp trừu tượng: chạy thật dùng `SmtpMailService` (Gmail SMTP qua biến môi trường), test tự động dùng `FakeMailService`. Lỗi gửi đổi thành `MailSendError` với `kind` cố định; log không bao giờ có chữ tự do của máy chủ SMTP                                             |
| Lớp API client (web) | `shared/api/client.ts`, `features/auth/auth-session.ts`, `features/auth/refresh-lock.ts`                 | Mọi lời gọi đi qua **một** client, cùng origin `/api` (proxy Vite/nginx). Access token chỉ nằm trong bộ nhớ; gặp 401 thì làm mới một lần rồi gửi lại                                                                                                                                       |

## 1. Đăng ký và xác minh OTP (UC Đăng ký)

1. `POST /auth/register`. Đọc mã: `auth/register/register.controller.ts` → `register.service.ts` (chú thích đầu lớp liệt kê 5 nhánh).
2. Đọc thường theo email. Email đã xác minh, của nhân sự hoặc bị ngưng ⇒ `409 EMAIL_DA_DUNG`, trả ngay mà **không băm** mật khẩu.
3. Băm mật khẩu bằng Argon2id **ngoài giao dịch**.
4. **Pha 1** (giao dịch): tạo `tai_khoan` (Bệnh nhân, chưa xác minh), hoặc khoá tài khoản chưa xác minh đã có. Gọi `OtpService.issue`: kiểm giới hạn gửi lại (≥ 60 giây, ≤ 5 mã/giờ), chèn hàng `ma_xac_thuc` chứa **băm HMAC của mã** và **dữ liệu của lần đăng ký này** (họ tên, SĐT, băm mật khẩu). Commit.
5. **Gửi thư** ngoài giao dịch (`register-delivery.ts`).
6. **Pha 2** (`OtpService.deliver`): gửi thành công thì đặt `da_gui_luc`, rồi mới thu hồi các mã cũ; gửi lỗi thì chỉ thu hồi hàng mới, giữ mã cũ, và trả `503 GUI_MAIL_LOI` với câu chung, không nêu lỗi SMTP (N1).
7. `POST /auth/register/verify-otp` (`register-verification.service.ts`): nhận `email` + `maXacThucId` + mã. Đúng mã thì trong **cùng giao dịch**: chép dữ liệu đăng ký từ hàng OTP sang `tai_khoan`, đặt `da_xac_minh_email`, tạo `benh_nhan` và `vi_noi_bo`, đánh dấu mã đã dùng, xoá dữ liệu đăng ký khỏi mọi hàng `DangKy`. Không tạo phiên (đăng nhập là bước riêng).
8. "Gửi lại mã": `POST /auth/register/resend-otp`, cùng hai pha như trên.
9. Job dọn (`unverified-patient-cleanup.job.ts`, mỗi giờ vào phút 15) xoá Bệnh nhân chưa xác minh quá 24 giờ.

**Vì sao dữ liệu đăng ký nằm ở hàng OTP chứ không ghi thẳng vào `tai_khoan`?** Để chống chiếm trước tài khoản (H3, Q7). Kẻ xấu đăng ký trước bằng email của nạn nhân cũng không ghi đè được gì, vì dữ liệu chỉ được áp khi **chính mã đó** được nhập đúng, mà mã chỉ đến hộp thư của chủ email.
**Vì sao hai pha?** Gọi SMTP mất vài giây; giữ giao dịch mở trong lúc đó thì khoá hàng bị giữ lâu (H9). Và chỉ mã **đã gửi thành công** mới thay mã cũ, nên lần gửi lỗi không làm hỏng mã người dùng đang có trong hộp thư.
**Vì sao verify phải nhận cả `email`?** `maXacThucId` là số tự tăng, nên chỉ cần id là đủ để người ngoài dò lần lượt các id và đốt lượt nhập của người khác (A6-A, TECH_DEBT dòng 23).
Web: `features/auth/register/`, `features/auth/verify/`, `features/auth/otp/`.

## 2. Đăng nhập và khoá tạm (UC Đăng nhập)

1. `POST /auth/login`. Đọc mã: `auth/login/login.service.ts` (chú thích đầu lớp), luật thuần trong `login-rules.ts`, mã lỗi trong `login-errors.ts`.
2. **Pha 1** (không khoá): tìm theo email. `ChoKichHoat` hoặc `NgungHoatDong` ⇒ từ chối (403) mà không so mật khẩu. Đang khoá ⇒ `429 TAI_KHOAN_BI_KHOA_TAM` kèm số giây còn lại. Email lạ ⇒ vẫn **so với một băm giả** để thời gian phản hồi như email có thật (H7). So mật khẩu bằng Argon2id.
3. **Pha 2** (giao dịch ngắn): khoá hàng `tai_khoan`, **kiểm lại mọi điều kiện** bằng dữ liệu mới nhất. Sai mật khẩu ⇒ tăng bộ đếm; lần thứ 5 ⇒ khoá 15 phút. Đúng ⇒ đưa bộ đếm về 0; chưa xác minh email ⇒ `403 EMAIL_CHUA_XAC_MINH` kèm trạng thái mã, **không tạo phiên, không tự gửi thư** (N2); đã xác minh ⇒ `SessionService.create`.
4. Phản hồi: thân chứa `accessToken` (JWT 15 phút) và `vaiTro`; refresh token chỉ đi vào cookie `HttpOnly; Secure; SameSite=Lax; Path=/api/auth` (`session/refresh-cookie.service.ts`).
5. Lỗi giao dịch không ném bên trong giao dịch, vì ném thì lần đếm sai bị hoàn tác theo. Giao dịch **trả kết quả**, lỗi chỉ ném sau commit.

**Vì sao kiểm lại dưới khoá?** Pha 1 đọc không khoá và băm mất khoảng 20 ms. Trong khoảng đó tài khoản có thể vừa bị khoá do lần sai thứ 5 của một yêu cầu song song, hoặc vừa bị admin ngưng.
**Lộ thông tin có chủ ý:** đặc tả 2.4 bắt buộc báo riêng các trường hợp tài khoản ngưng, khoá, chưa kích hoạt (TECH_DEBT dòng 37). Email lạ thì không lộ.
Web: `features/auth/login/` (`use-lock-countdown.ts` đếm ngược theo số giây API trả).

## 3. Làm mới phiên có xoay token

1. `POST /auth/refresh` (`auth/refresh/refresh.controller.ts`). `OriginGuard` (`guards/origin.guard.ts`) kiểm `Origin` đúng `WEB_ORIGIN`, lớp chống CSRF bổ sung cho `SameSite=Lax`.
2. `SessionService.refresh` (`auth/session/session.service.ts`): token có dạng `sid.ngẫu nhiên.HMAC`. Kiểm chữ ký **trước khi chạm DB**, rồi khoá hàng phiên `FOR UPDATE`. Thứ tự kiểm: không có → đã thu hồi → **dùng lại** (băm khác băm hiện tại) → quá trần 8 giờ → quá 30 phút không hoạt động → tài khoản không còn hoạt động.
3. Hợp lệ ⇒ sinh token mới, lưu băm mới (xoay), trả access token mới. Token cũ có chữ ký đúng mà không phải token hiện tại ⇒ coi là bị đánh cắp và **thu hồi cả phiên**.
4. Mọi lý do thất bại đều trả **cùng một** `401 PHIEN_HET_HIEU_LUC` để không lộ lý do.

**Điểm yếu đã chấp nhận (H12, N4):** hai tab làm mới cùng lúc, hoặc mất phản hồi mạng sau khi máy chủ đã xoay, đều làm token cũ bị dùng lại ⇒ đăng xuất nhầm. Web giảm trường hợp này bằng **Web Locks**: mọi thao tác dùng cookie refresh xếp hàng giữa các tab (`features/auth/refresh-lock.ts`). Phần mất mạng thì chấp nhận (TECH_DEBT dòng 11, 48, 49).

## 4. Đăng xuất

1. `POST /auth/logout` (`auth/logout/logout.controller.ts`), `@Public()` vì lúc bấm đăng xuất access token thường đã hết hạn. Phiên được nhận ra **bằng cookie**.
2. `SessionService.revokeByRefreshToken` đặt `thu_hoi_luc`. Luôn trả 204 và xoá cookie (idempotent), kể cả khi phiên đã chết. Lỗi DB thì **không** xoá cookie để người dùng thử lại được.
   Web: `features/auth/use-logout.ts` (huỷ request đang bay, xoá token trong bộ nhớ).

## 5. Quên mật khẩu (ba bước)

1. `POST /auth/forgot-password` và `/resend-otp` (`auth/forgot-password/forgot-password.service.ts`, `requestCode`): email lạ ⇒ `404 EMAIL_CHUA_DANG_KY` (đặc tả bắt buộc); nhân sự chưa kích hoạt ⇒ từ chối. Còn lại cấp mã loại `QuenMatKhau`, hai pha như đăng ký. Tài khoản **đang bị khoá đăng nhập vẫn được** dùng quên mật khẩu.
2. `POST /auth/forgot-password/verify-otp`: so với mã đã gửi mới nhất của tài khoản. Đúng ⇒ cấp `resetToken` (JWT ký bằng `JWT_RESET_SECRET`, sống 10 phút, mang mã tài khoản và mã hàng OTP; `reset-token.service.ts`). Mã OTP **chưa** bị đánh dấu dùng ở bước này.
3. `POST /auth/reset-password` (`reset-password.service.ts`): kiểm token; băm mật khẩu mới ngoài giao dịch. Giao dịch: khoá `tai_khoan`, kiểm lại tư cách, `otp.consume` đúng hàng của token; ghi mật khẩu mới, **xoá bộ đếm sai và khoá tạm**, **thu hồi mọi phiên**; nếu tài khoản chưa xác minh thì thu hồi các mã đăng ký đang chờ (N3).

**Vì sao không đánh dấu mã đã dùng ngay ở bước 2?** Để người dùng nhập sai mật khẩu mới (sai chính sách) vẫn thử lại được với cùng token. Token chỉ bị tiêu thụ khi đặt mật khẩu thành công.
Web: `features/auth/forgot/` (`forgot-state.ts` giữ `resetToken` giữa ba bước).

## 6. Đổi mật khẩu (đã đăng nhập)

1. `POST /auth/change-password` (`auth/change-password/change-password.service.ts`), lấy tài khoản và phiên **từ access token**, không từ thân yêu cầu.
2. So mật khẩu cũ. Sai ⇒ `400 MAT_KHAU_CU_SAI` (không dùng 401 để FE không tưởng token hết hạn mà đi làm mới); không đếm vào bộ đếm đăng nhập sai (TECH_DEBT dòng 47).
3. Giao dịch: khoá `tai_khoan`, xoay refresh token của **phiên hiện tại**, ghi mật khẩu mới, **thu hồi mọi phiên khác** (Q8). Người đang đổi vẫn đăng nhập.
   Web: `features/auth/change-password/change-password-form.tsx`, gọi `changePassword()` trong `auth-session.ts` dưới khoá refresh. **Chưa gắn vào trang nào**: việc gắn form thuộc `patient` F3 và `doctor` (X1 kiểm luồng này bằng HTTP).

## 7. Câu hỏi hay gặp (trả lời ngắn)

- **Sao không lưu refresh token rõ hoặc dùng JWT cho refresh?** Lưu băm để lộ DB cũng không dùng được token. Token ngẫu nhiên kèm phiên trong DB thì thu hồi được ngay; JWT thuần thì không thu hồi được trước khi hết hạn.
- **Sao access token để trong bộ nhớ mà không để `localStorage`?** Một lỗi XSS là đọc được `localStorage`; bộ nhớ của tab thì mất khi đóng tab, còn cookie `HttpOnly` thì JavaScript không đọc được.
- **Chặn dò mật khẩu thế nào?** Đếm sai theo tài khoản (5 lần ⇒ khoá 15 phút) và mỗi lần so tốn một lần Argon2id. **Chưa giới hạn theo IP** (S7): đây là việc X3, bắt buộc trước khi mở công khai.
- **Tại sao OTP dùng HMAC mà không Argon2?** Mã chỉ 6 số: băm chậm cũng không cứu được nếu lộ DB, còn khoá HMAC nằm ngoài DB nên lộ DB không dò được mã. Lượt nhập bị giới hạn 5 lần mỗi mã.
- **Khi SMTP hỏng thì sao?** API trả `503 GUI_MAIL_LOI` với câu chung; tài khoản và mã cũ giữ nguyên; log chỉ ghi loại lỗi (`AUTH`, `TIMEOUT`…). Kết quả chạy thật ở TRACKING mục 6.
- **Test có gửi thư thật không?** Không. Test tự động ép biến SMTP về rỗng và dùng `FakeMailService`, máy chủ SMTP giả (`mail/testing/`). Thư thật chỉ gửi ở lần kiểm tay X1.
