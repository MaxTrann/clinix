import { fakeSecretValue } from '../../testing/sample-secrets.js';
import { readUploadConfig } from '../upload-config.js';

const valid = {
  CLOUDINARY_CLOUD_NAME: 'clinix-test',
  CLOUDINARY_API_KEY: 'test-key',
  CLOUDINARY_API_SECRET: fakeSecretValue('cloudinary'),
};

describe('SE-A7 — cấu hình Cloudinary', () => {
  it.each(['development', 'test'])(
    '%s cho phép không đặt credential',
    (NODE_ENV) => {
      expect(readUploadConfig({ NODE_ENV })).toBeNull();
      expect(
        readUploadConfig({ NODE_ENV, CLOUDINARY_API_SECRET: '' }),
      ).toBeNull();
    },
  );
  it.each(['production', 'staging'])(
    '%s yêu cầu đủ và thông báo không in giá trị',
    (NODE_ENV) => {
      expect(() =>
        readUploadConfig({
          NODE_ENV,
          CLOUDINARY_API_SECRET: valid.CLOUDINARY_API_SECRET,
        }),
      ).toThrow('CLOUDINARY_CLOUD_NAME');
      try {
        readUploadConfig({ NODE_ENV });
      } catch (error) {
        expect(String(error)).not.toContain(valid.CLOUDINARY_API_SECRET);
      }
      expect(readUploadConfig({ NODE_ENV, ...valid })?.prefix).toBe(
        `clinix/${NODE_ENV}/specialties`,
      );
    },
  );
  it('cấm cấu hình dở dang hoặc prefix traversal', () => {
    expect(() => readUploadConfig({ CLOUDINARY_CLOUD_NAME: 'test' })).toThrow(
      'CLOUDINARY_API_KEY',
    );
    expect(() =>
      readUploadConfig({ ...valid, CLOUDINARY_UPLOAD_PREFIX: '../anh' }),
    ).toThrow('CLOUDINARY_UPLOAD_PREFIX');
  });
});
