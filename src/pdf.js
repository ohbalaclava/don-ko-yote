import { jsPDF } from 'jspdf';
import { piece, singleLineRepeatMap, jiuchiLineMap, lanesOf } from './data/piece.js';
import { settings } from './data/settings.js';
import { effectiveVolume, groupIntoLigatures, packIntoTracks } from './util.js';
import { tileTintPdfRgb } from './tileColor.js';
import { uid } from './uid.js';

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
const MIN_GAP_W = 1; // mm — a sub-beat blank still has to be visible

// An ensemble score needs room for part names on the left, so its tile zone is
// narrower. A one-part score keeps the constants above, which is what leaves its
// output identical to the pre-ensemble app.
const PART_LABEL_W = 24; // left zone for the ordinal, set bracket and part name
const PART_TILES_X = MARGIN + PART_LABEL_W; // 38 mm
const PART_TILES_W = USABLE_W - PART_LABEL_W - REPEAT_ZONE; // 148 mm
const PART_BEAT_W = PART_TILES_W / BEATS_PER_ROW; // 18.5 mm per beat
const BRACKET_X = MARGIN + 4.5; // set bracket, left of the names
const BRACKET_ARM = 1.2; // mm of horizontal arm at each end of a set bracket
const PART_NAME_X = BRACKET_X + 1.5;
const PART_NAME_W = PART_TILES_X - PART_NAME_X - 1.5; // mm available for a name

const DOT_ZONE = 3; // mm above each tile row reserved for beat dots
// Breathing room between a label clamped to its cell's edge and that edge, so a
// slid label does not sit flush against the tint's border.
const LABEL_PAD = 0.8;
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

// ── Layout helpers ──────────────────────────────────────────────────────────────

/**
 * Splits a flat sound array into rows of at most BEATS_PER_ROW beats. A sound is
 * never split across rows; a row may exceed the limit only if its single sound
 * already does. Always returns at least one row when there are sounds.
 * @param {Array<{ duration: number }>} flatSounds
 * @param {number} time - Divisions per beat.
 * @returns {Array<Array<object>>}
 */
