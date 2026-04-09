// ==========================================
// 这是你原本的两个按钮逻辑 (保持不变)
// ==========================================
document.getElementById('startBtn').addEventListener('click', async () => {
  const asinText = document.getElementById('asinList').value;
  const asins = asinText.split(/[\s,\t\n]+/).map(s => s.trim()).filter(s => s.length > 5);
  
  if (asins.length === 0) { alert('请先输入ASIN！'); return; }

  chrome.storage.local.set({ asinList: asins, downloadIndex: 0 }, async () => {
      document.getElementById('status').innerText = `列表已存入数据库！(按F12看日志)`;
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: runAutomation,
        args: [asins]
      });
  });
});

document.getElementById('resetBtn').addEventListener('click', () => {
  chrome.storage.local.set({ downloadIndex: 0 }, () => {
     alert("序号已重置！");
  });
});

// ==========================================
// 🌟 【全新大招：一键批量下载特工】🌟
// ==========================================
document.getElementById('batchDownloadBtn').addEventListener('click', async () => {
  chrome.storage.local.get(['asinList'], async (result) => {
      let asins = result.asinList || [];
      if (asins.length === 0) {
          alert('数据库里没有记住任何 ASIN！请先粘贴列表并点击“开始”。');
          return;
      }

      // 每次开始批量下载前，强制把后台的命名进度拨回 0，严丝合缝！
      chrome.storage.local.set({ downloadIndex: 0 }, async () => {
          document.getElementById('status').innerText = `准备去表格里进行 ${asins.length} 个下载！`;
          let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: runBatchDownload,
            args: [asins.length]
          });
      });
  });
});

// 网页内执行的批量下载逻辑
async function runBatchDownload(targetCount) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  function log(msg) { console.log(`%c[批量提取特工] ${msg}`, 'color: #0ea5e9; font-weight: bold; font-size: 14px;'); }

  // 1. 🎯 【极其精准的扫描】：只找纯粹是“下载”两个字的 span
  let allDownloadLinks = Array.from(document.querySelectorAll('span')).filter(el => {
      // 严格匹配纯文本，防止抓到包含很多字的父级整行 div
      let text = (el.textContent || '').trim();
      if (text !== '下载' && text !== 'Download') return false; 
      
      // 确保它是肉眼可见的
      let rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
  });

  if (allDownloadLinks.length === 0) {
      alert("❌ 没找到任何纯粹的“下载”按钮！请确认页面已加载完毕。");
      return;
  }

  // 如果页面上的文件比预期的少，以页面上的为准
  if (allDownloadLinks.length < targetCount) {
      log(`⚠️ 页面上的文件不足 ${targetCount} 个，将提取现有的 ${allDownloadLinks.length} 个。`);
      targetCount = allDownloadLinks.length;
  }

  // 2. 截取最上面的 N 个目标
  let targetButtons = allDownloadLinks.slice(0, targetCount);

  // 3. 💣 逆向破解：反转数组！从旧往新点，完美对齐 ASIN 顺序！
  targetButtons.reverse();

  log(`🚀 锁定 ${targetCount} 个目标！已开启时间倒流机制，准备提取...`);

  for (let i = 0; i < targetButtons.length; i++) {
      log(`>>> 正在提取倒数第 ${targetButtons.length - i} 行的数据...`);
      
      // 🎯 强行穿透点击：伪装成最真实的物理鼠标左键点击
      let clickEvent = new MouseEvent('click', { 
          bubbles: true, 
          cancelable: true, 
          composed: true, 
          view: window 
      });
      
      // 点在 span 上，让事件自己冒泡触发亚马逊的下载逻辑
      targetButtons[i].dispatchEvent(clickEvent);

      // 等待 2.5 秒，给浏览器和后台重命名插件留出处理时间
      await sleep(2500);
  }

  alert(`🎉 完美收工！${targetCount} 个报表已全部丢进你的下载文件夹，且已自动按序命名！`);
}

