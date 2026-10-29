# CLINIX – Quy tắc nghiệp vụ trong Database (bản 2)

Nguồn: `clinix.dbml` và `clinix_mysql.sql` (cùng thư mục `docs/database/`, là bản chuẩn từ 17/10/2026; hai file này giữ đồng bộ bằng tay; cập nhật 27/10/2026: 44 bảng, 29 enum, 38 CHECK). Cần MySQL 8.0.17+ (CHECK được thực thi từ 8.0.16; hàm `JSON_SCHEMA_VALID` của `chk_cau_hinh_nhac_lich` cần 8.0.17).

## 1. Do database bảo vệ

| # | Quy tắc | Nơi khai báo | Cơ chế |
|---|---|---|---|
| 1 | Mỗi khung giờ chỉ có 1 lịch hẹn còn hiệu lực | `lich_hen.khung_gio_dang_giu` | Cột sinh STORED + UNIQUE (UNIQUE bỏ qua NULL nên mô phỏng được unique có điều kiện) |
| 2 | Mỗi khung giờ chỉ có 1 người đang được mời từ danh sách chờ | `muc_cho_danh_sach_cho.khung_gio_dang_moi` | Cột sinh STORED + UNIQUE |
| 3 | Trạng thái DaMoi thì phải có khung giờ được mời | `chk_muc_cho_da_moi` | CHECK |
| 4 | 1 lịch cũ chỉ sinh tối đa 1 lịch mới khi đổi lịch | `lich_hen.lich_hen_truoc_id UNIQUE` | UNIQUE |
| 5 | Quản trị viên: phạm vi Chi nhánh phải có chi_nhanh_id, Toàn hệ thống thì không | `chk_qtv_pham_vi` | CHECK |
| 6 | Tỷ lệ hoàn tiền từ 0 đến 100 | `chk_moc_hoan_ty_le` | CHECK |
| 7 | Nghỉ phép: CaNgay (không có ca, được nghỉ nhiều ngày) hoặc TheoCa (bắt buộc có ca, chỉ 1 ngày) | `chk_nghi_phep_hinh_thuc` | CHECK |
| 8 | Yêu cầu đổi lịch đã xử lý (khác ChoDuyet) phải có ghi chú xử lý | `chk_doi_lich_xu_ly` | CHECK |
| 9 | Yêu cầu nghỉ phép, đổi lịch ngoài chính sách, rút tiền: ChoDuyet thì chưa có người và thời điểm xử lý; DaDuyet hoặc TuChoi thì phải có cả hai | `chk_nghi_phep_xu_ly, chk_doi_lich_nguoi_xu_ly, chk_rut_tien_xu_ly` | CHECK |
| 10 | Ví: số dư >= 0, tiền đang giữ >= 0 và không vượt số dư | `chk_vi_so_du` | CHECK |
| 11 | Giao dịch thanh toán: NapVi không gắn lịch hẹn, ThanhToanLichHen bắt buộc gắn lịch hẹn | `chk_gd_thanh_toan_loai` | CHECK |
| 12 | Sổ cái ví: mỗi dòng tham chiếu đúng 1 nguồn theo loại (Nap/ThanhToan, HoanTien, Rut) | `chk_gd_vi_tham_chieu` | CHECK |
| 13 | Sổ cái ví: Nap/HoanTien là số dương, ThanhToan/Rut là số âm [đề xuất] | `chk_gd_vi_dau_so_tien` | CHECK |
| 14 | Đánh giá: 1 đến 5 sao; ẩn đánh giá thì bắt buộc có lý do, không ẩn thì không có lý do | `chk_danh_gia_so_sao, chk_danh_gia_an` | CHECK |
| 15 | Mỗi lịch hẹn có tối đa 1 đánh giá, 1 hồ sơ khám | `danh_gia_bac_si.lich_hen_id, ho_so_kham.lich_hen_id` | UNIQUE |
| 16 | Hội thoại với Lễ tân phải có chi nhánh, hội thoại với Bác sĩ thì không | `chk_hoi_thoai_chi_nhanh` | CHECK |
| 17 | Bảng cấu hình hệ thống và thông tin phòng khám chỉ có đúng 1 dòng (id = 1) | `chk_cau_hinh_mot_dong, chk_phong_kham_mot_dong` | CHECK |
| 18 | Không trùng khung giờ trong 1 lịch làm việc; không trùng lịch làm việc (bác sĩ, ngày, ca) | `khung_gio, lich_lam_viec` | UNIQUE |
| 19 | Không trùng mã giao dịch cổng thanh toán trong cùng phương thức (chống xử lý lặp) | `giao_dich_thanh_toan (phuong_thuc, ma_giao_dich_cong)` | UNIQUE |
| 20 | Tài khoản ChoKichHoat thì chưa có mật khẩu; DangHoatDong bắt buộc có mật khẩu (NgungHoatDong không ràng buộc) | `chk_tai_khoan_mat_khau` | CHECK |
| 21 | Tài khoản Bệnh nhân không bao giờ ở ChoKichHoat (chỉ nhân sự) | `chk_tai_khoan_cho_kich_hoat_nhan_su` | CHECK |
| 22 | Mỗi tài khoản tối đa 1 liên kết kích hoạt nhân sự hợp lệ (đã gửi, chưa thu hồi, chưa dùng) | `ma_xac_thuc.kich_hoat_dang_hieu_luc` | Cột sinh STORED + UNIQUE |
| 23 | Mã đã dùng không bị thu hồi; liên kết kích hoạt đã dùng thì phải đã được gửi | `chk_ma_xac_thuc_dung_hoac_thu_hoi, chk_ma_xac_thuc_kich_hoat_da_gui` | CHECK |
| 24 | Lịch hoạt động chi nhánh: thứ trong tuần từ 1 đến 7; mỗi (chi nhánh, thứ) tối đa 1 dòng | `chk_lich_hoat_dong_thu`, khóa chính `(chi_nhanh_id, thu_trong_tuan)` | CHECK, PRIMARY KEY |
| 25 | Lịch hoạt động chi nhánh là lịch NHẬN KHÁM với tối đa hai khoảng: mỗi khoảng (sáng, chiều) hoặc để trống cả hai giờ hoặc đủ giờ với bắt đầu < kết thúc trong ngày, không qua đêm (`chk_lich_hoat_dong_khoang`); hai khoảng không chồng nhau, kết thúc sáng <= bắt đầu chiều (`chk_lich_hoat_dong_khong_chong`); ngày hoạt động có ít nhất một khoảng đầy đủ, ngày nghỉ có cả bốn giờ để trống (`chk_lich_hoat_dong_ngay`) | `chk_lich_hoat_dong_khoang`, `chk_lich_hoat_dong_khong_chong`, `chk_lich_hoat_dong_ngay` | CHECK |
| 26 | Yêu cầu thay đổi chi nhánh: nội dung trước/sau là JSON object không rỗng; ChoDuyet và DaRut chưa có dữ liệu duyệt/hủy/quá hạn; DaDuyet có người duyệt, số ngày báo trước và hieu_luc_tu >= thoi_diem_duyet + so_ngay_bao_truoc ngày, ap_dung_luc không sớm hơn hieu_luc_tu; TuChoi cần người duyệt, thời điểm và lý do; DaHuy cần dữ liệu duyệt, người/thời điểm hủy, lý do không rỗng và chưa áp dụng. so_lan_doi_hieu_luc >= 0; qua_han_luc chỉ có thể từ mốc hieu_luc_tu trở đi. Mỗi chi nhánh chỉ có một yêu cầu ChoDuyet hoặc DaDuyet chưa áp dụng (dang_mo_chi_nhanh) | chk_yc_chi_nhanh_noi_dung, chk_yc_chi_nhanh_xu_ly, yeu_cau_thay_doi_chi_nhanh_unique_dang_mo | CHECK, UNIQUE |
| 27 | Mỗi lịch hẹn tối đa 1 dòng trong danh sách bị ảnh hưởng của một yêu cầu | khóa chính `(yeu_cau_thay_doi_chi_nhanh_id, lich_hen_id)` | PRIMARY KEY |
| 28 | Thông báo sinh từ một yêu cầu thay đổi chi nhánh không trùng theo (yêu cầu, tài khoản, loại sự kiện); thông báo thường (không gắn yêu cầu) không bị ảnh hưởng | `thong_bao_index_yeu_cau_chi_nhanh` | UNIQUE (NULL không tính) |
| 29 | Mỗi thông báo có tối đa 1 dòng email; DaGui phải có da_gui_luc và đã thử >= 1 lần, ThatBai phải có lỗi cuối và đã thử >= 1 lần, ChoGui chưa có da_gui_luc; BoQua biểu thị email thông báo bị dừng và chưa được gửi, không dùng cho email nhắc lịch | email_thong_bao.thong_bao_id, chk_email_thong_bao_ket_qua | UNIQUE, CHECK |
| 30 | Cấu hình hệ thống: thời gian giữ chỗ và thời hạn phản hồi lời mời > 0; ngưỡng no-show và số lịch hẹn tối đa mỗi hồ sơ đi khám >= 1; số lần tự đổi lịch, số mục chờ, phút tiếp đón trước/sau, số ngày báo trước và hai trọng số >= 0 [đề xuất miền giá trị; giới hạn trên của từng tham số: cần điền] | `chk_cau_hinh_gia_tri` | CHECK |
| 31 | Mốc nhắc lịch `thoi_diem_nhac_lich` là mảng JSON số nguyên dương không trùng (mảng rỗng được chấp nhận, chưa chốt có cho tắt nhắc lịch không) | `chk_cau_hinh_nhac_lich` | CHECK (JSON_SCHEMA_VALID) |
| 32 | Cột cấu hình chưa chốt (NOT NULL, không DEFAULT) không thể bỏ trống khi tạo dòng cấu hình: không có giá trị ngầm, không có dòng tạo sẵn | `cau_hinh_he_thong` | NOT NULL không DEFAULT (lỗi 1364) |
| 33 | Hồ sơ người thân của lịch hẹn phải thuộc đúng bệnh nhân đặt lịch; lịch của bản thân (`ho_so_nguoi_than_id` NULL) không bị kiểm tra | `fk_lich_hen_ho_so_chu_so_huu` (khóa ngoại kép) | FK |
| 34 | Nhắc lịch: mỗi (lịch hẹn, mốc) tối đa 1 dòng; DaGui phải có `da_gui_luc` và đã thử >= 1 lần, ThatBai phải có lỗi cuối và đã thử >= 1 lần, ChoGui chưa có `da_gui_luc`; mốc >= 1 giờ | khóa chính `(lich_hen_id, so_gio_truoc)`, `chk_nhac_lich_hen_ket_qua`, `chk_nhac_lich_hen_moc` | PRIMARY KEY, CHECK |
| 35 | Nhật ký `CapNhatCauHinh`: đối tượng `cau_hinh_he_thong` mã 1, không có chi nhánh; `chi_tiet_thay_doi` là object có `truoc`, `sau` (object cùng tập khóa, ít nhất 1 khóa) và `ly_do` (chuỗi không rỗng) [đề xuất: bắt buộc nhập lý do] | `chk_nhat_ky_cap_nhat_cau_hinh` | CHECK |
| 36 | Phụ phí: mỗi (chức danh, mốc năm kinh nghiệm) tối đa 1 dòng, KỂ CẢ dòng đã tắt (`ap_dung` = false) | `phu_phi_bac_si_index_2` | UNIQUE |
| 37 | `phu_phi` >= 0 và `so_nam_kinh_nghiem_tu` >= 0; `bac_si.so_nam_kinh_nghiem` >= 0 [đề xuất miền giá trị] | `chk_phu_phi_bac_si_gia_tri`, `chk_bac_si_kinh_nghiem` | CHECK |
| 38 | Chức danh (7 mức) và học vị (5 mức) của bác sĩ tương thích: BS, BS_CKI, BS_CKII ↔ BS; ThS_BS ↔ ThS; TS_BS ↔ TS; PGS_TS_BS ↔ PGS; GS_TS_BS ↔ GS. Ánh xạ BS_CKI và BS_CKII ↔ BS là [đề xuất] | `chk_bac_si_chuc_danh_hoc_vi` | CHECK |
| 39 | Thu tiền mặt tại quầy (`phuong_thuc` = `TienMatTaiQuay`): chỉ `ThanhToanLichHen`, bắt buộc có `lich_hen_id` và `nguoi_thu_id` (Lễ tân xác nhận đã nhận tiền), không có `vi_noi_bo_id` và `ma_giao_dich_cong`, `so_tien` > 0, `trang_thai` = `ThanhCong`; mọi phương thức khác thì `nguoi_thu_id` để trống. `nguoi_thu_id` chỉ nhận mã tài khoản có dòng `le_tan` (không thể là bác sĩ, bệnh nhân, quản trị viên) và không xóa được Lễ tân còn giao dịch. Các cột đứng trong phép so sánh của CHECK đều NOT NULL; cột cho phép NULL chỉ được thử bằng `IS NULL` / `IS NOT NULL`, nên không có trường hợp UNKNOWN (MySQL cho qua CHECK khi UNKNOWN) | `chk_gd_tien_mat_nguoi_thu`, khóa ngoại `giao_dich_thanh_toan.nguoi_thu_id` → `le_tan` | CHECK + FK |
| 40 | Mã xác thực loại DangKy mang dữ liệu của lần đăng ký (họ tên, SĐT, mật khẩu băm): ba cột cùng có giá trị hoặc cùng NULL; mã loại khác không có dữ liệu này | `chk_ma_xac_thuc_du_lieu_dang_ky` | CHECK |
| 41 | Tên chuyên khoa đã lưu là duy nhất theo collation `utf8mb4_unicode_ci` (không phân biệt hoa/thường và dấu). Service phải trim và gộp khoảng trắng trước khi lưu; UNIQUE không tự chuẩn hóa khoảng trắng | `chuyen_khoa_index_ten` | UNIQUE |
| 42 | Tên dịch vụ đã lưu là duy nhất trong cùng nhóm; tên giống nhau ở nhóm khác được phép. Service phải trim và gộp khoảng trắng trước khi lưu; UNIQUE không tự chuẩn hóa khoảng trắng | `dich_vu_kham_index_nhom_ten` | UNIQUE |

## 2. Do tầng ứng dụng (service) bảo vệ

