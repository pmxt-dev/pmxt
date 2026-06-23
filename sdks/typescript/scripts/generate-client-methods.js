'use strict';

/**
 * Generates the simple pass-through methods in pmxt/client.ts from BaseExchange.ts.
 *
 * Every public method in BaseExchange.ts that is not in SKIP_GENERATE is templated
 * as a fetch call to the sidecar and injected between the generation markers in
 * client.ts. This ensures the TypeScript SDK surface stays in sync with the core.
 *
 * Return type config (returnTs, pattern, converter) is derived entirely from the
 * TypeScript return type — no manual METHOD_RETURN_CONFIG required. When a new method
 * is added to BaseExchange.ts with a known return type, it appears in client.ts
 * automatically on the next generation run.
 *
 * Run: node sdks/typescript/scripts/generate-client-methods.js
 */

const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const BASE_EXCHANGE_PATH = path.join(__dirname, '../../../core/src/BaseExchange.ts');
const CLIENT_PATH = path.join(__dirname, '../pmxt/client.ts');

const MARKER_BEGIN = '    // BEGIN GENERATED METHODS';
const MARKER_END = '    // END GENERATED METHODS';

// Methods with bespoke SDK/hosted behavior that still live inside the generated
// region. Preserve the checked-in method bodies while generator support catches up
// so codegen checks do not erase hand-maintained hosted routing shims.
const PRESERVE_EXISTING_METHODS = new Set([
    'fetchEventsPaginated',
    'cancelOrder',
    'fetchOrder',
    'fetchOrderBook',
    'fetchOpenOrders',
    'fetchMyTrades',
    'fetchClosedOrders',
    'fetchAllOrders',
    'fetchPositions',
    'fetchBalance',
    'fetchMatchedMarkets',
]);

function extractExistingTsMethod(generatedRegion, methodName) {
    const re = new RegExp(`^    async ${methodName}\\([^\\n]*\\)[^{]*\\{[\\s\\S]*?(?=^    async |^    // END GENERATED METHODS)`, 'm');
    const match = generatedRegion.match(re);
    return match ? match[0].replace(/\n+$/, '') : null;
}

// Methods kept hand-maintained in client.ts (special logic, streaming, local-only)
const SKIP_GENERATE = new Set([
    'callApi',
    'defineImplicitApi',
    'fetchOHLCV',                // date object preprocessing
    'fetchTrades',               // resolution parameter handling
    'watchOrderBook',            // streaming
    'watchOrderBooks',           // streaming (batch)
    'watchTrades',               // streaming
    'watchAddress',              // streaming
    'createOrder',               // outcome shorthand logic
    'buildOrder',                // complex args format, returns BuiltOrder
    'getExecutionPrice',         // delegates to getExecutionPriceDetailed
    'getExecutionPriceDetailed', // complex args format
    'filterMarkets',             // pure local computation, no sidecar
    'filterEvents',              // pure local computation, no sidecar
]);

// ---------------------------------------------------------------------------
// TypeScript type name -> SDK type info
//
// Maps a TS model/interface name to the converter function used in client.ts.
// The returnTs string is produced directly from the AST — no manual annotation.
//
// Special patterns (paginated, record, void) are detected from the type name itself.
// ---------------------------------------------------------------------------
const TYPE_MAP = {
    UnifiedMarket: { converter: 'convertMarket' },
    UnifiedEvent: { converter: 'convertEvent' },
    UnifiedSeries: { converter: 'convertSeries' },
    Order: { converter: 'convertOrder' },
    UserTrade: { converter: 'convertUserTrade' },
    Position: { converter: 'convertPosition' },
    Balance: { converter: 'convertBalance' },
    Trade: { converter: 'convertTrade' },
    OrderBook: { converter: 'convertOrderBook' },
    PriceCandle: { converter: 'convertCandle' },
    // Pagination wrapper — gets its own response handler
    PaginatedMarketsResult: { converter: null, pattern: 'paginatedMarkets' },
    PaginatedEventsResult: { converter: null, pattern: 'paginatedEvents' },
};

