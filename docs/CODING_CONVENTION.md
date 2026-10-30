# Coding convention

> Bản khởi đầu — nhóm chỉnh lại cho khớp rồi giữ nhất quán. Mọi giá trị đánh dấu **[đề xuất]** là gợi ý, chưa chốt.

## Chung
- Ngôn ngữ mã và tên định danh: tiếng Anh. Comment/tài liệu: tiếng Việt có dấu.
- **[đề xuất]** TypeScript `strict: true` cho cả API và Web; cấm `any` không có lý do (quy tắc `no-explicit-any`: oxlint cho api, ESLint cho web).
- Format bằng Prettier, lint bằng oxlint cho api, ESLint cho web; cả hai chạy ở pre-commit và CI. 0 lỗi lint tồn đọng.
- Không hardcode URL, khóa, thông tin kết nối — đọc qua biến môi trường (`.env`, mẫu ở `.env.example`).

## Đặt tên
- File: `kebab-case` (`booking.service.ts`, `slot-picker.tsx`). Class/Component: `PascalCase`. Biến/hàm: `camelCase`. Hằng: `UPPER_SNAKE_CASE`.
- Bảng DB: `snake_case`, số ít. Khóa: `<tenLop>Id` / `<ten_bang>_id` — không dùng `id` chung chung ở mọi bảng (theo quyết định thiết kế của nhóm).
- **Ngoại lệ cho entity TypeORM** (quyết định task P3 của `auth`): tên class = PascalCase của tên bảng (`tai_khoan` → `TaiKhoan`), thuộc tính = camelCase của tên cột
  tiếng Việt không dấu (`ho_ten` → `hoTen`, `tai_khoan_id` → `taiKhoanId`). Không dịch sang tiếng Anh, để nhìn vào mã là đối chiếu được ngay với schema và Class Diagram.
  Mọi định danh khác (hàm, biến, DTO, service…) vẫn tiếng Anh.

## Backend (NestJS)
- Mỗi module nghiệp vụ một thư mục: `controller` → `service` → `repository`. Controller không chứa logic nghiệp vụ.
- DTO + `class-validator` cho mọi dữ liệu vào; kiểm tra phân quyền ở backend (Role + Ownership + Scope), không dựa vào việc ẩn nút ở UI.
- Không ghi mật khẩu, token, OTP vào log. Thao tác nhạy cảm đi qua Audit Log.
- Mật khẩu băm bằng **Argon2id** (m=19 MiB, t=2, p=1 — quyết định S6) qua `PasswordHasher` của module `auth`; không dùng bcrypt, không tự viết hàm băm riêng.
- Mọi import tương đối trong `apps/api` phải có đuôi `.js` (dự án dùng ESM), ví dụ `import { AppModule } from './app.module.js';`.
- TypeORM luôn `synchronize: false`; schema chỉ đổi bằng **migration viết tay** trong `src/database/migrations/`, đăng ký vào mảng `MIGRATIONS` (và entity vào `ENTITIES`) — không dùng glob.
  Sửa schema thì sửa **cả ba** file `docs/database/*` trước, rồi viết migration khớp từng dòng (test `schema-parity.int-spec.ts` kiểm điều này).
- Cột `bigint`/`decimal` trả về **chuỗi** (không mất độ chính xác); quan hệ hai chiều giữa các entity dùng `import type` + `Relation<>` để không vòng import khi chạy ESM.
- **Cấu trúc module `auth`** (`apps/api/src/auth/`): ở gốc chỉ có `auth.module.ts` và `auth.constants.ts`. Controller và service của MỘT use case nằm chung một thư mục con theo use case
  (đã có `register/`: `register.controller.ts` chỉ nhận/trả, `register.service.ts` điều phối và giữ giao dịch, kèm luật thuần và lớp phụ của use case đó; A6 thêm vào cùng thư mục; hậu tố `.job.ts` là lớp chạy theo lịch `@nestjs/schedule`, ví dụ `unverified-patient-cleanup.job.ts` của A7, và không gọi `ScheduleModule.forRoot()` thêm lần nữa vì `UploadModule` đã đăng ký toàn cục, gọi lại làm mọi job chạy gấp đôi; use case khác đặt tương tự `[đề xuất]`).
  File dùng chung nằm trong thư mục theo nhóm: `password/` (băm Argon2id, chính sách mật khẩu và bộ vector dùng chung FE/BE), `validation/` (chuẩn hoá và kiểm email, SĐT, họ tên, mã lỗi đầu vào),
  `otp/` (cấp, gửi, xác minh mã OTP), `session/` (access token, phiên đăng nhập, cookie refresh), `guards/`, `decorators/`, `repositories/` (mỗi bảng một file, ví dụ `tai-khoan.repository.ts`),
  `dto/`, `entities/`, `testing/` (mã hỗ trợ test dùng chung). Chỉ tạo thư mục khi có file đầu tiên (không tạo thư mục rỗng); test đặt cạnh mã nó kiểm;
  module khác dùng thứ của `auth` qua các provider mà `AuthModule` export.
