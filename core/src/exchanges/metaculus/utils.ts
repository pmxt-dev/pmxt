import { UnifiedMarket, MarketOutcome } from "../../types";
import { addBinaryOutcomes } from "../../utils/market-utils";
import { buildSourceMetadata } from "../../utils/metadata";

// Raw Metaculus Post fields already promoted to first-class UnifiedMarket columns
// — excluded from sourceMetadata so we capture only what the unified shape drops.
const METACULUS_PROMOTED_MARKET_KEYS = [
    // identity / slug
    'id', 'slug', 'url_title',
    // title
    'title',
    // description lives inside question / group_of_questions — those are excluded below
    // resolution timing -> resolutionDate
    'scheduled_resolve_time', 'scheduled_close_time', 'actual_close_time',
    // forecaster count -> liquidity / openInterest
    'nr_forecasters',
    // child objects whose fields are promoted individually
    'question', 'group_of_questions',
    // project sub-tree fields that map to image / category / tags / eventId
    'projects',
    // status -> mapStatus
    'status',
] as const;

// Raw Metaculus Post fields already promoted to first-class UnifiedEvent columns.
export const METACULUS_PROMOTED_EVENT_KEYS = [
    'id', 'slug', 'url_title',
    'title',
    'question', 'group_of_questions',
    'projects',
    'status',
] as const;

/**
 * Base URL passed to parseOpenApiSpec to override the spec's servers[0].url.
 * The generated api.ts already has "https://www.metaculus.com/api" as its server URL,
 * so this constant must match exactly -- do NOT add a trailing slash or path suffix.
 * Paths in the spec (/posts/, /posts/{postId}/) are appended directly by BaseExchange.
 */
export const DEFAULT_BASE_URL = "https://www.metaculus.com/api";

/**
 * Map a Metaculus post `status` to pmxt unified status.
 *
 * Metaculus post statuses: "open", "closed", "resolved", "upcoming"
 */
export function mapStatus(status: string): "active" | "closed" {
    switch ((status ?? "").toLowerCase()) {
        case "open":
        case "upcoming":
            return "active";
        default:
            return "closed";
    }
}

/**
 * Extract the community prediction probability from a question object.
 *
 * For all question types the recency-weighted aggregation exposes a `centers`
 * array where `centers[0]` is the median / central estimate, already normalised
 * to [0, 1] by the API.
 *
 * Accepts either a Post (reads from post.question) or a bare Question object.
 *
 * @returns A number in [0, 1], or 0.5 if no prediction is available.
 */
function extractCommunityProbability(questionOrPost: any): number {
    // Support both post.question and bare question objects
    const question = questionOrPost?.question ?? questionOrPost;
    const latest = question?.aggregations?.recency_weighted?.latest;

    if (!latest) return 0.5;

    const centers: number[] | undefined = latest.centers;
    if (Array.isArray(centers) && centers.length > 0 && typeof centers[0] === "number") {
        return Math.max(0, Math.min(1, centers[0]));
    }

    // Fallback: some binary posts expose forecast_values[0] as the Yes probability
    const fv: number[] | undefined = latest.forecast_values;
    if (Array.isArray(fv) && fv.length > 0 && typeof fv[0] === "number") {
        return Math.max(0, Math.min(1, fv[0]));
    }

    return 0.5;
}

/**
 * Build the tag list from a Post's project associations.
 * Combines taxonomy tags and categories so consumers can filter by either.
 */
function buildTags(post: any): string[] {
    const tags: string[] = [];
    const projects = post?.projects ?? {};

    // Explicit tags
    const tagList: any[] = projects.tag ?? [];
    for (const t of tagList) {
        const label = typeof t === "string" ? t : t?.name;
        if (label && !tags.includes(label)) tags.push(label);
    }

    // Categories (useful for broad filtering)
    const catList: any[] = projects.category ?? [];
    for (const c of catList) {
        const label = typeof c === "string" ? c : c?.name;
        if (label && !tags.includes(label)) tags.push(label);
    }

    // Question type as a tag for easy filtering
    const qType = post?.question?.type;
    if (qType && !tags.includes(qType)) tags.push(qType);

    return tags;
}

/**
 * Build outcomes for a Metaculus question.
 *
 * OutcomeId format uses the **question ID** (not the post ID) so that
 * `createOrder` can extract the correct ID for the forecast API.
 *
 * - Binary:          `<questionId>-YES` / `<questionId>-NO`
 * - Multiple-choice: `<questionId>-<categoryIndex>`
 * - Continuous:      `<questionId>-HIGHER` / `<questionId>-LOWER` (read-only, not tradeable)
 *
 * Raw aggregation data is exposed in each outcome's `metadata` so consumers
 * can use it directly.
 *
 * @param question  The Metaculus Question object (not the Post wrapper).
 * @param postId    The parent post ID, used as the marketId on each outcome.
 */
