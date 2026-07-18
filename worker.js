const BOT_TOKEN = "8572306084:AAHqzr_M9sc1y9MuPV0_xiP1ngbhb1-nrd0";
const ADMIN_ID = 5115063699;
const PANEL_URL = "https://gucci-panel-production-0dff.up.railway.app";
const PANEL_USERNAME = "admin";
const PANEL_PASSWORD = "admin";

const PLANS = {
  "plan_1gb": { name: "۱ گیگابایت - ۱ ماهه (تست)", price: "۱۰,۰۰۰ تومان", bytes: 1 * 1024 * 1024 * 1024, durationDays: 30 },
  "plan_10gb": { name: "۱۰ گیگابایت - ۱ ماهه", price: "۳۰,۰۰۰ تومان", bytes: 10 * 1024 * 1024 * 1024, durationDays: 30 },
  "plan_20gb": { name: "۲۰ گیگابایت - ۱ ماهه", price: "۵۰,۰۰۰ تومان", bytes: 20 * 1024 * 1024 * 1024, durationDays: 30 },
  "plan_40gb": { name: "۴۰ گیگابایت - ۱ ماهه", price: "۸۰,۰۰۰ تومان", bytes: 40 * 1024 * 1024 * 1024, durationDays: 30 },
  "plan_unlimited": { name: "نامحدود - ۱ ماهه", price: "۱۲۰,۰۰۰ تومان", bytes: 0, durationDays: 30 }
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const update = await request.json();
        ctx.waitUntil(handleTelegramUpdate(update, env));
      } catch (err) {
        console.error("Error handling update:", err);
      }
      return new Response("OK", { status: 200 });
    }
    return new Response("Thunder Echo Bot Cloudflare Worker is active!", { status: 200 });
  }
};