- **Xác thực mặc định (task A4 của `auth`):** mọi controller mặc định cần đăng nhập (`JwtAuthGuard` và `RolesGuard` là guard toàn cục trong `AuthModule`); mở route công khai bằng `@Public()`, giới hạn vai trò bằng `@Roles(...)`, lấy người dùng bằng `@CurrentUser()` (cả ba nằm ở `auth/decorators/`).
- **Lỗi có mã ổn định (task P5 của `auth`):** ném lỗi nghiệp vụ đã lường trước bằng `throw new AppException(409, 'YEU_CAU_DANG_CHO', { thongBao, loi, chiTiet })` (`common/errors/app.exception.ts`;
  mã viết `HOA_GACH_DUOI`, chỉ 4xx hoặc đúng 503 cho lỗi do dịch vụ phía sau tạm thời, ví dụ `GUI_MAIL_LOI`; trạng thái 5xx khác bị từ chối ngay khi dựng). Đừng ném `BadRequestException('câu tự do')`: câu tự do bị bỏ khi trả ra ngoài. `message` của decorator class-validator đặt bằng **mã** (như `VALIDATION_CODES`).
  Mọi lỗi API có dạng `{ maLoi, thongBao, loi?, chiTiet?, requestId? }` (PLAN auth mục 5.5); lỗi ngoài dự kiến là 500 `LOI_HE_THONG` kèm `requestId`, stack chỉ nằm trong log.
- **Log:** dùng `Logger` của Nest (đi qua bộ che mật khẩu, token, OTP, mã băm), không dùng `console.*`. Không bật `logging` của TypeORM: logger riêng của nó dùng `console`, không đi qua bộ che.
- **Gửi email (task P4 của `auth`):** import `MailModule` rồi `@Inject(MailService)` (`src/mail/`); chỉ gọi `await mail.send({ to, subject, text })` với `to` đã chuẩn hoá bằng chính sách email của auth (A1). `send` resolve khi và chỉ khi máy chủ SMTP đã nhận thư; lỗi là `MailSendError` (không phải `AppException`, nơi gọi tự đổi sang mã lỗi API). Không tạo transport `nodemailer` riêng, không truyền `bcc` hay header, không log địa chỉ, tiêu đề, nội dung hay OTP. Mẫu OTP: `renderOtpMail` (`mail/templates/otp-mail.ts`). Test tự động dùng `FakeMailService` (`mail/testing/`), không bao giờ gửi thật.
- **Mã OTP (task A2 của `auth`):** dùng `OtpService` (`auth/otp/`, xuất bởi `AuthModule`), đừng tự viết SQL trên `ma_xac_thuc`. Cấp mã theo HAI PHA: `issue` trong giao dịch của bạn (kèm việc ghi khác như tạo tài khoản), commit, rồi `deliver` (gửi thư và ghi kết quả); hoặc `issueAndDeliver` khi không có việc ghi nào khác. Xác minh bằng `verify(input, { consume }, onVerified)`: nó tự mở giao dịch RIÊNG (đừng gọi trong giao dịch của bạn, vì lỗi bạn ném sau đó sẽ làm mất lần đếm nhập sai) và chạy `onVerified` trong cùng giao dịch. Lỗi nghiệp vụ được TRẢ VỀ (`ok: false`), đổi sang lỗi API bằng `toOtpException(failure)`. `IssuedOtp` không bao giờ lộ mã khi `JSON.stringify`; vẫn không đưa nó vào phản hồi hay log. Thứ tự khoá cố định: `tai_khoan` TRƯỚC, `ma_xac_thuc` SAU. Test lấy mã từ thư giả bằng `readOtpFromMail`, không bao giờ từ phản hồi. **Giao dịch của bạn mở bằng `otp.transaction(async (em) => …)`** (READ COMMITTED; task A5 sửa A2), không phải `dataSource.transaction`: chỉ giao dịch này mới cho `issue`/`reissue`/`consume` đọc đếm/quyết định không khoá, nên nhiều tài khoản cấp mã cùng lúc không deadlock chéo nhau. Giao dịch thô vẫn đúng kết quả nhưng chậm, dễ bị MySQL 1213 và `OtpService` ghi một cảnh báo. **Không đọc được mức cô lập bằng SQL** (`@@transaction_isolation` luôn báo mức của phiên) nên không có kiểm tra tự động: mỗi nơi gọi `OtpService` mới PHẢI có test nhiều tài khoản chạy đồng thời (mẫu `register.service.concurrency.int-spec.ts` RC-03, `otp.service.multi-account.int-spec.ts`). `otp.transaction` không tự thử lại phần việc của bạn khi bị deadlock; cần thì tự lặp như `RegisterService`.
- **Lỗi MySQL đã lường trước (task A5 của `auth`):** bắt lỗi UNIQUE, khoá ngoại và deadlock bằng `isDuplicateKeyError` (1062), `isForeignKeyError` (1451/1452), `isDeadlockError` (1213) ở `database/mysql-errors.ts` (chỉ đọc `errno`/`code`, không so thông điệp), không trả 500 cho lỗi đã lường trước. Đừng gắn `QueryFailedError` làm `cause` của lỗi ném ra nếu nó có thể mang tham số câu lệnh (email, băm mật khẩu). Khoá hàng chưa tồn tại bằng `SELECT … FOR UPDATE` gây khoá khoảng chỉ mục (deadlock dưới REPEATABLE READ): dùng "chèn trước, trùng thì ROLLBACK rồi làm lại" như `RegisterService`.
- **Đăng nhập (task A8 của `auth`):** `LoginService` (`auth/login/`) là mẫu cho use case phải ĐẾM hoặc GHI rồi mới trả lỗi (A11, A13 dùng lại): băm Argon2id (~20 ms) chạy NGOÀI giao dịch, không giữ khoá hàng hay kết nối; sau đó giao dịch ngắn READ COMMITTED khoá MỘT hàng `tai_khoan` rồi **kiểm lại mọi điều kiện dưới khoá** (pha đọc ngoài khoá có thể đã cũ: tài khoản vừa bị khoá, ngưng, đổi mật khẩu, được xác minh), TRẢ một kết quả có kiểu thay vì ném lỗi nghiệp vụ, và chỉ ném `AppException` SAU khi giao dịch đã commit (ném bên trong thì lần đếm đã ghi bị hoàn tác). Luật (khoá tạm nửa mở, đếm lại sau hết khoá, trạng thái mã) viết thành hàm thuần nhận `now` ở `login-rules.ts`; mọi mốc thời gian lấy từ `currentSecond()`. Chi tiết: `docs/features/auth/TRACKING.md` A8-A…A8-L.
- **Quên mật khẩu (task A11 của `auth`):** `ForgotPasswordService` (`auth/forgot-password/`) cấp mã trong `otp.transaction` (khoá hàng `tai_khoan`, KIỂM LẠI điều kiện dưới khoá, gửi thư SAU commit) và `verify-otp` KHÔNG `consume` (A12 mới tiêu thụ hàng OTP). `ResetTokenService` ký và kiểm resetToken bằng `JWT_RESET_SECRET` riêng, hạn 10 phút TỪ LÚC XÁC MINH, nửa mở; A12 dùng lại nó, đừng viết bản kiểm thứ hai. Chi tiết: `docs/features/auth/TRACKING.md` A11-A…
- **Đặt mật khẩu mới (task A12 của `auth`):** `ResetPasswordService` (`auth/forgot-password/`) là mẫu cho thao tác ghi NHIỀU bảng của một tài khoản (A13 đổi mật khẩu dùng lại nếp này): kiểm token → băm NGOÀI giao dịch → `otp.transaction` khoá `tai_khoan`, kiểm lại tư cách bằng luật thuần CÓ SẴN (`passwordResetRefusalFor`), đặt mọi nhánh từ chối TRƯỚC lần ghi đầu tiên, rồi ghi theo thứ tự khoá `tai_khoan` → `ma_xac_thuc` → `phien_dang_nhap`; lỗi bất ngờ thì cứ ném để hoàn tác trọn. Test hoàn tác cho TỪNG bước ghi (cho bước đó chạy thật rồi mới ném). Chi tiết: TRACKING A12-A…