function buildOutcomes(question: any, postId: string, medianProb: number): MarketOutcome[] {
    const questionId = String(question?.id ?? postId);
    const type = (question?.type || "binary").toLowerCase();

    const latest = question?.aggregations?.recency_weighted?.latest ?? null;
    const sharedMeta = {
        question_type: type,
        question_id: Number(questionId),
        aggregations: latest,
        resolution: question?.resolution ?? null,
        scaling: question?.scaling ?? null,
    };

    // Multiple choice: one outcome per option, each independently forecastable
    if (type === "multiple_choice") {
        const options: any[] = question?.options ?? [];
        if (options.length > 0) {
            const histogram: number[] | undefined = latest?.histogram ?? undefined;
            return options.map((opt: any, idx: number) => {
                const label =
                    typeof opt === "string"
                        ? opt
                        : opt?.label ?? opt?.value ?? `Option ${idx + 1}`;
                const price =
                    Array.isArray(histogram) && typeof histogram[idx] === "number"
                        ? Math.max(0, Math.min(1, histogram[idx]))
                        : 1 / Math.max(options.length, 1);
                return {
                    outcomeId: `${questionId}-${idx}`,
                    marketId: postId,
                    label,
                    price,
                    priceChange24h: 0,
                    metadata: { ...sharedMeta, choice_index: idx },
                } as MarketOutcome;
            });
        }
    }

    // Binary: Yes/No outcomes
    if (type === "binary") {
        return [
            {
                outcomeId: `${questionId}-YES`,
                marketId: postId,
                label: "Yes",
                price: medianProb,
                priceChange24h: 0,
                metadata: sharedMeta,
            },
            {
                outcomeId: `${questionId}-NO`,
                marketId: postId,
                label: "No",
                price: Math.max(0, Math.min(1, 1 - medianProb)),
                priceChange24h: 0,
                metadata: sharedMeta,
            },
        ];
    }

    // Continuous / numeric / date -- not tradeable via createOrder.
    // Displayed as synthetic Higher/Lower for read-only price indication.
    return [
        {
            outcomeId: `${questionId}-HIGHER`,
            marketId: postId,
            label: "Higher",
            price: medianProb,
            priceChange24h: 0,
            metadata: sharedMeta,
        },
        {
            outcomeId: `${questionId}-LOWER`,
            marketId: postId,
            label: "Lower",
            price: Math.max(0, Math.min(1, 1 - medianProb)),
            priceChange24h: 0,
            metadata: sharedMeta,
        },
    ];
}

/**
 * Convert a raw Metaculus Post (v3 /api/posts/ response item) into a
 * `UnifiedMarket`.
 *
 * Returns `null` for group-of-questions posts -- callers should use
 * {@link expandPost} instead, which handles both single and group posts.
 *
 * @param post      Raw post object from the Metaculus API.
 * @param eventId   Optional parent event ID (tournament slug) to override
 *                  the value derived from post.projects.tournament.
 */
