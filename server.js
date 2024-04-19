const express = require('express');
const OpenAI = require('openai')
const path = require('path');
const app = express();
app.use(express.json());


const openai = new OpenAI({
  apiKey: "",
});

const systemSetup = "You are an expert programmer."

app.use(express.static(path.join(__dirname, '.')));

app.post('/openai/complete', async (req, res) => {
  try {
    const prompt = req.body.prompt;
    const chatCompletion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: systemSetup},
        { role: 'user', content: prompt }
      ],
      model: 'gpt-3.5-turbo',
    });
    res.json({ text: chatCompletion.choices[0].message.content });
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    res.status(500).send('Error processing your request');
  }
});

app.listen(3000, function () {
  console.log('App is listening on port 3000!');
});
