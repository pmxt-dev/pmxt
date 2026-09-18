import os
import pmxt

def main():
    client = pmxt.Polymarket(
        private_key=os.getenv("POLYMARKET_PRIVATE_KEY"),
        proxy_address=os.getenv("POLYMARKET_PROXY_ADDRESS"),
    )

    # Option 1: Using outcome shorthand (recommended)
    markets = client.fetch_markets(query="Trump")
    market = markets[0]
    order = client.create_order(
        outcome=market.yes,
        side='buy',
        order_type='limit',
        amount=10,
        price=0.10
    )
    print(order)

    # Option 2: Using explicit IDs (still works)
    # order = client.create_order(
    #     market_id='663583',
    #     outcome_id='10991849228756847439673778874175365458450913336396982752046655649803657501964',
    #     side='buy',
    #     order_type='limit',
    #     amount=10,
    #     price=0.10
    # )

if __name__ == "__main__":
    main()
