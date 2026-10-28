import { PassThrough } from 'node:stream';
import { Agent } from 'node:https';
import { v2 as cloudinary } from 'cloudinary';
import type {
  UploadApiOptions,
  UploadApiResponse,
  UploadApiErrorResponse,
  UploadStream,
} from 'cloudinary';
import type { Mock } from 'vitest';
import { CloudinaryImageProvider } from '../cloudinary-image.provider.js';
import { fakeSecretValue } from '../../testing/sample-secrets.js';
import { SPECIALTY_IMAGE_POLICY as P } from '../upload-policy.js';

vi.mock('cloudinary', () => ({
  v2: { uploader: { upload_stream: vi.fn(), destroy: vi.fn() } },
}));
type UploadCallback = (
  error: UploadApiErrorResponse | undefined,
  result: UploadApiResponse | undefined,
) => void;
const uploadMock = vi.mocked(
  cloudinary.uploader.upload_stream,
) as unknown as Mock<
  (options: UploadApiOptions, callback: UploadCallback) => UploadStream
>;
const settings = {
  cloudName: 'clinix-test',
  apiKey: 'test-key',
  apiSecret: fakeSecretValue('cloudinary'),
  prefix: 'clinix/test/specialties',
};

describe('CK-11/SE-A7 — adapter Cloudinary không network thật', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('không cấu hình thì không gọi SDK', async () => {
    const provider = new CloudinaryImageProvider(null);
    expect(provider.configured).toBe(false);
    expect(() => provider.upload(Buffer.from('a'), 'id')).toThrow();
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });
  it('upload gắn public_id tường minh, không overwrite; chỉ thành công sau callback', async () => {
    const stream = new PassThrough();
    uploadMock.mockImplementationOnce((options, callback) => {
      queueMicrotask(() =>
        callback?.(undefined, {
          public_id: 'id',
          secure_url: 'https://example.test/id',
        } as never),
      );
      expect(options).toMatchObject({
        public_id: 'id',
        overwrite: false,
        resource_type: 'image',
        timeout: P.providerMs,
      });
      return stream as never;
    });
    await expect(
      new CloudinaryImageProvider(settings).upload(Buffer.from('a'), 'id'),
    ).resolves.toBe('https://example.test/id');
  });
  it('callback lỗi được làm sạch, không giữ payload hoặc secret trong cause', async () => {
    uploadMock.mockImplementationOnce((_options, callback) => {
      queueMicrotask(() =>
        callback?.({ message: settings.apiSecret } as never, undefined),
      );
      return new PassThrough() as never;
    });
    try {
      await new CloudinaryImageProvider(settings).upload(
        Buffer.from('a'),
        'id',
      );
    } catch (error) {
      expect(String(error)).not.toContain(settings.apiSecret);
      expect(error).toMatchObject({ status: 503 });
      expect((error as Error).cause).toBeUndefined();
    }
  });
  it('deadline đóng stream và Agent/socket, callback muộn không đổi kết quả', async () => {
    vi.useFakeTimers();
    const stream = new PassThrough();
    const destroy = vi.spyOn(Agent.prototype, 'destroy');
    vi.mocked(cloudinary.uploader.upload_stream).mockReturnValueOnce(
      stream as never,
    );
    const pending = new CloudinaryImageProvider(settings).upload(
      Buffer.from('a'),
      'id',
    );
    const rejected = expect(pending).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(P.providerMs);
    await rejected;
    expect(stream.destroyed).toBe(true);
    expect(destroy).toHaveBeenCalled();
  });
  it.each(['ok', 'not found'])(
    'delete %s là kết quả hoàn tất, có invalidate',
    async (result) => {
      vi.mocked(cloudinary.uploader.destroy).mockResolvedValueOnce({ result });
      await expect(
        new CloudinaryImageProvider(settings).delete('id'),
      ).resolves.toBeUndefined();
      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
        'id',
        expect.objectContaining({ invalidate: true, resource_type: 'image' }),
      );
    },
  );
  it('delete lỗi hoặc hết deadline không giả vờ thành công', async () => {
    vi.mocked(cloudinary.uploader.destroy).mockRejectedValueOnce(
      new Error(settings.apiSecret),
    );
    await expect(
      new CloudinaryImageProvider(settings).delete('id'),
    ).rejects.toMatchObject({ status: 503 });
    vi.useFakeTimers();
    vi.mocked(cloudinary.uploader.destroy).mockReturnValueOnce(
      new Promise(() => {}),
    );
    const pending = new CloudinaryImageProvider(settings).delete('id');
    const rejected = expect(pending).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(P.providerMs);
    await rejected;
  });
});
