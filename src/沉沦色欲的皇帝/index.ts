/**
 * 沉沦色欲的皇帝 — 同层前端卡入口
 * 
 * 核心模块：
 * - StartScreen: 开始屏幕
 * - TimeBar: 时间栏解析渲染
 * - MainTextArea: 正文显示
 * - StatusPanel: 角色状态栏
 * - InputBar: 用户输入发送
 * - VariableSync: MVU 变量读写
 * - ChronicleModal: 编年史/读档
 */

// ============================================================
// 环境检测
// ============================================================

/** 检测是否在酒馆环境中（jQuery 和 SillyTavern 都存在则为酒馆） */
const isInTavern = typeof (globalThis as any).$ === 'function'
    && typeof (globalThis as any).SillyTavern !== 'undefined';

/** 独立预览时的 mock 数据 */
const MOCK_VARS: Record<string, any> = {
    '皇帝': { '觉醒度': 12, '当前幕': '第一幕' },
    '李克': { '警惕度': 35, '内心想法': '这小皇帝今晚倒是格外安分……不过最近他偶尔会问起朝政，需要多加留意。' },
    '柳妃': { '母爱残存': 42, '内心想法': '儿啊……你又瘦了。可是今晚李克还要来……我无法拒绝他。' },
    '林婉茹': { '忠诚动摇': 28, '内心想法': '那春药的配方……如果陛下知道真相，他会恨我吗？' },
    '苏锦儿': { '可策反度': 15, '内心想法': '几秒钟的玩具罢了。不过李克大人今晚会来"善后"吧……身体已经开始期待了。' },
    '沈清芷': { '复仇决心': 88, '身体抗药': 45, '内心想法': '总有一天，我会亲手割下那个男人的头颅……可是这该死的身体，又在渴望他了。' },
    '赵嫣': { '暗恋强度': 72, '压抑临界': 78, '内心想法': '陛下今日整理寝具时留下的气味……不、不可以想这些。我是尚宫局的人。' },
};

// ============================================================
// 角色数据定义
// ============================================================
interface GameCharacter {
    name: string;
    role: string;
    color: string;
    stats: { label: string; path: string }[];
    thoughtPath: string;
}

const CHARACTERS: GameCharacter[] = [
    {
        name: '李克', role: '丞相', color: 'rgba(180,80,70,0.75)',
        stats: [{ label: '警惕度', path: '/李克/警惕度' }],
        thoughtPath: '/李克/内心想法',
    },
    {
        name: '柳妃', role: '太后', color: 'rgba(190,170,90,0.7)',
        stats: [{ label: '母爱残存', path: '/柳妃/母爱残存' }],
        thoughtPath: '/柳妃/内心想法',
    },
    {
        name: '林婉茹', role: '御医', color: 'rgba(100,170,130,0.7)',
        stats: [{ label: '忠诚动摇', path: '/林婉茹/忠诚动摇' }],
        thoughtPath: '/林婉茹/内心想法',
    },
    {
        name: '苏锦儿', role: '御女营花魁', color: 'rgba(200,100,110,0.7)',
        stats: [{ label: '可策反度', path: '/苏锦儿/可策反度' }],
        thoughtPath: '/苏锦儿/内心想法',
    },
    {
        name: '沈清芷', role: '将门之女', color: 'rgba(90,130,180,0.7)',
        stats: [
            { label: '复仇决心', path: '/沈清芷/复仇决心' },
            { label: '身体抗药', path: '/沈清芷/身体抗药' },
        ],
        thoughtPath: '/沈清芷/内心想法',
    },
    {
        name: '赵嫣', role: '尚宫局主事', color: 'rgba(150,110,180,0.7)',
        stats: [
            { label: '暗恋强度', path: '/赵嫣/暗恋强度' },
            { label: '压抑临界', path: '/赵嫣/压抑临界' },
        ],
        thoughtPath: '/赵嫣/内心想法',
    },
];

// 幕标识映射
const ACT_NAMES: Record<string, string> = {
    '第一幕': '第一幕·沉沦',
    '第二幕': '第二幕·裂痕',
    '第三幕': '第三幕·暗流',
    '第四幕': '第四幕·破局',
};

