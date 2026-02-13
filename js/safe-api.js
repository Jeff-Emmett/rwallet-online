/**
 * Safe Global API Client for rWallet.online
 * Browser-side client for Safe Transaction Service API
 * Chain config adapted from payment-infra/packages/safe-core/src/chains.ts
 */

const SafeAPI = (() => {
    // ─── Chain Configuration ───────────────────────────────────────
    const CHAINS = {
        1:     { name: 'Ethereum',  slug: 'mainnet',      txService: 'https://safe-transaction-mainnet.safe.global',       explorer: 'https://etherscan.io',                color: '#627eea', symbol: 'ETH'  },
        10:    { name: 'Optimism',  slug: 'optimism',      txService: 'https://safe-transaction-optimism.safe.global',      explorer: 'https://optimistic.etherscan.io',      color: '#ff0420', symbol: 'ETH'  },
        100:   { name: 'Gnosis',    slug: 'gnosis-chain',  txService: 'https://safe-transaction-gnosis-chain.safe.global',  explorer: 'https://gnosisscan.io',                color: '#04795b', symbol: 'xDAI' },
        137:   { name: 'Polygon',   slug: 'polygon',       txService: 'https://safe-transaction-polygon.safe.global',       explorer: 'https://polygonscan.com',              color: '#8247e5', symbol: 'POL'  },
        8453:  { name: 'Base',      slug: 'base',          txService: 'https://safe-transaction-base.safe.global',          explorer: 'https://basescan.org',                 color: '#0052ff', symbol: 'ETH'  },
        42161: { name: 'Arbitrum',  slug: 'arbitrum',      txService: 'https://safe-transaction-arbitrum.safe.global',      explorer: 'https://arbiscan.io',                  color: '#28a0f0', symbol: 'ETH'  },
        43114: { name: 'Avalanche', slug: 'avalanche',     txService: 'https://safe-transaction-avalanche.safe.global',     explorer: 'https://snowtrace.io',                 color: '#e84142', symbol: 'AVAX' },
    };

    // ─── Helpers ───────────────────────────────────────────────────
    function getChain(chainId) {
        const chain = CHAINS[chainId];
        if (!chain) throw new Error(`Unsupported chain ID: ${chainId}`);
        return chain;
    }

    function apiUrl(chainId, path) {
        return `${getChain(chainId).txService}/api/v1${path}`;
    }

    async function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function fetchJSON(url, retries = 4) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            const res = await fetch(url);
            if (res.status === 404) return null;
            if (res.status === 429) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                console.warn(`Rate limited (429), retrying in ${delay}ms... (${url})`);
                await sleep(delay);
                continue;
            }
            if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText} (${url})`);
            return res.json();
        }
        throw new Error(`Rate limited after ${retries} retries: ${url}`);
    }

    // ─── Core API Methods ──────────────────────────────────────────

    /**
     * Get Safe info (owners, threshold, nonce, etc.)
     */
    async function getSafeInfo(address, chainId) {
        const data = await fetchJSON(apiUrl(chainId, `/safes/${address}/`));
        if (!data) return null;
        return {
            address: data.address,
            nonce: data.nonce,
            threshold: data.threshold,
            owners: data.owners,
            modules: data.modules,
            fallbackHandler: data.fallbackHandler,
            guard: data.guard,
            version: data.version,
            chainId,
        };
    }

    /**
     * Get token + native balances
     */
    async function getBalances(address, chainId) {
        const data = await fetchJSON(apiUrl(chainId, `/safes/${address}/balances/?trusted=true&exclude_spam=true`));
        if (!data) return [];
        return data.map(b => ({
            tokenAddress: b.tokenAddress,
            token: b.token ? {
                name: b.token.name,
                symbol: b.token.symbol,
                decimals: b.token.decimals,
                logoUri: b.token.logoUri,
            } : null,
            balance: b.balance,
            // Human-readable balance
            balanceFormatted: b.token
                ? (parseFloat(b.balance) / Math.pow(10, b.token.decimals)).toFixed(b.token.decimals > 6 ? 4 : 2)
                : (parseFloat(b.balance) / 1e18).toFixed(4),
            symbol: b.token ? b.token.symbol : CHAINS[chainId]?.symbol || 'ETH',
            fiatBalance: b.fiatBalance || '0',
            fiatConversion: b.fiatConversion || '0',
        }));
    }

    /**
     * Fetch all multisig transactions (paginated)
     */
    async function getAllMultisigTransactions(address, chainId, limit = 100) {
        const allTxs = [];
        let url = apiUrl(chainId, `/safes/${address}/multisig-transactions/?limit=${limit}&ordering=-executionDate`);

        while (url) {
            const data = await fetchJSON(url);
            if (!data || !data.results) break;
            allTxs.push(...data.results);
            url = data.next;
            // Safety: cap at 1000 transactions
            if (allTxs.length >= 1000) break;
        }
        return allTxs;
    }

    /**
     * Fetch all incoming transfers (paginated)
     */
    async function getAllIncomingTransfers(address, chainId, limit = 100) {
        const allTransfers = [];
        let url = apiUrl(chainId, `/safes/${address}/incoming-transfers/?limit=${limit}`);

        while (url) {
            const data = await fetchJSON(url);
            if (!data || !data.results) break;
            allTransfers.push(...data.results);
            url = data.next;
            if (allTransfers.length >= 1000) break;
        }
        return allTransfers;
    }

    /**
     * Fetch all-transactions (combines multisig + module + incoming)
     */
    async function getAllTransactions(address, chainId, limit = 100) {
        const allTxs = [];
        let url = apiUrl(chainId, `/safes/${address}/all-transactions/?limit=${limit}&ordering=-executionDate&executed=true`);

        while (url) {
            const data = await fetchJSON(url);
            if (!data || !data.results) break;
            allTxs.push(...data.results);
            url = data.next;
            if (allTxs.length >= 1000) break;
        }
        return allTxs;
    }

    /**
     * Detect which chains have a Safe deployed for this address.
     * Checks all supported chains in parallel.
     * Returns array of { chainId, chain, safeInfo }
     */
    async function detectSafeChains(address) {
        const entries = Object.entries(CHAINS);
        const results = [];

        // Check chains sequentially with small delay to avoid rate limits
        for (const [chainId, chain] of entries) {
            try {
                const info = await getSafeInfo(address, parseInt(chainId));
                if (info) results.push({ chainId: parseInt(chainId), chain, safeInfo: info });
            } catch (e) {
                // Chain doesn't have this Safe or API error - skip
            }
            await sleep(150);
        }

        return results;
    }

    /**
     * Fetch comprehensive wallet data for a single chain.
     * Returns { info, balances, outgoing, incoming }
     */
    async function fetchChainData(address, chainId) {
        const [info, balances, outgoing, incoming] = await Promise.all([
            getSafeInfo(address, chainId),
            getBalances(address, chainId),
            getAllMultisigTransactions(address, chainId),
            getAllIncomingTransfers(address, chainId),
        ]);

        return { chainId, info, balances, outgoing, incoming };
    }

    /**
     * Fetch wallet data across all detected chains.
     * Returns Map<chainId, chainData>
     */
    async function fetchAllChainsData(address, detectedChains) {
        const dataMap = new Map();

        // Fetch chains sequentially to avoid rate limits
        for (const { chainId } of detectedChains) {
            const data = await fetchChainData(address, chainId);
            dataMap.set(chainId, data);
            await sleep(200);
        }

        return dataMap;
    }

    // ─── Public API ────────────────────────────────────────────────
    return {
        CHAINS,
        getChain,
        getSafeInfo,
        getBalances,
        getAllMultisigTransactions,
        getAllIncomingTransfers,
        getAllTransactions,
        detectSafeChains,
        fetchChainData,
        fetchAllChainsData,
    };
})();
