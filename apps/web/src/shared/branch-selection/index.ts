// Bề mặt công khai của "chi nhánh đang chọn" (PLAN search Q7f): các feature chỉ import từ đây.
export {
  GeolocationFailure,
  isGeolocationSupported,
  requestPosition,
  type GeolocationFailureReason,
} from './geolocation';
export {
  branchCoordinates,
  haversineKm,
  nearestBranch,
  type BranchPoint,
  type Coordinates,
} from './nearest-branch';
export {
  getSelectedBranch,
  resetSelectedBranchForTest,
  SELECTED_BRANCH_STORAGE_KEY,
  type BranchSelection,
  type BranchSource,
} from './selected-branch-store';
export {
  useSelectedBranch,
  type UseSelectedBranch,
} from './use-selected-branch';
