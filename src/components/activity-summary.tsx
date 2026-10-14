import type { ActivityStats } from "@/lib/activity-stats";

const ITEMS: { key: keyof ActivityStats; icon: string; label: string }[] = [
  { key: "races", icon: "🏁", label: "대회 참가" },
  { key: "raceRecords", icon: "🏅", label: "대회 기록" },
  { key: "cheers", icon: "📣", label: "응원 참여" },
  { key: "afterParties", icon: "🍽️", label: "뒷풀이 참석" },
  { key: "carpoolDrivers", icon: "🚗", label: "카풀 운전" },
  { key: "carpoolRides", icon: "🚙", label: "카풀 탑승" },
  { key: "photosPosted", icon: "📷", label: "단사 등록" },
];

export default function ActivitySummary({ stats }: { stats: ActivityStats }) {
  return <section className="grid gap-2">
    <h2 className="label">활동 통계</h2>
    <div className="activity-grid">
      {ITEMS.map((item) => <div className="activity-card" key={item.key}>
        <span className="text-sm text-muted">{item.icon} {item.label}</span>
        <b className="num">{stats[item.key]}<small>건</small></b>
      </div>)}
    </div>
  </section>;
}
