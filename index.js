const axios = require("axios");
const fs = require("fs");

const CHANNEL_ID = process.env.CHANNEL_ID;
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const PATREON_TOKEN = process.env.PATREON_ACCESS_TOKEN;
const SAVE_FILE = "sent_posts.json";

// 保存用ファイルの読み込み
let sentPosts = [];
if (fs.existsSync(SAVE_FILE)) {
  try {
    sentPosts = JSON.parse(fs.readFileSync(SAVE_FILE, "utf8"));
  } catch (e) { sentPosts = []; }
}

async function sendDiscord(message) {
  try {
    return await axios.post(
      `discord.com{CHANNEL_ID}/messages`,
      { content: message },
      {
        headers: {
          Authorization: `Bot ${DISCORD_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    if (err.response?.status === 429) {
      // レート制限(429)の場合は指定秒数待機して再試行
      const retryAfter = (err.response.data.retry_after || 1) * 1000;
      console.log(`Rate limited! Waiting ${retryAfter}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter));
      return sendDiscord(message);
    }
    throw err;
  }
}

async function getCampaignId() {
  const res = await axios.get("www.patreon.com", {
    headers: { Authorization: `Bearer ${PATREON_TOKEN}` },
  });
  // 配列かオブジェクトかで対応（2025年時点のAPI仕様に準拠）
  const data = res.data.data;
  return Array.isArray(data) ? data[0].id : data.id;
}

async function getPosts(campaignId) {
  const res = await axios.get(
    `www.patreon.com/${campaignId}/posts?sort=-published_at&page[count]=10`,
    { headers: { Authorization: `Bearer ${PATREON_TOKEN}` } }
  );
  return res.data.data.reverse();
}

async function run() {
  const campaignId = await getCampaignId();
  const posts = await getPosts(campaignId);

  for (const post of posts) {
    // 既に送信済みのIDならスキップ
    if (sentPosts.includes(post.id)) continue;

    const title = post.attributes?.title || "New Patreon Post";
    const url = `www.patreon.com{post.id}`;

    console.log(`Sending: ${title}`);
    await sendDiscord(`🆕 **${title}**\n${url}`);

    // 送信に成功したら即座にIDを保存（エラー中断対策）
    sentPosts.push(post.id);
    // 履歴が溜まりすぎないよう直近100件を保持
    if (sentPosts.length > 100) sentPosts.shift();
    fs.writeFileSync(SAVE_FILE, JSON.stringify(sentPosts));
    
    // 次の送信まで1秒待機
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

run().catch(err => {
  console.error("FATAL ERROR", err.response?.status, err.response?.data);
  process.exit(1);
});