| # | Quy tắc | Ghi chú |
|---|---|---|
| 1 | Cặp (chi nhánh, dịch vụ) của bác sĩ và của lịch hẹn phải có trong chi_nhanh_dich_vu_kham | Không dùng FK kép theo quyết định của nhóm; có thể bật FK ở cuối file nếu muốn DB bảo vệ |
| 2 | Đổi lịch: tạo lịch mới, đổi lịch cũ sang DaDoiLich trong CÙNG 1 giao dịch; chỉ cho đổi khi lịch cũ ở DaXacNhan [đề xuất, chưa xác nhận] | Giao dịch ở tầng ứng dụng |
| 3 | Lịch mới do đổi lịch sao chép gia_snapshot, tien_coc_snapshot, chinh_sach_hoan_snapshot từ lịch trước | Service |
| 4 | Tài chính sau đổi lịch: không tạo giao dịch thanh toán mới; lần theo lich_hen_truoc_id về lịch gốc để tìm giao dịch (xem truy vấn mẫu cuối file) | Service |
| 5 | (Đã chuyển sang DB từ 18/10/2026 đợt 2, xem mục 1 dòng 33.) Service chỉ còn phải xử lý lỗi khóa ngoại 1452 và hồ sơ người thân đã ngừng hiệu lực (`trang_thai_hieu_luc` = false) | Service |
| 6 | lich_hen.bac_si_id, chi_nhanh_id, thoi_gian khớp với khung giờ (dữ liệu snapshot) | Service |
| 7 | loai_tai_khoan của tai_khoan khớp đúng 1 bảng con (benh_nhan / bac_si / le_tan / quan_tri_vien). Ngoại lệ: tài khoản BenhNhan chưa xác minh email chưa có dòng benh_nhan (hồ sơ bệnh nhân tạo khi OTP đúng, xem 2.4 Đăng ký bước 9). Nhân sự không có ngoại lệ: tài khoản và hồ sơ vai trò (bac_si / le_tan / quan_tri_vien) tạo trong CÙNG 1 giao dịch, kể cả khi ChoKichHoat. Ví nội bộ: dòng vi_noi_bo (so_du = 0, so_tien_dang_giu = 0) được tạo cùng giao dịch với benh_nhan khi xác minh OTP đăng ký (quyết định Q9 của module auth) | Service |
| 8 | Chỉ cho đánh giá khi lịch hẹn ở trạng thái HoanThanh | Service |
| 9 | Ghi hồ sơ khám độc lập với Hoàn thành ca khám: bác sĩ phụ trách chuyển Đã tiếp đón -> Hoàn thành KHÔNG cần đã có hồ sơ khám, ghi được trước hoặc sau; khi bác sĩ lưu hồ sơ thì triệu chứng, chẩn đoán sơ bộ, hướng xử lý phải có nội dung (DB cho phép NULL nên chỉ service kiểm tra); chưa có hồ sơ thì giao diện bệnh nhân hiển thị "Chưa có hồ sơ khám", không tạo nội dung giả; quyền đánh giá mở khi Hoàn thành | Service (chưa có mã triển khai) |
| 10 | Danh sách chờ: không đăng ký trùng (bệnh nhân, bác sĩ, ngày, ca) khi còn DangCho hoặc DaMoi | Service |
| 11 | Phụ phí hiện hành của bác sĩ = `phu_phi` của dòng `phu_phi_bac_si` có `chuc_danh` = chức danh của bác sĩ, `ap_dung` = true và `so_nam_kinh_nghiem_tu` <= số năm kinh nghiệm của bác sĩ, lấy dòng có `so_nam_kinh_nghiem_tu` LỚN NHẤT; không có dòng phù hợp thì bằng 0 (truy vấn mẫu cuối `clinix_mysql.sql`; 0 năm vẫn khớp dòng mốc 0, nhưng không khớp dòng mốc >= 1). Dòng `ap_dung` = false bị loại khỏi phép tính, các dòng còn lại vẫn xét: tắt mốc cao thì bác sĩ rơi xuống mốc thấp hơn đang áp dụng chứ không về 0 [cần điền: nhóm xác nhận ý nghĩa này]. **Hai khái niệm tách riêng:** chức danh (7 mức, `bac_si.chuc_danh`) CHỈ dùng tra phụ phí và hiển thị; học vị (5 mức, `bac_si.hoc_vi`) CHỈ dùng cho điểm xếp hạng AI (quy đổi số năm kinh nghiệm), trọng số w1/w2 và công thức AI không đổi. Hai trường được nhập cùng nhau ở "Tạo tài khoản nhân sự" và "Quản lý hồ sơ bác sĩ", đổi một trường phải đổi trường kia cho tương thích (DB chặn, mục 1 dòng 38); giao diện chọn chức danh rồi điền sẵn học vị theo ánh xạ [đề xuất]. Giá chốt: `lich_hen.gia_snapshot` = giá mặc định dịch vụ + phụ phí hiện hành tại lúc đặt, tính MỘT lần; sửa/tắt/xóa quy tắc hoặc đổi chức danh, học vị, số năm kinh nghiệm của bác sĩ về sau KHÔNG đổi lịch đã đặt (lịch mới do đổi lịch sao chép snapshot từ lịch trước, quy tắc 3). Chỉ Quản trị viên Toàn hệ thống cấu hình bảng phụ phí [đề xuất, theo prototype]; có ghi nhật ký khi sửa bảng phụ phí hay không: [cần điền] | Service |
| 12 | Rút tiền: tạo yêu cầu tăng so_tien_dang_giu; duyệt ghi giao_dich_vi loại Rut và giảm cả so_du lẫn so_tien_dang_giu; từ chối chỉ giảm so_tien_dang_giu | Giao dịch ở tầng ứng dụng |
| 13 | Đổi chi nhánh công tác của bác sĩ (chỉ Quản trị viên Toàn hệ thống, sửa trực tiếp hồ sơ, không có yêu cầu riêng) chỉ khi bác sĩ ĐỒNG THỜI (a) không còn lịch hẹn đang hoạt động (`ChoThanhToan`/`DaXacNhan`/`DaTiepDon`) có `lich_hen.bac_si_id` = bác sĩ và `lich_hen.chi_nhanh_id` = chi nhánh hiện tại, và (b) không còn dòng `lich_lam_viec` của bác sĩ có `chi_nhanh_id` = chi nhánh hiện tại và `ngay` >= ngày hiện tại (ca của hôm nay tính là còn, kể cả khi khoảng nhận khám của ca đã kết thúc: chưa quy định ca đã kết thúc trong ngày có được coi là đã qua không [cần điền]). Lịch hẹn và ca đã qua giữ nguyên để truy vết; `lich_lam_viec.chi_nhanh_id` là chi nhánh tại thời điểm phân công, không đổi khi hồ sơ đổi chi nhánh. Kiểm tra ngay trước khi lưu, không chỉ khóa nút trên giao diện; bị chặn thì không lưu trường nào của lần gửi và trả về danh sách lịch hẹn/ca đang chặn; được phép thì ghi nhật ký DoiChiNhanhBacSi. Không có thao tác hủy hay chuyển ca tự động. DB không tự chặn (không có CHECK hay trigger) | Service |
| 14 | Mốc đã đọc của chat (tin_nhan_cuoi_da_doc_id) phải thuộc cùng hội thoại | Service |
| 15 | Đăng ký: tạo tai_khoan ngay với da_xac_minh_email = false (dữ liệu của lần đăng ký đầu) và gửi OTP; dữ liệu của MỖI lần đăng ký (họ tên, SĐT, mật khẩu băm) nằm ở hàng ma_xac_thuc DangKy tương ứng và chỉ được ghi vào tai_khoan khi chính mã đó được xác minh đúng. OTP đúng thì trong cùng 1 giao dịch: ghi dữ liệu của hàng đó vào tai_khoan, đặt da_xac_minh_email = true, đặt lại so_lan_dang_nhap_sai = 0 và khoa_dang_nhap_den = NULL, tạo dòng benh_nhan và vi_noi_bo (số dư 0), đặt da_dung_luc, thu hồi các mã DangKy khác (không đụng mã QuenMatKhau) và đặt NULL dữ liệu đăng ký của mọi hàng DangKy; chỉ làm khi tài khoản còn là Bệnh nhân chưa xác minh đang hoạt động và chưa quá 24 giờ (nửa mở: đúng 24:00:00 là hết), nếu không thì từ chối và hoàn tác toàn bộ; không tạo phiên đăng nhập (đăng nhập là bước sau). Tài khoản Bệnh nhân chưa xác minh bị xóa sau 24 giờ kể từ thoi_diem_tao (nửa mở: đúng 24:00:00 là hết; không gia hạn khi gửi lại OTP): xóa lười khi chính email đó đăng ký lại (quy tắc 16) và bằng job định kỳ; không bao giờ xóa tài khoản nhân sự (kể cả ChoKichHoat) và tài khoản Bệnh nhân đang NgungHoatDong (quản trị viên ngưng có chủ ý, không được gỡ bằng cách chờ 24 giờ). Mỗi tài khoản xóa trong một giao dịch riêng: khóa hàng tai_khoan, kiểm lại điều kiện dưới khóa, rồi xóa ma_xac_thuc, phien_dang_nhap và tai_khoan theo đúng thứ tự (khóa ngoại không CASCADE); còn bảng khác tham chiếu tới tài khoản thì khóa ngoại chặn: không xóa, báo lỗi. Tài khoản chưa xác minh không được đặt lịch (quyết định 17/10/2026) | Giao dịch ở tầng ứng dụng |
| 16 | Email trùng khi đăng ký: thuộc tài khoản đã xác minh, tài khoản nhân sự (kể cả ChoKichHoat) hoặc Bệnh nhân chưa xác minh đang NgungHoatDong → từ chối (kể cả khi đã quá 24 giờ); thuộc tài khoản Bệnh nhân chưa xác minh đang hoạt động đã quá 24 giờ (nửa mở) → xóa tài khoản đó (quy tắc 15) rồi đăng ký như email mới; thuộc tài khoản Bệnh nhân chưa xác minh còn hạn → chèn hàng ma_xac_thuc DangKy mới mang dữ liệu của lần đăng ký này (tai_khoan KHÔNG đổi cho tới khi OTP đúng). Chỉ sau khi gửi thành công (đặt da_gui_luc) mới thu hồi các mã DangKy cũ chưa dùng, theo đúng thứ tự này; gửi lỗi thì chỉ thu hồi chính hàng mới và giữ mã cũ. Xác minh và gửi lại phải kèm ma_xac_thuc_id; hàng không còn là hàng DangKy đã gửi mới nhất thì bị từ chối (chống chiếm trước tài khoản) | Service |
| 17 | Giới hạn gửi lại OTP: mã mới cách mã trước (theo ma_xac_thuc.tao_luc) ≥ 60 giây và tối đa 5 mã trong 1 giờ theo (tai_khoan_id, loai), tính cả hàng gửi lỗi; mỗi mã tối đa 5 lần nhập sai (so_lan_nhap_sai), hiệu lực 10 phút; kiểm hạn trước khi so mã; OTP lưu HMAC-SHA-256 (khóa bí mật riêng) của tai_khoan_id, loai, ma_xac_thuc_id và mã | Service |
| 18 | Đăng nhập sai: tăng so_lan_dang_nhap_sai của tài khoản (đọc và ghi dưới khóa hàng tai_khoan, nên đăng nhập sai song song không mất lần đếm); đủ 5 lần liên tiếp thì đặt khoa_dang_nhap_den = bây giờ + 15 phút; đăng nhập đúng thì về 0 và xóa khoa_dang_nhap_den, kể cả khi tài khoản chưa xác minh email (quy tắc 23). Đang bị khóa (khoa_dang_nhap_den còn ở tương lai; đúng mốc là hết khóa, nửa mở) thì từ chối TRƯỚC khi so mật khẩu, kể cả khi mật khẩu đúng: không so, không đếm. Hết khóa thì lần sai kế tiếp đếm lại từ 1 (khóa 15 phút là án đã chịu xong). Email không tồn tại thì không đếm và vẫn trả thông báo chung | Service |
| 19 | Phiên: JWT access token 15 phút + refresh token ngẫu nhiên 256 bit chỉ lưu bản băm (SHA-256) trong phien_dang_nhap, xoay tại chỗ mỗi lần làm mới; không hoạt động 30 phút (het_han_luc trượt) và tối đa 8 giờ kể từ tao_luc; dùng lại refresh token cũ (chữ ký hợp lệ, băm không khớp) thì thu hồi phiên; đăng xuất đặt thu_hoi_luc; refresh chỉ hợp lệ khi chưa thu hồi, chưa quá het_han_luc, chưa quá trần 8 giờ (cả hai hạn nửa mở: đúng mốc là hết) và tài khoản còn DangHoatDong; phiên đã thu hồi được kiểm TRƯỚC phát hiện dùng lại nên token cũ của phiên đã thu hồi chỉ bị từ chối, không tính là dùng lại; kết quả thất bại của làm mới (kể cả việc thu hồi do dùng lại) được trả về chứ không ném lỗi trong giao dịch, để việc thu hồi không bị hoàn tác | Service |
| 20 | Tạo tài khoản nhân sự (2.4.39): 1 giao dịch tạo tai_khoan (ChoKichHoat, mat_khau_bam NULL) + hồ sơ vai trò + liên kết kích hoạt (da_gui_luc rỗng). Bác sĩ: bắt buộc đủ chuc_danh, hoc_vi, so_nam_kinh_nghiem, chuyen_khoa_id, chi_nhanh_id, dich_vu_kham_id (cặp chi nhánh – dịch vụ phải có trong chi_nhanh_dich_vu_kham); mo_ta_chuyen_mon là TÙY CHỌN. Lưu ý: DB chỉ thật sự bắt buộc chuyen_khoa_id, chi_nhanh_id, dich_vu_kham_id; nếu bỏ trống thì chuc_danh và hoc_vi tự cùng thành BS (ENUM NOT NULL lấy giá trị đầu, nên vẫn thỏa CHECK tương thích) và so_nam_kinh_nghiem tự thành 0 (DEFAULT 0), nên service phải bắt buộc nhập tường minh ba trường này (đã kiểm chứng ở test GAP). Thiếu hồ sơ bắt buộc thì không tạo tài khoản. Quản trị viên không đặt, không nhìn thấy, không gửi mật khẩu | Giao dịch ở tầng ứng dụng |
| 21 | Gửi email kích hoạt (tạo tài khoản hoặc Gửi lại): sau khi dịch vụ email xác nhận gửi THÀNH CÔNG, trong 1 giao dịch: thu hồi liên kết cũ chưa dùng (`thu_hoi_luc` = bây giờ) rồi đặt `da_gui_luc` cho liên kết mới (đúng thứ tự này để không vi phạm UNIQUE). Gửi THẤT BẠI: chỉ đặt `thu_hoi_luc` cho chính liên kết mới, KHÔNG đụng liên kết cũ — liên kết cũ còn hạn vẫn hợp lệ; tài khoản vẫn ChoKichHoat; không báo "đã gửi thành công" | Giao dịch ở tầng ứng dụng |
| 22 | Kích hoạt: liên kết hợp lệ khi `da_gui_luc` có giá trị, `thu_hoi_luc` và `da_dung_luc` rỗng, `het_han_luc` > bây giờ (thời hạn [đề xuất: 24 giờ], chưa chốt; chưa có cột cấu hình). Đặt mật khẩu hợp lệ thì trong 1 giao dịch: `da_dung_luc`, `mat_khau_bam`, `trang_thai` = DangHoatDong, `da_xac_minh_email` = true [đề xuất]. Liên kết sai/hết hạn/đã dùng/bị thu hồi hoặc tài khoản không còn ChoKichHoat thì từ chối, không đổi gì | Giao dịch ở tầng ứng dụng |
| 23 | Đăng nhập (use case Đăng nhập): tìm tài khoản theo email → kiểm tra trạng thái (ChoKichHoat / NgungHoatDong thì từ chối, KHÔNG so mật khẩu, KHÔNG tăng `so_lan_dang_nhap_sai`) → kiểm tra khóa tạm (quy tắc 18; trạng thái đứng trước khóa, nên NgungHoatDong đang bị khóa vẫn báo ngưng hoạt động) → chỉ tài khoản DangHoatDong không bị khóa mới so mật khẩu và đếm sai (xem quy tắc 18). Đúng mật khẩu mà `da_xac_minh_email` = false thì KHÔNG tạo phiên và KHÔNG tự gửi email: trả lỗi kèm trạng thái mã OTP đăng ký mới nhất để người dùng nhập mã hoặc bấm "Gửi lại mã" (quy tắc 17); quá 24 giờ kể từ `thoi_diem_tao` (quy tắc 15) hoặc mã đã bị thu hồi do đặt lại mật khẩu thì hướng tới đăng ký lại. Chỉ tài khoản đã xác minh mới tạo `phien_dang_nhap` (quy tắc 19). Trạng thái, khóa, mật khẩu và cờ xác minh được kiểm LẠI dưới khóa hàng tai_khoan ngay trước khi đếm, đặt về 0 hay tạo phiên, vì phần đọc và băm Argon2id chạy ngoài khóa | Service |
| 24 | Khoá/mở khoá tài khoản (2.4.40): Quản trị viên Toàn hệ thống khoá/mở Bác sĩ, Lễ tân, Bệnh nhân và Quản trị viên khác; Quản trị viên Chi nhánh chỉ khoá/mở Bác sĩ, Lễ tân thuộc chi nhánh mình, không khoá Quản trị viên, không khoá/sửa Bệnh nhân, không mở khoá no-show. Cấm tự khoá (mọi Quản trị viên); cấm khoá Quản trị viên Toàn hệ thống cuối cùng đang hoạt động. Khoá/Mở khoá chỉ chuyển DangHoatDong ↔ NgungHoatDong; không có đường ChoKichHoat → DangHoatDong bằng Mở khoá [đề xuất: không cho Khoá tài khoản ChoKichHoat]. Kiểm tra ở service, không chỉ ẩn nút | Service |
| 25 | Quản trị viên Chi nhánh chỉ XEM thông tin hành chính của Bệnh nhân có ít nhất 1 `lich_hen` (mọi trạng thái) với `lich_hen.chi_nhanh_id` = chi nhánh được gán (snapshot lúc đặt); lọc qua `lich_hen.benh_nhan_id` + `lich_hen.chi_nhanh_id` (chỉ mục `lich_hen_index_chi_nhanh_benh_nhan`), KHÔNG thêm `chi_nhanh_id` vào `benh_nhan`. Danh sách trường "thông tin hành chính" được xem: [cần điền] | Service |
| 26 | Không có thao tác đổi loại vai trò Bác sĩ ↔ Lễ tân ↔ Quản trị viên sau khi tạo (`loai_tai_khoan` không đổi); chuyển bác sĩ giữa hai chi nhánh chỉ Quản trị viên Toàn hệ thống làm, xem quy tắc 13 | Service |
| 27 | Lịch hẹn không tự trỏ chính nó (lich_hen_truoc_id khác lich_hen_id): KHÔNG có CHECK vì MySQL từ chối CHECK tham chiếu cột AUTO_INCREMENT (lỗi 3818); kiểm tra ở service khi triển khai API — hiện CHƯA có mã triển khai. Việc này là quyết định của nhóm (17/10/2026), không phải do DB bảo vệ: khi viết API phải kiểm tra trước khi ghi `lich_hen_truoc_id` | Service |
| 28 | Lịch hoạt động chi nhánh: mỗi chi nhánh phải có đủ 7 dòng `chi_nhanh_lich_hoat_dong` (tạo chi nhánh mới và nhập 7 dòng trong CÙNG 1 giao dịch); mỗi dòng có tối đa hai khoảng nhận khám (sáng, chiều), ngày nghỉ không có khoảng nào. Thứ chưa có dòng được coi là CHƯA KHAI BÁO và xử lý như ngày nghỉ (không nhận phân công/đặt lịch) [đề xuất]; DB không ép đủ 7 dòng. Thứ 7 có thể chỉ có buổi sáng, Chủ nhật có thể nghỉ; không có lịch mặc định áp cho mọi chi nhánh: giờ cụ thể của từng chi nhánh là [cần điền] (các giờ trong giao diện minh họa chỉ là [đề xuất], xem mục 8) | Service; truy vấn kiểm tra ở cuối `clinix_mysql.sql` |
| 29 | Không phân công và không nhận đặt lịch ngoài KHOẢNG NHẬN KHÁM của chi nhánh: (a) phân công `lich_lam_viec`: ngày phân công phải rơi vào thứ có `hoat_dong` = true của `lich_lam_viec.chi_nhanh_id` VÀ ca phải có khoảng tương ứng (`CaSang` cần `gio_bat_dau_sang`/`gio_ket_thuc_sang`, `CaChieu` cần `gio_bat_dau_chieu`/`gio_ket_thuc_chieu`); không phân công ca không tồn tại ở ngày đó; thao tác "Cả ngày" khi phân công = hai dòng `CaSang` + `CaChieu`, chỉ hợp lệ khi cả hai khoảng tồn tại (thiếu một khoảng thì từ chối và nêu ca nào không tồn tại, không tự bỏ qua); (b) sinh khung giờ và tính khung giờ trống: chỉ ConTrong khi `[ngay_gio, ngay_gio + dich_vu_kham.thoi_luong]` nằm TRỌN trong đúng một khoảng, và là khoảng ứng với ca của `lich_lam_viec` chứa khung giờ (`CaSang` → khoảng sáng, `CaChieu` → khoảng chiều); không sinh khung giờ xuyên giờ nghỉ trưa hay kết thúc sau giờ kết thúc của khoảng (bắt đầu đúng giờ bắt đầu khoảng và kết thúc đúng giờ kết thúc khoảng đều hợp lệ); các khung giờ trong một khoảng nối liền nhau (khung đầu bắt đầu đúng giờ bắt đầu khoảng, mỗi khung dài đúng `dich_vu_kham.thoi_luong`, khung sau bắt đầu đúng lúc khung trước kết thúc), phần dư cuối khoảng không đủ một khung thì không sinh khung giờ, ví dụ khoảng 07:30–11:00 với khung 50 phút sinh 4 khung (07:30, 08:20, 09:10, 10:00) và bỏ 10 phút cuối (nhóm đồng ý 20/10/2026); (c) giữ chỗ/đặt lịch/đổi lịch: kiểm tra lại đúng điều kiện trên. Mã lý do trả về cho giao diện: `ChuaKhaiBao`, `NgayNghi`, `CaKhongTonTai`, `NgoaiGioHoatDong`. DB không chặn, vì mỗi thay đổi lịch hoạt động chỉ có hiệu lực về sau: nếu dùng khóa ngoại kép thì chính DB cũng chặn luôn việc đổi một ngày đã có lịch làm việc trong quá khứ. Giờ của ca không có cột riêng: giờ ca là khoảng tương ứng của chi nhánh vào thứ đó [đề xuất]; ca của hôm nay đã kết thúc hay chưa vẫn chưa quy định (quy tắc 13) [cần điền]. `CaToi` không có khoảng tương ứng nên không phân công được (quy tắc 44) | Service |
| 30 | Phát hiện lịch hẹn bị ảnh hưởng TRƯỚC khi chấp nhận thay đổi: lịch hẹn `ChoThanhToan`/`DaXacNhan` có `thoi_gian` >= mốc kiểm tra (lúc đề xuất: bây giờ; lúc duyệt: `hieu_luc_tu`) của chi nhánh đó, mà (i) thứ trở thành nghỉ, hoặc (ii) `[thoi_gian, thoi_gian + dich_vu_kham.thoi_luong]` không còn nằm TRỌN trong khoảng mới ứng với ca của lịch (khoảng bị bỏ, bị thu hẹp, hoặc lịch rơi vào giờ nghỉ trưa mới), hoặc (iii) dịch vụ bị bỏ khỏi chi nhánh (truy vấn mẫu cuối `clinix_mysql.sql`). Không ảnh hưởng lịch hẹn nào thì áp dụng ngay (không cần yêu cầu). Ca làm việc tương lai không còn khoảng tương ứng và khung giờ ConTrong nằm ngoài lịch mới cũng phải được liệt kê cho người duyệt (có truy vấn mẫu); cách xử lý chúng [cần điền] | Service |
| 31 | Vòng đời yeu_cau_thay_doi_chi_nhanh: tạo ChoDuyet không sửa lịch hoạt động/dịch vụ đang áp dụng; người gửi được rút khi ChoDuyet thành DaRut; Admin Toàn hệ thống từ chối ChoDuyet thành TuChoi hoặc hủy DaDuyet chưa áp dụng thành DaHuy (cần lý do). Khi duyệt, chụp số ngày báo trước và danh sách lịch hẹn bị ảnh hưởng, tạo thông báo/email; hieu_luc_tu là lúc dự kiến có hiệu lực, ap_dung_luc là lúc thực sự áp dụng. Đến hạn, job tính lại ảnh hưởng: còn lịch/ca thì đặt qua_han_luc, giữ DaDuyet và không tự áp dụng muộn. Chỉ yêu cầu quá hạn mới được dời: đặt thời điểm mới >= bây giờ + max(số ngày đã chụp, cấu hình hiện hành), xóa qua_han_luc, tăng so_lan_doi_hieu_luc, tính lại ảnh hưởng và thông báo lại. Hủy/dời dừng email cũ chưa gửi bằng BoQua; email đã nhận việc có thể vẫn tới người nhận. Chưa áp dụng thì chi nhánh vẫn bị chặn đặt/đổi vào vùng bị loại cho tới khi áp dụng, hủy hoặc dời | Giao dịch ở tầng ứng dụng |
| 32 | Phân quyền yêu cầu thay đổi chi nhánh: người đề xuất là Quản trị viên Chi nhánh của đúng chi nhánh đó hoặc Quản trị viên Toàn hệ thống; người duyệt/từ chối phải là Quản trị viên Toàn hệ thống. Quản trị viên Toàn hệ thống có được tự duyệt đề xuất của chính mình không [cần điền]; DB hiện KHÔNG chặn `nguoi_duyet_id` = `nguoi_de_xuat_id` (có test GAP) | Service |
| 33 | Thông báo cho bệnh nhân bị ảnh hưởng: mỗi bệnh nhân đặt lịch (`lich_hen.benh_nhan_id`, kể cả khi người khám là hồ sơ người thân) nhận 1 thông báo cho mỗi yêu cầu, gom mọi lịch hẹn của họ; nội dung <= 500 ký tự, chi tiết xem qua `yeu_cau_thay_doi_chi_nhanh_lich_hen`. Thông báo phải được tạo TRƯỚC `hieu_luc_tu` (thời điểm tạo < `hieu_luc_tu`) và cách `hieu_luc_tu` ít nhất `so_ngay_bao_truoc` ngày. Hai kênh: thông báo trong ứng dụng (`thong_bao`) và email (`email_thong_bao`). "Đẩy tức thời" chỉ là hiển thị ngay thông báo trong ứng dụng cho phiên đang mở; chưa có thông báo đẩy trên thiết bị di động và CSDL không có bảng token thiết bị | Service |
| 34 | Gửi/gửi lại email thông báo: tạo email_thong_bao (ChoGui, 0 lần thử) cùng giao dịch với thong_bao; worker chỉ nhận ChoGui/ThatBai bằng UPDATE có điều kiện, gửi được thì DaGui, lỗi thì ThatBai + loi_cuoi ở giao dịch riêng. Khi hủy/dời yêu cầu thay đổi chi nhánh, chuyển email cũ ChoGui/ThatBai sang BoQua trong cùng giao dịch; DaGui không đổi. Email đã được worker nhận trước lúc hủy/dời không thu hồi được nên luôn gửi thông báo mới. Thử lại tối đa 3 lần, cách 5 phút (Q9). Email nhắc lịch vẫn dùng nhac_lich_hen và không có trạng thái BoQua | Service |
| 35 | Cấu hình hệ thống **không có dòng tạo sẵn** và không có giá trị ngầm cho cột [cần điền]. Mỗi lần xử lý cần cấu hình (đặt lịch, giữ chỗ, đổi lịch, tiếp đón, nhắc lịch, báo trước thay đổi chi nhánh...), service đọc dòng `id = 1`; **không có dòng** (hoặc cột cần dùng không đọc được) thì TỪ CHỐI chức năng đó với thông báo "hệ thống chưa được cấu hình", không dùng số cứng trong mã. Khi khởi động, service chạy `SELECT COUNT(*) FROM cau_hinh_he_thong WHERE id = 1` và cảnh báo nếu bằng 0 [đề xuất]. Cách tạo dòng đầu tiên: mục 5.2 [cần điền: ai chạy và khi nào] | Service |
| 36 | Cập nhật cấu hình (2.4.42) và ghi nhật ký trong CÙNG 1 giao dịch: `SELECT ... FOR UPDATE` dòng cấu hình để lấy giá trị cũ, `UPDATE cau_hinh_he_thong ...`, rồi `INSERT nhat_ky_hanh_dong (hanh_dong = 'CapNhatCauHinh', loai_doi_tuong = 'cau_hinh_he_thong', ma_doi_tuong = 1, chi_nhanh_id = NULL, ket_qua = 'ThanhCong', chi_tiet_thay_doi = {"truoc":{...},"sau":{...},"ly_do":"..."})`. Ghi nhật ký lỗi (kể cả `chk_nhat_ky_cap_nhat_cau_hinh` từ chối) thì ROLLBACK cả cập nhật cấu hình. `truoc`/`sau` chỉ gồm tham số có đổi, cùng tập khóa. Lần tạo dòng đầu tiên qua giao diện (nếu nhóm chọn cách đó) ghi `truoc` = null cho từng tham số. DB KHÔNG tự bắt buộc mọi UPDATE cấu hình đều có nhật ký (không dùng trigger): test GAP. Chỉ Quản trị viên Toàn hệ thống được sửa (2.4.42) | Giao dịch ở tầng ứng dụng |
| 37 | Giới hạn số lịch hẹn đang hoạt động tính theo **hồ sơ đi khám**, không theo tài khoản. Hồ sơ đi khám = `(lich_hen.benh_nhan_id, lich_hen.ho_so_nguoi_than_id)`; `ho_so_nguoi_than_id` NULL = chính bệnh nhân (bản thân), mỗi hồ sơ người thân là một hồ sơ riêng. So sánh với NULL bắt buộc dùng `<=>` (`= NULL` không bao giờ đúng; `GROUP BY` thì gom các NULL làm một nhóm). "Đang hoạt động" = `ChoThanhToan`, `DaXacNhan`, `DaTiepDon` [cần điền: nhóm xác nhận tập trạng thái; đây là đề xuất]. Đếm và tạo lịch hẹn trong CÙNG 1 giao dịch, khóa dòng `benh_nhan` (`SELECT ... FOR UPDATE`) [đề xuất] để hai yêu cầu đồng thời không cùng vượt giới hạn; DB không chặn vượt (test GAP). Truy vấn mẫu cuối `clinix_mysql.sql`; thiếu dòng cấu hình thì từ chối (quy tắc 35). Mục chờ trong danh sách chờ không tính. Giá trị giới hạn: [cần điền] | Service |
| 38 | Không có giới hạn số ngày đặt trước cố định (đã bỏ cột `so_ngay_dat_truoc_toi_da`). Đặt được tới ngày bác sĩ đã có lịch: hợp lệ khi `khung_gio` tồn tại, ConTrong và `ngay_gio` không ở quá khứ; DB không chặn đặt xa. Hệ thống KHÔNG có cờ "đã công bố" riêng: lịch làm việc đã tạo là hiển thị với bệnh nhân [cần điền: nhóm có muốn bước công bố lịch riêng không] | Service |
| 39 | Thời lượng khung giờ lấy từ `dich_vu_kham.thoi_luong` của dịch vụ khám chính của bác sĩ (mỗi bác sĩ đúng 1 dịch vụ). Đã bỏ cột `thoi_luong_khung_gio_mac_dinh` vì không có quy tắc nào dùng nó khác thời lượng khám: nhóm đã chốt (20/10/2026) khoảng cách giữa các giờ bắt đầu bằng đúng thời lượng dịch vụ nên không cần cột riêng. Nếu sau này nhóm đổi sang khoảng cách riêng (vd. cách 15 phút dù dịch vụ 30 phút), thêm cột MỚI có tên và định nghĩa riêng (vd. `buoc_khung_gio_phut`), không dùng lại cột cũ. Giờ của ca là khoảng nhận khám tương ứng của chi nhánh (CaSang → khoảng sáng, CaChieu → khoảng chiều) [đề xuất]; các khung giờ trong khoảng nối liền nhau theo thời lượng khám, phần dư cuối khoảng không sinh khung giờ (nhóm đồng ý 20/10/2026); thuật toán sinh `khung_gio` cụ thể ở service chưa có mã | Service |
| 40 | Cửa sổ tiếp đón (check-in) [đề xuất cách hiểu]: Lễ tân chuyển lịch hẹn sang `DaTiepDon` (qua "Thanh toán offline tại quầy" hoặc "Cập nhật trạng thái lịch hẹn") chỉ khi `lich_hen.thoi_gian − check_in_truoc_phut` <= bây giờ <= `lich_hen.thoi_gian + check_in_sau_phut`. Hai cột tính bằng PHÚT, >= 0, giá trị [cần điền]. Ngoài cửa sổ: từ chối và báo khoảng được phép; Quản trị viên override (2.4.34) không bị giới hạn bởi cửa sổ [đề xuất]. `check_in_sau_phut` KHÔNG phải thời điểm tự đánh Vắng mặt: tự Vắng mặt tính theo hết ca làm việc (2.4 "Tự động đánh dấu vắng mặt"). Còn mở [cần điền]: nếu `check_in_sau_phut` hết trước khi ca kết thúc thì lịch hẹn ở giữa hai mốc được xử lý thế nào (Lễ tân có được đánh Vắng mặt sớm không, hay chỉ override); QR check-in (M23) chưa nằm trong phạm vi lõi nên chưa dùng hai cột này | Service |
| 41 | Nhắc lịch theo mốc (2.4.69): mỗi cặp (lịch hẹn, mốc) có đúng 1 dòng `nhac_lich_hen`; mốc = CHÍNH số giờ trong `thoi_diem_nhac_lich` (không phải vị trí trong mảng nên đổi mảng không làm lệch lịch sử). Lịch hẹn đổi giờ tạo `lich_hen` mới có `lich_hen_id` mới nên tự có bộ mốc mới; lịch cũ đã hủy/đổi không được nhắc. Truy vấn "mốc nhắc đến hạn" ở cuối SQL. Tạo dòng bằng `INSERT ... ON DUPLICATE KEY UPDATE lich_hen_id = lich_hen_id` (ROW_COUNT 1 = vừa tạo, 0 = đã có). Nhận việc gửi: `UPDATE nhac_lich_hen SET so_lan_thu = so_lan_thu + 1, lan_thu_cuoi_luc = NOW() WHERE lich_hen_id = :l AND so_gio_truoc = :h AND trang_thai <> 'DaGui' AND so_lan_thu = :so_lan_thu_da_doc`, chỉ ROW_COUNT = 1 mới được gọi Dịch vụ Email. Gửi được -> DaGui + `da_gui_luc`; lỗi -> ThatBai + `loi_cuoi`. Thử lại theo 2.4.69 (nhóm đồng ý 28/09/2026): tối đa 3 lần, cách 5 phút, chỉ khi lịch hẹn còn DaXacNhan và chưa tới giờ hẹn; hết lần thì giữ ThatBai, không gửi bù mốc khác. Hai số 3 và 5 là hằng số trong service, KHÔNG có cột cấu hình. Còn mở [cần điền]: lần gửi đầu có tính vào "3 lần" không; "vừa đạt mốc" cho phép trễ tối đa bao lâu (lịch đặt sát giờ đã quá mốc 72 giờ có gửi không); có cho cấu hình mảng rỗng để tắt nhắc không | Service |

