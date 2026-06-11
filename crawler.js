const fs = require('fs');
const path = require('path');

// ===== 設定區域（可依需求修改）=====
const KEYWORDS = ['景觀', '植栽', '園藝', '綠美化', '步道', '公園', '校園', '遊憩', '維護', '修繕'];
const MAX_BUDGET = 22500000;  // 丙級營造上限 2250 萬
const OUTPUT_DIR = path.join(__dirname, 'docs');
const HTML_FILE = path.join(OUTPUT_DIR, 'index.html');

// ===== 政府電子採購網 - 即時標案查詢 API =====
// 使用政府電子採購網的公開查詢介面

async function fetchTenders() {
    console.log('📡 連線到政府電子採購網...');
    
    // 方法1：使用 pcc-mcp 的公開 API（社群維護，較穩定）
    const apiUrls = [
        'https://pcc-mcp.openfun.app/api/tenders/recent',
        'https://pcc-mcp.openfun.app/api/tenders?limit=100',
        'https://api.pcc.gov.tw/api/v1/tenders/recent'
    ];
    
    for (const url of apiUrls) {
        try {
            console.log(`🔄 嘗試: ${url}`);
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ 成功從 ${url} 取得資料`);
                
                // 根據不同的 API 格式轉換
                let tenders = [];
                if (data.data && Array.isArray(data.data)) {
                    tenders = data.data;
                } else if (Array.isArray(data)) {
                    tenders = data;
                } else if (data.tenders) {
                    tenders = data.tenders;
                } else {
                    tenders = [data];
                }
                
                return formatTenders(tenders);
            }
        } catch (error) {
            console.log(`⚠️ ${url} 失敗: ${error.message}`);
        }
    }
    
    // 方法2：使用政府開放資料平台 - 公共工程委員會資料集
    console.log('🔄 嘗試政府開放資料平台...');
    try {
        // 資料集 ID: 6231 - 標案基本資料
        const odUrl = 'https://api.odcloud.tw/api/v1/datasets/142042/data?limit=100';
        const response = await fetch(odUrl);
        
        if (response.ok) {
            const data = await response.json();
            if (data.data && Array.isArray(data.data)) {
                console.log(`✅ 從開放資料平台取得 ${data.data.length} 筆資料`);
                return formatTenders(data.data);
            }
        }
    } catch (error) {
        console.log(`⚠️ 開放資料平台失敗: ${error.message}`);
    }
    
    // 方法3：如果都失敗，返回有意義的提示資料
    console.log('⚠️ 暫時無法取得即時資料，顯示提示訊息');
    return getHelpfulMessage();
}

function formatTenders(rawData) {
    const formatted = rawData.map(item => {
        // 嘗試從各種可能的欄位名稱取值
        return {
            id: item.案號 || item.id || item.CaseNo || item.case_no || '',
            title: item.標案名稱 || item.title || item.案名 || item.Name || '',
            agency: item.機關名稱 || item.agency || item.單位 || item.Organization || '',
            budget: parseBudget(item.預算金額 || item.budget || item.預算 || item.Budget),
            deadline: formatDate(item.截止投標 || item.deadline || item.截止日期 || item.Deadline),
            publish_date: formatDate(item.公告日期 || item.publish_date || item.PublishDate),
            detail_url: item.詳細連結 || item.url || `https://web.pcc.gov.tw/pishtml/pisindex.html`
        };
    }).filter(t => t.title); // 過濾掉沒有標題的資料
    
    // 篩選符合關鍵字的標案
    const filtered = formatted.filter(tender => {
        const title = (tender.title || '').toLowerCase();
        const agency = (tender.agency || '').toLowerCase();
        const matched = KEYWORDS.some(kw => 
            title.includes(kw.toLowerCase()) || 
            agency.includes(kw.toLowerCase())
        );
        if (!matched) return false;
        
        const budget = tender.budget || 0;
        if (budget > MAX_BUDGET && budget > 0) return false;
        
        return true;
    });
    
    // 依截止日期排序
    filtered.sort((a, b) => {
        const dateA = a.deadline ? new Date(a.deadline) : new Date(8640000000000000);
        const dateB = b.deadline ? new Date(b.deadline) : new Date(8640000000000000);
        return dateA - dateB;
    });
    
    console.log(`📊 原始資料: ${formatted.length} 筆，篩選後: ${filtered.length} 筆`);
    return filtered;
}

