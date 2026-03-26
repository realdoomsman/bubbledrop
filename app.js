/* ========================================
   BubbleDrop — Solana Holder Airdrop Tool
   Main Application Logic
   ======================================== */

// ===== Globals =====
const { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } = solanaWeb3;

let connection = null;
let currentStep = 1;
let tokenMint = null;
let tokenDecimals = 0;
let holders = [];
let selectedHolderCount = 25;
let activeWallet = null; // { publicKey, secretKey }
let tokenMetadata = { name: '', symbol: '' };

const STORAGE_KEY = 'bubbledrop_wallets';
const HELIUS_KEY_STORAGE = 'bubbledrop_helius_key';

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    // Restore saved Helius key
    const savedKey = localStorage.getItem(HELIUS_KEY_STORAGE);
    if (savedKey) {
        document.getElementById('heliusKey').value = savedKey;
    }
    initConnection();
    bindEvents();
    loadSavedWallets();
});

// ===== Connection =====
function getRpcUrl() {
    const selectVal = document.getElementById('rpcSelect').value;
    if (selectVal === 'helius') {
        const key = document.getElementById('heliusKey').value.trim();
        if (key) {
            localStorage.setItem(HELIUS_KEY_STORAGE, key);
            return `https://mainnet.helius-rpc.com/?api-key=${key}`;
        }
        return null; // No key entered
    }
    if (selectVal === 'custom') {
        return document.getElementById('customRpc').value.trim() || null;
    }
    return selectVal;
}

function initConnection() {
    const rpcUrl = getRpcUrl();
    if (!rpcUrl) {
        connection = null;
        setNetworkStatus('error', 'No RPC Key');
        return;
    }
    try {
        connection = new Connection(rpcUrl, 'confirmed');
        setNetworkStatus('connected', 'Mainnet');
    } catch (err) {
        setNetworkStatus('error', 'Connection Failed');
        showToast('Failed to connect to Solana RPC', 'error');
    }
}

function setNetworkStatus(status, text) {
    const dot = document.getElementById('networkDot');
    const label = document.getElementById('networkStatus');
    dot.className = 'status-dot ' + status;
    label.textContent = text;
}

function updateRpcVisibility() {
    const val = document.getElementById('rpcSelect').value;
    document.getElementById('heliusKeyGroup').classList.toggle('hidden', val !== 'helius');
    document.getElementById('customRpcGroup').classList.toggle('hidden', val !== 'custom');
}

// ===== Event Bindings =====
function bindEvents() {
    // RPC selection
    document.getElementById('rpcSelect').addEventListener('change', () => {
        updateRpcVisibility();
        initConnection();
    });
    // Show/hide correct group on load
    updateRpcVisibility();

    document.getElementById('heliusKey')?.addEventListener('blur', () => initConnection());
    document.getElementById('customRpc')?.addEventListener('blur', () => initConnection());


    // Paste button
    document.getElementById('pasteBtn').addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            document.getElementById('tokenAddress').value = text.trim();
            showToast('Pasted from clipboard', 'success');
        } catch {
            showToast('Clipboard access denied', 'error');
        }
    });

    // Scan button
    document.getElementById('scanBtn').addEventListener('click', scanToken);

    // Holder count slider
    document.getElementById('holderCount').addEventListener('input', (e) => {
        selectedHolderCount = parseInt(e.target.value);
        document.getElementById('holderCountDisplay').textContent = selectedHolderCount;
        updateHolderTable();
    });

    // Navigation
    document.getElementById('backToStep1').addEventListener('click', () => goToStep(1));
    document.getElementById('goToStep3').addEventListener('click', () => goToStep(3));
    document.getElementById('backToStep2').addEventListener('click', () => goToStep(2));
    document.getElementById('goToStep4').addEventListener('click', () => {
        if (activeWallet) goToStep(4);
    });
    document.getElementById('backToStep3').addEventListener('click', () => goToStep(3));

    // Wallet tabs
    document.querySelectorAll('.wallet-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.wallet-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('newWalletPanel').classList.toggle('active', tab.dataset.tab === 'new');
            document.getElementById('existingWalletPanel').classList.toggle('active', tab.dataset.tab === 'existing');
        });
    });

    // Generate wallet
    document.getElementById('generateWalletBtn').addEventListener('click', generateNewWallet);

    // Copy buttons
    document.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('.copy-btn');
        if (copyBtn) {
            const targetId = copyBtn.dataset.copy;
            const text = document.getElementById(targetId).textContent;
            navigator.clipboard.writeText(text).then(() => {
                showToast('Copied to clipboard!', 'success');
            });
        }
    });

    // Refresh balance
    document.getElementById('refreshBalanceBtn').addEventListener('click', refreshBalance);

    // Execute airdrop
    document.getElementById('executeBtn').addEventListener('click', executeAirdrop);
}

