import type { MigrationInterface, QueryRunner } from 'typeorm';

// Booking P7 (Q29, phương án A): thong_bao.lich_hen_id + UNIQUE + khóa ngoại để thông báo của một lịch hẹn
// không bị ghi trùng. Đây là migration ĐẦU TIÊN SỬA một bảng đã có nên dùng ALTER, không CREATE TABLE.
// Văn bản phải khớp docs/database/clinix_mysql.sql: chỉ mục và khóa ngoại trùng nguyên văn câu trong file,
// câu ADD COLUMN dùng đúng dòng cột của CREATE TABLE `thong_bao` (migration-source.spec.ts, TBLH-01, so từng ký tự).
// Cột nullable, không DEFAULT nên dòng cũ không phải điền lại. Chỉ mục tạo TRƯỚC khóa ngoại để MySQL không sinh chỉ mục ngầm.
export const THONG_BAO_LICH_HEN_UP_SQL: readonly string[] = [
  "ALTER TABLE `thong_bao` ADD COLUMN `lich_hen_id` bigint COMMENT 'Chỉ có với thông báo sinh từ một lịch hẹn (xác nhận, hủy, vắng mặt, khóa đặt lịch do no-show); các thông báo khác để trống. Cùng (lịch hẹn, tài khoản, loại sự kiện) chỉ có 1 thông báo nên ghi lại hoặc chạy lại không tạo thông báo trùng' AFTER `yeu_cau_thay_doi_chi_nhanh_id`",
  'CREATE UNIQUE INDEX `thong_bao_index_lich_hen` ON `thong_bao` (`lich_hen_id`, `tai_khoan_id`, `loai_su_kien`)',
  'ALTER TABLE `thong_bao` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`)',
];

export class ThongBaoLichHen1793448000000 implements MigrationInterface {
  name = 'ThongBaoLichHen1793448000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of THONG_BAO_LICH_HEN_UP_SQL) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Còn thông báo gắn lịch hẹn thì DROP COLUMN làm mất liên kết không khôi phục được: chặn, không đổi gì
    // (cùng tinh thần migration ảnh và nhật ký: không làm mất dấu vết).
    const [used] = (await queryRunner.query(
      'SELECT COUNT(*) AS total FROM `thong_bao` WHERE `lich_hen_id` IS NOT NULL',
    )) as { total: string | number }[];
    if (Number(used?.total ?? 0) > 0) {
      throw new Error(
        `Không hoàn tác được ${this.name}: còn ${String(used?.total)} thông báo gắn lịch hẹn (thong_bao.lich_hen_id khác NULL).`,
      );
    }

    // Thứ tự: khóa ngoại -> chỉ mục -> cột. MySQL không cho xóa chỉ mục đang phục vụ khóa ngoại (lỗi 1553) hay
    // xóa cột thuộc khóa ngoại (lỗi 1828). Khóa ngoại khai không tên nên MySQL tự đặt (thong_bao_ibfk_N): tra tên thật.
    const foreignKeys = (await queryRunner.query(
      'SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE ' +
        'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME = ?',
      ['thong_bao', 'lich_hen_id', 'lich_hen'],
    )) as { name: string }[];
    for (const { name } of foreignKeys) {
      await queryRunner.query(
        `ALTER TABLE \`thong_bao\` DROP FOREIGN KEY \`${name}\``,
      );
    }
    await queryRunner.query(
      'DROP INDEX `thong_bao_index_lich_hen` ON `thong_bao`',
    );
    await queryRunner.query(
      'ALTER TABLE `thong_bao` DROP COLUMN `lich_hen_id`',
    );
  }
}
