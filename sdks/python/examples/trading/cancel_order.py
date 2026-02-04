import os
import pmxt

def main():
    client = pmxt.Polymarket(
        private_key=os.getenv("POLYMARKET_PRIVATE_KEY"),
        proxy_address=os.getenv("POLYMARKET_PROXY_ADDRESS"),
        signature_type='gnosis-safe'
    )
    
    # Replace with an actual order ID
    order_id = "YOUR_ORDER_ID"
    
    try:
        result = client.cancel_order(order_id)
        print(result)
    except Exception as e:
        print(f"Error cancelling order: {e}")

if __name__ == "__main__":
    main()
