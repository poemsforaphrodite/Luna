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


app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
});

const systemSetup = "You are an expert programmer.";

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

// Route for handling video uploads
app.post('/upload-video', upload.single('video'), (req, res) => {
  if (req.file) {
    console.log('Uploaded video:', req.file.path);
    res.json({ message: 'Video uploaded successfully!', filePath: req.file.path });
  } else {
    res.status(400).send('No video file was uploaded.');
  }
});

// Route for handling OpenAI completions
app.post('/openai/complete', async (req, res) => {
  try {
    const prompt = req.body.prompt;
    const chatCompletion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: systemSetup },
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
