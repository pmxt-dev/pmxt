#!/usr/bin/env node
/**
 * generate-llms.js
 *
 * Produces docs/llms.txt (compact index) and docs/llms-full.txt (full body)
 * with correct ordering, inline API reference, no Mintlify JSX noise, and
 * absolute links.  Mintlify serves these static files instead of its
 * auto-generated versions.
 *
 * Usage:  node scripts/generate-llms.js
 */

const fs = require("fs");
const path = require("path");

const DOCS_DIR = path.join(__dirname, "..", "docs");
const BASE_URL = "https://pmxt.dev/docs";

function trimTrailingWhitespace(text) {
  return text.replace(/[ \t]+$/gm, "");
}

// ---------------------------------------------------------------------------
// 1. Read navigation from docs.json
// ---------------------------------------------------------------------------
const docsConfig = JSON.parse(
  fs.readFileSync(path.join(DOCS_DIR, "docs.json"), "utf8")
);

// ---------------------------------------------------------------------------
// 2. Read OpenAPI specs
// ---------------------------------------------------------------------------
const openapi = JSON.parse(
  fs.readFileSync(path.join(DOCS_DIR, "api-reference", "openapi.json"), "utf8")
);

const openapiHostedPath = path.join(
  DOCS_DIR,
  "api-reference",
  "openapi-hosted.json"
);
const openapiHosted = fs.existsSync(openapiHostedPath)
  ? JSON.parse(fs.readFileSync(openapiHostedPath, "utf8"))
  : null;
const openapiHostedTradingPath = path.join(
  DOCS_DIR,
  "api-reference",
  "openapi-hosted-trading.json"
);
const openapiHostedTrading = fs.existsSync(openapiHostedTradingPath)
  ? JSON.parse(fs.readFileSync(openapiHostedTradingPath, "utf8"))
  : null;

const openapiSpecs = {
  "api-reference/openapi.json": openapi,
  "api-reference/openapi-hosted.json": openapiHosted,
  "api-reference/openapi-hosted-trading.json": openapiHostedTrading,
};

function resolveOpenApiSpec(specFile) {
  return openapiSpecs[specFile] || null;
}

// ---------------------------------------------------------------------------
// 3. Helpers
// ---------------------------------------------------------------------------

/** Strip YAML frontmatter */
function stripFrontmatter(content) {
  const m = content.match(/^---\n[\s\S]*?\n---\n?/);
  return m ? content.slice(m[0].length) : content;
}

/** Extract frontmatter title */
function extractTitle(content) {
  const m = content.match(/^---\n[\s\S]*?title:\s*"?([^"\n]+)"?\s*\n/);
  return m ? m[1].trim() : null;
}

/** Extract frontmatter description */
function extractDescription(content) {
  const m = content.match(
    /^---\n[\s\S]*?description:\s*"?([^"\n]+)"?\s*\n/
  );
  return m ? m[1].trim() : null;
}