// ============================================================
// 工具函数
// ============================================================

/** 从变量路径读取值（兼容酒馆/独立环境） */
function readVar(path: string): any {
    try {
        const keys = path.split('/').filter(Boolean);
        let val: any;
        if (isInTavern) {
            // 酒馆环境：优先从 MVU stat_data 读取
            try {
                const mvuData = Mvu.getMvuData({ type: 'chat' });
                val = mvuData?.stat_data;
            } catch {
                val = getAllVariables();
            }
        } else {
            // 独立环境：用 mock 数据
            val = MOCK_VARS;
        }
        for (const k of keys) {
            val = val?.[k];
        }
        return val;
    } catch {
        return undefined;
    }
}

/** 解析 LLM 消息中的 ☞时间栏☜ */
function parseTimeBar(text: string): { year: string; date: string; weather: string; time: string; location: string; atmosphere: string } | null {
    const match = text.match(/☞(.+?)☜/);
    if (!match) return null;
    const parts = match[1].split('-').map(s => s.trim());
    return {
        year: parts[0] || '',
        date: parts[1] || '',
        weather: parts[2] || '',
        time: parts[3] || '',
        location: parts[4] || '',
        atmosphere: parts[5] || '',
    };
}

/** 提取正文内容（支持两种模式） */
function parseMainText(text: string): string {
    // 模式1：标签模式 <maintext>...</maintext>
    const tagged = text.match(/<maintext>([\s\S]*?)<\/maintext>/);
    if (tagged) return tagged[1].trim();

    // 模式2：自动提取 — ☞...☜ 之后到 <UpdateVariable> 之前
    let content = text;
    content = content.replace(/☞[\s\S]*?☜\s*/, '');            // 移除时间栏
    content = content.replace(/<UpdateVariable>[\s\S]*$/, '');   // 移除变量更新及之后
    content = content.replace(/<StatusPlaceHolderImpl\/?>[\s]*$/, ''); // 移除占位符
    content = content.replace(/<sum>[\s\S]*?<\/sum>/g, '');      // 移除小总结
    return content.trim();
}

/** 提取 <sum> 内容 */
function parseSummary(text: string): string {
    const match = text.match(/<sum>([\s\S]*?)<\/sum>/);
    return match ? match[1].trim() : '';
}

/** 提取 <UpdateVariable> 中的 JSONPatch */
function parseVariableUpdate(text: string): any[] {
    const match = text.match(/<JSONPatch>([\s\S]*?)<\/JSONPatch>/);
    if (!match) return [];
    try {
        return JSON.parse(match[1].trim());
    } catch {
        return [];
    }
}

// ============================================================
// 模块：开始屏幕
// ============================================================
function initStartScreen() {
    const screen = document.getElementById('start-screen')!;
    const container = document.getElementById('game-container')!;

    screen.addEventListener('click', () => {
        screen.classList.add('fade-out');
        setTimeout(() => {
            screen.style.display = 'none';
            container.classList.add('active');
        }, 800);
        // 尝试全屏
        try { document.documentElement.requestFullscreen?.(); } catch { }
    });
}

// ============================================================
// 模块：设置面板
// ============================================================
function initSettingsPanel() {
    const btn = document.getElementById('settings-btn')!;
    const panel = document.getElementById('settings-panel')!;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('show');
    });

    document.addEventListener('click', () => panel.classList.remove('show'));

    // 编年史按钮
    document.getElementById('btn-chronicle')?.addEventListener('click', () => {
        panel.classList.remove('show');
        document.getElementById('chronicle-modal')?.classList.add('show');
    });

    // 全屏切换
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
        panel.classList.remove('show');
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen?.();
        }
    });

    // 关闭编年史
    document.getElementById('chronicle-close')?.addEventListener('click', () => {
        document.getElementById('chronicle-modal')?.classList.remove('show');
    });
    document.getElementById('chronicle-modal')?.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            (e.currentTarget as HTMLElement).classList.remove('show');
        }
    });
}