// --- CORE TELEGRAM UPDATE HANDLER ---
async function handleTelegramUpdate(update, env) {
  const token = BOT_TOKEN;

  // 1. Handle Callback Query
  if (update.callback_query) {
    const callbackQuery = update.callback_query;
    const userId = callbackQuery.from.id;
    const username = callbackQuery.from.username || "ندارد";
    const firstName = callbackQuery.from.first_name || "کاربر";
    const data = callbackQuery.data;
    const messageId = callbackQuery.message?.message_id;

    console.log(`Callback Query from ${userId}: ${data}`);

    // Mandatory join check handler
    if (data === "check_join") {
      const isSubscribed = await checkChannelSubscription(userId, token);
      if (isSubscribed) {
        await answerCallback(callbackQuery.id, "✅ عضویت شما تایید شد!", false);
        // Delete the lock message
        if (messageId) {
          await deleteMessage(userId, messageId);
        }
        await sendWelcomeMessage(userId, firstName, token);
        await reportToAdmin(userId, firstName, username, "قفل عضویت را تایید کرد و وارد منوی اصلی شد", token);
      } else {
        await answerCallback(callbackQuery.id, "❌ شما هنوز عضو هر دو کانال نشده‌اید! لطفاً ابتدا عضو شوید.", true);
      }
      return;
    }

    // Main Menu callback
    if (data === "main_menu") {
      await answerCallback(callbackQuery.id, "", false);
      if (messageId) await deleteMessage(userId, messageId);
      await sendWelcomeMessage(userId, firstName, token);
      return;
    }

    // Free test choices
    if (data === "test_openvpn") {
      await answerCallback(callbackQuery.id, "فعلا تست open vpn فعال نیست", true);
      return;
    }

    if (data === "test_v2ray") {
      // Check duplicate
      const alreadyTested = await env.BOT_KV.get(`has_tested_${userId}`);
      if (alreadyTested === "true") {
        await answerCallback(callbackQuery.id, "شما یک بار تست را دریافت کردید و دیگر نمیتوانید دریافت کنید.", true);
        return;
      }

      await answerCallback(callbackQuery.id, "در حال ایجاد کانفیگ تست...", false);
      const waitMsg = await sendTelegram(token, "sendMessage", {
        chat_id: userId,
        text: "⏳ در حال ساخت اکانت تست شما... لطفا شکیبا باشید."
      });

      const panelSession = await login3xui();
      if (!panelSession) {
        if (waitMsg?.result?.message_id) await deleteMessage(userId, waitMsg.result.message_id);
        await sendTelegram(token, "sendMessage", {
          chat_id: userId,
          text: "❌ متاسفانه پنل در دسترس نیست. لطفا دقایقی دیگر تلاش کنید یا به پشتیبانی پیام دهید."
        });
        return;
      }

      const email = `trial_${userId}_${Math.random().toString(36).substring(2, 6)}`;
      const uuid = crypto.randomUUID();
      const subId = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
      const totalBytes = 100 * 1024 * 1024; // 100 MB
      const durationMs = 30 * 60 * 1000; // 30 minutes
      const expiryTime = Date.now() + durationMs;

      const success = await addClient3xui(panelSession, email, uuid, subId, totalBytes, expiryTime);
      if (waitMsg?.result?.message_id) await deleteMessage(userId, waitMsg.result.message_id);

      if (success) {
        const vlessUrl = makeVlessUrl(uuid, email);
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(vlessUrl)}`;

        // Save service in KV
        const serviceObj = {
          id: `trial_${userId}`,
          name: "🎁 سرویس تست رایگان G U C C I",
          email: email,
          type: "test",
          date: formatPersianDate(new Date()),
          volume: "100 MB",
          duration: "۳۰ دقیقه",
          config: vlessUrl,
          qr_url: qrUrl
        };
        await env.BOT_KV.put(`services_${userId}`, JSON.stringify([serviceObj]));
        await env.BOT_KV.put(`has_tested_${userId}`, "true");

        // Send service
        await sendTelegram(token, "sendPhoto", {
          chat_id: userId,
          photo: qrUrl,
          caption: `🎁 **سرویس تست رایگان شما با موفقیت ساخته شد!**\n━━━━━━━━━━━━━━━━━━━\n🏷️ نام سرویس: تست ۳۰ دقیقه‌ای\n📊 حجم: ۱۰۰ مگابایت\n⏳ مدت زمان: ۳۰ دقیقه\n\n👇 کانفیگ اختصاصی شما:\n<code>${vlessUrl}</code>\n\n📱 جهت اتصال، بارکد (QR Code) فوق را در نرم‌افزار خود اسکن کرده یا روی کانفیگ بالا کلیک کنید تا کپی شود.`
        });

        await reportToAdmin(userId, firstName, username, "دریافت تست رایگان v2ray", token);
      } else {
        await sendTelegram(token, "sendMessage", {
          chat_id: userId,
          text: "❌ خطایی در ساخت اکانت تست روی پنل رخ داد. لطفا با پشتیبان تماس بگیرید."
        });
      }
      return;
    }

    // Buy plans menu
    if (data === "plans_menu") {
      await answerCallback(callbackQuery.id, "", false);
      if (messageId) await deleteMessage(userId, messageId);
      await sendPlansMenu(userId, token);
      return;
    }

    // Select plan
    if (data.startsWith("buy_plan_")) {
      await answerCallback(callbackQuery.id, "", false);
      const planId = data.replace("buy_plan_", "");
      const plan = PLANS[planId];
      if (messageId) await deleteMessage(userId, messageId);

      await sendTelegram(token, "sendMessage", {
        chat_id: userId,
        text: `💳 **سفارش طرح: ${plan.name}**\n━━━━━━━━━━━━━━━━━━━\n💰 قیمت: ${plan.price}\n⏳ مدت زمان: ۳۰ روز\n\n💳 شماره کارت جهت واریز:\n<code>6104337602738476</code>\n👤 به نام: G U C C I\n\n👇 لطفاً مبلغ را به کارت فوق واریز کرده و سپس روی دکمه «ارسال رسید 📤» کلیک کنید تا وارد حالت ارسال رسید شوید:`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "ارسال رسید 📤", style: "success", callback_data: `submit_receipt_${planId}` }
            ],
            [
              { text: "بازگشت 🔙", style: "danger", callback_data: "plans_menu" }
            ]
          ]
        }
      });
      return;
    }

    // Submit receipt trigger
    if (data.startsWith("submit_receipt_")) {
      await answerCallback(callbackQuery.id, "", false);
      const planId = data.replace("submit_receipt_", "");
      
      // Save state to KV
      const stateObj = { state: "awaiting_receipt", plan: planId };
      await env.BOT_KV.put(`state_${userId}`, JSON.stringify(stateObj));

      if (messageId) await deleteMessage(userId, messageId);

      await sendTelegram(token, "sendMessage", {
        chat_id: userId,
        text: `📸 **لطفاً تصویر رسید پرداخت خود را ارسال کنید تا برای ادمین جهت تایید فرستاده شود:**`,
        reply_markup: {
          keyboard: [
            [ { text: "بازگشت 🔙", style: "danger" } ]
          ],
          resize_keyboard: true
        }
      });
      return;
    }

    // Admin approve/reject
    if (data.startsWith("admin_approve_")) {
      await answerCallback(callbackQuery.id, "سفارش تایید شد", false);
      const parts = data.replace("admin_approve_", "").split("_");
      const targetUserId = parts[0];
      const planId = parts[1] + (parts[2] ? "_" + parts[2] : "");
      
      await handleAdminApproval(targetUserId, planId, messageId, env, token);
      return;
    }

    if (data.startsWith("admin_reject_")) {
      await answerCallback(callbackQuery.id, "سفارش رد شد", false);
      const parts = data.replace("admin_reject_", "").split("_");
      const targetUserId = parts[0];
      const planId = parts[1] + (parts[2] ? "_" + parts[2] : "");

      await handleAdminRejection(targetUserId, planId, messageId, env, token);
      return;
    }

    // Service monitoring
    if (data.startsWith("view_service_") || data.startsWith("refresh_service_")) {
      const isRefresh = data.startsWith("refresh_service_");
      const serviceId = data.replace(isRefresh ? "refresh_service_" : "view_service_", "");
      await answerCallback(callbackQuery.id, isRefresh ? "🔄 در حال بروزرسانی اطلاعات..." : "", false);
      await handleServiceView(userId, serviceId, messageId, isRefresh, env, token);
      return;
    }

    if (data.startsWith("config_service_")) {
      await answerCallback(callbackQuery.id, "ارسال مجدد کانفیگ...", false);
      const serviceId = data.replace("config_service_", "");
      const servicesStr = await env.BOT_KV.get(`services_${userId}`);
      const services = servicesStr ? JSON.parse(servicesStr) : [];
      const service = services.find(s => s.id === serviceId);
      if (service) {
        await sendTelegram(token, "sendPhoto", {
          chat_id: userId,
          photo: service.qr_url,
          caption: `🚀 **سرویس شما G U C C I**\n━━━━━━━━━━━━━━━━━━━\n🏷️ نام: ${service.name}\n\n👇 کانفیگ شما:\n<code>${service.config}</code>`
        });
      }
      return;
    }

    if (data === "my_services") {
      await answerCallback(callbackQuery.id, "", false);
      if (messageId) await deleteMessage(userId, messageId);
      await sendMyServicesMenu(userId, env, token);
      return;
    }
  }

  // 2. Handle Text Messages
  if (update.message) {
    const msg = update.message;
    const userId = msg.from.id;
    const username = msg.from.username || "ندارد";
    const firstName = msg.from.first_name || "کاربر";
    const text = msg.text;

    console.log(`Message from ${userId}: ${text}`);

    // --- GRACEFUL STATE HANDLING FOR PHOTOS / RECEIPTS ---
    const stateStr = await env.BOT_KV.get(`state_${userId}`);
    const state = stateStr ? JSON.parse(stateStr) : null;

    if (state && state.state === "awaiting_receipt") {
      if (msg.photo) {
        // Handle photo receipt
        const photo = msg.photo[msg.photo.length - 1]; // highest resolution
        const fileId = photo.file_id;
        const planId = state.plan;
        const plan = PLANS[planId];

        // Reset user state in KV
        await env.BOT_KV.delete(`state_${userId}`);

        // Confirm to user
        await sendTelegram(token, "sendMessage", {
          chat_id: userId,
          text: `⏳ **پیام شما دریافت شد، در حال چک و بررسی می‌باشد. پس از تایید، سفارش شما آماده می‌شود.**`,
          reply_markup: getMainMenuKeyboard(userId === ADMIN_ID)
        });

        // Send to Admin
        await sendTelegram(token, "sendPhoto", {
          chat_id: ADMIN_ID,
          photo: fileId,
          caption: `📥 **رسید جدید دریافت شد!**\n━━━━━━━━━━━━━━━━━━━\n👤 فرستنده: ${firstName}\n🆔 شناسه عددی: <code>${userId}</code>\n🏷️ نام کاربری: @${username}\n📦 طرح درخواستی: ${plan.name}\n💰 قیمت طرح: ${plan.price}`,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ تایید رسید", style: "success", callback_data: `admin_approve_${userId}_${planId}` },
                { text: "❌ رد تایید", style: "danger", callback_data: `admin_reject_${userId}_${planId}` }
              ]
            ]
          }
        });

        await reportToAdmin(userId, firstName, username, `ارسال فیش واریزی برای طرح ${plan.name}`, token);
        return;
      } else if (text === "بازگشت 🔙") {
        await env.BOT_KV.delete(`state_${userId}`);
        await sendTelegram(token, "sendMessage", {
          chat_id: userId,
          text: "❌ ارسال رسید لغو شد.",
          reply_markup: getMainMenuKeyboard(userId === ADMIN_ID)
        });
        await sendWelcomeMessage(userId, firstName, token);
        return;
      } else {
        // User sent text instead of photo while in photo mode
        await sendTelegram(token, "sendMessage", {
          chat_id: userId,
          text: "⚠️ لطفا عکس فیش واریزی خود را بفرستید. در صورتی که می‌خواهید لغو کنید دکمه «بازگشت 🔙» را بزنید.",
          reply_markup: cancelKeyboard()
        });
        return;
      }
    }

    // --- STANDARD MENU NAVIGATION ---
    if (text === "/start") {
      const isSubscribed = await checkChannelSubscription(userId, token);
      if (isSubscribed) {
        await sendWelcomeMessage(userId, firstName, token);
        await reportToAdmin(userId, firstName, username, "ربات را با دستور /start آغاز کرد", token);
      } else {
        // Subscription Lock Screen
        await sendTelegram(token, "sendMessage", {
          chat_id: userId,
          text: `🔒 **قفل عضویت اجباری G U C C I**\n━━━━━━━━━━━━━━━━━━━\n👇 برای استفاده از خدمات ربات، باید ابتدا در کانال‌های زیر عضو شوید:\n\n1️⃣ [G U C C I CHANEL 1](https://t.me/VPN_GUCCI_CHANEL)\n2️⃣ [G U C C I CHANEL 2](https://t.me/VPN_GUCCI_IR)\n\n✅ پس از عضویت در هر دو کانال، دکمه «عضو شدم ✅» را کلیک کنید:`,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "G U C C I CHANEL 1 📢", url: "https://t.me/VPN_GUCCI_CHANEL" },
                { text: "G U C C I CHANEL 2 📢", url: "https://t.me/VPN_GUCCI_IR" }
              ],
              [
                { text: "عضو شدم ✅", callback_data: "check_join" }
              ]
            ]
          }
        });
      }
      return;
    }

    // Lock enforcement for other commands
    const isSubscribed = await checkChannelSubscription(userId, token);
    if (!isSubscribed) {
      await sendTelegram(token, "sendMessage", {
        chat_id: userId,
        text: `⚠️ **شما عضو کانال‌ها نیستید!**\nلطفاً ابتدا در کانال‌های زیر عضو شوید:\n\n1️⃣ @VPN_GUCCI_CHANEL\n2️⃣ @VPN_GUCCI_IR\n\nسپس دستور /start را ارسال کنید.`
      });
      return;
    }

    if (text === "خرید اشتراک 🛒") {
      await sendPlansMenu(userId, token);
      await reportToAdmin(userId, firstName, username, "منوی خرید اشتراک را باز کرد", token);
      return;
    }

    if (text === "تست رایگان 🧪") {
      await sendTelegram(token, "sendMessage", {
        chat_id: userId,
        text: `🎁 **دریافت سرویس تست G U C C I**\n━━━━━━━━━━━━━━━━━━━\n👇 لطفاً نوع سرویس تست مورد نظر خود را انتخاب کنید:`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "دریافت تست open vpn", callback_data: "test_openvpn" },
              { text: "دریافت تست v2ray", callback_data: "test_v2ray" }
            ],
            [
              { text: "بازگشت 🔙", callback_data: "main_menu" }
            ]
          ]
        }
      });
      await reportToAdmin(userId, firstName, username, "منوی تست رایگان را باز کرد", token);
      return;
    }

    if (text === "سرویس من 🛍️") {
      await sendMyServicesMenu(userId, env, token);
      await reportToAdmin(userId, firstName, username, "بخش سرویس‌های من را مشاهده کرد", token);
      return;
    }

    if (text === "پشتیبانی 📞") {
      await sendTelegram(token, "sendMessage", {
        chat_id: userId,
        text: `📞 **پشتیبانی رسمی کلاینت‌های G U C C I**\n━━━━━━━━━━━━━━━━━━━\n💬 در صورت بروز هرگونه مشکل، قطع اتصال، سوال قبل از خرید یا شارژ حساب، با آیدی پشتیبانی ارشد در ارتباط باشید:\n\n👤 **آیدی پشتیبان:** @MR_GUCCI_YT\n\n🕒 زمان پاسخگویی: ۲۴ ساعته و بدون وقفه!`,
        reply_markup: getMainMenuKeyboard(userId === ADMIN_ID)
      });
      await reportToAdmin(userId, firstName, username, "بخش پشتیبانی را مشاهده کرد", token);
      return;
    }

    if (text === "درباره ی ما ℹ️") {
      await sendTelegram(token, "sendMessage", {
        chat_id: userId,
        text: `ℹ️ **درباره برند G U C C I**\n━━━━━━━━━━━━━━━━━━━\n⚡ ارائه خدمات پرسرعت عبور از فیلترینگ با امن‌ترین پروتکل‌های روز دنیا (REALITY / XHTTP)\n🔓 بدون قطعی، بدون افت سرعت و با امنیت بالا برای اندروید، آیفون و ویندوز.\n\n📣 **کانال‌های رسمی ما:**\n📢 @VPN_GUCCI_CHANEL\n📢 @VPN_GUCCI_IR`,
        reply_markup: getMainMenuKeyboard(userId === ADMIN_ID)
      });
      await reportToAdmin(userId, firstName, username, "بخش درباره ما را مشاهده کرد", token);
      return;
    }

    if (text === "شارژ سرویس ها ⚙️" && userId === ADMIN_ID) {
      await sendTelegram(token, "sendMessage", {
        chat_id: userId,
        text: `⚙️ **پنل مدیریت ادمین ارشد G U C C I**\n━━━━━━━━━━━━━━━━━━━\nمخصوص شارژ، تغییر حجم و مشاهده وضعیت کل کاربران روی پنل لایو.\nبرای این کار به پنل وب مراجعه نمایید:\n\n🔗 ${PANEL_URL}`,
        reply_markup: getMainMenuKeyboard(true)
      });
      return;
    }

    if (text === "بازگشت 🔙" || text === "منوی اصلی") {
      await sendWelcomeMessage(userId, firstName, token);
      return;
    }

    // Dynamic Reply Keyboard click for active service name
    const servicesStr = await env.BOT_KV.get(`services_${userId}`);
    if (servicesStr) {
      const services = JSON.parse(servicesStr);
      const matched = services.find(s => text.includes(s.name) || text.includes(s.email));
      if (matched) {
        await handleServiceView(userId, matched.id, null, false, env, token);
        return;
      }
    }

    // Unknown commands
    await sendTelegram(token, "sendMessage", {
      chat_id: userId,
      text: "⚠️ دستور نامعتبر است. لطفا از دکمه‌های کیبورد زیر استفاده کنید:",
      reply_markup: getMainMenuKeyboard(userId === ADMIN_ID)
    });
  }
}

