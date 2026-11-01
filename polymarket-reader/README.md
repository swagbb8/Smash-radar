# polymarket-reader

Read-only Polymarket US account reader. It pulls balance, positions, open orders, and recent activity using GET requests only, so it can't trade, cancel, or move money.

This repo is public, so the results are **encrypted** to `recipient_pubkey.txt` and saved as `out.enc`. Nothing about the account shows up in the Action logs.

## Setup
Repo **Settings → Secrets and variables → Actions → New repository secret**:
- `PM_KEY_ID` = Key ID
- `PM_SECRET` = Secret Key

## Run
Edit `run.txt` (any change) or use **Actions → Polymarket reader → Run workflow**.
