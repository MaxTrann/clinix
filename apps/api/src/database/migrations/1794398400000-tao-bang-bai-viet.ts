import type { MigrationInterface, QueryRunner } from 'typeorm';

// article B1 (issue #795, Epic #794; PLAN article 5.2, T4): bốn bảng `bai_viet`, `hashtag`, `bai_viet_hashtag`, `benh_nhan_danh_gia_bai_viet` lần đầu có migration (trước đây chỉ có DDL ở docs/database).
// Bảng `benh_nhan_danh_gia_bai_viet` được tạo ở đây dù mã đánh giá là việc của article B3 (rỗng, vô hại; tránh hai migration cho một khối DDL liền).
// DDL TRÍCH NGUYÊN VĂN, không đổi chữ nào (migration-source.spec.ts so từng câu; schema-parity.int-spec.ts so SHOW CREATE TABLE). Mười một câu theo đúng thứ tự trong file chính thức:
// bốn CREATE TABLE, hai chỉ mục, năm khóa ngoại. Bốn bảng không có CHECK và COMMENT bảng. `bai_viet` không có chỉ mục nào ngoài khóa chính và khóa ngoại (PLAN 5.10: đo ở X1 rồi mới hỏi Đại).
export const TAO_BANG_BAI_VIET_SQL: readonly string[] = [
  "CREATE TABLE `bai_viet` (\n  `bai_viet_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `tac_gia_id` bigint NOT NULL,\n  `tieu_de` varchar(255) NOT NULL,\n  `mo_ta_ngan` varchar(500),\n  `noi_dung` text NOT NULL,\n  `anh_dai_dien` varchar(255),\n  `trang_thai` ENUM ('BanNhap', 'DaXuatBan', 'LuuTruAn') NOT NULL DEFAULT 'BanNhap',\n  `thoi_diem_xuat_ban` datetime,\n  `thoi_diem_tao` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  `cap_nhat_lan_cuoi` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Tự cập nhật mỗi khi dòng thay đổi (ON UPDATE trong SQL)'\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  "CREATE TABLE `hashtag` (\n  `hashtag_id` bigint PRIMARY KEY AUTO_INCREMENT,\n  `ten` varchar(50) UNIQUE NOT NULL COMMENT 'Chuẩn hóa chữ thường',\n  `trang_thai_hoat_dong` boolean NOT NULL DEFAULT true\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  'CREATE TABLE `bai_viet_hashtag` (\n  `bai_viet_id` bigint,\n  `hashtag_id` bigint,\n  PRIMARY KEY (`bai_viet_id`, `hashtag_id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  "CREATE TABLE `benh_nhan_danh_gia_bai_viet` (\n  `benh_nhan_id` bigint,\n  `bai_viet_id` bigint,\n  `loai` ENUM ('Thich', 'KhongThich') NOT NULL,\n  PRIMARY KEY (`benh_nhan_id`, `bai_viet_id`)\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
  'CREATE INDEX `bai_viet_hashtag_index_23` ON `bai_viet_hashtag` (`hashtag_id`, `bai_viet_id`)',
  'CREATE INDEX `benh_nhan_danh_gia_bai_viet_index_24` ON `benh_nhan_danh_gia_bai_viet` (`bai_viet_id`, `loai`)',
  'ALTER TABLE `bai_viet` ADD FOREIGN KEY (`tac_gia_id`) REFERENCES `quan_tri_vien` (`tai_khoan_id`)',
  'ALTER TABLE `bai_viet_hashtag` ADD FOREIGN KEY (`bai_viet_id`) REFERENCES `bai_viet` (`bai_viet_id`)',
  'ALTER TABLE `bai_viet_hashtag` ADD FOREIGN KEY (`hashtag_id`) REFERENCES `hashtag` (`hashtag_id`)',
  'ALTER TABLE `benh_nhan_danh_gia_bai_viet` ADD FOREIGN KEY (`benh_nhan_id`) REFERENCES `benh_nhan` (`tai_khoan_id`)',
  'ALTER TABLE `benh_nhan_danh_gia_bai_viet` ADD FOREIGN KEY (`bai_viet_id`) REFERENCES `bai_viet` (`bai_viet_id`)',
];

export class TaoBangBaiViet1794398400000 implements MigrationInterface {
  name = 'TaoBangBaiViet1794398400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of TAO_BANG_BAI_VIET_SQL) {
      await queryRunner.query(statement);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // TỪ CHỐI khi còn bài viết hay thẻ (PLAN article T4): xoá bảng là mất nội dung biên tập thật, không hoàn tác được. Phải tự xử lý dữ liệu rồi mới hạ migration.
    // `bai_viet_hashtag` và phiếu đánh giá không thể còn dòng khi `bai_viet` rỗng (khóa ngoại), nên chỉ cần đếm `bai_viet` và `hashtag` (thẻ có thể còn khi bài đã mất, MH8).
    const checks: readonly (readonly [string, string])[] = [
      ['bai_viet', 'SELECT COUNT(*) AS n FROM `bai_viet`'],
      ['hashtag', 'SELECT COUNT(*) AS n FROM `hashtag`'],
    ];
    for (const [table, countSql] of checks) {
      const rows: { n: string | number }[] = await queryRunner.query(countSql);
      if (Number(rows[0]?.n ?? 0) > 0)
        throw new Error(
          `Không hạ migration bài viết khi bảng ${table} còn dữ liệu (xoá thủ công trước nếu thật sự muốn)`,
        );
    }
    // Thứ tự xoá theo khóa ngoại: phiếu đánh giá và dòng nối trỏ tới bai_viet; dòng nối còn trỏ tới hashtag.
    await queryRunner.query('DROP TABLE `benh_nhan_danh_gia_bai_viet`');
    await queryRunner.query('DROP TABLE `bai_viet_hashtag`');
    await queryRunner.query('DROP TABLE `hashtag`');
    await queryRunner.query('DROP TABLE `bai_viet`');
  }
}