// --- HELPER SENDERS ---
async function sendWelcomeMessage(chatId, firstName, token) {
  const isAdmin = (chatId === ADMIN_ID);
  await sendTelegram(token, "sendMessage", {
    chat_id: chatId,
    text: `❤️ **به مجموعه بزرگ G U C C I خوش آمدید!**\n\n🤖 ربات رسمی سرویس‌های فیلترشکن فوق سریع گوچی\n━━━━━━━━━━━━━━━━━━━\n👤 نام شما: **${firstName}**\n🆔 شناسه عددی شما: <code>${chatId}</code>\n\n👇 از منوی زیر برای خرید اشتراک، دریافت تست رایگان یا مشاهده سرویس‌های خود استفاده کنید:`,
    parse_mode: "HTML",
    reply_markup: getMainMenuKeyboard(isAdmin)
  });
}

async function sendPlansMenu(chatId, token) {
  await sendTelegram(token, "sendMessage", {
    chat_id: chatId,
    text: `🛒 **لیست طرح‌های اشتراک ویژه G U C C I**\n━━━━━━━━━━━━━━━━━━━\n🚀 تمام طرح‌ها روی لوکیشن‌های فوق‌العاده با آی‌پی ثابت و بدون قطعی می‌باشند.\n\n👇 لطفاً طرح مورد نظر خود را انتخاب کنید:`,
    reply_markup: {
      inline_keyboard: [
        [ { text: "🟢 ۱ گیگابایت - ۱ ماهه (تست) ➔ ۱۰,۰۰۰ تومان", callback_data: "buy_plan_1gb" } ],
        [ { text: "🔵 ۱۰ گیگابایت - ۱ ماهه ➔ ۳۰,۰۰۰ تومان", callback_data: "buy_plan_10gb" } ],
        [ { text: "🟣 ۲۰ گیگابایت - ۱ ماهه ➔ ۵۰,۰۰۰ تومان", callback_data: "buy_plan_20gb" } ],
        [ { text: "🟡 ۴۰ گیگابایت - ۱ ماهه ➔ ۸۰,۰۰۰ تومان", callback_data: "buy_plan_40gb" } ],
        [ { text: "🔴 نامحدود - ۱ ماهه ➔ ۱۲۰,۰۰۰ تومان", callback_data: "buy_plan_unlimited" } ],
        [ { text: "بازگشت 🔙", callback_data: "main_menu" } ]
      ]
    }
  });
}

