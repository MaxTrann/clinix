import { useEffect, useRef } from 'react';

// Ảnh từ byte trong bộ nhớ (chat F6; PLAN chat 5.8 "Web"): tạo object URL khi gắn, THU HỒI khi gỡ hay khi đổi byte, để không rò bộ nhớ.
// Gán `src` thẳng vào thẻ trong effect (không qua state): cặp tạo/thu hồi nằm cùng một effect nên `StrictMode` (gắn, gỡ, gắn lại) vẫn đúng, và không
// cần `setState` trong effect. Không `iframe`, không `embed`.

interface ObjectUrlImageProps {
  blob: Blob;
  alt: string;
  className?: string;
}

export function ObjectUrlImage({ blob, alt, className }: ObjectUrlImageProps) {
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const element = img.current;
    if (!element) return;
    const url = URL.createObjectURL(blob);
    element.src = url;
    return () => {
      element.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  }, [blob]);
  return <img ref={img} alt={alt} className={className} />;
}
