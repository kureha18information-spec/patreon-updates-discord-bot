const axios = require("axios");
const fs = require("fs");
const { execSync } = require("child_process");

const CHANNEL_ID = process.env.CHANNEL_ID;
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const PATREON_TOKEN = process.env.PATREON_ACCESS_TOKEN;

const SAVE_FILE = "sent_posts.json";
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- load history ----------
let sent = [];
if (fs.existsSync(SAVE_FILE)) {
  sent = JSON.parse(fs.readFileSync(SAVE_FILE, "utf8"));
}

// ---------- save & commit ----------
function save() {
  fs.writeFileSync(SAVE_FILE, JSON.stringify(sent, null, 2));
  execSync("git config user.name github-actions");
  execSync("git config user.email github-actions@github.com");
  execSync(`git add ${SAVE_FILE}`);
  execSync(`git commit -m "save sent post ids" || true`);
  execSync("git push");
}

// ---------- Discord send with retry ----------
async function sendDiscord(text) {
  try {
    await axios.post(
      `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`,
      { content: text },
      { headers: { Authorization: `Bot ${DISCORD_TOKEN}` } }
    );
  } catch (e) {
    if (e.response?.status === 429) {
      await sleep(e.response.data.retry_after * 1000);
      return sendDiscord(text);
    }
    throw e;
  }
}

// ---------- Patreon: get campaign ID ----------
async function getCampaignId() {
  const res = await axios.get(
    "https://www.patreon.com/api/oauth2/v2/identity?include=memberships.campaign",
    { headers: { Authorization: `Bearer ${PATREON_TOKEN}` } }
  );

  const campaign = res.data.included?.find(x => x.type === "campaign");
  if (!campaign) throw new Error("Campaign not found");

  return campaign.id;
}

// ---------- fetch posts ----------
async function fetchPosts(campaignId, count) {
  const params = {
    "sort": "-published_at",
    "page[count]": count
  };

  const res = await axios.get(
    `https://www.patreon.com/api/oauth2/v2/campaigns/${campaignId}/posts`,
    {
      headers: { Authorization: `Bearer ${PATREON_TOKEN}` },
      params
    }
  );

  return res.data.data;
}

// ---------- main ----------
async function run() {
  const campaignId = await getCampaignId();

  let fetchCount = 100; // 100 → 200 → 300 → … 無制限
  let newPosts = [];

  while (true) {
    console.log(`Fetching ${fetchCount} posts...`);

    const posts = await fetchPosts(campaignId, fetchCount);

    // 新規投稿だけ抽出
    newPosts = posts.filter(p => {
      const url = p.attributes.url;
      const id = url.replace("https://www.patreon.com/posts/", "");
      return !sent.includes(id);
    });

    if (newPosts.length > 0) break; // 新規があれば終了

    // 新規が0 → 次は +100 件
    fetchCount += 100;

    // API が返せる最大まで取ったら終了
    if (posts.length < fetchCount - 100) break;
  }

  // 古い → 新しい順に並べ替え
  newPosts.sort(
    (a, b) =>
      new Date(a.attributes.published_at) -
      new Date(b.attributes.published_at)
  );

  // 新規投稿だけ Discord に送る
  for (const p of newPosts) {
    const url = p.attributes.url;
    const id = url.replace("https://www.patreon.com/posts/", "");
    const title = p.attributes.title || "New Patreon Post";

    await sendDiscord(`🆕 **${title}**\n${url}`);

    sent.push(id);
    save();
  }
}

run().catch(err => {
  console.error("FATAL ERROR");
  console.error(err.message);
  console.error(err.response?.data);
  process.exit(1);
});
