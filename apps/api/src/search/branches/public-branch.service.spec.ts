import { AppException } from '../../common/errors/app.exception.js';
import { PublicBranchQueryDto } from './public-branch.dto.js';
import type { PublicBranchRepository } from './public-branch.repository.js';
import { PublicBranchService } from './public-branch.service.js';

// B1 — logic ghép dữ liệu, repository giả (TCN-06, TCN-08).
const branchRow = {
  chiNhanhId: '1',
  ten: 'Chi nhánh A',
  diaChi: 'Địa chỉ A',
  toaDoLat: null,
  toaDoLng: null,
  // Cột thừa từ repository: service phải loại bỏ (danh sách trắng).
  matKhau: 'khong-duoc-lo',
};

function makeService(repo: Partial<PublicBranchRepository>) {
  return new PublicBranchService(repo as PublicBranchRepository);
}

describe('B1 — PublicBranchService', () => {
  it('list: trả page/pageSize của query và chỉ giữ năm trường công khai', async () => {
    const service = makeService({
      findPage: () =>
        Promise.resolve({ items: [branchRow as never], total: 41 }),
    });
    const query = Object.assign(new PublicBranchQueryDto(), {
      page: 3,
      pageSize: 10,
    });
    const result = await service.list(query);
    expect(result).toMatchObject({ total: 41, page: 3, pageSize: 10 });
    expect(Object.keys(result.items[0] ?? {}).sort()).toEqual(
      ['chiNhanhId', 'diaChi', 'ten', 'toaDoLat', 'toaDoLng'].sort(),
    );
  });

  it('TCN-06: detail luôn có 7 thứ; thứ không có dòng ⇒ hoatDong null', async () => {
    const service = makeService({
      findDetail: () =>
        Promise.resolve({
          branch: branchRow as never,
          schedule: [
            {
              thuTrongTuan: 2,
              hoatDong: true,
              gioBatDauSang: '08:00:00',
              gioKetThucSang: '12:00:00',
              gioBatDauChieu: null,
              gioKetThucChieu: null,
            },
          ],
          services: [{ dichVuKhamId: '7', ten: 'Khám tổng quát' }],
          doctorCount: 3,
        }),
    });
    const detail = await service.detail('1');
    expect(detail.lichHoatDong).toHaveLength(7);
    expect(detail.lichHoatDong[0]?.hoatDong).toBeNull();
    expect(detail.lichHoatDong[1]?.hoatDong).toEqual({
      sang: { tu: '08:00', den: '12:00' },
      chieu: null,
    });
    expect(detail.soBacSi).toBe(3);
    expect(detail.dichVuKham).toEqual([
      { dichVuKhamId: '7', ten: 'Khám tổng quát' },
    ]);
    expect(detail).not.toHaveProperty('matKhau');
  });

  it('TCN-08: không có dòng ⇒ 404 KHONG_TIM_THAY', async () => {
    const service = makeService({ findDetail: () => Promise.resolve(null) });
    await expect(service.detail('5')).rejects.toMatchObject({
      constructor: AppException,
      status: 404,
    });
  });

  it('TCN-08: id sai dạng ⇒ 404 và không chạm DB', async () => {
    const findDetail = vi.fn();
    const service = makeService({ findDetail });
    for (const id of ['abc', '-1', '0', '9223372036854775808', '1e3']) {
      await expect(service.detail(id)).rejects.toBeInstanceOf(AppException);
    }
    expect(findDetail).not.toHaveBeenCalled();
  });
});
