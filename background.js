// 监听浏览器的下载动作，在保存前拦截重命名！
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  
  // 异步读取数据库里的 ASIN 列表和当前的下载进度（序号）
  chrome.storage.local.get(['asinList', 'downloadIndex'], (result) => {
    let asins = result.asinList || [];
    let index = result.downloadIndex || 0;
    
    let extension = item.filename.split('.').pop();
    let newFilename = item.filename; // 默认保底原名

    if (asins.length > 0) {
        if (index < asins.length) {
            // 【核心魔法】：拿当前的序号去匹配对应的 ASIN
            newFilename = asins[index] + "." + extension;
            console.log(`[后台拦截] 成功重命名为: ${newFilename}`);
            
            // 序号自动 +1，并存回数据库，等待下一次下载
            chrome.storage.local.set({ downloadIndex: index + 1 });
        } else {
            // 如果你下载的次数比输入的 ASIN 还多
            newFilename = "超出列表的额外文件_" + Date.now() + "." + extension;
        }
    } else {
        newFilename = "未输入ASIN列表_" + Date.now() + "." + extension;
    }

    // 建议浏览器用新名字保存，遇到重名自动加括号 (1)
    suggest({ filename: newFilename, conflictAction: "uniquify" });
  });

  // 【极度重要】：必须返回 true，告诉浏览器“等等我，我去数据库查个名”，否则它就直接按原名下载了！
  return true; 
});