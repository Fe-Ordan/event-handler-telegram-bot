const TelegramBot = require('node-telegram-bot-api')
const Datastore = require('nedb')

const db = new Datastore({ filename: 'store.db', autoload: true })

const { TELEGRAM_BOT_API_TOKEN } = require('./config.json')

const bot = new TelegramBot(TELEGRAM_BOT_API_TOKEN, { polling: true })

bot.on('message', (msg) => {

    if (msg.text.match(/\/start/)) {
        bot.sendMessage(msg.chat.id, `Let's start, send me the meeting title !`)

        db.findOne({ _id: msg.chat.id }, (err, doc) => {
            if (doc) {
                console.log('doc', doc)
            } else {
                doc = {
                    _id: msg.chat.id,
                    active: true
                }

                db.insert(doc, (err, newDoc) => {
                    console.log("newDoc: ", newDoc)
                    console.log("err", err)
                })
            }
        })
    } else if (msg.text.match(/\/finish/)) {
        bot.sendMessage(msg.chat.id, `Finish`)
    } else {
        db.update({ _id: msg.chat.id }, {$set: {title: msg.text}}, {returnUpdatedDocs: true}, (err, numAffected, affectedDoc) => {
            console.log("affectedDoc: ", affectedDoc)
            console.log("err: ", err)
        })
    }
})