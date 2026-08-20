const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const User = require('./models/User');
const Admin = require('./models/Admin');

const WELCOME = {
  en: { flag: '🇬🇧', name: 'English', title: '🎁 Welcome to Lucky Fest!', body: 'Merge gifts, level up, and win real prizes — right inside Telegram.', play: '▶️ Play' },
  bn: { flag: '🇧🇩', name: 'বাংলা', title: '🎁 লাকি ফেস্টে স্বাগতম!', body: 'গিফট মার্জ করো, লেভেল আপ করো, আর টেলিগ্রামের ভেতরেই আসল প্রাইজ জিতো।', play: '▶️ খেলা শুরু করো' },
  zh: { flag: '🇨🇳', name: '中文', title: '🎁 欢迎来到幸运节！', body: '合成礼物，升级，直接在 Telegram 内赢取真实奖品。', play: '▶️ 开始游戏' },
  ru: { flag: '🇷🇺', name: 'Русский', title: '🎁 Добро пожаловать в Lucky Fest!', body: 'Объединяйте подарки, повышайте уровень и выигрывайте призы прямо в Telegram.', play: '▶️ Играть' },
  ar: { flag: '🇸🇦', name: 'العربية', title: '🎁 مرحبًا بك في لاكي فيست!', body: 'ادمج الهدايا، ارتقِ بمستواك، واربح جوائز حقيقية داخل تيليجرام.', play: '▶️ العب الآن' },
  fr: { flag: '🇫🇷', name: 'Français', title: '🎁 Bienvenue sur Lucky Fest !', body: 'Fusionnez des cadeaux, montez de niveau et gagnez de vrais prix, directement dans Telegram.', play: '▶️ Jouer' },
  pt: { flag: '🇧🇷', name: 'Português', title: '🎁 Bem-vindo ao Lucky Fest!', body: 'Combine presentes, suba de nível e ganhe prêmios reais direto no Telegram.', play: '▶️ Jogar' },
  es: { flag: '🇪🇸', name: 'Español', title: '🎁 ¡Bienvenido a Lucky Fest!', body: 'Combina regalos, sube de nivel y gana premios reales dentro de Telegram.', play: '▶️ Jugar' },
  vi: { flag: '🇻🇳', name: 'Tiếng Việt', title: '🎁 Chào mừng đến với Lucky Fest!', body: 'Ghép quà, lên cấp và giành giải thưởng thật ngay trong Telegram.', play: '▶️ Chơi ngay' },
};

function languageKeyboard() {
  const codes = Object.keys(WELCOME);
  const rows = [];
  for (let i = 0; i < codes.length; i += 2) {
    rows.push(codes.slice(i, i + 2).map((code) => ({ text: `${WELCOME[code].flag} ${WELCOME[code].name}`, callback_data: `lang:${code}` })));
  }
  return rows;
}

async function isAdmin(telegramId) {
  return !!(await Admin.findOne({ telegramId: String(telegramId) }));
}
async function isOwner(telegramId) {
  const a = await Admin.findOne({ telegramId: String(telegramId) });
  return !!(a && a.isOwner);
}

const USER_HELP = `*Lucky Fest Bot*\n\n/start — Start the bot & welcome message\n/help — This command list`;

const ADMIN_HELP = `${USER_HELP}\n\n*Admin commands:*\n/announcement <text> — Broadcast a text message to all users\n/announcementimage — Reply to a photo with this command + caption to broadcast it\n/stats — Bot user/admin statistics\n/totalusers — Total users who have started the bot\n\n*Owner only:*\n/addadmin <telegramId> — Add a new admin\n/removeadmin <telegramId> — Remove an admin`;

