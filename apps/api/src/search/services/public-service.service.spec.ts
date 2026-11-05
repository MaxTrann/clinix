import 'reflect-metadata';
import { AppException } from '../../common/errors/app.exception.js';
import {
  PublicServiceGroupQueryDto,
  PublicServiceQueryDto,
} from './public-service.dto.js';
import type { PublicServiceRepository } from './public-service.repository.js';
import { PublicServiceService } from './public-service.service.js';

// B3 — kiểm id lọc và danh sách trắng, repository giả (TBS-01, TBS-02, TBS-15).
const makeService = (repo: Partial<PublicServiceRepository>) =>
  new PublicServiceService(repo as PublicServiceRepository);

async function errorOf(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    return error as AppException;
  }
  throw new Error('Mong đợi lỗi nhưng không có');
}

describe('B3 — PublicServiceService', () => {
  it('listGroups: chỉ giữ năm trường công khai, truyền chi nhánh đã kiểm', async () => {
    const findGroups = vi.fn().mockResolvedValue([
      {
        nhomDichVuId: '1',
        ten: 'Khám chuyên khoa',
        soDichVu: 2,
        giaTu: '200000.00',
        sapTrienKhai: false,
        // Cột thừa từ repository: service phải loại bỏ (danh sách trắng).
        thuTuHienThi: 3,
      },
    ]);
    const query = Object.assign(new PublicServiceGroupQueryDto(), {
      chiNhanhId: '7',
    });
    const { items } = await makeService({ findGroups }).listGroups(query);
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(
      ['giaTu', 'nhomDichVuId', 'sapTrienKhai', 'soDichVu', 'ten'].sort(),
    );
    expect(findGroups).toHaveBeenCalledWith('7');
  });

  it('listGroups: không có chiNhanhId ⇒ gọi repository với null', async () => {
    const findGroups = vi.fn().mockResolvedValue([]);
    await makeService({ findGroups }).listGroups(
      new PublicServiceGroupQueryDto(),
    );
    expect(findGroups).toHaveBeenCalledWith(null);
  });

  it('listServices: chỉ giữ bảy trường công khai, truyền chi nhánh và nhóm', async () => {
    const findServices = vi.fn().mockResolvedValue([
      {
        dichVuKhamId: '9',
        ten: 'Tim mạch',
        nhomDichVu: { id: '1', ten: 'Khám chuyên khoa', thuTu: 1 },
        thoiLuong: 30,
        giaMacDinh: '200000.00',
        mucDatCoc: '0.00',
        soBacSi: 2,
        tenCotThua: 'x',
      },
    ]);
    const query = Object.assign(new PublicServiceQueryDto(), {
      chiNhanhId: '7',
      nhomDichVuId: '1',
    });
    const { items } = await makeService({ findServices }).listServices(query);
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(
      [
        'dichVuKhamId',
        'giaMacDinh',
        'mucDatCoc',
        'nhomDichVu',
        'soBacSi',
        'thoiLuong',
        'ten',
      ].sort(),
    );
    expect(Object.keys(items[0]?.nhomDichVu ?? {}).sort()).toEqual([
      'id',
      'ten',
    ]);
    expect(findServices).toHaveBeenCalledWith('7', '1');
  });

  it.each([
    ['chiNhanhId', 'abc'],
    ['chiNhanhId', ''],
    ['chiNhanhId', '0'],
    ['nhomDichVuId', '-1'],
    ['nhomDichVuId', '9223372036854775808'],
  ])(
    'TBS-15: %s=%j ⇒ 400 BO_LOC_KHONG_HOP_LE, không chạm DB',
    async (field, value) => {
      const findServices = vi.fn();
      const query = Object.assign(new PublicServiceQueryDto(), {
        [field]: value,
      });
      const error = await errorOf(
        makeService({ findServices }).listServices(query),
      );
      expect(error).toBeInstanceOf(AppException);
      expect(error.getStatus()).toBe(400);
      expect(JSON.stringify(error.getResponse())).toContain(
        'BO_LOC_KHONG_HOP_LE',
      );
      expect(JSON.stringify(error.getResponse())).toContain(field);
      expect(findServices).not.toHaveBeenCalled();
    },
  );

  it('listGroups: chiNhanhId sai dạng ⇒ 400, không chạm DB', async () => {
    const findGroups = vi.fn();
    const query = Object.assign(new PublicServiceGroupQueryDto(), {
      chiNhanhId: 'abc',
    });
    const error = await errorOf(makeService({ findGroups }).listGroups(query));
    expect(error.getStatus()).toBe(400);
    expect(findGroups).not.toHaveBeenCalled();
  });
});
