import { Injectable } from '@nestjs/common';
import type { Paged } from '../../common/paging/paged.js';
import type { SurchargeRule } from '../../pricing/surcharge.calculator.js';
import { ExamPriceReader } from '../pricing/exam-price.reader.js';
import {
  DoctorRatingReader,
  type DoctorRating,
} from '../ratings/doctor-rating.reader.js';
import { parseDoctorFilters } from './doctor-filter.parser.js';
import { filterSortPage } from './doctor-list.rules.js';
import type {
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
