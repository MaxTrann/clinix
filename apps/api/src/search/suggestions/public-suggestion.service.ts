import { Injectable } from '@nestjs/common';
import type {
  PublicSuggestionQueryDto,
  PublicSuggestions,
} from './public-suggestion.dto.js';
import { PublicSuggestionRepository } from './public-suggestion.repository.js';

@Injectable()
export class PublicSuggestionService {
  constructor(private readonly repository: PublicSuggestionRepository) {}

  async find(query: PublicSuggestionQueryDto): Promise<PublicSuggestions> {
    const likePattern = query.likePattern;
    // `q` rỗng ⇒ ba mảng rỗng, không chạm DB (Q20).
    if (!likePattern) return { chuyenKhoa: [], dichVu: [], bacSi: [] };
    const found = await this.repository.find(likePattern);
    // Chọn lại từng trường để không lọt cột nào ngoài danh sách trắng (Q14).
    return {
      chuyenKhoa: found.chuyenKhoa.map(({ chuyenKhoaId, ten }) => ({
        chuyenKhoaId: String(chuyenKhoaId),
        ten,
      })),
      dichVu: found.dichVu.map(({ dichVuKhamId, ten }) => ({
        dichVuKhamId: String(dichVuKhamId),
        ten,
      })),
      bacSi: found.bacSi.map(({ bacSiId, hoTen, chucDanh }) => ({
        bacSiId: String(bacSiId),
        hoTen,
        chucDanh,
      })),
    };
  }
}
