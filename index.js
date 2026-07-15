import { createDrawer } from './ui/drawer.js';
import { processTextReplacement } from './core/replacer.js';
import { eventSource, event_types } from '/script.js';
import { getContext } from '/scripts/extensions.js';

// 需要依赖的 ST 内部函数，如果可用则导入
let updateMessageBlock;
let saveChat;
try {
    const scriptModule = await import('/script.js');
    updateMessageBlock = scriptModule.updateMessageBlock;
    saveChat = scriptModule.saveChat;
} catch (e) {
    console.warn('[ST-Text-Replacer] 无法直接导入 script.js 中的部分函数', e);
}

import { getSettings } from './ui/settings.js';

/**
 * 核心：处理并替换消息，然后刷新UI
 */
async function handleReRoll(targetId) {
    const context = getContext();
    const chat = context.chat;
    if (!chat || !chat[targetId]) return;
    
    const result = await processTextReplacement(targetId);
    
    if (result && result.optimized) {
        // 更新聊天上下文中的消息内容
        chat[targetId].mes = result.optimized;
        
        // 尝试保存聊天记录
        if (typeof saveChat === 'function') {
            await saveChat();
        } else {
             console.warn('[ST-Text-Replacer] saveChat 不可用，刷新页面可能会丢失优化结果');
        }
        
        // 尝试更新 UI
        if (typeof updateMessageBlock === 'function') {
            updateMessageBlock(targetId, chat[targetId]);
        }
        // 【关键修复】：修改完正文后，必须发出原生的编辑事件。
        // 否则其他插件（如状态栏正则）会因为 DOM 重绘而失效（变成代码不渲染）。
        eventSource.emit(event_types.MESSAGE_EDITED, targetId);
        eventSource.emit(event_types.CHAT_UPDATED);
    }
}

// 导入解析器
import { parseMarkdownTable, stringifyMarkdownTable } from './utils/markdownTableParser.js';
import { extractContentByTag } from './utils/tagProcessor.js';

/**
 * 渲染可编辑卡片到 Drawer 面板中 (改为表格形式)
 */
export function renderCardsToDrawer(messageId, tagContent) {
    const tableData = parseMarkdownTable(tagContent);
    const container = $('#st_tr_cards_container');
    const msgLabel = $('#st_tr_current_message_id');
    const saveBtn = $('#st_tr_save_cards_btn');
    
    if (!tableData) {
        container.html(`
            <div style="text-align: center; color: var(--SmartThemeBodyColor); opacity: 0.5; margin-top: 50px;">
                <i class="fa-solid fa-triangle-exclamation fa-3x" style="margin-bottom: 10px;"></i>
                <p>提取失败。<br>该消息的暗线标签内未找到有效的 Markdown 表格格式。</p>
            </div>
        `);
        msgLabel.text('解析失败');
        saveBtn.prop('disabled', true);
        return;
    }
    
    msgLabel.text(`正在编辑消息ID: ${messageId}`);
    msgLabel.data('mesid', messageId);
    
    // 构建表格 HTML
    let html = `
    <div style="overflow-x: auto; overscroll-behavior-x: contain; padding-bottom: 10px;">
        <table class="st-tr-edit-table" style="width: 100%; border-collapse: collapse; background: var(--SmartThemeBlurTintColor); border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
            <thead>
                <tr style="background: rgba(0,0,0,0.2);">`;
    
    // 渲染表头
    tableData.headers.forEach(header => {
        html += `<th style="padding: 10px; border: 1px solid var(--SmartThemeBorderColor); color: var(--SmartThemeQuoteColor); font-weight: bold; text-align: center;">${header}</th>`;
    });
    
    html += `   </tr>
            </thead>
            <tbody>`;
            
    // 渲染数据行，每行加上 data-rowindex
    tableData.rows.forEach((row, rowIndex) => {
        html += `<tr class="st-tr-edit-card" data-rowindex="${rowIndex}">`; // 复用 .st-tr-edit-card 类名方便保存逻辑抓取
        
        tableData.headers.forEach((header, colIndex) => {
            const cellValue = row[colIndex] || '';
            const isTextarea = cellValue.length > 30 || header.includes('活动') || header.includes('动态') || header.includes('内容');
            
            html += `<td style="padding: 5px; border: 1px solid var(--SmartThemeBorderColor); vertical-align: top;">`;
            
            if (isTextarea) {
                html += `<textarea class="text_pole st-tr-card-input" data-colindex="${colIndex}" style="width: 100%; height: 100%; box-sizing: border-box; resize: vertical; min-height: 60px; background: transparent; border: none; padding: 5px; color: var(--SmartThemeBodyColor);">${cellValue}</textarea>`;
            } else {
                html += `<input type="text" class="text_pole st-tr-card-input" data-colindex="${colIndex}" style="width: 100%; box-sizing: border-box; background: transparent; border: none; padding: 5px; color: var(--SmartThemeBodyColor);" value="${cellValue.replace(/"/g, '"')}">`;
            }
            
            html += `</td>`;
        });
        html += `</tr>`;
    });
    
    html += `
            </tbody>
        </table>
    </div>
    <style>
        .st-tr-edit-table .st-tr-card-input:focus {
            outline: 1px solid var(--SmartThemeQuoteColor);
            background: rgba(0,0,0,0.1) !important;
        }
    </style>`;
    
    // 把表头信息存在容器上，保存时需要用到
    container.data('headers', JSON.stringify(tableData.headers));
    container.html(html);
    saveBtn.prop('disabled', false);
}