// SDK types that can appear in generated signatures without extra imports
const SDK_PARAM_TYPES = new Set([
    'UnifiedMarket', 'UnifiedEvent', 'UnifiedSeries', 'OrderBook', 'Order', 'Trade',
    'UserTrade', 'Position', 'Balance', 'PriceCandle', 'PaginatedMarketsResult', 'PaginatedEventsResult',
    'BuiltOrder',
    // Parameter types
    'MarketFilterParams', 'MarketFetchParams', 'EventFetchParams', 'SeriesFetchParams',
    'OHLCVParams', 'TradesParams', 'HistoryFilterParams',
    'MyTradesParams', 'OrderHistoryParams', 'CreateOrderParams',
    'MarketFilterCriteria', 'EventFilterCriteria',
    'SubscriptionOption',
]);

// Parameter names that represent outcome IDs and should accept MarketOutcome.
// The generator widens `string` to `string | MarketOutcome` in signatures
// and wraps the value with `resolveOutcomeId()` in the args array.
const OUTCOME_ID_PARAM_NAMES = new Set(['id', 'outcomeId']);
// Plural variant (array of outcome IDs)
const OUTCOME_IDS_PARAM_NAMES = new Set(['ids', 'outcomeIds']);

// ---------------------------------------------------------------------------
// TypeScript AST helpers
// ---------------------------------------------------------------------------

/**
 * Recursively walk a TypeScript type node and return a descriptor:
 *   { returnTs, isArray, converter, pattern }
 *
 * Transparently unwraps Promise<T>, Array<T>, and T[].
 */
function resolveReturnType(node, sf) {
    if (!node) return { returnTs: 'any', isArray: false, converter: null, pattern: 'raw' };

    switch (node.kind) {
        case ts.SyntaxKind.VoidKeyword:
            return { returnTs: 'void', isArray: false, converter: null, pattern: 'void' };

        case ts.SyntaxKind.StringKeyword:
            return { returnTs: 'string', isArray: false, converter: null, pattern: 'raw' };

        case ts.SyntaxKind.NumberKeyword:
            return { returnTs: 'number', isArray: false, converter: null, pattern: 'raw' };

        case ts.SyntaxKind.BooleanKeyword:
            return { returnTs: 'boolean', isArray: false, converter: null, pattern: 'raw' };

        case ts.SyntaxKind.ArrayType: {
            // T[]
            const inner = resolveReturnType(node.elementType, sf);
            return { ...inner, returnTs: `${inner.returnTs}[]`, isArray: true };
        }

        case ts.SyntaxKind.TypeReference: {
            const name = node.typeName.kind === ts.SyntaxKind.Identifier
                ? node.typeName.text
                : node.typeName.right.text;

            // Unwrap Promise<T>
            if (name === 'Promise' && node.typeArguments && node.typeArguments.length > 0) {
                return resolveReturnType(node.typeArguments[0], sf);
            }

            // Array<T>
            if (name === 'Array' && node.typeArguments && node.typeArguments.length > 0) {
                const inner = resolveReturnType(node.typeArguments[0], sf);
                return { ...inner, returnTs: `${inner.returnTs}[]`, isArray: true };
            }

            // Record<K, V>
            if (name === 'Record' && node.typeArguments && node.typeArguments.length === 2) {
                const k = resolveReturnType(node.typeArguments[0], sf).returnTs;
                const v = resolveReturnType(node.typeArguments[1], sf);
                return {
                    returnTs: `Record<${k}, ${v.returnTs}>`,
                    isArray: false,
                    converter: v.converter,
                    pattern: 'record',
                };
            }

            // Known model type
            if (TYPE_MAP[name]) {
                const info = TYPE_MAP[name];
                return {
                    returnTs: name,
                    isArray: false,
                    converter: info.converter,
                    pattern: info.pattern || 'single',
                };
            }

            // Scalar aliases
            if (name === 'string') return { returnTs: 'string', isArray: false, converter: null, pattern: 'raw' };
            if (name === 'number') return { returnTs: 'number', isArray: false, converter: null, pattern: 'raw' };
            if (name === 'boolean') return { returnTs: 'boolean', isArray: false, converter: null, pattern: 'raw' };

            return { returnTs: 'any', isArray: false, converter: null, pattern: 'raw' };
        }

        case ts.SyntaxKind.UnionType: {
            const nonNull = node.types.filter(t =>
                t.kind !== ts.SyntaxKind.UndefinedKeyword &&
                t.kind !== ts.SyntaxKind.NullKeyword
            );
            if (nonNull.length === 1) return resolveReturnType(nonNull[0], sf);
            return { returnTs: 'any', isArray: false, converter: null, pattern: 'raw' };
        }

        default:
            return { returnTs: 'any', isArray: false, converter: null, pattern: 'raw' };
    }
}

