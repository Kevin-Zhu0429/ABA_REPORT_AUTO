// ==========================================
// 1. 定义亚马逊域名雷达 (仅用于做基础过滤，防副作用)
// ==========================================
const amazonUrlPatterns = [
  "amazon",           // 模糊匹配包含 amazon 的任何子域名
  "amazonaws.com",    // 极其重要：亚马逊 S3 存储桶域名
  "cloudfront.net"    // 亚马逊 CDN 域名，有时候会用
];

// 辅助函数：判断一个 URL 是否大概率属于亚马逊家族
function isAmazonFamilyUrl(url) {
  if (!url) return false;
  return amazonUrlPatterns.some(pattern => url.includes(pattern));
}


// ==========================================
// 2. 后台下载拦截核心逻辑 (终极容错版)
// ==========================================
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  // 💥 先看一眼大脑 💥
  chrome.storage.local.get(['asinList', 'downloadIndex'], (result) => {
    let asins = result.asinList || [];
    let index = result.downloadIndex || 0;
    let extension = item.filename.split('.').pop();
    let newFilename = item.filename;

    // 大脑里有 ASIN 列表 (意味着你刚刚跑了自动化脚本)
    if (asins.length > 0) {
        // 💥 这里是修复的重点 💥
        // 我们不再死扣 item.url 了，而是看文件的【引荐来源 referrer】
        // referrer 指的是你是在哪个页面点击下载的。
        let referrerUrl = item.referrer || "";
        const isFromAmazonPage = referrerUrl.includes("amazon") || referrerUrl.includes("sellercentral");

        // 只要你启动了脚本，且该下载请求大概率是从亚马逊页面发起的
        if (isFromAmazonPage) {
            if (index < asins.length) {
                // 这是我们要下载的报表！改名！
                newFilename = asins[index] + "." + extension;
                console.log(`[后台拦截] 成功将亚马逊报表重命名为: ${newFilename}`);
                chrome.storage.local.set({ downloadIndex: index + 1 });
                suggest({ filename: newFilename, conflictAction: "uniquify" });
            } else {
                // 超出列表的也改个名字醒目一下
                newFilename = "超出列表的亚马逊额外文件_" + Date.now() + "." + extension;
                suggest({ filename: newFilename, conflictAction: "uniquify" });
            }
        } else {
            // 虽然大脑有数据，但这个下载是从非亚马逊页面发起的 (比如你一边挂机一边下 Google Drive 的东西)
            // 彻底放行！绝不干扰！
            suggest();
            console.log(`[放行特工] 挂机中下非亚马逊文件 (${item.filename})，已放行。`);
        }
    } else {
        // 大脑里是空的，意味着你现在没有用插件跑批量下表任务
        // 不管你下的是亚马逊的还是非亚马逊的，一律彻底放行！绝对不改名字！
        // 也绝不会写什么“未输入 ASIN”了。💥
        suggest(); 
        console.log(`[放行特工] 大脑已空，彻底放行标准下载 (${item.filename})。`);
    }
  });

  // 必须返回 true，以保持这个异步拦截器一直有效
  return true; 
});