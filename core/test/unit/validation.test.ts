import { validateIdFormat, validateOutcomeId } from '../../src/utils/validation';
import { ValidationError } from '../../src/errors';

describe('Validation Utilities', () => {
    describe('validateIdFormat', () => {
        it('should accept valid non-empty IDs', () => {
            expect(() => validateIdFormat('valid-id-123', 'Test')).not.toThrow();
            expect(() => validateIdFormat('12345678901234', 'Test')).not.toThrow();
            expect(() => validateIdFormat('ABC-123', 'Test')).not.toThrow();
        });

        it('should reject empty IDs', () => {
            expect(() => validateIdFormat('', 'Test')).toThrow(ValidationError);
            expect(() => validateIdFormat('   ', 'Test')).toThrow(ValidationError);
        });

        it('should throw ValidationError with correct properties', () => {
            try {
                validateIdFormat('', 'Test');
                fail('Should have thrown an error');
            } catch (e: any) {
                expect(e).toBeInstanceOf(ValidationError);
                expect(e.status).toBe(400);
                expect(e.code).toBe('VALIDATION_ERROR');
                expect(e.field).toBe('id');
                expect(e.message).toContain('ID cannot be empty');
            }
        });
    });

    describe('validateOutcomeId', () => {
        it('should accept long numeric IDs (CLOB token IDs)', () => {
            expect(() => validateOutcomeId('12345678901234', 'OrderBook')).not.toThrow();
            expect(() => validateOutcomeId('1234567890', 'OrderBook')).not.toThrow();
        });

        it('should accept non-numeric IDs (Kalshi tickers)', () => {
            expect(() => validateOutcomeId('FED-25JAN29-B4.75', 'OrderBook')).not.toThrow();
            expect(() => validateOutcomeId('MARKET-ID', 'OrderBook')).not.toThrow();
        });

        it('should reject short numeric IDs (market IDs) with helpful error', () => {
            expect(() => validateOutcomeId('123456', 'OrderBook')).toThrow(ValidationError);
        });

        it('should reject very short numeric IDs', () => {
            expect(() => validateOutcomeId('123', 'OrderBook')).toThrow(ValidationError);
            expect(() => validateOutcomeId('1', 'OrderBook')).toThrow(ValidationError);
        });

        it('should throw ValidationError with correct properties', () => {
            try {
                validateOutcomeId('123456', 'OrderBook');
                fail('Should have thrown an error');
            } catch (e: any) {
                expect(e).toBeInstanceOf(ValidationError);
                expect(e.status).toBe(400);
                expect(e.code).toBe('VALIDATION_ERROR');
                expect(e.field).toBe('id');
                expect(e.message).toContain('123456');
                expect(e.message).toContain('deprecated: market.id');
                expect(e.message).toContain('use: market.marketId');
                expect(e.message).toContain('preferred: outcome.outcomeId');
            }
        });
    });
});
