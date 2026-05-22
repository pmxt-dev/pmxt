/**
 * Auto-generated from /home/zihao/pmxt/core/specs/polymarket/PolymarketGammaAPI.yaml
 * Generated at: 2026-05-10T23:00:51.408Z
 * Do not edit manually -- run "npm run fetch:openapi" to regenerate.
 */
export const polymarketGammaSpec = {
    "openapi": "3.0.3",
    "info": {
        "title": "Polymarket Gamma API",
        "version": "1.0.0"
    },
    "servers": [
        {
            "url": "https://gamma-api.polymarket.com"
        }
    ],
    "tags": [
        {
            "name": "Gamma Status"
        },
        {
            "name": "Sports"
        },
        {
            "name": "Tags"
        },
        {
            "name": "Events"
        },
        {
            "name": "Markets"
        },
        {
            "name": "Comments"
        },
        {
            "name": "Series"
        },
        {
            "name": "Profiles"
        },
        {
            "name": "Search"
        }
    ],
    "paths": {
        "/status": {
            "get": {
                "tags": [
                    "Gamma Status"
                ],
                "summary": "Gamma API Health check",
                "operationId": "getGammaStatus"
            }
        },
        "/teams": {
            "get": {
                "tags": [
                    "Sports"
                ],
                "summary": "List teams",
                "operationId": "listTeams",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/limit"
                    },
                    {
                        "$ref": "#/components/parameters/offset"
                    },
                    {
                        "$ref": "#/components/parameters/order"
                    },
                    {
                        "$ref": "#/components/parameters/ascending"
                    },
                    {
                        "name": "league",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        }
                    },
                    {
                        "name": "name",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        }
                    },
                    {
                        "name": "abbreviation",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        }
                    }
                ]
            }
        },
        "/sports": {
            "get": {
                "tags": [
                    "Sports"
                ],
                "summary": "Get sports metadata information",
                "operationId": "getSportsMetadata"
            }
        },
        "/sports/market-types": {
            "get": {
                "tags": [
                    "Sports"
                ],
                "summary": "Get valid sports market types",
                "operationId": "getSportsMarketTypes"
            }
        },
        "/tags": {
            "get": {
                "tags": [
                    "Tags"
                ],
                "summary": "List tags",
                "operationId": "listTags",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/limit"
                    },
                    {
                        "$ref": "#/components/parameters/offset"
                    },
                    {
                        "$ref": "#/components/parameters/order"
                    },
                    {
                        "$ref": "#/components/parameters/ascending"
                    },
                    {
                        "name": "include_template",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "is_carousel",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    }
                ]
            }
        },
        "/tags/{id}": {
            "get": {
                "tags": [
                    "Tags"
                ],
                "summary": "Get tag by id",
                "operationId": "getTag",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/pathId"
                    },
                    {
                        "name": "include_template",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    }
                ]
            }
        },
        "/tags/{id}/related-tags": {
            "get": {
                "tags": [
                    "Tags"
                ],
                "summary": "Get related tags (relationships) by tag id",
                "operationId": "getRelatedTagsById",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/pathId"
                    },
                    {
                        "name": "omit_empty",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "status",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "active",
                                "closed",
                                "all"
                            ]
                        }
                    }
                ]
            }
        },
        "/tags/slug/{slug}/related-tags": {
            "get": {
                "tags": [
                    "Tags"
                ],
                "summary": "Get related tags (relationships) by tag slug",
                "operationId": "getRelatedTagsBySlug",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/pathSlug"
                    },
                    {
                        "name": "omit_empty",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "status",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "active",
                                "closed",
                                "all"
                            ]
                        }
                    }
                ]
            }
        },
        "/tags/{id}/related-tags/tags": {
            "get": {
                "tags": [
                    "Tags"
                ],
                "summary": "Get tags related to a tag id",
                "operationId": "getTagsRelatedToATagById",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/pathId"
                    },
                    {
                        "name": "omit_empty",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "status",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "active",
                                "closed",
                                "all"
                            ]
                        }
                    }
                ]
            }
        },
        "/tags/slug/{slug}/related-tags/tags": {
            "get": {
                "tags": [
                    "Tags"
                ],
                "summary": "Get tags related to a tag slug",
                "operationId": "getTagsRelatedToATagBySlug",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/pathSlug"
                    },
                    {
                        "name": "omit_empty",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "status",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "active",
                                "closed",
                                "all"
                            ]
                        }
                    }
                ]
            }
        },
        "/events": {
            "get": {
                "tags": [
                    "Events"
                ],
                "summary": "List events",
                "operationId": "listEvents",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/limit"
                    },
                    {
                        "$ref": "#/components/parameters/offset"
                    },
                    {
                        "$ref": "#/components/parameters/order"
                    },
                    {
                        "$ref": "#/components/parameters/ascending"
                    },
                    {
                        "name": "id",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "integer"
                            }
                        }
                    },
                    {
                        "name": "tag_id",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "exclude_tag_id",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "integer"
                            }
                        }
                    },
                    {
                        "name": "slug",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        }
                    },
                    {
                        "name": "tag_slug",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "related_tags",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "active",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "archived",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "featured",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "cyom",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "include_chat",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "include_template",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "recurrence",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "closed",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "liquidity_min",
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "liquidity_max",
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "volume_min",
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "volume_max",
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "start_date_min",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "format": "date-time"
                        }
                    },
                    {
                        "name": "start_date_max",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "format": "date-time"
                        }
                    },
                    {
                        "name": "end_date_min",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "format": "date-time"
                        }
                    },
                    {
                        "name": "end_date_max",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "format": "date-time"
                        }
                    }
                ]
            }
        },
        "/events/{id}": {
            "get": {
                "tags": [
                    "Events"
                ],
                "summary": "Get event by id",
                "operationId": "getEvent",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/pathId"
                    },
                    {
                        "name": "include_chat",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "include_template",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    }
                ]
            }
        },
        "/events/{id}/tags": {
            "get": {
                "tags": [
                    "Events",
                    "Tags"
                ],
                "summary": "Get event tags",
                "operationId": "getEventTags",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/pathId"
                    }
                ]
            }
        },
        "/events/slug/{slug}": {
            "get": {
                "tags": [
                    "Events"
                ],
                "summary": "Get event by slug",
                "operationId": "getEventBySlug",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/pathSlug"
                    },
                    {
                        "name": "include_chat",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "include_template",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    }
                ]
            }
        },
        "/markets": {
            "get": {
                "tags": [
                    "Markets"
                ],
                "summary": "List markets",
                "operationId": "listMarkets",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/limit"
                    },
                    {
                        "$ref": "#/components/parameters/offset"
                    },
                    {
                        "$ref": "#/components/parameters/order"
                    },
                    {
                        "$ref": "#/components/parameters/ascending"
                    },
                    {
                        "name": "id",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "integer"
                            }
                        }
                    },
                    {
                        "name": "slug",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        }
                    },
                    {
                        "name": "clob_token_ids",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        }
                    },
                    {
                        "name": "condition_ids",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        }
                    },
                    {
                        "name": "market_maker_address",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        }
                    },
                    {
                        "name": "liquidity_num_min",
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "liquidity_num_max",
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "volume_num_min",
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "volume_num_max",
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "start_date_min",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "format": "date-time"
                        }
                    },
                    {
                        "name": "start_date_max",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "format": "date-time"
                        }
                    },
                    {
                        "name": "end_date_min",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "format": "date-time"
                        }
                    },
                    {
                        "name": "end_date_max",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "format": "date-time"
                        }
                    },
                    {
                        "name": "tag_id",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "related_tags",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "cyom",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "uma_resolution_status",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "game_id",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "sports_market_types",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        }
                    },
                    {
                        "name": "rewards_min_size",
                        "in": "query",
                        "schema": {
                            "type": "number"
                        }
                    },
                    {
                        "name": "question_ids",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        }
                    },
                    {
                        "name": "include_tag",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "closed",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    }
                ]
            }
        },
        "/markets/{id}": {
            "get": {
                "tags": [
                    "Markets"
                ],
                "summary": "Get market by id",
                "operationId": "getMarket",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/pathId"
                    },
                    {
                        "name": "include_tag",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    }
                ]
            }
        },
        "/markets/{id}/tags": {
            "get": {
                "tags": [
                    "Markets",
                    "Tags"
                ],
                "summary": "Get market tags by id",
                "operationId": "getMarketTags",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/pathId"
                    }
                ]
            }
        },
        "/markets/slug/{slug}": {
            "get": {
                "tags": [
                    "Markets"
                ],
                "summary": "Get market by slug",
                "operationId": "getMarketBySlug",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/pathSlug"
                    },
                    {
                        "name": "include_tag",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    }
                ]
            }
        },
        "/series": {
            "get": {
                "tags": [
                    "Series"
                ],
                "summary": "List series",
                "operationId": "listSeries",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/limit"
                    },
                    {
                        "$ref": "#/components/parameters/offset"
                    },
                    {
                        "$ref": "#/components/parameters/order"
                    },
                    {
                        "$ref": "#/components/parameters/ascending"
                    },
                    {
                        "name": "slug",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        }
                    },
                    {
                        "name": "categories_ids",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "integer"
                            }
                        }
                    },
                    {
                        "name": "categories_labels",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        }
                    },
                    {
                        "name": "closed",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "include_chat",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "recurrence",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    }
                ]
            }
        },
        "/series/{id}": {
            "get": {
                "tags": [
                    "Series"
                ],
                "summary": "Get series by id",
                "operationId": "getSeries",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/pathId"
                    },
                    {
                        "name": "include_chat",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    }
                ]
            }
        },
        "/comments": {
            "get": {
                "tags": [
                    "Comments"
                ],
                "summary": "List comments",
                "operationId": "listComments",
                "parameters": [
                    {
                        "$ref": "#/components/parameters/limit"
                    },
                    {
                        "$ref": "#/components/parameters/offset"
                    },
                    {
                        "$ref": "#/components/parameters/order"
                    },
                    {
                        "$ref": "#/components/parameters/ascending"
                    },
                    {
                        "name": "parent_entity_type",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "Event",
                                "Series",
                                "market"
                            ]
                        }
                    },
                    {
                        "name": "parent_entity_id",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "get_positions",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "holders_only",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    }
                ]
            }
        },
        "/comments/{id}": {
            "get": {
                "tags": [
                    "Comments"
                ],
                "summary": "Get comments by comment id",
                "operationId": "getCommentsById",
                "parameters": [
                    {
                        "name": "id",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "get_positions",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    }
                ]
            }
        },
        "/public-profile": {
            "get": {
                "tags": [
                    "Profiles"
                ],
                "summary": "Get public profile by wallet address",
                "operationId": "getPublicProfile",
                "parameters": [
                    {
                        "name": "address",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "string",
                            "pattern": "^0x[a-fA-F0-9]{40}$"
                        }
                    }
                ]
            }
        },
        "/public-search": {
            "get": {
                "tags": [
                    "Search"
                ],
                "summary": "Search markets, events, and profiles",
                "operationId": "publicSearch",
                "parameters": [
                    {
                        "name": "q",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "cache",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "events_status",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "limit_per_type",
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
                        "name": "events_tag",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        }
                    },
                    {
                        "name": "keep_closed_markets",
                        "in": "query",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "sort",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "ascending",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "search_tags",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "search_profiles",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "recurrence",
                        "in": "query",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "name": "exclude_tag_id",
                        "in": "query",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "integer"
                            }
                        }
                    },
                    {
                        "name": "optimized",
                        "in": "query",
                        "schema": {
                            "type": "boolean"
                        }
                    }
                ]
            }
        }
    }
};
