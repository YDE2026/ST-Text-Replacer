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
        } else {
            console.warn('[ST-Text-Replacer] updateMessageBlock 不可用，尝试触发全局更新事件');
            eventSource.emit(event_types.chat_updated);
        }
        
        // ST重新渲染消息DOM可能存在延迟，且内部不一定触发相关Render事件
        // 我们手动强制将其重新包裹
        setTimeout(() => processMessageDOM(targetId), 50);
        setTimeout(() => processMessageDOM(targetId), 200);
        setTimeout(() => processMessageDOM(targetId), 500);
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
 * 扫描指定消息DOM，为其包含目标标签的内容包裹上具有独立样式的重Roll框架
 */
function processMessageDOM(messageId) {
    const settings = getSettings();
    if (!settings.enabled || !settings.targetTag) return;
    
    const context = getContext();
    const chat = context.chat;
    const msg = chat && chat[messageId] ? chat[messageId] : null;
    const tag = settings.targetTag;

    // 【自动排版整形机制】应对酒馆 AI 忘记加换行导致表格粘连的问题
    if (msg && msg.mes) {
        const rawRegex = new RegExp(`(\\[${tag}\\])([\\s\\S]*?)(\\[\\/${tag}\\])`, 'i');
        const match = msg.mes.match(rawRegex);
        
        if (match) {
            const inner = match[2];
            // 如果标签和表格内容之间没有充足的换行隔离，Markdown 渲染器会把它们糊在一起，导致后续替换截断 DOM
            if (!inner.startsWith('\n\n') || !inner.endsWith('\n\n')) {
                console.log('[ST-Text-Replacer] 发现不良排版的标签，正在自动补全换行符以抢救表格DOM...');
                msg.mes = msg.mes.replace(rawRegex, `$1\n\n${inner.trim()}\n\n$3`);
                
                // 让 ST 重新渲染修复后的规范文本
                setTimeout(() => {
                    if (typeof saveChat === 'function') saveChat();
                    if (typeof updateMessageBlock === 'function') {
                        updateMessageBlock(messageId, msg);
                        // 非常关键！因为是我们主动抢救并更新了消息区块，ST此时并不会派发新消息渲染完毕的事件。
                        // 导致中断的渲染链条无法闭环。所以我们必须在这里手动“踢”它一脚，让它继续渲染绿框！
                        setTimeout(() => processMessageDOM(messageId), 100);
                        setTimeout(() => processMessageDOM(messageId), 300);
                    } else {
                        eventSource.emit(event_types.chat_updated);
                    }
                }, 50);
                return; // 终止本次错误 DOM 处理，等待 ST 重绘后进入干净的 DOM
            }
        }
    }

    const messageElement = $(`.mes[mesid="${messageId}"] .mes_text`);
    if (!messageElement.length) return;

    if (messageElement.find('.st-tr-container').length > 0) return;

    let html = messageElement.html();
    
    console.log(`\n======================================`);
    console.log(`[ST-Text-Replacer] [Debug] 正在处理消息ID: ${messageId}`);
    console.log(`[ST-Text-Replacer] [Debug] 目标标签: [${tag}]`);
    console.log(`[ST-Text-Replacer] [Debug] 原始 HTML 内容 (请务必仔细检查这里的结构):`);
    console.log(html);
    
    // 因为 ST 渲染器不会破坏非 HTML 标签的方括号，我们可以很直接地匹配它。
    // 为了防止 ST 产生的标签粘连，比如 <p>[PHT]<br> 这种恶心的情况，放宽首尾标签匹配。
    const startTag = `(?:<p>\\s*)?\\[${tag}\\](?:\\s*<\\/p>)?(?:<br\\s*\\/?>)?`;
    const endTag = `(?:<br\\s*\\/?>)?(?:<p>\\s*)?\\[\\/${tag}\\](?:\\s*<\\/p>)?`;
    const regex = new RegExp(`(${startTag})([\\s\\S]*?)(${endTag})`, 'gi');
    
    console.log(`[ST-Text-Replacer] [Debug] 构造的正则表达式:`, regex);
    
    // 【终极兜底方案】如果 ST 彻底把表格和标签糊成了一团纯文本，甚至丢掉了 HTML 结构，我们提供一个无视结构的强力抓取
    const fallbackRegex = new RegExp(`(\\[${tag}\\])([\\s\\S]*?)(\\[\\/${tag}\\])`, 'gi');

    let hasMatch = false;
    
    // 用来生成绿框 HTML 的工厂函数
    const buildContainerHtml = (innerContent) => {
        return `
        <div class="st-tr-container" data-mesid="${messageId}" style="position: relative; border: 1px dashed rgba(76, 175, 80, 0.5); padding: 15px; margin: 10px 0; border-radius: 8px; background: rgba(76, 175, 80, 0.05); box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <div class="st-tr-tag-label" style="position: absolute; top: -10px; left: 15px; background: var(--SmartThemeBodyColor); color: var(--SmartThemeQuoteColor); padding: 0 5px; font-size: 0.8em; font-weight: bold; border-radius: 3px; border: 1px solid rgba(76, 175, 80, 0.5);">
                暗线内容 (${tag})
            </div>
            <div class="st-tr-content" style="margin-top: 5px; margin-bottom: 10px;" 
                 ontouchstart="event.stopPropagation();" 
                 ontouchmove="event.stopPropagation();" 
                 ontouchend="event.stopPropagation();">
                ${innerContent}
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button class="st-tr-edit-btn" style="background-color: var(--SmartThemeBlurTintColor); color: var(--SmartThemeBodyColor); border: 1px solid var(--SmartThemeBorderColor); padding: 6px 15px; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 0.9em; transition: all 0.2s;">
                    <i class="fa-solid fa-pen-to-square"></i> 手动编辑
                </button>
                <button class="st-tr-reroll-btn" style="background-color: var(--SmartThemeQuoteColor); color: var(--SmartThemeBodyColor); border: 1px solid var(--SmartThemeBorderColor); padding: 6px 15px; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 0.9em; transition: all 0.2s;">
                    <i class="fa-solid fa-dice"></i> 重新推演
                </button>
            </div>
        </div>`;
    };

    let newHtml = html.replace(regex, (match, p1, innerContent, p3) => {
        hasMatch = true;
        console.log(`[ST-Text-Replacer] [Debug] 🎉 成功匹配到内容 (宽松模式)! 匹配长度: ${match.length}`);
        return buildContainerHtml(innerContent);
    });

    // 如果宽松模式也失败了，尝试无视所有 HTML 结构的终极兜底模式
    if (!hasMatch) {
        newHtml = html.replace(fallbackRegex, (match, p1, innerContent, p3) => {
            hasMatch = true;
            console.log(`[ST-Text-Replacer] [Debug] ⚠️ 触发终极兜底匹配! 匹配长度: ${match.length}`);
            return buildContainerHtml(innerContent);
        });
    }

    if (hasMatch) {
        messageElement.html(newHtml);
    } else {
        console.warn(`[ST-Text-Replacer] [Debug] ❌ 未能匹配到标签 [${tag}]，所有匹配方案均失败！`);
    }
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
        const newMes = originalMes.replace(regex, `$1\n\n${newMarkdownTable}\n\n$3`);
        
        chat[messageId].mes = newMes;
        
        if (typeof saveChat === 'function') {
            await saveChat();
        }
        
        if (typeof updateMessageBlock === 'function') {
            updateMessageBlock(messageId, chat[messageId]);
        } else {
            eventSource.emit(event_types.chat_updated);
        }
        
        // 强制重新执行 DOM 包裹，防止 ST 的原生更新冲掉了我们的绿框
        setTimeout(() => processMessageDOM(messageId), 50);
        setTimeout(() => processMessageDOM(messageId), 200);
        setTimeout(() => processMessageDOM(messageId), 500);
        
        toastr.success('暗线数据已保存并更新到正文！');
    });
}