| 42 | Xử lý thủ công giao dịch nạp ví đã xác minh Thành công nhưng chưa cộng (UC 2.4.53): khóa giao dịch nạp, kiểm tra chưa có dòng `giao_dich_vi` loại `Nap` cho giao dịch đó; nếu còn cần cộng, cộng ví đúng một lần, ghi sổ cái, đánh dấu `DaDoiSoat` và ghi `nhat_ky_hanh_dong` với `hanh_dong = XuLyNapViChuaCong`, `loai_doi_tuong = giao_dich_thanh_toan`, `ma_doi_tuong = giao_dich_thanh_toan_id` trong CÙNG một giao dịch; lỗi thì hoàn tác. Không có trigger ép nhật ký hay UNIQUE riêng trên sổ cái nạp: service chịu trách nhiệm khóa và chống cộng trùng. Trường hợp chưa thể xử lý phải giữ nguyên số dư và ghi lý do/Audit Log theo UC 53. Quyền Admin áp dụng theo UC 53; DB không tự kiểm tra vai trò. | Giao dịch ở tầng ứng dụng |
| 43 | Cấu trúc JSON đề xuất thay đổi lịch hoạt động (`yeu_cau_thay_doi_chi_nhanh.noi_dung_truoc`/`noi_dung_sau`, khóa `lich_hoat_dong`): mỗi phần tử là TOÀN BỘ dòng của một thứ muốn đổi, luôn đủ 6 khóa `thu_trong_tuan`, `hoat_dong`, `gio_bat_dau_sang`, `gio_ket_thuc_sang`, `gio_bat_dau_chieu`, `gio_ket_thuc_chieu`; khoảng không tồn tại ghi `null` tường minh (không bỏ khóa), ngày nghỉ ghi `hoat_dong: false` và bốn giờ `null`. Khi áp dụng tại `hieu_luc_tu`, dòng của thứ đó được thay cả dòng, không trộn với giờ cũ. Dạng cũ `gio_mo_cua`/`gio_dong_cua` không dùng cho yêu cầu mới; yêu cầu cũ đã xử lý (TuChoi hoặc đã áp dụng) giữ nguyên dạng cũ làm lịch sử, nên màn xem lịch sử phải đọc được cả hai dạng. Mỗi phần tử được kiểm tra ở service bằng đúng ràng buộc của bảng (quy tắc 25); DB không kiểm tra cấu trúc JSON này. Giờ mở/đóng tổng quát để hiển thị suy ra từ các khoảng (truy vấn mẫu cuối `clinix_mysql.sql`), không lưu riêng | Service |
| 44 | `CaToi`: enum `ca_lam_viec_enum` còn giá trị này (dùng ở `lich_lam_viec.ca`, `yeu_cau_nghi_phep.ca`, `muc_cho_danh_sach_cho.ca_mong_muon`) nhưng lịch hoạt động chi nhánh không có khoảng tối, 2.4 và giao diện cũng không có ca tối, nên service KHÔNG phân công, nhận xin nghỉ hay nhận đăng ký chờ cho `CaToi`. Chưa bỏ `CaToi` khỏi enum vì chưa kiểm tra dữ liệu thật; cách đồng bộ enum: mục 8 bước 7 [cần điền: nhóm quyết giữ hay bỏ] | Service |
| 45 | Thu tiền mặt tại quầy (use case "Thanh toán offline tại quầy"): (a) `nguoi_thu_id` = tài khoản Lễ tân của PHIÊN ĐĂNG NHẬP, không nhận từ giao diện hay thân yêu cầu API; (b) Lễ tân đang hoạt động và `le_tan.chi_nhanh_id` = `lich_hen.chi_nhanh_id` của lịch hẹn tại thời điểm thu (truy vấn mẫu bước 1; DB không chặn, test GAP); (c) chỉ lịch hẹn `DaXacNhan`; (d) `so_tien` = số còn phải thu = `gia_snapshot` của lịch hẹn − tổng `so_tien` các giao dịch `ThanhToanLichHen` đã `ThanhCong` của LỊCH GỐC trong chuỗi đổi lịch (truy vấn mẫu bước 3); chỉ ghi khi thu đủ đúng số đó, không ghi khoản thu thiếu hay thừa (DB chỉ bắt `so_tien` > 0, không biết số phải thu: test GAP); dòng ghi `lich_hen_id` = lịch gốc | Service |
| 46 | Thu tiền mặt tại quầy chạy trong MỘT database transaction: khóa dòng `lich_hen` bằng `SELECT ... FOR UPDATE` TRƯỚC khi đọc tổng đã trả (bước 2); tính số còn phải thu (bước 3); ghi giao dịch tiền mặt bằng `INSERT ... SELECT` có điều kiện (bước 4, 0 dòng thì ROLLBACK); chạy lại bước 3 để thấy tổng đã trả >= giá; `UPDATE` lịch hẹn `DaXacNhan` → `DaTiepDon` phải ảnh hưởng đúng 1 dòng (bước 5); lỗi ở bất kỳ bước nào thì ROLLBACK cả hai. Chống ghi trùng khi hai thao tác thu đồng thời hoặc gửi lại cùng yêu cầu: lượt đến sau chờ khóa dòng rồi thấy lịch đã `DaTiepDon` hoặc không còn số phải thu nên không ghi dòng nào. KHÔNG đặt UNIQUE theo `lich_hen_id` (một lịch có khoản cọc và khoản thu còn lại) và không dùng `ma_giao_dich_cong` làm khóa chống trùng (phải để trống với tiền mặt). DB không tự chống trùng tiền mặt; [đề xuất, chưa chốt] nếu nhóm chốt "mỗi lịch gốc tối đa MỘT khoản tiền mặt" thì có thể thêm cột sinh STORED + UNIQUE chỉ cho `TienMatTaiQuay` | Service |
| 47 | Lịch đã thanh toán đủ trước khi đến quầy (số còn phải thu <= 0): tiếp đón theo luồng "Cập nhật trạng thái lịch hẹn" hiện có, KHÔNG tạo giao dịch tiền mặt bằng 0. Lịch còn phải thu mà Lễ tân chuyển thẳng `DaTiepDon` thì bị từ chối (luồng thay thế A2 của use case Cập nhật trạng thái lịch hẹn). Quản trị viên override trạng thái (2.4) không đi qua quy tắc này [đề xuất, theo 2.4 hiện hành] | Service |

