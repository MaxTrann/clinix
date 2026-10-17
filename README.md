# CLINIX

Hệ thống đặt lịch khám bệnh đa nền tảng, đa chiều, tích hợp AI hỗ trợ thông minh — đồ án TLCN (nguyên mẫu học thuật, dùng dữ liệu mẫu, không dùng dữ liệu bệnh nhân thật).

| Thành phần | Công nghệ |
|------------|-----------|
| Web | ReactJS (TypeScript) |
| API | NestJS + TypeScript |
| CSDL | MySQL 8.4 |
| Mobile | Flutter (làm sau khi Web/API ổn định) |
| Đóng gói / CI-CD | Docker, GitHub Actions, GHCR |

## Cấu trúc
```
apps/api      NestJS REST API
apps/web      React web (responsive)
apps/mobile   Flutter (chưa tạo)
docs/         quy ước, tài liệu kỹ thuật, nợ kỹ thuật
.github/      workflow CI/CD, template PR/issue
```

## Chạy môi trường dev
Yêu cầu: Docker + Docker Compose.
```bash
cp .env.example .env     # điền giá trị
docker compose up --build
```
- Web: http://localhost:5173 · API: http://localhost:3000 (`/health`) · MySQL: `localhost:3306`

Thiết lập repo lần đầu (khởi tạo app, bảo vệ nhánh, CD): xem [`docs/REPO_SETUP.md`](docs/REPO_SETUP.md).
Thành viên mới clone repo để code: xem [`docs/DEV_SETUP.md`](docs/DEV_SETUP.md).

## Quy trình làm việc
Xem [`CONTRIBUTING.md`](CONTRIBUTING.md) và [`docs/CODING_CONVENTION.md`](docs/CODING_CONVENTION.md).
Nhật ký dùng AI: [`AI_USAGE_LOG.md`](AI_USAGE_LOG.md). Nợ kỹ thuật: [`docs/TECH_DEBT.md`](docs/TECH_DEBT.md).
Kế hoạch phát triển: [`docs/PLAN.md`](docs/PLAN.md). Nhật ký thay đổi mã nguồn: [`docs/TRACKING.md`](docs/TRACKING.md).
Bắt đầu một tính năng mới: [`docs/FEATURE_PLANNING_PROMPT.md`](docs/FEATURE_PLANNING_PROMPT.md).

## Kiểm tra chất lượng (chạy ở CI cho mọi PR)
PR title (Conventional Commits) → gitleaks → lint/build/test + coverage → jscpd (trùng lặp ≤ 3%) → Trivy (CRITICAL/HIGH) → build image Docker.
Sau khi merge `main`: build & đẩy image lên GHCR → deploy staging → health check.

## Thành viên
- Trần Lê Quốc Đại
- Vũ Quốc Trung
