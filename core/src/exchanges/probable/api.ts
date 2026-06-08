/**
 * Auto-generated from /opt/data/repos/pmxt/.worktrees/hermes-42dac47d/core/specs/probable/probable.yaml
 * Generated at: 2026-06-05T12:40:10.177Z
 * Do not edit manually -- run "npm run fetch:openapi" to regenerate.
 */
export const probableApiSpec = {
    "openapi": "3.0.0",
    "info": {
        "title": "Probable Markets API",
        "version": "1.0.0",
        "contact": {
            "name": "Probable Markets"
        }
    },
    "servers": [
        {
            "url": "https://api.probable.markets"
        },
        {
            "url": "https://market-api.probable.markets"
        }
    ],
    "tags": [
        {
            "name": "Authentication"
        },
        {
            "name": "Events"
        },
        {
            "name": "Markets"
        },
        {
            "name": "Search"
        },
        {
            "name": "Tags"
        },
        {
            "name": "Orders"
        },
        {
            "name": "Orderbook Data"
        },
        {
            "name": "Trades"
        },
        {
            "name": "User Data"
        }
    ],
    "components": {
        "securitySchemes": {
            "ProbAddress": {
                "type": "apiKey",
                "in": "header",
                "name": "prob_address",
                "description": "EOA address (Externally Owned Account)"
            },
            "ProbSignature": {
                "type": "apiKey",
                "in": "header",
                "name": "prob_signature",
                "description": "EIP-712 signature (L1) or HMAC signature (L2)"
            },
            "ProbTimestamp": {
                "type": "apiKey",
                "in": "header",
                "name": "prob_timestamp",
                "description": "Unix timestamp"
            },
            "ProbNonce": {
                "type": "apiKey",
                "in": "header",
                "name": "prob_nonce",
                "description": "Nonce from /auth/nonce (Required for L1)"
            },
            "ProbApiKey": {
                "type": "apiKey",
                "in": "header",
                "name": "prob_api_key",
                "description": "API Key (Required for L2)"
            },
            "ProbPassphrase": {
                "type": "apiKey",
                "in": "header",
                "name": "prob_passphrase",
                "description": "API Passphrase (Required for L2)"
            },
            "ProbAccountType": {
                "type": "apiKey",
                "in": "header",
                "name": "prob_account_type",
                "description": "Optional. Set to 'eoa' for EOA flow."
            }
        }
    },
    "paths": {
        "/public/api/v1/auth/nonce": {
            "get": {
                "tags": [
                    "Authentication"
                ],
                "summary": "Generate Nonce"
            }
        },
        "/public/api/v1/auth/login": {
            "post": {
                "tags": [
                    "Authentication"
                ],
                "summary": "Login"
            }
        },
        "/public/api/v1/auth/logout": {
            "post": {
                "tags": [
                    "Authentication"
                ],
                "summary": "Logout"
            }
        },
        "/public/api/v1/auth/api-key/{chainId}": {
            "parameters": [
                {
                    "in": "path",
                    "name": "chainId",
                    "required": true,
                    "schema": {
                        "type": "integer"
                    }
                }
            ],
            "post": {
                "tags": [
                    "Authentication"
                ],
                "summary": "Generate API Key",
                "security": [
                    {
                        "ProbAddress": [],
                        "ProbSignature": [],
                        "ProbTimestamp": [],
                        "ProbNonce": []
                    }
                ]
            },
            "get": {
                "tags": [
                    "Authentication"
                ],
                "summary": "Get API Key",
                "security": [
                    {
                        "ProbAddress": [],
                        "ProbSignature": [],
                        "ProbTimestamp": [],
                        "ProbNonce": []
                    }
                ]
            },
            "delete": {
                "tags": [
                    "Authentication"
                ],
                "summary": "Delete API Key",
                "security": [
                    {
                        "ProbAddress": [],
                        "ProbSignature": [],
                        "ProbTimestamp": [],
                        "ProbApiKey": [],
                        "ProbPassphrase": []
                    }
                ]
            }
        },
        "/public/api/v1/auth/verify/l1": {
            "post": {
                "tags": [
                    "Authentication"
                ],
                "summary": "Verify L1 Headers",
                "security": [
                    {
                        "ProbAddress": [],
                        "ProbSignature": [],
                        "ProbTimestamp": [],
                        "ProbNonce": []
                    }
                ]
            }
        },
        "/public/api/v1/auth/verify/l2": {
            "post": {
                "tags": [
                    "Authentication"
                ],
                "summary": "Verify L2 Headers",
                "security": [
                    {
                        "ProbAddress": [],
                        "ProbSignature": [],
                        "ProbTimestamp": [],
                        "ProbApiKey": [],
                        "ProbPassphrase": []
                    }
                ]
            }
        },
        "/public/api/v1/events/": {
            "get": {
                "tags": [
                    "Events"
                ],
                "summary": "List All Events",
                "parameters": [
                    {
                        "in": "query",
                        "name": "page",
                        "schema": {
                            "type": "integer",
                            "default": 1
                        }
                    },
                    {
                        "in": "query",
                        "name": "limit",
                        "schema": {
                            "type": "integer",
                            "default": 20
                        }
                    },
                    {
                        "in": "query",
                        "name": "status",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "active",
                                "closed",
                                "all"
                            ]
                        }
                    },
                    {
                        "in": "query",
                        "name": "tag_id",
                        "schema": {
                            "oneOf": [
                                {
                                    "type": "integer"
                                },
                                {
                                    "type": "array",
                                    "items": {
                                        "type": "integer"
                                    }
                                }
                            ]
                        }
                    },
                    {
                        "in": "query",
                        "name": "sort",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/public/api/v1/events/{id}": {
            "get": {
                "tags": [
                    "Events"
                ],
                "summary": "Get Event by ID",
                "parameters": [
                    {
                        "in": "path",
                        "name": "id",
                        "required": true,
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        },
        "/public/api/v1/events/slug/{slug}": {
            "get": {
                "tags": [
                    "Events"
                ],
                "summary": "Get Event by Slug",
                "parameters": [
                    {
                        "in": "path",
                        "name": "slug",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/public/api/v1/events/{id}/tags": {
            "get": {
                "tags": [
                    "Events"
                ],
                "summary": "Get Tags for Event",
                "parameters": [
                    {
                        "in": "path",
                        "name": "id",
                        "required": true,
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        },
        "/public/api/v1/markets/": {
            "get": {
                "tags": [
                    "Markets"
                ],
                "summary": "List All Markets",
                "parameters": [
                    {
                        "in": "query",
                        "name": "page",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "in": "query",
                        "name": "active",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "in": "query",
                        "name": "event_id",
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        },
        "/public/api/v1/markets/{id}": {
            "get": {
                "tags": [
                    "Markets"
                ],
                "summary": "Get Market by ID",
                "parameters": [
                    {
                        "in": "path",
                        "name": "id",
                        "required": true,
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        },
        "/public/api/v1/markets/polymarket/{polymarketId}": {
            "get": {
                "tags": [
                    "Markets"
                ],
                "summary": "Get Market by Polymarket ID",
                "parameters": [
                    {
                        "in": "path",
                        "name": "polymarketId",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/public/api/v1/markets/bsc/{bscQuestionId}": {
            "get": {
                "tags": [
                    "Markets"
                ],
                "summary": "Get Market by BSC Question ID",
                "parameters": [
                    {
                        "in": "path",
                        "name": "bscQuestionId",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/public/api/v1/public-search/": {
            "get": {
                "tags": [
                    "Search"
                ],
                "summary": "Search Events and Markets",
                "parameters": [
                    {
                        "in": "query",
                        "name": "q",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "in": "query",
                        "name": "page",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "in": "query",
                        "name": "events_tag",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "in": "query",
                        "name": "optimized",
                        "schema": {
                            "type": "boolean"
                        }
                    }
                ]
            }
        },
        "/public/api/v1/tags/": {
            "get": {
                "tags": [
                    "Tags"
                ],
                "summary": "List All Tags"
            }
        },
        "/public/api/v1/order/{chainId}": {
            "post": {
                "tags": [
                    "Orders"
                ],
                "summary": "Place Order",
                "parameters": [
                    {
                        "in": "path",
                        "name": "chainId",
                        "required": true,
                        "schema": {
                            "type": "integer"
                        }
                    }
                ],
                "security": [
                    {
                        "ProbAddress": [],
                        "ProbSignature": [],
                        "ProbTimestamp": [],
                        "ProbApiKey": [],
                        "ProbPassphrase": [],
                        "ProbAccountType": []
                    }
                ]
            }
        },
        "/public/api/v1/order/{chainId}/{orderId}": {
            "delete": {
                "tags": [
                    "Orders"
                ],
                "summary": "Cancel Order",
                "parameters": [
                    {
                        "in": "path",
                        "name": "chainId",
                        "required": true,
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "in": "path",
                        "name": "orderId",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "in": "query",
                        "name": "tokenId",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ],
                "security": [
                    {
                        "ProbAddress": [],
                        "ProbSignature": [],
                        "ProbTimestamp": [],
                        "ProbApiKey": [],
                        "ProbPassphrase": []
                    }
                ]
            }
        },
        "/public/api/v1/orders/{chainId}/{orderId}": {
            "get": {
                "tags": [
                    "Orders"
                ],
                "summary": "Get Order",
                "parameters": [
                    {
                        "in": "path",
                        "name": "chainId",
                        "required": true,
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "in": "path",
                        "name": "orderId",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "in": "query",
                        "name": "tokenId",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ],
                "security": [
                    {
                        "ProbAddress": [],
                        "ProbSignature": [],
                        "ProbTimestamp": [],
                        "ProbApiKey": [],
                        "ProbPassphrase": []
                    }
                ]
            }
        },
        "/public/api/v1/orders/{chainId}/open": {
            "get": {
                "tags": [
                    "Orders"
                ],
                "summary": "Get Open Orders",
                "parameters": [
                    {
                        "in": "path",
                        "name": "chainId",
                        "required": true,
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "in": "query",
                        "name": "limit",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "in": "query",
                        "name": "page",
                        "schema": {
                            "type": "integer"
                        }
                    }
                ],
                "security": [
                    {
                        "ProbAddress": [],
                        "ProbSignature": [],
                        "ProbTimestamp": [],
                        "ProbApiKey": [],
                        "ProbPassphrase": []
                    }
                ]
            }
        },
        "/public/api/v1/price": {
            "get": {
                "tags": [
                    "Orderbook Data"
                ],
                "summary": "Get Price",
                "parameters": [
                    {
                        "in": "query",
                        "name": "token_id",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "in": "query",
                        "name": "side",
                        "required": true,
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
        "/public/api/v1/prices": {
            "post": {
                "tags": [
                    "Orderbook Data"
                ],
                "summary": "Get Prices (Batch)"
            }
        },
        "/public/api/v1/midpoint": {
            "get": {
                "tags": [
                    "Orderbook Data"
                ],
                "summary": "Get Midpoint",
                "parameters": [
                    {
                        "in": "query",
                        "name": "token_id",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/public/api/v1/book": {
            "get": {
                "tags": [
                    "Orderbook Data"
                ],
                "summary": "Get Order Book",
                "parameters": [
                    {
                        "in": "query",
                        "name": "token_id",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/public/api/v1/prices-history": {
            "get": {
                "tags": [
                    "Orderbook Data"
                ],
                "summary": "Get Price History",
                "parameters": [
                    {
                        "in": "query",
                        "name": "market",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "in": "query",
                        "name": "interval",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "max",
                                "1m",
                                "1h",
                                "6h",
                                "1d",
                                "1w"
                            ]
                        }
                    },
                    {
                        "in": "query",
                        "name": "startTs",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "in": "query",
                        "name": "endTs",
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        },
        "/public/api/v1/trade/{chainId}": {
            "get": {
                "tags": [
                    "Trades"
                ],
                "summary": "Get Trades (Authenticated)",
                "parameters": [
                    {
                        "in": "path",
                        "name": "chainId",
                        "required": true,
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "in": "query",
                        "name": "tokenId",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "in": "query",
                        "name": "limit",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "in": "query",
                        "name": "next_cursor",
                        "schema": {
                            "type": "string"
                        }
                    }
                ],
                "security": [
                    {
                        "ProbAddress": [],
                        "ProbSignature": [],
                        "ProbTimestamp": [],
                        "ProbApiKey": [],
                        "ProbPassphrase": []
                    }
                ]
            }
        },
        "/public/api/v1/trades": {
            "get": {
                "tags": [
                    "Trades"
                ],
                "summary": "Get Public Trades",
                "parameters": [
                    {
                        "in": "query",
                        "name": "user",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "in": "query",
                        "name": "limit",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "in": "query",
                        "name": "side",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/public/api/v1/activity": {
            "get": {
                "tags": [
                    "User Data"
                ],
                "summary": "User Activity",
                "parameters": [
                    {
                        "in": "query",
                        "name": "user",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "in": "query",
                        "name": "limit",
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        },
        "/public/api/v1/position/current": {
            "get": {
                "tags": [
                    "User Data"
                ],
                "summary": "Current Position",
                "parameters": [
                    {
                        "in": "query",
                        "name": "user",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "in": "query",
                        "name": "eventId",
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        },
        "/public/api/v1/pnl": {
            "get": {
                "tags": [
                    "User Data"
                ],
                "summary": "Profit and Loss",
                "parameters": [
                    {
                        "in": "query",
                        "name": "user_address",
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
