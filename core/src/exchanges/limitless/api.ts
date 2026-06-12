/**
 * Auto-generated from /Users/samueltinnerholm/Documents/GitHub/pmxt/core/specs/limitless/Limitless.yaml
 * Generated at: 2026-06-11T07:04:42.757Z
 * Do not edit manually -- run "npm run fetch:openapi" to regenerate.
 */
export const limitlessApiSpec = {
    "openapi": "3.0.0",
    "paths": {
        "/auth/signing-message": {
            "get": {
                "operationId": "AuthController_getSigningMessage",
                "parameters": [],
                "summary": "Get signing message",
                "tags": [
                    "Authentication"
                ]
            }
        },
        "/auth/verify-auth": {
            "get": {
                "operationId": "AuthController_verifyAuth",
                "parameters": [],
                "security": [
                    {
                        "limitless_session": []
                    }
                ],
                "summary": "Verify authentication",
                "tags": [
                    "Authentication"
                ]
            }
        },
        "/auth/login": {
            "post": {
                "operationId": "AuthController_login",
                "parameters": [
                    {
                        "name": "x-account",
                        "in": "header",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "x-signing-message",
                        "in": "header",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "x-signature",
                        "in": "header",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ],
                "summary": "User login",
                "tags": [
                    "Authentication"
                ]
            }
        },
        "/auth/logout": {
            "post": {
                "operationId": "AuthController_logout",
                "parameters": [],
                "security": [
                    {
                        "limitless_session": []
                    }
                ],
                "summary": "User logout",
                "tags": [
                    "Authentication"
                ]
            }
        },
        "/markets/active/{categoryId}": {
            "get": {
                "operationId": "MarketController_getActiveMarkets[0]",
                "parameters": [
                    {
                        "name": "page",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "limit",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "sortBy",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "tradeType",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "enum": [
                                "amm",
                                "clob",
                                "group"
                            ],
                            "type": "string"
                        }
                    },
                    {
                        "name": "automationType",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "enum": [
                                "manual",
                                "lumy",
                                "sports"
                            ],
                            "type": "string"
                        }
                    },
                    {
                        "name": "categoryId",
                        "required": false,
                        "in": "path",
                        "schema": {
                            "type": "number"
                        }
                    }
                ],
                "summary": "Browse Active Markets",
                "tags": [
                    "Markets"
                ]
            }
        },
        "/markets/active": {
            "get": {
                "operationId": "MarketController_getActiveMarkets[1]",
                "parameters": [
                    {
                        "name": "page",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "limit",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "sortBy",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "tradeType",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "enum": [
                                "amm",
                                "clob",
                                "group"
                            ],
                            "type": "string"
                        }
                    },
                    {
                        "name": "automationType",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "enum": [
                                "manual",
                                "lumy",
                                "sports"
                            ],
                            "type": "string"
                        }
                    },
                    {
                        "name": "categoryId",
                        "required": false,
                        "in": "path",
                        "schema": {
                            "type": "number"
                        }
                    }
                ],
                "summary": "Browse Active Markets",
                "tags": [
                    "Markets"
                ]
            }
        },
        "/markets/categories/count": {
            "get": {
                "operationId": "MarketController_getActiveMarketCountPerCategory",
                "parameters": [],
                "summary": "Get active market count per category",
                "tags": [
                    "Markets"
                ]
            }
        },
        "/markets/active/slugs": {
            "get": {
                "operationId": "MarketController_getActiveSlugs",
                "parameters": [],
                "summary": "Get active market slugs with metadata",
                "tags": [
                    "Markets"
                ]
            }
        },
        "/markets/{addressOrSlug}": {
            "get": {
                "operationId": "MarketController_find",
                "parameters": [
                    {
                        "name": "addressOrSlug",
                        "required": true,
                        "in": "path",
                        "schema": {}
                    }
                ],
                "summary": "Get Market Details",
                "tags": [
                    "Markets"
                ]
            }
        },
        "/markets/{slug}/get-feed-events": {
            "get": {
                "operationId": "MarketController_getFeedEvent",
                "parameters": [
                    {
                        "name": "page",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "limit",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "slug",
                        "required": false,
                        "in": "path",
                        "schema": {}
                    }
                ],
                "security": [
                    {
                        "bearer": []
                    }
                ],
                "summary": "Get feed events for a market",
                "tags": [
                    "Markets"
                ]
            }
        },
        "/markets/{slug}/historical-price": {
            "get": {
                "operationId": "MarketOrderbookController_getHistoricalPrice",
                "parameters": [
                    {
                        "name": "to",
                        "required": false,
                        "in": "query",
                        "schema": {}
                    },
                    {
                        "name": "from",
                        "required": false,
                        "in": "query",
                        "schema": {}
                    },
                    {
                        "name": "interval",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "enum": [
                                "1h",
                                "6h",
                                "1d",
                                "1w",
                                "1m",
                                "all"
                            ],
                            "type": "string"
                        }
                    },
                    {
                        "name": "slug",
                        "required": true,
                        "in": "path",
                        "schema": {}
                    }
                ],
                "summary": "Get Historical Prices",
                "tags": [
                    "Trading"
                ]
            }
        },
        "/markets/{slug}/orderbook": {
            "get": {
                "operationId": "MarketOrderbookController_getOrderbook",
                "parameters": [
                    {
                        "name": "slug",
                        "required": true,
                        "in": "path",
                        "schema": {}
                    }
                ],
                "summary": "Get Orderbook",
                "tags": [
                    "Trading"
                ]
            }
        },
        "/markets/{slug}/locked-balance": {
            "get": {
                "operationId": "MarketOrderbookController_getLockedBalance",
                "parameters": [
                    {
                        "name": "slug",
                        "required": true,
                        "in": "path",
                        "schema": {}
                    }
                ],
                "security": [
                    {
                        "limitless_session": []
                    }
                ],
                "summary": "Get Locked Balance",
                "tags": [
                    "Trading"
                ]
            }
        },
        "/markets/{slug}/user-orders": {
            "get": {
                "operationId": "MarketOrderbookController_getUserOrders",
                "parameters": [
                    {
                        "name": "statuses",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": [
                                    "LIVE",
                                    "MATCHED"
                                ]
                            }
                        }
                    },
                    {
                        "name": "limit",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "minimum": 1,
                            "type": "number"
                        }
                    },
                    {
                        "name": "slug",
                        "required": true,
                        "in": "path",
                        "schema": {}
                    }
                ],
                "security": [
                    {
                        "limitless_session": []
                    }
                ],
                "summary": "User Orders",
                "tags": [
                    "Trading"
                ]
            }
        },
        "/markets/{slug}/events": {
            "get": {
                "operationId": "MarketOrderbookController_getMarketEvents",
                "parameters": [
                    {
                        "name": "page",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "limit",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "slug",
                        "required": true,
                        "in": "path",
                        "schema": {}
                    }
                ],
                "summary": "Market Events",
                "tags": [
                    "Trading"
                ]
            }
        },
        "/markets/search": {
            "get": {
                "operationId": "MarketSearchController_search",
                "parameters": [
                    {
                        "name": "query",
                        "required": true,
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "limit",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "default": 10,
                            "type": "number"
                        }
                    },
                    {
                        "name": "page",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "default": 1,
                            "type": "number"
                        }
                    },
                    {
                        "name": "similarityThreshold",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "default": 0.5,
                            "type": "number"
                        }
                    }
                ],
                "summary": "Search for markets based on semantic similarity",
                "tags": [
                    "Markets"
                ]
            }
        },
        "/portfolio/trades": {
            "get": {
                "operationId": "PortfolioController_getTrades",
                "parameters": [],
                "security": [
                    {
                        "bearer": []
                    },
                    {
                        "limitless_session": []
                    }
                ],
                "summary": "Get Trades",
                "tags": [
                    "Portfolio"
                ]
            }
        },
        "/portfolio/positions": {
            "get": {
                "operationId": "PortfolioController_getPositions",
                "parameters": [],
                "security": [
                    {
                        "bearer": []
                    },
                    {
                        "limitless_session": []
                    }
                ],
                "summary": "Get Positions",
                "tags": [
                    "Portfolio"
                ]
            }
        },
        "/portfolio/pnl-chart": {
            "get": {
                "operationId": "PortfolioController_getPnlChart",
                "parameters": [
                    {
                        "name": "timeframe",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ],
                "security": [
                    {
                        "bearer": []
                    },
                    {
                        "limitless_session": []
                    }
                ],
                "summary": "Get portfolio PnL chart",
                "tags": [
                    "Portfolio"
                ]
            }
        },
        "/portfolio/history": {
            "get": {
                "operationId": "PortfolioController_getHistory",
                "parameters": [
                    {
                        "name": "page",
                        "required": true,
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "limit",
                        "required": true,
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "from",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "format": "date-time",
                            "type": "string"
                        }
                    },
                    {
                        "name": "to",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "format": "date-time",
                            "type": "string"
                        }
                    }
                ],
                "security": [
                    {
                        "bearer": []
                    },
                    {
                        "limitless_session": []
                    }
                ],
                "summary": "Get History",
                "tags": [
                    "Portfolio"
                ]
            }
        },
        "/portfolio/points": {
            "get": {
                "operationId": "PortfolioController_getPointsBreakdown",
                "parameters": [],
                "security": [
                    {
                        "bearer": []
                    },
                    {
                        "limitless_session": []
                    }
                ],
                "summary": "Get points breakdown",
                "tags": [
                    "Portfolio"
                ]
            }
        },
        "/portfolio/{account}/traded-volume": {
            "get": {
                "operationId": "PublicPortfolioController_tradedVolume",
                "parameters": [
                    {
                        "name": "account",
                        "required": true,
                        "in": "path",
                        "schema": {
                            "type": "string"
                        }
                    }
                ],
                "summary": "User Total Volume",
                "tags": [
                    "Public Portfolio"
                ]
            }
        },
        "/portfolio/{account}/positions": {
            "get": {
                "operationId": "PublicPortfolioController_getPositions",
                "parameters": [
                    {
                        "name": "account",
                        "required": true,
                        "in": "path",
                        "schema": {
                            "type": "string"
                        }
                    }
                ],
                "summary": "Get All User Positions",
                "tags": [
                    "Public Portfolio"
                ]
            }
        },
        "/portfolio/{account}/pnl-chart": {
            "get": {
                "operationId": "PublicPortfolioController_getPnlChart",
                "parameters": [
                    {
                        "name": "account",
                        "required": true,
                        "in": "path",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "timeframe",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ],
                "summary": "Get portfolio PnL chart (public)",
                "tags": [
                    "Public Portfolio"
                ]
            }
        },
        "/portfolio/trading/allowance": {
            "get": {
                "operationId": "TradingPortfolioController_getAllowance",
                "parameters": [
                    {
                        "name": "type",
                        "required": true,
                        "in": "query",
                        "schema": {
                            "enum": [
                                "clob",
                                "negrisk"
                            ],
                            "type": "string"
                        }
                    },
                    {
                        "name": "spender",
                        "required": false,
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ],
                "security": [
                    {
                        "bearer": []
                    },
                    {
                        "limitless_session": []
                    }
                ],
                "summary": "Get User Trading Allowance",
                "tags": [
                    "Portfolio"
                ]
            }
        },
        "/orders": {
            "post": {
                "operationId": "OrderController_createOrder",
                "parameters": [],
                "security": [
                    {
                        "limitless_session": []
                    }
                ],
                "summary": "Create Order",
                "tags": [
                    "Trading"
                ]
            }
        },
        "/orders/{orderId}": {
            "delete": {
                "operationId": "OrderController_cancelOrder",
                "parameters": [
                    {
                        "name": "orderId",
                        "required": true,
                        "in": "path",
                        "schema": {
                            "type": "string"
                        }
                    }
                ],
                "security": [
                    {
                        "bearer": []
                    }
                ],
                "summary": "Cancel Order",
                "tags": [
                    "Trading"
                ]
            }
        },
        "/orders/cancel-batch": {
            "post": {
                "operationId": "OrderController_cancelOrderBatch",
                "parameters": [],
                "security": [
                    {
                        "bearer": []
                    }
                ],
                "summary": "Cancel multiple orders in batch",
                "tags": [
                    "Trading"
                ]
            }
        },
        "/orders/all/{slug}": {
            "delete": {
                "operationId": "OrderController_cancelAllOrders",
                "parameters": [],
                "security": [
                    {
                        "bearer": []
                    }
                ],
                "summary": "Cancel all of a user's orders in a specific market",
                "tags": [
                    "Trading"
                ]
            }
        }
    },
    "info": {
        "title": "Limitless Exchange API",
        "version": "1.0",
        "contact": {
            "name": "API Support",
            "url": "https://limitless.exchange",
            "email": "hey@limitless.network"
        }
    },
    "tags": [
        {
            "name": "Authentication"
        },
        {
            "name": "Markets"
        },
        {
            "name": "Trading"
        },
        {
            "name": "Portfolio"
        }
    ],
    "servers": [
        {
            "url": "https://api.limitless.exchange"
        }
    ],
    "components": {
        "securitySchemes": {
            "cookie": {
                "type": "apiKey",
                "in": "cookie",
                "name": "limitless_session",
                "description": "Session authentication cookie obtained from /auth/login"
            },
            "bearer": {
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": "JWT token for API access (alternative to cookie auth)",
                "name": "Authorization",
                "type": "http",
                "in": "Header"
            }
        }
    }
};
