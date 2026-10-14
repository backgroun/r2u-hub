import type { RaceFull } from "@/lib/hub";

export type ActivityStats = {
  races: number;
  raceRecords: number;
  cheers: number;
  afterParties: number;
  carpoolDrivers: number;
  carpoolRides: number;
  photosPosted: number;
};

/** 현재 저장된 대회와 함께하기 참여 표시를 기준으로 집계한다. */
export function activityStats(races: RaceFull[], nick: string, raceRecordIds: string[]): ActivityStats {
  const raceIds = new Set(races.map((race) => race.id));
  const stats: ActivityStats = {
    races: 0, raceRecords: raceRecordIds.filter((id) => raceIds.has(id)).length,
    cheers: 0, afterParties: 0, carpoolDrivers: 0, carpoolRides: 0, photosPosted: 0,
  };
  for (const race of races) {
    if (race.participants.some((person) => person.nick === nick)) stats.races++;
    if (race.cheers.includes(nick)) stats.cheers++;
    for (const item of race.afters) {
      const kind = item.kind ?? "after";
      if (kind === "after" && item.yes.includes(nick)) stats.afterParties++;
      if (kind === "carpool") {
        if ((item.driver || item.by) === nick) stats.carpoolDrivers++;
        else if (item.yes.includes(nick)) stats.carpoolRides++;
      }
      if (kind === "photo" && item.by === nick) stats.photosPosted++;
    }
  }
  return stats;
}
