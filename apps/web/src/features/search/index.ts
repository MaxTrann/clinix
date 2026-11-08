// Bề mặt công khai của module search: router/ chỉ import từ đây.
export { PublicLayout } from './shell/public-layout';
export { HomePage } from './home/home-page';
export type { PublicLayoutProps } from './shell/public-layout';
export type { PublicNavConfig, PublicNavItem } from './shell/public-nav-types';
export { SpecialtyListPage } from './specialties/specialty-list-page';
export { SpecialtyDetailPage } from './specialties/specialty-detail-page';
export { ServiceGroupPage } from './services/service-group-page';
export { ServiceListPage } from './services/service-list-page';
export { DoctorListPage } from './doctors/doctor-list-page';
export { DoctorTeamPage } from './doctors/doctor-team-page';
export { DoctorDetailPage } from './doctors/doctor-detail-page';
export { DOCTOR_TEAM_PATH } from './search-paths';
export { BOOKING_PATH } from './search-paths';
export { BranchListPage } from './branches/branch-list-page';
export { BranchDetailPage } from './branches/branch-detail-page';
