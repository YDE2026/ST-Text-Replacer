/**
 * 将 Markdown 表格字符串解析为 JSON 数组
 * @param {string} markdownText 包含 Markdown 表格的字符串
 * @returns {Object} { headers: [], rows: [] }
 */
export function parseMarkdownTable(markdownText) {
    if (!markdownText) return null;

    const lines = markdownText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    let inTable = false;
    let headers = [];
    let rows = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('|') && line.endsWith('|')) {
            if (!inTable) {
                // 第一行：表头
                headers = line.split('|').map(h => h.trim()).filter(h => h.length > 0);
                inTable = true;
                
                // 跳过下一行的分隔符 (如 |---|---|)
                if (i + 1 < lines.length && lines[i + 1].replace(/[\s|:\-]/g, '').length === 0) {
                    i++;
                }
            } else {
                // 后续行：数据
                const rowData = line.split('|').map(cell => cell.trim());
                // 去除首尾的空字符串（因为以 | 开头和结尾 split 后会有空元素）
                rowData.shift(); 
                rowData.pop();
                rows.push(rowData);
            }
        } else if (inTable) {
            // 如果已经进入表格，又遇到了非表格行，说明表格结束了
            break;
        }
    }

    if (headers.length === 0) return null;

    return { headers, rows };
}

/**
 * 将 JSON 数组转换回 Markdown 表格字符串
 * @param {Array<string>} headers 表头数组
 * @param {Array<Array<string>>} rows 数据行二维数组
 * @returns {string} Markdown 格式的表格字符串
 */
export function stringifyMarkdownTable(headers, rows) {
    if (!headers || headers.length === 0) return '';

    let md = `| ${headers.join(' | ')} |\n`;
    md += `| ${headers.map(() => ':---').join(' | ')} |\n`;

    for (const row of rows) {
        md += `| ${row.join(' | ')} |\n`;
    }

    return md;
}
