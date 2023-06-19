const express = require('express');
const { google } = require('googleapis');
const { authenticate } = require('@google-cloud/local-auth');
const fs = require("fs").promises;
const path = require("path");

const app = express();
const port = 8000;

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://mail.google.com/'
]; 


const LABEL_NAME = 'Email Replies';

app.get('/', async (req, res) => {
    const private = await fs.readFile('private.json');

    const auth = await authenticate({
        keyfilePath: path.join(__dirname, 'private.json'),
        scopes: SCOPES
    });

    console.log("Authentication URL:", auth);

    const gmail = google.gmail({ version: 'v1', auth });

    const response = await gmail.users.labels.list({
        userId: 'me'
    });

    async function getprivate() {
        const filePath = path.join(process.cwd(), 'private.json');
        const content = await fs.readFile(filePath, { encoding: 'utf8' });
        return JSON.parse(content);
    }

    async function getMessages(auth) {
        const gmail = google.gmail({ version: 'v1', auth });
        const response = await gmail.users.messages.list({
            userId: 'me',
            q: '-in:chats -from:me -has:userlabels'
        });
        return response.data.messages || [];
    }

    async function sendMessages(auth, message) {
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From']
        });

        const subject = res.data.payload.headers.find((header) => header.name === 'Subject').value;
        const from = res.data.payload.headers.find((header) => header.name === 'From').value;

        const replyTo = from.match(/<(.*)>/)[1];
        const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`; 
        const replyBody = `Thanks for your email! \n\n Im not available right now will connect asap.`;
        const rawMessage = [
            `From: me`,
            `To: ${replyTo}`,
            `Subject: ${replySubject}`,
            `In-Reply-To: ${message.id}`,
            `References: ${message.id}`,
            '',
            replyBody
        ].join('\n');
        const encodedMessage = Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMessage
            }
        });
    }

    async function createLabel(auth) {
        const gmail = google.gmail({ version: 'v1', auth });
        try {
            const res = await gmail.users.labels.create({
                userId: 'me',
                requestBody: {
                    name: LABEL_NAME,
                    labelListVisibility: 'labelshow',
                    messageListVisibility: 'show'
                }
            });
            return res.data.id;
        } catch (error) {
            if (error.code === 409) {
                const res = await gmail.users.labels.list({
                    userId: 'me'
                });
                const label = res.data.labels.find((label) => label.name === LABEL_NAME);
                return label.id;
            } else {
                throw error;
            }
        }
    }

    async function addLabel(auth, message, labelId) {
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.messages.modify({
            userId: 'me',
            id: message.id,
            requestBody: {
                addLabelIds: [labelId],
                removeLabelIds: ['INBOX']
            }
        });
    }

    async function main() {
        const labelId = await createLabel(auth);
        console.log(`Create label with id ${labelId}`);

        setInterval(async () => {
            const messages = await getMessages(auth);
            console.log(`Found ${messages.length} unreplied messages`);

            for (const message of messages) {
                await sendMessages(auth, message);
                console.log(`Sent reply to message with id ${message.id}`);

                await addLabel(auth, message, labelId);
                console.log(`Added label to the message with id ${message.id}`);
            }
        }, Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000); 
    }

    main().catch(console.error);

    const labels = response.data.labels;
    res.send("Subscribe it");


})


app.listen(port, () => {
    console.log(`Listening on port ${port}`);
})