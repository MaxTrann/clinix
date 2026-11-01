# F1 — Tracker

Overall: in_progress
Updated: 2026-11-01

## Status rules

- pending: chưa bắt đầu.
- in_progress: đang thực hiện; chỉ một task chính ở trạng thái này.
- waiting_for_user: cần câu trả lời hoặc quyết định.
- blocked: không thể tiếp tục do blocker kỹ thuật đã xác minh.
- done: hoàn tất và có evidence.
- skipped: không cần thực hiện; phải ghi lý do.

## Tasks

| ID | Task | Depends on | Status | Evidence/result | Updated |
|---|---|---|---|---|---|
| T1 | Đọc issue #60, Admin plan/tracker, auth handoff và source | — | done | Issue #60 và phụ thuộc đã kiểm tra; AdminMe, router hook point và shared UI hiện hữu đã xác nhận. | 2026-11-01 |
| T2 | Chốt phạm vi kiến trúc, Figma shell và menu F2–F9 | T1 | done | ADR 0002 chốt Clinix Data Mode; đọc được frame 522:2/625:2. Người dùng chọn hiển thị mục F2–F9 nhưng disabled, không route/badge giả. | 2026-11-01 |
| T3 | Chốt test IDs F1 và scope của control dùng chung | T2 | done | Chốt `AF1-01…AF1-10`; đã đồng bộ vào `docs/features/admin/PLAN.md`. | 2026-11-01 |
| T4 | Xác nhận dependency gate trước code | T2, T3 | done | GitHub xác nhận #35, #18, #52, #50 đều closed; #60 open và có integration note. | 2026-11-01 |
| T5 | Triển khai shell, guard, menu và shared UI | T2–T4, quyết định scope | done | AdminMe, layout/menu theo Figma, scope guard, forbidden/error state, table/search/dialog/panel; không dựng dashboard. Figma chỉ đọc. | 2026-11-01 |
| T6 | Test và cập nhật feature tracking | T5 | done | `AF1-01…AF1-10`, Admin PLAN/TRACKING cập nhật; lint/build/test pass, 180/180. So screenshot trình duyệt với Figma chưa thực hiện. | 2026-11-01 |
| T7 | So sánh shell bằng screenshot trình duyệt với Figma | T5 | pending | Chưa có browser screenshot capability trong phiên; CSS, màu, kích thước và SVG đã lấy từ frame context. | 2026-11-01 |
| T8 | Ghi lượt dùng AI vào AI_USAGE_LOG.md | T5 | done | Đã thêm mục 33 và AI-BUG-030 vào `TRUNG_AI_USAGE_LOG.md` theo yêu cầu người dùng. | 2026-11-01 |

## Open questions and blockers

| ID | Question/blocker | Owner | Needed for | Status |
|---|---|---|---|---|
| Q1 | Phạm vi router: Clinix dùng React Router 8.4 Data Mode theo ADR 0002; không migrate trong #60. | Người dùng/nhóm | Chốt file và kiến trúc tích hợp | resolved |
| Q2 | Dashboard KPI/biểu đồ trong frame 507:2/587:2 có thuộc F1 không? | Người dùng/nhóm | Chốt nội dung route `/admin` | resolved: chỉ làm shell; không dựng dashboard hoặc số liệu tĩnh |

## Verification log

| Command/check | Result | Date |
|---|---|---|
| git status --short --branch (clinix) | `feat/admin-f1` tại HEAD 0556d23; `working-doc/F1/` untracked; giữ nguyên, không chạy lệnh Git làm thay đổi | 2026-11-01 |
| Read issue #60 and linked issue states | #60 open, router integration note present; #35/#18/#52/#50 closed | 2026-11-01 |
| Read docs/features/admin/PLAN.md and TRACKING.md | F1 scope, test inventory, C1/P6 tracking reviewed | 2026-11-01 |
| Read workspace ADR-001, frontend guidance, DEVELOPMENT_RULES.md and clinix/docs/PLAN.md | Workspace ADR-001 là mặc định Framework Mode; Clinix dùng React Router 8.4 Data Mode theo ADR 0002 đã Accepted; không migrate router | 2026-11-01 |
| Read docs/features/auth/TRACKING.md section 5 and auth F1 issue | API hook and route composition contract reviewed; auth F1 #35 is closed | 2026-11-01 |
| Read source routes, AccessGate, AdminMe contract, shared UI | Evidence recorded in plan.md; Clinix Data Mode decision confirmed, no architecture conflict | 2026-11-01 |
| Figma get_design_context (522:2, 625:2) | Read-only context and screenshots returned for global/branch Admin list frames; no Figma content edited | 2026-11-01 |
| Figma use_figma frame listing | Found overview frames 507:2 and 587:2; read-only, no nodes modified | 2026-11-01 |
| `npm ci` trong `apps/web` | Cài 230 packages theo lockfile; npm báo 12 moderate advisories; không chạy audit fix hoặc đổi manifest | 2026-11-01 |
| Lượt đầu `npm run lint` / `npm run build` / `npm test` | Có lỗi ban đầu ở hook lint, focus ref, nhãn nút pending và assertion placeholder Admin; đã sửa và chạy lại | 2026-11-01 |
| `npm run lint` cuối | Pass | 2026-11-01 |
| `npm run build` cuối | Pass; Vite build 135 modules, JS 328.73 kB (gzip 103.84 kB) | 2026-11-01 |
| `npm test` cuối | Pass; 8 files, 180/180 test | 2026-11-01 |
| `TRUNG_AI_USAGE_LOG.md` | Thêm mục 33 và AI-BUG-030 cho F1 | 2026-11-01 |
| Figma visual review | Figma context/assets chỉ đọc; chưa so screenshot trình duyệt; không sửa nội dung Figma | 2026-11-01 |
