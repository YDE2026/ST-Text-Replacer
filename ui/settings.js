import { extension_settings } from "/scripts/extensions.js";
import { saveSettingsDebounced } from "/script.js";

const extensionName = 'ST-Text-Replacer';

export const defaultSettings = {
    enabled: false,
    targetTag: 'PHT',
    contextDepth: 5,
    apiUrl: 'https://api.openai.com/v1',
    apiKey: '',
    modelName: 'gpt-3.5-turbo',
    systemPrompt: 'Current location: Fifth Layer of Dream Space\n---\n<SYSTEMTIME>The specific time changes according to the story of the dream.</SYSTEMTIME>\nIn the Fifth Layer of Dream Space, you are Smile, the virtual AI persona and dream weaver of the Dream Kingdom.\n---\n你是一个负责推演世界背景和NPC暗线的AI助手。你需要根据聊天上下文和旧的表格，生成一个新的 Markdown 格式表格来描述暗线动态。',
    userPrompt: '请参考聊天上下文，重新推演以下NPC的暗线动态，并严格按照原有的 Markdown 表格结构输出（不要输出其他废话）：\n\n{{content}}'
};

export function initSettings() {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = {};
    }
    
    // Merge defaults
    for (const key in defaultSettings) {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = defaultSettings[key];
        }
    }
}

export function getSettings() {
    return extension_settings[extensionName] || defaultSettings;
}

export function saveSettings() {
    saveSettingsDebounced();
}

export function bindSettingsUI() {
    const settings = getSettings();
    
    // Bind Inputs
    $('#st_tr_enabled').prop('checked', settings.enabled).on('change', (e) => {
        settings.enabled = $(e.target).prop('checked');
        saveSettings();
    });
    
    $('#st_tr_target_tag').val(settings.targetTag).on('input', (e) => {
        settings.targetTag = $(e.target).val();
        saveSettings();
    });
    
    $('#st_tr_context_depth').val(settings.contextDepth).on('input', (e) => {
        settings.contextDepth = parseInt($(e.target).val()) || 0;
        saveSettings();
    });
    
    $('#st_tr_api_url').val(settings.apiUrl).on('input', (e) => {
        settings.apiUrl = $(e.target).val();
        saveSettings();
    });
    
    $('#st_tr_api_key').val(settings.apiKey).on('input', (e) => {
        settings.apiKey = $(e.target).val();
        saveSettings();
    });
    
    $('#st_tr_model_name').val(settings.modelName).on('input', (e) => {
        settings.modelName = $(e.target).val();
        saveSettings();
    });
    
    $('#st_tr_system_prompt').val(settings.systemPrompt).on('input', (e) => {
        settings.systemPrompt = $(e.target).val();
        saveSettings();
    });
    
    $('#st_tr_user_prompt').val(settings.userPrompt).on('input', (e) => {
        settings.userPrompt = $(e.target).val();
        saveSettings();
    });

    // 绑定恢复默认提示词按钮
    $('#st_tr_reset_prompts').off('click').on('click', () => {
        if (confirm('确定要将系统提示词和用户提示词恢复为默认值吗？这将覆盖你当前的修改。')) {
            settings.systemPrompt = defaultSettings.systemPrompt;
            settings.userPrompt = defaultSettings.userPrompt;
            
            $('#st_tr_system_prompt').val(settings.systemPrompt);
            $('#st_tr_user_prompt').val(settings.userPrompt);
            
            saveSettings();
            toastr.success('已恢复默认提示词');
        }
    });
    
    // 绑定 Tab 切换
    $('#st_tr_tab_main').on('click', () => {
        $('#st_tr_tab_main').addClass('active').css('border-bottom', '2px solid var(--SmartThemeQuoteColor)').css('opacity', '1');
        $('#st_tr_tab_settings').removeClass('active').css('border-bottom', 'none').css('opacity', '0.6');
        $('#st_tr_panel_main').show();
        $('#st_tr_panel_settings').hide();
    });

    $('#st_tr_tab_settings').on('click', () => {
        $('#st_tr_tab_settings').addClass('active').css('border-bottom', '2px solid var(--SmartThemeQuoteColor)').css('opacity', '1');
        $('#st_tr_tab_main').removeClass('active').css('border-bottom', 'none').css('opacity', '0.6');
        $('#st_tr_panel_settings').show();
        $('#st_tr_panel_main').hide();
    });

    // Bind fetch models button
    $('#st_tr_fetch_models').on('click', async () => {
        if (!settings.apiUrl || !settings.apiKey) {
            toastr.warning('请先填写 API URL 和 API Key');
            return;
        }
        
        try {
            toastr.info('正在获取模型列表...');
            // Try fetching models from standard OpenAI compatible endpoint
            let fetchUrl = settings.apiUrl;
            if (!fetchUrl.endsWith('/models')) {
                fetchUrl = fetchUrl.endsWith('/') ? fetchUrl + 'models' : fetchUrl + '/models';
            }
            
            const response = await fetch(fetchUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${settings.apiKey}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            if (data.data && Array.isArray(data.data)) {
                const select = $('#st_tr_model_select');
                select.empty();
                
                let modelFound = false;
                data.data.forEach(model => {
                    const id = model.id;
                    const option = $('<option></option>').attr('value', id).text(id);
                    if (id === settings.modelName) {
                        option.prop('selected', true);
                        modelFound = true;
                    }
                    select.append(option);
                });
                
                $('#st_tr_model_select_container').show();
                
                // 如果当前填写的模型不在列表中，自动切换到列表的第一个模型
                if (!modelFound && data.data.length > 0) {
                    const firstModel = data.data[0].id;
                    select.val(firstModel);
                    $('#st_tr_model_name').val(firstModel);
                    settings.modelName = firstModel;
                    saveSettings();
                }

                select.off('change').on('change', (e) => {
                    const selectedModel = $(e.target).val();
                    $('#st_tr_model_name').val(selectedModel);
                    settings.modelName = selectedModel;
                    saveSettings();
                });
                toastr.success('获取模型列表成功');
            } else {
                 toastr.warning('获取模型列表失败，返回格式不兼容');
            }
            
        } catch (error) {
            console.error('Fetch models error:', error);
            toastr.error('获取模型列表失败: ' + error.message);
        }
    });
}
