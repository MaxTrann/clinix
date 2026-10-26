# CLINIX — hướng dẫn cho AI agent (Codex, Claude Code…)

Đồ án TLCN của nhóm 2 người: **hệ thống đặt lịch khám bệnh** (nguyên mẫu học thuật, chỉ dùng dữ liệu mẫu). Repo này là **mã nguồn**.
Mọi thành viên làm việc với AI đều đọc file này trước. Trạng thái ghi trong file là của **26/10/2026** — sửa file này khi thực tế đổi.

| Thành phần | Công nghệ |
|---|---|
| Web (`apps/web`) | React + TypeScript + Vite, Vitest |
| API (`apps/api`) | NestJS + TypeScript, TypeORM, MySQL 8.4 |
| Hạ tầng | Docker Compose, GitHub Actions, GHCR; Mobile (Flutter) làm sau |

**Trạng thái hiện tại:** `apps/api` đã khởi tạo NestJS (Vitest + oxlint + ESM) với `GET /health`; `apps/web` mới có `Dockerfile` (chưa có `package.json`, chưa có mã).
Việc khởi tạo `apps/web` nằm trong kế hoạch module `auth` (task P2). Các lệnh chạy cả hai app ở dưới (`npm run lint`, `npm test` ở gốc) chỉ chạy đủ sau khi `apps/web` được tạo.

## 1. Quy tắc cứng (vi phạm là hỏng quy trình chấm điểm của đồ án)

1. **Không chạy lệnh làm thay đổi Git**: không `git add/commit/push/merge/rebase/reset/checkout -- <file>/stash/tag`. Chỉ được đọc (`git status/diff/log/show`).
   Commit, push, mở PR, merge do **thành viên tự làm bằng tay** dưới tên mình (CONTRIBUTING mục 9). Bạn chỉ **gợi ý** nội dung commit/tiêu đề PR.
2. **Không thêm** `Co-Authored-By`, "Generated with …" hay chữ ký AI nào vào commit/PR/tài liệu.
3. **Không bao giờ ghi secret** (mật khẩu, App Password, khóa API, token) vào repo, prompt, log hay test. Repo này **công khai**. Cấu hình mới chỉ thêm tên biến
   vào `.env.example` với giá trị giả. Không `--no-verify`, không tắt hook/gitleaks.
4. **Không bịa.** Thiếu thông tin (use case, con số, quy tắc) → **hỏi người dùng** hoặc ghi `[cần điền]`; giá trị tự đề xuất ghi `[đề xuất]`.
   Không tự đoán phiên bản thư viện/GitHub Action/tag Docker — tra nguồn thật (xem mục 7).
5. **Hỏi trước khi làm việc lớn hoặc thay đổi thiết kế**; không thiết kế lại thứ đã chốt (mục 3). Không mở rộng phạm vi ngoài task đang làm.
6. Không sửa tài liệu thiết kế gốc ở repo khác (đặc tả use case 2.4 là file Word ở repo `TLCN_CLINIX`, bạn không có). Phát hiện 2.4/schema/Figma lệch với mã →
   **báo người dùng**, đừng tự chọn một bên.

## 2. Đọc gì, theo thứ tự (không đọc cả thư mục)

1. **Issue GitHub** của task (mô tả, phụ thuộc, test case liên quan, "Đóng khi") — là hợp đồng của bạn.
2. `docs/features/<module>/PLAN.md` — tìm đúng dòng task theo mã (ví dụ `B1`), đọc phần Thiết kế kỹ thuật và **đúng các test case** được dẫn.
   `docs/features/<module>/TRACKING.md` mục "Quyết định đã chốt" (Q…, S…, N…) là **quyết định cuối**, ưu tiên hơn các bảng đề xuất trong PLAN.
3. **Schema chính thức: `docs/database/`** (`clinix.dbml`, `clinix_mysql.sql`, `clinix_quy_tac_nghiep_vu.md`). Các file này **rất lớn**: tìm bằng từ khóa
   (`grep`/tìm kiếm) và chỉ đọc bảng bạn đụng tới. Khi Class Diagram hay tài liệu khác lệch với schema thì **schema DB là nguồn đúng để code**.
4. `docs/PLAN.md` (Phase 0: quyết định kỹ thuật; thứ tự phase), `docs/CODING_CONVENTION.md`, `CONTRIBUTING.md`.
5. Task phụ thuộc module khác: đọc `PLAN.md` của module đó, chỉ **tái dùng** (import qua module đã export), không sao chép/tự viết lại.

Nếu issue hoặc plan dẫn tới thứ không có trong repo (ví dụ đoạn use case 2.4, frame Figma), **hỏi người dùng dán nội dung**, đừng suy đoán.

