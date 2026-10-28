import type { MigrationInterface, QueryRunner } from 'typeorm';

// P7: bổ sung, không sửa migration đã áp dụng; DDL khớp canonical SQL.
export const TAO_BANG_ANH_SQL: readonly string[] = [
  `CREATE TABLE \`anh_tai_len\` (
  \`anh_tai_len_id\` char(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  \`public_id\` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  \`secure_url\` varchar(2048),
  \`nguoi_tai_len_id\` bigint NOT NULL,
  \`muc_dich\` varchar(32) NOT NULL DEFAULT 'ChuyenKhoa',
  \`trang_thai\` ENUM ('ChuaGan','DaGan','ChoXoa') NOT NULL DEFAULT 'ChuaGan',
  \`tao_luc\` datetime NOT NULL,
  \`het_han_gan_luc\` datetime NOT NULL,
  \`upload_xac_nhan_luc\` datetime,
  \`so_lan_thu_xoa\` int NOT NULL DEFAULT 0,
  \`thu_xoa_lai_luc\` datetime,
  \`khoa_don_token\` char(36) CHARACTER SET ascii COLLATE ascii_bin,
  \`khoa_don_den_luc\` datetime,
  \`ma_loi_cuoi\` varchar(64),
  UNIQUE KEY \`uq_anh_public_id\` (\`public_id\`),
  KEY \`ix_anh_don\` (\`trang_thai\`, \`thu_xoa_lai_luc\`, \`het_han_gan_luc\`),
  CONSTRAINT \`fk_anh_nguoi_tai\` FOREIGN KEY (\`nguoi_tai_len_id\`) REFERENCES \`tai_khoan\` (\`tai_khoan_id\`) ON DELETE RESTRICT,
  CONSTRAINT \`chk_anh_muc_dich\` CHECK (\`muc_dich\` = 'ChuyenKhoa'),
  CONSTRAINT \`chk_anh_so_lan\` CHECK (\`so_lan_thu_xoa\` BETWEEN 0 AND 5),
  CONSTRAINT \`chk_anh_xac_nhan\` CHECK ((\`upload_xac_nhan_luc\` IS NULL AND \`secure_url\` IS NULL) OR (\`upload_xac_nhan_luc\` IS NOT NULL AND \`secure_url\` IS NOT NULL)),
  CONSTRAINT \`chk_anh_da_gan\` CHECK (\`trang_thai\` <> 'DaGan' OR \`upload_xac_nhan_luc\` IS NOT NULL),
  CONSTRAINT \`chk_anh_khoa\` CHECK ((\`khoa_don_token\` IS NULL AND \`khoa_don_den_luc\` IS NULL) OR (\`khoa_don_token\` IS NOT NULL AND \`khoa_don_den_luc\` IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `ALTER TABLE \`chuyen_khoa\` ADD COLUMN \`anh_tai_len_id\` char(36) CHARACTER SET ascii COLLATE ascii_bin NULL`,
  `ALTER TABLE \`chuyen_khoa\` ADD UNIQUE KEY \`uq_chuyen_khoa_anh\` (\`anh_tai_len_id\`)`,
  `ALTER TABLE \`chuyen_khoa\` ADD CONSTRAINT \`fk_chuyen_khoa_anh\` FOREIGN KEY (\`anh_tai_len_id\`) REFERENCES \`anh_tai_len\` (\`anh_tai_len_id\`) ON DELETE RESTRICT`,
];

export class TaoBangAnh1793188800000 implements MigrationInterface {
  name = 'TaoBangAnh1793188800000';
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of TAO_BANG_ANH_SQL)
      await queryRunner.query(statement);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    // Không tự rollback khi dữ liệu đã được consumer dùng: tránh mất dấu Cloudinary.
    const rows: { total: string }[] = await queryRunner.query(
      'SELECT COUNT(*) AS total FROM anh_tai_len',
    );
    if (Number(rows[0]?.total ?? 0) > 0)
      throw new Error('P7 rollback cần xử lý ảnh đang quản lý trước');
    await queryRunner.query(
      'ALTER TABLE chuyen_khoa DROP FOREIGN KEY fk_chuyen_khoa_anh',
    );
    await queryRunner.query(
      'ALTER TABLE chuyen_khoa DROP INDEX uq_chuyen_khoa_anh',
    );
    await queryRunner.query(
      'ALTER TABLE chuyen_khoa DROP COLUMN anh_tai_len_id',
    );
    await queryRunner.query('DROP TABLE anh_tai_len');
  }
}
