# F4 — Tracker

Overall: complete locally  
Updated: 2026-11-02

## Status rules

- `pending`: chưa bắt đầu.
- `in_progress`: đang thực hiện; chỉ một task chính ở trạng thái này.
- `waiting_for_user`: cần câu trả lời hoặc quyết định.
- `blocked`: không thể tiếp tục do blocker kỹ thuật đã xác minh.
- `done`: hoàn tất và có evidence.
- `skipped`: không cần thực hiện; ghi lý do.

## Tasks

| ID | Task | Depends on | Status | Evidence/result | Updated |
|---|---|---|---|---|---|
| T1 | Xác định F4; kiểm tra source, B4 contract, Admin docs và Figma | — | done | Nhánh `feat/admin-f4` sạch lúc bắt đầu; F4 row Admin PLAN; B4 GET/PUT và guard source verified; Figma node 541:2 đã đọc | 2026-11-02 |
| T2 | Lập plan và acceptance criteria | T1 | done | `working-doc/F4/plan.md`; issue # chưa tìm thấy, không suy đoán | 2026-11-02 |
| T3 | Triển khai UI/service/hook, quyền route, sidebar và assets | T2 | done | Trang F4, service/hook, route scope ToanHeThong, sidebar link và SVG local đã hoàn thành | 2026-11-02 |
| T4 | Viết/chạy component, service và route tests; lint/build/visual verification | T3 | done | Web 11 files/201 tests pass; lint/build/diff-check pass; visual preview đối chiếu node 541:2 | 2026-11-02 |
| T5 | Review diff, cập nhật Admin PLAN/TRACKING và log Trung | T4 | done | Diff đã rà; docs và `TRUNG_AI_USAGE_LOG.md` cập nhật. CI/PR/review/merge chưa thực hiện | 2026-11-02 |

## Open questions and blockers

| ID | Question/blocker | Owner | Needed for | Status |
|---|---|---|---|---|
| — | Không có câu hỏi business/API/permission đang chờ | — | — | resolved |
| Issue | Không tìm thấy issue GitHub riêng của F4 trong checkout | — | Tham chiếu task | unknown; không cản trở triển khai theo Admin PLAN |
| Figma Code Connect | Không có Dev/Full seat để lấy Code Connect; đã dùng screenshot node và SVG tĩnh | Codex | Design context | resolved with limitation |

## Verification log

| Command/check | Result | Date |
|---|---|---|
| `git status --short --branch` | `feat/admin-f4`, clean trước khi bắt đầu | 2026-11-02 |
| Figma design context | Node `541:2` trả code context và screenshot; 4 icon trường + icon lưu xác định để tải local | 2026-11-02 |
| B4 contract source | GET nullable + PUT four fields; `QuanTriVien` + `ToanHeThong` cho cả GET/PUT | 2026-11-02 |
| `npm run test -- --reporter=dot` (`apps/web`) | Pass: 11 test files, 201/201 tests; có cảnh báo React `act(...)` từ auth route tests hiện hữu | 2026-11-02 |
| `npm run lint` (`apps/web`) | Pass | 2026-11-02 |
| `npm run build` (`apps/web`) | Pass: `tsc -b` + Vite production build | 2026-11-02 |
| `git diff --check` | Pass | 2026-11-02 |
| Figma visual comparison | Preview local khớp bố cục/icon chính ở node `541:2`; dữ liệu mock, không gọi API/DB. Screenshot `C:\Users\Admin\.codex\visualizations\2026\11\02\01a19b93-33d3-7c03-9402-51c20bb2c36d\f4-local.png` | 2026-11-02 |
| Diff review | Không đổi API/schema/auth/dependency; không có URL Figma tạm trong source; không commit/push/PR | 2026-11-02 |
