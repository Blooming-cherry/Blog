import { archiveColumns, columnFiles, fileLocation } from "./data.ts";

export type ArchiveCell = { lane: number; row: number };
export type ArchiveNavigation =
  { axis: "row" | "lane"; direction: number } | { cell: ArchiveCell };

export const LOOP_COLUMNS = 9;
export const LOOP_ROWS = 32;
export const COLUMN_SPACING = 5.2;
export const ROW_SPACING = 0.62;
const POOL_LANES = [0, 1, 2, 3, 4, -2, -1, 5, 6];
/** Lane that owns the array origin: every card sits at (lane - HOME_LANE) * COLUMN_SPACING. */
export const HOME_LANE = 2;
/** Row a column's file list is anchored to: fileAtCell wraps row - HOME_ROW. */
export const HOME_ROW = 12;
/** Logical coordinates are reduced once they drift past this magnitude. */
export const REBASE_THRESHOLD = 2048;

export function wrap(value: number, count: number) {
  return ((value % count) + count) % count;
}

// Choose an occurrence of an item in an unbounded sequence. Directional moves
// use adjacent cells instead, so the last-to-first transition never reverses.
export function nearestOccurrence(
  value: number,
  center: number,
  period: number,
) {
  return value + Math.floor((center - value + period / 2) / period) * period;
}

export function fileAtCell({ lane, row }: ArchiveCell) {
  const files = columnFiles(wrap(lane, archiveColumns.length));
  return files[wrap(row - HOME_ROW, files.length)];
}

export function selectionCell(
  index: number,
  current: ArchiveCell,
  navigation?: ArchiveNavigation,
): ArchiveCell {
  if (navigation && "cell" in navigation) return { ...navigation.cell };
  const next = fileLocation(index);
  const row = nearestOccurrence(
    next.row,
    current.row,
    columnFiles(next.lane).length,
  );
  if (navigation?.axis === "row") {
    return { lane: current.lane, row: current.row + navigation.direction };
  }
  return {
    lane:
      navigation?.axis === "lane"
        ? current.lane + navigation.direction
        : nearestOccurrence(next.lane, current.lane, archiveColumns.length),
    row,
  };
}

// Preserve the reference animation's original first 160 instances. The four
// extra columns form a hidden margin on either side during interactive use.
export function poolCell(index: number): ArchiveCell {
  return {
    lane: POOL_LANES[Math.floor(index / LOOP_ROWS)],
    row: index % LOOP_ROWS,
  };
}

export function visibleCell(index: number, center: ArchiveCell): ArchiveCell {
  return {
    lane: nearestOccurrence(
      POOL_LANES[Math.floor(index / LOOP_ROWS)],
      center.lane,
      LOOP_COLUMNS,
    ),
    row: nearestOccurrence(index % LOOP_ROWS, center.row, LOOP_ROWS),
  };
}

export function cellKey(cell: ArchiveCell) {
  return `${cell.lane}:${cell.row}`;
}

export function sameCell(a: ArchiveCell, b: ArchiveCell) {
  return a.lane === b.lane && a.row === b.row;
}

function greatestCommonDivisor(a: number, b: number) {
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * Smallest positive row shift that leaves every listed column on the same
 * document. Columns hold different numbers of files, so a usable shift has to
 * be a whole cycle for all of them at once — their least common multiple.
 *
 * Returns null when that multiple stops being an exact integer. Callers must
 * then leave rows alone: shifting by the current column's count only would put
 * the other columns on the wrong documents.
 */
export function contentRowPeriod(counts: number[]): number | null {
  let period = 1;
  for (const count of counts) {
    if (!count) continue;
    period = (period / greatestCommonDivisor(period, count)) * count;
    if (!Number.isSafeInteger(period)) return null;
  }
  return period;
}

let contentCycles: { lane: number; row: number | null } | null = null;
/** Content periods of the live archive: columns for lanes, a shared cycle for rows. */
export function contentPeriods() {
  contentCycles ??= {
    lane: archiveColumns.length,
    row: contentRowPeriod(
      archiveColumns.map((_, lane) => columnFiles(lane).length),
    ),
  };
  return contentCycles;
}

/**
 * Largest whole number of `period`s inside `value`'s offset from `home`, or 0
 * when no rebase helps.
 *
 * Rounding to the nearest multiple keeps the result inside `home ± period / 2`,
 * so a rebase can never push a coordinate further from home; a period larger
 * than the threshold therefore leaves it alone instead of jumping past it.
 */
export function periodShift(
  value: number,
  home: number,
  period: number | null,
  threshold = REBASE_THRESHOLD,
) {
  if (Math.abs(value) <= threshold) return 0;
  if (period === null || !Number.isSafeInteger(period) || period <= 0) return 0;
  const shift = Math.round((value - home) / period) * period;
  return Number.isSafeInteger(shift) ? shift : 0;
}

/** Coordinates to subtract from the whole array to bring it back near home. */
export function coordinateShift(
  cell: ArchiveCell,
  threshold = REBASE_THRESHOLD,
): ArchiveCell {
  const cycles = contentPeriods();
  return {
    lane: periodShift(cell.lane, HOME_LANE, cycles.lane, threshold),
    row: periodShift(cell.row, HOME_ROW, cycles.row, threshold),
  };
}

/** Move a cell by a shift. `rebaseTracks` compensates the tracks to match. */
export function shiftCell(cell: ArchiveCell, shift: ArchiveCell): ArchiveCell {
  return { lane: cell.lane - shift.lane, row: cell.row - shift.row };
}

export type RebaseTracks = {
  /** Idle-wave phase origin: takes back what the cells give up. */
  origin: ArchiveCell;
  laneFocus: number;
  shoulder: number;
  columnCamera: number;
  rail: number;
};

/**
 * Track and spring values after a rebase. Subtracting the shift from the cells
 * and adding the matching world offset here leaves every rendered position,
 * relative distance and wave phase untouched. Velocities are never rescaled.
 */
export function rebaseTracks(shift: ArchiveCell, state: RebaseTracks): RebaseTracks {
  return {
    origin: {
      lane: state.origin.lane + shift.lane,
      row: state.origin.row + shift.row,
    },
    laneFocus: state.laneFocus - shift.lane,
    shoulder: state.shoulder - shift.row,
    columnCamera: state.columnCamera - shift.lane * COLUMN_SPACING,
    rail: state.rail + shift.row * ROW_SPACING,
  };
}
