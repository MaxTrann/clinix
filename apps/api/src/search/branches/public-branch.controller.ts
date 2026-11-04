import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator.js';
import type { Paged } from '../../common/paging/paged.js';
import { PUBLIC_ROUTE_PREFIX } from '../search.constants.js';
import {
  PublicBranchQueryDto,
  type PublicBranchDetail,
  type PublicBranchItem,
} from './public-branch.dto.js';
import { PublicBranchService } from './public-branch.service.js';

// Route công khai: không đọc token, không @Roles, chỉ GET (PLAN 5.2). Controller chỉ nhận/trả.
@Controller(`${PUBLIC_ROUTE_PREFIX}/branches`)
@Public()
export class PublicBranchController {
  constructor(private readonly branches: PublicBranchService) {}

  @Get()
  list(@Query() query: PublicBranchQueryDto): Promise<Paged<PublicBranchItem>> {
    return this.branches.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<PublicBranchDetail> {
    return this.branches.detail(id);
  }
}