## 3. Chuyển đổi từ DB tạo bằng bản trước (17/10/2026 đợt 1)

Hiện repo chưa có `apps/api` hay migration và chưa có DB dùng thật, nên **chỉ cần tạo lại từ `clinix_mysql.sql`**. Nếu đã có DB tạo từ bản cũ và có dữ liệu cần giữ, đi theo thứ tự dưới đây (chạy từng bước, kiểm tra trước khi sang bước sau; không xoá dữ liệu):

1. **Xem trước các tài khoản bị ảnh hưởng** (nhân sự tạo theo luồng mật khẩu tạm, chưa từng đổi mật khẩu):
   `SELECT tai_khoan_id, email, loai_tai_khoan, trang_thai FROM tai_khoan WHERE bat_buoc_doi_mat_khau = true;`
2. **Mở rộng cột** (an toàn với dữ liệu cũ):
   ```sql
   ALTER TABLE tai_khoan MODIFY mat_khau_bam varchar(255) NULL;
   ALTER TABLE tai_khoan MODIFY trang_thai ENUM('ChoKichHoat','DangHoatDong','NgungHoatDong') NOT NULL DEFAULT 'DangHoatDong';
   ALTER TABLE ma_xac_thuc ADD COLUMN da_gui_luc datetime NULL, ADD COLUMN thu_hoi_luc datetime NULL,
     ADD COLUMN kich_hoat_dang_hieu_luc bigint GENERATED ALWAYS AS (IF(loai = 'KichHoatNhanSu' AND da_gui_luc IS NOT NULL AND thu_hoi_luc IS NULL AND da_dung_luc IS NULL, tai_khoan_id, NULL)) STORED UNIQUE;
   ```
