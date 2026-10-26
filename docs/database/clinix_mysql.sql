-- ============================================================================
-- CLINIX - Database (MySQL 8.0.17+) - bản 2
-- Sinh từ clinix.dbml (bản 2, 38 bảng, 23 enum) rồi bổ sung CHECK, cột sinh, charset.
-- 17/10/2026: sửa TAY trực tiếp trong file này cho khớp quyết định auth (thêm bảng phien_dang_nhap
-- => 39 bảng; cột tai_khoan.so_lan_dang_nhap_sai, khoa_dang_nhap_den; ma_xac_thuc.tao_luc). Từ nay
-- docs/database/ là bản chuẩn; script sinh DDL cũ không còn dùng, giữ DBML và SQL đồng bộ bằng tay.
-- 17/10/2026 (đợt 2): đồng bộ luồng kích hoạt tài khoản nhân sự theo 2.4: tai_khoan.trang_thai thêm ChoKichHoat
-- (DBML có enum riêng trang_thai_tai_khoan_enum, tổng 24 enum), mat_khau_bam cho phép NULL kèm CHECK, bỏ
-- bat_buoc_doi_mat_khau; ma_xac_thuc thêm da_gui_luc, thu_hoi_luc, kich_hoat_dang_hieu_luc; thêm chỉ mục
-- lich_hen (chi_nhanh_id, benh_nhan_id). Chuyển đổi từ DB cũ: xem clinix_quy_tac_nghiep_vu.md mục 3.
-- Đã bỏ CHECK chk_lich_hen_truoc: MySQL 8.4 báo lỗi 3818 (CHECK không được tham chiếu cột AUTO_INCREMENT) và làm dừng việc nạp file bằng
-- lệnh thường. Quy tắc "lịch không tự trỏ chính nó" chuyển sang service (chưa có mã triển khai).
-- 18/10/2026: lịch hoạt động THEO TỪNG THỨ của chi nhánh (bảng con chi_nhanh_lich_hoat_dong; bỏ gio_mo_cua/gio_dong_cua chung khỏi chi_nhanh),
-- yêu cầu thay đổi chi nhánh chờ duyệt (yeu_cau_thay_doi_chi_nhanh + yeu_cau_thay_doi_chi_nhanh_lich_hen), thong_bao gắn được với yêu cầu đó,
-- email_thong_bao ghi nhận/gửi lại email của thông báo => 43 bảng, 26 enum. Chuyển đổi từ DB cũ: clinix_quy_tac_nghiep_vu.md mục 4.
-- 18/10/2026 (đợt 2): đồng bộ CẤU HÌNH HỆ THỐNG — bỏ cau_hinh_he_thong.so_ngay_dat_truoc_toi_da, bac_si_uu_tien_id (kèm khóa ngoại), thoi_luong_khung_gio_mac_dinh;
-- so_lich_hen_toi_da_moi_tk đổi tên thành so_lich_hen_toi_da_moi_ho_so (đếm theo hồ sơ đi khám); thêm bảng nhac_lich_hen; nhat_ky_hanh_dong thêm CapNhatCauHinh +
-- cau_hinh_he_thong; lich_hen có khóa ngoại kép tới ho_so_nguoi_than => 44 bảng, 26 enum. KHÔNG tạo sẵn dòng cấu hình (xem mục 5 của clinix_quy_tac_nghiep_vu.md).
-- Chuyển đổi từ DB cũ: clinix_quy_tac_nghiep_vu.md mục 5.
-- 19/10/2026: phụ phí bác sĩ tra theo CHỨC DANH 7 mức (chuc_danh ENUM ở bac_si và phu_phi_bac_si; hoc_vi 5 mức giữ cho điểm xếp hạng AI); phu_phi_bac_si thêm ap_dung
-- (quy tắc tắt bị loại khỏi phép tính); CHECK chức danh – học vị tương thích => 44 bảng, 27 enum. Chuyển đổi từ DB cũ: clinix_quy_tac_nghiep_vu.md mục 6.
-- 19/10/2026 (đợt đồng bộ UC 53/70): thêm XuLyNapViChuaCong vào ENUM nhật ký; chuyển đổi từ DB cũ: mục 7 của clinix_quy_tac_nghiep_vu.md.
-- 19/10/2026 (quy tắc đổi chi nhánh bác sĩ): chỉ sửa comment của bac_si.chi_nhanh_id và mô tả quy tắc; không đổi bảng, cột, enum, constraint.
-- 20/10/2026 (cách chia khung giờ): chỉ sửa comment của bảng khung_gio và mô tả quy tắc 39/mục (b) của clinix_quy_tac_nghiep_vu.md: các khung giờ nối liền nhau theo thời lượng khám, phần dư cuối khoảng nhận khám không sinh khung giờ; không đổi bảng, cột, enum, constraint.
-- 19/10/2026 (lịch hoạt động chi nhánh hai khoảng nhận khám): chi_nhanh_lich_hoat_dong bỏ gio_mo_cua/gio_dong_cua, thay bằng gio_bat_dau_sang, gio_ket_thuc_sang,
-- gio_bat_dau_chieu, gio_ket_thuc_chieu (CaSang dùng khoảng sáng, CaChieu dùng khoảng chiều); bỏ chk_lich_hoat_dong_gio, thêm chk_lich_hoat_dong_khoang,
-- chk_lich_hoat_dong_khong_chong, chk_lich_hoat_dong_ngay => 44 bảng, 27 enum (không thêm bảng/enum), 36 CHECK. Chuyển đổi từ DB cũ: mục 8 của clinix_quy_tac_nghiep_vu.md.
-- 20/10/2026 (truy vết Lễ tân thu tiền mặt tại quầy): giao_dich_thanh_toan thêm nguoi_thu_id (khóa ngoại tới le_tan.tai_khoan_id) và chk_gd_tien_mat_nguoi_thu
-- => 44 bảng, 27 enum (không thêm bảng/enum), 37 CHECK. Chuyển đổi từ DB cũ: mục 9 của clinix_quy_tac_nghiep_vu.md.
-- 26/10/2026 (module auth, task P3): ma_xac_thuc thêm 3 cột dữ liệu lần đăng ký (ho_ten_dang_ky, so_dien_thoai_dang_ky, mat_khau_bam_dang_ky) và
-- chk_ma_xac_thuc_du_lieu_dang_ky; da_gui_luc/thu_hoi_luc dùng cả cho OTP; tài khoản Bệnh nhân chưa xác minh giữ 24 giờ; phien_dang_nhap chốt tên và
-- thời hạn (bỏ [đề xuất]); vi_noi_bo tạo cùng benh_nhan khi xác minh OTP; chỉ đổi cột/CHECK/ghi chú của ma_xac_thuc, không thêm bảng hoặc enum => 44
-- bảng, 27 enum, 38 CHECK. Chuyển đổi từ DB cũ: mục 10 của clinix_quy_tac_nghiep_vu.md.
-- Cần MySQL >= 8.0.17: CHECK thật sự được thực thi từ 8.0.16 (bản cũ chỉ phân tích cú pháp); hàm JSON_SCHEMA_VALID của chk_cau_hinh_nhac_lich cần 8.0.17. Đã nạp thử trên MySQL 8.4.
-- ============================================================================
-- QUY TẮC DO DATABASE BẢO VỆ (CHECK / UNIQUE / cột sinh)
--   * Mỗi khung giờ chỉ có 1 lịch hẹn còn hiệu lực  [lich_hen.khung_gio_dang_giu]
--   * Mỗi khung giờ chỉ có 1 người đang được mời từ danh sách chờ  [muc_cho_danh_sach_cho.khung_gio_dang_moi]
--   * Trạng thái DaMoi thì phải có khung giờ được mời  [chk_muc_cho_da_moi]
--   * 1 lịch cũ chỉ sinh tối đa 1 lịch mới khi đổi lịch  [lich_hen.lich_hen_truoc_id UNIQUE]
--   * Quản trị viên: phạm vi Chi nhánh phải có chi_nhanh_id, Toàn hệ thống thì không  [chk_qtv_pham_vi]
--   * Tỷ lệ hoàn tiền từ 0 đến 100  [chk_moc_hoan_ty_le]
--   * Nghỉ phép: CaNgay (không có ca, được nghỉ nhiều ngày) hoặc TheoCa (bắt buộc có ca, chỉ 1 ngày)  [chk_nghi_phep_hinh_thuc]
--   * Yêu cầu đổi lịch đã xử lý (khác ChoDuyet) phải có ghi chú xử lý  [chk_doi_lich_xu_ly]
--   * Yêu cầu nghỉ phép, đổi lịch ngoài chính sách, rút tiền: ChoDuyet thì chưa có người và thời điểm xử lý; DaDuyet hoặc TuChoi thì phải có cả hai  [chk_nghi_phep_xu_ly, chk_doi_lich_nguoi_xu_ly, chk_rut_tien_xu_ly]
--   * Ví: số dư >= 0, tiền đang giữ >= 0 và không vượt số dư  [chk_vi_so_du]
--   * Giao dịch thanh toán: NapVi không gắn lịch hẹn, ThanhToanLichHen bắt buộc gắn lịch hẹn  [chk_gd_thanh_toan_loai]
--   * Thu tiền mặt tại quầy (TienMatTaiQuay): chỉ ThanhToanLichHen, có lich_hen_id và nguoi_thu_id (Lễ tân xác nhận đã nhận tiền; khóa ngoại tới le_tan nên không thể là vai trò khác), không có vi_noi_bo_id và ma_giao_dich_cong, so_tien > 0, trang_thai = ThanhCong; phương thức khác thì nguoi_thu_id để trống  [chk_gd_tien_mat_nguoi_thu, FK nguoi_thu_id]
--   * Sổ cái ví: mỗi dòng tham chiếu đúng 1 nguồn theo loại (Nap/ThanhToan, HoanTien, Rut)  [chk_gd_vi_tham_chieu]
--   * Sổ cái ví: Nap/HoanTien là số dương, ThanhToan/Rut là số âm [đề xuất]  [chk_gd_vi_dau_so_tien]
--   * Đánh giá: 1 đến 5 sao; ẩn đánh giá thì bắt buộc có lý do, không ẩn thì không có lý do  [chk_danh_gia_so_sao, chk_danh_gia_an]
--   * Mỗi lịch hẹn có tối đa 1 đánh giá, 1 hồ sơ khám  [danh_gia_bac_si.lich_hen_id, ho_so_kham.lich_hen_id]
--   * Hội thoại với Lễ tân phải có chi nhánh, hội thoại với Bác sĩ thì không  [chk_hoi_thoai_chi_nhanh]
--   * Bảng cấu hình hệ thống và thông tin phòng khám chỉ có đúng 1 dòng (id = 1)  [chk_cau_hinh_mot_dong, chk_phong_kham_mot_dong]
--   * Không trùng khung giờ trong 1 lịch làm việc; không trùng lịch làm việc (bác sĩ, ngày, ca)  [khung_gio, lich_lam_viec]
--   * Không trùng mã giao dịch cổng thanh toán trong cùng phương thức (chống xử lý lặp)  [giao_dich_thanh_toan (phuong_thuc, ma_giao_dich_cong)]
--   * Tài khoản: ChoKichHoat thì chưa có mật khẩu, DangHoatDong bắt buộc có mật khẩu; Bệnh nhân không bao giờ ChoKichHoat  [chk_tai_khoan_mat_khau, chk_tai_khoan_cho_kich_hoat_nhan_su]
--   * Mã xác thực: mỗi tài khoản tối đa 1 liên kết KichHoatNhanSu hợp lệ (đã gửi, chưa thu hồi, chưa dùng); mã đã dùng không bị thu hồi; liên kết đã dùng phải đã được gửi  [ma_xac_thuc.kich_hoat_dang_hieu_luc UNIQUE, chk_ma_xac_thuc_dung_hoac_thu_hoi, chk_ma_xac_thuc_kich_hoat_da_gui]
--   * Mã xác thực loại DangKy mang dữ liệu của lần đăng ký (họ tên, SĐT, mật khẩu băm): ba cột cùng có giá trị hoặc cùng NULL; loại khác không có dữ liệu này  [chk_ma_xac_thuc_du_lieu_dang_ky]
--   * Lịch hoạt động chi nhánh: thứ 1 đến 7; mỗi (chi nhánh, thứ) tối đa 1 dòng; tối đa hai khoảng nhận khám (sáng, chiều), mỗi khoảng hoặc để trống cả hai giờ hoặc đủ giờ với bắt đầu < kết thúc trong ngày (không qua đêm); hai khoảng không chồng nhau; hoat_dong = true thì có ít nhất một khoảng, ngày nghỉ thì cả bốn giờ để trống  [chk_lich_hoat_dong_thu, chk_lich_hoat_dong_khoang, chk_lich_hoat_dong_khong_chong, chk_lich_hoat_dong_ngay, PRIMARY KEY]
--   * Yêu cầu thay đổi chi nhánh: nội dung trước/sau là JSON object không rỗng; ChoDuyet chưa có người duyệt và hiệu lực; DaDuyet có người duyệt, số ngày báo trước và hieu_luc_tu >= thời điểm duyệt + số ngày báo trước; TuChoi bắt buộc có lý do  [chk_yc_chi_nhanh_noi_dung, chk_yc_chi_nhanh_xu_ly]
--   * Mỗi thông báo có tối đa 1 dòng email; thông báo của 1 yêu cầu thay đổi chi nhánh không trùng theo (yêu cầu, tài khoản, loại sự kiện); email DaGui phải có da_gui_luc, ThatBai phải có lỗi  [email_thong_bao.thong_bao_id UNIQUE, thong_bao_index_yeu_cau_chi_nhanh, chk_email_thong_bao_ket_qua]
--   * Cấu hình hệ thống: thời gian giữ chỗ, thời hạn phản hồi lời mời > 0; ngưỡng no-show và số lịch hẹn tối đa mỗi hồ sơ >= 1; các số còn lại >= 0 [đề xuất, chưa có giới hạn trên]; mốc nhắc lịch là mảng số nguyên dương không trùng  [chk_cau_hinh_gia_tri, chk_cau_hinh_nhac_lich]
--   * Cột cấu hình chưa chốt là NOT NULL không DEFAULT: không tạo được dòng cấu hình khi thiếu giá trị, không có giá trị ngầm (lỗi 1364)  [cau_hinh_he_thong]
--   * Hồ sơ người thân của lịch hẹn phải thuộc đúng bệnh nhân đặt lịch (lịch của bản thân, ho_so_nguoi_than_id NULL, không bị kiểm tra)  [fk_lich_hen_ho_so_chu_so_huu]
--   * Nhắc lịch: mỗi (lịch hẹn, mốc) tối đa 1 dòng; DaGui phải có da_gui_luc, ThatBai phải có lỗi; mốc >= 1 giờ  [nhac_lich_hen PRIMARY KEY, chk_nhac_lich_hen_moc, chk_nhac_lich_hen_ket_qua]
--   * Phụ phí bác sĩ: mỗi (chuc_danh, so_nam_kinh_nghiem_tu) tối đa 1 dòng kể cả dòng đã tắt; phu_phi >= 0, mốc năm >= 0; số năm kinh nghiệm của bác sĩ >= 0 [đề xuất]  [phu_phi_bac_si_index_2 UNIQUE, chk_phu_phi_bac_si_gia_tri, chk_bac_si_kinh_nghiem]
--   * Chức danh (7 mức) và học vị (5 mức) của bác sĩ phải tương thích: BS, BS_CKI, BS_CKII <-> BS (BS_CKI/BS_CKII là [đề xuất]); ThS_BS <-> ThS; TS_BS <-> TS; PGS_TS_BS <-> PGS; GS_TS_BS <-> GS  [chk_bac_si_chuc_danh_hoc_vi]
--   * Nhật ký CapNhatCauHinh: đối tượng cau_hinh_he_thong mã 1, chi_tiet_thay_doi có truoc/sau cùng tập khóa và ly_do không rỗng [đề xuất]  [chk_nhat_ky_cap_nhat_cau_hinh]
--
-- QUY TẮC DO TẦNG ỨNG DỤNG (SERVICE) BẢO VỆ - database không tự kiểm tra
--   * Cặp (chi nhánh, dịch vụ) của bác sĩ và của lịch hẹn phải có trong chi_nhanh_dich_vu_kham
--   * Đổi lịch: tạo lịch mới, đổi lịch cũ sang DaDoiLich trong CÙNG 1 giao dịch; chỉ cho đổi khi lịch cũ ở DaXacNhan [đề xuất, chưa xác nhận]
--   * Lịch mới do đổi lịch sao chép gia_snapshot, tien_coc_snapshot, chinh_sach_hoan_snapshot từ lịch trước
--   * Tài chính sau đổi lịch: không tạo giao dịch thanh toán mới; lần theo lich_hen_truoc_id về lịch gốc để tìm giao dịch (xem truy vấn mẫu cuối file)
--   * lich_hen.bac_si_id, chi_nhanh_id, thoi_gian khớp với khung giờ (dữ liệu snapshot)
--   * loai_tai_khoan của tai_khoan khớp đúng 1 bảng con (benh_nhan / bac_si / le_tan / quan_tri_vien); nhân sự được tạo cùng hồ sơ vai trò trong 1 giao dịch, kể cả khi ChoKichHoat
--   * Chỉ cho đánh giá khi lịch hẹn ở trạng thái HoanThanh
--   * Ghi hồ sơ khám độc lập với Hoàn thành ca khám (ghi khi Đã tiếp đón hoặc sau Hoàn thành); KHÔNG bắt buộc đã có hồ sơ khám trước khi Hoàn thành; khi bác sĩ lưu thì triệu chứng, chẩn đoán sơ bộ, hướng xử lý phải có nội dung (service, DB cho phép NULL)
--   * Danh sách chờ: không đăng ký trùng (bệnh nhân, bác sĩ, ngày, ca) khi còn DangCho hoặc DaMoi
--   * Phụ phí bác sĩ = phu_phi của dòng cùng CHỨC DANH, ap_dung = true, so_nam_kinh_nghiem_tu lớn nhất nhưng không vượt số năm kinh nghiệm; không có dòng thì 0 (truy vấn mẫu cuối file); giá chốt lúc đặt ở lich_hen.gia_snapshot, đổi quy tắc/chức danh/học vị về sau không đổi lịch đã đặt
--   * Rút tiền: tạo yêu cầu tăng so_tien_dang_giu; duyệt ghi giao_dich_vi loại Rut và giảm cả so_du lẫn so_tien_dang_giu; từ chối chỉ giảm so_tien_dang_giu
--   * Đổi chi nhánh công tác của bác sĩ (chỉ Quản trị viên Toàn hệ thống, sửa trực tiếp hồ sơ, không có yêu cầu riêng) chỉ khi bác sĩ không còn lịch hẹn đang hoạt động và không còn ca lich_lam_viec có ngay từ hôm nay trở đi ở chi nhánh hiện tại; ca và lịch hẹn đã qua giữ để truy vết; ghi nhật ký DoiChiNhanhBacSi
--   * Mốc đã đọc của chat (tin_nhan_cuoi_da_doc_id) phải thuộc cùng hội thoại
--   * Lịch hẹn không tự trỏ chính nó (lich_hen_truoc_id khác lich_hen_id): KHÔNG có CHECK vì MySQL từ chối CHECK tham chiếu cột AUTO_INCREMENT (lỗi 3818); kiểm tra ở service khi triển khai API — hiện CHƯA có mã triển khai
--   * Liên kết KichHoatNhanSu: gửi lại thành công thì thu hồi liên kết cũ rồi đặt da_gui_luc cho liên kết mới (1 giao dịch); gửi thất bại thì chỉ thu hồi liên kết mới, liên kết cũ còn hạn vẫn hợp lệ; kích hoạt ghi da_dung_luc + mat_khau_bam + trang_thai = DangHoatDong trong 1 giao dịch. Thời hạn [đề xuất: 24 giờ]
--   * Quản trị viên Chi nhánh xem Bệnh nhân qua lich_hen (benh_nhan_id + chi_nhanh_id), không có cột chi nhánh ở benh_nhan; không khoá/sửa Bệnh nhân (xem truy vấn mẫu cuối file)
--   * Chi nhánh có đủ 7 dòng chi_nhanh_lich_hoat_dong; thứ chưa khai báo coi như KHÔNG nhận phân công/đặt lịch
--   * Không phân công lịch làm việc, không sinh/hiển thị ConTrong và không giữ chỗ/đặt lịch ngoài KHOẢNG NHẬN KHÁM của chi nhánh: ngày nghỉ, chi nhánh chưa khai báo, ca không có khoảng tương ứng (CaSang cần khoảng sáng, CaChieu cần khoảng chiều; Cả ngày chỉ khi có đủ cả hai), hoặc khung giờ không nằm TRỌN trong khoảng của ca (không xuyên giờ nghỉ trưa, không vượt giờ kết thúc); báo lý do rõ (xem truy vấn mẫu cuối file)
--   * yeu_cau_thay_doi_chi_nhanh.noi_dung_truoc/sau: mỗi phần tử lich_hoat_dong là toàn bộ dòng của một thứ với đủ 6 khóa (khoảng không tồn tại ghi null); áp dụng tại hieu_luc_tu bằng cách thay cả dòng. Giờ mở/đóng tổng quát chỉ để hiển thị, suy ra từ các khoảng, không lưu và không chỉnh sửa riêng
--   * Đổi lịch hoạt động hoặc dịch vụ khả dụng: phát hiện lịch hẹn ChoThanhToan/DaXacNhan bị ảnh hưởng TRƯỚC khi chấp nhận; có ảnh hưởng thì tạo yeu_cau_thay_doi_chi_nhanh (ChoDuyet), KHÔNG áp dụng dữ liệu đề xuất; chỉ Quản trị viên Toàn hệ thống duyệt; duyệt xong tạo thông báo + email cho bệnh nhân (lich_hen.benh_nhan_id) trước hieu_luc_tu; áp dụng vào bảng đang áp dụng khi đến hieu_luc_tu
--   * Email lỗi chỉ đổi email_thong_bao sang ThatBai, không xóa thong_bao và không hoàn tác yêu cầu đã duyệt; gửi lại bằng UPDATE có điều kiện để không gửi trùng
--   * Chưa chốt (không nằm trong DB): Quản trị viên Toàn hệ thống tự duyệt đề xuất của mình, nhiều yêu cầu ChoDuyet cùng chi nhánh, cách xử lý lịch hẹn bị ảnh hưởng sau khi áp dụng, chặn đặt mới vào khung giờ sẽ bị ảnh hưởng trong thời gian chờ hiệu lực
--   * Cấu hình hệ thống KHÔNG có dòng tạo sẵn; thiếu dòng id = 1 thì từ chối chức năng cần cấu hình (đặt lịch, giữ chỗ, đổi lịch, tiếp đón, nhắc lịch...), không dùng số cứng trong mã
--   * Sửa cấu hình và ghi nhat_ky_hanh_dong (CapNhatCauHinh, có truoc/sau/ly_do) trong CÙNG 1 giao dịch; DB không tự ép mọi UPDATE cấu hình đều có nhật ký
--   * Giới hạn số lịch hẹn đang hoạt động tính theo HỒ SƠ ĐI KHÁM (benh_nhan_id, ho_so_nguoi_than_id; NULL = bản thân, so sánh bằng <=>), không theo tài khoản; đếm và tạo lịch hẹn trong cùng giao dịch; tập trạng thái "đang hoạt động" [cần điền], xem truy vấn mẫu
--   * Không có giới hạn số ngày đặt trước cố định: đặt được tới ngày bác sĩ đã có khung giờ ConTrong; thời lượng khung giờ = dich_vu_kham.thoi_luong
--   * Tiếp đón (check-in) chỉ trong cửa sổ [thoi_gian - check_in_truoc_phut, thoi_gian + check_in_sau_phut] [đề xuất cách hiểu; giá trị [cần điền]]
--   * Nhắc lịch: tạo dòng nhac_lich_hen khi mốc đến hạn, nhận việc gửi bằng UPDATE có điều kiện để không gửi trùng; thử lại theo 2.4.69 là hằng số của service
--   * Khoá/mở khoá tài khoản theo ma trận quyền của 2.4: cấm tự khoá, cấm khoá Quản trị viên Toàn hệ thống cuối cùng đang hoạt động, không chuyển ChoKichHoat sang DangHoatDong bằng Mở khoá
--   * Thu tiền mặt tại quầy: nguoi_thu_id lấy từ PHIÊN ĐĂNG NHẬP của Lễ tân (không nhận từ giao diện); Lễ tân đang hoạt động và có le_tan.chi_nhanh_id = lich_hen.chi_nhanh_id lúc thu; chỉ lịch hẹn DaXacNhan; so_tien = gia_snapshot - tổng giao dịch ThanhToanLichHen ThanhCong của LỊCH GỐC (thu đủ, không thu thiếu hay thừa)
--   * Thu tiền mặt tại quầy chạy trong MỘT giao dịch: khóa dòng lich_hen (FOR UPDATE) TRƯỚC khi đọc tổng đã trả, ghi giao dịch tiền mặt bằng INSERT ... SELECT có điều kiện, kiểm tra lại tổng đã trả >= giá, UPDATE DaXacNhan -> DaTiepDon phải ảnh hưởng đúng 1 dòng, lỗi thì ROLLBACK cả hai; chống ghi trùng bằng khóa dòng + điều kiện trạng thái, KHÔNG UNIQUE theo lich_hen_id (xem truy vấn mẫu cuối file)
--   * Lịch đã trả đủ trước khi đến quầy: tiếp đón theo luồng Cập nhật trạng thái lịch hẹn, KHÔNG tạo giao dịch tiền mặt bằng 0
-- ============================================================================

