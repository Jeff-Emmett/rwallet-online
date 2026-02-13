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

    // ─── View Nav Styles (injected once) ────────────────────────
    let stylesInjected = false;
    function injectViewNavStyles() {
        if (stylesInjected) return;
        stylesInjected = true;
        const style = document.createElement('style');
        style.textContent = `
            .view-nav {
                display: flex; justify-content: center; gap: 4px; margin-top: 12px;
            }
            .view-tab {
                padding: 8px 16px; border-radius: 8px 8px 0 0;
                border: 1px solid rgba(255,255,255,0.08); border-bottom: 2px solid transparent;
                background: rgba(255,255,255,0.02); color: #888;
                text-decoration: none; font-size: 0.85rem; font-weight: 500;
                transition: all 0.2s; display: flex; align-items: center; gap: 6px;
                white-space: nowrap;
            }
            .view-tab:hover { background: rgba(255,255,255,0.06); color: #ccc; }
            .view-tab.active {
                border-bottom-color: #00d4ff; color: #00d4ff;
                background: rgba(0,212,255,0.08);
            }
            .view-icon { font-size: 1rem; }
            @media (max-width: 640px) {
                .view-nav { gap: 2px; }
                .view-tab { padding: 6px 10px; font-size: 0.75rem; }
            }
        `;
        document.head.appendChild(style);
    }

    // ─── View Definitions ───────────────────────────────────────
    const VIEWS = [
        { page: 'wallet-multichain-visualization.html', label: 'Multi-Chain Flow', icon: '&#8644;' },
        { page: 'wallet-timeline-visualization.html',   label: 'Balance River',    icon: '&#8776;' },
        { page: 'wallet-visualization.html',            label: 'Single-Chain Sankey', icon: '&#9776;' },
    ];

    /**
     * Create a standard wallet address input bar for visualization pages.
     * Returns the input element for event binding.
     */
    function createAddressBar(containerId) {
        const { address } = getParams();
        const container = document.getElementById(containerId);
        if (!container) return null;

        injectViewNavStyles();

        // Detect current page for active tab
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';

        // Build view nav tabs
        const viewTabs = VIEWS.map(v => {
            const isActive = currentPage === v.page;
            const href = buildUrl(v.page, address, getParams().chain, getParams().chainId);
            return `<a href="${href}" class="view-tab${isActive ? ' active' : ''}" title="${v.label}">
                <span class="view-icon">${v.icon}</span> ${v.label}
            </a>`;
        }).join('');

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
                <div class="view-nav">${viewTabs}</div>
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
            // Update nav tab hrefs with new address
            container.querySelectorAll('.view-tab').forEach((tab, i) => {
                tab.href = buildUrl(VIEWS[i].page, addr, getParams().chain, getParams().chainId);
            });
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
