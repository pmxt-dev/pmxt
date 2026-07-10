import ast
from pathlib import Path


def test_websocket_return_types_are_public_exports():
    init_path = Path(__file__).resolve().parents[1] / "pmxt" / "__init__.py"
    tree = ast.parse(init_path.read_text(encoding="utf-8"))

    imported_models = set()
    public_exports = set()

    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module == "models":
            imported_models.update(alias.name for alias in node.names)
        elif (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id == "__all__"
            and isinstance(node.value, ast.List)
        ):
            public_exports.update(
                item.value
                for item in node.value.elts
                if isinstance(item, ast.Constant) and isinstance(item.value, str)
            )

    expected = {"FirehoseEvent", "SubscribedAddressSnapshot", "ExchangeOptions", "PolymarketOptions", "RouterOptions", "FeedClientOptions", "SeriesFetchParams", "TradesParams", "FetchOrderBookParams", "MatchedClusterSort", "FetchMatchedMarketClustersParams", "FetchMatchedEventClustersParams"}
    assert expected <= imported_models
    assert expected <= public_exports


def test_filter_function_types_are_public_exports():
    init_path = Path(__file__).resolve().parents[1] / "pmxt" / "__init__.py"
    tree = ast.parse(init_path.read_text(encoding="utf-8"))

    imported_models = set()
    public_exports = set()

    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module == "models":
            imported_models.update(alias.name for alias in node.names)
        elif (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id == "__all__"
            and isinstance(node.value, ast.List)
        ):
            public_exports.update(
                item.value
                for item in node.value.elts
                if isinstance(item, ast.Constant) and isinstance(item.value, str)
            )

    expected = {"MarketFilterFunction", "EventFilterFunction"}
    assert expected <= imported_models
    assert expected <= public_exports


def test_fetch_order_book_params_shape_matches_typescript_sdk():
    models_path = Path(__file__).resolve().parents[1] / "pmxt" / "models.py"
    tree = ast.parse(models_path.read_text(encoding="utf-8"))
    params_class = next(
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == "FetchOrderBookParams"
    )
    annotated_fields = {
        node.target.id
        for node in params_class.body
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)
    }
    total_keyword = next(kw for kw in params_class.keywords if kw.arg == "total")

    assert annotated_fields == {"side", "outcome", "since", "until"}
    assert isinstance(total_keyword.value, ast.Constant)
    assert total_keyword.value.value is False


def test_fetch_order_book_uses_typed_params_annotation():
    client_path = Path(__file__).resolve().parents[1] / "pmxt" / "client.py"
    tree = ast.parse(client_path.read_text(encoding="utf-8"))
    fetch_order_book = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef) and node.name == "fetch_order_book"
    )
    params_arg = next(arg for arg in fetch_order_book.args.args if arg.arg == "params")

    assert isinstance(params_arg.annotation, ast.Subscript)
    assert isinstance(params_arg.annotation.value, ast.Name)
    assert params_arg.annotation.value.id == "Optional"
    assert isinstance(params_arg.annotation.slice, ast.Name)
    assert params_arg.annotation.slice.id == "FetchOrderBookParams"


def test_legacy_polymarket_us_alias_stays_public():
    init_path = Path(__file__).resolve().parents[1] / "pmxt" / "__init__.py"
    exchanges_path = Path(__file__).resolve().parents[1] / "pmxt" / "_exchanges.py"

    init_tree = ast.parse(init_path.read_text(encoding="utf-8"))
    exchange_imports = set()
    public_exports = set()

    for node in init_tree.body:
        if isinstance(node, ast.ImportFrom) and node.module == "_exchanges":
            exchange_imports.update(alias.name for alias in node.names)
        elif (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id == "__all__"
            and isinstance(node.value, ast.List)
        ):
            public_exports.update(
                item.value
                for item in node.value.elts
                if isinstance(item, ast.Constant) and isinstance(item.value, str)
            )

    exchanges_tree = ast.parse(exchanges_path.read_text(encoding="utf-8"))
    aliases = {
        node.targets[0].id: node.value.id
        for node in exchanges_tree.body
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and isinstance(node.value, ast.Name)
    }

    assert "Polymarket_us" in exchange_imports
    assert "Polymarket_us" in public_exports
    assert aliases["Polymarket_us"] == "PolymarketUS"


