import { jsPDF } from 'jspdf';
import { piece } from './data/piece.js';

export function exportPdf() {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const margin = 14;
  const usableW = pageW - margin * 2;
  let y = margin;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(piece.title || 'Untitled', margin, y);
  y += 7;

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${piece.jiuchi}  ·  ${piece.beatsPerLine} beats/line`, margin, y);
  y += 8;

  piece.lines.forEach((line, li) => {
    if (line.sounds.length === 0) return;

    // Line number
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(String(li + 1), margin, y + 4);
    doc.setTextColor(0);

    const flatSounds = line.sounds.flatMap((s) => (s.type === 'group' ? s.sounds : [s]));
    const tileW = Math.min(usableW / Math.max(flatSounds.length, 1), 18);
    const tileH = 14;
    let x = margin + 5;

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

    if ((line.repeat || 1) > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(80);
      doc.text(`× ${line.repeat}`, x + 2, y + tileH / 2 + 1.5);
      doc.setTextColor(0);
    }

    y += tileH + 3;

    if (y > 270) {
      doc.addPage();
      y = margin;
    }
  });

  doc.save(`${piece.title || 'taiko'}.pdf`);
}
