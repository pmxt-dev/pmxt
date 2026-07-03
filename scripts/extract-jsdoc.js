/**
 * extract-jsdoc.js
 *
 * Extracts JSDoc annotations from TypeScript source files and produces
 * a JSON config file consumed by generate-api-docs.js.
 *
 * This replaces the manually-maintained api-doc-config.json with
 * auto-extracted data from the source code (single source of truth).
 *
 * Usage: node scripts/extract-jsdoc.js
 * Output: core/api-doc-config.generated.json
 */

const fs = require('fs');
const path = require('path');

const REPO_DIR = path.resolve(__dirname, '..');
const CORE_DIR = path.join(REPO_DIR, 'core');
const OUTPUT_PATH = path.join(CORE_DIR, 'api-doc-config.generated.json');

const SOURCE_FILES = [
    { path: path.join(CORE_DIR, 'src/BaseExchange.ts'), exchangeOnly: null },
    { path: path.join(CORE_DIR, 'src/utils/math.ts'), exchangeOnly: null },
    { path: path.join(CORE_DIR, 'src/exchanges/limitless/index.ts'), exchangeOnly: 'limitless' },
    { path: path.join(CORE_DIR, 'src/exchanges/polymarket/index.ts'), exchangeOnly: 'polymarket' },
    { path: path.join(CORE_DIR, 'src/exchanges/probable/index.ts'), exchangeOnly: 'probable' },
    {
        path: path.join(REPO_DIR, 'sdks/typescript/pmxt/client.ts'),
        exchangeOnly: null,
        includeOnly: ['watchAllOrderBooks', 'firehose'],
    },
];

const WORKFLOW_PATH = path.join(CORE_DIR, 'workflow-examples.json');

// ---------------------------------------------------------------------------
// JSDoc Parser
// ---------------------------------------------------------------------------

/**
 * Parse a single JSDoc block into structured data.
 * @param {string} jsdocBody - The text between / ** and * / (without delimiters)
 * @returns {object} Parsed JSDoc data
 */
function parseJSDoc(jsdocBody) {
    const lines = jsdocBody
        .split('\n')
        .map(line => line.replace(/^\s*\*\s?/, '')); // Strip leading " * "

    const result = {
        description: '',
        params: [],
        returns: null,
        notes: [],
        isInternal: false,
        isDocIgnore: false,
    };

    let currentTag = null;
    let currentBody = [];
    let descriptionLines = [];

    function flushTag() {
        if (!currentTag) {
            result.description = descriptionLines.join('\n').trim();
            return;
        }

        const body = currentBody.join('\n').trimEnd();

        if (currentTag.type === 'param') {
            result.params.push(currentTag.data);
        } else if (currentTag.type === 'returns') {
            result.returns = { description: currentTag.data.description };
        } else if (currentTag.type === 'notes') {
            result.notes.push(body || currentTag.data.text);
        }

        currentTag = null;
        currentBody = [];
    }

    for (const line of lines) {
        // Check for @internal
        if (line.trim().startsWith('@internal')) {
            result.isInternal = true;
            continue;
        }

        // Check for @docIgnore
        if (line.trim().startsWith('@docIgnore')) {
            result.isDocIgnore = true;
            continue;
        }

        // Check for @param
        const paramMatch = line.match(/^@param\s+(\S+)\s*-?\s*(.*)/);
        if (paramMatch) {
            flushTag();
            currentTag = {
                type: 'param',
                data: { name: paramMatch[1], description: paramMatch[2].trim() }
            };
            continue;
        }

        // Check for @returns
        const returnsMatch = line.match(/^@returns?\s*(.*)/);
        if (returnsMatch) {
            flushTag();
            currentTag = {
                type: 'returns',
                data: { description: returnsMatch[1].trim() }
            };
            continue;
        }

        // Check for @notes
        const notesMatch = line.match(/^@notes?\s*(.*)/);
        if (notesMatch) {
            flushTag();
            currentTag = {
                type: 'notes',
                data: { text: notesMatch[1].trim() }
            };
            currentBody = [];
            continue;
        }

        // Skip standard @example (IDE-only, not for doc gen)
        if (line.trim().startsWith('@example ') || line.trim() === '@example') {
            flushTag();
            currentTag = { type: 'skip', data: {} };
            currentBody = [];
            continue;
        }

        // Any other @ tag we don't care about -- skip
        if (line.trim().match(/^@\w+/) && currentTag?.type !== 'skip') {
            flushTag();
            currentTag = { type: 'skip', data: {} };
            currentBody = [];
            continue;
        }

        // Accumulate content
        if (currentTag) {
            if (currentTag.type !== 'skip') {
                currentBody.push(line);
            }
        } else {
            descriptionLines.push(line);
        }
    }

    flushTag();
    return result;
}

/**
 * Parse a method signature line to extract name, params, and return type.
 * Handles: async methodName(params): Promise<ReturnType>
 *          methodName(params): ReturnType
 */
