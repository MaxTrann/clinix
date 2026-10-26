// Chạy MỘT lần trước mọi test tích hợp: tạo lại DB test từ đầu và áp dụng toàn bộ migration,
// nên mỗi lần chạy test đều kiểm luôn việc dựng schema từ con số 0.
import {
  createMigratedTestDatabase,
  readTestDbSettings,
} from './test-database.js';

export default async function setup(): Promise<void> {
  const dataSource = await createMigratedTestDatabase(readTestDbSettings());
  await dataSource.destroy();
}
