# Thiết lập repo lần đầu

Làm tuần tự. Mục 1–4 là việc tối nay; mục 5–6 làm khi có server staging.

## 1. Tạo repo GitHub
1. Tạo repo `clinix` (không tick "Add README/.gitignore" vì đã có sẵn).
2. **Public hay Private?** Branch protection / Rulesets trên repo **private** cần gói GitHub Pro/Team.
   Sinh viên đăng ký **GitHub Student Developer Pack** sẽ có Pro miễn phí. Nếu không có → để repo public
   (nhớ rằng khi đó mọi commit đều công khai, nên càng không được lộ secret).
3. Thêm thành viên còn lại làm Collaborator (quyền Write). Thêm giảng viên và hội đồng khi cần (rubric G8: repo phải cấp quyền cho hội đồng).

## 2. Đẩy mã khung lên
```bash
cd D:\du_lieu\clinix-app
git init -b main
git add .
git commit -m "chore(repo): khởi tạo khung repo, CI/CD, quy ước commit"
git remote add origin https://github.com/<owner>/clinix.git
git push -u origin main
```
(Commit đầu tiên này đẩy thẳng `main` là lần duy nhất; bật bảo vệ nhánh ngay sau đó.)

## 3. Bảo vệ nhánh `main` (Settings → Rules → Rulesets → New branch ruleset)
- Target: `main`. Enforcement: Active. **Không** thêm bypass cho ai (kể cả admin).
- Bật: *Restrict deletions*, *Block force pushes*, *Require a pull request before merging*
  (Required approvals = 1; *Dismiss stale approvals*), *Require status checks to pass* (chọn các job của workflow CI sau khi chúng chạy lần đầu).
- Settings → General → Pull Requests: chỉ bật **Squash merging**, mặc định lấy *Pull request title* làm commit message.

## 4. Khởi tạo hai ứng dụng (trong nhánh `feat/init-apps`, rồi mở PR)
```bash
# API — NestJS + TypeScript
cd apps
npx @nestjs/cli@latest new api --package-manager npm --skip-git
# Web — React + TypeScript (Vite)
npm create vite@latest web -- --template react-ts
cd web && npm install && cd ..
```
Sau đó:
- API: thêm endpoint `GET /health` trả `{ "status": "ok" }` (ví dụ dùng `@nestjs/terminus`). Dockerfile, healthcheck và bước kiểm tra sau deploy đều gọi endpoint này.
- Web: cài Vitest (`npm i -D vitest @vitest/coverage-v8`) và thêm script `"test": "vitest"`; đảm bảo có script `lint` (template Vite đã có ESLint).
- API: script `lint`, `build`, `test`, `start:dev` đã có sẵn trong template Nest.
- Kiểm tra: `cp .env.example .env` rồi `docker compose up --build`.

## 5. Biến cấu hình cho CD (Settings → Secrets and variables → Actions)
| Loại | Tên | Ý nghĩa |
|------|-----|---------|
| Variable | `STAGING_HOST` | IP/domain server staging (để trống = bỏ qua bước deploy) |
| Variable | `STAGING_USER` | user SSH |
| Variable | `STAGING_PATH` | thư mục chứa compose + `.env` trên server |
| Variable | `STAGING_API_URL` | Chỉ dùng cho health check của CD: `https://<web-host>/api` (đi qua nginx). Web luôn build với `VITE_API_URL=/api` |
| Secret | `STAGING_SSH_KEY` | private key dùng riêng cho deploy (không dùng key cá nhân) |

Trên server: cài Docker + Compose plugin; tạo `STAGING_PATH/.env` từ `.env.example` (điền giá trị thật, **chỉ nằm trên server**).
Lần đầu ảnh trong GHCR là private; server đăng nhập GHCR bằng token trong bước deploy.

## 6. Rollback
Actions → **CD** → *Run workflow* → nhập `tag` là SHA 12 ký tự của bản đã chạy tốt (xem trong tab Packages hoặc log của run cũ).

## Việc còn lại (không làm được bằng file)
- Bật Secret scanning + Push protection (Settings → Code security) — bổ trợ cho gitleaks.
- Thêm `apps/mobile` (Flutter) và workflow riêng khi API ổn định (SOW: Mobile làm sau).
- Chọn ORM/migration (TypeORM, Prisma, …) → ghi lý do vào tài liệu thiết kế; compose hiện chỉ cung cấp MySQL.
- Sonar: nếu muốn báo cáo SonarCloud làm minh chứng, thêm bước scan sau khi có `SONAR_TOKEN`.
