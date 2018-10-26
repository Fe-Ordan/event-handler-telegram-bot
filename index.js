const TelegramBot = require('node-telegram-bot-api')

const { TELEGRAM_BOT_API_TOKEN } = require('./config.json')

const bot = new TelegramBot(TELEGRAM_BOT_API_TOKEN, { polling: true })

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Welcome !', {
        'reply_markup': {
            'keyboard': [['Hello u too', 'Who are you ?', 'Another answer', 'Okay BYE']]
        }
    })
})