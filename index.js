const TelegramBot = require('node-telegram-bot-api')
const Datastore = require('nedb')
const request = require('request')

const db = new Datastore({ filename: 'store.db', autoload: true })

const { TELEGRAM_BOT_API_TOKEN } = require('./config.json')
const { GOOGLE_API_TOKEN } = require('./config.json')

const bot = new TelegramBot(TELEGRAM_BOT_API_TOKEN, { polling: true })

/**
 *  Listener for the message event.
 */
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
        db.update({ _id: msg.chat.id }, { $set: { active: false } }, { returnUpdatedDocs: true }, (err, numAffected, affectedDoc) => {
            try {
                bot.sendMessage(msg.chat.id, `${affectedDoc.title}`)
                bot.sendMessage(msg.chat.id, `Date: ${affectedDoc.date}`)
                if (affectedDoc.location.lat) {
                    bot.sendLocation(msg.chat.id, affectedDoc.location.lat, affectedDoc.location.lng)
                }
                bot.sendMessage(msg.chat.id, `Adress: ${affectedDoc.location.address}`)
            } catch (err) {
                console.log(err)
            }
        })
    } else {
        db.findOne({ _id: msg.chat.id }, (err, doc) => {
            if (doc && doc.active) {
                if (!doc.title) {
                    bot.sendMessage(msg.chat.id, `Great, now send me the DATE for ${msg.text} meeting`)
                    db.update({ _id: msg.chat.id }, { $set: { title: msg.text } }, { returnUpdatedDocs: true }, (err, numAffected, affectedDoc) => {
                        console.log("affectedDoc: ", affectedDoc)
                        console.log("err: ", err)
                    })
                } else if (!doc.date) {
                    bot.sendMessage(msg.chat.id, `Great, now send me the location for ${msg.text} meeting`)
                    db.update({ _id: msg.chat.id }, { $set: { date: msg.text } }, { returnUpdatedDocs: true }, (err, numAffected, affectedDoc) => {
                        console.log("affectedDoc: ", affectedDoc)
                        console.log("err: ", err)
                    })
                } else if (!doc.location) {
                    bot.sendMessage(msg.chat.id, `Great, now publish it !`)
                    geocodeRequest(msg.text, (err, location) => {
                        if (err) {
                            location = {
                                address: msg.text
                            }
                        }
                        db.update({ _id: msg.chat.id }, { $set: { location } }, { returnUpdatedDocs: true }, (err, numAffected, affectedDoc) => {
                            console.log("affectedDoc: ", affectedDoc)
                            console.log("err: ", err)
                        })
                    })
                } else {
                    bot.sendMessage(msg.chat.id, `Publish your meeting !`)
                }
            }
        })
    }

})

/**
 * @param {*} address 
 * An adress string.
 * @param {*} callback 
 * Callback function either called with the location object or error.
 * 
 * Makes a geocode request to Google API to get the latitude and longtitude
 * values of the location with the given adress.
 * 
 * */
function geocodeRequest(address, callback) {

    var encodedAddress = encodeURIComponent(address)

    request({
        url: `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_API_TOKEN}`,
        json: true
    }, (error, response, body) => {
        if (error) {
            callback('Unable to connect Google servers...')
        } else if (body.status === 'ZERO_RESULTS') {
            callback('Unable to locate the address...')
        } else {
            callback(undefined, {
                address: body.results[0].formatted_address,
                lat: body.results[0].geometry.location.lat,
                lng: body.results[0].geometry.location.lng,
            })
        }
    })
}