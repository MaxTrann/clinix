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

## 04/11/2026

- **Module `auth` hoàn tất** (PR 181, task X1 và X2; issue 11 là Epic): đăng ký và xác minh OTP qua email, đăng nhập (khoá tạm sau 5 lần sai), làm mới phiên có xoay refresh token, đăng xuất, quên mật khẩu, đổi mật khẩu; backend A1–A15, frontend F1–F5, tiền đề P0–P7. Kiểm tay với Gmail SMTP thật, độ phủ test và danh sách việc còn lại (X3 giới hạn request theo IP, checklist staging HTTPS) ở [`features/auth/TRACKING.md`](features/auth/TRACKING.md) mục 6; giải thích luồng cho vấn đáp ở [`features/auth/GIAI_THICH_LUONG.md`](features/auth/GIAI_THICH_LUONG.md).

## 09/11/2026

- **Module `patient` hoàn tất trừ F9 (QR CCCD, hoãn theo quyết định 09/11) và X3 (chờ `booking`)** (PR 318, task X1 và X2 = issue 152 và 153; issue 132 là Epic): hồ sơ cá nhân cho bốn vai trò, hồ sơ người thân (thêm, sửa, ngừng sử dụng), tra cứu bệnh nhân cho Lễ tân, khung Bệnh nhân và Lễ tân, trang Thông tin cá nhân của Lễ tân và Quản trị viên; backend B1–B7, frontend F1–F8 và F11, tiền đề P1–P2. Chạy tay X1 trên `docker compose`: 127/127 ca API và luồng giao diện thật đạt; độ phủ gộp API `patient` 100% câu, web `features/patient` 99,52% câu; việc còn lại và số liệu ở [`features/patient/TRACKING.md`](features/patient/TRACKING.md); giải thích luồng cho vấn đáp ở [`features/patient/GIAI_THICH_LUONG.md`](features/patient/GIAI_THICH_LUONG.md).

## 15/11/2026

- **Module `booking` lõi xong, ba việc chờ module khác** (PR 422, task X2 và X4 = issue 263 và 265; issue 225 là Epic, giữ mở): đặt lịch cọc 0đ sáu bước, huỷ lịch hẹn (Bệnh nhân, Lễ tân, Quản trị viên), tra cứu danh sách và chi tiết cho bốn vai trò, Lễ tân tiếp đón và Vắng mặt, Quản trị viên override có nhật ký, hai job nền (hết hạn giữ chỗ, tự Vắng mặt), thông báo và thư tối thiểu; backend tiền đề P1–P7 và P9, B1–B15, B16a, B18, frontend F1–F5 và F7–F11. Kiểm tay X2 (Đại, 14/11/2026, Chrome và `docker compose`): 9 mục Đạt, 1 Đạt một phần, 13 nhận xét giao diện giao task web F12. Bộ kiểm X4 trên `origin/main` `10d2446` (14 đến 15/11/2026): đơn vị api 4.961 ca, tích hợp 1.861 ca (ba file cố định DB do CI chạy), e2e 1.037/1.038 ca (một ca đỏ đã biết do cấu hình DB riêng), web 3.285 ca, jscpd 1,80% dòng; mục 2 của TRACKING module: 897/918 mã Pass, 0 Fail, 21 chưa chạy. Hoãn theo quyết định 14/11/2026: B16b (chờ `admin` B10), B17 (chờ `payment`, `wallet`, `waitlist`), F6 (chờ `payment`), cùng K1, K2 của `search`; điều kiện bắt đầu lại ở TECH_DEBT dòng 147 và 148; chi tiết ở [`features/booking/TRACKING.md`](features/booking/TRACKING.md) mục 2, 3.43, 5 và 7.
