import { z } from "zod";

export const RACE_ID_PATTERN = /^[a-z0-9-]{1,80}$/;

/** [latitude, longitude, altitude en m ou null] — précision d'origine du GPX conservée. */
export const trackPointSchema = z.tuple([
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
  z.number().nullable(),
]);

export const checkpointSchema = z.object({
  id: z.string().min(1).max(64),
  km: z.number().min(0).max(1000),
  label: z.string().max(120),
  timeSec: z.number().int().min(0).max(14 * 24 * 3600),
});

export const aidStationSchema = z.object({
  id: z.string().min(1).max(64),
  km: z.number().min(0).max(1000),
  name: z.string().max(120),
  notes: z.string().max(500),
});

export const startTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable();

export const raceSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(RACE_ID_PATTERN),
  name: z.string().max(120),
  sourceFile: z.string().max(260),
  createdAt: z.string(),
  updatedAt: z.string(),
  startTime: startTimeSchema,
  checkpoints: z.array(checkpointSchema).max(200),
  aidStations: z.array(aidStationSchema).max(200),
  points: z.array(trackPointSchema).min(2),
});

export const createRaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sourceFile: z.string().max(260),
  points: z.array(trackPointSchema).min(2).max(500_000),
  aidStations: z.array(aidStationSchema).max(200).default([]),
});

export const updateRaceSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    startTime: startTimeSchema,
    checkpoints: z.array(checkpointSchema).max(200),
    aidStations: z.array(aidStationSchema).max(200),
  })
  .partial();

export type TrackPoint = z.infer<typeof trackPointSchema>;
export type Checkpoint = z.infer<typeof checkpointSchema>;
export type AidStation = z.infer<typeof aidStationSchema>;
export type Race = z.infer<typeof raceSchema>;
export type CreateRaceInput = z.infer<typeof createRaceSchema>;
export type UpdateRaceInput = z.infer<typeof updateRaceSchema>;

export type RaceSummary = {
  id: string;
  name: string;
  updatedAt: string;
  distanceM: number;
  gainM: number;
  checkpointCount: number;
  aidStationCount: number;
};
