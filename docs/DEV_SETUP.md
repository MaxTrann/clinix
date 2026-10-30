# Hướng dẫn clone và chạy repo (cho thành viên mới)

Dành cho thành viên đã được mời làm **Collaborator** trên GitHub, muốn đưa code về máy để bắt đầu làm việc.
Nếu bạn là người *tạo* repo lần đầu (tạo ruleset, tạo `apps/api`/`apps/web`...), xem [`REPO_SETUP.md`](REPO_SETUP.md) thay vì file này.

> **Trạng thái hiện tại (26/10/2026):** `apps/api` (NestJS) và `apps/web` (React + Vite) đã được khởi tạo. API đã nối MySQL và có migration cho 5 bảng
> của module `auth`; web mới có trang placeholder. Các lệnh bên dưới chạy được đủ.

## 0. Cài đặt trước khi bắt đầu

| Công cụ | Vì sao cần | Ghi chú |
|---|---|---|
| [Git](https://git-scm.com/) | Clone, commit, push | Trên Windows nên cài kèm Git Bash |
| [Node.js 22](https://nodejs.org/) (LTS) | Chạy `npm install`, hook, lint sau này | Khuyến nghị cài qua `nvm-windows` để dễ đổi version |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Chạy `docker compose up` | Windows cần bật WSL2 |
| VS Code (khuyến nghị) | Editor chung của nhóm | Cài thêm extension ESLint, Prettier |
| Tài khoản GitHub | Đã **chấp nhận lời mời Collaborator** | Kiểm tra tại `github.com/notifications` hoặc mở thẳng `https://github.com/MaxTrann/clinix` |

## 1. Clone repo

```powershell
cd D:\du_lieu        # hoặc thư mục bạn muốn chứa code
git clone https://github.com/MaxTrann/clinix.git
cd clinix
```

Lần đầu `git clone`/`git push`, Windows có thể bật cửa sổ đăng nhập GitHub (Git Credential Manager) — đăng nhập bằng trình duyệt là được.

## 2. Khai báo danh tính Git **cho riêng repo này**

```powershell
git config user.name "Tên của bạn"
git config user.email "email-gắn-với-GitHub-của-bạn"
```

Không dùng `--global` để không ảnh hưởng tới các repo khác trên máy bạn. **Email phải trùng email đã gắn với tài khoản GitHub** (hoặc email `noreply` riêng mà GitHub cấp) — sai email thì commit vẫn lên được nhưng không hiện avatar và không tính là đóng góp của bạn.

## 3. Cài công cụ dùng chung + kích hoạt hook

```powershell
npm install
```

Lệnh này cài husky + commitlint ở gốc repo, và **tự kích hoạt hook** `commit-msg`/`pre-commit` (nhờ script `prepare` trong `package.json`). Không chạy lệnh này thì hook không hoạt động — tin nhắn commit sai chuẩn sẽ không bị chặn ở máy bạn (vẫn bị CI chặn sau khi push, nhưng phát hiện muộn hơn).

Kiểm tra hook đã kích hoạt:

```powershell
git config core.hooksPath
```

Phải ra `.husky/_`.

## 4. Tạo file `.env`

```powershell
Copy-Item .env.example .env
```

Mở `.env` vừa tạo, điền giá trị thật (hỏi Đại nếu chưa biết giá trị dùng chung của nhóm là gì). **Không bao giờ commit file `.env`** — nó đã bị `.gitignore` chặn, đừng tìm cách ép thêm vào.

### 4.1 Khoá ký token đăng nhập và cấu hình cookie (từ task A3 của module `auth`)

API **từ chối khởi động** nếu thiếu hoặc sai các biến sau (thông báo lỗi chỉ nêu tên biến, không in giá trị):

| Biến | Quy tắc |
|---|---|
| `JWT_ACCESS_SECRET` | Khoá ký access token. Tối thiểu 32 ký tự |
| `JWT_REFRESH_SECRET` | Khoá ký refresh token. Tối thiểu 32 ký tự và **khác** `JWT_ACCESS_SECRET` |
| `COOKIE_SECURE` | Mặc định `true`. Chỉ được đặt `false` khi `NODE_ENV=development` (mặc định của API khi chạy cục bộ); ở staging/production đặt `false` thì API không khởi động |
| `WEB_ORIGIN` | Origin của web dạng `http://localhost:5173` (không có đường dẫn, không dấu `/` cuối). Staging đặt thành địa chỉ web thật, dùng `https` |

Hai khoá trong `.env.example` chỉ là chuỗi **giả** để chạy thử. Muốn dùng khoá riêng của bạn, sinh chuỗi ngẫu nhiên (chạy hai lần, mỗi khoá một giá trị) rồi dán vào `.env`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**Nếu `.env` của bạn có từ trước task A3** (hai dòng `JWT_*` cũ rất ngắn như `change_me_access`), `docker compose up` và `npm run start:dev` sẽ dừng với lỗi `JWT_ACCESS_SECRET must be longer than or equal to 32 characters`. Cách sửa một lần: mở `.env`, thay giá trị hai dòng `JWT_ACCESS_SECRET` và `JWT_REFRESH_SECRET` bằng hai chuỗi khác nhau dài ≥ 32 ký tự (copy hai dòng mới từ `.env.example` hoặc dùng lệnh trên). Nếu thiếu `WEB_ORIGIN` thì thêm `WEB_ORIGIN=http://localhost:5173`. Không cần thêm `COOKIE_SECURE` (mặc định đã là `true`).

Test tự động (`npm test`, `test:int`, `test:e2e`) dùng khoá **giả cố định** trong mã test, không đọc `JWT_*` từ `.env` của bạn nên không phải cấu hình gì thêm. File `.env` trên server staging (`docker-compose.staging.yml` đọc cùng tên biến) phải được bổ sung các biến trên bằng tay.

### 4.2 Gửi email OTP qua Gmail SMTP (từ task P4 của module `auth`)

API gửi email mã OTP (đăng ký, quên mật khẩu) bằng **Gmail SMTP** qua biến môi trường. Test tự động (`npm test`, `test:int`, `test:e2e`) **không bao giờ gửi thật**: chúng ép các biến email về rỗng và dùng `MailService` giả, kể cả khi máy bạn đã có `SMTP_*`.

| Biến | Ý nghĩa | Dev, test | Staging, production |
|---|---|---|---|
| `SMTP_HOST` | Máy chủ SMTP, với Gmail là `smtp.gmail.com` (chỉ tên máy chủ, không kèm cổng) | tuỳ chọn | **bắt buộc** |
| `SMTP_USER` | Địa chỉ Gmail riêng của dự án | tuỳ chọn | **bắt buộc** |
| `SMTP_PASS` | Mật khẩu ứng dụng (App Password) của tài khoản đó | tuỳ chọn | **bắt buộc** |
| `SMTP_PORT` | Mặc định 465 | 465 | 465 |
| `MAIL_FROM_NAME` | Tên hiển thị người gửi, mặc định `CLINIX` | | |
| `MAIL_FROM_ADDRESS` | Địa chỉ người gửi; bỏ trống thì dùng `SMTP_USER` | | |
| `MAIL_SUPPORT_ADDRESS` | Địa chỉ hỗ trợ in trong thư; bỏ trống thì thư bỏ dòng hỗ trợ | | |

- **Không cần sửa `.env` hiện có** nếu bạn chưa muốn gửi thư thật: bỏ trống cả ba biến `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (hoặc không có chúng) thì API vẫn khởi động, chỉ các chức năng gửi email báo lỗi. Đặt **nửa vời** (có `SMTP_USER` mà thiếu `SMTP_PASS`…) thì API không khởi động; thông báo lỗi chỉ nêu tên biến, không in giá trị.
- **Staging và production** (`NODE_ENV=staging` hoặc `production`, ảnh `prod` mặc định là `production`) **bắt buộc** đủ ba biến; thiếu thì API dừng ngay lúc khởi động. File `.env` trên server staging phải được bổ sung bằng tay (xem `docs/TECH_DEBT.md` dòng 19).
- **Cổng:** 465 là TLS ngay từ đầu (khuyến nghị); cổng khác (ví dụ 587) bắt buộc STARTTLS, nếu máy chủ không hỗ trợ thì gửi lỗi chứ **không** tự hạ xuống gửi dạng rõ. Không có chế độ không mã hoá, nên không dùng được SMTP cục bộ dạng rõ (Mailpit và tương tự), đúng quyết định Q3. Chứng chỉ của máy chủ luôn được kiểm.

**Tạo Gmail riêng và mật khẩu ứng dụng** (việc của nhóm, N8; thao tác trên giao diện Google, các bước dưới viết theo cách Google mô tả **[cần kiểm khi tạo Gmail thật, N8]** — giao diện có thể khác, hãy sửa tài liệu này nếu lệch):

1. Tạo **một tài khoản Gmail riêng cho CLINIX**, không dùng Gmail cá nhân.
2. Bật **Xác minh 2 bước** cho tài khoản đó (Tài khoản Google → Bảo mật).
3. Tạo **Mật khẩu ứng dụng** (App Password) trong mục Xác minh 2 bước. Google chỉ hiện giá trị này một lần.
4. Mở `.env` của bạn (**không phải** `.env.example`) và điền: `SMTP_HOST=smtp.gmail.com`, `SMTP_USER=<địa chỉ Gmail>`, `SMTP_PASS=<mật khẩu ứng dụng>`.
5. **Gõ mật khẩu ứng dụng liền 16 ký tự, không dấu cách** (Google hiển thị thành 4 nhóm cách nhau; bỏ các dấu cách) **[cần kiểm khi tạo Gmail thật, N8: Google có chấp nhận dạng có dấu cách hay không]**. Lý do thêm: bộ che log chỉ che đúng giá trị có trong `.env`.
6. Hai người dùng chung một hộp thư thì chia sẻ mật khẩu ứng dụng qua kênh riêng tư (tin nhắn trực tiếp hoặc trình quản lý mật khẩu).

> **Tuyệt đối không dán mật khẩu ứng dụng vào chat (kể cả khi trò chuyện với AI), issue, PR, commit hay bất kỳ file nào trong repo.** Repo này công khai. Nếu lỡ lộ: vào Tài khoản Google, thu hồi mật khẩu ứng dụng đó ngay và tạo cái mới.

Giới hạn cần biết (H11): Gmail có hạn mức gửi hằng ngày; thư có thể vào hộp spam; Google có thể chặn đăng nhập từ IP máy chủ lạ. Việc gửi thật cả hai loại OTP (và đường gửi lỗi bằng cách đặt sai mật khẩu ứng dụng) được kiểm tay ở task X1.
### 4.3 Khoá HMAC của mã OTP (từ task A2 của module `auth`)

API lưu mã OTP dưới dạng **HMAC-SHA-256** với một khoá riêng, không lưu mã rõ. Khoá lấy từ biến `OTP_HMAC_SECRET`:

| Môi trường (`NODE_ENV`) | Quy tắc |
|---|---|
| `development` (mặc định khi chạy cục bộ) | **Bỏ trống được.** API dùng một khoá ngẫu nhiên cho lần khởi động đó và ghi một cảnh báo (cảnh báo không in khoá) |
| `test` | **Bắt buộc**, nhưng test tự động dùng khoá cố định trong mã test (`TEST_AUTH_ENV`), không đọc từ `.env` của bạn |
| `staging`, `production` | **Bắt buộc.** Thiếu thì API **không khởi động**; thông báo lỗi chỉ nêu tên biến, không in giá trị |

- Khi đặt: tối thiểu **32 ký tự** và **khác** `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (mỗi loại bí mật một khoá). Sinh chuỗi ngẫu nhiên bằng lệnh ở mục 4.1.
- **Ở development, mỗi lần API khởi động lại (kể cả `start:dev` tự tải lại khi bạn lưu file) thì mọi mã OTP đang chờ mất hiệu lực**: nhập mã vừa nhận sẽ báo sai, bạn phải bấm "Gửi lại mã". Muốn mã OTP còn dùng được sau khi khởi động lại thì **đặt `OTP_HMAC_SECRET` trong `.env`**.
- Đổi giá trị khoá cũng làm các mã OTP đang chờ (hiệu lực 10 phút) mất hiệu lực; không ảnh hưởng gì khác.
- Giá trị khoá không bao giờ được ghi vào log: tên biến khớp quy tắc che log của P5 (`SECRET`). Đừng dán khoá vào chat, issue, PR hay repo.
- `.env` cũ của bạn **không cần sửa** nếu bạn chạy ở development: API vẫn khởi động. Staging/production phải thêm biến này vào `.env` trên server (`docs/TECH_DEBT.md` dòng 19).

### 4.4 Khoá ký resetToken của Quên mật khẩu (từ task A11 của module `auth`)

Sau khi nhập đúng mã OTP quên mật khẩu, API cấp một `resetToken` (JWT, hiệu lực 10 phút kể từ lúc xác minh) cho bước đặt mật khẩu mới. Token ký bằng `JWT_RESET_SECRET`, một khoá **riêng** với hai khoá JWT và khoá HMAC của OTP:

| Môi trường (`NODE_ENV`) | Quy tắc |
|---|---|
| `development` (mặc định khi chạy cục bộ) | **Bỏ trống được.** API dùng một khoá ngẫu nhiên cho lần khởi động đó và ghi một cảnh báo (cảnh báo không in khoá) |
| `test` | **Bắt buộc**, nhưng test tự động dùng khoá cố định trong mã test (`TEST_AUTH_ENV`), không đọc từ `.env` của bạn |
| `staging`, `production` | **Bắt buộc.** Thiếu thì API **không khởi động** (lệnh `migrate` trên server cũng dừng vì dùng chung bước kiểm tra cấu hình); thông báo lỗi chỉ nêu tên biến, không in giá trị |

- Khi đặt: tối thiểu **32 ký tự** và **khác** `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `OTP_HMAC_SECRET` (mỗi loại bí mật một khoá). Sinh chuỗi ngẫu nhiên bằng lệnh ở mục 4.1.
- **Ở development, mỗi lần API khởi động lại thì mọi `resetToken` đang giữ mất hiệu lực** (tối đa 10 phút): bạn phải nhập lại mã OTP. Muốn ổn định thì **đặt `JWT_RESET_SECRET` trong `.env`**.
- Đổi giá trị khoá chỉ làm các `resetToken` đang giữ mất hiệu lực, không ảnh hưởng gì khác.
- Giá trị khoá không bao giờ được ghi vào log: tên biến khớp quy tắc che log của P5 (`SECRET`). Đừng dán khoá vào chat, issue, PR hay repo.
- `.env` cũ của bạn **không cần sửa** nếu bạn chạy ở development. Staging/production phải thêm biến này vào `.env` trên server (`docs/TECH_DEBT.md` dòng 19).

## 5. Chạy thử môi trường

```powershell
docker compose up --build
```

Chạy đủ 3 service: Web (http://localhost:5173), API (http://localhost:3000, thử `http://localhost:3000/health`) và MySQL (`localhost:3306`). Lần đầu mất vài phút vì build image và `npm ci`.
Chỉ cần cơ sở dữ liệu (ví dụ để chạy test tích hợp trên máy): `docker compose up -d db`.

### 5.1 Cơ sở dữ liệu: migration và múi giờ

- Schema do **migration viết tay** quản lý (TypeORM không tự đồng bộ, `synchronize: false`); nguồn gốc là `docs/database/clinix_mysql.sql`. Trong `.env.example`, `DB_MIGRATIONS_RUN=true`
  nên **API tự áp các migration chưa chạy mỗi lần khởi động** (chỉ để tiện khi phát triển; mặc định trong mã là `false`). Chạy tay bằng lệnh trong container `api`:

  ```powershell
  docker compose exec api npm run migration:status   # liệt kê migration: [x] đã chạy, [ ] chưa
  docker compose exec api npm run migration:run      # áp dụng migration chưa chạy
  docker compose exec api npm run migration:revert   # hoàn tác MỘT migration cuối cùng
  ```

  Cần xóa sạch dữ liệu dev và dựng lại từ đầu: `docker compose down -v` (xóa volume `db-data`) rồi `docker compose up --build`.
- **Múi giờ nghiệp vụ là giờ Việt Nam (`+07:00`)**: `TZ=Asia/Ho_Chi_Minh` được truyền vào API và container `db`; API xác thực và áp dụng TZ lúc khởi động.
  `DB_TIMEZONE` cấu hình driver và API chạy `SET time_zone` cho **mỗi** kết nối MySQL (xem `apps/api/src/database/data-source.ts`). Nhờ vậy `NOW()`/`DEFAULT CURRENT_TIMESTAMP`
  của DB cùng mốc giờ với ngày và thứ ứng dụng tính, kể cả khi MySQL chạy ở máy khác không đặt múi giờ.
- Đổi schema: sửa **cả ba** file `docs/database/*` trước, rồi viết migration mới khớp từng dòng và đăng ký vào `apps/api/src/database/migrations/index.ts`
  (xem `docs/CODING_CONVENTION.md`).

### 5.2 Test tích hợp và e2e của API (cần MySQL thật)

```powershell
docker compose up -d db          # MySQL của compose, cổng 3306
cd apps/api
npm run test:int                 # *.int-spec.ts: migration, ràng buộc CHECK/UNIQUE/FK, múi giờ…
npm run test:e2e                 # AppModule + MySQL thật
```

- Hai lệnh tự đọc `.env` ở gốc repo: dùng `TEST_DB_HOST/PORT/USER/NAME` (mặc định `127.0.0.1:3306`, user `root`, DB `clinix_test`) và mật khẩu `TEST_DB_PASSWORD`, nếu không đặt thì lấy `MYSQL_ROOT_PASSWORD`.
- Test **xóa và tạo lại** các DB `clinix_test`, `clinix_ref_test`, `clinix_migration_test`; tên DB test bắt buộc viết thường và kết thúc `_test` (mã từ chối chạy với tên khác) nên **không bao giờ đụng DB dev `clinix`**.
- Chạy tuần tự (không song song) vì các file dùng chung một DB test. Trên CI, job `api` có service MySQL 8.4 riêng và chạy cả hai lệnh này.

## 6. Quy trình làm việc hằng ngày

Tóm tắt — đọc đầy đủ ở [`CONTRIBUTING.md`](../CONTRIBUTING.md):

```powershell
git checkout main
git pull
git checkout -b feat/ten-viec          # hoặc fix/..., docs/..., chore/...

# ... sửa code ...

git add <file>
git commit -m "feat(booking): mô tả ngắn gọn"   # hook tự kiểm tin nhắn + secret
git push -u origin feat/ten-viec
```

Rồi mở Pull Request trên GitHub (điền theo mẫu có sẵn), nhờ người còn lại **Review → Approve**, bạn bấm **Squash and merge**. Sau khi merge:

```powershell
git checkout main
git pull
git branch -d feat/ten-viec
```

**Không bao giờ push thẳng vào `main`** — ruleset sẽ từ chối, đây là chủ đích chứ không phải lỗi.

## 7. Lệnh kiểm tra trước khi push (chạy ở gốc repo)

```powershell
npm run lint      # lint apps/api và apps/web
npm test          # test đơn vị của hai app (test tích hợp/e2e của API chạy riêng, xem mục 5.2)
npm run dup       # jscpd — kiểm mã trùng lặp (trên Windows có thể quét 0 file, xem docs/TECH_DEBT.md dòng 5)
npm run secrets   # gitleaks — cần cài gitleaks trước, xem bên dưới
```

Cài gitleaks (khuyến nghị để phát hiện secret sớm trên máy; không bắt buộc, CI vẫn tự quét):

```powershell
winget install gitleaks
```

## 8. Lỗi thường gặp

| Hiện tượng | Nguyên nhân | Xử lý |
|---|---|---|
| `git push` bị từ chối, bắt tạo Pull Request | Ruleset chặn push thẳng `main` — đúng như thiết kế | Tạo nhánh, mở PR như mục 6 |
| Hook chặn commit, báo `type may not be empty` | Tin nhắn commit sai chuẩn Conventional Commits | Xem `CONTRIBUTING.md` mục 2, viết lại dạng `loại(phạm vi): mô tả` |
| `npm install` xong mà hook không chạy | `core.hooksPath` chưa được set | Chạy lại `npm run prepare`, kiểm tra lại bằng lệnh ở mục 3 |
| Commit không bị chặn dù biết sai chuẩn | Có thể đã cài `node_modules` cũ hoặc dùng `--no-verify` | Xóa `node_modules`, chạy lại `npm install`; đừng dùng `--no-verify` |

## 9. Đọc thêm

- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — 9 quy tắc làm việc bắt buộc
- [`docs/CODING_CONVENTION.md`](CODING_CONVENTION.md) — quy ước viết mã
- [`docs/REPO_SETUP.md`](REPO_SETUP.md) — cách tạo `apps/api`/`apps/web` lần đầu (nếu bạn là người làm việc đó)
- [`AI_USAGE_LOG.md`](../AI_USAGE_LOG.md) — ghi lại **mọi lần dùng AI hỗ trợ code**, ngay khi dùng, không viết bù cuối kỳ


## Ảnh chuyên khoa Cloudinary — Admin P7

1. Dùng tài khoản Cloudinary thử nghiệm của nhóm; tự điền CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET vào .env local hoặc môi trường API. Không commit/chia sẻ giá trị secret. CLOUDINARY_UPLOAD_PREFIX trống dùng clinix/<NODE_ENV>/specialties, hoặc đặt prefix riêng dạng a/b/c (không traversal).
2. Dev/test có thể bỏ trống cả ba credential: API vẫn khởi động, chức năng upload trả 503 LOI_HE_THONG kèm requestId. Cấu hình dở dang hoặc staging/production thiếu credential làm API dừng với tên biến thiếu. Test tự động ép credential rỗng, chỉ dùng fake provider.
3. Sau khi review migration, người dùng áp dụng migration mới theo quy trình DB của nhóm; lần triển khai P7 không tự chạy lên DB dev/chia sẻ. Migration bổ sung bảng anh_tai_len và FK ảnh nullable vào chuyen_khoa, giữ URL cũ. Không DROP/đổi ý nghĩa dữ liệu ảnh cũ; down bị chặn nếu ledger còn dữ liệu.
4. API nội bộ: POST /admin/uploads/specialty-image, Bearer access token, multipart trường file. Auth P6 chịu phần proxy /api; API không tự thêm global prefix, /health giữ nguyên. Chỉ Admin Toàn hệ thống, đúng một ảnh tĩnh JPEG/PNG/WebP ≤10 MB/25 MP. Thành công 201: { uploadId, url, expiresAt }. Không cần volume ảnh hoặc Nginx /uploads.
5. ≤2 MB không chủ động resize/nén; ảnh lớn nén trước/resize khi cần xuống ≤2 MB, mục tiêu mềm 700–800 KB. Chuẩn hóa EXIF/loại metadata riêng tư, giữ alpha. Cấu hình chất lượng/timeout/giới hạn tài nguyên là policy typed trong upload-policy.ts, không cần thêm nhiều biến env.
6. B1 gọi UploadRepository.assignSpecialty trong CÙNG giao dịch lưu chuyên khoa, sau khi kiểm quyền của B1; bỏ imageUploadId khi PATCH = giữ, null = gỡ, UUID = gắn/thay. Kiểm chủ/mục đích/xác nhận/hạn/trạng thái và khóa hàng. Đọc URL qua JOIN ledger, fallback anh_dai_dien chỉ khi FK NULL; khi chủ động thay/gỡ sẽ xóa URL cũ để không hiện lại. B1/F2 chưa triển khai trong P7; F2 preview URL kết quả và timeout dự kiến 60 giây.
7. Cleanup chạy mỗi giờ trong API, tối đa 50 ảnh/lượt; chỉ ảnh đã xác nhận và không còn tham chiếu, lease DB 5 phút. Thử xóa lỗi tối đa 5 lần; không gắn lại ChoXoa. Bản ghi ma_loi_cuoi=UPLOAD_CAN_KIEM_TRA hoặc upload_xac_nhan_luc NULL cần đối soát thủ công, không tự xóa chỉ vì chưa thấy ảnh một lần. Kiểm tra thủ công bằng public_id trong đúng cloud/prefix; không tự xóa ảnh đang dùng. Không coi CDN invalidation là tức thời.
8. Kiểm thử: trong apps/api chạy npm run test:p7 để TẠO DB test mới có timestamp và DB tham chiếu riêng, không reset DB cũ; cần MySQL và TEST_DB_* phù hợp. Không dùng cấu hình DB chia sẻ cho thao tác test. DB mới được giữ lại nếu dùng MySQL của mình; tự dọn sau khi xem evidence. npm run test:int là bộ chuẩn có DROP/recreate DB test, cần cho phép trước khi dùng trên môi trường hiện có.
9. Dependency mới pin sharp 0.35.5/cloudinary 2.11.0/@nestjs/schedule 12.0.2. Sharp có binary theo nền tảng: chạy npm ci ở đúng Windows hoặc Linux/Docker, không copy node_modules từ Windows sang container.

Kiểm thủ công còn cần: credential thử nghiệm → upload thật → preview/lưu/thay/gỡ qua B1/F2 → xác minh cleanup. Không dùng ảnh bệnh nhân thật hoặc in file/token/credential vào log. Local test không thay cho acceptance UI hoặc 7 CI check của PR.

## Seed catalog, tài khoản mẫu và Admin đầu tiên — C5

Bốn script chạy trong `apps/api`; cần Node/dependencies hiện có, MySQL đã áp dụng các migration hiện hành. Script build rồi chạy CLI độc lập, không khởi động API/scheduler, không gửi email hay upload ảnh. CLI **không tự chạy migration**, không tự đọc file `.env`: truyền env của tiến trình hoặc chạy trong container API đã có env. Trong Docker cần build/recreate image chứa code C5 trước; chỉ thực hiện khi người phụ trách cho phép. API đang chạy không tự thêm các biến seed mới vào container.

Thiết lập DB_HOST, DB_PORT, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD cho **DB đã được phép ghi**. DB_TIMEZONE chỉ nhận +07:00; TZ chỉ nhận Asia/Ho_Chi_Minh nếu đặt. NODE_ENV nhận development/test/staging/production, mặc định development giống API; không được bỏ/sửa NODE_ENV để lách chặn production. Chỉ dev/test/demo có chủ đích dùng dữ liệu mẫu; tên tham số production không phải cơ chế phân quyền DB.

### Thứ tự và cách chạy

Từ `apps/api`, sau khi thiết lập env cục bộ (không gửi mật khẩu lên chat hoặc lưu vào command/history):

```powershell
npm run seed:first-admin
npm run seed:catalog
npm run seed:config-dev
npm run seed:dev-accounts
```

- `first-admin` là lựa chọn bootstrap, có thể chạy độc lập với catalog. Bắt buộc SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_FULL_NAME, SEED_ADMIN_PHONE; dùng validator auth và Argon2id. Tạo DangHoatDong/đã xác minh/ToanHeThong, chi_nhanh_id NULL. Được phép production; nếu đã có bất kỳ Admin ToanHeThong (kể cả ngừng hoạt động), từ chối. Không dùng lệnh này để reset hoặc tạo Admin thứ hai.
- `catalog` và `config-dev` độc lập nhau; `dev-accounts` yêu cầu catalog đã có. Nếu cần dùng cả first-admin lẫn dev-accounts, bootstrap trước: dev-accounts cũng tạo một Admin ToanHeThong nên chạy nó trước sẽ làm first-admin từ chối.
- `dev-accounts` bắt buộc SEED_DEV_PASSWORD từ env, đúng policy auth; không có mật khẩu fallback. Chỉ năm tài khoản demo dùng chung mật khẩu này. Mật khẩu 8–64 ký tự ASCII in được, có chữ số và ký tự đặc biệt; không tự trim.
- Ba seed mẫu từ chối khi NODE_ENV=production, trước khi kết nối DB. Không đổi env production sang development để chạy mẫu.
- Với container đã có đủ code/env, lệnh tương đương là `docker compose exec api npm run seed:catalog` (thay suffix cho ba lệnh còn lại). CLI đọc env của container; tên biến mới trong `.env` không tự xuất hiện trong container đã chạy.

### Dữ liệu minh họa đã duyệt, chưa đối chiếu Figma

Catalog: 8 chuyên khoa (Cơ Xương Khớp, Thần kinh, Tiêu hóa, Nội tổng quát, Y học gia đình, Tâm thần, Tim mạch, Tai Mũi Họng); 3 nhóm Khám chuyên khoa/Khám tổng quát/Khám từ xa và 3 dịch vụ mẫu tương ứng. Thời lượng lần lượt 30/60/30 phút, giá 200.000/500.000/150.000 đồng, cọc 0. Không seed phụ phí/mốc hoàn tiền hay ảnh.

Bốn chi nhánh CLINIX Mẫu 1…4 dùng địa chỉ minh họa, tọa độ NULL. Mỗi chi nhánh đủ ISO 1–7: thứ Hai–thứ Bảy 08:00–12:00, 13:00–17:00; Chủ nhật nghỉ với cả bốn giờ NULL; cả ba dịch vụ có ở cả bốn chi nhánh. Thông tin phòng khám id=1 dùng thương hiệu CLINIX (minh họa), email clinic@example.invalid, hotline NULL. Không phải thông tin liên hệ thực.

| Email demo | Vai trò/phạm vi | Hồ sơ |
|---|---|---|
| admin.system@example.invalid | QuanTriVien / ToanHeThong | Không gắn chi nhánh |
| admin.branch@example.invalid | QuanTriVien / ChiNhanh | Chi nhánh mẫu 1 |
| doctor@example.invalid | BacSi | Chi nhánh mẫu 1; Nội tổng quát; Khám chuyên khoa mẫu; BS/BS, 0 năm kinh nghiệm |
| receptionist@example.invalid | LeTan | Chi nhánh mẫu 1 |
| patient@example.invalid | BenhNhan | Hồ sơ và ví 0 đồng, không bệnh án |

Tất cả tài khoản mới DangHoatDong/đã xác minh; tên và số điện thoại là dữ liệu giả đã duyệt, không dùng để liên lạc. Không gửi OTP/email và không tạo phiên trong seed. Đăng nhập qua ứng dụng/API auth hiện hữu sau khi chạy; cần kiểm manual từng vai trò cho SD-05, HTTP test tự động không thay thế manual acceptance.

Config-dev chỉ tạo khi chưa có id=1: giữ chỗ 15 phút; nhắc [72,24,2] giờ; tối đa 3 lịch/hồ sơ; tự đổi lịch 2; check-in trước/sau 30/15 phút; phản hồi lời mời 60 phút; danh sách chờ 2; no-show 3; báo trước 3 ngày; w1/w2=0,60/0,40. **Đây là dữ liệu thử, không phải quyết định chính thức**. Cấu hình nghiệp vụ chính thức đi qua B5 khi có; seed không tạo audit actor giả.

### Chạy lại, xung đột và phục hồi

- Insert-only: không sửa/xóa dữ liệu đã có; singleton config/thông tin phòng khám được giữ nguyên. ID bigint lấy từ DB, không ép ID cố định.
- Catalog lookup theo tên (dịch vụ theo nhóm+tên); chi nhánh theo tên+địa chỉ. Chi nhánh đã có phải đủ lịch 7 ngày và dịch vụ cần thiết; giữ nguyên lịch, không tự bổ sung/sửa. Nhiều chi nhánh cùng lookup thì từ chối, không chọn dòng đầu. Đổi tên/địa chỉ dữ liệu mẫu có thể khiến lần chạy sau tạo mẫu mới theo manifest; seed không có ID ownership riêng.
- Account cùng email chỉ skip nếu role/trạng thái xác minh/hồ sơ và quan hệ phù hợp; không reset mật khẩu, mở khóa, chuyển role hay đổi số dư. Tài khoản đã tồn tại có thể dùng mật khẩu khác SEED_DEV_PASSWORD hiện tại. Xung đột thì rollback cả lệnh và đối chiếu thủ công, không tự chữa dữ liệu.
- Mỗi lệnh một transaction. Lỗi trước commit rollback toàn phần ghi; không có auto-unseed sau commit. CLI in counts created/skipped và mã lỗi cố định, không in mật khẩu/hash/token/env/SQL.
- Các CLI C5 cùng DB dùng một MySQL named lock, chờ tối đa 10 giây. Chỉ phối hợp writer C5; không chạy đồng thời với SQL/API khác tạo Admin hoặc sửa catalog. Không có UNIQUE mới trên chi_nhanh hay ràng buộc toàn hệ thống chỉ một Admin.
- `SEED_MIGRATIONS_REQUIRED`: dùng hướng dẫn migration của dự án trên đúng môi trường được phép, rồi chạy lại. `SEED_LOCK_UNAVAILABLE`: chờ lệnh C5 trước kết thúc; không tự tắt kết nối của người khác.
- `SEED_BRANCH_AMBIGUOUS`, `SEED_BRANCH_INCOMPLETE`, `SEED_BRANCH_SERVICE_MISSING`, `SEED_ACCOUNT_CONFLICT`, `SEED_PROFILE_CONFLICT`, `SEED_EMAIL_CONFLICT`: đối chiếu dữ liệu và manifest; seed không xóa/ghi đè để vượt xung đột. `SEED_CATALOG_REQUIRED`: kiểm catalog trước dev-accounts.
- `SEED_ENV_INVALID`, `SEED_PASSWORD_INVALID`, `SEED_ADMIN_INVALID`: kiểm tên biến/định dạng cục bộ, không paste secret vào log/chat. `SEED_FAILED`: kiểm kết nối/quyền/schema bằng công cụ được phép; CLI cố ý không in raw lỗi driver.
- Lỗi ở commit/đóng kết nối/nhả khóa có thể xảy ra sau khi DB đã commit: xác minh lại trạng thái trước khi kết luận chưa ghi gì. Không tự DELETE để chạy lại first-admin. Các mã `SEED_LOCK_RELEASE_FAILED`/`SEED_CLOSE_FAILED` cần kiểm lại kết nối và trạng thái DB, CLI trả lỗi.

Không chạy seed DB dev/chia sẻ chỉ vì test xanh. Verification C5 dùng DB/container test riêng, không dùng credential hoặc dữ liệu bệnh nhân thật.
