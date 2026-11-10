import type { MigrationInterface, QueryRunner } from 'typeorm';

// Booking P6: bảng moc_hoan_tien (các mốc hoàn tiền theo dịch vụ khám: hủy trước giờ hẹn bao nhiêu giờ thì hoàn bao nhiêu %).
// DDL lấy nguyên văn từ docs/database/clinix_mysql.sql (schema-parity.int-spec.ts và MHT-01 so từng câu). Không sửa migration
// đã áp dụng. Bốn câu theo đúng thứ tự của file chính thức: CREATE TABLE, UNIQUE INDEX, khóa ngoại, CHECK (MHT-01, MHT-02 giữ
// thứ tự này). Cột đầu của chỉ mục UNIQUE là cột khóa ngoại nên khóa ngoại dùng luôn chỉ mục đó (MHT-04: bảng chỉ có hai chỉ mục).
// Đã đo (đột biến M8 của P6): đổi chỗ khóa ngoại và UNIQUE cho cùng bảng cuối cùng vì MySQL bỏ chỉ mục ngầm khi chỉ mục UNIQUE
// tạo sau dùng được; thứ tự ở đây chỉ để khớp văn bản file chính thức.
export const TAO_BANG_MOC_HOAN_TIEN_SQL: readonly string[] = [
  "CREATE TABLE `moc_hoan_tien` (\n  `moc_hoan_tien_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `dich_vu_kham_id` bigint NOT NULL,\n  `so_gio_truoc_toi_thieu` int NOT NULL COMMENT 'Hủy trước giờ hẹn ít nhất bấy nhiêu giờ thì áp dụng tỷ lệ này',\n  `ty_le_hoan` tinyint NOT NULL COMMENT 'Ràng buộc: 0 đến 100. Ví dụ [đề xuất]: 24 giờ -> 100, 2 giờ -> 50, 0 giờ -> 0'\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  'CREATE UNIQUE INDEX `moc_hoan_tien_index_1` ON `moc_hoan_tien` (`dich_vu_kham_id`, `so_gio_truoc_toi_thieu`)',
  'ALTER TABLE `moc_hoan_tien` ADD FOREIGN KEY (`dich_vu_kham_id`) REFERENCES `dich_vu_kham` (`dich_vu_kham_id`)',
  'ALTER TABLE `moc_hoan_tien` ADD CONSTRAINT `chk_moc_hoan_ty_le` CHECK (\n    `ty_le_hoan` BETWEEN 0 AND 100\n)',
];

export class TaoBangMocHoanTien1793534400000 implements MigrationInterface {
  name = 'TaoBangMocHoanTien1793534400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of TAO_BANG_MOC_HOAN_TIEN_SQL) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Khóa ngoại và chỉ mục nằm trong bảng nên DROP TABLE là đủ; không chặn khi bảng còn dòng (khác P7), vì chỉ mất chính
    // cấu hình mốc: mỗi lịch hẹn đã đặt giữ bản chụp chính sách ở lich_hen.chinh_sach_hoan_snapshot (Q15).
    // HỆ QUẢ: sau `down` rồi `up`, bảng RỖNG. Dịch vụ có tiền cọc > 0 đặt lịch trong lúc đó sẽ chụp snapshot `[]`
    // (nghĩa là không hoàn tiền) cho tới khi Admin nhập lại các mốc.
    await queryRunner.query('DROP TABLE `moc_hoan_tien`');
  }
}