3. **Chuyển nhân sự còn mật khẩu tạm** (hàng ở bước 1): mật khẩu tạm đã bị loại bỏ nên các tài khoản này phải quay về Chờ kích hoạt; tài khoản đã đổi mật khẩu (`bat_buoc_doi_mat_khau = false`) giữ nguyên Đang hoạt động.
   ```sql
   UPDATE tai_khoan SET trang_thai = 'ChoKichHoat', mat_khau_bam = NULL
   WHERE bat_buoc_doi_mat_khau = true AND loai_tai_khoan <> 'BenhNhan';
   ```
   Câu lệnh áp dụng cả nhân sự đang `NgungHoatDong` còn mật khẩu tạm (để mật khẩu tạm không còn hiệu lực khi mở khoá); những tài khoản này mất trạng thái khoá, nhóm cân nhắc khoá lại bằng tay sau khi kích hoạt. Sau đó Quản trị viên dùng "Gửi lại liên kết kích hoạt" cho từng tài khoản. Nếu cần giữ mật khẩu tạm đã hỏng làm bằng chứng, sao chép sang bảng lưu trước khi chạy.
4. **Kiểm tra dữ liệu trước khi bật CHECK**: không còn `DangHoatDong` với `mat_khau_bam IS NULL`, không còn `BenhNhan` ở `ChoKichHoat`; rồi thêm bốn CHECK trong `clinix_mysql.sql` (`chk_tai_khoan_mat_khau`, `chk_tai_khoan_cho_kich_hoat_nhan_su`, `chk_ma_xac_thuc_dung_hoac_thu_hoi`, `chk_ma_xac_thuc_kich_hoat_da_gui`).
5. **Tạo chỉ mục** `lich_hen_index_chi_nhanh_benh_nhan`; **cuối cùng** mới `ALTER TABLE tai_khoan DROP COLUMN bat_buoc_doi_mat_khau;` (sau khi bước 3 xong và không còn code đọc cột này).
6. Tài khoản **Bệnh nhân** hiện có không bị ảnh hưởng: đều có `mat_khau_bam` NOT NULL, `trang_thai` DangHoatDong/NgungHoatDong, đã thoả cả hai CHECK; cột `bat_buoc_doi_mat_khau` của họ luôn false.

## 4. Chuyển đổi sang lịch hoạt động theo từng thứ của chi nhánh (18/10/2026)

> Cập nhật 19/10/2026: cấu trúc giờ của bảng `chi_nhanh_lich_hoat_dong` đã đổi từ một cặp mở–đóng sang hai khoảng nhận khám. Mục này giữ nguyên để chuyển DB bản 17/10/2026 sang bản 18/10/2026; sau khi làm xong mục này, DB còn phải làm tiếp mục 8 để có cấu trúc hiện hành.

Repo hiện chưa có `apps/api`, migration hay DB dùng thật, nên **chỉ cần tạo lại từ `clinix_mysql.sql`**. Nếu đã có DB từ bản 17/10/2026 (đã làm xong mục 3) và có dữ liệu cần giữ, đi theo thứ tự dưới đây, từng bước, kiểm tra xong mới sang bước sau. **Không có bước nào tự suy ra chi nhánh nào nghỉ ngày nào**: bản cũ chỉ lưu một cặp giờ mở/đóng chung cho mọi ngày, nên ngày nghỉ của từng chi nhánh là **[cần điền]**, do nhóm/chủ phòng khám xác nhận trước ở bước 3. Chỉ có dữ liệu mẫu giao diện (Figma Make) ghi "Thứ 2–6: 7:30–17:00, Thứ 7: 7:30–12:00, Chủ nhật: Nghỉ" cho cả phòng khám; đó là văn bản minh họa chung, không phải dữ liệu từng chi nhánh, nên **không dùng để tự điền**.

**Bước 1 — Tạo đối tượng mới** (không đổi dữ liệu cũ): chạy NGUYÊN VĂN từ `clinix_mysql.sql` các câu lệnh `CREATE TABLE` của 3 bảng `yeu_cau_thay_doi_chi_nhanh`, `yeu_cau_thay_doi_chi_nhanh_lich_hen`, `email_thong_bao`, và tạo `chi_nhanh_lich_hoat_dong` theo cấu trúc ngày 18/10/2026 (MỘT khoảng mở–đóng mỗi ngày; cấu trúc hiện hành là mục 8) bằng khối `buoc1b` ngay dưới (chạy trước các chỉ mục và khóa ngoại); 5 chỉ mục `thong_bao_index_yeu_cau_chi_nhanh`, `email_thong_bao_index_trang_thai`, `yeu_cau_thay_doi_chi_nhanh_index_chi_nhanh`, `yeu_cau_thay_doi_chi_nhanh_index_hieu_luc`, `yeu_cau_thay_doi_chi_nhanh_lich_hen_index_lich_hen`; các `ADD FOREIGN KEY` và các `ADD CONSTRAINT ... CHECK` từ file (`chk_lich_hoat_dong_thu`, `chk_yc_chi_nhanh_noi_dung`, `chk_yc_chi_nhanh_xu_ly`, `chk_email_thong_bao_ket_qua`; `chk_lich_hoat_dong_gio` của bản 18/10 nằm trong khối `buoc1b`) của các bảng đó. Riêng bảng đã có `thong_bao` thì thêm cột TRƯỚC khi tạo chỉ mục và khóa ngoại (câu lệnh `COMMENT` của cột/bảng là tùy chọn, chạy lại các dòng `COMMENT` trong file SQL nếu muốn khớp lời giải thích):

```sql buoc1
ALTER TABLE thong_bao ADD COLUMN yeu_cau_thay_doi_chi_nhanh_id bigint NULL AFTER trang_thai_doc;
```

```sql buoc1b
CREATE TABLE chi_nhanh_lich_hoat_dong (
  chi_nhanh_id bigint,
  thu_trong_tuan tinyint,
  hoat_dong boolean NOT NULL,
  gio_mo_cua time,
  gio_dong_cua time,
  PRIMARY KEY (chi_nhanh_id, thu_trong_tuan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE chi_nhanh_lich_hoat_dong ADD CONSTRAINT chk_lich_hoat_dong_gio CHECK (
    (hoat_dong = 1 AND gio_mo_cua IS NOT NULL AND gio_dong_cua IS NOT NULL AND gio_mo_cua < gio_dong_cua)
 OR (hoat_dong = 0 AND gio_mo_cua IS NULL AND gio_dong_cua IS NULL)
);
```

**Bước 2 — Xem hiện trạng**: danh sách chi nhánh kèm giờ chung cũ, để nhóm xác nhận ngày hoạt động của từng chi nhánh:

```sql buoc2
SELECT chi_nhanh_id, ten, gio_mo_cua, gio_dong_cua FROM chi_nhanh ORDER BY chi_nhanh_id;
```

**Bước 3 — Nhập lịch hoạt động** (đủ 7 dòng cho MỖI chi nhánh). Không chạy khi chưa có xác nhận. Nếu nhóm xác nhận chi nhánh `:cn` hoạt động đúng các thứ `:cac_thu_hoat_dong` (ví dụ `1,2,3,4,5,6`, **[cần điền cho từng chi nhánh]**) và vẫn dùng giờ chung cũ cho các ngày đó, dùng câu lệnh dưới (các thứ còn lại tự thành ngày nghỉ, không có giờ). Nếu giờ khác nhau theo thứ, tự viết 7 dòng `INSERT` với giờ đã xác nhận.

```sql buoc3
INSERT INTO chi_nhanh_lich_hoat_dong (chi_nhanh_id, thu_trong_tuan, hoat_dong, gio_mo_cua, gio_dong_cua)
SELECT c.chi_nhanh_id, d.thu, d.thu IN (:cac_thu_hoat_dong),
       IF(d.thu IN (:cac_thu_hoat_dong), c.gio_mo_cua, NULL), IF(d.thu IN (:cac_thu_hoat_dong), c.gio_dong_cua, NULL)
FROM chi_nhanh c
JOIN (SELECT 1 AS thu UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7) d
WHERE c.chi_nhanh_id = :cn;
```

**Bước 4 — Kiểm tra trước khi bỏ cột cũ.** 4a phải trả về 0 dòng (mọi chi nhánh đủ 7 dòng). 4b liệt kê dữ liệu tương lai đang vi phạm lịch mới (lịch làm việc vào ngày nghỉ, khung giờ ngoài giờ, lịch hẹn Chờ thanh toán/Đã xác nhận bị ảnh hưởng; `:thoi_luong_phut` là thời lượng khung giờ); mỗi dòng phải được xử lý trước khi bật nhận đặt lịch theo lịch mới, cách xử lý [cần điền]:

```sql buoc4a
SELECT c.chi_nhanh_id, c.ten FROM chi_nhanh c
WHERE (SELECT COUNT(*) FROM chi_nhanh_lich_hoat_dong l WHERE l.chi_nhanh_id = c.chi_nhanh_id) <> 7;
```

```sql buoc4b1
SELECT v.lich_lam_viec_id, v.chi_nhanh_id, v.ngay FROM lich_lam_viec v
LEFT JOIN chi_nhanh_lich_hoat_dong l ON l.chi_nhanh_id = v.chi_nhanh_id AND l.thu_trong_tuan = WEEKDAY(v.ngay) + 1
WHERE v.ngay >= CURDATE() AND (l.chi_nhanh_id IS NULL OR l.hoat_dong = 0);
```

```sql buoc4b2
SELECT kg.khung_gio_id, v.chi_nhanh_id, kg.ngay_gio FROM khung_gio kg
JOIN lich_lam_viec v ON v.lich_lam_viec_id = kg.lich_lam_viec_id
JOIN chi_nhanh_lich_hoat_dong l ON l.chi_nhanh_id = v.chi_nhanh_id AND l.thu_trong_tuan = WEEKDAY(kg.ngay_gio) + 1 AND l.hoat_dong = 1
WHERE kg.ngay_gio >= NOW() AND (TIME(kg.ngay_gio) < l.gio_mo_cua OR ADDTIME(TIME(kg.ngay_gio), SEC_TO_TIME(:thoi_luong_phut * 60)) > l.gio_dong_cua);
```

```sql buoc4b3
SELECT lh.lich_hen_id, lh.chi_nhanh_id, lh.thoi_gian FROM lich_hen lh
JOIN dich_vu_kham d ON d.dich_vu_kham_id = lh.dich_vu_kham_id
LEFT JOIN chi_nhanh_lich_hoat_dong l ON l.chi_nhanh_id = lh.chi_nhanh_id AND l.thu_trong_tuan = WEEKDAY(lh.thoi_gian) + 1
WHERE lh.trang_thai IN ('ChoThanhToan', 'DaXacNhan') AND lh.thoi_gian >= NOW()
  AND (l.chi_nhanh_id IS NULL OR l.hoat_dong = 0 OR TIME(lh.thoi_gian) < l.gio_mo_cua
       OR ADDTIME(TIME(lh.thoi_gian), SEC_TO_TIME(d.thoi_luong * 60)) > l.gio_dong_cua);
```

**Bước 5 — Bỏ cột giờ chung cũ** (CUỐI CÙNG, chỉ khi 4a trả về 0 dòng và không còn mã nào đọc `chi_nhanh.gio_mo_cua`/`gio_dong_cua`; đây là bước không hoàn tác được, sao lưu trước):

```sql buoc5
ALTER TABLE chi_nhanh DROP COLUMN gio_mo_cua, DROP COLUMN gio_dong_cua;
```

`thong_bao` hiện có không bị ảnh hưởng (cột mới để trống, chỉ mục UNIQUE bỏ qua NULL); `cau_hinh_he_thong.so_ngay_bao_truoc_doi_gio_lam` đã có từ trước, giá trị vẫn là [cần điền].

## 5. Chuyển đổi và khởi tạo cấu hình hệ thống (18/10/2026, đợt 2)

Thay đổi: bỏ ba cột `thoi_luong_khung_gio_mac_dinh`, `so_ngay_dat_truoc_toi_da`, `bac_si_uu_tien_id` (kèm khóa ngoại) khỏi `cau_hinh_he_thong`; đổi tên `so_lich_hen_toi_da_moi_tk` thành `so_lich_hen_toi_da_moi_ho_so` (đổi NGHĨA: từ mỗi tài khoản sang mỗi hồ sơ đi khám); thêm bảng `nhac_lich_hen`; thêm giá trị `CapNhatCauHinh` / `cau_hinh_he_thong` cho `nhat_ky_hanh_dong` kèm CHECK; thay khóa ngoại đơn `lich_hen.ho_so_nguoi_than_id` bằng khóa ngoại kép `(ho_so_nguoi_than_id, benh_nhan_id)`; thêm hai CHECK cho `cau_hinh_he_thong`.

### 5.1. Chuyển đổi DB đang ở bản đợt 1 ngày 18/10/2026