/**
 * 绑定所有需要的ST事件，以便在消息渲染时注入UI
 */
function bindEvents() {
    const handleMessageRender = (messageId) => {
        setTimeout(() => processMessageDOM(messageId), 50);
    };

    eventSource.on(event_types.USER_MESSAGE_RENDERED, handleMessageRender);
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, handleMessageRender);
    eventSource.on(event_types.MESSAGE_UPDATED, handleMessageRender);
    eventSource.on(event_types.MESSAGE_EDITED, handleMessageRender);
    eventSource.on(event_types.MESSAGE_SWIPED, handleMessageRender);

    eventSource.on(event_types.CHAT_CHANGED, () => {
        // 清理由于切换角色产生的旧面板数据缓存
        $('#st_tr_cards_container').empty();
        $('#st_tr_current_message_id').removeData('mesid').text('未选择消息');
        $('#st_tr_save_cards_btn').prop('disabled', true);
        
        // 恢复默认的空状态提示
        $('#st_tr_cards_container').html(`
            <div style="text-align: center; color: var(--SmartThemeBodyColor); opacity: 0.5; margin-top: 50px;">
                <i class="fa-solid fa-ghost fa-3x" style="margin-bottom: 10px;"></i>
                <p>暂无暗线数据。<br>请在聊天正文中寻找包含暗线表格的消息，或在设置中打开“启用文本替换”并让AI生成。</p>
            </div>
        `);

        setTimeout(() => {
            $('.mes').each((_, el) => {
                const messageId = $(el).attr('mesid');
                if (messageId) {
                    processMessageDOM(messageId);
                }
            });
            
            // 切换聊天后，如果 Drawer 是开着的，主动尝试拉取新聊天的最新暗线
            if ($('#st_tr_drawer_icon').hasClass('openIcon')) {
                const settings = getSettings();
                if (!settings.enabled || !settings.targetTag) return;
                
                const context = getContext();
                const chat = context.chat;
                if (!chat || chat.length === 0) return;
                
                let lastMessageId = -1;
                let lastTagContent = null;
                
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
                
                if (lastMessageId !== -1 && lastTagContent) {
                    renderCardsToDrawer(lastMessageId, lastTagContent);
                    bindDrawerCardsSave();
                }
            }
        }, 500);
    });

    // 初始处理当前已存在的所有消息
    setTimeout(() => {
        $('.mes').each((_, el) => {
            const messageId = $(el).attr('mesid');
            if (messageId) {
                processMessageDOM(messageId);
            }
        });
    }, 1000);
}

