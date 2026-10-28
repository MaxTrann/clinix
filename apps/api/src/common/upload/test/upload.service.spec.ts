import { ServiceUnavailableException } from '@nestjs/common';
import { ImageProcessor } from '../image-processor.js';
import type { ImageProvider } from '../image-provider.js';
import { UploadRepository } from '../upload.repository.js';
import { UploadService } from '../upload.service.js';

function fixture() {
  const repository = {
    isSystemAdmin: vi.fn().mockResolvedValue(true),
    createPending: vi.fn().mockResolvedValue(undefined),
    confirm: vi.fn().mockResolvedValue(undefined),
    markUnknown: vi.fn().mockResolvedValue(undefined),
  };
  const processor = {
    process: vi.fn().mockResolvedValue(Buffer.from('ket-qua')),
  };
  const provider = {
    configured: true,
    prefix: 'clinix/test/specialties',
    upload: vi.fn().mockResolvedValue('https://example.test/anh.webp'),
    delete: vi.fn(),
  };
  const service = new UploadService(
    repository as unknown as UploadRepository,
    processor as unknown as ImageProcessor,
    provider as ImageProvider,
  );
  return { service, repository, processor, provider };
}

describe('CK-11/SE-A7 — điều phối upload', () => {
  it('tạo ledger trước provider, chỉ trả thành công sau xác nhận DB', async () => {
    const f = fixture();
    const result = await f.service.upload('1', Buffer.from('anh'), 'anh.png');
    expect(f.repository.createPending.mock.invocationCallOrder[0]).toBeLessThan(
      f.provider.upload.mock.invocationCallOrder[0]!,
    );
    expect(f.repository.confirm).toHaveBeenCalledWith(
      result.uploadId,
      result.url,
      expect.any(Date),
    );
    expect(
      Date.parse(result.expiresAt) -
        f.repository.createPending.mock.calls[0]![3].getTime(),
    ).toBe(86_400_000);
  });
  it('sai phạm vi không giải mã, không ghi DB, không gọi provider', async () => {
    const f = fixture();
    f.repository.isSystemAdmin.mockResolvedValue(false);
    await expect(
      f.service.upload('1', Buffer.alloc(0), 'anh'),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.processor.process).not.toHaveBeenCalled();
    expect(f.repository.createPending).not.toHaveBeenCalled();
  });
  it('lỗi xử lý ảnh không gọi provider/không tạo ledger', async () => {
    const f = fixture();
    f.processor.process.mockRejectedValue(new Error('image failure'));
    await expect(
      f.service.upload('1', Buffer.alloc(0), 'anh'),
    ).rejects.toThrow();
    expect(f.provider.upload).not.toHaveBeenCalled();
    expect(f.repository.createPending).not.toHaveBeenCalled();
  });
  it('provider lỗi không confirm và giữ dấu để kiểm tra thủ công', async () => {
    const f = fixture();
    f.provider.upload.mockRejectedValue(new ServiceUnavailableException());
    await expect(
      f.service.upload('1', Buffer.from('anh'), 'anh.png'),
    ).rejects.toMatchObject({ status: 503 });
    expect(f.repository.markUnknown).toHaveBeenCalledOnce();
    expect(f.repository.confirm).not.toHaveBeenCalled();
    expect(f.provider.upload).toHaveBeenCalledOnce();
  });
  it('DB confirm lỗi không báo thành công và không xóa ảnh vội', async () => {
    const f = fixture();
    f.repository.confirm.mockRejectedValue(new Error('db'));
    await expect(
      f.service.upload('1', Buffer.from('anh'), 'anh.png'),
    ).rejects.toThrow('db');
    expect(f.provider.delete).not.toHaveBeenCalled();
  });
});
