/**
 * Auto-generated from /home/zihao/pmxt/core/specs/polymarket/Polymarket_Data_API.yaml
 * Generated at: 2026-05-10T23:00:51.410Z
 * Do not edit manually -- run "npm run fetch:openapi" to regenerate.
 */
export const polymarketDataSpec = {
    "openapi": "3.0.3",
    "info": {
        "title": "Polymarket Data API",
        "version": "1.0.0"
    },
    "servers": [
        {
            "url": "https://data-api.polymarket.com"
        }
    ],
    "security": [],
    "tags": [
        {
            "name": "Data API Status"
        },
        {
            "name": "Core"
        },
        {
            "name": "Builders"
        },
        {
            "name": "Misc"
        }
    ],
    "paths": {
        "/": {
            "get": {
                "tags": [
                    "Data API Status"
                ],
                "summary": "Data API Health check",
                "operationId": "getDataApiHealth"
            }
        },
        "/positions": {
            "get": {
                "tags": [
                    "Core"
                ],
                "summary": "Get current positions for a user",
                "parameters": [
                    {
                        "in": "query",
                        "name": "user",
                        "required": true,
                        "schema": {
                            "$ref": "#/components/schemas/Address"
                        }
                    },
                    {
                        "in": "query",
                        "name": "market",
                        "style": "form",
                        "explode": false,
                        "schema": {
                            "type": "array",
                            "items": {
                                "$ref": "#/components/schemas/Hash64"
                            }
                        }
                    },
                    {
                        "in": "query",
                        "name": "eventId",
                        "style": "form",
                        "explode": false,
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "integer",
                                "minimum": 1
                            }
                        }
                    },
                    {
                        "in": "query",
                        "name": "sizeThreshold",
                        "schema": {
                            "type": "number",
                            "default": 1,
                            "minimum": 0
                        }
                    },
                    {
                        "in": "query",
                        "name": "redeemable",
                        "schema": {
                            "type": "boolean",
                            "default": false
                        }
                    },
                    {
                        "in": "query",
                        "name": "mergeable",
                        "schema": {
                            "type": "boolean",
                            "default": false
                        }
                    },
                    {
                        "in": "query",
                        "name": "limit",
                        "schema": {
                            "type": "integer",
                            "default": 100,
                            "minimum": 0,
                            "maximum": 500
                        }
                    },
                    {
                        "in": "query",
                        "name": "offset",
                        "schema": {
                            "type": "integer",
                            "default": 0,
                            "minimum": 0,
                            "maximum": 10000
                        }
                    },
                    {
                        "in": "query",
                        "name": "sortBy",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "CURRENT",
                                "INITIAL",
                                "TOKENS",
                                "CASHPNL",
                                "PERCENTPNL",
                                "TITLE",
                                "RESOLVING",
                                "PRICE",
                                "AVGPRICE"
                            ],
                            "default": "TOKENS"
                        }
                    },
                    {
                        "in": "query",
                        "name": "sortDirection",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "ASC",
                                "DESC"
                            ],
                            "default": "DESC"
                        }
                    },
                    {
                        "in": "query",
                        "name": "title",
                        "schema": {
                            "type": "string",
                            "maxLength": 100
                        }
                    }
                ]
            }
        },
        "/v1/accounting/snapshot": {
            "get": {
                "tags": [
                    "Misc"
                ],
                "summary": "Download an accounting snapshot (ZIP of CSVs)",
                "parameters": [
                    {
                        "in": "query",
                        "name": "user",
                        "required": true,
                        "schema": {
                            "$ref": "#/components/schemas/Address"
                        }
                    }
                ]
            }
        },
        "/traded": {
            "get": {
                "tags": [
                    "Misc"
                ],
                "summary": "Get total markets a user has traded",
                "parameters": [
                    {
                        "in": "query",
                        "name": "user",
                        "required": true,
                        "schema": {
                            "$ref": "#/components/schemas/Address"
                        }
                    }
                ]
            }
        },
        "/oi": {
            "get": {
                "tags": [
                    "Misc"
                ],
                "summary": "Get open interest",
                "parameters": [
                    {
                        "in": "query",
                        "name": "market",
                        "style": "form",
                        "explode": false,
                        "schema": {
                            "type": "array",
                            "items": {
                                "$ref": "#/components/schemas/Hash64"
                            }
                        }
                    }
                ]
            }
        },
        "/live-volume": {
            "get": {
                "tags": [
                    "Misc"
                ],
                "summary": "Get live volume for an event",
                "parameters": [
                    {
                        "in": "query",
                        "name": "id",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "minimum": 1
                        }
                    }
                ]
            }
        },
        "/trades": {
            "get": {
                "tags": [
                    "Core"
                ],
                "summary": "Get trades for a user or markets",
                "parameters": [
                    {
                        "in": "query",
                        "name": "limit",
                        "schema": {
                            "type": "integer",
                            "default": 100,
                            "minimum": 0,
                            "maximum": 10000
                        }
                    },
                    {
                        "in": "query",
                        "name": "offset",
                        "schema": {
                            "type": "integer",
                            "default": 0,
                            "minimum": 0,
                            "maximum": 10000
                        }
                    },
                    {
                        "in": "query",
                        "name": "takerOnly",
                        "schema": {
                            "type": "boolean",
                            "default": true
                        }
                    },
                    {
                        "in": "query",
                        "name": "filterType",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "CASH",
                                "TOKENS"
                            ]
                        }
                    },
                    {
                        "in": "query",
                        "name": "filterAmount",
                        "schema": {
                            "type": "number",
                            "minimum": 0
                        }
                    },
                    {
                        "in": "query",
                        "name": "market",
                        "style": "form",
                        "explode": false,
                        "schema": {
                            "type": "array",
                            "items": {
                                "$ref": "#/components/schemas/Hash64"
                            }
                        }
                    },
                    {
                        "in": "query",
                        "name": "eventId",
                        "style": "form",
                        "explode": false,
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "integer",
                                "minimum": 1
                            }
                        }
                    },
                    {
                        "in": "query",
                        "name": "user",
                        "schema": {
                            "$ref": "#/components/schemas/Address"
                        }
                    },
                    {
                        "in": "query",
                        "name": "side",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "BUY",
                                "SELL"
                            ]
                        }
                    }
                ]
            }
        },
        "/activity": {
            "get": {
                "tags": [
                    "Core"
                ],
                "summary": "Get user activity",
                "parameters": [
                    {
                        "in": "query",
                        "name": "limit",
                        "schema": {
                            "type": "integer",
                            "default": 100,
                            "minimum": 0,
                            "maximum": 500
                        }
                    },
                    {
                        "in": "query",
                        "name": "offset",
                        "schema": {
                            "type": "integer",
                            "default": 0,
                            "minimum": 0,
                            "maximum": 10000
                        }
                    },
                    {
                        "in": "query",
                        "name": "user",
                        "required": true,
                        "schema": {
                            "$ref": "#/components/schemas/Address"
                        }
                    },
                    {
                        "in": "query",
                        "name": "market",
                        "style": "form",
                        "explode": false,
                        "schema": {
                            "type": "array",
                            "items": {
                                "$ref": "#/components/schemas/Hash64"
                            }
                        }
                    },
                    {
                        "in": "query",
                        "name": "eventId",
                        "style": "form",
                        "explode": false,
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "integer",
                                "minimum": 1
                            }
                        }
                    },
                    {
                        "in": "query",
                        "name": "type",
                        "style": "form",
                        "explode": false,
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": [
                                    "TRADE",
                                    "SPLIT",
                                    "MERGE",
                                    "REDEEM",
                                    "REWARD",
                                    "CONVERSION",
                                    "MAKER_REBATE"
                                ]
                            }
                        }
                    },
                    {
                        "in": "query",
                        "name": "start",
                        "schema": {
                            "type": "integer",
                            "minimum": 0
                        }
                    },
                    {
                        "in": "query",
                        "name": "end",
                        "schema": {
                            "type": "integer",
                            "minimum": 0
                        }
                    },
                    {
                        "in": "query",
                        "name": "sortBy",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "TIMESTAMP",
                                "TOKENS",
                                "CASH"
                            ],
                            "default": "TIMESTAMP"
                        }
                    },
                    {
                        "in": "query",
                        "name": "sortDirection",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "ASC",
                                "DESC"
                            ],
                            "default": "DESC"
                        }
                    },
                    {
                        "in": "query",
                        "name": "side",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "BUY",
                                "SELL"
                            ]
                        }
                    }
                ]
            }
        },
        "/holders": {
            "get": {
                "tags": [
                    "Core"
                ],
                "summary": "Get top holders for markets",
                "parameters": [
                    {
                        "in": "query",
                        "name": "limit",
                        "schema": {
                            "type": "integer",
                            "default": 20,
                            "minimum": 0,
                            "maximum": 20
                        }
                    },
                    {
                        "in": "query",
                        "name": "market",
                        "required": true,
                        "style": "form",
                        "explode": false,
                        "schema": {
                            "type": "array",
                            "items": {
                                "$ref": "#/components/schemas/Hash64"
                            }
                        }
                    },
                    {
                        "in": "query",
                        "name": "minBalance",
                        "schema": {
                            "type": "integer",
                            "default": 1,
                            "minimum": 0,
                            "maximum": 999999
                        }
                    }
                ]
            }
        },
        "/value": {
            "get": {
                "tags": [
                    "Core"
                ],
                "summary": "Get total value of a user's positions",
                "parameters": [
                    {
                        "in": "query",
                        "name": "user",
                        "required": true,
                        "schema": {
                            "$ref": "#/components/schemas/Address"
                        }
                    },
                    {
                        "in": "query",
                        "name": "market",
                        "style": "form",
                        "explode": false,
                        "schema": {
                            "type": "array",
                            "items": {
                                "$ref": "#/components/schemas/Hash64"
                            }
                        }
                    }
                ]
            }
        },
        "/closed-positions": {
            "get": {
                "tags": [
                    "Core"
                ],
                "summary": "Get closed positions for a user",
                "parameters": [
                    {
                        "in": "query",
                        "name": "user",
                        "required": true,
                        "schema": {
                            "$ref": "#/components/schemas/Address"
                        }
                    },
                    {
                        "in": "query",
                        "name": "market",
                        "style": "form",
                        "explode": false,
                        "schema": {
                            "type": "array",
                            "items": {
                                "$ref": "#/components/schemas/Hash64"
                            }
                        }
                    },
                    {
                        "in": "query",
                        "name": "title",
                        "schema": {
                            "type": "string",
                            "maxLength": 100
                        }
                    },
                    {
                        "in": "query",
                        "name": "eventId",
                        "style": "form",
                        "explode": false,
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "integer",
                                "minimum": 1
                            }
                        }
                    },
                    {
                        "in": "query",
                        "name": "limit",
                        "schema": {
                            "type": "integer",
                            "default": 10,
                            "minimum": 0,
                            "maximum": 50
                        }
                    },
                    {
                        "in": "query",
                        "name": "offset",
                        "schema": {
                            "type": "integer",
                            "default": 0,
                            "minimum": 0,
                            "maximum": 100000
                        }
                    },
                    {
                        "in": "query",
                        "name": "sortBy",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "REALIZEDPNL",
                                "TITLE",
                                "PRICE",
                                "AVGPRICE",
                                "TIMESTAMP"
                            ],
                            "default": "REALIZEDPNL"
                        }
                    },
                    {
                        "in": "query",
                        "name": "sortDirection",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "ASC",
                                "DESC"
                            ],
                            "default": "DESC"
                        }
                    }
                ]
            }
        },
        "/v1/market-positions": {
            "get": {
                "tags": [
                    "Core"
                ],
                "summary": "Get positions for a market",
                "parameters": [
                    {
                        "in": "query",
                        "name": "market",
                        "required": true,
                        "schema": {
                            "$ref": "#/components/schemas/Hash64"
                        }
                    },
                    {
                        "in": "query",
                        "name": "user",
                        "schema": {
                            "$ref": "#/components/schemas/Address"
                        }
                    },
                    {
                        "in": "query",
                        "name": "status",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "OPEN",
                                "CLOSED",
                                "ALL"
                            ],
                            "default": "ALL"
                        }
                    },
                    {
                        "in": "query",
                        "name": "sortBy",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "TOKENS",
                                "CASH_PNL",
                                "REALIZED_PNL",
                                "TOTAL_PNL"
                            ],
                            "default": "TOTAL_PNL"
                        }
                    },
                    {
                        "in": "query",
                        "name": "sortDirection",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "ASC",
                                "DESC"
                            ],
                            "default": "DESC"
                        }
                    },
                    {
                        "in": "query",
                        "name": "limit",
                        "schema": {
                            "type": "integer",
                            "default": 50,
                            "minimum": 0,
                            "maximum": 500
                        }
                    },
                    {
                        "in": "query",
                        "name": "offset",
                        "schema": {
                            "type": "integer",
                            "default": 0,
                            "minimum": 0,
                            "maximum": 10000
                        }
                    }
                ]
            }
        },
        "/v1/leaderboard": {
            "get": {
                "tags": [
                    "Core"
                ],
                "summary": "Get trader leaderboard rankings",
                "parameters": [
                    {
                        "in": "query",
                        "name": "category",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "OVERALL",
                                "POLITICS",
                                "SPORTS",
                                "CRYPTO",
                                "CULTURE",
                                "MENTIONS",
                                "WEATHER",
                                "ECONOMICS",
                                "TECH",
                                "FINANCE"
                            ],
                            "default": "OVERALL"
                        }
                    },
                    {
                        "in": "query",
                        "name": "timePeriod",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "DAY",
                                "WEEK",
                                "MONTH",
                                "ALL"
                            ],
                            "default": "DAY"
                        }
                    },
                    {
                        "in": "query",
                        "name": "orderBy",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "PNL",
                                "VOL"
                            ],
                            "default": "PNL"
                        }
                    },
                    {
                        "in": "query",
                        "name": "limit",
                        "schema": {
                            "type": "integer",
                            "default": 25,
                            "minimum": 1,
                            "maximum": 50
                        }
                    },
                    {
                        "in": "query",
                        "name": "offset",
                        "schema": {
                            "type": "integer",
                            "default": 0,
                            "minimum": 0,
                            "maximum": 1000
                        }
                    },
                    {
                        "in": "query",
                        "name": "user",
                        "schema": {
                            "$ref": "#/components/schemas/Address"
                        }
                    },
                    {
                        "in": "query",
                        "name": "userName",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/v1/builders/leaderboard": {
            "get": {
                "tags": [
                    "Builders"
                ],
                "summary": "Get aggregated builder leaderboard",
                "parameters": [
                    {
                        "in": "query",
                        "name": "timePeriod",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "DAY",
                                "WEEK",
                                "MONTH",
                                "ALL"
                            ],
                            "default": "DAY"
                        }
                    },
                    {
                        "in": "query",
                        "name": "limit",
                        "schema": null
                    }
                ]
            }
        }
    }
};
