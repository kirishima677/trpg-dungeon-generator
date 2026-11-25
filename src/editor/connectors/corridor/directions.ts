import type { ConnectorDirection } from '../../../model/types';

export const NORTH = 0b0001;
export const EAST = 0b0010;
export const SOUTH = 0b0100;
export const WEST = 0b1000;

export const DIRECTION_BITS: Record<ConnectorDirection, number> = {
  north: NORTH, east: EAST, south: SOUTH, west: WEST,
};