/** Strip Mintlify JSX and convert to plain markdown */
function stripJsx(content) {
  let out = content;

  // Convert <Tab title="X"> blocks to **X:** subheadings
  out = out.replace(/<Tab\s+title="([^"]+)">/g, "\n**$1:**\n");

  // Convert <Warning> to blockquote
  out = out.replace(/<Warning>/g, "\n> **Warning:**");
  out = out.replace(/<\/Warning>/g, "");

  // Convert <Info> to blockquote
  out = out.replace(/<Info>/g, "\n> **Note:**");
  out = out.replace(/<\/Info>/g, "");

  // Convert <Note> to blockquote
  out = out.replace(/<Note>/g, "\n> **Note:**");
  out = out.replace(/<\/Note>/g, "");

  // Convert <Card> elements to bulleted links
  out = out.replace(
    /<Card\s+title="([^"]+)"[^>]*href="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/Card>/g,
    (_, title, href, body) => {
      const absHref = href.startsWith("/") ? `${BASE_URL}${href}` : href;
      const desc = body.replace(/\n\s*/g, " ").trim();
      return desc
        ? `- **[${title}](${absHref})** — ${desc}`
        : `- **[${title}](${absHref})**`;
    }
  );

  // Convert <Step title="X"> to numbered list-like heading
  out = out.replace(/<Step\s+title="([^"]+)">/g, "\n**$1**\n");

  // Strip remaining JSX tags (Tabs, CardGroup, Steps, etc.)
  out = out.replace(/<\/?Tabs>/g, "");
  out = out.replace(/<\/?Tab[^>]*>/g, "");
  out = out.replace(/<CardGroup[^>]*>/g, "");
  out = out.replace(/<\/CardGroup>/g, "");
  out = out.replace(/<Card[^>]*>[\s\S]*?<\/Card>/g, "");
  out = out.replace(/<Steps>/g, "");
  out = out.replace(/<\/Steps>/g, "");
  out = out.replace(/<Step[^>]*>/g, "");
  out = out.replace(/<\/Step>/g, "");

  // Strip JSX comments {/* ... */}
  out = out.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  // Strip theme={null} from code fences
  out = out.replace(/\s*theme=\{null\}/g, "");

  // Convert relative links to absolute (including anchors)
  out = out.replace(
    /\]\(\/([\w\-/#.]+)\)/g,
    (_, p) => `](${BASE_URL}/${p})`
  );

  // De-indent content that was inside <Tab> (4 extra spaces)
  out = out.replace(/^    (```[\s\S]*?```)/gm, "$1");
  out = out.replace(/^    /gm, "");

  // Collapse 3+ blank lines to 2
  out = out.replace(/\n{4,}/g, "\n\n\n");

  return out.trim();
}

/**
 * Demote headings in MDX body so they nest under the page-level H3.
 * H1 -> H4, H2 -> H4, H3 -> H5, etc.
 * Skips content inside fenced code blocks.
 */
function demoteHeadings(body) {
  const lines = body.split("\n");
  let inCodeBlock = false;
  const result = [];

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }
    if (inCodeBlock) {
      result.push(line);
      continue;
    }
    const m = line.match(/^(#{1,6})\s/);
    if (m) {
      const level = m[1].length;
      const newLevel = Math.min(level + 2, 6);
      result.push("#".repeat(newLevel) + line.slice(m[1].length));
    } else {
      result.push(line);
    }
  }
  return result.join("\n");
}

/**
 * Resolve an OpenAPI $ref like "#/components/schemas/Foo"
 * against a spec object, returning the resolved schema.
 */
function resolveRef(spec, ref) {
  if (!ref || !ref.startsWith("#/")) return null;
  const parts = ref.replace("#/", "").split("/");
  let node = spec;
  for (const p of parts) {
    node = node?.[p];
  }
  return node || null;
}

/**
 * Flatten a schema into a simple { field: type } map for docs.
 * Resolves $ref, allOf, and nested objects one level deep.
 */
function flattenSchema(spec, schema) {
  if (!schema) return {};
  if (schema.$ref) {
    return flattenSchema(spec, resolveRef(spec, schema.$ref));
  }
  if (schema.allOf) {
    let merged = {};
    for (const s of schema.allOf) {
      merged = { ...merged, ...flattenSchema(spec, s) };
    }
    return merged;
  }
  if (schema.properties) {
    const out = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      const resolved = v.$ref ? resolveRef(spec, v.$ref) : v;
      out[k] = resolved?.type || "object";
    }
    return out;
  }
  return {};
}

/**
 * Build a compact param table string from OpenAPI parameters array.
 */
function buildParamTable(spec, params) {
  if (!params || params.length === 0) return "";

  const resolved = params.map((p) =>
    p.$ref ? resolveRef(spec, p.$ref) : p
  );

  // Skip the exchange path param (it's always the same)
  const filtered = resolved.filter(
    (p) => p && !(p.name === "exchange" && p.in === "path")
  );
  if (filtered.length === 0) return "";

  const lines = ["| Parameter | Type | Required | Description |"];
  lines.push("| --- | --- | --- | --- |");
  for (const p of filtered) {
    const type = p.schema?.type || "string";
    const req = p.required ? "Yes" : "No";
    const desc = (p.description || "").replace(/\n/g, " ").trim();
    lines.push(`| \`${p.name}\` | ${type} | ${req} | ${desc} |`);
  }
  return lines.join("\n");
}

/**
 * Build request body docs from OpenAPI requestBody.
 */
