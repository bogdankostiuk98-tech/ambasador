const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');

const bot = new Telegraf('8918097789:AAFAkHe89nUTw_cqTvHakfhgcqpZ2ROiwPQ');

// ⚠️ Числові ID вас двох як головних адміністраторів
const ADMIN_IDS = [8603943147, 8383022779]; 

// ⚠️ Telegram-юзернейми адміністраторів без символу @
const ADMIN_USERNAMES = ['ambassador101', 'sk1rzzz']; 

const DB_FILE = 'database.json';

// Завантаження бази даних
let db = { lastCardNumber: 0, users: {}, purchases: {} };
if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.purchases) db.purchases = {};
    console.log('📦 База даних успішно завантажена!');
  } catch (err) {
    console.error('Помилка читання бази даних.');
  }
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

const userState = {};
const waitingCoins = {};

// Головна клавіатура
function getProfileKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👤 Особистий кабінет', 'profile_info')],
    [Markup.button.callback('🛒 Купити товар', 'buy_item')],
    [Markup.button.callback('🎁 Використати Ambassador Coins', 'use_coins')],
    [Markup.button.callback('📦 Мої покупки', 'my_purchases')],
    [Markup.button.callback('📲 Зв\'язатися з адміністратором', 'contact_admin')]
  ]);
}

// 🔍 АВТОМАТИЧНЕ ЗЧИТУВАННЯ ЦІНИ ТА ТЕКСТУ З КАНАЛУ
async function fetchPostPrice(url) {
  try {
    // Приклад посилання: https://t.me/ambassadorshopp/36 або https://t.me/c/123456/36
    const cleanUrl = url.split('?')[0];
    const parts = cleanUrl.split('/');
    const postId = parseInt(parts[parts.length - 1], 10);
    let channel = parts[parts.length - 2];

    if (!postId || isNaN(postId)) return 1250;

    // Якщо приватний канал або публічний юзернейм
    if (channel === 'c') {
      channel = '-100' + parts[parts.length - 3];
    } else if (!channel.startsWith('@')) {
      channel = '@' + channel;
    }

    // Отримуємо повідомлення з каналу (оскільки бот адмін)
    // Telegram Bot API не дає прямого методу getMessage по ID каналу без сторонніх трюків, 
    // тому використовуємо безпечний метод пересилання у технічний чат або кешування, 
    // АБО зчитуємо цифри безпосередньо з тексту, якщо покупець написав суму, АБО через forwardMessage до самого себе:
    
    const forwardRes = await bot.telegram.forwardMessage(ADMIN_IDS[0], channel, postId).catch(() => null);
    if (forwardRes) {
      const text = forwardRes.text || forwardRes.caption || '';
      // Видаляємо переслане повідомлення, щоб не засмічувати чат адміну
      await bot.telegram.deleteMessage(ADMIN_IDS[0], forwardRes.message_id).catch(() => {});
      
      // Шукаємо ціну в тексті (наприклад "1250", "1250грн", "Ціна: 1250")
      const match = text.match(/(?:ціна|грн|uah)?\D*(\d{3,5})\b/i);
      if (match && match[1]) {
        const foundPrice = parseInt(match[1], 10);
        if (foundPrice > 50 && foundPrice < 100000) {
          return foundPrice;
        }
      }
    }
  } catch (err) {
    console.log('Помилка авточитання ціни з поста:', err.message);
  }
  return 1250; // Дефолтна ціна, якщо не вдалося зчитати
}

bot.start((ctx) => {
  const userId = ctx.from.id;
  delete userState[userId];
  delete waitingCoins[userId];

  const welcomeText = 
`🛍 *Вітаємо в Ambassador Shop!*

Створіть клієнтську карту для накопичення *Ambassador Coins*!
🪙 *1 Ambassador Coin = 5 грн*

Накопичуйте коїни та отримуйте знижки на свої покупки.

_Оберіть дію нижче:_`;

  return ctx.replyWithMarkdown(
    welcomeText,
    Markup.inlineKeyboard([
      [Markup.button.callback('💳 Створити карту клієнта', 'create_card')],
      [Markup.button.callback('👤 Вже є карта клієнта', 'has_card')]
    ])
  );
});

bot.action('create_card', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;

  if (db.users[userId]) {
    return ctx.reply(
      `У вас вже є створена карта!\n🆔 Ваш номер: #${db.users[userId].cardNumber}\n👤 Юзернейм: ${db.users[userId].username}`,
      getProfileKeyboard()
    );
  }

  userState[userId] = 'waiting_username';
  return ctx.reply('Введіть свій Telegram Username або нікнейм для створення клієнтської карти:');
});

