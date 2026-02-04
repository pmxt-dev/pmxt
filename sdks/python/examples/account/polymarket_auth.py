import os
import pmxt

def main():
    client = pmxt.Polymarket(
        private_key=os.getenv("POLYMARKET_PRIVATE_KEY"),
        proxy_address=os.getenv("POLYMARKET_PROXY_ADDRESS"),
        signature_type='gnosis-safe'  # 'eoa' | 'poly-proxy' | 'gnosis-safe'
    )
    print("Polymarket client initialized")

if __name__ == "__main__":
    main()
