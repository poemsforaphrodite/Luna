const express = require('express');
const OpenAI = require('openai');
const path = require('path');
const multer = require('multer');
const app = express();
require('dotenv').config(); 
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const FormData = require('form-data');
const { exec } = require('child_process');

// testt
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

// Setup Multer for handling file uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'uploads/');  // Ensure this directory exists or is created during deployment
  },
  filename: function(req, file, cb) {
    cb(null, file.fieldname+path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// In-memory message history store
const messageHistory = {};

const getUserSessionId = (req) => req.headers['session-id'] || 'default';

// Route for handling video uploads
app.post('/upload-video', upload.single('video'), (req, res) => {
  if (req.file) {
    console.log('Uploaded video:', req.file.path);
    res.json({ message: 'Video uploaded successfully!', filePath: req.file.path });
  } else {
    res.status(400).send('No video file was uploaded.');
  }
});

let previousAge;
let previousGender;

app.post('/openai/complete', async (req, res) => {
  const sessionId = getUserSessionId(req);
  if (!messageHistory[sessionId]) {
    messageHistory[sessionId] = [];
  }
  
  let happyStatus;
  let attentionStatus;
  let ageStatus;
  let genderStatus;
  
  exec('python3 main.py', (error, stdout, stderr) => {
    if (error) {
      console.error(`Execution error: ${error}`);
      res.status(500).send('Error executing Python script');
      return;
    }
    if (stderr) {
      console.error(`Python script stderr: ${stderr}`);
    }
    if (stdout) {
      console.log(`Python script stdout: ${stdout}`);
      const lines = stdout.trim().split('\n');
      const happyValue = parseFloat(lines[0].split(' ')[1]);
      const confusionValue = parseFloat(lines[1].split(' ')[1]);
      const disgustValue = parseFloat(lines[2].split(' ')[1]);
      const contemptValue = parseFloat(lines[3].split(' ')[1]);
      const surpriseValue = parseFloat(lines[4].split(' ')[1]);
      const empathyValue = parseFloat(lines[5].split(' ')[1]);
      const eyesOnValue = parseFloat(lines[6].split(' ')[1]);
      const attentionValue = parseFloat(lines[7].split(' ')[1]);
      const presenceValue = parseFloat(lines[8].split(' ')[1]);
      const ageValue = parseInt(lines[9]);
      const genderValue = lines[lines.length - 1].split('.')[1];

      happyStatus = happyValue > 0.5 ? 'The user is happy.' : 'The user is not happy.';
      attentionStatus = attentionValue > 0.5 ? 'The user is attentive.' : 'The user is not attentive.';

      if (previousAge !== undefined && (ageValue < previousAge - 5 || ageValue > previousAge + 5)) {
        ageStatus = `The user's age has changed to ${ageValue}.`;
      } else {
        ageStatus = `The user's age is ${ageValue}.`;
      }

      if (previousGender !== undefined && previousGender !== genderValue) {
        genderStatus = `The user's gender has changed to ${genderValue}.`;
      } else {
        genderStatus = `The user's gender is ${genderValue}.`;
      }

      previousAge = ageValue;
      previousGender = genderValue;

      console.log('Happy status:', happyStatus);
      console.log('Attention status:', attentionStatus);
      console.log('Age status:', ageStatus);
      console.log('Gender status:', genderStatus);
    }
  });

  const { prompt, character } = req.body;

  // Set system prompt based on the character
  let initialSystemPrompt = 'if the user is not happy, ask them what is wrong. if they are not attentive say that "you are not paying attention, whats up" , address the age and gender of the user. Address if the age and gender of the user changes with something like "you are new", guess the age of the user in the first response';
  switch (character) {
    case 'Psychologist':
      initialSystemPrompt += "You are a psychologist. Ask the user how they are feeling. Act like a proper psychologist.";
      break;
    case 'Salesman':
      initialSystemPrompt += "You are a salesman. Please act like a salesman.";
      break;
    case 'Customer Service':
      initialSystemPrompt += "You are a customer service representative.";
      break;
    default:
      initialSystemPrompt += "You are an assistant."; // Default role if none specified
      break;
  }

  // Wait for the Python script to complete
  setTimeout(async () => {
    const fullPrompt = `${prompt} ${happyStatus}`;
    const systemPrompt = initialSystemPrompt +  `${initialSystemPrompt} ${attentionStatus} ${ageStatus} ${genderStatus}`;

    // Add the new message to the history
    messageHistory[sessionId].push({ role: 'user', content: fullPrompt });

    // Construct the conversation history
    const messages = [
      { role: 'system', content: systemPrompt },
      ...messageHistory[sessionId]
    ];

    try {
      const chatCompletion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: messages,
      });

      const responseMessage = chatCompletion.choices[0].message.content;

      // Add the response to the history
      messageHistory[sessionId].push({ role: 'assistant', content: responseMessage });

      res.json({ text: responseMessage });
    } catch (error) {
      console.error('Error calling OpenAI:', error);
      res.status(500).send('Error processing your request');
    }
  }, 0); // Adjust the delay as necessary to ensure the Python script has finished
});

app.post('/transcribe-audio', async (req, res) => {
  const { videoPath } = req.body; // Make sure this is the correct path to the video file
  const audioPath = `uploads/audio.mp3`;

  extractAudio(videoPath, audioPath, async (error) => {
    if (error) {
      console.error('Error extracting audio:', error);
      return res.status(500).send('Failed to extract audio');
    }

    try {
      const transcription = await transcribeAudioWithWhisper(audioPath);
      fs.unlink(audioPath, () => console.log('Audio file removed:', audioPath)); // Optionally remove the audio file
      res.json({ transcription: transcription });
    } catch (err) {
      console.error('Transcription error:', err);
      res.status(500).send('Failed to transcribe audio');
    }
  });
});

async function transcribeAudioWithWhisper(audioPath) {
  if (!fs.existsSync(audioPath)) {
    console.error('File does not exist:', audioPath);
    return null;
  }

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: "whisper-1",
  }).catch(err => {
    console.error('Whisper API error:', err);
    return null;
  });
  
  return transcription.text;
}

// Function to extract audio from video
function extractAudio(videoPath, audioPath, callback) {
  ffmpeg(videoPath)
    .setFfmpegPath(ffmpegStatic) // Sets the path to the ffmpeg binary
    .output(audioPath)           // Specifies the output filename
    .audioCodec('libmp3lame')    // Use the MP3 codec
    .noVideo()                   // Strip out the video part
    .on('end', function() {
      console.log('Audio extraction completed.');
      callback(null);          // No error, callback with null
    })
    .on('error', function(err) {
      console.error('Error during audio extraction:', err.message);
      callback(err);           // Callback with error
    })
    .run();                      // Run the ffmpeg command
}

app.listen(3000, function () {
  console.log('App is listening on port 3000!');
});
