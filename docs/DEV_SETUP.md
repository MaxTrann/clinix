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
- **Múi giờ nghiệp vụ là giờ Việt Nam (`+07:00`)**, đặt ở ba chỗ phải khớp nhau: `TZ` của container `db` (`docker-compose.yml`), `DB_TIMEZONE` của driver, và lệnh `SET time_zone`
  mà API chạy cho **mỗi** kết nối MySQL (xem `apps/api/src/database/data-source.ts`). Nhờ vậy `NOW()`/`DEFAULT CURRENT_TIMESTAMP` của DB cùng mốc giờ với thời gian ứng dụng ghi,
  kể cả khi MySQL chạy ở máy khác không đặt múi giờ.
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