// ===== Step Navigation =====
function goToStep(step) {
    currentStep = step;

    // Update panels
    document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`step${step}`).classList.add('active');

    // Update step bar
    document.querySelectorAll('.step-item').forEach(item => {
        const s = parseInt(item.dataset.step);
        item.classList.remove('active', 'completed');
        if (s === step) item.classList.add('active');
        else if (s < step) item.classList.add('completed');
    });

    // Step-specific logic
    if (step === 4) {
        populateSummary();
        refreshBalance();
    }
}

// ===== Step 1: Scan Token =====
async function scanToken() {
    const address = document.getElementById('tokenAddress').value.trim();
    if (!address) {
        showToast('Please enter a token mint address', 'error');
        return;
    }

    // Validate address
    try {
        tokenMint = new PublicKey(address);
    } catch {
        showToast('Invalid Solana address', 'error');
        return;
    }

    // Ensure connection
    if (!connection) {
        initConnection();
        if (!connection) {
            showToast('Please enter your Helius API key first (free at helius.dev)', 'error');
            return;
        }
    }

    // Show loading
    document.getElementById('scanBtn').style.display = 'none';
    document.getElementById('scanLoading').classList.remove('hidden');
    document.getElementById('tokenInfo').classList.add('hidden');

    try {
        // Get token supply and info
        const supplyResp = await connection.getTokenSupply(tokenMint);
        tokenDecimals = supplyResp.value.decimals;
        const totalSupply = supplyResp.value.uiAmount;

        // Try to get token metadata from Jupiter
        await fetchTokenMetadata(address);

        // Try Helius DAS API first (works for all token sizes)
        const rpcUrl = getRpcUrl();
        let accounts = [];

        try {
            // Use Helius getTokenAccounts DAS endpoint
            const dasResp = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'bubbledrop-holders',
                    method: 'getTokenAccounts',
                    params: {
                        mint: address,
                        limit: 50,
                        options: {
                            showZeroBalance: false
                        }
                    }
                })
            });

            const dasData = await dasResp.json();

            if (dasData.result && dasData.result.token_accounts && dasData.result.token_accounts.length > 0) {
                // DAS API returns accounts with owner info directly
                const tokenAccounts = dasData.result.token_accounts;

                // Sort by amount descending to get top holders
                tokenAccounts.sort((a, b) => {
                    const amtA = Number(a.amount || 0);
                    const amtB = Number(b.amount || 0);
                    return amtB - amtA;
                });

                const top50 = tokenAccounts.slice(0, 50);
                holders = top50.map((acc, i) => {
                    const balance = Number(acc.amount || 0) / Math.pow(10, tokenDecimals);
                    return {
                        tokenAccount: acc.address,
                        owner: acc.owner,
                        balance: balance,
                        rawAmount: acc.amount,
                        pct: totalSupply > 0 ? (balance / totalSupply * 100) : 0
                    };
                });

                showToast(`Found ${holders.length} holders via Helius DAS!`, 'success');
            } else {
                throw new Error('DAS returned no results, trying fallback');
            }
        } catch (dasErr) {
            console.log('DAS API not available, using standard RPC fallback:', dasErr.message);
            // Fallback: standard RPC getTokenLargestAccounts
            const largestAccounts = await connection.getTokenLargestAccounts(tokenMint);
            accounts = largestAccounts.value.slice(0, 50);

            // Resolve owner addresses for each token account
            holders = [];
            const batchSize = 10;
            for (let i = 0; i < accounts.length; i += batchSize) {
                const batch = accounts.slice(i, i + batchSize);
                const promises = batch.map(async (acc) => {
                    try {
                        const accountInfo = await connection.getParsedAccountInfo(acc.address);
                        const ownerAddress = accountInfo?.value?.data?.parsed?.info?.owner;
                        return {
                            tokenAccount: acc.address.toBase58(),
                            owner: ownerAddress || acc.address.toBase58(),
                            balance: acc.uiAmount || 0,
                            rawAmount: acc.amount,
                            pct: totalSupply > 0 ? ((acc.uiAmount || 0) / totalSupply * 100) : 0
                        };
                    } catch {
                        return {
                            tokenAccount: acc.address.toBase58(),
                            owner: acc.address.toBase58(),
                            balance: acc.uiAmount || 0,
                            rawAmount: acc.amount,
                            pct: totalSupply > 0 ? ((acc.uiAmount || 0) / totalSupply * 100) : 0
                        };
                    }
                });
                const results = await Promise.all(promises);
                holders.push(...results);
            }
            showToast(`Found ${holders.length} holders!`, 'success');
        }

        // Update UI
        document.getElementById('tokenName').textContent = tokenMetadata.name || 'Unknown Token';
        document.getElementById('tokenSymbol').textContent = tokenMetadata.symbol || address.slice(0, 6) + '...';
        document.getElementById('tokenAvatar').textContent = (tokenMetadata.symbol || '?')[0];
        document.getElementById('tokenSupply').textContent = formatNumber(totalSupply);
        document.getElementById('tokenDecimals').textContent = tokenDecimals;
        document.getElementById('holdersFound').textContent = holders.length;

        document.getElementById('tokenInfo').classList.remove('hidden');
        showToast(`Found ${holders.length} holders!`, 'success');

        // Auto-advance to step 2
        setTimeout(() => {
            renderHolderTable();
            goToStep(2);
        }, 800);

    } catch (err) {
        console.error('Scan error:', err);
        showToast('Failed to scan token: ' + (err.message || 'Unknown error'), 'error');
    } finally {
        document.getElementById('scanBtn').style.display = '';
        document.getElementById('scanLoading').classList.add('hidden');
    }
}