async function sendMyServicesMenu(userId, env, token) {
  const servicesStr = await env.BOT_KV.get(`services_${userId}`);
  const services = servicesStr ? JSON.parse(servicesStr) : [];

  if (services.length === 0) {
    await sendTelegram(token, "sendMessage", {
      chat_id: userId,
      text: `❌ **شما هیچ سرویس فعالی ندارید!**\n\nمی‌توانید برای دریافت اکانت تست رایگان یا خرید اشتراک از گزینه‌های زیر استفاده کنید:`,
      reply_markup: getMainMenuKeyboard(userId === ADMIN_ID)
    });
  } else {
    // If exactly 1 service, show details directly to make it super convenient
    if (services.length === 1) {
      await handleServiceView(userId, services[0].id, null, false, env, token);
      return;
    }

    // Multiple services: Show custom inline list + Reply keyboard for services
    const inlineButtons = [];
    const replyButtons = [];

    for (const service of services) {
      inlineButtons.push([ { text: `🚀 ${service.name}`, callback_data: `view_service_${service.id}` } ]);
      replyButtons.push([ { text: `🚀 ${service.name}`, style: "primary" } ]);
    }
    inlineButtons.push([ { text: "بازگشت 🔙", callback_data: "main_menu" } ]);
    replyButtons.push([ { text: "بازگشت 🔙", style: "danger" } ]);

    // Send the reply keyboard to make it visual and colored
    await sendTelegram(token, "sendMessage", {
      chat_id: userId,
      text: `🛍️ **لیست سرویس‌های فعال شما G U C C I**\n━━━━━━━━━━━━━━━━━━━\n👇 جهت مشاهده وضعیت زنده هر سرویس، آن را انتخاب کنید:`,
      reply_markup: {
        keyboard: replyButtons,
        resize_keyboard: true
      }
    });
  }
}