function parseSignature(sigLine) {
    // Clean up the line
    const cleaned = sigLine.trim();

    // Match: [async] [public|protected|private] [get] methodName(params): [Promise<]ReturnType[>]
    // Supports nested parens in params (e.g. callback: (data: any) => void)
    const match = cleaned.match(
        /(?:(?:public|protected|private|async|get)\s+)*(\w+)\s*\(((?:[^()]*|\([^()]*\))*)\)\s*:\s*(.*)/
    );

    if (!match) return null;

    const name = match[1];
    const paramsStr = match[2].trim();
    const returnStr = match[3].trim()
        .replace(/\s*\{.*/, '')  // Remove opening brace
        .replace(/;$/, '')
        .trim();

    // Parse return type (unwrap Promise<>)
    let returnType = returnStr;
    const promiseMatch = returnType.match(/^Promise<(.+)>$/);
    if (promiseMatch) {
        returnType = promiseMatch[1];
    }

    // Parse parameters
    const params = [];
    if (paramsStr) {
        // Split on top-level commas (respecting generics/objects)
        const paramParts = splitParams(paramsStr);
        for (const part of paramParts) {
            const paramMatch = part.trim().match(/^(\w+)(\??)\s*:\s*(.+)/);
            if (paramMatch) {
                params.push({
                    name: paramMatch[1],
                    optional: paramMatch[2] === '?',
                    type: paramMatch[3].trim()
                        .replace(/\s*=\s*.*$/, '') // Remove default values
                        .trim()
                });
            }
        }
    }

    return { name, params, returnType };
}

/**
 * Split parameter string on top-level commas (respecting < > { } nesting).
 */
function splitParams(str) {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const char of str) {
        if (char === '<' || char === '{' || char === '(') depth++;
        if (char === '>' || char === '}' || char === ')') depth--;
        if (char === ',' && depth === 0) {
            parts.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) parts.push(current);
    return parts;
}

// ---------------------------------------------------------------------------
// Source File Processing
// ---------------------------------------------------------------------------

function extractMethods(filePath, exchangeOnly, includeOnly) {
    const source = fs.readFileSync(filePath, 'utf8');
    const methods = {};
    const includeOnlySet = includeOnly ? new Set(includeOnly) : null;

    // Match JSDoc blocks followed by method signatures
    // Regex: /** ... */ followed by optional whitespace/newlines, then a method line
    // Note: access modifiers can appear before or after async (e.g. "protected async" or "async protected")
    const pattern = /\/\*\*([\s\S]*?)\*\/\s*\n\s*((?:(?:public|protected|private|async|get)\s+)*\w+\s*\((?:[^()]*|\([^()]*\))*\)\s*:?\s*[^{]*)/g;

    let match;
    while ((match = pattern.exec(source)) !== null) {
        const jsdocBody = match[1];
        const sigLine = match[2];

        // Skip protected/private methods
        if (/\b(protected|private)\b/.test(sigLine)) continue;

        const jsdoc = parseJSDoc(jsdocBody);

        // Skip internal or ignored methods
        if (jsdoc.isInternal || jsdoc.isDocIgnore) continue;

        const sig = parseSignature(sigLine.replace(/\b(public)\s+/, ''));
        if (!sig) continue;

        // Skip constructor and known non-API methods
        if (['constructor', 'name'].includes(sig.name)) continue;
        if (includeOnlySet && !includeOnlySet.has(sig.name)) continue;

        // Merge JSDoc param descriptions with signature param types
        const mergedParams = sig.params.map(sp => {
            const jsdocParam = jsdoc.params.find(jp =>
                jp.name === sp.name || jp.name === `params.${sp.name}`
            );
            return {
                name: sp.name,
                type: sp.type,
                optional: sp.optional,
                description: jsdocParam ? jsdocParam.description : sp.name
            };
        });

        // Collect sub-params (e.g., @param params.query)
        const subParams = jsdoc.params
            .filter(p => p.name.includes('.'))
            .map(p => ({
                name: p.name,
                description: p.description
            }));

        // Build summary (first line of description) and full description
        const descLines = jsdoc.description.split('\n');
        const summary = descLines[0] || sig.name;
        const description = descLines.slice(1).join('\n').trim() || '';

        methods[sig.name] = {
            summary,
            description: description || summary,
            params: mergedParams,
            subParams: subParams.length > 0 ? subParams : undefined,
            returns: {
                type: sig.returnType,
                description: jsdoc.returns ? jsdoc.returns.description : 'Result'
            },
            notes: jsdoc.notes.length > 0 ? jsdoc.notes : undefined,
            exchangeOnly: exchangeOnly || undefined,
            source: `${path.basename(filePath)}:${getLineNumber(source, match.index)}`
        };
    }

    return methods;
}

function getLineNumber(source, charIndex) {
    return source.substring(0, charIndex).split('\n').length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    const allMethods = {};

    for (const { path: filePath, exchangeOnly, includeOnly } of SOURCE_FILES) {
        if (!fs.existsSync(filePath)) {
            console.warn(`Warning: Source file not found: ${filePath}`);
            continue;
        }

        const methods = extractMethods(filePath, exchangeOnly, includeOnly);

        for (const [name, data] of Object.entries(methods)) {
            // Don't overwrite base class methods with exchange-specific ones
            if (allMethods[name] && !exchangeOnly) continue;
            // Only add exchange-specific methods if not already in base
            if (allMethods[name] && exchangeOnly) continue;
            allMethods[name] = data;
        }
    }

    // Load workflow examples
    let workflowExample = { python: '', typescript: '' };
    if (fs.existsSync(WORKFLOW_PATH)) {
        workflowExample = JSON.parse(fs.readFileSync(WORKFLOW_PATH, 'utf8'));
    } else {
        console.warn(`Warning: Workflow examples not found: ${WORKFLOW_PATH}`);
    }

    const output = {
        _generated: `Auto-generated by extract-jsdoc.js on ${new Date().toISOString()}. Do not edit manually.`,
        methods: allMethods,
        workflowExample
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 4));
    console.log(`Extracted ${Object.keys(allMethods).length} methods -> ${OUTPUT_PATH}`);
}

main();
