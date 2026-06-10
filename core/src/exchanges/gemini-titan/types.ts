// ----------------------------------------------------------------------------
// Raw Gemini Titan API response types
// These mirror exactly what the API returns -- no transformation.
// ----------------------------------------------------------------------------

export interface GeminiRawPrices {
    buy?: { yes?: string; no?: string };
    sell?: { yes?: string; no?: string };
    bestBid?: string;
    bestAsk?: string;
    lastTradePrice?: string;
}

export interface GeminiRawContract {
    id: string;
    label: string;
    abbreviatedName?: string;
    description?: string | Record<string, unknown>;
    ticker: string;
    instrumentSymbol: string;
    status: string;
    marketState: string;
    prices: GeminiRawPrices;
    totalShares?: string;
    color?: string;
    imageUrl?: string;
    createdAt?: string;
    expiryDate?: string;
    effectiveDate?: string;
    resolutionSide?: string | null;
    resolvedAt?: string | null;
    sortOrder?: number;
    strike?: Record<string, unknown>;
    source?: string;
    settlementValue?: string;
    termsAndConditionsUrl?: string;
}

export interface GeminiRawEvent {
    id: string;
    title: string;
    slug?: string;
    description?: string;
    imageUrl?: string;
    type: string;
    category?: string;
    series?: Record<string, any> | null;
    ticker: string;
    status: string;
    resolvedAt?: string | null;
    createdAt?: string;
    effectiveDate?: string;
    expiryDate?: string;
    contracts: GeminiRawContract[];
    volume?: string;
    volume24h?: string;
    liquidity?: string;
    tags?: string[];
    subcategory?: Record<string, unknown>;
    source?: string;
    settlement?: { value?: string };
    contractOrderbooks?: Record<string, GeminiRawOrderBook>;
}

export interface GeminiRawEventsResponse {
    data: GeminiRawEvent[];
    pagination: {
        limit: number;
        offset: number;
        total: number;
    };
}

export interface GeminiRawOrderBookLevel {
    price: string;
    size: string;
}

export interface GeminiRawOrderBook {
    bids: GeminiRawOrderBookLevel[];
    asks: GeminiRawOrderBookLevel[];
    timestamp?: number;
}

export interface GeminiRawContractMetadata {
    contractId?: string;
    contractName?: string;
    contractTicker?: string;
    eventTicker?: string;
    eventName?: string;
    category?: string;
    contractStatus?: string;
    imageUrl?: string;
    eventImageUrl?: string;
    eventType?: string;
    expiryDate?: string;
    resolvedAt?: string | null;
    resolutionSide?: string | null;
    description?: string;
    sortOrder?: number;
    parentEventTicker?: string;
    template?: string;
    color?: string;
    startTime?: string;
}

export interface GeminiRawOrder {
    orderId: number;
    hashOrderId?: string;
    clientOrderId?: string;
    globalOrderId?: string;
    status: string;
    symbol: string;
    side: string;
    outcome: string;
    orderType: string;
    quantity: string;
    filledQuantity: string;
    remainingQuantity: string;
    price: string;
    stopPrice?: string | null;
    avgExecutionPrice?: string | null;
    createdAt: string;
    updatedAt?: string;
    cancelledAt?: string | null;
    contractMetadata?: GeminiRawContractMetadata;
    trades?: GeminiRawTradeFill[];
}

export interface GeminiRawTradeFill {
    tradeId?: string;
    price?: string;
    quantity?: string;
    timestamp?: string;
}

export interface GeminiRawPosition {
    symbol: string;
    instrumentId?: number;
    totalQuantity: string;
    quantityOnHold?: string;
    avgPrice: string;
    outcome: string;
    contractMetadata?: GeminiRawContractMetadata;
    prices?: GeminiRawPrices;
    resolutionSide?: string | null;
    isAboveAutoStartThreshold?: boolean;
    isLive?: boolean;
    realizedPl?: string;
    marketValue?: string;
    unrealizedPnl?: string;
    unrealizedPct?: number;
}

export interface GeminiRawActiveOrdersResponse {
    orders: GeminiRawOrder[];
    pagination?: {
        limit: number;
        offset: number;
        count: number;
    };
}

export type GeminiRawOrderHistoryResponse = GeminiRawActiveOrdersResponse;

export interface GeminiRawPositionsResponse {
    positions: GeminiRawPosition[];
    total?: number;
}

export interface GeminiRawCategoriesResponse {
    categories: string[];
}

// ----------------------------------------------------------------------------
// WebSocket message types
// ----------------------------------------------------------------------------

export interface GeminiWsBookTickerData {
    u: number;
    E: number;
    s: string;
    b: string;
    B: string;
    a: string;
    A: string;
}

export interface GeminiWsDepthSnapshotData {
    lastUpdateId: number;
    bids: [string, string][];
    asks: [string, string][];
}

export interface GeminiWsDepthUpdateData {
    e: string;
    E: number;
    s: string;
    U: number;
    u: number;
    b: [string, string][];
    a: [string, string][];
}

export interface GeminiWsTradeData {
    E: number;
    s: string;
    t: number;
    p: string;
    q: string;
    m: boolean;
}

export interface GeminiWsOrderData {
    E: number;
    s: string;
    i: string;
    c: string;
    S: string;
    o: string;
    X: string;
    p: string;
    q: string;
    z: string;
    Z: string;
    L: string;
    t: string;
    r?: string;
    T: number;
    O: string;
}

export interface GeminiWsStreamMessage {
    stream: string;
    data: unknown;
}

export interface GeminiWsResponse {
    id: string | number;
    status: number;
    result?: unknown;
    error?: {
        code: number;
        msg: string;
    };
}
