// ==========================================
// 1. 面板按钮绑定逻辑
// ==========================================

// 🔍 新增：派侦察兵去网页读取下拉框数据
document.getElementById('fetchWeeksBtn').addEventListener('click', async () => {
    document.getElementById('status').innerText = `⏳ 正在潜入网页读取下拉框，请稍候...`;
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.scripting.executeScript({ 
        target: { tabId: tab.id }, 
        function: fetchWeeksFromPageAsync 
    }, (results) => {
        if (results && results[0] && results[0].result) {
            let res = results[0].result;
            if (res.error) {
                alert(res.error);
                document.getElementById('status').innerText = `❌ 读取失败`;
                return;
            }
            // 成功拿到数据，开始渲染下拉框
            let select = document.getElementById('startWeek');
            select.innerHTML = ''; // 清空旧数据
            res.data.forEach((textStr, idx) => {
                let opt = document.createElement('option');
                opt.value = idx; // value 存的是真实位置序号
                opt.textContent = textStr; // 界面显示真实日期
                select.appendChild(opt);
            });
            document.getElementById('status').innerText = `✅ 成功同步 ${res.data.length} 周数据！`;
        }
    });
});

document.getElementById('startBtn').addEventListener('click', async () => {
  const asins = document.getElementById('asinList').value.split(/[\s,\t\n]+/).map(s => s.trim()).filter(s => s.length > 5);
  if (asins.length === 0) { alert('请先输入ASIN！'); return; }

  chrome.storage.local.set({ asinList: asins, downloadIndex: 0 }, async () => {
      document.getElementById('status').innerText = `😎 常规列表已存入大脑！`;
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.scripting.executeScript({ target: { tabId: tab.id }, function: runAutomation, args: [asins] });
  });
});

document.getElementById('multiWeekBtn').addEventListener('click', async () => {
  const asins = document.getElementById('asinList').value.split(/[\s,\t\n]+/).map(s => s.trim()).filter(s => s.length > 5);
  const weeks = parseInt(document.getElementById('weekCount').value) || 10;
  
  if (asins.length === 0) { alert('请先在上方输入框填入 1 个你要查的 ASIN！'); return; }
  
  let targetAsin = asins[0];
  let select = document.getElementById('startWeek');
  let startIndex = parseInt(select.value) || 0; // 拿到用户选中的起点位置
  
  // 🌟 终极文件命名法：直接提取下拉框里的真实日期！
  let fakeAsinList = [];
  for(let i = startIndex; i < startIndex + weeks; i++) {
      if (select.options.length > 1 && i < select.options.length) {
          let rawText = select.options[i].text;
          // 清理 Windows 文件名里的非法字符 (比如 | 和 /)
          let safeText = rawText.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
          fakeAsinList.push(`${targetAsin}_${safeText}`);
      } else {
          fakeAsinList.push(`${targetAsin}_第${i+1}项`);
      }
  }

  chrome.storage.local.set({ asinList: fakeAsinList, downloadIndex: 0 }, async () => {
      document.getElementById('status').innerText = `准备连下 ${weeks} 周！`;
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      // 把起始位置 startIndex 传给网页里的函数
      chrome.scripting.executeScript({ target: { tabId: tab.id }, function: runMultiWeekAutomation, args: [targetAsin, weeks, startIndex] });
  });
});

document.getElementById('batchDownloadBtn').addEventListener('click', async () => {
  chrome.storage.local.get(['asinList'], async (result) => {
      let asins = result.asinList || [];
      if (asins.length === 0) return alert('🧠 大脑里没有记住 ASIN！请先执行生成操作。');
      chrome.storage.local.set({ downloadIndex: 0 }, async () => {
          document.getElementById('status').innerText = ` 准备批量下载！`;
          let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          chrome.scripting.executeScript({ target: { tabId: tab.id }, function: runBatchDownload, args: [asins.length] });
      });
  });
});

document.getElementById('resetBtn').addEventListener('click', () => {
  chrome.storage.local.set({ downloadIndex: 0 }, () => { alert("✅ 序号已重置！"); });
});


