const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const express = require('express');

// --- МІНІМАЛЬНИЙ ВЕБСЕРВЕР ДЛЯ RENDER ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Ambassador Bot is running 24/7!');
});

app.listen(PORT, () => {
  console.log(`🌐 Express сервер слухає порт ${PORT}`);
});
// ----------------------------------------

const bot = new Telegraf('8918097789:AAFAkHe89nUTw_cqTvHakfhgcqpZ2ROiwPQ');

const ADMIN_IDS = [8811026582, 8383022779]; 
const ADMIN_USERNAMES = ['ambassador101', 'sk1rzzz']; 

const DB_FILE = 'database.json';

let db = { lastCardNumber: 0, users: {}, purchases: {}, products: [] };
if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.purchases) db.purchases = {};
    if (!db.products) db.products = [];
    console.log('📦 База даних успішно завантажена!');
  } catch (err) {
    console.error('Помилка читання бази даних:', err.message);
  }
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

const waitingCoins = {};

// Динамічна клавіатура: для адмінів додається кнопка перегляду всіх карт
function getProfileKeyboard(userId) {
  const buttons = [
    [Markup.button.callback('📦 Каталог товарів', 'open_catalog')],
    [Markup.button.callback('👤 Особистий кабінет', 'profile_info')],
    [Markup.button.callback('🛍 Мої покупки', 'my_purchases')],
    [Markup.button.callback('📲 Зв\'язатися з адміністратором', 'contact_admin')]
  ];

  if (ADMIN_IDS.includes(Number(userId))) {
    buttons.push([Markup.button.callback('📋 Усі карти клієнтів (Адмін)', 'admin_all_cards')]);
  }

  return Markup.inlineKeyboard(buttons);
}

function parsePriceFromText(text) {
  if (!text) return 1250;
  const match = text.match(/(?:ціна|грн|uah)?\D*(\d{3,5})\b/i);
  if (match && match[1]) {
    const foundPrice = parseInt(match[1], 10);
    if (foundPrice > 50 && foundPrice < 100000) {
      return foundPrice;
    }
  }
  return 1250;
}

// АВТОМАТИЧНИЙ ПАРСИНГ НОВИХ ТОВАРІВ З КАНАЛУ (ЗА СЛОВОМ "КОЛІР")
bot.on('channel_post', async (ctx) => {
  try {
    const post = ctx.channelPost;
    const text = post.text || post.caption || '';

    if (/колір|цвет/i.test(text)) {
      const detectedPrice = parsePriceFromText(text);
      let photoId = null;

      if (post.photo && post.photo.length > 0) {
        photoId = post.photo[post.photo.length - 1].file_id;
      }

      const firstLine = text.split('\n')[0].trim();
      const title = firstLine.length > 50 ? firstLine.substring(0, 47) + '...' : firstLine;

      const newProduct = {
        id: 'prod_' + post.message_id,
        messageId: post.message_id,
        title: title ? title : 'Товар з каналу',
        caption: text,
        price: detectedPrice,
        photo: photoId,
        date: new Date().toISOString()
      };

      const existingIndex = db.products.findIndex(p => p.messageId === post.message_id);
      if (existingIndex !== -1) {
        db.products[existingIndex] = newProduct;
      } else {
        db.products.unshift(newProduct);
      }

      saveDB();
      console.log(`✅ [КАТАЛОГ] Додано новий товар #${post.message_id} (Ціна: ${detectedPrice} грн)`);
    }
  } catch (err) {
    console.error('Помилка при зчитуванні поста каналу:', err.message);
  }
});

bot.start((ctx) => {
  const userId = ctx.from.id;
  delete waitingCoins[userId];

  const welcomeText = 
`🛍 *Вітаємо в Ambassador Shop!*

Створіть клієнтську карту однією кнопкою для накопичення *Ambassador Coins*!
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

// АВТОМАТИЧНЕ СТВОРЕННЯ КАРТИ БЕЗ ВВЕДЕННЯ ТЕКСТУ
bot.action('create_card', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;

  if (db.users[userId]) {
    return ctx.reply(
      `У вас вже є створена карта!\n🆔 Ваш номер: #${db.users[userId].cardNumber}\n👤 Ім'я: ${db.users[userId].username}`,
      getProfileKeyboard(userId)
    );
  }

  // Видаємо номер карти по порядку
  db.lastCardNumber += 1;
  const usernameFromTg = ctx.from.username ? '@' + ctx.from.username : (ctx.from.first_name || 'Клієнт');

  db.users[userId] = {
    cardNumber: db.lastCardNumber,
    username: usernameFromTg,
    coins: 0
  };
  saveDB();

  return ctx.replyWithMarkdown(
`🎉 *Вітаємо! Вашу карту Ambassador Shop успішно створено!*

🆔 *Ваш номер картки:* #${db.lastCardNumber}
👤 *Ваш профіль:* ${usernameFromTg}
🪙 *Баланс:* 0 Ambassador Coins`,
    getProfileKeyboard(userId)
  );
});