SET NAMES utf8mb4;
CREATE DATABASE IF NOT EXISTS `clinix` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `clinix`;
CREATE TABLE `tai_khoan` (
  `tai_khoan_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `ho_ten` varchar(100) NOT NULL,
  `ngay_sinh` date COMMENT 'Có thể để trống: lúc đăng ký chỉ nhập họ tên, email, SĐT, mật khẩu',
  `gioi_tinh` varchar(10) COMMENT 'Có thể để trống (như ngày sinh)',
  `so_dien_thoai` varchar(20) NOT NULL,
  `anh_dai_dien` varchar(255),
  `dia_chi` varchar(255),
  `email` varchar(255) UNIQUE NOT NULL,
  `mat_khau_bam` varchar(255) COMMENT 'NULL chỉ khi trang_thai = ChoKichHoat (nhân sự chưa tự đặt mật khẩu qua liên kết kích hoạt). DangHoatDong bắt buộc có mật khẩu (chk_tai_khoan_mat_khau)',
  `trang_thai` ENUM ('ChoKichHoat', 'DangHoatDong', 'NgungHoatDong') NOT NULL DEFAULT 'DangHoatDong' COMMENT 'ChoKichHoat chỉ cho nhân sự vừa tạo, chưa đăng nhập được; chỉ chuyển sang DangHoatDong khi nhân sự đặt mật khẩu qua liên kết kích hoạt, không chuyển bằng Mở khóa',
  `da_xac_minh_email` boolean NOT NULL DEFAULT false COMMENT 'false thì không được đặt lịch. Đăng ký tạo tài khoản ngay với false; OTP đúng thì đặt true. Tài khoản Bệnh nhân chưa xác minh bị xóa sau 24 giờ kể từ thoi_diem_tao (không gia hạn khi gửi lại OTP; không bao giờ xóa tài khoản nhân sự). Nhân sự: đặt true khi kích hoạt thành công vì liên kết gửi tới đúng email này [đề xuất]',
  `so_lan_dang_nhap_sai` int NOT NULL DEFAULT 0 COMMENT 'Số lần đăng nhập sai liên tiếp, về 0 khi đăng nhập đúng. Email không tồn tại thì không đếm',
  `khoa_dang_nhap_den` datetime COMMENT 'Còn ở tương lai thì đang bị khóa đăng nhập (5 lần sai liên tiếp, khóa 15 phút); NULL = không khóa',
  `loai_tai_khoan` ENUM ('BenhNhan', 'BacSi', 'LeTan', 'QuanTriVien') NOT NULL COMMENT 'Cột đề xuất thêm để biết nhanh loại tài khoản, không cần JOIN 4 bảng con',
  `thoi_diem_tao` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm đăng ký tài khoản'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `benh_nhan` (
  `tai_khoan_id` bigint PRIMARY KEY,
  `khoa_dat_lich_do_no_show` boolean NOT NULL DEFAULT false COMMENT 'Quản trị viên mở khóa thủ công nên là trạng thái độc lập',
  `so_lan_no_show` int NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `bac_si` (
  `tai_khoan_id` bigint PRIMARY KEY,
  `mo_ta_chuyen_mon` text COMMENT 'Tùy chọn, được để trống: biểu mẫu Tạo tài khoản nhân sự không bắt buộc nhập',
  `so_nam_kinh_nghiem` int NOT NULL DEFAULT 0 COMMENT '>= 0 (chk_bac_si_kinh_nghiem) [đề xuất]',
  `hoc_vi` ENUM ('BS', 'ThS', 'TS', 'PGS', 'GS') NOT NULL COMMENT 'Học vị 5 mức: dùng cho điểm xếp hạng AI (kinh_nghiem_norm = min(số năm kinh nghiệm + năm quy đổi học vị, 20) / 20), KHÔNG dùng tra phụ phí. Phải tương thích với chuc_danh (chk_bac_si_chuc_danh_hoc_vi)',
  `chuc_danh` ENUM ('BS', 'BS_CKI', 'BS_CKII', 'ThS_BS', 'TS_BS', 'PGS_TS_BS', 'GS_TS_BS') NOT NULL COMMENT 'Chức danh 7 mức: CHỈ dùng tra phụ phí (phu_phi_bac_si.chuc_danh) và hiển thị. Tương thích với hoc_vi: BS, BS_CKI, BS_CKII <-> BS (BS_CKI và BS_CKII <-> BS là [đề xuất], chưa chốt bác sĩ CKI/CKII có thể mang học vị ThS không); ThS_BS <-> ThS; TS_BS <-> TS; PGS_TS_BS <-> PGS; GS_TS_BS <-> GS. ENUM NOT NULL tự lấy giá trị đầu (BS) nếu bỏ trống: service phải bắt buộc nhập tường minh (test GAP)',
  `chuyen_khoa_id` bigint NOT NULL,
  `chi_nhanh_id` bigint NOT NULL COMMENT 'Chỉ Quản trị viên Toàn hệ thống đổi trực tiếp trong hồ sơ bác sĩ; chỉ khi bác sĩ không còn lịch hẹn đang hoạt động ở chi nhánh hiện tại và không còn lich_lam_viec có ngay từ hôm nay trở đi ở chi nhánh hiện tại (kiểm tra ở service ngay trước khi lưu; lịch hẹn và ca đã qua giữ để truy vết); ghi nhật ký DoiChiNhanhBacSi',
  `dich_vu_kham_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `le_tan` (
  `tai_khoan_id` bigint PRIMARY KEY,
  `chi_nhanh_id` bigint NOT NULL COMMENT 'Lễ tân luôn được gán đúng 1 chi nhánh'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `quan_tri_vien` (
  `tai_khoan_id` bigint PRIMARY KEY,
  `pham_vi_quan_tri` ENUM ('ToanHeThong', 'ChiNhanh') NOT NULL,
  `chi_nhanh_id` bigint
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `ho_so_nguoi_than` (
  `ho_so_nguoi_than_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `benh_nhan_id` bigint NOT NULL,
  `ho_ten` varchar(100) NOT NULL,
  `ngay_sinh` date NOT NULL,
  `gioi_tinh` varchar(10) NOT NULL,
  `dia_chi` varchar(255),
  `moi_quan_he` ENUM ('Cha', 'Me', 'Vo', 'Chong', 'Con', 'AnhChiEm', 'OngBa', 'Khac') NOT NULL COMMENT '[đề xuất] danh sách giá trị; Khac cho quan hệ không có trong danh sách',
  `so_dien_thoai` varchar(20),
  `trang_thai_hieu_luc` boolean NOT NULL DEFAULT true COMMENT 'Không xóa thật, chỉ đổi trạng thái'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `ma_xac_thuc` (
  `ma_xac_thuc_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `tai_khoan_id` bigint NOT NULL,
  `loai` ENUM ('DangKy', 'QuenMatKhau', 'KichHoatNhanSu') NOT NULL,
  `ma_bam` varchar(255) NOT NULL COMMENT 'Lưu bản băm, không lưu bản rõ: OTP (DangKy, QuenMatKhau) = HMAC-SHA-256 với khóa bí mật riêng, dữ liệu băm gồm tai_khoan_id, loai, ma_xac_thuc_id và mã (không dùng SHA-256 trơn); liên kết kích hoạt = băm của token',
  `het_han_luc` datetime NOT NULL,
  `da_dung_luc` datetime COMMENT 'Để trống = chưa dùng; liên kết kích hoạt chỉ dùng 1 lần',
  `da_gui_luc` datetime COMMENT 'Thời điểm dịch vụ email xác nhận đã gửi THÀNH CÔNG; để trống = mới tạo hoặc gửi lỗi, chưa có hiệu lực. KichHoatNhanSu: liên kết chưa gửi thì chưa hợp lệ. OTP (DangKy, QuenMatKhau): mã chưa gửi thành công không xác minh được và không thay thế mã cũ; chỉ mã mới nhất ĐÃ GỬI THÀNH CÔNG mới thay thế mã cũ',
  `thu_hoi_luc` datetime COMMENT 'Thời điểm mã bị vô hiệu; để trống = chưa thu hồi. KichHoatNhanSu: gửi lại thành công thì liên kết cũ bị thu hồi; liên kết mới gửi thất bại thì chính nó bị thu hồi. OTP: bị thu hồi khi mã mới gửi thành công, khi gửi lỗi (chính hàng mới), khi nhập sai đủ 5 lần, hoặc khi đặt lại mật khẩu thành công trên tài khoản chưa xác minh',
  `kich_hoat_dang_hieu_luc` bigint GENERATED ALWAYS AS (IF(`loai` = 'KichHoatNhanSu' AND `da_gui_luc` IS NOT NULL AND `thu_hoi_luc` IS NULL AND `da_dung_luc` IS NULL, `tai_khoan_id`, NULL)) STORED UNIQUE COMMENT 'Bằng tai_khoan_id khi liên kết kích hoạt đã gửi, chưa thu hồi, chưa dùng; NULL ở mọi trường hợp khác. UNIQUE => mỗi tài khoản tối đa 1 liên kết kích hoạt hợp lệ (hết hạn kiểm tra ở service)',
  `so_lan_nhap_sai` int NOT NULL DEFAULT 0 COMMENT 'Số lần nhập sai của MÃ NÀY (OTP: đủ 5 lần thì thu hồi mã)',
  `tao_luc` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Dùng đếm giới hạn gửi lại OTP: cách mã trước ≥ 60 giây, tối đa 5 mã/giờ theo (tai_khoan_id, loai); tính cả hàng gửi lỗi',
  `ho_ten_dang_ky` varchar(100) COMMENT 'Chỉ loai = DangKy: họ tên của LẦN ĐĂNG KÝ gắn với mã này; chỉ được ghi vào tai_khoan khi chính mã này được xác minh đúng. NULL khi không phải DangKy, hoặc sau khi mã đã dùng/bị thu hồi do đặt lại mật khẩu (ba cột dữ liệu đăng ký cùng NULL hoặc cùng có giá trị: chk_ma_xac_thuc_du_lieu_dang_ky)',
  `so_dien_thoai_dang_ky` varchar(20) COMMENT 'Số điện thoại của lần đăng ký này (xem ho_ten_dang_ky)',
  `mat_khau_bam_dang_ky` varchar(255) COMMENT 'Bản băm Argon2id của mật khẩu của lần đăng ký này, không bao giờ lưu bản rõ (xem ho_ten_dang_ky)'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Phiên đăng nhập (tên bảng và cột đã chốt, Q10): refresh token ngẫu nhiên 256 bit chỉ lưu bản băm; xoay tại chỗ mỗi lần làm mới; đăng xuất hoặc dùng lại token cũ thì đặt thu_hoi_luc.
CREATE TABLE `phien_dang_nhap` (
  `phien_dang_nhap_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `tai_khoan_id` bigint NOT NULL,
  `refresh_token_bam` varchar(255) UNIQUE NOT NULL COMMENT 'Lưu SHA-256 của refresh token (chuỗi ngẫu nhiên 256 bit, dạng sid.ngẫu nhiên.chữ ký), không lưu bản rõ; thay bằng băm mới mỗi lần làm mới (xoay tại chỗ)',
  `tao_luc` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm đăng nhập; mốc tính trần tuyệt đối 8 giờ',
  `het_han_luc` datetime NOT NULL COMMENT 'Hết hạn trượt: lúc đăng nhập = tao_luc + 30 phút (không hoạt động); mỗi lần làm mới = min(bây giờ + 30 phút, tao_luc + 8 giờ). Quá het_han_luc hoặc quá trần 8 giờ kể từ tao_luc thì refresh bị từ chối',
  `thu_hoi_luc` datetime COMMENT 'Để trống = còn hiệu lực. Ghi thời điểm khi: đăng xuất, phát hiện dùng lại refresh token cũ, đặt lại hoặc đổi mật khẩu (các phiên khác), khóa tài khoản'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `chi_nhanh` (
  `chi_nhanh_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `ten` varchar(100) NOT NULL,
  `dia_chi` varchar(255) NOT NULL,
  `toa_do_lat` decimal(10,7),
  `toa_do_lng` decimal(10,7)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `chi_nhanh_lich_hoat_dong` (
  `chi_nhanh_id` bigint,
  `thu_trong_tuan` tinyint COMMENT '1 = Thứ Hai ... 7 = Chủ nhật (ISO 8601), khớp WEEKDAY(ngay) + 1 của MySQL. Ràng buộc: 1 đến 7',
  `hoat_dong` boolean NOT NULL COMMENT 'true = chi nhánh nhận khám vào thứ này (có ít nhất một khoảng nhận khám đầy đủ); false = nghỉ cả ngày (cả bốn cột giờ để trống). chk_lich_hoat_dong_ngay giữ cột này khớp với các khoảng nên đây không phải nguồn chỉnh sửa độc lập',
  `gio_bat_dau_sang` time COMMENT 'Khoảng nhận khám buổi sáng (ca CaSang), cùng gio_ket_thuc_sang: cả hai để trống = không có buổi sáng; có thì bắt đầu < kết thúc',
  `gio_ket_thuc_sang` time COMMENT 'Xem gio_bat_dau_sang. Phải <= gio_bat_dau_chieu khi có cả hai khoảng (không chồng nhau; chạm nhau là hợp lệ); không qua đêm (trong 00:00:00 đến 23:59:59)',
  `gio_bat_dau_chieu` time COMMENT 'Khoảng nhận khám buổi chiều (ca CaChieu), cùng gio_ket_thuc_chieu: cả hai để trống = không có buổi chiều; có thì bắt đầu < kết thúc',
  `gio_ket_thuc_chieu` time COMMENT 'Xem gio_bat_dau_chieu. Không qua đêm (trong 00:00:00 đến 23:59:59)',
  PRIMARY KEY (`chi_nhanh_id`, `thu_trong_tuan`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `chuyen_khoa` (
  `chuyen_khoa_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `ten` varchar(100) NOT NULL COMMENT 'Lĩnh vực chuyên môn của bác sĩ. Ví dụ: Cơ Xương Khớp, Thần kinh, Tiêu hóa, Nội tổng quát, Y học gia đình, Tâm thần',
  `mo_ta` text,
  `anh_dai_dien` varchar(255) COMMENT 'Đường dẫn ảnh minh họa hiển thị trên thẻ chuyên khoa; có thể để trống',
  `trang_thai_hoat_dong` ENUM ('DangHoatDong', 'NgungHoatDong') NOT NULL DEFAULT 'DangHoatDong'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `nhom_dich_vu` (
  `nhom_dich_vu_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `ten` varchar(100) UNIQUE NOT NULL COMMENT 'Ví dụ: Khám chuyên khoa, Khám tổng quát, Khám từ xa, Xét nghiệm y học, Sức khỏe tinh thần, Khám nha khoa',
  `thu_tu_hien_thi` int NOT NULL DEFAULT 0 COMMENT '[đề xuất] Thứ tự hiển thị trên màn điều hướng'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dich_vu_kham` (
  `dich_vu_kham_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `nhom_dich_vu_id` bigint NOT NULL,
  `ten` varchar(100) NOT NULL,
  `thoi_luong` int NOT NULL COMMENT 'phút',
  `gia_mac_dinh` decimal(12,2) NOT NULL,
  `muc_dat_coc` decimal(12,2) NOT NULL DEFAULT 0 COMMENT 'Mức cọc cố định theo dịch vụ; 0 = không đặt cọc'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `moc_hoan_tien` (
  `moc_hoan_tien_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `dich_vu_kham_id` bigint NOT NULL,
  `so_gio_truoc_toi_thieu` int NOT NULL COMMENT 'Hủy trước giờ hẹn ít nhất bấy nhiêu giờ thì áp dụng tỷ lệ này',
  `ty_le_hoan` tinyint NOT NULL COMMENT 'Ràng buộc: 0 đến 100. Ví dụ [đề xuất]: 24 giờ -> 100, 2 giờ -> 50, 0 giờ -> 0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `chi_nhanh_dich_vu_kham` (
  `chi_nhanh_id` bigint,
  `dich_vu_kham_id` bigint,
  PRIMARY KEY (`chi_nhanh_id`, `dich_vu_kham_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `yeu_cau_thay_doi_chi_nhanh` (
  `yeu_cau_thay_doi_chi_nhanh_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `chi_nhanh_id` bigint NOT NULL,
  `nguoi_de_xuat_id` bigint NOT NULL COMMENT 'Người gửi yêu cầu (Quản trị viên Chi nhánh của chi nhánh đó, hoặc Toàn hệ thống). Phạm vi kiểm tra ở service',
  `noi_dung_truoc` json NOT NULL COMMENT 'Bản chụp phần SẮP BỊ ĐỔI tại lúc đề xuất, cùng khóa với noi_dung_sau. Ví dụ: {"lich_hoat_dong":[{"thu_trong_tuan":6,"hoat_dong":true,"gio_bat_dau_sang":"07:30:00","gio_ket_thuc_sang":"12:00:00","gio_bat_dau_chieu":null,"gio_ket_thuc_chieu":null}],"dich_vu_kham_ids":[1,2,3]}',
  `noi_dung_sau` json NOT NULL COMMENT 'Phần đề xuất, chỉ gồm các khóa lich_hoat_dong và/hoặc dich_vu_kham_ids muốn đổi (lich_hoat_dong: mỗi phần tử là TOÀN BỘ dòng của một thứ muốn đổi, luôn đủ 6 khóa thu_trong_tuan, hoat_dong, gio_bat_dau_sang, gio_ket_thuc_sang, gio_bat_dau_chieu, gio_ket_thuc_chieu, khoảng không tồn tại ghi null tường minh, khi áp dụng thì thay cả dòng của thứ đó; dich_vu_kham_ids: danh sách MỚI đầy đủ). KHÔNG áp dụng vào chi_nhanh_lich_hoat_dong / chi_nhanh_dich_vu_kham khi mới gửi hoặc mới duyệt, chỉ áp dụng ở hieu_luc_tu',
  `trang_thai` ENUM ('ChoDuyet', 'DaDuyet', 'TuChoi') NOT NULL DEFAULT 'ChoDuyet',
  `thoi_diem_tao` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `nguoi_duyet_id` bigint COMMENT 'Phải là Quản trị viên Toàn hệ thống (kiểm tra ở service). Chưa chốt: Quản trị viên Toàn hệ thống có được tự duyệt đề xuất của chính mình không [cần điền]; DB chưa chặn',
  `thoi_diem_duyet` datetime COMMENT 'Thời điểm duyệt hoặc từ chối',
  `ly_do_tu_choi` varchar(255) COMMENT 'Bắt buộc khi TuChoi [đề xuất], để trống ở trạng thái khác',
  `so_ngay_bao_truoc` int COMMENT 'Chỉ khi DaDuyet: bản chụp cau_hinh_he_thong.so_ngay_bao_truoc_doi_gio_lam tại lúc duyệt (ngày), để cấu hình đổi sau này không làm sai lịch sử',
  `hieu_luc_tu` datetime COMMENT 'Chỉ khi DaDuyet: thời điểm thay đổi bắt đầu có hiệu lực. Ràng buộc: >= thoi_diem_duyet + so_ngay_bao_truoc ngày, nên thông báo luôn đi trước. Ai chọn thời điểm này (hệ thống tự tính hay người duyệt nhập) [cần điền]',
  `ap_dung_luc` datetime COMMENT 'Thời điểm hệ thống thực sự ghi thay đổi vào bảng đang áp dụng; để trống = chưa áp dụng. Không thể sớm hơn hieu_luc_tu'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `yeu_cau_thay_doi_chi_nhanh_lich_hen` (
  `yeu_cau_thay_doi_chi_nhanh_id` bigint,
  `lich_hen_id` bigint,
  `ly_do_anh_huong` ENUM ('NgayNghi', 'NgoaiGioHoatDong', 'BoDichVu') NOT NULL,
  PRIMARY KEY (`yeu_cau_thay_doi_chi_nhanh_id`, `lich_hen_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `phu_phi_bac_si` (
  `phu_phi_bac_si_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `chuc_danh` ENUM ('BS', 'BS_CKI', 'BS_CKII', 'ThS_BS', 'TS_BS', 'PGS_TS_BS', 'GS_TS_BS') NOT NULL COMMENT 'Mã chức danh 7 mức (KHÁC hoc_vi 5 mức dùng cho AI); khớp bac_si.chuc_danh',
  `so_nam_kinh_nghiem_tu` int NOT NULL DEFAULT 0 COMMENT 'Áp dụng từ mốc số năm này trở lên; >= 0',
  `phu_phi` decimal(12,2) NOT NULL COMMENT 'Giá trị [cần điền]; các mức ở prototype chỉ là dữ liệu demo, CHƯA phải quyết định; >= 0',
  `ap_dung` boolean NOT NULL DEFAULT true COMMENT 'false = quy tắc đang TẮT, bị loại khỏi phép tính phụ phí nhưng giữ lại để bật lại; mặc định true [đề xuất]'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `thong_tin_phong_kham` (
  `id` tinyint PRIMARY KEY COMMENT 'Luôn bằng 1, bảng chỉ có 1 dòng',
  `ten_thuong_hieu` varchar(100),
  `dia_chi_tru_so` varchar(255),
  `duong_day_nong` varchar(20),
  `email` varchar(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cau_hinh_he_thong` (
  `id` tinyint PRIMARY KEY COMMENT 'Luôn bằng 1, bảng chỉ có 1 dòng',
  `thoi_gian_giu_cho` int NOT NULL DEFAULT 15 COMMENT 'phút; [đề xuất] 15',
  `thoi_diem_nhac_lich` json NOT NULL DEFAULT (json_array(72,24,2)) COMMENT 'Mảng các mốc nhắc, mỗi phần tử là số giờ NGUYÊN DƯƠNG trước giờ hẹn, không trùng nhau (chk_cau_hinh_nhac_lich); [đề xuất] 72, 24, 2; mảng rỗng được DB chấp nhận (nghĩa là không nhắc, chưa chốt có cho tắt không). Mỗi (lịch hẹn, mốc) được ghi ở nhac_lich_hen theo CHÍNH số giờ này',
  `so_lich_hen_toi_da_moi_ho_so` int NOT NULL COMMENT 'Số lịch hẹn đang hoạt động tối đa của MỘT hồ sơ đi khám (bản thân hoặc từng hồ sơ người thân), KHÔNG phải mỗi tài khoản; >= 1; [cần điền]. Hồ sơ đi khám = (lich_hen.benh_nhan_id, lich_hen.ho_so_nguoi_than_id), NULL = bản thân; tập trạng thái đang hoạt động xem clinix_quy_tac_nghiep_vu.md',
  `so_lan_tu_doi_lich_toi_da` int NOT NULL COMMENT '[cần điền]',
  `check_in_truoc_phut` int NOT NULL COMMENT 'Số PHÚT trước giờ hẹn (lich_hen.thoi_gian) từ khi được tiếp đón (chuyển Đã tiếp đón); >= 0; [cần điền]. Cách hiểu cửa sổ tiếp đón là [đề xuất], xem clinix_quy_tac_nghiep_vu.md',
  `check_in_sau_phut` int NOT NULL COMMENT 'Số PHÚT sau giờ hẹn vẫn còn được tiếp đón; >= 0; [cần điền]. KHÔNG phải thời điểm tự đánh Vắng mặt (tự Vắng mặt tính theo hết ca làm việc)',
  `thoi_han_phan_hoi_loi_moi` int NOT NULL DEFAULT 60 COMMENT 'phút; [đề xuất] 60',
  `so_muc_cho_toi_da` int NOT NULL DEFAULT 2 COMMENT '[đề xuất] 2',
  `nguong_no_show` int NOT NULL DEFAULT 3 COMMENT '[đề xuất] 3 lần',
  `so_ngay_bao_truoc_doi_gio_lam` int NOT NULL COMMENT '[cần điền]',
  `trong_so_w1` decimal(3,2) NOT NULL COMMENT '[cần điền]',
  `trong_so_w2` decimal(3,2) NOT NULL COMMENT '[cần điền]'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `lich_lam_viec` (
  `lich_lam_viec_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `bac_si_id` bigint NOT NULL,
  `chi_nhanh_id` bigint NOT NULL COMMENT 'Chi nhánh tại thời điểm phân công, giữ nguyên khi bác sĩ đổi chi nhánh',
  `ngay` date NOT NULL,
  `ca` ENUM ('CaSang', 'CaChieu', 'CaToi') NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `khung_gio` (
  `khung_gio_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `lich_lam_viec_id` bigint NOT NULL,
  `ngay_gio` datetime NOT NULL,
  `trang_thai` ENUM ('ConTrong', 'DaDat', 'DangGiuCho', 'HetHan') NOT NULL DEFAULT 'ConTrong',
  `giu_cho_den` datetime COMMENT 'Hạn giữ chỗ tạm; để trống khi không giữ'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `yeu_cau_nghi_phep` (
  `yeu_cau_nghi_phep_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `bac_si_id` bigint NOT NULL,
  `hinh_thuc_nghi` ENUM ('CaNgay', 'TheoCa') NOT NULL,
  `ngay_bat_dau` date NOT NULL,
  `ngay_ket_thuc` date NOT NULL,
  `ca` ENUM ('CaSang', 'CaChieu', 'CaToi') COMMENT 'Bắt buộc khi nghỉ theo ca (TheoCa)',
  `ly_do` text NOT NULL,
  `trang_thai` ENUM ('ChoDuyet', 'DaDuyet', 'TuChoi') NOT NULL DEFAULT 'ChoDuyet',
  `nguoi_xu_ly_id` bigint,
  `thoi_diem_xu_ly` datetime COMMENT 'Ràng buộc: ChoDuyet thì người xử lý và thời điểm xử lý đều trống; DaDuyet hoặc TuChoi thì cả hai đều có',
  `thoi_diem_tao` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `lich_hen` (
  `lich_hen_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `ma_lich_hen` varchar(20) UNIQUE NOT NULL,
  `khung_gio_id` bigint NOT NULL COMMENT 'KHÔNG unique: lịch đã hủy hoặc đã đổi vẫn giữ khung_gio_id để truy vết',
  `khung_gio_dang_giu` bigint GENERATED ALWAYS AS (IF(`trang_thai` IN ('ChoThanhToan','DaXacNhan','DaTiepDon','HoanThanh','VangMat'), `khung_gio_id`, NULL)) STORED UNIQUE COMMENT 'Bằng khung_gio_id khi lịch còn hiệu lực (ChoThanhToan, DaXacNhan, DaTiepDon, HoanThanh, VangMat); NULL khi DaHuy hoặc DaDoiLich. Cột sinh STORED + UNIQUE: mỗi slot chỉ có 1 lịch còn hiệu lực.',
  `lich_hen_truoc_id` bigint UNIQUE COMMENT 'Lịch cũ bị thay thế khi đổi lịch. UNIQUE: 1 lịch cũ chỉ sinh tối đa 1 lịch mới. Chỉ tạo lịch mới trong cùng giao dịch với việc chuyển lịch cũ sang DaDoiLich. Lịch không tự trỏ chính nó: kiểm tra ở service (không có CHECK vì MySQL cấm CHECK tham chiếu cột AUTO_INCREMENT). Chi tiết xem tài liệu quy tắc nghiệp vụ.',
  `benh_nhan_id` bigint NOT NULL COMMENT 'Người đặt',
  `ho_so_nguoi_than_id` bigint COMMENT 'NULL = chính bệnh nhân đi khám (bản thân); có giá trị = hồ sơ người thân và PHẢI thuộc cùng benh_nhan_id (khóa ngoại kép fk_lich_hen_ho_so_chu_so_huu, DB chặn). Hồ sơ đi khám = (benh_nhan_id, ho_so_nguoi_than_id); khi đếm hoặc so sánh dùng <=> vì NULL = NULL không đúng',
  `bac_si_id` bigint NOT NULL,
  `chi_nhanh_id` bigint NOT NULL COMMENT 'Snapshot chi nhánh tại thời điểm đặt',
  `dich_vu_kham_id` bigint NOT NULL COMMENT 'Snapshot dịch vụ tại thời điểm đặt',
  `thoi_gian` datetime NOT NULL COMMENT 'Sao chép từ khung_gio.ngay_gio, không đổi',
  `gia_snapshot` decimal(12,2) NOT NULL COMMENT 'Giá cuối = giá mặc định + phụ phí lúc đặt; lịch mới do đổi lịch sao chép từ lịch trước',
  `tien_coc_snapshot` decimal(12,2) NOT NULL DEFAULT 0 COMMENT 'Lịch mới do đổi lịch sao chép từ lịch trước',
  `chinh_sach_hoan_snapshot` json COMMENT 'Bản sao các mốc hoàn tiền lúc đặt (chính sách không hồi tố); lịch mới do đổi lịch sao chép từ lịch trước',
  `trang_thai` ENUM ('ChoThanhToan', 'DaXacNhan', 'DaTiepDon', 'HoanThanh', 'DaHuy', 'DaDoiLich', 'VangMat') NOT NULL,
  `han_thanh_toan` datetime COMMENT 'Quá hạn mà chưa thanh toán thì tự hủy',
  `thoi_diem_huy` datetime,
  `ly_do_huy` varchar(255),
  `ly_do_kham` text,
  `thoi_diem_tao` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm đặt lịch',
  `cap_nhat_lan_cuoi` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Tự cập nhật mỗi khi dòng thay đổi (ON UPDATE trong SQL)'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` (
  `yeu_cau_doi_lich_ngoai_chinh_sach_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `lich_hen_id` bigint NOT NULL,
  `khung_gio_mong_muon_id` bigint NOT NULL,
  `ly_do_yeu_cau` text NOT NULL COMMENT 'Lý do bệnh nhân cần đổi lịch',
  `trang_thai` ENUM ('ChoDuyet', 'DaDuyet', 'TuChoi') NOT NULL DEFAULT 'ChoDuyet',
  `ghi_chu_xu_ly` varchar(255) COMMENT 'Ghi chú của Lễ tân hoặc Quản trị viên khi duyệt hoặc từ chối',
  `nguoi_xu_ly_id` bigint COMMENT 'Lễ tân hoặc Quản trị viên',
  `thoi_diem_xu_ly` datetime COMMENT 'Ràng buộc: ChoDuyet thì người xử lý và thời điểm xử lý đều trống; DaDuyet hoặc TuChoi thì cả hai đều có',
  `thoi_diem_tao` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `ho_so_kham` (
  `ho_so_kham_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `lich_hen_id` bigint UNIQUE NOT NULL,
  `trieu_chung` text,
  `chan_doan_so_bo` text,
  `huong_xu_ly` text,
  `ngay_tai_kham_du_kien` date,
  `cap_nhat_lan_cuoi` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `muc_cho_danh_sach_cho` (
  `muc_cho_danh_sach_cho_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `benh_nhan_id` bigint NOT NULL,
  `bac_si_id` bigint NOT NULL,
  `ngay_mong_muon` date NOT NULL,
  `ca_mong_muon` ENUM ('CaSang', 'CaChieu', 'CaToi') NOT NULL,
  `thoi_diem_dang_ky` datetime NOT NULL COMMENT 'Dùng để xếp thứ hạng',
  `trang_thai` ENUM ('DangCho', 'DaMoi', 'DaChapNhan', 'DaTuChoi', 'HetHan') NOT NULL DEFAULT 'DangCho',
  `khung_gio_duoc_moi_id` bigint COMMENT 'Slot đang giữ cho lời mời',
  `khung_gio_dang_moi` bigint GENERATED ALWAYS AS (IF(`trang_thai` = 'DaMoi', `khung_gio_duoc_moi_id`, NULL)) STORED UNIQUE COMMENT 'Bằng khung_gio_duoc_moi_id khi trạng thái = DaMoi, còn lại NULL. Cột sinh STORED + UNIQUE: mỗi lúc chỉ 1 ứng viên cho 1 slot',
  `thoi_han_phan_hoi` datetime
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `vi_noi_bo` (
  `vi_noi_bo_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `benh_nhan_id` bigint UNIQUE NOT NULL,
  `so_du` decimal(12,2) NOT NULL DEFAULT 0,
  `so_tien_dang_giu` decimal(12,2) NOT NULL DEFAULT 0 COMMENT 'Tiền đang giữ cho yêu cầu rút chờ duyệt'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `giao_dich_thanh_toan` (
  `giao_dich_thanh_toan_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `vi_noi_bo_id` bigint COMMENT 'NapVi hoặc thanh toán bằng ví; để trống khi thu tiền mặt tại quầy',
  `lich_hen_id` bigint COMMENT 'Chỉ có khi ThanhToanLichHen; trỏ LỊCH GỐC của chuỗi đổi lịch, không đổi khi đổi lịch',
  `loai` ENUM ('NapVi', 'ThanhToanLichHen') NOT NULL,
  `phuong_thuc` ENUM ('Vi', 'VNPay', 'MoMo', 'TienMatTaiQuay') NOT NULL,
  `so_tien` decimal(12,2) NOT NULL,
  `trang_thai` ENUM ('KhoiTao', 'DangXuLy', 'ThanhCong', 'ThatBai', 'HetHan') NOT NULL DEFAULT 'KhoiTao',
  `ma_giao_dich_cong` varchar(100) COMMENT 'Mã cổng thanh toán trả về; chống xử lý trùng (idempotent)',
  `trang_thai_doi_soat` ENUM ('KhongCan', 'ChoDoiSoat', 'DaDoiSoat') NOT NULL DEFAULT 'KhongCan',
  `nguoi_thu_id` bigint COMMENT 'Lễ tân XÁC NHẬN ĐÃ NHẬN tiền mặt (không phải người tạo bản ghi, không phải người thanh toán). Bắt buộc khi phuong_thuc = TienMatTaiQuay, để trống với mọi phương thức khác (chk_gd_tien_mat_nguoi_thu). Khóa ngoại tới le_tan nên không thể là bác sĩ, bệnh nhân hay quản trị viên. Service lấy từ phiên đăng nhập của Lễ tân (không nhận từ giao diện) và kiểm tra Lễ tân thuộc chi nhánh của lịch hẹn lúc thu; DB không chặn chi nhánh',
  `thoi_diem_tao` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `lich_su_hoan_tien` (
  `lich_su_hoan_tien_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `giao_dich_thanh_toan_id` bigint NOT NULL COMMENT 'Khoản cọc được hoàn = giao dịch thanh toán của lịch gốc',
  `vi_noi_bo_id` bigint NOT NULL COMMENT 'Tiền hoàn chỉ về ví, không hoàn tiền mặt',
  `so_tien` decimal(12,2) NOT NULL,
  `ly_do` varchar(255),
  `trang_thai` ENUM ('ThanhCong', 'ThatBai') NOT NULL,
  `so_lan_thu` int NOT NULL DEFAULT 1 COMMENT 'Mỗi dòng = 1 lần thử, kể cả thất bại',
  `thoi_diem` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `yeu_cau_rut_tien` (
  `yeu_cau_rut_tien_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `vi_noi_bo_id` bigint NOT NULL,
  `so_tien` decimal(12,2) NOT NULL,
  `trang_thai` ENUM ('ChoDuyet', 'DaDuyet', 'TuChoi') NOT NULL DEFAULT 'ChoDuyet',
  `nguoi_xu_ly_id` bigint,
  `thoi_diem_yeu_cau` datetime NOT NULL,
  `thoi_diem_xu_ly` datetime COMMENT 'Ràng buộc: ChoDuyet thì người xử lý và thời điểm xử lý đều trống; DaDuyet hoặc TuChoi thì cả hai đều có'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `giao_dich_vi` (
  `giao_dich_vi_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `vi_noi_bo_id` bigint NOT NULL,
  `loai` ENUM ('Nap', 'ThanhToan', 'HoanTien', 'Rut') NOT NULL,
  `so_tien` decimal(12,2) NOT NULL COMMENT 'Có dấu: dương = tiền vào, âm = tiền ra',
  `so_du_sau` decimal(12,2) NOT NULL,
  `giao_dich_thanh_toan_id` bigint,
  `lich_su_hoan_tien_id` bigint,
  `yeu_cau_rut_tien_id` bigint,
  `thoi_diem` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `danh_gia_bac_si` (
  `danh_gia_bac_si_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `lich_hen_id` bigint UNIQUE NOT NULL COMMENT 'Tối đa 1 đánh giá cho mỗi lịch hẹn; bác sĩ và bệnh nhân suy ra qua lich_hen',
  `so_sao` tinyint NOT NULL COMMENT 'Ràng buộc: 1 đến 5',
  `nhan_xet` text,
  `bi_an` boolean NOT NULL DEFAULT false,
  `ly_do_an` varchar(255) COMMENT 'Bắt buộc khi bi_an = true; để trống khi bi_an = false. Người ẩn và thời điểm ẩn nằm trong nhat_ky_hanh_dong (AnDanhGia)',
  `thoi_diem_tao` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `bai_viet` (
  `bai_viet_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `tac_gia_id` bigint NOT NULL,
  `tieu_de` varchar(255) NOT NULL,
  `mo_ta_ngan` varchar(500),
  `noi_dung` text NOT NULL,
  `anh_dai_dien` varchar(255),
  `trang_thai` ENUM ('BanNhap', 'DaXuatBan', 'LuuTruAn') NOT NULL DEFAULT 'BanNhap',
  `thoi_diem_xuat_ban` datetime,
  `thoi_diem_tao` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cap_nhat_lan_cuoi` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Tự cập nhật mỗi khi dòng thay đổi (ON UPDATE trong SQL)'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `hashtag` (
  `hashtag_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `ten` varchar(50) UNIQUE NOT NULL COMMENT 'Chuẩn hóa chữ thường',
  `trang_thai_hoat_dong` boolean NOT NULL DEFAULT true
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `bai_viet_hashtag` (
  `bai_viet_id` bigint,
  `hashtag_id` bigint,
  PRIMARY KEY (`bai_viet_id`, `hashtag_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `benh_nhan_danh_gia_bai_viet` (
  `benh_nhan_id` bigint,
  `bai_viet_id` bigint,
  `loai` ENUM ('Thich', 'KhongThich') NOT NULL,
  PRIMARY KEY (`benh_nhan_id`, `bai_viet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `thong_bao` (
  `thong_bao_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `tai_khoan_id` bigint NOT NULL,
  `noi_dung` varchar(500) NOT NULL,
  `loai_su_kien` varchar(100) NOT NULL COMMENT 'Mã sự kiện nghiệp vụ. Sự kiện báo bệnh nhân về thay đổi chi nhánh sắp có hiệu lực: [đề xuất] ThayDoiChiNhanhAnhHuongLichHen; kết quả cho người đề xuất: [đề xuất] KetQuaYeuCauThayDoiChiNhanh. Chưa có danh mục mã sự kiện chung',
  `trang_thai_doc` boolean NOT NULL DEFAULT false,
  `yeu_cau_thay_doi_chi_nhanh_id` bigint COMMENT 'Chỉ có với thông báo sinh từ yêu cầu thay đổi chi nhánh; các thông báo khác để trống. Cùng (yêu cầu, tài khoản, loại sự kiện) chỉ có 1 thông báo nên duyệt lại/chạy lại không tạo thông báo trùng',
  `thoi_diem_tao` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `email_thong_bao` (
  `email_thong_bao_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `thong_bao_id` bigint UNIQUE NOT NULL COMMENT 'UNIQUE: mỗi thông báo có đúng 1 dòng email; gửi lại cập nhật chính dòng này, không tạo dòng mới',
  `trang_thai` ENUM ('ChoGui', 'DaGui', 'ThatBai') NOT NULL DEFAULT 'ChoGui',
  `so_lan_thu` int NOT NULL DEFAULT 0 COMMENT 'Số lần đã thử gửi, tăng khi nhận việc gửi',
  `lan_thu_cuoi_luc` datetime,
  `da_gui_luc` datetime COMMENT 'Chỉ có khi DaGui',
  `loi_cuoi` varchar(500) COMMENT 'Bắt buộc khi ThatBai: lỗi của Dịch vụ Email ở lần thử cuối',
  `thoi_diem_tao` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `nhac_lich_hen` (
  `lich_hen_id` bigint,
  `so_gio_truoc` int COMMENT 'Mốc nhắc = số giờ trước giờ hẹn, là CHÍNH một phần tử của cau_hinh_he_thong.thoi_diem_nhac_lich tại lúc tạo dòng (không phải vị trí trong mảng nên đổi mảng không làm lệch lịch sử); >= 1 (chk_nhac_lich_hen_moc)',
  `trang_thai` ENUM ('ChoGui', 'DaGui', 'ThatBai') NOT NULL DEFAULT 'ChoGui',
  `so_lan_thu` int NOT NULL DEFAULT 0 COMMENT 'Số lần đã thử gửi, tăng khi nhận việc gửi',
  `lan_thu_cuoi_luc` datetime,
  `da_gui_luc` datetime COMMENT 'Chỉ có khi DaGui',
  `loi_cuoi` varchar(500) COMMENT 'Bắt buộc khi ThatBai: lỗi của Dịch vụ Email ở lần thử cuối',
  `thoi_diem_tao` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`lich_hen_id`, `so_gio_truoc`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `hoi_thoai` (
  `hoi_thoai_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `loai` ENUM ('BenhNhan_BacSi', 'BenhNhan_LeTan') NOT NULL,
  `chi_nhanh_id` bigint COMMENT 'BenhNhan_LeTan: bắt buộc (hộp thư chung chi nhánh); BenhNhan_BacSi: để trống',
  `nguoi_tao_id` bigint NOT NULL,
  `thoi_diem_tao` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tai_khoan_hoi_thoai` (
  `tai_khoan_id` bigint,
  `hoi_thoai_id` bigint,
  `tin_nhan_cuoi_da_doc_id` bigint COMMENT 'Tin mới nhất người này đã đọc; để trống = chưa đọc gì',
  PRIMARY KEY (`tai_khoan_id`, `hoi_thoai_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tin_nhan` (
  `tin_nhan_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `hoi_thoai_id` bigint NOT NULL,
  `nguoi_gui_id` bigint NOT NULL,
  `noi_dung` text NOT NULL,
  `tep_dinh_kem` varchar(255),
  `thoi_diem_gui` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `nhat_ky_hanh_dong` (
  `nhat_ky_hanh_dong_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `tai_khoan_id` bigint NOT NULL COMMENT 'Người thực hiện',
  `chi_nhanh_id` bigint COMMENT 'Chi nhánh liên quan, để Quản trị viên phạm vi Chi nhánh lọc nhật ký',
  `hanh_dong` ENUM ('DoiQuyen', 'OverrideLichHen', 'HoanTienDacBiet', 'DoiChiNhanhBacSi', 'ChinhNoShow', 'AnDanhGia', 'XuLyDoiLichNgoaiChinhSach', 'SuaGhiChuKham', 'BacSiHuyDotXuat', 'CapNhatCauHinh', 'XuLyNapViChuaCong') NOT NULL,
  `loai_doi_tuong` ENUM ('tai_khoan', 'benh_nhan', 'lich_hen', 'ho_so_kham', 'danh_gia_bac_si', 'giao_dich_thanh_toan', 'yeu_cau_doi_lich_ngoai_chinh_sach', 'cau_hinh_he_thong') NOT NULL COMMENT 'Bảng bị tác động',
  `ma_doi_tuong` bigint NOT NULL COMMENT 'Khóa chính của bản ghi bị tác động; không có FK để nhật ký còn nguyên khi bản ghi gốc bị xóa hoặc ẩn',
  `thoi_diem` datetime NOT NULL,
  `ket_qua` ENUM ('ThanhCong', 'ThatBai') NOT NULL,
  `chi_tiet_thay_doi` json COMMENT 'Nội dung trước và sau khi thay đổi. Với hanh_dong = CapNhatCauHinh BẮT BUỘC có dạng {"truoc":{<tham số>:<giá trị cũ>},"sau":{<cùng tập tham số>:<giá trị mới>},"ly_do":"..."}: truoc và sau cùng tập khóa (chỉ tham số có đổi, ít nhất 1), ly_do là chuỗi không rỗng [đề xuất: bắt buộc]; lần tạo dòng cấu hình đầu tiên ghi truoc = null cho từng tham số (chk_nhat_ky_cap_nhat_cau_hinh)'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX `ma_xac_thuc_index_0` ON `ma_xac_thuc` (`tai_khoan_id`, `loai`, `het_han_luc`);

CREATE INDEX `ma_xac_thuc_index_tao_luc` ON `ma_xac_thuc` (`tai_khoan_id`, `loai`, `tao_luc`);

CREATE INDEX `phien_dang_nhap_index_tai_khoan` ON `phien_dang_nhap` (`tai_khoan_id`, `thu_hoi_luc`);

CREATE UNIQUE INDEX `moc_hoan_tien_index_1` ON `moc_hoan_tien` (`dich_vu_kham_id`, `so_gio_truoc_toi_thieu`);

-- Mỗi (chức danh, mốc năm) tối đa 1 dòng, KỂ CẢ dòng đã tắt (ap_dung = false)
CREATE UNIQUE INDEX `phu_phi_bac_si_index_2` ON `phu_phi_bac_si` (`chuc_danh`, `so_nam_kinh_nghiem_tu`);

CREATE UNIQUE INDEX `lich_lam_viec_index_3` ON `lich_lam_viec` (`bac_si_id`, `ngay`, `ca`);

CREATE INDEX `lich_lam_viec_index_4` ON `lich_lam_viec` (`chi_nhanh_id`, `ngay`);

CREATE UNIQUE INDEX `khung_gio_index_5` ON `khung_gio` (`lich_lam_viec_id`, `ngay_gio`);

CREATE INDEX `khung_gio_index_6` ON `khung_gio` (`trang_thai`, `ngay_gio`);

CREATE INDEX `khung_gio_index_7` ON `khung_gio` (`trang_thai`, `giu_cho_den`);

CREATE INDEX `yeu_cau_nghi_phep_index_8` ON `yeu_cau_nghi_phep` (`bac_si_id`, `ngay_bat_dau`, `trang_thai`);

CREATE INDEX `lich_hen_index_9` ON `lich_hen` (`benh_nhan_id`, `trang_thai`, `thoi_gian`);

CREATE INDEX `lich_hen_index_10` ON `lich_hen` (`bac_si_id`, `thoi_gian`);

CREATE INDEX `lich_hen_index_11` ON `lich_hen` (`trang_thai`, `han_thanh_toan`);

-- Quản trị viên Chi nhánh xem Bệnh nhân có lịch hẹn tại chi nhánh mình (không có chi_nhanh_id ở benh_nhan)
CREATE INDEX `lich_hen_index_chi_nhanh_benh_nhan` ON `lich_hen` (`chi_nhanh_id`, `benh_nhan_id`);

-- Đếm lịch hẹn đang hoạt động theo hồ sơ đi khám; đồng thời là chỉ mục của khóa ngoại kép fk_lich_hen_ho_so_chu_so_huu (2 cột đầu đúng thứ tự khóa ngoại)
CREATE INDEX `lich_hen_index_ho_so_benh_nhan_trang_thai` ON `lich_hen` (`ho_so_nguoi_than_id`, `benh_nhan_id`, `trang_thai`);

-- Để lich_hen tham chiếu bằng khóa ngoại kép: DB chặn gắn lịch hẹn với hồ sơ người thân của bệnh nhân khác
CREATE UNIQUE INDEX `ho_so_nguoi_than_index_chu_so_huu` ON `ho_so_nguoi_than` (`ho_so_nguoi_than_id`, `benh_nhan_id`);

CREATE INDEX `yeu_cau_doi_lich_ngoai_chinh_sach_index_12` ON `yeu_cau_doi_lich_ngoai_chinh_sach` (`trang_thai`, `thoi_diem_tao`);

CREATE INDEX `muc_cho_danh_sach_cho_index_13` ON `muc_cho_danh_sach_cho` (`bac_si_id`, `ngay_mong_muon`, `ca_mong_muon`, `trang_thai`, `thoi_diem_dang_ky`);

CREATE INDEX `muc_cho_danh_sach_cho_index_14` ON `muc_cho_danh_sach_cho` (`trang_thai`, `thoi_han_phan_hoi`);

CREATE INDEX `muc_cho_danh_sach_cho_index_15` ON `muc_cho_danh_sach_cho` (`benh_nhan_id`, `trang_thai`);

CREATE UNIQUE INDEX `giao_dich_thanh_toan_index_16` ON `giao_dich_thanh_toan` (`phuong_thuc`, `ma_giao_dich_cong`);

CREATE INDEX `giao_dich_thanh_toan_index_17` ON `giao_dich_thanh_toan` (`vi_noi_bo_id`, `thoi_diem_tao`);

CREATE INDEX `giao_dich_thanh_toan_index_18` ON `giao_dich_thanh_toan` (`trang_thai`, `thoi_diem_tao`);

CREATE INDEX `giao_dich_thanh_toan_index_19` ON `giao_dich_thanh_toan` (`trang_thai_doi_soat`);

CREATE UNIQUE INDEX `lich_su_hoan_tien_index_20` ON `lich_su_hoan_tien` (`giao_dich_thanh_toan_id`, `so_lan_thu`);

CREATE INDEX `yeu_cau_rut_tien_index_21` ON `yeu_cau_rut_tien` (`trang_thai`, `thoi_diem_yeu_cau`);

CREATE INDEX `giao_dich_vi_index_22` ON `giao_dich_vi` (`vi_noi_bo_id`, `thoi_diem`);

CREATE INDEX `bai_viet_hashtag_index_23` ON `bai_viet_hashtag` (`hashtag_id`, `bai_viet_id`);

CREATE INDEX `benh_nhan_danh_gia_bai_viet_index_24` ON `benh_nhan_danh_gia_bai_viet` (`bai_viet_id`, `loai`);

CREATE INDEX `thong_bao_index_25` ON `thong_bao` (`tai_khoan_id`, `trang_thai_doc`, `thoi_diem_tao`);

CREATE UNIQUE INDEX `thong_bao_index_yeu_cau_chi_nhanh` ON `thong_bao` (`yeu_cau_thay_doi_chi_nhanh_id`, `tai_khoan_id`, `loai_su_kien`);

CREATE INDEX `email_thong_bao_index_trang_thai` ON `email_thong_bao` (`trang_thai`, `lan_thu_cuoi_luc`);

CREATE INDEX `nhac_lich_hen_index_trang_thai` ON `nhac_lich_hen` (`trang_thai`, `lan_thu_cuoi_luc`);

CREATE INDEX `yeu_cau_thay_doi_chi_nhanh_index_chi_nhanh` ON `yeu_cau_thay_doi_chi_nhanh` (`chi_nhanh_id`, `trang_thai`);

CREATE INDEX `yeu_cau_thay_doi_chi_nhanh_index_hieu_luc` ON `yeu_cau_thay_doi_chi_nhanh` (`trang_thai`, `hieu_luc_tu`);

CREATE INDEX `yeu_cau_thay_doi_chi_nhanh_lich_hen_index_lich_hen` ON `yeu_cau_thay_doi_chi_nhanh_lich_hen` (`lich_hen_id`);

CREATE INDEX `hoi_thoai_index_26` ON `hoi_thoai` (`chi_nhanh_id`, `loai`, `thoi_diem_tao`);

CREATE INDEX `tai_khoan_hoi_thoai_index_27` ON `tai_khoan_hoi_thoai` (`hoi_thoai_id`, `tai_khoan_id`);

CREATE INDEX `tin_nhan_index_28` ON `tin_nhan` (`hoi_thoai_id`, `tin_nhan_id`);

CREATE INDEX `nhat_ky_hanh_dong_index_29` ON `nhat_ky_hanh_dong` (`loai_doi_tuong`, `ma_doi_tuong`, `thoi_diem`);

CREATE INDEX `nhat_ky_hanh_dong_index_30` ON `nhat_ky_hanh_dong` (`tai_khoan_id`, `thoi_diem`);

CREATE INDEX `nhat_ky_hanh_dong_index_31` ON `nhat_ky_hanh_dong` (`chi_nhanh_id`, `thoi_diem`);

ALTER TABLE `bac_si` COMMENT = '1 bác sĩ thuộc 1 chuyên khoa và nhận 1 dịch vụ khám chính; chuyên khoa và dịch vụ là hai chiều phân loại độc lập. Giá khám = giá mặc định của dịch vụ + phụ phí (bảng phu_phi_bac_si, tra theo chuc_danh và so_nam_kinh_nghiem; hoc_vi chỉ cho điểm AI). Ràng buộc (kiểm tra ở service): cặp (chi_nhanh_id, dich_vu_kham_id) phải có trong chi_nhanh_dich_vu_kham.';

ALTER TABLE `quan_tri_vien` COMMENT = 'Ràng buộc: phạm vi Chi nhánh thì bắt buộc có chi_nhanh_id; phạm vi Toàn hệ thống thì để trống.';

ALTER TABLE `nhom_dich_vu` COMMENT = 'Chỉ để phân loại và điều hướng, không dùng trực tiếp để đặt lịch hay tính giá.';

ALTER TABLE `chi_nhanh_dich_vu_kham` COMMENT = 'Dịch vụ của bác sĩ phải nằm trong danh sách này của chi nhánh bác sĩ công tác. Lúc đặt lịch, cặp (chi nhánh, dịch vụ) cũng phải có ở đây. Bỏ một dịch vụ khỏi danh sách đang có lịch hẹn Chờ thanh toán/Đã xác nhận thì phải đi qua yeu_cau_thay_doi_chi_nhanh.';

ALTER TABLE `phu_phi_bac_si` COMMENT = 'Quy tắc phụ phí do Quản trị viên Toàn hệ thống cấu hình, KHÔNG có dòng nào tạo sẵn. Phụ phí hiện hành của bác sĩ = phu_phi của dòng cùng CHỨC DANH, ap_dung = true, so_nam_kinh_nghiem_tu lớn nhất nhưng không vượt số năm của bác sĩ; không có dòng thì bằng 0. Dòng ap_dung = false bị loại khỏi phép tính: tắt mốc cao thì bác sĩ rơi xuống mốc thấp hơn đang áp dụng, không về 0 [cần điền: nhóm xác nhận]. Giá chốt lưu ở lich_hen.gia_snapshot lúc đặt; sửa/tắt/xóa quy tắc hay đổi chức danh, học vị, số năm kinh nghiệm sau đó không đổi lịch đã đặt.';

ALTER TABLE `cau_hinh_he_thong` COMMENT = 'Bảng 1 dòng (id = 1), KHÔNG có dòng nào được tạo sẵn: cột chưa có mặc định là [cần điền] và NOT NULL nên dòng chỉ tạo được khi nhóm đã chốt đủ giá trị (mẫu INSERT ở clinix_quy_tac_nghiep_vu.md mục 5; thiếu giá trị thì MySQL báo lỗi 1364); chưa có dòng thì dịch vụ từ chối chức năng đọc cấu hình. Thời lượng khung giờ lấy theo dich_vu_kham.thoi_luong; không có giới hạn số ngày đặt trước cố định; không còn ghim ưu tiên bác sĩ. Sửa cấu hình phải ghi nhat_ky_hanh_dong (CapNhatCauHinh) trong cùng giao dịch. so_ngay_bao_truoc_doi_gio_lam: số NGÀY (>= 0) phải thông báo cho bệnh nhân bị ảnh hưởng trước khi thay đổi ngày/giờ hoạt động hoặc dịch vụ khả dụng của chi nhánh có hiệu lực; được chụp vào yeu_cau_thay_doi_chi_nhanh.so_ngay_bao_truoc khi duyệt.';

ALTER TABLE `chi_nhanh` COMMENT = 'Ngày và giờ hoạt động nằm ở bảng con chi_nhanh_lich_hoat_dong (mỗi thứ trong tuần 1 dòng); 2 cột gio_mo_cua/gio_dong_cua chung của bản trước (17/10/2026) đã bỏ. Chi nhánh mới phải có đủ 7 dòng lịch hoạt động (service); thứ chưa khai báo coi như chưa khai báo và không nhận phân công, không nhận đặt lịch.';

ALTER TABLE `chi_nhanh_lich_hoat_dong` COMMENT = 'Lịch NHẬN KHÁM hằng tuần của chi nhánh, mỗi thứ tối đa 1 dòng và tối đa 2 khoảng nhận khám: buổi sáng (gio_bat_dau_sang đến gio_ket_thuc_sang, dùng cho ca CaSang) và buổi chiều (gio_bat_dau_chieu đến gio_ket_thuc_chieu, dùng cho ca CaChieu); mỗi khoảng có thể không tồn tại (cả hai giờ để trống). Ngày nghỉ: hoat_dong = false và cả bốn giờ để trống. Ngày hoạt động: có ít nhất một khoảng đầy đủ, bắt đầu < kết thúc, hai khoảng không chồng nhau (kết thúc sáng <= bắt đầu chiều), không có ca qua đêm (chk_lich_hoat_dong_khoang, chk_lich_hoat_dong_khong_chong, chk_lich_hoat_dong_ngay). Giờ mở và giờ đóng tổng quát để hiển thị KHÔNG lưu riêng mà suy ra từ các khoảng (giờ bắt đầu sớm nhất, giờ kết thúc muộn nhất; truy vấn mẫu cuối file). Giờ lưu ở đây là giờ nhận khám: khung giờ đặt khám phải nằm trọn trong một khoảng. Giờ mở cửa tiếp đón (nếu sớm hơn giờ nhận khám) chưa có chỗ lưu [cần điền: 07:30 trong giao diện minh họa là giờ bắt đầu nhận khám hay chỉ giờ mở cửa tiếp đón]. Chưa có lịch nghỉ lễ (chưa có quyết định). Là trạng thái ĐANG ÁP DỤNG: thay đổi ảnh hưởng lịch hẹn chỉ được ghi vào đây khi đến hieu_luc_tu của yeu_cau_thay_doi_chi_nhanh. DB không chặn phân công/đặt lịch ngoài khoảng nhận khám hoặc vào ca không tồn tại: service kiểm tra (truy vấn mẫu cuối file).';

ALTER TABLE `yeu_cau_thay_doi_chi_nhanh` COMMENT = 'Thứ tự nghiệp vụ: đề xuất (ChoDuyet) -> kiểm tra lịch hẹn bị ảnh hưởng -> duyệt hoặc từ chối -> (duyệt) tạo thông báo + email cho bệnh nhân bị ảnh hưởng, ghi danh sách vào yeu_cau_thay_doi_chi_nhanh_lich_hen -> đến hieu_luc_tu mới áp dụng (ap_dung_luc). Thay đổi không ảnh hưởng lịch hẹn nào thì áp dụng ngay, không cần dòng này. Chưa quy định: nhiều yêu cầu ChoDuyet cùng chi nhánh, rút yêu cầu, cách xử lý lịch hẹn bị ảnh hưởng sau khi áp dụng [cần điền].';

ALTER TABLE `yeu_cau_thay_doi_chi_nhanh_lich_hen` COMMENT = 'Danh sách lịch hẹn (Chờ thanh toán, Đã xác nhận) bị ảnh hưởng, chụp lúc duyệt, tính với thời điểm có hiệu lực. Là cơ sở tạo thông báo cho đúng bệnh nhân đặt lịch (lich_hen.benh_nhan_id). Chưa lưu cách xử lý từng lịch hẹn [cần điền].';

ALTER TABLE `lich_lam_viec` COMMENT = 'Quy tắc service (DB không chặn): lich_lam_viec.chi_nhanh_id là chi nhánh tại thời điểm phân công. Chỉ phân công vào ngày chi nhánh có hoat_dong = true theo thứ của ngay VÀ ca phải có khoảng nhận khám tương ứng: CaSang cần khoảng sáng, CaChieu cần khoảng chiều; không phân công ca không tồn tại ở ngày đó (thao tác Cả ngày = CaSang + CaChieu chỉ hợp lệ khi cả hai khoảng tồn tại); không phân công vào ngày nghỉ hay chi nhánh chưa khai báo lịch hoạt động. Giờ của ca không có cột riêng: giờ ca là khoảng tương ứng của chi nhánh vào thứ đó [đề xuất]. CaToi vẫn còn trong enum nhưng lịch hoạt động không có khoảng tối nên không phân công được CaToi (nhóm quyết giữ hay bỏ khỏi enum: xem mục 8 của clinix_quy_tac_nghiep_vu.md).';

ALTER TABLE `khung_gio` COMMENT = 'Khung giờ chỉ được sinh, hiển thị ConTrong và được giữ chỗ/đặt khi ngày của ngay_gio là ngày hoạt động của chi nhánh và [ngay_gio, ngay_gio + dich_vu_kham.thoi_luong] nằm TRỌN trong đúng một khoảng nhận khám của chi nhánh vào thứ đó, là khoảng ứng với ca của lich_lam_viec (CaSang: khoảng sáng; CaChieu: khoảng chiều). Không sinh khung giờ xuyên giờ nghỉ trưa hay kết thúc sau giờ kết thúc của khoảng. Các khung giờ trong cùng một khoảng nối liền nhau: khung đầu bắt đầu đúng giờ bắt đầu khoảng, mỗi khung dài đúng dich_vu_kham.thoi_luong, khung sau bắt đầu đúng lúc khung trước kết thúc (khoảng cách giữa các giờ bắt đầu = thời lượng khám); phần dư cuối khoảng không đủ một khung thì không sinh khung giờ (nhóm đồng ý 20/10/2026). Kiểm tra ở service (lúc sinh khung giờ, tính khung giờ trống, giữ chỗ/đặt lịch), DB không chặn.';

ALTER TABLE `thong_bao` COMMENT = 'Thông báo trong ứng dụng. "Đẩy tức thời" là cách giao diện hiển thị ngay cho phiên đang mở, không phải thông báo đẩy trên thiết bị di động; CSDL không có bảng token thiết bị. Email của thông báo nằm ở email_thong_bao.';

ALTER TABLE `email_thong_bao` COMMENT = 'Ghi nhận và gửi lại email của thông báo sự kiện. Email lỗi chỉ đổi dòng này sang ThatBai, KHÔNG xóa thông báo và KHÔNG hoàn tác nghiệp vụ. Không gửi trùng: DaGui là trạng thái cuối; mỗi lần nhận việc là 1 UPDATE có điều kiện (trang_thai khác DaGui và so_lan_thu còn đúng giá trị đã đọc), chỉ worker có ROW_COUNT = 1 được gửi. Số lần thử lại tối đa và khoảng cách [cần điền]. Email nhắc lịch hẹn (2.4.69) không có thông báo đi kèm nên ghi ở nhac_lich_hen, không ở bảng này.';

ALTER TABLE `nhac_lich_hen` COMMENT = 'Ghi nhận việc gửi email nhắc lịch hẹn theo từng mốc (use case Gửi nhắc lịch hẹn theo lịch trình). Nhắc lịch chỉ qua email, không có thong_bao đi kèm. Dòng chỉ được tạo khi mốc đến hạn (INSERT ... ON DUPLICATE KEY UPDATE lich_hen_id = lich_hen_id; ROW_COUNT 1 = vừa tạo). Nhận việc gửi bằng UPDATE có điều kiện (trang_thai khác DaGui và so_lan_thu còn đúng giá trị đã đọc), chỉ worker có ROW_COUNT = 1 được gửi. Thử lại theo 2.4.69 (3 lần, cách 5 phút, chỉ khi lịch hẹn còn DaXacNhan và chưa tới giờ hẹn) là hằng số của service; hết lần thì giữ ThatBai, không gửi bù mốc khác. Lịch hẹn đổi giờ tạo lich_hen mới nên tự có bộ mốc mới. Chưa chốt [cần điền]: lần gửi đầu có tính vào số lần thử lại không; cho phép trễ tối đa bao lâu sau khi đạt mốc.';

ALTER TABLE `nhat_ky_hanh_dong` COMMENT = 'CapNhatCauHinh: loai_doi_tuong = cau_hinh_he_thong, ma_doi_tuong = 1, chi_nhanh_id để trống; ghi cùng giao dịch với việc sửa cấu hình (DB không tự ép: không dùng trigger, service chịu trách nhiệm). XuLyNapViChuaCong: loai_doi_tuong = giao_dich_thanh_toan, ma_doi_tuong = giao_dich_thanh_toan_id; ghi cùng giao dịch với thao tác cộng ví và đánh dấu đã đối soát (UC 53/70). Giới hạn quyền Admin theo UC 53, DB không tự kiểm tra vai trò.';

ALTER TABLE `yeu_cau_nghi_phep` COMMENT = 'Ràng buộc theo hình thức nghỉ. CaNgay: không có ca, ngày bắt đầu <= ngày kết thúc (được nghỉ nhiều ngày). TheoCa: bắt buộc có ca, chỉ nghỉ 1 ngày.';

ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` COMMENT = 'Ràng buộc: khi đã xử lý (khác ChoDuyet) thì bắt buộc có ghi_chu_xu_ly.';

ALTER TABLE `ho_so_kham` COMMENT = 'Ghi hồ sơ khám là thao tác độc lập với xác nhận hoàn thành ca khám: bác sĩ ghi được khi lịch hẹn Đã tiếp đón hoặc sau khi Hoàn thành; KHÔNG bắt buộc đã có dòng ho_so_kham trước khi Hoàn thành (quyết định 17/10/2026). Khi bác sĩ lưu, các trường bắt buộc (triệu chứng, chẩn đoán sơ bộ, hướng xử lý) phải có nội dung (kiểm tra ở service; DB cho phép NULL). Chưa có hồ sơ thì giao diện bệnh nhân hiển thị "Chưa có hồ sơ khám", không tạo nội dung giả.';

ALTER TABLE `muc_cho_danh_sach_cho` COMMENT = 'Không cho đăng ký trùng tiêu chí (bệnh nhân, bác sĩ, ngày, ca) khi còn DangCho hoặc DaMoi (kiểm tra ở service).';

ALTER TABLE `vi_noi_bo` COMMENT = 'Ràng buộc: so_du >= 0, so_tien_dang_giu >= 0 và so_tien_dang_giu <= so_du. Số dư khả dụng = so_du - so_tien_dang_giu (tính khi đọc, không lưu). Ví được tạo cùng giao dịch với benh_nhan khi xác minh OTP đăng ký (so_du = 0, so_tien_dang_giu = 0); mỗi bệnh nhân đúng một ví.';

ALTER TABLE `giao_dich_thanh_toan` COMMENT = 'Ràng buộc: NapVi thì lich_hen_id để trống và có vi_noi_bo_id; ThanhToanLichHen thì bắt buộc có lich_hen_id. Thu tiền mặt tại quầy (phuong_thuc = TienMatTaiQuay): chỉ ThanhToanLichHen, bắt buộc có lich_hen_id (lịch gốc) và nguoi_thu_id, không có vi_noi_bo_id và ma_giao_dich_cong, so_tien > 0, trang_thai = ThanhCong (dòng chỉ được tạo khi Lễ tân đã thu đủ phần còn lại; thu không thành công thì không tạo dòng); mọi phương thức khác thì nguoi_thu_id để trống (chk_gd_tien_mat_nguoi_thu). Một lịch hẹn có thể có nhiều dòng (khoản cọc và khoản thu còn lại) nên KHÔNG có UNIQUE theo lich_hen_id. Service chịu trách nhiệm: lấy nguoi_thu_id từ phiên đăng nhập, Lễ tân đúng chi nhánh của lịch hẹn, thu đủ đúng số còn phải thu, chống ghi trùng và ghi cùng giao dịch với việc chuyển DaTiepDon (xem clinix_quy_tac_nghiep_vu.md mục 2 dòng 45 đến 47).';

ALTER TABLE `yeu_cau_rut_tien` COMMENT = 'Tạo yêu cầu: so_tien_dang_giu tăng so_tien. Duyệt: ghi giao_dich_vi loại Rut, so_du và so_tien_dang_giu cùng giảm so_tien. Từ chối: so_tien_dang_giu giảm so_tien.';

ALTER TABLE `giao_dich_vi` COMMENT = 'Sổ cái lịch sử nạp/trừ/hoàn/rút, chỉ thêm không sửa. Ràng buộc: đúng 1 trong 3 cột tham chiếu có giá trị, tùy theo loại.';

ALTER TABLE `danh_gia_bac_si` COMMENT = 'Chỉ cho đánh giá khi lịch hẹn ở trạng thái HoanThanh (kiểm tra ở service). Ràng buộc: bi_an = false thì ly_do_an để trống; bi_an = true thì bắt buộc có ly_do_an.';

ALTER TABLE `hoi_thoai` COMMENT = 'Ràng buộc: BenhNhan_LeTan thì bắt buộc có chi_nhanh_id; BenhNhan_BacSi thì để trống. Hội thoại không có trạng thái đóng.';

ALTER TABLE `tai_khoan_hoi_thoai` COMMENT = 'Tin chưa đọc = tin có tin_nhan_id lớn hơn mốc đã đọc (hoặc tất cả nếu để trống) và người gửi khác chính mình. Mốc phải thuộc cùng hội thoại (kiểm tra ở service). Hộp thư chung Lễ tân: mỗi Lễ tân có dòng riêng, tạo khi mở hoặc trả lời hội thoại lần đầu; chưa có dòng thì coi như chưa đọc.';

ALTER TABLE `benh_nhan` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `bac_si` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `bac_si` ADD FOREIGN KEY (`chuyen_khoa_id`) REFERENCES `chuyen_khoa` (`chuyen_khoa_id`);

ALTER TABLE `bac_si` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

ALTER TABLE `bac_si` ADD FOREIGN KEY (`dich_vu_kham_id`) REFERENCES `dich_vu_kham` (`dich_vu_kham_id`);

ALTER TABLE `le_tan` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `le_tan` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

ALTER TABLE `quan_tri_vien` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `quan_tri_vien` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

ALTER TABLE `ho_so_nguoi_than` ADD FOREIGN KEY (`benh_nhan_id`) REFERENCES `benh_nhan` (`tai_khoan_id`);

ALTER TABLE `ma_xac_thuc` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `phien_dang_nhap` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `dich_vu_kham` ADD FOREIGN KEY (`nhom_dich_vu_id`) REFERENCES `nhom_dich_vu` (`nhom_dich_vu_id`);

ALTER TABLE `moc_hoan_tien` ADD FOREIGN KEY (`dich_vu_kham_id`) REFERENCES `dich_vu_kham` (`dich_vu_kham_id`);

ALTER TABLE `chi_nhanh_dich_vu_kham` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

ALTER TABLE `chi_nhanh_dich_vu_kham` ADD FOREIGN KEY (`dich_vu_kham_id`) REFERENCES `dich_vu_kham` (`dich_vu_kham_id`);

ALTER TABLE `chi_nhanh_lich_hoat_dong` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

ALTER TABLE `yeu_cau_thay_doi_chi_nhanh` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

ALTER TABLE `yeu_cau_thay_doi_chi_nhanh` ADD FOREIGN KEY (`nguoi_de_xuat_id`) REFERENCES `quan_tri_vien` (`tai_khoan_id`);

ALTER TABLE `yeu_cau_thay_doi_chi_nhanh` ADD FOREIGN KEY (`nguoi_duyet_id`) REFERENCES `quan_tri_vien` (`tai_khoan_id`);

ALTER TABLE `yeu_cau_thay_doi_chi_nhanh_lich_hen` ADD FOREIGN KEY (`yeu_cau_thay_doi_chi_nhanh_id`) REFERENCES `yeu_cau_thay_doi_chi_nhanh` (`yeu_cau_thay_doi_chi_nhanh_id`);

ALTER TABLE `yeu_cau_thay_doi_chi_nhanh_lich_hen` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`);

ALTER TABLE `lich_lam_viec` ADD FOREIGN KEY (`bac_si_id`) REFERENCES `bac_si` (`tai_khoan_id`);

ALTER TABLE `lich_lam_viec` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

ALTER TABLE `khung_gio` ADD FOREIGN KEY (`lich_lam_viec_id`) REFERENCES `lich_lam_viec` (`lich_lam_viec_id`);

ALTER TABLE `yeu_cau_nghi_phep` ADD FOREIGN KEY (`bac_si_id`) REFERENCES `bac_si` (`tai_khoan_id`);

ALTER TABLE `yeu_cau_nghi_phep` ADD FOREIGN KEY (`nguoi_xu_ly_id`) REFERENCES `quan_tri_vien` (`tai_khoan_id`);

ALTER TABLE `lich_hen` ADD FOREIGN KEY (`khung_gio_id`) REFERENCES `khung_gio` (`khung_gio_id`);

ALTER TABLE `lich_hen` ADD FOREIGN KEY (`lich_hen_truoc_id`) REFERENCES `lich_hen` (`lich_hen_id`);

ALTER TABLE `lich_hen` ADD FOREIGN KEY (`benh_nhan_id`) REFERENCES `benh_nhan` (`tai_khoan_id`);

-- Khóa ngoại kép: ho_so_nguoi_than_id NULL (bản thân) thì MySQL không kiểm tra; có giá trị thì hồ sơ phải thuộc đúng benh_nhan_id của lịch hẹn
ALTER TABLE `lich_hen` ADD CONSTRAINT `fk_lich_hen_ho_so_chu_so_huu` FOREIGN KEY (`ho_so_nguoi_than_id`, `benh_nhan_id`) REFERENCES `ho_so_nguoi_than` (`ho_so_nguoi_than_id`, `benh_nhan_id`);

ALTER TABLE `lich_hen` ADD FOREIGN KEY (`bac_si_id`) REFERENCES `bac_si` (`tai_khoan_id`);

ALTER TABLE `lich_hen` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

ALTER TABLE `lich_hen` ADD FOREIGN KEY (`dich_vu_kham_id`) REFERENCES `dich_vu_kham` (`dich_vu_kham_id`);

ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`);

ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` ADD FOREIGN KEY (`khung_gio_mong_muon_id`) REFERENCES `khung_gio` (`khung_gio_id`);

ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` ADD FOREIGN KEY (`nguoi_xu_ly_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `ho_so_kham` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`);

ALTER TABLE `muc_cho_danh_sach_cho` ADD FOREIGN KEY (`benh_nhan_id`) REFERENCES `benh_nhan` (`tai_khoan_id`);

ALTER TABLE `muc_cho_danh_sach_cho` ADD FOREIGN KEY (`bac_si_id`) REFERENCES `bac_si` (`tai_khoan_id`);

ALTER TABLE `muc_cho_danh_sach_cho` ADD FOREIGN KEY (`khung_gio_duoc_moi_id`) REFERENCES `khung_gio` (`khung_gio_id`);

ALTER TABLE `vi_noi_bo` ADD FOREIGN KEY (`benh_nhan_id`) REFERENCES `benh_nhan` (`tai_khoan_id`);

ALTER TABLE `giao_dich_thanh_toan` ADD FOREIGN KEY (`vi_noi_bo_id`) REFERENCES `vi_noi_bo` (`vi_noi_bo_id`);

ALTER TABLE `giao_dich_thanh_toan` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`);

ALTER TABLE `giao_dich_thanh_toan` ADD FOREIGN KEY (`nguoi_thu_id`) REFERENCES `le_tan` (`tai_khoan_id`);

ALTER TABLE `lich_su_hoan_tien` ADD FOREIGN KEY (`giao_dich_thanh_toan_id`) REFERENCES `giao_dich_thanh_toan` (`giao_dich_thanh_toan_id`);

ALTER TABLE `lich_su_hoan_tien` ADD FOREIGN KEY (`vi_noi_bo_id`) REFERENCES `vi_noi_bo` (`vi_noi_bo_id`);

ALTER TABLE `yeu_cau_rut_tien` ADD FOREIGN KEY (`vi_noi_bo_id`) REFERENCES `vi_noi_bo` (`vi_noi_bo_id`);

ALTER TABLE `yeu_cau_rut_tien` ADD FOREIGN KEY (`nguoi_xu_ly_id`) REFERENCES `quan_tri_vien` (`tai_khoan_id`);

ALTER TABLE `giao_dich_vi` ADD FOREIGN KEY (`vi_noi_bo_id`) REFERENCES `vi_noi_bo` (`vi_noi_bo_id`);

ALTER TABLE `giao_dich_vi` ADD FOREIGN KEY (`giao_dich_thanh_toan_id`) REFERENCES `giao_dich_thanh_toan` (`giao_dich_thanh_toan_id`);

ALTER TABLE `giao_dich_vi` ADD FOREIGN KEY (`lich_su_hoan_tien_id`) REFERENCES `lich_su_hoan_tien` (`lich_su_hoan_tien_id`);

ALTER TABLE `giao_dich_vi` ADD FOREIGN KEY (`yeu_cau_rut_tien_id`) REFERENCES `yeu_cau_rut_tien` (`yeu_cau_rut_tien_id`);

ALTER TABLE `danh_gia_bac_si` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`);

ALTER TABLE `bai_viet` ADD FOREIGN KEY (`tac_gia_id`) REFERENCES `quan_tri_vien` (`tai_khoan_id`);

ALTER TABLE `bai_viet_hashtag` ADD FOREIGN KEY (`bai_viet_id`) REFERENCES `bai_viet` (`bai_viet_id`);

ALTER TABLE `bai_viet_hashtag` ADD FOREIGN KEY (`hashtag_id`) REFERENCES `hashtag` (`hashtag_id`);

ALTER TABLE `benh_nhan_danh_gia_bai_viet` ADD FOREIGN KEY (`benh_nhan_id`) REFERENCES `benh_nhan` (`tai_khoan_id`);

ALTER TABLE `benh_nhan_danh_gia_bai_viet` ADD FOREIGN KEY (`bai_viet_id`) REFERENCES `bai_viet` (`bai_viet_id`);

ALTER TABLE `thong_bao` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `thong_bao` ADD FOREIGN KEY (`yeu_cau_thay_doi_chi_nhanh_id`) REFERENCES `yeu_cau_thay_doi_chi_nhanh` (`yeu_cau_thay_doi_chi_nhanh_id`);

ALTER TABLE `email_thong_bao` ADD FOREIGN KEY (`thong_bao_id`) REFERENCES `thong_bao` (`thong_bao_id`);

ALTER TABLE `nhac_lich_hen` ADD FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen` (`lich_hen_id`);

ALTER TABLE `hoi_thoai` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

ALTER TABLE `hoi_thoai` ADD FOREIGN KEY (`nguoi_tao_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `tai_khoan_hoi_thoai` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `tai_khoan_hoi_thoai` ADD FOREIGN KEY (`hoi_thoai_id`) REFERENCES `hoi_thoai` (`hoi_thoai_id`);

ALTER TABLE `tai_khoan_hoi_thoai` ADD FOREIGN KEY (`tin_nhan_cuoi_da_doc_id`) REFERENCES `tin_nhan` (`tin_nhan_id`);

ALTER TABLE `tin_nhan` ADD FOREIGN KEY (`hoi_thoai_id`) REFERENCES `hoi_thoai` (`hoi_thoai_id`);

ALTER TABLE `tin_nhan` ADD FOREIGN KEY (`nguoi_gui_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `nhat_ky_hanh_dong` ADD FOREIGN KEY (`tai_khoan_id`) REFERENCES `tai_khoan` (`tai_khoan_id`);

ALTER TABLE `nhat_ky_hanh_dong` ADD FOREIGN KEY (`chi_nhanh_id`) REFERENCES `chi_nhanh` (`chi_nhanh_id`);

-- ============================================================================
-- RÀNG BUỘC CHECK (đặt sau khi tạo bảng và khóa ngoại)
-- ============================================================================
ALTER TABLE `tai_khoan` ADD CONSTRAINT `chk_tai_khoan_mat_khau` CHECK (
    (`trang_thai` = 'ChoKichHoat' AND `mat_khau_bam` IS NULL)
 OR (`trang_thai` = 'DangHoatDong' AND `mat_khau_bam` IS NOT NULL)
 OR `trang_thai` = 'NgungHoatDong'
);
ALTER TABLE `tai_khoan` ADD CONSTRAINT `chk_tai_khoan_cho_kich_hoat_nhan_su` CHECK (
    `trang_thai` <> 'ChoKichHoat' OR `loai_tai_khoan` <> 'BenhNhan'
);
ALTER TABLE `ma_xac_thuc` ADD CONSTRAINT `chk_ma_xac_thuc_dung_hoac_thu_hoi` CHECK (
    `da_dung_luc` IS NULL OR `thu_hoi_luc` IS NULL
);
ALTER TABLE `ma_xac_thuc` ADD CONSTRAINT `chk_ma_xac_thuc_kich_hoat_da_gui` CHECK (
    `loai` <> 'KichHoatNhanSu' OR `da_dung_luc` IS NULL OR `da_gui_luc` IS NOT NULL
);
ALTER TABLE `ma_xac_thuc` ADD CONSTRAINT `chk_ma_xac_thuc_du_lieu_dang_ky` CHECK (
    (`ho_ten_dang_ky` IS NULL AND `so_dien_thoai_dang_ky` IS NULL AND `mat_khau_bam_dang_ky` IS NULL)
 OR (`loai` = 'DangKy' AND `ho_ten_dang_ky` IS NOT NULL AND `so_dien_thoai_dang_ky` IS NOT NULL AND `mat_khau_bam_dang_ky` IS NOT NULL)
);
ALTER TABLE `quan_tri_vien` ADD CONSTRAINT `chk_qtv_pham_vi` CHECK (
    (`pham_vi_quan_tri` = 'ChiNhanh' AND `chi_nhanh_id` IS NOT NULL) OR (`pham_vi_quan_tri` = 'ToanHeThong' AND `chi_nhanh_id` IS NULL)
);
ALTER TABLE `moc_hoan_tien` ADD CONSTRAINT `chk_moc_hoan_ty_le` CHECK (
    `ty_le_hoan` BETWEEN 0 AND 100
);
ALTER TABLE `yeu_cau_nghi_phep` ADD CONSTRAINT `chk_nghi_phep_hinh_thuc` CHECK (
    (`hinh_thuc_nghi` = 'CaNgay' AND `ca` IS NULL AND `ngay_bat_dau` <= `ngay_ket_thuc`)
    OR (`hinh_thuc_nghi` = 'TheoCa' AND `ca` IS NOT NULL AND `ngay_bat_dau` = `ngay_ket_thuc`)
);
ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` ADD CONSTRAINT `chk_doi_lich_xu_ly` CHECK (
    `trang_thai` = 'ChoDuyet' OR `ghi_chu_xu_ly` IS NOT NULL
);
ALTER TABLE `yeu_cau_nghi_phep` ADD CONSTRAINT `chk_nghi_phep_xu_ly` CHECK (
    (`trang_thai` = 'ChoDuyet' AND `nguoi_xu_ly_id` IS NULL AND `thoi_diem_xu_ly` IS NULL) OR (`trang_thai` IN ('DaDuyet','TuChoi') AND `nguoi_xu_ly_id` IS NOT NULL AND `thoi_diem_xu_ly` IS NOT NULL)
);
ALTER TABLE `yeu_cau_doi_lich_ngoai_chinh_sach` ADD CONSTRAINT `chk_doi_lich_nguoi_xu_ly` CHECK (
    (`trang_thai` = 'ChoDuyet' AND `nguoi_xu_ly_id` IS NULL AND `thoi_diem_xu_ly` IS NULL) OR (`trang_thai` IN ('DaDuyet','TuChoi') AND `nguoi_xu_ly_id` IS NOT NULL AND `thoi_diem_xu_ly` IS NOT NULL)
);
ALTER TABLE `yeu_cau_rut_tien` ADD CONSTRAINT `chk_rut_tien_xu_ly` CHECK (
    (`trang_thai` = 'ChoDuyet' AND `nguoi_xu_ly_id` IS NULL AND `thoi_diem_xu_ly` IS NULL) OR (`trang_thai` IN ('DaDuyet','TuChoi') AND `nguoi_xu_ly_id` IS NOT NULL AND `thoi_diem_xu_ly` IS NOT NULL)
);
-- (không có chk_lich_hen_truoc cho lich_hen: xem ghi chú đầu file; quy tắc lịch không tự trỏ chính nó nằm ở service)
ALTER TABLE `muc_cho_danh_sach_cho` ADD CONSTRAINT `chk_muc_cho_da_moi` CHECK (
    `trang_thai` <> 'DaMoi' OR `khung_gio_duoc_moi_id` IS NOT NULL
);
ALTER TABLE `vi_noi_bo` ADD CONSTRAINT `chk_vi_so_du` CHECK (
    `so_du` >= 0 AND `so_tien_dang_giu` >= 0 AND `so_tien_dang_giu` <= `so_du`
);
ALTER TABLE `giao_dich_thanh_toan` ADD CONSTRAINT `chk_gd_thanh_toan_loai` CHECK (
    (`loai` = 'NapVi' AND `lich_hen_id` IS NULL AND `vi_noi_bo_id` IS NOT NULL) OR (`loai` = 'ThanhToanLichHen' AND `lich_hen_id` IS NOT NULL)
);
ALTER TABLE `giao_dich_thanh_toan` ADD CONSTRAINT `chk_gd_tien_mat_nguoi_thu` CHECK (
    (`phuong_thuc` = 'TienMatTaiQuay' AND `loai` = 'ThanhToanLichHen' AND `lich_hen_id` IS NOT NULL AND `vi_noi_bo_id` IS NULL
       AND `ma_giao_dich_cong` IS NULL AND `so_tien` > 0 AND `trang_thai` = 'ThanhCong' AND `nguoi_thu_id` IS NOT NULL)
 OR (`phuong_thuc` <> 'TienMatTaiQuay' AND `nguoi_thu_id` IS NULL)
);
ALTER TABLE `giao_dich_vi` ADD CONSTRAINT `chk_gd_vi_tham_chieu` CHECK (
    (`loai` IN ('Nap','ThanhToan') AND `giao_dich_thanh_toan_id` IS NOT NULL AND `lich_su_hoan_tien_id` IS NULL AND `yeu_cau_rut_tien_id` IS NULL)
    OR (`loai` = 'HoanTien' AND `lich_su_hoan_tien_id` IS NOT NULL AND `giao_dich_thanh_toan_id` IS NULL AND `yeu_cau_rut_tien_id` IS NULL)
    OR (`loai` = 'Rut' AND `yeu_cau_rut_tien_id` IS NOT NULL AND `giao_dich_thanh_toan_id` IS NULL AND `lich_su_hoan_tien_id` IS NULL)
);
ALTER TABLE `giao_dich_vi` ADD CONSTRAINT `chk_gd_vi_dau_so_tien` CHECK (
    (`loai` IN ('Nap','HoanTien') AND `so_tien` > 0) OR (`loai` IN ('ThanhToan','Rut') AND `so_tien` < 0)
);
ALTER TABLE `danh_gia_bac_si` ADD CONSTRAINT `chk_danh_gia_so_sao` CHECK (
    `so_sao` BETWEEN 1 AND 5
);
ALTER TABLE `danh_gia_bac_si` ADD CONSTRAINT `chk_danh_gia_an` CHECK (
    (`bi_an` = 0 AND `ly_do_an` IS NULL) OR (`bi_an` = 1 AND `ly_do_an` IS NOT NULL)
);
ALTER TABLE `hoi_thoai` ADD CONSTRAINT `chk_hoi_thoai_chi_nhanh` CHECK (
    (`loai` = 'BenhNhan_LeTan' AND `chi_nhanh_id` IS NOT NULL) OR (`loai` = 'BenhNhan_BacSi' AND `chi_nhanh_id` IS NULL)
);
ALTER TABLE `chi_nhanh_lich_hoat_dong` ADD CONSTRAINT `chk_lich_hoat_dong_thu` CHECK (
    `thu_trong_tuan` BETWEEN 1 AND 7
);
ALTER TABLE `chi_nhanh_lich_hoat_dong` ADD CONSTRAINT `chk_lich_hoat_dong_khoang` CHECK (
    ((`gio_bat_dau_sang` IS NULL AND `gio_ket_thuc_sang` IS NULL)
      OR (`gio_bat_dau_sang` IS NOT NULL AND `gio_ket_thuc_sang` IS NOT NULL AND `gio_bat_dau_sang` >= '00:00:00' AND `gio_bat_dau_sang` < `gio_ket_thuc_sang` AND `gio_ket_thuc_sang` <= '23:59:59'))
    AND ((`gio_bat_dau_chieu` IS NULL AND `gio_ket_thuc_chieu` IS NULL)
      OR (`gio_bat_dau_chieu` IS NOT NULL AND `gio_ket_thuc_chieu` IS NOT NULL AND `gio_bat_dau_chieu` >= '00:00:00' AND `gio_bat_dau_chieu` < `gio_ket_thuc_chieu` AND `gio_ket_thuc_chieu` <= '23:59:59'))
);
ALTER TABLE `chi_nhanh_lich_hoat_dong` ADD CONSTRAINT `chk_lich_hoat_dong_khong_chong` CHECK (
    `gio_ket_thuc_sang` IS NULL OR `gio_bat_dau_chieu` IS NULL OR `gio_ket_thuc_sang` <= `gio_bat_dau_chieu`
);
ALTER TABLE `chi_nhanh_lich_hoat_dong` ADD CONSTRAINT `chk_lich_hoat_dong_ngay` CHECK (
    (`hoat_dong` = 1 AND (`gio_bat_dau_sang` IS NOT NULL OR `gio_bat_dau_chieu` IS NOT NULL))
 OR (`hoat_dong` = 0 AND `gio_bat_dau_sang` IS NULL AND `gio_ket_thuc_sang` IS NULL AND `gio_bat_dau_chieu` IS NULL AND `gio_ket_thuc_chieu` IS NULL)
);
ALTER TABLE `yeu_cau_thay_doi_chi_nhanh` ADD CONSTRAINT `chk_yc_chi_nhanh_noi_dung` CHECK (
    JSON_TYPE(`noi_dung_truoc`) = 'OBJECT' AND JSON_LENGTH(`noi_dung_truoc`) > 0 AND JSON_TYPE(`noi_dung_sau`) = 'OBJECT' AND JSON_LENGTH(`noi_dung_sau`) > 0
);
ALTER TABLE `yeu_cau_thay_doi_chi_nhanh` ADD CONSTRAINT `chk_yc_chi_nhanh_xu_ly` CHECK (
    (`trang_thai` = 'ChoDuyet' AND `nguoi_duyet_id` IS NULL AND `thoi_diem_duyet` IS NULL AND `ly_do_tu_choi` IS NULL AND `so_ngay_bao_truoc` IS NULL AND `hieu_luc_tu` IS NULL AND `ap_dung_luc` IS NULL)
 OR (`trang_thai` = 'DaDuyet' AND `nguoi_duyet_id` IS NOT NULL AND `thoi_diem_duyet` IS NOT NULL AND `ly_do_tu_choi` IS NULL AND `so_ngay_bao_truoc` IS NOT NULL AND `so_ngay_bao_truoc` >= 0
     AND `hieu_luc_tu` IS NOT NULL AND `hieu_luc_tu` >= DATE_ADD(`thoi_diem_duyet`, INTERVAL `so_ngay_bao_truoc` DAY) AND (`ap_dung_luc` IS NULL OR `ap_dung_luc` >= `hieu_luc_tu`))
 OR (`trang_thai` = 'TuChoi' AND `nguoi_duyet_id` IS NOT NULL AND `thoi_diem_duyet` IS NOT NULL AND `ly_do_tu_choi` IS NOT NULL AND `so_ngay_bao_truoc` IS NULL AND `hieu_luc_tu` IS NULL AND `ap_dung_luc` IS NULL)
);
ALTER TABLE `email_thong_bao` ADD CONSTRAINT `chk_email_thong_bao_ket_qua` CHECK (
    (`trang_thai` = 'ChoGui' AND `da_gui_luc` IS NULL)
 OR (`trang_thai` = 'DaGui' AND `da_gui_luc` IS NOT NULL AND `so_lan_thu` >= 1)
 OR (`trang_thai` = 'ThatBai' AND `da_gui_luc` IS NULL AND `loi_cuoi` IS NOT NULL AND `so_lan_thu` >= 1)
);
ALTER TABLE `nhac_lich_hen` ADD CONSTRAINT `chk_nhac_lich_hen_moc` CHECK (
    `so_gio_truoc` >= 1
);
ALTER TABLE `nhac_lich_hen` ADD CONSTRAINT `chk_nhac_lich_hen_ket_qua` CHECK (
    (`trang_thai` = 'ChoGui' AND `da_gui_luc` IS NULL)
 OR (`trang_thai` = 'DaGui' AND `da_gui_luc` IS NOT NULL AND `so_lan_thu` >= 1)
 OR (`trang_thai` = 'ThatBai' AND `da_gui_luc` IS NULL AND `loi_cuoi` IS NOT NULL AND `so_lan_thu` >= 1)
);
ALTER TABLE `nhat_ky_hanh_dong` ADD CONSTRAINT `chk_nhat_ky_cap_nhat_cau_hinh` CHECK (
    `hanh_dong` <> 'CapNhatCauHinh'
 OR (`loai_doi_tuong` = 'cau_hinh_he_thong' AND `ma_doi_tuong` = 1 AND `chi_nhanh_id` IS NULL
     AND `chi_tiet_thay_doi` IS NOT NULL AND JSON_TYPE(`chi_tiet_thay_doi`) = 'OBJECT'
     AND JSON_CONTAINS_PATH(`chi_tiet_thay_doi`, 'all', '$.truoc', '$.sau', '$.ly_do')
     AND JSON_TYPE(JSON_EXTRACT(`chi_tiet_thay_doi`, '$.truoc')) = 'OBJECT'
     AND JSON_TYPE(JSON_EXTRACT(`chi_tiet_thay_doi`, '$.sau')) = 'OBJECT'
     AND JSON_LENGTH(JSON_EXTRACT(`chi_tiet_thay_doi`, '$.truoc')) >= 1
     AND JSON_KEYS(JSON_EXTRACT(`chi_tiet_thay_doi`, '$.truoc')) = JSON_KEYS(JSON_EXTRACT(`chi_tiet_thay_doi`, '$.sau'))
     AND JSON_TYPE(JSON_EXTRACT(`chi_tiet_thay_doi`, '$.ly_do')) = 'STRING'
     AND CHAR_LENGTH(TRIM(JSON_UNQUOTE(JSON_EXTRACT(`chi_tiet_thay_doi`, '$.ly_do')))) >= 1)
);
ALTER TABLE `bac_si` ADD CONSTRAINT `chk_bac_si_kinh_nghiem` CHECK (
    `so_nam_kinh_nghiem` >= 0
);
-- Chức danh 7 mức <-> học vị 5 mức. BS_CKI và BS_CKII <-> BS là [đề xuất]; muốn cho bác sĩ CKI/CKII mang học vị ThS thì sửa CHECK này
ALTER TABLE `bac_si` ADD CONSTRAINT `chk_bac_si_chuc_danh_hoc_vi` CHECK (
    (`chuc_danh` IN ('BS', 'BS_CKI', 'BS_CKII') AND `hoc_vi` = 'BS')
 OR (`chuc_danh` = 'ThS_BS' AND `hoc_vi` = 'ThS')
 OR (`chuc_danh` = 'TS_BS' AND `hoc_vi` = 'TS')
 OR (`chuc_danh` = 'PGS_TS_BS' AND `hoc_vi` = 'PGS')
 OR (`chuc_danh` = 'GS_TS_BS' AND `hoc_vi` = 'GS')
);
ALTER TABLE `phu_phi_bac_si` ADD CONSTRAINT `chk_phu_phi_bac_si_gia_tri` CHECK (
    `phu_phi` >= 0 AND `so_nam_kinh_nghiem_tu` >= 0
);
ALTER TABLE `cau_hinh_he_thong` ADD CONSTRAINT `chk_cau_hinh_mot_dong` CHECK (
    `id` = 1
);
-- [đề xuất] miền giá trị tối thiểu; giới hạn trên của từng tham số là [cần điền]
ALTER TABLE `cau_hinh_he_thong` ADD CONSTRAINT `chk_cau_hinh_gia_tri` CHECK (
    `thoi_gian_giu_cho` > 0 AND `thoi_han_phan_hoi_loi_moi` > 0 AND `so_lich_hen_toi_da_moi_ho_so` >= 1 AND `nguong_no_show` >= 1
    AND `so_lan_tu_doi_lich_toi_da` >= 0 AND `so_muc_cho_toi_da` >= 0 AND `check_in_truoc_phut` >= 0 AND `check_in_sau_phut` >= 0
    AND `so_ngay_bao_truoc_doi_gio_lam` >= 0 AND `trong_so_w1` >= 0 AND `trong_so_w2` >= 0
);
ALTER TABLE `cau_hinh_he_thong` ADD CONSTRAINT `chk_cau_hinh_nhac_lich` CHECK (
    JSON_SCHEMA_VALID('{"type":"array","uniqueItems":true,"items":{"type":"integer","minimum":1}}', `thoi_diem_nhac_lich`)
);
ALTER TABLE `thong_tin_phong_kham` ADD CONSTRAINT `chk_phong_kham_mot_dong` CHECK (
    `id` = 1
);

-- ============================================================================
-- TÙY CHỌN (đang tắt): khóa ngoại kép để DB tự chặn bác sĩ nhận dịch vụ mà chi nhánh không cung cấp.
-- Nhóm chọn kiểm tra ở service nên để comment. Nếu bật, khi chuyển chi nhánh phải cập nhật cả 2 cột.
-- ============================================================================
-- ALTER TABLE `bac_si` ADD CONSTRAINT `fk_bac_si_chi_nhanh_dich_vu`
--   FOREIGN KEY (`chi_nhanh_id`, `dich_vu_kham_id`)
--   REFERENCES `chi_nhanh_dich_vu_kham` (`chi_nhanh_id`, `dich_vu_kham_id`);

-- ============================================================================
-- TRUY VẤN MẪU (comment): từ 1 lịch hẹn lần ngược về LỊCH GỐC của chuỗi đổi lịch để lấy giao dịch thanh toán
-- ============================================================================
-- WITH RECURSIVE chuoi AS (
--   SELECT lich_hen_id, lich_hen_truoc_id FROM lich_hen WHERE lich_hen_id = :lich_hen_hien_tai
--   UNION ALL
--   SELECT l.lich_hen_id, l.lich_hen_truoc_id FROM lich_hen l JOIN chuoi c ON l.lich_hen_id = c.lich_hen_truoc_id
-- )
-- SELECT g.* FROM giao_dich_thanh_toan g
-- JOIN chuoi c ON g.lich_hen_id = c.lich_hen_id
-- WHERE c.lich_hen_truoc_id IS NULL;

-- ============================================================================
-- TRUY VẤN MẪU (comment): Quản trị viên Chi nhánh xem Bệnh nhân có ít nhất 1 lịch hẹn (mọi trạng thái) tại chi nhánh mình
-- ============================================================================
-- SELECT t.* FROM tai_khoan t
-- WHERE t.loai_tai_khoan = 'BenhNhan'
--   AND EXISTS (SELECT 1 FROM lich_hen l WHERE l.benh_nhan_id = t.tai_khoan_id AND l.chi_nhanh_id = :chi_nhanh_cua_quan_tri_vien);

-- ============================================================================
-- TRUY VẤN MẪU (comment): liên kết kích hoạt nhân sự còn hợp lệ (sau đó so token băm với ma_bam)
-- ============================================================================
-- SELECT * FROM ma_xac_thuc
-- WHERE ma_xac_thuc_id = :id AND loai = 'KichHoatNhanSu'
--   AND da_gui_luc IS NOT NULL AND thu_hoi_luc IS NULL AND da_dung_luc IS NULL AND het_han_luc > NOW();

-- ============================================================================
-- TRUY VẤN MẪU (comment): giờ mở – đóng TỔNG QUÁT để hiển thị, suy ra từ các khoảng nhận khám (không có cột giờ mở/đóng riêng); tham số :cn
-- Giờ mở = giờ bắt đầu sớm nhất (sáng nếu có, không thì chiều); giờ đóng = giờ kết thúc muộn nhất (chiều nếu có, không thì sáng); ngày nghỉ => NULL
-- ============================================================================
-- SELECT thu_trong_tuan, hoat_dong,
--        COALESCE(gio_bat_dau_sang, gio_bat_dau_chieu) AS gio_mo_hien_thi, COALESCE(gio_ket_thuc_chieu, gio_ket_thuc_sang) AS gio_dong_hien_thi,
--        gio_bat_dau_sang, gio_ket_thuc_sang, gio_bat_dau_chieu, gio_ket_thuc_chieu
-- FROM chi_nhanh_lich_hoat_dong WHERE chi_nhanh_id = :cn ORDER BY thu_trong_tuan;

-- ============================================================================
-- TRUY VẤN MẪU (comment): kiểm tra PHÂN CÔNG một ca (use case Phân công lịch làm việc cho bác sĩ). Tham số: :cn (chi nhánh công tác hiện tại), :ngay, :ca.
-- Mã trả về: ChuaKhaiBao = chưa khai báo lịch của thứ đó; NgayNghi; CaKhongTonTai = ngày hoạt động nhưng không có khoảng cho ca đó (CaToi luôn thuộc nhóm này); HopLe.
-- Thao tác Cả ngày = chạy 2 lần (CaSang, CaChieu), chỉ hợp lệ khi cả hai trả về HopLe.
-- ============================================================================
-- SELECT CASE
--          WHEN l.chi_nhanh_id IS NULL THEN 'ChuaKhaiBao'
--          WHEN l.hoat_dong = 0 THEN 'NgayNghi'
--          WHEN :ca = 'CaSang' AND l.gio_bat_dau_sang IS NOT NULL THEN 'HopLe'
--          WHEN :ca = 'CaChieu' AND l.gio_bat_dau_chieu IS NOT NULL THEN 'HopLe'
--          ELSE 'CaKhongTonTai' END AS ket_qua, l.gio_bat_dau_sang, l.gio_ket_thuc_sang, l.gio_bat_dau_chieu, l.gio_ket_thuc_chieu
-- FROM (SELECT 1) x
-- LEFT JOIN chi_nhanh_lich_hoat_dong l ON l.chi_nhanh_id = :cn AND l.thu_trong_tuan = WEEKDAY(:ngay) + 1;

-- ============================================================================
-- TRUY VẤN MẪU (comment): kiểm tra MỘT khung giờ với khoảng nhận khám của chi nhánh (service dùng khi sinh/tính khung giờ trống, giữ chỗ, đặt lịch, đổi lịch)
-- Tham số: :cn, :ngay_gio = thời điểm bắt đầu, :thoi_luong_phut, :ca = lich_lam_viec.ca của khung giờ. Khung giờ phải nằm TRỌN trong khoảng của ca (biên hai đầu hợp lệ).
-- Mã trả về: ChuaKhaiBao; NgayNghi; CaKhongTonTai (ca không có khoảng, kể cả CaToi); NgoaiGioHoatDong (ngoài khoảng, xuyên giờ nghỉ trưa hoặc vượt giờ kết thúc); HopLe.
-- ============================================================================
-- SELECT CASE
--          WHEN l.chi_nhanh_id IS NULL THEN 'ChuaKhaiBao'
--          WHEN l.hoat_dong = 0 THEN 'NgayNghi'
--          WHEN :ca = 'CaSang' AND l.gio_bat_dau_sang IS NOT NULL AND TIME(:ngay_gio) >= l.gio_bat_dau_sang
--               AND ADDTIME(TIME(:ngay_gio), SEC_TO_TIME(:thoi_luong_phut * 60)) <= l.gio_ket_thuc_sang THEN 'HopLe'
--          WHEN :ca = 'CaChieu' AND l.gio_bat_dau_chieu IS NOT NULL AND TIME(:ngay_gio) >= l.gio_bat_dau_chieu
--               AND ADDTIME(TIME(:ngay_gio), SEC_TO_TIME(:thoi_luong_phut * 60)) <= l.gio_ket_thuc_chieu THEN 'HopLe'
--          WHEN (:ca = 'CaSang' AND l.gio_bat_dau_sang IS NULL) OR (:ca = 'CaChieu' AND l.gio_bat_dau_chieu IS NULL) OR :ca NOT IN ('CaSang', 'CaChieu') THEN 'CaKhongTonTai'
--          ELSE 'NgoaiGioHoatDong' END AS ket_qua, l.gio_bat_dau_sang, l.gio_ket_thuc_sang, l.gio_bat_dau_chieu, l.gio_ket_thuc_chieu
-- FROM (SELECT 1) x
-- LEFT JOIN chi_nhanh_lich_hoat_dong l ON l.chi_nhanh_id = :cn AND l.thu_trong_tuan = WEEKDAY(:ngay_gio) + 1;

-- ============================================================================
-- TRUY VẤN MẪU (comment): lịch hẹn bị ảnh hưởng nếu đổi lịch hoạt động của MỘT thứ (chạy lúc đề xuất với :tu_luc = NOW(), chạy lại lúc duyệt với :tu_luc = hieu_luc_tu)
-- Tham số: :cn, :thu (1-7), :hoat_dong_moi (0/1), :bd_sang_moi, :kt_sang_moi, :bd_chieu_moi, :kt_chieu_moi (NULL khi khoảng đó không còn), :tu_luc.
-- Bị ảnh hưởng khi thứ chuyển nghỉ, hoặc [thoi_gian, thoi_gian + thời lượng] không còn nằm TRỌN trong khoảng mới ứng với ca của lịch (khoảng bị bỏ, bị thu hẹp hoặc rơi vào giờ nghỉ mới).
-- ============================================================================
-- SELECT lh.lich_hen_id, lh.benh_nhan_id, lh.thoi_gian,
--        IF(:hoat_dong_moi = 0, 'NgayNghi', 'NgoaiGioHoatDong') AS ly_do_anh_huong
-- FROM lich_hen lh
-- JOIN dich_vu_kham d ON d.dich_vu_kham_id = lh.dich_vu_kham_id
-- JOIN khung_gio kg ON kg.khung_gio_id = lh.khung_gio_id
-- JOIN lich_lam_viec v ON v.lich_lam_viec_id = kg.lich_lam_viec_id
-- WHERE lh.chi_nhanh_id = :cn AND lh.trang_thai IN ('ChoThanhToan', 'DaXacNhan') AND lh.thoi_gian >= :tu_luc
--   AND WEEKDAY(lh.thoi_gian) + 1 = :thu
--   AND (:hoat_dong_moi = 0 OR NOT COALESCE(
--       (v.ca = 'CaSang' AND TIME(lh.thoi_gian) >= :bd_sang_moi AND ADDTIME(TIME(lh.thoi_gian), SEC_TO_TIME(d.thoi_luong * 60)) <= :kt_sang_moi)
--       OR (v.ca = 'CaChieu' AND TIME(lh.thoi_gian) >= :bd_chieu_moi AND ADDTIME(TIME(lh.thoi_gian), SEC_TO_TIME(d.thoi_luong * 60)) <= :kt_chieu_moi), 0));

-- ============================================================================
-- TRUY VẤN MẪU (comment): ca làm việc TƯƠNG LAI không còn khoảng tương ứng khi đổi lịch hoạt động của MỘT thứ (liệt kê cho người duyệt; cùng tham số với truy vấn trên)
-- ============================================================================
-- SELECT v.lich_lam_viec_id, v.bac_si_id, v.ngay, v.ca, 'CaKhongTonTai' AS ly_do_anh_huong
-- FROM lich_lam_viec v
-- WHERE v.chi_nhanh_id = :cn AND v.ngay >= DATE(:tu_luc) AND WEEKDAY(v.ngay) + 1 = :thu
--   AND (:hoat_dong_moi = 0 OR (v.ca = 'CaSang' AND :bd_sang_moi IS NULL) OR (v.ca = 'CaChieu' AND :bd_chieu_moi IS NULL) OR v.ca NOT IN ('CaSang', 'CaChieu'));

-- ============================================================================
-- TRUY VẤN MẪU (comment): khung giờ ConTrong nằm ngoài lịch hoạt động mới của MỘT thứ (liệt kê cho người duyệt; cùng tham số với truy vấn lịch hẹn bị ảnh hưởng)
-- ============================================================================
-- SELECT kg.khung_gio_id, kg.ngay_gio, v.bac_si_id, v.ca
-- FROM khung_gio kg
-- JOIN lich_lam_viec v ON v.lich_lam_viec_id = kg.lich_lam_viec_id
-- JOIN bac_si b ON b.tai_khoan_id = v.bac_si_id
-- JOIN dich_vu_kham d ON d.dich_vu_kham_id = b.dich_vu_kham_id
-- WHERE v.chi_nhanh_id = :cn AND kg.trang_thai = 'ConTrong' AND kg.ngay_gio >= :tu_luc AND WEEKDAY(kg.ngay_gio) + 1 = :thu
--   AND (:hoat_dong_moi = 0 OR NOT COALESCE(
--       (v.ca = 'CaSang' AND TIME(kg.ngay_gio) >= :bd_sang_moi AND ADDTIME(TIME(kg.ngay_gio), SEC_TO_TIME(d.thoi_luong * 60)) <= :kt_sang_moi)
--       OR (v.ca = 'CaChieu' AND TIME(kg.ngay_gio) >= :bd_chieu_moi AND ADDTIME(TIME(kg.ngay_gio), SEC_TO_TIME(d.thoi_luong * 60)) <= :kt_chieu_moi), 0));

-- ============================================================================
-- TRUY VẤN MẪU (comment): lịch hẹn bị ảnh hưởng nếu BỎ MỘT dịch vụ khỏi chi nhánh (:cn, :dich_vu_kham_id, :tu_luc)
-- ============================================================================
-- SELECT lh.lich_hen_id, lh.benh_nhan_id, lh.thoi_gian, 'BoDichVu' AS ly_do_anh_huong
-- FROM lich_hen lh
-- WHERE lh.chi_nhanh_id = :cn AND lh.dich_vu_kham_id = :dich_vu_kham_id AND lh.trang_thai IN ('ChoThanhToan', 'DaXacNhan') AND lh.thoi_gian >= :tu_luc;

-- ============================================================================
-- TRUY VẤN MẪU (comment): chi nhánh chưa đủ 7 dòng lịch hoạt động (phải rỗng trước khi nhận phân công/đặt lịch)
-- ============================================================================
-- SELECT c.chi_nhanh_id, c.ten FROM chi_nhanh c
-- WHERE (SELECT COUNT(*) FROM chi_nhanh_lich_hoat_dong l WHERE l.chi_nhanh_id = c.chi_nhanh_id) <> 7;

-- ============================================================================
-- TRUY VẤN MẪU (comment): đếm lịch hẹn đang hoạt động của MỘT hồ sơ đi khám và so với giới hạn cấu hình (dùng lúc đặt lịch, trong cùng giao dịch với việc tạo lịch hẹn)
-- Tham số: :benh_nhan_id, :ho_so_nguoi_than_id (NULL = bản thân; bắt buộc so sánh bằng <=>). "Đang hoạt động" = ChoThanhToan, DaXacNhan, DaTiepDon [cần điền: nhóm xác nhận tập trạng thái].
-- da_cham_gioi_han = 1 => từ chối; NULL (chưa có dòng cấu hình) => cũng từ chối (fail-closed), không coi là chưa chạm giới hạn.
-- ============================================================================
-- SELECT COUNT(*) AS so_lich_dang_hoat_dong,
--        COUNT(*) >= (SELECT so_lich_hen_toi_da_moi_ho_so FROM cau_hinh_he_thong WHERE id = 1) AS da_cham_gioi_han
-- FROM lich_hen
-- WHERE benh_nhan_id = :benh_nhan_id AND ho_so_nguoi_than_id <=> :ho_so_nguoi_than_id
--   AND trang_thai IN ('ChoThanhToan', 'DaXacNhan', 'DaTiepDon');

-- ============================================================================
-- TRUY VẤN MẪU (comment): hồ sơ đi khám đang vượt giới hạn hiện hành (kiểm tra sau khi đổi nghĩa/giá trị cấu hình hoặc sau migration; lịch hẹn cũ giữ nguyên, giới hạn chỉ chặn lần đặt mới)
-- ============================================================================
-- SELECT benh_nhan_id, ho_so_nguoi_than_id, COUNT(*) AS so_lich_dang_hoat_dong
-- FROM lich_hen WHERE trang_thai IN ('ChoThanhToan', 'DaXacNhan', 'DaTiepDon')
-- GROUP BY benh_nhan_id, ho_so_nguoi_than_id
-- HAVING COUNT(*) > (SELECT so_lich_hen_toi_da_moi_ho_so FROM cau_hinh_he_thong WHERE id = 1);

-- ============================================================================
-- TRUY VẤN MẪU (comment): mốc nhắc lịch ĐẾN HẠN (mỗi mốc của mỗi lịch hẹn DaXacNhan, chưa tới giờ hẹn, chưa có dòng hoặc đang chờ thử lại)
-- Tham số: :bay_gio (service truyền NOW()); :cua_so_tre_phut = lịch hẹn đạt mốc trễ tối đa bao lâu vẫn còn gửi [cần điền];
--   :so_lan_thu_toi_da, :khoang_cach_thu_lai_phut = số lần thử và khoảng cách thử lại [theo 2.4.69: 3 lần, 5 phút; cách đếm lần gửi đầu chưa chốt].
-- Mốc đã DaGui không bao giờ xuất hiện lại. Dòng ChoGui = đã tạo nhưng chưa có worker nhận (vd. worker chết); luôn được nhặt lại, việc nhận vẫn qua UPDATE có điều kiện.
-- ============================================================================
-- SELECT lh.lich_hen_id, m.so_gio_truoc, IFNULL(n.so_lan_thu, 0) AS so_lan_thu
-- FROM cau_hinh_he_thong c
-- CROSS JOIN JSON_TABLE(c.thoi_diem_nhac_lich, '$[*]' COLUMNS (so_gio_truoc INT PATH '$')) m
-- JOIN lich_hen lh ON lh.trang_thai = 'DaXacNhan' AND lh.thoi_gian > :bay_gio AND DATE_SUB(lh.thoi_gian, INTERVAL m.so_gio_truoc HOUR) <= :bay_gio
-- LEFT JOIN nhac_lich_hen n ON n.lich_hen_id = lh.lich_hen_id AND n.so_gio_truoc = m.so_gio_truoc
-- WHERE c.id = 1
--   AND ((n.lich_hen_id IS NULL AND DATE_SUB(lh.thoi_gian, INTERVAL m.so_gio_truoc HOUR) >= DATE_SUB(:bay_gio, INTERVAL :cua_so_tre_phut MINUTE))
--     OR n.trang_thai = 'ChoGui'
--     OR (n.trang_thai = 'ThatBai' AND n.so_lan_thu < :so_lan_thu_toi_da AND n.lan_thu_cuoi_luc <= DATE_SUB(:bay_gio, INTERVAL :khoang_cach_thu_lai_phut MINUTE)));

-- ============================================================================
-- TRUY VẤN MẪU (comment): PHỤ PHÍ hiện hành của một bác sĩ (dùng lúc hiển thị giá khám và lúc đặt lịch để ghi gia_snapshot)
-- Tham số: :bac_si_id. Dòng ap_dung = 0 bị loại; lấy mốc so_nam_kinh_nghiem_tu LỚN NHẤT không vượt số năm kinh nghiệm; không có dòng phù hợp thì 0.
-- Giá chốt: lich_hen.gia_snapshot = dich_vu_kham.gia_mac_dinh (dịch vụ khám chính của bác sĩ) + phu_phi, tính MỘT lần lúc đặt, không tính lại cho lịch đã có.
-- ============================================================================
-- SELECT b.tai_khoan_id, IFNULL((SELECT p.phu_phi FROM phu_phi_bac_si p
--                                WHERE p.chuc_danh = b.chuc_danh AND p.ap_dung = 1 AND p.so_nam_kinh_nghiem_tu <= b.so_nam_kinh_nghiem
--                                ORDER BY p.so_nam_kinh_nghiem_tu DESC LIMIT 1), 0) AS phu_phi
-- FROM bac_si b WHERE b.tai_khoan_id = :bac_si_id;

-- ============================================================================
-- TRUY VẤN MẪU (comment): THU TIỀN MẶT TẠI QUẦY, bước 1 — Lễ tân của PHIÊN ĐĂNG NHẬP có đúng chi nhánh của lịch hẹn không
-- Tham số: :le_tan_phien (lấy từ phiên đăng nhập, không nhận từ giao diện), :lich_hen_hien_tai. 0 dòng = từ chối (Lễ tân khác chi nhánh hoặc không còn hoạt động).
-- ============================================================================
-- SELECT lt.tai_khoan_id AS le_tan_dung_chi_nhanh
-- FROM le_tan lt
-- JOIN tai_khoan t ON t.tai_khoan_id = lt.tai_khoan_id AND t.trang_thai = 'DangHoatDong'
-- JOIN lich_hen lh ON lh.chi_nhanh_id = lt.chi_nhanh_id
-- WHERE lt.tai_khoan_id = :le_tan_phien AND lh.lich_hen_id = :lich_hen_hien_tai;

-- ============================================================================
-- TRUY VẤN MẪU (comment): THU TIỀN MẶT TẠI QUẦY, bước 2 — sau START TRANSACTION, KHÓA dòng lịch hẹn TRƯỚC khi đọc tổng đã trả
-- Hai thao tác thu đồng thời hoặc gửi lại cùng yêu cầu: lượt đến sau chờ ở đây rồi thấy trạng thái mới. Không đọc tổng đã trả bằng truy vấn không khóa TRƯỚC câu này (ảnh chụp cũ).
-- ============================================================================
-- SELECT lich_hen_id, trang_thai, chi_nhanh_id, gia_snapshot FROM lich_hen WHERE lich_hen_id = :lich_hen_hien_tai FOR UPDATE;

-- ============================================================================
-- TRUY VẤN MẪU (comment): THU TIỀN MẶT TẠI QUẦY, bước 3 — tổng đã thanh toán thành công của LỊCH GỐC và số còn phải thu (dùng lại để kiểm tra lần cuối)
-- Tham số: :lich_hen_hien_tai. con_phai_thu <= 0 thì KHÔNG tạo giao dịch tiền mặt (tiếp đón theo luồng Cập nhật trạng thái lịch hẹn).
-- ============================================================================
-- WITH RECURSIVE chuoi AS (
--   SELECT lich_hen_id, lich_hen_truoc_id FROM lich_hen WHERE lich_hen_id = :lich_hen_hien_tai
--   UNION ALL
--   SELECT l.lich_hen_id, l.lich_hen_truoc_id FROM lich_hen l JOIN chuoi c ON l.lich_hen_id = c.lich_hen_truoc_id
-- )
-- SELECT lh.lich_hen_id, lh.trang_thai, lh.gia_snapshot, goc.lich_hen_id AS lich_goc_id,
--        IFNULL(SUM(g.so_tien), 0) AS da_thanh_toan,
--        lh.gia_snapshot - IFNULL(SUM(g.so_tien), 0) AS con_phai_thu
-- FROM lich_hen lh
-- JOIN chuoi goc ON goc.lich_hen_truoc_id IS NULL
-- LEFT JOIN giao_dich_thanh_toan g ON g.lich_hen_id = goc.lich_hen_id AND g.loai = 'ThanhToanLichHen' AND g.trang_thai = 'ThanhCong'
-- WHERE lh.lich_hen_id = :lich_hen_hien_tai
-- GROUP BY lh.lich_hen_id, lh.trang_thai, lh.gia_snapshot, goc.lich_hen_id;

-- ============================================================================
-- TRUY VẤN MẪU (comment): THU TIỀN MẶT TẠI QUẦY, bước 4 — ghi giao dịch tiền mặt, CHỈ khi lịch vẫn DaXacNhan và còn phải thu
-- Tham số: :lich_goc_id và :da_thanh_toan (từ bước 3), :le_tan_phien, :lich_hen_hien_tai. Số dòng ảnh hưởng (ROW_COUNT) = 0 thì ROLLBACK, không ghi gì.
-- ============================================================================
-- INSERT INTO giao_dich_thanh_toan (lich_hen_id, loai, phuong_thuc, so_tien, trang_thai, nguoi_thu_id, thoi_diem_tao)
-- SELECT :lich_goc_id, 'ThanhToanLichHen', 'TienMatTaiQuay', lh.gia_snapshot - :da_thanh_toan, 'ThanhCong', :le_tan_phien, NOW()
-- FROM lich_hen lh
-- WHERE lh.lich_hen_id = :lich_hen_hien_tai AND lh.trang_thai = 'DaXacNhan' AND lh.gia_snapshot > :da_thanh_toan;

-- ============================================================================
-- TRUY VẤN MẪU (comment): THU TIỀN MẶT TẠI QUẦY, bước 5 — chuyển DaTiepDon trong CÙNG giao dịch, sau khi bước 3 chạy lại cho thấy con_phai_thu <= 0
-- Phải ảnh hưởng đúng 1 dòng; khác 1 thì ROLLBACK cả giao dịch tiền mặt ở bước 4.
-- ============================================================================
-- UPDATE lich_hen SET trang_thai = 'DaTiepDon' WHERE lich_hen_id = :lich_hen_hien_tai AND trang_thai = 'DaXacNhan';