function buildRequestBody(spec, requestBody) {
  if (!requestBody) return "";

  const schema =
    requestBody.content?.["application/json"]?.schema;
  if (!schema) return "";

  const resolved = schema.$ref
    ? resolveRef(spec, schema.$ref)
    : schema;
  if (!resolved?.properties) return "";

  // Look at the args schema
  const argsSchema = resolved.properties.args;
  if (!argsSchema) return "";

  const itemSchema = argsSchema.items;
  if (!itemSchema) return "";

  const itemResolved = itemSchema.$ref
    ? resolveRef(spec, itemSchema.$ref)
    : itemSchema;

  if (!itemResolved?.properties) return "";

  const lines = ["**Request body** (`args[0]`):\n"];
  lines.push("| Field | Type | Required | Description |");
  lines.push("| --- | --- | --- | --- |");

  const required = new Set(itemResolved.required || []);
  for (const [name, prop] of Object.entries(itemResolved.properties)) {
    const resolvedProp = prop.$ref ? resolveRef(spec, prop.$ref) : prop;
    const allOfFirst =
      prop.allOf?.[0]?.$ref
        ? resolveRef(spec, prop.allOf[0].$ref)
        : prop.allOf?.[0];
    const effective = resolvedProp || allOfFirst || prop;

    let type = effective.type || "object";
    if (effective.enum) type = effective.enum.map((e) => `\`${e}\``).join(" \\| ");
    const req = required.has(name) ? "Yes" : "No";
    const desc = (effective.description || prop.description || "")
      .replace(/\n/g, " ")
      .trim();
    lines.push(`| \`${name}\` | ${type} | ${req} | ${desc} |`);
  }
  return lines.join("\n");
}

/**
 * Pick the shortest code sample — prefer Router, fallback to first.
 * Returns one Python + one JS sample string.
 */
function pickCodeSamples(codeSamples) {
  if (!codeSamples || codeSamples.length === 0) return "";

  const pySamples = codeSamples.filter((s) => s.lang === "python");
  const jsSamples = codeSamples.filter((s) => s.lang === "javascript");

  const pickBest = (samples) => {
    const router = samples.find((s) => s.label === "Router");
    const kalshi = samples.find((s) => s.label === "Kalshi");
    return router || kalshi || samples[0];
  };

  const parts = [];
  const py = pickBest(pySamples);
  if (py) parts.push(`**Python:**\n\`\`\`python\n${py.source}\n\`\`\``);
  const js = pickBest(jsSamples);
  if (js) parts.push(`**TypeScript:**\n\`\`\`typescript\n${js.source}\n\`\`\``);

  return parts.join("\n\n");
}

/**
 * Build the inline API reference for one OpenAPI endpoint.
 */
