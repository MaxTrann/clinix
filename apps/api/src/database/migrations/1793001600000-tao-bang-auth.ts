import type { MigrationInterface, QueryRunner } from 'typeorm';

// Tạo 5 bảng của module auth: tai_khoan, benh_nhan, ma_xac_thuc, phien_dang_nhap, vi_noi_bo.
// DDL được SAO CHÉP NGUYÊN VĂN từ docs/database/clinix_mysql.sql (theo đúng thứ tự trong file đó: bảng, chỉ mục,
// khóa ngoại, CHECK). Sửa schema thì sửa 3 file docs/database trước, rồi cập nhật lại mảng này cho khớp:
// bài test schema-parity.int-spec.ts so sánh cả văn bản lẫn kết quả SHOW CREATE TABLE với file SQL chính thức.
export const TAO_BANG_AUTH_SQL: readonly string[] = [
  `CREATE TABLE \`tai_khoan\` (
  \`tai_khoan_id\` bigint PRIMARY KEY AUTO_INCREMENT,
  \`ho_ten\` varchar(100) NOT NULL,
  \`ngay_sinh\` date COMMENT 'Có thể để trống: lúc đăng ký chỉ nhập họ tên, email, SĐT, mật khẩu',
  \`gioi_tinh\` varchar(10) COMMENT 'Có thể để trống (như ngày sinh)',
  \`so_dien_thoai\` varchar(20) NOT NULL,
  \`anh_dai_dien\` varchar(255),
  \`dia_chi\` varchar(255),
  \`email\` varchar(255) UNIQUE NOT NULL,
  \`mat_khau_bam\` varchar(255) COMMENT 'NULL chỉ khi trang_thai = ChoKichHoat (nhân sự chưa tự đặt mật khẩu qua liên kết kích hoạt). DangHoatDong bắt buộc có mật khẩu (chk_tai_khoan_mat_khau)',
  \`trang_thai\` ENUM ('ChoKichHoat', 'DangHoatDong', 'NgungHoatDong') NOT NULL DEFAULT 'DangHoatDong' COMMENT 'ChoKichHoat chỉ cho nhân sự vừa tạo, chưa đăng nhập được; chỉ chuyển sang DangHoatDong khi nhân sự đặt mật khẩu qua liên kết kích hoạt, không chuyển bằng Mở khóa',
  \`da_xac_minh_email\` boolean NOT NULL DEFAULT false COMMENT 'false thì không được đặt lịch. Đăng ký tạo tài khoản ngay với false; OTP đúng thì đặt true. Tài khoản Bệnh nhân chưa xác minh bị xóa sau 24 giờ kể từ thoi_diem_tao (không gia hạn khi gửi lại OTP; không bao giờ xóa tài khoản nhân sự). Nhân sự: đặt true khi kích hoạt thành công vì liên kết gửi tới đúng email này [đề xuất]',
  \`so_lan_dang_nhap_sai\` int NOT NULL DEFAULT 0 COMMENT 'Số lần đăng nhập sai liên tiếp, về 0 khi đăng nhập đúng. Email không tồn tại thì không đếm',
  \`khoa_dang_nhap_den\` datetime COMMENT 'Còn ở tương lai thì đang bị khóa đăng nhập (5 lần sai liên tiếp, khóa 15 phút); NULL = không khóa',
  \`loai_tai_khoan\` ENUM ('BenhNhan', 'BacSi', 'LeTan', 'QuanTriVien') NOT NULL COMMENT 'Cột đề xuất thêm để biết nhanh loại tài khoản, không cần JOIN 4 bảng con',
  \`thoi_diem_tao\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm đăng ký tài khoản'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE \`benh_nhan\` (
  \`tai_khoan_id\` bigint PRIMARY KEY,
  \`khoa_dat_lich_do_no_show\` boolean NOT NULL DEFAULT false COMMENT 'Quản trị viên mở khóa thủ công nên là trạng thái độc lập',
  \`so_lan_no_show\` int NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE \`ma_xac_thuc\` (
  \`ma_xac_thuc_id\` bigint PRIMARY KEY AUTO_INCREMENT,
  \`tai_khoan_id\` bigint NOT NULL,
  \`loai\` ENUM ('DangKy', 'QuenMatKhau', 'KichHoatNhanSu') NOT NULL,
  \`ma_bam\` varchar(255) NOT NULL COMMENT 'Lưu bản băm, không lưu bản rõ: OTP (DangKy, QuenMatKhau) = HMAC-SHA-256 với khóa bí mật riêng, dữ liệu băm gồm tai_khoan_id, loai, ma_xac_thuc_id và mã (không dùng SHA-256 trơn); liên kết kích hoạt = băm của token',
  \`het_han_luc\` datetime NOT NULL,
  \`da_dung_luc\` datetime COMMENT 'Để trống = chưa dùng; liên kết kích hoạt chỉ dùng 1 lần',
  \`da_gui_luc\` datetime COMMENT 'Thời điểm dịch vụ email xác nhận đã gửi THÀNH CÔNG; để trống = mới tạo hoặc gửi lỗi, chưa có hiệu lực. KichHoatNhanSu: liên kết chưa gửi thì chưa hợp lệ. OTP (DangKy, QuenMatKhau): mã chưa gửi thành công không xác minh được và không thay thế mã cũ; chỉ mã mới nhất ĐÃ GỬI THÀNH CÔNG mới thay thế mã cũ',
  \`thu_hoi_luc\` datetime COMMENT 'Thời điểm mã bị vô hiệu; để trống = chưa thu hồi. KichHoatNhanSu: gửi lại thành công thì liên kết cũ bị thu hồi; liên kết mới gửi thất bại thì chính nó bị thu hồi. OTP: bị thu hồi khi mã mới gửi thành công, khi gửi lỗi (chính hàng mới), khi nhập sai đủ 5 lần, hoặc khi đặt lại mật khẩu thành công trên tài khoản chưa xác minh',
  \`kich_hoat_dang_hieu_luc\` bigint GENERATED ALWAYS AS (IF(\`loai\` = 'KichHoatNhanSu' AND \`da_gui_luc\` IS NOT NULL AND \`thu_hoi_luc\` IS NULL AND \`da_dung_luc\` IS NULL, \`tai_khoan_id\`, NULL)) STORED UNIQUE COMMENT 'Bằng tai_khoan_id khi liên kết kích hoạt đã gửi, chưa thu hồi, chưa dùng; NULL ở mọi trường hợp khác. UNIQUE => mỗi tài khoản tối đa 1 liên kết kích hoạt hợp lệ (hết hạn kiểm tra ở service)',
  \`so_lan_nhap_sai\` int NOT NULL DEFAULT 0 COMMENT 'Số lần nhập sai của MÃ NÀY (OTP: đủ 5 lần thì thu hồi mã)',
  \`tao_luc\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Dùng đếm giới hạn gửi lại OTP: cách mã trước ≥ 60 giây, tối đa 5 mã/giờ theo (tai_khoan_id, loai); tính cả hàng gửi lỗi',
  \`ho_ten_dang_ky\` varchar(100) COMMENT 'Chỉ loai = DangKy: họ tên của LẦN ĐĂNG KÝ gắn với mã này; chỉ được ghi vào tai_khoan khi chính mã này được xác minh đúng. NULL khi không phải DangKy, hoặc sau khi mã đã dùng/bị thu hồi do đặt lại mật khẩu (ba cột dữ liệu đăng ký cùng NULL hoặc cùng có giá trị: chk_ma_xac_thuc_du_lieu_dang_ky)',
  \`so_dien_thoai_dang_ky\` varchar(20) COMMENT 'Số điện thoại của lần đăng ký này (xem ho_ten_dang_ky)',
  \`mat_khau_bam_dang_ky\` varchar(255) COMMENT 'Bản băm Argon2id của mật khẩu của lần đăng ký này, không bao giờ lưu bản rõ (xem ho_ten_dang_ky)'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE \`phien_dang_nhap\` (
  \`phien_dang_nhap_id\` bigint PRIMARY KEY AUTO_INCREMENT,
  \`tai_khoan_id\` bigint NOT NULL,
  \`refresh_token_bam\` varchar(255) UNIQUE NOT NULL COMMENT 'Lưu SHA-256 của refresh token (chuỗi ngẫu nhiên 256 bit, dạng sid.ngẫu nhiên.chữ ký), không lưu bản rõ; thay bằng băm mới mỗi lần làm mới (xoay tại chỗ)',
  \`tao_luc\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm đăng nhập; mốc tính trần tuyệt đối 8 giờ',
  \`het_han_luc\` datetime NOT NULL COMMENT 'Hết hạn trượt: lúc đăng nhập = tao_luc + 30 phút (không hoạt động); mỗi lần làm mới = min(bây giờ + 30 phút, tao_luc + 8 giờ). Quá het_han_luc hoặc quá trần 8 giờ kể từ tao_luc thì refresh bị từ chối',
  \`thu_hoi_luc\` datetime COMMENT 'Để trống = còn hiệu lực. Ghi thời điểm khi: đăng xuất, phát hiện dùng lại refresh token cũ, đặt lại hoặc đổi mật khẩu (các phiên khác), khóa tài khoản'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE \`vi_noi_bo\` (
  \`vi_noi_bo_id\` bigint PRIMARY KEY AUTO_INCREMENT,
  \`benh_nhan_id\` bigint UNIQUE NOT NULL,
  \`so_du\` decimal(12,2) NOT NULL DEFAULT 0,
  \`so_tien_dang_giu\` decimal(12,2) NOT NULL DEFAULT 0 COMMENT 'Tiền đang giữ cho yêu cầu rút chờ duyệt'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE INDEX \`ma_xac_thuc_index_0\` ON \`ma_xac_thuc\` (\`tai_khoan_id\`, \`loai\`, \`het_han_luc\`)`,
  `CREATE INDEX \`ma_xac_thuc_index_tao_luc\` ON \`ma_xac_thuc\` (\`tai_khoan_id\`, \`loai\`, \`tao_luc\`)`,
  `CREATE INDEX \`phien_dang_nhap_index_tai_khoan\` ON \`phien_dang_nhap\` (\`tai_khoan_id\`, \`thu_hoi_luc\`)`,
  `ALTER TABLE \`vi_noi_bo\` COMMENT = 'Ràng buộc: so_du >= 0, so_tien_dang_giu >= 0 và so_tien_dang_giu <= so_du. Số dư khả dụng = so_du - so_tien_dang_giu (tính khi đọc, không lưu). Ví được tạo cùng giao dịch với benh_nhan khi xác minh OTP đăng ký (so_du = 0, so_tien_dang_giu = 0); mỗi bệnh nhân đúng một ví.'`,
  `ALTER TABLE \`benh_nhan\` ADD FOREIGN KEY (\`tai_khoan_id\`) REFERENCES \`tai_khoan\` (\`tai_khoan_id\`)`,
  `ALTER TABLE \`ma_xac_thuc\` ADD FOREIGN KEY (\`tai_khoan_id\`) REFERENCES \`tai_khoan\` (\`tai_khoan_id\`)`,
  `ALTER TABLE \`phien_dang_nhap\` ADD FOREIGN KEY (\`tai_khoan_id\`) REFERENCES \`tai_khoan\` (\`tai_khoan_id\`)`,
  `ALTER TABLE \`vi_noi_bo\` ADD FOREIGN KEY (\`benh_nhan_id\`) REFERENCES \`benh_nhan\` (\`tai_khoan_id\`)`,
  `ALTER TABLE \`tai_khoan\` ADD CONSTRAINT \`chk_tai_khoan_mat_khau\` CHECK (
    (\`trang_thai\` = 'ChoKichHoat' AND \`mat_khau_bam\` IS NULL)
 OR (\`trang_thai\` = 'DangHoatDong' AND \`mat_khau_bam\` IS NOT NULL)
 OR \`trang_thai\` = 'NgungHoatDong'
)`,
  `ALTER TABLE \`tai_khoan\` ADD CONSTRAINT \`chk_tai_khoan_cho_kich_hoat_nhan_su\` CHECK (
    \`trang_thai\` <> 'ChoKichHoat' OR \`loai_tai_khoan\` <> 'BenhNhan'
)`,
  `ALTER TABLE \`ma_xac_thuc\` ADD CONSTRAINT \`chk_ma_xac_thuc_dung_hoac_thu_hoi\` CHECK (
    \`da_dung_luc\` IS NULL OR \`thu_hoi_luc\` IS NULL
)`,
  `ALTER TABLE \`ma_xac_thuc\` ADD CONSTRAINT \`chk_ma_xac_thuc_kich_hoat_da_gui\` CHECK (
    \`loai\` <> 'KichHoatNhanSu' OR \`da_dung_luc\` IS NULL OR \`da_gui_luc\` IS NOT NULL
)`,
  `ALTER TABLE \`ma_xac_thuc\` ADD CONSTRAINT \`chk_ma_xac_thuc_du_lieu_dang_ky\` CHECK (
    (\`ho_ten_dang_ky\` IS NULL AND \`so_dien_thoai_dang_ky\` IS NULL AND \`mat_khau_bam_dang_ky\` IS NULL)
 OR (\`loai\` = 'DangKy' AND \`ho_ten_dang_ky\` IS NOT NULL AND \`so_dien_thoai_dang_ky\` IS NOT NULL AND \`mat_khau_bam_dang_ky\` IS NOT NULL)
)`,
  `ALTER TABLE \`vi_noi_bo\` ADD CONSTRAINT \`chk_vi_so_du\` CHECK (
    \`so_du\` >= 0 AND \`so_tien_dang_giu\` >= 0 AND \`so_tien_dang_giu\` <= \`so_du\`
)`,
];

export class TaoBangAuth1793001600000 implements MigrationInterface {
  name = 'TaoBangAuth1793001600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of TAO_BANG_AUTH_SQL) {
      await queryRunner.query(statement);
    }
  }

  // Xóa theo thứ tự ngược lại của khóa ngoại: vi_noi_bo → benh_nhan; phien_dang_nhap, ma_xac_thuc → tai_khoan
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `vi_noi_bo`');
    await queryRunner.query('DROP TABLE `phien_dang_nhap`');
    await queryRunner.query('DROP TABLE `ma_xac_thuc`');
    await queryRunner.query('DROP TABLE `benh_nhan`');
    await queryRunner.query('DROP TABLE `tai_khoan`');
  }
}
