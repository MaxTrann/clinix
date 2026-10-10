# Nhật ký sử dụng AI (AI Usage Log)

Minh chứng cho tiêu chí **TC2.3** của rubric. Điền ngay khi dùng, không viết bù cuối kỳ. Hội đồng đối chiếu nhật ký này với lịch sử commit và phần vấn đáp.

Quy ước:
- Mỗi lần dùng AI có ảnh hưởng đến repo (mã, test, cấu hình, tài liệu) là một dòng ở bảng 1.
- Mỗi lỗi/ảo giác của AI mà nhóm tự phát hiện là một dòng ở bảng 2, kèm PR sửa.

## 1. Nhật ký sử dụng

| # | Ngày | Người dùng | Công cụ / model | Phạm vi | Prompt chính | Phần AI sinh | Phần tự làm | Cách kiểm chứng | Commit/PR |
|---|------|-----------|-----------------|---------|--------------|--------------|-------------|-----------------|-----------|
| 1 | 09/10/2026 | MaxTrann | Claude Code (Claude Sonnet 5.5) | Khung repo cũ `clinix-old` (Docker, CI/CD, hook, tài liệu, 28 file) | Dựng khung repo theo stack SOW và rubric TC2.3–2.6 | Toàn bộ 28 file của repo cũ | Tạo repo, ruleset, review, merge, tìm lỗi trong tab Actions | `docker compose config`, chạy CI trên GitHub | clinix-old: abbfc58, PR #6 |
| 2 | 09–10/10/2026 | MaxTrann | Claude Code (Claude Sonnet 5.5) | Repo mới `clinix`: làm lại từng lớp | Hướng dẫn và giải thích từng file, đưa nội dung để tự gõ | Nội dung mẫu và lời giải thích | Tự gõ file, chạy lệnh, commit, push, mở PR, merge | Chạy thử lệnh (git status, commitlint) | clinix: PR #1, #2, #3 |

## 2. Lỗi / ảo giác của AI đã phát hiện

| Mã | Ngày | Mô tả lỗi | Nguyên nhân | Cách phát hiện | PR sửa |
|----|------|-----------|-------------|----------------|--------|
| AI-BUG-001 | 09/10/2026 | `hashFiles()` dùng ở `if` cấp job, workflow bị GitHub từ chối (0 job) | AI không nhớ ràng buộc ngữ cảnh khả dụng của GitHub Actions | Tab Actions: run đỏ, 0 job | clinix-old PR #6 |
| AI-BUG-002 | 09/10/2026 | `trivy-action@0.28.0` không tồn tại | AI viết version theo trí nhớ | Annotation của check-run | clinix-old PR #6 |
| AI-BUG-003 | 10/10/2026 | Hook `commit-msg` dùng `npx --no -- commitlint ...` bị lỗi `'"node"' is not recognized`, chặn cả commit đúng | AI không tính tới việc `npx` gọi file `.cmd` trong shell của Git trên Windows (máy dùng nvm4w); Husky 9 đã tự thêm `node_modules/.bin` vào PATH nên không cần `npx` | Commit bị hook từ chối; tái hiện lỗi rồi thử cách gọi thẳng `commitlint` | clinix PR #3 |

## 3. Quy trình kiểm soát đầu ra AI

- Review bằng checklist ở `.github/PULL_REQUEST_TEMPLATE.md` cho mọi PR có AI.
- Đối chiếu API/thư viện với tài liệu chính thức trước khi chấp nhận.
- Kiểm tra giấy phép khi AI đề xuất thư viện hoặc đoạn mã dài.
- Không đưa dữ liệu bệnh nhân thật, secret, khóa API vào prompt.