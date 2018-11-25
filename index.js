const TelegramBot = require('node-telegram-bot-api')
const Datastore = require('nedb')
const request = require('request')
const _ = require('lodash')

const db = new Datastore({ filename: 'store.db', autoload: true })

const { TELEGRAM_BOT_API_TOKEN, GOOGLE_API_TOKEN } = require('./config.json')

const bot = new TelegramBot(TELEGRAM_BOT_API_TOKEN, { polling: true })

/**
 *  Listener for the message event.
 * 
 * @todo Handle command intersections with other bots in chat.
 */
bot.on('message', (msg) => {
    if (msg.text.match(/\/start@eventhandler_bot/) || (msg.text.match(/\/start/) && msg.chat.type === 'private')) {
        var msgElements = msg.text.split(' ')
        var event = {}

        /** If hashed message info exists,
         * update the event's chatId and start getting answers.
        */
        if (msgElements[1]) {
            let token = msgElements[1]
            db.remove({ _chatId: msg.chat.id, active: true }, { multi: true }, () => {
                db.update({ _id: token }, { $set: { _chatId: msg.chat.id } }, { returnUpdatedDocs: true }, (err, numAffected, affectedDoc) => {
                    if (affectedDoc) {
                        generateEvent(affectedDoc, msg)
                    }
                })
            })
        } else {
            bot.sendMessage(msg.chat.id, `Let's start, send me the meeting title !`, { reply_markup: { force_reply: true } })
            event = {
                _chatId: msg.chat.id,
                active: true,
                readyToPublished: false,
                votes: {
                    positive: [],
                    neutral: [],
                    negative: []
                }
            }
            db.remove({ _chatId: msg.chat.id, active: true }, { multi: true }, () => {
                db.insert(event, (err, newDoc) => {
                    if (err) throw err
                })
            })
        }
    } else if (msg.text.match(/\/events@eventhandler_bot/) || (msg.text.match(/\/events/) && msg.chat.type === 'private')) {
        db.findOne({ _chatId: msg.chat.id, active: true, readyToPublished: true }, (err, doc) => {
            if (doc) {
                generateEvent(doc, msg)
            } else {
                bot.sendMessage(msg.chat.id, `Can't find any active events. Send /start to create a new one.`)
            }
        })
    } else if (msg.text.match(/\/results@eventhandler_bot/) || (msg.text.match(/\/results/) && msg.chat.type === 'private')) {
        if (msg.chat.type === 'group') {
            db.findOne({ _chatId: msg.chat.id, active: true, readyToPublished: true }, (err, doc) => {
                if (doc) {
                    generateVoteResults(doc, msg)
                } else {
                    bot.sendMessage(msg.chat.id, `Can't find any active events. Send /start to create a new one.`)
                }
            })
        } else {
            bot.sendMessage(msg.chat.id, 'Event has to be started in group to see the results...')
        }
    } else {
        if (msg.chat.type === 'private' || (msg.chat.type === 'group' && msg.reply_to_message && msg.reply_to_message.from.username === 'eventhandler_bot')) {
            db.findOne({ _chatId: msg.chat.id, active: true, readyToPublished: false }, (err, doc) => {
                if (doc) {
                    if (!doc.title) {
                        bot.sendMessage(msg.chat.id, `Great,now send me the *date* or *time* for ${msg.text} meeting.`, { parse_mode: "Markdown", reply_markup: { force_reply: true } })
                        db.update({ _chatId: msg.chat.id, active: true }, { $set: { title: msg.text } }, { returnUpdatedDocs: true })
                    } else if (!doc.date) {
                        bot.sendMessage(msg.chat.id, `Send me the *location* for the meeting.`, { parse_mode: "Markdown", reply_markup: { force_reply: true } })
                        db.update({ _chatId: msg.chat.id, active: true }, { $set: { date: msg.text } }, { returnUpdatedDocs: true })
                    } else if (!doc.location) {
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
                } else if (msg.chat.type === 'group') {
                    if (msg.text === 'I\'m going !' || msg.text === 'Maybe' || msg.text === 'No') {
                        db.findOne({ _chatId: msg.chat.id, active: true, readyToPublished: true }, (err, doc) => {
                            if (doc) {
                                let votes = doc.votes,
                                    username = msg.from.username,
                                    field

                                switch (msg.text) {
                                    case 'I\'m going !':
                                        field = 'positive'
                                        break
                                    case 'Maybe':
                                        field = 'neutral'
                                        break
                                    case 'No':
                                        field = 'negative'
                                        break
                                }

                                // Change will be made in db.
                                if (!votes[field].includes(username)) {
                                    votes[field].push(username)

                                    if (field === 'positive') {
                                        if (votes.neutral.includes(username)) {
                                            _.pull(votes.neutral, username)
                                        } else if (votes.negative.includes(username)) {
                                            _.pull(votes.negative, username)
                                        }
                                    } else if (field === 'neutral') {
                                        if (votes.positive.includes(username)) {
                                            _.pull(votes.positive, username)
                                        } else if (votes.negative.includes(username)) {
                                            _.pull(votes.negative, username)
                                        }
                                    } else {
                                        if (votes.neutral.includes(username)) {
                                            _.pull(votes.neutral, username)
                                        } else if (votes.positive.includes(username)) {
                                            _.pull(votes.positive, username)
                                        }
                                    }

                                    db.update({ _chatId: msg.chat.id, active: true }, { $set: { votes } }, { returnUpdatedDocs: true }, (err, numAffected, affectedDoc) => {
                                        if (affectedDoc) {
                                            generateVoteInfo(msg)
                                        }
                                    })
                                } else {
                                    generateVoteInfo(msg)
                                }

                            }
                        })
                    }
                }
            })
        }
    }
})

/**
 * 
 * @param {*} doc 
 * Document from database
 * @param {*} msg 
 * Message object
 * 
 * Generates a message that contains information about meeting
 * which is ready to be published.
 * 
 */
function generateEvent(doc, msg) {
    var message = '',
        reply_markup

    if (msg.chat.type === 'private') {
        message += 'Event created. Use this link to share it to a group:\n'
        message += `http://t.me/eventhandler\\_bot?startgroup=${doc._id}\n`
    } else {
        message += ' '
        reply_markup = {
            "keyboard": [['I\'m going !'], ['Maybe'], ['No']]
        }
    }

    message += `\n*${doc.title}* \n\n *Date/Time* \uD83D\uDCC5 \n ${doc.date} \n\n *Location* \u{1F5FA}\u{FE0F}\n${doc.location.address} \n`
    bot.sendMessage(msg.chat.id, message, {
        parse_mode: "Markdown",
        reply_markup
    })
    if (doc.location.lat) {
        bot.sendLocation(msg.chat.id, doc.location.lat, doc.location.lng)
    }
}

/**
 * @param {*} doc 
 * Document from database
 * @param {*} msg 
 * Message object
 * 
 * Generates a message that contains information about results of meeting
 * Users and their vote details
 * 
 */
function generateVoteResults(doc, msg) {
    var message = `*COMING:* ${doc.votes.positive.length}\n*MAYBE:* ${doc.votes.neutral.length} \n*NOT COMING:* ${doc.votes.negative.length}\n\n`

    if (doc.votes.positive.length > 0) {
        message += 'WHO IS COMING ? \u2714\n'
        doc.votes.positive.forEach((username, index) => {
            message += `@${username}`
            if (doc.votes.positive.length - 1 !== index)
                message += ', '
        })
        message += '\n\n'
    }

    if (doc.votes.neutral.length > 0) {
        message += 'WHO IS NOT SURE ? \u2753 \n'
        doc.votes.neutral.forEach((username, index) => {
            message += `@${username}`
            if (doc.votes.neutral.length - 1 !== index)
                message += ', '
        })
        message += '\n\n'
    }

    if (doc.votes.negative.length > 0) {
        message += 'WHO IS NOT COMING ? \u2716 \n'
        doc.votes.negative.forEach((username, index) => {
            message += `@${username}`
            if (doc.votes.negative.length - 1 !== index)
                message += ', '
        })
        message += '\n\n'
    }

    bot.sendMessage(msg.chat.id, message, {
        parse_mode: 'Markdown'
    })
}

/**
 * @param {*} msg 
 * Message object
 * 
 * Generates a message that contains information about the user who is just voted
 * 
 */
function generateVoteInfo(msg) {
    var message,
        start,
        end

    switch (msg.text) {
        case 'I\'m going !':
            start = '\u2714'
            end = 'is going !'
            break
        case 'Maybe':
            start = '\u2753'
            end = 'is not sure.'
            break
        case 'No':
            start = '\u2716'
            end = 'is not going.'
            break
    }

    message = `${start} @${msg.from.username} ${end} \n\n /results - show results`

    bot.sendMessage(msg.chat.id, message, {
        parse_mode: "Markdown",
        reply_markup: {
            remove_keyboard: true
        }
    })
}

/**
 * @param {*} address 
 * An adress string.
 * @param {*} callback 
 * 
 * @todo Change callback to promise.
 * 
 * Callback function either called with the location object or error. * 
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