async function fetchTokenMetadata(mintAddress) {
    try {
        const resp = await fetch(`https://tokens.jup.ag/token/${mintAddress}`);
        if (resp.ok) {
            const data = await resp.json();
            tokenMetadata = {
                name: data.name || '',
                symbol: data.symbol || ''
            };
        }
    } catch {
        tokenMetadata = { name: '', symbol: '' };
    }
}

// ===== Step 2: Holder Table =====
function renderHolderTable() {
    const body = document.getElementById('holdersTableBody');
    body.innerHTML = '';

    holders.forEach((h, i) => {
        const row = document.createElement('div');
        row.className = 'holder-row' + (i >= selectedHolderCount ? ' excluded' : '');
        row.innerHTML = `
            <span class="col-rank">${i + 1}</span>
            <span class="col-address" title="${h.owner}">${h.owner}</span>
            <span class="col-balance">${formatNumber(h.balance)}</span>
            <span class="col-pct">${h.pct.toFixed(2)}%</span>
            <span class="col-status">
                <span class="status-pill ${i < selectedHolderCount ? 'included' : 'excluded'}">
                    ${i < selectedHolderCount ? '✓ IN' : '— OUT'}
                </span>
            </span>
        `;
        body.appendChild(row);
    });
}

function updateHolderTable() {
    const rows = document.querySelectorAll('.holder-row');
    rows.forEach((row, i) => {
        row.classList.toggle('excluded', i >= selectedHolderCount);
        const pill = row.querySelector('.status-pill');
        if (pill) {
            pill.className = 'status-pill ' + (i < selectedHolderCount ? 'included' : 'excluded');
            pill.textContent = i < selectedHolderCount ? '✓ IN' : '— OUT';
        }
    });
}

// ===== Step 3: Wallet =====
function generateNewWallet() {
    const keypair = Keypair.generate();
    activeWallet = {
        publicKey: keypair.publicKey.toBase58(),
        secretKey: Array.from(keypair.secretKey)
    };

    // Show details
    document.getElementById('newWalletPubkey').textContent = activeWallet.publicKey;
    document.getElementById('newWalletDetails').classList.remove('hidden');

    // Save to local storage
    saveWallet(activeWallet);

    // Enable continue button
    document.getElementById('goToStep4').classList.remove('disabled');

    showToast('New wallet generated!', 'success');
}

function saveWallet(wallet) {
    const wallets = getSavedWallets();
    const exists = wallets.find(w => w.publicKey === wallet.publicKey);
    if (!exists) {
        wallets.push({
            publicKey: wallet.publicKey,
            secretKey: wallet.secretKey,
            createdAt: new Date().toISOString()
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
        loadSavedWallets();
    }
}

function getSavedWallets() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
        return [];
    }
}

