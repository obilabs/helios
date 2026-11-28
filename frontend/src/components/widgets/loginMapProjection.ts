/**
 * The frame shared by the Login Locations outline and its markers.
 *
 * Equirectangular: longitude -180..180 maps left to right across MAP_WIDTH,
 * latitude 90..-90 top to bottom across MAP_HEIGHT. The outline in
 * worldOutline.ts is generated in this same frame; if either changes, both must.
 */
export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 500;

export function latLongToSvg(lat: number, lng: number): { x: number; y: number } {
  return {
    x: ((lng + 180) / 360) * MAP_WIDTH,
    y: ((90 - lat) / 180) * MAP_HEIGHT,
  };
}
