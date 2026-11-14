export async function loadGeography() {
  const geography = (await import('../data/geography.json')).default;
  return {
    land: geography.land,
    coast: geography.coast,
    extent: geography.extent,
    attribution: geography.attribution,
  };
}
