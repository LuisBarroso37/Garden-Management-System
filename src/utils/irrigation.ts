import type { PlantType } from '../db/types.js';
import {
  HUMIDITY_DROP_PER_MINUTE,
  HUMIDITY_GAIN_PER_WATERING,
  HUMIDITY_BUFFER,
  WATERING_DURATION_MINUTES,
  IRRIGATION_TIME_TOLERANCE_SECONDS,
} from '../schemas/irrigation.js';
import { dayjs, Dayjs } from '../utils/dayjs.js';

export const computeHumidityAfterDrop = (
  currentHumidityLevel: number,
  plantType: PlantType,
): number => {
  return Math.max(0, currentHumidityLevel - HUMIDITY_DROP_PER_MINUTE[plantType]);
};

export const computeHumidityAfterWatering = (
  currentHumidityLevel: number,
  plantType: PlantType,
): number => {
  return Math.min(100, currentHumidityLevel + HUMIDITY_GAIN_PER_WATERING[plantType]);
};

export const needsIrrigation = (
  currentHumidityLevel: number,
  idealHumidityLevel: number,
): boolean => {
  return currentHumidityLevel < idealHumidityLevel - HUMIDITY_BUFFER;
};

export const isWithinIrrigationEndWindow = (
  now: Dayjs,
  lastIrrigationEndTime: string | null,
): boolean => {
  if (!lastIrrigationEndTime) return false;

  const endTime = dayjs.utc(lastIrrigationEndTime);
  const lowerBound = endTime.subtract(IRRIGATION_TIME_TOLERANCE_SECONDS, 'second');
  const upperBound = endTime.add(IRRIGATION_TIME_TOLERANCE_SECONDS, 'second');

  return now >= lowerBound && now <= upperBound;
};

export const isCurrentlyBeingWatered = (
  now: Dayjs,
  lastIrrigationEndTime: string | null,
): boolean => {
  if (!lastIrrigationEndTime) return false;

  const endTime = dayjs.utc(lastIrrigationEndTime);
  const lowerBound = endTime.subtract(IRRIGATION_TIME_TOLERANCE_SECONDS, 'second');

  return now < lowerBound;
};

export const computeIrrigationEndTime = (now: Dayjs): string => {
  return now.add(WATERING_DURATION_MINUTES, 'minute').format('YYYY-MM-DDTHH:mm:ss[Z]');
};
