import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import type { PublicDoctorRepository } from '../doctors/public-doctor.repository.js';
import { ExamPriceReader } from '../pricing/exam-price.reader.js';
import { PublicSpecialtyQueryDto } from './public-specialty.dto.js';
import type { PublicSpecialtyRepository } from './public-specialty.repository.js';
import { PublicSpecialtyService } from './public-specialty.service.js';

// B2 — logic ghép dữ liệu và kiểm id lọc, repository giả (TCK-06, TCK-08).
const row = {
  chuyenKhoaId: '5',
  ten: 'Tim mạch',
  moTa: null,
  anhDaiDien: null,
  soBacSi: 2,
  // Cột thừa từ repository: service phải loại bỏ (danh sách trắng).
  trangThaiHoatDong: 'DangHoatDong',
};

// Mặc định không có bác sĩ công khai nào, trừ khi test truyền `doctors` riêng.
const noDoctors = {
  findCandidates: vi.fn().mockResolvedValue({ candidates: [], rules: [] }),
} as unknown as PublicDoctorRepository;
const makeService = (
  repo: Partial<PublicSpecialtyRepository>,
  doctors: PublicDoctorRepository = noDoctors,
) =>
  new PublicSpecialtyService(
    repo as PublicSpecialtyRepository,
    doctors,
    new ExamPriceReader({} as DataSource),
  );

async function errorOf(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    return error as AppException;
  }
  throw new Error('Mong đợi lỗi nhưng không có');
}

describe('B2 — PublicSpecialtyService', () => {
  it('list: trả page/pageSize/soCoBacSi và chỉ giữ năm trường công khai', async () => {
    const findPage = vi
      .fn()
      .mockResolvedValue({ items: [row], total: 41, soCoBacSi: 30 });
    const query = Object.assign(new PublicSpecialtyQueryDto(), {
      page: 3,
      pageSize: 10,
      chiNhanhId: '7',
    });
    const result = await makeService({ findPage }).list(query);
    expect(result).toMatchObject({
      total: 41,
      page: 3,
      pageSize: 10,
      soCoBacSi: 30,
    });
    expect(Object.keys(result.items[0] ?? {}).sort()).toEqual(
      ['anhDaiDien', 'chuyenKhoaId', 'moTa', 'soBacSi', 'ten'].sort(),
    );
    expect(findPage).toHaveBeenCalledWith(null, '7', 10, 20);
  });

  it.each(['abc', '', '0', '-1', '9223372036854775808'])(
    'TCK-08: chiNhanhId=%j ⇒ 400 BO_LOC_KHONG_HOP_LE, không chạm DB',
    async (chiNhanhId) => {
      const findPage = vi.fn();
      const query = Object.assign(new PublicSpecialtyQueryDto(), {
        chiNhanhId,
      });
      const error = await errorOf(makeService({ findPage }).list(query));
      expect(error.getStatus()).toBe(400);
      expect(error.maLoi).toBe('BO_LOC_KHONG_HOP_LE');
      expect(error.getResponse()).toMatchObject({
        loi: [{ truong: 'chiNhanhId', ma: 'ID_LOC_KHONG_HOP_LE' }],
      });
      expect(findPage).not.toHaveBeenCalled();
    },
  );

  it('detail: có dữ liệu ⇒ năm trường + giaKhamTu; repository nhận id và chi nhánh', async () => {
    const findDetail = vi.fn().mockResolvedValue(row);
    const detail = await makeService({ findDetail }).detail('5', '7');
    expect(Object.keys(detail).sort()).toEqual(
      [
        'anhDaiDien',
        'chuyenKhoaId',
        'giaKhamTu',
        'moTa',
        'soBacSi',
        'ten',
      ].sort(),
    );
    expect(findDetail).toHaveBeenCalledWith('5', '7');
  });

  it('TCK-07: giaKhamTu = giá áp dụng thấp nhất kèm cọc của dịch vụ đó; lọc đúng chuyên khoa và chi nhánh', async () => {
    const candidate = (giaMacDinh: string, mucDatCoc: string) => ({
      chucDanh: 'BS' as const,
      soNamKinhNghiem: 3,
      giaMacDinh,
      mucDatCoc,
    });
    const findCandidates = vi.fn().mockResolvedValue({
      candidates: [
        candidate('350000.00', '70000.00'),
        candidate('300000.00', '50000.00'),
      ],
      // Không có quy tắc phụ phí ⇒ giá = giá mặc định.
      rules: [],
    });
    const findDetail = vi.fn().mockResolvedValue(row);
    const detail = await makeService({ findDetail }, {
      findCandidates,
    } as unknown as PublicDoctorRepository).detail('5', '7');
    expect(detail.giaKhamTu).toEqual({
      giaKham: '300000.00',
      mucDatCoc: '50000.00',
    });
    expect(findCandidates).toHaveBeenCalledWith({
      dichVuKhamId: null,
      chuyenKhoaId: '5',
      chiNhanhId: '7',
      likePattern: null,
    });
  });

  it('TCK-07: chưa có bác sĩ công khai ⇒ giaKhamTu null', async () => {
    const findDetail = vi.fn().mockResolvedValue(row);
    const detail = await makeService({ findDetail }).detail('5', undefined);
    expect(detail.giaKhamTu).toBeNull();
  });

  it('TCK-06: không có / ngừng ⇒ 404; id sai dạng ⇒ 404 cùng mã, không chạm DB', async () => {
    const findDetail = vi.fn().mockResolvedValue(null);
    const service = makeService({ findDetail });
    const missing = await errorOf(service.detail('999', undefined));
    const malformed = await errorOf(service.detail('abc', undefined));
    expect(missing.getStatus()).toBe(404);
    expect(malformed.getStatus()).toBe(404);
    expect(malformed.getResponse()).toEqual(missing.getResponse());
    expect(findDetail).toHaveBeenCalledTimes(1);
  });

  it('detail: chiNhanhId sai dạng ⇒ 400 BO_LOC_KHONG_HOP_LE', async () => {
    const error = await errorOf(
      makeService({ findDetail: vi.fn() }).detail('5', 'abc'),
    );
    expect(error.getStatus()).toBe(400);
    expect(error.maLoi).toBe('BO_LOC_KHONG_HOP_LE');
  });
});