Repo chưa có `apps/api`, migration hay DB dùng thật, nên **chỉ cần tạo lại từ `clinix_mysql.sql`**. Nếu đã có DB đợt 1 (đã làm xong mục 3 và 4) và có dữ liệu cần giữ, đi theo thứ tự dưới đây, từng bước, kiểm tra xong mới sang bước sau. Bước 1 đến 6 không xóa dữ liệu; **bước 7 bỏ cột là bước KHÔNG hoàn tác**, sao lưu (`mysqldump`) trước. Các câu `CREATE`/`ADD CONSTRAINT` ở bước 3, 5, 6 chạy NGUYÊN VĂN từ `clinix_mysql.sql` (câu `COMMENT` của cột/bảng là tùy chọn, chạy lại các dòng `COMMENT` trong file SQL nếu muốn khớp lời giải thích).

**Bước 1 — Ghi lại giá trị cũ** trước khi bỏ cột (lưu kết quả vào biên bản). Ba cột bị bỏ không còn tham số tương ứng nên không chuyển giá trị đi đâu. Giá trị `so_lich_hen_toi_da_moi_tk` hiện có được giữ lại khi đổi tên nhưng nghĩa đã đổi, nên **phải được nhóm xác nhận lại [cần điền]**:

```sql cfg1
SELECT id, thoi_luong_khung_gio_mac_dinh, so_ngay_dat_truoc_toi_da, so_lich_hen_toi_da_moi_tk, bac_si_uu_tien_id FROM cau_hinh_he_thong;
```

**Bước 2 — Kiểm tra điều kiện của khóa ngoại kép.** Phải trả về 0 dòng (không có lịch hẹn gắn với hồ sơ người thân của bệnh nhân khác); nếu có, sửa dữ liệu (do nhóm quyết) rồi mới sang bước 4:

```sql cfg2
SELECT lh.lich_hen_id, lh.benh_nhan_id, lh.ho_so_nguoi_than_id FROM lich_hen lh
JOIN ho_so_nguoi_than h ON h.ho_so_nguoi_than_id = lh.ho_so_nguoi_than_id
WHERE h.benh_nhan_id <> lh.benh_nhan_id;
```

**Bước 3 — Tạo đối tượng mới** (chỉ thêm): `CREATE TABLE nhac_lich_hen`; các chỉ mục `ho_so_nguoi_than_index_chu_so_huu`, `lich_hen_index_ho_so_benh_nhan_trang_thai`, `nhac_lich_hen_index_trang_thai`; khóa ngoại của `nhac_lich_hen`; CHECK `chk_nhac_lich_hen_moc`, `chk_nhac_lich_hen_ket_qua`.

**Bước 4 — Thay khóa ngoại của `lich_hen`.** Tên khóa ngoại cũ do MySQL tự đặt nên tra trước (4a), rồi thay trong MỘT câu lệnh (4b), thay `:ten_fk_ho_so` bằng tên tra được:

```sql cfg4a
SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lich_hen' AND COLUMN_NAME = 'ho_so_nguoi_than_id' AND REFERENCED_TABLE_NAME = 'ho_so_nguoi_than';
```

```sql cfg4b
ALTER TABLE lich_hen DROP FOREIGN KEY `:ten_fk_ho_so`,
  ADD CONSTRAINT `fk_lich_hen_ho_so_chu_so_huu` FOREIGN KEY (`ho_so_nguoi_than_id`, `benh_nhan_id`) REFERENCES `ho_so_nguoi_than` (`ho_so_nguoi_than_id`, `benh_nhan_id`);
```

**Bước 5 — Nhật ký hành động**: thêm giá trị vào hai enum (thêm CUỐI danh sách nên không đổi giá trị đã lưu) rồi thêm CHECK `chk_nhat_ky_cap_nhat_cau_hinh` (nguyên văn từ `clinix_mysql.sql`; dữ liệu cũ không có `CapNhatCauHinh` nên không thể vi phạm):

```sql cfg5
ALTER TABLE nhat_ky_hanh_dong
  MODIFY `hanh_dong` ENUM ('DoiQuyen', 'OverrideLichHen', 'HoanTienDacBiet', 'DoiChiNhanhBacSi', 'ChinhNoShow', 'AnDanhGia', 'XuLyDoiLichNgoaiChinhSach', 'SuaGhiChuKham', 'BacSiHuyDotXuat', 'CapNhatCauHinh') NOT NULL,
  MODIFY `loai_doi_tuong` ENUM ('tai_khoan', 'benh_nhan', 'lich_hen', 'ho_so_kham', 'danh_gia_bac_si', 'giao_dich_thanh_toan', 'yeu_cau_doi_lich_ngoai_chinh_sach', 'cau_hinh_he_thong') NOT NULL COMMENT 'Bảng bị tác động';
```

**Bước 6 — Cấu hình**: đổi tên cột rồi thêm hai CHECK `chk_cau_hinh_gia_tri`, `chk_cau_hinh_nhac_lich` (nguyên văn từ `clinix_mysql.sql`). Nếu dòng cấu hình hiện có vi phạm, MySQL báo lỗi 3819 và không đổi gì: sửa giá trị (do nhóm quyết) rồi chạy lại:

```sql cfg6
ALTER TABLE cau_hinh_he_thong RENAME COLUMN so_lich_hen_toi_da_moi_tk TO so_lich_hen_toi_da_moi_ho_so;
```

Sau bước 6, liệt kê hồ sơ đi khám đang vượt giới hạn mới bằng truy vấn mẫu "hồ sơ đi khám đang vượt giới hạn" cuối `clinix_mysql.sql` (lịch hẹn đã đặt giữ nguyên, giới hạn chỉ chặn lần đặt mới).

**Bước 7 — Bỏ cột và khóa ngoại cũ (CUỐI CÙNG, không hoàn tác)**, chỉ khi không còn mã nào đọc ba cột này. Tra tên khóa ngoại (7a), thay `:ten_fk_uu_tien` rồi chạy 7b:

```sql cfg7a
SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cau_hinh_he_thong' AND COLUMN_NAME = 'bac_si_uu_tien_id' AND REFERENCED_TABLE_NAME IS NOT NULL;
```

```sql cfg7b
ALTER TABLE cau_hinh_he_thong DROP FOREIGN KEY `:ten_fk_uu_tien`;
ALTER TABLE cau_hinh_he_thong DROP COLUMN bac_si_uu_tien_id, DROP COLUMN so_ngay_dat_truoc_toi_da, DROP COLUMN thoi_luong_khung_gio_mac_dinh;
```

Dừng giữa chừng trước bước 7 vẫn an toàn: các bước 1 đến 6 chỉ thêm hoặc đổi tên (mã đang đọc `so_lich_hen_toi_da_moi_tk` phải đổi sang tên mới).

### 5.2. Khởi tạo dòng cấu hình (DB mới, hoặc DB chưa có dòng)

`clinix_mysql.sql` **không** chèn dòng cấu hình. Lý do: bảy cột có giá trị phải do nhóm quyết còn `[cần điền]`; nếu file schema tự chèn số liệu thì số đó sẽ trở thành quyết định ngầm. Do đó cột `NOT NULL` chưa chốt không có `DEFAULT` (thiếu giá trị thì `INSERT` báo lỗi 1364) và dịch vụ từ chối chức năng cần cấu hình khi chưa có dòng (quy tắc service 35).

Cách khởi tạo an toàn [đề xuất]:

1. Nhóm điền bảng quyết định dưới đây; cột nào còn `[cần điền]` thì CHƯA chạy mẫu `INSERT`.

| Cột | Trạng thái | Ghi chú |
|---|---|---|
| `so_lich_hen_toi_da_moi_ho_so` | [cần điền] | đặc tả đang ghi 3 [đề xuất], chưa chốt; nghĩa mới: mỗi hồ sơ đi khám |
| `so_lan_tu_doi_lich_toi_da` | [cần điền] | 2.4 đang ghi 2, chưa có xác nhận là giá trị chính thức |
| `check_in_truoc_phut`, `check_in_sau_phut` | [cần điền] | phút; nghĩa ở quy tắc service 40 |
| `so_ngay_bao_truoc_doi_gio_lam` | [cần điền] | ngày |
| `trong_so_w1`, `trong_so_w2` | [cần điền] | `Phan_Loai` ghi đề xuất 0,6 và 0,4, chưa chốt |
| `thoi_gian_giu_cho`, `thoi_han_phan_hoi_loi_moi`, `so_muc_cho_toi_da`, `nguong_no_show`, `thoi_diem_nhac_lich` | [đề xuất] đã có DEFAULT trong schema | bỏ qua cột trong `INSERT` = nhận đúng giá trị [đề xuất] đó; muốn khác thì thêm cột vào danh sách |

2. Khi đủ giá trị, thay các `:tham_so` trong mẫu rồi chạy MỘT lần (dùng `INSERT` thường, không `ON DUPLICATE`: chạy lần hai báo trùng khóa 1062 chứ không ghi đè):

```sql cfg_seed
INSERT INTO cau_hinh_he_thong
  (id, so_lich_hen_toi_da_moi_ho_so, so_lan_tu_doi_lich_toi_da, check_in_truoc_phut, check_in_sau_phut, so_ngay_bao_truoc_doi_gio_lam, trong_so_w1, trong_so_w2)
VALUES
  (1, :so_lich_hen_toi_da_moi_ho_so, :so_lan_tu_doi_lich_toi_da, :check_in_truoc_phut, :check_in_sau_phut, :so_ngay_bao_truoc_doi_gio_lam, :trong_so_w1, :trong_so_w2);
```

3. Kiểm tra, phải trả về 1:

```sql cfg_kiem_tra
SELECT COUNT(*) FROM cau_hinh_he_thong WHERE id = 1;
```

4. Từ đó mọi thay đổi đi qua 2.4.42 (kèm nhật ký, quy tắc service 36), không sửa tay bằng SQL.
5. Các giá trị trong bộ test (`tools/csdl_tests_2026-10-17/`) là **dữ liệu thử** để chạy kiểm tra, không phải quyết định; không sao chép sang dữ liệu thật.
6. [đề xuất] tài khoản ứng dụng không có quyền `DELETE` trên `cau_hinh_he_thong` (xóa dòng duy nhất làm hệ thống tự từ chối mọi chức năng cần cấu hình). Chưa dùng trigger vì không cần thiết ở quy mô hiện tại.

## 6. Chuyển đổi phụ phí bác sĩ sang mã chức danh 7 mức (19/10/2026)

Thay đổi: thêm cột `bac_si.chuc_danh` (7 mức) bên cạnh `bac_si.hoc_vi` (5 mức, giữ cho điểm xếp hạng AI); `phu_phi_bac_si` đổi cột `hoc_vi` thành `chuc_danh`, thêm `ap_dung`; thêm CHECK `chk_bac_si_kinh_nghiem`, `chk_bac_si_chuc_danh_hoc_vi`, `chk_phu_phi_bac_si_gia_tri`; khóa duy nhất của bảng phụ phí đổi thành `(chuc_danh, so_nam_kinh_nghiem_tu)`. Repo chưa có `apps/api`, migration hay DB dùng thật nên **chỉ cần tạo lại từ `clinix_mysql.sql`**. Nếu đã có DB ở bản 18/10/2026 (đã làm xong mục 5) và có dữ liệu cần giữ, đi theo thứ tự dưới đây, từng bước, kiểm tra xong mới sang bước sau. **Bước 4 bỏ cột `hoc_vi` của `phu_phi_bac_si` không hoàn tác**: sao lưu (`mysqldump`) trước.

**Ánh xạ khi chuyển đổi (một chiều, không suy đoán):** học vị cũ → chức danh: BS → `BS`, ThS → `ThS_BS`, TS → `TS_BS`, PGS → `PGS_TS_BS`, GS → `GS_TS_BS`. Học vị cũ KHÔNG cho biết bác sĩ có chuyên khoa I/II hay không nên **không có bác sĩ nào tự thành `BS_CKI`/`BS_CKII`**; những bác sĩ này do Quản trị viên sửa chức danh bằng tay sau chuyển đổi [cần điền: danh sách]. Mỗi quy tắc phụ phí cũ được gán cho chức danh tương ứng (cùng ánh xạ) và giữ nguyên giá, mốc năm; vì ánh xạ này đơn ánh nên khóa duy nhất mới không thể bị vi phạm. Quy tắc cũ đều nhận `ap_dung` = true (đang có hiệu lực thì vẫn có hiệu lực) [đề xuất]. Khi bác sĩ CKI/CKII được đổi chức danh sang `BS_CKI`/`BS_CKII`, phụ phí của họ tính theo quy tắc của chức danh mới (chưa có quy tắc thì bằng 0) cho các lịch ĐẶT MỚI; lịch đã đặt giữ nguyên `gia_snapshot`.

**Bước 1 — Xem hiện trạng** (lưu kết quả vào biên bản):

```sql pp1
SELECT hoc_vi, COUNT(*) AS so_bac_si FROM bac_si GROUP BY hoc_vi;
SELECT phu_phi_bac_si_id, hoc_vi, so_nam_kinh_nghiem_tu, phu_phi FROM phu_phi_bac_si ORDER BY hoc_vi, so_nam_kinh_nghiem_tu;
```

**Bước 2 — Thêm `chuc_danh` cho bác sĩ** (thêm cột cho phép NULL, điền theo ánh xạ, rồi mới đặt NOT NULL; cột `hoc_vi` giữ nguyên):

```sql pp2
ALTER TABLE bac_si ADD COLUMN chuc_danh ENUM ('BS', 'BS_CKI', 'BS_CKII', 'ThS_BS', 'TS_BS', 'PGS_TS_BS', 'GS_TS_BS') NULL AFTER hoc_vi;
UPDATE bac_si SET chuc_danh = CASE hoc_vi WHEN 'BS' THEN 'BS' WHEN 'ThS' THEN 'ThS_BS' WHEN 'TS' THEN 'TS_BS' WHEN 'PGS' THEN 'PGS_TS_BS' WHEN 'GS' THEN 'GS_TS_BS' END;
ALTER TABLE bac_si MODIFY chuc_danh ENUM ('BS', 'BS_CKI', 'BS_CKII', 'ThS_BS', 'TS_BS', 'PGS_TS_BS', 'GS_TS_BS') NOT NULL;
```

