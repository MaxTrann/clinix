import 'reflect-metadata';
import { PublicSuggestionQueryDto } from './public-suggestion.dto.js';
import type { PublicSuggestionRepository } from './public-suggestion.repository.js';
import { PublicSuggestionService } from './public-suggestion.service.js';

// B8 — Q20: q rỗng không chạm DB; danh sách trắng; escape LIKE.
const query = (q?: string) =>
  Object.assign(new PublicSuggestionQueryDto(), { q });

describe('B8 — PublicSuggestionService', () => {
  it.each([undefined, ''])(
    'Q20: q=%j ⇒ ba mảng rỗng, không chạm DB',
    async (q) => {
      const find = vi.fn();
      const result = await new PublicSuggestionService({
        find,
      } as unknown as PublicSuggestionRepository).find(query(q));
      expect(result).toEqual({ chuyenKhoa: [], dichVu: [], bacSi: [] });
      expect(find).not.toHaveBeenCalled();
    },
  );

  it('chỉ giữ đúng trường danh sách trắng, id là chuỗi', async () => {
    const find = vi.fn().mockResolvedValue({
      chuyenKhoa: [{ chuyenKhoaId: 3, ten: 'Tim mạch', moTa: 'thừa' }],
      dichVu: [{ dichVuKhamId: '4', ten: 'Khám tim', giaMacDinh: '1.00' }],
      bacSi: [
        {
          bacSiId: '5',
          hoTen: 'Nguyễn Văn A',
          chucDanh: 'BS',
          email: 'x@example.com',
        },
      ],
    });
    const result = await new PublicSuggestionService({
      find,
    } as unknown as PublicSuggestionRepository).find(query('tim'));
    expect(result).toEqual({
      chuyenKhoa: [{ chuyenKhoaId: '3', ten: 'Tim mạch' }],
      dichVu: [{ dichVuKhamId: '4', ten: 'Khám tim' }],
      bacSi: [{ bacSiId: '5', hoTen: 'Nguyễn Văn A', chucDanh: 'BS' }],
    });
    expect(find).toHaveBeenCalledWith('%tim%');
  });

  it('BMS-03: ký tự LIKE trong q bị escape, không thành ký tự đại diện', async () => {
    const find = vi
      .fn()
      .mockResolvedValue({ chuyenKhoa: [], dichVu: [], bacSi: [] });
    await new PublicSuggestionService({
      find,
    } as unknown as PublicSuggestionRepository).find(query('100%_x'));
    expect(find).toHaveBeenCalledWith('%100!%!_x%');
  });
});
