import { getSettings } from '../ui/settings.js';
import { extractContentByTag, replaceContentByTag } from '../utils/tagProcessor.js';
import { callOpenAICompatibleApi } from './api.js';
import { getContext } from '/scripts/extensions.js';

let isProcessing = false;

export async function processTextReplacement(latestMessageId) {
    if (isProcessing) {
        console.log('[ST-Text-Replacer] 优化正在进行中，跳过重复触发。');
        return;
    }

    const settings = getSettings();
    if (!settings.enabled) return;

    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return;

    const latestMessage = chat[latestMessageId] || chat[chat.length - 1];
    
    // 我们只对AI的消息进行替换优化
    if (latestMessage.is_user) return;

    const originalText = latestMessage.mes;
    if (!originalText || originalText.trim() === '') return;

    console.groupCollapsed(`[ST-Text-Replacer] 开始执行文本替换优化`);
    console.time("优化耗时");
    isProcessing = true;

    try {
        // 1. 提取目标内容
        let targetContent = originalText;
        if (settings.targetTag) {
            const extracted = extractContentByTag(originalText, settings.targetTag);
            if (extracted !== null) {
                targetContent = extracted;
            } else {
                console.log(`[ST-Text-Replacer] 未找到目标标签 <${settings.targetTag}>，跳过优化`);
                console.timeEnd("优化耗时");
                console.groupEnd();
                return;
            }
        }

        if (targetContent.trim() === '') {
             console.log(`[ST-Text-Replacer] 目标内容为空，跳过优化`);
             console.timeEnd("优化耗时");
             console.groupEnd();
             return;
        }

        // 2. 构建上下文
        let historyContext = "";
        if (settings.contextDepth > 0) {
            // 获取之前的消息（不包含当前这条最新消息）
            const previousMessages = chat.slice(0, latestMessageId || -1);
            const historySlice = previousMessages.slice(-settings.contextDepth);
            
            const userName = context.name1 || 'User';
            const charName = context.name2 || 'Character';

            historyContext = historySlice.map(m => {
                if (m.mes && m.mes.trim()) {
                    return `${m.is_user ? userName : charName}: ${m.mes.trim()}`;
                }
                return null;
            }).filter(Boolean).join("\n\n");
        }

        // 3. 构建 API 消息
        const messages = [];
        if (settings.systemPrompt && settings.systemPrompt.trim()) {
            messages.push({ role: 'system', content: settings.systemPrompt.trim() });
        }

        if (historyContext) {
            messages.push({ role: 'user', content: `[参考上下文]\n${historyContext}` });
        }

        let finalUserPrompt = settings.userPrompt || "{{content}}";
        finalUserPrompt = finalUserPrompt.replace('{{content}}', targetContent);
        
        // 强制要求 AI 按规范的标签格式输出
        if (settings.targetTag) {
            finalUserPrompt += `\n\n【重要要求】\n你的回复必须使用 [${settings.targetTag}] 和 [/${settings.targetTag}] 标签将暗线表格包裹起来。除此以外不要回复任何多余的废话和解释。`;
        }
        
        messages.push({ role: 'user', content: finalUserPrompt });

        console.log('[ST-Text-Replacer] 发送给 API 的消息:', messages);

        // 4. 调用 API
        toastr.info('正在进行文本替换优化...', 'ST-Text-Replacer');
        const optimizedContentRaw = await callOpenAICompatibleApi(messages);

        if (!optimizedContentRaw) {
            throw new Error("API 未返回有效内容");
        }

        // 尝试从 API 回复中提取标签内容，避免 AI 胡言乱语掺杂了多余的对话
        // 提取出的内容是纯净的表格，然后我们将其原样替换到正文的方括号中
        let finalOptimizedContent = optimizedContentRaw;
        if (settings.targetTag) {
            const apiExtracted = extractContentByTag(optimizedContentRaw, settings.targetTag);
            if (apiExtracted !== null) {
                console.log(`[ST-Text-Replacer] [Debug] 成功从 AI 回复中提取出 [${settings.targetTag}] 标签内的内容！`);
                finalOptimizedContent = apiExtracted;
            } else {
                console.warn(`[ST-Text-Replacer] [Debug] AI 没有按照规范输出 [${settings.targetTag}] 标签包裹的内容，尝试直接使用全部输出。`);
            }
        }

        console.log('[ST-Text-Replacer] 提取出的最终暗线表格:', finalOptimizedContent);

        // 5. 替换原消息 (replaceContentByTag 中自带了 \n 的包裹处理，它会保留正文里的 [pht] 和 [/pht])
        const finalMessageText = replaceContentByTag(originalText, settings.targetTag, finalOptimizedContent);

        // 6. 更新 ST 聊天记录
        // 为了解耦，我们返回结果让 index.js 处理，它将使用原生的 ST 函数 (如 saveChat 和 messageFormatting)
        
        toastr.success('文本优化完成！', 'ST-Text-Replacer');
        
        console.timeEnd("优化耗时");
        console.groupEnd();
        
        return {
            original: originalText,
            optimized: finalMessageText
        };

    } catch (error) {
        console.error(`[ST-Text-Replacer] 优化过程发生错误:`, error);
        toastr.error(`优化失败: ${error.message}`, 'ST-Text-Replacer');
    } finally {
        isProcessing = false;
        console.timeEnd("优化耗时");
        console.groupEnd();
    }
    
    return null;
}
