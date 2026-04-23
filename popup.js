// ==========================================
// 1. 面板按钮绑定逻辑
// ==========================================

document.getElementById('fetchWeeksBtn').addEventListener('click', async () => {
    document.getElementById('status').innerText = `⏳ 正在潜入网页读取下拉框...`;
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    chrome.scripting.executeScript({ 
        target: { tabId: tab.id }, 
        function: fetchWeeksFromPageAsync 
    }, (results) => {
        if (results && results[0] && results[0].result) {
            let res = results[0].result;
            if (res.error) { alert(res.error); document.getElementById('status').innerText = `❌ 读取失败`; return; }
            let select = document.getElementById('startWeek');
            select.innerHTML = ''; 
            res.data.forEach((textStr, idx) => {
                let opt = document.createElement('option');
                opt.value = idx; opt.textContent = textStr; select.appendChild(opt);
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
  if (asins.length === 0) { alert('请先在上方输入框填入 ASIN（支持多个）！'); return; }
  
  let select = document.getElementById('startWeek');
  let startIndex = parseInt(select.value) || 0; 
  let fakeAsinList = [];
  
  for(let a = 0; a < asins.length; a++) {
      let targetAsin = asins[a];
      for(let i = startIndex; i < startIndex + weeks; i++) {
          if (select.options.length > 1 && i < select.options.length) {
              let safeText = select.options[i].text.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
              fakeAsinList.push(`${targetAsin}_${safeText}`);
          } else {
              fakeAsinList.push(`${targetAsin}_第${i+1}项`);
          }
      }
  }

  chrome.storage.local.set({ asinList: fakeAsinList, downloadIndex: 0 }, async () => {
      document.getElementById('status').innerText = `🕰️ 任务开始！共 ${asins.length} 个ASIN，各 ${weeks} 周！`;
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.scripting.executeScript({ target: { tabId: tab.id }, function: runMultiWeekAutomation, args: [asins, weeks, startIndex] });
  });
});

document.getElementById('batchDownloadBtn').addEventListener('click', async () => {
  // 获取用户填写的国家代码
  let filterText = document.getElementById('countryFilter').value.trim();

  chrome.storage.local.get(['asinList'], async (result) => {
      let asins = result.asinList || [];
      if (asins.length === 0) return alert('🧠 大脑里没有记住 ASIN！请先执行生成操作。');
      chrome.storage.local.set({ downloadIndex: 0 }, async () => {
          document.getElementById('status').innerText = `😎 锁定目标！${filterText ? '启动防串台过滤' : '未加过滤'}，准备提取！`;
          let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          // 将过滤词传给网页
          chrome.scripting.executeScript({ target: { tabId: tab.id }, function: runBatchDownload, args: [asins.length, filterText] });
      });
  });
});

document.getElementById('resetBtn').addEventListener('click', () => {
  chrome.storage.local.set({ downloadIndex: 0 }, () => { alert("✅ 序号已重置！"); document.getElementById('status').innerText = "序号已归零"; });
});


// ==========================================
// 🌟 注入网页的代码集
// ==========================================
async function fetchWeeksFromPageAsync() {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    function deepQuerySelectorAll(selector, root = document) {
        let results = [];
        if (root.querySelectorAll) results.push(...root.querySelectorAll(selector));
        if (root.shadowRoot) results.push(...deepQuerySelectorAll(selector, root.shadowRoot));
        let elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
        for (let el of elements) { if (el.shadowRoot) results.push(...deepQuerySelectorAll(selector, el.shadowRoot)); }
        return [...new Set(results)];
    }
    function realPhysicalClick(el) {
        if (!el) return; try { el.scrollIntoView({block: 'center', behavior: 'instant'}); } catch(e){}
        let rect = el.getBoundingClientRect(); let x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        let evOpts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y };
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => el.dispatchEvent(new MouseEvent(t, evOpts)));
        el.click();
    }

    let dropdowns = deepQuerySelectorAll('kat-dropdown#weekly-week');
    if (dropdowns.length === 0) dropdowns = deepQuerySelectorAll('kat-dropdown').filter(dd => (dd.innerText || '').includes('周 '));
    if (dropdowns.length === 0) return { error: "❌ 没找到日期下拉框！" };

    let dateDropdown = dropdowns[0];
    let header = dateDropdown.shadowRoot ? dateDropdown.shadowRoot.querySelector('.select-header, .kat-select-container') : dateDropdown;
    realPhysicalClick(header); await sleep(2000); 

    let allOptions = deepQuerySelectorAll('kat-option', dateDropdown.shadowRoot || dateDropdown);
    if (allOptions.length === 0) allOptions = deepQuerySelectorAll('kat-option');
    let validOptions = allOptions.filter(o => (o.value || o.getAttribute('value') || '').match(/^\d{4}-\d{2}-\d{2}/));
    if (validOptions.length === 0) { realPhysicalClick(header); return { error: "❌ 展开后读取不到日期选项" }; }

    let results = [...new Set(validOptions)].map(o => (o.innerText || o.textContent || o.getAttribute('value')).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim());
    realPhysicalClick(header); return { data: results };
}

// 💥 升级版：带防串台过滤器的批量下载
async function runBatchDownload(targetCount, filterText) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  function log(msg) { console.log(`%c[提取特工] ${msg}`, 'color: #0ea5e9; font-weight: bold; font-size: 14px;'); }

  let allDownloadSpans = Array.from(document.querySelectorAll('span')).filter(el => {
      let text = (el.textContent || '').trim();
      return (text === '下载' || text === 'Download') && el.getBoundingClientRect().width > 0;
  });

  if (allDownloadSpans.length === 0) return alert("❌ 没找到纯文本下载按钮！请确认在下载管理器。");

  let validButtons = [];
  
  // 逐个检查按钮所在的“行”
  for (let span of allDownloadSpans) {
      // 往上找父节点，找到代表这一整行数据的容器
      let row = span.closest('kat-table-row, tr, [role="row"], .kat-table-row');
      if (!row) row = span.parentElement.parentElement.parentElement; // 粗暴兜底
      
      let rowText = row ? (row.textContent || row.innerText || "") : "";
      
      if (filterText) {
          // 如果用户填了过滤词 (比如 FR)，且这一行里不包含 FR，就直接丢弃！
          if (rowText.toUpperCase().includes(filterText.toUpperCase())) {
              validButtons.push(span);
          } else {
              log(`已跳过包含其他国家数据的行: ${rowText.substring(0, 20)}...`);
          }
      } else {
          // 没填过滤词，全都下
          validButtons.push(span);
      }
  }

  if (validButtons.length === 0) {
      return alert(`❌ 过滤失败！页面上没有找到包含 "${filterText}" 的下载按钮！`);
  }

  if (validButtons.length < targetCount) targetCount = validButtons.length;

  let targetButtons = validButtons.slice(0, targetCount).reverse();
  log(`🚀 过滤成功！准备提取 ${targetCount} 个属于 ${filterText || '全部'} 的文件...`);

  for (let i = 0; i < targetButtons.length; i++) {
      log(`>>> 正在提取倒数第 ${targetButtons.length - i} 行...`);
      targetButtons[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window }));
      await sleep(2500);
  }
  alert(`🎉 ${targetCount} 个报表提取完毕！`);
}

