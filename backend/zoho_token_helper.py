import requests
import os
from dotenv import load_dotenv

def get_zoho_refresh_token():
    # 1. Load existing credentials from .env
    load_dotenv()
    
    client_id = os.getenv("ZOHO_CLIENT_ID")
    client_secret = os.getenv("ZOHO_CLIENT_SECRET")
    accounts_url = os.getenv("ZOHO_ACCOUNTS_URL", "https://accounts.zoho.in")
    
    print("--- Zoho Refresh Token Helper ---")
    print(f"Using Client ID: {client_id}")
    
    if not client_id or not client_secret:
        print("Error: ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET missing in .env")
        return

    # 2. Get the one-time code from the user
    print("\nStep 1: Go to the Zoho Developer Console and generate a 'Self-Client' code.")
    print("Step 2: Ensure the Redirect URI matches what you set in Zoho (usually https://www.google.com).")
    
    auth_code = input("\nPaste the Authorization Code (from the URL) here: ").strip()
    redirect_uri = input("Paste the Redirect URI (default: https://www.google.com): ").strip() or "https://www.google.com"

    # 3. Exchange for Refresh Token
    token_url = f"{accounts_url}/oauth/v2/token"
    data = {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "code": auth_code
    }

    print("\nExchanging code for token...")
    response = requests.post(token_url, data=data)
    res_data = response.json()

    if "refresh_token" in res_data:
        print("\n✅ SUCCESS!")
        print(f"New Refresh Token: {res_data['refresh_token']}")
        print("\nTip: You should copy this into your .env file under ZOHO_REFRESH_TOKEN.")
    else:
        print("\n❌ FAILED")
        print(f"Error Response: {res_data}")

if __name__ == "__main__":
    get_zoho_refresh_token()
