export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ProviderAvailabilityRule {
  providerId: string;
  weekday: Weekday;
  startTime: string;
  endTime: string;
  appointmentMinutes: number;
  driveBufferMinutes: number;
  zipCoverage: string[];
}

export interface ExistingAppointment {
  providerId: string;
  startISO: string;
  endISO: string;
  zipCode: string;
}

export interface SchedulingRequest {
  clientZipCode: string;
  earliestISO: string;
  latestISO: string;
  appointmentMinutes: number;
  preferredWeekdays?: Weekday[];
  maxResults?: number;
}

export interface CandidateSlot {
  providerId: string;
  startISO: string;
  endISO: string;
  score: number;
  routeCluster: string;
  reasons: string[];
}

export interface RecurringSeries {
  providerId: string;
  weekday: Weekday;
  minuteOfDay: number;
  slots: CandidateSlot[];
}

const MINUTES_PER_DAY = 24 * 60;

function parseClock(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid HH:mm clock value: ${value}`);
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function minutesSinceStartOfDay(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function intervalsOverlap(
  firstStart: Date,
  firstEnd: Date,
  secondStart: Date,
  secondEnd: Date,
): boolean {
  return firstStart < secondEnd && secondStart < firstEnd;
}

function routeClusterFor(zipCode: string): string {
  return zipCode.replace(/\D/g, "").slice(0, 3);
}

function routeScore(providerZipCoverage: string[], clientZipCode: string): {
  score: number;
  reason: string;
  routeCluster: string;
} {
  const clientCluster = routeClusterFor(clientZipCode);
  if (providerZipCoverage.includes(clientZipCode)) {
    return {
      score: 24,
      reason: `exact ZIP coverage for ${clientZipCode}`,
      routeCluster: clientCluster,
    };
  }

  if (providerZipCoverage.some((zip) => routeClusterFor(zip) === clientCluster)) {
    return {
      score: 12,
      reason: `same route cluster ${clientCluster}`,
      routeCluster: clientCluster,
    };
  }

  return {
    score: -20,
    reason: "outside preferred ZIP coverage",
    routeCluster: clientCluster || "unknown",
  };
}

function hasConflict(
  providerId: string,
  slotStart: Date,
  slotEnd: Date,
  driveBufferMinutes: number,
  existingAppointments: ExistingAppointment[],
): boolean {
  const bufferedStart = addMinutes(slotStart, -driveBufferMinutes);
  const bufferedEnd = addMinutes(slotEnd, driveBufferMinutes);

  return existingAppointments.some((appointment) => {
    if (appointment.providerId !== providerId) {
      return false;
    }

    return intervalsOverlap(
      bufferedStart,
      bufferedEnd,
      new Date(appointment.startISO),
      new Date(appointment.endISO),
    );
  });
}

function dateForMinuteOfDay(day: Date, minuteOfDay: number): Date {
  return addMinutes(startOfUtcDay(day), minuteOfDay);
}

export function generateCandidateSlots(
  availabilityRules: ProviderAvailabilityRule[],
  existingAppointments: ExistingAppointment[],
  request: SchedulingRequest,
): CandidateSlot[] {
  const earliest = new Date(request.earliestISO);
  const latest = new Date(request.latestISO);
  const maxResults = request.maxResults ?? 20;
  const preferredWeekdays = new Set(request.preferredWeekdays);
  const candidates: CandidateSlot[] = [];

  if (latest <= earliest) {
    throw new Error("latestISO must be after earliestISO");
  }

  for (
    let day = startOfUtcDay(earliest);
    day <= latest;
    day = addMinutes(day, MINUTES_PER_DAY)
  ) {
    const weekday = day.getUTCDay() as Weekday;
    if (preferredWeekdays.size > 0 && !preferredWeekdays.has(weekday)) {
      continue;
    }

    for (const rule of availabilityRules) {
      if (rule.weekday !== weekday) {
        continue;
      }

      const ruleStart = parseClock(rule.startTime);
      const ruleEnd = parseClock(rule.endTime);
      const appointmentMinutes = request.appointmentMinutes || rule.appointmentMinutes;
      const route = routeScore(rule.zipCoverage, request.clientZipCode);

      if (appointmentMinutes <= 0 || ruleEnd <= ruleStart) {
        continue;
      }

      for (
        let slotMinute = ruleStart;
        slotMinute + appointmentMinutes <= ruleEnd;
        slotMinute += 15
      ) {
        const slotStart = dateForMinuteOfDay(day, slotMinute);
        const slotEnd = addMinutes(slotStart, appointmentMinutes);

        if (slotStart < earliest || slotEnd > latest) {
          continue;
        }

        if (
          hasConflict(
            rule.providerId,
            slotStart,
            slotEnd,
            rule.driveBufferMinutes,
            existingAppointments,
          )
        ) {
          continue;
        }

        const earlierInDayBonus = Math.max(0, 12 - Math.floor(slotMinute / 60));
        const score = 50 + route.score + earlierInDayBonus;
        const reasons = [
          route.reason,
          `${rule.driveBufferMinutes} minute drive buffer clear`,
          `${appointmentMinutes} minute visit fits availability`,
        ];

        candidates.push({
          providerId: rule.providerId,
          startISO: slotStart.toISOString(),
          endISO: slotEnd.toISOString(),
          score,
          routeCluster: route.routeCluster,
          reasons,
        });
      }
    }
  }

  return candidates
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.startISO.localeCompare(right.startISO);
    })
    .slice(0, maxResults);
}

export function buildRecurringSeries(
  candidates: CandidateSlot[],
  occurrenceCount: number,
): RecurringSeries[] {
  const grouped = new Map<string, CandidateSlot[]>();

  for (const candidate of candidates) {
    const start = new Date(candidate.startISO);
    const weekday = start.getUTCDay() as Weekday;
    const minuteOfDay = minutesSinceStartOfDay(start);
    const key = `${candidate.providerId}:${weekday}:${minuteOfDay}`;
    const group = grouped.get(key) ?? [];
    group.push(candidate);
    grouped.set(key, group);
  }

  return Array.from(grouped.entries())
    .map(([key, slots]) => {
      const [providerId, weekday, minuteOfDay] = key.split(":");
      return {
        providerId,
        weekday: Number(weekday) as Weekday,
        minuteOfDay: Number(minuteOfDay),
        slots: slots.sort((left, right) => left.startISO.localeCompare(right.startISO)),
      };
    })
    .filter((series) => series.slots.length >= occurrenceCount)
    .sort((left, right) => {
      const leftScore = left.slots.reduce((total, slot) => total + slot.score, 0);
      const rightScore = right.slots.reduce((total, slot) => total + slot.score, 0);
      return rightScore - leftScore;
    });
}
