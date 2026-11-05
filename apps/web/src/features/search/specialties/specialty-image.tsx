import { Stethoscope } from 'lucide-react';

// Chuyên khoa chưa có ảnh ⇒ khung biểu tượng (không ảnh vỡ). Ảnh có `alt` = tên chuyên khoa (TCK-09, TCK-10).
export function SpecialtyImage({
  src,
  name,
  className,
}: {
  src: string | null;
  name: string;
  className: string;
}) {
  if (src) {
    return <img src={src} alt={name} loading="lazy" className={className} />;
  }
  return (
    <div
      aria-hidden="true"
      className={`${className} flex items-center justify-center bg-gray-100 text-gray-400`}
    >
      <Stethoscope className="size-10" />
    </div>
  );
}
