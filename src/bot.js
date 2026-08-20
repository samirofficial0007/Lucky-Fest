const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const User = require('./models/User');

// Short welcome copy per language. Kept self-contained here (rather than
// reusing public/src locale JSON) so the bot process has zero dependency on
// the Mini App's static file serving.
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
    rows.push(
      codes.slice(i, i + 2).map((code) => ({
        text: `${WELCOME[code].flag} ${WELCOME[code].name}`,
        callback_data: `lang:${code}`,
      }))
    );
  }
  return rows;
}

function startBot() {
  if (!config.botToken) {
    console.warn('[bot] BOT_TOKEN missing — Telegram bot process not started.');
    return null;
  }
  if (!config.miniAppUrl) {
    console.warn('[bot] MINI_APP_URL not set — the Play button will not be attached to /start messages.');
  }

  const bot = new TelegramBot(config.botToken, { polling: true });

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, '🎉 Choose your language / ভাষা বেছে নাও:', {
      reply_markup: { inline_keyboard: languageKeyboard() },
    });
  });

  bot.on('callback_query', async (query) => {
    const data = query.data || '';
    if (!data.startsWith('lang:')) return;
    const code = data.split(':')[1];
    const copy = WELCOME[code] || WELCOME.en;
    const chatId = query.message.chat.id;
    const telegramId = String(query.from.id);

    try {
      await User.findOneAndUpdate(
        { telegramId },
        {
          $setOnInsert: {
            telegramId,
            username: query.from.username || '',
            firstName: query.from.first_name || '',
          },
          $set: { languageCode: code },
        },
        { upsert: true }
      );
    } catch (e) {
      console.error('[bot] Failed to save language preference:', e.message);
    }

    const keyboard = config.miniAppUrl
      ? { inline_keyboard: [[{ text: copy.play, web_app: { url: config.miniAppUrl } }]] }
      : undefined;

    await bot.editMessageText(`${copy.title}\n\n${copy.body}`, {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: keyboard,
    });

    await bot.answerCallbackQuery(query.id);
  });

  bot.on('polling_error', (err) => console.error('[bot] polling_error:', err.message));

  console.log('[bot] Telegram bot polling started.');
  return bot;
}

module.exports = startBot;
