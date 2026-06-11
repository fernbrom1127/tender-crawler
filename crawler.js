const fs = require('fs');
const path = require('path');

// ===== 設定區域（可依需求修改）=====
const KEYWORDS = ['景觀', '植栽', '園藝', '綠美化', '步道', '公園', '校園', '遊憩', '維護', '修繕'];
const MAX_BUDGET = 22500000;  // 丙級營造上限 2250 萬
const OUTPUT_DIR = path.join(__dirname, 'docs');
const HTML_FILE = path.join(OUTPUT_DIR, 'index.html');

// ===== 使用政府開放資料平台 API（穩定來源）=====
// 資料來源：政府資料開放平臺 - 標案基本資料
// API 文件：https://data.gov.tw/dataset/6231

async function fetchTenders() {
    console.log('📡 連線到政府開放資料平台...');
    
    // 方案1：使用政府資料開放平台的 CSV 轉 JSON 服務
    const csvUrl = 'https://data.gov.tw/api/v1/rest/dataset/6231/data?limit=200';
    
    try {
        console.log('🔄 嘗試從政府開放資料平台抓取...');
        const response = await fetch(csvUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // 如果回傳的是 CSV 格式，需要轉換
        let tenders = [];
        
        if (data.data && Array.isArray(data.data)) {
            tenders = data.data;
        } else if (Array.isArray(data)) {
            tenders = data;
        } else {
            console.log('⚠️ API 格式變更，嘗試替代方案...');
            return await fetchFromAlternativeSource();
        }
        
        console.log(`📊 取得 ${tenders.length} 筆標案原始資料`);
        
        // 轉換成統一格式
        const formatted = tenders.map(item => ({
            id: item.案號 || item.id || '',
            title: item.標案名稱 || item.title || item.標案名稱 || '',
            agency: item.機關名稱 || item.agency || item.招標機關 || '',
            budget: parseBudget(item.預算金額 || item.budget || item.預算金額),
            deadline: formatDate(item.截止投標 || item.deadline || item.截止日期),
            publish_date: formatDate(item.公告日期 || item.publish_date),
            detail_url: item.詳細連結 || item.url || `https://web.pcc.gov.tw/pishtml/pisindex.html`
        }));
        
        // 篩選符合條件的標案
        const filtered = formatted.filter(tender => {
            const title = tender.title || '';
            const agency = tender.agency || '';
            const matched = KEYWORDS.some(kw => title.includes(kw) || agency.includes(kw));
            if (!matched) return false;
            
            const budget = tender.budget || 0;
            if (budget > MAX_BUDGET && budget > 0) return false;
            
            return true;
        });
        
        // 依截止日期排序
        filtered.sort((a, b) => {
            const dateA = a.deadline ? new Date(a.deadline) : new Date(0);
            const dateB = b.deadline ? new Date(b.deadline) : new Date(0);
            return dateA - dateB;
        });
        
        console.log(`✅ 篩選後剩 ${filtered.length} 筆符合的標案`);
        return filtered;
        
    } catch (error) {
        console.error('❌ 主要 API 錯誤:', error.message);
        console.log('🔄 嘗試備用方案...');
        return await fetchFromAlternativeSource();
    }
}

// 備用方案：使用模擬資料（確保頁面至少能顯示）
async function fetchFromAlternativeSource() {
    console.log('📋 使用展示資料模式...');
    
    // 這是範例資料，實際使用時會顯示「暫無資料」
    // 之後可以改成其他 API 來源
    
    const sampleTenders = [
        {
            id: 'SAMPLE-001',
            title: '【範例】OO市立公園景觀改善工程',
            agency: 'OO市政府工務局',
            budget: 8500000,
            deadline: getFutureDate(10),
            publish_date: getPastDate(5),
            detail_url: '#'
        },
        {
            id: 'SAMPLE-002',
            title: '【範例】XX國小校園植栽綠美化工程',
            agency: 'XX市政府教育局',
            budget: 3200000,
            deadline: getFutureDate(5),
            publish_date: getPastDate(3),
            detail_url: '#'
        },
        {
            id: 'SAMPLE-003',
            title: '【範例】YY社區步道整修及景觀工程',
            agency: 'YY區公所',
            budget: 1800000,
            deadline: getFutureDate(2),
            publish_date: getPastDate(7),
            detail_url: '#'
        }
    ];
    
    console.log('⚠️ 注意：目前為展示資料，實際標案需要調整 API 來源');
    return sampleTenders;
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
    return dateStr;
}

function getFutureDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
}

function getPastDate(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
}

function formatBudget(budget) {
    if (!budget || budget === 0) return '未公開';
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

function generateHTML(tenders, lastUpdated, isSample = false) {
    const urgentCount = tenders.filter(t => isUrgent(t.deadline)).length;
    const highValueCount = tenders.filter(t => t.budget && t.budget >= 5000000).length;
    const totalBudget = tenders.reduce((sum, t) => sum + (t.budget || 0), 0);
    
    const sampleWarning = isSample ? `
        <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 12px; padding: 15px; margin-bottom: 20px; text-align: center;">
            ⚠️ 目前為展示資料模式 | 因政府 API 暫時無法連線，顯示範例標案<br>
            <small>實際標案需調整資料來源後即可正常顯示</small>
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
                    <span class="deadline">⏰ 截止：${tender.deadline || '未公告'}</span>
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
    
    ${sampleWarning}
    
    <div class="stats">
        <div class="stat-card"><div class="value">${tenders.length}</div><div class="label">符合標案</div></div>
        <div class="stat-card"><div class="value">${urgentCount}</div><div class="label">即將截止</div></div>
        <div class="stat-card"><div class="value">${highValueCount}</div><div class="label">高價值案件</div></div>
        <div class="stat-card"><div class="value">${(totalBudget / 10000).toFixed(0)} 萬</div><div class="label">總潛在商機</div></div>
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
        ${tenderCards || '<div style="text-align:center;padding:60px;">📭 目前沒有符合條件的標案</div>'}
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
            const budgetText = t.budget ? (t.budget >= 10000 ? (t.budget/10000).toFixed(0) + ' 萬' : t.budget.toLocaleString() + ' 元') : '未公開';
            return \`
                <div class="tender-card \${isUrgent ? 'urgent' : ''} \${isHigh ? 'high-value' : ''}" onclick="window.open('\${t.detail_url || '#'}', '_blank')">
                    <div class="tender-title">\${escapeHtml(t.title || '無標題')}</div>
                    <div class="tender-meta">
                        <span>🏢 \${escapeHtml(t.agency || '機關未公開')}</span>
                        <span class="budget">💰 預算：\${budgetText}</span>
                        <span class="deadline">⏰ 截止：\${t.deadline || '未公告'}</span>
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
    
    // 確保輸出目錄存在
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    const tenders = await fetchTenders();
    const isSample = tenders.length > 0 && tenders[0].id && tenders[0].id.startsWith('SAMPLE');
    const lastUpdated = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    
    const html = generateHTML(tenders, lastUpdated, isSample);
    fs.writeFileSync(HTML_FILE, html, 'utf-8');
    
    console.log(`✅ 完成！共 ${tenders.length} 筆標案`);
    console.log(`📄 網頁已儲存至: ${HTML_FILE}`);
    
    if (isSample) {
        console.log('⚠️ 目前為展示資料模式，待找到穩定 API 後即可顯示真實標案');
    }
}

main();
