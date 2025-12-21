const axios = require("axios");
const fs = require("fs");
const { execSync } = require("child_process");

const CHANNEL_ID = process.env.CHANNEL_ID;
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const PATREON_TOKEN = process.env.PATREON_ACCESS_TOKEN;

const SAVE_FILE = "sent_posts.json";
const sleep = ms => new Promise(r => setTimeout(r, ms));

let sent = [];
if (fs.existsSync(SAVE_FILE)) {
  sent = JSON.parse(fs.readFileSync(SAVE_FILE, "utf8"));
}

// 保存＋GitHubに上書き保存
function save() {
  fs.writeFileSync(SAVE_FILE, JSON.stringify(sent, null, 2));
  execSync("git config user.name github-actions");
  execSync("git config user.email github-actions@github.com");
  execSync(`git add ${SAVE_FILE}`);
  execSync(`git commit -m "save sent post ids" || true`);
  execSync("git push");
}

// Discord送信（429対応）
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

async function run() {
  const campaign = await axios.get(
    "https://www.patreon.com/api/oauth2/v2/campaigns",
    { headers: { Authorization: `Bearer ${PATREON_TOKEN}` } }
  );

  const campaignId = campaign.data.data[0].id;

  const postsRes = await axios.get(
    `https://www.patreon.com/api/oauth2/v2/campaigns/${campaignId}/posts?sort=-published_at&page[count]=100`,
    { headers: { Authorization: `Bearer ${PATREON_TOKEN}` } }
  );

  const posts = postsRes.data.data.sort(
    (a, b) =>
      new Date(a.attributes.published_at) -
      new Date(b.attributes.published_at)
  );

  for (const p of posts) {
    const id = p.id; // URL末尾と同じID
    if (sent.includes(id)) continue;

    const title = p.attributes.title || "New Patreon Post";
    const url = `https://www.patreon.com/posts/${id}`;

    await sendDiscord(`🆕 **${title}**\n${url}`);

    sent.push(id);
    save(); // ← ここが重要（逐次保存）
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
