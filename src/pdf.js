import { jsPDF } from 'jspdf';
import { piece } from './data/piece.js';
import { settings } from './data/settings.js';

// ── Layout constants ──────────────────────────────────────────────────────────

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const USABLE_W = PAGE_W - MARGIN * 2; // 182 mm

const LINE_NUM_W = 10; // left zone for "1." labels
const REPEAT_ZONE = 10; // right zone reserved for section-repeat bar + label
const TILES_X = MARGIN + LINE_NUM_W; // 24 mm — left edge of tile rows
const TILES_W = USABLE_W - LINE_NUM_W - REPEAT_ZONE; // 162 mm

const BEATS_PER_ROW = 8;
const BEAT_W = TILES_W / BEATS_PER_ROW; // 20.25 mm per beat

const DOT_ZONE = 3; // mm above each tile row reserved for beat dots
const TILE_H = 13; // mm of tile content (hand / name / instruction)
const ROW_H = DOT_ZONE + TILE_H; // 16 mm per tile row

const ROW_GAP = 2; // mm between wrapped rows within the same line
const LINE_GAP = 5; // mm between distinct score items

const INSTR_FONT_PT = 7; // font size for below-row instruction labels
const INSTR_TRACK_H = 4; // mm per instruction track
const INSTR_TOP_OFFSET = 3; // mm from tile-row bottom to first instruction baseline

// Section bar: vertical line at the left of the repeat zone, label to its right.
const SECTION_BAR_X = TILES_X + TILES_W + 2; // 188 mm
const SECTION_LABEL_X = SECTION_BAR_X + 2; // 190 mm — left-aligned label starts here

// ── Image helpers ─────────────────────────────────────────────────────────────

/**
 * Resolves the natural pixel dimensions of an image data URL.
 * @param {string} dataUrl
 * @returns {Promise<{w: number, h: number}>}
 */
function getImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = dataUrl;
  });
}

/**
 * Returns the jsPDF format identifier for a data URL image.
 * @param {string} dataUrl
 * @returns {'PNG'|'WEBP'|'JPEG'}
 */