// ==========================================
// 🌟 注入网页的侦察兵：负责读取下拉框周数
// ==========================================
async function fetchWeeksFromPageAsync() {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    
    // 穿透雷达工具
    function deepQuerySelectorAll(selector, root = document) {
        let results = [];
        if (root.querySelectorAll) results.push(...root.querySelectorAll(selector));
        if (root.shadowRoot) results.push(...deepQuerySelectorAll(selector, root.shadowRoot));
        let elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
        for (let el of elements) {
            if (el.shadowRoot) results.push(...deepQuerySelectorAll(selector, el.shadowRoot));
        }
        return [...new Set(results)];
    }
    
    // 物理点击工具
    function realPhysicalClick(el) {
        if (!el) return;
        try { el.scrollIntoView({block: 'center', behavior: 'instant'}); } catch(e){}
        let rect = el.getBoundingClientRect();
        let x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        let evOpts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y };
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => el.dispatchEvent(new MouseEvent(t, evOpts)));
        el.click();
    }

    // 寻找下拉框
    let dropdowns = deepQuerySelectorAll('kat-dropdown#weekly-week');
    if (dropdowns.length === 0) dropdowns = deepQuerySelectorAll('kat-dropdown').filter(dd => (dd.innerText || '').includes('周 '));
    if (dropdowns.length === 0) return { error: "❌ 没找到日期下拉框！请在网页上将报告范围选为【每周】！" };

    let dateDropdown = dropdowns[0];

    // 强制展开下拉框以渲染选项
    let header = dateDropdown.shadowRoot ? dateDropdown.shadowRoot.querySelector('.select-header, .kat-select-container') : dateDropdown;
    realPhysicalClick(header);
    await sleep(2000); // 给足渲染时间

    // 抓取选项
    let allOptions = deepQuerySelectorAll('kat-option', dateDropdown.shadowRoot || dateDropdown);
    if (allOptions.length === 0) allOptions = deepQuerySelectorAll('kat-option');

    let validOptions = allOptions.filter(o => {
        let val = (o.value || o.getAttribute('value') || '').trim();
        return val.match(/^\d{4}-\d{2}-\d{2}/);
    });
    validOptions = [...new Set(validOptions)];

    if (validOptions.length === 0) {
        realPhysicalClick(header); // 关上
        return { error: "❌ 展开后读取不到日期选项，请确保页面未卡顿。" };
    }

    // 提取纯文本日期信息
    let results = validOptions.map(o => {
        let text = o.innerText || o.textContent || o.getAttribute('value');
        // 把多余的回车、换行、长空格替换为一个空格，方便做文件名
        return text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    });

    // 读完后礼貌地关上
    realPhysicalClick(header);

    return { data: results };
}

// ==========================================
// 以下为之前的函数，仅在 runMultiWeekAutomation 中修改了 for 循环的起点
// ==========================================

async function runBatchDownload(targetCount) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  let allDownloadLinks = Array.from(document.querySelectorAll('span')).filter(el => {
      let text = (el.textContent || '').trim();
      return (text === '下载' || text === 'Download') && el.getBoundingClientRect().width > 0;
  });
  if (allDownloadLinks.length === 0) return alert("❌ 没找到纯文本下载按钮！请确认在下载管理器。");
  if (allDownloadLinks.length < targetCount) targetCount = allDownloadLinks.length;
  let targetButtons = allDownloadLinks.slice(0, targetCount).reverse();
  for (let i = 0; i < targetButtons.length; i++) {
      targetButtons[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window }));
      await sleep(2500);
  }
  alert(`🎉 报表提取完毕！`);
}