/**
 * 绑定 Drawer 面板内的保存逻辑
 */
function bindDrawerCardsSave() {
    $('#st_tr_save_cards_btn').off('click').on('click', async () => {
        const messageId = $('#st_tr_current_message_id').data('mesid');
        const headersStr = $('#st_tr_cards_container').data('headers');
        
        if (messageId === undefined || !headersStr) return;
        
        const headers = JSON.parse(headersStr);
        const rows = [];
        
        $('#st_tr_cards_container .st-tr-edit-card').each(function() {
            const rowData = [];
            $(this).find('.st-tr-card-input').each(function() {
                const colIndex = parseInt($(this).data('colindex'));
                // 替换掉换行符为 <br> 或者直接去除换行，因为 markdown 表格内不支持原生换行
                let val = $(this).val().trim().replace(/\n/g, ' '); 
                rowData[colIndex] = val;
            });
            rows.push(rowData);
        });
        
        const newMarkdownTable = stringifyMarkdownTable(headers, rows);
        
        // 替换上下文中的消息
        const context = getContext();
        const chat = context.chat;
        if (!chat || !chat[messageId]) {
            toastr.error('无法找到对应消息记录');
            return;
        }
        
        const settings = getSettings();
        const tag = settings.targetTag;
        
        // 我们需要把旧的标签内容替换为新的
        // 找到旧标签
        const regex = new RegExp(`(\\[${tag}\\])([\\s\\S]*?)(\\[\\/${tag}\\])`, 'i');
        const originalMes = chat[messageId].mes;
        
        // 强制使用 \n\n 换行，防止 Markdown 解析器把标签当成表格的一部分吞进单元格里
        // 【重要隔离】: 在整个暗线块的最外层也加上 \n\n，防止暗线块与后面的状态栏正则紧贴
        // 导致 Markdown 解析器把后续的 HTML 代码当成了缩进代码块（即为什么会变成一堆代码而不渲染）
        let newMes = originalMes.replace(regex, `\n\n$1\n\n${newMarkdownTable}\n\n$3\n\n`);
        
        // 清理一下可能出现的过多连续空行
        newMes = newMes.replace(/\n{4,}/g, '\n\n\n');
        
        chat[messageId].mes = newMes;
        
        if (typeof saveChat === 'function') {
            await saveChat();
        }
        
        if (typeof updateMessageBlock === 'function') {
            updateMessageBlock(messageId, chat[messageId]);
        }
        // 同理，保存后必须通知其他插件消息被编辑了，让它们恢复状态栏渲染
        console.log(`[ST-Text-Replacer] [Debug] 准备触发 MESSAGE_EDITED 事件，ID: ${messageId}`);
        eventSource.emit(event_types.MESSAGE_EDITED, messageId);
        
        // 删除了 CHAT_UPDATED 避免全局重刷打断其他扩展。如果还需要强刷，可考虑单独的 DOM 延迟触发
        setTimeout(() => {
             console.log(`[ST-Text-Replacer] [Debug] 延迟验证消息是否被正确更新，当前内容长度: ${chat[messageId].mes.length}`);
        }, 500);
        
        toastr.success('暗线数据已保存并更新到正文！');
    });
}

/**
 * 检查当前聊天是否有新的暗线数据，并更新侧边栏抽屉面板
 */