function detectFormat(dataUrl) {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Generates and downloads an A4 portrait PDF of the current piece.
 *
 * Background: `piece.icon` if set, otherwise `settings.defaultBackground`.
 * The image is placed at (0, 0) on every page, stretched to full page width
 * with the aspect ratio preserved.
 *
 * Sound lines wrap after every 8 beats; tile widths are proportional to beat
 * duration. Tiles are rendered without borders: a beat dot above, then hand,
 * name (bold, emphasis-underlined if set), and instruction text below.
 *
 * Line multipliers (single-line repeats) appear as "×N" at the end of the
 * last tile row. Section multipliers (multi-line repeats) appear as an orange
 * vertical bar on the right margin with "×N" centred beside it.
 */
export async function exportPdf() {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ── Background image setup ───────────────────────────────────────────────

  const bgDataUrl = piece.icon ?? settings.defaultBackground ?? null;
  let bgH = 0;
  let bgFmt = 'JPEG';

  if (bgDataUrl) {
    const { w, h } = await getImageDimensions(bgDataUrl);
    bgH = (h / w) * PAGE_W;
    bgFmt = detectFormat(bgDataUrl);
  }

  let currentPage = 1;
  let y = MARGIN;

  function drawBg() {
    if (bgDataUrl) doc.addImage(bgDataUrl, bgFmt, 0, 0, PAGE_W, bgH);
  }

  function newPage() {
    doc.addPage();
    currentPage++;
    drawBg();
    y = MARGIN;
  }

  /** Moves to a new page if fewer than `needed` mm remain on the current page. */
  function ensureSpace(needed) {
    if (y + needed > PAGE_H - MARGIN) newPage();
  }

  drawBg();

  // ── Header ───────────────────────────────────────────────────────────────

  const headerY = y;

  // Title (centred)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(0);
  doc.text(piece.title || 'Untitled', PAGE_W / 2, headerY, { align: 'center' });

  // Metadata (top-right, one field per line)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text(piece.taiko ?? '', PAGE_W - MARGIN, headerY, { align: 'right' });
  doc.text(piece.jiuchi ?? '', PAGE_W - MARGIN, headerY + 4.5, { align: 'right' });
  doc.text(piece.bpm ? `${piece.bpm} BPM` : '', PAGE_W - MARGIN, headerY + 9, { align: 'right' });

  y += 15;

  // ── Prep ─────────────────────────────────────────────────────────────────

  const time = piece.time;
  const markers = piece.lines.filter((l) => l.type === 'block-repeat');

  // Single-line repeat markers keyed by the line they wrap.
  const singleLineMarkerMap = new Map(
    markers.filter((m) => m.lineIds.length === 1).map((m) => [m.lineIds[0], m])
  );

  /**
   * Rendered y extents per line ID — consumed when drawing section bars.
   * @type {Map<string, {page: number, startY: number, endY: number}>}
   */
  const lineYMap = new Map();

  /** Multi-line block-repeat markers rendered after the main pass. */
  const pendingSectionBars = [];

  let lineOrdinal = 0;

  // ── Main render loop ─────────────────────────────────────────────────────

  for (const item of piece.lines) {
    // Heading
    if (item.type === 'heading') {
      if (!item.text) continue;
      ensureSpace(9);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.text(item.text, MARGIN, y + 4);
      y += 9 + LINE_GAP;
      continue;
    }

    // Note
    if (item.type === 'note') {
      if (!item.text) continue;
      ensureSpace(8);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text(item.text, MARGIN, y + 4, { maxWidth: USABLE_W });
      y += 8 + LINE_GAP;
      continue;
    }

    // Divider
    if (item.type === 'divider') {
      ensureSpace(6);
      doc.setDrawColor(0);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, y + 2, MARGIN + USABLE_W, y + 2);
      y += 6 + LINE_GAP;
      continue;
    }

    // Block-repeat marker: single-line repeats are rendered inline with their
    // line; multi-line repeats are drawn as section bars after the main pass.
    if (item.type === 'block-repeat') {
      if (item.lineIds.length > 1)
        pendingSectionBars.push({ lineIds: item.lineIds, count: item.count });
      continue;
    }

    // Sound line
    if (item.sounds.length === 0) continue;
    lineOrdinal++;

    const singleRepeat = singleLineMarkerMap.get(item.id) ?? null;
    const flatSounds = item.sounds;

    // Split flat sounds into rows of ≤ BEATS_PER_ROW beats.
    const rows = [];
    let curRow = [];
    let curBeats = 0;
    for (const s of flatSounds) {
      const sb = s.duration / time;
      if (curRow.length > 0 && curBeats + sb > BEATS_PER_ROW) {
        rows.push(curRow);
        curRow = [s];
        curBeats = sb;
      } else {
        curRow.push(s);
        curBeats += sb;
      }
    }
    if (curRow.length > 0) rows.push(curRow);

    let lineStartY = null;
    let lineStartPage = null;

    // Tracks cumulative duration across all rows of this line so that beat-dot
    // decisions are correct even when a row starts mid-beat.
    let cumDuration = 0;

    // Space added below the last row by its instruction tracks (0 if none).
    let lastRowInstrSpace = 0;

    rows.forEach((rowSounds, rowIdx) => {
      ensureSpace(ROW_H);

      if (lineStartY === null) {
        lineStartY = y;
        lineStartPage = currentPage;
      }

      const rowY = y;

      // Collect instruction items for below-row rendering.
      const instrItems = [];

      // Tiles (no border) — beat dot centred above each tile that starts on
      // an integer beat boundary (cumDuration divisible by time).
      let xOff = 0;
      for (const sound of rowSounds) {
        const tw = (sound.duration / time) * BEAT_W;
        const cx = TILES_X + xOff + tw / 2;

        // Beat dot
        if (cumDuration % time === 0) {
          doc.setFillColor(0);
          doc.circle(cx, rowY + 1.5, 0.8, 'F');
        }

        // Name
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.text(sound.name, cx, rowY + DOT_ZONE + 5, { align: 'center' });

        // Emphasis underline
        if (sound.emphasis) {
          const nw = doc.getTextWidth(sound.name);
          doc.setDrawColor(0);
          doc.setLineWidth(0.3);
          doc.line(cx - nw / 2, rowY + DOT_ZONE + 5.7, cx + nw / 2, rowY + DOT_ZONE + 5.7);
        }

        // Hand (below name)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(0);
        doc.text(sound.hand ?? '', cx, rowY + DOT_ZONE + 9, { align: 'center' });

        // Collect instruction for below-row rendering.
        if (sound.instruction) {
          instrItems.push({ x: TILES_X + xOff + 1, text: sound.instruction });
        }

        xOff += tw;
        cumDuration += sound.duration;
      }

      // Line number in left margin (first row only)
      if (rowIdx === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(0);
        doc.text(`${lineOrdinal}.`, TILES_X - 1, rowY + DOT_ZONE + 6, { align: 'right' });
      }

      // Line multiplier at end of last row
      if (rowIdx === rows.length - 1 && singleRepeat) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.text(`×${singleRepeat.count}`, TILES_X + xOff + 2, rowY + DOT_ZONE + 7.5);
      }

      y += ROW_H;

      // Render instructions below the tile row in greedy non-overlapping tracks,
      // matching the app's measureInstructions layout (left-aligned at tile left + 1mm,
      // each track INSTR_TRACK_H mm below the previous).
      let numTracks = 0;
      if (instrItems.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(INSTR_FONT_PT);
        doc.setTextColor(0);

        /** Rightmost x reached on each track (mm). */
        const trackEnds = [];
        const placed = instrItems.map(({ x, text }) => {
          const w = doc.getTextWidth(text);
          let track = 0;
          while (track < trackEnds.length && trackEnds[track] > x) track++;
          if (track === trackEnds.length) trackEnds.push(0);
          trackEnds[track] = x + w + 1; // 1 mm gap between labels on same track
          return { x, text, track };
        });

        numTracks = trackEnds.length;

        for (const { x, text, track } of placed) {
          doc.text(text, x, rowY + ROW_H + INSTR_TOP_OFFSET + track * INSTR_TRACK_H);
        }
      }

      // Total vertical space consumed below this row's tile area by instruction tracks.
      const instrSpace = numTracks > 0 ? INSTR_TOP_OFFSET + numTracks * INSTR_TRACK_H + 2 : 0;
      lastRowInstrSpace = instrSpace;

      if (rowIdx < rows.length - 1) y += Math.max(ROW_GAP, instrSpace);
    });

    // Include the last row's instruction space so lineYMap and section bars span it.
    y += lastRowInstrSpace;
    lineYMap.set(item.id, { page: lineStartPage, startY: lineStartY, endY: y });
    y += LINE_GAP;
  }

  // ── Deferred section bars ─────────────────────────────────────────────────

  for (const { lineIds, count } of pendingSectionBars) {
    const entries = lineIds.map((id) => lineYMap.get(id)).filter(Boolean);
    if (entries.length === 0) continue;

    // Group entries by page.
    const byPage = new Map();
    for (const e of entries) {
      if (!byPage.has(e.page)) byPage.set(e.page, []);
      byPage.get(e.page).push(e);
    }
    const pageNums = [...byPage.keys()].sort((a, b) => a - b);

    // Draw a vertical bar segment on each page the section spans.
    for (const pg of pageNums) {
      const pgEntries = byPage.get(pg);
      const barTop = Math.min(...pgEntries.map((e) => e.startY));
      const barBot = Math.max(...pgEntries.map((e) => e.endY));
      doc.setPage(pg);
      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
      doc.line(SECTION_BAR_X, barTop, SECTION_BAR_X, barBot);
    }

    // "×N" label centred on the first page's bar segment.
    const firstEntries = byPage.get(pageNums[0]);
    const labelTop = Math.min(...firstEntries.map((e) => e.startY));
    const labelBot =
      pageNums.length === 1 ? Math.max(...firstEntries.map((e) => e.endY)) : PAGE_H - MARGIN;
    doc.setPage(pageNums[0]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text(`×${count}`, SECTION_LABEL_X, (labelTop + labelBot) / 2);
  }

  doc.save(`${piece.title || 'taiko'}.pdf`);
}
