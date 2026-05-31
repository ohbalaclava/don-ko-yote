export const LOW_SWING = {
  id: 'low-swing',
  time: 3,
  taiko: [
    { name: 'Nagado', skins: 1 },
    { name: 'Okedo', skins: 1 },
    { name: 'Odaiko', skins: 1 },
  ],
  jiuchis: ['Shichisan'],
  symbols: [
    { name: 'DON', duration: 3, hand: 'R' },
    { name: 'KON', duration: 3, hand: 'L' },
    { name: 'SU', duration: 3, editable: true },
    { name: 'KI', duration: 3, hand: 'B', editable: true },
    { name: 'DO', duration: 2, hand: 'R' },
    { name: 'KO', duration: 1, hand: 'L' },
    { name: 'KA', duration: 2, hand: 'R' },
    { name: 'RA', duration: 1, hand: 'L' },
    { name: 'su', duration: 2 },
    { name: 'do', duration: 1, hand: 'R' },
    { name: 'ko', duration: 1, hand: 'L' },
    { name: 'ro', duration: 1, hand: 'L' },
    { name: 'ka', duration: 1, hand: 'L' },
    { name: 'ra', duration: 1, hand: 'L' },
    { name: 'un', duration: 1 },
    { name: "'", duration: 1 },
    { name: 'HUP', duration: 3, editable: true },
    { name: 'HA', duration: 3, editable: true },
    { name: 'SO', duration: 3, editable: true },
    { name: 'RE', duration: 3, editable: true },
  ],
  patterns: [
    {
      name: "DO'KA",
      sounds: ['DO', "'", 'KA'],
    },
    {
      name: "DOKA'",
      sounds: ['DO', 'KA', "'"],
    },
    {
      name: 'DOKAKO',
      sounds: ['DO', 'KA', 'KO'],
    },
    {
      name: 'DOKODO',
      sounds: ['DO', 'KO', 'DO'],
    },
    {
      name: 'DOKOKA',
      sounds: ['DO', 'KO', 'KA'],
    },
    {
      name: 'DOKOkoro',
      sounds: ['DO', 'KO', 'ko', 'ro'],
    },
    {
      name: 'DOkoroKO',
      sounds: ['DO', 'ko', 'ro', 'KO'],
    },
    {
      name: 'DOkoroSU',
      sounds: ['DO', 'ko', 'ro', 'SU'],
    },
    {
      name: "DON'koro",
      sounds: ['DON', "'", 'ko', 'ro'],
    },
    {
      name: 'DORAKA',
      sounds: ['DO', 'RA', 'KA'],
    },
    {
      name: "KA'DO",
      sounds: ['KA', "'", 'DO'],
    },
    {
      name: "KA'KA",
      sounds: ['KA', "'", 'KA'],
    },
    {
      name: "KADO'",
      sounds: ['KA', 'DO', "'"],
    },
    {
      name: 'KADOKA',
      sounds: ['KA', 'DO', 'KA'],
    },
    {
      name: 'KADOKO',
      sounds: ['KA', 'DO', 'KO'],
    },
    {
      name: "KAKA'",
      sounds: ['KA', 'KA', "'"],
    },
    {
      name: 'KARADO',
      sounds: ['KA', 'RA', 'DO'],
    },
    {
      name: 'KARAKA',
      sounds: ['KA', 'RA', 'KA'],
    },
    {
      name: "KI'KI",
      sounds: ['KI', "'", 'KI'],
    },
    {
      name: "KI'koro",
      sounds: ['KI', "'", 'ko', 'ro'],
    },
    {
      name: "KIKI'",
      sounds: ['KI', 'KI', "'"],
    },
    {
      name: "koro'KI",
      sounds: ['ko', 'ro', "'", 'KI'],
    },
    {
      name: "koro'UN",
      sounds: ['ko', 'ro', "'", 'un'],
    },
    {
      name: 'koroDOKO',
      sounds: ['ko', 'ro', 'DO', 'KO'],
    },
    {
      name: 'koroDON',
      sounds: ['ko', 'ro', 'DON'],
    },
    {
      name: 'koroSUKO',
      sounds: ['ko', 'ro', 'SU', 'KO'],
    },
    {
      name: "SU'koro",
      sounds: ['SU', "'", 'ko', 'ro'],
    },
    {
      name: 'SUDOKA',
      sounds: ['SU', 'DO', 'KA'],
    },
    {
      name: 'SUDOKO',
      sounds: ['SU', 'DO', 'KO'],
    },
    {
      name: 'SUKADO',
      sounds: ['SU', 'KA', 'DO'],
    },
    {
      name: 'SUKARA',
      sounds: ['SU', 'KA', 'RA'],
    },
    {
      name: 'SUKIKI',
      sounds: ['SU', 'KI', 'KI'],
    },
    {
      name: 'SUKOkoro',
      sounds: ['SU', 'KO', 'ko', 'ro'],
    },
    {
      name: "SUkoro'",
      sounds: ['SU', 'ko', 'ro', "'"],
    },
    {
      name: 'SUkoroKO',
      sounds: ['SU', 'ko', 'ro', 'KO'],
    },
  ],
};