function updateDrawerIfNewData() {
    const settings = getSettings();
    if (!settings.enabled || !settings.targetTag) return;
    
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return;
    
    let lastMessageId = -1;
    let lastTagContent = null;
    
    // 从下往上找最后一条包含目标标签的消息
    for (let i = chat.length - 1; i >= 0; i--) {
        const msg = chat[i];
        if (msg && msg.mes) {
            const extracted = extractContentByTag(msg.mes, settings.targetTag);
            if (extracted) {
                lastMessageId = i;
                lastTagContent = extracted;
                break;
            }
        }
    }
    
    const currentEditedId = $('#st_tr_current_message_id').data('mesid');
    
    if (lastMessageId !== -1 && lastTagContent) {
        // 放开限制：只要找到了，就直接刷新。因为即便消息 ID 没变，里头的暗线内容可能在流式生成中变了！
        console.log(`[ST-Text-Replacer] [Debug] 拉取并更新到面板，ID: ${lastMessageId}`);
        renderCardsToDrawer(lastMessageId, lastTagContent);
        bindDrawerCardsSave();
    } else {
        // 没有找到任何暗线
        $('#st_tr_cards_container').html(`
            <div style="text-align: center; color: var(--SmartThemeBodyColor); opacity: 0.5; margin-top: 50px;">
                <i class="fa-solid fa-ghost fa-3x" style="margin-bottom: 10px;"></i>
                <p>暂无暗线数据。<br>请在聊天正文中寻找包含暗线表格的消息，或在设置中打开“启用文本替换”并让AI生成。</p>
            </div>
        `);
    }
}

/**
 * 绑定所有需要的ST事件，以便在消息渲染时注入UI
 */
function bindEvents() {
    // 监听所有消息变动事件，静默更新右侧抽屉面板
    const handleMessageRender = () => {
        setTimeout(() => updateDrawerIfNewData(), 500); // 增加延迟，确保文本完全就绪
    };

    // 之前可能没拿到，是因为流式输出时的事件时机不对。
    // MESSAGE_RECEIVED 是最可靠的“AI 消息最终生成完毕”的事件。
    eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageRender);
    eventSource.on(event_types.USER_MESSAGE_SENT, handleMessageRender);
    
    // 保留这些作为兜底
    eventSource.on(event_types.USER_MESSAGE_RENDERED, handleMessageRender);
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, handleMessageRender);
    eventSource.on(event_types.MESSAGE_UPDATED, handleMessageRender);
    eventSource.on(event_types.MESSAGE_EDITED, handleMessageRender);
    eventSource.on(event_types.MESSAGE_SWIPED, handleMessageRender);

    // CHAT_CHANGED 事件可能在聊天数据完全就绪前触发，或者存在多次触发竞争的情况。
    // 因此我们需要加入稍微长一点的延迟，并确保获取到的是真正的最新 context。
    eventSource.on(event_types.CHAT_CHANGED, () => {
        console.log('[ST-Text-Replacer] [Debug] 捕获到 CHAT_CHANGED 事件，准备清理面板并拉取新聊天暗线...');
        
        // 立即执行清理：清理由于切换角色产生的旧面板数据缓存
        $('#st_tr_cards_container').empty();
        $('#st_tr_current_message_id').removeData('mesid').text('未选择消息');
        $('#st_tr_save_cards_btn').prop('disabled', true);
        
        // 恢复默认的空状态提示
        $('#st_tr_cards_container').html(`
            <div style="text-align: center; color: var(--SmartThemeBodyColor); opacity: 0.5; margin-top: 50px;">
                <i class="fa-solid fa-ghost fa-3x" style="margin-bottom: 10px;"></i>
                <p>正在拉取最新数据...</p>
            </div>
        `);

        // 等待 ST 内部完全替换掉聊天数组后执行扫描
        setTimeout(() => {
            console.log('[ST-Text-Replacer] [Debug] 开始处理新聊天的面板拉取...');
            updateDrawerIfNewData();
        }, 1000); // 增加延迟到 1000ms，以确保能拿到切换后的 context.chat 数组
    });
    
    // 初始化时也调用一次
    setTimeout(() => {
        updateDrawerIfNewData();
    }, 1000);
}

/**
 * 全局委托事件监听重Roll按钮的点击
 */
