export interface JustifiedBox {
  /** Index into the input array. */
  index: number;
  width: number;
  height: number;
}

export interface JustifiedRow {
  top: number;
  height: number;
  boxes: JustifiedBox[];
}

export interface JustifiedLayout {
  rows: JustifiedRow[];
  height: number;
}

export interface JustifiedOptions {
  containerWidth: number;
  targetRowHeight: number;
  gap: number;
  /** Rows are never taller than targetRowHeight * maxScale (guards against very wide lone items). */
  maxScale?: number;
}

const MIN_RATIO = 0.4;
const MAX_RATIO = 3.5;

/** width / height, clamped, with 1 as a fallback when dimensions are unknown. */
export function aspectRatioOf(width: number | null | undefined, height: number | null | undefined): number {
  if (!width || !height || width <= 0 || height <= 0) return 1;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height));
}

/**
 * Greedy justified-rows layout (Flickr / Google Photos style). Pure function: no DOM access.
 * Every full row exactly fills containerWidth; the last row keeps the target height.
 */
export function computeJustifiedLayout(ratios: readonly number[], opts: JustifiedOptions): JustifiedLayout {
  const { containerWidth, targetRowHeight, gap } = opts;
  const maxHeight = targetRowHeight * (opts.maxScale ?? 1.6);
  const rows: JustifiedRow[] = [];
  if (containerWidth <= 0 || ratios.length === 0) return { rows, height: 0 };

  let top = 0;
  let start = 0;
  let ratioSum = 0;

  const pushRow = (end: number, height: number, stretch: boolean) => {
    const boxes: JustifiedBox[] = [];
    const count = end - start;
    const available = containerWidth - gap * (count - 1);
    let used = 0;
    for (let i = start; i < end; i++) {
      const isLast = i === end - 1;
      let w = Math.floor(ratios[i] * height);
      // Give rounding leftovers to the last box so full rows are pixel-exact.
      if (isLast && stretch) w = available - used;
      boxes.push({ index: i, width: Math.max(1, w), height });
      used += w;
    }
    rows.push({ top, height, boxes });
    top += height + gap;
  };

  for (let i = 0; i < ratios.length; i++) {
    const count = i - start + 1;
    const sumWith = ratioSum + ratios[i];
    if (sumWith * targetRowHeight + gap * (count - 1) < containerWidth) {
      ratioSum = sumWith;
      continue;
    }
    // Adding item i overflows the row. Choose between closing the row with or without it,
    // whichever keeps the row height closest (proportionally) to the target.
    const heightWith = (containerWidth - gap * (count - 1)) / sumWith;
    if (count > 1) {
      const heightWithout = (containerWidth - gap * (count - 2)) / ratioSum;
      if (heightWithout <= maxHeight && heightWithout / targetRowHeight < targetRowHeight / heightWith) {
        pushRow(i, Math.round(heightWithout), true);
        start = i;
        ratioSum = 0;
        i--; // re-process item i as the first item of the next row
        continue;
      }
    }
    pushRow(i + 1, Math.round(heightWith), true);
    start = i + 1;
    ratioSum = 0;
  }

  if (start < ratios.length) {
    // Last row: keep the target height, never stretch to fill.
    pushRow(ratios.length, Math.round(targetRowHeight), false);
  }

  return { rows, height: Math.max(0, top - gap) };
}