def test_feed_client_is_top_level_public_export():
    init_path = Path(__file__).resolve().parents[1] / "pmxt" / "__init__.py"
    tree = ast.parse(init_path.read_text(encoding="utf-8"))

    imported_modules = {
        alias.name: node.module
        for node in tree.body
        if isinstance(node, ast.ImportFrom)
        for alias in node.names
    }
    public_exports = set()

    for node in tree.body:
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id == "__all__"
            and isinstance(node.value, ast.List)
        ):
            public_exports.update(
                item.value
                for item in node.value.elts
                if isinstance(item, ast.Constant) and isinstance(item.value, str)
            )

    assert imported_modules["FeedClient"] == "feed_client"
    assert "FeedClient" in public_exports


def test_environment_constants_are_top_level_public_exports():
    init_path = Path(__file__).resolve().parents[1] / "pmxt" / "__init__.py"
    tree = ast.parse(init_path.read_text(encoding="utf-8"))

    imported_modules = {
        alias.name: node.module
        for node in tree.body
        if isinstance(node, ast.ImportFrom)
        for alias in node.names
    }
    public_exports = set()

    for node in tree.body:
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id == "__all__"
            and isinstance(node.value, ast.List)
        ):
            public_exports.update(
                item.value
                for item in node.value.elts
                if isinstance(item, ast.Constant) and isinstance(item.value, str)
            )

    assert imported_modules["ENV"] == "constants"
    assert imported_modules["ENV_BASE_URL"] == "constants"
    assert imported_modules["ENV_API_KEY"] == "constants"
    assert {"ENV", "ENV_BASE_URL", "ENV_API_KEY"} <= public_exports


def _load_exchange_class(class_name: str) -> ast.ClassDef:
    exchanges_path = Path(__file__).resolve().parents[1] / "pmxt" / "_exchanges.py"
    tree = ast.parse(exchanges_path.read_text(encoding="utf-8"))

    return next(
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == class_name
    )


def _load_method(class_node: ast.ClassDef, method_name: str) -> ast.FunctionDef:
    return next(
        node
        for node in class_node.body
        if isinstance(node, ast.FunctionDef) and node.name == method_name
    )


def _first_call_method_name(method: ast.FunctionDef) -> str:
    call = next(
        node
        for node in method.body
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call)
    )
    assert isinstance(call.value.func, ast.Attribute)
    assert call.value.func.attr == "_call_method"
    return call.value.args[0].value


def test_polymarket_init_auth_is_generated():
    polymarket_class = _load_exchange_class("Polymarket")
    init_auth = _load_method(polymarket_class, "init_auth")

    assert _first_call_method_name(init_auth) == "initAuth"


def test_documented_exchange_only_methods_exist_on_python_client(monkeypatch):
    from pmxt import Exchange, UnifiedEvent

    exchange = Exchange("probable", auto_start_server=False)
    calls = []

    def fake_call_method(method_name, params=None):
        calls.append((method_name, params))
        if method_name in {"getEventById", "getEventBySlug"}:
            return {
                "id": str(params),
                "title": "Example event",
                "description": "",
                "slug": "example-event",
                "markets": [],
                "url": "https://example.com/events/example-event",
            }
        return None

    monkeypatch.setattr(exchange, "_call_method", fake_call_method)

    assert exchange.pre_warm_market("abc123") is None
    by_id = exchange.get_event_by_id("12345")
    by_slug = exchange.get_event_by_slug("example-event")

    assert calls == [
        ("preWarmMarket", "abc123"),
        ("getEventById", "12345"),
        ("getEventBySlug", "example-event"),
    ]
    assert isinstance(by_id, UnifiedEvent)
    assert by_id.id == "12345"
    assert isinstance(by_slug, UnifiedEvent)
    assert by_slug.slug == "example-event"
