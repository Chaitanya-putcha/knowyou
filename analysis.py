import os
from datetime import timedelta
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

_analyzer = SentimentIntensityAnalyzer()

MOOD_EMOJI = {"positive": "😊", "neutral": "😐", "negative": "😔"}

def score_to_label(score):
    if score >= 0.05:
        return "positive"
    elif score <= -0.05:
        return "negative"
    return "neutral"

def analyze_mood(text):
    score = _analyzer.polarity_scores(text)["compound"]
    return score, score_to_label(score)


AI_ENABLED = os.environ.get("ENABLE_AI_MODELS", "true").lower() == "true"

# Transformer models
EMOTION_MODEL = "j-hartmann/emotion-english-distilroberta-base"
SUMMARY_MODEL = "sshleifer/distilbart-cnn-12-6"

EMOTION_EMOJI = {
    "joy": "😄",
    "sadness": "😢",
    "anger": "😠",
    "fear": "😨",
    "surprise": "😲",
    "disgust": "🤢",
    "neutral": "😐",
}

_emotion_classifier = None
_summary_tokenizer = None
_summary_model = None

def _get_emotion_classifier():
    global _emotion_classifier
    if _emotion_classifier is None:
        from transformers import pipeline
        _emotion_classifier = pipeline(
            "text-classification", model=EMOTION_MODEL, top_k=None
        )
    return _emotion_classifier

def _get_summary_model():
    global _summary_tokenizer, _summary_model
    if _summary_model is None:
        from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
        _summary_tokenizer = AutoTokenizer.from_pretrained(SUMMARY_MODEL)
        _summary_model = AutoModelForSeq2SeqLM.from_pretrained(SUMMARY_MODEL)
    return _summary_tokenizer, _summary_model
        
def detect_emotions(text):
    if not AI_ENABLED:
        return None, None, None
    results = _get_emotion_classifier()(text, truncation=True)

    if results and isinstance(results[0], list):
        results = results[0]

    all_scores = {r["label"]: round(r['score'], 4) for r in results}
    top_emotion = max(all_scores, key=all_scores.get)
    return top_emotion, all_scores[top_emotion], all_scores

def summarize(text):
    if not AI_ENABLED:
        return None
    if len(text.split()) < 40:
        return text

    tokenizer, model = _get_summary_model()
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=1024)
    output_ids = model.generate(
        **inputs,
        max_new_tokens=60,
        min_new_tokens=10,
        num_beams=4,
        no_repeat_ngram_size=3,
        early_stopping=True
    )
    return tokenizer.decode(output_ids[0], skip_special_tokens=True)


def build_insights(entries, gratitudes, goals, today):
    week_start = today-timedelta(days=6)
    recent = [e for e in entries if e.created_at.date() >= week_start]
    scored = [e for e in entries if e.mood_score is not None]

    week_scores = [e.mood_score for e in recent if e.mood_score is not None]
    week_avg = sum(week_scores) / len(week_scores) if week_scores else None
    week_label = score_to_label(week_avg) if week_avg is not None else None


    breakdown = []
    for label in ["positive", "neutral", "negative"]:
        count = len([e for e in scored if e.mood_label == label])
        percent = round(count/len(scored) * 100) if scored else None
        breakdown.append({
            "label":label,
            "emoji":MOOD_EMOJI[label],
            "count":count,
            "percent":percent,
        })

    emotional = [e for e in entries if e.emotion]
    emotion_breakdown = []
    for label, emoji in EMOTION_EMOJI.items():
        count = len([e for e in emotional if e.emotion==label])
        if count:
            emotion_breakdown.append({
                "label":label,
                "emoji":emoji,
                "count":count,
                "percent":round(count / len(emotional)*100),
            })
    emotion_breakdown.sort(key=lambda row: row["count"], reverse=True)

    best_entry = max(scored, key=lambda e: e.mood_score) if scored else None

    recommendations = []

    if entries:
        last_entry_date = max(e.created_at.date() for e in entries)
        days_since = (today - last_entry_date).days
        if days_since >= 3:
            recommendations.append(
                f"It's been {days_since} days since your last entry. "
                "A few lines today can help you reflect."
            )

    if week_avg is not None:
        if week_avg <= -0.05:
            recommendations.append(
                "Your entries this week lean negative. Try listing three things. "
                "You're grateful for, and consider talking to someone you trust."
            )
        elif week_avg >= 0.05:
            recommendations.append(
                "Your week has been mostly positive. Notice what's been working and keep it up!"
            )

    recent_emotions = [e.emotion for e in recent if e.emotion]
    if recent_emotions:
        dominant = max(set(recent_emotions), key=recent_emotions.count)
        if dominant in ("sadness", "fear", "anger"):
            recommendations.append(
                f"{dominant.capitalize()} has come up most in your entries this week"
                "Writing about what's behind it, or sharing it with someone you trust, can help."
            )
    
    if not any(g.created_at.date() == today for g in gratitudes):
        recommendations.append("You haven't added anything to your gratitude list today.")

    overdue = [g for g in goals if not g.is_done and g.target_date and g.target_date < today]
    if overdue:
        recommendations.append(
            f"You have {len(overdue)} overdue goal(s). Consider updating the dates "
            "or breaking them into smaller steps."
        )

    return {
        "total": len(entries),
        "week_count": len(recent),
        "week_avg": week_avg,
        "week_label":week_label,
        "breakdown": breakdown,
        "emotion_breakdown":emotion_breakdown,
        "best_entry": best_entry,
        "recommendations": recommendations,
    }
