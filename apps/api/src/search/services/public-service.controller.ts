import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator.js';
import { PUBLIC_ROUTE_PREFIX } from '../search.constants.js';
import {
  PublicServiceGroupQueryDto,
  PublicServiceQueryDto,
  type PublicItems,
  type PublicServiceGroupItem,
  type PublicServiceItem,
} from './public-service.dto.js';
import { PublicServiceService } from './public-service.service.js';

// Route công khai: không đọc token, không @Roles, chỉ GET (PLAN 5.2). Controller chỉ nhận/trả.
@Controller(PUBLIC_ROUTE_PREFIX)
@Public()
export class PublicServiceController {
  constructor(private readonly services: PublicServiceService) {}

  @Get('service-groups')
  groups(
    @Query() query: PublicServiceGroupQueryDto,
  ): Promise<PublicItems<PublicServiceGroupItem>> {
    return this.services.listGroups(query);
  }

  @Get('services')
  list(
    @Query() query: PublicServiceQueryDto,
  ): Promise<PublicItems<PublicServiceItem>> {
    return this.services.listServices(query);
  }
}