## 3. Quyết định kỹ thuật đã chốt (nguồn đầy đủ: `docs/features/auth/TRACKING.md` mục 3 và `docs/features/admin/TRACKING.md`)

- ORM **TypeORM**, `synchronize: false`. **Migration viết tay** từ `docs/database/clinix_mysql.sql`, kiểm khớp từng dòng (CHECK, cột sinh, UNIQUE, FK, index).
- Xác thực: access JWT 15 phút (giữ trong bộ nhớ ở FE); refresh token ngẫu nhiên, lưu **băm**, xoay mỗi lần dùng, cookie `HttpOnly; Secure; SameSite=Lax`.
  Web và API **cùng origin** qua proxy (`/api/...`). Mật khẩu **Argon2id**. OTP/refresh token/liên kết kích hoạt dùng đúng loại băm đã chốt trong plan auth.
- Email: **Gmail SMTP** qua `MailService` dùng chung; **test tự động luôn mock `MailService`**, không gửi thư thật.
- Mật khẩu: 8–64 ký tự ASCII in được, ≥ 1 chữ số, ≥ 1 ký tự đặc biệt. Email: ASCII, `trim`, tên miền chữ thường. SĐT: 10 số bắt đầu bằng 0.
- Mã lỗi nghiệp vụ **ổn định** cho từng nhánh (để FE chọn đúng thông báo); không trả 500 cho lỗi UNIQUE/FK đã lường trước.
- Thời gian nghiệp vụ tính theo **giờ Việt Nam** (`nowVN()`/`todayVN()`), test dùng đồng hồ giả.
- Mọi thao tác đa bảng nằm **trong một giao dịch** ở tầng service; chống chạy đua bằng khóa hàng/ràng buộc UNIQUE, không chỉ kiểm bằng đọc-rồi-ghi.
- Chưa làm throttling theo IP (việc X3 của auth/admin, làm **trước khi mở công khai**).

## 4. Quy ước viết mã

- Định danh trong mã: tiếng Anh; comment/tài liệu: tiếng Việt **có dấu**. File `kebab-case`; Class/Component `PascalCase`; biến/hàm `camelCase`; hằng `UPPER_SNAKE_CASE`.
  Bảng/cột DB giữ đúng tên `snake_case` tiếng Việt không dấu của schema (ví dụ `tai_khoan`, `chi_nhanh`) — không đổi tên.
- TypeScript `strict`; cấm `any` không có lý do. Prettier + oxlint cho api, ESLint cho web, 0 lỗi.
- Backend: mỗi module một thư mục `controller → service → repository`; controller chỉ nhận/trả, không chứa logic. DTO + `class-validator` cho mọi dữ liệu vào.
  **Quyền và phạm vi dữ liệu kiểm ở backend** (vai trò + sở hữu + phạm vi chi nhánh), không dựa vào việc ẩn nút ở UI. Không ghi mật khẩu/token/OTP vào log.
  Mọi import tương đối trong `apps/api` phải có đuôi `.js` (dự án dùng ESM), ví dụ `import { AppModule } from './app.module.js';`.
- Frontend: component hàm + hooks; **một** lớp API client duy nhất; xử lý đủ loading/rỗng/lỗi/mất mạng/timeout; giao diện **bám đúng frame Figma**, thiếu thì hỏi.
- Test đặt cạnh mã (`*.spec.ts` / `*.test.tsx`); **mỗi test ghi mã test case** trong plan mà nó phủ. Luôn có ca âm và ca biên; endpoint mới có ca đúng/sai vai trò, đúng/sai chi nhánh;
  logic cần DB thật (CHECK, UNIQUE, khóa hàng, chạy đua) có test tích hợp trên MySQL thật.
- **Viết đơn giản, dễ đọc**, thêm comment tiếng Việt ngắn ở chỗ lý do không hiển nhiên. Người dùng phải **tự giải thích được mọi dòng** khi vấn đáp (rubric mục 6): khi xong việc,
  tóm tắt cách chạy và lý do thiết kế các điểm khó để họ học được.

## 5. Quy trình cho MỘT task (một task = một PR nhỏ)

