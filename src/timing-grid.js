export const timingGridAlphabet = "ABCÇDEFGĞHIİJKLMNOÖPQRSŞTUÜVWXYZ";
// Bubble centers in the 743 × 1050 reference coordinate system.
export function timingGrid(canvas, n, choices) {
  if (n > 100 || choices !== 5) return null;
  const w = canvas.width,
    h = canvas.height,
    p = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  // Isolate black registration marks from the pink printed grid and letters.
  const dark = (x, y) =>
    p[4 * (y * w + x)] < 142 && p[4 * (y * w + x) + 1] < 142;
  function clusters(left, right, minWidth, maxWidth) {
    const marks = [];
    let active = null;
    for (let y = 0; y < h; y++) {
      let candidate = null,
        begin = -1;
      for (let x = left; x <= right; x++) {
        if (x < right && dark(x, y)) {
          if (begin < 0) begin = x;
          continue;
        }
        if (begin >= 0) {
          const width = x - begin;
          if (
            width >= minWidth &&
            width <= maxWidth &&
            (!candidate || width > candidate.width)
          )
            candidate = { width, x: (begin + x - 1) / 2 };
          begin = -1;
        }
      }
      if (candidate) {
        if (!active) active = { top: y, sum: 0, n: 0 };
        active.sum += candidate.x;
        active.n++;
      } else if (active) {
        if (active.n >= h * 0.002 && active.n <= h * 0.015)
          marks.push([active.sum / active.n, (active.top + y - 1) / 2]);
        active = null;
      }
    }
    return marks;
  }
  const detected = clusters(0, Math.ceil(w * 0.092), w * 0.015, w * 0.035);
  const right = clusters(Math.floor(w * 0.92), w, w * 0.007, w * 0.021);
  if (detected.length < 60 || detected.length > 62) return null;
  const first = detected[0],
    last = detected.at(-1),
    step = (last[1] - first[1]) / 61;
  if (step < h * 0.011 || step > h * 0.017) return null;
  // Mend at most two interior bars. An endpoint loss or an extra ink streak
  // cannot be identified safely from a single vertical run.
  const left = [first];
  for (let i = 1; i < detected.length; i++) {
    const previous = detected[i - 1],
      next = detected[i];
    const distance = (next[1] - previous[1]) / step,
      slots = Math.round(distance);
    if (slots < 1 || slots > 3 || Math.abs(distance - slots) > 0.35)
      return null;
    for (let j = 1; j < slots; j++)
      left.push(
        previous.map((value, k) => value + ((next[k] - value) * j) / slots),
      );
    left.push(next);
  }
  if (
    left.length !== 62 ||
    left.some((a, i) => Math.abs(a[1] - first[1] - i * step) > step * 0.35)
  )
    return null;
  const near = (y) =>
    right
      .filter((p) => Math.abs(p[1] - y) < h * 0.04)
      .sort((a, b) => Math.abs(a[1] - y) - Math.abs(b[1] - y))[0];
  const top = near(first[1]),
    bottom = near(last[1]);
  if (!top || !bottom) return null;
  function point(x, y) {
    const v = (y - 86.5) / 914.5,
      u = (x - (22.2 + v * 2.1)) / (712.1 + v * 1.8 - (22.2 + v * 2.1));
    return [0, 1].map(
      (k) =>
        ((1 - v) * (first[k] * (1 - u) + top[k] * u) +
          v * (last[k] * (1 - u) + bottom[k] * u)) /
        (k ? h : w),
    );
  }
  // Interpolate the scanner feed at the neighbouring timing bars instead of
  // assuming that all 62 rows travelled through the feeder at a constant rate.
  function feedPoint(x, y) {
    const v = (y - 86.5) / 914.5,
      t = Math.min(61, Math.max(0, 61 * v)),
      i = Math.min(60, Math.floor(t)),
      f = t - i;
    const u = (x - (22.2 + v * 2.1)) / (712.1 + v * 1.8 - (22.2 + v * 2.1));
    return point(x, y).map((value, k) => {
      const measured = left[i][k] * (1 - f) + left[i + 1][k] * f;
      const linear = first[k] * (1 - v) + last[k] * v;
      return value + ((1 - u) * (measured - linear)) / (k ? h : w);
    });
  }
  const areas = [];
  for (let i = 0; i < Math.ceil(n / 25); i++) {
    const rows = Math.min(25, n - 25 * i),
      x = [309.7, 414.7, 519, 623.5][i];
    const points = [
      point(x, 642.6),
      point(x + 59.7, 642.6),
      point(x + (0.6 * (rows - 1)) / 24, 642.6 + 14.94 * (rows - 1)),
    ];
    const rowOffsets = [];
    for (let r = 0; r < rows; r++) {
      const start = feedPoint(x + (0.6 * r) / 24, 642.6 + 14.94 * r);
      const row = Array.from({ length: 5 }, (_, c) =>
        start.map((v, k) => v + (c * (points[1][k] - points[0][k])) / 4),
      );
      const offset = fitPrintedRow(p, w, h, row);
      rowOffsets.push(
        start.map(
          (v, k) =>
            v +
            offset[k] -
            points[0][k] -
            ((points[2][k] - points[0][k]) * r) / Math.max(rows - 1, 1),
        ),
      );
    }
    areas.push({ id: false, rows, cols: 5, points, rowOffsets });
  }
  areas.push({
    id: true,
    rows: 10,
    cols: 11,
    points: [point(70.7, 447.8), point(220.2, 447.8), point(71, 582.3)],
  });
  areas.push({
    id: "booklet",
    rows: 1,
    cols: 2,
    points: [point(131.3, 672.7), point(161.1, 672.7), point(131.3, 672.7)],
  });
  areas.push({
    id: "name",
    alphabet: timingGridAlphabet,
    rows: timingGridAlphabet.length,
    cols: 22,
    points: [point(384, 116.8), point(697.5, 116.8), point(384.4, 582.2)],
  });
  return areas;
}

// Refine the timing-bar prediction using coloured outlines, not the student's
// graphite. Taking the median over five bubbles tolerates a filled circle.
function fitPrintedRow(p, w, h, row) {
  const pts = row.map(([x, y]) => [x * w, y * h]);
  const pitch = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
  const reach = Math.min(6, Math.max(1, Math.floor(0.2 * pitch)));
  const ring = Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8;
    return [0.34, 0.5].map((r) => [
      Math.cos(a) * pitch * r,
      Math.sin(a) * pitch * r,
    ]);
  });
  function pink(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= w || y < 0 || y >= h) return 0;
    const i = 4 * (y * w + x);
    return Math.max(0, p[i] - p[i + 1]);
  }
  function score(dx, dy) {
    const scores = pts
      .map(([x, y]) => {
        let sum = 0;
        for (const [on, off] of ring)
          sum +=
            pink(x + dx + on[0], y + dy + on[1]) -
            pink(x + dx + off[0], y + dy + off[1]);
        return sum / ring.length;
      })
      .sort((a, b) => a - b);
    return scores[2];
  }
  const initial = score(0, 0);
  let best = initial,
    dx = 0,
    dy = 0;
  for (let j = -reach; j <= reach; j++)
    for (let i = -reach; i <= reach; i++) {
      const v = score(i, j);
      if (v > best) {
        best = v;
        dx = i;
        dy = j;
      }
    }
  return best >= 12 && best > initial + 3 ? [dx / w, dy / h] : [0, 0];
}
