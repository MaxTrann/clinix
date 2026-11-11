import { Plus, Search, Users, X } from 'lucide-react';
import type { ReceptionDoctor } from '../../../api/reception-api';

export interface DoctorPickerProps {
  // Bác sĩ hiện trong danh sách bên trái (đã lọc chi nhánh, chuyên khoa)
  doctors: readonly ReceptionDoctor[];
  // Mọi bác sĩ đã chọn (kể cả đang bị bộ lọc ẩn khỏi danh sách trái)
  selected: readonly ReceptionDoctor[];
  query: string;
  onQueryChange: (value: string) => void;
  onToggle: (doctor: ReceptionDoctor) => void;
  // Đã đủ số bác sĩ tối đa: không chọn thêm
  full: boolean;
  disabled?: boolean;
}

// Bỏ dấu + chữ thường để "nguyen" tìm được "Nguyễn" (Q38 chuẩn hoá NFC ở phía server cho `q`; ở đây lọc ngay trong danh sách đã tải)
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

// Hai cột chọn bác sĩ của hộp Phân công (Figma `516:2`): trái = tìm + danh sách theo chuyên khoa có ô chọn; phải = "Bác sĩ được phân công — N bác sĩ".
export function DoctorPicker({
  doctors,
  selected,
  query,
  onQueryChange,
  onToggle,
  full,
  disabled = false,
}: DoctorPickerProps) {
  const needle = fold(query.trim());
  const visible = doctors.filter(
    (doctor) => needle === '' || fold(doctor.hoTen).includes(needle),
  );
  // Nhóm theo chuyên khoa (tên chuyên khoa theo thứ tự tiếng Việt); không dùng Map.groupBy vì lib TS của dự án chưa có
  const grouped = new Map<string, ReceptionDoctor[]>();
  for (const doctor of visible) {
    grouped.set(doctor.chuyenKhoa.ten, [
      ...(grouped.get(doctor.chuyenKhoa.ten) ?? []),
      doctor,
    ]);
  }
  const groups = [...grouped.entries()].sort(([a], [b]) =>
    a.localeCompare(b, 'vi'),
  );
  const selectedIds = new Set(selected.map((doctor) => doctor.bacSiId));

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 border-t border-gray-100 md:grid-cols-2">
      <div className="flex min-h-0 flex-col border-gray-100 md:border-r">
        <div className="p-4 pb-2">
          <label className="relative block">
            <span className="sr-only">Tìm tên bác sĩ</span>
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400"
            />
            <input
              type="search"
              value={query}
              disabled={disabled}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Tìm tên bác sĩ..."
              className="min-h-10 w-full rounded-lg border border-gray-200 bg-white pr-3 pl-9 text-sm text-gray-900"
            />
          </label>
        </div>
        <div className="max-h-80 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {groups.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-500">
              Không có bác sĩ nào phù hợp.
            </p>
          )}
          {groups.map(([specialty, list]) => (
            <section key={specialty} aria-label={specialty} className="mt-3">
              <h3 className="flex items-center justify-between text-xs font-semibold tracking-wide text-gray-500 uppercase">
                <span>{specialty}</span>
                <span className="font-normal normal-case">
                  {list.length} bác sĩ
                </span>
              </h3>
              <ul className="mt-2 flex flex-col gap-2">
                {list.map((doctor) => {
                  const checked = selectedIds.has(doctor.bacSiId);
                  return (
                    <li key={doctor.bacSiId}>
                      <label
                        className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm ${
                          checked
                            ? 'border-sky-300 bg-sky-50'
                            : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled || (!checked && full)}
                          onChange={() => onToggle(doctor)}
                          className="size-4 accent-cyan-700"
                        />
                        <span className="min-w-0 flex-1 truncate font-medium text-gray-900">
                          {doctor.hoTen}
                        </span>
                        <Plus
                          aria-hidden="true"
                          className="size-4 text-gray-400"
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-col p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            Bác sĩ được phân công
          </h3>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
            {selected.length} bác sĩ
          </span>
        </div>
        {selected.length === 0 ? (
          <div className="mt-3 flex min-h-40 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500">
            <Users aria-hidden="true" className="size-5" />
            Chưa chọn bác sĩ nào
          </div>
        ) : (
          <ul
            aria-label="Bác sĩ đã chọn"
            className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto"
          >
            {selected.map((doctor) => (
              <li
                key={doctor.bacSiId}
                className="flex min-h-10 items-center justify-between gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-gray-900">
                    {doctor.hoTen}
                  </span>
                  <span className="block truncate text-xs text-gray-600">
                    {doctor.chuyenKhoa.ten}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Bỏ ${doctor.hoTen}`}
                  disabled={disabled}
                  onClick={() => onToggle(doctor)}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-white disabled:opacity-50"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
