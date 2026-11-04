import type { DataSource, EntityManager } from 'typeorm';

/**
 * Chạy `work` trong MỘT giao dịch chỉ đọc, REPEATABLE READ (PLAN search 5.2, H6): truy vấn danh sách và `COUNT` thấy cùng một
 * ảnh chụp dữ liệu nên `total` luôn khớp `items`. `READ ONLY` làm mọi câu ghi lọt vào đây bị MySQL từ chối.
 */
export async function runReadOnly<T>(
  db: DataSource,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  const runner = db.createQueryRunner();
  await runner.connect();
  try {
    // Đặc tính cho giao dịch kế tiếp; startTransaction thêm mức cô lập rồi mới START TRANSACTION.
    await runner.query('SET TRANSACTION READ ONLY');
    await runner.startTransaction('REPEATABLE READ');
    try {
      const result = await work(runner.manager);
      await runner.commitTransaction();
      return result;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    }
  } finally {
    await runner.release();
  }
}
