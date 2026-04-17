// ==========================================
// 1. 面板按钮绑定逻辑
// ==========================================
document.getElementById('startBtn').addEventListener('click', async () => {
  const asinText = document.getElementById('asinList').value;
  const asins = asinText.split(/[\s,\t\n]+/).map(s => s.trim()).filter(s => s.length > 5);
  if (asins.length === 0) { alert('请先输入ASIN！'); return; }

  chrome.storage.local.set({ asinList: asins, downloadIndex: 0 }, async () => {
      document.getElementById('status').innerText = `常规列表已存入数据库！(按F12可查看日志)`;
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.scripting.executeScript({ target: { tabId: tab.id }, function: runAutomation, args: [asins] });
  });
});

document.getElementById('multiWeekBtn').addEventListener('click', async () => {
  const asinText = document.getElementById('asinList').value;
  const asins = asinText.split(/[\s,\t\n]+/).map(s => s.trim()).filter(s => s.length > 5);
  const weeks = parseInt(document.getElementById('weekCount').value) || 10;

  if (asins.length === 0) { alert('请先在输入框填入 1 个你要查的 ASIN！'); return; }
  if (asins.length > 1) { alert('此模式只处理单个 ASIN，系统将自动只取第一个！'); }

  let targetAsin = asins[0];
  let fakeAsinList = [];
  for(let i=0; i<weeks; i++) {
      fakeAsinList.push(`${targetAsin}_最近第${i+1}周`);
  }

  chrome.storage.local.set({ asinList: fakeAsinList, downloadIndex: 0 }, async () => {
      document.getElementById('status').innerText = `准备完成，连下 ${weeks} 周！`;
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.scripting.executeScript({ target: { tabId: tab.id }, function: runMultiWeekAutomation, args: [targetAsin, weeks] });
  });
});

document.getElementById('batchDownloadBtn').addEventListener('click', async () => {
  chrome.storage.local.get(['asinList'], async (result) => {
      let asins = result.asinList || [];
      if (asins.length === 0) { alert('数据库中没有记住 ASIN！请先执行生成操作。'); return; }
      chrome.storage.local.set({ downloadIndex: 0 }, async () => {
          document.getElementById('status').innerText = ` 锁定目标！准备批量下载！`;
          let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          chrome.scripting.executeScript({ target: { tabId: tab.id }, function: runBatchDownload, args: [asins.length] });
      });
  });
});

document.getElementById('resetBtn').addEventListener('click', () => {
  chrome.storage.local.set({ downloadIndex: 0 }, () => { alert("✅ 序号已重置！"); });
});


// ==========================================
// 2. 网页内执行的【一键批量下载】
// ==========================================
async function runBatchDownload(targetCount) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  function log(msg) { console.log(`%c[提取特工] ${msg}`, 'color: #0ea5e9; font-weight: bold; font-size: 14px;'); }

  let allDownloadLinks = Array.from(document.querySelectorAll('span')).filter(el => {
      let text = (el.textContent || '').trim();
      return (text === '下载' || text === 'Download') && el.getBoundingClientRect().width > 0;
  });

  if (allDownloadLinks.length === 0) { alert("❌ 没找到纯文本下载按钮！请确认在下载管理器。"); return; }
  if (allDownloadLinks.length < targetCount) targetCount = allDownloadLinks.length;

  let targetButtons = allDownloadLinks.slice(0, targetCount).reverse();
  log(`🚀 开启时间倒流机制，准备提取 ${targetCount} 个文件...`);

  for (let i = 0; i < targetButtons.length; i++) {
      log(`>>> 正在提取倒数第 ${targetButtons.length - i} 行...`);
      targetButtons[i].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window }));
      await sleep(2500);
  }
  alert(`🎉 ${targetCount} 个报表已全部提取并自动命名！`);
}

// ==========================================
// 3. 网页内执行的【多 ASIN 常规生成】 
// ==========================================
async function runAutomation(asins) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  function log(msg) { console.log(`%c[填表特工] ${msg}`, 'color: #EAB308; font-weight: bold; font-size: 14px;'); }

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

  log(`🚀 准备处理 ${asins.length} 个 ASIN...`);
  for (let i = 0; i < asins.length; i++) {
    let asin = asins[i];
    log(`>>> 处理第 ${i+1} 个: ${asin}`);
    try {
      let viewTabs = deepQuerySelectorAll('span, div, a, button, kat-tab-label').filter(isElementTrulyVisible);
      let asinTab = viewTabs.find(el => el.innerText && el.innerText.trim() === 'ASIN 视图');
      if (asinTab) { asinTab.click(); await sleep(800); }

      if(!setKatalValue(asin)) { log('❌ 找不到输入框'); continue; }
      await sleep(1000); 

      if(clickButtonByText(['应用', 'Apply'])) log(`✅ 已点击【应用】`);
      await sleep(4500); 

      if (clickButtonByText(['生成下载项', '生成下载', 'Download'])) log(`✅ 第一次【生成下载项】`);
      await sleep(2500); 

      if (clickKatalButtonById('downloadModalGenerateDownloadButton')) log(`🎯 弹窗确认，等待系统生成...`);
      for (let retry = 0; retry < 3; retry++) {
          await sleep(4000); 
          if (clickButtonByText(['重试', 'Retry'])) { log(`⚠️ 重试 (${retry + 1}/3)...`); } 
          else { log(`✅ 报表生成成功！`); break; }
      }
      if (clickKatalButtonById('downloadModalCloseButton')) log(`🎯 弹窗关闭`);
      await sleep(1500); 
      
      let clearSpans = deepQuerySelectorAll('span.link__inner').filter(isElementTrulyVisible);
      let clearSearchBtn = clearSpans.find(span => span.textContent.includes('清除搜索记录'));
      if(clearSearchBtn) { clearSearchBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })); } 
      await sleep(1500); 
    } catch (err) { console.error(`发生错误:`, err); }
  }
  alert(` 处理完毕！`);
}

