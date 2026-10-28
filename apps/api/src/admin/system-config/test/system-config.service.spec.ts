import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { CauHinhHeThong } from '../../entities/cau-hinh-he-thong.entity.js';
import { SystemConfigRepository } from '../system-config.repository.js';
import { SystemConfigService } from '../system-config.service.js';

describe('CH-10 — đọc cấu hình dùng chung', () => {
  // Không initialize: mọi truy vấn được thay bằng spy, không mở kết nối DB.
  const repository = new SystemConfigRepository(
    new DataSource({ type: 'mysql' }),
  );
  const configs = {
    get: vi.spyOn(repository, 'get'),
    count: vi.spyOn(repository, 'count'),
  };
  let service: SystemConfigService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new SystemConfigService(repository);
  });
  afterEach(() => vi.spyOn(Logger.prototype, 'warn').mockRestore());

  it('thiếu dòng: get trả null, getOrThrow trả 409 đúng contract', async () => {
    configs.get.mockResolvedValue(null);
    expect(await service.get()).toBeNull();
    await expect(service.getOrThrow()).rejects.toMatchObject({
      maLoi: 'HE_THONG_CHUA_CAU_HINH',
      status: 409,
      response: {
        maLoi: 'HE_THONG_CHUA_CAU_HINH',
        thongBao: 'Hệ thống chưa được cấu hình.',
      },
    });
  });

  it('không cache null hoặc cấu hình; giữ nguyên giá trị 0 và decimal', async () => {
    const first = {
      id: 1,
      thoiGianGiuCho: 15,
      soLichHenToiDaMoiHoSo: 3,
      soLanTuDoiLichToiDa: 0,
      checkInTruocPhut: 30,
      checkInSauPhut: 15,
      thoiHanPhanHoiLoiMoi: 60,
      soMucChoToiDa: 0,
      nguongNoShow: 3,
      soNgayBaoTruocDoiGioLam: 3,
      trongSoW1: '0.60',
      trongSoW2: '0.40',
      thoiDiemNhacLich: [72, 24, 2],
    } satisfies CauHinhHeThong;
    const updated = { ...first, soLanTuDoiLichToiDa: 2 };
    configs.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(updated);
    expect(await service.get()).toBeNull();
    expect(await service.getOrThrow()).toBe(first);
    expect(await service.getOrThrow()).toBe(updated);
    expect(configs.get).toHaveBeenCalledTimes(3);
  });

  it('lỗi đọc DB không biến thành lỗi chưa cấu hình', async () => {
    const error = new Error('TEST_DB_UNAVAILABLE');
    configs.get.mockRejectedValue(error);
    await expect(service.get()).rejects.toBe(error);
    await expect(service.getOrThrow()).rejects.toBe(error);
  });

  it('khởi động thiếu dòng: cảnh báo một lần và tiếp tục', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    configs.count.mockResolvedValue(0);
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'Hệ thống chưa được cấu hình. Các chức năng cần cấu hình sẽ từ chối xử lý cho đến khi được thiết lập.',
    );
  });

  it('khởi động đã có cấu hình: không cảnh báo thiếu dòng', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    configs.count.mockResolvedValue(1);
    await service.onApplicationBootstrap();
    expect(warn).not.toHaveBeenCalled();
  });

  it('khởi động lỗi DB: không nuốt lỗi hoặc cảnh báo nhầm thiếu cấu hình', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const error = new Error('TEST_DB_UNAVAILABLE');
    configs.count.mockRejectedValue(error);
    await expect(service.onApplicationBootstrap()).rejects.toBe(error);
    expect(warn).not.toHaveBeenCalled();
  });
});
