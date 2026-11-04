import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator.js';
import { PUBLIC_ROUTE_PREFIX } from '../search.constants.js';
import {
  PublicSpecialtyDetailQueryDto,
  PublicSpecialtyQueryDto,
  type PublicSpecialtyDetail,
  type PublicSpecialtyPage,
} from './public-specialty.dto.js';
import { PublicSpecialtyService } from './public-specialty.service.js';

// Route công khai: không đọc token, không @Roles, chỉ GET (PLAN 5.2). Controller chỉ nhận/trả.
@Controller(`${PUBLIC_ROUTE_PREFIX}/specialties`)
@Public()
export class PublicSpecialtyController {
  constructor(private readonly specialties: PublicSpecialtyService) {}

  @Get()
  list(@Query() query: PublicSpecialtyQueryDto): Promise<PublicSpecialtyPage> {
    return this.specialties.list(query);
  }

  @Get(':id')
  detail(
    @Param('id') id: string,
    @Query() query: PublicSpecialtyDetailQueryDto,
  ): Promise<PublicSpecialtyDetail> {
    return this.specialties.detail(id, query.chiNhanhId);
  }
}
