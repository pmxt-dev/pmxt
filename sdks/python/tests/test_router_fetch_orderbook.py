import pytest
from pmxt import Router

def test_fetch_order_book():
    router = Router(base_url='http://localhost:3847')
    result = router.fetch_order_book('test-outcome-123', 10)
    
    assert result is not None
    assert hasattr(result, 'bids')
    assert hasattr(result, 'asks')