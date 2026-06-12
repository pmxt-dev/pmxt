/**
 * Auto-generated from /Users/samueltinnerholm/Documents/GitHub/pmxt/core/specs/kalshi/Kalshi.yaml
 * Generated at: 2026-06-11T07:04:42.739Z
 * Do not edit manually -- run "npm run fetch:openapi" to regenerate.
 */
export const kalshiApiSpec = {
    "openapi": "3.0.0",
    "info": {
        "title": "Kalshi Trade API Manual Endpoints",
        "version": "3.7.0"
    },
    "servers": [
        {
            "url": "https://external-api.kalshi.com/trade-api/v2"
        },
        {
            "url": "https://external-api.demo.kalshi.co/trade-api/v2"
        }
    ],
    "paths": {
        "/historical/cutoff": {
            "get": {
                "operationId": "GetHistoricalCutoff",
                "summary": "Get Historical Cutoff Timestamps",
                "tags": [
                    "historical"
                ]
            }
        },
        "/historical/markets/{ticker}/candlesticks": {
            "get": {
                "operationId": "GetMarketCandlesticksHistorical",
                "summary": "Get Historical Market Candlesticks",
                "tags": [
                    "historical"
                ],
                "parameters": [
                    {
                        "name": "ticker",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "start_ts",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    },
                    {
                        "name": "end_ts",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    },
                    {
                        "name": "period_interval",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "enum": [
                                1,
                                60,
                                1440
                            ]
                        },
                        "x-oapi-codegen-extra-tags": {
                            "validate": "required,oneof=1 60 1440"
                        }
                    }
                ]
            }
        },
        "/historical/fills": {
            "get": {
                "operationId": "GetFillsHistorical",
                "summary": "Get Historical Fills",
                "tags": [
                    "historical"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/TickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MaxTsQuery"
                    },
                    {
                        "$ref": "#/components/parameters/LimitQuery"
                    },
                    {
                        "$ref": "#/components/parameters/CursorQuery"
                    }
                ]
            }
        },
        "/historical/orders": {
            "get": {
                "operationId": "GetHistoricalOrders",
                "summary": "Get Historical Orders",
                "tags": [
                    "historical"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/TickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MaxTsQuery"
                    },
                    {
                        "$ref": "#/components/parameters/LimitQuery"
                    },
                    {
                        "$ref": "#/components/parameters/CursorQuery"
                    }
                ]
            }
        },
        "/historical/markets": {
            "get": {
                "operationId": "GetHistoricalMarkets",
                "summary": "Get Historical Markets",
                "tags": [
                    "historical"
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/MarketLimitQuery"
                    },
                    {
                        "$ref": "#/components/parameters/CursorQuery"
                    },
                    {
                        "$ref": "#/components/parameters/TickersQuery"
                    },
                    {
                        "$ref": "#/components/parameters/EventTickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MveHistoricalFilterQuery"
                    }
                ]
            }
        },
        "/historical/markets/{ticker}": {
            "get": {
                "operationId": "GetHistoricalMarket",
                "summary": "Get Historical Market",
                "tags": [
                    "historical"
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/TickerPath"
                    }
                ]
            }
        },
        "/exchange/status": {
            "get": {
                "operationId": "GetExchangeStatus",
                "summary": "Get Exchange Status",
                "tags": [
                    "exchange"
                ]
            }
        },
        "/exchange/announcements": {
            "get": {
                "operationId": "GetExchangeAnnouncements",
                "summary": "Get Exchange Announcements",
                "tags": [
                    "exchange"
                ]
            }
        },
        "/series/fee_changes": {
            "get": {
                "operationId": "GetSeriesFeeChanges",
                "summary": "Get Series Fee Changes",
                "tags": [
                    "exchange"
                ],
                "parameters": [
                    {
                        "name": "series_ticker",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string"
                        },
                        "x-go-type-skip-optional-pointer": true
                    },
                    {
                        "name": "show_historical",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean",
                            "default": false
                        },
                        "x-go-type-skip-optional-pointer": true
                    }
                ]
            }
        },
        "/exchange/schedule": {
            "get": {
                "operationId": "GetExchangeSchedule",
                "summary": "Get Exchange Schedule",
                "tags": [
                    "exchange"
                ]
            }
        },
        "/exchange/user_data_timestamp": {
            "get": {
                "operationId": "GetUserDataTimestamp",
                "summary": "Get User Data Timestamp",
                "tags": [
                    "exchange"
                ]
            }
        },
        "/portfolio/orders": {
            "get": {
                "operationId": "GetOrders",
                "summary": "Get Orders",
                "tags": [
                    "orders"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/TickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/EventTickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MinTsQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MaxTsQuery"
                    },
                    {
                        "$ref": "#/components/parameters/StatusQuery"
                    },
                    {
                        "$ref": "#/components/parameters/LimitQuery"
                    },
                    {
                        "$ref": "#/components/parameters/CursorQuery"
                    },
                    {
                        "$ref": "#/components/parameters/SubaccountQuery"
                    }
                ]
            },
            "post": {
                "operationId": "CreateOrder",
                "summary": "Create Order",
                "tags": [
                    "orders"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ]
            }
        },
        "/portfolio/orders/{order_id}": {
            "get": {
                "operationId": "GetOrder",
                "summary": "Get Order",
                "tags": [
                    "orders"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/OrderIdPath"
                    }
                ]
            },
            "delete": {
                "operationId": "CancelOrder",
                "summary": "Cancel Order",
                "tags": [
                    "orders"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/OrderIdPath"
                    },
                    {
                        "$ref": "#/components/parameters/SubaccountQuery"
                    }
                ]
            }
        },
        "/portfolio/orders/batched": {
            "post": {
                "operationId": "BatchCreateOrders",
                "summary": "Batch Create Orders",
                "tags": [
                    "orders"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ]
            },
            "delete": {
                "operationId": "BatchCancelOrders",
                "summary": "Batch Cancel Orders",
                "tags": [
                    "orders"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ]
            }
        },
        "/portfolio/orders/{order_id}/amend": {
            "post": {
                "operationId": "AmendOrder",
                "summary": "Amend Order",
                "tags": [
                    "orders"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/OrderIdPath"
                    }
                ]
            }
        },
        "/portfolio/orders/{order_id}/decrease": {
            "post": {
                "operationId": "DecreaseOrder",
                "summary": "Decrease Order",
                "tags": [
                    "orders"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/OrderIdPath"
                    }
                ]
            }
        },
        "/portfolio/orders/queue_positions": {
            "get": {
                "operationId": "GetOrderQueuePositions",
                "summary": "Get Queue Positions for Orders",
                "tags": [
                    "orders"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "name": "market_tickers",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "event_ticker",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "$ref": "#/components/parameters/SubaccountQuery"
                    }
                ]
            }
        },
        "/portfolio/orders/{order_id}/queue_position": {
            "get": {
                "operationId": "GetOrderQueuePosition",
                "summary": "Get Order Queue Position",
                "tags": [
                    "orders"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/OrderIdPath"
                    }
                ]
            }
        },
        "/portfolio/order_groups": {
            "get": {
                "operationId": "GetOrderGroups",
                "summary": "Get Order Groups",
                "tags": [
                    "order-groups"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/SubaccountQuery"
                    }
                ]
            }
        },
        "/portfolio/order_groups/create": {
            "post": {
                "operationId": "CreateOrderGroup",
                "summary": "Create Order Group",
                "tags": [
                    "order-groups"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ]
            }
        },
        "/portfolio/order_groups/{order_group_id}": {
            "get": {
                "operationId": "GetOrderGroup",
                "summary": "Get Order Group",
                "tags": [
                    "order-groups"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/OrderGroupIdPath"
                    },
                    {
                        "$ref": "#/components/parameters/SubaccountQuery"
                    }
                ]
            },
            "delete": {
                "operationId": "DeleteOrderGroup",
                "summary": "Delete Order Group",
                "tags": [
                    "order-groups"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/OrderGroupIdPath"
                    },
                    {
                        "$ref": "#/components/parameters/SubaccountQuery"
                    }
                ]
            }
        },
        "/portfolio/order_groups/{order_group_id}/reset": {
            "put": {
                "operationId": "ResetOrderGroup",
                "summary": "Reset Order Group",
                "tags": [
                    "order-groups"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/OrderGroupIdPath"
                    },
                    {
                        "$ref": "#/components/parameters/SubaccountQuery"
                    }
                ]
            }
        },
        "/portfolio/order_groups/{order_group_id}/trigger": {
            "put": {
                "operationId": "TriggerOrderGroup",
                "summary": "Trigger Order Group",
                "tags": [
                    "order-groups"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/OrderGroupIdPath"
                    },
                    {
                        "$ref": "#/components/parameters/SubaccountQuery"
                    }
                ]
            }
        },
        "/portfolio/order_groups/{order_group_id}/limit": {
            "put": {
                "operationId": "UpdateOrderGroupLimit",
                "summary": "Update Order Group Limit",
                "tags": [
                    "order-groups"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/OrderGroupIdPath"
                    }
                ]
            }
        },
        "/portfolio/balance": {
            "get": {
                "operationId": "GetBalance",
                "summary": "Get Balance",
                "tags": [
                    "portfolio"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "name": "subaccount",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        },
        "/portfolio/subaccounts": {
            "post": {
                "operationId": "CreateSubaccount",
                "summary": "Create Subaccount",
                "tags": [
                    "portfolio"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ]
            }
        },
        "/portfolio/subaccounts/transfer": {
            "post": {
                "operationId": "ApplySubaccountTransfer",
                "summary": "Transfer Between Subaccounts",
                "tags": [
                    "portfolio"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ]
            }
        },
        "/portfolio/subaccounts/balances": {
            "get": {
                "operationId": "GetSubaccountBalances",
                "summary": "Get All Subaccount Balances",
                "tags": [
                    "portfolio"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ]
            }
        },
        "/portfolio/subaccounts/transfers": {
            "get": {
                "operationId": "GetSubaccountTransfers",
                "summary": "Get Subaccount Transfers",
                "tags": [
                    "portfolio"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/LimitQuery"
                    },
                    {
                        "$ref": "#/components/parameters/CursorQuery"
                    }
                ]
            }
        },
        "/portfolio/positions": {
            "get": {
                "operationId": "GetPositions",
                "summary": "Get Positions",
                "tags": [
                    "portfolio"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/PositionsCursorQuery"
                    },
                    {
                        "$ref": "#/components/parameters/PositionsLimitQuery"
                    },
                    {
                        "$ref": "#/components/parameters/CountFilterQuery"
                    },
                    {
                        "$ref": "#/components/parameters/TickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/EventTickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/SubaccountQuery"
                    }
                ]
            }
        },
        "/portfolio/settlements": {
            "get": {
                "operationId": "GetSettlements",
                "summary": "Get Settlements",
                "tags": [
                    "portfolio"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/LimitQuery"
                    },
                    {
                        "$ref": "#/components/parameters/CursorQuery"
                    },
                    {
                        "$ref": "#/components/parameters/TickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/EventTickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MinTsQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MaxTsQuery"
                    },
                    {
                        "$ref": "#/components/parameters/SubaccountQuery"
                    }
                ]
            }
        },
        "/portfolio/summary/total_resting_order_value": {
            "get": {
                "operationId": "GetPortfolioRestingOrderTotalValue",
                "summary": "Get Total Resting Order Value",
                "tags": [
                    "portfolio"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ]
            }
        },
        "/portfolio/fills": {
            "get": {
                "operationId": "GetFills",
                "summary": "Get Fills",
                "tags": [
                    "portfolio"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/TickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/OrderIdQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MinTsQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MaxTsQuery"
                    },
                    {
                        "$ref": "#/components/parameters/LimitQuery"
                    },
                    {
                        "$ref": "#/components/parameters/CursorQuery"
                    },
                    {
                        "$ref": "#/components/parameters/SubaccountQuery"
                    }
                ]
            }
        },
        "/api_keys": {
            "get": {
                "operationId": "GetApiKeys",
                "summary": "Get API Keys",
                "tags": [
                    "api-keys"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ]
            },
            "post": {
                "operationId": "CreateApiKey",
                "summary": "Create API Key",
                "tags": [
                    "api-keys"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ]
            }
        },
        "/api_keys/generate": {
            "post": {
                "operationId": "GenerateApiKey",
                "summary": "Generate API Key",
                "tags": [
                    "api-keys"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ]
            }
        },
        "/api_keys/{api_key}": {
            "delete": {
                "operationId": "DeleteApiKey",
                "summary": "Delete API Key",
                "tags": [
                    "api-keys"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "name": "api_key",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/search/tags_by_categories": {
            "get": {
                "operationId": "GetTagsForSeriesCategories",
                "summary": "Get Tags for Series Categories",
                "tags": [
                    "search"
                ]
            }
        },
        "/search/filters_by_sport": {
            "get": {
                "operationId": "GetFiltersForSports",
                "summary": "Get Filters for Sports",
                "tags": [
                    "search"
                ]
            }
        },
        "/account/limits": {
            "get": {
                "operationId": "GetAccountApiLimits",
                "summary": "Get Account API Limits",
                "tags": [
                    "account"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ]
            }
        },
        "/series/{series_ticker}/markets/{ticker}/candlesticks": {
            "get": {
                "operationId": "GetMarketCandlesticks",
                "summary": "Get Market Candlesticks",
                "tags": [
                    "market"
                ],
                "parameters": [
                    {
                        "name": "series_ticker",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "ticker",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "start_ts",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    },
                    {
                        "name": "end_ts",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    },
                    {
                        "name": "period_interval",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "enum": [
                                1,
                                60,
                                1440
                            ]
                        },
                        "x-oapi-codegen-extra-tags": {
                            "validate": "required,oneof=1 60 1440"
                        }
                    },
                    {
                        "name": "include_latest_before_start",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean",
                            "default": false
                        }
                    }
                ]
            }
        },
        "/markets/trades": {
            "get": {
                "operationId": "GetTrades",
                "summary": "Get Trades",
                "tags": [
                    "market"
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/MarketLimitQuery"
                    },
                    {
                        "$ref": "#/components/parameters/CursorQuery"
                    },
                    {
                        "$ref": "#/components/parameters/TickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MinTsQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MaxTsQuery"
                    }
                ]
            }
        },
        "/series/{series_ticker}/events/{ticker}/candlesticks": {
            "get": {
                "operationId": "GetMarketCandlesticksByEvent",
                "summary": "Get Event Candlesticks",
                "tags": [
                    "events"
                ],
                "parameters": [
                    {
                        "name": "ticker",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "series_ticker",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "start_ts",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        },
                        "x-oapi-codegen-extra-tags": {
                            "validate": "required"
                        }
                    },
                    {
                        "name": "end_ts",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        },
                        "x-oapi-codegen-extra-tags": {
                            "validate": "required"
                        }
                    },
                    {
                        "name": "period_interval",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "format": "int32",
                            "enum": [
                                1,
                                60,
                                1440
                            ]
                        },
                        "x-oapi-codegen-extra-tags": {
                            "validate": "required,oneof=1 60 1440"
                        }
                    }
                ]
            }
        },
        "/events": {
            "get": {
                "operationId": "GetEvents",
                "summary": "Get Events",
                "tags": [
                    "events"
                ],
                "parameters": [
                    {
                        "name": "limit",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 200,
                            "default": 200
                        }
                    },
                    {
                        "name": "cursor",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "with_nested_markets",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean",
                            "default": false
                        },
                        "x-go-type-skip-optional-pointer": true
                    },
                    {
                        "name": "with_milestones",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean",
                            "default": false
                        },
                        "x-go-type-skip-optional-pointer": true
                    },
                    {
                        "name": "status",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string",
                            "enum": [
                                "open",
                                "closed",
                                "settled"
                            ]
                        }
                    },
                    {
                        "$ref": "#/components/parameters/SeriesTickerQuery"
                    },
                    {
                        "name": "min_close_ts",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    }
                ]
            }
        },
        "/events/multivariate": {
            "get": {
                "operationId": "GetMultivariateEvents",
                "summary": "Get Multivariate Events",
                "tags": [
                    "events"
                ],
                "parameters": [
                    {
                        "name": "limit",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 200,
                            "default": 100
                        }
                    },
                    {
                        "name": "cursor",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "$ref": "#/components/parameters/SeriesTickerQuery"
                    },
                    {
                        "name": "collection_ticker",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "with_nested_markets",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean",
                            "default": false
                        }
                    }
                ]
            }
        },
        "/events/{event_ticker}": {
            "get": {
                "operationId": "GetEvent",
                "summary": "Get Event",
                "tags": [
                    "events"
                ],
                "parameters": [
                    {
                        "name": "event_ticker",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "with_nested_markets",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean",
                            "default": false,
                            "x-go-type-skip-optional-pointer": true
                        }
                    }
                ]
            }
        },
        "/events/{event_ticker}/metadata": {
            "get": {
                "operationId": "GetEventMetadata",
                "summary": "Get Event Metadata",
                "tags": [
                    "events"
                ],
                "parameters": [
                    {
                        "name": "event_ticker",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/series/{series_ticker}/events/{ticker}/forecast_percentile_history": {
            "get": {
                "operationId": "GetEventForecastPercentilesHistory",
                "summary": "Get Event Forecast Percentile History",
                "tags": [
                    "events"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "name": "ticker",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "series_ticker",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "percentiles",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "integer",
                                "format": "int32",
                                "minimum": 0,
                                "maximum": 10000
                            },
                            "maxItems": 10
                        },
                        "style": "form",
                        "explode": true
                    },
                    {
                        "name": "start_ts",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    },
                    {
                        "name": "end_ts",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    },
                    {
                        "name": "period_interval",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "format": "int32",
                            "enum": [
                                0,
                                1,
                                60,
                                1440
                            ]
                        }
                    }
                ]
            }
        },
        "/live_data/{type}/milestone/{milestone_id}": {
            "get": {
                "operationId": "GetLiveData",
                "summary": "Get Live Data",
                "tags": [
                    "live-data"
                ],
                "parameters": [
                    {
                        "name": "type",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "milestone_id",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/live_data/batch": {
            "get": {
                "operationId": "GetLiveDatas",
                "summary": "Get Multiple Live Data",
                "tags": [
                    "live-data"
                ],
                "parameters": [
                    {
                        "name": "milestone_ids",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            },
                            "maxItems": 100
                        },
                        "style": "form",
                        "explode": true
                    }
                ]
            }
        },
        "/incentive_programs": {
            "get": {
                "operationId": "GetIncentivePrograms",
                "summary": "Get Incentives",
                "tags": [
                    "incentive-programs"
                ],
                "parameters": [
                    {
                        "name": "status",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string",
                            "enum": [
                                "all",
                                "active",
                                "upcoming",
                                "closed",
                                "paid_out"
                            ]
                        }
                    },
                    {
                        "name": "type",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string",
                            "enum": [
                                "all",
                                "liquidity",
                                "volume"
                            ]
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 10000
                        }
                    },
                    {
                        "name": "cursor",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/fcm/orders": {
            "get": {
                "operationId": "GetFCMOrders",
                "summary": "Get FCM Orders",
                "tags": [
                    "fcm"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "name": "subtrader_id",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "$ref": "#/components/parameters/CursorQuery"
                    },
                    {
                        "$ref": "#/components/parameters/EventTickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/TickerQuery"
                    },
                    {
                        "name": "min_ts",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    },
                    {
                        "name": "max_ts",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    },
                    {
                        "name": "status",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "resting",
                                "canceled",
                                "executed"
                            ]
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 1000
                        }
                    }
                ]
            }
        },
        "/fcm/positions": {
            "get": {
                "operationId": "GetFCMPositions",
                "summary": "Get FCM Positions",
                "tags": [
                    "fcm"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "name": "subtrader_id",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "ticker",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "x-go-type-skip-optional-pointer": true
                        }
                    },
                    {
                        "name": "event_ticker",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "x-go-type-skip-optional-pointer": true
                        }
                    },
                    {
                        "name": "count_filter",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "settlement_status",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "all",
                                "unsettled",
                                "settled"
                            ]
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 1000
                        }
                    },
                    {
                        "name": "cursor",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/structured_targets": {
            "get": {
                "operationId": "GetStructuredTargets",
                "summary": "Get Structured Targets",
                "tags": [
                    "structured-targets"
                ],
                "parameters": [
                    {
                        "name": "type",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "competition",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "page_size",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "integer",
                            "format": "int32",
                            "minimum": 1,
                            "maximum": 2000,
                            "default": 100
                        }
                    },
                    {
                        "name": "cursor",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/structured_targets/{structured_target_id}": {
            "get": {
                "operationId": "GetStructuredTarget",
                "summary": "Get Structured Target",
                "tags": [
                    "structured-targets"
                ],
                "parameters": [
                    {
                        "name": "structured_target_id",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/markets/{ticker}/orderbook": {
            "get": {
                "operationId": "GetMarketOrderbook",
                "summary": "Get Market Orderbook",
                "tags": [
                    "market"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/TickerPath"
                    },
                    {
                        "name": "depth",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "integer",
                            "minimum": 0,
                            "maximum": 100,
                            "default": 0
                        },
                        "x-oapi-codegen-extra-tags": {
                            "validate": "omitempty,min=0,max=100"
                        }
                    }
                ]
            }
        },
        "/markets/orderbooks": {
            "get": {
                "operationId": "GetMarketOrderbooks",
                "summary": "Get Multiple Market Orderbooks",
                "tags": [
                    "market"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "name": "tickers",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "maxLength": 200
                            },
                            "minItems": 1,
                            "maxItems": 100
                        },
                        "style": "form",
                        "explode": true,
                        "x-oapi-codegen-extra-tags": {
                            "validate": "required,min=1,max=100,dive,max=200"
                        }
                    }
                ]
            }
        },
        "/milestones/{milestone_id}": {
            "get": {
                "operationId": "GetMilestone",
                "summary": "Get Milestone",
                "tags": [
                    "milestone"
                ],
                "parameters": [
                    {
                        "name": "milestone_id",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/milestones": {
            "get": {
                "operationId": "GetMilestones",
                "summary": "Get Milestones",
                "tags": [
                    "milestone"
                ],
                "parameters": [
                    {
                        "name": "limit",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 500
                        }
                    },
                    {
                        "name": "minimum_start_date",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string",
                            "format": "date-time"
                        }
                    },
                    {
                        "name": "category",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "competition",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "source_id",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "type",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "related_event_ticker",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "cursor",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/communications/id": {
            "get": {
                "operationId": "GetCommunicationsID",
                "summary": "Get Communications ID",
                "tags": [
                    "communications"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ]
            }
        },
        "/communications/rfqs": {
            "get": {
                "operationId": "GetRFQs",
                "summary": "Get RFQs",
                "tags": [
                    "communications"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/CursorQuery"
                    },
                    {
                        "$ref": "#/components/parameters/EventTickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MarketTickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/SubaccountQuery"
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "format": "int32",
                            "minimum": 1,
                            "maximum": 100,
                            "default": 100
                        }
                    },
                    {
                        "name": "status",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "creator_user_id",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            },
            "post": {
                "operationId": "CreateRFQ",
                "summary": "Create RFQ",
                "tags": [
                    "communications"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ]
            }
        },
        "/communications/rfqs/{rfq_id}": {
            "get": {
                "operationId": "GetRFQ",
                "summary": "Get RFQ",
                "tags": [
                    "communications"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/RfqIdPath"
                    }
                ]
            },
            "delete": {
                "operationId": "DeleteRFQ",
                "summary": "Delete RFQ",
                "tags": [
                    "communications"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/RfqIdPath"
                    }
                ]
            }
        },
        "/communications/quotes": {
            "get": {
                "operationId": "GetQuotes",
                "summary": "Get Quotes",
                "tags": [
                    "communications"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/CursorQuery"
                    },
                    {
                        "$ref": "#/components/parameters/EventTickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MarketTickerQuery"
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "format": "int32",
                            "minimum": 1,
                            "maximum": 500,
                            "default": 500
                        }
                    },
                    {
                        "name": "status",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "x-go-type-skip-optional-pointer": true
                        }
                    },
                    {
                        "name": "quote_creator_user_id",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "x-go-type-skip-optional-pointer": true
                        }
                    },
                    {
                        "name": "rfq_creator_user_id",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "x-go-type-skip-optional-pointer": true
                        }
                    },
                    {
                        "name": "rfq_creator_subtrader_id",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "x-go-type-skip-optional-pointer": true
                        }
                    },
                    {
                        "name": "rfq_id",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "x-go-type-skip-optional-pointer": true
                        }
                    }
                ]
            },
            "post": {
                "operationId": "CreateQuote",
                "summary": "Create Quote",
                "tags": [
                    "communications"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ]
            }
        },
        "/communications/quotes/{quote_id}": {
            "get": {
                "operationId": "GetQuote",
                "summary": "Get Quote",
                "tags": [
                    "communications"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/QuoteIdPath"
                    }
                ]
            },
            "delete": {
                "operationId": "DeleteQuote",
                "summary": "Delete Quote",
                "tags": [
                    "communications"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/QuoteIdPath"
                    }
                ]
            }
        },
        "/communications/quotes/{quote_id}/accept": {
            "put": {
                "operationId": "AcceptQuote",
                "summary": "Accept Quote",
                "tags": [
                    "communications"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/QuoteIdPath"
                    }
                ]
            }
        },
        "/communications/quotes/{quote_id}/confirm": {
            "put": {
                "operationId": "ConfirmQuote",
                "summary": "Confirm Quote",
                "tags": [
                    "communications"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/QuoteIdPath"
                    }
                ]
            }
        },
        "/multivariate_event_collections/{collection_ticker}": {
            "get": {
                "operationId": "GetMultivariateEventCollection",
                "summary": "Get Multivariate Event Collection",
                "tags": [
                    "multivariate"
                ],
                "parameters": [
                    {
                        "name": "collection_ticker",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            },
            "post": {
                "operationId": "CreateMarketInMultivariateEventCollection",
                "summary": "Create Market In Multivariate Event Collection",
                "tags": [
                    "multivariate"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "name": "collection_ticker",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/multivariate_event_collections": {
            "get": {
                "operationId": "GetMultivariateEventCollections",
                "summary": "Get Multivariate Event Collections",
                "tags": [
                    "multivariate"
                ],
                "parameters": [
                    {
                        "name": "status",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "unopened",
                                "open",
                                "closed"
                            ]
                        }
                    },
                    {
                        "name": "associated_event_ticker",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "series_ticker",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {
                            "type": "integer",
                            "format": "int32",
                            "minimum": 1,
                            "maximum": 200
                        }
                    },
                    {
                        "name": "cursor",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/multivariate_event_collections/{collection_ticker}/lookup": {
            "put": {
                "operationId": "LookupTickersForMarketInMultivariateEventCollection",
                "summary": "Lookup Tickers For Market In Multivariate Event Collection",
                "tags": [
                    "multivariate"
                ],
                "security": [
                    {
                        "kalshiAccessKey": [],
                        "kalshiAccessSignature": [],
                        "kalshiAccessTimestamp": []
                    }
                ],
                "parameters": [
                    {
                        "name": "collection_ticker",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            },
            "get": {
                "operationId": "GetMultivariateEventCollectionLookupHistory",
                "summary": "Get Multivariate Event Collection Lookup History",
                "tags": [
                    "multivariate"
                ],
                "parameters": [
                    {
                        "name": "collection_ticker",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "lookback_seconds",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "format": "int32",
                            "enum": [
                                10,
                                60,
                                300,
                                3600
                            ]
                        }
                    }
                ]
            }
        },
        "/series/{series_ticker}": {
            "get": {
                "operationId": "GetSeries",
                "summary": "Get Series",
                "tags": [
                    "market"
                ],
                "parameters": [
                    {
                        "name": "series_ticker",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "include_volume",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean",
                            "default": false
                        },
                        "x-go-type-skip-optional-pointer": true
                    }
                ]
            }
        },
        "/series": {
            "get": {
                "operationId": "GetSeriesList",
                "summary": "Get Series List",
                "tags": [
                    "market"
                ],
                "parameters": [
                    {
                        "name": "category",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string"
                        },
                        "x-go-type-skip-optional-pointer": true
                    },
                    {
                        "name": "tags",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string"
                        },
                        "x-go-type-skip-optional-pointer": true
                    },
                    {
                        "name": "include_product_metadata",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean",
                            "default": false
                        },
                        "x-go-type-skip-optional-pointer": true
                    },
                    {
                        "name": "include_volume",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean",
                            "default": false
                        },
                        "x-go-type-skip-optional-pointer": true
                    }
                ]
            }
        },
        "/markets": {
            "get": {
                "operationId": "GetMarkets",
                "summary": "Get Markets",
                "tags": [
                    "market"
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/MarketLimitQuery"
                    },
                    {
                        "$ref": "#/components/parameters/CursorQuery"
                    },
                    {
                        "$ref": "#/components/parameters/EventTickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/SeriesTickerQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MinCreatedTsQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MaxCreatedTsQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MinUpdatedTsQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MaxCloseTsQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MinCloseTsQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MinSettledTsQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MaxSettledTsQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MarketStatusQuery"
                    },
                    {
                        "$ref": "#/components/parameters/TickersQuery"
                    },
                    {
                        "$ref": "#/components/parameters/MveFilterQuery"
                    }
                ]
            }
        },
        "/markets/{ticker}": {
            "get": {
                "operationId": "GetMarket",
                "summary": "Get Market",
                "tags": [
                    "market"
                ],
                "parameters": [
                    {
                        "$ref": "#/components/parameters/TickerPath"
                    }
                ]
            }
        },
        "/markets/candlesticks": {
            "get": {
                "operationId": "BatchGetMarketCandlesticks",
                "summary": "Batch Get Market Candlesticks",
                "tags": [
                    "market"
                ],
                "parameters": [
                    {
                        "name": "market_tickers",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "start_ts",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    },
                    {
                        "name": "end_ts",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "format": "int64"
                        }
                    },
                    {
                        "name": "period_interval",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "integer",
                            "format": "int32",
                            "minimum": 1
                        }
                    },
                    {
                        "name": "include_latest_before_start",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean",
                            "default": false
                        }
                    }
                ]
            }
        }
    },
    "components": {
        "securitySchemes": {
            "kalshiAccessKey": {
                "type": "apiKey",
                "in": "header",
                "name": "KALSHI-ACCESS-KEY",
                "description": "Your API key ID"
            },
            "kalshiAccessSignature": {
                "type": "apiKey",
                "in": "header",
                "name": "KALSHI-ACCESS-SIGNATURE",
                "description": "RSA-PSS signature of the request"
            },
            "kalshiAccessTimestamp": {
                "type": "apiKey",
                "in": "header",
                "name": "KALSHI-ACCESS-TIMESTAMP",
                "description": "Request timestamp in milliseconds"
            }
        }
    },
    "tags": [
        {
            "name": "api-keys"
        },
        {
            "name": "orders"
        },
        {
            "name": "order-groups"
        },
        {
            "name": "portfolio"
        },
        {
            "name": "communications"
        },
        {
            "name": "multivariate"
        },
        {
            "name": "exchange"
        },
        {
            "name": "live-data"
        },
        {
            "name": "markets"
        },
        {
            "name": "milestone"
        },
        {
            "name": "search"
        },
        {
            "name": "incentive-programs"
        },
        {
            "name": "fcm"
        },
        {
            "name": "events"
        },
        {
            "name": "structured-targets"
        }
    ]
};
