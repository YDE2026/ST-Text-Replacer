import { getSettings } from '../ui/settings.js';

/**
 * 构建并发送请求至兼容 OpenAI 格式的 API
 * @param {Array<{role: string, content: string}>} messages 消息数组
 * @returns {Promise<string|null>} 返回生成的文本内容，失败则返回 null
 */
export async function callOpenAICompatibleApi(messages) {
    const settings = getSettings();
    
    if (!settings.apiUrl || !settings.apiKey) {
        console.error('[ST-Text-Replacer] API URL 或 API Key 未配置');
        toastr.error('请在设置中配置 API URL 和 API Key', '文本替换优化');
        return null;
    }

    let endpoint = settings.apiUrl;
    
    // 如果用户输入的是 /v1 这种基础路径，我们补充完整的对话路径
    // 如果用户输入了 /chat/completions 就不管
    if (endpoint.endsWith('/v1')) {
        endpoint += '/chat/completions';
    } else if (endpoint.endsWith('/v1/')) {
        endpoint += 'chat/completions';
    } else if (!endpoint.endsWith('/chat/completions')) {
        // 如果都不是，可能用户输入的就是基础域名，尝试补全
        endpoint = endpoint.endsWith('/') ? endpoint + 'chat/completions' : endpoint + '/chat/completions';
    }

    const payload = {
        model: settings.modelName || 'gpt-3.5-turbo',
        messages: messages,
        temperature: 0.7,
        max_tokens: 4000,
    };

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            // 去除换行符以免截断弹窗显示
            const cleanErrorText = errorText.replace(/[\r\n]+/g, ' ');
            throw new Error(`API Error: ${response.status} ${cleanErrorText}`);
        }

        const data = await response.json();
        
        if (data.choices && data.choices.length > 0 && data.choices[0].message) {
            return data.choices[0].message.content;
        } else {
            console.error('[ST-Text-Replacer] API 返回格式异常:', data);
            return null;
        }
    } catch (error) {
        console.error('[ST-Text-Replacer] API 请求失败:', error);
        toastr.error(`API 请求失败: ${error.message}`, '文本替换优化');
        return null;
    }
}
