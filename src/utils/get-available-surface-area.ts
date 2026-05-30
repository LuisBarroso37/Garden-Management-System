export const getAvailableGardenSurfaceArea = (
  totalGardenSurfaceArea: number,
  existingPlantSurfaceAreas: number[],
) => {
  const usedSurfaceArea = existingPlantSurfaceAreas.reduce((sum, p) => sum + p, 0);
  return totalGardenSurfaceArea - usedSurfaceArea;
};