bot.action('has_card', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;

  if (db.users[userId]) {
    return ctx.reply(`👋 З поверненням до Ambassador Shop!`, getProfileKeyboard());
  } else {
    return ctx.reply('У вас ще немає карти. Натисніть "💳 Створити карту клієнта", щоб зареєструватися!');
  }
});

bot.action('profile_info', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;

  if (db.users[userId]) {
    const user = db.users[userId];
    return ctx.replyWithMarkdown(
`📂 *Особистий кабінет Ambassador Shop*

🆔 *Номер картки:* #${user.cardNumber}
👤 *Ваш нікнейм:* ${user.username}
🪙 *Баланс:* ${user.coins} Ambassador Coins _(еквівалент ${user.coins * 5} грн)_`,
      getProfileKeyboard()
    );
  } else {
    return ctx.reply('У вас ще немає клієнтської картки! Натисніть "💳 Створити карту клієнта".');
  }
});

// Кнопка "Купити товар" (без знижки)
bot.action('buy_item', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;

  if (!db.users[userId]) {
    return ctx.reply('Спочатку створіть карту клієнта!');
  }

  userState[userId] = 'waiting_buy_link';
  return ctx.reply(`🔗 Надішліть посилання на пост із товаром у нашому Telegram-каналі:`);
});

// Підтвердження звичайної купівлі
bot.action('confirm_buy_item', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;
  const user = db.users[userId];
  const stateData = userState[userId];

  const postLink = (stateData && stateData.link) ? stateData.link : 'Посилання не вказано';
  const originalPrice = (stateData && stateData.price) ? stateData.price : 1250;

  const purchaseId = 'p_' + Date.now();
  const shortId = purchaseId.slice(-5);

  db.purchases[purchaseId] = {
    userId,
    postLink,
    originalPrice,
    coinsUsed: 0,
    finalPrice: originalPrice,
    status: 'pending',
    date: new Date().toISOString()
  };
  saveDB();

  await ctx.replyWithMarkdown(
`✅ *Бот успішно сповістив адміністраторів!*

🆔 *Номер замовлення:* \`#${shortId}\`
🔗 *Товар:* ${postLink}
💰 *Визначена ціна:* ${originalPrice} грн

Дякуємо за вибір Ambassador Shop. Чекайте на відповідь адміністратора!`,
    getProfileKeyboard()
  );

  const clientUsername = ctx.from.username || (user ? user.username : 'без_юзернейма');
  const userCardNum = user ? user.cardNumber : 'Немає';
  const adminTags = ADMIN_USERNAMES.map(u => `@${u}`).join(' ');

  const adminMsg = 
`🛍 *НОВА ЗАЯВКА НА КУПІВЛЮ ТОВАРУ!*

🆔 *Номер замовлення:* \`#${shortId}\`
👤 *Покупець:* @${clientUsername} (Карта #${userCardNum})
🔗 *Товар:* ${postLink}
💰 *Ціна товару:* ${originalPrice} грн

🔔 *Відповідальні адміни:* ${adminTags}
Зв'яжіться з клієнтом! Після відправки введіть: \`/complete ${shortId}\``;

  for (const adminId of ADMIN_IDS) {
    bot.telegram.sendMessage(adminId, adminMsg, { parse_mode: 'Markdown' }).catch(() => {});
  }

  delete userState[userId];
});

// Кнопка "Використати Ambassador Coins"
bot.action('use_coins', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;

  if (!db.users[userId]) {
    return ctx.reply('Спочатку створіть карту клієнта!');
  }

  const user = db.users[userId];
  if (user.coins <= 0) {
    return ctx.replyWithMarkdown('❌ *У вас на балансі 0 Ambassador Coins.*\n\nРобіть покупки в нашому каналі та накопичуйте коїни!');
  }

  userState[userId] = 'waiting_coins_link';
  return ctx.reply(`🔗 Надішліть посилання на пост із товаром у нашому Telegram-каналі:`);
});

// Кнопка зв'язку з адмінами
bot.action('contact_admin', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  
  const buttons = ADMIN_USERNAMES.map((username, index) => [
    Markup.button.url(`👨‍💼 Написати Адміністратору ${index + 1} (@${username})`, `https://t.me/${username}`)
  ]);

  return ctx.reply(
    `📲 *Зв'язок з адміністрацією Ambassador Shop*\n\nОберіть адміністратора для зв'язку:`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
});

