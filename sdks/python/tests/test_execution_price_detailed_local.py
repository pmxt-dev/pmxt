from pmxt import Polymarket
from pmxt.models import OrderBook, OrderLevel


def test_get_execution_price_detailed_computes_locally_without_sidecar():
    client = Polymarket(auto_start_server=False)
    result = client.get_execution_price_detailed(
        OrderBook(
            bids=[OrderLevel(price=0.41, size=5), OrderLevel(price=0.43, size=10)],
            asks=[OrderLevel(price=0.52, size=4), OrderLevel(price=0.5, size=6)],
        ),
        "buy",
        8,
    )

    assert abs(result.price - 0.505) < 1e-12
    assert result.filled_amount == 8
    assert result.fully_filled is True


def test_get_execution_price_detailed_reports_partial_fill():
    client = Polymarket(auto_start_server=False)
    result = client.get_execution_price_detailed(
        OrderBook(bids=[OrderLevel(price=0.42, size=2)], asks=[]),
        "sell",
        5,
    )

    assert abs(result.price - 0.42) < 1e-12
    assert result.filled_amount == 2
    assert result.fully_filled is False