bot.action('has_card', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;

  if (db.users[userId]) {
    return ctx.reply(`👋 З поверненням до Ambassador Shop!`, getProfileKeyboard(userId));
  } else {
    // Якщо карти немає, автоматично створюємо її одразу
    db.lastCardNumber += 1;
    const usernameFromTg = ctx.from.username ? '@' + ctx.from.username : (ctx.from.first_name || 'Клієнт');

    db.users[userId] = {
      cardNumber: db.lastCardNumber,
      username: usernameFromTg,
      coins: 0
    };
    saveDB();

    return ctx.replyWithMarkdown(
`🎉 *У вас ще не було карти, але ми щойно автоматично її створили!*

🆔 *Ваш номер картки:* #${db.lastCardNumber}
👤 *Ваш профіль:* ${usernameFromTg}
🪙 *Баланс:* 0 Ambassador Coins`,
      getProfileKeyboard(userId)
    );
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
👤 *Ваш профіль:* ${user.username}
🪙 *Баланс:* ${user.coins} Ambassador Coins _(еквівалент ${user.coins * 5} грн)_`,
      getProfileKeyboard(userId)
    );
  } else {
    // Автоматично створюємо, якщо чомусь не було в базі
    db.lastCardNumber += 1;
    const usernameFromTg = ctx.from.username ? '@' + ctx.from.username : (ctx.from.first_name || 'Клієнт');
    db.users[userId] = { cardNumber: db.lastCardNumber, username: usernameFromTg, coins: 0 };
    saveDB();

    const user = db.users[userId];
    return ctx.replyWithMarkdown(
`📂 *Особистий кабінет Ambassador Shop* (картку створено автоматично)

🆔 *Номер картки:* #${user.cardNumber}
👤 *Ваш профіль:* ${user.username}
🪙 *Баланс:* 0 Ambassador Coins`,
      getProfileKeyboard(userId)
    );
  }
});

// СПЕЦІАЛЬНА КНОПКА ТА ФУНКЦІЯ ТІЛЬКИ ДЛЯ АДМІНІВ
bot.action('admin_all_cards', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;

  if (!ADMIN_IDS.includes(Number(userId))) {
    return ctx.reply('❌ У вас немає прав адміністратора!');
  }

  const usersList = Object.entries(db.users);
  if (usersList.length === 0) {
    return ctx.reply('📂 База даних клієнтів наразі порожня (жодної карти ще не створено).', getProfileKeyboard(userId));
  }

  let message = `📋 *УСІ КАРТИ КЛІЄНТІВ В БАЗІ (${usersList.length}):*\n\n`;

  for (const [tgId, data] of usersList) {
    message += `🆔 *Карта:* #${data.cardNumber}\n`;
    message += `👤 *Профіль:* ${data.username}\n`;
    message += `🔗 *Telegram ID:* \`${tgId}\`\n`;
    message += `🪙 *Баланс:* ${data.coins} coins\n`;
    message += `-----------------------------------\n`;
  }

  if (message.length > 4000) {
    message = message.substring(0, 3900) + '\n\n... (список занадто великий)';
  }

  return ctx.replyWithMarkdown(message, getProfileKeyboard(userId));
});