// --- VIEW & LIVE UPDATE SYSTEM ---
async function handleServiceView(userId, serviceId, messageId, isRefresh, env, token) {
  const servicesStr = await env.BOT_KV.get(`services_${userId}`);
  const services = servicesStr ? JSON.parse(servicesStr) : [];
  const service = services.find(s => s.id === serviceId);

  if (!service) {
    await sendTelegram(token, "sendMessage", {
      chat_id: userId,
      text: "❌ سرویس مورد نظر یافت نشد."
    });
    return;
  }

  // Fetch Live data from panel
  const panelSession = await login3xui();
  let liveStats = null;
  if (panelSession) {
    liveStats = await getClientStatsFromInbound1(panelSession, service.email);
  }

  // Expired / Deleted on panel
  if (!liveStats || liveStats.enable === false || (liveStats.expiryTime > 0 && Date.now() >= liveStats.expiryTime) || (liveStats.total > 0 && (liveStats.up + liveStats.down) >= liveStats.total)) {
    // Service expired!
    const text = `❌ **سرویس شما منقضی شده است!**\n━━━━━━━━━━━━━━━━━━━\n🏷️ نام سرویس: ${service.name}\n🔴 وضعیت: **غیرفعال / منقضی شده ❌**\n\n⚠️ سرویس شما به پایان رسیده است. لطفا جهت استفاده مجدد و تمدید از بخش خرید اشتراک اقدام فرمایید.`;
    
    // Remove expired service from active list
    const updatedServices = services.filter(s => s.id !== serviceId);
    await env.BOT_KV.put(`services_${userId}`, JSON.stringify(updatedServices));

    if (messageId) {
      await sendTelegram(token, "editMessageText", {
        chat_id: userId,
        message_id: messageId,
        text: text,
        parse_mode: "HTML"
      });
    } else {
      await sendTelegram(token, "sendMessage", {
        chat_id: userId,
        text: text,
        parse_mode: "HTML",
        reply_markup: getMainMenuKeyboard(userId === ADMIN_ID)
      });
    }

    // Customer Notification
    await sendTelegram(token, "sendMessage", {
      chat_id: userId,
      text: `🔔 **سرویس شما منقضی شده است، لطفا برای خرید می‌توانید از قسمت خرید اشتراک اقدام نمائید.**`,
      reply_markup: getMainMenuKeyboard(userId === ADMIN_ID)
    });

    // Admin Notification
    await sendTelegram(token, "sendMessage", {
      chat_id: ADMIN_ID,
      text: `🔔 **سرویس کاربر ${userId} (ایمیل: ${service.email}) منقضی و از بخش سرویس‌ها حذف گردید.**`
    });
    return;
  }

  // Active client: Calculate time and bytes
  const remMs = liveStats.expiryTime > 0 ? (liveStats.expiryTime - Date.now()) : 0;
  const days = Math.floor(remMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const mins = Math.floor((remMs % (60 * 60 * 1000)) / (60 * 1000));
  const secs = Math.floor((remMs % (60 * 1000)) / 1000);

  const usedBytes = liveStats.up + liveStats.down;
  const usedMB = (usedBytes / 1024 / 1024).toFixed(1);
  const totalMB = liveStats.total > 0 ? (liveStats.total / 1024 / 1024).toFixed(1) : "نامحدود";
  const remainingMB = liveStats.total > 0 ? ((liveStats.total - usedBytes) / 1024 / 1024).toFixed(1) : "نامحدود";

  const remTimeString = liveStats.expiryTime > 0 
    ? `${days} روز و ${hours} ساعت و ${mins} دقیقه و ${secs} ثانیه`
    : "نامحدود";

  const updatedTimeStr = formatPersianDate(new Date()) + " " + new Date().toLocaleTimeString("fa-IR");

  const text = `🛍️ **وضعیت آنلاین سرویس G U C C I**\n━━━━━━━━━━━━━━━━━━━\n🏷️ نام سرویس: **${service.name}**\n🟢 وضعیت: **فعال**\n📧 ایمیل کلاینت: <code>${service.email}</code>\n\n📊 حجم مصرف شده: **${usedMB} MB**\n📊 حجم باقی‌مانده: **${remainingMB} MB**\n📊 حجم کل سرویس: **${totalMB} MB**\n\n📅 تاریخ خرید: **${service.date}**\n⏳ زمان باقی‌مانده: **${remTimeString}**\n━━━━━━━━━━━━━━━━━━━\n🔄 آخرین بروزرسانی: **${updatedTimeStr}**`;

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "سرویس من 🚀", callback_data: `config_service_${service.id}` },
        { text: "بروزرسانی 🔄", callback_data: `refresh_service_${service.id}` }
      ],
      [
        { text: "بازگشت 🔙", callback_data: "my_services" }
      ]
    ]
  };

  if (messageId) {
    await sendTelegram(token, "editMessageText", {
      chat_id: userId,
      message_id: messageId,
      text: text,
      parse_mode: "HTML",
      reply_markup: inlineKeyboard
    });
  } else {
    await sendTelegram(token, "sendMessage", {
      chat_id: userId,
      text: text,
      parse_mode: "HTML",
      reply_markup: inlineKeyboard
    });
  }
}