// ============================================================
// 模块：时间栏渲染
// ============================================================
function renderTimeBar(timeData?: ReturnType<typeof parseTimeBar>) {
    // 从变量读取幕信息
    const awakening = readVar('/皇帝/觉醒度') ?? 0;
    const actNum = readVar('/皇帝/当前幕') ?? '第一幕';
    const actName = ACT_NAMES[actNum] || actNum;

    const actTag = document.getElementById('act-tag');
    const awakeningValue = document.getElementById('awakening-value');
    const awakeningDots = document.getElementById('awakening-dots');

    if (actTag) actTag.textContent = actName;
    if (awakeningValue) awakeningValue.textContent = String(awakening);

    // 渲染觉醒度进度点（每25%一个亮点，共4个）
    if (awakeningDots) {
        const litCount = Math.min(4, Math.floor(awakening / 25));
        const dots = awakeningDots.querySelectorAll('.dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('on', i < litCount);
        });
    }

    // 从时间栏数据渲染
    if (timeData) {
        const timeTag = document.getElementById('time-tag');
        const weatherTag = document.getElementById('weather-tag');
        const locationTag = document.getElementById('location-tag');
        if (timeTag) timeTag.textContent = timeData.time || '未知';
        if (weatherTag) weatherTag.textContent = timeData.weather || '';
        if (locationTag) locationTag.textContent = timeData.location || '';
    }
}

// ============================================================
// 模块：状态栏
// ============================================================
let currentCharIndex = 0;

function initStatusPanel() {
    // 左右翻页导航
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    prevBtn?.addEventListener('click', () => navigateChar(-1));
    nextBtn?.addEventListener('click', () => navigateChar(1));

    // 状态栏切换（桌面端设置菜单 + topbar 按钮）
    document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => {
        const panel = document.getElementById('status-panel');
        if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
        document.getElementById('settings-panel')?.classList.remove('show');
    });

    // 移动端切换
    const toggle = document.getElementById('mobile-status-toggle');
    const panel = document.getElementById('status-panel');
    const overlay = document.getElementById('mobile-overlay');
    toggle?.addEventListener('click', () => {
        panel?.classList.toggle('mobile-open');
        overlay?.classList.toggle('show');
    });
    overlay?.addEventListener('click', () => {
        panel?.classList.remove('mobile-open');
        overlay?.classList.remove('show');
    });

    // 触摸滑动切换角色
    let touchStartX = 0;
    panel?.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; });
    panel?.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) > 50) navigateChar(dx < 0 ? 1 : -1);
    });
}

/** 导航到上一个/下一个角色 */
function navigateChar(direction: number) {
    currentCharIndex = (currentCharIndex + direction + CHARACTERS.length) % CHARACTERS.length;
    renderCharStatus();
}

/** 生成水渍进度条 HTML */
function renderBar(label: string, value: number, color: string): string {
    const pct = Math.min(100, value);
    const fullClass = pct >= 100 ? ' full' : '';
    return `<div class="s-bar">
        <span class="s-bar-lb">${label}</span>
        <div class="s-bar-track">
            <div class="s-bar-fill${fullClass}" style="width:${pct}%;--sc:${color}"></div>
        </div>
        <span class="s-bar-val" style="color:${color}">${value}</span>
    </div>`;
}

function renderCharStatus() {
    const container = document.getElementById('char-status');
    if (!container) return;
    const charData = CHARACTERS[currentCharIndex];
    if (!charData) { container.innerHTML = ''; return; }

    // 更新导航信息
    const nameEl = document.getElementById('char-name');
    const roleEl = document.getElementById('char-role');
    const idxEl = document.getElementById('char-idx');
    if (nameEl) nameEl.textContent = charData.name;
    if (roleEl) roleEl.textContent = charData.role;
    if (idxEl) idxEl.textContent = `${currentCharIndex + 1}/${CHARACTERS.length}`;

    // 印章
    let html = `<div class="s-seal">${charData.name[0]}</div>`;

    // 属性条
    let barsHtml = '';
    for (const stat of charData.stats) {
        const value = readVar(stat.path) ?? 0;
        barsHtml += renderBar(stat.label, value, charData.color);
    }

    // 内心独白
    const thought = readVar(charData.thoughtPath) || '';
    const thoughtHtml = `<div class="s-thought"><em>内心 </em>${thought ? '「' + thought + '」' : '<span style="opacity:.3">暂无</span>'}</div>`;

    html += `<div class="s-info">${barsHtml}${thoughtHtml}</div>`;
    container.innerHTML = html;
}

