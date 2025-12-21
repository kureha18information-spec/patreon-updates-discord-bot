import fs from "fs";
import axios from "axios";
import { execSync } from "child_process";

// ===== ENV =====
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PATREON_ACCESS_TOKEN = process.env.PATREON_ACCESS_TOKEN;

if (!DISCORD_BOT_TOKEN || !CHANNEL_ID || !PATREON_ACCESS_TOKEN) {
  console.error("ENV missing");
  process.exit(1);
}

// ===== FILE =====
const SENT_FILE = "sent_posts.json";

// ===== UTIL =====
function loadSent() {
  if (!fs.existsSync(SENT_FILE)) return [];
  return JSON.parse(fs.readFileSync(SENT_FILE, "utf8"));
}

function saveSent(sent) {
  fs.writeFileSync(SENT_FILE, JSON.stringify(sent, null, 2));
  execSync("git config user.name 'github-actions[bot]'");
  execSync("git config user.email 'github-actions[bot]@users.noreply.github.com'");
  execSync(`git add ${SENT_FILE}`);
  execSync(`git commit -m "update sent posts" || true`);
  execSync("git push");
}

// /posts/ の後ろ全部をIDにする（英字OK）
function getPostIdFromUrl(url) {
  const m = url.match(/\/posts\/(.+)$/);
  return m ? m[1] : null;
}

// ===== MAIN =====
async function run() {
  const sent = loadSent();

  const res = await axios.get(
    "https://www.patreon.com/api/oauth2/v2/posts",
    {
      headers: {
        Authorization: `Bearer ${PATREON_ACCESS_TOKEN}`,
      },
      params: {
        "page[count]": 100,
        "fields[post]": "title,content,created_at,url",
      },
    }
  );

  const posts = res.data.data || [];
  let updated = false;

  for (const post of posts) {
    const url = post.attributes?.url;
    if (!url) continue;

    const postId = getPostIdFromUrl(url);
    if (!postId) continue;

    if (sent.includes(postId)) continue;

    const title = post.attributes?.title || "New Patreon Post";

    // Discord送信
    await axios.post(
      `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`,
      {
        content: `🆕 **${title}**\n${url}`,
      },
      {
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    sent.push(postId);
    saveSent(sent); // 逐次保存
    updated = true;
  }

  if (!updated) {
    console.log("No new posts");
  }
}

run().catch((e) => {
  console.error(e.response?.data || e.message);
  process.exit(1);
});

run().catch(err => {
  console.error(err);
  process.exit(1);
});
