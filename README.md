# Meta Browser Bridge

Firefox WebExtension for inspecting the currently open Meta Business Suite Inbox conversation and syncing the normalized Facebook/Instagram payload to Eleanor Sourcing OS.

The extension does not log in to Meta, store Meta credentials, read cookies, download media, crawl the inbox, continuously scrape conversations, or send customer replies.

## Phase 1 Support

Supported:

- Facebook Messenger via Meta Business Suite
- Instagram via Meta Business Suite

Deferred:

- WhatsApp via Meta Business Suite

## Install For Firefox Development

1. Open `about:debugging`.
2. Select `This Firefox`.
3. Click `Load Temporary Add-on`.
4. Select this project's `manifest.json`.

## Use

1. Open the extension settings page.
   - From the on-page bridge panel, click `Open Settings`.
   - Or open `about:addons`, select `Eleanor Meta Browser Bridge`, and open its preferences/options.
2. Set `Eleanor Base URL`.
3. Set `Browser Bridge Token`.
4. Click `Save`.
5. Open Meta Business Suite at `https://business.facebook.com/`.
6. Open Inbox.
7. Select a Facebook Messenger or Instagram customer.
8. Click `Sync to Eleanor`.
9. Continue chatting normally in Meta.
10. Click `Sync to Eleanor` again when new sourcing information has been collected.

Repeated sync is safe. The extension sends the current normalized thread each time; Eleanor performs message deduplication and sourcing analysis.

## What Gets Extracted

The bridge reads only the conversation currently loaded in the visible Meta Business Suite DOM. It attempts to extract:

- channel: Facebook, Instagram, or Unknown
- strongest available conversation identity
- customer display name, username, and phone when visible
- visible loaded messages
- direction: inbound, outbound, or unknown
- visible text, timestamps, and attachment references
- deterministic SHA-256 message fingerprints
- extraction summary counts

If the bridge cannot confidently classify a channel, message direction, or timestamp, it reports `UNKNOWN` or low confidence instead of inventing data.

## Eleanor Sync

Sync uses:

```text
POST /api/browser-bridge/meta/sync
```

The content script extracts the current conversation, then sends it to the background script. The background script performs the Eleanor request with:

- `Content-Type: application/json`
- `Authorization: Bearer <Browser Bridge Token>`

The token is stored only in extension storage. It is not injected into Meta pages, written to the DOM, or logged.

## Debug Output

The console output includes:

- channel and confidence
- customer object
- conversation identity and confidence
- message count, inbound count, and outbound count
- sync result summary
- raw extracted message preview with direction labels
- messages with fingerprints
- selector diagnostics
- normalized payload

The extension never logs Meta cookies, session tokens, passwords, or Eleanor API secrets.

## Tests

Run the local normalization and fingerprint tests:

```bash
npm test
```

These tests cover deterministic fingerprints, explicit correction changes, Facebook/Instagram channel normalization, attachment-only messages, valid timestamp normalization, timezone-safe local timestamp expectations, repeated FB/IG fingerprint stability, malformed timestamp handling that avoids accidental 1970 dates, sync success/repeat/incremental flows, safe error handling, missing settings, and token log safety.

## Phase 1 Status

Phase 1 is complete for Facebook Messenger and Instagram via Meta Business Suite.

Phase 2 sync is implemented for Facebook and Instagram only. WhatsApp via Meta Business Suite remains deferred.
