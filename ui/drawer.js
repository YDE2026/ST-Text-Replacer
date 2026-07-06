import { initSettings, bindSettingsUI } from './settings.js';
import { getSlideToggleOptions } from '/script.js';
import { slideToggle } from '/lib.js';

// Get current script URL to dynamically determine extension path
const currentScriptUrl = import.meta.url;
// Determine the base path of the extension folder
// It finds the position of the extension folder name and extracts the path up to it
const extensionName = 'ST-Text-Replacer';
const extensionFolderPath = currentScriptUrl.substring(0, currentScriptUrl.indexOf(extensionName) + extensionName.length);
// Make it relative to the root if it's an absolute URL
const relativeExtensionFolderPath = new URL(extensionFolderPath).pathname.substring(1); // removes leading '/'

function toggleDrawerFallback() {
    const drawerIcon = $('#st_tr_drawer_icon');
    const contentPanel = $('#st_tr_drawer_content');
    
    if (drawerIcon.hasClass('openIcon') && !contentPanel.is(':visible')) {
        drawerIcon.removeClass('openIcon').addClass('closedIcon');
    }
    
    if (drawerIcon.hasClass('closedIcon')) {
        $('.openDrawer').not(contentPanel).not('.pinnedOpen').addClass('resizing').each((_, el) => {
            slideToggle(el, {
                ...getSlideToggleOptions(),
                onAnimationEnd: function (el) {
                    el.closest('.drawer-content').classList.remove('resizing');
                },
            });
        });
        $('.openIcon').not(drawerIcon).not('.drawerPinnedOpen').toggleClass('closedIcon openIcon');
        $('.openDrawer').not(contentPanel).not('.pinnedOpen').toggleClass('closedDrawer openDrawer');

        drawerIcon.toggleClass('closedIcon openIcon');
        contentPanel.toggleClass('closedDrawer openDrawer');

        contentPanel.addClass('resizing').each((_, el) => {
            slideToggle(el, {
                ...getSlideToggleOptions(),
                onAnimationEnd: function (el) {
                    el.closest('.drawer-content').classList.remove('resizing');
                },
            });
        });
    } else {
        drawerIcon.toggleClass('openIcon closedIcon');
        contentPanel.toggleClass('openDrawer closedDrawer');

        contentPanel.addClass('resizing').each((_, el) => {
            slideToggle(el, {
                ...getSlideToggleOptions(),
                onAnimationEnd: function (el) {
                    el.closest('.drawer-content').classList.remove('resizing');
                },
            });
        });
    }
}

export async function createDrawer() {
    if ($("#st_tr_main_drawer").length > 0) return;

    const drawerHtml = `
      <div id="st_tr_main_drawer" class="drawer">
          <div class="drawer-toggle" data-drawer="st_tr_drawer_content">
              <div id="st_tr_drawer_icon" class="drawer-icon fa-solid fa-pen-nib fa-fw closedIcon interactable" title="文本替换优化" tabindex="0"></div>
          </div>
          <div id="st_tr_drawer_content" class="drawer-content closedDrawer">
          </div>
      </div>
    `;
    
    // 将按钮放置在用户设置按钮（#user-settings-button）的后面
    if ($("#user-settings-button").length > 0) {
        $("#user-settings-button").after(drawerHtml);
    } else {
        $("#sys-settings-button").after(drawerHtml); // 备用位置
    }
    
    const contentPanel = $("#st_tr_drawer_content");

    try {
        // 加载 HTML
        const modalContent = await $.get(`${relativeExtensionFolderPath}/assets/settings.html`);
        contentPanel.html(modalContent);
        
        
        // 加载 CSS
        const link = document.createElement("link");
        link.id = "st-tr-style";
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = `${relativeExtensionFolderPath}/assets/style.css?v=${Date.now()}`;
        document.head.appendChild(link);

        // 初始化设置和绑定 UI
        initSettings();
        bindSettingsUI();
        
        contentPanel.data("initialized", true);

        // 绑定点击事件
        try {
            const { doNavbarIconClick } = await import('/script.js');
            if (typeof doNavbarIconClick === 'function') {
                $('#st_tr_main_drawer .drawer-toggle').on('click', doNavbarIconClick);
            } else {
                throw new Error('doNavbarIconClick is not a function');
            }
        } catch (error) {
            $('#st_tr_main_drawer .drawer-toggle').on('click', toggleDrawerFallback);
        }

    } catch (error) {
        console.error("[ST-Text-Replacer] UI 加载失败:", error);
        contentPanel.html('<p style="color:red; padding:10px;">UI 加载失败，请检查网络或插件完整性。</p>');
    }
}
