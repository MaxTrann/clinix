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
