// Generates sdks/python/pmxt/_exchanges.py from core/src/server/exchange-factory.ts
// Run via: npm run generate:python-exchanges --workspace=pmxt-core
//
// The createExchange() function in exchange-factory.ts is the single source of
// truth for which exchanges exist and which credentials they require. This
// script reads that function and produces the corresponding Python wrapper classes.

const fs = require('fs');
const path = require('path');

const APP_TS_PATH = path.join(__dirname, '../src/server/exchange-factory.ts');
const OUTPUT_PATH = path.join(__dirname, '../../sdks/python/pmxt/_exchanges.py');
const INIT_PATH = path.join(__dirname, '../../sdks/python/pmxt/__init__.py');

// Python-specific overrides that cannot be derived from app.ts alone.
// Keep this list minimal — only add entries when the generated default is wrong.
const OVERRIDES = {
    polymarket: {
        // The Python SDK defaults to gnosis-safe to match historical behaviour.
        defaults: { signature_type: '"gnosis-safe"' },
        methods: [
            [
                '    def init_auth(self) -> None:',
                '        """Initialize L2 API credentials for Polymarket implicit API signing."""',
                '        self._call_method("initAuth")',
                '        return None',
            ].join('\n'),
        ],
    },
    myriad: {
        // Myriad uses privateKey as the wallet address, not a signing key.
        paramAliases: { private_key: 'wallet_address' },
        paramDocs: {
            wallet_address: 'Wallet address (required for positions and balance)',
        },
    },
    suibets: {
        // Exchange name has no separator; force the canonical PascalCase used
        // by the TypeScript SDK and core engine. The default-derived "Suibets"
        // is emitted as a backwards-compatible alias.
        className: 'SuiBets',
    },
};

