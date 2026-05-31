import {
  AlignmentType,
  Document,
  Footer,
  Packer,
  PageNumber,
  Paragraph,
  TabStopType,
  TextRun,
} from 'docx';
import { piece } from './data/piece.js';
import { effectiveVolume, splitIntoRows } from './util.js';

// ── Layout constants ──────────────────────────────────────────────────────────

const MM = 56.69;
const PAGE_W = Math.round(210 * MM); // 11905 DXA
const PAGE_H = Math.round(297 * MM); // 16839 DXA
const MARGIN = Math.round(14 * MM); // 794 DXA

const FONT = 'Courier New';
const PT = 18; // 9 pt in half-points (all body text uses this size)
const BEATS_PER_ROW = 8;
const CHARS_PER_SUBDIV = 3; // chars allocated per duration unit
const LINE_NUM_W = 4; // "1.  " or "    " prefix width

// ── Text helpers ──────────────────────────────────────────────────────────────

/** Paragraph with zero before/after spacing. */
function zeroPara(children, extra = {}) {
  return new Paragraph({ spacing: { before: 0, after: 0 }, children, ...extra });
}

/** TextRun in Courier New at the body size. */
function mono(text, opts = {}) {
  return new TextRun({ text, font: FONT, size: PT, ...opts });
}

// ── Row builder ───────────────────────────────────────────────────────────────

/**
 * Converts one row of sounds into three aligned text strings (dots / names /
 * hands) plus a list of instruction items with their horizontal offsets.
 *
 * Each sound occupies `sound.duration * CHARS_PER_SUBDIV` characters.
 * A beat-boundary dot '●' is placed at the first character of any sound
 * that lands exactly on a beat. All other positions are spaces.
 *
 * @param {Array} rowSounds
 * @param {number} time - Divisions per beat.
 * @param {number} cumDuration - Absolute position of the first sound in the row.
 * @returns {{ dots: string, names: string, hands: string, instrParts: Array }}
 */