function bindGlobalButtons() {
    // 监听全局 Drawer 图标点击事件，自动提取最新的一条带标签的消息并渲染
    $(document).on('click', '#st_tr_drawer_icon', () => {
        // 【修复 bug】: 不管 Drawer 的 closedIcon 状态是什么，也不要自己写重复代码
        // 点击抽屉图标时，无脑延迟一小会执行 updateDrawerIfNewData，保证永远能获取最新
        setTimeout(() => {
            console.log(`[ST-Text-Replacer] [Debug] 抽屉图标被点击，强制触发暗线拉取`);
            updateDrawerIfNewData();
        }, 150);
    });

    // 监听“添加新行”按钮点击事件
    $(document).on('click', '#st_tr_add_row_btn', (e) => {
        e.preventDefault();
        
        const container = $('#st_tr_cards_container');
        const headersStr = container.data('headers');
        const tbody = container.find('tbody');
        
        if (!headersStr || tbody.length === 0) {
            toastr.warning('当前没有可编辑的表格。');
            return;
        }
        
        const headers = JSON.parse(headersStr);
        // 获取当前行数作为新行的 index
        const newRowIndex = tbody.find('tr').length;
        
        let newRowHtml = `<tr class="st-tr-edit-card" data-rowindex="${newRowIndex}">`;
        
        headers.forEach((header, colIndex) => {
            const isTextarea = header.includes('活动') || header.includes('动态') || header.includes('内容');
            const defaultValue = '待填充';
            
            newRowHtml += `<td style="padding: 5px; border: 1px solid var(--SmartThemeBorderColor); vertical-align: top;">`;
            
            if (isTextarea) {
                newRowHtml += `<textarea class="text_pole st-tr-card-input" data-colindex="${colIndex}" style="width: 100%; height: 100%; box-sizing: border-box; resize: vertical; min-height: 60px; background: transparent; border: none; padding: 5px; color: var(--SmartThemeBodyColor);">${defaultValue}</textarea>`;
            } else {
                newRowHtml += `<input type="text" class="text_pole st-tr-card-input" data-colindex="${colIndex}" style="width: 100%; box-sizing: border-box; background: transparent; border: none; padding: 5px; color: var(--SmartThemeBodyColor);" value="${defaultValue}">`;
            }
            
            newRowHtml += `</td>`;
        });
        
        newRowHtml += `</tr>`;
        
        tbody.append(newRowHtml);
        
        // 滚动到底部
        const scrollContainer = container.find('div[style*="overflow-x"]');
        if (scrollContainer.length) {
            scrollContainer.scrollTop(scrollContainer[0].scrollHeight);
        }
    });

    // 在插件侧边栏面板内部绑定“重新推演”按钮事件
    $(document).on('click', '#st_tr_drawer_reroll_btn', async (e) => {
        e.preventDefault();
        
        const messageId = $('#st_tr_current_message_id').data('mesid');
        if (messageId === undefined) {
            toastr.warning('当前没有选中的消息可供重骰。');
            return;
        }
        
        const btn = $(e.currentTarget);
        
        // 防止重复点击
        btn.prop('disabled', true);
        const originalHtml = btn.html();
        btn.html('<i class="fa-solid fa-spinner fa-spin"></i> 正在推演...');
        btn.css('opacity', '0.7');
        
        try {
            await handleReRoll(messageId);
            
            // 重骰成功后，我们需要立刻从更新后的 msg.mes 里提取新数据，重新渲染 Drawer！
            const context = getContext();
            const chat = context.chat;
            const msg = chat[messageId];
            if (msg && msg.mes) {
                const settings = getSettings();
                const newTagContent = extractContentByTag(msg.mes, settings.targetTag);
                if (newTagContent) {
                    renderCardsToDrawer(messageId, newTagContent);
                    bindDrawerCardsSave();
                }
            }
        } catch (err) {
             console.error("[ST-Text-Replacer] 重骰失败", err);
        } finally {
            // 还原按钮状态
            btn.prop('disabled', false);
            btn.html(originalHtml);
            btn.css('opacity', '1');
        }
    });
}

jQuery(async () => {
    console.log("[ST-Text-Replacer] 正在初始化...");
    
    // 等待基础 UI 加载完成
    let attempts = 0;
    const maxAttempts = 50;
    const checkInterval = 200;
    
    const initInterval = setInterval(async () => {
        if ($("#sys-settings-button").length > 0) {
            clearInterval(initInterval);
            
            // 注入 UI
            await createDrawer();
            
            // 绑定事件和按钮
            bindEvents();
            bindGlobalButtons();
            
            console.log("[ST-Text-Replacer] 初始化完成！");
        } else {
            attempts++;
            if (attempts >= maxAttempts) {
                clearInterval(initInterval);
                console.error("[ST-Text-Replacer] 注入 UI 失败：超时等待 #sys-settings-button。");
            }
        }
    }, checkInterval);
});