async function runAutomation(asins) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  function deepQuerySelectorAll(selector, root = document) {
      let results = [];
      if (root.querySelectorAll) results.push(...root.querySelectorAll(selector));
      if (root.shadowRoot) results.push(...deepQuerySelectorAll(selector, root.shadowRoot));
      let elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (let el of elements) {
          if (el.shadowRoot) results.push(...deepQuerySelectorAll(selector, el.shadowRoot));
      }
      return [...new Set(results)]; 
  }
  function isElementTrulyVisible(el) {
      if (el.getBoundingClientRect().width === 0) return false;
      let current = el;
      while (current && current !== document) {
          if (current instanceof ShadowRoot) { current = current.host; continue; }
          if (current.nodeType === 1) { 
              let style = window.getComputedStyle(current);
              if (style.display === 'none' || style.visibility === 'hidden') return false;
          }
          current = current.parentNode;
      }
      return true;
  }
  function setKatalValue(asin) {
      let hosts = deepQuerySelectorAll('kat-predictive-input, kat-input').filter(isElementTrulyVisible);
      let host = hosts.find(h => h.getAttribute('data-test-id') === 'PredictiveTextFilter' || (h.getAttribute('placeholder')||'').toUpperCase().includes('ASIN'));
      if (!host && hosts.length > 0) host = hosts.find(h => !(h.id || '').includes('nav') && !(h.id || '').includes('twotabsearch'));
      let shadowInput = host ? host.shadowRoot.querySelector('input') : null;
      if (shadowInput) {
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(shadowInput, asin);
          shadowInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          shadowInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          return true;
      }
      return false;
  }
  function clickButtonByText(keywords) {
      let elements = deepQuerySelectorAll('button, kat-button, .a-button-text').filter(isElementTrulyVisible);
      for (let el of elements) {
          let text = (el.innerText || el.textContent || el.getAttribute('label') || '').trim();
          if (keywords.some(kw => text.includes(kw))) {
              let ev = new MouseEvent('click', { bubbles: true, composed: true, view: window });
              if (el.shadowRoot) { let inner = el.shadowRoot.querySelector('button'); if(inner) {inner.dispatchEvent(ev); return true;} }
              el.dispatchEvent(ev); return true;
          }
      }
      return false;
  }
  function clickKatalButtonById(id) {
      let els = deepQuerySelectorAll(`kat-button#${id}`);
      if (els.length > 0) {
          let ev = new MouseEvent('click', { bubbles: true, composed: true, view: window });
          if (els[0].shadowRoot) { let inner = els[0].shadowRoot.querySelector('button'); if(inner) {inner.dispatchEvent(ev); return true;} }
          els[0].dispatchEvent(ev); return true;
      }
      return false;
  }

  for (let i = 0; i < asins.length; i++) {
    let asin = asins[i];
    try {
      let viewTabs = deepQuerySelectorAll('span, div, a, button, kat-tab-label').filter(isElementTrulyVisible);
      let asinTab = viewTabs.find(el => el.innerText && el.innerText.trim() === 'ASIN 视图');
      if (asinTab) { asinTab.click(); await sleep(800); }

      if(!setKatalValue(asin)) continue;
      await sleep(1000); 
      clickButtonByText(['应用', 'Apply']);
      await sleep(4500); 
      clickButtonByText(['生成下载项', '生成下载', 'Download']);
      await sleep(2500); 
      clickKatalButtonById('downloadModalGenerateDownloadButton');
      for (let retry = 0; retry < 3; retry++) {
          await sleep(4000); 
          if (!clickButtonByText(['重试', 'Retry'])) break;
      }
      clickKatalButtonById('downloadModalCloseButton');
      await sleep(1500); 
      let clearSpans = deepQuerySelectorAll('span.link__inner').filter(isElementTrulyVisible);
      let clearSearchBtn = clearSpans.find(span => span.textContent.includes('清除搜索记录'));
      if(clearSearchBtn) clearSearchBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      await sleep(1500); 
    } catch (err) { console.error(`发生错误:`, err); }
  }
  alert(`🎉 多 ASIN 生成处理完毕！`);
}