export function splitIntoRows(flatSounds, time) {
  const rows = [];
  let curRow = [];
  let curBeats = 0;
  for (const s of flatSounds) {
    const sb = ((s.gap ?? 0) + s.duration) / time;
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
  return rows;
}

/**
 * Splits every lane of a system at the same absolute beat boundaries, so the
 * parts stay column-aligned when a system wraps onto a second row. A sound sits
 * in the chunk its start falls in, even if it runs past the boundary.
 * @param {Array<{ sounds: Array<{ duration: number }> }>} lanes
 * @param {number} time - Divisions per beat.
 * @returns {Array<Array<Array<{ sound: object, startDiv: number }>>>} chunk → lane → cells
 */
export function splitSystemIntoChunks(lanes, time) {
  const chunkDiv = BEATS_PER_ROW * time;
  const chunks = [];
  const blank = () => lanes.map(() => []);
  lanes.forEach((lane, laneIdx) => {
    let pos = 0;
    for (const sound of lane.sounds ?? []) {
      pos += sound.gap ?? 0; // leading silence: a sparse set lane's blank space
      const c = Math.floor(pos / chunkDiv);
      while (chunks.length <= c) chunks.push(blank());
      chunks[c][laneIdx].push({ sound, startDiv: pos });
      pos += sound.duration;
    }
  });
  if (!chunks.length) chunks.push(blank());
  return chunks;
}

/**
 * Runs of consecutive parts sharing a taiko set — the drums one person plays,
 * linked by a bracket in the label zone.
 * @param {Array<{ setId: string|null }>} parts
 * @returns {Array<{ setId: string, from: number, to: number }>} Inclusive index runs.
 */
export function setRuns(parts) {
  const runs = [];
  parts.forEach((part, i) => {
    if (!part.setId) return;
    const last = runs[runs.length - 1];
    if (last && last.setId === part.setId && last.to === i - 1) last.to = i;
    else runs.push({ setId: part.setId, from: i, to: i });
  });
  return runs;
}

/**
 * Centre at which to draw a centre-aligned label so it stays within its cell,
 * moving it the least distance that achieves it. A label wider than the cell is
 * centred on the cell, which overflows evenly rather than to one side.
 * @param {number} centreX - Where the label wants to be centred.
 * @param {number} labelW - Rendered label width, same units.
 * @param {number|null} cellX - Cell's left edge; null means no cell to stay inside.
 * @param {number} cellW - Cell width.
 * @returns {number} Centre to draw at.
 */
export function clampLabelX(centreX, labelW, cellX, cellW) {
  if (cellX == null || !(cellW > 0)) return centreX;
  const lo = cellX + labelW / 2;
  const hi = cellX + cellW - labelW / 2;
  if (lo > hi) return cellX + cellW / 2;
  return Math.min(Math.max(centreX, lo), hi);
}

/**
 * Draws one sound: an optional colour tint, the name (emphasis-underlined), and
 * the hand with its volume. Shared by the solo and ensemble layouts.
 *
 * `textX` is the sound's **onset** — the centre of its first subdivision, under
 * the beat dot — which is where the label wants to sit. A name is wider than one
 * subdivision at any realistic tempo (`DON` is 7 mm against a 5 mm subdivision at
 * time 4), so on a tile longer than a subdivision that centring would hang the
 * label off the cell's left edge. The label is therefore kept inside the cell box
 * (`tintX` … `tintX + tintW`, the tinted tile), sliding right only as far as it
 * must, and centred on the box when the name is wider than the box itself.
 * @param {import('jspdf').jsPDF} doc
 * @param {object} sound
 * @param {{ rowY: number, textX: number, tintX: number|null, tintW: number, showVolume: boolean }} geom
 */
function drawSoundCell(doc, sound, { rowY, textX, tintX, tintW, showVolume }) {
  const tint = settings.colourTiles ? tileTintPdfRgb(sound) : null;
  if (tint != null && tintX != null) {
    doc.setFillColor(tint.r, tint.g, tint.b);
    doc.roundedRect(tintX, rowY + DOT_ZONE + 0.5, tintW, 10, 1, 1, 'F');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0);
  const nw = doc.getTextWidth(sound.name);
  // The hand and volume ride the same anchor as the name, so the cell reads as
  // one label however far it had to slide. The box it is held inside is the cell
  // less `LABEL_PAD` at each edge, which is what keeps a slid label off the border.
  const labelX = clampLabelX(
    textX,
    nw,
    tintX == null ? null : tintX + LABEL_PAD,
    tintW - 2 * LABEL_PAD
  );
  doc.text(sound.name, labelX, rowY + DOT_ZONE + 5, { align: 'center' });

  if (sound.emphasis) {
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.line(labelX - nw / 2, rowY + DOT_ZONE + 5.7, labelX + nw / 2, rowY + DOT_ZONE + 5.7);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(0);
  const vol = showVolume ? effectiveVolume(sound) : null;
  if (vol != null) {
    doc.text(sound.hand, labelX - 0.5, rowY + DOT_ZONE + 9, { align: 'right' });
    doc.text(String(vol), labelX + 0.5, rowY + DOT_ZONE + 9, { align: 'left' });
  } else {
    doc.text(sound.hand ?? '', labelX, rowY + DOT_ZONE + 9, { align: 'center' });
  }
}

/**
 * Truncates a label to fit a width, appending nothing — a clipped part name is
 * better than one running into the music.
 * @param {import('jspdf').jsPDF} doc
 * @param {string} text
 * @param {number} maxW - Millimetres.
 * @returns {string}
 */
function fitText(doc, text, maxW) {
  let out = text ?? '';
  while (out.length > 1 && doc.getTextWidth(out) > maxW) out = out.slice(0, -1);
  return out;
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

  // Metadata (top-right, one field per line). An ensemble lists every part in
  // place of the single drum; a one-part score prints exactly the three lines it
  // always has.
  // `parts` is tolerated as absent, the way `lanesOf` tolerates a legacy row.
  const parts = piece.parts ?? [];
  const ensemble = parts.length > 1;
  const metaLines = [
    ...(ensemble
      ? parts.map((part) => (part.name ? `${part.name} — ${part.taiko}` : part.taiko))
      : [piece.taiko ?? '']),
    piece.jiuchi ?? '',
    piece.bpm ? `${piece.bpm} BPM` : '',
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0);
  metaLines.forEach((text, i) => {
    doc.text(text, PAGE_W - MARGIN, headerY + i * 4.5, { align: 'right' });
  });

  y += Math.max(15, (metaLines.length - 1) * 4.5 + 6);

  // ── Prep ─────────────────────────────────────────────────────────────────

  const time = piece.time;

  // Single-line repeat markers keyed by the line they wrap.
  const singleLineMarkerMap = singleLineRepeatMap(piece.lines);
  const jiuchiMap = jiuchiLineMap(piece.lines);

  /**
   * Rendered y extents per line ID — consumed when drawing section bars.
   * @type {Map<string, {page: number, startY: number, endY: number}>}
   */
  const lineYMap = new Map();

  /** Multi-line block-repeat markers rendered after the main pass. */
  const pendingSectionBars = [];

  let lineOrdinal = 0;
  const nonProp = !settings.proportionalWidth;

  /**
   * Draws the label-zone entry for one lane: the part name, its drum, and — on
   * the first lane of a taiko set — the player's name beside the bracket.
   * @param {object} lane
   * @param {string} systemId
   * @param {number} rowY
   * @param {{ name: string }|null} setFirst - The set, when this lane opens its run.
   */
  function drawLaneLabel(lane, systemId, rowY, setFirst) {
    const part = piece.partById(lane.partId);
    const name = part ? part.name || part.taiko : 'Jiuchi';
    const sub = part ? (part.name ? part.taiko : '') : (jiuchiMap.get(systemId) ?? '');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(0);
    doc.text(fitText(doc, name, PART_NAME_W), PART_NAME_X, rowY + DOT_ZONE + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(130, 130, 130);
    if (sub) doc.text(fitText(doc, sub, PART_NAME_W), PART_NAME_X, rowY + DOT_ZONE + 7);
    if (setFirst?.name) {
      doc.setTextColor(120, 90, 160);
      doc.text(fitText(doc, setFirst.name, PART_NAME_W), PART_NAME_X, rowY + DOT_ZONE + 10);
    }
    doc.setTextColor(0);
  }

  /**
   * Draws one ensemble system: every lane stacked over one shared beat ruler, so
   * beat N of every part lands at the same x. Cells are always laid out
   * proportionally (width = duration), which is what keeps the columns aligned —
   * `settings.proportionalWidth` governs the solo layout only.
   * @param {object} system
   * @param {Array<object>} lanes
   * @param {{ count: number }|null} singleRepeat
   */
  function drawEnsembleSystem(system, lanes, singleRepeat) {
    const chunks = splitSystemIntoChunks(lanes, time);
    const chunkDiv = BEATS_PER_ROW * time;
    const subdivW = PART_BEAT_W / time;
    // Lane index per part, so a set's bracket spans the right sub-rows.
    const laneOfPart = new Map(lanes.map((lane, i) => [lane.partId, i]));
    const runs = setRuns(parts)
      .map((run) => ({
        set: piece.sets.find((s) => s.id === run.setId) ?? null,
        from: laneOfPart.get(parts[run.from].id),
        to: laneOfPart.get(parts[run.to].id),
      }))
      .filter((run) => run.from != null && run.to != null);

    let startY = null;
    let startPage = null;

    chunks.forEach((chunk, chunkIdx) => {
      // Lay the whole chunk out before drawing any of it, so a system row is
      // never split across a page break.
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(INSTR_FONT_PT);
      const plans = chunk.map((cells) => {
        const instrItems = cells
          .filter((c) => c.sound.instruction)
          .map((c) => ({
            x: PART_TILES_X + ((c.startDiv % chunkDiv) / time) * PART_BEAT_W + 1,
            text: c.sound.instruction,
          }));
        const packed = instrItems.length
          ? packIntoTracks(
              instrItems.map(({ x, text }) => ({ start: x, end: x + doc.getTextWidth(text) + 1 }))
            )
          : { tracks: [], trackCount: 0 };
        const instrSpace = packed.trackCount
          ? INSTR_TOP_OFFSET + packed.trackCount * INSTR_TRACK_H + 2
          : 0;
        return { cells, instrItems, tracks: packed.tracks, instrSpace };
      });

      ensureSpace(plans.reduce((h, plan) => h + ROW_H + plan.instrSpace, 0));
      if (startY === null) {
        startY = y;
        startPage = currentPage;
      }

      const rowTops = [];
      let rowEndX = PART_TILES_X;
      // Divisions this chunk occupies, over every lane: the beat ruler is drawn to
      // this width on every sub-row, so a lane that is blank here still shows the
      // beats (a set's lane is blank wherever that drum is resting) and the ruler
      // never runs past the music.
      const chunkEnd = chunk.reduce(
        (end, cells) =>
          cells.reduce(
            (e, c) => Math.max(e, Math.min(chunkDiv, (c.startDiv % chunkDiv) + c.sound.duration)),
            end
          ),
        0
      );

      plans.forEach((plan, laneIdx) => {
        const rowY = y;
        rowTops.push(rowY);

        for (let div = 0; div < chunkEnd; div++) {
          const dotX = PART_TILES_X + (div / time) * PART_BEAT_W + subdivW / 2;
          if (div % time === 0) {
            doc.setFillColor(0);
            doc.circle(dotX, rowY + 1.5, 0.8, 'F');
          } else {
            doc.setDrawColor(150, 150, 150);
            doc.setLineWidth(0.15);
            doc.circle(dotX, rowY + 1.5, 0.55, 'S');
          }
        }

        for (const { sound, startDiv } of plan.cells) {
          const col = startDiv % chunkDiv;
          const x = PART_TILES_X + (col / time) * PART_BEAT_W;
          const tw = (sound.duration / time) * PART_BEAT_W;

          drawSoundCell(doc, sound, {
            rowY,
            textX: x + subdivW / 2,
            tintX: x + 0.3,
            tintW: tw - 0.6,
            showVolume: piece.showVolume,
          });
          rowEndX = Math.max(rowEndX, x + tw);
        }

        const opensRun = runs.find((run) => run.from === laneIdx);
        drawLaneLabel(lanes[laneIdx], system.id, rowY, opensRun?.set ?? null);

        if (plan.instrItems.length) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(INSTR_FONT_PT);
          doc.setTextColor(0);
          plan.instrItems.forEach(({ x, text }, i) => {
            doc.text(text, x, rowY + ROW_H + INSTR_TOP_OFFSET + plan.tracks[i] * INSTR_TRACK_H);
          });
        }

        y += ROW_H + plan.instrSpace;
      });

      // Taiko-set bracket: a `[` down the label zone across the sub-rows of the
      // drums one person plays. The arms are what say where the run starts and
      // stops — a bare vertical line reads as a margin rule.
      doc.setDrawColor(150, 120, 190);
      doc.setLineWidth(0.5);
      for (const run of runs) {
        const top = rowTops[run.from] + DOT_ZONE;
        const bottom = rowTops[run.to] + DOT_ZONE + TILE_H;
        doc.line(BRACKET_X, top, BRACKET_X, bottom);
        doc.line(BRACKET_X, top, BRACKET_X + BRACKET_ARM, top);
        doc.line(BRACKET_X, bottom, BRACKET_X + BRACKET_ARM, bottom);
      }

      if (chunkIdx === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(0);
        doc.text(`${lineOrdinal}.`, MARGIN, rowTops[0] + DOT_ZONE + 4);
      }

      if (chunkIdx === chunks.length - 1 && singleRepeat) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.text(`×${singleRepeat.count}`, rowEndX + 2, rowTops[0] + DOT_ZONE + 7.5);
      }

      if (chunkIdx < chunks.length - 1) y += ROW_GAP;
    });

    lineYMap.set(system.id, { page: startPage, startY, endY: y });
    y += LINE_GAP;
  }

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
      y += 6 + LINE_GAP;
      continue;
    }

    // Note
    if (item.type === 'note') {
      if (!item.text) continue;
      ensureSpace(8);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text(item.text, MARGIN, y + 2, { maxWidth: USABLE_W });
      y += 6 + LINE_GAP;
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

    // Jiuchi section marker: a small label introducing the base-rhythm region.
    // The definition lines below it still render (as reference), tagged "JIUCHI".
    if (item.type === 'jiuchi-section') {
      ensureSpace(7);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(80, 130, 80);
      doc.text(`JIUCHI · ${item.taiko}`, MARGIN, y + 3);
      doc.setTextColor(0);
      y += 5 + LINE_GAP;
      continue;
    }

    // Block-repeat marker: single-line repeats are rendered inline with their
    // line; multi-line repeats are drawn as section bars after the main pass.
    if (item.type === 'block-repeat') {
      if (item.lineIds.length > 1)
        pendingSectionBars.push({ lineIds: item.lineIds, count: item.count });
      continue;
    }

    // Sound line (a system): one lane per part. An ensemble takes the stacked
    // layout — including a single-lane jiuchi definition row, so its beats stay in
    // the same columns as the parts above it.
    const lanes = lanesOf(item);
    if (lanes.every((lane) => !lane.sounds?.length)) continue;
    lineOrdinal++;

    const singleRepeat = singleLineMarkerMap.get(item.id) ?? null;

    if (ensemble) {
      drawEnsembleSystem(item, lanes, singleRepeat);
      continue;
    }

    const laneSounds = lanes[0].sounds;
    const rows = splitIntoRows(laneSounds, time);

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

      // Proportional mode: one dot per subdivision; non-proportional mode:
      // beat-dot only. In non-prop mode single (non-ligated) sounds get BEAT_W
      // each (8 beats = full row); ligated sub-sounds are packed at BEAT_W/4
      // each (~¼ the centre-to-centre spacing of non-joined sounds).
      const subdivW = BEAT_W / time;
      let xOff = 0;

      /**
       * Draws name, emphasis underline, and hand/volume for one sound at textX.
       * With colour-coded tiles on, first fills a tint rect (tintX/tintW) behind
       * the text — kept below the beat-dot zone so dots stay on white.
       */
      const drawSound = (sound, textX, tintX, tintW) => {
        drawSoundCell(doc, sound, {
          rowY,
          textX,
          tintX,
          tintW,
          showVolume: piece.showVolume,
        });
        cumDuration += sound.duration;
      };

      if (nonProp) {
        const halfBeat = BEAT_W / 2;
        const ligW = BEAT_W / 4; // centre-to-centre spacing of ligated sub-sounds
        const eighthBeat = BEAT_W / 8; // trailing gap after each ligature group
        const slotW = ligW + eighthBeat; // x advance of one non-ligated sound
        const ligItems = groupIntoLigatures(rowSounds, time, cumDuration);
        for (const item of ligItems) {
          const isSingle = 'sound' in item;
          const sounds = isSingle ? [item.sound] : item.sounds;
          // Leading silence. A ligature never spans a gap, so it is the first
          // member's. Widths here are token spacings, not proportional ones: a
          // single sound advances x by `slotW` whatever its duration, so silence is
          // measured in those slots — one per beat — rather than in BEAT_W, which
          // would draw a blank beat nearly three times the width of a played one.
          const gapDivs = sounds[0].gap ?? 0;
          if (gapDivs) {
            xOff += Math.max(MIN_GAP_W, (gapDivs / time) * slotW);
            cumDuration += gapDivs;
          }
          const anchor = TILES_X + xOff + halfBeat / 2;

          let subPos = item.startPos;
          sounds.forEach((sound, si) => {
            const textX = anchor + si * ligW;

            if (subPos % time === 0) {
              doc.setFillColor(0);
              doc.circle(textX, rowY + 1.5, 0.8, 'F');
            }

            // Ligature members abut seamlessly (mirroring the on-screen tile);
            // singles get a slightly wider rect but stay clear of neighbours
            // (centre-to-centre spacing across item boundaries is 1.5 × ligW).
            const tintW = isSingle ? ligW * 1.25 : ligW;
            drawSound(sound, textX, textX - tintW / 2, tintW);

            if (sound.instruction) {
              instrItems.push({
                x: isSingle ? anchor - halfBeat / 2 + 1 : textX - ligW / 2 + 1,
                text: sound.instruction,
              });
            }

            subPos += sound.duration;
            xOff += ligW;
          });
          xOff += eighthBeat;
        }
      } else {
        for (const sound of rowSounds) {
          // Leading silence, before any geometry: the dot parity below reads
          // cumDuration, so the gap has to land first.
          const gapDivs = sound.gap ?? 0;
          if (gapDivs) {
            xOff += (gapDivs / time) * BEAT_W;
            cumDuration += gapDivs;
          }
          const tw = (sound.duration / time) * BEAT_W;
          const textX = TILES_X + xOff + subdivW / 2;
          // Inset 0.3mm per side so adjacent proportional tiles keep a white gutter.
          const tintX = TILES_X + xOff + 0.3;
          const tintW = tw - 0.6;

          for (let i = 0; i < sound.duration; i++) {
            const dotX = TILES_X + xOff + subdivW * (i + 0.5);
            if ((cumDuration + i) % time === 0) {
              doc.setFillColor(0);
              doc.circle(dotX, rowY + 1.5, 0.8, 'F');
            } else {
              doc.setDrawColor(150, 150, 150);
              doc.setLineWidth(0.15);
              doc.circle(dotX, rowY + 1.5, 0.55, 'S');
            }
          }

          drawSound(sound, textX, tintX, tintW);

          if (sound.instruction) {
            instrItems.push({ x: TILES_X + xOff + 1, text: sound.instruction });
          }

          xOff += tw;
        }
      }

      // Line number in left margin (first row only), with a tag above it when the
      // line is a jiuchi definition (excluded from playback, shown for reference).
      if (rowIdx === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(0);
        doc.text(`${lineOrdinal}.`, MARGIN, rowY + DOT_ZONE + 6);
        if (jiuchiMap.has(item.id)) {
          doc.setFontSize(5);
          doc.setTextColor(130, 130, 130);
          doc.text('JIUCHI', MARGIN, rowY + DOT_ZONE + 2);
        }
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

        // 1 mm gap between labels sharing a track.
        const spans = instrItems.map(({ x, text }) => ({
          start: x,
          end: x + doc.getTextWidth(text) + 1,
        }));
        const { tracks, trackCount } = packIntoTracks(spans);
        numTracks = trackCount;

        instrItems.forEach(({ x, text }, i) => {
          doc.text(text, x, rowY + ROW_H + INSTR_TOP_OFFSET + tracks[i] * INSTR_TRACK_H);
        });
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

  drawSectionBars(doc, pendingSectionBars, lineYMap);
  drawFooter(doc, currentPage);

  await deliverPdf(doc, `${piece.title || 'taiko'}.pdf`);
}

/**
 * Delivers the generated PDF to the user.
 *
 * `jsPDF.save()` hands off a `blob:` URL via a synthetic download/`window.open`,
 * which fails inside an installed PWA on Firefox Android: the URL opens in a
 * separate browsing context that cannot access the blob, yielding a blank page.
 * When the Web Share API can share files we use it instead (works in the
 * standalone PWA, lets the user save to Files or send elsewhere); otherwise we
 * fall back to `save()` for desktop browsers.
 *
 * Must be called from within the originating user gesture (the Export tap) so
 * the share sheet is allowed to open.
 *
 * @param {import('jspdf').jsPDF} doc
 * @param {string} filename
 */
async function deliverPdf(doc, filename) {
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });

  // 1. Web Share with a file — works on Chrome Android and most mobile PWAs.
  //    Firefox Android reports canShare({files}) === false, so it skips this.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // user dismissed the sheet
      // Otherwise fall through to the other strategies.
    }
  }

  // 2. Service worker download — used whenever a service worker controls the
  //    page. Sidesteps jsPDF's blob-URL download, which a standalone PWA opens
  //    as a blank external tab.
  if (navigator.serviceWorker?.controller && (await serviceWorkerDownload(blob, filename))) return;

  // 3. No controlling service worker (e.g. dev without SW) — the standard blob
  //    download works in a regular browser tab.
  doc.save(filename);
}

