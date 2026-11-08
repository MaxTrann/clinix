import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import type { RelativesRepository } from '../relatives/relatives.repository.js';
import {
  buildLookupPatterns,
  type LookupPatterns,
} from '../validation/keyword-policy.js';
import type {
  PatientLookupItem,
  PatientLookupQuery,
} from './patient-lookup.dto.js';
import type { PatientLookupRepository } from './patient-lookup.repository.js';
import { PatientLookupService } from './patient-lookup.service.js';

// Task B6 — service điều phối: dựng mẫu LIKE từ từ khoá, ĐẾM TRƯỚC rồi chỉ lấy trang khi `offset < total`, trả đúng bốn khoá, lỗi của repository đi nguyên.
// Repository và kết nối giả; SQL thật ở patient-lookup.repository.spec.ts và patient-lookup.int-spec.ts. Mã ca PLS-nn là [đề xuất] (TRACKING B6-G).
const manager = { marker: 'manager' } as unknown as EntityManager;
const item = (id: string): PatientLookupItem => ({
  taiKhoanId: id,
  hoTen: `Bệnh nhân ${id}`,
  soDienThoai: '0901234567',
  email: `bn${id}@example.invalid`,
  trangThai: 'DangHoatDong',
});

const query = (over: Partial<PatientLookupQuery> = {}): PatientLookupQuery => ({
  q: 'nguyen',
  page: 1,
  pageSize: 20,
  offset: 0,
  ...over,
});

function build(total: number, rows: PatientLookupItem[] = [item('1')]) {
  const count = vi.fn((_em: EntityManager, _patterns: LookupPatterns) =>
    Promise.resolve(total),
  );
  const findPage = vi.fn(() => Promise.resolve(rows));
  const service = new PatientLookupService(
    { manager } as unknown as DataSource,
    {
      count,
      findPage,
    } as unknown as PatientLookupRepository,
    {} as unknown as RelativesRepository,
  );
  return { service, count, findPage };
}

describe('PatientLookupService.search', () => {
  it('PLS-01 (TC-01, TC-02) truyền cho repository ĐÚNG ba mẫu dựng từ từ khoá (họ tên đã gấp đ, SĐT chỉ khi toàn chữ số) và manager của kết nối', async () => {
    const text = build(1);
    await text.service.search(query({ q: 'Đặng' }));
    expect(text.count).toHaveBeenCalledWith(
      manager,
      buildLookupPatterns('Đặng'),
    );
    expect(text.count.mock.calls[0]?.[1]).toStrictEqual({
      name: '%dặng%',
      email: '%Đặng%',
      phone: null,
    });

    const digits = build(1);
    await digits.service.search(query({ q: '0901 234 567' }));
    expect(digits.count.mock.calls[0]?.[1]).toStrictEqual({
      name: '%0901 234 567%',
      email: '%0901 234 567%',
      phone: '%0901234567%',
    });
  });

  it('PLS-02 (TC-09) đếm TRƯỚC, chỉ lấy trang khi offset < total: total 0, offset bằng total, offset vượt total, page rất lớn ⇒ items [] và KHÔNG gọi câu trang', async () => {
    for (const [total, offset] of [
      [0, 0],
      [20, 20],
      [5, 40],
      [3, 1.8446744073709552e20], // page = 9223372036854775807, pageSize 20: MySQL sẽ báo 1064 nếu OFFSET này được gửi đi
    ] as const) {
      const { service, count, findPage } = build(total);

      const result = await service.search(query({ offset }));

      expect(count).toHaveBeenCalledOnce();
      expect(findPage).not.toHaveBeenCalled();
      expect(result.items).toStrictEqual([]);
      expect(result.total).toBe(total);
    }
  });

  it('PLS-02b (TC-09) offset = total - 1 (hàng cuối) ⇒ gọi câu trang với đúng (pageSize, offset); thứ tự: đếm xong mới lấy trang', async () => {
    const order: string[] = [];
    const count = vi.fn(() => {
      order.push('count');
      return Promise.resolve(41);
    });
    const findPage = vi.fn(() => {
      order.push('findPage');
      return Promise.resolve([item('41')]);
    });
    const service = new PatientLookupService(
      { manager } as unknown as DataSource,
      {
        count,
        findPage,
      } as unknown as PatientLookupRepository,
      {} as unknown as RelativesRepository,
    );

    const result = await service.search(
      query({ page: 3, pageSize: 20, offset: 40 }),
    );

    expect(order).toStrictEqual(['count', 'findPage']);
    expect(findPage).toHaveBeenCalledWith(
      manager,
      buildLookupPatterns('nguyen'),
      20,
      40,
    );
    expect(result.items).toStrictEqual([item('41')]);
  });

  it('PLS-03 (TC-10) phản hồi đúng bốn khoá items, total, page, pageSize; total là số; page và pageSize đúng giá trị gửi; items là kết quả của repository', async () => {
    const rows = [item('1'), item('2')];
    const { service } = build(37, rows);

    const result = await service.search(
      query({ page: 2, pageSize: 2, offset: 2 }),
    );

    expect(Object.keys(result).sort()).toStrictEqual([
      'items',
      'page',
      'pageSize',
      'total',
    ]);
    expect(result).toStrictEqual({
      items: rows,
      total: 37,
      page: 2,
      pageSize: 2,
    });
    expect(typeof result.total).toBe('number');
  });

  it('PLS-04 (TC-04) không khớp ai không phải lỗi: không ném, { items: [], total: 0, page: 1, pageSize: 20 }', async () => {
    const { service } = build(0);

    await expect(service.search(query())).resolves.toStrictEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });

  it('PLS-05 (BM-02) lỗi của repository, ở câu đếm lẫn câu trang, đi nguyên: không bọc, không nuốt, không đổi thông điệp', async () => {
    const failure = new Error('mất kết nối');
    const countFails = new PatientLookupService(
      { manager } as unknown as DataSource,
      {
        count: vi.fn(() => Promise.reject(failure)),
        findPage: vi.fn(),
      } as unknown as PatientLookupRepository,
      {} as unknown as RelativesRepository,
    );
    await expect(countFails.search(query())).rejects.toBe(failure);

    const pageFails = new PatientLookupService(
      { manager } as unknown as DataSource,
      {
        count: vi.fn(() => Promise.resolve(5)),
        findPage: vi.fn(() => Promise.reject(failure)),
      } as unknown as PatientLookupRepository,
      {} as unknown as RelativesRepository,
    );
    await expect(pageFails.search(query())).rejects.toBe(failure);
  });
});