async function showCatalogProduct(ctx, pageIndex) {
  const userId = ctx.from.id;
  if (!db.products || db.products.length === 0) {
    return ctx.reply('🛍 Наразі каталог товарів порожній. Зачекайте на нові публікації в каналі!', getProfileKeyboard(userId));
  }

  const total = db.products.length;
  const index = Math.max(0, Math.min(pageIndex, total - 1));
  const product = db.products[index];

  const captionText = 
`📦 *Товар ${index + 1} з ${total}*

${product.caption}

💰 *Ціна:* ${product.price} грн`;

  const navigationButtons = [];
  if (index > 0) navigationButtons.push(Markup.button.callback('⬅️ Назад', `cat_page_${index - 1}`));
  if (index < total - 1) navigationButtons.push(Markup.button.callback('Вперед ➡️', `cat_page_${index + 1}`));

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🛒 Купити товар', `buy_prod_${product.id}`)],
    [Markup.button.callback('🎁 Знижка (Ambassador Coins)', `use_coins_prod_${product.id}`)],
    ...(navigationButtons.length > 0 ? [navigationButtons] : []),
    [Markup.button.callback('🏠 Головне меню', 'back_to_menu')]
  ]);

  if (product.photo) {
    await ctx.replyWithPhoto(product.photo, { caption: captionText, parse_mode: 'Markdown', ...keyboard }).catch(async () => {
      await ctx.replyWithMarkdown(captionText, keyboard);
    });
  } else {
    await ctx.replyWithMarkdown(captionText, keyboard);
  }
}

bot.action('open_catalog', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  return showCatalogProduct(ctx, 0);
});

bot.action(/^cat_page_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const page = parseInt(ctx.match[1], 10);
  return showCatalogProduct(ctx, page);
});

bot.action('back_to_menu', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;
  return ctx.reply('🏠 Ви повернулися в головне меню:', getProfileKeyboard(userId));
});

bot.action(/^buy_prod_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;

  if (!db.users[userId]) {
    db.lastCardNumber += 1;
    const usernameFromTg = ctx.from.username ? '@' + ctx.from.username : (ctx.from.first_name || 'Клієнт');
    db.users[userId] = { cardNumber: db.lastCardNumber, username: usernameFromTg, coins: 0 };
    saveDB();
  }

  const productId = ctx.match[1];
  const product = db.products.find(p => p.id === productId);

  if (!product) {
    return ctx.reply('❌ На жаль, цей товар більше не доступний у каталозі.');
  }

  const originalPrice = product.price;
  const purchaseId = 'p_' + Date.now();
  const shortId = purchaseId.slice(-5);

  db.purchases[purchaseId] = {
    userId,
    productTitle: product.title,
    originalPrice,
    coinsUsed: 0,
    finalPrice: originalPrice,
    status: 'pending',
    date: new Date().toISOString()
  };
  saveDB();

  await ctx.replyWithMarkdown(
`✅ *Ваше замовлення успішно створено!*

🆔 *Номер замовлення:* \`#${shortId}\`
🛍 *Товар:* ${product.title}
💰 *Сума до сплати:* ${originalPrice} грн

Дякуємо за вибір Ambassador Shop. Очікуйте на повідомлення від адміністратора!`,
    getProfileKeyboard(userId)
  );

  const user = db.users[userId];
  const clientUsername = user ? user.username : 'без_ім\'я';
  const userCardNum = user ? user.cardNumber : 'Немає';
  const adminTags = ADMIN_USERNAMES.map(u => '@' + u).join(' ');

  const adminMsg = 
`🛍 *НОВА ЗАЯВКА НА КУПІВЛЮ ТОВАРУ!*

🆔 *Номер замовлення:* \`#${shortId}\`
👤 *Покупець:* ${clientUsername} (Карта #${userCardNum})
🛍 *Товар:* ${product.title}
💰 *Ціна товару:* ${originalPrice} грн

🔔 *Відповідальні адміни:* ${adminTags}
Зв'яжіться з клієнтом! Після відправки введіть: \`/complete ${shortId}\``;

  for (const adminId of ADMIN_IDS) {
    bot.telegram.sendMessage(adminId, adminMsg, { parse_mode: 'Markdown' }).catch(() => {});
  }
});

bot.action(/^use_coins_prod_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;

  if (!db.users[userId]) {
    db.lastCardNumber += 1;
    const usernameFromTg = ctx.from.username ? '@' + ctx.from.username : (ctx.from.first_name || 'Клієнт');
    db.users[userId] = { cardNumber: db.lastCardNumber, username: usernameFromTg, coins: 0 };
    saveDB();
  }

  const user = db.users[userId];
  if (user.coins <= 0) {
    return ctx.replyWithMarkdown('❌ *У вас на балансі 0 Ambassador Coins.*\n\nРобіть покупки в нашому каналі та накопичуйте коїни!');
  }

  const productId = ctx.match[1];
  const product = db.products.find(p => p.id === productId);

  if (!product) {
    return ctx.reply('❌ На жаль, цей товар більше не доступний у каталозі.');
  }

  waitingCoins[userId] = {
    productId: product.id,
    productTitle: product.title,
    price: product.price
  };

  return ctx.replyWithMarkdown(
`🛍 *Обраний товар:* ${product.title}
💰 *Ціна товару:* ${product.price} грн

🪙 *Скільки Ambassador Coins ви хочете списати?*
_(Доступно на балансі: ${user.coins} coins =${user.coins * 5} грн знижки):_`
  );
});

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

