import { describe, it, expect } from 'vitest';
import { dayjs } from '../../src/utils/dayjs.js';
import {
  computeHumidityAfterDrop,
  computeHumidityAfterWatering,
  computeIrrigationEndTime,
  isCurrentlyBeingWatered,
  isWithinIrrigationEndWindow,
  needsIrrigation,
} from '../../src/utils/irrigation.js';

describe('computeHumidityAfterDrop', () => {
  it('should drop 1% for vegetables', () => {
    expect(computeHumidityAfterDrop(50, 'vegetable')).toBe(49);
  });

  it('should drop 3% for fruits', () => {
    expect(computeHumidityAfterDrop(50, 'fruit')).toBe(47);
  });

  it('should drop 4% for flowers', () => {
    expect(computeHumidityAfterDrop(50, 'flower')).toBe(46);
  });

  it('should not drop below 0', () => {
    expect(computeHumidityAfterDrop(2, 'flower')).toBe(0);
  });
});

describe('computeHumidityAfterWatering', () => {
  it('should gain 16% for vegetables', () => {
    expect(computeHumidityAfterWatering(40, 'vegetable')).toBe(56);
  });

  it('should gain 18% for fruits', () => {
    expect(computeHumidityAfterWatering(40, 'fruit')).toBe(58);
  });

  it('should gain 20% for flowers', () => {
    expect(computeHumidityAfterWatering(40, 'flower')).toBe(60);
  });

  it('should not exceed 100', () => {
    expect(computeHumidityAfterWatering(90, 'flower')).toBe(100);
  });
});

describe('needsIrrigation', () => {
  it('should return true when humidity is below ideal minus buffer', () => {
    expect(needsIrrigation(43, 60)).toBe(true);
  });

  it('should return false when humidity is at ideal minus buffer', () => {
    expect(needsIrrigation(54, 60)).toBe(false);
  });

  it('should return false when humidity is above ideal', () => {
    expect(needsIrrigation(65, 60)).toBe(false);
  });

  it('should return true when humidity is exactly one below the threshold', () => {
    // ideal=60, buffer=6, threshold=54.
    // Humidity 53 should trigger irrigation
    expect(needsIrrigation(53, 60)).toBe(true);
  });
});

describe('isWithinIrrigationEndWindow', () => {
  it('should return true when now is exactly at irrigation end time', () => {
    const endTime = '2025-03-15T10:02:00Z';
    const now = dayjs.utc('2025-03-15T10:02:00Z');
    expect(isWithinIrrigationEndWindow(now, endTime)).toBe(true);
  });

  it('should return true when now is within tolerance before end time', () => {
    const endTime = '2025-03-15T10:02:00Z';
    const now = dayjs.utc('2025-03-15T10:01:57Z'); // 3 seconds before (within 5s tolerance)
    expect(isWithinIrrigationEndWindow(now, endTime)).toBe(true);
  });

  it('should return true when now is within tolerance after end time', () => {
    const endTime = '2025-03-15T10:02:00Z';
    const now = dayjs.utc('2025-03-15T10:02:04Z'); // 4 seconds after (within 5s tolerance)
    expect(isWithinIrrigationEndWindow(now, endTime)).toBe(true);
  });

  it('should return false when now is outside tolerance', () => {
    const endTime = '2025-03-15T10:02:00Z';
    const now = dayjs.utc('2025-03-15T10:02:06Z'); // 6 seconds after (outside 5s tolerance)
    expect(isWithinIrrigationEndWindow(now, endTime)).toBe(false);
  });

  it('should return false when lastIrrigationEndTime is null', () => {
    const now = dayjs.utc('2025-03-15T10:02:00Z');
    expect(isWithinIrrigationEndWindow(now, null)).toBe(false);
  });
});

describe('isCurrentlyBeingWatered', () => {
  it('should return true when now is before irrigation end window', () => {
    const endTime = '2025-03-15T10:02:00Z';
    const now = dayjs.utc('2025-03-15T10:01:00Z'); // 1 min before end
    expect(isCurrentlyBeingWatered(now, endTime)).toBe(true);
  });

  it('should return false when now is at or past irrigation end window', () => {
    const endTime = '2025-03-15T10:02:00Z';
    const now = dayjs.utc('2025-03-15T10:01:56Z'); // within tolerance of end
    expect(isCurrentlyBeingWatered(now, endTime)).toBe(false);
  });

  it('should return false when lastIrrigationEndTime is null', () => {
    const now = dayjs.utc('2025-03-15T10:01:00Z');
    expect(isCurrentlyBeingWatered(now, null)).toBe(false);
  });
});

describe('computeIrrigationEndTime', () => {
  it('should add 2 minutes to the given time', () => {
    const now = dayjs.utc('2025-03-15T10:00:00Z');
    expect(computeIrrigationEndTime(now)).toBe('2025-03-15T10:02:00Z');
  });
});
