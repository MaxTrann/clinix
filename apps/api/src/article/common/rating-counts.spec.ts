import type { EntityManager } from 'typeorm';
import { readRatingCounts } from './rating-counts.js';

// article B3: hàm đếm dùng chung (chi tiết công khai, PUT, DELETE) với `manager` giả. Truy vấn thật trên MySQL nằm ở `rating/article-rating.int-spec.ts`.
const managerReturning = (rows: unknown[]) => {
  const query = vi.fn(async () => rows);
  return { manager: { query } as unknown as EntityManager, query };
};

describe('article B3 — readRatingCounts', () => {
  it('ABR-09: không phiếu nào ⇒ hai số 0 (không undefined, không null)', async () => {
    const { manager } = managerReturning([]);
    expect(await readRatingCounts(manager, '7')).toEqual({
      luotThich: 0,
      luotKhongThich: 0,
    });
  });

  it('ABR-02: thiếu một loại ⇒ loại đó là 0, loại kia đúng số', async () => {
    expect(
      await readRatingCounts(
        managerReturning([{ loai: 'Thich', soLuot: 4 }]).manager,
        '7',
      ),
    ).toEqual({ luotThich: 4, luotKhongThich: 0 });
    expect(
      await readRatingCounts(
        managerReturning([{ loai: 'KhongThich', soLuot: 1 }]).manager,
        '7',
      ),
    ).toEqual({ luotThich: 0, luotKhongThich: 1 });
  });

  it('ABR-09: số dòng là chuỗi (driver trả BIGINT) vẫn thành số nguyên; hai loại không lẫn nhau', async () => {
    const result = await readRatingCounts(
      managerReturning([
        { loai: 'KhongThich', soLuot: '2' },
        { loai: 'Thich', soLuot: '3' },
      ]).manager,
      '7',
    );
    expect(result).toEqual({ luotThich: 3, luotKhongThich: 2 });
    expect(typeof result.luotThich).toBe('number');
  });

  it('chỉ gửi một câu SELECT với id bài là tham số (không nối chuỗi)', async () => {
    const { manager, query } = managerReturning([]);
    await readRatingCounts(manager, '123');
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as unknown as [string, string[]];
    expect(sql).toMatch(/^SELECT /);
    expect(sql).toContain('GROUP BY loai');
    expect(sql).not.toContain('123');
    expect(params).toEqual(['123']);
  });
});
