import {
  averageDecimals,
  complementDecimal,
  divideDecimals,
  multiplyDecimals,
  proportionalDecimal,
  roundDecimalPlaces,
  roundToTickDecimal,
  subtractDecimals,
  toFixedDecimal,
  toScaledInteger,
} from '../../src/utils/decimal-math';

describe('decimal-math utilities', () => {
  it('rounds decimal strings without binary floating point drift', () => {
    expect(toFixedDecimal(0.575, 2)).toBe('0.58');
    expect(roundDecimalPlaces(0.575, 2)).toBe(0.58);
    expect(toScaledInteger(0.10015, 10000)).toBe(1002);
  });

  it('computes complements, averages, differences, and products via decimal arithmetic', () => {
    expect(complementDecimal('0.425', 4)).toBe(0.575);
    expect(averageDecimals('0.43', '0.45')).toBe(0.44);
    expect(subtractDecimals('99.99', '90.01')).toBe(9.98);
    expect(multiplyDecimals(subtractDecimals('0.56', '0.55'), '100.0')).toBe(1);
  });

  it('rounds to tick sizes and ratios without double Math.round drift', () => {
    expect(roundToTickDecimal(0.5501, 0.001, 3)).toBe(0.55);
    expect(divideDecimals('6.18', '10.3')).toBe(0.6);
    expect(proportionalDecimal('350', '1000', '1000', 6)).toBe(350);
  });
});
