import type { MigrationInterface, QueryRunner } from 'typeorm';

// Tạo sáu bảng danh mục admin. Các câu DDL được chép nguyên văn theo thứ tự từ
// docs/database/clinix_mysql.sql; schema-parity.int-spec.ts kiểm từng câu và SHOW CREATE TABLE.
export const TAO_BANG_DANH_MUC_SQL: readonly string[] = [
  `CREATE TABLE \`chi_nhanh\` (
  \`chi_nhanh_id\` bigint PRIMARY KEY AUTO_INCREMENT,
  \`ten\` varchar(100) NOT NULL,
  \`dia_chi\` varchar(255) NOT NULL,
  \`toa_do_lat\` decimal(10,7),
  \`toa_do_lng\` decimal(10,7)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE \`chi_nhanh_lich_hoat_dong\` (
  \`chi_nhanh_id\` bigint,
  \`thu_trong_tuan\` tinyint COMMENT '1 = Thứ Hai ... 7 = Chủ nhật (ISO 8601), khớp WEEKDAY(ngay) + 1 của MySQL. Ràng buộc: 1 đến 7',
  \`hoat_dong\` boolean NOT NULL COMMENT 'true = chi nhánh nhận khám vào thứ này (có ít nhất một khoảng nhận khám đầy đủ); false = nghỉ cả ngày (cả bốn cột giờ để trống). chk_lich_hoat_dong_ngay giữ cột này khớp với các khoảng nên đây không phải nguồn chỉnh sửa độc lập',
  \`gio_bat_dau_sang\` time COMMENT 'Khoảng nhận khám buổi sáng (ca CaSang), cùng gio_ket_thuc_sang: cả hai để trống = không có buổi sáng; có thì bắt đầu < kết thúc',
  \`gio_ket_thuc_sang\` time COMMENT 'Xem gio_bat_dau_sang. Phải <= gio_bat_dau_chieu khi có cả hai khoảng (không chồng nhau; chạm nhau là hợp lệ); không qua đêm (trong 00:00:00 đến 23:59:59)',
  \`gio_bat_dau_chieu\` time COMMENT 'Khoảng nhận khám buổi chiều (ca CaChieu), cùng gio_ket_thuc_chieu: cả hai để trống = không có buổi chiều; có thì bắt đầu < kết thúc',
  \`gio_ket_thuc_chieu\` time COMMENT 'Xem gio_bat_dau_chieu. Không qua đêm (trong 00:00:00 đến 23:59:59)',
  PRIMARY KEY (\`chi_nhanh_id\`, \`thu_trong_tuan\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE \`chuyen_khoa\` (
  \`chuyen_khoa_id\` bigint PRIMARY KEY AUTO_INCREMENT,
  \`ten\` varchar(100) NOT NULL COMMENT 'Lĩnh vực chuyên môn của bác sĩ. Ví dụ: Cơ Xương Khớp, Thần kinh, Tiêu hóa, Nội tổng quát, Y học gia đình, Tâm thần',
  \`mo_ta\` text,
  \`anh_dai_dien\` varchar(255) COMMENT 'Đường dẫn ảnh minh họa hiển thị trên thẻ chuyên khoa; có thể để trống',
  \`trang_thai_hoat_dong\` ENUM ('DangHoatDong', 'NgungHoatDong') NOT NULL DEFAULT 'DangHoatDong'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE \`nhom_dich_vu\` (
  \`nhom_dich_vu_id\` bigint PRIMARY KEY AUTO_INCREMENT,
  \`ten\` varchar(100) UNIQUE NOT NULL COMMENT 'Ví dụ: Khám chuyên khoa, Khám tổng quát, Khám từ xa, Xét nghiệm y học, Sức khỏe tinh thần, Khám nha khoa',
  \`thu_tu_hien_thi\` int NOT NULL DEFAULT 0 COMMENT '[đề xuất] Thứ tự hiển thị trên màn điều hướng'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE \`dich_vu_kham\` (
  \`dich_vu_kham_id\` bigint PRIMARY KEY AUTO_INCREMENT,
  \`nhom_dich_vu_id\` bigint NOT NULL,
  \`ten\` varchar(100) NOT NULL,
  \`thoi_luong\` int NOT NULL COMMENT 'phút',
  \`gia_mac_dinh\` decimal(12,2) NOT NULL,
  \`muc_dat_coc\` decimal(12,2) NOT NULL DEFAULT 0 COMMENT 'Mức cọc cố định theo dịch vụ; 0 = không đặt cọc'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE \`chi_nhanh_dich_vu_kham\` (
  \`chi_nhanh_id\` bigint,
  \`dich_vu_kham_id\` bigint,
  PRIMARY KEY (\`chi_nhanh_id\`, \`dich_vu_kham_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE UNIQUE INDEX \`chuyen_khoa_index_ten\` ON \`chuyen_khoa\` (\`ten\`)`,
  `CREATE UNIQUE INDEX \`dich_vu_kham_index_nhom_ten\` ON \`dich_vu_kham\` (\`nhom_dich_vu_id\`, \`ten\`)`,
  `ALTER TABLE \`nhom_dich_vu\` COMMENT = 'Chỉ để phân loại và điều hướng, không dùng trực tiếp để đặt lịch hay tính giá.'`,
  `ALTER TABLE \`chi_nhanh_dich_vu_kham\` COMMENT = 'Dịch vụ của bác sĩ phải nằm trong danh sách này của chi nhánh bác sĩ công tác. Lúc đặt lịch, cặp (chi nhánh, dịch vụ) cũng phải có ở đây. Bỏ một dịch vụ khỏi danh sách đang có lịch hẹn Chờ thanh toán/Đã xác nhận thì phải đi qua yeu_cau_thay_doi_chi_nhanh.'`,
  `ALTER TABLE \`chi_nhanh\` COMMENT = 'Ngày và giờ hoạt động nằm ở bảng con chi_nhanh_lich_hoat_dong (mỗi thứ trong tuần 1 dòng); 2 cột gio_mo_cua/gio_dong_cua chung của bản trước (17/10/2026) đã bỏ. Chi nhánh mới phải có đủ 7 dòng lịch hoạt động (service); thứ chưa khai báo coi như chưa khai báo và không nhận phân công, không nhận đặt lịch.'`,
  `ALTER TABLE \`chi_nhanh_lich_hoat_dong\` COMMENT = 'Lịch NHẬN KHÁM hằng tuần của chi nhánh, mỗi thứ tối đa 1 dòng và tối đa 2 khoảng nhận khám: buổi sáng (gio_bat_dau_sang đến gio_ket_thuc_sang, dùng cho ca CaSang) và buổi chiều (gio_bat_dau_chieu đến gio_ket_thuc_chieu, dùng cho ca CaChieu); mỗi khoảng có thể không tồn tại (cả hai giờ để trống). Ngày nghỉ: hoat_dong = false và cả bốn giờ để trống. Ngày hoạt động: có ít nhất một khoảng đầy đủ, bắt đầu < kết thúc, hai khoảng không chồng nhau (kết thúc sáng <= bắt đầu chiều), không có ca qua đêm (chk_lich_hoat_dong_khoang, chk_lich_hoat_dong_khong_chong, chk_lich_hoat_dong_ngay). Giờ mở và giờ đóng tổng quát để hiển thị KHÔNG lưu riêng mà suy ra từ các khoảng (giờ bắt đầu sớm nhất, giờ kết thúc muộn nhất; truy vấn mẫu cuối file). Giờ lưu ở đây là giờ nhận khám: khung giờ đặt khám phải nằm trọn trong một khoảng. Giờ mở cửa tiếp đón (nếu sớm hơn giờ nhận khám) chưa có chỗ lưu [cần điền: 07:30 trong giao diện minh họa là giờ bắt đầu nhận khám hay chỉ giờ mở cửa tiếp đón]. Chưa có lịch nghỉ lễ (chưa có quyết định). Là trạng thái ĐANG ÁP DỤNG: thay đổi ảnh hưởng lịch hẹn chỉ được ghi vào đây khi đến hieu_luc_tu của yeu_cau_thay_doi_chi_nhanh. DB không chặn phân công/đặt lịch ngoài khoảng nhận khám hoặc vào ca không tồn tại: service kiểm tra (truy vấn mẫu cuối file).'`,
  `ALTER TABLE \`dich_vu_kham\` ADD FOREIGN KEY (\`nhom_dich_vu_id\`) REFERENCES \`nhom_dich_vu\` (\`nhom_dich_vu_id\`)`,
  `ALTER TABLE \`chi_nhanh_dich_vu_kham\` ADD FOREIGN KEY (\`chi_nhanh_id\`) REFERENCES \`chi_nhanh\` (\`chi_nhanh_id\`)`,
  `ALTER TABLE \`chi_nhanh_dich_vu_kham\` ADD FOREIGN KEY (\`dich_vu_kham_id\`) REFERENCES \`dich_vu_kham\` (\`dich_vu_kham_id\`)`,
  `ALTER TABLE \`chi_nhanh_lich_hoat_dong\` ADD FOREIGN KEY (\`chi_nhanh_id\`) REFERENCES \`chi_nhanh\` (\`chi_nhanh_id\`)`,
  `ALTER TABLE \`chi_nhanh_lich_hoat_dong\` ADD CONSTRAINT \`chk_lich_hoat_dong_thu\` CHECK (
    \`thu_trong_tuan\` BETWEEN 1 AND 7
)`,
  `ALTER TABLE \`chi_nhanh_lich_hoat_dong\` ADD CONSTRAINT \`chk_lich_hoat_dong_khoang\` CHECK (
    ((\`gio_bat_dau_sang\` IS NULL AND \`gio_ket_thuc_sang\` IS NULL)
      OR (\`gio_bat_dau_sang\` IS NOT NULL AND \`gio_ket_thuc_sang\` IS NOT NULL AND \`gio_bat_dau_sang\` >= '00:00:00' AND \`gio_bat_dau_sang\` < \`gio_ket_thuc_sang\` AND \`gio_ket_thuc_sang\` <= '23:59:59'))
    AND ((\`gio_bat_dau_chieu\` IS NULL AND \`gio_ket_thuc_chieu\` IS NULL)
      OR (\`gio_bat_dau_chieu\` IS NOT NULL AND \`gio_ket_thuc_chieu\` IS NOT NULL AND \`gio_bat_dau_chieu\` >= '00:00:00' AND \`gio_bat_dau_chieu\` < \`gio_ket_thuc_chieu\` AND \`gio_ket_thuc_chieu\` <= '23:59:59'))
)`,
  `ALTER TABLE \`chi_nhanh_lich_hoat_dong\` ADD CONSTRAINT \`chk_lich_hoat_dong_khong_chong\` CHECK (
    \`gio_ket_thuc_sang\` IS NULL OR \`gio_bat_dau_chieu\` IS NULL OR \`gio_ket_thuc_sang\` <= \`gio_bat_dau_chieu\`
)`,
  `ALTER TABLE \`chi_nhanh_lich_hoat_dong\` ADD CONSTRAINT \`chk_lich_hoat_dong_ngay\` CHECK (
    (\`hoat_dong\` = 1 AND (\`gio_bat_dau_sang\` IS NOT NULL OR \`gio_bat_dau_chieu\` IS NOT NULL))
 OR (\`hoat_dong\` = 0 AND \`gio_bat_dau_sang\` IS NULL AND \`gio_ket_thuc_sang\` IS NULL AND \`gio_bat_dau_chieu\` IS NULL AND \`gio_ket_thuc_chieu\` IS NULL)
)`,
];

