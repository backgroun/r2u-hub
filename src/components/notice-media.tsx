import Link from "next/link";
import type { Notice } from "@/lib/notice";

/** 공지에 붙는 사진: 직접 올린 이미지, 앱 아이콘, 홈 화면에 추가 안내 이미지 */
/** open: 홈처럼 좁은 곳에서는 높이를 줄여 보여 주고, 누르면 공지 페이지에서 그 공지를 펼쳐 크게 보여 준다 */
export default function NoticeMedia({ notice: n, className = "", open = false }: { notice: Notice; className?: string; open?: boolean }) {
  const wrap = (_href: string, img: React.ReactNode) => (open ? <Link href={`/notices?n=${n.id}#n-${n.id}`} className="block text-center">{img}<span className="text-xs text-muted block pt-1">🔍 눌러서 공지 페이지에서 크게 보기</span></Link> : img);
  return (
    <>
      {n.icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/icons/${n.icon}-512.png`} alt={`${n.title} 새 앱 아이콘`} width={open ? 56 : 96} height={open ? 56 : 96} className="rounded-2xl notice-icon" />
      )}
      {n.image && wrap(`/api/notices/${n.id}/image?v=${n.editedAt ?? 0}`,
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/notices/${n.id}/image?v=${n.editedAt ?? 0}`} alt={`${n.title} 공지 이미지`} loading="lazy" className={`${open ? "" : "w-full"} h-auto rounded-lg ${className}`} />)}
      {n.guide && wrap("/icons/guide-ios-android.png",
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/icons/guide-ios-android.png" alt="안드로이드·아이폰 홈 화면에 추가하는 방법" loading="lazy" className={`${open ? "" : "w-full"} h-auto rounded-lg ${className}`} />)}
    </>
  );
}
