import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRecurringSeries,
  generateCandidateSlots,
  type ExistingAppointment,
  type ProviderAvailabilityRule,
} from "./scheduling.ts";

const mondayRules: ProviderAvailabilityRule[] = [
  {
    providerId: "provider-a",
    weekday: 1,
    startTime: "09:00",
    endTime: "12:00",
    appointmentMinutes: 30,
    driveBufferMinutes: 15,
    zipCoverage: ["02139", "02140"],
  },
];

describe("generateCandidateSlots", () => {
  it("excludes conflicts using provider drive-time buffers", () => {
    const existing: ExistingAppointment[] = [
      {
        providerId: "provider-a",
        startISO: "2026-06-08T10:00:00.000Z",
        endISO: "2026-06-08T10:30:00.000Z",
        zipCode: "02139",
      },
    ];

    const slots = generateCandidateSlots(mondayRules, existing, {
      clientZipCode: "02139",
      earliestISO: "2026-06-08T09:00:00.000Z",
      latestISO: "2026-06-08T12:00:00.000Z",
      appointmentMinutes: 30,
      maxResults: 20,
    });

    const startTimes = slots.map((slot) => slot.startISO.slice(11, 16));

    assert.ok(startTimes.includes("09:00"));
    assert.ok(startTimes.includes("10:45"));
    assert.ok(!startTimes.includes("09:45"));
    assert.ok(!startTimes.includes("10:00"));
    assert.ok(!startTimes.includes("10:15"));
    assert.ok(slots.every((slot) => slot.reasons.some((reason) => reason.includes("drive buffer"))));
  });

  it("ranks exact ZIP coverage above looser route clusters", () => {
    const slots = generateCandidateSlots(
      [
        ...mondayRules,
        {
          providerId: "provider-b",
          weekday: 1,
          startTime: "09:00",
          endTime: "12:00",
          appointmentMinutes: 30,
          driveBufferMinutes: 15,
          zipCoverage: ["02149"],
        },
      ],
      [],
      {
        clientZipCode: "02139",
        earliestISO: "2026-06-08T09:00:00.000Z",
        latestISO: "2026-06-08T12:00:00.000Z",
        appointmentMinutes: 30,
        maxResults: 20,
      },
    );

    assert.equal(slots[0].providerId, "provider-a");
    assert.ok(slots[0].score > slots.find((slot) => slot.providerId === "provider-b")!.score);
    assert.ok(slots[0].reasons.includes("exact ZIP coverage for 02139"));
  });
});

describe("buildRecurringSeries", () => {
  it("groups slots by provider, weekday, and time for recurring scheduling", () => {
    const slots = generateCandidateSlots(mondayRules, [], {
      clientZipCode: "02139",
      earliestISO: "2026-06-08T09:00:00.000Z",
      latestISO: "2026-06-22T12:00:00.000Z",
      appointmentMinutes: 30,
      preferredWeekdays: [1],
      maxResults: 100,
    });

    const series = buildRecurringSeries(slots, 3);
    const nineAmSeries = series.find((candidate) => candidate.minuteOfDay === 9 * 60);

    assert.ok(nineAmSeries);
    assert.equal(nineAmSeries.providerId, "provider-a");
    assert.equal(nineAmSeries.slots.length, 3);
  });
});
