// crawler.js - 政府電子採購網爬蟲
// 使用 Taiwan Tender MCP 抓取標案資料，生成靜態 HTML 報表

const fs = require('fs');
const path = require('path');

// 設定關鍵字（可依公司業務調整）
const KEYWORDS = [
    '景觀', '植栽', '園藝', '綠美化',
    '步道', '公園', '校園', '遊憩',
    '維護', '修繕', '環境', '水土保持'
];

// 丙級營造承攬上限 2250 萬（超過的不顯示）
const MAX_BUDGET = 22500000;

// 輸出目錄
const OUTPUT_DIR = path.join(__dirname, 'docs');
const HTML_FILE = path.join(OUTPUT_DIR, 'index.html');

/**
 * 使用 MCP 工具抓取標案
 * 注意：需要先安裝 taiwan-tender-mcp
 */
async function fetchTenders() {
    // 方案1：如果 MCP 已安裝，可以用 exec 呼叫
    // 方案2：直接呼叫公開 API（推薦，最簡單）
    
    const response = await fetch('https://pcc-api.openfun.app/api/v1/tenders?limit=100&sort=-publish_date');
    const data = await response.json();
    
    // 過濾條件
    const filtered = data.filter(tender => {
        // 1. 關鍵字篩選（標題或機關名稱包含關鍵字）
        const title = tender.title || '';
        const agency = tender.agency || '';
        const matched = KEYWORDS.some(kw => 
            title.includes(kw) || agency.includes(kw)
        );
        if (!matched) return false;
        
        // 2. 預算金額篩選（不超過丙級上限）
        const budget = tender.budget || 0;
        if (budget > MAX_BUDGET) return false;
        
        // 3. 只保留招標中的案件
        const status = tender.status || '';
        if (!['招標中', '公告中', '招標'].some(s => status.includes(s))) return false;
        
        return true;
    });
    
    // 依截止日期排序（急的先顯示）
    filtered.sort((a, b) => {
        const dateA = new Date(a.deadline || a.publish_date);
        const dateB = new Date(b.deadline || b.publish_date);
        return dateA - dateB;
    });
    
    return filtered;
}

/**
 * 格式化金額
 */
function formatBudget(budget) {
    if (!budget) return '未公開';
    if (budget >= 10000) return `${(budget / 10000).toFixed(0)} 萬`;
    return `${budget.toLocaleString()} 元`;
}

/**
 * 判斷是否即將截止（3天內）
 */
function isUrgent(deadline) {
    if (!deadline) return false;
    const today = new Date();
    const deadlineDate = new Date(deadline);
    const diffDays = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
    return diffDays <= 3 && diffDays >= 0;
}

/**
 * 判斷是否高價值案件（預算 > 500萬）
 */
function isHighValue(budget) {
    return budget && budget >= 5000000;
}

/**
 * 生成 HTML 報表
 */
