import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../errors/app.exception.js';
import { validationExceptionFactory } from '../../errors/validation-exception.js';
import { PageQueryDto } from '../page-query.dto.js';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: validationExceptionFactory,
});

const metadata = {
  type: 'query' as const,
  metatype: PageQueryDto,
  data: undefined,
};

describe('PageQueryDto (TK-05)', () => {
  it('dùng mặc định page=1/pageSize=20 và chuyển query string sang số', async () => {
    const defaults = (await pipe.transform({}, metadata)) as PageQueryDto;
    const firstPage = (await pipe.transform(
      { page: '3', pageSize: '25' },
      metadata,
    )) as PageQueryDto;

    expect(defaults).toMatchObject({ page: 1, pageSize: 20, offset: 0 });
    expect(firstPage).toMatchObject({ page: 3, pageSize: 25, offset: 50 });
  });

  it.each([
    ['page zero', { page: '0' }],
    ['negative page', { page: '-1' }],
    ['non-integer page', { page: '1.5' }],
    ['non-numeric page', { page: 'abc' }],
    ['pageSize zero', { pageSize: '0' }],
    ['pageSize 101', { pageSize: '101' }],
    ['negative pageSize', { pageSize: '-1' }],
  ])(
    'rejects %s with the standard 400 validation response',
    async (_, query) => {
      const error = await pipe
        .transform(query, metadata)
        .catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(400);
      expect((error as AppException).maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
    },
  );

  it('accepts the maximum page size of 100', async () => {
    const result = (await pipe.transform(
      { pageSize: '100' },
      metadata,
    )) as PageQueryDto;

    expect(result.pageSize).toBe(100);
  });
});
