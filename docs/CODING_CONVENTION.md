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
- **Cấu trúc module `auth`** (`apps/api/src/auth/`): ở gốc chỉ có `auth.module.ts` và `auth.constants.ts`; controller/service của từng use case sẽ đặt theo quyết định
  khi làm A5–A13 (chưa chốt tên file). File còn lại nằm trong thư mục theo nhóm: `password/` (băm Argon2id, chính sách mật khẩu và bộ vector dùng chung FE/BE),
  `validation/` (chuẩn hoá và kiểm email, SĐT, mã lỗi đầu vào), `session/` (access token, phiên đăng nhập, cookie refresh), `guards/`, `repositories/`, `dto/`, `entities/`,
  `testing/` (mã hỗ trợ test dùng chung); `otp/` và `decorators/` chưa có, sẽ thêm khi có file đầu tiên.
  File mới đặt theo nhóm: OTP vào `otp/`, guard vào `guards/`, decorator vào `decorators/`, repository vào `repositories/` (mỗi bảng một file, ví dụ `phien-dang-nhap.repository.ts`),
  DTO vào `dto/`, entity vào `entities/`. Chỉ tạo thư mục khi có file đầu tiên (không tạo thư mục rỗng); test đặt cạnh mã nó kiểm;
  module khác dùng thứ của `auth` qua các provider mà `AuthModule` export.
- **Xác thực mặc định (task A4 của `auth`):** mọi controller mặc định cần đăng nhập (`JwtAuthGuard` và `RolesGuard` là guard toàn cục trong `AuthModule`); mở route công khai bằng `@Public()`, giới hạn vai trò bằng `@Roles(...)`, lấy người dùng bằng `@CurrentUser()` (cả ba nằm ở `auth/decorators/`).
- **Lỗi có mã ổn định (task P5 của `auth`):** ném lỗi nghiệp vụ đã lường trước bằng `throw new AppException(409, 'YEU_CAU_DANG_CHO', { thongBao, loi, chiTiet })` (`common/errors/app.exception.ts`;
  mã viết `HOA_GACH_DUOI`, chỉ 4xx). Đừng ném `BadRequestException('câu tự do')`: câu tự do bị bỏ khi trả ra ngoài. `message` của decorator class-validator đặt bằng **mã** (như `VALIDATION_CODES`).
  Mọi lỗi API có dạng `{ maLoi, thongBao, loi?, chiTiet?, requestId? }` (PLAN auth mục 5.5); lỗi ngoài dự kiến là 500 `LOI_HE_THONG` kèm `requestId`, stack chỉ nằm trong log.
- **Log:** dùng `Logger` của Nest (đi qua bộ che mật khẩu, token, OTP, mã băm), không dùng `console.*`. Không bật `logging` của TypeORM: logger riêng của nó dùng `console`, không đi qua bộ che.
- **Gửi email (task P4 của `auth`):** import `MailModule` rồi `@Inject(MailService)` (`src/mail/`); chỉ gọi `await mail.send({ to, subject, text })` với `to` đã chuẩn hoá bằng chính sách email của auth (A1). `send` resolve khi và chỉ khi máy chủ SMTP đã nhận thư; lỗi là `MailSendError` (không phải `AppException`, nơi gọi tự đổi sang mã lỗi API). Không tạo transport `nodemailer` riêng, không truyền `bcc` hay header, không log địa chỉ, tiêu đề, nội dung hay OTP. Mẫu OTP: `renderOtpMail` (`mail/templates/otp-mail.ts`). Test tự động dùng `FakeMailService` (`mail/testing/`), không bao giờ gửi thật.

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
