export abstract class ImageProvider {
  abstract readonly configured: boolean;
  abstract readonly prefix: string;
  abstract upload(data: Buffer, publicId: string): Promise<string>;
  abstract delete(publicId: string): Promise<void>;
}
