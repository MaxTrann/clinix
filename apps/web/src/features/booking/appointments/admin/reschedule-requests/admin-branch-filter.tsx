import { useId } from 'react';
import { useSearchParams } from 'react-router';
import { useRemote } from '../../../../../shared/hooks/use-remote';
import { SelectField } from '../../common/filter-controls';
import { getBranchOptions } from '../../common/filter-options-api';
import {
  readRequestFilters,
  writeRequestFilters,
} from '../../common/reschedule-requests/request-query-state';
import { useAdminRequestsScope } from './admin-requests-scope';
import { ADMIN_REQUEST_TEXT } from './admin-requests-text';

// Ô chọn chi nhánh của Quản trị viên Toàn hệ thống (reschedule F5). Danh sách lấy từ route công khai (tối đa 100 chi nhánh đầu), tải khi ô được dựng: lỗi tải chỉ làm ô còn `Tất cả` kèm `Thử lại`, không chặn bảng.
// Chi nhánh đang chọn mà chưa có trong danh sách (đang tải, lỗi, danh sách rút gọn) vẫn hiện thành một lựa chọn để ô không nói dối về bộ lọc đang áp dụng. Đổi chi nhánh thì về trang 1: trang đang xem có thể không tồn
// tại ở chi nhánh mới.
function BranchSelect() {
  const selectId = useId();
  const { branch, setBranch } = useAdminRequestsScope();
  const [params, setParams] = useSearchParams();
  const { state, retry } = useRemote(getBranchOptions, []);
  const options = state.status === 'ready' ? state.data.options : [];
  const known = options.some((option) => option.chiNhanhId === branch);

  const change = (value: string) => {
    const filters = readRequestFilters(params);
    if (filters.page > 1) {
      setParams(writeRequestFilters({ ...filters, page: 1 }), {
        replace: true,
      });
    }
    setBranch(value);
  };

  return (
    <SelectField
      id={selectId}
      label={ADMIN_REQUEST_TEXT.branchLabel}
      what={ADMIN_REQUEST_TEXT.branchWhat}
      value={branch}
      onChange={change}
      failed={state.status === 'error'}
      truncated={state.status === 'ready' && state.data.truncated}
      retry={retry}
    >
      {options.map((option) => (
        <option key={option.chiNhanhId} value={option.chiNhanhId}>
          {option.ten}
        </option>
      ))}
      {branch !== '' && !known && (
        <option value={branch}>{ADMIN_REQUEST_TEXT.selectedBranch}</option>
      )}
    </SelectField>
  );
}

// Toàn hệ thống: ô chọn. Chi nhánh: chỉ một dòng chữ nói đang xem chi nhánh được gán (không ô chọn, không tải danh sách, không gửi tham số).
export function AdminBranchFilter() {
  const { allowBranch, branchName } = useAdminRequestsScope();
  if (!allowBranch) {
    return (
      <p className="mt-4 text-sm font-medium text-gray-700">
        {ADMIN_REQUEST_TEXT.assignedBranch(branchName ?? '')}
      </p>
    );
  }
  return (
    <div className="mt-4 max-w-xs">
      <BranchSelect />
    </div>
  );
}
