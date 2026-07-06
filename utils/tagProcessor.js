/**
 * 提取文本中指定标签的内容
 */
export function extractContentByTag(text, tag) {
    if (!text || !tag) return text;
    
    console.log(`[ST-Text-Replacer] [TagProcessor] 尝试提取标签 [${tag}] 的内容...`);
    // 匹配方括号包裹的标签，例如 [PHT]
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
    
    // 放宽正则，兼容 ST 可能在标签前后产生的空行或空格
    const regex = new RegExp(`(\\[${tag}\\])([\\s\\S]*?)(\\[\\/${tag}\\])`, 'i');
    
    if (regex.test(originalText)) {
        console.log(`[ST-Text-Replacer] [TagProcessor] 正则测试通过！原始文本中找到了标签。`);
        // 强制使用 \n\n 换行，防止 Markdown 解析器把标签当成表格的一部分吞进单元格里
        const result = originalText.replace(regex, `$1\n\n${newContent}\n\n$3`);
        
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
