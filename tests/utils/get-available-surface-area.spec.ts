import { describe, expect, it } from 'vitest';
import { getAvailableGardenSurfaceArea } from '../../src/utils/get-available-surface-area';

describe('getAvailableGardenSurfaceArea', () => {
  it('should return total area when no plants exist', () => {
    expect(getAvailableGardenSurfaceArea(50, [])).toBe(50);
  });

  it('should subtract plant surface areas from total', () => {
    expect(getAvailableGardenSurfaceArea(50, [10, 15, 5])).toBe(20);
  });

  it('should return 0 when plants use all available area', () => {
    expect(getAvailableGardenSurfaceArea(50, [25, 25])).toBe(0);
  });

  it('should return negative when plants exceed total area', () => {
    expect(getAvailableGardenSurfaceArea(50, [30, 25])).toBe(-5);
  });

  it('should handle decimal values', () => {
    expect(getAvailableGardenSurfaceArea(10.5, [2.5, 3.0])).toBeCloseTo(5);
  });

  it('should handle a single plant', () => {
    expect(getAvailableGardenSurfaceArea(100, [42])).toBe(58);
  });
});