// --- ADMIN APPROVAL ACTIONS ---
async function handleAdminApproval(targetUserId, planId, adminMessageId, env, token) {
  const plan = PLANS[planId];
  if (!plan) return;

  // Notify admin in chat
  await sendTelegram(token, "editMessageCaption", {
    chat_id: ADMIN_ID,
    message_id: adminMessageId,
    caption: `✅ رسید تایید شد. در حال فعال‌سازی سرویس مشتری...`
  });

  // Notify user
  await sendTelegram(token, "sendMessage", {
    chat_id: targetUserId,
    text: `✅ **سفارش شما تایید شد. در حال آماده‌سازی سفارش شما...**`
  });

  // Create on 3X-UI
  const panelSession = await login3xui();
  if (!panelSession) {
    await sendTelegram(token, "sendMessage", {
      chat_id: targetUserId,
      text: `❌ با عرض پوزش، آماده‌سازی سرویس با خطا مواجه شد. لطفاً موضوع را با پشتیبان در میان بگذارید.`
    });
    return;
  }

  const email = `sub_${targetUserId}_${Math.random().toString(36).substring(2, 6)}`;
  const uuid = crypto.randomUUID();
  const subId = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  const totalBytes = plan.bytes;
  const durationMs = plan.durationDays * 24 * 60 * 60 * 1000;
  const expiryTime = Date.now() + durationMs;

  const success = await addClient3xui(panelSession, email, uuid, subId, totalBytes, expiryTime);
  if (success) {
    const vlessUrl = makeVlessUrl(uuid, email);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(vlessUrl)}`;

    // Save to target user services list
    const servicesStr = await env.BOT_KV.get(`services_${targetUserId}`);
    const services = servicesStr ? JSON.parse(servicesStr) : [];
    
    const serviceObj = {
      id: `service_${Date.now()}`,
      name: `🚀 سرویس ${plan.name} G U C C I`,
      email: email,
      type: "purchase",
      date: formatPersianDate(new Date()),
      volume: totalBytes > 0 ? `${(totalBytes / 1024 / 1024 / 1024).toFixed(0)} GB` : "نامحدود",
      duration: "۳۰ روز",
      config: vlessUrl,
      qr_url: qrUrl
    };
    services.push(serviceObj);
    await env.BOT_KV.put(`services_${targetUserId}`, JSON.stringify(services));

    // Deliver to user
    await sendTelegram(token, "sendPhoto", {
      chat_id: targetUserId,
      photo: qrUrl,
      caption: `🎉 **سفارش شما آماده و فعال شد!**\n━━━━━━━━━━━━━━━━━━━\n📦 طرح خریداری شده: **${plan.name}**\n📊 حجم مجاز: **${serviceObj.volume}**\n⏳ مدت زمان: ۳۰ روز\n\n👇 کانفیگ اختصاصی شما:\n<code>${vlessUrl}</code>\n\n📱 برای استفاده از کانفیگ، بارکد بالا را اسکن کرده یا روی متن کانفیگ کلیک کنید تا کپی شود.`,
      reply_markup: getMainMenuKeyboard(targetUserId === ADMIN_ID)
    });

    // Notify admin
    await sendTelegram(token, "editMessageCaption", {
      chat_id: ADMIN_ID,
      message_id: adminMessageId,
      caption: `✅ **رسید تایید شد و سرویس با موفقیت برای کاربر ${targetUserId} ایجاد شد.**`
    });

    const targetUser = await getTelegramChat(targetUserId, token);
    const targetName = targetUser?.first_name || "کاربر";
    const targetUsern = targetUser?.username || "ندارد";
    await reportToAdmin(targetUserId, targetName, targetUsern, `دریافت سرویس خرید اشتراک (${plan.name})`, token);
  } else {
    await sendTelegram(token, "sendMessage", {
      chat_id: targetUserId,
      text: `❌ خطایی در ساخت اکانت روی پنل رخ داد. لطفاً با پشتیبان تماس بگیرید.`
    });
  }
}

async function handleAdminRejection(targetUserId, planId, adminMessageId, env, token) {
  await sendTelegram(token, "editMessageCaption", {
    chat_id: ADMIN_ID,
    message_id: adminMessageId,
    caption: `❌ سفارش رد شد.`
  });

  await sendTelegram(token, "sendMessage", {
    chat_id: targetUserId,
    text: `❌ **متاسفانه سفارش شما تایید نشد. می‌توانید از طریق بخش خرید اشتراک اقدام نمایید.**`,
    reply_markup: getMainMenuKeyboard(targetUserId === ADMIN_ID)
  });

  const targetUser = await getTelegramChat(targetUserId, token);
  const targetName = targetUser?.first_name || "کاربر";
  const targetUsern = targetUser?.username || "ندارد";
  await reportToAdmin(targetUserId, targetName, targetUsern, `رسید پرداخت رد شد (طرح: ${PLANS[planId]?.name})`, token);
}

// --- 3X-UI PANEL API ENGINE ---
async function login3xui() {
  try {
    const csrfRes = await fetch(`${PANEL_URL}/csrf-token`);
    const cookies = csrfRes.headers.get("set-cookie") || "";
    const csrfText = await csrfRes.text();
    const csrfObj = JSON.parse(csrfText);
    const csrfToken = csrfObj.obj;

    const cookieHeader = cookies.split(",").map(c => c.split(";")[0].trim()).join("; ");

    const loginRes = await fetch(`${PANEL_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        "Cookie": cookieHeader
      },
      body: JSON.stringify({
        username: PANEL_USERNAME,
        password: PANEL_PASSWORD
      })
    });

    if (loginRes.status !== 200) return null;
    const loginCookies = loginRes.headers.get("set-cookie") || "";
    const finalCookies = [cookieHeader, ...loginCookies.split(",").map(c => c.split(";")[0].trim())]
      .filter(Boolean)
      .join("; ");

    return {
      cookies: finalCookies,
      csrfToken: csrfToken
    };
  } catch (err) {
    console.error("3X-UI Login Failed:", err);
    return null;
  }
}

