import { validateWorstPrice } from '../pmxt/hosted-typed-data';

describe('validateWorstPrice with Decimal', () => {
    it('should accept worst price within slippage bounds', () => {
        const message = {};
        const order = {
            worst_price: '500000',   // 0.50
            best_price: '500000',    // 0.50
            slippage_pct: '1',       // 1%
        };
        
        expect(() => validateWorstPrice(message, order)).not.toThrow();
    });

    it('should reject worst price above upper bound', () => {
        const message = {};
        const order = {
            worst_price: '510000',   // 0.51
            best_price: '500000',    // 0.50
            slippage_pct: '1',       // 1%
        };
        
        expect(() => validateWorstPrice(message, order)).toThrow(
            'Worst price outside slippage bounds'
        );
    });

    it('should reject worst price below lower bound', () => {
        const message = {};
        const order = {
            worst_price: '490000',   // 0.49
            best_price: '500000',    // 0.50
            slippage_pct: '1',       // 1%
        };
        
        expect(() => validateWorstPrice(message, order)).toThrow(
            'Worst price outside slippage bounds'
        );
    });

    it('should handle edge cases with Decimal precision', () => {
        const message = {};
        const order = {
            worst_price: '500000',   // 0.50
            best_price: '500000',    // 0.50
            slippage_pct: '0.1',     // 0.1%
        };
        
        expect(() => validateWorstPrice(message, order)).not.toThrow();
    });
});