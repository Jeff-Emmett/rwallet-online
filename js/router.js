/**
 * Simple URL Router for rWallet.online
 * Manages wallet address and chain state across pages via URL parameters.
 */

const Router = (() => {

    /**
     * Parse URL parameters from current page.
     * Returns { address, chain, chainId }
     */
    function getParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            address: params.get('address') || '',
            chain: params.get('chain') || 'all',
            chainId: params.get('chainId') ? parseInt(params.get('chainId')) : null,
        };
    }

    /**
     * Build a URL with wallet parameters for navigation between viz pages.
     */
    function buildUrl(page, address, chain, chainId) {
        const params = new URLSearchParams();
        if (address) params.set('address', address);
        if (chain && chain !== 'all') params.set('chain', chain);
        if (chainId) params.set('chainId', String(chainId));
        const qs = params.toString();
        return qs ? `${page}?${qs}` : page;
    }

    /**
     * Navigate to a visualization page with current wallet context.
     */
    function navigateTo(page) {
        const { address, chain, chainId } = getParams();
        window.location.href = buildUrl(page, address, chain, chainId);
    }

    /**
     * Update URL parameters without page reload (for filter changes etc.)
     */
    function updateParams(updates) {
        const current = getParams();
        const merged = { ...current, ...updates };
        const params = new URLSearchParams();
        if (merged.address) params.set('address', merged.address);
        if (merged.chain && merged.chain !== 'all') params.set('chain', merged.chain);
        if (merged.chainId) params.set('chainId', String(merged.chainId));
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, '', newUrl);
    }

    /**
     * Validate an Ethereum address format.
     */
    function isValidAddress(address) {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    /**
     * Create a standard wallet address input bar for visualization pages.
     * Returns the input element for event binding.
     */
    function createAddressBar(containerId) {
        const { address } = getParams();
        const container = document.getElementById(containerId);
        if (!container) return null;

        container.innerHTML = `
            <div class="address-bar">
                <div class="address-bar-inner">
                    <a href="index.html" class="back-link" title="Back to rWallet.online">
                        <span class="back-icon">&#8592;</span>
                        <span class="back-text">rWallet</span>
                    </a>
                    <input type="text" id="wallet-input" placeholder="Enter Safe wallet address (0x...)"
                           value="${address}" spellcheck="false" autocomplete="off" />
                    <button id="load-wallet-btn" title="Load wallet">Explore</button>
                </div>
            </div>
        `;

        const input = document.getElementById('wallet-input');
        const btn = document.getElementById('load-wallet-btn');

        function loadWallet() {
            const addr = input.value.trim();
            if (!isValidAddress(addr)) {
                input.style.borderColor = '#f87171';
                setTimeout(() => input.style.borderColor = '', 2000);
                return;
            }
            updateParams({ address: addr });
            // Dispatch custom event for the page to handle
            window.dispatchEvent(new CustomEvent('wallet-changed', { detail: { address: addr } }));
        }

        btn.addEventListener('click', loadWallet);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') loadWallet(); });

        return input;
    }

    // ─── Public API ────────────────────────────────────────────────
    return {
        getParams,
        buildUrl,
        navigateTo,
        updateParams,
        isValidAddress,
        createAddressBar,
    };
})();