// 🌟 接收 startIndex 的终极循环引擎
async function runMultiWeekAutomation(asin, weeksCount, startIndex) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  function log(msg) { console.log(`%c[时光特工] ${msg}`, 'color: #8B5CF6; font-weight: bold; font-size: 14px;'); }

  function realPhysicalClick(el) {
      if (!el) return;
      try { el.scrollIntoView({block: 'center', behavior: 'instant'}); } catch(e){}
      let rect = el.getBoundingClientRect();
      let x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      let evOpts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y };
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => el.dispatchEvent(new MouseEvent(t, evOpts)));
      el.click();
  }
  function deepQuerySelectorAll(selector, root = document) {
      let results = [];
      if (root.querySelectorAll) results.push(...root.querySelectorAll(selector));
      if (root.shadowRoot) results.push(...deepQuerySelectorAll(selector, root.shadowRoot));
      let elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (let el of elements) {
          if (el.shadowRoot) results.push(...deepQuerySelectorAll(selector, el.shadowRoot));
      }
      return [...new Set(results)];
  }
  function isElementTrulyVisible(el) {
      if (el.getBoundingClientRect().width === 0) return false;
      let current = el;
      while (current && current !== document) {
          if (current instanceof ShadowRoot) { current = current.host; continue; }
          if (current.nodeType === 1) { 
              let style = window.getComputedStyle(current);
              if (style.display === 'none' || style.visibility === 'hidden') return false;
          }
          current = current.parentNode;
      }
      return true;
  }
  function setKatalValue(asin) {
      let hosts = deepQuerySelectorAll('kat-predictive-input, kat-input').filter(isElementTrulyVisible);
      let host = hosts.find(h => h.getAttribute('data-test-id') === 'PredictiveTextFilter' || (h.getAttribute('placeholder')||'').toUpperCase().includes('ASIN'));
      if (!host && hosts.length > 0) host = hosts.find(h => !(h.id || '').includes('nav') && !(h.id || '').includes('twotabsearch'));
      let shadowInput = host ? host.shadowRoot.querySelector('input') : null;
      if (shadowInput) {
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(shadowInput, asin);
          shadowInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
          shadowInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          return true;
      }
      return false;
  }
  function clickButtonByText(keywords) {
      let elements = deepQuerySelectorAll('button, kat-button, .a-button-text').filter(isElementTrulyVisible);
      for (let el of elements) {
          let text = (el.innerText || el.textContent || el.getAttribute('label') || '').trim();
          if (keywords.some(kw => text.includes(kw))) {
              let target = el.shadowRoot ? el.shadowRoot.querySelector('button') : el;
              if (target) {
                  target.click(); target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, view: window }));
              }
              return true;
          }
      }
      return false;
  }
  function clickKatalButtonById(id) {
      let els = deepQuerySelectorAll(`kat-button#${id}`);
      if (els.length > 0) {
          let target = els[0].shadowRoot ? els[0].shadowRoot.querySelector('button') : els[0];
          if (target) {
              target.click(); target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, view: window }));
          }
          return true;
      }
      return false;
  }

  let allDropdowns = deepQuerySelectorAll('kat-dropdown');
  let alreadyHasWeekly = allDropdowns.some(dd => dd.id === 'weekly-week' || (dd.innerText || '').includes('周 '));
  if (!alreadyHasWeekly) {
      let viewTabs = deepQuerySelectorAll('span, div, a, button, kat-tab-label').filter(isElementTrulyVisible);
      let asinTab = viewTabs.find(el => el.innerText && el.innerText.trim() === 'ASIN 视图');
      if (asinTab) { asinTab.click(); await sleep(1500); }
  }

  if(!setKatalValue(asin)) { log('❌ 找不到输入框'); return; }
  await sleep(1000); 

  // 🌟 终极变更：从指定的 startIndex 开始循环！
  let loopEnd = startIndex + weeksCount;
  for (let i = startIndex; i < loopEnd; i++) {
      log(`>>> 正在锁定并提取索引位 ${i} 的数据...`);
      
      let dropdowns = deepQuerySelectorAll('kat-dropdown#weekly-week').filter(isElementTrulyVisible);
      let dateDropdown = dropdowns.length > 0 ? dropdowns[0] : null;
      if (!dateDropdown) return alert('❌ 找不到 id="weekly-week" 的下拉框！');

      let header = dateDropdown.shadowRoot ? dateDropdown.shadowRoot.querySelector('.select-header') : dateDropdown;
      if (header) {
          header.click(); header.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, view: window }));
      }
      await sleep(1500); 

      let allOptions = deepQuerySelectorAll('kat-option', dateDropdown.shadowRoot || dateDropdown);
      if (allOptions.length === 0) allOptions = deepQuerySelectorAll('kat-option');

      let validOptions = allOptions.filter(o => {
          let val = o.getAttribute('value') || '';
          return val.match(/^\d{4}-\d{2}-\d{2}/);
      });
      validOptions = [...new Set(validOptions)]; 
      
      if (validOptions.length === 0) return log(`❌ 获取不到选项！`);
      if (i >= validOptions.length) {
          log(`⚠️ 抱歉，网页只有 ${validOptions.length} 周可以选，已全部跑完。`); break;
      }

      let targetOption = validOptions[i];
      let val = targetOption.getAttribute('value');
      
      let clickSuccess = false;
      if (targetOption.shadowRoot) {
          let nameEl = targetOption.shadowRoot.querySelector('div.standard-option-name') || targetOption.shadowRoot.querySelector('div.standard-option-content');
          if (nameEl) {
              nameEl.click(); nameEl.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, view: window })); clickSuccess = true;
          }
      }
      if (!clickSuccess) {
          targetOption.click(); targetOption.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, view: window }));
      }

      dateDropdown.value = val;
      dateDropdown.setAttribute('value', val);
      dateDropdown.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      await sleep(2000); 

      if(clickButtonByText(['应用', 'Apply'])) log(`✅ 已点击【应用】`);
      await sleep(4500); 

      if (clickButtonByText(['生成下载项', '生成下载', 'Download'])) log(`✅ 第一次【生成下载项】`);
      await sleep(2500); 

      if (clickKatalButtonById('downloadModalGenerateDownloadButton')) log(`🎯 弹窗确认，等待生成...`);
      for (let retry = 0; retry < 3; retry++) {
          await sleep(4000); 
          if (!clickButtonByText(['重试', 'Retry'])) break;
      }
      if (clickKatalButtonById('downloadModalCloseButton')) log(`🎯 弹窗关闭`);
      await sleep(1500); 
  }

  alert(`🎉 时光倒流任务完成！👉 请前往“下载管理器”提取！`);
}