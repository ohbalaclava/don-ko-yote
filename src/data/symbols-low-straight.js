export const LOW_STRAIGHT = {
  id: 'low-straight',
  time: 4,
  taiko: [
    { name: 'Nagado', skins: 1 },
    { name: 'Okedo', skins: 1 },
    { name: 'Odaiko', skins: 1 },
  ],
  jiuchis: ['Gobu Gobu', 'Mitsu-uchi', 'Shiburoku'],
  symbols: [
    { name: 'DON', duration: 4, hand: 'R', volume: 4 },
    { name: 'KON', duration: 4, hand: 'L', volume: 4 },
    { name: 'SU', duration: 4 },
    { name: 'DO', duration: 2, hand: 'R', volume: 4 },
    { name: 'KO', duration: 2, hand: 'L', volume: 4 },
    { name: 'KA', duration: 2, hand: 'R', volume: 4 },
    { name: 'RA', duration: 2, hand: 'L', volume: 4 },
    { name: 'KI', duration: 2, hand: 'B', volume: 4 },
    { name: 'do', duration: 1, hand: 'R', volume: 2 },
    { name: 'ko', duration: 1, hand: 'L', volume: 2 },
    { name: 'ro', duration: 1, hand: 'L', volume: 2 },
    { name: 'ka', duration: 1, hand: 'L', volume: 2 },
    { name: 'ra', duration: 1, hand: 'L', volume: 2 },
    { name: 'ki', duration: 1, hand: 'B', volume: 2 },
    { name: 'su', duration: 1 },
    { name: 'un', duration: 1 },
    { name: "'", duration: 1 },
    { name: 'HUP', duration: 4 },
    { name: 'HA', duration: 4 },
    { name: 'SO', duration: 4 },
    { name: 'RE', duration: 4 },
  ],
  patterns: [
    {
      name: "do'kara",
      sounds: ['do', "'", 'ka', 'ra'],
    },
    {
      name: "do'koro",
      sounds: ['do', "'", 'ko', 'ro'],
    },
    {
      name: 'dokadoka',
      sounds: ['do', 'ka', 'do', 'ka'],
    },
    {
      name: 'dokarara',
      sounds: ['do', 'ka', 'ra', 'ra'],
    },
    {
      name: "dokodo'",
      sounds: ['do', 'ko', 'do', "'"],
    },
    {
      name: "doraka'",
      sounds: ['do', 'ra', 'ka', "'"],
    },
    {
      name: 'dorakako',
      sounds: ['do', 'ra', 'ka', 'ko'],
    },
    {
      name: "doroka'",
      sounds: ['do', 'ro', 'ka', "'"],
    },
    {
      name: 'dorokara',
      sounds: ['do', 'ro', 'ka', 'ra'],
    },
    {
      name: 'dorororo',
      sounds: ['do', 'ro', 'ro', 'ro'],
    },
    {
      name: "ka'doro",
      sounds: ['ka', "'", 'do', 'ro'],
    },
    {
      name: "ka'kara",
      sounds: ['ka', "'", 'ka', 'ra'],
    },
    {
      name: 'kadokado',
      sounds: ['ka', 'do', 'ka', 'do'],
    },
    {
      name: 'kadororo',
      sounds: ['ka', 'do', 'ro', 'ro'],
    },
    {
      name: 'kakodora',
      sounds: ['ka', 'ko', 'do', 'ra'],
    },
    {
      name: "karado'",
      sounds: ['ka', 'ra', 'do', "'"],
    },
    {
      name: 'karadoro',
      sounds: ['ka', 'ra', 'do', 'ro'],
    },
    {
      name: "karaka'",
      sounds: ['ka', 'ra', 'ka', "'"],
    },
    {
      name: 'kararara',
      sounds: ['ka', 'ra', 'ra', 'ra'],
    },
    {
      name: "ki'koro",
      sounds: ['ki', "'", 'ko', 'ro'],
    },
    {
      name: "korodo'",
      sounds: ['ko', 'ro', 'do', "'"],
    },
    {
      name: "su'kara",
      sounds: ['su', "'", 'ka', 'ra'],
    },
    {
      name: "su'koro",
      sounds: ['su', "'", 'ko', 'ro'],
    },
    {
      name: 'sudororo',
      sounds: ['su', 'do', 'ro', 'ro'],
    },
    {
      name: 'sukarara',
      sounds: ['su', 'ka', 'ra', 'ra'],
    },
    {
      name: "sukodo'",
      sounds: ['su', 'ko', 'do', "'"],
    },
    {
      name: "suraka'",
      sounds: ['su', 'ra', 'ka', "'"],
    },
  ],
};
