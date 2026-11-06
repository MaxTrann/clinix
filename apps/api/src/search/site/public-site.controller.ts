import { Controller, Get } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator.js';
import { PUBLIC_ROUTE_PREFIX } from '../search.constants.js';
import type { PublicClinicInfo } from './public-clinic-info.dto.js';
import { PublicClinicInfoService } from './public-clinic-info.service.js';
import type { PublicOverview } from './public-overview.dto.js';
import { PublicOverviewService } from './public-overview.service.js';

// Route công khai: không đọc token, không @Roles (PLAN 5.2).
@Controller(PUBLIC_ROUTE_PREFIX)
@Public()
export class PublicSiteController {
  constructor(
    private readonly clinicInfo: PublicClinicInfoService,
    private readonly overview: PublicOverviewService,
  ) {}

  @Get('clinic-info')
  getClinicInfo(): Promise<PublicClinicInfo> {
    return this.clinicInfo.get();
  }

  @Get('overview')
  getOverview(): Promise<PublicOverview> {
    return this.overview.get();
  }
}