function buildEndpointDoc(spec, method, urlPath, operation) {
  const lines = [];

  lines.push(`### ${operation.summary || operation.operationId}`);
  lines.push("");
  lines.push(`\`${method.toUpperCase()} ${urlPath}\``);
  lines.push("");

  if (operation.description) {
    lines.push(operation.description.trim());
    lines.push("");
  }

  // Parameters
  const paramTable = buildParamTable(spec, operation.parameters);
  if (paramTable) {
    lines.push(paramTable);
    lines.push("");
  }

  // Request body
  const body = buildRequestBody(spec, operation.requestBody);
  if (body) {
    lines.push(body);
    lines.push("");
  }

  // Response
  const resp200 = operation.responses?.["200"];
  if (resp200) {
    const respSchema =
      resp200.content?.["application/json"]?.schema;
    if (respSchema) {
      // Show the data type from allOf[1].properties.data
      const allOfParts = respSchema.allOf || [respSchema];
      for (const part of allOfParts) {
        const resolved = part.$ref ? resolveRef(spec, part.$ref) : part;
        if (resolved?.properties?.data) {
          const dataProp = resolved.properties.data;
          const dataResolved = dataProp.$ref
            ? resolveRef(spec, dataProp.$ref)
            : dataProp;
          if (dataResolved?.type === "array" && dataResolved.items) {
            const itemRef = dataResolved.items.$ref;
            const typeName = itemRef
              ? itemRef.split("/").pop()
              : dataResolved.items.type || "object";
            lines.push(`**Response:** \`{ success: true, data: ${typeName}[] }\``);
          } else if (dataResolved?.$ref) {
            const typeName = dataResolved.$ref.split("/").pop();
            lines.push(`**Response:** \`{ success: true, data: ${typeName} }\``);
          } else {
            lines.push(`**Response:** \`{ success: true, data: ... }\``);
          }
          lines.push("");
        }
      }
    }
  }

  // Code samples (just Router)
  const samples = pickCodeSamples(operation["x-codeSamples"]);
  if (samples) {
    lines.push(samples);
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 4. Build page list in correct order
// ---------------------------------------------------------------------------

/**
 * Parse a navigation entry.  Can be a string (MDX page slug) or an
 * OpenAPI endpoint reference like "GET /api/{exchange}/fetchMarkets".
 */
function parseNavEntry(entry) {
  const m = entry.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(.+)$/i);
  if (m) return { type: "openapi", method: m[1].toLowerCase(), path: m[2] };
  return { type: "mdx", slug: entry };
}

/**
 * Walk the navigation tabs/groups and return an ordered list of
 * { type, tabName, groupName, ... } page descriptors.
 */
function walkNavigation(config) {
  const pages = [];
  for (const tab of config.navigation.tabs) {
    for (const group of tab.groups) {
      for (const entry of group.pages) {
        const parsed = parseNavEntry(entry);
        pages.push({
          ...parsed,
          tabName: tab.tab,
          groupName: group.group,
          openapi: group.openapi || null,
        });
      }
    }
  }
  return pages;
}

const allPages = walkNavigation(docsConfig);

// ---------------------------------------------------------------------------
// 5. Render each page
// ---------------------------------------------------------------------------

const indexEntries = []; // for llms.txt
const fullSections = []; // for llms-full.txt

let currentTab = "";
let currentGroup = "";

for (const page of allPages) {
  // Tab header
  if (page.tabName !== currentTab) {
    currentTab = page.tabName;
    fullSections.push(`\n---\n\n# ${page.tabName}\n`);
  }

  // Group header
  if (page.groupName !== currentGroup) {
    currentGroup = page.groupName;
    fullSections.push(`\n## ${page.groupName}\n`);
  }

  if (page.type === "mdx") {
    const mdxPath = path.join(DOCS_DIR, `${page.slug}.mdx`);
    if (!fs.existsSync(mdxPath)) {
      console.warn(`  skip: ${mdxPath} not found`);
      continue;
    }

    const raw = fs.readFileSync(mdxPath, "utf8");
    const title = extractTitle(raw) || page.slug;
    const desc = extractDescription(raw) || "";
    const body = demoteHeadings(stripJsx(stripFrontmatter(raw)));

    const url = `${BASE_URL}/${page.slug}`;
    indexEntries.push({ title, url, desc });

    // Prefix with a H3 heading (under the group H2)
    fullSections.push(`### ${title}\n`);
    fullSections.push(`Source: ${url}\n`);
    fullSections.push(body);
    fullSections.push("");
  } else if (page.type === "openapi") {
    // Resolve which spec to use
    const specFile = page.openapi || "api-reference/openapi.json";
    const spec = resolveOpenApiSpec(specFile);
    if (!spec) continue;

    const pathObj = spec.paths?.[page.path];
    if (!pathObj) {
      console.warn(`  skip: ${page.method} ${page.path} not in spec`);
      continue;
    }
    const operation = pathObj[page.method];
    if (!operation) {
      console.warn(`  skip: no ${page.method} on ${page.path}`);
      continue;
    }

    const title = operation.summary || operation.operationId;
    const desc = (operation.description || "").split("\n")[0].trim();
    const url = `${BASE_URL}/api-reference/${operation.operationId}`;

    indexEntries.push({ title, url, desc });

    const rendered = buildEndpointDoc(spec, page.method, page.path, operation);
    fullSections.push(rendered);
    fullSections.push("");
  }
}

// ---------------------------------------------------------------------------
// 6. Error codes & envelope reference (P2 — high-value missing content)
// ---------------------------------------------------------------------------
const errorCodesSection = `
---

# Reference

## Error Codes

Every error response follows the same envelope:

\`\`\`json
{
  "success": false,
  "error": {
    "message": "Human-readable description",
    "code": "ERROR_CODE",
    "retryable": false,
    "exchange": "polymarket"
  }
}
\`\`\`

| Code | HTTP Status | Retryable | Description |
| --- | --- | --- | --- |
| \`AUTHENTICATION_ERROR\` | 401 | No | Missing or invalid API key. |
| \`INVALID_API_KEY\` | 401 | No | Key unknown, revoked, or expired. |
| \`RATE_LIMIT_EXCEEDED\` | 429 | Yes | Per-minute rate limit hit. Retry after the window resets. |
| \`MONTHLY_QUOTA_EXCEEDED\` | 429 | No | Monthly request quota exhausted. |
| \`EXCHANGE_ERROR\` | 502 | Yes | Upstream venue returned an error. Check \`error.message\` for details. |
| \`EXCHANGE_TIMEOUT\` | 504 | Yes | Upstream venue did not respond in time. |
| \`MARKET_NOT_FOUND\` | 404 | No | The requested marketId/slug does not exist on this venue. |
| \`EVENT_NOT_FOUND\` | 404 | No | The requested eventId/slug does not exist on this venue. |
| \`ORDER_NOT_FOUND\` | 404 | No | The requested orderId does not exist. |
| \`INSUFFICIENT_BALANCE\` | 400 | No | Not enough funds to place the order. |
| \`INVALID_ORDER\` | 400 | No | Order parameters are invalid (bad price, amount, etc.). |
| \`VALIDATION_ERROR\` | 400 | No | Request body failed schema validation. |

## Rate Limits

| Endpoint | Per-minute | Per-month |
| --- | --- | --- |
| \`/v0/*\` (Router) | 60 | 25,000 |
| \`/api/*\` (Venue pass-through) | 60 | 25,000 |

## End-to-End Recipe: Place a Limit Order and Poll Until Filled

\`\`\`python
import pmxt, time

poly = pmxt.Polymarket(
    pmxt_api_key="pmxt_live_...",
    private_key="0x...",
    proxy_address="0x...",
    signature_type="gnosis-safe",
)

# 1. Find the market
markets = poly.fetch_markets(query="bitcoin 100k", limit=1)
market = markets[0]

# 2. Check execution price before placing
quote = poly.get_execution_price(
    market_id=market.market_id,
    outcome_id=market.yes.outcome_id,
    side="buy",
    amount=50,
)
print(f"Expected fill: {quote.price:.4f}, fully filled: {quote.fully_filled}")

# 3. Place a limit order
order = poly.create_order(
    market_id=market.market_id,
    outcome_id=market.yes.outcome_id,
    side="buy",
    type="limit",
    price=0.55,
    amount=50,
)
print(f"Order placed: {order.id}, status: {order.status}")

# 4. Poll until filled or cancelled
while order.status in ("pending", "open"):
    time.sleep(5)
    order = poly.fetch_order(order_id=order.id)
    print(f"  status: {order.status}, filled: {order.filled}/{order.amount}")

print(f"Final: {order.status}")
\`\`\`
`;

fullSections.push(errorCodesSection);

// ---------------------------------------------------------------------------
// 7. Write llms.txt (compact index)
// ---------------------------------------------------------------------------

const llmsTxtLines = [
  "# PMXT",
  "",
  "> One API for supported prediction markets. Unified data and hosted catalog search across Polymarket, Kalshi, Limitless, Smarkets, and 12 more venues. Trading where venues expose writes.",
  "",
  `Docs: ${BASE_URL}`,
  `API Base: https://api.pmxt.dev`,
  `Dashboard: https://pmxt.dev/dashboard`,
  `GitHub: https://github.com/pmxt-dev/pmxt`,
  "",
  "## Pages",
  "",
];

for (const entry of indexEntries) {
  const line = entry.desc
    ? `- [${entry.title}](${entry.url}): ${entry.desc}`
    : `- [${entry.title}](${entry.url})`;
  llmsTxtLines.push(line);
}

llmsTxtLines.push("");
llmsTxtLines.push(
  `## Full documentation\n\nSee [llms-full.txt](${BASE_URL}/llms-full.txt) for the complete documentation.`
);

fs.writeFileSync(
  path.join(DOCS_DIR, "llms.txt"),
  trimTrailingWhitespace(llmsTxtLines.join("\n")) + "\n",
  "utf8"
);
console.log(`wrote docs/llms.txt  (${llmsTxtLines.length} lines)`);

// ---------------------------------------------------------------------------
// 8. Write llms-full.txt
// ---------------------------------------------------------------------------

const header = [
  "# PMXT — Full Documentation",
  "",
  "> One API for supported prediction markets. Unified data and hosted catalog search across Polymarket, Kalshi, Limitless, Smarkets, and 12 more venues. Trading where venues expose writes.",
  "",
  `Docs: ${BASE_URL}`,
  `API Base: https://api.pmxt.dev`,
  "",
];

const fullTxt = trimTrailingWhitespace(
  header.join("\n") + "\n" + fullSections.join("\n")
) + "\n";

fs.writeFileSync(path.join(DOCS_DIR, "llms-full.txt"), fullTxt, "utf8");
const lineCount = fullTxt.split("\n").length;
console.log(`wrote docs/llms-full.txt  (${lineCount} lines)`);
