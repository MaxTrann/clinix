import {
  CallHandler,
  CanActivate,
  Controller,
  ExecutionContext,
  GatewayTimeoutException,
  Inject,
  Injectable,
  NestInterceptor,
  Post,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Observable, catchError, finalize, throwError, timeout } from 'rxjs';
import {
  CurrentUser,
  currentUserOf,
  type AuthenticatedRequest,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { AppException } from '../errors/app.exception.js';
import { SPECIALTY_IMAGE_POLICY as P } from './upload-policy.js';
import { UploadService } from './upload.service.js';

// Guard scope thật đọc DB trước multipart/interceptor; không dùng stub C1.
@Injectable()
export class SpecialtyUploadGuard implements CanActivate {
  constructor(@Inject(UploadService) private readonly uploads: UploadService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = currentUserOf(
      context.switchToHttp().getRequest<AuthenticatedRequest>(),
    );
    await this.uploads.assertSystemAdmin(user.accountId);
    return true;
  }
}

@Injectable()
export class UploadCapacityInterceptor implements NestInterceptor {
  private active = 0;
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (this.active >= P.concurrent) throw new ServiceUnavailableException();
    this.active++;
    return next.handle().pipe(
      finalize(() => {
        this.active--;
      }),
    );
  }
}

@Injectable()
export class UploadDeadlineInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    // Đặt sau FileInterceptor: deadline xử lý tính từ lúc nhận xong multipart.
    return next.handle().pipe(
      timeout({ first: P.requestMs }),
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof Error && error.name === 'TimeoutError'
            ? new GatewayTimeoutException()
            : error,
        ),
      ),
    );
  }
}

interface ImageFile {
  buffer: Buffer;
  originalname: string;
}

@Controller('admin/uploads')
@Roles('QuanTriVien')
@UseGuards(SpecialtyUploadGuard)
export class UploadController {
  constructor(@Inject(UploadService) private readonly uploads: UploadService) {}

  @Post('specialty-image')
  @UseInterceptors(
    UploadCapacityInterceptor,
    FileInterceptor('file', {
      limits: {
        fileSize: P.inputBytes,
        files: 1,
        fields: 0,
        parts: 1,
        headerPairs: 32,
      },
    }),
    UploadDeadlineInterceptor,
  )
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: ImageFile | undefined,
  ) {
    if (!file) throw new AppException(400, 'ANH_KHONG_HOP_LE');
    return this.uploads.upload(user.accountId, file.buffer, file.originalname);
  }
}
