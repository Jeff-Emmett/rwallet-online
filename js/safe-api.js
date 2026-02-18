/**
 * Safe Global API Client for rWallet.online
 * Browser-side client for Safe Transaction Service API
 * Chain config adapted from payment-infra/packages/safe-core/src/chains.ts
 */

const SafeAPI = (() => {
    // ─── Chain Configuration ───────────────────────────────────────
    // Use direct Safe Global API URLs (api.safe.global) to avoid redirect overhead
    const CHAINS = {
        1:     { name: 'Ethereum',  slug: 'eth',   txService: 'https://safe-transaction-mainnet.safe.global',       explorer: 'https://etherscan.io',                color: '#627eea', symbol: 'ETH'  },
        10:    { name: 'Optimism',  slug: 'oeth',  txService: 'https://safe-transaction-optimism.safe.global',      explorer: 'https://optimistic.etherscan.io',      color: '#ff0420', symbol: 'ETH'  },
        100:   { name: 'Gnosis',    slug: 'gno',   txService: 'https://safe-transaction-gnosis-chain.safe.global',  explorer: 'https://gnosisscan.io',                color: '#04795b', symbol: 'xDAI' },
        137:   { name: 'Polygon',   slug: 'pol',   txService: 'https://safe-transaction-polygon.safe.global',       explorer: 'https://polygonscan.com',              color: '#8247e5', symbol: 'POL'  },
        8453:  { name: 'Base',      slug: 'base',  txService: 'https://safe-transaction-base.safe.global',          explorer: 'https://basescan.org',                 color: '#0052ff', symbol: 'ETH'  },
        42161: { name: 'Arbitrum',  slug: 'arb1',  txService: 'https://safe-transaction-arbitrum.safe.global',      explorer: 'https://arbiscan.io',                  color: '#28a0f0', symbol: 'ETH'  },
        43114: { name: 'Avalanche', slug: 'avax',  txService: 'https://safe-transaction-avalanche.safe.global',     explorer: 'https://snowtrace.io',                 color: '#e84142', symbol: 'AVAX' },
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

    /**
     * Fetch JSON with retry + exponential backoff on 429.
     * Returns null on 404. Throws on other errors.
     */
    async function fetchJSON(url, retries = 5) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            const res = await fetch(url);
            if (res.status === 404) return null;
            if (res.status === 429) {
                // Start at 2s, then 4s, 8s, 16s, 32s
                const delay = Math.min(2000 * Math.pow(2, attempt), 32000);
                console.warn(`429 rate limited, retry ${attempt + 1}/${retries} in ${delay}ms...`);
                await sleep(delay);
                continue;
            }
            if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText} (${url})`);
            return res.json();
        }
        // Exhausted retries — return null instead of throwing to be graceful
        console.error(`Rate limited after ${retries} retries, skipping: ${url}`);
        return null;
    }

    /**
     * Run async tasks with a concurrency limit.
     * Returns array of results in original order.
     */
    async function pooled(tasks, concurrency = 2) {
        const results = new Array(tasks.length);
        let next = 0;

        async function worker() {
            while (next < tasks.length) {
                const i = next++;
                results[i] = await tasks[i]();
            }
        }

        const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
        await Promise.all(workers);
        return results;
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
            balanceFormatted: b.token
                ? (parseFloat(b.balance) / Math.pow(10, b.token.decimals)).toFixed(b.token.decimals > 6 ? 4 : 2)
                : (parseFloat(b.balance) / 1e18).toFixed(4),
            symbol: b.token ? b.token.symbol : CHAINS[chainId]?.symbol || 'ETH',
            fiatBalance: b.fiatBalance || '0',
            fiatConversion: b.fiatConversion || '0',
        }));
    }

    /**
     * Fetch all multisig transactions (paginated, with inter-page delays)
     */
    async function getAllMultisigTransactions(address, chainId, limit = 100) {
        const allTxs = [];
        let url = apiUrl(chainId, `/safes/${address}/multisig-transactions/?limit=${limit}&ordering=-executionDate`);

        while (url) {
            const data = await fetchJSON(url);
            if (!data || !data.results) break;
            allTxs.push(...data.results);
            url = data.next;
            if (allTxs.length >= 500) break;
            if (url) await sleep(400);
        }
        return allTxs;
    }

    /**
     * Fetch all incoming transfers (paginated, with inter-page delays)
     */
    async function getAllIncomingTransfers(address, chainId, limit = 100) {
        const allTransfers = [];
        let url = apiUrl(chainId, `/safes/${address}/incoming-transfers/?limit=${limit}`);

        while (url) {
            const data = await fetchJSON(url);
            if (!data || !data.results) break;
            allTransfers.push(...data.results);
            url = data.next;
            if (allTransfers.length >= 500) break;
            if (url) await sleep(400);
        }
        return allTransfers;
    }

    /**
     * Fetch all-transactions (combines multisig + module + incoming, with inter-page delays)
     * Returns enriched transactions with transfers[] containing proper tokenInfo.
     */
    async function getAllTransactions(address, chainId, limit = 100) {
        const allTxs = [];
        let url = apiUrl(chainId, `/safes/${address}/all-transactions/?limit=${limit}&ordering=-executionDate&executed=true`);

        while (url) {
            const data = await fetchJSON(url);
            if (!data || !data.results) break;
            allTxs.push(...data.results);
            url = data.next;
            if (allTxs.length >= 3000) break;
            if (url) await sleep(400);
        }
        return allTxs;
    }

    /**
     * Detect which chains have a Safe deployed for this address.
     * Sequential with delays to avoid rate limits across the shared Safe API.
     * Returns array of { chainId, chain, safeInfo }
     */
    async function detectSafeChains(address) {
        const entries = Object.entries(CHAINS);
        const results = [];

        for (const [chainId, chain] of entries) {
            try {
                const info = await getSafeInfo(address, parseInt(chainId));
                if (info) results.push({ chainId: parseInt(chainId), chain, safeInfo: info });
            } catch (e) {
                // skip failed chains
            }
            await sleep(500);
        }

        return results;
    }

    /**
     * Fetch comprehensive wallet data for a single chain.
     * Uses all-transactions endpoint for enriched transfer data with proper tokenInfo.
     * Returns { chainId, info, balances, outgoing, incoming }
     */
    async function fetchChainData(address, chainId) {
        const info = await getSafeInfo(address, chainId);
        await sleep(600);
        const balances = await getBalances(address, chainId);
        await sleep(600);

        // all-transactions includes transfers[] with proper tokenInfo (decimals, symbol)
        // This is more accurate than parsing dataDecoded which loses decimal info
        const allTxs = await getAllTransactions(address, chainId);

        const addrLower = address.toLowerCase();
        const outgoing = [];
        const incoming = [];

        for (const tx of allTxs) {
            // Collect multisig transactions as outgoing (they have transfers[] with tokenInfo)
            if (tx.txType === 'MULTISIG_TRANSACTION') {
                outgoing.push(tx);
            }

            // Extract incoming transfers from all transaction transfer events
            if (tx.transfers) {
                for (const t of tx.transfers) {
                    if (t.to?.toLowerCase() === addrLower &&
                        t.from?.toLowerCase() !== addrLower) {
                        incoming.push({
                            ...t,
                            executionDate: t.executionDate || tx.executionDate,
                        });
                    }
                }
            }
        }

        return { chainId, info, balances, outgoing, incoming };
    }

    /**
     * Fetch wallet data across all detected chains.
     * Sequential to avoid overwhelming the Safe API rate limits.
     * Failures are non-fatal: failed chains are skipped.
     * Returns Map<chainId, chainData>
     */
    async function fetchAllChainsData(address, detectedChains) {
        const dataMap = new Map();

        for (const { chainId } of detectedChains) {
            try {
                const data = await fetchChainData(address, chainId);
                dataMap.set(chainId, data);
            } catch (e) {
                console.warn(`Failed to fetch chain ${chainId}, skipping:`, e.message);
            }
            await sleep(500);
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
