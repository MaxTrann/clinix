import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { RelativesRepository } from '../relatives/relatives.repository.js';
import type { RelativeResponse } from '../relatives/relatives.dto.js';
import { buildLookupPatterns } from '../validation/keyword-policy.js';
import type {
  PatientDetail,
  PatientDetailRelative,
  PatientLookupPage,
  PatientLookupQuery,
} from './patient-lookup.dto.js';
import { PatientLookupRepository } from './patient-lookup.repository.js';

// Ánh xạ TƯỜNG MINH từng phần tử về đúng sáu khoá (Q18): `hoSoNguoiThanId` là mã nội bộ nên dừng ở đây; một cột thừa của repository cũng không lọt ra
function toDetailRelative(relative: RelativeResponse): PatientDetailRelative {
  return {
    hoTen: relative.hoTen,
    moiQuanHe: relative.moiQuanHe,
    gioiTinh: relative.gioiTinh,
    ngaySinh: relative.ngaySinh,
    soDienThoai: relative.soDienThoai,
    trangThaiHieuLuc: relative.trangThaiHieuLuc,
  };
}

/**
 * Tra cứu bệnh nhân cho Lễ tân (task B6, B7; PLAN patient 5.4, 5.7; TRACKING B6-E, B7-E). Chỉ đọc: không giao dịch, không khoá, không nhật ký hành động (Q20 = A).
 * Không nhận người gọi: phạm vi toàn hệ thống (Q16), mọi Lễ tân thấy cùng một kết quả. Không log gì: từ khoá và dữ liệu trả về là dữ liệu cá nhân (H5).
 */
@Injectable()
export class PatientLookupService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(PatientLookupRepository)
    private readonly lookup: PatientLookupRepository,
    @Inject(RelativesRepository)
    private readonly relatives: RelativesRepository,
  ) {}

  /**
   * Đếm TRƯỚC, chỉ lấy trang khi `offset < total`. Không khớp ai, hoặc trang vượt quá cuối, ra `items: []` (200, không 404, như danh sách của admin)
   * mà không chạy câu trang; nhờ vậy `page` rất lớn (DTO không chặn trên) không bao giờ gửi `OFFSET` khổng lồ cho MySQL, nơi nó báo lỗi 1064 ra 500.
   * Hai câu không cùng ảnh chụp nên dưới ghi đồng thời `total` có thể lệch vài hàng so với `items`; chấp nhận.
   */
  async search(query: PatientLookupQuery): Promise<PatientLookupPage> {
    const patterns = buildLookupPatterns(query.q);
    const em = this.dataSource.manager;
    const total = await this.lookup.count(em, patterns);
    const items =
      query.offset < total
        ? await this.lookup.findPage(em, patterns, query.pageSize, query.offset)
        : [];
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Chi tiết MỘT bệnh nhân (task B7). `id` đã qua `ParseRelativeIdPipe` (chuỗi đúng dạng BIGINT). Không có hàng (id không tồn tại, là tài khoản không phải Bệnh nhân,
   * Bệnh nhân chưa xác minh) ⇒ 404 `KHONG_TIM_THAY` bằng ĐÚNG lời gọi mà `parsePublicId` dùng cho id sai dạng, nên thân giống từng ký tự (Q27, H3), và KHÔNG đọc tiếp.
   * Có hàng ⇒ lấy người thân của CHÍNH `id` đó (cả hai trạng thái, đang dùng trước; PLAN 5.4: dùng lại repository của B3, không viết truy vấn thứ hai).
   * Hai câu SELECT riêng, không giao dịch: có thể thấy hai khoảnh khắc khác nhau nếu người thân bị ngừng giữa chừng; chỉ lệch tức thời, không sai quyền (TRACKING B7-F).
   */
  async getDetail(id: string): Promise<PatientDetail> {
    const em = this.dataSource.manager;
    const patient = await this.lookup.findDetail(em, id);
    if (patient === null) {
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    }
    const relatives = await this.relatives.findRelatives(em, id);
    // Liệt kê từng khoá (không trải `patient`): khoá thừa của repository không bao giờ ra ngoài
    return {
      hoTen: patient.hoTen,
      email: patient.email,
      soDienThoai: patient.soDienThoai,
      gioiTinh: patient.gioiTinh,
      ngaySinh: patient.ngaySinh,
      diaChi: patient.diaChi,
      thoiDiemTao: patient.thoiDiemTao,
      trangThai: patient.trangThai,
      soLanVangMat: patient.soLanVangMat,
      nguoiThan: relatives.map(toDetailRelative),
    };
  }
}