function parseBudget(budgetStr) {
    if (!budgetStr) return 0;
    if (typeof budgetStr === 'number') return budgetStr;
    const num = parseInt(String(budgetStr).replace(/[^0-9]/g, ''));
    return isNaN(num) ? 0 : num;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes('/')) return dateStr;
    if (dateStr.length === 8) {
        return `${dateStr.slice(0,4)}/${dateStr.slice(4,6)}/${dateStr.slice(6,8)}`;
    }
    if (dateStr.includes('-')) return dateStr;
    return dateStr;
}

function getHelpfulMessage() {
    return [
        {
            id: 'INFO-001',
            title: '【系統資訊】即時標案資料連線中',
            agency: '正在努力從政府電子採購網取得最新資料',
            budget: 0,
            deadline: getFutureDate(7),
            publish_date: getTodayDate(),
            detail_url: 'https://web.pcc.gov.tw/'
        },
        {
            id: 'INFO-002',
            title: '📌 如何手動查詢標案',
            agency: '1. 前往政府電子採購網 → 2. 輸入關鍵字「景觀/植栽/步道」→ 3. 篩選適合案件',
            budget: 0,
            deadline: getFutureDate(7),
            publish_date: getTodayDate(),
            detail_url: 'https://web.pcc.gov.tw/'
        },
        {
            id: 'INFO-003',
            title: '🔧 技術說明',
            agency: '爬蟲正在調整中，之後會自動顯示真實標案。目前請先使用政府網站查詢。',
            budget: 0,
            deadline: getFutureDate(7),
            publish_date: getTodayDate(),
            detail_url: 'https://web.pcc.gov.tw/'
        }
    ];
}

function getTodayDate() {
    return new Date().toISOString().slice(0, 10);
}

function getFutureDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
}

function formatBudget(budget) {
    if (!budget || budget === 0) return '請查看公告';
    if (budget >= 10000) return `${(budget / 10000).toFixed(0)} 萬`;
    return `${budget.toLocaleString()} 元`;
}

function isUrgent(deadline) {
    if (!deadline) return false;
    const today = new Date();
    const deadlineDate = new Date(deadline);
    const diffDays = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
    return diffDays <= 3 && diffDays >= 0;
}

