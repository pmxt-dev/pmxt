import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

test('Smarkets non-event jurisdiction parameters include IRGC', () => {
    const specPath = path.join(__dirname, '../../specs/smarkets/Smarkets.yaml');
    const spec = yaml.safeLoad(fs.readFileSync(specPath, 'utf8')) as any;
    const endpoints = [
        '/v3/events/{event_ids}/markets/',
        '/v3/events/{event_ids}/markets_count/',
        '/v3/markets/{market_ids}/contracts/',
    ];

    for (const endpoint of endpoints) {
        const jurisdiction = spec.paths[endpoint].get.parameters.find(
            (parameter: any) => parameter.in === 'query' && parameter.name === 'jurisdiction',
        );
        expect(jurisdiction.schema.enum).toContain('IRGC');
    }
});
