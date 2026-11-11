import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { ChucDanhBacSi } from '../../admin/entities/enums.js';
import { ExamPriceReader } from '../../pricing/exam-price.reader.js';
import type { BookingSummary } from './booking-checks.dto.js';
import { RefundPolicyReader, toRefundPolicyView } from './refund-policy.js';

// Dựng `tomTat` của Bước 5 (task B7; PLAN booking 5.9; TRACKING booking 3.18 B7-E). Chỉ ĐỌC, chỉ gọi khi `evaluateBookability` đã đạt, trong CÙNG giao dịch `READ ONLY` với các câu đọc của luật
// (cùng một ảnh chụp). MỘT câu SELECT theo bác sĩ của khung giờ (không join lại thứ luật đã kiểm), cộng quy tắc phụ phí (`ExamPriceReader`) và mốc hoàn (`RefundPolicyReader`).
// Giá đi qua đúng hàm chung của `pricing/` (không công thức thứ hai, H3) nên `giaApDung` luôn bằng giá mà thẻ bác sĩ của `search` trả cho cùng bác sĩ.

export interface SummaryInput {
  /** `facts.doctor.bacSiId` của luật */
  bacSiId: string;
  /** Giờ bắt đầu khung giờ (`facts.slot.ngayGio`) */
  thoiGian: Date;
  /** Chủ sở hữu, lấy từ access token */
  benhNhanId: string;
  /** `null` là hồ sơ BẢN THÂN; hồ sơ người thân đã được kiểm là của đúng chủ và còn hiệu lực */
  hoSoNguoiThanId: string | null;
}

interface SummaryRow {
  dichVuKhamId: string;
  dichVu: string;
  thoiLuong: number | string;
  chuyenKhoa: string;
  bacSiHoTen: string;
  chucDanh: ChucDanhBacSi;
  soNamKinhNghiem: number | string;
  chiNhanhTen: string;
  chiNhanhDiaChi: string;
  giaMacDinh: string;
  mucDatCoc: string;
  nguoiThanHoTen: string | null;
  benhNhanHoTen: string;
}

// Chi nhánh lấy theo `bac_si.chi_nhanh_id` HIỆN TẠI (D12: đúng chi nhánh B8 sẽ ghi vào `lich_hen`), chuyên khoa theo `bac_si.chuyen_khoa_id` hiện tại (như B1). Tiền `CAST … AS CHAR` để ra
// chuỗi decimal đúng như DB (không qua số thực, H4). Hồ sơ người thân: LEFT JOIN kèm `benh_nhan_id` của chủ TRONG SQL (H3); `?` thứ hai bằng NULL (bản thân) thì không khớp hàng nào.
// Thứ tự tham số theo vị trí `?`: bệnh nhân (tên), hồ sơ người thân, bệnh nhân (chủ hồ sơ), bác sĩ.
const READ_SUMMARY_SQL = `SELECT CAST(dv.dich_vu_kham_id AS CHAR) AS dichVuKhamId, dv.ten AS dichVu, dv.thoi_luong AS thoiLuong, ck.ten AS chuyenKhoa,
  tbs.ho_ten AS bacSiHoTen, bs.chuc_danh AS chucDanh, bs.so_nam_kinh_nghiem AS soNamKinhNghiem, cn.ten AS chiNhanhTen, cn.dia_chi AS chiNhanhDiaChi,
  CAST(dv.gia_mac_dinh AS CHAR) AS giaMacDinh, CAST(dv.muc_dat_coc AS CHAR) AS mucDatCoc, hs.ho_ten AS nguoiThanHoTen, tbn.ho_ten AS benhNhanHoTen
FROM bac_si bs
JOIN tai_khoan tbs ON tbs.tai_khoan_id = bs.tai_khoan_id
JOIN chuyen_khoa ck ON ck.chuyen_khoa_id = bs.chuyen_khoa_id
JOIN chi_nhanh cn ON cn.chi_nhanh_id = bs.chi_nhanh_id
JOIN dich_vu_kham dv ON dv.dich_vu_kham_id = bs.dich_vu_kham_id
JOIN tai_khoan tbn ON tbn.tai_khoan_id = ?
LEFT JOIN ho_so_nguoi_than hs ON hs.ho_so_nguoi_than_id = ? AND hs.benh_nhan_id = ?
WHERE bs.tai_khoan_id = ?`;

@Injectable()
export class BookingSummaryReader {
  constructor(
    @Inject(ExamPriceReader) private readonly prices: ExamPriceReader,
    @Inject(RefundPolicyReader) private readonly refunds: RefundPolicyReader,
  ) {}

  /**
   * `tomTat` MINUS `soDuVi`: số dư ví lấy từ cổng ngoài giao dịch (`WalletBalancePort` không nhận `em`), nên do `BookingChecksService` thêm sau. Không có hàng bác sĩ trong cùng ảnh chụp
   * với luật là điều không thể xảy ra (luật vừa đọc đúng bác sĩ đó): ném lỗi thay vì trả tóm tắt rỗng.
   */
  async read(
    em: EntityManager,
    input: SummaryInput,
  ): Promise<Omit<BookingSummary, 'soDuVi'>> {
    const row = (
      await em.query<SummaryRow[]>(READ_SUMMARY_SQL, [
        input.benhNhanId,
        input.hoSoNguoiThanId,
        input.benhNhanId,
        input.bacSiId,
      ])
    )[0];
    if (row === undefined)
      throw new Error(
        'Không đọc được bác sĩ của khung giờ trong cùng ảnh chụp',
      );
    const laBanThan = input.hoSoNguoiThanId === null;
    const hoTenNguoiKham = laBanThan ? row.benhNhanHoTen : row.nguoiThanHoTen;
    if (hoTenNguoiKham === null)
      throw new Error(
        'Không đọc được hồ sơ người thân đã kiểm trong cùng ảnh chụp',
      );

    const rules = await this.prices.loadRules(em);
    const price = this.prices.priceFor(row.giaMacDinh, rules, {
      chucDanh: row.chucDanh,
      soNamKinhNghiem: Number(row.soNamKinhNghiem),
    });
    const snapshot = await this.refunds.read(
      em,
      row.dichVuKhamId,
      row.mucDatCoc,
    );

    return {
      dichVu: { ten: row.dichVu, thoiLuongPhut: Number(row.thoiLuong) },
      chuyenKhoa: row.chuyenKhoa,
      bacSi: { hoTen: row.bacSiHoTen, chucDanh: row.chucDanh },
      chiNhanh: { ten: row.chiNhanhTen, diaChi: row.chiNhanhDiaChi },
      thoiGian: input.thoiGian.toISOString(),
      nguoiKham: { hoTen: hoTenNguoiKham, laBanThan },
      giaDichVu: row.giaMacDinh,
      phuPhi: price.phuPhi,
      giaApDung: price.giaKham,
      tienCoc: row.mucDatCoc,
      chinhSachHoan: toRefundPolicyView(snapshot),
    };
  }
}