// ============================================================
// 模块：正文渲染
// ============================================================
function renderMainText(text: string) {
    const container = document.getElementById('story-text')!;
    // 将文本按段落分割并渲染
    const paragraphs = text.split('\n').filter(p => p.trim());
    container.innerHTML = paragraphs.map(p => `<p>${p}</p>`).join('');

    // 滚动到底部
    const textArea = document.getElementById('text-area')!;
    textArea.scrollTop = textArea.scrollHeight;
}

// ============================================================
// 模块：编年史
// ============================================================
const chronicles: { time: string; content: string }[] = [];

function addChronicle(time: string, content: string) {
    chronicles.push({ time, content });
    renderChronicles();
}

function renderChronicles() {
    const list = document.getElementById('chronicle-list')!;
    if (chronicles.length === 0) {
        list.innerHTML = '<div class="chronicle-entry"><div class="chronicle-time">承平三年</div>故事尚未展开……</div>';
        return;
    }
    list.innerHTML = chronicles.map(c => `
    <div class="chronicle-entry">
      <div class="chronicle-time">${c.time}</div>
      ${c.content}
    </div>
  `).join('');
}

// ============================================================
// 模块：输入栏
// ============================================================
function initInputBar() {
    const input = document.getElementById('user-input') as HTMLTextAreaElement;
    const sendBtn = document.getElementById('send-btn')!;
    const loading = document.getElementById('loading-indicator')!;

    // 自动调整高度
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    });

    // 发送
    const doSend = () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        input.style.height = 'auto';
        loading.classList.add('show');

        // 调用酒馆 API 发送消息
        try {
            // 将用户输入写到酒馆输入框并触发发送
            const tavernInput = document.querySelector('#send_textarea') as HTMLTextAreaElement;
            if (tavernInput) {
                tavernInput.value = text;
                tavernInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const sendButton = document.querySelector('#send_but');
            if (sendButton) {
                (sendButton as HTMLElement).click();
            }
        } catch (e) {
            console.error('发送失败:', e);
            loading.classList.remove('show');
        }
    };

    sendBtn.addEventListener('click', doSend);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            doSend();
        }
    });
}

// ============================================================
// 模块：消息解析与监听
// ============================================================
let lastProcessedMessageCount = -1;

function processLatestMessage() {
    try {
        // 通过 SillyTavern.chat 读取最新消息
        const chat = SillyTavern.chat;
        if (!chat || chat.length === 0) return;
        if (chat.length === lastProcessedMessageCount) return;
        lastProcessedMessageCount = chat.length;

        // 获取最新的 AI 消息
        const latestMsg = chat[chat.length - 1];
        if (!latestMsg || latestMsg.is_user) return;

        const msgText = latestMsg.mes || '';
        if (!msgText) return;

        // 隐藏加载指示器
        document.getElementById('loading-indicator')?.classList.remove('show');

        // 解析时间栏
        const timeData = parseTimeBar(msgText);
        renderTimeBar(timeData);

        // 解析正文
        const mainText = parseMainText(msgText);
        if (mainText) {
            renderMainText(mainText);
        }

        // 解析小总结 → 编年史
        const summary = parseSummary(msgText);
        if (summary && timeData) {
            const timeStr = `${timeData.year} ${timeData.date} ${timeData.time}`;
            addChronicle(timeStr, summary);
        }

        // 变量更新由 MVU 框架自动处理，无需手动解析

        // 刷新状态栏
        renderCharStatus();

    } catch (e) {
        // 初始化阶段可能无消息，静默忽略
    }
}

// 变量更新由 MVU 框架和酒馆助手脚本自动处理
// 前端只需从 Mvu.getMvuData() 读取最新状态即可

