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
- Mật khẩu băm bằng Argon2id hoặc bcrypt.
- Mọi import tương đối trong `apps/api` phải có đuôi `.js` (dự án dùng ESM), ví dụ `import { AppModule } from './app.module.js';`.
- TypeORM luôn `synchronize: false`; schema chỉ đổi bằng **migration viết tay** trong `src/database/migrations/`, đăng ký vào mảng `MIGRATIONS` (và entity vào `ENTITIES`) — không dùng glob.
  Sửa schema thì sửa **cả ba** file `docs/database/*` trước, rồi viết migration khớp từng dòng (test `schema-parity.int-spec.ts` kiểm điều này).
- Cột `bigint`/`decimal` trả về **chuỗi** (không mất độ chính xác); quan hệ hai chiều giữa các entity dùng `import type` + `Relation<>` để không vòng import khi chạy ESM.

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
- Luôn có ca âm và ca biên (đặc biệt: đặt trùng khung giờ đồng thời, hết hạn giữ chỗ, sai quyền).