1. Đọc issue + dòng task trong plan + test case liên quan. Kiểm **phụ thuộc đã merge chưa**; chưa thì nói rõ và chỉ làm phần độc lập (nhãn "SOẠN TRƯỚC" trong plan).
2. Nhánh do người dùng tạo, tên `feat/<module>-<việc>` / `fix/…` / `docs/…` / `chore/…`. Không làm trên `main`.
3. Viết test theo các mã test case → code → chạy `lint`, `build`, `test` ở máy. Báo kết quả **thật** (kể cả khi đỏ); không tuyên bố xong khi chưa chạy.
4. Task có thẻ **`[ĐỒNG BỘ TL]`**: sửa tài liệu trong **cùng PR** — với DB là sửa **cả ba** file `docs/database/*` cho khớp nhau; 2.4/Figma thì nhắc người dùng làm.
5. Cập nhật `docs/features/<module>/TRACKING.md` (ngày, việc, mã test case, pass/fail, vấn đề). Khi cả module xong mới thêm **một** dòng vào `docs/TRACKING.md`.
6. Cấu hình mới → `.env.example`. Lối tắt kỹ thuật → `docs/TECH_DEBT.md`.
7. **`AI_USAGE_LOG.md`**: người dùng ghi một dòng (bảng 1) cho mỗi lần dùng AI có ảnh hưởng repo — công cụ ghi đúng tên (ví dụ "Codex" kèm model), người dùng là chính họ; lỗi AI
   phát hiện ghi bảng 2 kèm mã `AI-BUG-nnn` trong commit sửa. Bạn **nhắc** và có thể soạn nháp dòng này; **chỉ sửa file khi người dùng đồng ý**.
8. Cuối phiên, báo: file đã đổi, test đã chạy và kết quả, tài liệu đã/chưa đồng bộ, câu hỏi còn mở, **gợi ý** tiêu đề commit/PR.

**Commit/PR:** Conventional Commits, tiêu đề PR = commit cuối (squash). Ví dụ `feat(admin): thêm quản lý chuyên khoa`. Scope hợp lệ (`commitlint.config.cjs`):
`auth patient search doctor booking payment wallet waitlist followup notification admin rbac audit import-export report ai api web mobile db ci docker docs deps repo`.
Tiêu đề ≤ 100 ký tự. PR cần **người còn lại approve** và CI xanh (check bắt buộc hiện tại: `detect`, `pr-title`, `secrets`, `security`; `api`/`web`/`docker` sẽ bật sau task P7 của auth).

## 6. Phân công và chỗ dùng chung

- **Đại (`MaxTrann`)**: module `auth` (milestone `auth`). **Trung (`junUTE`)**: module `admin`, lát cắt đầu là milestone `catalog`. Mỗi người làm **trọn module** (backend + frontend).
- Đừng sửa file thuộc module của người kia nếu không cần; cần thì nói trước. Chỗ **dùng chung dễ xung đột**: `docs/database/*`, `.env.example`, `docker-compose*.yml`,
  `.github/workflows/*`, `apps/web/nginx.conf`, `package.json`/lock. Giữ PR nhỏ, `git pull` bản mới trước khi bắt đầu, và báo người kia khi đổi các file này.
- Phối hợp thứ tự migration/đổi schema với `auth` (plan admin mục 3.3, 6.6).

## 7. Những lỗi AI đã từng mắc ở repo này (đừng lặp lại)

- Dùng `hashFiles()` ở điều kiện **cấp job** trong GitHub Actions → workflow bị từ chối, 0 job (chỉ dùng được ở cấp step) — AI-BUG-001.
- Ghi version GitHub Action/tag không tồn tại theo trí nhớ (`trivy-action@0.28.0`) → tra danh sách release thật — AI-BUG-002.
- Hook husky gọi `npx` chạy lỗi trên Windows (`'"node"' is not recognized`) → gọi thẳng `commitlint --edit "$1"` — AI-BUG-003.
- Kiểm bằng cách chỉ đọc cú pháp rồi báo "xong": **phải chạy thật** (lint/build/test/compose) và báo đúng kết quả.

## 8. Môi trường và lệnh

Windows 11; PowerShell hoặc Git Bash; Node ≥ 20 (khuyến nghị 22); Docker Desktop. Đường dẫn có thể chứa dấu tiếng Việt — luôn bọc nháy kép. File văn bản mã hóa UTF-8;
Git đang bật `core.autocrlf=true` — **không chuyển hàng loạt kiểu xuống dòng** của file có sẵn (làm diff phình toàn file).

```bash
npm install                    # ở gốc repo: cài husky + commitlint và kích hoạt hook
cp .env.example .env           # điền giá trị giả/dev; KHÔNG commit .env
docker compose up --build      # db + api + web (sau khi hai app được khởi tạo)
npm run lint ; npm test        # chạy lint/test của apps/api và apps/web
npm run secrets                # gitleaks (cần cài gitleaks)
npm run dup                    # jscpd, trùng lặp ≤ 3%
```
Chi tiết cài đặt cho thành viên mới: `docs/DEV_SETUP.md`. Quy trình PR/tiêu chuẩn chất lượng: `CONTRIBUTING.md`, `README.md`.