async function addClient3xui(session, email, uuid, subId, totalBytes, expiryTime) {
  try {
    const settings = {
      clients: [
        {
          id: uuid,
          flow: "",
          email: email,
          limitIp: email.startsWith("trial") ? 1 : 2,
          totalGB: totalBytes,
          expiryTime: expiryTime,
          enable: true,
          tgId: 0,
          subId: subId
        }
      ]
    };

    const res = await fetch(`${PANEL_URL}/panel/api/inbounds/addClient`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": session.csrfToken,
        "Cookie": session.cookies
      },
      body: JSON.stringify({
        id: 1,
        settings: JSON.stringify(settings)
      })
    });

    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error("3X-UI addClient Failed:", err);
    return false;
  }
}

async function getClientStatsFromInbound1(session, email) {
  try {
    const res = await fetch(`${PANEL_URL}/panel/api/inbounds/get/1`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-CSRF-Token": session.csrfToken,
        "Cookie": session.cookies
      }
    });
    if (res.status !== 200) return null;
    const data = await res.json();
    if (!data.success || !data.obj) return null;

    const stat = data.obj.clientStats.find(s => s.email === email);
    if (!stat) return null;

    const client = data.obj.settings.clients.find(c => c.email === email);

    return {
      up: stat.up,
      down: stat.down,
      total: stat.total,
      expiryTime: stat.expiryTime,
      enable: client ? client.enable : stat.enable,
      uuid: stat.uuid,
      subId: stat.subId
    };
  } catch (err) {
    console.error("3X-UI getClientStats Failed:", err);
    return null;
  }
}