function toClassName(name) {
    return name
        .split(/[-_]/)
        .map(part => part.toLowerCase() === 'us' ? 'US' : part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

// Resolve the canonical Python class name for an exchange wire key, honoring
// any explicit override in OVERRIDES[name].className. Use this instead of
// calling toClassName() directly so overrides apply everywhere consistently.
function classNameFor(name) {
    const ov = OVERRIDES[name] || {};
    return ov.className || toClassName(name);
}

function toLegacyClassName(name) {
    return name
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

function parseExchanges(content) {
    const startIdx = content.indexOf('function createExchange(');
    if (startIdx === -1) throw new Error('createExchange not found in exchange-factory.ts');

    // Grab everything from createExchange to the next top-level function/end
    const tail = content.slice(startIdx);
    // Find the closing brace of createExchange by tracking brace depth
    let depth = 0;
    let bodyEnd = 0;
    for (let i = tail.indexOf('{'); i < tail.length; i++) {
        if (tail[i] === '{') depth++;
        else if (tail[i] === '}') {
            depth--;
            if (depth === 0) { bodyEnd = i + 1; break; }
        }
    }
    const funcBody = tail.slice(0, bodyEnd);

    const exchanges = [];
    const lines = funcBody.split('\n');
    let currentName = null;
    let currentBlock = '';

    for (const line of lines) {
        const caseMatch = line.match(/^\s*case "([^"]+)":/);
        if (caseMatch) {
            if (currentName) exchanges.push(build(currentName, currentBlock));
            currentName = caseMatch[1];
            currentBlock = '';
            continue;
        }
        if (/^\s*default:/.test(line) && currentName) {
            exchanges.push(build(currentName, currentBlock));
            currentName = null;
            currentBlock = '';
            continue;
        }
        if (currentName) currentBlock += line + '\n';
    }
    if (currentName) exchanges.push(build(currentName, currentBlock));

    return exchanges;
}

function build(name, block) {
    return {
        name,
        creds: {
            apiKey:        /credentials\?\.apiKey/.test(block),
            apiToken:      /credentials\?\.apiToken/.test(block),
            apiSecret:     /credentials\?\.apiSecret/.test(block),
            passphrase:    /credentials\?\.passphrase/.test(block),
            privateKey:    /credentials\?\.privateKey/.test(block),
            funderAddress: /credentials\?\.funderAddress/.test(block),
            signatureType: /credentials\?\.signatureType/.test(block),
        },
    };
}

function generateClass(exchange) {
    const { name, creds } = exchange;
    const className = classNameFor(name);
    const ov = OVERRIDES[name] || {};
    const aliases = ov.paramAliases || {};
    const defaults = ov.defaults || {};
    const paramDocs = ov.paramDocs || {};
    const methods = ov.methods || [];

    const constructorParams = [];
    const superArgs = [`exchange_name="${name}"`];
    const extraAttrs = [];
    const credOverrideLines = [];

    if (creds.apiKey) {
        constructorParams.push('api_key: Optional[str] = None');
        superArgs.push('api_key=api_key');
    }
    if (creds.apiToken) {
        constructorParams.push('api_token: Optional[str] = None');
        superArgs.push('api_token=api_token');
    }
    if (creds.apiSecret) {
        constructorParams.push('api_secret: Optional[str] = None');
        extraAttrs.push('self.api_secret = api_secret');
        credOverrideLines.push('        if self.api_secret:', '            creds["apiSecret"] = self.api_secret');
    }
    if (creds.passphrase) {
        constructorParams.push('passphrase: Optional[str] = None');
        extraAttrs.push('self.passphrase = passphrase');
        credOverrideLines.push('        if self.passphrase:', '            creds["passphrase"] = self.passphrase');
    }
    if (creds.privateKey) {
        const pyParam = aliases['private_key'] || 'private_key';
        const defaultVal = defaults['private_key'] || 'None';
        constructorParams.push(`${pyParam}: Optional[str] = ${defaultVal}`);
        superArgs.push(`private_key=${pyParam}`);
    }
    if (creds.funderAddress) {
        constructorParams.push('proxy_address: Optional[str] = None');
        superArgs.push('proxy_address=proxy_address');
    }
    if (creds.signatureType) {
        const defaultVal = defaults['signature_type'] || 'None';
        constructorParams.push(`signature_type: Optional[str] = ${defaultVal}`);
        superArgs.push('signature_type=signature_type');
    }
    constructorParams.push('base_url: Optional[str] = None');
    constructorParams.push('auto_start_server: Optional[bool] = None');
    constructorParams.push('pmxt_api_key: Optional[str] = None');
    superArgs.push('base_url=base_url');
    superArgs.push('auto_start_server=auto_start_server');
    superArgs.push('pmxt_api_key=pmxt_api_key');

    const docLines = [];
    if (creds.apiKey)        docLines.push('            api_key: API key for authentication (optional)');
    if (creds.apiToken)      docLines.push('            api_token: API token for authentication (optional; required for Metaculus API access)');
    if (creds.apiSecret)     docLines.push('            api_secret: API secret for authentication (optional)');
    if (creds.passphrase)    docLines.push('            passphrase: Passphrase for authentication (optional)');
    if (creds.privateKey) {
        const pyParam = aliases['private_key'] || 'private_key';
        const doc = paramDocs[pyParam] || 'Private key for authentication (optional)';
        docLines.push(`            ${pyParam}: ${doc}`);
    }
    if (creds.funderAddress) docLines.push('            proxy_address: Proxy/smart wallet address (optional)');
    if (creds.signatureType) docLines.push('            signature_type: Signature type (optional)');
    docLines.push('            base_url: Base URL of the PMXT sidecar server');
    docLines.push('            auto_start_server: Automatically start server if not running (default: True)');
    docLines.push('            pmxt_api_key: Hosted PMXT API key (optional; enables hosted mode)');

    const indent4 = s => `    ${s}`;
    const indent8 = s => `        ${s}`;
    const indent12 = s => `            ${s}`;

    const lines = [
        `class ${className}(Exchange):`,
        indent4(`"""${className} exchange client."""`),
        '',
        indent4('def __init__('),
        indent8('self,'),
        ...constructorParams.map(p => indent8(`${p},`)),
        indent4(') -> None:'),
        indent8('"""'),
        indent8(`Initialize ${className} client.`),
        '',
        indent8('Args:'),
        ...docLines,
        indent8('"""'),
        indent8('super().__init__('),
        ...superArgs.map(a => indent12(`${a},`)),
        indent8(')'),
    ];

    if (extraAttrs.length) {
        lines.push('', ...extraAttrs.map(indent8));
    }

    if (credOverrideLines.length) {
        lines.push(
            '',
            indent4('def _get_credentials_dict(self) -> Optional[Dict[str, Any]]:'),
            indent8('creds = super()._get_credentials_dict() or {}'),
            ...credOverrideLines,
            indent8('return creds if creds else None'),
        );
    }

    if (methods.length) {
        lines.push('', ...methods);
    }

    return lines.join('\n');
}

const appTs = fs.readFileSync(APP_TS_PATH, 'utf8');
const exchanges = parseExchanges(appTs);
const legacyAliases = exchanges
    .map(ex => ({ legacyName: toLegacyClassName(ex.name), className: classNameFor(ex.name) }))
    .filter(alias => alias.legacyName !== alias.className);

const header = [
    '# This file is auto-generated by core/scripts/generate-python-exchanges.js',
    '# Do not edit manually.',
    '# To regenerate: npm run generate:sdk:all --workspace=pmxt-core',
    '# Source of truth: core/src/server/exchange-factory.ts (createExchange function)',
    '',
    'from typing import Any, Dict, Optional',
    '',
    'from .client import Exchange',
    '',
    '',
].join('\n');

const body = exchanges.map(generateClass).join('\n\n\n');
const aliasBlock = legacyAliases.length
    ? [
        '',
        '',
        '# Backwards-compatible aliases for exchange classes generated before underscore handling.',
        ...legacyAliases.map(alias => `${alias.legacyName} = ${alias.className}`),
        '',
    ].join('\n')
    : '\n';

fs.writeFileSync(OUTPUT_PATH, header + body + aliasBlock);
console.log(`Generated ${exchanges.length} exchange classes -> ${path.relative(process.cwd(), OUTPUT_PATH)}`);
for (const ex of exchanges) {
    console.log(`  ${classNameFor(ex.name)} (exchange_name="${ex.name}")`);
}

// ---------------------------------------------------------------------------
// Update __init__.py imports and __all__ to match generated exchanges
// ---------------------------------------------------------------------------
const classNames = exchanges.flatMap(ex => {
    const className = classNameFor(ex.name);
    const legacyName = toLegacyClassName(ex.name);
    return legacyName === className ? [className] : [className, legacyName];
});
const importList = classNames.join(', ');

let init = fs.readFileSync(INIT_PATH, 'utf8');

// Update the import line from ._exchanges
init = init.replace(
    /^from \._exchanges import .+$/m,
    `from ._exchanges import ${importList}`
);

// Update the # Exchanges section in __all__
const allEntries = classNames.map(n => `    "${n}",`).join('\n');
init = init.replace(
    /(    # Exchanges\r?\n)([\s\S]*?)(    "Exchange",)/,
    `$1${allEntries}\n$3`
);

fs.writeFileSync(INIT_PATH, init);
console.log(`Updated __init__.py imports and __all__`);