// ==========================================
// 🌟 4. 网页内执行的【单 ASIN 连续往前下 N 周】
// ==========================================
async function runMultiWeekAutomation(asin, weeksCount) {
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  function log(msg) { console.log(`%c[时光特工] ${msg}`, 'color: #8B5CF6; font-weight: bold; font-size: 14px;'); }

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
                  target.click();
                  target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, view: window }));
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
              target.click();
              target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, view: window }));
          }
          return true;
      }
      return false;
  }

  log(`🚀 准备为单 ASIN: ${asin} 时光倒流连续下载 ${weeksCount} 周...`);

  let allDropdowns = deepQuerySelectorAll('kat-dropdown');
  let alreadyHasWeekly = allDropdowns.some(dd => dd.id === 'weekly-week' || (dd.innerText || '').includes('周 '));

  if (!alreadyHasWeekly) {
      log('⚠️ 尝试切换 ASIN 视图...');
      let viewTabs = deepQuerySelectorAll('span, div, a, button, kat-tab-label').filter(isElementTrulyVisible);
      let asinTab = viewTabs.find(el => el.innerText && el.innerText.trim() === 'ASIN 视图');
      if (asinTab) { asinTab.click(); await sleep(1500); }
  } else {
      log('✅ 检测到网页状态已就绪，开始执行！');
  }

  if(!setKatalValue(asin)) { log('❌ 找不到输入框'); return; }
  await sleep(1000); 

  for (let i = 0; i < weeksCount; i++) {
      log(`>>> 正在锁定并提取倒数第 ${i+1} 周的数据...`);
      
      let dropdowns = deepQuerySelectorAll('kat-dropdown#weekly-week').filter(isElementTrulyVisible);
      let dateDropdown = dropdowns.length > 0 ? dropdowns[0] : null;

      if (!dateDropdown) {
          alert('❌ 找不到 id="weekly-week" 的日期下拉框！请确认已手动选为【每周】！');
          return;
      }

      // 展开菜单
      let header = dateDropdown.shadowRoot ? dateDropdown.shadowRoot.querySelector('.select-header') : dateDropdown;
      if (header) {
          header.click();
          header.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, view: window }));
      }
      await sleep(1500); 

      // 💥 修复核心：用穿透雷达去找 kat-option，绝不用原生方法！
      let allOptions = deepQuerySelectorAll('kat-option', dateDropdown.shadowRoot || dateDropdown);
      // 如果下拉框内部没搜到，就去全网搜（终极兜底）
      if (allOptions.length === 0) {
          allOptions = deepQuerySelectorAll('kat-option');
      }

      let validOptions = allOptions.filter(o => {
          let val = o.getAttribute('value') || '';
          return val.match(/^\d{4}-\d{2}-\d{2}/);
      });
      validOptions = [...new Set(validOptions)]; // 去重
      
      if (validOptions.length === 0) {
          log(`❌ 在防弹玻璃内依然获取不到选项，页面结构异常！`); return;
      }
      if (i >= validOptions.length) {
          log(`⚠️ 抱歉，网页只有 ${validOptions.length} 周可以选，已全部跑完。`); break;
      }

      let targetOption = validOptions[i];
      let val = targetOption.getAttribute('value');
      log(`🎯 已锁定目标，日期: ${val || `第${i+1}个`}`);
      
      // 💥 模拟真实点击核心肉体
      let clickSuccess = false;
      if (targetOption.shadowRoot) {
          let nameEl = targetOption.shadowRoot.querySelector('div.standard-option-name') || targetOption.shadowRoot.querySelector('div.standard-option-content');
          if (nameEl) {
              nameEl.click();
              nameEl.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, view: window }));
              clickSuccess = true;
          }
      }
      if (!clickSuccess) {
          targetOption.click();
          targetOption.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, view: window }));
      }

      // 💥 覆盖原生属性
      dateDropdown.value = val;
      dateDropdown.setAttribute('value', val);
      dateDropdown.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      await sleep(2000); 
      log(`🔎 当前提交的内部值为: ${dateDropdown.value}`);

      if(clickButtonByText(['应用', 'Apply'])) log(`✅ 已点击【应用】`);
      await sleep(4500); 

      if (clickButtonByText(['生成下载项', '生成下载', 'Download'])) log(`✅ 第一次【生成下载项】`);
      await sleep(2500); 

      if (clickKatalButtonById('downloadModalGenerateDownloadButton')) log(`🎯 弹窗确认，等待生成...`);
      for (let retry = 0; retry < 3; retry++) {
          await sleep(4000); 
          if (clickButtonByText(['重试', 'Retry'])) { log(`⚠️ 重试 (${retry + 1}/3)...`); } 
          else { log(`✅ 报表生成成功！`); break; }
      }
      if (clickKatalButtonById('downloadModalCloseButton')) log(`🎯 弹窗关闭`);
      await sleep(1500); 
  }

  alert(`🎉 任务完美结束！已成功为 ${asin} 生成了 ${weeksCount} 周的报表！\n👉 请前往“下载管理器”使用批量提取。`);
}