function buildRowText(rowSounds, time, cumDuration) {
  let dots = '';
  let names = '';
  let hands = '';
  const instrParts = [];
  let pos = cumDuration;

  for (const sound of rowSounds) {
    const w = sound.duration * CHARS_PER_SUBDIV;
    const soundOffset = names.length; // position of this sound in the names string

    dots += (pos % time === 0 ? '●' : ' ').padEnd(w);
    names += (sound.name ?? '').slice(0, w).padEnd(w);

    const vol = piece.showVolume ? effectiveVolume(sound) : null;
    const handText = sound.hand == null ? '' : vol != null ? `${sound.hand}${vol}` : sound.hand;
    hands += handText.padEnd(w);

    if (sound.instruction) instrParts.push({ offset: soundOffset, text: sound.instruction });

    pos += sound.duration;
  }

  return { dots, names, hands, instrParts };
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Generates and downloads an A4 portrait DOCX of the current piece.
 *
 * Each sound row is rendered as three lines of Courier New text:
 *   1. Beat dots  ('●' at beat boundaries)
 *   2. Sound names (bold)
 *   3. Hand / volume labels
 * Instruction labels appear below the row at their sound's horizontal offset.
 */
export async function exportDocx() {
  const time = piece.time;

  // Pre-compute repeat markers keyed by line ID.
  const singleRepeatMap = new Map(); // lineId → count
  const multiRepeatLineIds = new Set();
  const multiRepeatFirstMap = new Map(); // first lineId of block → count

  for (const item of piece.lines) {
    if (item.type !== 'block-repeat') continue;
    if (item.lineIds.length === 1) {
      singleRepeatMap.set(item.lineIds[0], item.count);
    } else {
      item.lineIds.forEach((id) => multiRepeatLineIds.add(id));
      multiRepeatFirstMap.set(item.lineIds[0], item.count);
    }
  }

  // ── Body ─────────────────────────────────────────────────────────────────

  const children = [];

  // Title
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
      children: [new TextRun({ text: piece.title || 'Untitled', bold: true, size: 36 })],
    })
  );

  // Metadata — one right-aligned paragraph per field
  const metaParts = [piece.taiko, piece.jiuchi, piece.bpm ? `${piece.bpm} BPM` : null].filter(
    Boolean
  );
  for (const part of metaParts) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: part, size: 18 })],
      })
    );
  }
  if (metaParts.length > 0) {
    children.push(new Paragraph({ spacing: { before: 0, after: 200 }, children: [] }));
  }

  let lineOrdinal = 0;

  for (const item of piece.lines) {
    if (item.type === 'heading') {
      if (!item.text) continue;
      children.push(
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun({ text: item.text, bold: true, size: 22 })],
        })
      );
      continue;
    }

    if (item.type === 'note') {
      if (!item.text) continue;
      children.push(
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun({ text: item.text, italics: true, size: 18 })],
        })
      );
      continue;
    }

    if (item.type === 'divider') {
      children.push(
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [mono('─'.repeat(BEATS_PER_ROW * time * CHARS_PER_SUBDIV))],
        })
      );
      continue;
    }

    if (item.type === 'block-repeat') continue;

    if (!item.sounds || item.sounds.length === 0) continue;
    lineOrdinal++;

    const singleRepeat = singleRepeatMap.get(item.id) ?? null;
    const multiRepeatCount = multiRepeatFirstMap.get(item.id) ?? null;

    const rows = splitIntoRows(item.sounds, time, BEATS_PER_ROW);
    let cumDuration = 0;

    rows.forEach((rowSounds, rowIdx) => {
      const isFirstRow = rowIdx === 0;
      const isLastRow = rowIdx === rows.length - 1;
      const { dots, names, hands, instrParts } = buildRowText(rowSounds, time, cumDuration);
      cumDuration += rowSounds.reduce((acc, s) => acc + s.duration, 0);

      const prefix = isFirstRow ? `${lineOrdinal}.`.padEnd(LINE_NUM_W) : ' '.repeat(LINE_NUM_W);

      let repeatSuffix = '';
      if (isLastRow && singleRepeat) repeatSuffix = ` ×${singleRepeat}`;
      else if (isFirstRow && multiRepeatCount) repeatSuffix = ` ×${multiRepeatCount}`;

      children.push(
        zeroPara([mono(prefix + dots)], { spacing: { before: rowIdx === 0 ? 60 : 0, after: 0 } })
      );
      children.push(zeroPara([mono(prefix + names + repeatSuffix, { bold: true })]));
      children.push(zeroPara([mono(prefix + hands)]));

      for (const { offset, text } of instrParts) {
        // Use a two-run paragraph so the prefix spaces stay at body size (for
        // correct monospace alignment) while the label can be slightly smaller.
        children.push(
          zeroPara([
            mono(' '.repeat(LINE_NUM_W + offset)),
            new TextRun({ text, font: FONT, size: 14, italics: true }),
          ])
        );
      }
    });

    // Gap after each complete score line
    children.push(new Paragraph({ spacing: { before: 0, after: 120 }, children: [] }));
  }

  // ── Footer ────────────────────────────────────────────────────────────────

  const now = new Date();
  const dateStr = [
    String(now.getFullYear()).slice(2),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');

  const version = piece.version?.trim();
  const footerLeft = version ? `v ${version}  ${dateStr}` : dateStr;
  const footerCenter = piece.author
    ? `© ${now.getFullYear()} ${piece.author}`
    : 'Creative Commons CC0';

  const textAreaW = PAGE_W - MARGIN * 2;

  const footer = new Footer({
    children: [
      new Paragraph({
        tabStops: [
          { type: TabStopType.CENTER, position: Math.round(textAreaW / 2) },
          { type: TabStopType.RIGHT, position: textAreaW },
        ],
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({ text: footerLeft, size: 14 }),
          new TextRun({ text: '\t', size: 14 }),
          new TextRun({ text: footerCenter, size: 14 }),
          new TextRun({ text: '\t', size: 14 }),
          new TextRun({ children: [PageNumber.CURRENT], size: 14 }),
          new TextRun({ text: ' / ', size: 14 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14 }),
        ],
      }),
    ],
  });

  // ── Assemble and download ─────────────────────────────────────────────────

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        footers: { default: footer },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${piece.title || 'taiko'}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}
