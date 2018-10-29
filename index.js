const TelegramBot = require('node-telegram-bot-api')
const Datastore = require('nedb')
const request = require('request')

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
        db.update({ _id: msg.chat.id }, {$set: {active: false}}, {returnUpdatedDocs: true}, (err, numAffected, affectedDoc) => {
            bot.sendMessage(msg.chat.id, `${affectedDoc.title}`)
            bot.sendMessage(msg.chat.id, `Date: ${affectedDoc.date}`)
            bot.sendLocation(msg.chat.id, 44.1234, 61.2163)
        })
    } else {
        db.findOne({ _id: msg.chat.id }, (err, doc) => {
            if (doc && doc.active) {
                if (!doc.title) {
                    bot.sendMessage(msg.chat.id, `Great, now send me the DATE for ${msg.text} meeting`)
                    db.update({ _id: msg.chat.id }, {$set: {title: msg.text}}, {returnUpdatedDocs: true}, (err, numAffected, affectedDoc) => {
                        console.log("affectedDoc: ", affectedDoc)
                        console.log("err: ", err)
                    })
                } else if(!doc.date) {
                    bot.sendMessage(msg.chat.id, `Great, now send me the location for ${msg.text} meeting`)
                    db.update({ _id: msg.chat.id }, {$set: {date: msg.text}}, {returnUpdatedDocs: true}, (err, numAffected, affectedDoc) => {
                        console.log("affectedDoc: ", affectedDoc)
                        console.log("err: ", err)
                    })
                } else if(!doc.location) {
                    bot.sendMessage(msg.chat.id, `Great, now publish it !`)
                    db.update({ _id: msg.chat.id }, {$set: {location: msg.text}}, {returnUpdatedDocs: true}, (err, numAffected, affectedDoc) => {
                        console.log("affectedDoc: ", affectedDoc)
                        console.log("err: ", err)
                    })
                } else {
                    bot.sendMessage(msg.chat.id, `Publish your meeting !`)                    
                }
            }
        })
    }

})