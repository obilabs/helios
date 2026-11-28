import { describe, it, expect } from 'vitest';
import { MAP_WIDTH, MAP_HEIGHT, latLongToSvg } from './loginMapProjection';
import { WORLD_OUTLINE_PATH } from './worldOutline';

/** The outline's rings as point lists. */
function rings(): Array<Array<[number, number]>> {
  return WORLD_OUTLINE_PATH.split('M')
    .filter(Boolean)
    .map((r) =>
      r
        .replace(/Z$/, '')
        .split('L')
        .map((p) => p.split(',').map(Number) as [number, number])
    );
}

/** Even-odd test over every ring: is this point on land? */
function onLand(lat: number, lng: number): boolean {
  const { x, y } = latLongToSvg(lat, lng);
  let inside = false;
  for (const ring of rings()) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

describe('login map frame', () => {
  it('maps the corners and centre of the world to the box', () => {
    expect(latLongToSvg(90, -180)).toEqual({ x: 0, y: 0 });
    expect(latLongToSvg(0, 0)).toEqual({ x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 });
    expect(latLongToSvg(-90, 180)).toEqual({ x: MAP_WIDTH, y: MAP_HEIGHT });
  });

  it('draws the outline in the same frame as the markers', () => {
    // These failed with the old placeholder shapes: markers sat off the land.
    expect(onLand(53.5, -113.5)).toBe(true); // Edmonton, Alberta
    expect(onLand(5.5, 7.5)).toBe(true); // Abia State, Nigeria
    expect(onLand(51.5, -0.1)).toBe(true); // London
    // Coastal cities can fall just offshore at this scale; use inland points.
    expect(onLand(-23.7, 133.9)).toBe(true); // Alice Springs, Australia
    expect(onLand(-23.5, -46.6)).toBe(true); // Sao Paulo
    expect(onLand(30, -40)).toBe(false); // mid-Atlantic
    expect(onLand(0, -140)).toBe(false); // mid-Pacific
    expect(onLand(-20, 80)).toBe(false); // Indian Ocean
  });

  it('draws Russia east of the date line on the left edge, not as a band across the map', () => {
    expect(onLand(66, -175)).toBe(true); // Chukotka, west of 180
    expect(onLand(65, 0)).toBe(false); // Norwegian Sea: no band across the north
  });

  it('closes Antarctica along the bottom edge', () => {
    expect(onLand(-88, 0)).toBe(true);
    expect(onLand(-55, 0)).toBe(false);
  });
});