/**
 * Given a method's return type node, compute the full { returnTs, pattern, converter }
 * config needed by generateMethod. This is the single source of truth.
 */
function inferReturnConfig(returnTypeNode, methodName, sf) {
    const resolved = resolveReturnType(returnTypeNode, sf);

    if (resolved.pattern === 'paginatedMarkets' || resolved.pattern === 'paginatedEvents') {
        return { returnTs: resolved.returnTs, pattern: resolved.pattern, converter: null };
    }

    if (resolved.pattern === 'void') {
        return { returnTs: 'void', pattern: 'void', converter: null };
    }

    if (resolved.pattern === 'record') {
        return { returnTs: resolved.returnTs, pattern: 'record', converter: resolved.converter };
    }

    if (resolved.isArray) {
        if (!resolved.converter) {
            console.warn(`  WARNING: '${methodName}' returns an array of unknown type ('${resolved.returnTs}'). Using raw pattern.`);
            return { returnTs: resolved.returnTs, pattern: 'raw', converter: null };
        }
        return { returnTs: resolved.returnTs, pattern: 'array', converter: resolved.converter };
    }

    if (resolved.pattern === 'single' && resolved.converter) {
        return { returnTs: resolved.returnTs, pattern: 'single', converter: resolved.converter };
    }

    // Scalar or genuinely unknown
    return { returnTs: resolved.returnTs, pattern: 'raw', converter: null };
}

/** typeNodeToTS for *parameter* types only (pattern inference not needed). */
function typeNodeToTS(node, sf) {
    if (!node) return 'any';
    switch (node.kind) {
        case ts.SyntaxKind.StringKeyword: return 'string';
        case ts.SyntaxKind.NumberKeyword: return 'number';
        case ts.SyntaxKind.BooleanKeyword: return 'boolean';
        case ts.SyntaxKind.VoidKeyword: return 'void';
        case ts.SyntaxKind.AnyKeyword: return 'any';
        case ts.SyntaxKind.UndefinedKeyword: return 'undefined';
        case ts.SyntaxKind.ArrayType: return `${typeNodeToTS(node.elementType, sf)}[]`;
        case ts.SyntaxKind.TypeReference: {
            const name = node.typeName.kind === ts.SyntaxKind.Identifier
                ? node.typeName.text
                : node.typeName.right.text;
            if (name === 'Promise' && node.typeArguments) return typeNodeToTS(node.typeArguments[0], sf);
            if (name === 'Record' && node.typeArguments) {
                const k = typeNodeToTS(node.typeArguments[0], sf);
                const v = typeNodeToTS(node.typeArguments[1], sf);
                return `Record<${k}, ${v}>`;
            }
            return SDK_PARAM_TYPES.has(name) ? name : 'any';
        }
        case ts.SyntaxKind.UnionType: {
            const nonNull = node.types.filter(t =>
                t.kind !== ts.SyntaxKind.UndefinedKeyword &&
                t.kind !== ts.SyntaxKind.NullKeyword
            );
            if (nonNull.length === 1) return typeNodeToTS(nonNull[0], sf);
            return 'any';
        }
        case ts.SyntaxKind.LiteralType: {
            const lit = node.literal;
            if (lit.kind === ts.SyntaxKind.StringLiteral) return `'${lit.text}'`;
            return 'any';
        }
        default: return 'any';
    }
}

function isPublicMethod(node) {
    if (!node.modifiers) return true;
    for (const mod of node.modifiers) {
        if (
            mod.kind === ts.SyntaxKind.PrivateKeyword ||
            mod.kind === ts.SyntaxKind.ProtectedKeyword ||
            mod.kind === ts.SyntaxKind.AbstractKeyword
        ) return false;
    }
    return true;
}

