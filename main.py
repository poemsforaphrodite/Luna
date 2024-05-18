import cv2
import os
import subprocess
import realeyes.emotion_detection as em
import realeyes.demographic_estimation as de

# Function to extract frames from video at specified frame rate
def extract_frames(video_path, output_folder, frame_rate=0.3):
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)
    
    command = [
        'ffmpeg',
        '-i', video_path,
        '-vf', f'fps={frame_rate}',
        f'{output_folder}/frame-%04d.png'
    ]
    subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# Function to filter and display specific emotions
def display_relevant_emotions(emotions):
    relevant_emotions = ['Happy', 'Attention']

    for emotion in emotions:
        emotion_id_str = str(emotion.emotion_id)
        emotion_name = emotion_id_str.split('.')[-1]  # Extract the part after 'EmotionID.'
        if emotion_name in relevant_emotions:
            print(f"{emotion_name}, {emotion.probability}")

# Function to process each frame for emotion detection and demographic estimation
def process_frames(frame_folder):
    frame_files = sorted([f for f in os.listdir(frame_folder) if f.endswith('.png')])
    tr = em.Tracker("model_emotiondetection_v7.realZ", 0)
    estimator = de.DemographicEstimator("model_demographicestimation_v1.0.0.realZ", 0)

    for frame_file in frame_files:
        frame_path = os.path.join(frame_folder, frame_file)
        img = cv2.imread(frame_path)

        emotions = tr.track(img, 0)
        display_relevant_emotions(emotions.emotions)

        faces = estimator.detect_faces(img)
        for face in faces:
            estimations = estimator.estimate(face)
            for estimation in estimations:
                if estimation.name == "age":
                    age = estimation.value
                elif estimation.name == "gender":
                    gender = estimation.value
            print(f"Age: {age}, Gender: {gender}")

# Main function
def main():
    video_path = 'uploads/video.mp4'  # Change this to the path of the uploaded video
    frame_folder = 'frames'

    # Step 1: Extract frames from the video
    extract_frames(video_path, frame_folder)

    # Step 2: Process each frame for emotion detection and demographic estimation
    process_frames(frame_folder)

    # Clean up extracted frames (optional)
    for frame_file in os.listdir(frame_folder):
        file_path = os.path.join(frame_folder, frame_file)
        if os.path.isfile(file_path):
            os.unlink(file_path)
    os.rmdir(frame_folder)

if __name__ == "__main__":
    main()
