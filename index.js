console.log("ENV CHECK");
console.log("DISCORD_BOT_TOKEN exists:", !!process.env.DISCORD_BOT_TOKEN);
console.log("CHANNEL_ID:", process.env.CHANNEL_ID);
console.log("PATREON_ACCESS_TOKEN exists:", !!process.env.PATREON_ACCESS_TOKEN);
const axios = require("axios");
const fs = require("fs");

const CHANNEL_ID = process.env.CHANNEL_ID;
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const PATREON_TOKEN = process.env.PATREON_ACCESS_TOKEN;

const SAVE_FILE = "sent_posts.json";

let sentPosts = [];
if (fs.existsSync(SAVE_FILE)) {
  sentPosts = JSON.parse(fs.readFileSync(SAVE_FILE, "utf8"));
}

async function sendDiscord(message) {
  await axios.post(
    `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`,
    { content: message },
    {
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

async function run() {
  const res = await axios.get(
    "https://www.patreon.com/api/oauth2/v2/posts?sort=-published_at&page[count]=10",
    {
      headers: {
        Authorization: `Bearer ${PATREON_TOKEN}`
      }
    }
  );

  const posts = res.data.data.reverse();

  for (const post of posts) {
    if (sentPosts.includes(post.id)) continue;

    const title = post.attributes.title || "New Patreon Post";
    const url = `https://www.patreon.com/posts/${post.id}`;

    await sendDiscord(`🆕 **${title}**\n${url}`);

    sentPosts.push(post.id);
  }

  fs.writeFileSync(SAVE_FILE, JSON.stringify(sentPosts));
}

run();
