export interface UploadConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  prefix: string;
}

type Env = Record<string, unknown>;
const credentialNames = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const;

// Không bao giờ đưa giá trị cấu hình vào lỗi; ConfigModule gọi cả khi chưa có consumer.
export function readUploadConfig(env: Env): UploadConfig | null {
  const values = credentialNames.map((key) =>
    typeof env[key] === 'string' ? (env[key] as string).trim() : '',
  );
  const missing = credentialNames.filter((_, index) => !values[index]);
  const required = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';
  if (
    missing.length &&
    (required || missing.length !== credentialNames.length)
  ) {
    throw new Error(`Thiếu cấu hình upload: ${missing.join(', ')}`);
  }
  const stage = typeof env.NODE_ENV === 'string' ? env.NODE_ENV : 'development';
  const prefix =
    typeof env.CLOUDINARY_UPLOAD_PREFIX === 'string' &&
    env.CLOUDINARY_UPLOAD_PREFIX !== ''
      ? env.CLOUDINARY_UPLOAD_PREFIX
      : `clinix/${stage}/specialties`;
  if (
    !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(prefix) ||
    prefix.length > 180
  ) {
    throw new Error('CLOUDINARY_UPLOAD_PREFIX không hợp lệ');
  }
  if (missing.length) return null;
  if (
    !/^[a-zA-Z0-9_-]+$/.test(values[0] ?? '') ||
    values.some((value) =>
      Array.from(value).some((character) => character.charCodeAt(0) <= 32),
    )
  ) {
    throw new Error('Cấu hình CLOUDINARY_* không hợp lệ');
  }
  return {
    cloudName: values[0]!,
    apiKey: values[1]!,
    apiSecret: values[2]!,
    prefix,
  };
}