/**
 * 全局委托事件监听重Roll按钮的点击
 */
function bindGlobalButtons() {
    // 监听全局 Drawer 图标点击事件，自动提取最新的一条带标签的消息并渲染
    $(document).on('click', '#st_tr_drawer_icon', () => {
        // 如果 Drawer 是要打开的（即点之前是 closedIcon）
        if ($('#st_tr_drawer_icon').hasClass('closedIcon')) {
            const settings = getSettings();
            if (!settings.enabled || !settings.targetTag) return;
            
            const context = getContext();
            const chat = context.chat;
            if (!chat || chat.length === 0) return;
            
            // 从下往上找最后一条包含目标标签的消息
            let lastMessageId = -1;
            let lastTagContent = null;
            
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
            
            if (lastMessageId !== -1 && lastTagContent) {
                // 判断：如果是空面板（看到幽灵图标），或者是别的角色留下的旧消息 ID（可能数组越界或不匹配）
                const currentEditedId = $('#st_tr_current_message_id').data('mesid');
                const isPanelEmpty = $('#st_tr_cards_container .fa-ghost').length > 0;
                
                // 为了保险，每次点开都强制刷新为当前角色最新的一条，除非你刚才已经手动点过某条历史消息的"编辑"
                // 这里我们假设只要 Drawer 被关闭过，再打开就默认看最新的
                renderCardsToDrawer(lastMessageId, lastTagContent);
                bindDrawerCardsSave();
            }
        }
    });

    // 监听手动编辑按钮
    $(document).on('click', '.st-tr-edit-btn', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const btn = $(e.currentTarget);
        const container = btn.closest('.st-tr-container');
        const messageId = container.data('mesid');
        
        if (messageId === undefined) return;
        
        const context = getContext();
        const msg = context.chat[messageId];
        if (!msg) return;
        
        const settings = getSettings();
        const tagContent = extractContentByTag(msg.mes, settings.targetTag);
        
        if (tagContent) {
            // 打开 Drawer
            const drawerIcon = $('#st_tr_drawer_icon');
            if (drawerIcon.hasClass('closedIcon')) {
                drawerIcon.click(); // 触发打开
            }
            
            // 切换到暗线面板 Tab
            $('#st_tr_tab_main').click();
            
            // 渲染数据
            renderCardsToDrawer(messageId, tagContent);
            bindDrawerCardsSave();
        } else {
            toastr.error('无法提取该消息的暗线内容');
        }
    });

    $(document).on('click', '.st-tr-reroll-btn', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const btn = $(e.currentTarget);
        const container = btn.closest('.st-tr-container');
        const messageId = container.data('mesid');
        
        if (messageId === undefined) return;
        
        // 防止重复点击
        btn.prop('disabled', true);
        btn.html('<i class="fa-solid fa-spinner fa-spin"></i> 正在生成暗线...');
        btn.css('opacity', '0.7');
        
        await handleReRoll(messageId);
        
        // 成功后，消息会被重渲染，该DOM会被替换掉。
        // 如果出错没替换掉，我们还原按钮状态：
        btn.prop('disabled', false);
        btn.html('<i class="fa-solid fa-dice"></i> 重新推演');
        btn.css('opacity', '1');
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
