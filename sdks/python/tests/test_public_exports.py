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


def test_polymarket_init_auth_is_generated():
    exchanges_path = Path(__file__).resolve().parents[1] / "pmxt" / "_exchanges.py"
    tree = ast.parse(exchanges_path.read_text(encoding="utf-8"))

    polymarket_class = next(
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == "Polymarket"
    )
    init_auth = next(
        node
        for node in polymarket_class.body
        if isinstance(node, ast.FunctionDef) and node.name == "init_auth"
    )

    call = next(
        node
        for node in init_auth.body
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call)
    )
    assert isinstance(call, ast.Expr)
    assert isinstance(call.value, ast.Call)
    assert isinstance(call.value.func, ast.Attribute)
    assert call.value.func.attr == "_call_method"
    assert call.value.args[0].value == "initAuth"