// --- TELEGRAM BOT UTILS ---
async function sendTelegram(token, method, payload) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    console.error(`Telegram API Error (${method}):`, err);
    return null;
  }
}

async function deleteMessage(chatId, messageId) {
  await sendTelegram(BOT_TOKEN, "deleteMessage", {
    chat_id: chatId,
    message_id: messageId
  });
}

async function answerCallback(callbackId, text, showAlert = false) {
  await sendTelegram(BOT_TOKEN, "answerCallbackQuery", {
    callback_query_id: callbackId,
    text: text,
    show_alert: showAlert
  });
}

async function getTelegramChat(chatId, token) {
  const data = await sendTelegram(token, "getChat", { chat_id: chatId });
  return data?.ok ? data.result : null;
}

async function checkChannelSubscription(userId, token) {
  if (userId === ADMIN_ID) return true; // Skip for admin

  const channels = ["@VPN_GUCCI_CHANEL", "@VPN_GUCCI_IR"];
  for (const channel of channels) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getChatMember?chat_id=${channel}&user_id=${userId}`);
      const data = await res.json();
      if (data.ok) {
        const status = data.result.status;
        if (status !== "member" && status !== "administrator" && status !== "creator") {
          return false;
        }
      } else {
        // Fallback to true if bot lacks admin rights in channels
        const desc = data.description || "";
        if (desc.includes("bot is not a member") || desc.includes("chat not found") || desc.includes("not admin")) {
          continue;
        }
        return false;
      }
    } catch (e) {
      continue;
    }
  }
  return true;
}

async function reportToAdmin(userId, firstName, username, action, token) {
  const text = `این کاربر با این اسم [${firstName}] و با این نام کاربری @[${username}] و با این id [${userId}] این کارو توی ربات انجام داد: [${action}]`;
  await sendTelegram(token, "sendMessage", {
    chat_id: ADMIN_ID,
    text: text
  });
}

// --- GENERAL UTILS ---
function makeVlessUrl(uuid, email) {
  const domain = "gucci-panel-production-0dff.up.railway.app";
  const port = 443;
  const pbk = "Oam0DdSr8Ui7BG7qk-RCJzdQJanYDNUk9NVeRL47R0g";
  const fp = "chrome";
  const sni = "github.com";
  const sid = "80cb21ea";
  const path = encodeURIComponent("/");
  return `vless://${uuid}@${domain}:${port}?type=xhttp&security=reality&pbk=${pbk}&fp=${fp}&sni=${sni}&sid=${sid}&spx=%2F&path=${path}#${encodeURIComponent(email)}`;
}

function cancelKeyboard() {
  return {
    keyboard: [
      [ { text: "بازگشت 🔙", style: "danger" } ]
    ],
    resize_keyboard: true
  };
}

function getMainMenuKeyboard(isAdmin) {
  const keyboard = [
    [ { text: "خرید اشتراک 🛒", style: "success" } ],
    [
      { text: "تست رایگان 🧪", style: "primary" },
      { text: "پنل همکاران 👥", style: "success" }
    ],
    [ { text: "سرویس من 🛍️", style: "primary" } ],
    [
      { text: "پشتیبانی 📞", style: "danger" },
      { text: "درباره ی ما ℹ️", style: "danger" }
    ]
  ];
  if (isAdmin) {
    keyboard.push([ { text: "شارژ سرویس ها ⚙️", style: "primary" } ]);
  }
  return {
    keyboard: keyboard,
    resize_keyboard: true,
    is_persistent: true
  };
}

function formatPersianDate(date) {
  const jdf = new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric" });
  return jdf.format(date);
}
