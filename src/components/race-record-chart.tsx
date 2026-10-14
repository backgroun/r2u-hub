"use client";

import { useState } from "react";

export type RaceRecordPoint = {
  id: string;
  race: string;
  date: string;
  course: string;
  sec: number;
  time: string;
};

const COURSE_ORDER = ["5K", "10K", "Half", "Full"];

function courseLabel(course: string) {
  const name = course.trim();
  const key = name.toLowerCase();
  if (key === "5k") return "5K";
  if (key === "10k") return "10K";
  if (key === "half" || name === "하프") return "Half";
  if (key === "full" || name === "풀") return "Full";
  return name || "기타";
}

function formatTime(seconds: number) {
  const n = Math.max(0, Math.round(seconds));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export default function RaceRecordChart({ records }: { records: RaceRecordPoint[] }) {
  const valid = records.filter((r) => Number.isFinite(r.sec) && r.sec > 0 && r.course !== "DNF" && r.course !== "DNS");
  const courses = [...new Set(valid.map((r) => courseLabel(r.course)))].sort((a, b) => {
    const ai = COURSE_ORDER.indexOf(a), bi = COURSE_ORDER.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b, "ko");
  });
  const [chosen, setChosen] = useState("");
  const selected = courses.includes(chosen) ? chosen : courses[0];
  const points = valid.filter((r) => courseLabel(r.course) === selected)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  if (!courses.length) return (
    <div className="panel p-4 text-sm text-muted">완주 기록을 등록하면 코스별 기록 그래프가 여기에 표시돼요.</div>
  );

  const best = Math.min(...points.map((p) => p.sec));
  const latest = points[points.length - 1];
  const min = Math.min(...points.map((p) => p.sec));
  const max = Math.max(...points.map((p) => p.sec));
  const padding = Math.max(30, (max - min) * 0.15);
  const low = Math.max(0, min - padding), high = max + padding;
  const left = 70, right = 18, top = 18, bottom = 35, width = 600, height = 170;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = (index: number) => points.length === 1 ? left + plotWidth / 2 : left + index * plotWidth / (points.length - 1);
  const y = (seconds: number) => top + (seconds - low) / (high - low) * plotHeight;
  const ticks = [0, 0.5, 1].map((ratio) => ({ y: top + ratio * plotHeight, time: formatTime(low + ratio * (high - low)) }));
  const line = points.map((p, index) => `${index ? "L" : "M"}${x(index)} ${y(p.sec)}`).join(" ");

  return (
    <div className="panel p-4 grid gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-bold">코스별 기록 변화</h3>
          <p className="text-xs text-muted">기록 시간이 짧을수록 그래프 위쪽에 표시돼요.</p>
        </div>
        <span className="text-xs text-muted">{points.length}개 기록</span>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="기록 코스 선택">
        {courses.map((course) => (
          <button key={course} type="button" className={`record-course-btn ${selected === course ? "is-selected" : ""}`}
            aria-pressed={selected === course} onClick={() => setChosen(course)}>{course}</button>
        ))}
      </div>
      <div className="record-chart-stats">
        <div><span className="label">최고 기록</span><strong className="num">{formatTime(best)}</strong></div>
        <div><span className="label">최근 기록</span><strong className="num">{formatTime(latest.sec)}</strong></div>
      </div>
      <svg className="record-chart" viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label={`${selected} 코스 기록 변화. ${points.length}개 기록, 최고 ${formatTime(best)}, 최근 ${formatTime(latest.sec)}`}>
        {ticks.map((tick, index) => (
          <g key={index}>
            <line x1={left} x2={width - right} y1={tick.y} y2={tick.y} className="record-chart-grid" />
            <text x={left - 9} y={tick.y + 4} textAnchor="end" className="record-chart-label">{tick.time}</text>
          </g>
        ))}
        {points.length > 1 && <path d={line} className="record-chart-line" />}
        {points.map((point, index) => (
          <g key={point.id}>
            <circle cx={x(index)} cy={y(point.sec)} r={6} className="record-chart-dot">
              <title>{`${point.date} ${point.race} · ${point.time}`}</title>
            </circle>
            {(index === 0 || index === points.length - 1) && (
              <text x={x(index)} y={height - 8} textAnchor={index === 0 && points.length > 1 ? "start" : index === points.length - 1 && points.length > 1 ? "end" : "middle"} className="record-chart-label">
                {point.date.slice(2).replaceAll("-", ".")}
              </text>
            )}
          </g>
        ))}
      </svg>
      <ol className="record-chart-history" aria-label={`${selected} 코스 기록 목록`}>
        {[...points].reverse().map((point) => (
          <li key={point.id}><span><b>{point.race}</b><small>{point.date}</small></span><strong className="num">{point.time}</strong></li>
        ))}
      </ol>
    </div>
  );
}