function generateHTML(tenders, lastUpdated) {
    const urgentCount = tenders.filter(t => isUrgent(t.deadline)).length;
    const highValueCount = tenders.filter(t => t.budget && t.budget >= 5000000).length;
    const totalBudget = tenders.reduce((sum, t) => sum + (t.budget || 0), 0);
    const isInfoMode = tenders.length > 0 && tenders[0].id && tenders[0].id.startsWith('INFO');
    
    const infoBanner = isInfoMode ? `
        <div style="background: #e8f4f8; border: 1px solid #2196F3; border-radius: 12px; padding: 20px; margin-bottom: 20px; text-align: center;">
            <div style="font-size: 24px; margin-bottom: 10px;">🔧 系統調整中</div>
            <div style="margin-bottom: 10px;">正在串接政府電子採購網即時資料，預計 1-2 天內完成。</div>
            <div>目前請先點擊下方連結，手動查詢最新標案：</div>
            <div style="margin-top: 15px;">
                <a href="https://web.pcc.gov.tw/" target="_blank" style="background: #2196F3; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; display: inline-block;">
                    📋 前往政府電子採購網查詢
                </a>
            </div>
        </div>
    ` : '';
    
    const tenderCards = tenders.map(tender => {
        const isUrgentFlag = isUrgent(tender.deadline);
        const isHighValue = tender.budget && tender.budget >= 5000000;
        const cardClass = `tender-card${isUrgentFlag ? ' urgent' : ''}${isHighValue ? ' high-value' : ''}`;
        
        return `
            <div class="${cardClass}" onclick="window.open('${tender.detail_url || '#'}', '_blank')">
                <div class="tender-title">${escapeHtml(tender.title || '無標題')}</div>
                <div class="tender-meta">
                    <span>🏢 ${escapeHtml(tender.agency || '機關未公開')}</span>
                    <span class="budget">💰 預算：${formatBudget(tender.budget)}</span>
                    <span class="deadline">⏰ 截止：${tender.deadline || '請查看公告'}</span>
                </div>
                <div class="tags">
                    ${isUrgentFlag ? '<span class="tag urgent-tag">⏰ 即將截止</span>' : ''}
                    ${isHighValue ? '<span class="tag high-value-tag">⭐ 高價值案件</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
    
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>營造標案雷達 | 自動抓取政府採購網</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #1a472a, #2d6a4f); color: white; padding: 30px; border-radius: 20px; margin-bottom: 25px; }
        .header h1 { font-size: 28px; margin-bottom: 8px; }
        .last-updated { margin-top: 15px; font-size: 13px; opacity: 0.8; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 20px; border-radius: 16px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .stat-card .value { font-size: 32px; font-weight: bold; color: #1a472a; }
        .stat-card .label { font-size: 14px; color: #666; margin-top: 5px; }
        .search-bar { background: white; padding: 15px 20px; border-radius: 50px; margin-bottom: 25px; display: flex; gap: 10px; flex-wrap: wrap; }
        .search-bar input { flex: 1; min-width: 200px; padding: 12px 20px; border: 1px solid #ddd; border-radius: 30px; font-size: 16px; }
        .search-bar button { padding: 12px 24px; background: #2d6a4f; color: white; border: none; border-radius: 30px; cursor: pointer; }
        .filters { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
        .filter-btn { padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 30px; cursor: pointer; transition: all 0.2s; }
        .filter-btn.active { background: #2d6a4f; color: white; border-color: #2d6a4f; }
        .tender-list { display: flex; flex-direction: column; gap: 15px; }
        .tender-card { background: white; border-radius: 16px; padding: 20px; cursor: pointer; border-left: 4px solid #2d6a4f; transition: transform 0.2s, box-shadow 0.2s; }
        .tender-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.1); }
        .tender-card.urgent { border-left-color: #e76f51; background: #fff8f6; }
        .tender-card.high-value { border-left-color: #f4a261; }
        .tender-title { font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #1a1a2e; }
        .tender-meta { display: flex; flex-wrap: wrap; gap: 15px; font-size: 13px; color: #666; margin-bottom: 12px; }
        .budget { color: #2d6a4f; font-weight: 600; font-size: 14px; }
        .deadline { color: #e76f51; }
        .tags { display: flex; gap: 8px; flex-wrap: wrap; }
        .tag { padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 500; }
        .urgent-tag { background: #e76f51; color: white; }
        .high-value-tag { background: #f4a261; color: white; }
        .footer { text-align: center; padding: 30px; color: #999; font-size: 12px; border-top: 1px solid #ddd; margin-top: 20px; }
        .manual-link { background: white; border-radius: 12px; padding: 20px; margin-top: 20px; text-align: center; border: 1px solid #ddd; }
        .manual-link a { color: #2d6a4f; text-decoration: none; font-weight: bold; }
        @media (max-width: 768px) {
            body { padding: 15px; }
            .header h1 { font-size: 22px; }
            .tender-title { font-size: 16px; }
            .tender-meta { flex-direction: column; gap: 8px; }
        }
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>🏗️ 營造標案雷達</h1>
        <div>自動抓取政府電子採購網 | 篩選景觀/營造相關標案</div>
        <div class="last-updated">📅 最後更新：${lastUpdated}</div>
    </div>
    
    ${infoBanner}
    
    <div class="stats">
        <div class="stat-card"><div class="value">${tenders.length}</div><div class="label">相關標案</div></div>
        <div class="stat-card"><div class="value">${urgentCount}</div><div class="label">即將截止</div></div>
        <div class="stat-card"><div class="value">${highValueCount}</div><div class="label">高價值案件</div></div>
        <div class="stat-card"><div class="value">${totalBudget > 0 ? (totalBudget / 10000).toFixed(0) + ' 萬' : '查詢中'}</div><div class="label">總潛在商機</div></div>
    </div>
    
    <div class="search-bar">
        <input type="text" id="searchInput" placeholder="🔍 搜尋標案名稱、機關..." onkeyup="filterTenders()">
        <button onclick="filterTenders()">搜尋</button>
    </div>
    
    <div class="filters">
        <button class="filter-btn active" data-filter="all" onclick="setFilter('all')">全部</button>
        <button class="filter-btn" data-filter="urgent" onclick="setFilter('urgent')">⏰ 即將截止</button>
        <button class="filter-btn" data-filter="highValue" onclick="setFilter('highValue')">⭐ 高價值</button>
    </div>
    
    <div class="tender-list" id="tenderList">
        ${tenderCards || '<div style="text-align:center;padding:60px;background:white;border-radius:16px;">📭 目前沒有符合條件的標案</div>'}
    </div>
    
    <div class="manual-link">
        📌 即時查詢最新標案：<a href="https://web.pcc.gov.tw/" target="_blank">前往政府電子採購網</a><br>
        <small>💡 建議關鍵字：景觀、植栽、步道、公園、校園美化</small>
    </div>
    
    <div class="footer">
        資料來源：政府電子採購網 | 丙級營造承攬上限 2,250 萬元<br>
        每日自動更新 | 點擊標案可直接查看詳細公告
    </div>
</div>

<script>
    let currentFilter = 'all';
    let allTenders = ${JSON.stringify(tenders.map(t => ({ 
        title: t.title, 
        agency: t.agency, 
        budget: t.budget, 
        deadline: t.deadline, 
        detail_url: t.detail_url 
    })))};
    
    function renderTendersList(tenders) {
        const container = document.getElementById('tenderList');
        if (!tenders.length) { 
            container.innerHTML = '<div style="text-align:center;padding:60px;background:white;border-radius:16px;">📭 目前沒有符合條件的標案</div>'; 
            return; 
        }
        
        container.innerHTML = tenders.map(t => {
            const isUrgent = t.deadline && (() => { 
                const diff = Math.ceil((new Date(t.deadline) - new Date()) / 86400000); 
                return diff <= 3 && diff >= 0; 
            })();
            const isHigh = t.budget && t.budget >= 5000000;
            const budgetText = t.budget ? (t.budget >= 10000 ? (t.budget/10000).toFixed(0) + ' 萬' : t.budget.toLocaleString() + ' 元') : '請查看公告';
            return \`
                <div class="tender-card \${isUrgent ? 'urgent' : ''} \${isHigh ? 'high-value' : ''}" onclick="window.open('\${t.detail_url || '#'}', '_blank')">
                    <div class="tender-title">\${escapeHtml(t.title || '無標題')}</div>
                    <div class="tender-meta">
                        <span>🏢 \${escapeHtml(t.agency || '機關未公開')}</span>
                        <span class="budget">💰 預算：\${budgetText}</span>
                        <span class="deadline">⏰ 截止：\${t.deadline || '請查看公告'}</span>
                    </div>
                    <div class="tags">
                        \${isUrgent ? '<span class="tag urgent-tag">⏰ 即將截止</span>' : ''}
                        \${isHigh ? '<span class="tag high-value-tag">⭐ 高價值案件</span>' : ''}
                    </div>
                </div>
            \`;
        }).join('');
    }
    
    function filterTenders() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        let filtered = allTenders;
        if (searchTerm) {
            filtered = filtered.filter(t => 
                (t.title && t.title.toLowerCase().includes(searchTerm)) ||
                (t.agency && t.agency.toLowerCase().includes(searchTerm))
            );
        }
        if (currentFilter === 'urgent') {
            filtered = filtered.filter(t => t.deadline && Math.ceil((new Date(t.deadline) - new Date()) / 86400000) <= 3);
        }
        if (currentFilter === 'highValue') {
            filtered = filtered.filter(t => t.budget && t.budget >= 5000000);
        }
        renderTendersList(filtered);
    }
    
    function setFilter(filter) { 
        currentFilter = filter; 
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        filterTenders(); 
    }
    
    function escapeHtml(str) { 
        if (!str) return ''; 
        return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); 
    }
</script>
</body>
</html>`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

async function main() {
    console.log('🚀 開始抓取標案資料...');
    console.log(`🔍 關鍵字: ${KEYWORDS.join(', ')}`);
    console.log(`💰 預算上限: ${MAX_BUDGET / 10000} 萬`);
    
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    const tenders = await fetchTenders();
    const lastUpdated = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    
    const html = generateHTML(tenders, lastUpdated);
    fs.writeFileSync(HTML_FILE, html, 'utf-8');
    
    console.log(`✅ 完成！共 ${tenders.length} 筆標案`);
    console.log(`📄 網頁已儲存至: ${HTML_FILE}`);
}

main();