**Bước 3 — Thêm `chuc_danh` và `ap_dung` cho bảng phụ phí, đổi khóa duy nhất** (cột `hoc_vi` của bảng phụ phí chưa bỏ):

```sql pp3
ALTER TABLE phu_phi_bac_si ADD COLUMN chuc_danh ENUM ('BS', 'BS_CKI', 'BS_CKII', 'ThS_BS', 'TS_BS', 'PGS_TS_BS', 'GS_TS_BS') NULL AFTER phu_phi_bac_si_id, ADD COLUMN ap_dung boolean NOT NULL DEFAULT true;
UPDATE phu_phi_bac_si SET chuc_danh = CASE hoc_vi WHEN 'BS' THEN 'BS' WHEN 'ThS' THEN 'ThS_BS' WHEN 'TS' THEN 'TS_BS' WHEN 'PGS' THEN 'PGS_TS_BS' WHEN 'GS' THEN 'GS_TS_BS' END;
ALTER TABLE phu_phi_bac_si MODIFY chuc_danh ENUM ('BS', 'BS_CKI', 'BS_CKII', 'ThS_BS', 'TS_BS', 'PGS_TS_BS', 'GS_TS_BS') NOT NULL;
ALTER TABLE phu_phi_bac_si DROP INDEX phu_phi_bac_si_index_2;
CREATE UNIQUE INDEX phu_phi_bac_si_index_2 ON phu_phi_bac_si (chuc_danh, so_nam_kinh_nghiem_tu);
```

**Bước 4 — Thêm 3 CHECK** (nguyên văn từ `clinix_mysql.sql`: `chk_bac_si_kinh_nghiem`, `chk_bac_si_chuc_danh_hoc_vi`, `chk_phu_phi_bac_si_gia_tri`). Nếu dữ liệu hiện có vi phạm (vd. số năm âm, giá âm), MySQL báo lỗi 3819 và không đổi gì: sửa dữ liệu (do nhóm quyết) rồi chạy lại. Sau đó kiểm tra phép tính phụ phí không đổi so với bước 1 bằng truy vấn mẫu "phụ phí hiện hành" cuối `clinix_mysql.sql`.

**Bước 5 — Bỏ cột cũ (CUỐI CÙNG, không hoàn tác)**, chỉ khi không còn mã nào đọc `phu_phi_bac_si.hoc_vi`:

```sql pp5
ALTER TABLE phu_phi_bac_si DROP COLUMN hoc_vi;
```

`bac_si.hoc_vi` KHÔNG bị bỏ (công thức xếp hạng AI vẫn đọc cột này). Không bước nào tạo, sửa hay xóa giá phụ phí: mọi `phu_phi` giữ nguyên giá trị đã nhập.

## 7. Đồng bộ Audit Log cho nạp ví chưa cộng (19/10/2026)

UC 2.4.53 cho phép Quản trị viên xử lý thủ công giao dịch nạp ví đã xác minh Thành công nhưng chưa cộng vào ví; UC 2.4.70 yêu cầu ghi hành động nhạy cảm này. Bổ sung `XuLyNapViChuaCong` ở **cuối** enum `nhat_ky_hanh_dong.hanh_dong` để giữ thứ tự các giá trị đã lưu. `loai_doi_tuong` đã có `giao_dich_thanh_toan`, không thêm bảng hay enum mới. DB mới tạo từ `clinix_mysql.sql` đã có giá trị này. DB đang ở bản hoàn tất mục 6 và có dữ liệu cần giữ thì sao lưu trước, chạy đúng lệnh sau:

```sql audit_nap_vi
ALTER TABLE nhat_ky_hanh_dong
  MODIFY hanh_dong ENUM ('DoiQuyen', 'OverrideLichHen', 'HoanTienDacBiet', 'DoiChiNhanhBacSi', 'ChinhNoShow', 'AnDanhGia', 'XuLyDoiLichNgoaiChinhSach', 'SuaGhiChuKham', 'BacSiHuyDotXuat', 'CapNhatCauHinh', 'XuLyNapViChuaCong') NOT NULL;
```

Kiểm tra sau chuyển đổi: giá trị `DoiQuyen`/`CapNhatCauHinh` cũ còn nguyên; `XuLyNapViChuaCong` được chấp nhận với `loai_doi_tuong = giao_dich_thanh_toan` và mã đối tượng là khóa giao dịch nạp. Việc ghi nhật ký cùng giao dịch cộng ví là quy tắc tầng ứng dụng số 42; schema không tự ép (không dùng trigger).

## 8. Lịch hoạt động chi nhánh có hai khoảng nhận khám (19/10/2026)

Thay đổi: `chi_nhanh_lich_hoat_dong` bỏ cặp `gio_mo_cua`/`gio_dong_cua` (một khoảng mở–đóng mỗi ngày, không biểu diễn được giờ nghỉ trưa) và thay bằng tối đa hai khoảng nhận khám: `gio_bat_dau_sang`/`gio_ket_thuc_sang` (ca `CaSang`) và `gio_bat_dau_chieu`/`gio_ket_thuc_chieu` (ca `CaChieu`). Vẫn một dòng cho mỗi (chi nhánh, thứ). Giữ `hoat_dong` nhưng `chk_lich_hoat_dong_ngay` buộc nó khớp với các khoảng, nên không phải nguồn chỉnh sửa độc lập. Bỏ `chk_lich_hoat_dong_gio`, thêm `chk_lich_hoat_dong_khoang`, `chk_lich_hoat_dong_khong_chong`, `chk_lich_hoat_dong_ngay` (34 → 36 CHECK). Không thêm bảng hay enum. Giờ mở/đóng tổng quát để hiển thị KHÔNG còn lưu mà suy ra từ các khoảng (truy vấn mẫu cuối `clinix_mysql.sql`).

**Giờ trong tài liệu và giao diện minh họa chưa phải quyết định.** Các giờ Thứ 2–Thứ 6 07:30–11:30 và 13:30–17:00, Thứ 7 07:30–12:00, Chủ nhật nghỉ chỉ là **[đề xuất]** suy ra từ giao diện minh họa (Figma Make), chưa phải lịch chính thức của bất kỳ chi nhánh nào và không được tự áp cho mọi chi nhánh. Giao diện minh họa còn ghi cứng ca sáng 08:00–11:30 và ca chiều 13:30–17:00 trong khi lịch chi nhánh minh họa bắt đầu 07:30, tức là hai nơi chưa khớp. **[cần điền]** 07:30 là giờ bắt đầu NHẬN KHÁM hay chỉ là giờ mở cửa tiếp đón? Cột lưu ở đây là giờ nhận khám (khung giờ đặt khám phải nằm trọn trong một khoảng); nếu 07:30 chỉ là giờ tiếp đón thì khoảng nhận khám bắt đầu muộn hơn (ví dụ 08:00 như ca sáng trong giao diện), và giờ mở cửa tiếp đón hiện chưa có chỗ lưu.

Repo hiện chưa có `apps/api`, migration hay DB dùng thật, nên **chỉ cần tạo lại từ `clinix_mysql.sql`**. Nếu đã có DB ở bản trước đợt này (đã làm xong mục 4 đến 7) và có dữ liệu cần giữ, đi theo thứ tự dưới đây, từng bước, kiểm tra xong mới sang bước sau. **Bước 6 bỏ cột là bước KHÔNG hoàn tác**, sao lưu (`mysqldump`) trước. Các câu `ADD CONSTRAINT` ở bước 5 chạy NGUYÊN VĂN từ `clinix_mysql.sql` (ba câu của `chi_nhanh_lich_hoat_dong`: `chk_lich_hoat_dong_khoang`, `chk_lich_hoat_dong_khong_chong`, `chk_lich_hoat_dong_ngay`); câu `COMMENT` của cột/bảng là tùy chọn, chạy lại các dòng `COMMENT` trong file SQL nếu muốn khớp lời giải thích.

**Bước 1 — Xem trước.** 1a phải trả về 0 dòng trước khi sang bước 3: yêu cầu thay đổi chi nhánh đang chờ (`ChoDuyet`) hoặc đã duyệt chưa áp dụng mà JSON còn dạng cũ `gio_mo_cua`/`gio_dong_cua`. Dạng cũ không được tự chuyển trong JSON; nhóm xử lý từng yêu cầu bằng luồng bình thường (từ chối rồi gửi lại theo dạng mới) hoặc, với yêu cầu đã duyệt chưa áp dụng, tự quyết [cần điền]. 1b đếm số bản ghi dùng `CaToi` (dùng cho bước 7):

```sql khk1a
SELECT yeu_cau_thay_doi_chi_nhanh_id, chi_nhanh_id, trang_thai FROM yeu_cau_thay_doi_chi_nhanh
WHERE (trang_thai = 'ChoDuyet' OR (trang_thai = 'DaDuyet' AND ap_dung_luc IS NULL))
  AND (JSON_CONTAINS_PATH(noi_dung_truoc, 'one', '$.lich_hoat_dong[*].gio_mo_cua', '$.lich_hoat_dong[*].gio_dong_cua')
    OR JSON_CONTAINS_PATH(noi_dung_sau, 'one', '$.lich_hoat_dong[*].gio_mo_cua', '$.lich_hoat_dong[*].gio_dong_cua'));
```

```sql khk1b
SELECT 'lich_lam_viec' AS bang, COUNT(*) AS so_dong FROM lich_lam_viec WHERE ca = 'CaToi'
UNION ALL SELECT 'yeu_cau_nghi_phep', COUNT(*) FROM yeu_cau_nghi_phep WHERE ca = 'CaToi'
UNION ALL SELECT 'muc_cho_danh_sach_cho', COUNT(*) FROM muc_cho_danh_sach_cho WHERE ca_mong_muon = 'CaToi';
```

**Bước 2 — Thêm bốn cột mới** (cho phép NULL, chưa đổi dữ liệu cũ):

```sql khk2
ALTER TABLE chi_nhanh_lich_hoat_dong
  ADD COLUMN gio_bat_dau_sang time NULL AFTER hoat_dong,
  ADD COLUMN gio_ket_thuc_sang time NULL AFTER gio_bat_dau_sang,
  ADD COLUMN gio_bat_dau_chieu time NULL AFTER gio_ket_thuc_sang,
  ADD COLUMN gio_ket_thuc_chieu time NULL AFTER gio_bat_dau_chieu;
```

**Bước 3 — Chuyển dữ liệu cũ.** Bản cũ chỉ có MỘT khoảng liên tục nên **không có thông tin giờ nghỉ trưa**; giờ nghỉ thật của từng chi nhánh là **[cần điền]** do nhóm/chủ phòng khám xác nhận. Để không mất và không bịa dữ liệu, bước này chỉ tách khoảng cũ tại mốc 12:00 **[đề xuất: mốc phân chia sáng/chiều]**, giữ nguyên tập thời điểm đã được nhận khám: khoảng cũ hoàn toàn trước 12:00 thành khoảng sáng, hoàn toàn từ 12:00 trở đi thành khoảng chiều, khoảng cắt ngang 12:00 thành sáng `[giờ mở, 12:00]` và chiều `[12:00, giờ đóng]` (hai khoảng chạm nhau, chưa có giờ nghỉ). Sau khi chuyển, khung giờ vắt ngang 12:00 không còn hợp lệ; nhóm nhập giờ nghỉ trưa thật bằng use case "Quản lý chi nhánh / cơ sở". Ngày nghỉ giữ cả bốn giờ NULL.

```sql khk3
UPDATE chi_nhanh_lich_hoat_dong SET
  gio_bat_dau_sang   = IF(hoat_dong = 1 AND gio_mo_cua < '12:00:00', gio_mo_cua, NULL),
  gio_ket_thuc_sang  = IF(hoat_dong = 1 AND gio_mo_cua < '12:00:00', LEAST(gio_dong_cua, '12:00:00'), NULL),
  gio_bat_dau_chieu  = IF(hoat_dong = 1 AND gio_dong_cua > '12:00:00', GREATEST(gio_mo_cua, '12:00:00'), NULL),
  gio_ket_thuc_chieu = IF(hoat_dong = 1 AND gio_dong_cua > '12:00:00', gio_dong_cua, NULL);
```

**Bước 4 — Kiểm tra không mất thông tin**, phải trả về 0 dòng: khoảng sáng/chiều mới phải che đúng giờ mở và giờ đóng cũ của mọi ngày hoạt động:

```sql khk4
SELECT chi_nhanh_id, thu_trong_tuan FROM chi_nhanh_lich_hoat_dong
WHERE hoat_dong = 1 AND (COALESCE(gio_bat_dau_sang, gio_bat_dau_chieu) <> gio_mo_cua OR COALESCE(gio_ket_thuc_chieu, gio_ket_thuc_sang) <> gio_dong_cua
                         OR (gio_bat_dau_sang IS NULL AND gio_bat_dau_chieu IS NULL));
```

**Bước 5 — Thêm ba CHECK mới** (nguyên văn từ `clinix_mysql.sql`; MySQL kiểm tra dữ liệu hiện có và từ chối nếu vi phạm, khi đó không đổi gì).

**Bước 6 — Bỏ CHECK và hai cột cũ** (CUỐI CÙNG, chỉ khi bước 1a và bước 4 trả về 0 dòng và không còn mã nào đọc `gio_mo_cua`/`gio_dong_cua`; MySQL không cho bỏ cột còn nằm trong CHECK nên phải bỏ CHECK cũ trước):

```sql khk6
ALTER TABLE chi_nhanh_lich_hoat_dong DROP CHECK chk_lich_hoat_dong_gio;
ALTER TABLE chi_nhanh_lich_hoat_dong DROP COLUMN gio_mo_cua, DROP COLUMN gio_dong_cua;
```

**Bước 7 — `CaToi` (KHÔNG chạy tự động, chờ nhóm quyết).** Enum `ca_lam_viec_enum` còn `CaToi` (ở `lich_lam_viec.ca`, `yeu_cau_nghi_phep.ca`, `muc_cho_danh_sach_cho.ca_mong_muon`) nhưng lịch hoạt động không có khoảng tối, 2.4 và giao diện không có ca tối. Nếu bước 1b trả về 0 ở cả ba bảng và nhóm chốt không có ca tối, đồng bộ enum bằng ba câu dưới (sao lưu trước; nếu còn dòng `CaToi` MySQL báo lỗi 1265 và không đổi gì), rồi bỏ `CaToi` khỏi `clinix.dbml` và `clinix_mysql.sql`. Nếu nhóm muốn giữ ca tối thì phải thêm khoảng tối vào lịch hoạt động, đó là thay đổi lớn hơn và chưa nằm trong quyết định này. Trong lúc chờ, quy tắc 44 chặn ở service.

