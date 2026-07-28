function expandExponential(value: string): string {
  if (!/[eE]/.test(value)) return value;

  const match = value.match(/^([+-]?)(\d+(?:\.\d+)?)[eE]([+-]?\d+)$/);
  if (!match) return value;

  const [, sign, coefficient, exponentText] = match;
  const exponent = Number(exponentText);
  const [integerPart, fractionPart = ''] = coefficient.split('.');
  const digits = integerPart + fractionPart;
  const decimalIndex = integerPart.length + exponent;

  if (decimalIndex <= 0) {
    return `${sign}0.${'0'.repeat(-decimalIndex)}${digits}`;
  }
  if (decimalIndex >= digits.length) {
    return `${sign}${digits}${'0'.repeat(decimalIndex - digits.length)}`;
  }
  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

type DecimalParts = {
  numerator: bigint;
  scale: bigint;
};

function parseDecimal(value: number | string): DecimalParts {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new RangeError(`Expected a finite decimal value, got ${value}`);
  }

  let text = expandExponential(String(value).trim());
  if (!text) return { numerator: 0n, scale: 1n };

  let sign = 1n;
  if (text.startsWith('-')) {
    sign = -1n;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }

  const [integerPart = '0', fractionPart = ''] = text.split('.');
  const digits = `${integerPart || '0'}${fractionPart}`.replace(/^0+(?=\d)/, '') || '0';
  return {
    numerator: sign * BigInt(digits),
    scale: 10n ** BigInt(fractionPart.length),
  };
}

function pow10(places: number): bigint {
  if (!Number.isInteger(places) || places < 0) {
    throw new RangeError(`Decimal places must be a non-negative integer, got ${places}`);
  }
  return 10n ** BigInt(places);
}

function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new RangeError('Cannot divide by zero');
  }

  let sign = 1n;
  let n = numerator;
  let d = denominator;
  if (n < 0n) {
    sign *= -1n;
    n = -n;
  }
  if (d < 0n) {
    sign *= -1n;
    d = -d;
  }

  const quotient = n / d;
  const remainder = n % d;
  const rounded = remainder * 2n >= d ? quotient + 1n : quotient;
  return sign * rounded;
}

function formatScaled(integer: bigint, scale: bigint): string {
  const negative = integer < 0n;
  let digits = (negative ? -integer : integer).toString();
  const places = scale.toString().length - 1;

  if (places === 0) return `${negative ? '-' : ''}${digits}`;
  if (digits.length <= places) {
    digits = `${'0'.repeat(places - digits.length + 1)}${digits}`;
  }

  const whole = digits.slice(0, -places) || '0';
  const fraction = digits.slice(-places).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function toFixedDecimal(value: number | string, places: number): string {
  const { numerator, scale } = parseDecimal(value);
  const targetScale = pow10(places);
  const rounded = divRoundHalfUp(numerator * targetScale, scale);
  const negative = rounded < 0n;
  let digits = (negative ? -rounded : rounded).toString();

  if (places === 0) return `${negative ? '-' : ''}${digits}`;
  if (digits.length <= places) {
    digits = `${'0'.repeat(places - digits.length + 1)}${digits}`;
  }

  return `${negative ? '-' : ''}${digits.slice(0, -places) || '0'}.${digits.slice(-places)}`;
}

export function roundDecimalPlaces(value: number | string, places: number): number {
  return Number(toFixedDecimal(value, places));
}

export function toScaledInteger(value: number | string, scale: number): number {
  if (!Number.isSafeInteger(scale) || scale <= 0) {
    throw new RangeError(`Scale must be a positive safe integer, got ${scale}`);
  }
  const { numerator, scale: decimalScale } = parseDecimal(value);
  return Number(divRoundHalfUp(numerator * BigInt(scale), decimalScale));
}

export function subtractDecimals(
  left: number | string,
  right: number | string,
  places?: number,
): number {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  const numerator = a.numerator * b.scale - b.numerator * a.scale;
  const denominator = a.scale * b.scale;

  if (places === undefined) {
    return Number(formatScaled(numerator, denominator));
  }
  return Number(toFixedDecimal(formatScaled(numerator, denominator), places));
}

export function averageDecimals(
  left: number | string,
  right: number | string,
  places: number = 12,
): number {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  const targetScale = pow10(places);
  const numerator = (a.numerator * b.scale + b.numerator * a.scale) * targetScale;
  const denominator = 2n * a.scale * b.scale;
  return Number(formatScaled(divRoundHalfUp(numerator, denominator), targetScale));
}

export function multiplyDecimals(
  left: number | string,
  right: number | string,
  places: number = 12,
): number {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  const targetScale = pow10(places);
  const numerator = a.numerator * b.numerator * targetScale;
  const denominator = a.scale * b.scale;
  return Number(formatScaled(divRoundHalfUp(numerator, denominator), targetScale));
}

export function divideDecimals(
  numeratorValue: number | string,
  denominatorValue: number | string,
  places: number = 12,
): number {
  const numerator = parseDecimal(numeratorValue);
  const denominator = parseDecimal(denominatorValue);
  const targetScale = pow10(places);
  const scaledNumerator = numerator.numerator * denominator.scale * targetScale;
  const scaledDenominator = numerator.scale * denominator.numerator;
  return Number(formatScaled(divRoundHalfUp(scaledNumerator, scaledDenominator), targetScale));
}

export function proportionalDecimal(
  part: number | string,
  total: number | string,
  amount: number | string,
  places: number = 6,
): number {
  const p = parseDecimal(part);
  const t = parseDecimal(total);
  const a = parseDecimal(amount);
  const targetScale = pow10(places);
  const numerator = p.numerator * a.numerator * t.scale * targetScale;
  const denominator = p.scale * a.scale * t.numerator;
  return Number(formatScaled(divRoundHalfUp(numerator, denominator), targetScale));
}

export function complementDecimal(value: number | string, places: number = 12): number {
  return subtractDecimals('1', value, places);
}

export function roundToTickDecimal(
  value: number | string,
  tickSize: number | string,
  places: number,
): number {
  const v = parseDecimal(value);
  const tick = parseDecimal(tickSize);
  const ticks = divRoundHalfUp(v.numerator * tick.scale, v.scale * tick.numerator);
  const targetScale = pow10(places);
  const rounded = divRoundHalfUp(ticks * tick.numerator * targetScale, tick.scale);
  return Number(formatScaled(rounded, targetScale));
}
