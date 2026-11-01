import { Outlet } from 'react-router';
import { OfflineBanner } from '../shared/ui/offline-banner';

export function RootLayout() {
  return (
    <>
      <OfflineBanner />
      <Outlet />
    </>
  );
}
