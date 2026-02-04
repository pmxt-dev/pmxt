import os
import pmxt

def main():
    client = pmxt.Polymarket(private_key=os.getenv("POLYMARKET_PRIVATE_KEY"))

    order = client.create_order(
        market_id='663583',
        outcome_id='10991849228756847439673778874175365458450913336396982752046655649803657501964',
        side='buy',
        type='market',
        amount=10
    )
    print(order)

if __name__ == "__main__":
    main()
