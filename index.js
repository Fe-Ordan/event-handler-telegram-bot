const TelegramBot = require('node-telegram-bot-api')

const { TELEGRAM_BOT_API_TOKEN } = require('./config.json')

const bot = new TelegramBot(TELEGRAM_BOT_API_TOKEN, { polling: true })

bot.on('message', (msg) => {

    if (msg.text.match(/\/start/)) {
        bot.sendMessage(msg.chat.id, `Let's start, send me the meeting title !`)
    }
    
    if (msg.text.match(/\/finish/)) {
        bot.sendMessage(msg.chat.id, `Finish`)
    }
    
})