/**
 * Auto-generated from /Users/samueltinnerholm/Documents/GitHub/pmxt/core/specs/polymarket/PolymarketClobAPI.yaml
 * Generated at: 2026-05-22T18:49:00.795Z
 * Do not edit manually -- run "npm run fetch:openapi" to regenerate.
 */
export const polymarketClobSpec = {
    "openapi": "3.0.3",
    "info": {
        "title": "Polymarket CLOB API",
        "version": "1.0.0",
        "contact": {
            "name": "Polymarket Support",
            "url": "https://polymarket.com"
        }
    },
    "servers": [
        {
            "url": "https://clob.polymarket.com"
        },
        {
            "url": "https://polymarket.com/api"
        }
    ],
    "components": {
        "securitySchemes": {
            "L1Auth": {
                "type": "apiKey",
                "in": "header",
                "name": "POLY_SIGNATURE",
                "description": "Level 1 Authentication using EIP-712 signature. \nRequires headers: POLY_ADDRESS, POLY_SIGNATURE, POLY_TIMESTAMP, POLY_NONCE.\n"
            },
            "L2Auth": {
                "type": "apiKey",
                "in": "header",
                "name": "POLY_API_KEY",
                "description": "Level 2 Authentication using API Credentials.\nRequires headers: POLY_ADDRESS, POLY_SIGNATURE, POLY_TIMESTAMP, POLY_API_KEY, POLY_PASSPHRASE.\n"
            }
        }
    },
    "paths": {
        "/book": {
            "get": {
                "tags": [
                    "Orderbook"
                ],
                "summary": "Get order book summary",
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
        "/books": {
            "post": {
                "tags": [
                    "Orderbook"
                ],
                "summary": "Get multiple order books summaries"
            }
        },
        "/price": {
            "get": {
                "tags": [
                    "Pricing"
                ],
                "summary": "Get market price",
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
                        "name": "side",
                        "in": "query",
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
        "/prices": {
            "get": {
                "tags": [
                    "Pricing"
                ],
                "summary": "Get multiple market prices"
            },
            "post": {
                "tags": [
                    "Pricing"
                ],
                "summary": "Get multiple market prices by request"
            }
        },
        "/midpoint": {
            "get": {
                "tags": [
                    "Pricing"
                ],
                "summary": "Get midpoint price",
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
        "/spreads": {
            "post": {
                "tags": [
                    "Spreads"
                ],
                "summary": "Get bid-ask spreads"
            }
        },
        "/prices-history": {
            "get": {
                "tags": [
                    "Pricing"
                ],
                "summary": "Get price history for a traded token",
                "parameters": [
                    {
                        "name": "market",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "startTs",
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "endTs",
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "interval",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "1m",
                                "1w",
                                "1d",
                                "6h",
                                "1h",
                                "max"
                            ]
                        }
                    },
                    {
                        "name": "fidelity",
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    }
                ]
            }
        },
        "/markets-by-token/{token_id}": {
            "get": {
                "tags": [
                    "Markets"
                ],
                "summary": "Get market by token",
                "parameters": [
                    {
                        "name": "token_id",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/auth/api-key": {
            "post": {
                "summary": "Create API Key",
                "tags": [
                    "Authentication"
                ],
                "security": [
                    {
                        "L1Auth": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/L1Headers"
                    }
                ]
            }
        },
        "/auth/derive-api-key": {
            "get": {
                "summary": "Derive API Key",
                "tags": [
                    "Authentication"
                ],
                "security": [
                    {
                        "L1Auth": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/L1Headers"
                    }
                ]
            }
        },
        "/order": {
            "post": {
                "summary": "Place Single Order",
                "tags": [
                    "Orders"
                ],
                "security": [
                    {
                        "L2Auth": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/L2Headers"
                    }
                ]
            },
            "delete": {
                "summary": "Cancel Single Order",
                "tags": [
                    "Orders"
                ],
                "security": [
                    {
                        "L2Auth": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/L2Headers"
                    }
                ]
            }
        },
        "/orders": {
            "post": {
                "summary": "Place Multiple Orders (Batch)",
                "tags": [
                    "Orders"
                ],
                "security": [
                    {
                        "L2Auth": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/L2Headers"
                    }
                ]
            },
            "delete": {
                "summary": "Cancel Multiple Orders",
                "tags": [
                    "Orders"
                ],
                "security": [
                    {
                        "L2Auth": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/L2Headers"
                    }
                ]
            }
        },
        "/cancel-all": {
            "delete": {
                "summary": "Cancel All Orders",
                "tags": [
                    "Orders"
                ],
                "security": [
                    {
                        "L2Auth": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/L2Headers"
                    }
                ]
            }
        },
        "/cancel-market-orders": {
            "delete": {
                "summary": "Cancel Market Orders",
                "tags": [
                    "Orders"
                ],
                "security": [
                    {
                        "L2Auth": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/L2Headers"
                    }
                ]
            }
        },
        "/data/order/{id}": {
            "get": {
                "summary": "Get Order",
                "tags": [
                    "Orders"
                ],
                "security": [
                    {
                        "L2Auth": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/L2Headers"
                    },
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
        "/data/orders": {
            "get": {
                "summary": "Get Active Orders",
                "tags": [
                    "Orders"
                ],
                "security": [
                    {
                        "L2Auth": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/L2Headers"
                    },
                    {
                        "name": "id",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "market",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "asset_id",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/data/trades": {
            "get": {
                "summary": "Get Trades",
                "tags": [
                    "Trades"
                ],
                "security": [
                    {
                        "L2Auth": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/L2Headers"
                    },
                    {
                        "name": "id",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "market",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "maker",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "taker",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "before",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "after",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/order-scoring": {
            "get": {
                "summary": "Check Order Reward Scoring",
                "tags": [
                    "Rewards"
                ],
                "security": [
                    {
                        "L2Auth": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/L2Headers"
                    },
                    {
                        "name": "orderId",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/orders-scoring": {
            "post": {
                "summary": "Check Multiple Orders Scoring",
                "tags": [
                    "Rewards"
                ],
                "security": [
                    {
                        "L2Auth": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/L2Headers"
                    }
                ]
            }
        },
        "/balance-allowance/update": {
            "get": {
                "operationId": "updateBalanceAllowance",
                "summary": "Update balance and allowance cache",
                "tags": [
                    "Balances"
                ],
                "security": [
                    {
                        "L2Auth": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/L2Headers"
                    }
                ]
            }
        },
        "/geoblock": {
            "get": {
                "operationId": "getGeoblock",
                "summary": "Check Geoblock Status",
                "tags": [
                    "System"
                ],
                "servers": [
                    {
                        "url": "https://polymarket.com/api"
                    }
                ]
            }
        }
    }
};
