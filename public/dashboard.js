// Mint Lite Dashboard JavaScript
// WireGuard-style: Simple, no frameworks, no auto-refresh

const API_BASE = '';
const API_KEY = localStorage.getItem('mint_api_key') || '';

// Fetch with API key
async function apiFetch(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        ...options.headers
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    if (!response.ok) {
        if (response.status === 401) {
            showError('API key required. Check console for instructions.');
            console.error('Add API key: localStorage.setItem("mint_api_key", "YOUR_KEY_HERE")');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
}

// Show error message
function showError(message) {
    const errorContainer = document.getElementById('error-container');
    errorContainer.innerHTML = `<div class="error">${message}</div>`;
    setTimeout(() => {
        errorContainer.innerHTML = '';
    }, 5000);
}

// Load sync status
async function loadSyncStatus() {
    try {
        const data = await apiFetch('/manual/status');
        const statusEl = document.getElementById('sync-status');

        if (data.ok) {
            const ageHours = data.age_hours || 0;
            const statusClass = ageHours < 24 ? 'status-green' : 'status-red';
            const timeAgo = ageHours < 1 ? 'less than 1 hour ago' :
                           ageHours < 24 ? `${Math.floor(ageHours)} hours ago` :
                           `${Math.floor(ageHours / 24)} days ago`;

            statusEl.innerHTML = `
                <span class="status-pill ${statusClass}">
                    Last Sync: ${timeAgo}
                </span>
            `;
        } else {
            statusEl.innerHTML = `
                <span class="status-pill status-gray">
                    Never synced
                </span>
            `;
        }
    } catch (error) {
        console.error('Error loading sync status:', error);
        document.getElementById('sync-status').innerHTML = `
            <span class="status-pill status-gray">Unknown</span>
        `;
    }
}

// Load balances
async function loadBalances() {
    try {
        const data = await apiFetch('/manual/accounts');
        const content = document.getElementById('balances-content');

        if (!data.ok || !data.accounts || data.accounts.length === 0) {
            content.innerHTML = '<p class="loading">No accounts found</p>';
            return;
        }

        // Calculate total balance
        const total = data.accounts.reduce((sum, acc) => {
            return sum + (parseFloat(acc.balance) || 0);
        }, 0);

        // Create balance cards
        let html = '<div class="balance-grid">';

        // Total card
        const totalClass = total >= 0 ? 'positive' : 'negative';
        html += `
            <div class="balance-card">
                <div class="balance-label">Total Balance</div>
                <div class="balance-amount ${totalClass}">
                    $${total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                </div>
            </div>
        `;

        // Individual account cards
        data.accounts.slice(0, 5).forEach(account => {
            const balance = parseFloat(account.balance) || 0;
            const balanceClass = balance >= 0 ? 'positive' : 'negative';
            html += `
                <div class="balance-card">
                    <div class="balance-label">${account.name || 'Unknown'}</div>
                    <div class="balance-amount ${balanceClass}">
                        $${balance.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        content.innerHTML = html;
    } catch (error) {
        console.error('Error loading balances:', error);
        document.getElementById('balances-content').innerHTML =
            '<p class="error">Failed to load balances</p>';
    }
}

// Load accounts
async function loadAccounts() {
    try {
        const data = await apiFetch('/manual/accounts');
        const content = document.getElementById('accounts-content');

        if (!data.ok || !data.accounts || data.accounts.length === 0) {
            content.innerHTML = '<p class="loading">No accounts found</p>';
            return;
        }

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Account Name</th>
                        <th>Type</th>
                        <th>Subtype</th>
                        <th>Mask</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.accounts.forEach(account => {
            html += `
                <tr>
                    <td>${account.name || 'Unknown'}</td>
                    <td>${account.type || '-'}</td>
                    <td>${account.subtype || '-'}</td>
                    <td class="account-mask">${account.mask ? '...' + account.mask : 'N/A'}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        html += `<p style="margin-top: 15px; color: #7f8c8d; font-size: 13px;">Total: ${data.total} accounts</p>`;

        content.innerHTML = html;
    } catch (error) {
        console.error('Error loading accounts:', error);
        document.getElementById('accounts-content').innerHTML =
            '<p class="error">Failed to load accounts</p>';
    }
}

// Load transactions
async function loadTransactions() {
    try {
        const data = await apiFetch('/manual/transactions?limit=50');
        const content = document.getElementById('transactions-content');

        if (!data.ok || !data.transactions || data.transactions.length === 0) {
            content.innerHTML = '<p class="loading">No transactions found</p>';
            return;
        }

        let html = `
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Name</th>
                        <th>Merchant</th>
                        <th>Category</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.transactions.forEach(txn => {
            const amount = parseFloat(txn.amount) || 0;
            const amountClass = amount < 0 ? 'positive' : 'negative';
            html += `
                <tr>
                    <td class="transaction-date">${txn.posted_at || '-'}</td>
                    <td>${txn.name || 'Unknown'}</td>
                    <td>${txn.merchant || '-'}</td>
                    <td>${txn.ai_category || 'Uncategorized'}</td>
                    <td class="transaction-amount ${amountClass}">
                        $${Math.abs(amount).toFixed(2)}
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        html += `<p style="margin-top: 15px; color: #7f8c8d; font-size: 13px;">Showing ${data.transactions.length} of ${data.total} total transactions</p>`;

        content.innerHTML = html;
    } catch (error) {
        console.error('Error loading transactions:', error);
        document.getElementById('transactions-content').innerHTML =
            '<p class="error">Failed to load transactions</p>';
    }
}

// Trigger ingest
async function triggerIngest() {
    const button = document.getElementById('ingest-btn');
    button.disabled = true;
    button.textContent = 'Ingesting...';

    try {
        const data = await apiFetch('/manual/ingest', { method: 'POST' });

        if (data.ok) {
            showError(`✅ Ingested ${data.total_fetched || 0} transactions, ${data.total_inserted || 0} new`);
            // Reload all data
            await loadAll();
        } else {
            showError('Ingest failed: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error triggering ingest:', error);
        showError('Failed to trigger ingest: ' + error.message);
    } finally {
        button.disabled = false;
        button.textContent = 'Ingest Now';
    }
}

// Load all dashboard data
async function loadAll() {
    await Promise.all([
        loadSyncStatus(),
        loadBalances(),
        loadAccounts(),
        loadTransactions()
    ]);
}

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', () => {
    loadAll();
});
