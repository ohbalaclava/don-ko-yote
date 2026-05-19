import { jsPDF } from 'jspdf';
import { piece, markerDepth, lineDepth } from './data/piece.js';

const BAR_W = 1;
const BAR_GAP = 1;

function drawRepeatBars(doc, depth, x, y, h) {
  if (depth <= 0) return 0;
  doc.setFillColor(251, 146, 60);
  for (let i = 0; i < depth; i++) {
    doc.rect(x + i * (BAR_W + BAR_GAP), y, BAR_W, h, 'F');
  }
  return depth * (BAR_W + BAR_GAP);
}

export function exportPdf() {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 14;
  const usableW = pageW - margin * 2;
  const markers = piece.lines.filter((l) => l.type === 'block-repeat');
  let y = margin;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(piece.title || 'Untitled', margin, y);
  y += 7;

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${piece.taiko}  ·  ${piece.jiuchi}  ·  ${piece.beatsPerLine} beats/line`, margin, y);
  y += 8;

  let lineOrdinal = 0;
  piece.lines.forEach((line) => {
    const lineBarDepth = lineDepth(line.id, markers);
    const barsW = lineBarDepth > 0 ? lineBarDepth * (BAR_W + BAR_GAP) : 0;
    const contentShift = barsW > 0 ? barsW + 1 : 0;

    if (line.type === 'heading') {
      if (line.text) {
        drawRepeatBars(doc, lineBarDepth, margin, y, 9);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(60);
        doc.text(line.text, margin + contentShift, y + 4);
        doc.setTextColor(0);
        y += 9;
        if (y > 270) {
          doc.addPage();
          y = margin;
        }
      }
      return;
    }

    if (line.type === 'divider') {
      drawRepeatBars(doc, lineBarDepth, margin, y, 6);
      doc.setDrawColor(180);
      doc.line(margin + contentShift, y + 2, margin + usableW, y + 2);
      y += 6;
      if (y > 270) {
        doc.addPage();
        y = margin;
      }
      return;
    }

    if (line.type === 'block-repeat') {
      const bars = markerDepth(line, markers) + 1;
      drawRepeatBars(doc, bars, margin, y, 6);
      const markerBarsW = bars * (BAR_W + BAR_GAP);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(200, 100, 0);
      doc.text(`end repeat  ×${line.count}`, margin + markerBarsW + 5, y + 3);
      doc.setTextColor(0);
      y += 6;
      if (y > 270) {
        doc.addPage();
        y = margin;
      }
      return;
    }

    if (line.sounds.length === 0) return;
    lineOrdinal++;

    const tileH = 14;
    drawRepeatBars(doc, lineBarDepth, margin, y, tileH);

    // Line number
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(String(lineOrdinal), margin + contentShift, y + 4);
    doc.setTextColor(0);

    const tilesStartX = margin + contentShift + 5;
    const flatSounds = line.sounds.flatMap((s) => (s.type === 'group' ? s.sounds : [s]));
    const tileW = Math.min((usableW - contentShift) / Math.max(flatSounds.length, 1), 18);
    let x = tilesStartX;

    flatSounds.forEach((sound) => {
      // Border
      doc.setDrawColor(180);
      doc.rect(x, y, tileW - 1, tileH);

      // Hand
      doc.setFontSize(6);
      doc.setTextColor(120);
      doc.text(sound.hand ?? '', x + (tileW - 1) / 2, y + 3, { align: 'center' });

      // Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(0);
      const nameX = x + (tileW - 1) / 2;
      doc.text(sound.name, nameX, y + 7.5, { align: 'center' });
      if (sound.emphasis) {
        const nameW = doc.getTextWidth(sound.name);
        doc.setDrawColor(0);
        doc.setLineWidth(0.3);
        doc.line(nameX - nameW / 2, y + 8.2, nameX + nameW / 2, y + 8.2);
      }

      // Instruction
      if (sound.instruction) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(80);
        doc.text(sound.instruction, x + (tileW - 1) / 2, y + 11.5, {
          align: 'center',
          maxWidth: tileW - 2,
        });
        doc.setTextColor(0);
      }

      x += tileW;
    });

    y += tileH + 3;

    if (y > 270) {
      doc.addPage();
      y = margin;
    }
  });

  doc.save(`${piece.title || 'taiko'}.pdf`);
}
