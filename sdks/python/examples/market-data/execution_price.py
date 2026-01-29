import pmxt

def main():
    api = pmxt.Polymarket()
    markets = api.search_markets('Trump')
    outcome_id = markets[0].outcomes[0].id

    order_book = api.fetch_order_book(outcome_id)
    price = api.get_execution_price(order_book, 'buy', 100)
    print(f"Average price for 100 shares: {price}")

    # Get detailed information
    detailed = api.get_execution_price_detailed(order_book, 'buy', 100)
    print(f"Filled: {detailed.filled_amount}, Fully filled: {detailed.fully_filled}")

if __name__ == "__main__":
    main()
