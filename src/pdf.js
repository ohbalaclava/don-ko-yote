import { jsPDF } from 'jspdf';
import { piece, singleLineRepeatMap } from './data/piece.js';
import { settings } from './data/settings.js';
import { effectiveVolume, groupIntoLigatures, packIntoTracks } from './util.js';

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
  return rows;
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

  // Single-line repeat markers keyed by the line they wrap.
  const singleLineMarkerMap = singleLineRepeatMap(piece.lines);

  /**
   * Rendered y extents per line ID — consumed when drawing section bars.
   * @type {Map<string, {page: number, startY: number, endY: number}>}
   */
  const lineYMap = new Map();

  /** Multi-line block-repeat markers rendered after the main pass. */
  const pendingSectionBars = [];

  let lineOrdinal = 0;
  const nonProp = !settings.proportionalWidth;

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
    const rows = splitIntoRows(item.sounds, time);

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

      /** Draws name, emphasis underline, and hand/volume for one sound at textX. */
      const drawSound = (sound, textX) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.text(sound.name, textX, rowY + DOT_ZONE + 5, { align: 'center' });

        if (sound.emphasis) {
          const nw = doc.getTextWidth(sound.name);
          doc.setDrawColor(0);
          doc.setLineWidth(0.3);
          doc.line(textX - nw / 2, rowY + DOT_ZONE + 5.7, textX + nw / 2, rowY + DOT_ZONE + 5.7);
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(0);
        const vol = piece.showVolume ? effectiveVolume(sound) : null;
        if (vol != null) {
          doc.text(sound.hand, textX - 0.5, rowY + DOT_ZONE + 9, { align: 'right' });
          doc.text(String(vol), textX + 0.5, rowY + DOT_ZONE + 9, { align: 'left' });
        } else {
          doc.text(sound.hand ?? '', textX, rowY + DOT_ZONE + 9, { align: 'center' });
        }

        cumDuration += sound.duration;
      };

      if (nonProp) {
        const halfBeat = BEAT_W / 2;
        const ligW = BEAT_W / 4; // centre-to-centre spacing of ligated sub-sounds
        const eighthBeat = BEAT_W / 8; // trailing gap after each ligature group
        const ligItems = groupIntoLigatures(rowSounds, time, cumDuration);
        for (const item of ligItems) {
          const isSingle = 'sound' in item;
          const sounds = isSingle ? [item.sound] : item.sounds;
          const anchor = TILES_X + xOff + halfBeat / 2;

          let subPos = item.startPos;
          sounds.forEach((sound, si) => {
            const textX = anchor + si * ligW;

            if (subPos % time === 0) {
              doc.setFillColor(0);
              doc.circle(textX, rowY + 1.5, 0.8, 'F');
            }

            drawSound(sound, textX);

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
          const tw = (sound.duration / time) * BEAT_W;
          const textX = TILES_X + xOff + subdivW / 2;

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

          drawSound(sound, textX);

          if (sound.instruction) {
            instrItems.push({ x: TILES_X + xOff + 1, text: sound.instruction });
          }

          xOff += tw;
        }
      }

      // Line number in left margin (first row only)
      if (rowIdx === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(0);
        doc.text(`${lineOrdinal}.`, MARGIN, rowY + DOT_ZONE + 6);
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

  const id = crypto.randomUUID();

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
