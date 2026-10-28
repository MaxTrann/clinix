import {
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Agent } from 'node:https';
import type { UploadConfig } from './upload-config.js';
import { ImageProvider } from './image-provider.js';
import { SPECIALTY_IMAGE_POLICY as P } from './upload-policy.js';

// Không truyền lỗi SDK/cause ra ngoài vì có thể mang URL, credential hoặc payload provider.
export class CloudinaryImageProvider extends ImageProvider {
  readonly configured: boolean;
  readonly prefix: string;
  constructor(private readonly settings: UploadConfig | null) {
    super();
    this.configured = settings !== null;
    this.prefix = settings?.prefix ?? '';
  }

  private options() {
    if (!this.settings) throw new ServiceUnavailableException();
    return {
      cloud_name: this.settings.cloudName,
      api_key: this.settings.apiKey,
      api_secret: this.settings.apiSecret,
      secure: true,
      timeout: P.providerMs,
    };
  }

  upload(data: Buffer, publicId: string): Promise<string> {
    const options = this.options();
    return new Promise((resolve, reject) => {
      let settled = false;
      const agent = new Agent({ keepAlive: false });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stream = cloudinary.uploader.upload_stream(
        {
          ...options,
          agent,
          public_id: publicId,
          resource_type: 'image',
          type: 'upload',
          overwrite: false,
          unique_filename: false,
        },
        (error, result) => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          agent.destroy();
          if (
            error ||
            !result ||
            result.public_id !== publicId ||
            typeof result.secure_url !== 'string' ||
            !result.secure_url.startsWith('https://') ||
            result.secure_url.length > 2048
          )
            reject(new ServiceUnavailableException());
          else resolve(result.secure_url);
        },
      );
      timer = setTimeout(() => {
        settled = true;
        stream.destroy();
        // Hủy cả socket HTTP, không chỉ Transform của SDK.
        agent.destroy();
        reject(new GatewayTimeoutException());
      }, P.providerMs);
      stream.on('error', () => {
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);
          agent.destroy();
          reject(new ServiceUnavailableException());
        }
      });
      stream.end(data);
    });
  }

  async delete(publicId: string): Promise<void> {
    const options = this.options();
    const agent = new Agent({ keepAlive: false });
    // Agent riêng cho phép đóng socket khi hết deadline; delete idempotent.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // SDK nhận option chung ở runtime nhưng overload destroy khai báo thiếu agent/timeout.
      const requestOptions = {
        ...options,
        agent,
        resource_type: 'image' as const,
        type: 'upload' as const,
        invalidate: true,
      };
      const result: unknown = await Promise.race([
        cloudinary.uploader.destroy(publicId, requestOptions),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            agent.destroy();
            reject(new GatewayTimeoutException());
          }, P.providerMs);
        }),
      ]);
      if (
        typeof result !== 'object' ||
        result === null ||
        !('result' in result) ||
        !['ok', 'not found'].includes(String(result.result))
      )
        throw new ServiceUnavailableException();
    } catch (error) {
      if (error instanceof GatewayTimeoutException) throw error;
      throw new ServiceUnavailableException();
    } finally {
      if (timer) clearTimeout(timer);
      agent.destroy();
    }
  }
}
