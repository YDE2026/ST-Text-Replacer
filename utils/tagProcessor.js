/**
 * 提取文本中指定标签的内容
 */
export function extractContentByTag(text, tag) {
    if (!text || !tag) return text;
    
    console.log(`[ST-Text-Replacer] [TagProcessor] 尝试提取标签 [${tag}] 的内容...`);
    
    // 支持直接包含标签的格式，也支持隐藏标签的格式（可能包裹在 details 或其他 HTML 里）
    // 放宽匹配，允许包裹标签前后有不可见字符或换行
    const regex = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, 'i');
    const match = text.match(regex);
    
    if (match && match[1]) {
        console.log(`[ST-Text-Replacer] [TagProcessor] 提取成功! 长度: ${match[1].length}`);
        return match[1].trim();
    }
    console.warn(`[ST-Text-Replacer] [TagProcessor] 提取失败! 原始文本:`, text);
    return null;
}

/**
 * 替换文本中指定标签的内容
 */
export function replaceContentByTag(originalText, tag, newContent) {
    if (!originalText || !tag) return newContent;
    
    console.log(`[ST-Text-Replacer] [TagProcessor] 准备执行文本替换. 目标标签: [${tag}]`);
    console.log(`[ST-Text-Replacer] [TagProcessor] 新内容片段预览:`, newContent.substring(0, 100) + '...');
    
    // 终极放宽正则：如果它被藏在 details/summary 标签或者是其他奇怪的闭合结构中
    // 我们必须匹配到最初包裹暗线的那个标签
    // 这里增加一个全局替换标志 g，以防万一文本里有多个标签，或者由于正则贪婪性匹配不到
    const regex = new RegExp(`(\\[${tag}\\])([\\s\\S]*?)(\\[\\/${tag}\\])`, 'gi');
    
    if (regex.test(originalText)) {
        console.log(`[ST-Text-Replacer] [TagProcessor] 正则测试通过！原始文本中找到了标签。`);
        
        // 修复之前 `replace` 的潜在 Bug：使用非全局正则进行 replace，配合捕获组
        const replaceRegex = new RegExp(`(\\[${tag}\\])([\\s\\S]*?)(\\[\\/${tag}\\])`, 'i');
        
        // 强制使用 \n\n 换行，防止 Markdown 解析器把标签当成表格的一部分吞进单元格里
        // 就算它外面包了 <details> 也无所谓，我们只换掉 [PHT] 内部的内容
        const result = originalText.replace(replaceRegex, `$1\n\n${newContent}\n\n$3`);
        
        if (result === originalText) {
            console.error(`[ST-Text-Replacer] [TagProcessor] ⚠️ 警告：替换操作执行了，但文本没有任何变化！`);
        } else {
            console.log(`[ST-Text-Replacer] [TagProcessor] 替换成功！新文本长度: ${result.length}, 旧文本长度: ${originalText.length}`);
        }
        return result;
    } else {
        console.error(`[ST-Text-Replacer] [TagProcessor] ❌ 失败：正则测试未通过！在原始文本中找不到完整的 [${tag}] ... [/${tag}] 结构。`);
        console.log(`[ST-Text-Replacer] [TagProcessor] 原始文本前200字符:`, originalText.substring(0, 200));
        console.log(`[ST-Text-Replacer] [TagProcessor] 原始文本后200字符:`, originalText.substring(originalText.length - 200));
    }
    return originalText; // 如果替换失败，原样返回
}
