import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { parsePublicId } from '../common/id-param.js';
import { buildWeeklySchedule } from '../common/weekly-schedule.view.js';
import type { Paged } from '../../common/paging/paged.js';
import type { SurchargeRule } from '../../pricing/surcharge.calculator.js';
import { ExamPriceReader } from '../../pricing/exam-price.reader.js';
import {
  DoctorRatingReader,
  type DoctorRating,
} from '../ratings/doctor-rating.reader.js';
import { parseDoctorFilters } from './doctor-filter.parser.js';
import { filterSortPage } from './doctor-list.rules.js';
import type {
  PublicDoctorDetail,
  PublicDoctorItem,
  PublicDoctorQueryDto,
} from './public-doctor.dto.js';
import {
  PublicDoctorRepository,
  type DoctorCandidate,
} from './public-doctor.repository.js';

@Injectable()
export class PublicDoctorService {
  constructor(
    private readonly repository: PublicDoctorRepository,
    private readonly prices: ExamPriceReader,
    private readonly ratings: DoctorRatingReader,
  ) {}

  async list(query: PublicDoctorQueryDto): Promise<Paged<PublicDoctorItem>> {
    // Sai bộ lọc ⇒ 400 trước khi chạm DB.
    const filters = parseDoctorFilters(query);
    const { candidates, rules } = await this.repository.findCandidates(filters);
    const ratings = await this.ratings.readMany(
      candidates.map((c) => c.bacSiId),
    );
    const items = candidates.map((candidate) =>
      this.toItem(candidate, rules, ratings),
    );
    return filterSortPage(items, filters, {
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** Id sai dạng, không có hoặc không công khai ⇒ cùng một 404 `KHONG_TIM_THAY` (H8). */
  async detail(rawId: string): Promise<PublicDoctorDetail> {
    const found = await this.repository.findDetail(parsePublicId(rawId));
    if (!found) throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    const { doctor, rules, schedule } = found;
    const ratings = await this.ratings.readMany([doctor.bacSiId]);
    const item = this.toItem(doctor, rules, ratings);
    return {
      ...item,
      moTaChuyenMon: doctor.moTaChuyenMon ?? null,
      chiNhanh: {
        ...item.chiNhanh,
        lichHoatDong: buildWeeklySchedule(schedule),
      },
    };
  }

  // Chọn lại từng trường để không lọt cột nào ngoài danh sách trắng (Q14).
  private toItem(
    c: DoctorCandidate,
    rules: readonly SurchargeRule[],
    ratings: ReadonlyMap<string, DoctorRating>,
  ): PublicDoctorItem {
    const { phuPhi, giaKham } = this.prices.priceFor(c.giaMacDinh, rules, {
      chucDanh: c.chucDanh,
      soNamKinhNghiem: Number(c.soNamKinhNghiem),
    });
    const rating = ratings.get(c.bacSiId);
    return {
      bacSiId: String(c.bacSiId),
      hoTen: c.hoTen,
      chucDanh: c.chucDanh,
      soNamKinhNghiem: Number(c.soNamKinhNghiem),
      chuyenKhoa: {
        chuyenKhoaId: String(c.chuyenKhoaId),
        ten: c.chuyenKhoaTen,
      },
      chiNhanh: {
        chiNhanhId: String(c.chiNhanhId),
        ten: c.chiNhanhTen,
        diaChi: c.chiNhanhDiaChi,
      },
      dichVu: {
        dichVuKhamId: String(c.dichVuKhamId),
        ten: c.dichVuTen,
        thoiLuong: Number(c.thoiLuong),
      },
      gia: {
        giaMacDinh: String(c.giaMacDinh),
        phuPhi,
        giaKham,
        mucDatCoc: String(c.mucDatCoc),
      },
      danhGia: {
        diemTrungBinh: rating?.diemTrungBinh ?? null,
        soDanhGia: rating?.soDanhGia ?? 0,
      },
    };
  }
}
