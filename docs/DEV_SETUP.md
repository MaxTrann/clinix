# Hướng dẫn clone và chạy repo (cho thành viên mới)

Dành cho thành viên đã được mời làm **Collaborator** trên GitHub, muốn đưa code về máy để bắt đầu làm việc.
Nếu bạn là người *tạo* repo lần đầu (tạo ruleset, tạo `apps/api`/`apps/web`...), xem [`REPO_SETUP.md`](REPO_SETUP.md) thay vì file này.

> **Lưu ý trạng thái hiện tại (13/10/2026):** `apps/api` và `apps/web` mới có `Dockerfile`, **chưa có mã NestJS/React thật**.
> Một vài lệnh ở dưới sẽ báo lỗi cho tới khi hai app này được tạo — đã ghi chú rõ ở từng chỗ, không phải do bạn làm sai.

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

**Hiện tại lệnh này sẽ lỗi** ở bước build `api` và `web`, vì hai thư mục đó chưa có `package.json` (chưa tạo app NestJS/React). Đây là trạng thái tạm thời, không phải bạn làm sai. Muốn thử trước phần đã chạy được (MySQL):

```powershell
docker compose up db
```

Khi nào `apps/api`/`apps/web` đã được tạo (xem `docs/REPO_SETUP.md` mục 4), `docker compose up --build` sẽ chạy đủ cả Web (http://localhost:5173), API (http://localhost:3000) và MySQL (`localhost:3306`).

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
npm run lint      # hiện báo lỗi vì apps/api, apps/web chưa tồn tại — bình thường tới khi có app
npm test
npm run dup       # jscpd — kiểm mã trùng lặp
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