function startBot() {
  if (!config.botToken) {
    console.warn('[bot] BOT_TOKEN missing — Telegram bot process not started.');
    return null;
  }

  const bot = new TelegramBot(config.botToken, { polling: true });

  // /start [ref_<telegramId>]
  bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = String(msg.from.id);
    const payload = (match && match[1]) || '';

    let referredBy = null;
    if (payload.startsWith('ref_')) {
      const refId = payload.slice(4);
      if (refId && refId !== telegramId) referredBy = refId;
    }

    const existing = await User.findOne({ telegramId });
    if (!existing) {
      await User.create({
        telegramId,
        username: msg.from.username || '',
        firstName: msg.from.first_name || '',
        languageCode: msg.from.language_code || 'en',
        referredBy,
      });
      if (referredBy) {
        await User.findOneAndUpdate({ telegramId: referredBy }, { $inc: { invitedCount: 1 } });
      }
    }

    await bot.sendMessage(chatId, '🎉 Choose your language / ভাষা বেছে নাও:', { reply_markup: { inline_keyboard: languageKeyboard() } });
  });

  bot.on('callback_query', async (query) => {
    const data = query.data || '';
    if (!data.startsWith('lang:')) return;
    const code = data.split(':')[1];
    const copy = WELCOME[code] || WELCOME.en;
    const chatId = query.message.chat.id;
    const telegramId = String(query.from.id);

    try {
      await User.findOneAndUpdate({ telegramId }, { $set: { languageCode: code } });
    } catch (e) { console.error('[bot] Failed to save language:', e.message); }

    const keyboard = config.miniAppUrl
      ? { inline_keyboard: [[{ text: copy.play, web_app: { url: config.miniAppUrl } }]] }
      : undefined;

    await bot.editMessageText(`${copy.title}\n\n${copy.body}`, { chat_id: chatId, message_id: query.message.message_id, reply_markup: keyboard });
    await bot.answerCallbackQuery(query.id);
  });

  // /help — role-aware. Admin commands are never shown to regular users.
  bot.onText(/\/help/, async (msg) => {
    const admin = await isAdmin(msg.from.id);
    await bot.sendMessage(msg.chat.id, admin ? ADMIN_HELP : USER_HELP, { parse_mode: 'Markdown' });
  });

  // /totalusers
  bot.onText(/\/totalusers/, async (msg) => {
    const count = await User.countDocuments();
    await bot.sendMessage(msg.chat.id, `👥 Total users who started the bot: *${count}*`, { parse_mode: 'Markdown' });
  });

  // /stats — admin only
  bot.onText(/\/stats/, async (msg) => {
    if (!(await isAdmin(msg.from.id))) return; // silently ignore for non-admins
    const [totalUsers, bannedUsers, totalAdmins] = await Promise.all([
      User.countDocuments(), User.countDocuments({ banned: true }), Admin.countDocuments(),
    ]);
    await bot.sendMessage(msg.chat.id, `📊 *Stats*\nUsers: ${totalUsers}\nBanned: ${bannedUsers}\nAdmins: ${totalAdmins}`, { parse_mode: 'Markdown' });
  });

  // /announcement <text> — admin only, broadcast to every user
  bot.onText(/\/announcement (.+)/s, async (msg, match) => {
    if (!(await isAdmin(msg.from.id))) return;
    const text = match[1];
    const users = await User.find({}, 'telegramId');
    await bot.sendMessage(msg.chat.id, `📣 Broadcasting to ${users.length} users…`);
    let sent = 0;
    for (const u of users) {
      try { await bot.sendMessage(u.telegramId, text); sent++; } catch (e) { /* user blocked the bot etc — skip */ }
      await new Promise((r) => setTimeout(r, 40)); // gentle pacing to avoid Telegram rate limits
    }
    await bot.sendMessage(msg.chat.id, `✅ Sent to ${sent}/${users.length} users.`);
  });

  // /announcementimage — admin only, reply to a photo with this command (+ optional caption)
  bot.onText(/\/announcementimage(?:\s+(.+))?/s, async (msg, match) => {
    if (!(await isAdmin(msg.from.id))) return;
    const photoMsg = msg.reply_to_message;
    if (!photoMsg || !photoMsg.photo) {
      await bot.sendMessage(msg.chat.id, 'Reply to a photo with /announcementimage (optionally add a caption after the command).');
      return;
    }
    const fileId = photoMsg.photo[photoMsg.photo.length - 1].file_id;
    const caption = match[1] || photoMsg.caption || '';
    const users = await User.find({}, 'telegramId');
    await bot.sendMessage(msg.chat.id, `📣 Broadcasting image to ${users.length} users…`);
    let sent = 0;
    for (const u of users) {
      try { await bot.sendPhoto(u.telegramId, fileId, { caption }); sent++; } catch (e) {}
      await new Promise((r) => setTimeout(r, 60));
    }
    await bot.sendMessage(msg.chat.id, `✅ Sent to ${sent}/${users.length} users.`);
  });

  // /addadmin <telegramId> — owner only
  bot.onText(/\/addadmin (\d+)/, async (msg, match) => {
    if (!(await isOwner(msg.from.id))) return;
    const targetId = match[1];
    try {
      await Admin.create({ telegramId: targetId, isOwner: false, addedBy: String(msg.from.id) });
      await bot.sendMessage(msg.chat.id, `✅ ${targetId} is now an admin.`);
    } catch (e) {
      await bot.sendMessage(msg.chat.id, e.code === 11000 ? 'That user is already an admin.' : 'Failed to add admin.');
    }
  });

  // /removeadmin <telegramId> — owner only
  bot.onText(/\/removeadmin (\d+)/, async (msg, match) => {
    if (!(await isOwner(msg.from.id))) return;
    const target = await Admin.findOne({ telegramId: match[1] });
    if (!target) return bot.sendMessage(msg.chat.id, 'That ID is not an admin.');
    if (target.isOwner) return bot.sendMessage(msg.chat.id, "The owner can't be removed.");
    await Admin.deleteOne({ telegramId: match[1] });
    await bot.sendMessage(msg.chat.id, `✅ ${match[1]} removed from admins.`);
  });

  bot.on('polling_error', (err) => console.error('[bot] polling_error:', err.message));

  console.log('[bot] Telegram bot polling started.');
  return bot;
}

module.exports = startBot;