function loadSavedWallets() {
    const wallets = getSavedWallets();
    const container = document.getElementById('savedWalletsList');

    if (wallets.length === 0) {
        container.innerHTML = '<p class="empty-state">No saved wallets found. Create a new one first.</p>';
        return;
    }

    container.innerHTML = wallets.map((w, i) => `
        <div class="saved-wallet-item" data-index="${i}">
            <div>
                <div class="wallet-addr">${w.publicKey.slice(0, 8)}...${w.publicKey.slice(-8)}</div>
                <div class="wallet-date">Created ${new Date(w.createdAt).toLocaleDateString()}</div>
            </div>
            <div class="select-indicator"></div>
        </div>
    `).join('');

    // Click to select
    container.querySelectorAll('.saved-wallet-item').forEach(item => {
        item.addEventListener('click', () => {
            container.querySelectorAll('.saved-wallet-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            const idx = parseInt(item.dataset.index);
            activeWallet = wallets[idx];
            document.getElementById('goToStep4').classList.remove('disabled');
            showToast('Wallet selected', 'success');
        });
    });
}

// ===== Step 4: Fund & Execute =====
function populateSummary() {
    document.getElementById('summaryToken').textContent = tokenMetadata.name || tokenMint?.toBase58().slice(0, 12) + '...';
    document.getElementById('summaryRecipients').textContent = selectedHolderCount + ' holders';
    document.getElementById('summaryWallet').textContent = activeWallet?.publicKey || '—';
    document.getElementById('fundingAddress').textContent = activeWallet?.publicKey || '—';
}

async function refreshBalance() {
    if (!activeWallet || !connection) return;

    try {
        const pubkey = new PublicKey(activeWallet.publicKey);
        const balance = await connection.getBalance(pubkey);
        const solBalance = balance / LAMPORTS_PER_SOL;
        document.getElementById('walletBalance').textContent = solBalance.toFixed(4);

        // Enable execute if sufficient balance
        const executeBtn = document.getElementById('executeBtn');
        const solAmount = parseFloat(document.getElementById('solAmount').value) || 0.1;
        if (solBalance >= solAmount) {
            executeBtn.disabled = false;
        } else {
            executeBtn.disabled = true;
        }
    } catch (err) {
        console.error('Balance check error:', err);
    }
}

async function executeAirdrop() {
    if (!activeWallet || !connection || !tokenMint) {
        showToast('Missing configuration. Please go back and complete all steps.', 'error');
        return;
    }

    const solAmount = parseFloat(document.getElementById('solAmount').value) || 0.1;
    const recipients = holders.slice(0, selectedHolderCount);
    
    // Show progress
    document.getElementById('progressSection').classList.remove('hidden');
    document.getElementById('completionSection').classList.add('hidden');
    document.getElementById('executeBtn').disabled = true;
    document.getElementById('executeBtn').textContent = 'Executing...';

    const log = document.getElementById('progressLog');
    log.innerHTML = '';

    const keypair = Keypair.fromSecretKey(new Uint8Array(activeWallet.secretKey));

    try {
        // Step 1: Check balance
        addLog(log, 'Checking wallet balance...', 'info');
        const balance = await connection.getBalance(keypair.publicKey);
        const solBalance = balance / LAMPORTS_PER_SOL;
        addLog(log, `Balance: ${solBalance.toFixed(4)} SOL`, 'info');

        if (solBalance < solAmount) {
            addLog(log, `Insufficient balance. Need ${solAmount} SOL, have ${solBalance.toFixed(4)} SOL`, 'error');
            showToast('Insufficient SOL balance', 'error');
            return;
        }

        // Step 2: Swap SOL for token via Jupiter
        addLog(log, `Swapping ${solAmount} SOL for ${tokenMetadata.symbol || 'tokens'}...`, 'info');
        updateProgress(10);

        const feeReserve = 0.01; // Reserve 0.01 SOL for tx fees
        const swapAmount = Math.floor((solAmount - feeReserve) * LAMPORTS_PER_SOL);
        const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${tokenMint.toBase58()}&amount=${swapAmount}&slippageBps=500`;
        
        addLog(log, 'Fetching swap quote from Jupiter...', 'info');
        const quoteResp = await fetch(quoteUrl);
        
        if (!quoteResp.ok) {
            addLog(log, 'Failed to get swap quote. Token may not have liquidity on Jupiter.', 'error');
            showToast('Failed to get swap quote', 'error');
            resetExecuteBtn();
            return;
        }

        const quoteData = await quoteResp.json();
        const outAmount = quoteData.outAmount;
        addLog(log, `Quote: will receive ~${(outAmount / Math.pow(10, tokenDecimals)).toFixed(4)} tokens`, 'success');
        updateProgress(20);

        // Get swap transaction with minimal priority fee
        addLog(log, 'Building swap transaction (low fee mode)...', 'info');
        const swapResp = await fetch('https://quote-api.jup.ag/v6/swap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quoteResponse: quoteData,
                userPublicKey: keypair.publicKey.toBase58(),
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: {
                    priorityLevelWithMaxLamports: {
                        maxLamports: 1000, // Max 0.000001 SOL priority fee
                        priorityLevel: 'low'
                    }
                }
            })
        });

        if (!swapResp.ok) {
            addLog(log, 'Failed to build swap transaction', 'error');
            showToast('Swap transaction failed', 'error');
            resetExecuteBtn();
            return;
        }

        const swapData = await swapResp.json();
        updateProgress(30);

        // Deserialize and sign the transaction
        addLog(log, 'Signing swap transaction...', 'info');
        const swapTxBuf = Buffer.from(swapData.swapTransaction, 'base64');
        const tx = solanaWeb3.VersionedTransaction.deserialize(swapTxBuf);
        tx.sign([keypair]);

        // Send swap transaction
        addLog(log, 'Sending swap transaction...', 'info');
        const rawTx = tx.serialize();
        const swapTxSig = await connection.sendRawTransaction(rawTx, {
            skipPreflight: true,
            maxRetries: 3
        });
        addLog(log, `Swap TX: ${swapTxSig.slice(0, 16)}...`, 'success');
        updateProgress(40);

        // Wait for confirmation
        addLog(log, 'Waiting for swap confirmation...', 'info');
        await connection.confirmTransaction(swapTxSig, 'confirmed');
        addLog(log, 'Swap confirmed! ✓', 'success');
        updateProgress(50);

        // Step 3: Get our token balance
        addLog(log, 'Checking token balance...', 'info');
        await sleep(2000); // Wait for balance to update

        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(keypair.publicKey, { mint: tokenMint });
        if (tokenAccounts.value.length === 0) {
            addLog(log, 'No token account found after swap', 'error');
            resetExecuteBtn();
            return;
        }

        const myTokenAccount = tokenAccounts.value[0];
        const myTokenBalance = myTokenAccount.account.data.parsed.info.tokenAmount.uiAmount;
        addLog(log, `Token balance: ${formatNumber(myTokenBalance)}`, 'success');
        updateProgress(55);

        // Step 4: Distribute tokens to holders
        const perHolder = myTokenBalance / recipients.length;
        const perHolderRaw = BigInt(Math.floor(perHolder * Math.pow(10, tokenDecimals)));

        addLog(log, `Distributing ${formatNumber(perHolder)} tokens to each of ${recipients.length} holders`, 'info');

        const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
        const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

        const txSignatures = [];
        const batchSize = 8; // 8 holders per tx = fewer total txs = less fees
        const batches = [];

        for (let i = 0; i < recipients.length; i += batchSize) {
            batches.push(recipients.slice(i, i + batchSize));
        }

        addLog(log, `Using ${batches.length} transactions (${batchSize} per batch, low-fee mode)`, 'info');

        for (let b = 0; b < batches.length; b++) {
            const batch = batches[b];
            const pct = 55 + ((b + 1) / batches.length) * 40;

            addLog(log, `Sending batch ${b + 1}/${batches.length} (${batch.length} recipients)...`, 'info');

            try {
                const tx = new Transaction();
                const { blockhash } = await connection.getLatestBlockhash();
                tx.recentBlockhash = blockhash;
                tx.feePayer = keypair.publicKey;

                // Add ComputeBudget instructions for minimal fees
                // SetComputeUnitLimit — cap at 200,000 CUs (instead of default 1.4M)
                const computeLimitData = Buffer.alloc(5);
                computeLimitData.writeUInt8(2, 0); // instruction index
                computeLimitData.writeUInt32LE(200000, 1);
                tx.add(new solanaWeb3.TransactionInstruction({
                    keys: [],
                    programId: new PublicKey('ComputeBudget111111111111111111111111111111'),
                    data: computeLimitData
                }));

                // SetComputeUnitPrice — 1 microlamport per CU (basically free)
                const computePriceData = Buffer.alloc(9);
                computePriceData.writeUInt8(3, 0); // instruction index
                computePriceData.writeBigUInt64LE(BigInt(1), 1); // 1 microlamport
                tx.add(new solanaWeb3.TransactionInstruction({
                    keys: [],
                    programId: new PublicKey('ComputeBudget111111111111111111111111111111'),
                    data: computePriceData
                }));

                for (const recipient of batch) {
                    const recipientPubkey = new PublicKey(recipient.owner);

                    // Get or create associated token account
                    const recipientATA = await getAssociatedTokenAddress(recipientPubkey, tokenMint);
                    
                    // Check if ATA exists
                    const ataInfo = await connection.getAccountInfo(recipientATA);
                    if (!ataInfo) {
                        // Create ATA instruction
                        tx.add(createAssociatedTokenAccountInstruction(
                            keypair.publicKey,
                            recipientATA,
                            recipientPubkey,
                            tokenMint
                        ));
                    }

                    // Transfer tokens
                    tx.add(createTransferInstruction(
                        myTokenAccount.pubkey,
                        recipientATA,
                        keypair.publicKey,
                        perHolderRaw
                    ));
                }

                tx.sign(keypair);
                const sig = await connection.sendRawTransaction(tx.serialize(), {
                    skipPreflight: true,
                    maxRetries: 3
                });

                await connection.confirmTransaction(sig, 'confirmed');
                txSignatures.push(sig);
                addLog(log, `Batch ${b + 1} confirmed: ${sig.slice(0, 16)}...`, 'success');

            } catch (batchErr) {
                addLog(log, `Batch ${b + 1} failed: ${batchErr.message}`, 'error');
            }

            updateProgress(Math.round(pct));
            await sleep(500);
        }

        // Complete!
        updateProgress(100);
        addLog(log, `Airdrop complete! ${txSignatures.length} transactions sent.`, 'success');

        // Show completion
        document.getElementById('completionSection').classList.remove('hidden');
        document.getElementById('completedCount').textContent = selectedHolderCount;

        const txContainer = document.getElementById('completionTxs');
        txContainer.innerHTML = txSignatures.map(sig =>
            `<a href="https://solscan.io/tx/${sig}" target="_blank" rel="noopener" class="tx-link">🔗 ${sig}</a>`
        ).join('');

        showToast('Airdrop completed successfully!', 'success');

    } catch (err) {
        console.error('Airdrop error:', err);
        addLog(log, `Error: ${err.message}`, 'error');
        showToast('Airdrop failed: ' + err.message, 'error');
    } finally {
        resetExecuteBtn();
    }
}

function resetExecuteBtn() {
    const btn = document.getElementById('executeBtn');
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        Execute Airdrop
    `;
    btn.disabled = false;
}

// ===== SPL Token Helpers =====
function getAssociatedTokenAddress(owner, mint) {
    const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

    return PublicKey.findProgramAddressSync(
        [
            owner.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            mint.toBuffer()
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    )[0];
}

function createAssociatedTokenAccountInstruction(payer, ata, owner, mint) {
    const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

    const keys = [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: ata, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    return new solanaWeb3.TransactionInstruction({
        keys,
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        data: Buffer.from([])
    });
}

function createTransferInstruction(source, destination, owner, amount) {
    const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    const keys = [
        { pubkey: source, isSigner: false, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
    ];

    const data = Buffer.alloc(9);
    data.writeUInt8(3, 0); // Transfer instruction index
    data.writeBigUInt64LE(amount, 1);

    return new solanaWeb3.TransactionInstruction({
        keys,
        programId: TOKEN_PROGRAM_ID,
        data
    });
}

// ===== Progress =====
function updateProgress(pct) {
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressPct').textContent = pct + '%';
}

function addLog(container, message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = 'log-entry ' + type;
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
}

// ===== Toast Notifications =====
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✓',
        error: '✗',
        info: 'ℹ'
    };

    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ===== Utilities =====
function formatNumber(num) {
    if (num === null || num === undefined) return '—';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