// Розділ "Мої покупки"
bot.action('my_purchases', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;

  const userPurchases = Object.entries(db.purchases)
    .filter(([_, p]) => p.userId === userId)
    .map(([id, p]) => ({ id, ...p }));

  if (userPurchases.length === 0) {
    return ctx.reply('🛍 У вас ще немає активних покупок у базі.', getProfileKeyboard());
  }

  for (const purchase of userPurchases) {
    const shortId = purchase.id.slice(-5);
    const isCompleted = purchase.status === 'completed';

    let text = 
`📦 *Замовлення #${shortId}*
🔗 *Товар:* ${purchase.postLink}
💰 *Ціна:* ${purchase.originalPrice} грн
🪙 *Списано коїнів:* ${purchase.coinsUsed} coins (-${purchase.coinsUsed * 5} грн)
🔥 *ФІНАЛЬНА ЦІНА:* *${purchase.finalPrice} грн*
📌 *Статус:* ${isCompleted ? '✅ *Підтверджено / Відправлено*' : '⏳ *В обробці*'}`;

    if (isCompleted) {
      await ctx.replyWithMarkdown(text);
    } else {
      await ctx.replyWithMarkdown(
        text,
        Markup.inlineKeyboard([
          [Markup.button.callback('❌ Скасувати замовлення та повернути коїни', `cancel_purchase_${purchase.id}`)]
        ])
      );
    }
  }
});

