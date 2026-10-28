import type { ImageProvider } from '../image-provider.js';
import { UploadCleanupService } from '../upload-cleanup.service.js';
import type { UploadRepository } from '../upload.repository.js';

describe('SE-A7 — dọn ảnh sau commit, không xóa nhầm khi lease đã đổi', () => {
  function fixture() {
    const item = {
      id: '1',
      publicId: 'clinix/test/specialties/1',
      token: 'lease',
    };
    const repository = {
      claimCleanup: vi.fn().mockResolvedValue([item]),
      cleanupOwned: vi.fn().mockResolvedValue(true),
      cleanupDone: vi.fn(),
      cleanupFailed: vi.fn(),
    };
    const provider = {
      configured: true,
      prefix: 'clinix/test/specialties',
      upload: vi.fn(),
      delete: vi.fn(),
    };
    const service = new UploadCleanupService(
      repository as unknown as UploadRepository,
      provider as ImageProvider,
    );
    return { item, repository, provider, service };
  }
  it('lease không còn thuộc worker thì không gọi provider', async () => {
    const f = fixture();
    f.repository.cleanupOwned.mockResolvedValue(false);
    await f.service.run();
    expect(f.provider.delete).not.toHaveBeenCalled();
  });
  it('xóa provider thành công mới xóa ledger', async () => {
    const f = fixture();
    await f.service.run();
    expect(f.provider.delete).toHaveBeenCalledWith(f.item.publicId);
    expect(f.repository.cleanupDone).toHaveBeenCalledWith(f.item);
    expect(
      f.repository.cleanupDone.mock.invocationCallOrder[0],
    ).toBeGreaterThan(f.provider.delete.mock.invocationCallOrder[0]!);
  });
  it('provider lỗi giữ ledger/thử lại, không làm đợt dọn bị bỏ dở', async () => {
    const f = fixture();
    f.provider.delete.mockRejectedValue(new Error('provider failure'));
    await f.service.run();
    expect(f.repository.cleanupDone).not.toHaveBeenCalled();
    expect(f.repository.cleanupFailed).toHaveBeenCalledWith(
      f.item,
      expect.any(Date),
    );
  });
});
