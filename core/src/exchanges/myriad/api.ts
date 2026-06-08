/**
 * Auto-generated from /opt/data/repos/pmxt/.worktrees/hermes-42dac47d/core/specs/myriad/myriad.yaml
 * Generated at: 2026-06-05T12:40:10.188Z
 * Do not edit manually -- run "npm run fetch:openapi" to regenerate.
 */
export const myriadApiSpec = {
    "openapi": "3.0.3",
    "info": {
        "title": "Myriad Protocol API",
        "version": "2.0.2"
    },
    "servers": [
        {
            "url": "https://api-v2.myriadprotocol.com/"
        },
        {
            "url": "https://api-v2.staging.myriadprotocol.com/"
        }
    ],
    "components": {
        "securitySchemes": {
            "ApiKeyHeader": {
                "type": "apiKey",
                "in": "header",
                "name": "x-api-key"
            },
            "ApiKeyQuery": {
                "type": "apiKey",
                "in": "query",
                "name": "api_key"
            }
        }
    },
    "security": [
        {
            "ApiKeyHeader": []
        },
        {
            "ApiKeyQuery": []
        }
    ],
    "paths": {
        "/questions": {
            "get": {
                "summary": "List Questions",
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
                            "default": 20,
                            "maximum": 100
                        }
                    },
                    {
                        "name": "keyword",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "min_markets",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "max_markets",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        },
        "/questions/{id}": {
            "get": {
                "summary": "Get Question Details",
                "parameters": [
                    {
                        "name": "id",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        },
        "/markets": {
            "get": {
                "summary": "List Markets",
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
                            "default": 20
                        }
                    },
                    {
                        "name": "sort",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "volume",
                                "volume_24h",
                                "liquidity",
                                "expires_at",
                                "published_at",
                                "featured"
                            ],
                            "default": "volume"
                        }
                    },
                    {
                        "name": "order",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "asc",
                                "desc"
                            ],
                            "default": "desc"
                        }
                    },
                    {
                        "name": "network_id",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "state",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "open",
                                "closed",
                                "resolved",
                                "voided"
                            ]
                        }
                    },
                    {
                        "name": "trading_model",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "token_address",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "topics",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "keyword",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "ids",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "in_play",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "moneyline",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "min_duration",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "max_duration",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        },
        "/markets/{id}": {
            "get": {
                "summary": "Get Market Details",
                "parameters": [
                    {
                        "name": "id",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "network_id",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        },
        "/markets/{id}/events": {
            "get": {
                "summary": "Get Market Events",
                "parameters": [
                    {
                        "name": "id",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "network_id",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "page",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "since",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "until",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        },
        "/markets/{id}/referrals": {
            "get": {
                "summary": "Get Market Referrals",
                "parameters": [
                    {
                        "name": "id",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "network_id",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "page",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "since",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "until",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "code",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/markets/{id}/holders": {
            "get": {
                "summary": "Get Market Holders",
                "parameters": [
                    {
                        "name": "id",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "network_id",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "page",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        },
        "/markets/quote": {
            "post": {
                "summary": "Get Trade Quote"
            }
        },
        "/markets/quote_with_fee": {
            "post": {
                "summary": "Get Trade Quote with Frontend Fee"
            }
        },
        "/markets/claim": {
            "post": {
                "summary": "Get Claim Quote"
            }
        },
        "/users/{address}/events": {
            "get": {
                "summary": "Get User Events",
                "parameters": [
                    {
                        "name": "address",
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
                            "type": "integer"
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "market_id",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "market_slug",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "network_id",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "since",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "until",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        },
        "/users/{address}/referrals": {
            "get": {
                "summary": "Get User Referrals",
                "parameters": [
                    {
                        "name": "address",
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
                            "type": "integer"
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "market_id",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "market_slug",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "network_id",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "since",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "until",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "code",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/users/{address}/portfolio": {
            "get": {
                "summary": "Get User Portfolio",
                "parameters": [
                    {
                        "name": "address",
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
                            "type": "integer"
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "min_shares",
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "market_slug",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "market_id",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "network_id",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "token_address",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/users/{address}/markets": {
            "get": {
                "summary": "Get User Markets Portfolio",
                "parameters": [
                    {
                        "name": "address",
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
                            "type": "integer"
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "min_shares",
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "network_id",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "state",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "trading_model",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "token_address",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "topics",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "keyword",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "market_ids",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        }
    }
};
