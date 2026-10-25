/**
 * Auto-generated from /home/harry-riddle/dev/github.com/0xharryriddle/pmxt/core/specs/metaculus/Metaculus.yaml
 * Generated at: 2026-03-01T14:46:24.859Z
 * Do not edit manually -- run "npm run fetch:openapi" to regenerate.
 */
export const metaculusApiSpec = {
    "openapi": "3.0.0",
    "info": {
        "version": "2.0.0",
        "title": "Metaculus API"
    },
    "servers": [
        {
            "url": "https://www.metaculus.com/api"
        }
    ],
    "security": [
        {
            "TokenAuth": []
        }
    ],
    "components": {
        "securitySchemes": {
            "TokenAuth": {
                "type": "apiKey",
                "in": "header",
                "name": "Authorization",
                "description": "Token-based authentication. Use format: `Token <input token>`"
            }
        }
    },
    "tags": [
        {
            "name": "Feed"
        },
        {
            "name": "Questions & Forecasts"
        },
        {
            "name": "Comments"
        },
        {
            "name": "Utilities & Data"
        }
    ],
    "paths": {
        "/posts/": {
            "get": {
                "operationId": "GetPosts",
                "summary": "Retrieve posts feed",
                "tags": [
                    "Feed"
                ],
                "parameters": [
                    {
                        "in": "query",
                        "name": "acting_user",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "in": "query",
                        "name": "categories",
                        "schema": {
                            "type": "string"
                        }
                    },
                    {
                        "in": "query",
                        "name": "include_cp_history",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "in": "query",
                        "name": "include_descriptions",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "in": "query",
                        "name": "tournaments",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        }
                    },
                    {
                        "in": "query",
                        "name": "statuses",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": [
                                    "upcoming",
                                    "closed",
                                    "resolved",
                                    "open"
                                ]
                            }
                        }
                    },
                    {
                        "in": "query",
                        "name": "forecaster_id",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "in": "query",
                        "name": "with_cp",
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "in": "query",
                        "name": "not_forecaster_id",
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "in": "query",
                        "name": "open_time__gt",
                        "schema": {
                            "type": "string",
                            "format": "date-time"
                        }
                    },
                    {
                        "in": "query",
                        "name": "published_at__gt",
                        "schema": {
                            "type": "string",
                            "format": "date-time"
                        }
                    },
                    {
                        "in": "query",
                        "name": "scheduled_resolve_time__gt",
                        "schema": {
                            "type": "string",
                            "format": "date-time"
                        }
                    },
                    {
                        "in": "query",
                        "name": "forecast_type",
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": [
                                    "binary",
                                    "numeric",
                                    "date",
                                    "multiple_choice",
                                    "conditional",
                                    "group_of_questions",
                                    "notebook"
                                ]
                            }
                        }
                    },
                    {
                        "in": "query",
                        "name": "order_by",
                        "schema": {
                            "type": "string",
                            "enum": [
                                "published_at",
                                "open_time",
                                "vote_score",
                                "comment_count",
                                "forecasts_count",
                                "scheduled_close_time",
                                "scheduled_resolve_time",
                                "user_last_forecasts_date",
                                "unread_comment_count",
                                "weekly_movement",
                                "divergence",
                                "hotness",
                                "score"
                            ]
                        }
                    }
                ]
            }
        },
        "/posts/{postId}/": {
            "get": {
                "operationId": "GetPost",
                "summary": "Retrieve post details",
                "tags": [
                    "Feed"
                ],
                "parameters": [
                    {
                        "name": "postId",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        },
        "/posts/{postId}/download-data/": {
            "get": {
                "summary": "Download data for a Question. Will open a download prompt in the browser. The return is a Zip file of CSVs.",
                "tags": [
                    "Utilities & Data"
                ],
                "parameters": [
                    {
                        "name": "postId",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "sub_question",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "aggregation_methods",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": [
                                    "recency_weighted",
                                    "unweighted",
                                    "metaculus_prediction",
                                    "single_aggregation"
                                ]
                            }
                        }
                    },
                    {
                        "name": "include_bots",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "user_ids",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            }
                        }
                    },
                    {
                        "name": "minimize",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "include_comments",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "include_scores",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean"
                        }
                    }
                ]
            }
        },
        "/projects/{projectId}/download-data/": {
            "get": {
                "summary": "Download data for a whole Project. Will open a download prompt in the browser. The return is a Zip file of CSVs. Only available to site admins and Whitelisted users.",
                "tags": [
                    "Utilities & Data"
                ],
                "parameters": [
                    {
                        "name": "projectId",
                        "in": "path",
                        "required": true,
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "include_comments",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "include_scores",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean"
                        }
                    }
                ]
            }
        },
        "/questions/forecast/": {
            "post": {
                "operationId": "SubmitForecast",
                "summary": "Submit forecasts for questions",
                "tags": [
                    "Questions & Forecasts"
                ]
            }
        },
        "/questions/withdraw/": {
            "post": {
                "operationId": "WithdrawForecast",
                "summary": "Withdraw current forecasts for questions",
                "tags": [
                    "Questions & Forecasts"
                ]
            }
        },
        "/comments/create/": {
            "post": {
                "summary": "Create a new comment",
                "tags": [
                    "Comments"
                ]
            }
        },
        "/comments/": {
            "get": {
                "summary": "Retrieve comments",
                "tags": [
                    "Comments"
                ],
                "parameters": [
                    {
                        "name": "post",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "author",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "offset",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "integer"
                        }
                    },
                    {
                        "name": "is_private",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean",
                            "default": false
                        }
                    },
                    {
                        "name": "use_root_comments_pagination",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "boolean"
                        }
                    },
                    {
                        "name": "sort",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "string",
                            "enum": [
                                "-created_at",
                                "created_at"
                            ]
                        }
                    },
                    {
                        "name": "focus_comment_id",
                        "in": "query",
                        "required": false,
                        "schema": {
                            "type": "integer"
                        }
                    }
                ]
            }
        }
    }
};