const CATALOG_TABLES = [
  'chi_nhanh',
  'chi_nhanh_lich_hoat_dong',
  'chuyen_khoa',
  'nhom_dich_vu',
  'dich_vu_kham',
  'chi_nhanh_dich_vu_kham',
] as const;

type DuplicateSpecialty = {
  id: string;
  ten: string;
  ten_chuan_hoa: string;
};

type DuplicateService = DuplicateSpecialty & { nhom_dich_vu_id: string };

async function assertCatalogIsReady(queryRunner: QueryRunner): Promise<void> {
  const existingTables: string[] = [];
  for (const table of CATALOG_TABLES) {
    if (await queryRunner.hasTable(table)) existingTables.push(table);
  }

  const duplicates: string[] = [];
  if (existingTables.includes('chuyen_khoa')) {
    const result = await queryRunner.query(`
      SELECT id, ten, ten_chuan_hoa
      FROM (
        SELECT
          chuyen_khoa_id AS id,
          ten,
          TRIM(REGEXP_REPLACE(ten, '[[:space:]]+', ' ')) AS ten_chuan_hoa,
          COUNT(*) OVER (
            PARTITION BY TRIM(REGEXP_REPLACE(ten, '[[:space:]]+', ' ')) COLLATE utf8mb4_unicode_ci
          ) AS so_ban_ghi
        FROM chuyen_khoa
      ) AS ten_chuyen_khoa_trung
      WHERE so_ban_ghi > 1
      ORDER BY ten_chuan_hoa, id
    `, [], true);
    const rows = result.records as DuplicateSpecialty[];
    for (const row of rows) {
      duplicates.push(
        `CK id=${row.id}, ten=${JSON.stringify(row.ten)}, sau chuẩn hóa=${JSON.stringify(row.ten_chuan_hoa)}`,
      );
    }
  }

  if (existingTables.includes('dich_vu_kham')) {
    const result = await queryRunner.query(`
      SELECT id, nhom_dich_vu_id, ten, ten_chuan_hoa
      FROM (
        SELECT
          dich_vu_kham_id AS id,
          nhom_dich_vu_id,
          ten,
          TRIM(REGEXP_REPLACE(ten, '[[:space:]]+', ' ')) AS ten_chuan_hoa,
          COUNT(*) OVER (
            PARTITION BY
              nhom_dich_vu_id,
              TRIM(REGEXP_REPLACE(ten, '[[:space:]]+', ' ')) COLLATE utf8mb4_unicode_ci
          ) AS so_ban_ghi
        FROM dich_vu_kham
      ) AS ten_dich_vu_trung
      WHERE so_ban_ghi > 1
      ORDER BY nhom_dich_vu_id, ten_chuan_hoa, id
    `, [], true);
    const rows = result.records as DuplicateService[];
    for (const row of rows) {
      duplicates.push(
        `DV id=${row.id}, nhom_dich_vu_id=${row.nhom_dich_vu_id}, ten=${JSON.stringify(row.ten)}, sau chuẩn hóa=${JSON.stringify(row.ten_chuan_hoa)}`,
      );
    }
  }

  if (duplicates.length > 0) {
    throw new Error(
      [
        'Dừng migration danh mục: còn tên trùng sau chuẩn hóa; chưa thực hiện DDL nào.',
        `Bảng có sẵn: ${existingTables.join(', ')}.`,
        ...duplicates,
        'Hãy đối chiếu và xử lý dữ liệu trước khi chạy lại migration; migration không tự xóa hoặc gộp bản ghi.',
      ].join('\n'),
    );
  }

  if (existingTables.length > 0) {
    throw new Error(
      [
        'Dừng migration danh mục trước DDL: phát hiện bảng đã có sẵn.',
        `Bảng: ${existingTables.join(', ')}.`,
        'Đối chiếu schema và dữ liệu thủ công; migration chỉ tạo danh mục trên DB chưa có các bảng này.',
      ].join('\n'),
    );
  }
}

export class TaoBangDanhMuc1793024340000 implements MigrationInterface {
  name = 'TaoBangDanhMuc1793024340000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await assertCatalogIsReady(queryRunner);
    for (const statement of TAO_BANG_DANH_MUC_SQL) {
      await queryRunner.query(statement);
    }
  }

  // Gỡ bảng con/liên kết trước, rồi mới gỡ bảng cha được tham chiếu bằng khóa ngoại.
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `chi_nhanh_dich_vu_kham`');
    await queryRunner.query('DROP TABLE `chi_nhanh_lich_hoat_dong`');
    await queryRunner.query('DROP TABLE `dich_vu_kham`');
    await queryRunner.query('DROP TABLE `chuyen_khoa`');
    await queryRunner.query('DROP TABLE `nhom_dich_vu`');
    await queryRunner.query('DROP TABLE `chi_nhanh`');
  }
}
