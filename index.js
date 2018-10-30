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

    console.log(JSON.stringify(msg, 0, 2))

    if (msg.text.match(/\/start/)) {
        bot.sendMessage(msg.chat.id, `Let's start, send me the meeting title !`)

        db.remove({ _chatId: msg.chat.id, active: true }, { multi: true }, (err, numRemoved) => {
            doc = {
                _chatId: msg.chat.id,
                active: true,
                readyToPublished: false
            }

            db.insert(doc, (err, newDoc) => {
                console.log("newDoc: ", newDoc)
                console.log("err", err)
            })
        })
    } else if(msg.text.match(/\/events/)) {
        db.findOne({_chatId: msg.chat.id, active: true, readyToPublished: true}, (err, doc) => {
            if (doc) {
                generateEvent(doc, msg)
            } else {
                bot.sendMessage(msg.chat.id, `Can't find any active events. Send /start to create a new one.`)
            }   
        })
    }
    else {
        db.findOne({ _chatId: msg.chat.id, active: true }, (err, doc) => {
            if (doc && doc.active) {
                if (!doc.title) {
                    bot.sendMessage(msg.chat.id, `Great,now send me the *date* or *time* for ${msg.text} meeting.`, { parse_mode: "Markdown" })
                    db.update({ _chatId: msg.chat.id, active: true }, { $set: { title: msg.text } }, { returnUpdatedDocs: true })
                } else if (!doc.date) {
                    bot.sendMessage(msg.chat.id, `Send me the *location* for the meeting.`, { parse_mode: "Markdown"})
                    db.update({ _chatId: msg.chat.id, active: true }, { $set: { date: msg.text } }, { returnUpdatedDocs: true })
                } else if (!doc.location) {
                    bot.sendMessage(msg.chat.id, `Event ready !`)
                    geocodeRequest(msg.text, (err, location) => {
                        if (err) {
                            location = {
                                address: msg.text
                            }
                        }
                        db.update({ _chatId: msg.chat.id, active: true }, { $set: { location, readyToPublished: true } }, { returnUpdatedDocs: true }, (err, numAffected, affectedDoc) => {
                            if (!err) generateEvent(affectedDoc, msg)
                        })
                    })
                }
            }
        })
    }
})

/**
 * 
 * @param {*} msgChatId 
 * A unique chat identifier
 * 
 * Generates a message that contains information about meeting
 * which is ready to be published.
 * 
 */
function generateEvent(doc, msg) {
    var message = ''
    
    if (msg.chat.type === 'private') {
        message += 'Event created. Use this link to share it to a group:\n'
        message += 'http://t.me/meetingsetterbot?startgroup=qweasd  \n\n'
    }

    message += `*${doc.title}* \n\n \uD83D\uDCC5  ${doc.date} \n\n Adress: ${doc.location.address}`
    bot.sendMessage(msg.chat.id, message, { parse_mode: "Markdown" })
    if (doc.location.lat) {
        bot.sendLocation(msg.chat.id, doc.location.lat, doc.location.lng)
    }
}

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