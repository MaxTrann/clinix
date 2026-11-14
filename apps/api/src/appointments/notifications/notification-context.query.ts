import type { EntityManager } from 'typeorm';

// Đọc dữ kiện cho `thong_bao.noi_dung` (và, ở giai đoạn sau, cho thư) của MỘT lịch hẹn (task B15; PLAN booking 5.12; TRACKING 3.37 B15-F, B15-G). CHỈ ĐỌC, KHÔNG KHOÁ: dùng `em` của người gọi (cùng giao dịch nên đã
// thấy mọi thay đổi của chính giao dịch đó, kể cả bộ đếm no-show vừa cộng), nhưng câu `SELECT` thường của InnoDB ở READ COMMITTED không xin khoá hàng nào nên không thêm chu trình khoá (PLAN 5.3).
// Cố ý KHÔNG chọn `ly_do_kham` (dữ liệu sức khoẻ), `ly_do_huy` (chữ tự do của người nhập), `so_dien_thoai` (H10, TB-02): NTF-08 kiểm cả văn bản câu SQL này.

/** Chức danh bác sĩ như cột `bac_si.chuc_danh` (ENUM của DB); chữ hiển thị do mẫu thư quyết định. */
export type ChucDanh =
  'BS' | 'BS_CKI' | 'BS_CKII' | 'ThS_BS' | 'TS_BS' | 'PGS_TS_BS' | 'GS_TS_BS';

export interface NotificationContext {
  maLichHen: string;
  /** Ngày hẹn "dd/MM/yyyy" theo giờ Việt Nam (đọc bằng `DATE_FORMAT` trên cột DATETIME đã lưu giờ Việt Nam, không qua `Date` của JS nên không lệch múi giờ) */
  ngay: string;
  /** Giờ hẹn "HH:mm" theo giờ Việt Nam */
  gio: string;
  /** Thứ trong tuần theo `DAYOFWEEK` của MySQL: 1 = Chủ nhật … 7 = Thứ Bảy */
  thu: number;
  /** `lich_hen.gia_snapshot`, chuỗi decimal (H11) */
  giaSnapshot: string;
  /** `lich_hen.tien_coc_snapshot`, chuỗi decimal (H11) */
  tienCocSnapshot: string;
  /** Người được khám là hồ sơ người thân (đặt hộ) */
  datHo: boolean;
  /** Họ tên người được khám: hồ sơ người thân nếu có, không thì chính tài khoản đặt */
  nguoiDuocKham: string;
  chucDanh: ChucDanh;
  tenBacSi: string;
  chuyenKhoa: string;
  dichVu: string;
  chiNhanh: string;
  diaChiChiNhanh: string;
  /** Tài khoản ĐẶT (`lich_hen.benh_nhan_id`): người nhận thông báo và thư */
  tenNguoiDat: string;
  emailNguoiDat: string;
}

interface ContextRow {
  maLichHen: string;
  ngay: string;
  gio: string;
  thu: number | string;
  giaSnapshot: string;
  tienCocSnapshot: string;
  datHo: number | string;
  nguoiDuocKham: string;
  chucDanh: ChucDanh;
  tenBacSi: string;
  chuyenKhoa: string;
  dichVu: string;
  chiNhanh: string;
  diaChiChiNhanh: string;
  tenNguoiDat: string;
  emailNguoiDat: string;
}