export function mapMarketToUnified(post: any, eventId?: string, groupPostId?: number): UnifiedMarket | null {
    if (!post || !post.id) return null;

    // Group-of-questions posts have no top-level question -- they must be
    // expanded into individual sub-question markets via expandPost().
    if (post.group_of_questions && !post.question) return null;

    const postId = String(post.id);
    const question = post.question ?? {};
    const medianProb = extractCommunityProbability(post);
    const outcomes = buildOutcomes(question, postId, medianProb);

    // Resolution date -- prefer scheduled_resolve_time, fall back to close time
    const resolveDateStr =
        post.scheduled_resolve_time ??
        question.scheduled_resolve_time ??
        post.scheduled_close_time ??
        post.actual_close_time;
    const resolutionDate = resolveDateStr
        ? new Date(resolveDateStr)
        : new Date("2099-01-01T00:00:00Z");

    const tags = buildTags(post);

    // Primary category label
    const categoryList: any[] = post?.projects?.category ?? [];
    const category =
        categoryList.length > 0
            ? typeof categoryList[0] === "string"
                ? categoryList[0]
                : categoryList[0]?.name
            : undefined;

    // Forecaster count -- proxy for liquidity (no monetary values on Metaculus)
    const forecastCount = Number(
        post.nr_forecasters ?? question.nr_forecasters ?? 0,
    );

    // Derive eventId from first tournament slug if not explicitly provided
    const tournamentList: any[] = post?.projects?.tournament ?? [];
    const derivedEventId =
        tournamentList.length > 0
            ? typeof tournamentList[0] === "string"
                ? tournamentList[0]
                : tournamentList[0]?.slug
            : undefined;

    const resolvedEventId = eventId ?? derivedEventId;

    const um: UnifiedMarket = {
        marketId: postId,
        eventId: resolvedEventId,
        title: post.title ?? question.title ?? "",
        description:
            question.description ??
            question.resolution_criteria ??
            "",
        slug: post.slug ?? post.url_title ?? undefined,
        outcomes,
        resolutionDate,
        volume24h: 0,           // Metaculus has no monetary volume
        volume: 0,
        liquidity: forecastCount,   // re-purposed as forecaster count
        openInterest: forecastCount,
        url: `https://www.metaculus.com/questions/${postId}/`,
        image: post.projects?.default_project?.header_image ?? undefined,
        category,
        tags,
        sourceMetadata: buildSourceMetadata(
            post as unknown as Record<string, unknown>,
            METACULUS_PROMOTED_MARKET_KEYS,
            groupPostId !== undefined ? { group_post_id: groupPostId } : undefined,
        ),
    };

    addBinaryOutcomes(um);
    return um;
}

/**
 * Expand a group-of-questions post into individual sub-question markets.
 *
 * Each sub-question becomes its own `UnifiedMarket` with:
 * - `marketId` = sub-question's post_id (for API lookups via GetPost)
 * - outcomeIds based on the sub-question's question.id (for forecast API)
 * - `eventId` = parent post ID (the group acts as a container)
 * - `metadata.groupPostId` on each outcome for traceability
 *
 * @param post     A group-of-questions post (post.group_of_questions.questions[]).
 * @param eventId  Optional override for the eventId field.
 */
function mapGroupPostToMarkets(post: any, eventId?: string): UnifiedMarket[] {
    const group = post.group_of_questions;
    if (!group?.questions?.length) return [];

    const parentPostId = String(post.id);
    const groupEventId = eventId ?? parentPostId;

    const markets: UnifiedMarket[] = [];
    for (const subQuestion of group.questions) {
        // Build a synthetic post that mapMarketToUnified can process.
        // Use the sub-question's post_id as the post id if available,
        // otherwise fall back to the sub-question's own id.
        const syntheticPost = {
            id: subQuestion.post_id ?? subQuestion.id,
            title: subQuestion.title ?? subQuestion.label ?? post.title,
            question: subQuestion,
            // Inherit metadata from the parent post
            slug: post.slug,
            url_title: post.url_title,
            projects: post.projects,
            nr_forecasters: subQuestion.nr_forecasters ?? post.nr_forecasters,
            scheduled_resolve_time: subQuestion.scheduled_resolve_time ?? post.scheduled_resolve_time,
            scheduled_close_time: subQuestion.scheduled_close_time ?? post.scheduled_close_time,
            actual_close_time: subQuestion.actual_close_time ?? post.actual_close_time,
            status: post.status,
        };

        const market = mapMarketToUnified(syntheticPost, groupEventId, Number(parentPostId));
        if (market) {
            // Tag each outcome with the parent group post ID for traceability
            for (const outcome of market.outcomes) {
                if (outcome.metadata) {
                    (outcome.metadata as any).groupPostId = Number(parentPostId);
                }
            }
            markets.push(market);
        }
    }

    return markets;
}

/**
 * Convert a raw Metaculus post into one or more `UnifiedMarket` objects.
 *
 * Handles all post types:
 * - Single-question posts (binary, multiple-choice, continuous) -> 1 market
 * - Group-of-questions posts -> N markets (one per sub-question)
 *
 * Use this instead of calling `mapMarketToUnified` directly when processing
 * feed results, since a single API post can yield multiple tradeable markets.
 *
 * @param post     Raw post object from the Metaculus API.
 * @param eventId  Optional parent event ID (tournament slug).
 */
export function expandPost(post: any, eventId?: string): UnifiedMarket[] {
    if (!post || !post.id) return [];

    // Group posts: expand each sub-question into its own market
    if (post.group_of_questions && !post.question) {
        return mapGroupPostToMarkets(post, eventId);
    }

    // Single-question post
    const market = mapMarketToUnified(post, eventId);
    return market ? [market] : [];
}
