"""Read-only Polymarket US account reader.

Pulls balance, positions, open orders and recent activity.
Only GET requests to a fixed list of read endpoints - it cannot place,
cancel or modify orders, or move money.

This repo is public, so nothing about the account is printed to the log.
Results are encrypted to RECIPIENT_PUBKEY (X25519 + AES-GCM) and written
to polymarket-reader/out.enc. Only the holder of the matching private key
can read them.

Needs two env vars (GitHub Actions secrets):
  PM_KEY_ID   - Key ID from Polymarket
  PM_SECRET   - Secret Key (base64) from Polymarket
"""

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.asymmetric.x25519 import (
    X25519PrivateKey,
    X25519PublicKey,
)
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

HERE = os.path.dirname(os.path.abspath(__file__))
HOSTS = ["https://api.polymarket.us", "https://gateway.polymarket.us"]

# Read-only endpoints. Nothing else is ever called.
ENDPOINTS = {
    "balance": "/v1/account/balances",
    "positions": "/v1/portfolio/positions",
    "open_orders": "/v1/orders/open",
    "activity": "/v1/portfolio/activities",
}


def load_key():
    key_id = os.environ.get("PM_KEY_ID", "").strip()
    secret_b64 = os.environ.get("PM_SECRET", "").strip()
    if not key_id or not secret_b64:
        sys.exit("Missing PM_KEY_ID or PM_SECRET secret.")
    raw = base64.b64decode(secret_b64)
    if len(raw) == 64:
        seed = raw[:32]
    elif len(raw) == 32:
        seed = raw
    else:
        sys.exit(f"Secret decodes to {len(raw)} bytes; expected 32 or 64.")
    return key_id, Ed25519PrivateKey.from_private_bytes(seed)


def signed_get(host, path, key_id, key):
    ts = str(int(time.time() * 1000))
    sig = base64.b64encode(key.sign(f"{ts}GET{path}".encode())).decode()
    req = urllib.request.Request(
        host + path,
        method="GET",
        headers={
            "X-PM-Access-Key": key_id,
            "X-PM-Timestamp": ts,
            "X-PM-Signature": sig,
            "Accept": "application/json",
            "User-Agent": "polymarket-reader/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode() or "null")


def fetch(path, key_id, key):
    errors = []
    for host in HOSTS:
        try:
            return {"ok": True, "host": host, "data": signed_get(host, path, key_id, key)}
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")[:500]
            errors.append({"host": host, "status": e.code, "body": body})
            if e.code in (401, 403):
                break  # auth problem, other host won't help
        except Exception as e:
            errors.append({"host": host, "error": str(e)})
    return {"ok": False, "errors": errors}


def encrypt(plaintext: bytes) -> str:
    with open(os.path.join(HERE, "recipient_pubkey.txt")) as f:
        recipient = X25519PublicKey.from_public_bytes(base64.b64decode(f.read().strip()))
    eph = X25519PrivateKey.generate()
    shared = eph.exchange(recipient)
    aes_key = HKDF(hashes.SHA256(), 32, salt=None, info=b"pm-reader-v1").derive(shared)
    nonce = os.urandom(12)
    ct = AESGCM(aes_key).encrypt(nonce, plaintext, None)
    eph_pub = eph.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    )
    return base64.b64encode(eph_pub + nonce + ct).decode()


def main():
    key_id, key = load_key()
    results = {name: fetch(path, key_id, key) for name, path in ENDPOINTS.items()}
    results["fetched_at_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    with open(os.path.join(HERE, "out.enc"), "w") as f:
        f.write(encrypt(json.dumps(results).encode()) + "\n")

    # Log only pass/fail per endpoint - no account data.
    for name in ENDPOINTS:
        print(f"{name}: {'ok' if results[name]['ok'] else 'failed'}")


if __name__ == "__main__":
    main()
