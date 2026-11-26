import type { MigrationInterface, QueryRunner } from 'typeorm';

// chat P2 phần (b) (issue #707, scope #11 "Nhắn tin"; PLAN chat 5.2, 5.5, Q12, T6): chỉ mục cho câu đếm giới hạn tốc độ gửi tin
// (`SELECT COUNT(*) FROM (SELECT 1 FROM tin_nhan WHERE nguoi_gui_id = ? AND thoi_diem_gui > ? LIMIT 20) t`). Số đo X1 M4: khi chỉ có UNIQUE
// `tin_nhan_index_nguoi_gui_ma_gui (nguoi_gui_id, ma_gui)`, MySQL phải đọc từng tin của người gửi để lọc `thoi_diem_gui` (p95 18,2 ms ở người gửi 20.000 tin, ngưỡng 10 ms).
// Chỉ mục mới có sẵn `thoi_diem_gui` nên câu đếm chỉ quét khoảng 60 giây gần nhất trong chỉ mục. Phần (a) của P2 (cột tin cuối) KHÔNG làm vì M1, M2 đạt.
// Văn bản trùng nguyên văn câu trong docs/database/clinix_mysql.sql (migration-source.spec.ts MCH-12). Chỉ THÊM chỉ mục: không đổi bảng, cột hay dữ liệu.
export const CHI_MUC_TIN_NHAN_NGUOI_GUI_SQL =
  'CREATE INDEX `tin_nhan_index_nguoi_gui_thoi_diem` ON `tin_nhan` (`nguoi_gui_id`, `thoi_diem_gui`)';

export class ChiMucTinNhanNguoiGui1794312000000 implements MigrationInterface {
  name = 'ChiMucTinNhanNguoiGui1794312000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(CHI_MUC_TIN_NHAN_NGUOI_GUI_SQL);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Chỉ xoá chỉ mục, không chặn: không mất dữ liệu. Khóa ngoại nguoi_gui_id vẫn dùng UNIQUE tin_nhan_index_nguoi_gui_ma_gui (tạo trước) nên xoá được (không lỗi 1553).
    await queryRunner.query(
      'DROP INDEX `tin_nhan_index_nguoi_gui_thoi_diem` ON `tin_nhan`',
    );
  }
}
