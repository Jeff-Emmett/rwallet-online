/**
 * Data Transform Module for rWallet.online
 * Converts Safe Global API responses into formats expected by D3 visualizations.
 */

const DataTransform = (() => {

    // ─── Helpers ───────────────────────────────────────────────────

    function shortenAddress(addr) {
        if (!addr || addr.length < 10) return addr || 'Unknown';
        return addr.slice(0, 6) + '...' + addr.slice(-4);
    }

    function explorerLink(address, chainId) {
        const chain = SafeAPI.CHAINS[chainId];
        if (!chain) return '#';
        return `${chain.explorer}/address/${address}`;
    }

    function txExplorerLink(txHash, chainId) {
        const chain = SafeAPI.CHAINS[chainId];
        if (!chain) return '#';
        return `${chain.explorer}/tx/${txHash}`;
    }

    /**
     * Extract token value in human-readable form from a transfer object.
     * Handles both ERC20 and native transfers.
     */
    function getTransferValue(transfer) {
        if (transfer.type === 'ERC20_TRANSFER' || transfer.transferType === 'ERC20_TRANSFER') {
            const decimals = transfer.tokenInfo?.decimals || transfer.token?.decimals || 18;
            const raw = transfer.value || '0';
            return parseFloat(raw) / Math.pow(10, decimals);
        }
        if (transfer.type === 'ETHER_TRANSFER' || transfer.transferType === 'ETHER_TRANSFER') {
            return parseFloat(transfer.value || '0') / 1e18;
        }
        return 0;
    }

    function getTokenSymbol(transfer) {
        return transfer.tokenInfo?.symbol || transfer.token?.symbol || 'ETH';
    }

    function getTokenName(transfer) {
        return transfer.tokenInfo?.name || transfer.token?.name || 'Native';
    }

    // ─── Stablecoin USD estimation ─────────────────────────────────

    const STABLECOINS = new Set([
        'USDC', 'USDT', 'DAI', 'WXDAI', 'BUSD', 'TUSD', 'USDP', 'FRAX',
        'LUSD', 'GUSD', 'sUSD', 'USDD', 'USDGLO', 'USD+', 'USDe', 'crvUSD',
        'GHO', 'PYUSD', 'DOLA', 'Yield-USD', 'yUSD',
    ]);

    function estimateUSD(value, symbol) {
        // Stablecoins ≈ $1
        if (STABLECOINS.has(symbol)) return value;
        // We can't price non-stablecoins without an oracle - return value as-is
        // The visualization will show token amounts for non-stablecoins
        return null;
    }

    // ─── Transform: Outgoing Multisig Transactions ─────────────────

    /**
     * Parse a multisig transaction's ERC20 transfers from dataDecoded.
     * Returns array of { to, value, token, symbol, decimals }
     */
    function parseMultisigTransfers(tx) {
        const transfers = [];

        // Direct ETH/native transfer
        if (tx.value && tx.value !== '0') {
            transfers.push({
                to: tx.to,
                value: parseFloat(tx.value) / 1e18,
                token: null,
                symbol: SafeAPI.CHAINS[tx.chainId]?.symbol || 'ETH',
                usd: null,
            });
        }

        // ERC20 transfer from decoded data
        if (tx.dataDecoded) {
            const method = tx.dataDecoded.method;
            const params = tx.dataDecoded.parameters || [];

            if (method === 'transfer') {
                const to = params.find(p => p.name === 'to')?.value;
                const rawValue = params.find(p => p.name === 'value')?.value || '0';
                // We'll try to identify the token from the `to` contract address
                // For now, use 18 decimals as default
                const value = parseFloat(rawValue) / 1e18;
                transfers.push({ to, value, token: tx.to, symbol: '???', usd: null });
            }

            // MultiSend (batched transactions)
            if (method === 'multiSend') {
                const txsParam = params.find(p => p.name === 'transactions');
                if (txsParam && txsParam.valueDecoded) {
                    for (const innerTx of txsParam.valueDecoded) {
                        if (innerTx.value && innerTx.value !== '0') {
                            transfers.push({
                                to: innerTx.to,
                                value: parseFloat(innerTx.value) / 1e18,
                                token: null,
                                symbol: SafeAPI.CHAINS[tx.chainId]?.symbol || 'ETH',
                                usd: null,
                            });
                        }
                        if (innerTx.dataDecoded?.method === 'transfer') {
                            const to2 = innerTx.dataDecoded.parameters?.find(p => p.name === 'to')?.value;
                            const raw2 = innerTx.dataDecoded.parameters?.find(p => p.name === 'value')?.value || '0';
                            const val2 = parseFloat(raw2) / 1e18;
                            transfers.push({ to: to2, value: val2, token: innerTx.to, symbol: '???', usd: null });
                        }
                    }
                }
            }
        }

        return transfers;
    }

    // ─── Transform: Timeline Data (for Balance River) ──────────────

    /**
     * Transform incoming transfers + outgoing multisig txs into timeline format.
     * Returns sorted array of { date, type, amount, token, usd, chain, from/to }
     */
    function transformToTimelineData(chainDataMap, safeAddress) {
        const timeline = [];

        for (const [chainId, data] of chainDataMap) {
            const chainName = SafeAPI.CHAINS[chainId]?.name.toLowerCase() || `chain-${chainId}`;

            // Incoming transfers
            if (data.incoming) {
                for (const transfer of data.incoming) {
                    const value = getTransferValue(transfer);
                    const symbol = getTokenSymbol(transfer);
                    if (value <= 0) continue;

                    const usd = estimateUSD(value, symbol);
                    timeline.push({
                        date: transfer.executionDate || transfer.blockTimestamp || transfer.timestamp,
                        type: 'in',
                        amount: value,
                        token: symbol,
                        usd: usd !== null ? usd : value, // fallback to raw value
                        hasUsdEstimate: usd !== null,
                        chain: chainName,
                        chainId,
                        from: shortenAddress(transfer.from),
                        fromFull: transfer.from,
                    });
                }
            }

            // Outgoing multisig transactions
            if (data.outgoing) {
                for (const tx of data.outgoing) {
                    if (!tx.isExecuted) continue;

                    // Parse transfers from the transaction
                    const txTransfers = [];

                    // Check transfers array if available
                    if (tx.transfers && tx.transfers.length > 0) {
                        for (const t of tx.transfers) {
                            if (t.from?.toLowerCase() === safeAddress.toLowerCase()) {
                                const value = getTransferValue(t);
                                const symbol = getTokenSymbol(t);
                                if (value > 0) {
                                    txTransfers.push({
                                        to: t.to,
                                        value,
                                        symbol,
                                        usd: estimateUSD(value, symbol),
                                    });
                                }
                            }
                        }
                    }

                    // Fallback: try parsing from dataDecoded or direct value
                    if (txTransfers.length === 0) {
                        // Direct ETH/native value
                        if (tx.value && tx.value !== '0') {
                            const val = parseFloat(tx.value) / 1e18;
                            const sym = SafeAPI.CHAINS[chainId]?.symbol || 'ETH';
                            txTransfers.push({ to: tx.to, value: val, symbol: sym, usd: estimateUSD(val, sym) });
                        }

                        // ERC20 from decoded data
                        if (tx.dataDecoded?.method === 'transfer') {
                            const params = tx.dataDecoded.parameters || [];
                            const to = params.find(p => p.name === 'to')?.value;
                            const rawVal = params.find(p => p.name === 'value')?.value || '0';
                            // Try to get token info from tokenAddress
                            const decimals = 18; // default
                            const val = parseFloat(rawVal) / Math.pow(10, decimals);
                            txTransfers.push({ to, value: val, symbol: 'Token', usd: null });
                        }

                        // MultiSend
                        if (tx.dataDecoded?.method === 'multiSend') {
                            const txsParam = tx.dataDecoded.parameters?.find(p => p.name === 'transactions');
                            if (txsParam?.valueDecoded) {
                                for (const inner of txsParam.valueDecoded) {
                                    if (inner.value && inner.value !== '0') {
                                        const val = parseFloat(inner.value) / 1e18;
                                        const sym = SafeAPI.CHAINS[chainId]?.symbol || 'ETH';
                                        txTransfers.push({ to: inner.to, value: val, symbol: sym, usd: estimateUSD(val, sym) });
                                    }
                                    if (inner.dataDecoded?.method === 'transfer') {
                                        const to2 = inner.dataDecoded.parameters?.find(p => p.name === 'to')?.value;
                                        const raw2 = inner.dataDecoded.parameters?.find(p => p.name === 'value')?.value || '0';
                                        const val2 = parseFloat(raw2) / 1e18;
                                        txTransfers.push({ to: to2, value: val2, symbol: 'Token', usd: null });
                                    }
                                }
                            }
                        }
                    }

                    for (const t of txTransfers) {
                        const usd = t.usd !== null ? t.usd : t.value;
                        timeline.push({
                            date: tx.executionDate,
                            type: 'out',
                            amount: t.value,
                            token: t.symbol,
                            usd: usd,
                            hasUsdEstimate: t.usd !== null,
                            chain: chainName,
                            chainId,
                            to: shortenAddress(t.to),
                            toFull: t.to,
                        });
                    }
                }
            }
        }

        // Sort by date
        return timeline
            .filter(t => t.date)
            .map(t => ({ ...t, date: new Date(t.date) }))
            .sort((a, b) => a.date - b.date);
    }

    // ─── Transform: Sankey Data (for single-chain flow) ────────────

    /**
     * Build Sankey nodes & links from a single chain's data.
     * Returns { nodes: [{name, type}], links: [{source, target, value, token}] }
     */
    function transformToSankeyData(chainData, safeAddress) {
        const nodeMap = new Map(); // address → index
        const nodes = [];
        const links = [];
        const walletLabel = 'Safe Wallet';

        function getNodeIndex(address, type) {
            // For the safe wallet, always use the same key
            const key = address.toLowerCase() === safeAddress.toLowerCase()
                ? 'wallet'
                : `${type}:${address.toLowerCase()}`;

            if (!nodeMap.has(key)) {
                const idx = nodes.length;
                nodeMap.set(key, idx);
                const label = address.toLowerCase() === safeAddress.toLowerCase()
                    ? walletLabel
                    : shortenAddress(address);
                nodes.push({ name: label, type, address });
            }
            return nodeMap.get(key);
        }

        // Wallet node always first
        getNodeIndex(safeAddress, 'wallet');

        // Aggregate inflows by source address + token
        const inflowAgg = new Map();
        if (chainData.incoming) {
            for (const transfer of chainData.incoming) {
                const value = getTransferValue(transfer);
                const symbol = getTokenSymbol(transfer);
                if (value <= 0 || !transfer.from) continue;

                const key = `${transfer.from.toLowerCase()}:${symbol}`;
                const existing = inflowAgg.get(key) || { from: transfer.from, value: 0, symbol };
                existing.value += value;
                inflowAgg.set(key, existing);
            }
        }

        // Add inflow links
        for (const [, agg] of inflowAgg) {
            const sourceIdx = getNodeIndex(agg.from, 'source');
            const walletIdx = nodeMap.get('wallet');
            links.push({
                source: sourceIdx,
                target: walletIdx,
                value: agg.value,
                token: agg.symbol,
            });
        }

        // Aggregate outflows by target address + token
        const outflowAgg = new Map();
        if (chainData.outgoing) {
            for (const tx of chainData.outgoing) {
                if (!tx.isExecuted) continue;

                // Direct value transfer
                if (tx.value && tx.value !== '0' && tx.to) {
                    const val = parseFloat(tx.value) / 1e18;
                    const sym = SafeAPI.CHAINS[chainData.chainId]?.symbol || 'ETH';
                    const key = `${tx.to.toLowerCase()}:${sym}`;
                    const existing = outflowAgg.get(key) || { to: tx.to, value: 0, symbol: sym };
                    existing.value += val;
                    outflowAgg.set(key, existing);
                }

                // ERC20 transfer
                if (tx.dataDecoded?.method === 'transfer') {
                    const params = tx.dataDecoded.parameters || [];
                    const to = params.find(p => p.name === 'to')?.value;
                    const rawVal = params.find(p => p.name === 'value')?.value || '0';
                    if (to) {
                        const val = parseFloat(rawVal) / 1e18;
                        const key = `${to.toLowerCase()}:Token`;
                        const existing = outflowAgg.get(key) || { to, value: 0, symbol: 'Token' };
                        existing.value += val;
                        outflowAgg.set(key, existing);
                    }
                }

                // MultiSend
                if (tx.dataDecoded?.method === 'multiSend') {
                    const txsParam = tx.dataDecoded.parameters?.find(p => p.name === 'transactions');
                    if (txsParam?.valueDecoded) {
                        for (const inner of txsParam.valueDecoded) {
                            if (inner.value && inner.value !== '0' && inner.to) {
                                const val = parseFloat(inner.value) / 1e18;
                                const sym = SafeAPI.CHAINS[chainData.chainId]?.symbol || 'ETH';
                                const key = `${inner.to.toLowerCase()}:${sym}`;
                                const existing = outflowAgg.get(key) || { to: inner.to, value: 0, symbol: sym };
                                existing.value += val;
                                outflowAgg.set(key, existing);
                            }
                            if (inner.dataDecoded?.method === 'transfer') {
                                const to2 = inner.dataDecoded.parameters?.find(p => p.name === 'to')?.value;
                                const raw2 = inner.dataDecoded.parameters?.find(p => p.name === 'value')?.value || '0';
                                if (to2) {
                                    const val2 = parseFloat(raw2) / 1e18;
                                    const key = `${to2.toLowerCase()}:Token`;
                                    const existing = outflowAgg.get(key) || { to: to2, value: 0, symbol: 'Token' };
                                    existing.value += val2;
                                    outflowAgg.set(key, existing);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Add outflow links
        const walletIdx = nodeMap.get('wallet');
        for (const [, agg] of outflowAgg) {
            const targetIdx = getNodeIndex(agg.to, 'target');
            links.push({
                source: walletIdx,
                target: targetIdx,
                value: agg.value,
                token: agg.symbol,
            });
        }

        // Filter out tiny values (noise)
        const maxValue = Math.max(...links.map(l => l.value), 1);
        const threshold = maxValue * 0.001; // 0.1% of max
        const filteredLinks = links.filter(l => l.value >= threshold);

        return { nodes, links: filteredLinks };
    }

    // ─── Transform: Multi-Chain Flow Data ──────────────────────────

    /**
     * Build multi-chain flow visualization data.
     * Returns { chainStats, flowData, allTransfers }
     */
    function transformToMultichainData(chainDataMap, safeAddress) {
        const chainStats = {};
        const flowData = {};
        const allTransfers = { incoming: [], outgoing: [] };
        let totalTransfers = 0;
        let totalInflow = 0;
        let totalOutflow = 0;
        const allAddresses = new Set();
        let minDate = null;
        let maxDate = null;

        for (const [chainId, data] of chainDataMap) {
            const chainName = SafeAPI.CHAINS[chainId]?.name.toLowerCase() || `chain-${chainId}`;
            let chainTransfers = 0;
            let chainInflow = 0;
            let chainOutflow = 0;
            const chainAddresses = new Set();
            let chainMinDate = null;
            let chainMaxDate = null;
            const flows = [];

            // Incoming
            const inflowAgg = new Map();
            if (data.incoming) {
                for (const transfer of data.incoming) {
                    const value = getTransferValue(transfer);
                    const symbol = getTokenSymbol(transfer);
                    if (value <= 0) continue;

                    const usd = estimateUSD(value, symbol);
                    const usdVal = usd !== null ? usd : value;
                    chainTransfers++;
                    chainInflow += usdVal;
                    if (transfer.from) {
                        chainAddresses.add(transfer.from.toLowerCase());
                        allAddresses.add(transfer.from.toLowerCase());
                    }

                    const date = transfer.executionDate || transfer.blockTimestamp;
                    if (date) {
                        const d = new Date(date);
                        if (!chainMinDate || d < chainMinDate) chainMinDate = d;
                        if (!chainMaxDate || d > chainMaxDate) chainMaxDate = d;
                    }

                    // Aggregate for flow diagram
                    const from = transfer.from || 'Unknown';
                    const key = `${shortenAddress(from)}`;
                    const existing = inflowAgg.get(key) || { from: shortenAddress(from), value: 0, token: symbol };
                    existing.value += usdVal;
                    inflowAgg.set(key, existing);

                    allTransfers.incoming.push({
                        chainId,
                        chainName,
                        date: date || '',
                        from: transfer.from,
                        fromShort: shortenAddress(transfer.from),
                        token: symbol,
                        amount: value,
                        usd: usdVal,
                    });
                }
            }

            // Build flow entries from aggregated inflows
            for (const [, agg] of inflowAgg) {
                flows.push({
                    from: agg.from,
                    to: 'Safe Wallet',
                    value: Math.round(agg.value),
                    token: agg.token,
                    chain: chainName,
                });
            }

            // Outgoing
            const outflowAgg = new Map();
            if (data.outgoing) {
                for (const tx of data.outgoing) {
                    if (!tx.isExecuted) continue;
                    chainTransfers++;

                    const date = tx.executionDate;
                    if (date) {
                        const d = new Date(date);
                        if (!chainMinDate || d < chainMinDate) chainMinDate = d;
                        if (!chainMaxDate || d > chainMaxDate) chainMaxDate = d;
                    }

                    // Parse all transfers from the tx
                    const outTransfers = [];

                    if (tx.value && tx.value !== '0' && tx.to) {
                        const val = parseFloat(tx.value) / 1e18;
                        const sym = SafeAPI.CHAINS[chainId]?.symbol || 'ETH';
                        outTransfers.push({ to: tx.to, value: val, symbol: sym });
                    }

                    if (tx.dataDecoded?.method === 'transfer') {
                        const params = tx.dataDecoded.parameters || [];
                        const to = params.find(p => p.name === 'to')?.value;
                        const rawVal = params.find(p => p.name === 'value')?.value || '0';
                        if (to) outTransfers.push({ to, value: parseFloat(rawVal) / 1e18, symbol: 'Token' });
                    }

                    if (tx.dataDecoded?.method === 'multiSend') {
                        const txsParam = tx.dataDecoded.parameters?.find(p => p.name === 'transactions');
                        if (txsParam?.valueDecoded) {
                            for (const inner of txsParam.valueDecoded) {
                                if (inner.value && inner.value !== '0' && inner.to) {
                                    const val = parseFloat(inner.value) / 1e18;
                                    const sym = SafeAPI.CHAINS[chainId]?.symbol || 'ETH';
                                    outTransfers.push({ to: inner.to, value: val, symbol: sym });
                                }
                                if (inner.dataDecoded?.method === 'transfer') {
                                    const to2 = inner.dataDecoded.parameters?.find(p => p.name === 'to')?.value;
                                    const raw2 = inner.dataDecoded.parameters?.find(p => p.name === 'value')?.value || '0';
                                    if (to2) outTransfers.push({ to: to2, value: parseFloat(raw2) / 1e18, symbol: 'Token' });
                                }
                            }
                        }
                    }

                    for (const t of outTransfers) {
                        const usd = estimateUSD(t.value, t.symbol);
                        const usdVal = usd !== null ? usd : t.value;
                        chainOutflow += usdVal;
                        if (t.to) {
                            chainAddresses.add(t.to.toLowerCase());
                            allAddresses.add(t.to.toLowerCase());
                        }

                        const key = shortenAddress(t.to);
                        const existing = outflowAgg.get(key) || { to: shortenAddress(t.to), value: 0, token: t.symbol };
                        existing.value += usdVal;
                        outflowAgg.set(key, existing);

                        allTransfers.outgoing.push({
                            chainId,
                            chainName,
                            date: date || '',
                            to: t.to,
                            toShort: shortenAddress(t.to),
                            token: t.symbol,
                            amount: t.value,
                            usd: usdVal,
                        });
                    }
                }
            }

            // Build flow entries from aggregated outflows
            for (const [, agg] of outflowAgg) {
                flows.push({
                    from: 'Safe Wallet',
                    to: agg.to,
                    value: Math.round(agg.value),
                    token: agg.token,
                    chain: chainName,
                });
            }

            // Format dates
            const fmt = d => d ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '?';
            const period = (chainMinDate && chainMaxDate)
                ? `${fmt(chainMinDate)} - ${fmt(chainMaxDate)}`
                : 'No data';

            chainStats[chainName] = {
                transfers: chainTransfers,
                inflow: formatUSD(chainInflow),
                outflow: formatUSD(chainOutflow),
                addresses: String(chainAddresses.size),
                period,
            };

            flowData[chainName] = flows;

            totalTransfers += chainTransfers;
            totalInflow += chainInflow;
            totalOutflow += chainOutflow;
            if (chainMinDate && (!minDate || chainMinDate < minDate)) minDate = chainMinDate;
            if (chainMaxDate && (!maxDate || chainMaxDate > maxDate)) maxDate = chainMaxDate;
        }

        // Aggregate "all" stats
        const fmt = d => d ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '?';
        chainStats['all'] = {
            transfers: totalTransfers,
            inflow: formatUSD(totalInflow),
            outflow: formatUSD(totalOutflow),
            addresses: String(allAddresses.size),
            period: (minDate && maxDate) ? `${fmt(minDate)} - ${fmt(maxDate)}` : 'No data',
        };

        // Aggregate "all" flows: merge top flows from each chain
        const allFlows = [];
        for (const [, flows] of Object.entries(flowData)) {
            allFlows.push(...flows);
        }
        // Keep top 15 by value
        allFlows.sort((a, b) => b.value - a.value);
        flowData['all'] = allFlows.slice(0, 15);

        // Sort transfers by date
        allTransfers.incoming.sort((a, b) => new Date(b.date) - new Date(a.date));
        allTransfers.outgoing.sort((a, b) => new Date(b.date) - new Date(a.date));

        return { chainStats, flowData, allTransfers };
    }

    function formatUSD(value) {
        if (value >= 1000000) return `~$${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `~$${Math.round(value / 1000)}K`;
        return `~$${Math.round(value)}`;
    }

    // ─── Public API ────────────────────────────────────────────────
    return {
        shortenAddress,
        explorerLink,
        txExplorerLink,
        getTransferValue,
        getTokenSymbol,
        getTokenName,
        estimateUSD,
        transformToTimelineData,
        transformToSankeyData,
        transformToMultichainData,
        formatUSD,
        STABLECOINS,
    };
})();
