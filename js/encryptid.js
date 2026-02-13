/**
 * EncryptID Authentication for rWallet.online
 *
 * Adds optional passkey-based identity to the static wallet explorer.
 * When authenticated, the user gets a persistent identity and can
 * associate wallet addresses with their account.
 */

const EncryptID = (() => {
    const SERVER = 'https://encryptid.jeffemmett.com';
    const STORAGE_KEY = 'rwallet_encryptid';

    // ─── Helpers ─────────────────────────────────────────────────
    function toBase64url(buffer) {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '');
    }

    function fromBase64url(str) {
        return Uint8Array.from(
            atob(str.replace(/-/g, '+').replace(/_/g, '/')),
            c => c.charCodeAt(0)
        );
    }

    function getStoredAuth() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    function setStoredAuth(auth) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
    }

    function clearStoredAuth() {
        localStorage.removeItem(STORAGE_KEY);
    }

    // ─── Authentication ──────────────────────────────────────────

    async function authenticate() {
        // Step 1: Get challenge
        const startRes = await fetch(`${SERVER}/api/auth/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        const { options } = await startRes.json();

        // Step 2: WebAuthn ceremony
        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge: fromBase64url(options.challenge),
                rpId: options.rpId,
                userVerification: options.userVerification,
                timeout: options.timeout,
                allowCredentials: options.allowCredentials?.map(c => ({
                    type: c.type,
                    id: fromBase64url(c.id),
                    transports: c.transports,
                })),
            },
        });

        const response = assertion.response;

        // Step 3: Complete
        const completeRes = await fetch(`${SERVER}/api/auth/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                challenge: options.challenge,
                credential: {
                    credentialId: assertion.id,
                    authenticatorData: toBase64url(response.authenticatorData),
                    clientDataJSON: toBase64url(response.clientDataJSON),
                    signature: toBase64url(response.signature),
                    userHandle: response.userHandle ? toBase64url(response.userHandle) : null,
                },
            }),
        });

        const result = await completeRes.json();
        if (!result.success) throw new Error(result.error || 'Authentication failed');

        const auth = { token: result.token, did: result.did, username: result.username };
        setStoredAuth(auth);
        return auth;
    }

    async function register(username) {
        // Step 1: Get registration options
        const startRes = await fetch(`${SERVER}/api/register/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, displayName: username }),
        });
        const { options, userId } = await startRes.json();

        // Step 2: WebAuthn ceremony
        const credential = await navigator.credentials.create({
            publicKey: {
                challenge: fromBase64url(options.challenge),
                rp: options.rp,
                user: {
                    id: fromBase64url(options.user.id),
                    name: options.user.name,
                    displayName: options.user.displayName,
                },
                pubKeyCredParams: options.pubKeyCredParams,
                authenticatorSelection: options.authenticatorSelection,
                timeout: options.timeout,
                attestation: options.attestation,
            },
        });

        const response = credential.response;

        // Step 3: Complete
        const completeRes = await fetch(`${SERVER}/api/register/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                challenge: options.challenge,
                userId,
                username,
                credential: {
                    credentialId: credential.id,
                    publicKey: toBase64url(response.getPublicKey?.() || response.attestationObject),
                    attestationObject: toBase64url(response.attestationObject),
                    clientDataJSON: toBase64url(response.clientDataJSON),
                    transports: response.getTransports?.() || [],
                },
            }),
        });

        const result = await completeRes.json();
        if (!result.success) throw new Error(result.error || 'Registration failed');

        const auth = { token: result.token, did: result.did, username };
        setStoredAuth(auth);
        return auth;
    }

    function logout() {
        clearStoredAuth();
    }

    function isAuthenticated() {
        return !!getStoredAuth();
    }

    function getUser() {
        return getStoredAuth();
    }

    // ─── UI Component ────────────────────────────────────────────

    /**
     * Render a passkey auth button into the specified container.
     * Shows sign-in when anonymous, username + sign-out when authenticated.
     */
    function renderAuthButton(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        function render() {
            const auth = getStoredAuth();

            if (auth) {
                container.innerHTML = `
                    <div style="display:flex;align-items:center;gap:10px;justify-content:center;">
                        <span style="color:var(--text-dim);font-size:0.85rem;">
                            Signed in as <strong style="color:var(--primary);">${auth.username || auth.did?.slice(0, 16) + '...'}</strong>
                        </span>
                        <button id="eid-signout" style="background:none;border:1px solid var(--border);color:var(--text-dim);padding:4px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;">
                            Sign out
                        </button>
                    </div>
                `;
                document.getElementById('eid-signout').addEventListener('click', () => {
                    logout();
                    render();
                });
            } else {
                container.innerHTML = `
                    <div style="display:flex;align-items:center;gap:8px;justify-content:center;">
                        <button id="eid-signin" style="background:none;border:1px solid var(--border);color:var(--text-dim);padding:6px 16px;border-radius:8px;cursor:pointer;font-size:0.85rem;display:flex;align-items:center;gap:6px;transition:all 0.2s;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="10" r="3"/><path d="M12 13v8"/><path d="M9 18h6"/><circle cx="12" cy="10" r="7"/>
                            </svg>
                            Sign in with Passkey
                        </button>
                    </div>
                `;
                const btn = document.getElementById('eid-signin');
                btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'var(--primary)'; btn.style.color = 'var(--primary)'; });
                btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'var(--border)'; btn.style.color = 'var(--text-dim)'; });
                btn.addEventListener('click', async () => {
                    btn.textContent = 'Authenticating...';
                    btn.disabled = true;
                    try {
                        await authenticate();
                        render();
                    } catch (e) {
                        if (e.name === 'NotAllowedError') {
                            // No passkey found — prompt to register
                            const name = prompt('No passkey found. Create one?\nEnter a username:');
                            if (name) {
                                try {
                                    await register(name.trim());
                                    render();
                                } catch (re) {
                                    alert('Registration failed: ' + re.message);
                                    render();
                                }
                            } else {
                                render();
                            }
                        } else {
                            alert('Sign in failed: ' + e.message);
                            render();
                        }
                    }
                });
            }
        }

        render();
    }

    // ─── Auth Gate ──────────────────────────────────────────────

    /**
     * Require authentication before accessing a page.
     * If not authenticated, redirects to index.html with a return URL.
     * Call at the top of visualization pages.
     */
    function requireAuth() {
        if (isAuthenticated()) return true;
        const returnUrl = encodeURIComponent(window.location.href);
        window.location.replace(`/index.html?login=required&return=${returnUrl}`);
        return false;
    }

    // ─── Public API ──────────────────────────────────────────────
    return {
        authenticate,
        register,
        logout,
        isAuthenticated,
        getUser,
        renderAuthButton,
        requireAuth,
    };
})();
