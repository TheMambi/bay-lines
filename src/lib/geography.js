export async function loadGeography() {
  const _default = (await import('../data/geography.json')).default;
  return {
    land: _default.land,
    coast: _default.coast,
    extent: _default.extent,
    attribution: _default.attribution,
  };
}