export const READ_CONTEXT_SQL = `SELECT l.ma_lich_hen AS maLichHen,
       DATE_FORMAT(l.thoi_gian, '%d/%m/%Y') AS ngay,
       DATE_FORMAT(l.thoi_gian, '%H:%i') AS gio,
       DAYOFWEEK(l.thoi_gian) AS thu,
       l.gia_snapshot AS giaSnapshot,
       l.tien_coc_snapshot AS tienCocSnapshot,
       (l.ho_so_nguoi_than_id IS NOT NULL) AS datHo,
       COALESCE(hs.ho_ten, nguoi_dat.ho_ten) AS nguoiDuocKham,
       bs.chuc_danh AS chucDanh,
       tai_khoan_bs.ho_ten AS tenBacSi,
       ck.ten AS chuyenKhoa,
       dv.ten AS dichVu,
       cn.ten AS chiNhanh,
       cn.dia_chi AS diaChiChiNhanh,
       nguoi_dat.ho_ten AS tenNguoiDat,
       nguoi_dat.email AS emailNguoiDat
  FROM lich_hen l
  JOIN tai_khoan nguoi_dat ON nguoi_dat.tai_khoan_id = l.benh_nhan_id
  LEFT JOIN ho_so_nguoi_than hs ON hs.ho_so_nguoi_than_id = l.ho_so_nguoi_than_id
  JOIN bac_si bs ON bs.tai_khoan_id = l.bac_si_id
  JOIN tai_khoan tai_khoan_bs ON tai_khoan_bs.tai_khoan_id = l.bac_si_id
  JOIN chuyen_khoa ck ON ck.chuyen_khoa_id = bs.chuyen_khoa_id
  JOIN dich_vu_kham dv ON dv.dich_vu_kham_id = l.dich_vu_kham_id
  JOIN chi_nhanh cn ON cn.chi_nhanh_id = l.chi_nhanh_id
 WHERE l.lich_hen_id = ?`;

/** Dữ kiện của lịch `lichHenId`, hoặc `null` khi không có (hay thiếu một hàng nối: dữ liệu lệch, người gọi quyết định ném). */
export async function readNotificationContext(
  em: EntityManager,
  lichHenId: string,
): Promise<NotificationContext | null> {
  const rows: ContextRow[] = await em.query(READ_CONTEXT_SQL, [lichHenId]);
  const row = rows[0];
  if (row === undefined) return null;
  return {
    maLichHen: row.maLichHen,
    ngay: row.ngay,
    gio: row.gio,
    thu: Number(row.thu),
    giaSnapshot: row.giaSnapshot,
    tienCocSnapshot: row.tienCocSnapshot,
    datHo: Number(row.datHo) === 1,
    nguoiDuocKham: row.nguoiDuocKham,
    chucDanh: row.chucDanh,
    tenBacSi: row.tenBacSi,
    chuyenKhoa: row.chuyenKhoa,
    dichVu: row.dichVu,
    chiNhanh: row.chiNhanh,
    diaChiChiNhanh: row.diaChiChiNhanh,
    tenNguoiDat: row.tenNguoiDat,
    emailNguoiDat: row.emailNguoiDat,
  };
}

export interface NoShowFacts {
  /** `benh_nhan.so_lan_no_show` của tài khoản đặt (trong giao dịch đánh Vắng mặt thì đã là số MỚI) */
  soLan: number;
  /** `cau_hinh_he_thong.nguong_no_show` */
  nguong: number;
}

export const READ_NO_SHOW_COUNT_SQL =
  'SELECT so_lan_no_show AS soLan FROM benh_nhan WHERE tai_khoan_id = ?';
export const READ_NO_SHOW_THRESHOLD_SQL =
  'SELECT nguong_no_show AS nguong FROM cau_hinh_he_thong WHERE id = 1';

/**
 * Số lần vắng mặt và ngưỡng, đọc bằng `em` (không khoá). Thiếu hàng là dữ liệu lệch (`markNoShow` đã khoá `benh_nhan` và trả `ConfigMissing` trước khi ghi nếu chưa có cấu hình)
 * nên NÉM lỗi để người gọi hoàn tác, không đoán số.
 */
export async function readNoShowFacts(
  em: EntityManager,
  taiKhoanId: string,
): Promise<NoShowFacts> {
  const counts: { soLan: number | string }[] = await em.query(
    READ_NO_SHOW_COUNT_SQL,
    [taiKhoanId],
  );
  const thresholds: { nguong: number | string }[] = await em.query(
    READ_NO_SHOW_THRESHOLD_SQL,
  );
  const count = counts[0];
  const threshold = thresholds[0];
  if (count === undefined)
    throw new Error(`tài khoản ${taiKhoanId} không có hàng benh_nhan`);
  if (threshold === undefined)
    throw new Error('chưa có cau_hinh_he_thong khi ghi thông báo no-show');
  return { soLan: Number(count.soLan), nguong: Number(threshold.nguong) };
}
