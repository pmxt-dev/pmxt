/**
 * Resolve a probability (0..1) from a Hunch cents value (0..100).
 * Hunch prices are integer cents on the parimutuel implied-odds scale.
 */
export function resolveHunchPrice(cents: number | null | undefined): number {
    if (typeof cents !== 'number' || !Number.isFinite(cents)) return 0;
    return cents / 100;
}
