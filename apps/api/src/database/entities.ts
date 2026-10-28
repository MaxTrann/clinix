import { AnhTaiLen } from '../common/upload/anh-tai-len.entity.js';
import { BenhNhan } from '../auth/entities/benh-nhan.entity.js';
import { MaXacThuc } from '../auth/entities/ma-xac-thuc.entity.js';
import { PhienDangNhap } from '../auth/entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from '../auth/entities/tai-khoan.entity.js';
import { ViNoiBo } from '../auth/entities/vi-noi-bo.entity.js';
import { ChiNhanh } from '../admin/entities/chi-nhanh.entity.js';
import { ChiNhanhDichVuKham } from '../admin/entities/chi-nhanh-dich-vu-kham.entity.js';
import { ChiNhanhLichHoatDong } from '../admin/entities/chi-nhanh-lich-hoat-dong.entity.js';
import { ChuyenKhoa } from '../admin/entities/chuyen-khoa.entity.js';
import { DichVuKham } from '../admin/entities/dich-vu-kham.entity.js';
import { NhomDichVu } from '../admin/entities/nhom-dich-vu.entity.js';
import { BacSi } from '../admin/entities/bac-si.entity.js';
import { HoSoNguoiThan } from '../admin/entities/ho-so-nguoi-than.entity.js';
import { KhungGio } from '../admin/entities/khung-gio.entity.js';
import { LeTan } from '../admin/entities/le-tan.entity.js';
import { NhatKyHanhDong } from '../admin/entities/nhat-ky-hanh-dong.entity.js';
import { LichHen } from '../admin/entities/lich-hen.entity.js';
import { LichLamViec } from '../admin/entities/lich-lam-viec.entity.js';
import { PhuPhiBacSi } from '../admin/entities/phu-phi-bac-si.entity.js';
import { QuanTriVien } from '../admin/entities/quan-tri-vien.entity.js';
import { CauHinhHeThong } from '../admin/entities/cau-hinh-he-thong.entity.js';
import { EmailThongBao } from '../admin/entities/email-thong-bao.entity.js';
import { ThongBao } from '../admin/entities/thong-bao.entity.js';
import { ThongTinPhongKham } from '../admin/entities/thong-tin-phong-kham.entity.js';
import { YeuCauThayDoiChiNhanh } from '../admin/entities/yeu-cau-thay-doi-chi-nhanh.entity.js';
import { YeuCauThayDoiChiNhanhLichHen } from '../admin/entities/yeu-cau-thay-doi-chi-nhanh-lich-hen.entity.js';

// Sổ đăng ký entity (một nơi duy nhất cho app, script migration và test). Module mới (admin…) thêm entity của
// mình vào đây; bài test registry.spec.ts báo lỗi nếu có file *.entity.ts chưa được đăng ký.
export const ENTITIES = [
  AnhTaiLen,
  TaiKhoan,
  BenhNhan,
  ViNoiBo,
  MaXacThuc,
  PhienDangNhap,
  ChiNhanh,
  ChiNhanhLichHoatDong,
  ChuyenKhoa,
  NhomDichVu,
  DichVuKham,
  ChiNhanhDichVuKham,
  BacSi,
  LeTan,
  QuanTriVien,
  PhuPhiBacSi,
  HoSoNguoiThan,
  LichLamViec,
  KhungGio,
  LichHen,
  YeuCauThayDoiChiNhanh,
  YeuCauThayDoiChiNhanhLichHen,
  ThongTinPhongKham,
  CauHinhHeThong,
  ThongBao,
  EmailThongBao,
  NhatKyHanhDong,
];
