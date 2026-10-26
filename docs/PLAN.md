# Kế hoạch phát triển mã nguồn CLINIX

Tài liệu sống — sửa trực tiếp khi kế hoạch đổi, không tạo bản PLAN_v2. Khác với [`TRACKING.md`](TRACKING.md)
(ghi việc **đã xong**), file này ghi việc **sắp làm**, theo thứ tự nào và vì sao.

Nguồn ràng buộc: `Rubric_Do_An_Mon_Hoc_CNPM_V2-1.docx` (bản Khoa, repo tài liệu `TLCN_CLINIX`) và
`PROJECT CHARTER & STATEMENT OF WORK (SOW).docx`. Khi đổi kế hoạch vì lý do học thuật/rubric, ghi
quyết định đó vào `TRACKING.md` của repo `TLCN_CLINIX`, không chỉ sửa im lặng ở đây.

## Cách dùng file này

- Mỗi phase có checklist `- [ ]`; tick khi xong (PR merge), không xoá dòng đã tick — đó là lịch sử.
- Cột "Rubric" ghi tiêu chí liên quan để nhớ *vì sao* việc này quan trọng, không phải việc vặt.
- Thứ tự phase phản ánh phụ thuộc thật (phase sau cần phase trước), không phải độ ưu tiên tuỳ ý.
- Khi một PR merge xong việc nào, thêm 1 dòng tương ứng vào `TRACKING.md`.

## Việc lặt vặt cần đóng trước Phase 1

- [ ] Sửa dấu `.` thừa gõ nhầm ở `AI_USAGE_LOG.md` dòng AI-BUG-002 (`aquasecurity./trivy-action` → `aquasecurity/trivy-action`).
- [ ] Thêm dòng #3, #4 vào bảng 1 của `AI_USAGE_LOG.md` (đợt làm lại bằng tay; `docs/DEV_SETUP.md`).
- [ ] Trung cài gitleaks (`winget install --id Gitleaks.Gitleaks -e`) để có lớp quét cục bộ như Đại.
- [ ] Commit `package-lock.json` ở gốc repo (hiện chưa từng được track — `npm install` mỗi máy có thể ra khoá phiên bản khác nhau).

## Phase 0 — Chốt quyết định còn treo

Phải xong trước khi viết nghiệp vụ, vì mọi module sau đều phụ thuộc các lựa chọn này.

| # | Quyết định | Vì sao chặn | Trạng thái |
|---|---|---|---|
| 1 | ORM cho NestJS + MySQL (TypeORM / Prisma) | Entity, migration, mọi module đều dựa vào | **Chốt 25/10:** TypeORM, `synchronize: false`, migration SQL viết tay, đối chiếu từng dòng với `docs/database/clinix_mysql.sql` (Q1 của module auth, xem `docs/features/auth/TRACKING.md`) |
| 2 | Cơ chế xác thực chính thức (JWT access/refresh — hiện chỉ là `[đề xuất]` trong `.env.example`) | Auth là nền cho phân quyền (RBAC) ở mọi module khác | **Chốt 17/10:** JWT access token ngắn hạn + refresh token lưu băm trong DB (đăng xuất = vô hiệu refresh token). **Chốt thêm 25/10 (Q2 của module auth):** access JWT 15 phút; phiên không hoạt động 30 phút, tối đa 8 giờ từ lúc đăng nhập; refresh token ngẫu nhiên 256 bit, lưu băm, xoay mỗi lần dùng (dùng lại token cũ thì thu hồi phiên); cookie `HttpOnly; Secure; SameSite=Lax`, access token chỉ giữ trong bộ nhớ; web và API cùng origin qua proxy |
| 3 | Ngày bắt đầu / kết thúc kỳ đồ án thật | Quyết định mốc 50% của quy tắc chặn điểm G1 (rubric) — trễ hạn = không đủ điều kiện bảo vệ | `[cần điền]`, hỏi GVHD |
| 4 | Server staging (VPS nào; GitHub Student Pack còn hiệu lực không) | TC2.2, TC2.6, TC2.7 đều cần staging công khai | `[cần điền]` (chọn VPS). **Yêu cầu đã chốt 25/10 (N5 của module auth):** staging có người truy cập qua mạng phải chạy **HTTPS** (domain + chứng chỉ) vì cookie `Secure`; chỉ tắt `Secure` ở phát triển cục bộ (`COOKIE_SECURE=false`; API từ chối khởi động nếu tắt ngoài `development`) |

## Phase 1 — Khởi tạo `apps/api` và `apps/web`

Theo `docs/REPO_SETUP.md` mục 4. Rubric: TC2.1, TC2.4 (repo build được — G8), nền cho mọi phase sau.