// Скасування замовлення покупцем
bot.action(/^cancel_purchase_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const purchaseId = ctx.match[1];
  const purchase = db.purchases[purchaseId];

  if (!purchase) {
    return ctx.reply('❌ Це замовлення вже скасовано або не існує.');
  }

  if (purchase.status === 'completed') {
    return ctx.reply('⛔ Замовлення вже підтверджено та відправлено адміністратором!');
  }

  const userId = purchase.userId;

  if (db.users[userId]) {
    db.users[userId].coins += purchase.coinsUsed;
  }

  delete db.purchases[purchaseId];
  saveDB();

  await ctx.replyWithMarkdown(
`✅ *Замовлення скасовано!*

🪙 Вам успішно повернуто *+${purchase.coinsUsed} Ambassador Coins* на баланс.
Поточний баланс: *${db.users[userId].coins} coins*.`,
    getProfileKeyboard()
  );

  const clientUsername = ctx.from.username || (db.users[userId] ? db.users[userId].username : 'клієнт');

  for (const adminId of ADMIN_IDS) {
    bot.telegram.sendMessage(
      adminId,
      `⚠️ *КЛІЄНТ СКАСУВАВ ЗАМОВЛЕННЯ!*\n\n👤 Клієнт: @${clientUsername} (Карта #${db.users[userId] ? db.users[userId].cardNumber : '?'})\n🔗 Товар: ${purchase.postLink}\n🪙 Повернуто коїнів: ${purchase.coinsUsed} coins`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
});

// ОБРОБКА ТЕКСТОВИХ ПОВІДОМЛЕНЬ
bot.on('text', async (ctx, next) => {
  const userId = ctx.from.id;
  const messageText = ctx.message.text.trim();

  if (messageText.startsWith('/')) {
    return next();
  }

  // 1. Введення кількості коїнів (після авточитання ціни з поста)
  if (waitingCoins[userId] && waitingCoins[userId].price) {
    const coinsToUse = parseInt(messageText, 10);
    const userCoins = db.users[userId] ? db.users[userId].coins : 0;

    if (isNaN(coinsToUse) || coinsToUse <= 0) {
      return ctx.reply('❌ Введіть коректне число коїнів (наприклад: 5):');
    }

    if (coinsToUse > userCoins) {
      return ctx.reply(`⚠️ Недостатньо коїнів! Поточний баланс: ${userCoins} coins. Введіть менше число:`);
    }

    const postLink = waitingCoins[userId].link;
    const originalPrice = waitingCoins[userId].price;
    delete waitingCoins[userId];

    const discountUah = coinsToUse * 5;
    const finalPrice = Math.max(0, originalPrice - discountUah);

    db.users[userId].coins -= coinsToUse;

    const purchaseId = 'p_' + Date.now();
    db.purchases[purchaseId] = {
      userId,
      postLink,
      originalPrice,
      coinsUsed: coinsToUse,
      finalPrice,
      status: 'pending',
      date: new Date().toISOString()
    };
    saveDB();

    const shortId = purchaseId.slice(-5);

    await ctx.replyWithMarkdown(
`🎉 *Заявку на знижку успішно сформовано!*

🆔 *Номер замовлення:* \`#${shortId}\`
🔗 *Товар:* ${postLink}
💰 *Ціна товару:* ${originalPrice} грн
🪙 *Списано коїнів:* ${coinsToUse} coins (-${discountUah} грн)
🔥 *Тепер це буде коштувати:* *${finalPrice} грн*

📩 *Адміністраторів уже сповіщено!*`,
      getProfileKeyboard()
    );

    const clientUsername = ctx.from.username || db.users[userId].username;
    const adminTags = ADMIN_USERNAMES.map(u => `@${u}`).join(' ');

    const adminMessage = 
`📥 *НОВЕ ЗАМОВЛЕННЯ ЗІ ЗНИЖКОЮ!*

🆔 *Номер замовлення:* \`#${shortId}\`
👤 *Клієнт:* @${clientUsername} (Картка #${db.users[userId].cardNumber})
🔗 *Товар:* ${postLink}
💰 *Ціна товару:* ${originalPrice} грн
🪙 *Списано коїнів:* ${coinsToUse} coins (-${discountUah} грн)
🔥 *РАЗОМ ДО СПЛАТИ:* *${finalPrice} грн*

🔔 *Відповідальні:* ${adminTags}
Зв'яжіться з клієнтом! Після відправки введіть: \`/complete ${shortId}\``;

    for (const adminId of ADMIN_IDS) {
      bot.telegram.sendMessage(adminId, adminMessage, { parse_mode: 'Markdown' }).catch(() => {});
    }
    return;
  }

  // 2. Створення картки
  if (userState[userId] === 'waiting_username') {
    db.lastCardNumber += 1;
    db.users[userId] = {
      cardNumber: db.lastCardNumber,
      username: messageText,
      coins: 0
    };
    saveDB();

    delete userState[userId];

    return ctx.replyWithMarkdown(
`🎉 *Вітаємо! Вашу карту Ambassador Shop успішно створено!*

🆔 *Ваш номер картки:* #${db.lastCardNumber}
👤 *Ваш нік:* ${messageText}
🪙 *Баланс:* 0 Ambassador Coins`,
      getProfileKeyboard()
    );
  }

  // 3. Купівля без коїнів (Автоматичне зчитування ціни з поста)
  if (userState[userId] === 'waiting_buy_link') {
    const postLink = messageText;
    await ctx.reply('⏳ Зчитую ціну з поста...');

    const detectedPrice = await fetchPostPrice(postLink);
    userState[userId] = { link: postLink, price: detectedPrice };

    return ctx.replyWithMarkdown(
`🔗 *Посилання прийнято!*
💰 *Автоматично визначена ціна:* ${detectedPrice} грн

Натисніть кнопку нижче, щоб сповістити адміністратора:`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📲 Зв\'язатися з адміністратором для покупки', 'confirm_buy_item')]
      ])
    );
  }

  // 4. Знижка за коїни (Автоматичне зчитування ціни з поста)
  if (userState[userId] === 'waiting_coins_link') {
    const postLink = messageText;
    await ctx.reply('⏳ Зчитую ціну з поста...');

    const detectedPrice = await fetchPostPrice(postLink);
    waitingCoins[userId] = { link: postLink, price: detectedPrice };
    delete userState[userId];

    const userCoins = db.users[userId] ? db.users[userId].coins : 0;
    return ctx.replyWithMarkdown(
`🛍 *Посилання прийнято!*
💰 *Автоматично визначена ціна:* ${detectedPrice} грн

🪙 *Скільки Ambassador Coins ви хочете списати?*
_(Доступно на балансі: ${userCoins} coins = ${userCoins * 5} грн знижки):_`
    );
  }
});

