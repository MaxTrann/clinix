import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { ARGON2_OPTIONS } from './auth.constants.js';

// Băm và so mật khẩu bằng Argon2id (S6). Đây là loại băm riêng cho MẬT KHẨU (H10):
// OTP dùng HMAC-SHA-256, refresh token dùng SHA-256, nên không dùng lẫn hàm này cho chúng.
@Injectable()
export class PasswordHasher implements OnModuleInit {
  private readonly logger = new Logger(PasswordHasher.name);
  private dummyHash?: Promise<string>;

  // Muối ngẫu nhiên 16 byte do thư viện tự sinh; kết quả dạng chuỗi PHC `$argon2id$v=19$m=...$muối$băm`
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTIONS);
  }

  // Tham số tra từ chính chuỗi băm đã lưu, nên đổi tham số S6 sau này không làm hỏng mật khẩu cũ.
  // Băm lưu bị hỏng thì coi như mật khẩu sai (không làm đăng nhập trả 500). Log chỉ ghi câu cố định,
  // không ghi chuỗi băm hay thông điệp lỗi của thư viện.
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      this.logger.warn(
        'Không đọc được chuỗi băm mật khẩu đã lưu; coi như mật khẩu sai',
      );
      return false;
    }
  }

  // Hàm so giả (H7, DN-05/DN-06): đăng nhập với email KHÔNG tồn tại vẫn tốn đúng một lần so Argon2id,
  // để thời gian phản hồi không cho biết email có trong hệ thống hay không. Luôn trả false.
  async verifyDummy(plain: string): Promise<false> {
    await argon2.verify(await this.getDummyHash(), plain);
    return false;
  }

  // Băm giả tạo sẵn lúc khởi động để yêu cầu đầu tiên không chậm hơn các yêu cầu sau
  async onModuleInit(): Promise<void> {
    await this.getDummyHash();
  }

  // Băm giả sinh bằng chính ARGON2_OPTIONS (không ghi cứng một chuỗi băm) nên luôn cùng tham số với băm thật.
  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hash(randomBytes(24).toString('base64')).catch(
      (error: unknown) => {
        this.dummyHash = undefined; // lỗi thì lần sau thử lại, không nhớ kết quả lỗi
        throw error;
      },
    );
    return this.dummyHash;
  }
}