```sql khk7
ALTER TABLE lich_lam_viec MODIFY ca ENUM ('CaSang', 'CaChieu') NOT NULL;
ALTER TABLE yeu_cau_nghi_phep MODIFY ca ENUM ('CaSang', 'CaChieu') COMMENT 'Bắt buộc khi nghỉ theo ca (TheoCa)';
ALTER TABLE muc_cho_danh_sach_cho MODIFY ca_mong_muon ENUM ('CaSang', 'CaChieu') NOT NULL;
```

Kiểm tra sau chuyển đổi (bước 1 đến 6): mỗi ngày hoạt động có ít nhất một khoảng đầy đủ; ngày nghỉ cả bốn giờ NULL; lịch hẹn, ca và khung giờ cũ còn nguyên (mục này không đụng vào chúng); lịch hẹn đã đặt vắt ngang 12:00 nằm trong danh sách ảnh hưởng của lần đổi giờ nghỉ trưa kế tiếp (quy tắc 30).

## 9. Truy vết Lễ tân thu tiền mặt tại quầy (20/10/2026)

Thay đổi: `giao_dich_thanh_toan` thêm cột `nguoi_thu_id` (NULL được, khóa ngoại tới `le_tan.tai_khoan_id`, đặt sau `trang_thai_doi_soat`) và CHECK `chk_gd_tien_mat_nguoi_thu` (mục 1 dòng 39). Không thêm bảng hay enum; luồng thanh toán online không đổi: dòng không phải `TienMatTaiQuay` phải có `nguoi_thu_id` NULL, nên mọi dòng online cũ đã thỏa sẵn vì cột mới mặc định NULL. Chỉ dữ liệu `TienMatTaiQuay` cũ mới cần xử lý.

DB mới tạo từ `clinix_mysql.sql` đã có đủ. DB đang ở bản ngày 19/10/2026 (đã làm xong mục 8) và có dữ liệu cần giữ thì sao lưu trước, rồi đi từng bước, kiểm tra xong mới sang bước sau.

**Bước 1 — Xem dữ liệu tiền mặt cũ** (chỉ đọc). Dòng cũ không có thông tin Lễ tân nào trong DB.

```sql tm1
SELECT g.giao_dich_thanh_toan_id, g.lich_hen_id, g.so_tien, g.trang_thai, g.vi_noi_bo_id, g.ma_giao_dich_cong, g.thoi_diem_tao, lh.chi_nhanh_id
FROM giao_dich_thanh_toan g
LEFT JOIN lich_hen lh ON lh.lich_hen_id = g.lich_hen_id
WHERE g.phuong_thuc = 'TienMatTaiQuay'
ORDER BY g.giao_dich_thanh_toan_id;
```

**Bước 2 — Thêm cột và khóa ngoại** (không đổi dữ liệu cũ, mọi dòng cũ có `nguoi_thu_id` NULL).

```sql tm2
ALTER TABLE giao_dich_thanh_toan
  ADD COLUMN nguoi_thu_id bigint NULL
  COMMENT 'Lễ tân XÁC NHẬN ĐÃ NHẬN tiền mặt (không phải người tạo bản ghi, không phải người thanh toán); chỉ có khi phuong_thuc = TienMatTaiQuay'
  AFTER trang_thai_doi_soat;
ALTER TABLE giao_dich_thanh_toan ADD FOREIGN KEY (nguoi_thu_id) REFERENCES le_tan (tai_khoan_id);
```

**Bước 3 — Tìm dòng vi phạm quy tắc mới** (phải trả về 0 dòng trước khi sang bước 4).

```sql tm3
SELECT giao_dich_thanh_toan_id, phuong_thuc, loai, so_tien, trang_thai, lich_hen_id, vi_noi_bo_id, ma_giao_dich_cong, nguoi_thu_id
FROM giao_dich_thanh_toan
WHERE (phuong_thuc = 'TienMatTaiQuay'
       AND NOT (loai = 'ThanhToanLichHen' AND lich_hen_id IS NOT NULL AND vi_noi_bo_id IS NULL AND ma_giao_dich_cong IS NULL
                AND so_tien > 0 AND trang_thai = 'ThanhCong' AND nguoi_thu_id IS NOT NULL))
   OR (phuong_thuc <> 'TienMatTaiQuay' AND nguoi_thu_id IS NOT NULL);
```

Có dòng cũ trả về: **không tự gán một Lễ tân bất kỳ**, không xóa và không sửa số tiền hay trạng thái để lọt CHECK. Người có thẩm quyền (nhóm hoặc chủ phòng khám) đối chiếu chứng từ NGOÀI DB (phiếu thu, sổ ca, camera quầy...) để biết Lễ tân nào đã nhận từng khoản **[cần điền: danh sách (mã giao dịch → mã tài khoản Lễ tân) do nhóm xác nhận]**. Mỗi dòng đã xác nhận mới chạy khối sau (một dòng một lần, kèm ghi chú nguồn xác nhận vào biên bản):

```sql tm4
UPDATE giao_dich_thanh_toan
SET nguoi_thu_id = :le_tan_id
WHERE giao_dich_thanh_toan_id = :giao_dich_id AND phuong_thuc = 'TienMatTaiQuay' AND nguoi_thu_id IS NULL;
```

Dòng không xác định được người thu: giữ nguyên làm lịch sử, chưa thể thêm CHECK ở dạng ép buộc. **[đề xuất, chưa chốt]** Chọn một trong hai: (A) chờ xử lý hết rồi mới thêm CHECK; (B) tạm bỏ qua bước 4 và chỉ bắt buộc `nguoi_thu_id` ở service cho dòng mới, ghi rõ trong biên bản rằng DB chưa tự chặn (tắt `chk_gd_tien_mat_nguoi_thu` cho tới khi dữ liệu cũ sạch). Không có phương án nào được xóa lịch sử giao dịch để né ràng buộc.

**Bước 4 — Thêm CHECK**: chạy NGUYÊN VĂN câu `ALTER TABLE giao_dich_thanh_toan ADD CONSTRAINT chk_gd_tien_mat_nguoi_thu CHECK (...)` trong `clinix_mysql.sql` (không chép lại bằng tay). Nếu còn dòng vi phạm, MySQL trả lỗi 3819 và không đổi gì.

Kiểm tra sau chuyển đổi: dòng `TienMatTaiQuay` cũ vẫn còn đủ (cùng số tiền, trạng thái, mã lịch hẹn), chỉ khác `nguoi_thu_id`; cột, khóa ngoại, CHECK và chỉ mục giống DB tạo mới.

### 9.1. Điều DB đảm bảo và điều service phải kiểm tra

| Điều cần bảo đảm | Ai bảo đảm |
|---|---|
| Dòng tiền mặt chỉ là `ThanhToanLichHen`, có lịch hẹn và người thu, không có ví hay mã cổng, số tiền > 0, trạng thái `ThanhCong` | DB (`chk_gd_tien_mat_nguoi_thu`) |
| Phương thức khác không có người thu | DB (cùng CHECK) |
| Người thu là một Lễ tân (không phải bác sĩ, bệnh nhân, quản trị viên); không xóa được Lễ tân còn giao dịch | DB (khóa ngoại) |
| `nguoi_thu_id` đến từ phiên đăng nhập, không từ giao diện | Service |
| Lễ tân thuộc chi nhánh của lịch hẹn lúc thu, tài khoản còn hoạt động | Service (truy vấn mẫu bước 1) |
| Lịch hẹn đang `DaXacNhan`; thu đúng bằng số còn phải thu (không thiếu, không thừa) | Service (DB không biết số phải thu) |
| Tổng đã trả của lịch gốc >= giá trước khi `DaTiepDon` | Service (bước 3 chạy lại) |
| Ghi giao dịch tiền mặt và chuyển `DaTiepDon` cùng một transaction, lỗi thì ROLLBACK cả hai | Service |
| Chống thu đồng thời hoặc gửi lại làm ghi tiền trùng | Service (khóa dòng + điều kiện trạng thái); DB không có UNIQUE cho việc này |
| Lịch đã trả đủ không tạo giao dịch tiền mặt bằng 0 | Service |

### 9.2. Điểm cần nhóm chốt hoặc có thể xung đột với use case hiện có

- **Quản trị viên override sang `DaTiepDon`** (2.4 "Cập nhật trạng thái lịch hẹn"): luồng override không bị giới hạn đủ tiền hay khung giờ tiếp đón **[đề xuất]**. Khi override khi còn phải thu thì không có dòng tiền mặt và không có người thu. Mục này giữ nguyên 2.4, **[cần điền]** nhóm có muốn chặn override thiếu tiền không.
- **Khung giờ tiếp đón** (số phút trước/sau giờ hẹn): vẫn **[cần điền]** (quy tắc service 40); không thuộc thay đổi này.
- **"Chi nhánh của Lễ tân lúc thu"**: DB chỉ có `le_tan.chi_nhanh_id` hiện tại, không có lịch sử chuyển chi nhánh của Lễ tân. Báo cáo theo chi nhánh dùng `lich_hen.chi_nhanh_id` (snapshot lúc đặt), không nối `le_tan.chi_nhanh_id`. **[cần điền]** nhóm có cần lưu lịch sử gán chi nhánh của Lễ tân không (chưa thêm bảng).
- **Mỗi lịch tối đa một khoản tiền mặt?** **[đề xuất, chưa chốt]**; hiện chỉ service chống trùng. Nếu chốt thì DB có thể thêm cột sinh + UNIQUE (xem quy tắc service 46).
- **Audit Log cho thu tiền mặt**: 2.4 chưa yêu cầu; `nguoi_thu_id` và `thoi_diem_tao` đã là dấu vết, không thêm hành động enum. **[cần điền]** nếu nhóm muốn ghi cả vào `nhat_ky_hanh_dong`.
- **Hoàn tiền mặt, kết ca thu ngân, đối soát tiền mặt**: ngoài phạm vi (nhóm chỉ cần số liệu tương đối); `trang_thai_doi_soat` của dòng tiền mặt để `KhongCan`.

## 10. Chuyển đổi: dữ liệu lần đăng ký của mã xác thực (26/10/2026, module auth P3)

Chỉ cần với DB đã nạp từ bản `clinix_mysql.sql` trước ngày này. DB tạo bằng migration của task auth P3 (hoặc nạp lại file SQL mới) đã có sẵn.

Thay đổi: `ma_xac_thuc` thêm 3 cột `ho_ten_dang_ky`, `so_dien_thoai_dang_ky`, `mat_khau_bam_dang_ky` (đều NULL được) và CHECK `chk_ma_xac_thuc_du_lieu_dang_ky` (quy tắc 40 mục 1); không thêm bảng hay enum (44 bảng, 27 enum), tổng 38 CHECK. Ghi chú (COMMENT) của `tai_khoan.da_xac_minh_email`, `ma_xac_thuc` (`ma_bam`, `da_gui_luc`, `thu_hoi_luc`, `so_lan_nhap_sai`, `tao_luc`), `phien_dang_nhap` và bảng `vi_noi_bo` được cập nhật; hành vi DB không đổi.

```sql
ALTER TABLE ma_xac_thuc
  ADD COLUMN ho_ten_dang_ky varchar(100) NULL,
  ADD COLUMN so_dien_thoai_dang_ky varchar(20) NULL,
  ADD COLUMN mat_khau_bam_dang_ky varchar(255) NULL;
ALTER TABLE ma_xac_thuc ADD CONSTRAINT chk_ma_xac_thuc_du_lieu_dang_ky CHECK (
    (ho_ten_dang_ky IS NULL AND so_dien_thoai_dang_ky IS NULL AND mat_khau_bam_dang_ky IS NULL)
 OR (loai = 'DangKy' AND ho_ten_dang_ky IS NOT NULL AND so_dien_thoai_dang_ky IS NOT NULL AND mat_khau_bam_dang_ky IS NOT NULL)
);
```

Hàng `DangKy` cũ chưa dùng (nếu có) không có dữ liệu đăng ký nên không xác minh được theo luồng mới; thu hồi để người dùng đăng ký lại:

```sql
UPDATE ma_xac_thuc SET thu_hoi_luc = NOW() WHERE loai = 'DangKy' AND da_dung_luc IS NULL AND thu_hoi_luc IS NULL;
```


## P7 — Ảnh chuyên khoa Cloudinary (28/10/2026)

- anh_tai_len quản lý UUID, public_id, URL và xác nhận upload; chuyên khoa tham chiếu FK nullable UNIQUE RESTRICT. Một ảnh tối đa một chuyên khoa. Giữ anh_dai_dien cũ, không tự backfill public_id từ URL.
- Chỉ Admin Toàn hệ thống upload; khi gắn kiểm người tải, mục đích ChuyenKhoa, xác nhận thành công, ChuaGan và còn hạn trong cùng giao dịch có khóa. Ảnh ChoXoa không được gắn lại.
- Đầu vào ảnh tĩnh JPEG/PNG/WebP ≤10 MB/25 MP; ≤2 MB không chủ động resize/nén, >2 MB nén trước/resize khi cần, output ≤2 MB; mục tiêu mềm 700–800 KB. Chuẩn hóa EXIF, bỏ metadata riêng tư, giữ alpha/tỷ lệ.
- Thay/gỡ ảnh: commit DB trước network; ảnh cũ ChoXoa. ChuaGan hết hạn sau 24 giờ. Dọn mỗi giờ tối đa 50 ảnh, nhận lease 5 phút bằng DB, tối đa 5 lần xóa lỗi rồi kiểm tra thủ công. Không xóa ảnh đang tham chiếu hoặc upload chưa xác định kết quả.
- Side effect Cloudinary không nằm trong transaction. Timeout upload giữ dấu để kiểm tra thủ công; không tự retry hoặc coi đã thành công. Rollback migration khi bảng còn dữ liệu bị chặn để không mất dấu tài nguyên.
