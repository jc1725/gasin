import { useEffect, useState, type ReactNode } from "react";
import { normalizeHotDealImageUrl } from "@/lib/hotDealImage";

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** 주소가 없거나 이미지를 불러오지 못했을 때 보여 줄 대체 화면 */
  fallback: ReactNode;
  onStatusChange?: (status: "loaded" | "failed") => void;
};

// 불러오기에 실패하면 깨진 이미지 아이콘 대신 fallback을 보여 준다. 주소가 바뀌면 다시 시도한다.
export default function HotDealImage({ src, alt, className, fallback, onStatusChange }: Props) {
  const url = normalizeHotDealImageUrl(src);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) return <>{fallback}</>;
  return <img
    src={url}
    alt={alt}
    className={className}
    referrerPolicy="no-referrer"
    loading="lazy"
    decoding="async"
    onLoad={() => onStatusChange?.("loaded")}
    onError={() => { setFailed(true); onStatusChange?.("failed"); }}
  />;
}
