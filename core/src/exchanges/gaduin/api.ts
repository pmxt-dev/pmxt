/**
 * Auto-generated from core/specs/gaduin/gaduin.yaml
 * Generated at: 2026-11-12T10:11:15.647Z
 * Do not edit manually -- run "npm run fetch:openapi" to regenerate.
 */
export const gaduinApiSpec = {
    "openapi": "3.1.0",
    "info": {
        "title": "GADUIN Public Read API",
        "version": "1.0.0"
    },
    "servers": [
        {
            "url": "https://gaduin.com/api/v1"
        }
    ],
    "security": [
        {
            "bearerAuth": []
        }
    ],
    "paths": {
        "/flights/discovery": {
            "get": {
                "operationId": "GetFlightsDiscovery",
                "summary": "Browse recurring flights with sufficient recent observed history.",
                "parameters": [
                    {
                        "name": "cursor",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "after",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "pattern": "^[A-Z]{3}:[1-9][0-9]{0,4}[A-Z]?$"
                        }
                    },
                    {
                        "name": "bucket",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 63
                        }
                    },
                    {
                        "name": "airline",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "numbers",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/markets": {
            "get": {
                "operationId": "GetMarkets",
                "summary": "List markets.",
                "parameters": [
                    {
                        "name": "status",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "DRAFT",
                                "OPEN",
                                "CLOSED",
                                "SETTLED",
                                "CANCELLED",
                                "DISPUTED"
                            ]
                        }
                    },
                    {
                        "name": "category",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "FLIGHT",
                                "TRAIN",
                                "SHIP"
                            ]
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 1000,
                            "default": 100
                        }
                    },
                    {
                        "name": "offset",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 10000
                        }
                    },
                    {
                        "name": "close_after",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "format": "date-time"
                        }
                    },
                    {
                        "name": "tradable",
                        "in": "query",
                        "schema": {
                            "type": "boolean",
                            "default": false
                        }
                    },
                    {
                        "name": "sort",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "close_asc",
                                "close_desc"
                            ],
                            "default": "close_asc"
                        }
                    }
                ]
            }
        },
        "/markets/{id}": {
            "get": {
                "operationId": "GetMarket",
                "summary": "Get a single market; a settled market carries settled_on, the rule and times it settled on.",
                "parameters": [
                    {
                        "name": "id",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/markets/{id}/activity": {
            "get": {
                "operationId": "GetMarketActivity",
                "summary": "Recent trades for a market, newest first (anonymous: no trader is named).",
                "parameters": [
                    {
                        "name": "id",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string",
                            "format": "uuid"
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "minimum": 1
                        }
                    }
                ]
            }
        },
        "/markets/{id}/price-history": {
            "get": {
                "operationId": "GetMarketPriceHistory",
                "summary": "Historical price snapshots for a market.",
                "parameters": [
                    {
                        "name": "id",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string",
                            "format": "uuid"
                        }
                    }
                ]
            }
        },
        "/markets/config": {
            "get": {
                "operationId": "GetMarketsConfig",
                "summary": "Trading bounds (min/max trade amount)."
            }
        },
        "/healthz": {
            "get": {
                "operationId": "GetHealthz",
                "summary": "Liveness probe.",
                "security": []
            }
        }
    },
    "components": {
        "securitySchemes": {
            "bearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
                "description": "Exchange a read-only API key at POST /api/v1/auth/token; see /auth.md."
            }
        }
    }
};