- [ ] `apps/api`: khởi tạo NestJS, thêm endpoint `GET /health` (CD và Docker `HEALTHCHECK` đã chờ sẵn endpoint này).
- [ ] `apps/web`: khởi tạo React + Vite, cài Vitest.
- [ ] Kết nối MySQL qua ORM đã chọn ở Phase 0, chạy migration đầu tiên (bảng rỗng là đủ để xác nhận kết nối).
- [ ] `docker compose up --build` chạy đủ 3 service (`db`, `api`, `web`).
- [ ] PR đầu tiên có code thật → bật `api`, `web`, `docker` vào required status checks của ruleset (hiện chỉ có `detect`, `pr-title`, `secrets`, `security`).

## Phase 2 — Nghiệp vụ lõi

Rubric: TC2.1 + TC2.2 = 20 điểm, nặng nhất trong toàn bộ rubric. Thứ tự theo SOW 5.1.1 (điều kiện
nghiệm thu tối thiểu) và use case đã chốt (77 UC, xem repo `TLCN_CLINIX`).

- [ ] Auth + RBAC (đăng ký, đăng nhập, OTP, quên mật khẩu, Role + Ownership + Scope theo SOW 3.2.1) — nền cho mọi phân quyền sau này. **Bắt đầu bằng [`docs/FEATURE_PLANNING_PROMPT.md`](FEATURE_PLANNING_PROMPT.md)** để có `docs/features/auth/PLAN.md` chia việc cụ thể.
- [ ] Hồ sơ bệnh nhân.
- [ ] Tra cứu chi nhánh / chuyên khoa / bác sĩ / lịch trống.
- [ ] **Đặt lịch (booking) cốt lõi** — luồng quan trọng nhất theo SOW 5.1.2; cần giữ chỗ/transaction chống double-booking (rủi ro đã ghi ở SOW 7.1), kèm test case cho tình huống đặt đồng thời.
- [ ] Theo dõi / cập nhật trạng thái lịch hẹn.
- [ ] Chức năng quản trị tối thiểu.

Mỗi mục trên, khi làm, luôn kèm 3 việc: viết test (TC2.5); đối chiếu/cập nhật sơ đồ thiết kế nếu
lệch (TC2.1 — hội đồng đối chiếu ngẫu nhiên ≥ 5 vị trí với mã); ghi `AI_USAGE_LOG.md` nếu có dùng AI.

> **Mốc G1 (50%):** chốt bản cam kết sản phẩm cuối + bộ metric với GVHD **trong Phase 1–2**, không để cuối kỳ.

## Phase 3 — Mở rộng

Nghiệp vụ đã chốt sẵn trong repo `TLCN_CLINIX`, chỉ còn implement — không cần họp lại trừ khi phát sinh mâu thuẫn với thiết kế đã chốt.

- [ ] Waitlist (quy tắc chốt 21/09 — xem `project_quy_tac_danh_sach_cho`).
- [ ] Ví / thanh toán sandbox (giá chốt 02/10: 1 bác sĩ = 1 dịch vụ).
- [ ] Tái khám (bác sĩ đề xuất, bệnh nhân phản hồi).
- [ ] Thông báo / nhắc lịch.
- [ ] Dashboard & báo cáo.
- [ ] Trợ lý AI (giới hạn theo SOW 3.2.6 — không chẩn đoán, không kê đơn).

## Phase 4 — Hạ tầng còn thiếu

Làm **song song** từ khi có 1–2 tính năng chạy được, không chờ Phase 3 xong hẳn.

- [ ] Thuê server staging, khai biến `STAGING_HOST/USER/PATH/API_URL` + secret `STAGING_SSH_KEY` trên GitHub. Staging cần domain và chứng chỉ HTTPS (cookie `Secure`, N5 của module auth).
- [ ] Bắt đầu đếm deploy tự động — mục tiêu rubric ≥ 10 lần **trải đều**, bắt đầu càng sớm càng tốt, đừng dồn cuối kỳ.
- [ ] Bật Secret scanning + Push protection trên GitHub (Settings → Code security).
- [ ] Coverage test leo dần lên ≥ 70% ở module lõi.
- [ ] (Tuỳ chọn) SonarCloud nếu muốn có báo cáo Sonar làm minh chứng TC2.4.

## Phase 5 — Thực nghiệm người dùng thật

Rubric TC2.7 (5 điểm): cần ≥ 10 người dùng thật + 1 vòng đo lại trước/sau (SUS ≥ 80 ở Mức 5).
Bắt đầu ngay sau khi có bản staging đầu tiên chạy ổn luồng đặt lịch — **không để tuần cuối**, vì
cần đủ thời gian cho vòng cải tiến và đo lại.

## Xuyên suốt mọi phase

- Tài liệu phân tích/thiết kế (SRS/SDD) cập nhật song song với code, không dồn cuối — TC2.1 Mức 5
  yêu cầu sơ đồ khớp 100% mã khi hội đồng đối chiếu ngẫu nhiên.
- Khảo sát TC1 (form đã chốt 06/10, chờ đủ ≥ 30 phiếu) — theo dõi song song, không phụ thuộc code.
- Commit đều mỗi tuần, PR có review — như quy trình đã thiết lập từ Phase 0 tới nay.