// АДМІН-КОМАНДА /complete (КЕШБЕК: 1 КОЇН ЗА КОЖНІ 250 ГРН)
bot.command('complete', (ctx) => {
  const senderId = ctx.from.id;

  if (!ADMIN_IDS.includes(senderId)) {
    return ctx.reply(`❌ У вас немає прав адміністратора!`);
  }

  const args = ctx.message.text.trim().split(/\s+/);
  if (args.length < 2) {
    return ctx.reply('⚠️ Формат команди: `/complete [номер_замовлення]`\nПриклад: `/complete 63829`', { parse_mode: 'Markdown' });
  }

  const searchId = args[1].replace('#', '').trim();

  let foundKey = Object.keys(db.purchases).find(key => key === searchId || key.slice(-5) === searchId);

  if (!foundKey) {
    return ctx.reply(`❌ Замовлення з номером #${searchId} не знайдено в базі!`);
  }

  const purchase = db.purchases[foundKey];
  
  if (purchase.status === 'completed') {
    return ctx.reply(`⚠️ Це замовлення вже позначено як виконане раніше!`);
  }

  purchase.status = 'completed';

  // Розрахунок кешбеку: 1 коїн за кожні 250 грн фактичної вартості
  const actualPrice = purchase.finalPrice || purchase.originalPrice || 1250;
  const cashbackCoins = Math.floor(actualPrice / 250); 
  const cashbackUah = cashbackCoins * 5;

  const clientId = purchase.userId;
  if (db.users[clientId]) {
    db.users[clientId].coins = Number(db.users[clientId].coins || 0) + cashbackCoins;
  }

  saveDB();

  ctx.replyWithMarkdown(
`✅ *Замовлення #${searchId} успішно закрите!*
💰 *Сума покупки:* ${actualPrice} грн
🪙 *Нараховано кешбек:* *+${cashbackCoins} coins* (${cashbackUah} грн).`
  );

  bot.telegram.sendMessage(
    clientId,
    `🚚 *Ваше замовлення #${searchId} успішно підтверджено та відправлено!*\n\n🎁 За цю покупку (${actualPrice} грн) вам нараховано кешбек: *+${cashbackCoins} Ambassador Coins* (${cashbackUah} грн)!\n\nДякуємо за покупку в Ambassador Shop!`,
    { parse_mode: 'Markdown' }
  ).catch(() => {});
});

// АДМІН-КОМАНДА /add
bot.command('add', (ctx) => {
  const senderId = ctx.from.id;

  if (!ADMIN_IDS.includes(senderId)) {
    return ctx.reply(`❌ У вас немає прав адміністратора!`);
  }

  const args = ctx.message.text.trim().split(/\s+/);
  if (args.length < 3) {
    return ctx.reply('⚠️ Формат команди: `/add [номер_карти] [коїни]`', { parse_mode: 'Markdown' });
  }

  const targetCardNum = String(args[1]).replace('#', '');
  const coinsToAdd = parseInt(args[2], 10);

  if (isNaN(coinsToAdd)) {
    return ctx.reply('❌ Кількість коїнів має бути числом!');
  }

  let targetUserId = Object.keys(db.users).find(id => String(db.users[id].cardNumber) === targetCardNum);

  if (!targetUserId) {
    return ctx.reply(`❌ Карту #${targetCardNum} не знайдено в базі!`);
  }

  db.users[targetUserId].coins = Number(db.users[targetUserId].coins || 0) + coinsToAdd;
  saveDB();

  ctx.replyWithMarkdown(`✅ Успішно нараховано +${coinsToAdd} coins на карту #${targetCardNum}!`);
  bot.telegram.sendMessage(targetUserId, `🎉 Вам нараховано *+${coinsToAdd} Ambassador Coins*!`, { parse_mode: 'Markdown' }).catch(() => {});
});

// АДМІН-КОМАНДА /remove
bot.command('remove', (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('❌ У вас немає прав.');
  }

  const args = ctx.message.text.trim().split(/\s+/);
  if (args.length < 3) return ctx.reply('⚠️ Формат: `/remove [номер_карти] [коїни]`', { parse_mode: 'Markdown' });

  const targetCardNum = String(args[1]).replace('#', '');
  const coinsToRemove = parseInt(args[2], 10);

  let targetUserId = Object.keys(db.users).find(id => String(db.users[id].cardNumber) === targetCardNum);
  if (!targetUserId) return ctx.reply(`❌ Клієнта не знайдено!`);

  db.users[targetUserId].coins = Math.max(0, Number(db.users[targetUserId].coins || 0) - coinsToRemove);
  saveDB();

  ctx.reply(`🔻 Списано *-${coinsToRemove} coins* з карти *#${targetCardNum}*.`, { parse_mode: 'Markdown' });
});

bot.launch();
console.log('🚀 Бот успішно запущений і готовий до роботи!');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));