bot.action('my_purchases', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;

  const userPurchases = Object.entries(db.purchases)
    .filter(([_, p]) => p.userId === userId)
    .map(([id, p]) => ({ id, ...p }));

  if (userPurchases.length === 0) {
    return ctx.reply('🛍 У вас ще немає активних покупок у базі.', getProfileKeyboard(userId));
  }

  for (const purchase of userPurchases) {
    const shortId = purchase.id.slice(-5);
    const isCompleted = purchase.status === 'completed';
    const prodTitle = purchase.productTitle ? purchase.productTitle : 'Товар з каталогу';

    let text = 
`📦 *Замовлення #${shortId}*
🛍 *Товар:* ${prodTitle}
💰 *Початкова ціна:* ${purchase.originalPrice} грн
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

  const userCardNum = db.users[userId] ? db.users[userId].cardNumber : '?';
  const userCoinsBal = db.users[userId] ? db.users[userId].coins : 0;

  await ctx.replyWithMarkdown(
`✅ *Замовлення скасовано!*

🪙 Вам успішно повернуто *+${purchase.coinsUsed} Ambassador Coins* на баланс.
Поточний баланс: *${userCoinsBal} coins*.`,
    getProfileKeyboard(userId)
  );

  const clientUsername = db.users[userId] ? db.users[userId].username : 'клієнт';
  const prodTitle = purchase.productTitle ? purchase.productTitle : 'Товар';

  for (const adminId of ADMIN_IDS) {
    bot.telegram.sendMessage(
      adminId,
      `⚠️ *КЛІЄНТ СКАСУВАВ ЗАМОВЛЕННЯ!*\n\n👤 Клієнт: ${clientUsername} (Карта #${userCardNum})\n🛍 Товар: ${prodTitle}\n🪙 Повернуто коїнів: ${purchase.coinsUsed} coins`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
  }
});

bot.on('text', async (ctx, next) => {
  const userId = ctx.from.id;
  const messageText = ctx.message.text.trim();

  if (messageText.startsWith('/')) {
    return next();
  }

  if (waitingCoins[userId] && waitingCoins[userId].productId) {
    const coinsToUse = parseInt(messageText, 10);
    const userCoins = db.users[userId] ? db.users[userId].coins : 0;

    if (isNaN(coinsToUse) || coinsToUse <= 0) {
      return ctx.reply('❌ Введіть коректне число коїнів (наприклад: 5):');
    }

    if (coinsToUse > userCoins) {
      return ctx.reply(`⚠️ Недостатньо коїнів! Поточний баланс: ${userCoins} coins. Введіть менше число:`);
    }

    const { productTitle, price: originalPrice } = waitingCoins[userId];
    delete waitingCoins[userId];

    const discountUah = coinsToUse * 5;
    const finalPrice = Math.max(0, originalPrice - discountUah);

    db.users[userId].coins -= coinsToUse;

    const purchaseId = 'p_' + Date.now();
    db.purchases[purchaseId] = {
      userId,
      productTitle,
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
🛍 *Товар:* ${productTitle}
💰 *Початкова ціна:* ${originalPrice} грн
🪙 *Списано коїнів:* ${coinsToUse} coins (-${discountUah} грн)
🔥 *Тепер це буде коштувати:* *${finalPrice} грн*

📩 *Адміністраторів уже сповіщено!*`,
      getProfileKeyboard(userId)
    );

    const clientUsername = db.users[userId].username;
    const adminTags = ADMIN_USERNAMES.map(u => '@' + u).join(' ');

    const adminMessage = 
`📥 *НОВЕ ЗАМОВЛЕННЯ ЗІ ЗНИЖКОЮ!*

🆔 *Номер замовлення:* \`#${shortId}\`
👤 *Клієнт:* ${clientUsername} (Картка #${db.users[userId].cardNumber})
🛍 *Товар:* ${productTitle}
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
});

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