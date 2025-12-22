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

// ---------- fetch 100 posts with cursor ----------
async function fetchPosts(campaignId, cursor = null) {
  const params = {
    "sort": "-published_at",
    "page[count]": 100
  };
  if (cursor) params["page[cursor]"] = cursor;

  const res = await axios.get(
    `https://www.patreon.com/api/oauth2/v2/campaigns/${campaignId}/posts`,
    {
      headers: { Authorization: `Bearer ${PATREON_TOKEN}` },
      params
    }
  );

  return {
    posts: res.data.data,
    nextCursor: res.data.meta?.pagination?.cursors?.next || null
  };
}

// ---------- main ----------
async function run() {
  const campaignId = await getCampaignId();

  let allPosts = [];
  let cursor = null;

  while (true) {
    // 100件取得
    const { posts, nextCursor } = await fetchPosts(campaignId, cursor);
    if (!posts.length) break;

    allPosts.push(...posts);

    // 100件中、既知IDが何件あるか
    const knownCount = posts.filter(p => {
      const url = p.attributes.url;
      const id = url.replace("https://www.patreon.com/posts/", "");
      return sent.includes(id);
    }).length;

    // 全部既知 → 次の100件へ
    if (knownCount === posts.length) {
      if (!nextCursor) break;
      cursor = nextCursor;
      continue;
    }

    // 一部既知 → 既知件数ぶん次ページを追加取得
    if (knownCount > 0) {
      if (!nextCursor) break;
      const extra = await fetchPosts(campaignId, nextCursor);
      allPosts.push(...extra.posts);
    }

    break;
  }

  // 古い → 新しい順に並べ替え
  allPosts.sort(
    (a, b) =>
      new Date(a.attributes.published_at) -
      new Date(b.attributes.published_at)
  );

  // 新規投稿だけ処理
  for (const p of allPosts) {
    const url = p.attributes.url;
    const id = url.replace("https://www.patreon.com/posts/", "");

    if (sent.includes(id)) continue;

    const title = p.attributes.title || "New Patreon Post";

    await sendDiscord(`🆕 **${title}**\n${url}`);

    sent.push(id);
    save(); // 逐次保存
  }
}

run().catch(err => {
  console.error("FATAL ERROR");
  console.error(err.message);
  console.error(err.response?.data);
  process.exit(1);
});