// ============================================================
// 阶段3B：正则自动注入
// ============================================================
const REGEX_PREFIX = '[皇帝卡]';

/** 创建一条 TavernRegex 对象 */
function createRegex(
    name: string,
    findRegex: string,
    replaceStr: string,
    source: Partial<TavernRegex['source']>,
    destination: Partial<TavernRegex['destination']>,
    minDepth?: number,
): TavernRegex {
    return {
        id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
        script_name: `${REGEX_PREFIX} ${name}`,
        enabled: true,
        scope: 'character',
        find_regex: findRegex,
        replace_string: replaceStr,
        trim_strings: '',
        source: {
            user_input: false,
            ai_output: false,
            slash_command: false,
            world_info: false,
            ...source,
        },
        destination: {
            display: false,
            prompt: false,
            ...destination,
        },
        run_on_edit: true,
        min_depth: minDepth ?? null,
        max_depth: null,
    };
}

/** 自动注入/更新角色卡正则 */
async function setupRegexScripts() {
    try {
        await updateTavernRegexesWith(regexes => {
            // 移除旧的同名正则
            const filtered = regexes.filter(r => !r.script_name.startsWith(REGEX_PREFIX));
            // 添加新正则
            filtered.push(
                createRegex('隐藏时间栏', '☞[\\s\\S]*?☜', '',
                    { ai_output: true }, { display: true }),
                createRegex('隐藏变量更新', '<UpdateVariable>[\\s\\S]*?</UpdateVariable>', '',
                    { ai_output: true }, { display: true }),
                createRegex('变量深度限制', '<UpdateVariable>[\\s\\S]*?</UpdateVariable>', '',
                    { ai_output: true }, { prompt: true }, 6),
                createRegex('隐藏占位符', '<StatusPlaceHolderImpl/?>', '',
                    { ai_output: true }, { prompt: true }),
            );
            return filtered;
        }, { scope: 'character' });
    } catch (e) {
        console.warn('[皇帝卡] 正则注入失败:', e);
    }
}



// ============================================================
// 初始化
// ============================================================
function init() {
    initStartScreen();
    initSettingsPanel();
    initStatusPanel();
    initInputBar();

    if (isInTavern) {
        // 阶段3A：隐藏酒馆原生消息楼层（同层界面已替代）
        const hideStyle = document.createElement('style');
        hideStyle.textContent = `
            #chat .mes { display: none !important; }
            #chat { background: transparent !important; }
        `;
        document.head.appendChild(hideStyle);

        // 阶段3B：自动注入正则脚本
        setupRegexScripts();

        // 酒馆环境：检测是否已有消息（非首次打开）
        try {
            const chatLen = SillyTavern.chat?.length ?? 0;
            if (chatLen > 1) {
                document.getElementById('start-screen')!.style.display = 'none';
                document.getElementById('game-container')!.classList.add('active');
                processLatestMessage();
            }
        } catch { }

        // 监听新消息（轮询方式）
        setInterval(processLatestMessage, 1000);
    }

    // 初始渲染
    renderTimeBar();
    renderCharStatus();
}

// 兼容初始化：酒馆中需等待正则注入 HTML 后再初始化，独立浏览器用 DOMContentLoaded
if (isInTavern) {
    // 等待正则替换将 HTML 元素注入到页面后再初始化
    // 正则在消息渲染时触发，可能晚于脚本加载
    let waitAttempts = 0;
    const maxAttempts = 60; // 最多等 30 秒（每 500ms 检查一次）
    const waitForDOM = () => {
        const startScreen = document.getElementById('start-screen');
        if (startScreen) {
            console.log('[皇帝卡] DOM 元素已就绪，开始初始化');
            init();
        } else if (waitAttempts < maxAttempts) {
            waitAttempts++;
            setTimeout(waitForDOM, 500);
        } else {
            console.warn('[皇帝卡] 等待 DOM 元素超时（30秒），HTML 可能未通过正则注入');
        }
    };
    $(() => waitForDOM());
    $(window).on('pagehide', () => { /* 清理工作 */ });
} else {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}