function extractMethods(sourceFile) {
    const methods = [];

    function visitClass(classNode) {
        for (const member of classNode.members) {
            if (member.kind !== ts.SyntaxKind.MethodDeclaration) continue;
            if (!isPublicMethod(member)) continue;
            const name = member.name && member.name.kind === ts.SyntaxKind.Identifier
                ? member.name.text
                : null;
            if (!name) continue;
            if (SKIP_GENERATE.has(name)) continue;

            // Gate: only include methods whose return type we can fully resolve
            const config = inferReturnConfig(member.type, name, sourceFile);
            if (config.pattern === 'raw' && config.returnTs === 'any') {
                console.warn(`  WARNING: '${name}' has an unrecognised return type — skipping. Add it to TYPE_MAP if needed.`);
                continue;
            }

            methods.push(member);
        }
    }

    function visit(node) {
        if (node.kind === ts.SyntaxKind.ClassDeclaration) {
            visitClass(node);
            return;
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return methods;
}

// ---------------------------------------------------------------------------
// Code generation helpers
// ---------------------------------------------------------------------------

function buildSignatureParams(params, sf) {
    return params.map(p => {
        const name = p.name.getText(sf);
        const isOptional = !!p.questionToken;
        const hasDefault = !!p.initializer;
        let typeStr = p.type ? typeNodeToTS(p.type, sf) : 'any';
        // Widen outcome-ID parameters to also accept MarketOutcome objects
        if (OUTCOME_ID_PARAM_NAMES.has(name) && typeStr === 'string') {
            typeStr = 'string | MarketOutcome';
        } else if (OUTCOME_IDS_PARAM_NAMES.has(name) && typeStr === 'string[]') {
            typeStr = '(string | MarketOutcome)[]';
        }
        if (isOptional) return `${name}?: ${typeStr}`;
        if (hasDefault) return `${name}: ${typeStr} = ${p.initializer.getText(sf)}`;
        return `${name}: ${typeStr}`;
    }).join(', ');
}

function buildArgsLines(params, sf) {
    const lines = ['const args: any[] = [];'];
    for (const p of params) {
        const name = p.name.getText(sf);
        const typeStr = p.type ? typeNodeToTS(p.type, sf) : 'any';
        // Resolve MarketOutcome -> string for outcome ID parameters
        const isOutcomeId = OUTCOME_ID_PARAM_NAMES.has(name) && typeStr === 'string';
        const isOutcomeIds = OUTCOME_IDS_PARAM_NAMES.has(name) && typeStr === 'string[]';
        const value = isOutcomeId
            ? `resolveOutcomeId(${name})`
            : isOutcomeIds
                ? `${name}.map(resolveOutcomeId)`
                : name;
        if (p.initializer) {
            lines.push(`args.push(${value});`);
        } else if (p.questionToken) {
            lines.push(`if (${name} !== undefined) args.push(${value});`);
        } else {
            lines.push(`args.push(${value});`);
        }
    }
    return lines.join('\n            ');
}

function buildReturnLines(config) {
    const { pattern, converter } = config;
    const i = '            '; // 12 spaces
    switch (pattern) {
        case 'array':
            return `${i}const data = this.handleResponse(json);\n${i}return data.map(${converter});`;
        case 'single':
            return `${i}const data = this.handleResponse(json);\n${i}return ${converter}(data);`;
        case 'record':
            return [
                `${i}const data = this.handleResponse(json);`,
                `${i}const result: ${config.returnTs} = {};`,
                `${i}for (const [key, value] of Object.entries(data as any)) {`,
                `${i}    result[key] = ${converter}(value);`,
                `${i}}`,
                `${i}return result;`,
            ].join('\n');
        case 'paginatedMarkets':
            return [
                `${i}const data = this.handleResponse(json);`,
                `${i}return {`,
                `${i}    data: (data.data || []).map(convertMarket),`,
                `${i}    total: data.total,`,
                `${i}    nextCursor: data.nextCursor,`,
                `${i}};`,
            ].join('\n');
        case 'paginatedEvents':
            return [
                `${i}const data = this.handleResponse(json);`,
                `${i}return {`,
                `${i}    data: (data.data || []).map(convertEvent),`,
                `${i}    total: data.total,`,
                `${i}    nextCursor: data.nextCursor,`,
                `${i}};`,
            ].join('\n');
        case 'void':
            return `${i}this.handleResponse(json);`;
        default:
            return `${i}return this.handleResponse(json);`;
    }
}

function generateMethod(name, params, config, sf) {
    if (name === 'fetchOrderBook') {
        return [
            `    async fetchOrderBook(outcomeId: string | MarketOutcome, limit?: number, params?: FetchOrderBookParams): Promise<OrderBook | OrderBook[]> {`,
            `        await this.initPromise;`,
            `        try {`,
            `            const args: any[] = [];`,
            `            args.push(resolveOutcomeId(outcomeId));`,
            `            if (limit !== undefined) args.push(limit);`,
            `            if (params !== undefined) {`,
            `                if (limit === undefined) args.push(null);`,
            `                args.push(params);`,
            `            }`,
            `            const response = await this.fetchWithRetry(\`\${this.resolveBaseUrl()}/api/\${this.exchangeName}/fetchOrderBook\`, {`,
            `                method: 'POST',`,
            `                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },`,
            `                body: JSON.stringify({ args, credentials: this.getCredentials() }),`,
            `            });`,
            `            if (!response.ok) {`,
            `                const body = await response.json().catch(() => ({}));`,
            `                if (body.error && typeof body.error === "object") {`,
            `                    throw fromServerError(body.error);`,
            `                }`,
            `                throw new PmxtError(body.error?.message || response.statusText);`,
            `            }`,
            `            const json = await response.json();`,
            `            const data = this.handleResponse(json);`,
            `            if (Array.isArray(data)) {`,
            `                return data.map(convertOrderBook);`,
            `            }`,
            `            return convertOrderBook(data);`,
            `        } catch (error) {`,
            `            if (error instanceof PmxtError) throw error;`,
            `            throw new PmxtError(\`Failed to fetchOrderBook: \${error}\`);`,
            `        }`,
            `    }`,
        ].join('\n');
    }

    const sig = buildSignatureParams(params, sf);
    const argsCode = buildArgsLines(params, sf);
    const returnCode = buildReturnLines(config);
    const { returnTs } = config;
    const localOnlyGuard = name === 'submitOrder'
        ? [
            `        if (this.isHosted) {`,
            `            throw new PmxtError("submitOrder is not available in hosted mode. Use createOrder instead.");`,
            `        }`,
        ]
        : [];

    return [
        `    async ${name}(${sig}): Promise<${returnTs}> {`,
        `        await this.initPromise;`,
        ...localOnlyGuard,
        `        try {`,
        `            ${argsCode}`,
        `            const response = await this.fetchWithRetry(\`\${this.resolveBaseUrl()}/api/\${this.exchangeName}/${name}\`, {`,
        `                method: 'POST',`,
        `                headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },`,
        `                body: JSON.stringify({ args, credentials: this.getCredentials() }),`,
        `            });`,
        `            if (!response.ok) {`,
        `                const body = await response.json().catch(() => ({}));`,
        `                if (body.error && typeof body.error === "object") {`,
        `                    throw fromServerError(body.error);`,
        `                }`,
        `                throw new PmxtError(body.error?.message || response.statusText);`,
        `            }`,
        `            const json = await response.json();`,
        returnCode,
        `        } catch (error) {`,
        `            if (error instanceof PmxtError) throw error;`,
        `            throw new PmxtError(\`Failed to ${name}: \${error}\`);`,
        `        }`,
        `    }`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    const source = fs.readFileSync(BASE_EXCHANGE_PATH, 'utf-8');
    const sf = ts.createSourceFile('BaseExchange.ts', source, ts.ScriptTarget.ES2022, true);

    const methods = extractMethods(sf);

    let client = fs.readFileSync(CLIENT_PATH, 'utf-8');

    const beginIdx = client.indexOf(MARKER_BEGIN);
    const endIdx = client.indexOf(MARKER_END);

    if (beginIdx === -1 || endIdx === -1) {
        throw new Error(`Generation markers not found in ${CLIENT_PATH}.\nAdd:\n  ${MARKER_BEGIN}\n  ${MARKER_END}`);
    }

    const before = client.slice(0, beginIdx + MARKER_BEGIN.length);
    const existingRegion = client.slice(beginIdx + MARKER_BEGIN.length, endIdx);
    const after = client.slice(endIdx);

    const generated = methods.map(m => {
        const name = m.name.text;
        if (PRESERVE_EXISTING_METHODS.has(name)) {
            const existing = extractExistingTsMethod(existingRegion, name);
            if (existing) return existing;
        }
        const config = inferReturnConfig(m.type, name, sf);
        return generateMethod(name, m.parameters, config, sf);
    }).join('\n\n');

    client = `${before}\n\n${generated}\n\n${after}`;

    fs.writeFileSync(CLIENT_PATH, client, 'utf-8');

    console.log(`Generated ${methods.length} methods in client.ts:`);
    for (const m of methods) {
        const config = inferReturnConfig(m.type, m.name.text, sf);
        console.log(`  + ${m.name.text} -> Promise<${config.returnTs}> [${config.pattern}]`);
    }
}

main();
