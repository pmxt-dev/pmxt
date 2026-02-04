import os
import pmxt

def main():
    client = pmxt.Polymarket(
        private_key=os.getenv("POLYMARKET_PRIVATE_KEY"),
        proxy_address=os.getenv("POLYMARKET_PROXY_ADDRESS"),
        signature_type='gnosis-safe'
    )
    print(client.fetch_balance())

if __name__ == "__main__":
    main()
