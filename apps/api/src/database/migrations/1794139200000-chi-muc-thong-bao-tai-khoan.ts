import type { MigrationInterface, QueryRunner } from 'typeorm';

// notification P2 (issue #657, scope #10 "Thông báo"; PLAN notification 5.2, Q8): chỉ mục cho danh sách "Tất cả" của Trung tâm thông báo
// (`WHERE tai_khoan_id = ? ORDER BY thoi_diem_tao DESC, thong_bao_id DESC LIMIT ? OFFSET ?`). Số đo X1 M1: `thong_bao_index_25` có `trang_thai_doc` đứng giữa
// nên câu không lọc trạng thái đọc phải filesort trên toàn bộ thông báo của tài khoản. Chỉ mục mới đi theo đúng thứ tự sắp xếp nên MySQL đọc ngược chỉ mục, không sắp lại.
// Văn bản trùng nguyên văn câu trong docs/database/clinix_mysql.sql (migration-source.spec.ts MTB-10). Chỉ THÊM chỉ mục: không đổi bảng, cột hay dữ liệu.
export const CHI_MUC_THONG_BAO_TAI_KHOAN_SQL =
  'CREATE INDEX `thong_bao_index_tai_khoan_thoi_diem` ON `thong_bao` (`tai_khoan_id`, `thoi_diem_tao`, `thong_bao_id`)';

export class ChiMucThongBaoTaiKhoan1794139200000 implements MigrationInterface {
  name = 'ChiMucThongBaoTaiKhoan1794139200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(CHI_MUC_THONG_BAO_TAI_KHOAN_SQL);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Chỉ xoá chỉ mục, không chặn: không mất dữ liệu. Khóa ngoại tai_khoan_id vẫn dùng thong_bao_index_25 (tạo trước) nên xoá được (không lỗi 1553).
    await queryRunner.query(
      'DROP INDEX `thong_bao_index_tai_khoan_thoi_diem` ON `thong_bao`',
    );
  }
}