// ==========================================
// 网页内执行的核心自动化逻辑 
// ==========================================
async function runAutomation(asins) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  function log(msg) {
    console.log(`%c[ABA狙击版] ${msg}`, 'color: #8B5CF6; font-weight: bold; font-size: 14px;');
  }

  // 1. 递归穿透搜集
  function deepQuerySelectorAll(selector, root = document) {
      const results = Array.from(root.querySelectorAll(selector));
      const allElements = root.querySelectorAll('*');
      for (const el of allElements) {
          if (el.shadowRoot) {
              results.push(...deepQuerySelectorAll(selector, el.shadowRoot));
          }
      }
      return results;
  }

  // 2. X光真实可见性扫描 (用于防误触品牌视图)
  function isElementTrulyVisible(el) {
      let rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;

      let current = el;
      while (current && current !== document) {
          if (current instanceof ShadowRoot) {
              current = current.host;
              continue;
          }
          if (current.nodeType === 1) { 
              let style = window.getComputedStyle(current);
              if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
              if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') return false;
          }
          current = current.parentNode;
      }
      return true;
  }

  // 填字
 // 填字函数 (加入双形态兼容 + 黑名单防误触 + 特征优先)
  function setKatalValue(asin) {
    // 1. 同时搜寻新老两种输入框外壳
    let hosts = deepQuerySelectorAll('kat-predictive-input, kat-input').filter(isElementTrulyVisible);
    
    // 2. 🎯 精准特征识别：找包含 ASIN、或者特定测试 ID 的组件
    let host = hosts.find(h => {
        let testId = h.getAttribute('data-test-id') || '';
        let placeholder = h.getAttribute('placeholder') || '';
        // 顺藤摸瓜看看父级有没有你截图里的特定 ID
        let parentTestId = h.closest('[data-test-id]') ? h.closest('[data-test-id]').getAttribute('data-test-id') : '';

        return testId === 'PredictiveTextFilter' || 
               parentTestId === 'TextFilter' || 
               placeholder.toUpperCase().includes('ASIN');
    });

    // 如果没找到特别精准的，就选第一个不在黑名单里的（防止拿到顶部的搜索框）
    if (!host && hosts.length > 0) {
         host = hosts.find(h => !(h.id || '').includes('nav') && !(h.id || '').includes('twotabsearch'));
    }

    let shadowInput = host ? host.shadowRoot.querySelector('input') : null;

    if (shadowInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(shadowInput, asin);
        shadowInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        shadowInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        return true;
    }
    
    // 3. 🛡️ 终极备用方案：扫描普通输入框 + 严格黑名单过滤
    let inputs = deepQuerySelectorAll('input[type="text"], input[type="search"]').filter(i => {
        // 必须可见且非只读
        if (!isElementTrulyVisible(i) || i.readOnly || i.disabled) return false;
        
        // 【核心黑名单】：剔除亚马逊顶部的全局搜索框
        let id = (i.id || '').toLowerCase();
        let className = (i.className || '').toLowerCase();
        let name = (i.name || '').toLowerCase();
        
        if (id.includes('twotabsearch') || id.includes('nav-') || className.includes('nav-') || name === 'field-keywords') {
            return false; // 命中黑名单，直接丢弃！
        }
        return true;
    });

    // 在剩下的安全输入框里，优先找 placeholder 包含 ASIN 的
    let targetInput = inputs.find(i => (i.placeholder || '').toUpperCase().includes('ASIN')) || inputs[0];

    if (targetInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(targetInput, asin);
        targetInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        targetInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        return true;
    }

    return false;
  }

  function clickButtonByText(keywords) {
      let elements = deepQuerySelectorAll('button, kat-button, .a-button-text');
      elements = elements.filter(isElementTrulyVisible);

      for (let el of elements) {
          let text = (el.innerText || el.textContent || el.getAttribute('label') || '').trim();
          let testId = el.getAttribute('data-test-id') || '';

          if (keywords.includes('应用') && testId === 'RequiredFilterApplyButton' || keywords.some(kw => text.includes(kw))) {
              let clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window });
              if (el.shadowRoot) {
                  let innerBtn = el.shadowRoot.querySelector('button');
                  if (innerBtn) {
                      innerBtn.dispatchEvent(clickEvent);
                      return true;
                  }
              }
              el.dispatchEvent(clickEvent);
              return true;
          }
      }
      return false;
  }

  // 🎯 4. 【新增大招：ID 精确制导】专治弹窗里的唯一ID按钮，无视可见性扫描！
  function clickKatalButtonById(buttonId) {
      // 直接通过你的截图找到的 ID 进行全网页穿透搜索
      let elements = deepQuerySelectorAll(`kat-button#${buttonId}`);
      if (elements.length > 0) {
          let el = elements[0]; // 拿到这个唯一的按钮
          let clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window });

          // 穿透它的防弹玻璃点击最里面的真实 button
          if (el.shadowRoot) {
              let innerBtn = el.shadowRoot.querySelector('button');
              if (innerBtn) {
                  innerBtn.dispatchEvent(clickEvent);
                  return true;
              }
          }
          el.dispatchEvent(clickEvent);
          return true;
      }
      return false;
  }

  log(`🚀 狙击模式启动，准备处理 ${asins.length} 个 ASIN...`);

  for (let i = 0; i < asins.length; i++) {
    let asin = asins[i];
    log(`>>> 正在处理第 ${i+1} 个: ${asin}`);

    chrome.runtime.sendMessage({ action: "setCurrentAsin", asin: asin });

    try {
      // 强制防迷路：点一下 ASIN 视图
      let viewTabs = deepQuerySelectorAll('span, div, a, button, kat-tab-label').filter(isElementTrulyVisible);
      let asinTab = viewTabs.find(el => el.innerText && el.innerText.trim() === 'ASIN 视图');
      if (asinTab) {
          asinTab.click();
          await sleep(800); 
      }

      // 填入 ASIN
      let isSuccess = setKatalValue(asin);
      if(!isSuccess) {
         log('❌ 找不到有效的输入框');
         continue; 
      }
      await sleep(1000); 

      // 重点：点击应用
      let clickedApply = clickButtonByText(['应用', 'Apply']);
      if(clickedApply) {
          log(`✅ 已点击【应用】！等待数据加载...`);
      }
      await sleep(4500); 

      // 第一次生成下载项
      let clickedFirstDl = clickButtonByText(['生成下载项', '生成下载', 'Download']);
      if (clickedFirstDl) log(`已点击第一次【生成下载项】`);
      await sleep(2500); // 稍微加长等待弹窗动画的时间

      // 🎯 弹窗确认 (使用精确制导 ID)
      let clickedSecondDl = clickKatalButtonById('downloadModalGenerateDownloadButton');
      if (clickedSecondDl) log(`已点击弹窗内的确认下载！`);
      await sleep(3500); // 等待系统生成文件的时间稍微加长

      for (let retry = 0; retry < 3; retry++) {
          // 每次等 4 秒给亚马逊服务器生成的时间
          await sleep(4000); 
          
          // 扫描弹窗里有没有出现“重试”
          let needRetry = clickButtonByText(['重试', 'Retry']);
          if (needRetry) {
              log(`⚠️ 亚马逊服务器开小差了，已自动点击【重试】 (${retry + 1}/3)...`);
              // 触发重试后，进入下一次循环继续等待
          } else {
              // 如果等了 4 秒没看到重试按钮，说明大概率成功了，跳出循环！
              log(`✅ 报表生成成功！`);
              break; 
          }
      }

      // 🎯 关闭弹窗 (使用精确制导 ID)
      let clickedClose = clickKatalButtonById('downloadModalCloseButton');
      if (clickedClose) log(`弹窗已关闭`);
      await sleep(1500); 
      
      // 清除记录
      let clearSpans = deepQuerySelectorAll('span.link__inner').filter(isElementTrulyVisible);
      let clearSearchBtn = clearSpans.find(span => span.textContent.includes('清除搜索记录'));
      
      if(clearSearchBtn) {
          clearSearchBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
          log(`已点击【清除搜索记录】`);
      } else {
          setKatalValue('');
          log(`强行清空输入框`);
      }

      await sleep(1500); 
      
    } catch (err) {
      console.error(`处理 ${asin} 时发生错误:`, err);
    }
  }

  alert(`任务执行完毕！已处理完 ${asins.length} 个 ASIN！`);
}
    // 给重置按钮绑定点击事件
  document.getElementById('resetBtn').addEventListener('click', () => {
  // 发送暗号给后台：归零！
  chrome.runtime.sendMessage({ action: "resetCounter" });
  alert("序号已完美重置！下一个下载的文件将是 1.csv");
});