/**
 * Delivers the PDF as a real same-origin resource via the service worker,
 * sidestepping the blob-URL download that a standalone PWA opens as a blank
 * tab. Posts the blob to the SW, waits for it to be stashed, then performs a
 * top-level navigation to the SW-served URL.
 *
 * The navigation is top-level and in-scope (manifest `scope: "/"`), so it stays
 * inside the PWA window rather than spawning a new browsing context (which
 * Firefox Android bounces to a blank external tab). The SW serves the PDF
 * `inline`, so Firefox renders it in its built-in viewer or downloads it.
 *
 * @param {Blob} blob
 * @param {string} filename
 * @returns {Promise<boolean>} true if the navigation was triggered.
 */
async function serviceWorkerDownload(blob, filename) {
  const sw = navigator.serviceWorker;
  if (!sw?.controller) return false;

  const id = uid();

  // Hand the blob to the SW and wait for acknowledgement before navigating, so
  // the fetch can't arrive before the blob is stored. A stale SW (old
  // pass-through with no message handler) never acks, so time out rather than
  // hang and fall back to save().
  const ack = await new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 1500);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(e.data);
    };
    sw.controller.postMessage({ type: 'pdf-download', id, filename, blob }, [channel.port2]);
  });

  if (!ack?.ok) return false;

  // Must be last — this tears down the page, so nothing after it runs.
  globalThis.location.assign(`/download-pdf/${id}`);
  return true;
}

