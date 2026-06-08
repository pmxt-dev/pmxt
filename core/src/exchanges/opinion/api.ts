/**
 * Auto-generated from /opt/data/repos/pmxt/.worktrees/hermes-42dac47d/core/specs/opinion/opinion-openapi.yaml
 * Generated at: 2026-06-05T12:40:10.198Z
 * Do not edit manually -- run "npm run fetch:openapi" to regenerate.
 */
export const opinionApiSpec = {
    "openapi": "3.0.3",
    "info": {
        "title": "OPINION Prediction Market OpenAPI",
        "version": "1.0.0"
    },
    "servers": [
        {
            "url": "https://proxy.opinion.trade:8443/openapi"
        }
    ],
    "security": [
        {
            "ApiKeyAuth": []
        }
    ],
    "tags": [
        {
            "name": "Market"
        },
        {
            "name": "Token"
        },
        {
            "name": "QuoteToken"
        },
        {
            "name": "Trade"
        },
        {
            "name": "Position"
        },
        {
            "name": "Order"
        }
    ],
    "components": {
        "securitySchemes": {
            "ApiKeyAuth": {
                "type": "apiKey",
                "in": "header",
                "name": "apikey",
                "description": "API key for authentication"
            }
        }
    },
    "paths": {
        "/market": {
            "get": {
                "tags": [
                    "Market"
                ],
                "summary": "Get market list",
                "operationId": "getMarketList",
                "parameters": [
                    {
                        "name": "page",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "default": 1,
                            "minimum": 1
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "default": 10,
                            "maximum": 20
                        }
                    },
                    {
                        "name": "status",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "activated",
                                "resolved"
                            ]
                        }
                    },
                    {
                        "name": "marketType",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "default": 0,
                            "enum": [
                                0,
                                1,
                                2
                            ]
                        }
                    },
                    {
                        "name": "sortBy",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "enum": [
                                1,
                                2,
                                3,
                                4,
                                5,
                                6,
                                7,
                                8
                            ]
                        }
                    },
                    {
                        "name": "chainId",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/market/{marketId}": {
            "get": {
                "tags": [
                    "Market"
                ],
                "summary": "Get binary market detail",
                "operationId": "getBinaryMarketDetail",
                "parameters": [
                    {
                        "name": "marketId",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    }
                ]
            }
        },
        "/market/slug/{slug}": {
            "get": {
                "tags": [
                    "Market"
                ],
                "summary": "Get market detail by slug",
                "operationId": "getMarketDetailBySlug",
                "parameters": [
                    {
                        "name": "slug",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/market/categorical/{marketId}": {
            "get": {
                "tags": [
                    "Market"
                ],
                "summary": "Get categorical market detail",
                "operationId": "getCategoricalMarketDetail",
                "parameters": [
                    {
                        "name": "marketId",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    }
                ]
            }
        },
        "/token/latest-price": {
            "get": {
                "tags": [
                    "Token"
                ],
                "summary": "Get latest price",
                "operationId": "getLatestPrice",
                "parameters": [
                    {
                        "name": "token_id",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/token/orderbook": {
            "get": {
                "tags": [
                    "Token"
                ],
                "summary": "Get orderbook",
                "operationId": "getOrderbook",
                "parameters": [
                    {
                        "name": "token_id",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/token/price-history": {
            "get": {
                "tags": [
                    "Token"
                ],
                "summary": "Get price history",
                "operationId": "getPriceHistory",
                "parameters": [
                    {
                        "name": "token_id",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "interval",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "default": "1d",
                            "enum": [
                                "1m",
                                "1h",
                                "1d",
                                "1w",
                                "max"
                            ]
                        }
                    },
                    {
                        "name": "start_at",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    },
                    {
                        "name": "end_at",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    }
                ]
            }
        },
        "/quoteToken": {
            "get": {
                "tags": [
                    "QuoteToken"
                ],
                "summary": "Get quote token list",
                "operationId": "getQuoteTokenList",
                "parameters": [
                    {
                        "name": "page",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "default": 1
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "default": 10
                        }
                    },
                    {
                        "name": "quoteTokenName",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "chainId",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/trade/user/{walletAddress}": {
            "get": {
                "tags": [
                    "Trade"
                ],
                "summary": "Get user trades",
                "operationId": "getUserTrades",
                "parameters": [
                    {
                        "name": "walletAddress",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "page",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "default": 1,
                            "minimum": 1
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "default": 10,
                            "maximum": 20
                        }
                    },
                    {
                        "name": "marketId",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    },
                    {
                        "name": "chainId",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/positions/user/{walletAddress}": {
            "get": {
                "tags": [
                    "Position"
                ],
                "summary": "Get user positions",
                "operationId": "getUserPositions",
                "parameters": [
                    {
                        "name": "walletAddress",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "page",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "default": 1,
                            "minimum": 1
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "default": 10,
                            "maximum": 20
                        }
                    },
                    {
                        "name": "marketId",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    },
                    {
                        "name": "chainId",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/order": {
            "get": {
                "tags": [
                    "Order"
                ],
                "summary": "Get orders",
                "operationId": "getOrderList",
                "parameters": [
                    {
                        "name": "page",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "default": 1,
                            "minimum": 1
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "default": 10,
                            "maximum": 20
                        }
                    },
                    {
                        "name": "marketId",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    },
                    {
                        "name": "chainId",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "status",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/order/{orderId}": {
            "get": {
                "tags": [
                    "Order"
                ],
                "summary": "Get order detail",
                "operationId": "getOrderDetail",
                "parameters": [
                    {
                        "name": "orderId",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        }
    }
};
