#!/usr/bin/env node
/**
 * Fetches real OpenAPI specs from exchange documentation and writes
 * them as TypeScript modules that export the parsed JSON.
 *
 * Usage: node core/scripts/fetch-openapi-specs.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SPECS = [
    {
        name: 'kalshi',
        localFile: path.resolve(__dirname, '../specs/kalshi/Kalshi.yaml'),
        outFile: path.resolve(__dirname, '../src/exchanges/kalshi/api.ts'),
        exportName: 'kalshiApiSpec',
    },
    {
        name: 'polymarket-clob',
        localFile: path.resolve(__dirname, '../specs/polymarket/PolymarketClobAPI.yaml'),
        outFile: path.resolve(__dirname, '../src/exchanges/polymarket/api-clob.ts'),
        exportName: 'polymarketClobSpec',
    },
    {
        name: 'polymarket-gamma',
        localFile: path.resolve(__dirname, '../specs/polymarket/PolymarketGammaAPI.yaml'),
        outFile: path.resolve(__dirname, '../src/exchanges/polymarket/api-gamma.ts'),
        exportName: 'polymarketGammaSpec',
    },
    {
        name: 'polymarket-data',
        localFile: path.resolve(__dirname, '../specs/polymarket/Polymarket_Data_API.yaml'),
        outFile: path.resolve(__dirname, '../src/exchanges/polymarket/api-data.ts'),
        exportName: 'polymarketDataSpec',
    },
    {
        name: 'limitless',
        localFile: path.resolve(__dirname, '../specs/limitless/Limitless.yaml'),
        outFile: path.resolve(__dirname, '../src/exchanges/limitless/api.ts'),
        exportName: 'limitlessApiSpec',
    },
    {
        name: 'probable',
        localFile: path.resolve(__dirname, '../specs/probable/probable.yaml'),
        outFile: path.resolve(__dirname, '../src/exchanges/probable/api.ts'),
        exportName: 'probableApiSpec',
    },
    {
        name: 'myriad',
        localFile: path.resolve(__dirname, '../specs/myriad/myriad.yaml'),
        outFile: path.resolve(__dirname, '../src/exchanges/myriad/api.ts'),
        exportName: 'myriadApiSpec',
    },
    {
        name: 'opinion',
        localFile: path.resolve(__dirname, '../specs/opinion/opinion-openapi.yaml'),
        outFile: path.resolve(__dirname, '../src/exchanges/opinion/api.ts'),
        exportName: 'opinionApiSpec',
    },
    {
        name: 'gaduin',
        localFile: path.resolve(__dirname, '../specs/gaduin/gaduin.yaml'),
        outFile: path.resolve(__dirname, '../src/exchanges/gaduin/api.ts'),
        exportName: 'gaduinApiSpec',
    },
];

function fetch(url) {
    return new Promise((resolve, reject) => {
        const request = (targetUrl) => {
            https.get(targetUrl, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    request(res.headers.location);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} for ${targetUrl}`));
                    return;
                }
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
                res.on('error', reject);
            }).on('error', reject);
        };
        request(url);
    });
}

/**
 * Strip verbose fields (descriptions, examples, x-extensions, etc.)
 * to keep the generated file small. We only need structure for method generation.
 */
function stripVerboseFields(obj) {
    if (Array.isArray(obj)) {
        return obj.map(stripVerboseFields);
    }
    if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if ([
                'description', 'example', 'examples', 'x-readme',
                'x-codeSamples', 'x-code-samples', 'externalDocs',
                'deprecated',
            ].includes(key)) {
                continue;
            }
            // Keep schemas minimal -- we only care about paths/methods/security
            if (key === 'components') {
                // Keep securitySchemes, drop schemas/responses/etc.
                if (value && typeof value === 'object' && value.securitySchemes) {
                    result[key] = { securitySchemes: value.securitySchemes };
                }
                continue;
            }
            // Strip request/response bodies to reduce size
            if (key === 'requestBody' || key === 'responses') {
                continue;
            }
            result[key] = stripVerboseFields(value);
        }
        return result;
    }
    return obj;
}

async function main() {
    for (const spec of SPECS) {
        let raw;
        let source;
        if (spec.localFile) {
            source = spec.localFile;
            console.log(`Reading ${spec.name} spec from ${source} ...`);
            raw = fs.readFileSync(spec.localFile, 'utf8');
        } else {
            source = spec.url;
            console.log(`Fetching ${spec.name} spec from ${source} ...`);
            raw = await fetch(spec.url);
        }
        const parsed = yaml.safeLoad(raw);
        const stripped = stripVerboseFields(parsed);
        const json = JSON.stringify(stripped, null, 4);

        const tsContent = [
            '/**',
            ` * Auto-generated from ${source}`,
            ` * Generated at: ${new Date().toISOString()}`,
            ' * Do not edit manually -- run "npm run fetch:openapi" to regenerate.',
            ' */',
            `export const ${spec.exportName} = ${json};`,
            '',
        ].join('\n');

        fs.writeFileSync(spec.outFile, tsContent, 'utf8');
        console.log(`  -> wrote ${spec.outFile}`);

        // Print stats
        const pathCount = Object.keys(stripped.paths || {}).length;
        let endpointCount = 0;
        for (const methods of Object.values(stripped.paths || {})) {
            for (const key of Object.keys(methods)) {
                if (['get', 'post', 'put', 'patch', 'delete'].includes(key)) {
                    endpointCount++;
                }
            }
        }
        console.log(`  -> ${pathCount} paths, ${endpointCount} endpoints`);
    }
    console.log('Done.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
