/**
 * EncryptID Authentication for rWallet.online
 *
 * Thin wrapper around @encryptid/sdk browser bundle.
 * The SDK provides the full WebAuthn ceremony — this file
 * just migrates the old localStorage key and re-exports the API.
 *
 * To update the SDK bundle:
 *   cd ../encryptid-sdk && bun run build:browser
 *   cp dist/encryptid.browser.js ../rwallet-online/js/encryptid.browser.js
 */

// Migrate old localStorage key to SDK format
(function migrateStorage() {
    const OLD_KEY = 'rwallet_encryptid';
    const NEW_TOKEN_KEY = 'encryptid_token';
    const NEW_USER_KEY = 'encryptid_user';

    const old = localStorage.getItem(OLD_KEY);
    if (old && !localStorage.getItem(NEW_TOKEN_KEY)) {
        try {
            const data = JSON.parse(old);
            if (data.token) localStorage.setItem(NEW_TOKEN_KEY, data.token);
            if (data.did || data.username) {
                localStorage.setItem(NEW_USER_KEY, JSON.stringify({
                    did: data.did,
                    username: data.username,
                    token: data.token,
                }));
            }
            localStorage.removeItem(OLD_KEY);
        } catch { /* ignore parse errors */ }
    }
})();

// The actual EncryptID global is set by encryptid.browser.js (loaded before this file)
// This file only handles the storage migration above.
