import cv2
import realeyes.emotion_detection as em

def get_highest_probability_emotion(emotions):
    max_probability_emotion = max(emotions, key=lambda x: x.probability)
    return max_probability_emotion

img = cv2.imread("1.png")

tr = em.Tracker("model_emotiondetection_v7.realZ", 0)

emotions = tr.track(img, 0)

# Find and print the emotion with the highest probability
highest_probability_emotion = get_highest_probability_emotion(emotions.emotions)
print(f"Emotion: {highest_probability_emotion.emotion_id}, Probability: {highest_probability_emotion.probability}")
