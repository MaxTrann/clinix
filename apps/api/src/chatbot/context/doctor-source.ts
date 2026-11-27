import { AppException } from '../../common/errors/app.exception.js';
import type { Paged } from '../../common/paging/paged.js';
import {
  PublicDoctorQueryDto,
  type PublicDoctorDetail,
  type PublicDoctorItem,
} from '../../search/doctors/public-doctor.dto.js';
import {
  DOCTOR_ROSTER_MAX_PAGES,
  DOCTOR_ROSTER_PAGE_SIZE,
} from './context.constants.js';
import type { DoctorRow, DoctorSource } from './context.types.js';

// Bác sĩ công khai đi qua `PublicDoctorService` (chatbot B2; PLAN chatbot 5.6, T7): danh sách trắng như tra cứu, điều kiện `PUBLIC_DOCTOR_CONDITION`,
// giá khám đã cộng phụ phí. KHÔNG email, SĐT, ngày sinh, địa chỉ, học vị, ảnh. Ta còn bỏ cả số năm kinh nghiệm và điểm đánh giá: ngữ cảnh không dùng.
// Service đó tự mở giao dịch chỉ đọc của nó (không nhận `manager`), nên bác sĩ là lần đọc RIÊNG so với phần nền (PLAN B2 mục 1).

/** Phần của `PublicDoctorService` mà bộ điều hợp dùng (để test không cần Nest). */
export interface PublicDoctorReader {
  list(query: PublicDoctorQueryDto): Promise<Paged<PublicDoctorItem>>;
  detail(rawId: string): Promise<PublicDoctorDetail>;
}

function toDoctorRow(item: PublicDoctorItem): DoctorRow {
  return {
    bacSiId: item.bacSiId,
    hoTen: item.hoTen,
    chucDanh: item.chucDanh,
    chuyenKhoaId: item.chuyenKhoa.chuyenKhoaId,
    chuyenKhoaTen: item.chuyenKhoa.ten,
    chiNhanhId: item.chiNhanh.chiNhanhId,
    chiNhanhTen: item.chiNhanh.ten,
    dichVuKhamId: item.dichVu.dichVuKhamId,
    dichVuTen: item.dichVu.ten,
    giaKham: item.gia.giaKham,
  };
}

export class PublicDoctorSourceAdapter implements DoctorSource {
  constructor(private readonly service: PublicDoctorReader) {}

  /** Lặp trang 1 đến `DOCTOR_ROSTER_MAX_PAGES` (mỗi trang 100) đến khi đủ `total`; quá 500 bác sĩ thì bỏ phần còn lại theo nếp sắp của search. */
  async listAll(): Promise<readonly DoctorRow[]> {
    const rows: DoctorRow[] = [];
    for (let page = 1; page <= DOCTOR_ROSTER_MAX_PAGES; page += 1) {
      const result = await this.service.list(
        Object.assign(new PublicDoctorQueryDto(), {
          page,
          pageSize: DOCTOR_ROSTER_PAGE_SIZE,
        }),
      );
      rows.push(...result.items.map(toDoctorRow));
      if (result.items.length === 0 || rows.length >= result.total) break;
    }
    return rows;
  }

  /** Id sai dạng, không có, hay không còn công khai ⇒ `null` (search trả cùng một 404, H8). Lỗi khác thì ném tiếp. */
  async findById(id: string): Promise<DoctorRow | null> {
    try {
      return toDoctorRow(await this.service.detail(id));
    } catch (error) {
      if (error instanceof AppException && error.getStatus() === 404) {
        return null;
      }
      throw error;
    }
  }
}
