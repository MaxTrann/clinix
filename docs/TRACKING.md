# Tracking — Mã nguồn CLINIX

Nhật ký thay đổi **thật** trên repo mã nguồn (`clinix-app` / GitHub `MaxTrann/clinix`).
Khác với `TRACKING.md` ở repo tài liệu `TLCN_CLINIX` (ghi báo cáo, biên bản họp, quyết định
học thuật) — file này chỉ ghi code, hạ tầng, CI/CD, quy ước dev. Việc đang làm dở / sắp làm
thì xem [`PLAN.md`](PLAN.md), không ghi ở đây.

**Quy ước:** mỗi PR merge vào `main` nên có đúng 1 mục. Ngày lấy theo ngày merge trên GitHub.
Chỉ ghi khi đã **merge vào main** — việc còn nằm trong nhánh hoặc chưa commit không ghi ở đây.

## 09/10/2026

- **Khởi tạo khung repo** (`abbfc58`, push thẳng `main` — lần duy nhất, trước khi ruleset bật). 28 file: Docker, `docker-compose`, CI/CD (GitHub Actions), husky/commitlint, gitleaks, template PR/issue, `docs/`, README, CONTRIBUTING. Stack theo SOW (ReactJS, NestJS + TypeScript, MySQL, Docker).
- **PR #6 — sửa AI-BUG-001, AI-BUG-002** (`03fe832`). Workflow CI/CD bị GitHub từ chối (`hashFiles()` dùng sai ở điều kiện cấp job); job `security` đỏ do version `trivy-action` không tồn tại.
- **PR #5 → #1 — Dependabot nâng version 5 GitHub Action** (`28fc235` → `2c041b6`): `action-semantic-pull-request`, `docker/login-action`, `docker/setup-buildx-action`, `actions/checkout`, `actions/upload-artifact`.
- Bật ruleset `protect-main` (bắt buộc PR + ≥ 1 approve), mời Vũ Quốc Trung làm Collaborator.

## 09–12/10/2026

- **Đợt làm lại toàn bộ repo bằng tay** ở repo phụ `clinix-git-practice` (không merge vào repo chính thức) — nhóm tự gõ từng dòng để hiểu quy trình Git, được 3 PR, sau đó quyết định quay lại dùng bản AI dựng sẵn làm chính thức vì tốc độ. Trong lúc làm tay, tự phát hiện AI-BUG-003.
- **Đổi tên 2 repo GitHub** để tránh nhầm lẫn lâu dài: bản AI dựng → `clinix` (chính thức, dùng từ đây); bản làm tay → `clinix-git-practice` (giữ làm minh chứng, không phải bản nộp).

## 12/10/2026

- **PR #7 — sửa AI-BUG-003** (`0097907`). Hook `.husky/commit-msg` dùng `npx --no -- commitlint --edit "$1"` lỗi trên Windows (máy dùng nvm4w), chặn cả commit đúng chuẩn; sửa thành gọi thẳng `commitlint --edit "$1"`.

## 13/10/2026

- **PR #8 — thêm `docs/DEV_SETUP.md`** (`d0f0bef`). Hướng dẫn clone và chạy repo cho thành viên mới (dành cho Trung, khác với `docs/REPO_SETUP.md` dành cho người tạo repo lần đầu).
- Cài gitleaks cục bộ trên máy Trần Lê Quốc Đại (`winget install --id Gitleaks.Gitleaks`, bản 8.30.1) — thêm lớp quét secret ở máy, ngoài lớp quét ở CI.
- Tạo `docs/PLAN.md` và file này — tách kế hoạch/nhật ký riêng cho mã nguồn khỏi `TRACKING.md` chung của repo tài liệu.
