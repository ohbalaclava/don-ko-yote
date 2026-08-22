import { describe, it, expect } from 'vitest';
import {
  besselJ,
  fundamental,
  airMode,
  modeAmplitude,
  modeDecay,
  baseDecayFor,
  contactTilt,
  modeTable,
  MEMBRANE_MODES,
  AIR_COUPLING,
  SPEED_OF_SOUND,
} from '../src/lab/dsp/membrane.js';

const NAGADO = {
  radius: 0.23,
  depth: 0.6,
  thickness: 2.5,
  tension: 11000,
  hitPos: 0,
  damping: 0.3,
  airMix: 0.5,
  hardness: 0.5,
};

describe('besselJ', () => {
  it('matches known values of J0 and J1', () => {
    expect(besselJ(0, 0)).toBe(1);
    expect(besselJ(1, 0)).toBe(0);
    expect(besselJ(0, 1)).toBeCloseTo(0.7651977, 6);
    expect(besselJ(1, 1)).toBeCloseTo(0.4400506, 6);
    expect(besselJ(2, 5)).toBeCloseTo(0.0465651, 6);
  });

  it('is ~0 at the zeros the mode table is built from', () => {
    expect(besselJ(0, 2.404826)).toBeCloseTo(0, 5);
    expect(besselJ(1, 3.831706)).toBeCloseTo(0, 5);
  });
});

describe('fundamental', () => {
  it('lands in the right register for real drum dimensions', () => {
    const shime = fundamental({ radius: 0.17, tension: 38000, thickness: 1.2 });
    expect(shime).toBeGreaterThan(300);
    expect(shime).toBeLessThan(500);
    expect(fundamental(NAGADO)).toBeGreaterThan(80);
    expect(fundamental(NAGADO)).toBeLessThan(160);
  });

  it('falls with a wider head', () => {
    const wide = fundamental({ ...NAGADO, radius: 0.46 });
    expect(wide).toBeCloseTo(fundamental(NAGADO) / 2, 4);
  });

  it('falls with a thicker skin', () => {
    expect(fundamental({ ...NAGADO, thickness: 5 })).toBeLessThan(fundamental(NAGADO));
  });

  it('rises with the square root of tension', () => {
    const tighter = fundamental({ ...NAGADO, tension: NAGADO.tension * 4 });
    expect(tighter).toBeCloseTo(fundamental(NAGADO) * 2, 4);
  });
});

describe('airMode', () => {
  it('is the axial tube mode pulled down for head compliance', () => {
    expect(airMode({ depth: 0.6 })).toBeCloseTo((AIR_COUPLING * SPEED_OF_SOUND) / 1.2, 6);
  });

  it('drops as the shell gets longer', () => {
    expect(airMode({ depth: 1.0 })).toBeLessThan(airMode({ depth: 0.4 }));
  });
});

describe('modeAmplitude', () => {
  it('nulls every non-axisymmetric mode at a dead-centre strike', () => {
    for (const mode of MEMBRANE_MODES) {
      const amp = Math.abs(modeAmplitude(mode, 0));
      if (mode.m === 0) expect(amp).toBeCloseTo(1, 10);
      else expect(amp).toBeCloseTo(0, 10);
    }
  });

  it('excites the nodal-diameter modes once the strike moves off centre', () => {
    const m1 = MEMBRANE_MODES.find((mode) => mode.m === 1);
    expect(Math.abs(modeAmplitude(m1, 0.7))).toBeGreaterThan(0.2);
  });
});

describe('modeDecay', () => {
  it('leaves the fundamental at the base decay', () => {
    expect(modeDecay(100, 100, 0.5)).toBeCloseTo(0.5, 10);
  });

  it('shortens monotonically with frequency', () => {
    const f0 = 100;
    let previous = Infinity;
    for (const mode of MEMBRANE_MODES) {
      const decay = modeDecay(f0 * mode.ratio, f0, 0.5);
      expect(decay).toBeLessThan(previous);
      previous = decay;
    }
  });
});

describe('baseDecayFor', () => {
  it('rings longer on a bigger head', () => {
    expect(baseDecayFor(0.5, 0.3)).toBeGreaterThan(baseDecayFor(0.17, 0.3));
  });

  it('shortens as damping rises, without reaching zero', () => {
    expect(baseDecayFor(0.23, 1)).toBeLessThan(baseDecayFor(0.23, 0));
    expect(baseDecayFor(0.23, 1)).toBeGreaterThan(0);
  });
});

describe('contactTilt', () => {
  it('leaves the fundamental essentially untouched', () => {
    expect(contactTilt(100, 100, 0.5)).toBeGreaterThan(0.9);
  });

  it('passes more of the top end as the bachi gets harder', () => {
    expect(contactTilt(900, 100, 1)).toBeGreaterThan(contactTilt(900, 100, 0));
  });
});

describe('modeTable', () => {
  it('returns only axisymmetric modes plus the air mode for a centre strike', () => {
    const modes = modeTable(NAGADO);
    expect(modes.every((mode) => mode.m === 0 || mode.air)).toBe(true);
    expect(modes.some((mode) => mode.air)).toBe(true);
  });

  it('adds the nodal-diameter modes as the strike moves toward the rim', () => {
    const centre = modeTable(NAGADO).length;
    const rim = modeTable({ ...NAGADO, hitPos: 0.75 }).length;
    expect(rim).toBeGreaterThan(centre);
  });

  it('starts at the fundamental and follows the Bessel ratios', () => {
    const modes = modeTable({ ...NAGADO, hitPos: 0.5 });
    const f0 = fundamental(NAGADO);
    expect(modes[0].freq).toBeCloseTo(f0, 6);
    expect(modes[1].freq).toBeCloseTo(f0 * MEMBRANE_MODES[1].ratio, 6);
  });

  it('drops modes above Nyquist', () => {
    const modes = modeTable({ ...NAGADO, hitPos: 0.5 }, 800);
    expect(modes.every((mode) => mode.freq < 400)).toBe(true);
  });

  it('omits the air mode when airMix is 0', () => {
    expect(modeTable({ ...NAGADO, airMix: 0 }).some((mode) => mode.air)).toBe(false);
  });
});
