# Quy trình đóng góp

Nhóm 2 người nên quy tắc càng ít càng dễ giữ. Những điều dưới đây là **bắt buộc**, vì rubric chấm trực tiếp trên lịch sử Git.

1. **Không push thẳng `main`.** Tạo nhánh → mở PR → người còn lại review & approve → CI xanh → squash merge.
2. **Tiêu đề PR = commit message cuối** (squash). Theo Conventional Commits:
   `feat(booking): thêm giữ chỗ 10 phút`, `fix(waitlist): sửa thứ hạng [AI-BUG-004]`.
3. **Mỗi tuần có commit** trên `main` (rubric: ≥ 90% số tuần). Mỗi người đều có commit thật.
4. **Dùng AI thì ghi `AI_USAGE_LOG.md` ngay.** Lỗi AI phát hiện được ghi thêm ở bảng 2 và gắn mã `AI-BUG-nnn` vào commit sửa.
5. **Không commit secret.** `.env` đã bị ignore; mọi cấu hình mới thêm vào `.env.example`. Lỡ lộ → thu hồi khóa ngay, rồi báo nhóm.
6. **Chỉ merge code cả hai đều giải thích được.** Hội đồng hỏi vấn đáp ngẫu nhiên vào mã (Mục 6 rubric).
7. **Đổi thiết kế → cập nhật tài liệu/sơ đồ** trong cùng PR.
8. **Lối tắt kỹ thuật** → ghi vào `docs/TECH_DEBT.md`.
9. **Commit, push và merge do thành viên tự thực hiện bằng tay**, dưới tên của mình. Công cụ AI chỉ hỗ trợ viết nội dung (và phải ghi vào `AI_USAGE_LOG.md`), không tự chạy `git commit`/`git push` và không để lại dòng `Co-Authored-By` của AI.

## Cài đặt hook cục bộ
```bash
npm install          # cài husky + commitlint ở gốc repo
# (khuyến nghị) cài gitleaks: https://github.com/gitleaks/gitleaks
```
