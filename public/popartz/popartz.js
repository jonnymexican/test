/**
 * pop-artz — pure collage math. No DOM, no canvas: every helper returns
 * plain rectangles so the test suite can pin the geometry down and the
 * page just paints what these functions say.
 */

/**
 * The destination rect that covers `cell` with an image of aspect `a`
 * (width/height), centered, overflowing one edge — pair with ctx.clip().
 */
export function coverRect(cell, a) {
  var w = cell.w;
  var h = cell.h;
  var dw, dh;
  if (a > w / h) {
    dh = h;
    dw = h * a; // wider than the cell → crops left/right
  } else {
    dw = w;
    dh = w / a; // taller than the cell → crops top/bottom
  }
  return {
    x: cell.x - (dw - w) / 2,
    y: cell.y - (dh - h) / 2,
    w: dw,
    h: dh,
  };
}

/** Even grid: `cols` columns, rows filled top-down, last row centered-ish (left-aligned). */
export function gridLayout(count, cols, W, H, gap) {
  var rects = [];
  if (count < 1 || cols < 1) return rects;
  var cw = (W - gap * (cols - 1)) / cols;
  var rows = Math.ceil(count / cols);
  var ch = (H - gap * (rows - 1)) / rows;
  for (var i = 0; i < count; i++) {
    var r = Math.floor(i / cols);
    var c = i % cols;
    rects.push({ x: c * (cw + gap), y: r * (ch + gap), w: cw, h: ch });
  }
  return rects;
}

/**
 * Photo-mosaic: greedy row packing that keeps every row the same visual
 * height-ish. `aspects` are width/height ratios; returns one rect per
 * image, all rows exactly filling [0, W].
 */
export function mosaicLayout(aspects, W, targetRowH, gap) {
  var rects = [];
  if (!aspects.length) return { rects: rects, height: 0 };
  var row = [];
  var rowAspect = 0; // sum of aspect ratios in the current row
  var y = 0;
  for (var i = 0; i < aspects.length; i++) {
    row.push(aspects[i]);
    rowAspect += aspects[i];
    var projected = (W - gap * (row.length - 1)) / rowAspect;
    if (projected <= targetRowH) {
      // Row is dense enough — bake it at its natural height.
      var totalGap = gap * (row.length - 1);
      var h = (W - totalGap) / rowAspect;
      var x = 0;
      for (var k2 = 0; k2 < row.length; k2++) {
        var w2 = row[k2] * h;
        rects.push({ x: x, y: y, w: w2, h: h });
        x += w2 + gap;
      }
      y += h + gap;
      row = [];
      rowAspect = 0;
    }
  }
  if (row.length) {
    var lastGap = gap * (row.length - 1);
    var lh = Math.min(targetRowH, (W - lastGap) / rowAspect);
    var x2 = 0;
    for (var k3 = 0; k3 < row.length; k3++) {
      var w3 = row[k3] * lh;
      rects.push({ x: x2, y: y, w: w3, h: lh });
      x2 += w3 + gap;
    }
    y += lh;
  }
  return { rects: rects, height: y };
}

/** Warhol: `n×n` tiles of the same image, each with a hue rotation. */
export function warholTiles(n, W, H, gap) {
  var tiles = [];
  var size = (W - gap * (n - 1)) / n;
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      tiles.push({
        x: c * (size + gap),
        y: r * (size + gap),
        w: size,
        h: size,
        filter: 'hue-rotate(' + ((r * n + c) * (360 / (n * n))) + 'deg) saturate(1.4)',
      });
    }
  }
  return tiles;
}

/** The pop palettes — background washes for the poster. */
export var PALETTES = [
  { name: 'Bubblegum', bg: '#ffd6e8', ink: '#ff4d8d' },
  { name: 'Citrus', bg: '#fff3c4', ink: '#ff9f1c' },
  { name: 'Zap', bg: '#d7f9ff', ink: '#2ec4b6' },
  { name: 'Grape', bg: '#e8d7ff', ink: '#7b2ff7' },
];

/** Fisher–Yates, not in place — new order for the Shuffle button. */
export function shuffled(list) {
  var out = list.slice();
  for (var i = out.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}
