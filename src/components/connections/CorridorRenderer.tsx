import { memo, useMemo } from 'react';
import { GRID_LINE_COLOR, GRID_LINE_WIDTH } from '../../editor/grid';
import type { CorridorCell } from '../../editor/connectors/corridor/corridorGeometry';
import { cellShapes } from '../../editor/connectors/corridor/cellShapes';

interface CorridorRendererProps {
  cells: readonly CorridorCell[];
  isSelected: boolean;
  interactive: boolean;
  selectedCellKeys?: ReadonlySet<string>;
}

/** Shapes only. Geometry is calculated outside React and shared by all layers. */
export const CorridorRenderer = memo(function CorridorRenderer({ cells, isSelected, interactive, selectedCellKeys }: CorridorRendererProps) {
  const shapes = useMemo(() => cellShapes(cells), [cells]);
  const paths = useMemo(() => {
    const floors = ['', ''], walls = ['', ''];
    for (const floor of shapes.floors) {
      floors[isSelected || selectedCellKeys?.has(floor.key) ? 1 : 0] += `${floor.d} `;
    }
    for (const wall of shapes.walls) {
      walls[isSelected || [...wall.cellKeys].some(key => selectedCellKeys?.has(key)) ? 1 : 0] += `${wall.d} `;
    }
    return { floors, walls };
  }, [shapes, isSelected, selectedCellKeys]);
  return (
    <>
      {paths.floors.map((d, selected) => d && <path key={`floor-${selected}`} data-corridor-floor="true"
        data-highlighted={Boolean(selected)} d={d.trim()} fill={selected ? '#bfdbfe' : '#e0e7ff'}
        pointerEvents={interactive ? 'fill' : 'none'} />)}
      {shapes.grid && <path data-corridor-grid="true" d={shapes.grid} fill="none"
        stroke={GRID_LINE_COLOR} strokeWidth={GRID_LINE_WIDTH} pointerEvents="none" />}
      {paths.walls.map((d, selected) => d && <path key={`wall-${selected}`} data-corridor-walls="true"
        data-highlighted={Boolean(selected)} d={d.trim()} fill="none" stroke={selected ? '#2563eb' : GRID_LINE_COLOR}
        strokeWidth={selected ? 2.5 : 2} strokeLinejoin="round" pointerEvents="none" />)}
    </>
  );
});
