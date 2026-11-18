import { vi } from 'vitest';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import type { SystemConfigHistoryRepository } from '../system-config-history.repository.js';
import { SystemConfigHistoryService } from '../system-config-history.service.js';

// Service lịch sử cấu hình (admin B6; TRACKING 9A.4 mục 3): CHB6-08, CHB6-09, CHB6-09b. Repository giả, chính sách thật.
const system: AdminScope = { kind: 'ToanHeThong' };
const branch: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '12' };

const AT = new Date(Date.UTC(2026, 10, 18, 3, 15, 3));
const ROW = {
  id: '57',
  thoiDiem: AT,
  hoTen: 'Nguyễn Văn A',
  changes: {
    truoc: { thoi_gian_giu_cho: 15 },
    sau: { thoi_gian_giu_cho: 20 },
    ly_do: 'Tăng giờ giữ chỗ',
  },
};

// Hàng đầu vào giống `PageQueryDto` (offset là getter của lớp thật; ở đây truyền sẵn giá trị)
const page = (pageNo: number, pageSize: number) => ({
  page: pageNo,
  pageSize,
  offset: (pageNo - 1) * pageSize,
});

function setup() {
  const repository = {
    list: vi.fn().mockResolvedValue({ rows: [ROW], total: 41 }),
  };
  const service = new SystemConfigHistoryService(
    repository as unknown as SystemConfigHistoryRepository,
    new BranchAccessPolicy(),
  );
  return { repository, service };
}

describe('B6 CH-19 — SystemConfigHistoryService', () => {
  it('CHB6-08 (CH-09): Admin Chi nhánh ⇒ 403 KHONG_DU_QUYEN TRƯỚC mọi truy vấn (repository không bị gọi)', async () => {
    const { repository, service } = setup();
    await expect(service.history(branch, page(1, 20))).rejects.toMatchObject({
      status: 403,
      maLoi: 'KHONG_DU_QUYEN',
    });
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('CHB6-08b: 403 đi TRƯỚC 400: Chi nhánh kèm page rất lớn vẫn nhận 403, không lộ kiểm tra phân trang', async () => {
    const { repository, service } = setup();
    await expect(
      service.history(branch, page(1_000_000_000_000_000_000, 20)),
    ).rejects.toMatchObject({ status: 403, maLoi: 'KHONG_DU_QUYEN' });
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('CHB6-09: Toàn hệ thống: chuyển đúng offset và pageSize, trả {items, total, page, pageSize} giữ nguyên page, pageSize đầu vào; items qua mapper', async () => {
    const { repository, service } = setup();
    const result = await service.history(system, page(3, 10));
    expect(repository.list).toHaveBeenCalledExactlyOnceWith(page(3, 10));
    expect(result).toStrictEqual({
      items: [
        {
          id: '57',
          thoiDiem: '2026-11-18T03:15:03.000Z',
          nguoiThucHien: 'Nguyễn Văn A',
          lyDo: 'Tăng giờ giữ chỗ',
          thayDoi: [{ khoa: 'thoiGianGiuCho', truoc: 15, sau: 20 }],
        },
      ],
      total: 41,
      page: 3,
      pageSize: 10,
    });
  });

  it('CHB6-09: chưa có lịch sử ⇒ items rỗng, total 0 (không ném lỗi)', async () => {
    const { repository, service } = setup();
    repository.list.mockResolvedValue({ rows: [], total: 0 });
    expect(await service.history(system, page(1, 20))).toStrictEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });

  it('CHB6-09b: offset không phải số nguyên an toàn (page 1e18) ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm loi[{page, TRANG_KHONG_HOP_LE}], repository KHÔNG bị gọi', async () => {
    const { repository, service } = setup();
    await expect(
      service.history(system, page(1_000_000_000_000_000_000, 20)),
    ).rejects.toMatchObject({
      status: 400,
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      response: {
        loi: [{ truong: 'page', ma: 'TRANG_KHONG_HOP_LE' }],
      },
    });
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('CHB6-09b: biên: offset đúng Number.MAX_SAFE_INTEGER vẫn qua, MAX_SAFE_INTEGER + 1 thì 400; offset âm bị chặn', async () => {
    const { repository, service } = setup();
    const at = (offset: number) => ({ page: 1, pageSize: 20, offset });
    await service.history(system, at(Number.MAX_SAFE_INTEGER));
    expect(repository.list).toHaveBeenCalledTimes(1);
    for (const offset of [Number.MAX_SAFE_INTEGER + 1, -1, Number.NaN]) {
      await expect(service.history(system, at(offset))).rejects.toMatchObject({
        status: 400,
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
      });
    }
    expect(repository.list).toHaveBeenCalledTimes(1);
  });

  it('CHB6-09b: lỗi của repository (không phải 400 phân trang) lan ra nguyên vẹn, không bị nuốt', async () => {
    const { repository, service } = setup();
    const error = new Error('mất kết nối');
    repository.list.mockRejectedValue(error);
    await expect(service.history(system, page(1, 20))).rejects.toBe(error);
  });
});