function generateHTML(tenders, lastUpdated) {
    const stats = {
        total: tenders.length,
        urgent: tenders.filter(t => isUrgent(t.deadline)).length,
        highValue: tenders.filter(t => isHighValue(t.budget)).length,
        totalBudget: tenders.reduce((sum, t) => sum + (t.budget || 0), 0)
    };
    
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>XX營造 - 標案雷達 | 即時政府採購資訊</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            background: #f0f2f5;
            padding: 20px;
            color: #1a1a2e;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        /* Header */
        .header {
            background: linear-gradient(135deg, #1a472a 0%, #2d6a4f 100%);
            color: white;
            padding: 30px;
            border-radius: 20px;
            margin-bottom: 25px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        
        .header h1 {
            font-size: 28px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .header .subtitle {
            opacity: 0.9;
            font-size: 14px;
        }
        
        .last-updated {
            margin-top: 15px;
            font-size: 13px;
            opacity: 0.8;
        }
        
        /* 統計卡片 */
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 16px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            text-align: center;
        }
        
        .stat-card .icon {
            font-size: 32px;
            margin-bottom: 8px;
        }
        
        .stat-card .value {
            font-size: 32px;
            font-weight: bold;
            color: #1a472a;
        }
        
        .stat-card .label {
            font-size: 14px;
            color: #666;
            margin-top: 5px;
        }
        
        /* 搜尋列 */
        .search-bar {
            background: white;
            padding: 15px 20px;
            border-radius: 50px;
            margin-bottom: 25px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        
        .search-bar input {
            flex: 1;
            padding: 12px 20px;
            border: 1px solid #ddd;
            border-radius: 30px;
            font-size: 16px;
            outline: none;
        }
        
        .search-bar input:focus {
            border-color: #2d6a4f;
        }
        
        .search-bar button {
            padding: 12px 24px;
            background: #2d6a4f;
            color: white;
            border: none;
            border-radius: 30px;
            cursor: pointer;
            font-size: 14px;
        }
        
        .search-bar button:hover {
            background: #1b4332;
        }
        
        /* 標籤 */
        .filters {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        
        .filter-btn {
            padding: 8px 16px;
            border: 1px solid #ddd;
            background: white;
            border-radius: 30px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
        }
        
        .filter-btn.active {
            background: #2d6a4f;
            color: white;
            border-color: #2d6a4f;
        }
        
        /* 標案列表 */
        .tender-list {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        
        .tender-card {
            background: white;
            border-radius: 16px;
            padding: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            transition: transform 0.2s, box-shadow 0.2s;
            cursor: pointer;
            border-left: 4px solid #2d6a4f;
        }
        
        .tender-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.1);
        }
        
        .tender-card.urgent {
            border-left-color: #e76f51;
            background: #fff8f6;
        }
        
        .tender-card.high-value {
            border-left-color: #f4a261;
        }
        
        .tender-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 12px;
            color: #1a1a2e;
            line-height: 1.4;
        }
        
        .tender-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            font-size: 13px;
            color: #666;
            margin-bottom: 12px;
        }
        
        .tender-meta span {
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
        
        .budget {
            color: #2d6a4f;
            font-weight: 600;
            font-size: 16px;
        }
        
        .deadline {
            color: #e76f51;
        }
        
        .deadline.urgent-text {
            color: red;
            font-weight: bold;
        }
        
        .agency {
            color: #666;
        }
        
        .tags {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        
        .tag {
            padding: 4px 10px;
            background: #e9ecef;
            border-radius: 20px;
            font-size: 11px;
            color: #495057;
        }
        
        .tag.urgent-tag {
            background: #e76f51;
            color: white;
        }
        
        .tag.high-value-tag {
            background: #f4a261;
            color: white;
        }
        
        /* 無資料 */
        .no-data {
            text-align: center;
            padding: 60px;
            background: white;
            border-radius: 16px;
            color: #999;
        }
        
        /* Footer */
        .footer {
            text-align: center;
            padding: 30px;
            color: #999;
            font-size: 12px;
        }
        
        /* RWD */
        @media (max-width: 768px) {
            body {
                padding: 15px;
            }
            .header {
                padding: 20px;
            }
            .header h1 {
                font-size: 22px;
            }
            .tender-title {
                font-size: 16px;
            }
            .tender-meta {
                flex-direction: column;
                gap: 8px;
            }
        }
    </style>
</head>
<body>
<div class="container">
    <!-- Header -->
    <div class="header">
        <h1>
            <span>🏗️</span> XX營造 - 標案雷達
        </h1>
        <div class="subtitle">自動抓取政府電子採購網，篩選適合丙級營造廠的景觀類標案</div>
        <div class="last-updated">📅 最後更新：${lastUpdated}</div>
    </div>
    
    <!-- 統計卡片 -->
    <div class="stats">
        <div class="stat-card">
            <div class="icon">📋</div>
            <div class="value">${stats.total}</div>
            <div class="label">符合標案</div>
        </div>
        <div class="stat-card">
            <div class="icon">⏰</div>
            <div class="value">${stats.urgent}</div>
            <div class="label">即將截止 (3天內)</div>
        </div>
        <div class="stat-card">
            <div class="icon">⭐</div>
            <div class="value">${stats.highValue}</div>
            <div class="label">高價值案件 (>500萬)</div>
        </div>
        <div class="stat-card">
            <div class="icon">💰</div>
            <div class="value">${(stats.totalBudget / 10000).toFixed(0)} 萬</div>
            <div class="label">總潛在商機</div>
        </div>
    </div>
    
    <!-- 搜尋列 -->
    <div class="search-bar">
        <input type="text" id="searchInput" placeholder="🔍 搜尋標案名稱、機關..." onkeyup="filterTenders()">
        <button onclick="filterTenders()">搜尋</button>
    </div>
    
    <!-- 篩選按鈕 -->
    <div class="filters">
        <button class="filter-btn active" data-filter="all" onclick="setFilter('all')">全部</button>
        <button class="filter-btn" data-filter="urgent" onclick="setFilter('urgent')">⏰ 即將截止</button>
        <button class="filter-btn" data-filter="highValue" onclick="setFilter('highValue')">⭐ 高價值</button>
    </div>
    
    <!-- 標案列表 -->
    <div class="tender-list" id="tenderList">
        ${renderTenders(tenders)}
    </div>
    
    <div class="footer">
        資料來源：政府電子採購網 | 自動更新時間：每日 08:00<br>
        丙級營造承攬上限：2,250 萬元 | 僅顯示與景觀/營造相關標案
    </div>
</div>

<script>
    let currentFilter = 'all';
    let allTenders = ${JSON.stringify(tenders.map(t => ({
        id: t.id,
        title: t.title,
        agency: t.agency,
        budget: t.budget,
        deadline: t.deadline,
        publish_date: t.publish_date,
        detail_url: t.detail_url
    })))};
    
    function renderTendersList(tenders) {
        const container = document.getElementById('tenderList');
        if (!tenders.length) {
            container.innerHTML = '<div class="no-data">📭 目前沒有符合條件的標案</div>';
            return;
        }
        
        container.innerHTML = tenders.map(tender => {
            const isUrgent = tender.deadline && (() => {
                const today = new Date();
                const deadline = new Date(tender.deadline);
                const diff = Math.ceil((deadline - today) / (1000*60*60*24));
                return diff <= 3 && diff >= 0;
            })();
            const isHighValue = tender.budget && tender.budget >= 5000000;
            
            let cardClass = 'tender-card';
            if (isUrgent) cardClass += ' urgent';
            if (isHighValue) cardClass += ' high-value';
            
            const budgetText = tender.budget ? 
                \`\${tender.budget >= 10000 ? (tender.budget/10000).toFixed(0) + ' 萬' : tender.budget.toLocaleString() + ' 元'}\` : 
                '未公開';
            
            const deadlineClass = isUrgent ? 'deadline urgent-text' : 'deadline';
            const deadlineText = tender.deadline ? tender.deadline : '未公告';
            
            return \`
                <div class="\${cardClass}" onclick="window.open('\${tender.detail_url || '#'}', '_blank')">
                    <div class="tender-title">\${escapeHtml(tender.title)}</div>
                    <div class="tender-meta">
                        <span>🏢 \${escapeHtml(tender.agency || '機關未公開')}</span>
                        <span class="budget">💰 預算：\${budgetText}</span>
                        <span class="\${deadlineClass}">⏰ 截止：\${deadlineText}</span>
                    </div>
                    <div class="tags">
                        \${isUrgent ? '<span class="tag urgent-tag">⏰ 即將截止</span>' : ''}
                        \${isHighValue ? '<span class="tag high-value-tag">⭐ 高價值案件</span>' : ''}
                    </div>
                </div>
            \`;
        }).join('');
    }
    
    function filterTenders() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        
        let filtered = allTenders;
        
        // 關鍵字篩選
        if (searchTerm) {
            filtered = filtered.filter(t => 
                (t.title && t.title.toLowerCase().includes(searchTerm)) ||
                (t.agency && t.agency.toLowerCase().includes(searchTerm))
            );
        }
        
        // 狀態篩選
        if (currentFilter === 'urgent') {
            filtered = filtered.filter(t => {
                if (!t.deadline) return false;
                const today = new Date();
                const deadline = new Date(t.deadline);
                const diff = Math.ceil((deadline - today) / (1000*60*60*24));
                return diff <= 3 && diff >= 0;
            });
        } else if (currentFilter === 'highValue') {
            filtered = filtered.filter(t => t.budget && t.budget >= 5000000);
        }
        
        renderTendersList(filtered);
    }
    
    function setFilter(filter) {
        currentFilter = filter;
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.filter === filter) btn.classList.add('active');
        });
        filterTenders();
    }
    
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }
    
    // 初始化
    renderTendersList(allTenders);
</script>
</body>
</html>`;
}

/**
 * 渲染標案列表（給 Node.js 用的函數）
 */
function renderTenders(tenders) {
    if (!tenders.length) {
        return '<div class="no-data">📭 目前沒有符合條件的標案</div>';
    }
    
    return tenders.map(tender => {
        const isUrgentFlag = isUrgent(tender.deadline);
        const isHighValueFlag = isHighValue(tender.budget);
        
        let cardClass = 'tender-card';
        if (isUrgentFlag) cardClass += ' urgent';
        if (isHighValueFlag) cardClass += ' high-value';
        
        const budgetText = formatBudget(tender.budget);
        const deadlineClass = isUrgentFlag ? 'deadline urgent-text' : 'deadline';
        const deadlineText = tender.deadline || '未公告';
        
        return `
            <div class="${cardClass}" onclick="window.open('${tender.detail_url || '#'}', '_blank')">
                <div class="tender-title">${escapeHtmlStatic(tender.title)}</div>
                <div class="tender-meta">
                    <span>🏢 ${escapeHtmlStatic(tender.agency || '機關未公開')}</span>
                    <span class="budget">💰 預算：${budgetText}</span>
                    <span class="${deadlineClass}">⏰ 截止：${deadlineText}</span>
                </div>
                <div class="tags">
                    ${isUrgentFlag ? '<span class="tag urgent-tag">⏰ 即將截止</span>' : ''}
                    ${isHighValueFlag ? '<span class="tag high-value-tag">⭐ 高價值案件</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
}

function escapeHtmlStatic(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

/**
 * 主程式
 */
async function main() {
    console.log('🚀 開始抓取標案資料...');
    
    try {
        const tenders = await fetchTenders();
        const lastUpdated = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
        
        // 確保輸出目錄存在
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }
        
        // 生成 HTML
        const html = generateHTML(tenders, lastUpdated);
        fs.writeFileSync(HTML_FILE, html, 'utf-8');
        
        console.log(`✅ 成功！共抓取 ${tenders.length} 筆標案`);
        console.log(`📄 HTML 已儲存至：${HTML_FILE}`);
        
    } catch (error) {
        console.error('❌ 錯誤：', error.message);
        process.exit(1);
    }
}

// 執行
main();