## Frontend (React)
- Component hàm + hooks; tách UI / logic gọi API / state.
- Gọi API qua một lớp client duy nhất; không rải `fetch` khắp component.
- Xử lý đủ trạng thái biên: loading, rỗng, lỗi, mất mạng, timeout.

## Git
- Nhánh: `feat/…`, `fix/…`, `docs/…`, `chore/…`. Một PR một việc, nhỏ.
- Commit/tiêu đề PR theo Conventional Commits; scope theo `commitlint.config.cjs`.
- Không push thẳng `main`. Người review khác người viết.

## Kiểm thử
- Test đặt cạnh mã (`*.spec.ts` / `*.test.tsx`). Mỗi test case ghi mã acceptance criteria / use case mà nó phủ.
- Test cần MySQL thật (CHECK, UNIQUE, khóa hàng, múi giờ…) đặt tên `*.int-spec.ts`, chạy bằng `npm run test:int` trên DB có tên kết thúc `_test` (tự tạo/xóa), tuần tự; không mock DB cho các ràng buộc này.
- **Mọi test e2e phải dựng app qua `configureApp(app)`** (`src/app.setup.ts`): không có nó thì không có bộ lọc lỗi chuẩn hoá, `ValidationPipe` và bộ che log, và test sẽ kiểm một ứng dụng khác với ứng dụng thật.
  Kiểm mã lỗi bằng `expectErrorResponse` (`common/testing/error-assertions.ts`), không tự đọc `res.body`.
- Luôn có ca âm và ca biên (đặc biệt: đặt trùng khung giờ đồng thời, hết hạn giữ chỗ, sai quyền).
