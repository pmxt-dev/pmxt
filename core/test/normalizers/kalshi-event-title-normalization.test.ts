import { KalshiRawEvent, KalshiRawMarket } from '../../src/exchanges/kalshi/fetcher';
import { KalshiNormalizer } from '../../src/exchanges/kalshi/normalizer';

const normalizer = new KalshiNormalizer();

function market(ticker: string, title: string, yesSubTitle: string): KalshiRawMarket {
    return {
        ticker,
        title,
        yes_sub_title: yesSubTitle,
        expiration_time: '2026-06-01T00:00:00Z',
        last_price_dollars: '0.5000',
        volume_24h_fp: '0.00',
        volume_fp: '0.00',
    };
}

function event(raw: Omit<KalshiRawEvent, 'markets'> & { markets?: KalshiRawMarket[] }): KalshiRawEvent {
    return {
        ...raw,
        category: raw.category ?? 'Sports',
        tags: raw.tags ?? ['Sports'],
        markets: raw.markets ?? [
            market(`${raw.event_ticker}-YES`, `Will ${raw.title} happen?`, 'Yes'),
        ],
    };
}

describe('Kalshi event-title normalization', () => {
    test.each([
        {
            event_ticker: 'KXUCL-26',
            title: 'Champions League Winner: PSG vs Arsenal',
            series_title: 'UEFA Champions League',
            sub_title: 'On May 30, 2026',
            series_ticker: 'KXUCL',
            mutually_exclusive: true,
            product_metadata: { competition: 'Champions League', competition_scope: 'Game' },
            markets: [
                market('KXUCL-26-ARS', 'Will Arsenal win the Champions League Winner?', 'Arsenal'),
                market('KXUCL-26-PSG', 'Will PSG win the Champions League Winner?', 'PSG'),
                market('KXUCL-26-RMA', 'Will Real Madrid win the Champions League Winner?', 'Real Madrid'),
                market('KXUCL-26-LFC', 'Will Liverpool win the Champions League Winner?', 'Liverpool'),
            ],
            requiredTerms: ['Champions League', 'Winner'],
            forbiddenTerms: ['PSG vs Arsenal', 'PSG', 'Arsenal'],
        },
        {
            event_ticker: 'KXNBAEAST-26',
            title: 'Series Winner: Cleveland (4) vs New York (3)',
            series_title: 'Pro Basketball Eastern Conference Champion',
            sub_title: '2026',
            series_ticker: 'KXNBAEAST',
            mutually_exclusive: true,
            product_metadata: { competition: 'Pro Basketball (M)', competition_scope: 'Series Winner' },
            markets: [
                market('KXNBAEAST-26-DET', 'Will Detroit win the 2026 Pro Basketball Eastern Conference Championship?', 'Detroit'),
                market('KXNBAEAST-26-BOS', 'Will Boston win the 2026 Pro Basketball Eastern Conference Championship?', 'Boston'),
                market('KXNBAEAST-26-CLE', 'Will the Cleveland win the 2026 Pro Basketball Eastern Conference Championship?', 'Cleveland'),
                market('KXNBAEAST-26-NYK', 'Will the New York win the 2026 Pro Basketball Eastern Conference Championship?', 'New York'),
            ],
            requiredTerms: ['2026', 'Pro Basketball', 'Eastern Conference'],
            forbiddenTerms: ['Cleveland', 'New York', 'Series Winner:'],
        },
        {
            event_ticker: 'KXNBAWEST-26',
            title: 'Series Winner: San Antonio (2) vs Oklahoma City (1)',
            series_title: 'NBA Western Conference Championship',
            sub_title: '2026',
            series_ticker: 'KXNBAWEST',
            mutually_exclusive: true,
            product_metadata: { competition: 'Pro Basketball (M)', competition_scope: 'Series Winner' },
            markets: [
                market('KXNBAWEST-26-DAL', 'Will the Dallas win the 2026 Pro Basketball Western Conference Championship?', 'Dallas'),
                market('KXNBAWEST-26-LAL', 'Will the Los Angeles Lakers win the 2026 Pro Basketball Western Conference Championship?', 'Los Angeles Lakers'),
                market('KXNBAWEST-26-SAS', 'Will the San Antonio win the 2026 Pro Basketball Western Conference Championship?', 'San Antonio'),
                market('KXNBAWEST-26-OKC', 'Will the Oklahoma City win the 2026 Pro Basketball Western Conference Championship?', 'Oklahoma City'),
            ],
            requiredTerms: ['2026', 'Western Conference'],
            forbiddenTerms: ['San Antonio', 'Oklahoma City', 'Series Winner:'],
        },
        {
            event_ticker: 'KXNHLWEST-26',
            title: 'Series Winner: Vegas Golden Knights vs Colorado Avalanche',
            series_title: 'Western Conference Champion',
            sub_title: '2025-2026 Western Conference Finals',
            series_ticker: 'KXNHLWEST',
            mutually_exclusive: true,
            product_metadata: { competition: 'NHL', competition_scope: 'Series Winner' },
            markets: [
                market('KXNHLWEST-26-WPG', 'Western Conference Finals Winner?', 'Winnipeg Jets'),
                market('KXNHLWEST-26-DAL', 'Western Conference Finals Winner?', 'Dallas Stars'),
                market('KXNHLWEST-26-VGK', 'Western Conference Finals Winner?', 'Vegas Golden Knights'),
                market('KXNHLWEST-26-COL', 'Western Conference Finals Winner?', 'Colorado Avalanche'),
            ],
            requiredTerms: ['Western Conference'],
            forbiddenTerms: ['Vegas Golden Knights', 'Colorado Avalanche', 'Series Winner:'],
        },
    ])('$event_ticker drops current-matchup contamination from broad futures', (sample) => {
        const normalized = normalizer.normalizeEvent(event(sample));

        expect(normalized).not.toBeNull();
        expect(normalized!.title).not.toBe(sample.title);
        for (const term of sample.requiredTerms) {
            expect(normalized!.title).toContain(term);
        }
        for (const term of sample.forbiddenTerms) {
            expect(normalized!.title).not.toContain(term);
        }
    });

    test.each([
        {
            event_ticker: 'KXMENWORLDCUP-26',
            title: "2026 Men's World Cup Winner",
            series_title: "Men's World Cup",
            sub_title: '2026',
            series_ticker: 'KXMENWORLDCUP',
            product_metadata: { competition: 'FIFA World Cup', competition_scope: 'Future' },
            markets: [
                market('KXMENWORLDCUP-26-FRA', "Will the France win the 2026 Men's World Cup?", 'France'),
            ],
        },
        {
            event_ticker: 'KXNBA-26',
            title: 'Pro Basketball Champion',
            series_title: 'Pro Basketball Champion',
            sub_title: '2026',
            series_ticker: 'KXNBA',
            product_metadata: { competition: 'Pro Basketball (M)', competition_scope: 'Future' },
            markets: [
                market('KXNBA-26-ATL', 'Will the Atlanta win the 2026 Pro Basketball Finals?', 'Atlanta'),
            ],
        },
        {
            event_ticker: 'KXF1-26',
            title: 'F1 Drivers Champion',
            series_title: 'F1 Drivers Champion',
            sub_title: '2026',
            series_ticker: 'KXF1',
            product_metadata: { competition: 'F1', competition_scope: 'Future' },
            markets: [
                market('KXF1-26-LNO', 'Will Lando Norris win the F1 Drivers Championship?', 'Lando Norris'),
            ],
        },
    ])('$event_ticker keeps already-sane broad future title', (sample) => {
        const normalized = normalizer.normalizeEvent(event(sample));

        expect(normalized).not.toBeNull();
        expect(normalized!.title).toBe(sample.title);
    });

    it('keeps true match events as matchup titles', () => {
        const sample = event({
            event_ticker: 'KXUCLGAME-26MAY30PSGARS',
            title: 'Reg Time: PSG vs Arsenal',
            series_title: 'UEFA Champions League',
            sub_title: 'PSG vs ARS (May 30)',
            series_ticker: 'KXUCLGAME',
            product_metadata: { competition: 'Champions League', competition_scope: 'Regulation Time Moneyline' },
            markets: [
                market('KXUCLGAME-26MAY30PSGARS-PSG', 'PSG vs Arsenal Winner?', 'PSG'),
                market('KXUCLGAME-26MAY30PSGARS-ARS', 'PSG vs Arsenal Winner?', 'Arsenal'),
            ],
        });

        const normalized = normalizer.normalizeEvent(sample);

        expect(normalized).not.toBeNull();
        expect(normalized!.title).toBe('Reg Time: PSG vs Arsenal');
    });
});
