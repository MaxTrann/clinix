# CLINIX – Quy tắc nghiệp vụ trong Database (bản 2)

Nguồn: `clinix_v2.dbml` và `clinix_mysql.sql`. Cần MySQL 8.0.16+ để CHECK được thực thi.

## 1. Do database bảo vệ

| # | Quy tắc | Nơi khai báo | Cơ chế |
|---|---|---|---|
| 1 | Mỗi khung giờ chỉ có 1 lịch hẹn còn hiệu lực | `lich_hen.khung_gio_dang_giu` | Cột sinh STORED + UNIQUE (UNIQUE bỏ qua NULL nên mô phỏng được unique có điều kiện) |
| 2 | Mỗi khung giờ chỉ có 1 người đang được mời từ danh sách chờ | `muc_cho_danh_sach_cho.khung_gio_dang_moi` | Cột sinh STORED + UNIQUE |
| 3 | Trạng thái DaMoi thì phải có khung giờ được mời | `chk_muc_cho_da_moi` | CHECK |
| 4 | 1 lịch cũ chỉ sinh tối đa 1 lịch mới khi đổi lịch; lịch không tự trỏ chính nó | `lich_hen.lich_hen_truoc_id UNIQUE + chk_lich_hen_truoc` | UNIQUE + CHECK |
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

## 2. Do tầng ứng dụng (service) bảo vệ

| # | Quy tắc | Ghi chú |
|---|---|---|
| 1 | Cặp (chi nhánh, dịch vụ) của bác sĩ và của lịch hẹn phải có trong chi_nhanh_dich_vu_kham | Không dùng FK kép theo quyết định của nhóm; có thể bật FK ở cuối file nếu muốn DB bảo vệ |
| 2 | Đổi lịch: tạo lịch mới, đổi lịch cũ sang DaDoiLich trong CÙNG 1 giao dịch; chỉ cho đổi khi lịch cũ ở DaXacNhan [đề xuất, chưa xác nhận] | Giao dịch ở tầng ứng dụng |
| 3 | Lịch mới do đổi lịch sao chép gia_snapshot, tien_coc_snapshot, chinh_sach_hoan_snapshot từ lịch trước | Service |
| 4 | Tài chính sau đổi lịch: không tạo giao dịch thanh toán mới; lần theo lich_hen_truoc_id về lịch gốc để tìm giao dịch (xem truy vấn mẫu cuối file) | Service |
| 5 | Hồ sơ người thân của lịch hẹn phải thuộc đúng bệnh nhân đặt lịch | Service |
| 6 | lich_hen.bac_si_id, chi_nhanh_id, thoi_gian khớp với khung giờ (dữ liệu snapshot) | Service |
| 7 | loai_tai_khoan của tai_khoan khớp đúng 1 bảng con (benh_nhan / bac_si / le_tan / quan_tri_vien) | Service |
| 8 | Chỉ cho đánh giá khi lịch hẹn ở trạng thái HoanThanh | Service |
| 9 | Hoàn thành ca khám cần ít nhất 1 ghi chú khám không rỗng | Service |
| 10 | Danh sách chờ: không đăng ký trùng (bệnh nhân, bác sĩ, ngày, ca) khi còn DangCho hoặc DaMoi | Service |
| 11 | Phụ phí bác sĩ = dòng cùng học vị có so_nam_kinh_nghiem_tu lớn nhất nhưng không vượt số năm kinh nghiệm | Service |
| 12 | Rút tiền: tạo yêu cầu tăng so_tien_dang_giu; duyệt ghi giao_dich_vi loại Rut và giảm cả so_du lẫn so_tien_dang_giu; từ chối chỉ giảm so_tien_dang_giu | Giao dịch ở tầng ứng dụng |
| 13 | Đổi chi nhánh công tác của bác sĩ (Quản trị viên sửa trực tiếp hồ sơ, không có yêu cầu riêng) chỉ khi bác sĩ không còn lịch hẹn đang hoạt động ở chi nhánh hiện tại; ghi nhật ký DoiChiNhanhBacSi | Service |
| 14 | Mốc đã đọc của chat (tin_nhan_cuoi_da_doc_id) phải thuộc cùng hội thoại | Service |
