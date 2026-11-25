import type { MigrationInterface, QueryRunner } from 'typeorm';

// notification P1 (issue #656, scope #10 "Thông báo"; PLAN notification 5.2): bảng `nhac_lich_hen` ghi việc gửi email nhắc lịch hẹn theo từng mốc (2.4.69).
// Bảng đã có trong docs/database/clinix_mysql.sql từ trước nhưng chưa migration nào tạo; job nhắc lịch (notification B3) cần bảng này.
// DDL TRÍCH NGUYÊN VĂN, không đổi chữ nào (migration-source.spec.ts so từng câu; schema-parity.int-spec.ts so SHOW CREATE TABLE).
// Sáu câu theo đúng thứ tự trong file chính thức: CREATE TABLE, chỉ mục, COMMENT bảng, khóa ngoại, hai CHECK.
// Khóa ngoại `lich_hen_id` là cột ĐẦU của khóa chính kép nên MySQL dùng luôn khóa chính, không sinh chỉ mục ngầm (MTB-08: bảng chỉ có hai chỉ mục).
export const TAO_BANG_NHAC_LICH_HEN_SQL: readonly string[] = [
  "CREATE TABLE `nhac_lich_hen` (\n  `lich_hen_id` bigint,\n  `so_gio_truoc` int COMMENT 'Mốc nhắc = số giờ trước giờ hẹn, là CHÍNH một phần tử của cau_hinh_he_thong.thoi_diem_nhac_lich tại lúc tạo dòng (không phải vị trí trong mảng nên đổi mảng không làm lệch lịch sử); >= 1 (chk_nhac_lich_hen_moc)',\n  `trang_thai` ENUM ('ChoGui', 'DaGui', 'ThatBai') NOT NULL DEFAULT 'ChoGui',\n  `so_lan_thu` int NOT NULL DEFAULT 0 COMMENT 'Số lần đã thử gửi, tăng khi nhận việc gửi',\n  `lan_thu_cuoi_luc` datetime,\n  `da_gui_luc` datetime COMMENT 'Chỉ có khi DaGui',\n  `loi_cuoi` varchar(500) COMMENT 'Bắt buộc khi ThatBai: lỗi của Dịch vụ Email ở lần thử cuối',\n  `thoi_diem_tao` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  PRIMARY KEY (`lich_hen_id`, `so_gio_truoc`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  'CREATE INDEX `nhac_lich_hen_index_trang_thai` ON `nhac_lich_hen` (`trang_thai`, `lan_thu_cuoi_luc`)',
  "ALTER TABLE `nhac_lich_hen` COMMENT = 'Ghi nhận việc gửi email nhắc lịch hẹn theo từng mốc (use case Gửi nhắc lịch hẹn theo lịch trình). Nhắc lịch chỉ qua email, không có thong_bao đi kèm. Dòng chỉ được tạo khi mốc đến hạn (INSERT ... ON DUPLICATE KEY UPDATE lich_hen_id = lich_hen_id; ROW_COUNT 1 = vừa tạo). Nhận việc gửi bằng UPDATE có điều kiện (trang_thai khác DaGui và so_lan_thu còn đúng giá trị đã đọc), chỉ worker có ROW_COUNT = 1 được gửi. Thử lại theo 2.4.69 (3 lần, cách 5 phút, chỉ khi lịch hẹn còn DaXacNhan và chưa tới giờ hẹn) là hằng số của service; hết lần thì giữ ThatBai, không gửi bù mốc khác. Lịch hẹn đổi giờ tạo lich_hen mới nên tự có bộ mốc mới. Chưa chốt [cần điền]: lần gửi đầu có tính vào số lần thử lại không; cho phép trễ tối đa bao lâu sau khi đạt mốc.'",
  'ALTER TABLE `nhac_lich_hen` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`)',
  'ALTER TABLE `nhac_lich_hen` ADD CONSTRAINT `chk_nhac_lich_hen_moc` CHECK (\n    `so_gio_truoc` >= 1\n)',
  "ALTER TABLE `nhac_lich_hen` ADD CONSTRAINT `chk_nhac_lich_hen_ket_qua` CHECK (\n    (`trang_thai` = 'ChoGui' AND `da_gui_luc` IS NULL)\n OR (`trang_thai` = 'DaGui' AND `da_gui_luc` IS NOT NULL AND `so_lan_thu` >= 1)\n OR (`trang_thai` = 'ThatBai' AND `da_gui_luc` IS NULL AND `loi_cuoi` IS NOT NULL AND `so_lan_thu` >= 1)\n)",
];

export class TaoBangNhacLichHen1794052800000 implements MigrationInterface {
  name = 'TaoBangNhacLichHen1794052800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of TAO_BANG_NHAC_LICH_HEN_SQL) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Khóa ngoại, chỉ mục và CHECK nằm trong bảng nên DROP TABLE là đủ. Không chặn khi bảng còn dòng (cùng nếp booking P6): chỉ mất nhật ký gửi nhắc lịch,
    // không mất dữ liệu nghiệp vụ (lịch hẹn, thông báo, tiền). HỆ QUẢ: sau `down` rồi `up`, bảng RỖNG; mốc nào còn trong cửa sổ có thể được nhắc lại một lần.
    await queryRunner.query('DROP TABLE `nhac_lich_hen`');
  }
}