// 核心生成特工代码 (保持不变)
async function runAutomation(asins) { /* ...原代码，已省略，下方拼接完整... */ }
async function runMultiWeekAutomation(asins, weeksCount, startIndex) { /* ...原代码，已省略，下方拼接完整... */ }

// ==========================================
// 补全前面的原函数（为了精简篇幅我在上面省略了，现在补全）
// ==========================================
async function runAutomation(asins) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  function deepQuerySelectorAll(s, r = document) {
      let res = []; if (r.querySelectorAll) res.push(...r.querySelectorAll(s));
      if (r.shadowRoot) res.push(...deepQuerySelectorAll(s, r.shadowRoot));
      let els = r.querySelectorAll ? r.querySelectorAll('*') : [];
      for (let el of els) { if (el.shadowRoot) res.push(...deepQuerySelectorAll(s, el.shadowRoot)); }
      return [...new Set(res)]; 
  }
  function isElementTrulyVisible(el) {
      if (el.getBoundingClientRect().width === 0) return false;
      let curr = el; while (curr && curr !== document) {
          if (curr instanceof ShadowRoot) { curr = curr.host; continue; }
          if (curr.nodeType === 1) { 
              let st = window.getComputedStyle(curr);
              if (st.display === 'none' || st.visibility === 'hidden') return false;
          }
          curr = curr.parentNode;
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
  function clickButtonByText(kws) {
      let els = deepQuerySelectorAll('button, kat-button, .a-button-text').filter(isElementTrulyVisible);
      for (let el of els) {
          let text = (el.innerText || el.textContent || el.getAttribute('label') || '').trim();
          if (kws.some(kw => text.includes(kw))) {
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
      await sleep(1000); clickButtonByText(['应用', 'Apply']); await sleep(4500); 
      clickButtonByText(['生成下载项', '生成下载', 'Download']); await sleep(2500); 
      clickKatalButtonById('downloadModalGenerateDownloadButton');
      for (let retry = 0; retry < 3; retry++) { await sleep(4000); if (!clickButtonByText(['重试', 'Retry'])) break; }
      clickKatalButtonById('downloadModalCloseButton'); await sleep(1500); 
      let clearSpans = deepQuerySelectorAll('span.link__inner').filter(isElementTrulyVisible);
      let clearSearchBtn = clearSpans.find(span => span.textContent.includes('清除搜索记录'));
      if(clearSearchBtn) clearSearchBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
      await sleep(1500); 
    } catch (err) { console.error(`发生错误:`, err); }
  }
  alert(`🎉 多 ASIN 生成处理完毕！`);
}

async function runMultiWeekAutomation(asins, weeksCount, startIndex) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  function log(msg) { console.log(`%c[时光特工] ${msg}`, 'color: #8B5CF6; font-weight: bold; font-size: 14px;'); }

  function realPhysicalClick(el) {
      if (!el) return; try { el.scrollIntoView({block: 'center', behavior: 'instant'}); } catch(e){}
      let rect = el.getBoundingClientRect(); let x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      let evOpts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y };
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => el.dispatchEvent(new MouseEvent(t, evOpts))); el.click();
  }
  function deepQuerySelectorAll(s, r = document) {
      let res = []; if (r.querySelectorAll) res.push(...r.querySelectorAll(s));
      if (r.shadowRoot) res.push(...deepQuerySelectorAll(s, r.shadowRoot));
      let els = r.querySelectorAll ? r.querySelectorAll('*') : [];
      for (let el of els) { if (el.shadowRoot) res.push(...deepQuerySelectorAll(s, el.shadowRoot)); }
      return [...new Set(res)];
  }
  function isElementTrulyVisible(el) {
      if (el.getBoundingClientRect().width === 0) return false;
      let curr = el; while (curr && curr !== document) {
          if (curr instanceof ShadowRoot) { curr = curr.host; continue; }
          if (curr.nodeType === 1) { 
              let st = window.getComputedStyle(curr);
              if (st.display === 'none' || st.visibility === 'hidden') return false;
          }
          curr = curr.parentNode;
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
  function clickButtonByText(kws) {
      let els = deepQuerySelectorAll('button, kat-button, .a-button-text').filter(isElementTrulyVisible);
      for (let el of els) {
          let text = (el.innerText || el.textContent || el.getAttribute('label') || '').trim();
          if (kws.some(kw => text.includes(kw))) {
              let target = el.shadowRoot ? el.shadowRoot.querySelector('button') : el;
              if (target) { target.click(); target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, view: window })); }
              return true;
          }
      }
      return false;
  }
  function clickKatalButtonById(id) {
      let els = deepQuerySelectorAll(`kat-button#${id}`);
      if (els.length > 0) {
          let target = els[0].shadowRoot ? els[0].shadowRoot.querySelector('button') : els[0];
          if (target) { target.click(); target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, view: window })); }
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

  for (let a = 0; a < asins.length; a++) {
      let currentAsin = asins[a];
      log(`=========================================`);
      log(`🚀 开始处理第 ${a+1}/${asins.length} 个 ASIN: ${currentAsin}`);
      
      if(!setKatalValue(currentAsin)) { log(`❌ 找不到输入框，跳过`); continue; }
      await sleep(1000); 

      let loopEnd = startIndex + weeksCount;
      for (let i = startIndex; i < loopEnd; i++) {
          let dropdowns = deepQuerySelectorAll('kat-dropdown#weekly-week').filter(isElementTrulyVisible);
          let dateDropdown = dropdowns.length > 0 ? dropdowns[0] : null;
          if (!dateDropdown) { alert('❌ 找不到日期下拉框！'); break; }

          let header = dateDropdown.shadowRoot ? dateDropdown.shadowRoot.querySelector('.select-header') : dateDropdown;
          if (header) { header.click(); header.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, view: window })); }
          await sleep(1500); 

          let allOptions = deepQuerySelectorAll('kat-option', dateDropdown.shadowRoot || dateDropdown);
          if (allOptions.length === 0) allOptions = deepQuerySelectorAll('kat-option');
          let validOptions = allOptions.filter(o => (o.getAttribute('value') || '').match(/^\d{4}-\d{2}-\d{2}/));
          validOptions = [...new Set(validOptions)]; 
          
          if (validOptions.length === 0) { log(`❌ 获取不到选项！`); break; }
          if (i >= validOptions.length) { log(`⚠️ 网页只有 ${validOptions.length} 周可选，已跑完。`); break; }

          let targetOption = validOptions[i];
          let val = targetOption.getAttribute('value');
          
          let clickSuccess = false;
          if (targetOption.shadowRoot) {
              let nameEl = targetOption.shadowRoot.querySelector('div.standard-option-name') || targetOption.shadowRoot.querySelector('div.standard-option-content');
              if (nameEl) { nameEl.click(); nameEl.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, view: window })); clickSuccess = true; }
          }
          if (!clickSuccess) { targetOption.click(); targetOption.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, view: window })); }

          dateDropdown.value = val; dateDropdown.setAttribute('value', val);
          dateDropdown.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
          await sleep(2000); 

          if(clickButtonByText(['应用', 'Apply'])) log(`✅ 已点击【应用】`);
          await sleep(4500); 
          if (clickButtonByText(['生成下载项', '生成下载', 'Download'])) log(`✅ 第一次【生成下载项】`);
          await sleep(2500); 
          if (clickKatalButtonById('downloadModalGenerateDownloadButton')) log(`🎯 弹窗确认，等待生成...`);
          for (let retry = 0; retry < 3; retry++) { await sleep(4000); if (!clickButtonByText(['重试', 'Retry'])) break; }
          if (clickKatalButtonById('downloadModalCloseButton')) log(`🎯 弹窗关闭`);
          await sleep(1500); 
      }
      
      let clearSpans = deepQuerySelectorAll('span.link__inner').filter(isElementTrulyVisible);
      let clearSearchBtn = clearSpans.find(span => span.textContent.includes('清除搜索记录'));
      if(clearSearchBtn) { clearSearchBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })); await sleep(1500); }
  }
  alert(`🎉 全部完成！请前往“下载管理器”提取！`);
}