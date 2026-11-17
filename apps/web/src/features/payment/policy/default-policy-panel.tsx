import { Info, SlidersHorizontal } from 'lucide-react';
import { DEFAULT_TIERS } from './policy-form';
import { POLICY_TEXT } from './policy-text';

// Bảng "Chính sách hủy / hoàn mặc định — Toàn hệ thống" (payment F5; Figma `553:301`). CHỈ ĐỌC: Q7 chốt bảng này là hằng ở web, không lưu ở DB, nên không có nút "Chỉnh sửa" của `569:2`
// (Trung chọn 18/11/2026); muốn dùng cho một dịch vụ thì bấm "Áp dụng bảng mẫu" ở khung sửa của dịch vụ đó.
export function DefaultPolicyPanel() {
  return (
    <section
      aria-labelledby="default-policy-title"
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
    >
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-5 py-3.5">
        <SlidersHorizontal
          aria-hidden="true"
          className="size-4 text-gray-600"
        />
        <h2
          id="default-policy-title"
          className="text-sm font-semibold text-gray-800"
        >
          {POLICY_TEXT.defaultTitle}
        </h2>
        <span className="rounded-[3.75px] bg-gray-200 px-2 py-0.5 text-[10px] leading-[15px] font-medium text-gray-600">
          {POLICY_TEXT.defaultScope}
        </span>
      </div>
      <div className="p-5">
        <table className="w-full overflow-hidden rounded-[9.375px] border border-gray-200 text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium text-gray-600">
                {POLICY_TEXT.cancelBefore}
              </th>
              <th scope="col" className="px-3 py-2 font-medium text-gray-600">
                {POLICY_TEXT.refund}
              </th>
            </tr>
          </thead>
          <tbody>
            {DEFAULT_TIERS.map((tier) => (
              <tr
                key={tier.soGioTruocToiThieu}
                className="border-t border-gray-100"
              >
                <td className="px-3 py-2 text-gray-700">
                  ≥ {tier.soGioTruocToiThieu}h
                </td>
                <td className="px-3 py-2 font-semibold text-brand-strong">
                  {tier.tyLeHoan}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="flex items-center gap-1 pt-2 text-xs text-gray-500">
          <Info aria-hidden="true" className="size-3" />
          {POLICY_TEXT.defaultNote}
        </p>
      </div>
    </section>
  );
}