/**
 * Draws the deferred multi-line section-repeat bars: a vertical bar on each page
 * a section spans, plus a "×N" label centred on the first page's segment.
 * @param {import('jspdf').jsPDF} doc
 * @param {Array<{ lineIds: string[], count: number }>} pendingSectionBars
 * @param {Map<string, {page: number, startY: number, endY: number}>} lineYMap
 */
function drawSectionBars(doc, pendingSectionBars, lineYMap) {
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
}

/**
 * Draws the footer on every page (version + date left, copyright centre, page
 * number right when multi-page). Run last so the total page count is known.
 * @param {import('jspdf').jsPDF} doc
 * @param {number} totalPages
 */
function drawFooter(doc, totalPages) {
  const now = new Date();
  const dateStr = [
    String(now.getFullYear()).slice(2),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');

  const footerCenter = piece.author
    ? `© ${now.getFullYear()} ${piece.author}`
    : 'Creative Commons CC0';

  const version = piece.version?.trim();
  const footerLeft = version ? `v ${version}  ${dateStr}` : dateStr;

  const footerY = PAGE_H - 5;

  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(0);
    doc.text(footerLeft, MARGIN, footerY);
    doc.text(footerCenter, PAGE_W / 2, footerY, { align: 'center' });
    if (totalPages > 1) {
      doc.text(`${pg} / ${totalPages}`, PAGE_W - MARGIN, footerY, { align: 'right' });
    }
  }
}
