import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

// Mở route (hoặc cả controller) cho người chưa đăng nhập. Mặc định MỌI route cần đăng nhập (JwtAuthGuard toàn cục),
// nên chỉ endpoint công khai mới cần decorator này: /health, đăng ký, đăng nhập, refresh, logout…
// Route @Public không đọc token và không có người dùng hiện tại; đừng dùng cùng @Roles() (RolesGuard sẽ trả 401).
export const Public = (): CustomDecorator<string> =>
  SetMetadata(IS_PUBLIC_KEY, true);
